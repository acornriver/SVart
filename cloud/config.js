/**
 * 청각 다변기 (Sound Variator) - 클라우드 설정
 *
 * 미확정 항목: 원우리 작가 확인 필요
 * 확정된 항목: Firebase(Firestore), 리전 asia-northeast3, GitHub Pages 호스팅
 */

window.CloudConfig = {
  // === 확정된 것 ===
  FIREBASE_REGION: 'asia-northeast3',

  // Firebase 웹 앱 설정 (Firebase 콘솔 → 프로젝트 설정 → 앱 → 웹 앱 → SDK 설정에서 복사)
  // Existing exhibition project. SVart/cloud is the canonical source.
  FIREBASE_CONFIG: {
    apiKey: 'AIzaSyBAyuRkGF7eGJBcTRk4KbB10w24OEROEQY',
    authDomain: 'svart-tower.firebaseapp.com',
    projectId: 'svart-tower',
    storageBucket: 'svart-tower.firebasestorage.app',
    messagingSenderId: '457275593765',
    appId: '1:457275593765:web:e8e470884bc58ff20edbcc'
  },

  // 클라우드 연결 여부. false면 send.js가 아무것도 보내지 않음
  CLOUD_ENABLED: true,

  // 앱 버전. 스키마가 바뀌면 올림 (Firestore에 v:1이 있으므로 여기는 앱 코드 버전)
  APP_VERSION: '2.0.0',

  // reCAPTCHA Enterprise 사이트 키 (App Check). 비어 있으면 App Check 비활성화
  APP_CHECK_SITE_KEY: '',

  // === 미확정 ===

  // 이름 저장 여부 (false면 name: null로 보냄)
  // 미확정: 원우리 작가 확인 필요
  STORE_NAMES: false,

  // TV에서 이름 보여 주기 여부
  // 미확정: 원우리 작가 확인 필요
  SHOW_NAMES: false,

  // 이름 최대 길이
  NAME_MAX_LEN: 12,

  // 금칙어 목록 (기본 비어 있음)
  // 미확정: 원우리 작가 확인 필요
  BANNED_WORDS: [],

  // 관객용 모바일 페이지 (SVartTower의 /mobile/). 보내기 뒤 QR이 여기로 연결됨 (tour.js의 towerMobileUrl)
  MOBILE_URL: 'https://acornriver.github.io/SVartTower/mobile/',

  // earCode 글자 이름 (미확정: 원우리 작가 확인 필요)
  EAR_CODE_LETTER_NAMES: null,

  // TV 피드 최대 개수
  FEED_LIMIT: 500,

  // 피드 재연결 체크 간격 (fromCache가 이 시간 넘으면 리스너 재연결)
  FEED_CACHE_TIMEOUT_MS: 2 * 60 * 1000,

  // 전체 마리 수 갱신 간격
  FEED_COUNT_INTERVAL_MS: 5 * 60 * 1000,

  // 오래된 도착 기준 (createdAt이 이보다 오래되면 animate: false)
  FEED_OLD_THRESHOLD_MS: 60 * 1000
};

// ?emulator=1은 로컬 에뮬레이터에만 붙으므로 실제 프로젝트 설정 대신 테스트 프로젝트를 씀
if (new URLSearchParams(location.search).get('emulator') === '1') {
  window.CloudConfig.FIREBASE_CONFIG = {
    apiKey: 'test', authDomain: 'test', projectId: 'svart-test',
    storageBucket: '', messagingSenderId: '', appId: 'test'
  };
}
