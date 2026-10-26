/**
 * 청각 다변기 (Sound Variator) - Visual Renderer & UI
 *
 * [Part 1: 개인화 등청감 EQ 및 커스텀 그레이 노이즈 도출]
 * 프로토타입용 미니멀 비주얼. 종이 톤 배경 + 먹색 선 + 단일 포인트 컬러.
 * 비주얼 작업 시 아래 PALETTE / FONT 값만 바꿔도 전체 톤이 바뀌도록 구성.
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

const FREQ_LABELS = ['60', '250', '1k', '4k', '8k'];

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
  } else if (stage === 'TUNING') {
    renderTuningUI();
  } else if (stage === 'PROFILE') {
    renderProfileScreen();
  }
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

function fmtGain(g, digits = 1) {
  return `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(digits)}`;
}

function getLevel() {
  const amp = window.GlobalState.audioNodes.amplitude;
  return amp ? (amp.getLevel() || 0) : 0;
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
  strokeWeight(1);
  const r2 = r * (0.18 + (sin(animTimer * 1.2) * 0.5 + 0.5) * 0.06);
  ellipse(cx, height * 0.46, r2, r2);
  pop();

  label('청각 다변기', cx, height * 0.70, { size: min(width * 0.075, 30), weight: 500, align: CENTER, spacing: 4 });
  label('Sound Variator · Part 1', cx, height * 0.70 + 30, { family: FONT.mono, size: 11, c: PALETTE.mute, align: CENTER, spacing: 1 });

  const blink = 140 + sin(animTimer * 2) * 100;
  label('화면을 눌러 시작', cx, height * 0.88, { size: 12, c: PALETTE.ink, a: blink, align: CENTER, spacing: 2 });
}

/**
 * 2. 튜닝 화면
 */
function renderTuningUI() {
  const layout = calculateUILayout();
  drawTopStatusBar(layout);
  drawEqualLoudnessCurveAndFFT(layout);
  drawFrequencyBandTabs(layout);
  drawClutchTouchPad(layout);
  drawBottomActionButtons(layout);
}

/**
 * 반응형 레이아웃 (히트테스트와 공유)
 */
function calculateUILayout() {
  const isPortrait = height > width;
  const margin = max(20, width * 0.07);
  const gw = width - margin * 2;

  const clutchTop = height * (isPortrait ? 0.58 : 0.56);
  const clutchBottom = height * 0.84;
  const clutchD = min(clutchBottom - clutchTop, gw * 0.6);

  return {
    isPortrait,
    margin,
    statusY: max(28, height * 0.05),

    graphX: margin,
    graphY: height * 0.13,
    graphW: gw,
    graphH: height * (isPortrait ? 0.30 : 0.28),

    tabsY: height * (isPortrait ? 0.45 : 0.43),
    tabsH: max(44, height * 0.08),

    clutchD,
    clutchX: width / 2 - clutchD / 2,
    clutchY: (clutchTop + clutchBottom) / 2 - clutchD / 2,
    clutchW: clutchD,
    clutchH: clutchD,

    actionY: height * 0.91,
    actionH: 44
  };
}

/**
 * 상단 상태 표기
 */
function drawTopStatusBar(layout) {
  const s = window.GlobalState.sensor;
  const isGyro = window.GlobalState.isGyroAvailable;
  const y = layout.statusY;
  const L = layout.margin;
  const R = width - layout.margin;

  label('01', L, y, { family: FONT.mono, size: 11, c: PALETTE.accent });
  label('등청감 조율', L + 24, y, { size: 12, weight: 500, spacing: 1 });

  label(isGyro ? 'GYRO' : 'MOUSE', R, y, { family: FONT.mono, size: 10, c: PALETTE.mute, align: RIGHT, spacing: 1 });
  label(`β ${fmtGain(s.smoothBeta)}  γ ${fmtGain(s.smoothGamma)}`, R, y + 16, { family: FONT.mono, size: 9, c: PALETTE.mute, a: 160, align: RIGHT });
}

/**
 * 밴드 i의 x 좌표 (그래프 노드와 하단 라벨이 정렬되도록 공유)
 */
function bandX(i, gx, gw) {
  return gx + gw * (i + 0.5) / 5;
}

/**
 * EQ 곡선 그리기 (튜닝/프로파일 공용)
 */
function drawCurve(gx, gy, gw, gh, { showFFT = true, activeIdx = -1 } = {}) {
  const gains = window.GlobalState.userEQProfile.gains;
  const gainY = (g) => map(g, -15, 15, gy + gh, gy);

  push();

  // 0dB 기준선 + ±15 눈금
  stroke(col(PALETTE.line));
  strokeWeight(1);
  line(gx, gainY(0), gx + gw, gainY(0));
  drawingContext.setLineDash([2, 4]);
  line(gx, gy, gx + gw, gy);
  line(gx, gy + gh, gx + gw, gy + gh);
  drawingContext.setLineDash([]);

  // FFT: 아주 옅은 세로 헤어라인
  const fft = window.GlobalState.audioNodes.fft;
  if (showFFT && fft) {
    const spectrum = fft.analyze();
    stroke(col(PALETTE.ink, 28));
    strokeWeight(1);
    const bins = 200;
    for (let i = 0; i < bins; i += 2) {
      const x = map(i, 0, bins, gx, gx + gw);
      const h = map(spectrum[i] || 0, 0, 255, 0, gh);
      line(x, gy + gh, x, gy + gh - h);
    }
  }

  const pts = gains.map((g, i) => ({ x: bandX(i, gx, gw), y: gainY(g) }));

  // 선택 밴드 세로 가이드
  if (activeIdx >= 0) {
    stroke(col(PALETTE.accent, 90));
    strokeWeight(1);
    line(pts[activeIdx].x, gy, pts[activeIdx].x, gy + gh);
  }

  // 곡선
  noFill();
  stroke(col(PALETTE.ink));
  strokeWeight(1.5);
  beginShape();
  curveVertex(gx, pts[0].y);
  curveVertex(gx, pts[0].y);
  pts.forEach(p => curveVertex(p.x, p.y));
  curveVertex(gx + gw, pts[4].y);
  curveVertex(gx + gw, pts[4].y);
  endShape();

  // 노드
  pts.forEach((p, i) => {
    if (i === activeIdx) {
      noStroke();
      fill(col(PALETTE.accent));
      ellipse(p.x, p.y, 10, 10);
    } else {
      stroke(col(PALETTE.ink));
      strokeWeight(1);
      fill(col(PALETTE.bg));
      ellipse(p.x, p.y, 7, 7);
    }
  });

  pop();

  if (activeIdx >= 0) {
    const p = pts[activeIdx];
    label(`${fmtGain(gains[activeIdx])} dB`, p.x, p.y - 16, { family: FONT.mono, size: 10, c: PALETTE.accent, align: CENTER });
  }
}

function drawEqualLoudnessCurveAndFFT(layout) {
  drawCurve(layout.graphX, layout.graphY, layout.graphW, layout.graphH, {
    activeIdx: window.GlobalState.sensor.activeBandIndex
  });
}

/**
 * 밴드 선택 (그래프 노드와 같은 열에 정렬된 텍스트)
 */
function drawFrequencyBandTabs(layout) {
  const activeIdx = window.GlobalState.sensor.activeBandIndex;
  const gains = window.GlobalState.userEQProfile.gains;
  const midY = layout.tabsY + layout.tabsH / 2;

  for (let i = 0; i < 5; i++) {
    const x = bandX(i, layout.graphX, layout.graphW);
    const on = i === activeIdx;
    label(FREQ_LABELS[i], x, midY - 7, { family: FONT.mono, size: on ? 13 : 12, weight: on ? 500 : 400, c: on ? PALETTE.ink : PALETTE.mute, align: CENTER });
    label(fmtGain(gains[i], 0), x, midY + 10, { family: FONT.mono, size: 9, c: on ? PALETTE.accent : PALETTE.mute, a: on ? 255 : 150, align: CENTER });
  }

  label('Hz', layout.graphX + layout.graphW, midY - 7, { family: FONT.mono, size: 9, c: PALETTE.mute, a: 150, align: RIGHT });
}

/**
 * 클러치 (Hold to Tune) — 중앙의 원
 */
function drawClutchTouchPad(layout) {
  const held = window.GlobalState.sensor.isClutchActive;
  const idx = window.GlobalState.sensor.activeBandIndex;
  const cx = layout.clutchX + layout.clutchD / 2;
  const cy = layout.clutchY + layout.clutchD / 2;
  const d = layout.clutchD;

  push();
  if (held) {
    const level = getLevel();
    noStroke();
    fill(col(PALETTE.accent));
    ellipse(cx, cy, d * (0.96 + level * 0.3), d * (0.96 + level * 0.3));
  } else {
    noFill();
    stroke(col(PALETTE.ink));
    strokeWeight(1);
    ellipse(cx, cy, d, d);

    // 바깥으로 퍼지는 옅은 링
    const t = (animTimer * 0.25) % 1;
    stroke(col(PALETTE.ink, 60 * (1 - t)));
    ellipse(cx, cy, d * (1 + t * 0.18), d * (1 + t * 0.18));
  }
  pop();

  if (held) {
    label(`${FREQ_LABELS[idx]} Hz`, cx, cy - 10, { family: FONT.mono, size: 12, c: PALETTE.bg, align: CENTER, spacing: 1 });
    label(fmtGain(window.GlobalState.userEQProfile.gains[idx]), cx, cy + 14, { family: FONT.mono, size: min(d * 0.16, 28), weight: 500, c: PALETTE.bg, align: CENTER });
  } else {
    label('누른 채', cx, cy - 9, { size: 12, align: CENTER, spacing: 2 });
    label('기울이기', cx, cy + 9, { size: 12, align: CENTER, spacing: 2 });
  }
}

/**
 * 하단 텍스트 버튼
 */
function drawBottomActionButtons(layout) {
  const z = getInteractionZones();
  const y = layout.actionY + layout.actionH / 2;

  label('초기화', z.btnReset.x, y, { size: 12, c: PALETTE.mute, spacing: 1 });
  label('결과 보기  →', z.btnProfile.x + z.btnProfile.w, y, { size: 12, weight: 500, align: RIGHT, spacing: 1 });
}

/**
 * 3. 결과 프로파일 화면
 */
function renderProfileScreen() {
  const margin = max(20, width * 0.07);
  const gw = width - margin * 2;
  const gains = window.GlobalState.userEQProfile.gains;

  label('02', margin, max(28, height * 0.05), { family: FONT.mono, size: 11, c: PALETTE.accent });
  label('나의 등청감 곡선', margin + 24, max(28, height * 0.05), { size: 12, weight: 500, spacing: 1 });

  drawCurve(margin, height * 0.16, gw, height * 0.26, { showFFT: false });

  // 대역별 수치
  const top = height * 0.52;
  const rowH = min(height * 0.065, 48);
  for (let i = 0; i < 5; i++) {
    const y = top + i * rowH;
    label(`${FREQ_LABELS[i]} Hz`, margin, y, { family: FONT.mono, size: 11, c: PALETTE.mute });

    const bx = margin + gw * 0.28;
    const bw = gw * 0.5;
    push();
    stroke(col(PALETTE.line));
    strokeWeight(1);
    line(bx, y, bx + bw, y);
    line(bx + bw / 2, y - 4, bx + bw / 2, y + 4);
    noStroke();
    fill(col(gains[i] === 0 ? PALETTE.ink : PALETTE.accent));
    ellipse(map(gains[i], -15, 15, bx, bx + bw), y, 7, 7);
    pop();

    label(`${fmtGain(gains[i])} dB`, margin + gw, y, { family: FONT.mono, size: 11, align: RIGHT });
  }

  const b = getInteractionZones().btnBackFromProfile;
  label('←  다시 조율하기', width / 2, b.y + b.h / 2, { size: 12, weight: 500, align: CENTER, spacing: 1 });
}

/**
 * 터치 영역 히트테스트 (main.js에서 공유)
 */
function getInteractionZones() {
  const layout = calculateUILayout();
  const halfW = layout.graphW / 2;

  return {
    layout,
    clutch: {
      x: layout.clutchX,
      y: layout.clutchY,
      w: layout.clutchW,
      h: layout.clutchH
    },
    btnReset: {
      x: layout.graphX,
      y: layout.actionY,
      w: halfW,
      h: layout.actionH
    },
    btnProfile: {
      x: layout.graphX + halfW,
      y: layout.actionY,
      w: halfW,
      h: layout.actionH
    },
    btnBackFromProfile: {
      x: width / 2 - 120,
      y: height * 0.88 - 24,
      w: 240,
      h: 48
    },
    tabs: [0, 1, 2, 3, 4].map(i => ({
      index: i,
      x: layout.graphX + i * layout.graphW / 5,
      y: layout.tabsY,
      w: layout.graphW / 5,
      h: layout.tabsH
    }))
  };
}
