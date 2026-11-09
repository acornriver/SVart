/**
 * 청각 다변기 (Sound Variator) - Main Application Router
 *
 * 이름 입력(언어 고르기) → Part 1 네 단계(위아래로 쓸기) → Part 2 네 단계(톡 / 좌우로 쓸기)
 * → 결과(북서울 산책, 청감타워로 보내기)
 * - preload(), setup(), draw(), windowResized() 생명주기 관리
 * - 버튼 없이 손짓으로 조작. 손가락 하나를 짧게 누르기(톡) / 끌기 / 꾹 누르기로 나눔
 *     Part 1 ①②③ : 위아래로 끌기 = 조절,      달팽이 꾹 = 확정
 *     ④ 음역       : 등 위 A/B/C 자리 톡 = 고르기, 달팽이 톡 = 다시 듣기, 달팽이 꾹 = 확정
 *     ⑤ 고역 예민도 : 안 들리게 되는 순간 화면 아무 데나 톡 (손가락이 닿는 순간 바로). 다 들은 뒤 달팽이 톡 = 한 번 더, 달팽이 꾹 = 다음
 *     ⑥ 중앙        : 좌우로 끌기 = 비트를 머리 둘레로 돌리기, 달팽이 꾹 = 여기가 가운데
 *     ⑦⑧           : 좌우로 끌어 달팽이를 기어가게 하고 손을 떼면 바로 답(왼쪽/오른쪽), 달팽이 톡 = 한 번 더 듣기
 *     결과          : 3곡 버튼 톡 = 그 곡에 고정(달팽이가 들어봄), 슬라이더 = 원래 소리 ↔ 내 귀 EQ 비교,
 *                     빈 곳을 누르고 있는 동안 = 원래 소리, 달팽이를 오른쪽으로 밀기 = 청감타워로 보내기
 *     쓸기 방향: ①②③은 위아래로, ⑥⑦⑧과 보내기는 좌우로 쓸 때만 동작. 처음 움직인 방향으로 정하고, 대각선은 무시 (사용자 지시 11/06)
 *     검사 화면 오른쪽 위 슬라이더 : 음성 안내 크기. 잠겨 있어도 움직이고 검사 입력으로 치지 않음
 *     어느 단계든 IDLE_RESET_SECONDS 동안 아무도 안 만지면 첫 화면으로
 * - 안내 잠금(voice.js): 잠긴 동안 시작한 터치는 버리고, 풀린 뒤 새로 시작한 터치부터 반영
 * - 모바일 기본 스크롤 및 바운스 제스처 차단 (이름 입력 화면만 예외)
 */

const HOLD_MS = 900;            // 꾹 누르기로 확정되기까지
const TAP_MOVE_PX = 10;         // 이보다 많이 움직이면 톡·꾹이 아니라 끌기
const REPLAY_TAP_MS = 500;      // 이보다 오래 누르면 다시 듣기가 아님 (확정이 안 될 때 꾹 눌렀다 뗀 손가락이 다시 듣기가 되지 않게. Claude가 정함)
const DRAG_AXIS_RATIO = 1.5;    // 처음 움직인 방향이 이 배수만큼 위아래(또는 좌우)여야 쓸기로 침. 대각선은 무시 (56°쯤. Claude가 정함)
const SEND_PUSH_RATIO = 0.18;   // 결과: 달팽이를 화면 너비의 이만큼 오른쪽으로 밀면 보내기
const IDLE_RESET_SECONDS = 120; // 관람객이 자리를 떠나면 첫 화면으로

let lastTouchTime = 0;
let lastActivity = 0;
let pointer = null; // 지금 누르고 있는 손가락 { x0, y0, x, y, lastX, lastY, t0, onSnail, canHold, mode: 'pending' | 'drag' | 'ignored' | 'done' | 'voice' | 'eq' }

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.id('defaultCanvas0');

  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  frameRate(60);
  setupIntro(submitName);
  setupBackdrops();
  loadVoice();
  loadSamples();

  // 모바일 브라우저 롱프레스 컨텍스트 메뉴 차단
  cnv.elt.addEventListener('contextmenu', (e) => e.preventDefault());

  // 시스템 제스처 등으로 터치가 끊기면 touchend가 오지 않음. p5가 touchcancel을 듣지 않아 직접 받음
  window.addEventListener('touchcancel', pointerCancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pointerCancel(); });
}

function draw() {
  updateFlow(Math.min(deltaTime, 100) / 1000);
  watchBackdrop();
  updateHold();
  checkIdle();
  renderVisuals();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

/**
 * 이름을 넣으면 (키보드의 완료/Enter = 사용자 동작이라 여기서 소리를 켤 수 있음) 잠시 뒤 첫 검사로
 */
function submitName(name) {
  const gs = window.GlobalState;
  if (gs.currentStage !== 'INIT') return;
  gs.userName = name;
  initAudio();
  ensureAudioRunning();
  gs.currentStage = 'NAMED';
  lastActivity = millis();
  setTimeout(() => {
    if (gs.currentStage === 'NAMED') startFlow();
  }, NAME_FADE_MS);
}

function onIntro() {
  return isIntroStage(window.GlobalState.currentStage);
}

function checkIdle() {
  if (onIntro() || pointer) return;
  if (tourState().sendAt !== null) return; // 보내는 중에는 tour.js가 첫 화면으로 돌려보냄
  if (millis() - lastActivity > IDLE_RESET_SECONDS * 1000) restartFlow();
}

/**
 * =========================================================================
 * p5 터치 · 마우스 이벤트 → pointerDown / pointerMove / pointerUp
 * =========================================================================
 */

// 이름 입력 화면에서는 기본 동작을 막지 않음 (막으면 입력칸에 포커스가 안 가고 키보드가 안 뜸)
function touchStarted() {
  lastTouchTime = millis();
  if (onIntro()) return;
  const tx = touches.length > 0 ? touches[0].x : mouseX;
  const ty = touches.length > 0 ? touches[0].y : mouseY;
  pointerDown(tx, ty);
  return false; // 모바일 스크롤 및 바운스 차단
}

function touchMoved() {
  if (onIntro()) return;
  if (touches.length > 0) pointerMove(touches[0].x, touches[0].y);
  return false;
}

function touchEnded(event) {
  lastTouchTime = millis();
  if (onIntro()) {
    // iOS는 touchend 안에서만 오디오 언락을 사용자 제스처로 확실히 인정. 이름을 쓰러 입력칸을 누를 때 미리 풀어 둠
    initAudio();
    ensureAudioRunning();
    if (!(event && isIntroControl(event.target))) focusIntroInput();
    return;
  }
  pointerUp();
  // iOS는 touchend 안에서만 오디오/영상 재개를 확실히 허용
  ensureAudioRunning();
  resumeBackdrop();
  enterFullscreen();
  return false;
}

function mousePressed() {
  if (millis() - lastTouchTime < 350) return;
  if (onIntro()) {
    initAudio();
    return;
  }
  pointerDown(mouseX, mouseY);
}

function mouseDragged() {
  if (millis() - lastTouchTime < 350) return;
  pointerMove(mouseX, mouseY);
}

// 지우면 안 됨: 없으면 p5가 마우스 업에서 touchEnded()를 대신 불러
// lastTouchTime이 갱신되고, 직후 클릭이 무시된다.
function mouseReleased() {
  if (millis() - lastTouchTime < 350) return;
  pointerUp();
}

/**
 * =========================================================================
 * 손짓 해석
 * =========================================================================
 */

function pointerDown(px, py) {
  ensureAudioRunning();
  resumeBackdrop();
  lastActivity = millis();
  if (window.GlobalState.currentStage === 'RESULT') {
    if (tourState().sendAt !== null) return;
    if (hitResultEqSlider(px, py)) {
      pointer = { mode: 'eq' };
      setResultEqMix(resultEqMixAt(px));
      return;
    }
    const trackIdx = hitResultTrack(px, py);
    if (trackIdx >= 0) {
      pointer = { mode: 'done' };
      selectTourPlace(trackIdx);
      return;
    }
  }
  if (hitVoiceSlider(px, py)) {
    pointer = { mode: 'voice' };
    setVoiceLevel(voiceSliderLevelAt(px));
    return;
  }
  if (inputLocked()) return;

  // ⑤ 누른 시각이 답이라 손가락이 닿는 순간 바로 처리
  if (part2Tap()) return;

  const onSnail = hitSnail(px, py);
  const holdBypass = window.GlobalState.currentStage === 'RESULT' && !onSnail;
  pointer = {
    x0: px, y0: py, x: px, y: py, lastX: px, lastY: py, t0: millis(),
    onSnail, canHold: canHoldConfirm(), mode: 'pending',
    holdBypass, prevEqMix: window.GlobalState.part1.eqMix
  };

  // 결과: 달팽이·버튼·슬라이더가 아닌 빈 곳을 누르면 누르고 있는 동안 원래 소리
  if (holdBypass) setResultBypass(true);
}

function pointerMove(px, py) {
  if (!pointer) return;
  lastActivity = millis();
  if (pointer.mode === 'voice') {
    setVoiceLevel(voiceSliderLevelAt(px));
    return;
  }
  if (pointer.mode === 'eq') {
    setResultEqMix(resultEqMixAt(px));
    return;
  }
  pointer.x = px;
  pointer.y = py;
  if (pointer.mode === 'pending' && Math.hypot(px - pointer.x0, py - pointer.y0) > TAP_MOVE_PX) {
    pointer.mode = dragAxisOk(px - pointer.x0, py - pointer.y0) ? 'drag' : 'ignored';
    pointer.lastX = pointer.x0; // 끌기로 바뀌기 전 움직인 만큼도 반영
    pointer.lastY = pointer.y0;
  }
  if (pointer.mode !== 'drag') return;

  const stage = window.GlobalState.currentStage;
  if (PART1_ADJUST[stage]) dragAdjust((pointer.lastY - py) / height);
  else if (stage.startsWith('PART2_')) dragRoll((px - pointer.lastX) / width);
  else if (stage === 'RESULT' && pointer.onSnail && px - pointer.x0 > width * SEND_PUSH_RATIO) {
    pointer.mode = 'done';
    sendToTower();
  }
  pointer.lastX = px;
  pointer.lastY = py;
}

function pointerUp() {
  if (!pointer) return;
  const p = pointer;
  pointer = null;
  lastActivity = millis();
  const stage = window.GlobalState.currentStage;

  if (stage === 'RESULT' && p.holdBypass) setResultEqMix(p.prevEqMix);
  if (p.mode === 'drag' && stage.startsWith('PART2_')) releaseRoll();
  if (p.mode === 'pending') tapAt(p.x0, p.y0, millis() - p.t0);
}

/**
 * 짧게 누르기(톡): 달팽이 본체 = 다시 듣기, ④ 등 위 A/B/C 자리 = 고르기
 */
function tapAt(px, py, pressedMs) {
  const stage = window.GlobalState.currentStage;
  if (stage === 'PART1_REGISTER') {
    const spot = registerSpotAt(px, py);
    if (spot >= 0) {
      tapRegisterCard(spot);
      return;
    }
  }
  if (pressedMs < REPLAY_TAP_MS && hitSnail(px, py) && canReplay()) {
    replayPart2(); // ④는 A/B/C를 눌러 다시 들음 (canReplay가 false)
  }
}

// 지금 단계가 받는 방향으로 쓰기 시작했는지. ①②③ 위아래, ⑥⑦⑧·결과 좌우
function dragAxisOk(dx, dy) {
  const stage = window.GlobalState.currentStage;
  if (PART1_ADJUST[stage]) return Math.abs(dy) >= Math.abs(dx) * DRAG_AXIS_RATIO;
  if (stage.startsWith('PART2_') || stage === 'RESULT') return Math.abs(dx) >= Math.abs(dy) * DRAG_AXIS_RATIO;
  return true;
}

// 터치가 중간에 끊김: 답이나 확정으로 치지 않고 손가락만 놓음
function pointerCancel() {
  if (!pointer) return;
  const p = pointer;
  pointer = null;
  lastActivity = millis();
  const stage = window.GlobalState.currentStage;
  if (stage === 'RESULT' && p.holdBypass) setResultEqMix(p.prevEqMix);
  if (p.mode === 'drag' && stage.startsWith('PART2_')) cancelRoll();
}

/**
 * 꾹 누르기: 달팽이 위에서 시작해 움직이지 않고 HOLD_MS가 지나면 지금 단계를 확정 (매 프레임 확인)
 */
function canHoldConfirm() {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  if (voiceBusy() || inputLocked()) return false; // 말이 끝나기 전에 닿아 있던 손가락으로 넘어가지 않게
  if (PART1_ADJUST[stage]) return canConfirmAdjust();
  if (stage === 'PART1_REGISTER') return gs.part1.register.selectedCard >= 0 && !gs.part1.register.isAutoPlaying && !!voiceCue.picked;
  if (stage === 'PART2_CENTER' || stage === 'PART2_SENSITIVITY') return canConfirmPart2(); // ⑦⑧은 손을 떼면 답 (releaseRoll)
  return false;
}

function holdReady() {
  return !!pointer && pointer.mode === 'pending' && pointer.onSnail && pointer.canHold && canHoldConfirm();
}

function updateHold() {
  if (pointer && pointer.mode !== 'voice' && inputLocked()) pointer = null; // 잠금이 시작되면 누르던 손가락도 버림
  if (!holdReady()) return;
  if (millis() - pointer.t0 < HOLD_MS) return;
  pointer.mode = 'done';
  const stage = window.GlobalState.currentStage;
  if (PART1_ADJUST[stage]) tapConfirmAdjust();
  else if (stage === 'PART1_REGISTER') confirmRegister();
  else if (stage.startsWith('PART2_')) confirmPart2();
}

// 비주얼용: 꾹 누르는 중이면 { x, y, progress 0~1 }
function getHold() {
  if (!holdReady()) return null;
  const elapsed = millis() - pointer.t0;
  if (elapsed < 120) return null; // 톡과 구분: 잠깐 누를 때는 고리를 안 보임
  return { x: pointer.x0, y: pointer.y0, progress: Math.min(1, (elapsed - 120) / (HOLD_MS - 120)) };
}
