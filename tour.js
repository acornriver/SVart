/**
 * 청각 다변기 (Sound Variator) - 결과: 북서울 산책 + 청감타워로 보내기
 *
 * "이 달팽이가 북서울미술관 주변에 가 본다면?"
 * 결과 화면에서 개인 EQ를 입힌 북서울 주변 녹음을 장소마다 TOUR_SECONDS씩 차례로 들려주고,
 * 그 장소 영상을 캔버스 뒤에 고대비 흑백으로 깝니다. 버튼으로 곡을 고르면 그 곡에 고정합니다 (사용자 선택 11/06).
 * 달팽이를 오른쪽으로 밀면 결과를 청감타워로 보내고(cloud/send.js), 달팽이가 기어 나간 뒤 첫 화면으로 돌아갑니다.
 *
 * 영상과 소리는 전시 내내 멈추면 안 됩니다: 영상은 처음에 blob으로 받아 두고, 1초마다 멈췄는지 확인해 다시 재생합니다.
 */

// 작가 곡 3개가 오기 전까지 북서울 사운드스케이프 3개를 선택해 들을 수 있게 구성 (사용자 지시 11/06)
// spectrum은 음량 보정용 대략적 기울기. 장소 이름은 copy.js의 place.<key>
const TOUR_PLACES = [
  { key: 'water',      audio: './media/audio/water.m4a',      video: './media/video/water.mp4',      spectrum: 'pink' },  // 당현천 물소리
  { key: 'train-go',   audio: './media/audio/train-go.m4a',   video: './media/video/train-go.mp4',   spectrum: 'brown' }, // 중계역 지하철
  { key: 'car-move',   audio: './media/audio/car-move.m4a',   video: './media/video/car-move.mp4',   spectrum: 'pink' }   // 북서울미술관 앞 지나가는 차
];
const TOUR_SECONDS = 15;
const TOUR_FADE = 1.2;          // 장소 사이 소리 크로스페이드 (초)
const SEND_WALK_MS = 4200;      // 보내기: 화면 밖으로 기어 나가는 시간
const SEND_HOLD_MS = 5000;      // 나간 뒤 문구를 보여 주는 시간, 그다음 첫 화면

const BACKDROP_FADE = 0.8;      // 영상 크로스페이드 (초)
const BACKDROP_STALL_SECONDS = 2;

let backdropVideos = {};   // { 장소 key: HTMLVideoElement }
let backdropBlobs = {};    // { 장소 key: blob URL } 받아 뒀지만 아직 재생 중이라 못 바꾼 것
let backdropKey = null;
let backdropWatch = { t: 0, lastTime: -1, stalled: 0 };
let sendTimers = [];

function tourState() {
  return window.GlobalState.tour;
}

function tourPlace() {
  return TOUR_PLACES[tourState().index];
}

/**
 * 결과 단계 시작 (part1_audio.js의 goToStep()에서 호출)
 */
function startTour() {
  const tour = tourState();
  tour.index = 0;
  tour.sendAt = null;
  tour.pinned = false;
  tour.listenAt = millis();
  enterPlace();
}

function enterPlace() {
  const tour = tourState();
  tour.placeAt = millis();
  setActiveSource(tourPlace().key, TOUR_FADE);
  applyEQ(); // 음량 보정이 이 장소 녹음의 스펙트럼 기준이 되도록
  showBackdrop(tourPlace().key);
}

function selectTourPlace(index) {
  const tour = tourState();
  if (tour.sendAt !== null) return;
  const next = ((index % TOUR_PLACES.length) + TOUR_PLACES.length) % TOUR_PLACES.length;
  tour.index = next;
  tour.pinned = true;
  tour.listenAt = millis();
  enterPlace();
}

/**
 * 매 프레임 (part1_audio.js의 updateFlow()에서 호출)
 */
function updateTour() {
  const tour = tourState();
  if (tour.sendAt !== null || tour.pinned) return;
  if (millis() - tour.placeAt >= TOUR_SECONDS * 1000) {
    tour.index = (tour.index + 1) % TOUR_PLACES.length;
    enterPlace();
  }
}

/**
 * 청감타워로 보내기: 기어 나감 → 소리·영상을 줄임 → 문구 → 첫 화면
 */
function sendToTower() {
  const tour = tourState();
  if (tour.sendAt !== null) return;
  tour.sendAt = millis();
  hushVoice();
  if (window.svartCloud && window.EAR_RESULT) {
    try { tour.earId = window.svartCloud.sendEar(window.EAR_RESULT); }
    catch (error) { console.warn('[cloud] unable to persist outbox:', error.message); }
  } // 뒤에서 전송. 화면 흐름을 막지 않음
  sendTimers.push(setTimeout(() => {
    setActiveSource(null, 1.5);
    showBackdrop(null);
  }, SEND_WALK_MS * 0.7));
  sendTimers.push(setTimeout(() => {
    if (window.GlobalState.currentStage === 'MUSIC' && tourState().sendAt !== null) restartFlow();
  }, SEND_WALK_MS + SEND_HOLD_MS));
}

// 보내기 진행 0(시작) ~ 1(화면 밖). 보내기 전이면 -1
function sendProgress() {
  const at = tourState().sendAt;
  return at === null ? -1 : Math.min(1, (millis() - at) / SEND_WALK_MS);
}

function stopTour() {
  sendTimers.forEach(clearTimeout);
  sendTimers = [];
  tourState().sendAt = null;
  showBackdrop(null);
}

/* ---------- 배경 영상 ---------- */

/**
 * 장소별 배경 <video>를 만들어 캔버스 뒤에 깐다 (main.js의 setup()에서 호출).
 * 소리는 Web Audio 쪽 녹음이 내므로 영상은 항상 음소거. iOS는 muted + playsinline이어야 자동재생된다.
 */
function setupBackdrops() {
  TOUR_PLACES.forEach(({ key, video }) => {
    const v = document.createElement('video');
    v.className = 'backdrop';
    v.src = video;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'metadata';
    v.style.transition = `opacity ${BACKDROP_FADE}s ease`;
    // loop 속성이 있어도 끝에서 멈추는 브라우저가 있어 직접 처음으로 되감음
    v.addEventListener('ended', () => {
      v.currentTime = 0;
      if (backdropKey === key) playBackdrop(v);
    });
    document.body.prepend(v);
    backdropVideos[key] = v;
  });
  cacheBackdrops();
}

/**
 * 영상을 처음에 전부 메모리(blob)로 받아 둔다. 전시장 와이파이가 끊겨도 장소가 바뀔 때 멈추지 않게.
 * 받기 전이나 실패하면 원래 주소로 스트리밍한다. 지금 보이는 영상은 끊기지 않게 다음에 숨겨질 때 바꾼다.
 */
async function cacheBackdrops() {
  for (const { key, video } of TOUR_PLACES) {
    try {
      const res = await fetch(video);
      if (!res.ok) continue;
      const url = URL.createObjectURL(await res.blob());
      if (backdropKey === key) backdropBlobs[key] = url;
      else swapBackdropSrc(backdropVideos[key], url);
    } catch (e) {
      // 네트워크 오류: 스트리밍으로 계속
    }
  }
}

function swapBackdropSrc(v, url) {
  v.src = url;
  v.load();
}

function playBackdrop(v) {
  v.play().catch(() => {}); // 자동재생이 막혀도 화면은 그대로. 감시와 다음 터치에서 다시 시도
}

/**
 * 장소 영상으로 바꿈 (key가 null이면 모두 숨김)
 */
function showBackdrop(key) {
  const prevKey = backdropKey;
  const prev = backdropVideos[prevKey];
  const next = backdropVideos[key];
  backdropKey = key;
  backdropWatch = { t: 0, lastTime: -1, stalled: 0 };

  if (prev && prev !== next) {
    prev.style.opacity = 0;
    setTimeout(() => {
      if (backdropKey === prevKey) return;
      prev.pause();
      if (backdropBlobs[prevKey]) {
        swapBackdropSrc(prev, backdropBlobs[prevKey]);
        delete backdropBlobs[prevKey];
      }
    }, BACKDROP_FADE * 1000 + 50);
  }
  if (next) {
    playBackdrop(next);
    next.style.opacity = 1;
  }
}

/**
 * 매 프레임 (main.js의 draw()에서 호출). 1초마다 지금 영상이 실제로 흐르는지 확인하고,
 * 멈췄거나(화면 잠금, 자동재생 거부) 시간이 안 흐르면(버퍼링 멈춤) 다시 재생한다.
 */
function watchBackdrop() {
  const v = backdropVideos[backdropKey];
  if (!v) return;
  backdropWatch.t += Math.min(deltaTime, 100) / 1000;
  if (backdropWatch.t < 1) return;
  backdropWatch.t = 0;

  if (v.paused) {
    playBackdrop(v);
    return;
  }
  if (v.currentTime === backdropWatch.lastTime) {
    backdropWatch.stalled += 1;
    if (backdropWatch.stalled >= BACKDROP_STALL_SECONDS) {
      backdropWatch.stalled = 0;
      v.currentTime = v.currentTime; // 디코더를 다시 깨움
      playBackdrop(v);
    }
  } else {
    backdropWatch.stalled = 0;
  }
  backdropWatch.lastTime = v.currentTime;
}

/**
 * 터치할 때마다 호출. 자동재생이 막힌 기기도 사용자 제스처 안에서는 재생된다.
 */
function resumeBackdrop() {
  const v = backdropVideos[backdropKey];
  if (v && v.paused) playBackdrop(v);
}

function hasBackdrop() {
  return backdropKey !== null;
}
