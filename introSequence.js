/** Adapted from the delivered ref/intro-sketch.js (2026-11-17). */
const IntroSequence = (() => {
  const REF_W = 1024, REF_H = 768;

  /* ───────────── 조절값 ───────────── */
  const CFG = {
    SPEED: 1,              // 전체 속도 (1.3 이면 30% 빠르게)
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

  const COL = { ink: COLORS.ink, accent: COLORS.accent };
  const N = 240;                                                     // 나선 가운데 길 점 개수

  // Dot positions are measured from the selected language's DOM title.
  const TITLE = { dots: [], dotR: 6.8 };

  /* ───────────── 상태 ───────────── */
  let ctx, view = { k: 1, ox: 0, oy: 0 };
  let t0 = 0;
  let SN;                 // 첫 검사 달팽이 자리 { cx, cy, groundY, R0 }
  let SP;                 // 껍질 나선 (미리 계산)
  let fired = {};
  let doneCalled = false;
  let actx = null;
  let active = false;
  let complete = null;
  let targetShape = null;
  let initialVolumeDb = null;
  let audio = null;

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeIO = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const prog = (t, r) => clamp01((t - r[0]) / (r[1] - r[0]));
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + clamp01(a).toFixed(3) + ')';

  const rainbow = rainbowColor;

  /* =====================================================================
   * 첫 검사 달팽이 (앱 visuals.js의 calculateUILayout · bodyShape · antennaStalks를 ① 시작 상태로 옮김)
   * ===================================================================== */
  function snailTarget() {
    const layout = calculateUILayout('PART1_VOLUME');
    const cfg = PART1_ADJUST.PART1_VOLUME;
    const scale = map(initialVolumeDb, cfg.min, cfg.max, SIZE_MIN, SIZE_MAX, true);
    const radius = layout.R0 * scale;
    cur = { ...targetParams(layout), cx: layout.cx, groundY: layout.groundY,
      R0: radius, face: 1, faceT: 1, move: 0 };
    return { cx: (layout.cx - view.ox) / view.k,
      groundY: (layout.groundY - view.oy) / view.k,
      R0: radius / view.k, cy: (layout.groundY - radius * .72 - view.oy) / view.k };
  }

  // 몸 윤곽의 한 점 (꼬리·머리 조절 전, 비트 없음)
  function bodyPoint(th) {
    const point = targetShape.pointAt(th);
    return [(point.x - view.ox) / view.k, (point.y - view.oy) / view.k];
  }

  function bodyOutline(tm) {
    const pts = [];
    for (let i = 0; i < 160; i++) pts.push(bodyPoint((i / 160) * Math.PI * 2, tm));
    // 소리가 없을 때 앱이 그리는 아주 옅은 숨결 (waveAt의 idle)
    const n = pts.length, amp = SN.R0 * 0.8;
    return pts.map((p, i) => {
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      const w = 0.015 * Math.sin((i / n) * 60 + millis() / 300) * amp;
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
    ctx.globalAlpha *= a;
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
    intro.before.style.opacity = textA;
    intro.after.style.opacity = textA;
    intro.wrap.querySelectorAll('.br').forEach((bracket, index) => {
      bracket.style.opacity = brA;
      bracket.style.left = (index === 0 ? 1 : -1) * 24 * view.k * easeIO(p) + 'px';
    });
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
   * 전달 스케치의 효과음. 앱의 AudioContext와 effects 버스·공통 안내 크기를 사용.
   *   'helix' 이중나선이 풀려 나올 때 / 'coil' 껍질로 감길 때 / 'snail' 더듬이 끝이 켜질 때
   * ===================================================================== */
  function audioOn() {
    actx = getAudioContext();
    const gain = actx.createGain();
    gain.gain.value = voiceGain();
    gain.connect(AudioMix.bus('effects'));
    audio = { gain, nodes: [], sources: [] };
  }

  function stopAudio(fade = 0) {
    const previous = audio;
    audio = null;
    if (!previous) return;
    previous.gain.gain.setTargetAtTime(0, actx.currentTime, .015);
    const dispose = () => {
      previous.sources.forEach(source => { try { source.stop(); } catch {} });
      previous.nodes.forEach(node => node.disconnect());
      previous.gain.disconnect();
    };
    if (fade) setTimeout(dispose, fade * 1000);
    else dispose();
  }

  function tonePluck(freq, at, dur, gain, pan, type) {
    const o = actx.createOscillator(), g = actx.createGain();
    audio.sources.push(o); audio.nodes.push(o, g);
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node = g;
    if (actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); audio.nodes.push(p); node = p; }
    o.connect(g); node.connect(audio.gain);
    o.start(at); o.stop(at + dur + 0.05);
  }

  function cue(name) {
    if (!audio || !CFG.SOUND) return;
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
      src.connect(bp); bp.connect(g); g.connect(audio.gain); src.start(now);
      audio.sources.push(src); audio.nodes.push(src, bp, g);
      const o = actx.createOscillator(), og = actx.createGain();
      o.frequency.setValueAtTime(330, now); o.frequency.exponentialRampToValueAtTime(110, now + len);
      og.gain.setValueAtTime(0, now); og.gain.linearRampToValueAtTime(0.05, now + 0.4); og.gain.linearRampToValueAtTime(0, now + len);
      o.connect(og); og.connect(audio.gain); o.start(now);
      audio.sources.push(o); audio.nodes.push(o, og); o.stop(now + len + 0.05);
    } else if (name === 'snail') {
      // 시작 알림 같은 두 음
      tonePluck(880, now, 1.1, 0.07, 0.25, 'triangle');
      tonePluck(1318.5, now + 0.11, 1.4, 0.06, 0.4, 'triangle');
    }
  }


  function fitView() {
    const k = Math.min(width / REF_W, height / REF_H);
    view = { k, ox: (width - REF_W * k) / 2, oy: (height - REF_H * k) / 2 };
    const dots = intro.wrap.querySelector('.dots');
    const rect = dots.getBoundingClientRect();
    const style = getComputedStyle(dots);
    const baselineProbe = document.createElement('span');
    baselineProbe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    dots.appendChild(baselineProbe);
    const baseline = baselineProbe.getBoundingClientRect().top;
    baselineProbe.remove();
    ctx.save();
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const metrics = ctx.measureText('…');
    ctx.restore();
    const radius = (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) / 2;
    const left = rect.left - metrics.actualBoundingBoxLeft;
    const right = rect.left + metrics.actualBoundingBoxRight;
    const y = baseline + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
    TITLE.dots = [left + radius, (left + right) / 2, right - radius]
      .map(x => [(x - view.ox) / k, (y - view.oy) / k]);
    TITLE.dotR = radius / k;
    DOTS_C[0] = TITLE.dots[1][0]; DOTS_C[1] = TITLE.dots[1][1];
    SN = snailTarget();
    SP = buildShell();
  }

  function start(volumeDb, onDone) {
    cancel();
    ctx = drawingContext;
    initialVolumeDb = volumeDb;
    complete = onDone;
    active = true;
    t0 = millis();
    fired = {};
    doneCalled = false;
    wave = null;
    snailInk = COLORS.ink.slice();
    snailGlow = COLORS.accent.slice();
    pulse = { kick: 0, snare: 0, hat: 0 };
    fitView();
    intro.wrap.querySelector('.dots').style.opacity = 0;
    audioOn();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  function cancel() {
    active = false;
    complete = null;
    stopAudio();
  }

  function resize() {
    if (active) fitView();
  }

  function draw() {
    if (!active) return;
    ctx = drawingContext;
    const tm = (millis() - t0) / 1000 * CFG.SPEED;
    const dpr = pixelDensity();
    const dt = Math.min(deltaTime, 50) / 1000;
    targetShape = bodyShape();
    if (audio) audio.gain.gain.value = voiceGain();
    const e3 = prog(tm, TL.loop);
    const trail = tm < TL.grow[0] ? 0 : CFG.TRAIL * (1 - sstep(0, 0.8, e3));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.pow(trail, dt * 60)).toFixed(3) + ')';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.ox, dpr * view.oy);

    if (tm >= TL.grow[0] && !fired.helix) { fired.helix = true; if (tm < TL.coil[0]) cue('helix'); }
    if (tm >= TL.coil[0] && !fired.coil) { fired.coil = true; if (tm < TL.loop[0]) cue('coil'); }
    if (tm >= TL.ears[0] + (TL.ears[1] - TL.ears[0]) * .72 && !fired.snail) { fired.snail = true; if (tm < INTRO_SEC) cue('snail'); }

    drawTitle(tm);
    const earGrow = easeIO(prog(tm, TL.ears));
    if (tm < TL.loop[1]) {
      const C = centerline(tm);
      if (tm >= TL.grow[0]) drawHelix(tm, C);
      if (C.e3 > 0) {
        const lineA = sstep(.45, .92, C.e3);
        drawAntenna('L', tm, earGrow, 1);
        const fillA = sstep(.65, 1, C.e3) * .88;
        if (fillA > 0) {
          ctx.fillStyle = 'rgba(0,0,0,' + fillA.toFixed(3) + ')';
          ctx.beginPath(); C.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
        }
        scopeStroke(C.pts, C.e3 > .98, 1, lineA);
        drawAntenna('R', tm, earGrow, 1);
      }
    } else {
      const outline = bodyOutline(tm);
      const handoff = sstep(TL.ears[1] - .2, INTRO_SEC, tm);
      ctx.save();
      ctx.globalAlpha = 1 - handoff;
      drawAntenna('L', tm, earGrow, 1);
      ctx.fillStyle = 'rgba(0,0,0,.88)';
      ctx.beginPath(); outline.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
      scopeStroke(outline, true, 1, 1);
      drawAntenna('R', tm, earGrow, 1);
      ctx.restore();
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = handoff;
      drawSnail();
      ctx.restore();
    }
    ctx.restore();
    if (tm >= INTRO_SEC && !doneCalled) {
      doneCalled = true;
      active = false;
      stopAudio(.08);
      const onDone = complete;
      complete = null;
      if (onDone) onDone();
    }
  }

  return { start, cancel, resize, draw, busy: () => active, durationMs: INTRO_SEC * 1000 };
})();
