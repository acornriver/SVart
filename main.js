/**
 * 청각 다변기 (Sound Variator) - Main Application Router
 * 
 * [Part 1: 개인화 등청감 EQ 및 커스텀 그레이 노이즈 도출]
 * - setup(), draw(), windowResized() 생명주기 관리
 * - 터치 및 마우스 인터랙션 이벤트 통합 라우팅
 * - 모바일 기본 스크롤 및 바운스 제스처 차단
 */

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.id('defaultCanvas0');

  pixelDensity(window.devicePixelRatio || 1);
  frameRate(60);

  // 모바일 브라우저 롱프레스 컨텍스트 메뉴 차단
  const canvasElement = cnv.elt;
  canvasElement.addEventListener('contextmenu', (e) => e.preventDefault());

  console.log('[Main] Sound Variator Part 1 initialized.');
}

function draw() {
  const stage = window.GlobalState.currentStage;

  // 튜닝 모드일 때 실시간 센서 및 오디오 업데이트
  if (stage === 'TUNING') {
    updatePart1AudioAndSensors();
  }

  // 화면 렌더링
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
  handlePointerUp();
  return false;
}

function mousePressed() {
  if (millis() - lastTouchTime < 350) return;
  handlePointerDown(mouseX, mouseY);
}

function mouseReleased() {
  if (millis() - lastTouchTime < 350) return;
  handlePointerUp();
}

/**
 * 터치/클릭 다운 라우팅
 */
function handlePointerDown(px, py) {
  const stage = window.GlobalState.currentStage;

  // 1. INIT 단계: 화면 터치 시 단일 제스처로 오디오 + 자이로 언락
  if (stage === 'INIT') {
    initAudioPart1();
    return;
  }

  // 2. TUNING 단계
  if (stage === 'TUNING') {
    const zones = getInteractionZones();

    // A. 클러치 패드 터치 -> 홀드 튜닝 활성화
    const c = zones.clutch;
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) {
      activateClutch();
      return;
    }

    // B. 주파수 5-Band 탭 터치 -> 대역 선택
    for (let tab of zones.tabs) {
      if (px >= tab.x && px <= tab.x + tab.w && py >= tab.y && py <= tab.y + tab.h) {
        selectBand(tab.index);
        return;
      }
    }

    // C. 초기화 버튼 (Flat Reset)
    const r = zones.btnReset;
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      resetEQ();
      return;
    }

    // D. 결과 프로파일 보기 버튼
    const p = zones.btnProfile;
    if (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) {
      toggleProfileView();
      return;
    }
  }

  // 3. PROFILE 단계
  if (stage === 'PROFILE') {
    const zones = getInteractionZones();
    const b = zones.btnBackFromProfile;
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      toggleProfileView();
      return;
    }
  }
}

/**
 * 터치/클릭 업 라우팅
 */
function handlePointerUp() {
  if (window.GlobalState.currentStage === 'TUNING') {
    if (window.GlobalState.sensor.isClutchActive) {
      releaseClutch();
    }
  }
}
