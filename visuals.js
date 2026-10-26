/**
 * 청각 다변기 (Sound Variator) - Visual Renderer & UI
 *
 * [Part 1: 파트별 청취로 만드는 개인 선호 EQ]
 * 프로토타입용 미니멀 비주얼. 종이 톤 배경 + 먹색 선 + 단일 포인트 컬러.
 * 비주얼 작업 시 아래 PALETTE / FONT 값만 바꿔도 전체 톤이 바뀌도록 구성.
 *
 * 조절 단계(①③④)에서는 값(dB)이나 곡선을 크게 보여주지 않는다.
 * 화면의 '가운데'나 '평평한 곡선'에 맞추려는 시각 편향을 막고 귀로만 고르게 하기 위함.
 * 표식은 기울기만 따라가고, 값은 우상단에 작은 디버그 숫자로만 표시.
 */

const PALETTE = {
  bg:     [242, 240, 235], // 종이
  ink:    [17, 17, 17],    // 먹
  mute:   [140, 138, 132], // 보조 텍스트
  line:   [214, 211, 204], // 헤어라인
  accent: [232, 68, 46]    // 포인트 (버밀리언)
};

const FONT = {
  sans: "'Noto Sans KR', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace"
};

const STEP_COPY = {
  PART1_VOLUME: {
    title: '편한 볼륨',
    lines: ['기기를 세우면 커지고, 눕히면 작아져요.', '편하게 들리는 곳에서 멈추세요.']
  },
  PART1_REGISTER: {
    title: '음역 고르기',
    lines: ['같은 멜로디를 세 번 들려드릴게요.'],
    linesAfter: ['어느 쪽이 가장 편하게 들렸나요?', '카드를 눌러 다시 들을 수 있어요.']
  },
  PART1_LOW: {
    title: '저음 맞추기',
    lines: ['기기를 세우면 저음이 많아지고, 눕히면 줄어요.', '가장 편한 곳에서 멈추세요.']
  },
  PART1_HIGH: {
    title: '고음 맞추기',
    lines: ['기기를 세우면 고음이 많아지고, 눕히면 줄어요.', '가장 편한 곳에서 멈추세요.']
  },
  PART1_RESULT: {
    title: '나의 EQ',
    lines: ['내 EQ와 원래 소리를 번갈아 들어보세요.']
  }
};

const CARD_LABELS = ['A', 'B', 'C'];

let animTimer = 0;

/**
 * 메인 렌더 함수 (main.js의 draw()에서 호출)
 */
function renderVisuals() {
  animTimer += 0.03;
  background(...PALETTE.bg);

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

function getLevel() {
  const amp = window.GlobalState.audioNodes.amplitude;
  return amp ? (amp.getLevel() || 0) : 0;
}

function drawButton(z, str, { filled = false, enabled = true } = {}) {
  push();
  const a = enabled ? 255 : 70;
  if (filled) {
    noStroke();
    fill(col(PALETTE.ink, a));
  } else {
    noFill();
    stroke(col(PALETTE.ink, a));
    strokeWeight(1);
  }
  rect(z.x, z.y, z.w, z.h);
  pop();
  label(str, z.x + z.w / 2, z.y + z.h / 2, { size: 15, weight: 500, c: filled ? PALETTE.bg : PALETTE.ink, a, align: CENTER, spacing: 1 });
}

/**
 * 1. INIT 초기 화면
 */
function renderInitScreen() {
  const cx = width / 2;
  const unit = min(width, height);

  label('SEOUL MUSEUM OF ART — 2026', cx, height * 0.14, { family: FONT.mono, size: 10, c: PALETTE.mute, align: CENTER, spacing: 2 });

  // 숨쉬는 원
  const r = unit * 0.32 * (1 + sin(animTimer * 1.2) * 0.02);
  push();
  noFill();
  stroke(col(PALETTE.ink));
  strokeWeight(1);
  ellipse(cx, height * 0.46, r, r);
  stroke(col(PALETTE.accent));
  const r2 = r * (0.18 + (sin(animTimer * 1.2) * 0.5 + 0.5) * 0.06);
  ellipse(cx, height * 0.46, r2, r2);
  pop();

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

  return {
    margin,
    cw,
    headerY: max(28, height * 0.045),
    progressY: max(52, height * 0.08),
    copyY: height * 0.15,
    bodyTop: height * 0.27,
    bodyBottom: bottom - btnH * 2 - 24,
    btnH,
    btnPrimary: { x: margin, y: bottom - btnH, w: cw, h: btnH },
    btnSecondary: { x: margin, y: bottom - btnH * 2 - 12, w: cw, h: btnH }
  };
}

/**
 * 상단: 단계 번호 + 제목 + 진행 막대 + 센서 상태
 */
function drawHeader(layout) {
  const gs = window.GlobalState;
  const stage = gs.currentStage;
  const step = gs.part1.stepIndex;
  const L = layout.margin;
  const R = width - layout.margin;
  const y = layout.headerY;

  label(`0${step + 1}`, L, y, { family: FONT.mono, size: 11, c: PALETTE.accent });
  label(STEP_COPY[stage].title, L + 26, y, { size: 13, weight: 500, spacing: 1 });

  label(gs.isGyroAvailable ? 'GYRO' : 'DRAG', R, y, { family: FONT.mono, size: 10, c: PALETTE.mute, align: RIGHT, spacing: 1 });
  label(`tilt ${fmtDb(gs.sensor.tilt)}°`, R, y + 15, { family: FONT.mono, size: 9, c: PALETTE.mute, a: 160, align: RIGHT });

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
 * 2. ①③④ 조절 단계: 기울기를 따라가는 표식 + 멈춤 확정 링
 */
function renderAdjustStep(layout) {
  const gs = window.GlobalState;
  const p1 = gs.part1;
  const cx = width / 2;
  const top = layout.bodyTop + 20;
  const bottom = layout.bodyBottom - 20;

  // 세로 레일 (눈금 없음)
  push();
  stroke(col(PALETTE.line));
  strokeWeight(1);
  line(cx, top, cx, bottom);
  pop();
  label('세우기', cx + 14, top, { size: 11, c: PALETTE.mute });
  label('눕히기', cx + 14, bottom, { size: 11, c: PALETTE.mute });

  // 표식: 상대 기울기(normY)를 따라감 + 소리 크기에 반응
  const y = map(gs.sensor.normY, 0, 1, bottom, top);
  const d = min(width, height) * 0.16 * (1 + getLevel() * 0.6);
  push();
  noStroke();
  fill(col(p1.hasMoved ? PALETTE.ink : PALETTE.mute));
  ellipse(cx, y, d, d);

  // 멈춤 확정 진행 링
  if (p1.dwell > 0) {
    noFill();
    stroke(col(PALETTE.accent));
    strokeWeight(3);
    arc(cx, y, d + 18, d + 18, -HALF_PI, -HALF_PI + TWO_PI * p1.dwell);
  }
  pop();

  // 디버그 값 (프로토타입용)
  const profile = gs.userEQProfile;
  const debug = {
    PART1_VOLUME: `vol ${profile.masterVolume.toFixed(2)}`,
    PART1_LOW: `low ${fmtDb(profile.lowShelf.gain)}dB`,
    PART1_HIGH: `high ${fmtDb(profile.highShelf.gain)}dB`
  }[gs.currentStage];
  label(debug, width - layout.margin, layout.progressY + 14, { family: FONT.mono, size: 9, c: PALETTE.mute, a: 160, align: RIGHT });

  if (!p1.hasMoved) {
    const hint = gs.isGyroAvailable ? '먼저 기기를 앞뒤로 기울여 보세요' : '먼저 화면을 누른 채 위아래로 끌어 보세요';
    label(hint, cx, layout.btnSecondary.y + layout.btnH / 2, { size: 12, c: PALETTE.mute, align: CENTER });
  } else {
    label('2초간 멈추면 다음으로 넘어가요', cx, layout.btnSecondary.y + layout.btnH / 2, { size: 12, c: PALETTE.mute, align: CENTER });
  }
  drawButton(layout.btnPrimary, '여기가 좋아요', { filled: true, enabled: p1.hasMoved });
}

/**
 * 3. ② 음역 고르기: A/B/C 카드
 */
function renderRegisterStep(layout) {
  const reg = window.GlobalState.part1.register;
  const cards = getRegisterCardZones(layout);

  cards.forEach((z, i) => {
    const playing = reg.playingCard === i;
    const selected = reg.selectedCard === i;
    push();
    if (playing) {
      noStroke();
      fill(col(PALETTE.ink));
    } else {
      noFill();
      stroke(col(PALETTE.ink, reg.isAutoPlaying ? 90 : 255));
      strokeWeight(1);
    }
    rect(z.x, z.y, z.w, z.h);
    if (selected) {
      noFill();
      stroke(col(PALETTE.accent));
      strokeWeight(4);
      rect(z.x + 2, z.y + 2, z.w - 4, z.h - 4);
    }
    pop();

    label(CARD_LABELS[i], z.x + 16, z.y + 36, { size: min(56, z.w * 0.4), weight: 500, c: playing ? PALETTE.bg : PALETTE.ink });
    if (!reg.isAutoPlaying) {
      label('탭해서 듣기', z.x + 16, z.y + z.h - 20, { size: 11, c: playing ? PALETTE.bg : PALETTE.mute });
    }
  });

  drawButton(layout.btnSecondary, '다시 전부 듣기', { enabled: !reg.isAutoPlaying });
  drawButton(layout.btnPrimary, '이걸로 할게요', { filled: true, enabled: !reg.isAutoPlaying && reg.selectedCard >= 0 });
}

function getRegisterCardZones(layout) {
  const gap = 12;
  const w = (layout.cw - gap * 2) / 3;
  const h = min(layout.bodyBottom - layout.bodyTop, w * 1.6);
  const y = layout.bodyTop + (layout.bodyBottom - layout.bodyTop - h) / 2;
  return [0, 1, 2].map((i) => ({ x: layout.margin + i * (w + gap), y, w, h }));
}

/**
 * 4. ⑤ 결과: 개인 EQ 곡선 + 값 + 비교 버튼
 */
function renderResultStep(layout) {
  const gs = window.GlobalState;
  const profile = gs.userEQProfile;
  const gx = layout.margin;
  const gw = layout.cw;
  const gy = layout.bodyTop;
  const gh = (layout.bodyBottom - layout.bodyTop) * 0.55;

  drawEQCurve(gx, gy, gw, gh, profile, gs.part1.isBypassed);

  // 값 목록
  const reg = REGISTERS.find((r) => r.id === profile.registerPeak.register);
  const rows = [
    ['볼륨', profile.masterVolume.toFixed(2)],
    ['저음', `${fmtDb(profile.lowShelf.gain)} dB · ${fmtHz(profile.lowShelf.freq)}Hz 아래`],
    ['음역', reg ? `${reg.name} · ${fmtHz(profile.registerPeak.freq)}Hz ${fmtDb(profile.registerPeak.gain, 0)} dB` : '—'],
    ['고음', `${fmtDb(profile.highShelf.gain)} dB · ${fmtHz(profile.highShelf.freq)}Hz 위`]
  ];
  const rowTop = gy + gh + 36;
  const rowH = min(32, (layout.bodyBottom - rowTop) / rows.length);
  rows.forEach(([k, v], i) => {
    const y = rowTop + i * rowH;
    label(k, gx, y, { size: 12, c: PALETTE.mute });
    label(v, gx + gw, y, { family: FONT.mono, size: 12, align: RIGHT });
  });

  drawButton(layout.btnSecondary, '처음부터 다시', {});
  drawButton(layout.btnPrimary, gs.part1.isBypassed ? '내 EQ로 듣기' : '원래 소리 듣기', { filled: true });
}

/**
 * 개인 EQ 응답 곡선 (20Hz ~ 20kHz 로그 축, ±12dB)
 */
function drawEQCurve(gx, gy, gw, gh, profile, isBypassed) {
  const range = 12;
  const yOf = (db) => map(db, -range, range, gy + gh, gy);
  const xOf = (f) => gx + gw * Math.log10(f / 20) / 3;

  push();
  // FFT: 아주 옅은 세로 헤어라인 (로그 축)
  const fft = window.GlobalState.audioNodes.fft;
  if (fft) {
    const spectrum = fft.analyze();
    const nyquist = getAudioContext().sampleRate / 2;
    stroke(col(PALETTE.ink, 28));
    strokeWeight(1);
    for (let i = 1; i < spectrum.length; i += 2) {
      const f = i * nyquist / spectrum.length;
      if (f < 20 || f > 20000) continue;
      const x = xOf(f);
      line(x, gy + gh, x, gy + gh - map(spectrum[i], 0, 255, 0, gh));
    }
  }

  // 격자
  stroke(col(PALETTE.line));
  strokeWeight(1);
  line(gx, yOf(0), gx + gw, yOf(0));
  drawingContext.setLineDash([2, 4]);
  line(gx, gy, gx + gw, gy);
  line(gx, gy + gh, gx + gw, gy + gh);
  [100, 1000, 10000].forEach((f) => line(xOf(f), gy, xOf(f), gy + gh));
  drawingContext.setLineDash([]);

  // 곡선
  noFill();
  stroke(col(isBypassed ? PALETTE.mute : PALETTE.accent));
  strokeWeight(2);
  beginShape();
  for (let i = 0; i <= 120; i++) {
    const f = 20 * Math.pow(1000, i / 120);
    vertex(xOf(f), yOf(isBypassed ? 0 : constrain(getEQResponseDb(f, profile), -range, range)));
  }
  endShape();
  pop();

  [[100, '100'], [1000, '1k'], [10000, '10k']].forEach(([f, s]) => {
    label(s, xOf(f), gy + gh + 12, { family: FONT.mono, size: 9, c: PALETTE.mute, align: CENTER });
  });
  label(`+${range}`, gx, gy - 10, { family: FONT.mono, size: 9, c: PALETTE.mute });
  label(`−${range} dB`, gx, gy + gh + 12, { family: FONT.mono, size: 9, c: PALETTE.mute });
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
