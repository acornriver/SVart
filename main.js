/**
 * 청각 다변기 (Sound Variator) - Main Application Router
 *
 * [Part 1: 파트별 청취로 만드는 개인 선호 EQ]
 * - preload(), setup(), draw(), windowResized() 생명주기 관리
 * - GlobalState.currentStage에 따라 터치/마우스 이벤트 라우팅
 * - 모바일 기본 스크롤 및 바운스 제스처 차단
 */

function preload() {
  preloadPart1();
}

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.id('defaultCanvas0');

  pixelDensity(window.devicePixelRatio || 1);
  frameRate(60);

  // 모바일 브라우저 롱프레스 컨텍스트 메뉴 차단
  cnv.elt.addEventListener('contextmenu', (e) => e.preventDefault());
}

function draw() {
  if (window.GlobalState.currentStage.startsWith('PART1_')) {
    updatePart1(Math.min(deltaTime, 100) / 1000);
  }
  renderVisuals();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

/**
 * =========================================================================
 * 터치 및 마우스 인터랙션 통합 핸들러
 * =========================================================================
 */

let lastTouchTime = 0;
let dragY = null; // 조절 단계에서 쓸기 중인 손가락의 직전 y (버튼 위에서 시작하면 null)

function touchStarted() {
  lastTouchTime = millis();
  const tx = touches.length > 0 ? touches[0].x : mouseX;
  const ty = touches.length > 0 ? touches[0].y : mouseY;
  handlePointerDown(tx, ty);
  return false; // 모바일 스크롤 및 바운스 차단
}

function touchMoved() {
  if (touches.length > 0) handlePointerDrag(touches[0].y);
  return false;
}

function touchEnded() {
  lastTouchTime = millis();
  dragY = null;
  // iOS는 touchstart를 사용자 제스처로 인정하지 않아 시작(오디오 언락)은 손을 뗄 때 처리
  if (window.GlobalState.currentStage === 'INIT') initAudioPart1();
  return false;
}

function mousePressed() {
  if (millis() - lastTouchTime < 350) return;
  handlePointerDown(mouseX, mouseY);
}

function mouseDragged() {
  handlePointerDrag(mouseY);
}

// 지우면 안 됨: 없으면 p5가 마우스 업에서 touchEnded()를 대신 불러
// lastTouchTime이 갱신되고, 직후 클릭이 무시된다.
function mouseReleased() {
  dragY = null;
}

function hit(z, px, py) {
  return px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
}

/**
 * 터치/클릭 다운 라우팅
 */
function handlePointerDown(px, py) {
  const stage = window.GlobalState.currentStage;

  // INIT: 터치는 touchEnded()에서 처리, 마우스 클릭은 여기서 바로 시작
  if (stage === 'INIT') {
    if (touches.length === 0) initAudioPart1();
    return;
  }

  const zones = getInteractionZones();

  if (stage === 'PART1_VOLUME' || stage === 'PART1_LOW' || stage === 'PART1_HIGH') {
    if (hit(zones.btnPrimary, px, py)) tapConfirmAdjust();
    else if (py < zones.btnPrimary.y) dragY = py;
    return;
  }

  if (stage === 'PART1_REGISTER') {
    const cardIndex = zones.cards.findIndex((z) => hit(z, px, py));
    if (cardIndex >= 0) tapRegisterCard(cardIndex);
    else if (hit(zones.btnSecondary, px, py)) replayAllRegisterCards();
    else if (hit(zones.btnPrimary, px, py)) confirmRegister();
    return;
  }

  if (stage === 'PART1_RESULT') {
    if (hit(zones.btnPrimary, px, py)) toggleResultBypass();
    else if (hit(zones.btnSecondary, px, py)) restartPart1();
  }
}

/**
 * 조절 단계 쓸기: 위로 쓸면 커지고, 아래로 쓸면 작아짐 (화면 높이 비율로 전달)
 */
function handlePointerDrag(py) {
  if (dragY === null) return;
  dragAdjust((dragY - py) / height);
  dragY = py;
}
