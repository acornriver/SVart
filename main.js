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

function touchStarted() {
  lastTouchTime = millis();
  const tx = touches.length > 0 ? touches[0].x : mouseX;
  const ty = touches.length > 0 ? touches[0].y : mouseY;
  handlePointerDown(tx, ty);
  return false; // 모바일 스크롤 및 바운스 차단
}

function touchMoved() {
  return false;
}

function touchEnded() {
  lastTouchTime = millis();
  return false;
}

function mousePressed() {
  if (millis() - lastTouchTime < 350) return;
  handlePointerDown(mouseX, mouseY);
}

// 비워둬도 지우면 안 됨: 없으면 p5가 마우스 업에서 touchEnded()를 대신 불러
// lastTouchTime이 갱신되고, 직후 클릭이 무시된다.
function mouseReleased() {}

function hit(z, px, py) {
  return px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
}

/**
 * 터치/클릭 다운 라우팅
 */
function handlePointerDown(px, py) {
  const stage = window.GlobalState.currentStage;

  // INIT: 첫 터치로 오디오 + 자이로 언락
  if (stage === 'INIT') {
    initAudioPart1();
    return;
  }

  const zones = getInteractionZones();

  if (stage === 'PART1_VOLUME' || stage === 'PART1_LOW' || stage === 'PART1_HIGH') {
    if (hit(zones.btnPrimary, px, py)) tapConfirmAdjust();
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
