/**
 * 청각 다변기 (Sound Variator) - Firebase 초기화 공유 모듈
 *
 * send.js와 feed.js가 함께 쓰는 Firebase app / Firestore / App Check 초기화.
 * CDN 실패는 재시도 대상이므로 여기서 예외를 밖으로 내보내지 않음.
 *
 * Firebase JS SDK: 11.0.2 (2024-11 기준 최신 안정판)
 * CDN: https://www.gstatic.com/firebasejs/11.0.2/
 */

const FIREBASE_SDK_VERSION = '11.0.2';
window.FIREBASE_SDK_VERSION = FIREBASE_SDK_VERSION; // send.js, feed.js 공유
const FIREBASE_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

// 싱글턴 Promise: 동시에 여러 번 initFirebase()가 불려도 한 번만 로드
let _firebasePromise = null;

/**
 * Firebase app, Firestore, App Check를 초기화하고 { app, db } 를 반환.
 * 이미 초기화됐으면 같은 Promise를 돌려줌.
 */
async function initFirebase() {
  if (_firebasePromise) return _firebasePromise;

  _firebasePromise = (async () => {
    const cfg = window.CloudConfig;
    if (!cfg || !cfg.FIREBASE_CONFIG || !cfg.FIREBASE_CONFIG.projectId) {
      throw new Error('[cloud] FIREBASE_CONFIG.projectId가 비어 있음');
    }

    // Firebase app
    const { initializeApp, getApps, getApp } = await import(`${FIREBASE_BASE}/firebase-app.js`);
    const app = getApps().length === 0
      ? initializeApp(cfg.FIREBASE_CONFIG)
      : getApp();

    // App Check (reCAPTCHA Enterprise)
    if (cfg.APP_CHECK_SITE_KEY && !_isEmulator() && !_isLocalDev()) {
      try {
        const { initializeAppCheck, ReCaptchaEnterpriseProvider } =
          await import(`${FIREBASE_BASE}/firebase-app-check.js`);
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(cfg.APP_CHECK_SITE_KEY),
          isTokenAutoRefreshEnabled: true
        });
        console.log('[cloud] App Check 초기화 완료');
      } catch (e) {
        // App Check 실패는 검사 흐름을 막지 않음
        console.warn('[cloud] App Check 초기화 실패 (검사는 계속):', e.message);
      }
    }

    // Firestore (메모리 캐시 — 아이패드에서는 영구 캐시 사용 안 함)
    const { getFirestore, initializeFirestore, memoryLocalCache } =
      await import(`${FIREBASE_BASE}/firebase-firestore.js`);

    let db;
    try {
      // 이미 초기화됐으면 getFirestore
      db = getFirestore(app);
    } catch {
      db = initializeFirestore(app, { localCache: memoryLocalCache() });
    }

    if (_isEmulator()) {
      const { connectFirestoreEmulator } = await import(`${FIREBASE_BASE}/firebase-firestore.js`);
      connectFirestoreEmulator(db, 'localhost', 8080);
      console.log('[cloud] Firestore 에뮬레이터 연결');
    }

    return { app, db };
  })();

  // 실패하면 Promise 초기화해 다음 번에 다시 시도
  _firebasePromise.catch(() => { _firebasePromise = null; });

  return _firebasePromise;
}

function _isEmulator() {
  return location.search.includes('emulator=1');
}

function _isLocalDev() {
  const h = location.hostname;
  return (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') && !_isEmulator();
}

window._initFirebase = initFirebase;
window._isFirebaseEmulator = _isEmulator;
window._isFirebaseLocalDev = _isLocalDev;
