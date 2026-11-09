/**
 * 청각 다변기 (Sound Variator) - 아이패드 보내기 모듈
 *
 * sendEar(result) → earId  (즉시 반환, 업로드는 뒤에서)
 *
 * - localStorage 대기열(svart.outbox)이 "아직 안 보낸 것"의 유일한 기준
 * - Firebase는 업로드할 때 동적 import()
 * - 실패: 지수 백오프 재시도 (5초 시작, 최대 60초)
 * - ?dev=1, localhost(!emulator), CLOUD_ENABLED=false 에서는 보내지 않음
 * - ?debug=1 에서 왼쪽 아래 상태 표시
 */

const OUTBOX_KEY = 'svart.outbox';
const REJECTED_KEY = 'svart.outbox.rejected';
const UPLOAD_TIMEOUT_MS = 15000;
const BACKOFF_MIN_MS = 5000;
const BACKOFF_MAX_MS = 60000;

// 문서 ID용 base32 알파벳 (헷갈리는 0O1I 제외)
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_LENGTH = 10;

// 현재 업로드 중인 earId 집합 (동시에 하나씩)
const _inFlight = new Set();
let _retryTimer = null;
let _lastSuccessAt = null;

// ============ 공개 API ============

/**
 * 결과를 대기열에 넣고 earId를 돌려줌. 업로드는 뒤에서 한다.
 * @param {object} result  window.EAR_RESULT 형태
 * @returns {string} earId
 */
function sendEar(result) {
  const earId = _makeId();

  if (!_shouldSend()) {
    console.log('[cloud] 전송 비활성화 (dev/local/disabled). earId:', earId);
    return earId;
  }

  const doc = _buildDoc(result, earId);
  _enqueue(earId, doc);
  _scheduleFlush(0);
  _updateDebug();
  return earId;
}

/** 거부된 항목을 콘솔에 출력 */
function dumpRejected() {
  try {
    const r = JSON.parse(localStorage.getItem(REJECTED_KEY) || '[]');
    console.log('[cloud] rejected 항목:', r);
    return r;
  } catch (e) {
    return [];
  }
}

window.svartCloud = { sendEar, dumpRejected };

// ============ 내부 ============

function _shouldSend() {
  const cfg = window.CloudConfig;
  if (!cfg || !cfg.CLOUD_ENABLED) return false;
  if (!cfg.FIREBASE_CONFIG || !cfg.FIREBASE_CONFIG.projectId) return false;
  const isDev = location.search.includes('dev=1');
  const isLocal = window._isFirebaseLocalDev && window._isFirebaseLocalDev();
  if (isDev) return false;
  if (isLocal) return false; // emulator=1이면 _isFirebaseLocalDev()는 false
  return true;
}

function _makeId() {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

function _buildDoc(result, earId) {
  const cfg = window.CloudConfig;
  const eq = result.userEQProfile || {};
  const psy = result.psychoProfile || {};

  const name = cfg.STORE_NAMES && result.name
    ? _sanitizeName(String(result.name))
    : null;

  const profile = {
    volDb: _clamp(_volDb(eq.masterVolume), -60, 0),
    lowDb: _clamp1(_clamp(eq.lowShelf?.gain ?? 0, -10, 10)),
    highDb: _clamp1(_clamp(eq.highShelf?.gain ?? 0, -10, 10)),
    register: ['LOW', 'MID', 'HIGH'].includes(eq.registerPeak?.register)
      ? eq.registerPeak.register
      : null,
    maxFreqHz: _nullableNum(psy.maxFreqHz, 8000, 16000),
    sensitivity: _nullableNum(psy.sensitivity, 0, 100),
    twistAmount: _nullableNum(psy.twist, 0, 1),
    centerDeg: psy.centerDeg != null ? _clamp1(_clamp(psy.centerDeg, -180, 180)) : null,
    centerImage: ['L', 'C', 'R'].includes(psy.centerImage) ? psy.centerImage : null,
    dominantEar: ['LEFT', 'RIGHT'].includes(psy.dominantEar) ? psy.dominantEar : null,
    earStrength: _nullableNum(psy.earStrength, 0, 100),
    pitchMode: ['F', 'B', 'H'].includes(psy.pitchMode) ? psy.pitchMode : null,
    pitchIndex: _nullableNum(psy.pitchIndex, -100, 100)
  };

  const seat = _getSeat();

  return {
    v: 1,
    earId,
    code: String(result.code || '').slice(0, 40),
    codeVersion: 1,
    profile,
    name,
    lang: result.lang || window.GlobalState?.lang || 'ko',
    seat,
    clientAt: result.savedAt || Date.now(),
    hidden: false,
    app: (cfg.APP_VERSION || '').slice(0, 20)
    // createdAt은 서버 타임스탬프로 보내기 직전에 붙임
  };
}

function _volDb(masterVolume) {
  if (masterVolume == null || isNaN(masterVolume) || masterVolume <= 0) return -60;
  const db = 20 * Math.log10(masterVolume);
  if (!isFinite(db)) return -60;
  return db;
}

function _clamp(v, lo, hi) {
  if (v == null || isNaN(v) || !isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function _clamp1(v) {
  return Math.round(v * 10) / 10;
}

function _nullableNum(v, lo, hi) {
  if (v == null || isNaN(v) || !isFinite(v)) return null;
  return _clamp1(_clamp(v, lo, hi));
}

function _getSeat() {
  const m = /[?&]seat=(\d+)/.exec(location.search);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 6) return n;
  }
  try {
    const s = parseInt(localStorage.getItem('svart.seat') || '', 10);
    if (s >= 1 && s <= 6) return s;
  } catch {}
  return null;
}

function _sanitizeName(raw) {
  const cfg = window.CloudConfig;
  let s = raw.trim().slice(0, cfg.NAME_MAX_LEN || 12);
  (cfg.BANNED_WORDS || []).forEach(w => {
    if (!w) return;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    s = s.replace(re, m => '*'.repeat(m.length));
  });
  return s || null;
}

// ============ 대기열 ============

function _enqueue(earId, doc) {
  try {
    const q = _loadQueue();
    if (!q.find(e => e.earId === earId)) {
      q.push({ earId, doc, attempts: 0, nextAt: 0 });
      _saveQueue(q);
    }
  } catch (e) {
    console.warn('[cloud] 대기열 저장 실패:', e.message);
  }
}

function _loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  } catch { return []; }
}

function _saveQueue(q) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(q));
  } catch (e) {
    console.warn('[cloud] 대기열 저장 실패:', e.message);
  }
}

function _removeFromQueue(earId) {
  try {
    const q = _loadQueue().filter(e => e.earId !== earId);
    _saveQueue(q);
  } catch {}
}

function _moveToRejected(entry) {
  try {
    const r = JSON.parse(localStorage.getItem(REJECTED_KEY) || '[]');
    r.push({ ...entry, rejectedAt: Date.now() });
    localStorage.setItem(REJECTED_KEY, JSON.stringify(r));
    _removeFromQueue(entry.earId);
    console.warn('[cloud] 규칙 거부 → rejected 보관:', entry.earId, entry.doc);
  } catch (e) {
    console.warn('[cloud] rejected 저장 실패:', e.message);
  }
}

// ============ 플러시 ============

function _scheduleFlush(delayMs) {
  if (_retryTimer) clearTimeout(_retryTimer);
  _retryTimer = setTimeout(_flush, delayMs);
}

async function _flush() {
  _retryTimer = null;
  if (!_shouldSend()) return;

  const q = _loadQueue();
  if (q.length === 0) return;

  const now = Date.now();
  for (const entry of q) {
    if (_inFlight.has(entry.earId)) continue;
    if (entry.nextAt > now) {
      // 아직 기다려야 하는 항목 — 가장 가까운 nextAt으로 재예약
      const wait = q.reduce((min, e) =>
        !_inFlight.has(e.earId) ? Math.min(min, Math.max(0, e.nextAt - now)) : min, Infinity);
      if (isFinite(wait)) _scheduleFlush(wait + 100);
      continue;
    }
    _uploadOne(entry);
  }

  _updateDebug();
}

async function _uploadOne(entry) {
  _inFlight.add(entry.earId);
  try {
    const { db } = await _withTimeout(window._initFirebase(), UPLOAD_TIMEOUT_MS);
    const { doc, setDoc, serverTimestamp } =
      await import(`https://www.gstatic.com/firebasejs/${window.FIREBASE_SDK_VERSION || '11.0.2'}/firebase-firestore.js`);

    const docData = { ...entry.doc, createdAt: serverTimestamp() };

    await _withTimeout(
      setDoc(doc(db, 'ears', entry.earId), docData),
      UPLOAD_TIMEOUT_MS
    );

    _removeFromQueue(entry.earId);
    _lastSuccessAt = Date.now();
    console.log('[cloud] 전송 완료:', entry.earId);
  } catch (e) {
    if (e.code === 'permission-denied') {
      await _handlePermissionDenied(entry);
    } else {
      _scheduleRetry(entry);
    }
    console.warn('[cloud] 전송 실패:', entry.earId, e.code || e.message);
  } finally {
    _inFlight.delete(entry.earId);
    _updateDebug();
  }
}

async function _handlePermissionDenied(entry) {
  // getDoc으로 이미 존재하는지 확인
  try {
    const { db } = await _withTimeout(window._initFirebase(), UPLOAD_TIMEOUT_MS);
    const { doc, getDoc } =
      await import(`https://www.gstatic.com/firebasejs/${window.FIREBASE_SDK_VERSION || '11.0.2'}/firebase-firestore.js`);

    const snap = await _withTimeout(getDoc(doc(db, 'ears', entry.earId)), UPLOAD_TIMEOUT_MS);
    if (snap.exists()) {
      // 이미 보냄 — 대기열에서 지움
      _removeFromQueue(entry.earId);
      _lastSuccessAt = Date.now();
      console.log('[cloud] 이미 존재 → 대기열에서 제거:', entry.earId);
    } else {
      // 규칙 거부 — rejected로 이동
      _moveToRejected(entry);
    }
  } catch (e2) {
    // getDoc도 실패 (App Check 오류, 네트워크 등) — 대기열에 두고 재시도
    console.warn('[cloud] permission-denied 확인 실패 → 대기열 유지:', entry.earId, e2.message);
    _scheduleRetry(entry);
  }
}

function _scheduleRetry(entry) {
  const q = _loadQueue();
  const idx = q.findIndex(e => e.earId === entry.earId);
  if (idx < 0) return;
  q[idx].attempts = (q[idx].attempts || 0) + 1;
  const delay = Math.min(BACKOFF_MIN_MS * Math.pow(2, q[idx].attempts - 1), BACKOFF_MAX_MS);
  q[idx].nextAt = Date.now() + delay;
  _saveQueue(q);
  _scheduleFlush(delay + 100);
}

function _withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e); });
  });
}

// ============ 이벤트 ============

window.addEventListener('online', () => {
  console.log('[cloud] 온라인 복귀 → 플러시');
  _scheduleFlush(1000);
});

// ============ 디버그 UI ============

function _updateDebug() {
  if (!location.search.includes('debug=1')) return;
  let el = document.getElementById('cloud-debug');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cloud-debug';
    Object.assign(el.style, {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '9999',
      fontSize: '10px', color: '#0f0', background: 'rgba(0,0,0,0.7)',
      padding: '4px 6px', fontFamily: 'monospace', pointerEvents: 'none'
    });
    document.body.appendChild(el);
  }
  try {
    const q = _loadQueue();
    const r = JSON.parse(localStorage.getItem(REJECTED_KEY) || '[]');
    const last = _lastSuccessAt
      ? new Date(_lastSuccessAt).toLocaleTimeString()
      : '없음';
    el.textContent = `대기 ${q.length}건 / 거부 ${r.length}건 / 마지막 성공 ${last}`;
  } catch {}
}

// 앱 시작 시 미전송 대기열 플러시
_scheduleFlush(2000);
