/**
 * 청각 다변기 (Sound Variator) - TV 데이터 층
 *
 * startFeed({ onInitial(list), onArrive(ear, { animate }), onRemove(earId), onCount(total) })
 *
 * - 첫 서버 스냅샷 → onInitial(list) 한 번
 * - 그 후 새 문서만 → onArrive
 * - 숨김/limit 밖으로 밀려남 → onRemove
 * - 전체 마리 수 → onCount (시작+5분마다+도착마다)
 * - ?mock=1: Firebase 없이 가짜 데이터
 * - fromCache 2분 초과 + navigator.onLine → 리스너 재연결
 */

const FEED_LOCAL_KEY = 'svart.feed.cache';

let _feedCallbacks = null;
let _unsubscribe = null;
let _knownIds = new Set();     // 이미 처리한 ID
let _initialDone = false;      // 첫 스냅샷 처리 여부
let _fromCacheSince = null;    // fromCache=true가 시작된 시각
let _reconnectCount = 0;
let _countTimer = null;
let _lastCount = 0;
let _reconnectTimer = null;
let _catchingUp = false;       // 끊겼다 복구되는 중: 다음 서버 스냅샷은 밀린 것을 연출 없이 처리

/**
 * 피드 시작
 * @param {{ onInitial, onArrive, onRemove, onCount }} callbacks
 */
function startFeed(callbacks) {
  _feedCallbacks = callbacks;

  if (location.search.includes('mock=1')) {
    _startMock();
    return;
  }

  _startReal();
}

function stopFeed() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  if (_countTimer) { clearInterval(_countTimer); _countTimer = null; }
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  _feedCallbacks = null;
}

window.svartFeed = { startFeed, stopFeed };

// ============ 실제 피드 ============

async function _startReal() {
  try {
    const { db } = await window._initFirebase();
    _attachListener(db);
    _startCountPoller(db);
  } catch (e) {
    console.warn('[feed] Firebase 초기화 실패:', e.message);
  }
}

async function _attachListener(db) {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  if (_initialDone) _catchingUp = true;

  const SDK = window.FIREBASE_SDK_VERSION || '11.0.2';
  const { collection, query, where, orderBy, limit, onSnapshot } =
    await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`);

  const cfg = window.CloudConfig;
  const q = query(
    collection(db, 'ears'),
    where('hidden', '==', false),
    orderBy('createdAt', 'desc'),
    limit(cfg.FEED_LIMIT || 500)
  );

  _unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, snap => {
    _handleSnapshot(snap);
  }, err => {
    console.warn('[feed] 리스너 오류:', err.message);
  });

  // 캐시 감시: fromCache가 오래 이어지면 재연결
  _startCacheWatcher(db);
}

function _handleSnapshot(snap) {
  const cfg = window.CloudConfig;
  const fromCache = snap.metadata.fromCache;
  const now = Date.now();

  if (!fromCache) {
    _fromCacheSince = null;
  } else if (!_fromCacheSince) {
    _fromCacheSince = now;
  }

  if (!_initialDone && !fromCache) {
    // 첫 서버 스냅샷
    const list = snap.docs
      .filter(d => d.data().createdAt != null)
      .map(d => _toEar(d));
    list.forEach(e => _knownIds.add(e.earId));
    _initialDone = true;

    // localStorage 캐시 저장
    _saveFeedCache(list);

    if (_feedCallbacks?.onInitial) _feedCallbacks.onInitial(list);
    return;
  }

  if (!_initialDone) return; // 아직 로컬 캐시 단계

  if (fromCache) _catchingUp = true;

  // 이후 증분 처리
  for (const change of snap.docChanges()) {
    const data = change.doc.data();
    if (data.createdAt == null) continue; // 로컬 대기 문서 무시

    if (change.type === 'added') {
      if (_knownIds.has(data.earId)) continue; // 이미 아는 ID
      _knownIds.add(data.earId);

      const ear = _toEar(change.doc);
      const age = data.createdAt?.toMillis
        ? now - data.createdAt.toMillis()
        : Infinity;
      const animate = !_catchingUp && age < (cfg.FEED_OLD_THRESHOLD_MS || 60000);

      if (_feedCallbacks?.onArrive) _feedCallbacks.onArrive(ear, { animate });

      // 도착할 때마다 카운트 +1
      _lastCount += 1;
      if (_feedCallbacks?.onCount) _feedCallbacks.onCount(_lastCount);

      _updateFeedCache(ear);
    } else if (change.type === 'removed') {
      _emitRemove(data.earId);
    }
  }

  if (_catchingUp && !fromCache) {
    // 새로 건 리스너는 끊긴 동안 사라진 문서를 removed로 알려 주지 않을 수 있음
    const live = new Set(snap.docs.map(d => d.data().earId));
    [..._knownIds].filter(id => !live.has(id)).forEach(_emitRemove);
    _catchingUp = false;
  }
}

function _emitRemove(earId) {
  _knownIds.delete(earId);
  if (_feedCallbacks?.onRemove) _feedCallbacks.onRemove(earId);
  _removeFeedCache(earId);
}

function _toEar(docSnap) {
  const d = docSnap.data();
  return {
    earId: d.earId,
    code: d.code,
    codeVersion: d.codeVersion,
    profile: d.profile,
    name: d.name,
    lang: d.lang,
    seat: d.seat,
    createdAt: d.createdAt?.toMillis ? d.createdAt.toMillis() : null,
    hidden: d.hidden,
    app: d.app
  };
}

function _startCacheWatcher(db) {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);

  const cfg = window.CloudConfig;
  const checkMs = cfg.FEED_CACHE_TIMEOUT_MS || 2 * 60 * 1000;

  function check() {
    const now = Date.now();
    if (_fromCacheSince && (now - _fromCacheSince > checkMs) && navigator.onLine) {
      _reconnectCount++;
      console.log('[feed] fromCache 초과 → 리스너 재연결 #' + _reconnectCount);
      _fromCacheSince = null;
      _attachListener(db);
      return;
    }
    _reconnectTimer = setTimeout(check, 30000);
  }

  _reconnectTimer = setTimeout(check, 30000);
}

async function _startCountPoller(db) {
  const cfg = window.CloudConfig;
  const interval = cfg.FEED_COUNT_INTERVAL_MS || 5 * 60 * 1000;

  async function countNow() {
    try {
      const SDK2 = window.FIREBASE_SDK_VERSION || '11.0.2';
    const { collection, query, where, getCountFromServer } =
        await import(`https://www.gstatic.com/firebasejs/${SDK2}/firebase-firestore.js`);
      const q = query(collection(db, 'ears'), where('hidden', '==', false));
      const snap = await getCountFromServer(q);
      _lastCount = snap.data().count;
      if (_feedCallbacks?.onCount) _feedCallbacks.onCount(_lastCount);
    } catch (e) {
      // 실패하면 마지막 값 유지
      console.warn('[feed] 카운트 실패:', e.message);
    }
  }

  await countNow();
  _countTimer = setInterval(countNow, interval);
}

// ============ localStorage 캐시 ============

function _saveFeedCache(list) {
  try {
    localStorage.setItem(FEED_LOCAL_KEY, JSON.stringify(list));
  } catch {}
}

function _updateFeedCache(ear) {
  try {
    const list = JSON.parse(localStorage.getItem(FEED_LOCAL_KEY) || '[]');
    list.unshift(ear);
    localStorage.setItem(FEED_LOCAL_KEY, JSON.stringify(list.slice(0, 500)));
  } catch {}
}

function _removeFeedCache(earId) {
  try {
    const list = JSON.parse(localStorage.getItem(FEED_LOCAL_KEY) || '[]');
    localStorage.setItem(FEED_LOCAL_KEY, JSON.stringify(list.filter(e => e.earId !== earId)));
  } catch {}
}

/** 오프라인 시 초기 목록 — onInitial 대신 쓸 수 있음 */
function getFeedCache() {
  try {
    return JSON.parse(localStorage.getItem(FEED_LOCAL_KEY) || '[]');
  } catch { return []; }
}
window.svartFeed.getFeedCache = getFeedCache;

// ============ 가짜 데이터 모드 (?mock=1) ============

const MOCK_NAMES = ['온이', '도해', '민서', '지호', '유나', '태양', '가을', '새벽'];
const MOCK_REGISTERS = ['LOW', 'MID', 'HIGH', null];
const MOCK_CENTER = ['L', 'C', 'R'];
const MOCK_EAR = ['LEFT', 'RIGHT'];
const MOCK_PITCH = ['F', 'B', 'H'];

function _makeMockEar(i) {
  const r = () => Math.random();
  const rr = (lo, hi) => +(lo + r() * (hi - lo)).toFixed(1);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const maybNull = v => r() < 0.2 ? null : v;

  const earId = Array.from({ length: 10 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(r() * 32)]).join('');
  const reg = pick(MOCK_REGISTERS);
  const hasP2 = r() > 0.3;
  const profile = {
    volDb: rr(-35, -10),
    lowDb: rr(-8, 8),
    highDb: rr(-8, 8),
    register: reg,
    maxFreqHz: maybNull(rr(8000, 16000)),
    sensitivity: maybNull(rr(20, 90)),
    twistAmount: maybNull(rr(0, 1)),
    centerDeg: maybNull(rr(-60, 60)),
    centerImage: maybNull(pick(MOCK_CENTER)),
    dominantEar: hasP2 ? pick(MOCK_EAR) : null,
    earStrength: maybNull(rr(20, 80)),
    pitchMode: hasP2 ? pick(MOCK_PITCH) : null,
    pitchIndex: maybNull(rr(-80, 80))
  };

  const regLetter = { LOW: 'O', MID: 'A', HIGH: 'I', null: '·' }[reg] || '·';
  const code = `${regLetter}ES/5 · CLF 12.0`;

  return {
    earId,
    code,
    codeVersion: 1,
    profile,
    name: r() > 0.5 ? pick(MOCK_NAMES) : null,
    lang: r() > 0.5 ? 'ko' : 'en',
    seat: r() > 0.5 ? Math.ceil(r() * 6) : null,
    createdAt: Date.now() - Math.floor(r() * 3600000),
    hidden: false,
    app: '1.0.0',
    _mock: true
  };
}

function _startMock() {
  const cfg = window.CloudConfig;
  const arriveMs = (() => {
    const m = /arrive=(\d+)/.exec(location.search);
    return m ? parseInt(m[1], 10) * 1000 : 20000;
  })();

  // 초기 목록 20개
  const initial = Array.from({ length: 20 }, (_, i) => _makeMockEar(i));
  initial.forEach(e => _knownIds.add(e.earId));

  if (_feedCallbacks?.onInitial) _feedCallbacks.onInitial(initial);
  if (_feedCallbacks?.onCount) _feedCallbacks.onCount(initial.length + Math.floor(Math.random() * 100));

  // 가짜 도착
  let arriveIndex = initial.length;
  setInterval(() => {
    const ear = _makeMockEar(arriveIndex++);
    ear.createdAt = Date.now();
    _knownIds.add(ear.earId);
    if (_feedCallbacks?.onArrive) _feedCallbacks.onArrive(ear, { animate: true });
    _lastCount += 1;
    if (_feedCallbacks?.onCount) _feedCallbacks.onCount(_lastCount);
  }, arriveMs);

  console.log('[feed] 가짜 데이터 모드. 도착 간격:', arriveMs, 'ms');
}
