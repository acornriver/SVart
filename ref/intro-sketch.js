// noprotect
/* =====================================================================
 * 모든 귀는 [ ] 이다 — 인트로
 * 제목을 누른 뒤 ~ 첫 검사(① 편한 크기) 달팽이가 나오기 전까지 사이 장면
 *
 * 1) 제목이 흐려지고 [ … ] 의 점 세 개만 남아 빛난다
 * 2) 점이 이중나선으로 풀려 나와 회전하며 세로로 선다
 * 3) 이중나선이 달팽이 껍질처럼 나선으로 감긴다
 * 4) 나선이 다시 풀리며 두 가닥이 하나로 모여 달팽이 윤곽이 되고, 색이 흰 선 + 빨간 잔광으로
 * 5) 더듬이가 돋아나고 끝 점이 톡 켜진다 → 첫 검사 화면과 같은 자리·크기에서 끝
 *
 * p5.js 1.9.4 기준(앱과 같은 버전, 2.x에서도 돌아감). 그리기는 캔버스 2D를 직접 쓴다.
 * 좌표는 아이패드 미니 5 가로(1024×768) 기준이고 화면 크기에 맞춰 늘이고 줄인다.
 * 조작: 화면을 누르면 처음부터 다시 (소리 켜짐)
 * ===================================================================== */

const REF_W = 1024, REF_H = 768;

/* ───────────── 조절값 ───────────── */
const CFG = {
  SPEED: 1,              // 전체 속도 (1.3 이면 30% 빠르게)
  SIZE: 0.92,            // ① 시작 크기 배율. 앱에서는 관람객마다 다르므로 실제로 붙일 때는 그 값(cur.R0)을 넘김
  HUE_START: 190,        // 나선 색: 무지개 시작 색상(0~360)
  HUE_SPAN: 290,         // 나선 한쪽 끝에서 다른 끝까지 도는 색상 폭
  HUE_DRIFT: 24,         // 초당 색이 흘러가는 양
  TWISTS: [8, 15],       // 이중나선 꼬임 수 (세로로 섰을 때, 껍질로 감겼을 때)
  SEP: 26,               // 두 가닥 사이 폭(px)
  SPIN: 2.4,             // 꼬임이 도는 속도
  BEAD_EVERY: 5,         // 몇 칸마다 구슬 하나 (작을수록 촘촘)
  TRAIL: 0.72,           // 잔상 남는 정도 (0 = 없음, 0.85 = 길게)
  SHELL_TURNS: 2.35,     // 껍질 나선 바퀴 수
  SOUND: true,           // 임시 효과음 (작업자 사운드로 바꿀 자리)
  HOLD: 1.4,             // 다 끝난 뒤 머무는 시간 (미리보기 전용, 이후 onIntroDone)
};

// 시간표(초). 겹치는 구간은 일부러 겹쳐 자연스럽게 이어지게 함
const TL = {
  title: [0.25, 1.15],   // 제목 글자가 흐려짐 (점 세 개만 남음)
  grow:  [0.95, 2.45],   // 점 → 이중나선, 세로로 섬
  coil:  [2.35, 4.15],   // 껍질 나선으로 감김
  loop:  [4.05, 5.85],   // 나선이 풀려 달팽이 윤곽으로
  ears:  [5.65, 6.4],    // 더듬이
};
const INTRO_SEC = TL.ears[1] + 0.15;

const COL = { ink: [245, 245, 240], accent: [255, 59, 31] };      // 앱의 COLORS.ink / accent
const RAINBOW = { sat: 0.85, light: 0.64 };                        // 앱의 SNAIL_RAINBOW
const N = 240;                                                     // 나선 가운데 길 점 개수

// 앱 첫 화면 제목의 실제 자리 (1024×768, 앱에서 잰 값)
const TITLE = {
  font: "700 88px 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
  spacing: '-4.84px', baseline: 386,
  before: { x: 175, s: '모든 귀는' }, brL: { x: 519, s: '[' }, brR: { x: 649, s: ']' }, after: { x: 696, s: '이다' },
  dots: [[562, 355], [591, 355], [621, 355]], dotR: 6.8,
};

/* ───────────── 상태 ───────────── */
let ctx, view = { k: 1, ox: 0, oy: 0 };
let t0 = 0;
let SN;                 // 첫 검사 달팽이 자리 { cx, cy, groundY, R0 }
let SP;                 // 껍질 나선 (미리 계산)
let fired = {};
let doneCalled = false;
let actx = null;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const prog = (t, r) => clamp01((t - r[0]) / (r[1] - r[0]));
const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + clamp01(a).toFixed(3) + ')';

// 앱의 rainbowColor 그대로
function rainbow(hue) {
  const { sat, light } = RAINBOW;
  const c = (1 - Math.abs(2 * light - 1)) * sat, h = (((hue % 360) + 360) % 360) / 60, x = c * (1 - Math.abs(h % 2 - 1)), m = light - c / 2;
  const rgb = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255));
}

/* =====================================================================
 * 첫 검사 달팽이 (앱 visuals.js의 calculateUILayout · bodyShape · antennaStalks를 ① 시작 상태로 옮김)
 * ===================================================================== */
function snailTarget(R0override) {
  const m = Math.max(20, Math.min(REF_W, REF_H) * 0.05), btnY = REF_H - m - 54;
  const stageTop = REF_H < 850 ? 210 : 240, stageH = Math.max(160, btnY - 110 - stageTop);
  const R0 = R0override || Math.min(REF_W * 0.15, stageH * 0.24) * CFG.SIZE;
  const groundY = stageTop + stageH * 0.72;
  return { cx: REF_W / 2, groundY, R0, cy: groundY - R0 * 0.72 };
}

// 몸 윤곽의 한 점 (꼬리·머리 조절 전, 비트 없음)
function bodyPoint(th, tm) {
  const R0 = SN.R0;
  const wob = 0.045 * Math.sin(3 * th + 1.1 * tm) + 0.03 * Math.sin(5 * th - 1.7 * tm + 1) + 0.02 * Math.sin(2 * th + 0.6 * tm);
  const r = R0 * (1 + wob);
  const x = r * Math.cos(th);
  let y = r * Math.sin(th);
  const flatY = R0 * 0.72;
  if (y > flatY) y = flatY + (y - flatY) * 0.2;
  return [SN.cx + x, SN.cy + y];
}

function bodyOutline(tm) {
  const pts = [];
  for (let i = 0; i < 160; i++) pts.push(bodyPoint((i / 160) * Math.PI * 2, tm));
  // 소리가 없을 때 앱이 그리는 아주 옅은 숨결 (waveAt의 idle)
  const n = pts.length, amp = SN.R0 * 0.8;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    const w = 0.015 * Math.sin((i / n) * 60 + tm * 1000 / 300) * amp;
    return [p[0] + (ty / tl) * w, p[1] - (tx / tl) * w];
  });
}

// 더듬이 줄기 (고개 돌림 없음). side 'L' = 뒤(왼쪽 귀), 'R' = 앞(오른쪽 귀)
function stalk(side, tm) {
  const R0 = SN.R0, tip = bodyPoint(-0.5, tm);
  const lat = side === 'R' ? 1 : -1, ph = side === 'R' ? 0 : 2.3, len = R0 * 0.66;
  const el = (side === 'L' ? 1.12 : 0.92) + 0.05 * Math.sin(tm * 0.45 + ph);
  const az = lat * 0.42, bow = 0.06;
  const baseX = -R0 * (side === 'L' ? 0.2 : 0.03), baseY = -R0 * (side === 'L' ? 0.08 : 0.03);
  const dir = [Math.cos(el) * Math.cos(az), Math.sin(el)], nrm = [-Math.sin(el) * Math.cos(az), Math.cos(el)];
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const q = i / 20, b = -bow * len * Math.sin(q * Math.PI);
    pts.push([tip[0] + baseX + dir[0] * len * q + nrm[0] * b, tip[1] - (baseY + dir[1] * len * q + nrm[1] * b)]);
  }
  return pts;
}

// 앱의 scopeStroke: 넓고 옅은 빨간 잔광 위에 가는 흰 선
function scopeStroke(pts, closed, weight, alpha) {
  if (pts.length < 2 || alpha <= 0) return;
  const path = () => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    if (closed) ctx.closePath();
    ctx.stroke();
  };
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = rgba(COL.accent, 0.8 * alpha);
  ctx.shadowBlur = 12 * weight * view.k;
  ctx.strokeStyle = rgba(COL.accent, 0.38 * alpha);
  ctx.lineWidth = 8 * weight;
  path();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(COL.ink, alpha);
  ctx.lineWidth = 2.1 * weight;
  path();
  ctx.restore();
}

function drawAntenna(side, tm, grow, alpha) {
  if (grow <= 0) return;
  const pts = stalk(side, tm);
  const n = Math.max(2, Math.round(1 + grow * 20));
  const part = pts.slice(0, n);
  const a = alpha * (side === 'L' ? 0.5 : 1);
  scopeStroke(part, false, 0.9, a);
  // 끝 점: 다 자라면 톡 켜짐 (살짝 튀었다 자리 잡음)
  const k = sstep(0.72, 1, grow);
  if (k <= 0) return;
  const pop = k + 0.35 * Math.sin(k * Math.PI);
  const e = part[part.length - 1];
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = rgba(COL.ink, 1);
  ctx.lineWidth = 1.5;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(e[0], e[1], SN.R0 * 0.09 * pop, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba(COL.accent, 1);
  ctx.beginPath(); ctx.arc(e[0], e[1], SN.R0 * 0.035 * pop, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* =====================================================================
 * 껍질 나선 (미리 계산): 바깥 끝에서 안으로 감기는 아르키메데스 나선을 길이 기준으로 고르게 N점
 * ===================================================================== */
function buildShell() {
  const Rout = SN.R0 * 1.42, Rin = SN.R0 * 0.1, PHI = CFG.SHELL_TURNS * Math.PI * 2, M = 3000;
  const dense = [], acc = [0];
  for (let j = 0; j <= M; j++) {
    const f = j / M, phi = PHI * f, r = Rout + (Rin - Rout) * Math.pow(f, 0.85);
    dense.push([phi, r, r * Math.cos(phi), r * Math.sin(phi)]);
    if (j) acc.push(acc[j - 1] + Math.hypot(dense[j][2] - dense[j - 1][2], dense[j][3] - dense[j - 1][3]));
  }
  const total = acc[M];
  const phi = [], r = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i / (N - 1)) * total;
    while (j < M - 1 && acc[j + 1] < s) j++;
    const f = (s - acc[j]) / Math.max(1e-9, acc[j + 1] - acc[j]);
    phi.push(mix(dense[j][0], dense[j + 1][0], f));
    r.push(mix(dense[j][1], dense[j + 1][1], f));
  }
  // 시작 방향이 위(-90°)를 보도록 돌림 → 세로로 선 이중나선에서 그대로 말려 들어감
  const x0 = r[0] * Math.cos(phi[0]), y0 = r[0] * Math.sin(phi[0]);
  const x1 = r[1] * Math.cos(phi[1]), y1 = r[1] * Math.sin(phi[1]);
  const rho = -Math.PI / 2 - Math.atan2(y1 - y0, x1 - x0);
  const rp = phi.map((p) => p + rho);
  const xs = rp.map((p, i) => r[i] * Math.cos(p)), ys = rp.map((p, i) => r[i] * Math.sin(p));
  // 진행 방향 (풀어서 이어 붙인 각)
  const head = [];
  let prev = null;
  for (let i = 0; i < N; i++) {
    const a = i < N - 1 ? i : N - 2;
    let h = Math.atan2(ys[a + 1] - ys[a], xs[a + 1] - xs[a]);
    if (prev !== null) { while (h - prev > Math.PI) h -= Math.PI * 2; while (h - prev < -Math.PI) h += Math.PI * 2; }
    head.push(h);
    prev = h;
  }
  return { phi: rp, r, x0: xs[0], y0: ys[0], head, len: total };
}

/* =====================================================================
 * 가운데 길 (단계별)
 * ===================================================================== */
const LINE_LEN = 390;
const LINE_C = [REF_W / 2, REF_H / 2 + 6];
const DOTS_C = [591, 355];
const SHELL_PSI = -1.25;          // 감기는 동안 전체가 도는 각

function centerline(tm) {
  const e1 = easeIO(prog(tm, TL.grow));
  const e2 = easeIO(prog(tm, TL.coil));
  const e3 = easeIO(prog(tm, TL.loop));
  const pts = new Array(N);

  if (e2 <= 0) {
    // 점 세 개 → 가로로 짧은 나선 → 돌며 세로로 길게
    const ang = mix(0, -Math.PI / 2, sstep(0.15, 1, e1));
    const L = mix(60, LINE_LEN, Math.pow(e1, 1.3));
    const c = [mix(DOTS_C[0], LINE_C[0], e1), mix(DOTS_C[1], LINE_C[1], e1)];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1) - 0.5;
      pts[i] = [c[0] + Math.cos(ang) * u * L, c[1] + Math.sin(ang) * u * L];
    }
    return { pts, e1, e2, e3 };
  }

  if (e3 <= 0) {
    // 진행 방향을 곧은 선(위쪽)에서 껍질 나선의 방향으로 조금씩 바꿔 가며 이어 그림 = 말려 들어감
    const L = mix(LINE_LEN, SP.len, e2), ds = L / (N - 1);
    const rel = [[0, 0]];
    for (let i = 1; i < N; i++) {
      const h = mix(-Math.PI / 2, SP.head[i - 1], e2);
      rel.push([rel[i - 1][0] + Math.cos(h) * ds, rel[i - 1][1] + Math.sin(h) * ds]);
    }
    const mid = rel[(N - 1) >> 1];
    const anchor = [mix(mid[0], -SP.x0, e2), mix(mid[1], -SP.y0, e2)];
    const psi = SHELL_PSI * e2;
    const cs = Math.cos(psi), sn = Math.sin(psi);
    const pos = [mix(LINE_C[0], SN.cx, e2), mix(LINE_C[1], SN.cy, e2)];
    for (let i = 0; i < N; i++) {
      const dx = rel[i][0] - anchor[0], dy = rel[i][1] - anchor[1];
      pts[i] = [pos[0] + dx * cs - dy * sn, pos[1] + dx * sn + dy * cs];
    }
    return { pts, e1, e2, e3 };
  }

  // 나선이 풀려 달팽이 윤곽으로: 가운데를 중심으로 각과 반지름을 옮김
  const start = SP.phi[0] + SHELL_PSI;
  const fin = Math.pow(e3, 4);
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const thL = start + Math.PI * 2 * u;
    const lp = bodyPoint(thL, tm);
    const rL = Math.hypot(lp[0] - SN.cx, lp[1] - SN.cy);
    const phi = mix(SP.phi[i] + SHELL_PSI, thL, e3);
    const r = mix(SP.r[i], rL, e3);
    const p = [SN.cx + r * Math.cos(phi), SN.cy + r * Math.sin(phi)];
    pts[i] = [mix(p[0], lp[0], fin), mix(p[1], lp[1], fin)];
  }
  return { pts, e1, e2: 1, e3 };
}

/* =====================================================================
 * 이중나선 그리기: 두 가닥 + 가로대 + 빛나는 구슬
 * ===================================================================== */
function drawHelix(tm, C) {
  const { pts, e1, e2, e3 } = C;
  const twists = mix(CFG.TWISTS[0], CFG.TWISTS[1], e2);
  const ph = tm * CFG.SPIN;
  const fadeBeads = 1 - sstep(0.55, 0.98, e3);
  if (fadeBeads <= 0) return;
  const A = [], B = [], zA = [], hue = [], vis = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    const nx = ty / tl, ny = -tx / tl;
    const reveal = e2 > 0 ? 1 : clamp01((e1 * 1.15 - Math.abs(2 * u - 1)) / 0.15);
    let sep = CFG.SEP * sstep(0, 0.45, e1) * (1 - 0.45 * e2 * u);
    sep *= Math.pow(1 - e3, 1.3) * mix(1, Math.pow(Math.sin(Math.PI * u), 0.35), e3);
    const th = Math.PI * 2 * twists * u + ph;
    const o = sep * Math.sin(th);
    A.push([pts[i][0] + nx * o, pts[i][1] + ny * o]);
    B.push([pts[i][0] - nx * o, pts[i][1] - ny * o]);
    zA.push(Math.cos(th));
    hue.push(CFG.HUE_START + CFG.HUE_SPAN * u + tm * CFG.HUE_DRIFT);
    vis.push(reveal * fadeBeads);
  }
  const toInk = sstep(0.25, 0.9, e3);
  const colAt = (i) => mix3(rainbow(hue[i]), COL.ink, toInk);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 두 가닥: 색이 흐르도록 조금씩 끊어서
  const CH = 6;
  for (const [S, w] of [[A, 1.3], [B, 1.0]]) {
    for (let i = 0; i < N - 1; i += CH) {
      const j = Math.min(N - 1, i + CH);
      const v = vis[(i + j) >> 1];
      if (v <= 0.01) continue;
      ctx.strokeStyle = rgba(colAt((i + j) >> 1), 0.42 * v);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(S[i][0], S[i][1]);
      for (let k = i + 1; k <= j; k++) ctx.lineTo(S[k][0], S[k][1]);
      ctx.stroke();
    }
  }

  // 가로대와 구슬
  for (let i = 0; i < N; i += CFG.BEAD_EVERY) {
    const v = vis[i];
    if (v <= 0.01) continue;
    const c = colAt(i);
    const kA = (zA[i] + 1) / 2, kB = 1 - kA;
    // 가로대: 구슬에서 가운데로 갈수록 옅어짐
    const g = ctx.createLinearGradient(A[i][0], A[i][1], B[i][0], B[i][1]);
    g.addColorStop(0, rgba(c, (0.15 + 0.45 * kA) * v));
    g.addColorStop(0.5, rgba(c, 0.04 * v));
    g.addColorStop(1, rgba(c, (0.15 + 0.45 * kB) * v));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(A[i][0], A[i][1]); ctx.lineTo(B[i][0], B[i][1]); ctx.stroke();
    // 구슬: 앞쪽(카메라 쪽)일수록 크고 밝게
    for (const [P, k] of [[A[i], kA], [B[i], kB]]) {
      const r = mix(1.3, 4.6, k) * mix(0.6, 1, sstep(0, 0.4, e1));
      ctx.fillStyle = rgba(c, 0.1 * v * (0.4 + k));
      ctx.beginPath(); ctx.arc(P[0], P[1], r * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(c, (0.35 + 0.65 * k) * v);
      ctx.beginPath(); ctx.arc(P[0], P[1], r, 0, Math.PI * 2); ctx.fill();
      if (k > 0.7) {
        ctx.fillStyle = rgba([255, 255, 255], (k - 0.7) * 2 * v);
        ctx.beginPath(); ctx.arc(P[0], P[1], r * 0.45, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

/* =====================================================================
 * 제목 (미리보기용. 앱에서는 첫 화면 DOM 제목이 스스로 흐려짐)
 * ===================================================================== */
function drawTitle(tm) {
  const p = prog(tm, TL.title);
  const textA = 1 - sstep(0, 0.7, p);
  const brA = 1 - sstep(0.15, 0.85, p);
  const squeeze = easeIO(sstep(0, 1, p));
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = TITLE.font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = TITLE.spacing;
  ctx.textBaseline = 'alphabetic';
  if (textA > 0) {
    ctx.fillStyle = rgba(COL.ink, textA);
    ctx.fillText(TITLE.before.s, TITLE.before.x, TITLE.baseline);
    ctx.fillText(TITLE.after.s, TITLE.after.x, TITLE.baseline);
  }
  if (brA > 0) {
    // 괄호는 점 쪽으로 오므라들며 사라짐
    ctx.fillStyle = rgba(COL.accent, brA);
    ctx.fillText(TITLE.brL.s, mix(TITLE.brL.x, 544, squeeze), TITLE.baseline);
    ctx.fillText(TITLE.brR.s, mix(TITLE.brR.x, 624, squeeze), TITLE.baseline);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();

  // 점 세 개: 남아서 빛나다가 이중나선이 나오며 녹아듦
  const g = prog(tm, TL.grow);
  const dotA = 1 - sstep(0.05, 0.35, g);
  if (dotA <= 0) return;
  const glow = sstep(0.25, 1, p);
  ctx.save();
  TITLE.dots.forEach((d, i) => {
    const c = mix3(COL.ink, rainbow(CFG.HUE_START + CFG.HUE_SPAN * (0.42 + i * 0.08) + tm * CFG.HUE_DRIFT), glow);
    const pulse = 1 + 0.18 * glow * Math.sin(tm * 9 - i * 0.9);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(c, 0.18 * glow * dotA);
    ctx.beginPath(); ctx.arc(d[0], d[1], TITLE.dotR * 3 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(c, dotA);
    ctx.beginPath(); ctx.arc(d[0], d[1], TITLE.dotR * pulse * mix(1, 0.6, sstep(0, 0.3, g)), 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

/* =====================================================================
 * 효과음 (임시). 실제 사운드로 바꿀 때는 onIntroCue(name)만 채우면 됨
 *   'helix' 이중나선이 풀려 나올 때 / 'coil' 껍질로 감길 때 / 'snail' 더듬이 끝이 켜질 때
 * ===================================================================== */
function audioOn() {
  if (!CFG.SOUND) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (err) { actx = null; }
}

function tonePluck(freq, at, dur, gain, pan, type) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let node = g;
  if (actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); node = p; }
  o.connect(g); node.connect(actx.destination);
  o.start(at); o.stop(at + dur + 0.05);
}

function cue(name) {
  if (typeof window.onIntroCue === 'function') window.onIntroCue(name);
  if (!actx || !CFG.SOUND) return;
  const now = actx.currentTime;
  if (name === 'helix') {
    // 구슬이 하나씩 켜지는 반짝임: 좌우로 번갈아 올라가는 음
    [659.3, 784, 880, 987.8, 1174.7, 1318.5, 1568].forEach((f, i) => tonePluck(f, now + i * 0.14, 0.7, 0.05, i % 2 ? 0.6 : -0.6));
  } else if (name === 'coil') {
    // 감기는 소리: 높은 곳에서 내려오는 바람 + 낮게 미끄러지는 음
    const len = 1.8, buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(3200, now); bp.frequency.exponentialRampToValueAtTime(260, now + len);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.09, now + 0.5); g.gain.linearRampToValueAtTime(0, now + len);
    src.connect(bp); bp.connect(g); g.connect(actx.destination); src.start(now);
    const o = actx.createOscillator(), og = actx.createGain();
    o.frequency.setValueAtTime(330, now); o.frequency.exponentialRampToValueAtTime(110, now + len);
    og.gain.setValueAtTime(0, now); og.gain.linearRampToValueAtTime(0.05, now + 0.4); og.gain.linearRampToValueAtTime(0, now + len);
    o.connect(og); og.connect(actx.destination); o.start(now); o.stop(now + len + 0.05);
  } else if (name === 'snail') {
    // 시작 알림 같은 두 음
    tonePluck(880, now, 1.1, 0.07, 0.25, 'triangle');
    tonePluck(1318.5, now + 0.11, 1.4, 0.06, 0.4, 'triangle');
  }
}

/* =====================================================================
 * p5
 * ===================================================================== */
function stageBox() {
  const host = document.getElementById('stage');
  const w = host ? host.clientWidth : windowWidth;
  const h = host ? host.clientHeight : windowHeight;
  return { host, w: Math.max(200, w || 800), h: Math.max(150, h || 600) };
}

function fitView() {
  const k = Math.min(width / REF_W, height / REF_H);
  view = { k, ox: (width - REF_W * k) / 2, oy: (height - REF_H * k) / 2 };
}

function restartIntro() {
  t0 = millis();
  fired = {};
  doneCalled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function setup() {
  const b = stageBox();
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  const c = createCanvas(b.w, b.h);
  if (b.host) c.parent(b.host);
  ctx = drawingContext;
  fitView();
  SN = snailTarget();
  SP = buildShell();
  restartIntro();
  // 제목 글꼴이 늦게 오면 받은 뒤 처음부터
  if (document.fonts && document.fonts.load) {
    document.fonts.load(TITLE.font).then(() => restartIntro()).catch(() => {});
  }
}

function draw() {
  ctx = drawingContext;
  const tm = (millis() - t0) / 1000 * CFG.SPEED;
  const dpr = pixelDensity();
  const dt = Math.min(deltaTime, 50) / 1000;

  // 잔상: 나선이 도는 동안만 남기고, 달팽이가 될 때는 지움
  const e3 = prog(tm, TL.loop);
  const trail = tm < TL.grow[0] ? 0 : CFG.TRAIL * (1 - sstep(0, 0.8, e3));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.pow(trail, dt * 60)).toFixed(3) + ')';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.ox, dpr * view.oy);

  // 신호
  if (tm >= TL.grow[0] && !fired.helix) { fired.helix = true; cue('helix'); }
  if (tm >= TL.coil[0] && !fired.coil) { fired.coil = true; cue('coil'); }
  if (tm >= TL.ears[0] + (TL.ears[1] - TL.ears[0]) * 0.72 && !fired.snail) { fired.snail = true; cue('snail'); }

  if (tm < TL.grow[1]) drawTitle(tm);

  const earGrow = easeIO(prog(tm, TL.ears));
  if (tm < TL.loop[1]) {
    const C = centerline(tm);
    if (tm >= TL.grow[0]) drawHelix(tm, C);
    if (C.e3 > 0) {
      const lineA = sstep(0.45, 0.92, C.e3);
      drawAntenna('L', tm, earGrow, 1);
      // 몸 안을 검정으로 채워 뒤의 선을 가림 (앱과 같음)
      const fillA = sstep(0.65, 1, C.e3) * 0.88;
      if (fillA > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,' + fillA.toFixed(3) + ')';
        ctx.beginPath(); C.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      scopeStroke(C.pts, C.e3 > 0.98, 1, lineA);
      drawAntenna('R', tm, earGrow, 1);
    }
  } else {
    // 끝: 첫 검사 화면의 달팽이와 똑같이
    const outline = bodyOutline(tm);
    drawAntenna('L', tm, earGrow, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.beginPath(); outline.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
    ctx.restore();
    scopeStroke(outline, true, 1, 1);
    drawAntenna('R', tm, earGrow, 1);
  }

  if (tm >= INTRO_SEC && !doneCalled) {
    doneCalled = true;
    if (typeof window.onIntroDone === 'function') window.onIntroDone();
  }
}

function windowResized() {
  const b = stageBox();
  resizeCanvas(b.w, b.h);
  fitView();
}

function mousePressed() {
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;
  audioOn();
  restartIntro();
}

function touchStarted() {
  mousePressed();
  return false;
}
