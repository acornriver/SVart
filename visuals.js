/**
 * 청각 다변기 (Sound Variator) - Visual Renderer & UI
 *
 * 모든 귀는 [ ] 이다 — 소리로 그린 달팽이
 * 검정 바탕, 흰 선 하나. 달팽이의 윤곽은 지금 들리는 소리의 파형(오실로스코프)이고, 껍질은 그 파형을 나선으로 만 것.
 * 비트를 타며 킥에 눌리고 흰 섬광이 번진다. 포인트 색은 신호 빨강 하나.
 * - 가로축 = 음고: 왼쪽 꼬리 = 낮은 소리, 오른쪽 머리 = 높은 소리. 더듬이는 늘 오른쪽이라 달팽이는 오른쪽을 본다.
 *   ① 크기  → 덩어리가 부풀거나 줄어듦
 *   ② 저음  → 꼬리를 빚음 (위로 쓸면 통통하게, 아래로 쓸면 눌려서 작게)
 *   ③ 고음  → 머리를 빚음 (위로 쓸면 크고 높이, 아래로 쓸면 눌려서 작게)
 *   ④ 음역  → 껍질을 얹을 자리 (저음역 왼쪽 / 중음역 가운데 / 고음역 오른쪽)
 *   Part 2  → ⑦⑧은 오른쪽을 바라본 채 좌우로 이동해 답함 (사용자 확정 11/09). ⑥은 돌리는 동안 선 색이 실시간으로 바뀜
 *             ⑦은 고르는 쪽 더듬이가 과장되게 늘어나 꿈틀대고, ⑧은 고르는 뜻대로 점액(네모/동그라미)을 흘리며 오감
 * - 결과: 다 빚은 달팽이가 북서울 주변을 걷는다 (뒤에 그 장소 영상을 고대비 흑백으로). 보내면 오른쪽으로 기어 나감
 * 조절 중에는 dB 값이나 눈금 숫자를 크게 보여주지 않는다. 값은 우상단에 작은 디버그 숫자로만 표시.
 * 섬광은 눈에 부담이 없도록 아주 옅게만 쓴다 (깜빡이는 스트로브 아님).
 * 첫 화면의 확성기·언어 말고는 버튼이 없다. 확정은 달팽이를 꾹 누르기, 다시 듣기는 더듬이 톡, 음역은 등 위 자리를 톡,
 * 결과에서는 누르고 있는 동안 원래 소리, 달팽이를 오른쪽으로 밀면 청감타워로 (입력은 main.js)
 * 문구는 모두 copy.js의 t()로 가져온다 (한국어 / English). 음성 안내가 나오는 동안은 그 자막을 위에, 조용할 때는 지금 할 일을 아래에 보여 준다.
 */

const COLORS = {
  bg: [0, 0, 0],
  ink: [245, 245, 240],
  mute: [128, 128, 124],
  line: [58, 58, 56],
  card: [10, 10, 10],
  accent: [255, 59, 31]   // 신호 빨강
};

// ⑥ 중앙 검사로 정하는 달팽이 선 색 (media/img/중앙패닝 달팽이 색 정하기.png, 사용자 지시 11/02)
// 왼쪽으로 치우칠수록 low(땅·나무), 오른쪽으로 치우칠수록 high(건물·하늘). 가운데(0°)는 막대 한가운데. 사이는 이어서 섞음
const SNAIL_PALETTE = ['#B19E6B', '#808E30', '#5C6A36', '#8C7256', '#A8765C', '#978A87', '#C4B8B0', '#A8B0C1', '#7CA0BA', '#6C9AD1']
  .map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
const SNAIL_COLOR_DEG = 30; // 이만큼 치우치면 팔레트 끝 색 (Claude가 정함)

// ⑤ 고역 한계 → 달팽이 꼬임 (media/img/달팽이 꼬임 정도 고역한계.png, 사용자 지시 11/02)
// ⑤부터 선이 이중나선으로 갈라지고, 높이 들을수록 더 촘촘하게 꼬임. 꼬임 수는 Claude가 정함
// ⑧ 바탕음·배음 → 점액 모양 (사용자 지시 11/02): 바탕음 귀 F = 네모, 배음 귀 H = 동그라미, 두 귀 B = 섞임
const SLIME = { perSec: 14, lifeMs: 3200, speed: [18, 46], size: [2, 5] };
// ⑦ 고르는 동안 그쪽 더듬이: 최대 길이 배율, 반대쪽 배율, 꿈틀대는 크기 (Claude가 정함)
const EAR_LIVE = { long: 2.6, short: 0.6, wiggle: 0.22 };
const CRAWL_SCALE = 0.6;  // ⑦⑧ 기어가는 동안 몸 크기 배율 (Claude가 정함)
const SHELL_POP = { spring: 0.2, damp: 0.7 }; // ④ 혹이 튀어나오는 탄성 (Claude가 정함)
const EAR_SHELL = { LEFT: 1, RIGHT: 0 };      // ⑦ 우세 귀 → 껍질 모양: 왼쪽 = 네모, 오른쪽 = 동그라미 (사용자 지시 11/06)
const RESULT_EQ_SLIDER = { hit: 38 };         // 결과 화면 원래 소리 ↔ 내 귀 EQ 슬라이더 손끝 판정 여유
const LISTEN_ANIM_MS = 2200;                  // 곡 버튼을 눌렀을 때 달팽이가 더 크게 귀 기울이는 시간
const HELIX = { bodyTwists: [3, 22], shellTwists: [4, 30], sep: 0.075, rungEvery: 3, spinSpeed: 1.4 };

const FONT = {
  sans: "'Noto Sans KR', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace"
};

const SIZE_MIN = 0.72;      // ① 가장 작게 골랐을 때 덩어리 크기 배율
const SIZE_MAX = 1.28;      // ① 가장 크게 골랐을 때
const NAME_FADE_MS = 1900;  // 이름을 넣고 첫 검사로 넘어가기까지
const VOICE_SLIDER = { width: 180, hit: 32 }; // 음성 크기 슬라이더: 길이, 손끝 판정 여유 (Claude가 정함)
const RESULT_TEXT_DELAY = 1200;
const BACKDROP_WASH = 110;  // 결과 화면 영상 위에 덮는 검정 (0~255). 글자 자리는 따로 더 어둡게
const OUTLINE_POINTS = 160;
const WAVE_GAIN = 0.8;      // 파형이 윤곽을 흔드는 크기 (반지름 배율, ①에서 고른 볼륨과 상관없이 같은 크기로)

// 덩어리에서 꼬리와 머리가 나오는 방향 (화면 좌표는 y가 아래로 +라 π보다 작아야 아래)
const TAIL_ANGLE = Math.PI - 0.55;  // 왼쪽 바닥 쪽 (꼬리는 바닥에 깔림)
const HEAD_ANGLE = -0.5;            // 오른쪽 위쪽
// ④ 음역별 껍질 자리 (반지름 배율, 가운데 기준)
const SHELL_SPOT = { LOW: -0.75, MID: 0, HIGH: 0.7 };

const N_TESTS = 8;
const REGISTER_LETTERS = ['A', 'B', 'C'];
const HOLD_RING = 46;       // 꾹 누를 때 손끝 둘레에 차오르는 고리 반지름(px)

let cur = null;             // 화면 값 (실제 값을 부드럽게 따라감)
let shellRot = 0;
let prevShellX = null;
let resultAt = 0;
let lastStage = null;
let intro = {};
let wave = null;            // 이번 프레임의 파형 (-1 ~ 1)
let lastShape = null;       // 이번 프레임에 그린 달팽이 (터치 판정용)
let antennaTips = [];
let shellAt = null;         // { x, y, r }
let pulse = { kick: 0, snare: 0, hat: 0 };
let snailInk = COLORS.ink.slice(); // 지금 달팽이 선 색 (정해진 색을 천천히 따라감)
let snailGlow = COLORS.accent.slice(); // 선 밑의 잔광. ⑥ 전에는 빨강, 색이 정해지면 그 색 (빨강이 깔리면 파란 선이 보라로 보임, 차민휘 전달사항 11/06)
let slime = [];             // 점액 파티클 { x, y, vx, vy, born, life, size, sq }
let slimeAcc = 0;

/**
 * 메인 렌더 함수 (main.js의 draw()에서 호출)
 */
function renderVisuals() {
  const stage = window.GlobalState.currentStage;
  if (stage !== lastStage) onStageChange(stage);

  // 결과 화면에서는 캔버스 뒤 영상이 비치도록 지우고 검정을 반투명하게 덮음
  clear();
  background(0, 0, 0, hasBackdrop() ? BACKDROP_WASH : 255);

  const fft = window.GlobalState.audioNodes.fft;
  wave = fft ? fft.waveform() : null;
  pulse = getBeatPulse();

  const L = calculateUILayout();
  if (!cur) cur = targetParams(L);
  smoothAll(L);

  if (isIntroStage(stage)) {
    return;
  }

  if (MemeFX.activeKey()) {
    // An edited interstitial: keep the character, clear the instructional overlays.
    if (sendProgress() < 1) drawSnail(L);
    return;
  }

  if (stage === 'RESULT') {
    drawSnail(L);
    drawAnalysis(L);
  } else if (stage === 'MUSIC') {
    drawSnail(L);
    drawMusic(L);
  } else {
    drawGround(L);
    drawSnail(L);
    drawHeader(L);
    drawGuides(L);
  }
  drawHoldRing();
  drawFlash();
}

function isIntroStage(stage) {
  return stage === 'INIT' || stage === 'NAMED';
}

function onStageChange(stage) {
  if (stage === 'RESULT' || stage === 'MUSIC') resultAt = millis();
  if (stage === 'INIT' || stage === 'RESULT' || stage === 'MUSIC') { slime = []; slimeAcc = 0; }
  if (stage === 'INIT' && lastStage !== null) showIntro();
  lastStage = stage;
}

/* =====================================================================
 * 첫 화면: 모든 귀는 [ ] 이다 + 언어 고르기
 * ===================================================================== */

/**
 * [ … ] 탭으로 시작하는 첫 화면. 이름 입력 없음.
 */
function setupIntro(onSubmit) {
  const wrap = document.createElement('div');
  wrap.className = 'intro';
  wrap.innerHTML =
    '<div class="langs"><button type="button" class="spk">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9.5v5h3.5L11 18.5v-13L6.5 9.5z" fill="currentColor" stroke="none"/>' +
    '<circle class="on" cx="18" cy="12" r="3.5"/><path class="off" d="M15 9l6 6M21 9l-6 6"/></svg></button>' +
    '<button type="button" data-lang="ko">한국어</button><button type="button" data-lang="en">English</button></div>' +
    '<button type="button" class="title-btn" aria-label="시작">' +
    '<span class="before"></span><span class="br">[</span>' +
    '<span class="dots">…</span>' +
    '<span class="br">]</span><span class="after"></span>' +
    '</button>' +
    '<div class="hint"></div>';
  document.body.appendChild(wrap);

  intro = {
    wrap,
    hint: wrap.querySelector('.hint'),
    before: wrap.querySelector('.before'),
    after: wrap.querySelector('.after'),
    titleBtn: wrap.querySelector('.title-btn'),
    speaker: wrap.querySelector('.spk'),
    langs: [...wrap.querySelectorAll('[data-lang]')]
  };

  function startFlow() {
    if (intro.wrap.classList.contains('started')) return;
    intro.hint.style.opacity = 0;
    intro.wrap.classList.add('started');
    enterFullscreen();
    onSubmit('');
    setTimeout(() => intro.wrap.classList.add('out'), 900);
    setTimeout(() => intro.wrap.classList.add('gone'), NAME_FADE_MS);
  }

  intro.speaker.addEventListener('click', () => {
    setVoiceOn(!window.GlobalState.voiceOn);
    refreshIntroText();
  });
  intro.langs.forEach((b) => b.addEventListener('click', () => {
    window.GlobalState.lang = b.dataset.lang;
    refreshIntroText();
  }));
  intro.titleBtn.addEventListener('click', startFlow);

  refreshIntroText();
}

function refreshIntroText() {
  intro.before.textContent = t('intro.before');
  intro.after.textContent = t('intro.after');
  refreshIntroHint();
  document.documentElement.lang = currentLang();
  intro.langs.forEach((b) => b.classList.toggle('on', b.dataset.lang === currentLang()));
  intro.speaker.classList.toggle('muted', !window.GlobalState.voiceOn);
  intro.speaker.setAttribute('aria-label', t('intro.voice'));
  intro.speaker.setAttribute('aria-pressed', String(window.GlobalState.voiceOn));
}

// 첫 화면 안내
function refreshIntroHint() {
  intro.hint.textContent = t('intro.headphones');
}

function showIntro() {
  exitFullscreen();
  intro.wrap.classList.remove('gone', 'out', 'started');
  intro.hint.style.opacity = 1;
  refreshIntroText();
}

function focusIntroInput() { /* 이름 입력 없음 — 하위 호환용 빈 함수 */ }

// Safari에서 주소창과 시계·배터리 줄까지 가리기. iPad는 전체화면에서 글자를 치면 경고가 떠서 첫 화면(이름 입력)에서는 쓰지 않음
function enterFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return;
  const result = request.call(root);
  if (result && result.catch) result.catch(() => {});
}

function exitFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const result = exit.call(document);
  if (result && result.catch) result.catch(() => {});
}

// 첫 화면에서 직접 누를 수 있는 것 (입력칸, 확성기, 언어 버튼). main.js가 이 위의 터치는 그대로 둠
function isIntroControl(el) {
  return !!el && (el === intro.input || el === intro.speaker || intro.langs.includes(el));
}

function fitIntroInput() { /* 이름 입력 없음 — 하위 호환용 빈 함수 */ }

/* =====================================================================
 * 작은 헬퍼
 * ===================================================================== */

// p5 textFont는 폰트 스택을 지원하지 않아 캔버스 font를 직접 지정
function label(str, x, y, { family = FONT.sans, size = 12, weight = 400, c = COLORS.ink, a = 255, align = LEFT, valign = CENTER } = {}) {
  push();
  noStroke();
  fill(c[0], c[1], c[2], a);
  textAlign(align, valign);
  textSize(size);
  drawingContext.font = `${weight} ${size}px ${family}`;
  text(str, x, y);
  pop();
}

function textW(str, size, weight = 400, family = FONT.sans) {
  drawingContext.font = `${weight} ${size}px ${family}`;
  return drawingContext.measureText(str).width;
}

function rgba(c, a) {
  return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
}

function fmtDb(g) {
  return `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(1)}`;
}

function angDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function stageIndex(stage) {
  return FLOW_STAGES.indexOf(stage); // INIT · NAMED = -1
}

// 파형 샘플 (u: 0~1). masterGain 뒤에서 잰 값이라 고른 볼륨으로 나눠 늘 비슷한 크기로.
// 소리가 없거나 오디오 전이면 아주 옅게 숨쉬는 결
function waveAt(u) {
  const idle = 0.015 * Math.sin(u * 60 + millis() / 300);
  if (!wave || !wave.length) return idle;
  const vol = Math.max(0.1, window.GlobalState.userEQProfile.masterVolume);
  return idle + constrain(wave[Math.min(wave.length - 1, Math.floor(u * wave.length))] / vol, -0.6, 0.6);
}

/**
 * 폭에 맞춰 어절 단위로 줄바꿈
 */
function wrapText(str, maxW, size, weight) {
  drawingContext.font = `${weight} ${size}px ${FONT.sans}`;
  const out = [];
  let ln = '';
  str.split(' ').forEach((word) => {
    const next = ln ? `${ln} ${word}` : word;
    if (ln && drawingContext.measureText(next).width > maxW) {
      out.push(ln);
      ln = word;
    } else {
      ln = next;
    }
  });
  if (ln) out.push(ln);
  return out;
}

/* =====================================================================
 * 레이아웃 (히트테스트와 공유)
 * ===================================================================== */

function calculateUILayout() {
  const stage = window.GlobalState.currentStage;
  const m = max(20, min(width, height) * 0.05);
  const btnH = 54;
  const btn = { x: m, y: height - m - btnH, w: width - m * 2, h: btnH };

  // 달팽이 무대: 바닥선 높이와 덩어리 기준 반지름
  let stageTop = height < 850 ? 210 : 240;
  let stageBottom = btn.y - 110;
  let groundK = 0.72;
  if (stage === 'RESULT') { stageTop = m + 185; stageBottom = btn.y - 230; groundK = 0.72; }
  const stageH = max(160, stageBottom - stageTop);
  let R0 = min(width * (stage === 'RESULT' ? 0.155 : 0.15), stageH * 0.24); // 11/07 아이패드 미니에서 작아 보여 약 1.25배로 키움
  let groundY = stageTop + stageH * groundK;
  if (isIntroStage(stage)) { R0 = min(width, height) * 0.075; groundY = height * 0.86; }

  if (stage === 'RESULT') { R0 = min(width * 0.065, height * 0.04); groundY = height * (height > width ? 0.45 : 0.43); }
  if (stage === 'MUSIC') { R0 = min(width * 0.07, height * 0.045); groundY = height * (height < 850 ? 0.61 : 0.65) - 24; }

  // btn: 예전 버튼 자리. 지금은 아래쪽 안내 문구 자리로만 씀
  return { m, btn, hintY: btn.y + btnH / 2, cx: width / 2, groundY, R0, track: max(R0 * 1.4, width * 0.28), x0: m + 8, x1: width - m - 8 };
}
/* ---------- 터치 판정 (main.js가 씀) ---------- */

// 결과 화면: 사운드스케이프 3곡 선택 버튼 영역
function resultTrackBoxes(L = calculateUILayout()) {
  const totalW = min(width - L.m * 2, 960), gap = 14;
  const w = (totalW - gap * (TOUR_PLACES.length - 1)) / TOUR_PLACES.length;
  const y = height * (height < 850 ? 0.61 : 0.65), h = height < 850 ? 60 : 76;
  return TOUR_PLACES.map((p, i) => ({ index: i, key: p.key, x: width / 2 - totalW / 2 + i * (w + gap), y, w, h, cx: width / 2 - totalW / 2 + i * (w + gap) + w / 2, cy: y + h / 2 }));
}

function hitResultTrack(px, py) {
  if (window.GlobalState.currentStage !== 'MUSIC') return -1;
  const hit = resultTrackBoxes().find((b) => px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 6 && py <= b.y + b.h + 6);
  return hit ? hit.index : -1;
}

// 결과 화면: 원래 소리(0) ↔ 내 귀 EQ(1) 슬라이더 영역
function resultEqSliderBox(L = calculateUILayout()) {
  const w = min(width - L.m * 2, 900);
  return { x0: width / 2 - w / 2, x1: width / 2 + w / 2, y: height * (height < 850 ? 0.79 : 0.83) };
}

function hitResultEqSlider(px, py) {
  if (window.GlobalState.currentStage !== 'MUSIC') return false;
  const b = resultEqSliderBox();
  return px >= b.x0 - RESULT_EQ_SLIDER.hit && px <= b.x1 + RESULT_EQ_SLIDER.hit && Math.abs(py - b.y) <= RESULT_EQ_SLIDER.hit;
}

function resultEqMixAt(px) {
  const b = resultEqSliderBox();
  return constrain((px - b.x0) / Math.max(1, b.x1 - b.x0), 0, 1);
}

// 달팽이(몸 + 껍질)를 눌렀는지. 손가락이라 조금 넉넉하게
function hitSnail(px, py) {
  if (!lastShape) return false;
  const pad = 24;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  lastShape.pts.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
  if (px >= x0 - pad && px <= x1 + pad && py >= y0 - pad && py <= y1 + pad) return true;
  return !!shellAt && cur.shellOn > 0.5 && Math.hypot(px - shellAt.x, py - shellAt.y) < shellAt.r + pad;
}

function hitAntenna(px, py) {
  const r = Math.max(30, cur.R0 * 0.35);
  return antennaTips.some((p) => Math.hypot(px - p.x, py - p.y) < r);
}

// ④ 세 자리 중 어디를 눌렀는지 (0 저음역 / 1 중음역 / 2 고음역). 달팽이 자체를 누른 것은 다시 듣기라 뺌
function registerSpotAt(px, py) {
  if (!lastShape || py < cur.groundY - cur.R0 * 4 || py > cur.groundY + 40 || hitSnail(px, py)) return -1;
  const xs = REGISTERS.map((r) => lastShape.cx + SHELL_SPOT[r.id] * cur.R0);
  if (px < (xs[0] + xs[1]) / 2) return 0;
  if (px < (xs[1] + xs[2]) / 2) return 1;
  return 2;
}

// 테스트와 안내용: 달팽이 가운데, 더듬이 끝, 등 위 세 자리의 화면 좌표
function getTouchTargets() {
  if (!lastShape) return null;
  return {
    snail: { x: lastShape.cx, y: lastShape.cy },
    antenna: antennaTips[1] || antennaTips[0],
    spots: REGISTERS.map((r) => ({ x: lastShape.cx + SHELL_SPOT[r.id] * cur.R0, y: cur.groundY - cur.R0 * 3.1 })),
    tracks: resultTrackBoxes().map((b) => ({ x: b.cx, y: b.cy })),
    eqSlider: resultEqSliderBox()
  };
}

// 지금 더듬이를 누르면 다시 들려줄 수 있는지
function canReplay() {
  const stage = window.GlobalState.currentStage;
  if (inputLocked()) return false;
  if (stage === 'PART1_REGISTER') return false; // 11/07 ④는 A/B/C를 눌러 다시 들으므로 달팽이 톡 다시 듣기 없음
  return canReplayPart2();
}

/* =====================================================================
 * 값 → 달팽이 모양
 * ===================================================================== */

/**
 * 지금 화면에 반영할 Part 1 값. 아직 안 한 검사는 null, 지금 단계는 조절 중인 값을 바로 보여줌
 */
function viewValues() {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  const p = gs.userEQProfile;
  const at = stageIndex(stage);
  const reached = (s) => at >= FLOW_STAGES.indexOf(s);
  return {
    volDb: reached('PART1_VOLUME') ? 20 * Math.log10(Math.max(p.masterVolume, 1e-4)) : null,
    low: reached('PART1_LOW') ? p.lowShelf.gain : null,
    high: reached('PART1_HIGH') ? p.highShelf.gain : null
  };
}

/**
 * 껍질: 보이는 정도, 자리(px, 가운데 기준), 자리 이름(바뀌면 새로 튀어나옴)
 */
function shellTarget(L, R0) {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  const chosen = gs.userEQProfile.registerPeak.register;
  const spot = (id) => SHELL_SPOT[id] * R0;

  if (stage === 'PART1_REGISTER') {
    const reg = gs.part1.register;
    const card = reg.playingCard >= 0 ? reg.playingCard : reg.selectedCard;
    if (card < 0) return { on: 0, x: 0, key: null };
    // 울리는 동안은 작게 튀어나오고, 고르면 다 튀어나옴 (사용자 지시: 얹지 않고 뾰루지처럼)
    const settled = reg.playingCard < 0 && reg.selectedCard === card;
    return { on: settled ? 1 : 0.6, x: spot(reg.order[card]), key: reg.order[card] };
  }
  if (stage.startsWith('PART2_')) return { on: 1, x: chosen ? spot(chosen) : 0, key: chosen || 'MID' }; // 제자리 (⑥은 돌기만 하고, ⑦⑧은 달팽이째 움직임)
  if ((stage === 'RESULT' || stage === 'MUSIC') && chosen) return { on: 1, x: spot(chosen), key: chosen };
  return { on: 0, x: 0, key: null };
}

function targetParams(L) {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  const v = viewValues();
  const at = stageIndex(stage);
  const cfg = PART1_ADJUST.PART1_VOLUME;
  const size = map(v.volDb === null ? -20 : v.volDb, cfg.min, cfg.max, SIZE_MIN, SIZE_MAX, true);
  // ⑦⑧: 달팽이 자체가 좌우로 기어감. 화면 안에서 오갈 수 있게 조금 작게
  const crawlStage = stage === 'PART2_SENSITIVITY' || stage === 'PART2_EAR' || stage === 'PART2_PITCH';
  const R0 = L.R0 * size * (crawlStage ? CRAWL_SCALE : 1);
  const reveal = MemeFX.activeKey() === 'reveal';
  const musicX = stage === 'MUSIC' ? constrain(resultTrackBoxes(L)[tourState().index].cx, L.m + R0 * 2.8, width - L.m - R0 * 2.8) : L.cx;
  const sh = shellTarget(L, R0);
  const tw = isIntroStage(stage) ? null : part2Twist();
  const pressing = millis() - gs.part1.lastDragAt < 180 && (stage === 'PART1_LOW' || stage === 'PART1_HIGH');
  return {
    cx: musicX + (crawlStage && !reveal ? (gs.part2.roll / (typeof PART2_SNAP !== 'undefined' ? PART2_SNAP : 0.85)) * crawlTravel(L, R0) : 0), groundY: L.groundY, R0,
    tailF: v.low === null ? 0 : 1,
    tailG: v.low === null ? 0 : v.low / 10,
    headF: v.high === null ? 0 : 1,
    headG: v.high === null ? 0 : v.high / 10,
    wobble: at < FLOW_STAGES.indexOf('PART1_LOW') ? 1 : 0.3, // 빚기 전에는 말랑하게 일렁임
    crawl: stage === 'MUSIC' ? 1 : 0,                       // 결과 화면: 제자리에서 천천히 기어감
    press: pressing ? 1 : 0,
    pressAngle: stage === 'PART1_VOLUME' ? -HALF_PI : stage === 'PART1_HIGH' ? HEAD_ANGLE : TAIL_ANGLE,
    shellOn: sh.on, shellX: sh.x, shellKey: sh.key,
    shellSquare: (stage === 'RESULT' || stage === 'MUSIC') ? (EAR_SHELL[gs.psychoProfile.dominantEar] ?? 0) : 0, // ⑦ 우세 귀에 따른 네모/동그라미 등껍질 (결과에서만 표시)
    helix: tw === null ? 0 : 1, twist: tw === null ? 0 : tw,
    dim: stage === 'MUSIC' ? lerp(0.45, 1, typeof gs.part1.eqMix === 'number' ? gs.part1.eqMix : (gs.part1.isBypassed ? 0 : 1)) : 1
  };
}

// ⑦⑧ 가운데에서 한쪽 끝까지 기어가는 거리(px). 머리·더듬이(늘어난 것까지)가 화면 밖으로 나가지 않게
function crawlTravel(L, R0) {
  return Math.max(R0 * 0.8, Math.min(L.track, width / 2 - L.m - R0 * 3.3));
}

function smoothAll(L) {
  const tp = targetParams(L);
  const k = 0.1;
  const stage = window.GlobalState.currentStage;
  const crawlStage = stage === 'PART2_SENSITIVITY' || stage === 'PART2_EAR' || stage === 'PART2_PITCH' || stage === 'MUSIC';
  // 이동 방향과 무관하게 머리·더듬이는 항상 오른쪽 (사용자 확정 2026-11-09).
  const dx = tp.cx - cur.cx;
  cur.faceT = 1;
  cur.face = 1;
  cur.move = lerp(cur.move || 0, constrain(Math.abs(dx) / (cur.R0 * 0.6), 0, 1), 0.2); // 기어가는 중이면 꿈틀
  ['groundY', 'R0', 'tailF', 'tailG', 'headF', 'headG', 'wobble', 'crawl', 'shellSquare', 'dim'].forEach((key) => {
    cur[key] = lerp(cur[key], tp[key], k);
  });
  cur.cx = lerp(cur.cx, tp.cx, crawlStage ? 0.12 : k);
  cur.press = lerp(cur.press, tp.press, 0.25);
  cur.helix = lerp(cur.helix || 0, tp.helix, 0.05);
  cur.twist = lerp(cur.twist || 0, tp.twist, 0.2); // 소리가 높아지는 동안 바짝 따라옴
  cur.pressAngle = tp.pressAngle;
  // 자리가 바뀌면 옮겨 가지 않고 새 자리에서 튀어나옴
  if (tp.shellKey !== cur.shellKey) {
    cur.shellKey = tp.shellKey;
    if (tp.shellKey) { cur.shellOn = 0; cur.shellV = 0; cur.shellX = tp.shellX; }
  }
  cur.shellV = ((cur.shellV || 0) + (tp.shellOn - cur.shellOn) * SHELL_POP.spring) * SHELL_POP.damp;
  cur.shellOn = Math.max(0, cur.shellOn + cur.shellV);
  cur.shellX = lerp(cur.shellX, tp.shellX, 0.12);
}

// 보내기: 오른쪽 화면 밖으로 기어 나가는 거리
function sendOffset() {
  const p = sendProgress();
  if (p < 0) return 0;
  const e = p * p * (3 - 2 * p);
  return e * (width - cur.cx + cur.R0 * 4);
}

// 결과 화면에서 달팽이가 소리에 귀 기울이는 정도 (0~1): 곡을 바꾼 직후 더 크게 반응하고, 평소에도 음량에 맞춰 리듬을 탐
function resultListenState() {
  if (window.GlobalState.currentStage !== 'MUSIC' || sendProgress() >= 0) return { boost: 0, level: 0, dir: 0 };
  const ampNode = window.GlobalState.audioNodes.amplitude;
  const level = ampNode ? constrain(ampNode.getLevel() * 4.5, 0, 1) : 0;
  const elapsed = millis() - (tourState().listenAt || -1e9);
  const boost = elapsed >= 0 && elapsed < LISTEN_ANIM_MS ? Math.sin((elapsed / LISTEN_ANIM_MS) * Math.PI) : 0;
  const dir = (tourState().index || 0) - (TOUR_PLACES.length - 1) / 2; // 왼쪽 곡(-1) · 가운데(0) · 오른쪽(+1)
  return { boost, level, dir };
}

/**
 * 달팽이 외곽선: 원을 일렁이게 한 뒤 꼬리·머리 방향으로 가우스 모양 혹을 밀어 냄.
 * 꼬리·머리가 생길수록 몸은 낮고 길쭉해지고, 아랫면은 바닥에 눌려 평평해짐. 킥에 눌리고, 기어갈 때 늘었다 줄었다 함.
 * 결과 화면에서는 선택된 곡을 들어보며 머리를 까딱임.
 */
function bodyShape() {
  const time = millis() / 1000;
  const R0 = cur.R0;
  const F = (cur.tailF + cur.headF) / 2;
  const sending = sendProgress() >= 0;
  const listen = resultListenState();
  const crawl = (sending ? 1.6 : Math.max(cur.crawl, 1.4 * cur.move)) * Math.sin(time * (sending ? 7 : cur.move > 0.1 ? 6 : 2.4));
  const face = cur.face === undefined ? 1 : cur.face;
  const hs = (1 + 0.16 * F) * (1 + 0.06 * pulse.kick) * (1 + 0.05 * crawl) * (1 + 0.03 * listen.boost * Math.sin(time * 5.2));
  const vs = (1 - 0.22 * F) * (1 - 0.1 * pulse.kick) * (1 - 0.04 * crawl) * (1 - 0.03 * listen.boost * Math.sin(time * 5.2));
  const flatY = R0 * 0.72 * vs;
  const cx = cur.cx + sendOffset() + listen.dir * R0 * 0.12 * listen.boost;
  const cy = cur.groundY - flatY;

  const tailSigma = 0.32 + 0.2 * cur.tailG;
  const tailLen = cur.tailF * R0 * (1.0 + 0.45 * cur.tailG);
  const headSigma = 0.4 + 0.14 * cur.headG;
  const headLen = cur.headF * R0 * (0.75 + 0.35 * cur.headG);
  // 결과 화면에서 소리를 들어보는 고개 까딱임
  const headNod = (listen.level * 0.08 + listen.boost * 0.14) * Math.sin(time * 4.4);
  const headAngle = HEAD_ANGLE - headNod;

  const pointAt = (th) => {
    const wob = cur.wobble * (0.045 * Math.sin(3 * th + 1.1 * time) + 0.03 * Math.sin(5 * th - 1.7 * time + 1) +
      0.02 * Math.sin(2 * th + 0.6 * time));
    const r = R0 * (1 + wob);
    let x = r * Math.cos(th) * hs;
    let y = r * Math.sin(th) * vs;

    // 꼬리: 끝이 가늘어지는 가우스 혹을 왼쪽 바닥으로
    const wt = Math.exp(-sq(angDiff(th, TAIL_ANGLE) / tailSigma));
    x -= tailLen * wt;
    y += 0.25 * tailLen * wt;
    // 머리: 끝이 둥근 혹(4제곱 창)을 오른쪽 위로 (결과 화면에서는 리듬에 맞춰 고개를 까딱임)
    const wh = Math.exp(-sq(sq(angDiff(th, headAngle) / headSigma)));
    x += headLen * wh * 0.9;
    y -= headLen * wh * (0.45 + 0.18 * Math.abs(headNod));

    // 손가락으로 누른 자국
    const dent = R0 * 0.2 * cur.press * Math.exp(-sq(angDiff(th, cur.pressAngle) / 0.45));
    const len = Math.hypot(x, y) || 1;
    x -= x / len * dent;
    y -= y / len * dent;

    if (y > flatY) y = flatY + (y - flatY) * 0.2;
    return { x: cx + face * x, y: cy + y }; // 왼쪽을 보면 좌우로 뒤집음
  };

  const pts = [];
  for (let i = 0; i < OUTLINE_POINTS; i++) pts.push(pointAt((i / OUTLINE_POINTS) * TWO_PI));
  return { pts, cx, cy, R0, face, headTip: pointAt(headAngle), pressPt: pointAt(cur.pressAngle) };
}

// 등 위(또는 바닥)의 높이: x 근처 외곽선 중 가장 위. 몸을 벗어나면 바닥
function topYAt(shape, x) {
  const band = shape.R0 * 0.2;
  let best = cur.groundY;
  shape.pts.forEach((p) => { if (Math.abs(p.x - x) < band && p.y < best) best = p.y; });
  return best;
}

/* =====================================================================
 * 달팽이 그리기: 흰 선 + 빨간 잔광
 * ===================================================================== */

/**
 * 선 하나를 오실로스코프처럼: 넓고 옅은 잔광 → 가는 선
 */
function scopeStroke(ctx, tracePts, closed, weight = 1) {
  const draw = () => {
    ctx.beginPath();
    tracePts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (closed) ctx.closePath();
    ctx.stroke();
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = rgba(snailGlow, 0.8);
  ctx.shadowBlur = 12 * weight;
  ctx.strokeStyle = rgba(snailGlow, 0.38 + 0.22 * pulse.kick);
  ctx.lineWidth = (8 + 7 * pulse.kick) * weight;
  draw();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(snailInk, 1);
  ctx.lineWidth = (2.1 + 1.2 * pulse.kick) * weight;
  draw();
  ctx.restore();
}

/**
 * 중앙 치우침(°, + 오른쪽) → 팔레트 색. 아직 모르면 흰색
 */
function centerColor(deg) {
  if (typeof deg !== 'number') return COLORS.ink;
  const u = (constrain(deg, -SNAIL_COLOR_DEG, SNAIL_COLOR_DEG) + SNAIL_COLOR_DEG) / (2 * SNAIL_COLOR_DEG);
  const x = u * (SNAIL_PALETTE.length - 1), i = Math.min(SNAIL_PALETTE.length - 2, Math.floor(x)), f = x - i;
  return [0, 1, 2].map((k) => SNAIL_PALETTE[i][k] + (SNAIL_PALETTE[i + 1][k] - SNAIL_PALETTE[i][k]) * f);
}

/**
 * 이중나선 선: 가운데 길(pts)을 따라 두 가닥이 꼬이고 사이에 가로대. twists = 길 전체의 꼬임 수.
 * 닫힌 길은 이음매에서 두 가닥이 한 점으로 모이게 해 꼬임 수가 정수가 아니어도 끊기지 않음
 */
function helixStroke(ctx, pts, closed, twists, sep, weight = 1) {
  if (cur.helix < 0.01) return scopeStroke(ctx, pts, closed, weight);
  const n = pts.length;
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = s[n - 1] || 1;
  const ph0 = millis() / 1000 * HELIX.spinSpeed;
  const A = [], B = [], rungs = [];
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const nx = ty / tl, ny = -tx / tl;
    const u = s[i] / total;
    const env = closed ? Math.pow(Math.sin(Math.PI * u), 0.35) : Math.min(1, u * 6);
    const th = TWO_PI * twists * u + ph0;
    const o = sep * cur.helix * env * Math.sin(th);
    const p = pts[i];
    A.push({ x: p.x + nx * o, y: p.y + ny * o });
    B.push({ x: p.x - nx * o, y: p.y - ny * o });
    if (i % HELIX.rungEvery === 0) rungs.push(i);
  }
  scopeStroke(ctx, A, false, weight);
  scopeStroke(ctx, B, false, weight * 0.75);
  ctx.save();
  ctx.strokeStyle = rgba(snailInk, 0.55 * cur.helix);
  ctx.lineWidth = 1;
  ctx.beginPath();
  rungs.forEach((i) => { ctx.moveTo(A[i].x, A[i].y); ctx.lineTo(B[i].x, B[i].y); });
  ctx.stroke();
  ctx.restore();
}

function twistCount(range) {
  return lerp(range[0], range[1], cur.twist);
}

function drawSnail() {
  // ⑥ 동안은 돌리는 자리의 색을 실시간으로 (사용자 지시 11/03), 그 밖에는 정해진 색을 천천히 따라감
  const live = part2CenterLiveDeg();
  const target = centerColor(live !== null ? live : window.GlobalState.psychoProfile.centerDeg);
  const glow = target === COLORS.ink ? COLORS.accent : target;
  const follow = live !== null ? 0.2 : 0.04;
  snailInk = snailInk.map((v, k) => lerp(v, target[k], follow));
  snailGlow = snailGlow.map((v, k) => lerp(v, glow[k], follow));
  const shape = bodyShape();
  lastShape = shape;
  const ctx = drawingContext;
  ctx.save();
  ctx.globalAlpha = cur.dim;
  ctx.save();
  if (gs().currentStage === 'RESULT' || gs().currentStage === 'MUSIC') {
    ctx.beginPath();
    ctx.rect(0, cur.groundY - 15, width, gs().currentStage === 'RESULT' ? 70 : 33);
    ctx.clip();
  }
  drawSlime(ctx, shape);
  ctx.restore();
  drawAntennae(ctx, shape);
  drawBody(ctx, shape);
  if (cur.press > 0.02) drawFingertip(ctx, shape);
  if (cur.shellOn > 0.01) drawShell(ctx, shape);
  if (pulse.snare > 0.05) drawSplash(ctx, shape);
  ctx.restore();
}

// 몸: 외곽선을 바깥쪽 법선 방향으로 파형만큼 흔듦. 안은 검정으로 채워 뒤의 선을 가림
function drawBody(ctx, shape) {
  const n = shape.pts.length;
  const amp = shape.R0 * WAVE_GAIN;
  const traced = shape.pts.map((p, i) => {
    const a = shape.pts[(i - 1 + n) % n], b = shape.pts[(i + 1) % n];
    const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const w = waveAt(i / n) * amp;
    return { x: p.x + (ty / tl) * w, y: p.y - (tx / tl) * w };
  });
  ctx.save();
  ctx.fillStyle = rgba(COLORS.bg, 0.88);
  ctx.beginPath();
  shape.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  helixStroke(ctx, traced, true, twistCount(HELIX.bodyTwists), shape.R0 * HELIX.sep);
}

/**
 * 점액: 꼬리 끝에서 바닥을 따라 뒤(왼쪽)로 흘러가며 옅어지는 작은 파티클. ⑧ 결과가 나온 뒤부터
 */
// ⑧ 동안(사용자 지시 11/03): 기어가는 동안 고르려는 뜻대로 점액을 흘림 (바탕음 쪽 = 네모, 배음 쪽 = 동그라미).
// 멈춰 있으면 지금까지 답한 비율로 조금씩. 바닥에 떨어진 채 남아 왔다 갔다 한 자국이 보임
function drawSlime(ctx, shape) {
  const mode = window.GlobalState.psychoProfile.pitchMode;
  const pitch = part2PitchSlime();
  const now = millis();
  slime = slime.filter((p) => now - p.born < p.life);
  let rate = 0, sqP = 0, trail = false;
  if (pitch) {
    const n = pitch.F + pitch.S;
    if (pitch.live && cur.move > 0.05) { rate = SLIME.perSec * (1 + 3 * cur.move); sqP = pitch.live === 'F' ? 1 : 0; trail = true; }
    else if (n) { rate = SLIME.perSec * 0.5; sqP = pitch.F / n; }
  } else if (mode) {
    rate = SLIME.perSec;
    sqP = mode === 'F' ? 1 : mode === 'B' ? 0.5 : 0;
  }
  if (rate > 0) {
    const face = shape.face >= 0 ? 1 : -1;
    let tail = shape.pts[0];
    shape.pts.forEach((p) => { if (face * p.x < face * tail.x) tail = p; });
    slimeAcc += rate * Math.min(deltaTime, 100) / 1000;
    while (slimeAcc >= 1) {
      slimeAcc -= 1;
      slime.push({
        x: tail.x + face * random(-4, 10), y: cur.groundY - random(0, 5),
        vx: -face * (trail ? random(2, 8) : random(...SLIME.speed)), vy: random(-3, 3),
        born: now, life: SLIME.lifeMs * random(0.6, 1) * (trail ? 1.6 : 1), size: random(...SLIME.size) * (trail ? 1.8 : 1),
        sq: Math.random() < sqP
      });
    }
  } else {
    slimeAcc = 0;
  }
  const dt = Math.min(deltaTime, 100) / 1000;
  ctx.save();
  slime.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.995;
    const k = 1 - (now - p.born) / p.life;
    ctx.fillStyle = rgba(snailInk, 0.8 * k);
    const r = p.size * (0.6 + 0.4 * k);
    if (p.sq) ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    else { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TWO_PI); ctx.fill(); }
  });
  ctx.restore();
}

// 더듬이 길이 배율 { L, R }. 우세 쪽은 최대 1.7배, 반대쪽은 최대 0.8배 (Claude가 정함)
function earAntenna() {
  const psy = window.GlobalState.psychoProfile;
  if (!psy.dominantEar || typeof psy.earStrength !== 'number') return { L: 1, R: 1 };
  const k = psy.earStrength / 100;
  const long = 1 + 0.7 * k, short = 1 - 0.2 * k;
  return psy.dominantEar === 'LEFT' ? { L: long, R: short } : { L: short, R: long };
}

// ⑦ 고르는 중의 더듬이 { L, R 길이 배율, wL, wR 꿈틀 크기 }. 달팽이가 가 있는 만큼(roll) 그쪽이 늘어남
function earLiveAntenna() {
  const gs = window.GlobalState;
  const p2 = gs.part2;
  const none = { L: 1, R: 1, wL: 0, wR: 0 };
  if (gs.currentStage !== 'PART2_EAR' || (p2.phase !== 'answer' && p2.phase !== 'wait')) return none;
  const snap = typeof PART2_SNAP !== 'undefined' ? PART2_SNAP : 0.85;
  const r = constrain(p2.roll / snap, -1, 1), a = Math.abs(r);
  const long = 1 + (EAR_LIVE.long - 1) * a, short = 1 - (1 - EAR_LIVE.short) * a, wig = EAR_LIVE.wiggle * a;
  return r < 0 ? { L: long, R: short, wL: wig, wR: 0 } : { L: short, R: long, wL: 0, wR: wig };
}

// 더듬이 두 개: 머리 위에서 보는 쪽 위로 (오른쪽을 보면 오른쪽 위). 머리를 키울수록 길어지고, 하이햇에 까딱임
function drawAntennae(ctx, shape) {
  const R0 = shape.R0;
  const tip = shape.headTip;
  const time = millis() / 1000;
  const len = R0 * (0.6 + 0.25 * cur.headG * cur.headF);
  const flick = pulse.hat * 0.12;
  // ⑦ 우세 귀 → 그쪽 더듬이가 길어짐 (사용자 지시 11/02). 화면 왼쪽 더듬이 = 왼쪽 귀, 오른쪽 더듬이 = 오른쪽 귀. 세기만큼
  // ⑦ 고르는 동안(사용자 지시 11/03): 달팽이가 간 쪽 더듬이가 과장되게 쭉 늘어나 꿈틀대고, 반대쪽은 움츠러듦
  const ear = earAntenna();
  const live = earLiveAntenna();
  cur.antL = lerp(cur.antL || 1, ear.L * live.L, 0.12);
  cur.antR = lerp(cur.antR || 1, ear.R * live.R, 0.12);
  cur.wigL = lerp(cur.wigL || 0, live.wL, 0.12);
  cur.wigR = lerp(cur.wigR || 0, live.wR, 0.12);
  // 왼쪽을 보면 뒤집혀서 뒤쪽 더듬이가 화면 오른쪽에 옴. 화면 왼쪽 더듬이 = 왼쪽 귀
  const face = shape.face === undefined ? 1 : shape.face;
  const back = face >= 0 ? 'L' : 'R', front = face >= 0 ? 'R' : 'L';
  const stalks = [
    { bx: -R0 * 0.24, by: R0 * 0.12, a: -1.25 - flick + Math.sin(time * 1.3) * 0.08, side: back, ph: 0 },
    { bx: -R0 * 0.04, by: R0 * 0.14, a: -0.72 - flick + Math.sin(time * 1.3 + 1.2) * 0.08, side: front, ph: 1.7 }
  ].map((st) => ({ ...st, k: st.side === 'L' ? cur.antL : cur.antR, wig: st.side === 'L' ? cur.wigL : cur.wigR }));
  antennaTips = [];
  let listen = { boost: 0, level: 0, dir: 0 }, replay = false;
  try { listen = resultListenState(); replay = canReplay(); } catch (_) { /* 더듬이 그리기는 계속 */ }
  stalks.forEach((s) => {
    const pts = [];
    for (let k = 0; k <= 20; k++) {
      const q = k / 20;
      const bend = Math.sin(q * Math.PI) * 0.18;
      const dx = Math.cos(s.a - bend) * len * s.k * q, dy = Math.sin(s.a - bend) * len * s.k * q;
      // 꿈틀: 줄기를 따라 물결이 끝으로 흘러감 (줄기에 수직으로)
      const w = s.wig * len * q * Math.sin(q * 2.6 * Math.PI - time * 9 + s.ph);
      const nx = -Math.sin(s.a), ny = Math.cos(s.a);
      pts.push({ x: tip.x + face * (s.bx + dx + nx * w), y: tip.y + s.by + dy + ny * w });
    }
    scopeStroke(ctx, pts, false, 0.9);
    const e = pts[pts.length - 1];
    antennaTips.push(e);
    ctx.save();
    // 다시 들을 수 있을 때: 더듬이 끝에서 빨간 고리가 퍼짐 (라디오 신호처럼)
    if (replay) {
      const ph = (millis() / 1400) % 1;
      ctx.strokeStyle = rgba(COLORS.accent, 0.7 * (1 - ph));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R0 * (0.12 + 0.35 * ph), 0, TWO_PI);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(snailInk, 1);
    ctx.lineWidth = 1.5;
    ctx.fillStyle = rgba(COLORS.bg, 1);
    ctx.beginPath();
    ctx.arc(e.x, e.y, R0 * 0.09, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(COLORS.accent, 1);
    ctx.beginPath();
    ctx.arc(e.x, e.y, R0 * 0.035, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  });

  // 달팽이가 소리를 들어보는 음파 고리 애니메이션 (결과 화면)
  if (window.GlobalState.currentStage === 'MUSIC' && sendProgress() < 0 && antennaTips.length === 2) {
    drawListeningWaves(ctx, antennaTips, R0, listen);
  }
}

// 결과 화면에서 더듬이(라디오 안테나) 주변으로 번지는 음파 아크 — 곡을 고르거나 소리가 울릴 때 달팽이가 들어보는 연출
function drawListeningWaves(ctx, tips, R0, listen) {
  const time = millis() / 1000;
  const strength = constrain(0.35 + 0.45 * listen.level + 0.65 * listen.boost, 0, 1);
  if (strength <= 0.02) return;
  ctx.save();
  ctx.lineCap = 'round';
  tips.forEach((e, idx) => {
    const baseAngle = idx === 0 ? -1.15 : -0.55;
    for (let w = 0; w < 2; w++) {
      const ph = (time * (1.1 + 0.5 * listen.boost) + w * 0.5 + idx * 0.25) % 1;
      const rad = R0 * (0.14 + ph * (0.34 + 0.16 * listen.boost));
      const alpha = (1 - ph) * strength * (listen.boost > 0.1 ? 0.85 : 0.55);
      ctx.strokeStyle = rgba(w === 0 && listen.boost > 0.15 ? COLORS.accent : snailInk, alpha);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, rad, baseAngle - 0.65, baseAngle + 0.65);
      ctx.stroke();
    }
  });
  ctx.restore();
}

// 껍질 가장자리의 반지름 배율. k 0 = 동그라미, 1 = 네모
function shellEdge(th, k) {
  return lerp(1, 0.86 / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th))), k);
}

// 껍질: 파형을 나선으로 만 선. 굴러간 거리만큼 돌아가고, 킥에 살짝 튐. ⑦ 결과에 따라 네모·동그라미 (사용자 지시)
function drawShell(ctx, shape) {
  const R0 = shape.R0;
  const rs = R0 * 0.72 * cur.shellOn;
  if (rs <= 0) {
    shellAt = null;
    prevShellX = null;
    return;
  }
  const x = shape.cx + cur.shellX; // shape.cx는 보내기 중·⑦⑧ 기어간 거리까지 포함
  if (prevShellX !== null) shellRot += (x - prevShellX) / Math.max(rs, 1);
  prevShellX = x;
  const y = topYAt(shape, x) - rs * 0.9 - pulse.kick * R0 * 0.1;
  shellAt = { x, y, r: rs };

  ctx.save();
  ctx.globalAlpha *= Math.min(1, cur.shellOn * 1.6);
  ctx.fillStyle = rgba(COLORS.bg, 1);
  ctx.beginPath();
  for (let a = 0; a < TWO_PI; a += 0.1) {
    const r = rs * 1.02 * shellEdge(a, cur.shellSquare || 0);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();

  const turns = 3 * TWO_PI;
  const spiral = [];
  for (let a = 0; a <= turns; a += 0.07) {
    const u = a / turns;
    const rot = shellRot + part2ShellSpin();
    const rr = (rs * (0.06 + 0.9 * u) + waveAt(u) * rs * 0.35 * u) * shellEdge(a + rot, cur.shellSquare || 0);
    spiral.push({ x: x + Math.cos(a + rot) * rr, y: y + Math.sin(a + rot) * rr });
  }
  helixStroke(ctx, spiral, false, twistCount(HELIX.shellTwists), rs * HELIX.sep * 0.8);
  ctx.restore();
}

// 반죽을 누르는 손끝: 누르는 자리 바로 위의 점선 고리
function drawFingertip(ctx, shape) {
  const R0 = shape.R0;
  const p = shape.pressPt;
  ctx.save();
  ctx.strokeStyle = rgba(COLORS.ink, 0.6 * cur.press);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.arc(p.x, p.y - R0 * 0.32, R0 * 0.3, 0, TWO_PI);
  ctx.stroke();
  ctx.restore();
}

// 스네어 섬광: 몸 위쪽 둘레에서 바깥으로 튀는 짧은 흰 선
function drawSplash(ctx, shape) {
  const R0 = shape.R0;
  const k = pulse.snare;
  ctx.save();
  ctx.strokeStyle = rgba(COLORS.ink, 0.8 * k);
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI + (i / 13) * Math.PI;
    const r0 = R0 * (1.9 + (1 - k) * 0.8);
    const r1 = r0 + R0 * 0.35 * k;
    ctx.beginPath();
    ctx.moveTo(shape.cx + Math.cos(a) * r0, shape.cy + Math.sin(a) * r0 * 0.8);
    ctx.lineTo(shape.cx + Math.cos(a) * r1, shape.cy + Math.sin(a) * r1 * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

// 킥 섬광: 화면 전체에 아주 옅게 (눈에 부담 없는 정도)
function drawFlash() {
  if (pulse.kick < 0.02) return;
  noStroke();
  fill(255, 255, 255, 14 * pulse.kick);
  rect(0, 0, width, height);
}

/* =====================================================================
 * 검사 화면 UI
 * ===================================================================== */

// 바닥선. Part 1은 양 끝에 낮은 소리 / 높은 소리 (꼬리 쪽이 낮은 소리, 머리 쪽이 높은 소리)
function drawGround(L) {
  stroke(...COLORS.line);
  strokeWeight(1);
  line(L.x0, cur.groundY, L.x1, cur.groundY);
  const stage = window.GlobalState.currentStage;
  if (stage.startsWith('PART1_')) {
    label(t('axis.low'), L.x0, cur.groundY + 10, { c: COLORS.mute, valign: TOP });
    label(t('axis.high'), L.x1, cur.groundY + 10, { c: COLORS.mute, align: RIGHT, valign: TOP });
  }
}

function drawHeader(L) {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  const i = stageIndex(stage);
  const copy = stageCopy(stage);
  const titleSize = width < 768 ? 36 : 34;
  const subtitleSize = width < 768 ? 27 : 25;
  const subtitleLineH = width < 768 ? 42 : 38;
  label(`${i < 4 ? 'PART 1' : 'PART 2'}   ${i + 1} / ${N_TESTS}`, L.m, L.m, { family: FONT.mono, size: 18, c: COLORS.accent, valign: TOP });
  const titleY = L.m + 74;
  const titleRows = wrapText(copy.title, width - L.m * 2, titleSize, 700);
  titleRows.forEach((line, k) => label(line, L.m, titleY + k * (titleSize + 8), { size: titleSize, weight: 700, valign: TOP }));
  let subtitleY = titleY + titleRows.length * (titleSize + 8) + 14;
  if (stage === 'PART2_EAR') {
    wrapText(t('ear.pitchHelp'), width - L.m * 2, 22, 500).forEach(line => {
      label(line, L.m, subtitleY, { size: 22, c: COLORS.ink, valign: TOP });
      subtitleY += 30;
    });
    subtitleY += 10;
  }

  // 음성 안내 자막
  wrapText(voiceLine(), width - L.m * 2, subtitleSize, 500).forEach((s, k) => label(s, L.m, subtitleY + k * subtitleLineH, { size: subtitleSize, weight: 500, valign: TOP }));

  // 디버그 값 (프로토타입용)
  const p = gs.userEQProfile;
  const debug = {
    PART1_VOLUME: `vol ${p.masterVolume.toFixed(2)}`,
    PART1_LOW: `low ${fmtDb(p.lowShelf.gain)}dB`,
    PART1_HIGH: `high ${fmtDb(p.highShelf.gain)}dB`,
    PART2_SENSITIVITY: gs.part2.phase // ⑥은 각도를 보여 주면 답이 드러나서 숫자 없음
  }[stage];
  if (debug) label(debug, width - L.m, L.m + 48, { family: FONT.mono, size: 9, c: COLORS.mute, a: 160, align: RIGHT, valign: TOP });
  drawVoiceSlider();
}

/* 음성 안내 크기 슬라이더: 오른쪽 위. 음성을 끄면 없음 (차민휘 전달사항 11/06) */
function voiceSliderBox() {
  const L = calculateUILayout();
  const w = min(VOICE_SLIDER.width, width * 0.36);
  return { x0: width - L.m - w, x1: width - L.m, y: L.m + 24 };
}

function voiceSliderShown() {
  const gs = window.GlobalState;
  return gs.voiceOn && stageIndex(gs.currentStage) >= 0 && gs.currentStage !== 'RESULT' && gs.currentStage !== 'MUSIC';
}

function hitVoiceSlider(px, py) {
  if (!voiceSliderShown()) return false;
  const b = voiceSliderBox();
  return px > b.x0 - VOICE_SLIDER.hit && px < b.x1 + VOICE_SLIDER.hit && Math.abs(py - b.y) < VOICE_SLIDER.hit;
}

function voiceSliderLevelAt(px) {
  const b = voiceSliderBox();
  return (px - b.x0) / (b.x1 - b.x0);
}

function drawVoiceSlider() {
  if (!voiceSliderShown()) return;
  const b = voiceSliderBox();
  const x = lerp(b.x0, b.x1, window.GlobalState.voiceLevel);
  label(t('voice.volume'), b.x0, b.y - 18, { size: 18, weight: 700, valign: BOTTOM });
  const glyph = b.x0 - 22;
  stroke(...COLORS.line);
  strokeWeight(8);
  line(b.x0, b.y, b.x1, b.y);
  stroke(...COLORS.ink);
  line(b.x0, b.y, x, b.y);
  noStroke();
  fill(...COLORS.ink);
  circle(x, b.y, 32);
  fill(...COLORS.bg);
  circle(x, b.y, 8);
  fill(...COLORS.ink);
  // 확성기 표시
  rect(glyph - 7, b.y - 3, 5, 6);
  triangle(glyph - 4, b.y, glyph + 4, b.y - 7, glyph + 4, b.y + 7);
}
/**
 * 조작 안내: 화살표와 아래쪽 안내 문구. Part 1은 누를 곳 위아래 화살표, Part 2는 껍질 옆 좌우 화살표와 바닥의 답 자리,
 * ④는 등 위 세 자리 표시
 */
function drawGuides(L) {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  const R0 = cur.R0;
  const bob = Math.sin(millis() / 360) * 6;
  const arrowA = 130 + Math.sin(millis() / 360) * 90;
  const hints = [];

  if (PART1_ADJUST[stage]) {
    if (!gs.part1.hasMoved && !inputLocked()) {
      const ax = stage === 'PART1_LOW' ? cur.cx - R0 * 1.6 : stage === 'PART1_HIGH' ? cur.cx + R0 * 1.4 : cur.cx;
      const top = cur.groundY - R0 * (stage === 'PART1_VOLUME' ? 1.9 : 1.5);
      label('↑', ax, top - 34 + bob, { family: FONT.mono, size: 64, c: COLORS.accent, a: arrowA, align: CENTER });
      label('↓', ax, top + 34 - bob, { family: FONT.mono, size: 64, c: COLORS.accent, a: arrowA, align: CENTER });
    }
    hints.push(guideText(canConfirmAdjust() ? ADJUST_VOICE[stage].confirm : ADJUST_VOICE[stage].intro));
  } else if (stage === 'PART1_REGISTER') {
    const reg = gs.part1.register;
    // 등 위 세 자리: 점과 A/B/C. 고른 자리는 빨강
    getTouchTargets().spots.forEach((p, i) => {
      const on = reg.selectedCard === i;
      const playing = reg.playingCard === i;
      const y = cur.groundY - R0 * 3.1;
      stroke(...(on || playing ? COLORS.accent : COLORS.line));
      strokeWeight(1);
      drawingContext.setLineDash([2, 5]);
      line(p.x, y + 14, p.x, cur.groundY - R0 * 1.9);
      drawingContext.setLineDash([]);
      label(registerLetters()[i], p.x, y, { family: FONT.mono, size: 32, weight: 700, c: on || playing ? COLORS.accent : COLORS.ink, a: reg.isAutoPlaying && !playing ? 110 : 255, align: CENTER });
    });
    if (reg.isAutoPlaying) hints.push(t('hint.listening'));
    else {
      hints.push(memeText('m4-4'));
    }
  } else if (stage.startsWith('PART2_')) {
    const p2 = gs.part2;
    const sideStage = stage === 'PART2_EAR' || stage === 'PART2_PITCH';
    const progress = getPart2Progress();
    if (progress) label(progress, width - L.m, L.hintY - 130, { family: FONT.mono, size: 20, c: COLORS.mute, align: RIGHT });

    if (sideStage) {
      // 바닥의 답 자리 두 개: 왼쪽 · 오른쪽
      const sel = p2.phase === 'answer' || p2.phase === 'wait' ? rollSide(p2.roll) : null; // 손을 떼 답한 뒤에도 잠깐 고른 자리를 보여 줌
      const key = stage === 'PART2_EAR' ? 'ear' : 'pitch';
      ['L', 'R'].forEach((id) => {
        const x = L.cx + (id === 'L' ? -1 : 1) * crawlTravel(L, cur.R0);
        const on = sel === id;
        noStroke();
        fill(...(on ? COLORS.accent : COLORS.line));
        circle(x, cur.groundY, on ? 9 : 6);
        label(t(`${key}.${id}`), x, cur.groundY + 14, { size: 23, weight: on ? 700 : 400, c: on ? COLORS.ink : COLORS.mute, a: p2.phase === 'answer' ? 255 : 110, align: CENTER, valign: TOP });
      });
    }
    // 좌우 화살표: ⑥ 아직 덜 돌렸을 때 달팽이 양옆 (⑦⑧은 없앰, 사용자 지시)
    const arrows = stage === 'PART2_CENTER' && p2.phase === 'adjusting' && !canConfirmPart2();
    if (arrows) {
      const sx = cur.cx;
      const sy = cur.groundY - R0 * 1.2;
      const dx = R0 * 2.4;
      label('←', sx - dx - bob, sy, { family: FONT.mono, size: 90, c: COLORS.accent, a: arrowA, align: CENTER });
      label('→', sx + dx + bob, sy, { family: FONT.mono, size: 90, c: COLORS.accent, a: arrowA, align: CENTER });
    }
    // ⑤ 톡 했을 때 화면 가장자리가 잠깐 빨갛게
    if (stage === 'PART2_SENSITIVITY' && millis() - (p2.tapAt || -1e9) < 500) {
      const k = 1 - (millis() - p2.tapAt) / 500;
      noFill();
      stroke(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 200 * k);
      strokeWeight(6);
      rect(3, 3, width - 6, height - 6);
    }

    if (stage === 'PART2_SENSITIVITY' && p2.phase === 'adjusting') hints.push(memeText(canConfirmPart2() ? 'm5-4' : 'm5-2'));
    else if (p2.phase === 'pressing') hints.push(voiceText('5-2'));
    else if (p2.phase === 'choice') {
      if (p2.note) hints.push(voiceText('5-8'));
      else {
        if (canConfirmPart2()) hints.push(voiceText('5-4'));
        if (canReplayPart2()) hints.push(voiceText('5-3'));
      }
    }
    else if (p2.phase === 'playing' || p2.phase === 'example') hints.push(t('hint.listening'));
    else if (p2.phase === 'adjusting') hints.push(memeText(canConfirmPart2() ? 'm6-3' : 'm6-2'));
    else if (p2.phase === 'answer') {
      if (stage === 'PART2_EAR') hints.push(memeText('m7-2'));
      else hints.push(memeText('m8-1'), memeText('m8-2'));
    }
  }
  // 말하는 동안은 자막만. 잠긴 동안에는 듣는 중이라는 안내만
  drawHints(L, voiceBusy() || (inputLocked() && hints[0] !== t('hint.listening')) ? [] : hints);
}

// 아래쪽 안내 문구 (첫 줄이 지금 할 일이라 밝게)
function drawHints(L, hints) {
  const hintSz0 = width < 768 ? 25 : 23, hintSz1 = width < 768 ? 23 : 21, hintLH = width < 768 ? 38 : 34;
  const rows = hints.flatMap((h, i) => wrapText(h, width - L.m * 2, i === 0 ? hintSz0 : hintSz1, i === 0 ? 500 : 400).map(text => ({ text, first: i === 0 })));
  rows.forEach((row, i) => label(row.text, width / 2, L.hintY - (rows.length - 1 - i) * hintLH, {
    size: row.first ? hintSz0 : hintSz1, weight: row.first ? 500 : 400, c: row.first ? COLORS.ink : COLORS.mute, align: CENTER
  }));
}

// 꾹 누르는 동안 손끝 둘레에 빨간 고리가 차오름. 다 차면 확정 (main.js의 getHold())
function drawHoldRing() {
  const h = getHold();
  if (!h || h.progress <= 0) return;
  const ctx = drawingContext;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(COLORS.line, 1);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(h.x, h.y, HOLD_RING, 0, TWO_PI);
  ctx.stroke();
  ctx.strokeStyle = rgba(COLORS.accent, 1);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(h.x, h.y, HOLD_RING, -HALF_PI, -HALF_PI + TWO_PI * h.progress);
  ctx.stroke();
  ctx.restore();
}






/* =====================================================================
 * 결과 화면: 청감 코드 + 북서울 산책 + 보내기
 * ===================================================================== */

function gs() {
  return window.GlobalState;
}

function drawMusic(L) {
  const sp = sendProgress();
  if (sp >= 1) {
    // 기어 나간 뒤
    const a = 255 * constrain((millis() - tourState().sendAt - SEND_WALK_MS) / 600, 0, 1);
    label(t('sent.title'), width / 2, height * 0.45, { size: min(32, width * 0.065), weight: 700, a, align: CENTER });
    label(t('sent.sub'), width / 2, height * 0.65, { size: 20, c: COLORS.mute, a, align: CENTER });
    return;
  }
  const fadeOut = sp < 0 ? 1 : 1 - constrain(sp * 3, 0, 1);
  const a = 255 * constrain((millis() - resultAt - RESULT_TEXT_DELAY * 0.5) / 700, 0, 1) * fadeOut;
  drawTextShade(L, a / 255);
  drawMusicText(L, a);
  if (a > 1) {
    // 오른쪽으로 밀기 안내 화살표
    const bob = Math.sin(millis() / 360) * 6;
    label('→', lastShape.cx + cur.R0 * 2.9 + bob, lastShape.cy, { family: FONT.mono, size: 20, c: COLORS.accent, a: a * (0.5 + 0.4 * Math.sin(millis() / 360)), align: CENTER });
    push();
    drawingContext.globalAlpha = a / 255;
    drawHints(L, voiceBusy() ? [voiceLine()] : [t('hint.result1'), t('hint.result2')]);
    pop();
  }

  // 곡 선택 버튼 + EQ 슬라이더
  drawResultControls(L, a);
}

function drawResultControls(L, a) {
  const selected = tourState().index;
  resultTrackBoxes(L).forEach((b, i) => {
    const on = i === selected;
    push(); fill(0, a * 0.85); stroke(...(on ? COLORS.ink : COLORS.line), a); strokeWeight(on ? 3 : 2);
    rect(b.x, b.y, b.w, b.h, 4);
    if (on) { noStroke(); fill(...COLORS.accent, a); rect(b.x, b.y + b.h - 6, b.w, 6); }
    pop();
    label(`${i + 1} · ${t(`place.${b.key}`)}`, b.cx, b.cy, { size: min(23, b.w / 9), weight: on ? 700 : 500, c: on ? COLORS.ink : COLORS.mute, a, align: CENTER });
  });
  const b = resultEqSliderBox(L), mix = gs().part1.eqMix;
  const x = lerp(b.x0, b.x1, mix);
  label(t('result.eqOrig'), b.x0, b.y - 45, { size: 24, weight: 700, a, c: mix < 0.5 ? COLORS.ink : COLORS.mute });
  label(t('result.eqMine'), b.x1, b.y - 45, { size: 24, weight: 700, a, align: RIGHT, c: mix >= 0.5 ? COLORS.ink : COLORS.mute });
  push();
  fill(20, a); stroke(...COLORS.ink, a); strokeWeight(3); rect(b.x0, b.y - 20, b.x1 - b.x0, 40, 2);
  noStroke(); fill(...COLORS.accent, a * 0.7); rect(b.x0 + 3, b.y - 17, max(0, x - b.x0 - 3), 34);
  const handleX = constrain(x - 18, b.x0 - 3, b.x1 - 33);
  fill(...COLORS.ink, a); stroke(0, a); strokeWeight(3); rect(handleX, b.y - 34, 36, 68, 2);
  pop();
}

// 영상 위 글자가 읽히도록 위(이름·코드)와 아래(값·버튼)를 검정 그라데이션으로 가림
function drawTextShade(L, k) {
  const ctx = drawingContext;
  const topH = L.m + 210, botY = L.btn.y - 140;
  let g = ctx.createLinearGradient(0, 0, 0, topH);
  g.addColorStop(0, `rgba(0, 0, 0, ${0.85 * k})`);
  g.addColorStop(0.75, `rgba(0, 0, 0, ${0.7 * k})`);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, topH);
  g = ctx.createLinearGradient(0, botY - 60, 0, height);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(0.25, `rgba(0, 0, 0, ${0.8 * k})`);
  g.addColorStop(1, `rgba(0, 0, 0, ${0.92 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, botY - 60, width, height - botY + 60);
}

function drawMusicText(L, a) {
  label(stageCopy('MUSIC').title, width / 2, L.m + 15, { size: 36, weight: 700, a, align: CENTER, valign: TOP });
  label(getFullEarCode(gs().userEQProfile, gs().psychoProfile), width / 2, L.m + 70, { family: FONT.mono, size: min(32, width * 0.045), a, align: CENTER, valign: TOP });
  const text = currentLang() === 'ko' ? '지금은 북서울의 소리로 미리 들어보세요' : 'Preview the sounds around Buk-Seoul';
  wrapText(voiceBusy() ? voiceLine() : text, width - L.m * 2, 23, 500).forEach((line, i) => label(line, width / 2, L.m + 125 + i * 35, { size: 23, a, align: CENTER, valign: TOP }));
}

function drawAnalysis(L) {
  const state = gs();
  const data = getSnailAnalysis(state.userEQProfile, state.psychoProfile, state.userName);
  const titleSize = height < 850 ? 32 : 38;
  const titleLines = wrapText(data.title, width - L.m * 2, titleSize, 700);
  titleLines.forEach((line, i) => label(line, width / 2, L.m + i * (titleSize + 12), { size: titleSize, weight: 700, align: CENTER, valign: TOP }));
  const code = getFullEarCode(state.userEQProfile, state.psychoProfile);
  const codeSize = min(42, (width - L.m * 2) / (code.length * 0.63));
  label(code, width / 2, L.m + titleLines.length * (titleSize + 12) + 15, { family: FONT.mono, size: codeSize, c: COLORS.accent, align: CENTER, valign: TOP });
  const size = height < 850 ? 20 : 24;
  let y = height * (height > width ? 0.57 : 0.52);
  data.paragraphs.forEach(paragraph => {
    const rows = wrapText(paragraph, min(width - L.m * 2, 960), size, 500);
    rows.forEach(line => { label(line, width / 2, y, { size, weight: 500, align: CENTER, valign: TOP }); y += size * 1.55; });
    y += 16;
  });
  const hint = currentLang() === 'ko' ? '달팽이를 꾹 눌러 음악 들어보기 →' : 'Press and hold the snail to listen →';
  drawHints(L, [voiceBusy() ? voiceLine() : hint]);
}
