/**
 * 청각 다변기 (Sound Variator) - Visual Renderer & UI
 *
 * [Part 1: 파트별 청취로 만드는 개인 선호 EQ]
 * 어두운 물속에 떠 있는 반투명한 막. 가는 사인 곡선을 겹쳐 빛으로 그린다 (참고: Che-Yu Wu, SoulFish).
 *
 * 모든 단계에서 x축은 음고(20Hz ~ 20kHz 로그 축)로 통일한다. 왼쪽이 낮은 소리, 오른쪽이 높은 소리.
 * - 막의 두께: 그 높이의 소리를 얼마나 키웠는지 (개인 EQ + 볼륨)
 * - 막의 일렁임: 지금 실제로 나는 소리 (FFT)
 * - 가운데 척추: 주파수 눈금
 * 조절 단계에서는 dB 값이나 눈금 숫자를 크게 보여주지 않는다. 값은 우상단에 작은 디버그 숫자로만 표시.
 */

const PALETTE = {
  bg:     [4, 5, 12],       // 깊은 물
  ink:    [234, 236, 246],  // 글자
  mute:   [112, 116, 138],  // 보조 텍스트
  line:   [34, 38, 56],     // 헤어라인
  accent: [255, 96, 176]    // 포인트
};

// x축 = 음고. 낮은 소리(왼쪽, 남보라) → 중간(자홍) → 높은 소리(오른쪽, 청록)
const PITCH_STOPS = [
  [0.0,  [60, 48, 255]],
  [0.45, [214, 62, 210]],
  [1.0,  [92, 228, 255]]
];

const MEMBRANE = { lines: 34, points: 96 };
const F_MIN = 20;
const DECADES = 3; // 20Hz ~ 20kHz

const FONT = {
  sans: "'Noto Sans KR', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace"
};

const STEP_COPY = {
  PART1_VOLUME: {
    title: '편한 볼륨',
    lines: ['위로 쓸면 커지고, 아래로 쓸면 작아져요.', '편하게 들리는 크기를 찾아 주세요.']
  },
  PART1_REGISTER: {
    title: '음역 고르기',
    lines: ['같은 멜로디를 세 가지 높이로 들려드릴게요.'],
    linesAfter: ['어느 높이가 가장 편하게 들렸나요?', '눌러서 다시 들을 수 있어요.']
  },
  PART1_LOW: {
    title: '저음 맞추기',
    lines: ['위로 쓸면 낮은 소리가 많아지고, 아래로 쓸면 줄어요.', '가장 편한 곳을 찾아 주세요.']
  },
  PART1_HIGH: {
    title: '고음 맞추기',
    lines: ['위로 쓸면 높은 소리가 많아지고, 아래로 쓸면 줄어요.', '가장 편한 곳을 찾아 주세요.']
  },
  PART1_RESULT: {
    title: '나의 EQ',
    lines: ['내 EQ와 원래 소리를 번갈아 들어보세요.']
  }
};

// 조절 단계에서 바꾸는 음역의 위치 (Hz). 볼륨은 전체라 표시하지 않음
const ADJUST_FOCUS_HZ = { PART1_LOW: 70, PART1_HIGH: 9000 };

const CARD_LABELS = ['A', 'B', 'C'];

let animTimer = 0;
let dust = null;

// 화면에 보이는 값은 실제 값을 부드럽게 따라감
const view = {
  vol: 0.6,
  low: 0,
  high: 0,
  peakGain: 0,
  peakU: uOfFreq(400),
  energy: new Float32Array(MEMBRANE.points + 1)
};

/**
 * 메인 렌더 함수 (main.js의 draw()에서 호출)
 */
function renderVisuals() {
  animTimer += 0.03;
  background(...PALETTE.bg);
  updateView();

  const level = getLevel();
  drawDust(level);

  const stage = window.GlobalState.currentStage;
  if (stage === 'INIT') {
    renderInitScreen();
    return;
  }

  const layout = calculateUILayout();
  drawHeader(layout);

  if (stage === 'PART1_REGISTER') renderRegisterStep(layout);
  else if (stage === 'PART1_RESULT') renderResultStep(layout);
  else renderAdjustStep(layout);
}

/* ---------- 작은 헬퍼 ---------- */

function col(c, a = 255) {
  return color(c[0], c[1], c[2], a);
}

// p5 textFont는 폰트 스택을 지원하지 않아 캔버스 font를 직접 지정
function label(str, x, y, { family = FONT.sans, size = 12, weight = 400, c = PALETTE.ink, a = 255, align = LEFT, spacing = 0 } = {}) {
  push();
  noStroke();
  fill(col(c, a));
  textAlign(align, CENTER);
  textSize(size);
  drawingContext.font = `${weight} ${size}px ${family}`;
  drawingContext.letterSpacing = `${spacing}px`;
  text(str, x, y);
  drawingContext.letterSpacing = '0px';
  pop();
}

function fmtDb(g, digits = 1) {
  return `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(digits)}`;
}

function fmtHz(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

function uOfFreq(f) {
  return Math.log10(f / F_MIN) / DECADES;
}

function freqOfU(u) {
  return F_MIN * Math.pow(10, u * DECADES);
}

function pitchColor(u) {
  for (let i = 1; i < PITCH_STOPS.length; i++) {
    const [u1, c1] = PITCH_STOPS[i];
    if (u <= u1) {
      const [u0, c0] = PITCH_STOPS[i - 1];
      const t = (u - u0) / (u1 - u0);
      return c0.map((v, j) => v + (c1[j] - v) * t);
    }
  }
  return PITCH_STOPS[PITCH_STOPS.length - 1][1];
}

function rgba(c, a) {
  return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
}

function getLevel() {
  const amp = window.GlobalState.audioNodes.amplitude;
  return amp ? (amp.getLevel() || 0) : 0;
}

function registerOfCard(i) {
  const id = window.GlobalState.part1.register.order[i];
  return REGISTERS.find((r) => r.id === id);
}

function drawButton(z, str, { filled = false, enabled = true } = {}) {
  push();
  const a = enabled ? 255 : 60;
  if (filled) {
    noStroke();
    fill(col(PALETTE.ink, a));
  } else {
    noFill();
    stroke(col(PALETTE.ink, enabled ? 140 : 50));
    strokeWeight(1);
  }
  rect(z.x, z.y, z.w, z.h, z.h / 2);
  pop();
  label(str, z.x + z.w / 2, z.y + z.h / 2, { size: 15, weight: 500, c: filled ? PALETTE.bg : PALETTE.ink, a, align: CENTER, spacing: 1 });
}

/* ---------- 막 (membrane) ---------- */

/**
 * 실제 값 → 화면 값 스무딩 + FFT 에너지 샘플링
 */
function updateView() {
  const gs = window.GlobalState;
  const p = gs.userEQProfile;
  const stage = gs.currentStage;
  const flat = stage === 'INIT' || (stage === 'PART1_RESULT' && gs.part1.isBypassed);

  // ② 음역 고르기에서는 지금 울리는(또는 고른) 음역이 부풀어 오름
  let peakGain = flat ? 0 : p.registerPeak.gain;
  let peakU = uOfFreq(p.registerPeak.freq);
  if (stage === 'PART1_REGISTER') {
    const reg = gs.part1.register;
    const card = reg.playingCard >= 0 ? reg.playingCard : reg.selectedCard;
    peakGain = card < 0 ? 0 : reg.playingCard >= 0 ? 6 : 3;
    if (card >= 0) peakU = uOfFreq(registerOfCard(card).peakHz);
  }

  // 볼륨: -40 ~ 0 dB → 막의 전체 크기 (작게 골라도 EQ 모양은 보이도록 하한을 둠)
  const volDb = 20 * Math.log10(Math.max(p.masterVolume, 1e-4));
  const vol = stage === 'INIT' ? 0.6 : map(constrain(volDb, -40, 0), -40, 0, 0.45, 1.0);

  const k = 0.12;
  view.vol = lerp(view.vol, vol, k);
  view.low = lerp(view.low, flat ? 0 : p.lowShelf.gain, k);
  view.high = lerp(view.high, flat ? 0 : p.highShelf.gain, k);
  view.peakGain = lerp(view.peakGain, peakGain, k);
  view.peakU = lerp(view.peakU, peakU, 0.2);

  const fft = gs.audioNodes.fft;
  if (!fft) return;
  const spectrum = fft.analyze();
  const nyquist = getAudioContext().sampleRate / 2;
  for (let i = 0; i <= MEMBRANE.points; i++) {
    const bin = Math.min(spectrum.length - 1, Math.round(freqOfU(i / MEMBRANE.points) / nyquist * spectrum.length));
    view.energy[i] = lerp(view.energy[i], spectrum[bin] / 255, 0.25);
  }
}

/**
 * 음고 축(x) 위의 반투명 막. m = { x, w, cy, h }
 */
function drawMembrane(m, { alpha = 1 } = {}) {
  const ctx = drawingContext;
  const n = MEMBRANE.points;
  const L = MEMBRANE.lines;
  const t = animTimer;

  const profile = {
    lowShelf: { freq: window.GlobalState.userEQProfile.lowShelf.freq, gain: view.low },
    highShelf: { freq: window.GlobalState.userEQProfile.highShelf.freq, gain: view.high },
    registerPeak: { freq: freqOfU(view.peakU), gain: view.peakGain, q: REGISTER_PEAK_Q }
  };

  // 지점별 몸통 반폭과 일렁임 크기. 양 끝은 가늘게 모여 빛이 맺힌다
  // 쉘프가 바꾸는 양 끝에서도 모양이 충분히 달라지도록 몸통을 통통하게, 이득은 진폭 그대로(10dB → 3.2배) 반영
  const xs = [];
  const half = [];
  const amp = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const lens = Math.pow(Math.sin(Math.PI * u), 0.55);
    const db = getEQResponseDb(freqOfU(u), profile);
    xs.push(m.x + m.w * u);
    half.push(m.h / 2 * lens * view.vol * Math.pow(10, db / 20));
    amp.push((1.5 + view.energy[i] * view.energy[i] * 12) * lens);
  }
  const yAt = (i, kk, j) => {
    const u = i / n;
    const edge = Math.abs(kk);
    return m.cy + kk * half[i] +
      Math.sin(u * 14 + t * 1.6 + kk * 2.4) * amp[i] * (0.4 + edge * 0.6) +
      Math.sin(u * 31 - t * 0.9 + j * 0.7) * amp[i] * 0.25;
  };

  const grad = ctx.createLinearGradient(m.x, 0, m.x + m.w, 0);
  PITCH_STOPS.forEach(([s, c]) => grad.addColorStop(s, rgba(c, 1)));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = grad;
  ctx.fillStyle = grad;

  // 반투명 몸통
  ctx.globalAlpha = 0.08 * alpha;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) ctx.lineTo(xs[i], yAt(i, -1, 0));
  for (let i = n; i >= 0; i--) ctx.lineTo(xs[i], yAt(i, 1, L - 1));
  ctx.fill();

  // 결: 가는 곡선을 겹쳐 그림. 바깥쪽일수록 밝게
  ctx.lineWidth = 1;
  for (let j = 0; j < L; j++) {
    const kk = -1 + 2 * j / (L - 1);
    ctx.globalAlpha = (0.12 + 0.32 * kk * kk) * alpha;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) ctx.lineTo(xs[i], yAt(i, kk, j));
    ctx.stroke();
  }

  // 외곽 발광
  ctx.shadowBlur = 16;
  ctx.shadowColor = rgba(PITCH_STOPS[1][1], 0.9);
  ctx.globalAlpha = 0.55 * alpha;
  ctx.lineWidth = 1.5;
  [[-1, 0], [1, L - 1]].forEach(([kk, j]) => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) ctx.lineTo(xs[i], yAt(i, kk, j));
    ctx.stroke();
  });
  ctx.restore();

  drawSpine(m, alpha);
}

/**
 * 척추 = 주파수 눈금. 10배마다 긴 가시
 */
function drawSpine(m, alpha) {
  const ctx = drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(PALETTE.ink, 0.22 * alpha);
  ctx.beginPath();
  ctx.moveTo(m.x, m.cy);
  ctx.lineTo(m.x + m.w, m.cy);
  ctx.stroke();

  [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach((f) => {
    const x = m.x + m.w * uOfFreq(f);
    const major = String(f)[0] === '1' || f === 20;
    const len = major ? 7 : 3.5;
    ctx.strokeStyle = rgba(PALETTE.ink, (major ? 0.45 : 0.25) * alpha);
    ctx.beginPath();
    // 물고기 갈비뼈처럼 살짝 뒤로 누운 가시
    ctx.moveTo(x - len * 0.4, m.cy - len);
    ctx.lineTo(x, m.cy);
    ctx.lineTo(x - len * 0.4, m.cy + len);
    ctx.stroke();
  });
  ctx.restore();
}

/**
 * 막 아래 음고 축 라벨: 양 끝 '낮은 소리 / 높은 소리' + 100 · 1k · 10k
 */
function drawPitchAxis(m, y, { numbers = true } = {}) {
  label('낮은 소리', m.x, y, { size: 11, c: PALETTE.mute, spacing: 1 });
  label('높은 소리', m.x + m.w, y, { size: 11, c: PALETTE.mute, align: RIGHT, spacing: 1 });
  if (!numbers) return;
  [[100, '100'], [1000, '1k'], [10000, '10k']].forEach(([f, s]) => {
    label(s, m.x + m.w * uOfFreq(f), y, { family: FONT.mono, size: 9, c: PALETTE.mute, a: 170, align: CENTER });
  });
}

/**
 * 떠다니는 먼지. 소리가 클수록 반짝임
 */
function drawDust(level) {
  if (!dust) {
    dust = Array.from({ length: 90 }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.4 + Math.random() * 1.4,
      v: 0.3 + Math.random(),
      p: Math.random() * Math.PI * 2
    }));
  }
  const ctx = drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(PALETTE.ink, 1);
  dust.forEach((d) => {
    d.x -= 0.00012 * d.v;
    d.y += Math.sin(animTimer * 0.5 + d.p) * 0.00006;
    if (d.x < 0) d.x += 1;
    const twinkle = 0.5 + 0.5 * Math.sin(animTimer * 2 * d.v + d.p);
    ctx.globalAlpha = Math.min(0.8, (0.08 + 0.25 * twinkle) * (0.7 + level * 5));
    ctx.beginPath();
    ctx.arc(d.x * width, d.y * height, d.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/**
 * 1. INIT 초기 화면
 */
function renderInitScreen() {
  const cx = width / 2;
  const mw = min(width - 32, 760);

  label('SEOUL MUSEUM OF ART — 2026', cx, height * 0.12, { family: FONT.mono, size: 10, c: PALETTE.mute, align: CENTER, spacing: 2 });

  // 숨쉬는 막
  view.vol = 0.6 * (1 + sin(animTimer * 1.2) * 0.06);
  drawMembrane({ x: cx - mw / 2, w: mw, cy: height * 0.42, h: height * 0.3 });

  label('청각 다변기', cx, height * 0.70, { size: min(width * 0.075, 30), weight: 500, align: CENTER, spacing: 4 });
  label('Sound Variator · Part 1', cx, height * 0.70 + 30, { family: FONT.mono, size: 11, c: PALETTE.mute, align: CENTER, spacing: 1 });

  const blink = 140 + sin(animTimer * 2) * 100;
  label('헤드폰을 쓰고 화면을 눌러 시작', cx, height * 0.88, { size: 12, c: PALETTE.ink, a: blink, align: CENTER, spacing: 2 });
}

/**
 * 반응형 레이아웃 (히트테스트와 공유)
 */
function calculateUILayout() {
  const margin = max(16, width * 0.06);
  const cw = width - margin * 2;
  const btnH = max(52, height * 0.065);
  const bottom = height - max(24, height * 0.04);
  const bodyTop = height * 0.27;
  const bodyBottom = bottom - btnH * 2 - 24;
  const bodyH = bodyBottom - bodyTop;

  return {
    margin,
    cw,
    headerY: max(28, height * 0.045),
    progressY: max(52, height * 0.08),
    copyY: height * 0.15,
    bodyTop,
    bodyBottom,
    btnH,
    // 조절·음역 단계의 막: 몸통 영역 가운데
    membrane: { x: margin, w: cw, cy: bodyTop + bodyH * 0.48, h: bodyH * 0.55 },
    btnPrimary: { x: margin, y: bottom - btnH, w: cw, h: btnH },
    btnSecondary: { x: margin, y: bottom - btnH * 2 - 12, w: cw, h: btnH }
  };
}

/**
 * 상단: 단계 번호 + 제목 + 진행 막대 + 안내 문구
 */
function drawHeader(layout) {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  const step = gs.part1.stepIndex;
  const L = layout.margin;
  const y = layout.headerY;

  label(`0${step + 1}`, L, y, { family: FONT.mono, size: 11, c: PALETTE.accent });
  label(STEP_COPY[stage].title, L + 26, y, { size: 13, weight: 500, spacing: 1 });

  // 진행 막대 5칸
  const n = PART1_STAGES.length;
  const gap = 6;
  const segW = (layout.cw - gap * (n - 1)) / n;
  push();
  noStroke();
  for (let i = 0; i < n; i++) {
    fill(col(i <= step ? PALETTE.ink : PALETTE.line));
    rect(L + i * (segW + gap), layout.progressY, segW, 2);
  }
  pop();

  // 안내 문구
  const copy = STEP_COPY[stage];
  const reg = gs.part1.register;
  const lines = stage === 'PART1_REGISTER' && !reg.isAutoPlaying && copy.linesAfter ? copy.linesAfter : copy.lines;
  const size = min(22, max(16, width * 0.045));
  const wrapped = lines.flatMap((line) => wrapText(line, layout.cw, size, 500));
  wrapped.forEach((line, i) => {
    label(line, L, layout.copyY + i * size * 1.5, { size, weight: 500 });
  });
}

/**
 * 폭에 맞춰 어절 단위로 줄바꿈 (폰 세로 화면에서 문구가 넘치지 않게)
 */
function wrapText(str, maxW, size, weight) {
  drawingContext.font = `${weight} ${size}px ${FONT.sans}`;
  const out = [];
  let line = '';
  str.split(' ').forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && drawingContext.measureText(next).width > maxW) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) out.push(line);
  return out;
}

/**
 * 2. ①③④ 조절 단계: 막 + 바꾸는 음역 표시 + 쓸기 안내
 */
function renderAdjustStep(layout) {
  const gs = window.GlobalState;
  const p1 = gs.part1;
  const m = layout.membrane;
  const focusHz = ADJUST_FOCUS_HZ[gs.currentStage];

  // 바꾸는 음역: 그 자리를 비추는 세로로 긴 옅은 빛
  if (focusHz) {
    const u = uOfFreq(focusHz);
    const r = m.w * 0.08;
    const ctx = drawingContext;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const c = pitchColor(u);
    g.addColorStop(0, rgba(c, 0.4));
    g.addColorStop(1, rgba(c, 0));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(m.x + m.w * u, m.cy);
    ctx.scale(1, m.h / r);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  drawMembrane(m);
  drawPitchAxis(m, m.cy + m.h * 0.5 + 34, { numbers: false });

  // 쓸기 안내: 위아래 화살표가 천천히 오르내림
  if (!p1.hasMoved) {
    const x = focusHz ? m.x + m.w * uOfFreq(focusHz) : m.x + m.w / 2;
    const bob = sin(animTimer * 2.2) * 6;
    const a = 120 + sin(animTimer * 2.2) * 80;
    label('↑', x, m.cy - m.h * 0.5 - 18 + bob, { family: FONT.mono, size: 16, a, align: CENTER });
    label('↓', x, m.cy + m.h * 0.5 + 14 - bob, { family: FONT.mono, size: 16, a, align: CENTER });
  }

  // 디버그 값 (프로토타입용)
  const profile = gs.userEQProfile;
  const debug = {
    PART1_VOLUME: `vol ${profile.masterVolume.toFixed(2)}`,
    PART1_LOW: `low ${fmtDb(profile.lowShelf.gain)}dB`,
    PART1_HIGH: `high ${fmtDb(profile.highShelf.gain)}dB`
  }[gs.currentStage];
  label(debug, width - layout.margin, layout.progressY + 14, { family: FONT.mono, size: 9, c: PALETTE.mute, a: 160, align: RIGHT });

  const hint = p1.hasMoved ? '편한 곳에서 아래 버튼을 눌러 주세요' : '화면 아무 곳이나 위아래로 쓸어 보세요';
  label(hint, width / 2, layout.btnSecondary.y + layout.btnH / 2, { size: 12, c: PALETTE.mute, align: CENTER });
  drawButton(layout.btnPrimary, '여기가 좋아요', { filled: true, enabled: p1.hasMoved });
}

/**
 * 3. ② 음역 고르기: 음고 축 위 제자리에 놓인 세 개의 빛
 */
function renderRegisterStep(layout) {
  const reg = window.GlobalState.part1.register;
  const m = layout.membrane;

  drawMembrane(m, { alpha: 0.7 });
  drawPitchAxis(m, m.cy + m.h * 0.5 + 34, { numbers: false });

  const r = max(16, min(width, height) * 0.028);
  reg.order.forEach((id, i) => {
    const u = uOfFreq(registerOfCard(i).peakHz);
    const x = m.x + m.w * u;
    const c = pitchColor(u);
    const playing = reg.playingCard === i;
    const selected = reg.selectedCard === i;
    const ctx = drawingContext;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (playing) {
      // 울리는 동안 퍼지는 물결
      for (let w = 0; w < 3; w++) {
        const ph = (animTimer * 0.6 + w / 3) % 1;
        ctx.strokeStyle = rgba(c, (1 - ph) * 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, m.cy, r + ph * r * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = playing ? 30 : 12;
    ctx.shadowColor = rgba(c, 1);
    ctx.fillStyle = rgba(playing ? [255, 255, 255] : c, playing ? 0.95 : 0.55);
    ctx.beginPath();
    ctx.arc(x, m.cy, playing ? r * 0.8 : r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (selected) {
      push();
      noFill();
      stroke(col(PALETTE.accent));
      strokeWeight(2);
      ellipse(x, m.cy, r * 2.6, r * 2.6);
      pop();
    }

    label(CARD_LABELS[i], x, m.cy - m.h * 0.5 - 18, { family: FONT.mono, size: 13, weight: 500, c: selected ? PALETTE.accent : PALETTE.ink, a: reg.isAutoPlaying && !playing ? 110 : 255, align: CENTER });
  });

  drawButton(layout.btnSecondary, '다시 전부 듣기', { enabled: !reg.isAutoPlaying });
  drawButton(layout.btnPrimary, '이걸로 할게요', { filled: true, enabled: !reg.isAutoPlaying && reg.selectedCard >= 0 });
}

/**
 * 음역 터치 영역: 각 빛 사이 중간점에서 나눈 세로 기둥
 */
function getRegisterCardZones(layout) {
  const m = layout.membrane;
  const xs = REGISTERS.map((r) => m.x + m.w * uOfFreq(r.peakHz));
  const edges = [m.x, (xs[0] + xs[1]) / 2, (xs[1] + xs[2]) / 2, m.x + m.w];
  return [0, 1, 2].map((i) => ({ x: edges[i], y: layout.bodyTop, w: edges[i + 1] - edges[i], h: layout.bodyBottom - layout.bodyTop }));
}

/**
 * 4. ⑤ 결과: 내 EQ 모양의 막 + 값 + 비교 버튼
 */
function renderResultStep(layout) {
  const gs = window.GlobalState;
  const profile = gs.userEQProfile;
  const bodyH = layout.bodyBottom - layout.bodyTop;
  const m = { x: layout.margin, w: layout.cw, cy: layout.bodyTop + bodyH * 0.3, h: bodyH * 0.38 };

  drawMembrane(m, { alpha: gs.part1.isBypassed ? 0.45 : 1 });
  drawPitchAxis(m, m.cy + m.h * 0.5 + 34);

  // 값 목록
  const reg = REGISTERS.find((r) => r.id === profile.registerPeak.register);
  const rows = [
    ['볼륨', profile.masterVolume.toFixed(2)],
    ['저음', `${fmtDb(profile.lowShelf.gain)} dB · ${fmtHz(profile.lowShelf.freq)}Hz 아래`],
    ['음역', reg ? `${reg.name} · ${fmtHz(profile.registerPeak.freq)}Hz ${fmtDb(profile.registerPeak.gain, 0)} dB` : '—'],
    ['고음', `${fmtDb(profile.highShelf.gain)} dB · ${fmtHz(profile.highShelf.freq)}Hz 위`]
  ];
  const rowTop = m.cy + m.h * 0.5 + 76;
  const rowH = min(30, (layout.bodyBottom - rowTop) / rows.length);
  rows.forEach(([k, v], i) => {
    const y = rowTop + i * rowH;
    label(k, m.x, y, { size: 12, c: PALETTE.mute });
    label(v, m.x + m.w, y, { family: FONT.mono, size: 12, align: RIGHT });
  });

  drawButton(layout.btnSecondary, '처음부터 다시', {});
  drawButton(layout.btnPrimary, gs.part1.isBypassed ? '내 EQ로 듣기' : '원래 소리 듣기', { filled: true });
}

/**
 * 터치 영역 히트테스트 (main.js에서 공유)
 */
function getInteractionZones() {
  const layout = calculateUILayout();
  return {
    layout,
    btnPrimary: layout.btnPrimary,
    btnSecondary: layout.btnSecondary,
    cards: getRegisterCardZones(layout)
  };
}
