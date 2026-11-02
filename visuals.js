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
 *   Part 2  → 껍질을 좌우로 굴려 답함 (등을 벗어나면 바닥으로 굴러 내려감)
 * - 결과: 다 빚은 달팽이가 북서울 주변을 걷는다 (뒤에 그 장소 영상을 고대비 흑백으로). 보내면 오른쪽으로 기어 나감
 * 조절 중에는 dB 값이나 눈금 숫자를 크게 보여주지 않는다. 값은 우상단에 작은 디버그 숫자로만 표시.
 * 섬광은 눈에 부담이 없도록 아주 옅게만 쓴다 (깜빡이는 스트로브 아님).
 * 버튼이 없다. 확정은 달팽이를 꾹 누르기, 다시 듣기는 더듬이 톡, 음역은 등 위 자리를 톡,
 * 결과에서는 누르고 있는 동안 원래 소리, 달팽이를 오른쪽으로 밀면 청감타워로 (입력은 main.js)
 * 문구는 모두 copy.js의 t()로 가져온다 (한국어 / English).
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
const HELIX = { bodyTwists: [3, 22], shellTwists: [4, 30], sep: 0.075, rungEvery: 3, spinSpeed: 1.4 };

const FONT = {
  sans: "'Noto Sans KR', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace"
};

const SIZE_MIN = 0.72;      // ① 가장 작게 골랐을 때 덩어리 크기 배율
const SIZE_MAX = 1.28;      // ① 가장 크게 골랐을 때
const NAME_FADE_MS = 1900;  // 이름을 넣고 첫 검사로 넘어가기까지
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
    drawSnail(L);
    return;
  }

  if (stage === 'RESULT') {
    drawSnail(L);
    drawResult(L);
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
  if (stage === 'RESULT') resultAt = millis();
  if (stage === 'INIT' && lastStage !== null) showIntro();
  lastStage = stage;
}

/* =====================================================================
 * 첫 화면: 모든 귀는 [ ] 이다 + 언어 고르기
 * ===================================================================== */

/**
 * 이름 입력칸을 캔버스 위에 띄움 (main.js의 setup()에서 호출). onSubmit(name)은 이름이 있을 때만 불림
 */
function setupIntro(onSubmit) {
  const wrap = document.createElement('div');
  wrap.className = 'intro';
  wrap.innerHTML =
    '<div class="langs"><button type="button" data-lang="ko">한국어</button><button type="button" data-lang="en">English</button></div>' +
    '<form class="title" autocomplete="off">' +
    '<span class="before"></span><span class="br">[</span>' +
    '<input class="name" name="name" maxlength="12" enterkeyhint="done" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">' +
    '<span class="br">]</span><span class="after"></span>' +
    '</form>' +
    '<div class="hint"></div>';
  document.body.appendChild(wrap);

  intro = {
    wrap,
    form: wrap.querySelector('form'),
    input: wrap.querySelector('input'),
    hint: wrap.querySelector('.hint'),
    before: wrap.querySelector('.before'),
    after: wrap.querySelector('.after'),
    langs: [...wrap.querySelectorAll('.langs button')]
  };
  intro.langs.forEach((b) => b.addEventListener('click', () => {
    window.GlobalState.lang = b.dataset.lang;
    refreshIntroText();
    focusIntroInput();
  }));
  intro.input.addEventListener('input', fitIntroInput);
  // form 제출은 한글 입력이 확정된 뒤에 오므로 Enter(키보드의 '완료')를 따로 처리하지 않아도 됨
  intro.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = intro.input.value.trim();
    if (!name) {
      intro.form.classList.remove('shake');
      void intro.form.offsetWidth;
      intro.form.classList.add('shake');
      return;
    }
    intro.input.value = name;
    fitIntroInput();
    intro.input.readOnly = true;
    intro.input.blur();
    intro.input.classList.add('done');
    intro.hint.style.opacity = 0;
    intro.wrap.classList.add('started');
    onSubmit(name);
    setTimeout(() => intro.wrap.classList.add('out'), 900);
    setTimeout(() => intro.wrap.classList.add('gone'), NAME_FADE_MS);
  });
  refreshIntroText();
  setTimeout(focusIntroInput, 400);
}

function refreshIntroText() {
  intro.before.textContent = t('intro.before');
  intro.after.textContent = t('intro.after');
  intro.input.placeholder = t('intro.placeholder');
  intro.hint.textContent = t('intro.hint');
  document.documentElement.lang = currentLang();
  intro.langs.forEach((b) => b.classList.toggle('on', b.dataset.lang === currentLang()));
  fitIntroInput();
}

function showIntro() {
  intro.wrap.classList.remove('gone', 'out', 'started');
  intro.input.classList.remove('done');
  intro.input.readOnly = false;
  intro.input.value = '';
  intro.hint.style.opacity = 1;
  refreshIntroText();
  setTimeout(focusIntroInput, 300);
}

function focusIntroInput() {
  if (window.GlobalState.currentStage === 'INIT') intro.input.focus();
}

// 첫 화면에서 직접 누를 수 있는 것 (입력칸, 언어 버튼). main.js가 이 위의 터치는 그대로 둠
function isIntroControl(el) {
  return !!el && (el === intro.input || intro.langs.includes(el));
}

function fitIntroInput() {
  const n = [...intro.input.value].length || [...intro.input.placeholder].length;
  intro.input.style.width = Math.max(2.4, n * 1.02 + 0.5) + 'em';
}

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
  let stageTop = 160;
  let stageBottom = btn.y - 60;
  let groundK = 0.72;
  if (stage === 'RESULT') { stageTop = m + 200; stageBottom = btn.y - 170; groundK = 0.82; }
  const stageH = max(160, stageBottom - stageTop);
  let R0 = min(width * (stage === 'RESULT' ? 0.13 : 0.12), stageH * 0.2);
  let groundY = stageTop + stageH * groundK;
  if (isIntroStage(stage)) { R0 = min(width, height) * 0.075; groundY = height * 0.86; }

  // btn: 예전 버튼 자리. 지금은 아래쪽 안내 문구 자리로만 씀
  return { m, btn, hintY: btn.y + btnH / 2, cx: width / 2, groundY, R0, track: max(R0 * 1.4, width * 0.28), x0: m + 8, x1: width - m - 8 };
}
/* ---------- 터치 판정 (main.js가 씀) ---------- */

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

// ④ 등 위 세 자리 중 어디를 눌렀는지 (0 저음역 / 1 중음역 / 2 고음역). 달팽이 근처 높이만
function registerSpotAt(px, py) {
  if (!lastShape || py < cur.groundY - cur.R0 * 4 || py > cur.groundY + 40) return -1;
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
    spots: REGISTERS.map((r) => ({ x: lastShape.cx + SHELL_SPOT[r.id] * cur.R0, y: lastShape.cy - cur.R0 * 0.6 }))
  };
}

// 지금 더듬이를 누르면 다시 들려줄 수 있는지
function canReplay() {
  const stage = window.GlobalState.currentStage;
  if (stage === 'PART1_REGISTER') return !window.GlobalState.part1.register.isAutoPlaying;
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
 * 껍질: 보이는 정도, 자리(px, 가운데 기준), 들어 올린 높이
 */
function shellTarget(L, R0) {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  const chosen = gs.userEQProfile.registerPeak.register;
  const spot = (id) => SHELL_SPOT[id] * R0;

  if (stage === 'PART1_REGISTER') {
    const reg = gs.part1.register;
    const card = reg.playingCard >= 0 ? reg.playingCard : reg.selectedCard;
    if (card < 0) return { on: 0, x: 0, lift: 1 };
    // 울리는 동안은 그 자리 위에 떠 있고, 고른 뒤에는 내려앉음
    const settled = reg.playingCard < 0 && reg.selectedCard === card;
    return { on: settled ? 1 : 0.5, x: spot(reg.order[card]), lift: settled ? 0 : 1 };
  }
  if (stage === 'PART2_EAR' || stage === 'PART2_PITCH') return { on: 1, x: gs.part2.roll * L.track, lift: 0 };
  if (stage.startsWith('PART2_')) return { on: 1, x: chosen ? spot(chosen) : 0, lift: 0 }; // ⑤⑥: 제자리 (⑥은 돌기만 함)
  if (stage === 'RESULT' && chosen) return { on: 1, x: spot(chosen), lift: 0 };
  return { on: 0, x: 0, lift: 1 };
}

function targetParams(L) {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  const v = viewValues();
  const at = stageIndex(stage);
  const cfg = PART1_ADJUST.PART1_VOLUME;
  const size = map(v.volDb === null ? -20 : v.volDb, cfg.min, cfg.max, SIZE_MIN, SIZE_MAX, true);
  const R0 = L.R0 * size;
  const sh = shellTarget(L, R0);
  const tw = isIntroStage(stage) ? null : part2Twist();
  const pressing = millis() - gs.part1.lastDragAt < 180 && (stage === 'PART1_LOW' || stage === 'PART1_HIGH');
  return {
    cx: L.cx, groundY: L.groundY, R0,
    tailF: v.low === null ? 0 : 1,
    tailG: v.low === null ? 0 : v.low / 10,
    headF: v.high === null ? 0 : 1,
    headG: v.high === null ? 0 : v.high / 10,
    wobble: at < FLOW_STAGES.indexOf('PART1_LOW') ? 1 : 0.3, // 빚기 전에는 말랑하게 일렁임
    crawl: stage === 'RESULT' ? 1 : 0,                       // 결과 화면: 제자리에서 천천히 기어감
    press: pressing ? 1 : 0,
    pressAngle: stage === 'PART1_HIGH' ? HEAD_ANGLE : TAIL_ANGLE,
    shellOn: sh.on, shellX: sh.x, shellLift: sh.lift,
    helix: tw === null ? 0 : 1, twist: tw === null ? 0 : tw,
    dim: stage === 'RESULT' && gs.part1.isBypassed ? 0.45 : 1
  };
}

function smoothAll(L) {
  const tp = targetParams(L);
  const k = 0.1;
  ['cx', 'groundY', 'R0', 'tailF', 'tailG', 'headF', 'headG', 'wobble', 'crawl', 'shellOn', 'shellLift', 'dim'].forEach((key) => {
    cur[key] = lerp(cur[key], tp[key], k);
  });
  cur.press = lerp(cur.press, tp.press, 0.25);
  cur.helix = lerp(cur.helix || 0, tp.helix, 0.05);
  cur.twist = lerp(cur.twist || 0, tp.twist, 0.2); // 소리가 높아지는 동안 바짝 따라옴
  cur.pressAngle = tp.pressAngle;
  // 굴리는 동안은 손을 바짝 따라옴
  cur.shellX = lerp(cur.shellX, tp.shellX, window.GlobalState.currentStage.startsWith('PART2_') ? 0.3 : 0.12);
}

// 보내기: 오른쪽 화면 밖으로 기어 나가는 거리
function sendOffset() {
  const p = sendProgress();
  if (p < 0) return 0;
  const e = p * p * (3 - 2 * p);
  return e * (width * 0.5 + cur.R0 * 4);
}

/**
 * 달팽이 외곽선: 원을 일렁이게 한 뒤 꼬리·머리 방향으로 가우스 모양 혹을 밀어 냄.
 * 꼬리·머리가 생길수록 몸은 낮고 길쭉해지고, 아랫면은 바닥에 눌려 평평해짐. 킥에 눌리고, 기어갈 때 늘었다 줄었다 함
 */
function bodyShape() {
  const time = millis() / 1000;
  const R0 = cur.R0;
  const F = (cur.tailF + cur.headF) / 2;
  const sending = sendProgress() >= 0;
  const crawl = (sending ? 1.6 : cur.crawl) * Math.sin(time * (sending ? 7 : 1.8));
  const hs = (1 + 0.16 * F) * (1 + 0.06 * pulse.kick) * (1 + 0.06 * crawl);
  const vs = (1 - 0.22 * F) * (1 - 0.1 * pulse.kick) * (1 - 0.05 * crawl);
  const flatY = R0 * 0.72 * vs;
  const cx = cur.cx + sendOffset();
  const cy = cur.groundY - flatY;

  const tailSigma = 0.32 + 0.2 * cur.tailG;
  const tailLen = cur.tailF * R0 * (1.0 + 0.45 * cur.tailG);
  const headSigma = 0.4 + 0.14 * cur.headG;
  const headLen = cur.headF * R0 * (0.75 + 0.35 * cur.headG);

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
    // 머리: 끝이 둥근 혹(4제곱 창)을 오른쪽 위로
    const wh = Math.exp(-sq(sq(angDiff(th, HEAD_ANGLE) / headSigma)));
    x += headLen * wh * 0.9;
    y -= headLen * wh * 0.45;

    // 손가락으로 누른 자국
    const dent = R0 * 0.2 * cur.press * Math.exp(-sq(angDiff(th, cur.pressAngle) / 0.45));
    const len = Math.hypot(x, y) || 1;
    x -= x / len * dent;
    y -= y / len * dent;

    if (y > flatY) y = flatY + (y - flatY) * 0.2;
    return { x: cx + x, y: cy + y };
  };

  const pts = [];
  for (let i = 0; i < OUTLINE_POINTS; i++) pts.push(pointAt((i / OUTLINE_POINTS) * TWO_PI));
  return { pts, cx, cy, R0, headTip: pointAt(HEAD_ANGLE), pressPt: pointAt(cur.pressAngle) };
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
 * 선 하나를 오실로스코프처럼: 넓고 옅은 빨간 잔광 → 가는 흰 선
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
  ctx.strokeStyle = rgba(COLORS.accent, 0.22 + 0.3 * pulse.kick);
  ctx.lineWidth = (5 + 7 * pulse.kick) * weight;
  draw();
  ctx.strokeStyle = rgba(snailInk, 1);
  ctx.lineWidth = (1.5 + 1.2 * pulse.kick) * weight;
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
  const target = centerColor(window.GlobalState.psychoProfile.centerDeg);
  snailInk = snailInk.map((v, k) => lerp(v, target[k], 0.04));
  const shape = bodyShape();
  lastShape = shape;
  const ctx = drawingContext;
  ctx.save();
  ctx.globalAlpha = cur.dim;
  drawSlime(ctx, shape);
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
function drawSlime(ctx, shape) {
  const mode = window.GlobalState.psychoProfile.pitchMode;
  const now = millis();
  slime = slime.filter((p) => now - p.born < p.life);
  if (mode) {
    let tail = shape.pts[0];
    shape.pts.forEach((p) => { if (p.x < tail.x) tail = p; });
    slimeAcc += SLIME.perSec * Math.min(deltaTime, 100) / 1000;
    while (slimeAcc >= 1) {
      slimeAcc -= 1;
      slime.push({
        x: tail.x + random(-4, 10), y: cur.groundY - random(0, 5),
        vx: -random(...SLIME.speed), vy: random(-3, 3),
        born: now, life: SLIME.lifeMs * random(0.6, 1), size: random(...SLIME.size),
        sq: mode === 'F' || (mode === 'B' && Math.random() < 0.5)
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

// 더듬이 두 개: 늘 머리(오른쪽) 위에서 오른쪽 위로. 머리를 키울수록 길어지고, 하이햇에 까딱임
function drawAntennae(ctx, shape) {
  const R0 = shape.R0;
  const tip = shape.headTip;
  const time = millis() / 1000;
  const len = R0 * (0.6 + 0.25 * cur.headG * cur.headF);
  const flick = pulse.hat * 0.12;
  // ⑦ 우세 귀 → 그쪽 더듬이가 길어짐 (사용자 지시 11/02). 화면 왼쪽 더듬이 = 왼쪽 귀, 오른쪽 더듬이 = 오른쪽 귀. 세기만큼
  const ear = earAntenna();
  cur.antL = lerp(cur.antL || 1, ear.L, 0.06);
  cur.antR = lerp(cur.antR || 1, ear.R, 0.06);
  const stalks = [
    { bx: tip.x - R0 * 0.24, by: tip.y + R0 * 0.12, a: -1.25 - flick + Math.sin(time * 1.3) * 0.08, k: cur.antL },
    { bx: tip.x - R0 * 0.04, by: tip.y + R0 * 0.14, a: -0.72 - flick + Math.sin(time * 1.3 + 1.2) * 0.08, k: cur.antR }
  ];
  antennaTips = [];
  const replay = canReplay();
  stalks.forEach((s) => {
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const q = k / 12;
      const bend = Math.sin(q * Math.PI) * 0.18;
      pts.push({ x: s.bx + Math.cos(s.a - bend) * len * s.k * q, y: s.by + Math.sin(s.a - bend) * len * s.k * q });
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
}

// 껍질: 파형을 나선으로 만 선. 굴러간 거리만큼 돌아가고, 킥에 살짝 튐
function drawShell(ctx, shape) {
  const R0 = shape.R0;
  const rs = R0 * 0.72;
  const x = shape.cx + cur.shellX; // shape.cx는 보내기 중 기어간 거리까지 포함
  if (prevShellX !== null) shellRot += (x - prevShellX) / rs;
  prevShellX = x;
  const bob = cur.shellLift > 0.02 ? Math.sin(millis() / 300) * R0 * 0.05 : 0;
  const y = topYAt(shape, x) - rs * 0.9 - cur.shellLift * R0 * 1.0 + bob - pulse.kick * R0 * 0.1;
  shellAt = { x, y, r: rs };

  ctx.save();
  ctx.globalAlpha *= cur.shellOn;
  ctx.fillStyle = rgba(COLORS.bg, 1);
  ctx.beginPath();
  ctx.arc(x, y, rs * 1.02, 0, TWO_PI);
  ctx.fill();

  const turns = 3 * TWO_PI;
  const spiral = [];
  for (let a = 0; a <= turns; a += 0.07) {
    const u = a / turns;
    const rr = rs * (0.06 + 0.9 * u) + waveAt(u) * rs * 0.35 * u;
    const rot = shellRot + part2ShellSpin();
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
  label(`${i < 4 ? 'PART 1' : 'PART 2'}   ${i + 1} / ${N_TESTS}`, L.m, L.m, { family: FONT.mono, c: COLORS.accent, valign: TOP });
  label(copy.title, L.m, L.m + 22, { size: 24, weight: 700, valign: TOP });

  const reg = gs.part1.register;
  const lines = stage === 'PART1_REGISTER' && !reg.isAutoPlaying && copy.linesAfter ? copy.linesAfter : copy.lines;
  const wrapped = lines.flatMap((s) => wrapText(s, width - L.m * 2, 15, 400));
  wrapped.forEach((s, k) => label(s, L.m, L.m + 62 + k * 23, { size: 15, c: COLORS.mute, valign: TOP }));

  // 디버그 값 (프로토타입용)
  const p = gs.userEQProfile;
  const debug = {
    PART1_VOLUME: `vol ${p.masterVolume.toFixed(2)}`,
    PART1_LOW: `low ${fmtDb(p.lowShelf.gain)}dB`,
    PART1_HIGH: `high ${fmtDb(p.highShelf.gain)}dB`,
    PART2_SENSITIVITY: gs.part2.phase // ⑥은 각도를 보여 주면 답이 드러나서 숫자 없음
  }[stage];
  if (debug) label(debug, width - L.m, L.m, { family: FONT.mono, size: 9, c: COLORS.mute, a: 160, align: RIGHT, valign: TOP });
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
    if (!gs.part1.hasMoved) {
      const ax = stage === 'PART1_LOW' ? cur.cx - R0 * 1.6 : stage === 'PART1_HIGH' ? cur.cx + R0 * 1.4 : cur.cx;
      const top = cur.groundY - R0 * (stage === 'PART1_VOLUME' ? 1.9 : 1.5);
      label('↑', ax, top - 14 + bob, { family: FONT.mono, size: 18, c: COLORS.accent, a: arrowA, align: CENTER });
      label('↓', ax, top + 12 - bob, { family: FONT.mono, size: 18, c: COLORS.accent, a: arrowA, align: CENTER });
    }
    hints.push(t(gs.part1.hasMoved ? 'hint.hold' : 'hint.swipe'));
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
      label(REGISTER_LETTERS[i], p.x, y, { family: FONT.mono, size: 18, weight: 500, c: on || playing ? COLORS.accent : COLORS.ink, a: reg.isAutoPlaying && !playing ? 110 : 255, align: CENTER });
    });
    if (reg.isAutoPlaying) hints.push(t('hint.listening'));
    else {
      hints.push(t(reg.selectedCard >= 0 ? 'hint.hold' : 'hint.spot'));
      hints.push(t('hint.antenna'));
    }
  } else if (stage.startsWith('PART2_')) {
    const p2 = gs.part2;
    const sideStage = stage === 'PART2_EAR' || stage === 'PART2_PITCH';
    const progress = getPart2Progress();
    if (progress) label(progress, width - L.m, L.hintY - 48, { family: FONT.mono, c: COLORS.mute, align: RIGHT });

    if (sideStage) {
      // 바닥의 답 자리 두 개: 왼쪽 · 오른쪽
      const sel = p2.phase === 'answer' || p2.phase === 'wait' ? rollSide(p2.roll) : null; // 손을 떼 답한 뒤에도 잠깐 고른 자리를 보여 줌
      const key = stage === 'PART2_EAR' ? 'ear' : 'pitch';
      ['L', 'R'].forEach((id) => {
        const x = cur.cx + (id === 'L' ? -PART2_SNAP : PART2_SNAP) * L.track;
        const on = sel === id;
        noStroke();
        fill(...(on ? COLORS.accent : COLORS.line));
        circle(x, cur.groundY, on ? 9 : 6);
        label(t(`${key}.${id}`), x, cur.groundY + 14, { size: 13, weight: on ? 700 : 400, c: on ? COLORS.ink : COLORS.mute, a: p2.phase === 'answer' ? 255 : 110, align: CENTER, valign: TOP });
      });
    }
    // 좌우 화살표: ⑦⑧ 아직 덜 굴렸을 때 껍질 옆, ⑥ 아직 덜 돌렸을 때 달팽이 양옆
    const arrows = (sideStage && p2.phase === 'answer' && p2.moved < PART2_MOVE_THRESHOLD) ||
      (stage === 'PART2_CENTER' && p2.phase === 'adjusting' && !canConfirmPart2());
    if (arrows) {
      const sx = cur.cx + cur.shellX;
      const sy = topYAt(lastShape, sx) - R0 * 0.62;
      const dx = stage === 'PART2_CENTER' ? R0 * 2.4 : R0 * 1.05;
      label('←', sx - dx - bob, sy, { family: FONT.mono, size: 18, c: COLORS.accent, a: arrowA, align: CENTER });
      label('→', sx + dx + bob, sy, { family: FONT.mono, size: 18, c: COLORS.accent, a: arrowA, align: CENTER });
    }
    // ⑤ 톡 했을 때 화면 가장자리가 잠깐 빨갛게
    if (stage === 'PART2_SENSITIVITY' && millis() - (p2.tapAt || -1e9) < 500) {
      const k = 1 - (millis() - p2.tapAt) / 500;
      noFill();
      stroke(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2], 200 * k);
      strokeWeight(6);
      rect(3, 3, width - 6, height - 6);
    }

    if (p2.note) hints.push(t(p2.note));
    else if (p2.phase === 'lead' || p2.phase === 'loading') hints.push(t('hint.ready'));
    else if (p2.phase === 'pressing') hints.push(t('hint.tapGone'));
    else if (p2.phase === 'playing') hints.push(t('hint.listening'));
    else if (p2.phase === 'adjusting') hints.push(t(canConfirmPart2() ? 'hint.holdCenter' : 'hint.turn'));
    else if (p2.phase === 'answer') {
      hints.push(t('hint.roll'));
      if (canReplayPart2()) hints.push(t('hint.antennaOnce'));
    }
  }
  drawHints(L, hints);
}

// 아래쪽 안내 문구 (첫 줄이 지금 할 일이라 밝게)
function drawHints(L, hints) {
  hints.forEach((h, i) => label(h, width / 2, L.hintY - (hints.length - 1 - i) * 22, {
    size: i === 0 ? 15 : 13, weight: i === 0 ? 500 : 400, c: i === 0 ? COLORS.ink : COLORS.mute, align: CENTER
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

function drawResult(L) {
  const sp = sendProgress();
  if (sp >= 1) {
    // 기어 나간 뒤
    const a = 255 * constrain((millis() - tourState().sendAt - SEND_WALK_MS) / 600, 0, 1);
    label(t('sent.title'), width / 2, height * 0.45, { size: min(32, width * 0.065), weight: 700, a, align: CENTER });
    label(t('sent.sub'), width / 2, height * 0.45 + 44, { size: 14, c: COLORS.mute, a, align: CENTER });
    return;
  }
  const fadeOut = sp < 0 ? 1 : 1 - constrain(sp * 3, 0, 1);
  const a = 255 * constrain((millis() - resultAt - RESULT_TEXT_DELAY * 0.5) / 700, 0, 1) * fadeOut;
  drawTextShade(L, a / 255);
  drawResultText(L, a);
  if (a > 1) {
    // 오른쪽으로 밀기 안내 화살표
    const bob = Math.sin(millis() / 360) * 6;
    label('→', lastShape.cx + cur.R0 * 2.9 + bob, lastShape.cy, { family: FONT.mono, size: 20, c: COLORS.accent, a: a * (0.5 + 0.4 * Math.sin(millis() / 360)), align: CENTER });
    push();
    drawingContext.globalAlpha = a / 255;
    drawHints(L, [t(gs().part1.isBypassed ? 'result.original' : 'hint.result1'), t('hint.result2')]);
    pop();
  }

  // 지금 걷는 곳 + 장소 진행 막대
  const y = cur.groundY + 22;
  label(t('tour.now'), width / 2, y, { family: FONT.mono, size: 11, c: COLORS.accent, a, align: CENTER, valign: TOP });
  label(t(`place.${tourPlace().key}`), width / 2, y + 18, { size: 18, weight: 700, a, align: CENTER, valign: TOP });
  const n = TOUR_PLACES.length;
  const bw = 28, gap = 6, x0 = width / 2 - (n * bw + (n - 1) * gap) / 2;
  const prog = constrain((millis() - tourState().placeAt) / (TOUR_SECONDS * 1000), 0, 1);
  noStroke();
  for (let i = 0; i < n; i++) {
    fill(COLORS.line[0], COLORS.line[1], COLORS.line[2], a);
    rect(x0 + i * (bw + gap), y + 50, bw, 2);
    if (i === tourState().index) {
      fill(COLORS.ink[0], COLORS.ink[1], COLORS.ink[2], a);
      rect(x0 + i * (bw + gap), y + 50, bw * prog, 2);
    }
  }
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

function drawResultText(L, a) {
  const gs = window.GlobalState;
  const p = gs.userEQProfile;
  const psy = gs.psychoProfile;

  // 모든 귀는 [이름] 이다 / Every ear is [name]
  const size = min(26, width * 0.055);
  const parts = [[t('result.before'), COLORS.ink], ['[', COLORS.accent], [gs.userName, COLORS.ink], [']', COLORS.accent], [t('result.after'), COLORS.ink]];
  let x = width / 2 - parts.reduce((s, [str]) => s + textW(str, size, 700), 0) / 2;
  parts.forEach(([str, c]) => {
    label(str, x, L.m + 30, { size, weight: 700, c, a, valign: TOP });
    x += textW(str, size, 700);
  });

  // 청감 코드 + 풀어 쓴 말
  label(getFullEarCode(p, psy), width / 2, L.m + 72, { family: FONT.mono, size: min(38, width * 0.066), weight: 500, c: COLORS.ink, a, align: CENTER, valign: TOP });
  const reg = p.registerPeak.register;
  const lowIdx = EAR_CODE.LOW.letters.indexOf(shelfToLetter(p.lowShelf.gain, 'LOW'));
  const highIdx = EAR_CODE.HIGH.letters.indexOf(shelfToLetter(p.highShelf.gain, 'HIGH'));
  const khz = typeof psy.maxFreqHz === 'number' ? (psy.maxFreqHz / 1000).toFixed(1) : '–';
  const side = { LEFT: 'L', RIGHT: 'R' }[psy.dominantEar];
  const centerWord = psy.centerImage ? t(`center.${psy.centerImage}`) : '—';
  const words = [
    `${t('word.low')} ${t('lowWords')[lowIdx]}  ·  ${t('word.high')} ${t('highWords')[highIdx]}  ·  ${reg ? t(`register.${reg}`) : '—'}`,
    `${centerWord}  ·  ${side ? t(`side.${side}`) : '—'}  ·  ${psy.pitchMode ? t(`pitch.${psy.pitchMode}`) : '—'}  ·  ${t('khz')(khz)}`
  ];
  words.forEach((s, k) => label(s, width / 2, L.m + 124 + k * 19, { size: 12, c: COLORS.mute, a, align: CENTER, valign: TOP }));
  label(t('tour.line'), width / 2, L.m + 172, { size: 14, a, align: CENTER, valign: TOP });

  // 아래: 8개 값 (2열)
  const volDb = 20 * Math.log10(Math.max(p.masterVolume, 1e-4));
  const regIdx = REGISTERS.findIndex((r) => r.id === reg);
  const left = [
    [t('row.volume'), `${volDb.toFixed(1)} dB`],
    [t('row.low'), `${fmtDb(p.lowShelf.gain)} dB`],
    [t('row.high'), `${fmtDb(p.highShelf.gain)} dB`],
    [t('row.register'), regIdx >= 0 ? `${REGISTER_LETTERS[regIdx]} ${t(`register.${reg}`)}` : '—']
  ];
  const right = [
    [t('row.hearing'), `${khz} kHz`],
    [t('row.pan'), typeof psy.centerDeg === 'number' ? `${psy.centerImage} ${psy.centerDeg > 0 ? '+' : ''}${psy.centerDeg}°` : '—'],
    [t('row.ear'), side ? `${side} ${t(`side.${side}`)} ${psy.earStrength}` : '—'],
    [t('row.pitch'), psy.pitchMode ? `${psy.pitchMode} ${t(`pitch.${psy.pitchMode}`)}` : '—']
  ];
  const top = L.btn.y - 126, rowH = 30, colW = (width - L.m * 2 - 16) / 2;
  [left, right].forEach((rows, ci) => {
    const x0 = L.m + ci * (colW + 16);
    rows.forEach(([k, val], i) => {
      const y = top + i * rowH;
      stroke(COLORS.line[0], COLORS.line[1], COLORS.line[2], a);
      strokeWeight(1);
      line(x0, y + rowH - 6, x0 + colW, y + rowH - 6);
      label(k, x0, y + 11, { size: 12, c: COLORS.mute, a });
      label(val, x0 + colW, y + 11, { family: FONT.mono, size: 12, c: COLORS.ink, a, align: RIGHT });
    });
  });
}
