/**
 * 청각 다변기 (Sound Variator) - Part 2 검사 (ref/part2 (1).html 을 옮김)
 *
 * 검사 설계·소리·횟수·채점은 ref 그대로이고, 답하는 방식만 이 앱의 손짓(톡 · 쓸기 · 껍질 굴리기 · 달팽이 꾹)으로 바꿨습니다.
 * ⑤ 고역 예민도 : 8→20 kHz 슬라이더. 달팽이를 오른쪽으로 밀어 소리가 사라지는 지점에서 멈추고 달팽이 꾹으로 답 확정 (사용자 지시 11/09)
 *               x축이 음고: 왼쪽 = 8kHz, 오른쪽 = 20kHz. 연속 사인파가 현재 위치의 주파수로 울림 → maxFreqHz, twist
 * ⑥ 중앙       : 가상의 방에 놓인 음원 6개(HRIR 68번 귀). 좌우로 쓸면 방 안에서 바라보는 방향이 돌고 달팽이도 같이 돎. 가운데면 달팽이 꾹 (2번) → centerDeg, centerImage
 * ⑦ 우세 귀     : 옥타브 착청(Deutsch 1974). 높은 음이 들린 쪽으로 달팽이를 기어가게 하고 손을 떼면 바로 답 (3번) → dominantEar
 * ⑧ 바탕음·배음 : 바탕음 없는 복합음 두 개. 올라감 = 오른쪽, 내려감 = 왼쪽으로 달팽이를 보내고 손을 떼면 바로 답 (예시 + 6번) → pitchMode
 *   ⑦⑧은 껍질이 아니라 달팽이가 직접 몸을 돌려 기어감 (사용자 지시 11/03). roll = 달팽이 자리
 *
 * 시행 횟수는 ref보다 줄였음(사용자 지시 11/02, 25번 → 12번쯤): ⑥ 3→2, ⑦ 6→3, ⑧ 연습 2+12 → 듣기만 하는 예시 + 6.
 * ⑧에서 남길 쌍(2·6·7번, 바탕음 프로필 a·b·c 하나씩)은 Claude가 고름
 *
 * 음악처럼 (사용자 지시 11/02 "적극적으로 음악 소리 바꿔도 됨" → 측정은 살리는 쪽을 고름). 박자는 120 BPM(P2_GROOVE):
 *   ⑦ 0.25초 음 · ⑧ 0.5초 음과 0.25초 쉼이 원래 120 BPM의 8분·4분음표라 측정 소리 길이는 그대로
 *   ⑤ 삐 간격만 0.3초 → 0.25초(8분음표). 뒤의 쿵쿵 비트는 뺌 (사용자 지시 11/06)
 *   ⑥ 말소리 대신 Part 1 비트를 120 BPM으로 그려서 머리 둘레로 돌림 (못 그리면 말소리로)
 *   ⑦ 밑에 4분음표 킥 (두 귀에 똑같이, 400/800 Hz와 떨어져 있음)
 *   ⑧ 앞에 하이햇 카운트인 (7 kHz 위라 배음과 안 겹침). 킥은 빠진 바탕음을 채울 수 있어 넣지 않음
 *   킥 · 하이햇 크기(P2_GROOVE의 dB)는 Claude가 정한 임시값
 *
 * 소리 크기는 ① 볼륨과 무관한 고정값입니다(ref와 같음, 명목 dB SPL, P2_CAL 기준). 그래서 masterGain을 거치지 않고
 * 따로 만든 part2Bus로 바로 출력합니다. 달팽이 파형이 움직이도록 FFT 분석기에도 곁가지로 잇습니다.
 * ref와 다른 점: [모르겠어요]·[못 찾겠어요] 답은 모두 없앰(사용자 지시 11/02).
 * 음성 안내(voice.js)는 지시문 순서대로. 검사 소리 앞 안내는 끊지 않고, 끝난 뒤 1초 뒤에 소리를 냄.
 * ⑦⑧은 안내 사이에 듣기만 하는 예시를 한 번 들려줌. ⑧의 답하는 연습은 이것으로 바뀜 (사용자 선택 11/05)
 * ⑤에서 삐 소리가 높아지는 동안 달팽이 선이 점점 더 꼬이고, 톡 하는 순간의 꼬임이 남음(사용자 지시, visuals.js helix)
 */

const P2_CAL = 90;                 // 0 dBFS 사인파가 헤드폰에서 몇 dB SPL인가 (ref의 임시값. 실기기 측정 전)
const P2_TIMING = { leadMs: 1000, gapMs: 600 }; // leadMs: 안내가 끝나고 검사 소리까지 (지시문: 1초 뒤)
const PART2_ROLL_SPAN = 2.4;       // 화면 너비만큼 굴렸을 때 바뀌는 양 (-1 ~ 1 전체가 2)
const PART2_SNAP = 0.85;          // 손을 떼면 껍질이 자리 잡는 곳 (왼쪽 -, 오른쪽 +)
const PART2_SIDE_THRESHOLD = 0.3; // 이보다 덜 굴리면 아직 고르지 않은 것
const PART2_MOVE_THRESHOLD = 0.25; // 이만큼은 굴려야 확정 가능
const CENTER_DEG_PER_WIDTH = 300;  // ⑥ 화면 너비만큼 쓸면 머리 둘레를 이만큼 돎
const CENTER_SIDE_DEG = 5;         // ⑥ 치우침이 이 안이면 코드에서 C(가운데)

const P2_GROOVE = { bpm: 120, earKickSpl: 54, hatSpl: 44, countIn: 4 };
const P2_BEAT_SEC = 60 / P2_GROOVE.bpm;

let part2Bus = null;
let part2Voices = [];      // 지금 울리는 소리 (단계를 넘기면 모두 끔)
let part2Ctrl = null;      // ⑥ 머리 둘레 소리 장치
let part2Timer = null;

function part2State() {
  return window.GlobalState.part2;
}

function p2Ctx() {
  return getAudioContext();
}

// ① 볼륨을 거치지 않는 Part 2 전용 출력
function p2Out() {
  if (!part2Bus) {
    const ctx = p2Ctx();
    part2Bus = ctx.createGain();
    part2Bus.connect(AudioMix.bus('part2'));
    const fft = window.GlobalState.audioNodes.fft;
    if (fft && fft.analyser) part2Bus.connect(fft.analyser);
  }
  return part2Bus;
}

/* =====================================================================
 * 공통 도구
 * ===================================================================== */

const p2Clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const splToAmp = (spl) => Math.pow(10, (spl - P2_CAL) / 20);
const round1 = (x) => Math.round(x * 10) / 10;
const wrap180 = (a) => ((a + 180) % 360 + 360) % 360 - 180;

// 올림 코사인 페이드 (0..1), i 번째 표본, 길이 n 의 처음·끝 r 표본
function fadeAt(i, n, r) {
  if (r <= 0) return 1;
  if (i < r) return 0.5 - 0.5 * Math.cos(Math.PI * i / r);
  if (i >= n - r) return 0.5 - 0.5 * Math.cos(Math.PI * (n - i) / r);
  return 1;
}

function p2Shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 버퍼 재생. 핸들의 startTime(오디오 시각)으로 누른 때를 잼
function p2Play(buffer) {
  const ctx = p2Ctx();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  src.connect(g);
  g.connect(p2Out());
  const t0 = ctx.currentTime + 0.03;
  src.start(t0);
  const v = { src, g, startTime: t0, ended: false, onEnd: null };
  src.onended = () => {
    v.ended = true;
    part2Voices = part2Voices.filter((x) => x !== v);
    if (v.onEnd) v.onEnd();
  };
  v.stop = (fade = 0.05) => {
    v.onEnd = null;
    const now = ctx.currentTime;
    try {
      g.gain.setValueAtTime(1, now);
      g.gain.linearRampToValueAtTime(0, now + fade);
      src.stop(now + fade + 0.01);
    } catch (e) { /* 이미 멈춤 */ }
  };
  part2Voices.push(v);
  return v;
}

// 버퍼(두 채널 모두)의 at 표본부터 킥 하나를 더함. Part 1 비트의 킥과 같은 모양 (140 → 45 Hz, 0.42초)
function p2AddKick(buf, at, spl) {
  const sr = buf.sampleRate, n = Math.min(Math.round(0.45 * sr), buf.length - at);
  if (n <= 0) return;
  const amp = splToAmp(spl) * Math.SQRT2, L = buf.getChannelData(0), R = buf.getChannelData(1);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = t < 0.12 ? 140 * Math.pow(45 / 140, t / 0.12) : 45;
    ph += 2 * Math.PI * f / sr;
    const env = t < 0.004 ? t / 0.004 : Math.exp(Math.log(1e-4) * (t - 0.004) / 0.42);
    const v = amp * env * Math.sin(ph);
    L[at + i] += v;
    R[at + i] += v;
  }
}

// 닫힌 하이햇 하나 (잡음 → 7 kHz 하이패스, 0.045초)
function p2AddHat(buf, at, spl) {
  const sr = buf.sampleRate, n = Math.min(Math.round(0.06 * sr), buf.length - at);
  if (n <= 0) return;
  const w = 2 * Math.PI * 7000 / sr, al = Math.sin(w) / Math.SQRT2, c = Math.cos(w), a0 = 1 + al;
  const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  const amp = splToAmp(spl) * 2, L = buf.getChannelData(0), R = buf.getChannelData(1);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1, y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const t = i / sr, env = t < 0.002 ? t / 0.002 : Math.exp(Math.log(1e-4) * (t - 0.002) / 0.045);
    L[at + i] += amp * env * y;
    R[at + i] += amp * env * y;
  }
}

/* =====================================================================
 * ⑤ 고역 예민도 (ref js/tests/sensitivity.js)
 * 경로 u (0→1): 주파수 8 → 16 kHz (로그), 크기 60 → 15 dB SPL(명목). 0.2초 켜짐 · 0.05초 꺼짐(120 BPM 8분음표). 밑에 4분음표 킥.
 * 안 들리게 되는 순간 누름. 누른 시각에서 반응 시간 rtSec을 뺌. 소리 전에 누르면 마지막에 한 번 더.
 * ===================================================================== */

// 슬라이더 방식: 왼쪽(8kHz) → 오른쪽(20kHz) 사인파. 달팽이를 오른쪽으로 밀어 사라지는 지점에서 손을 뗌
const SENS = { f0: 8000, f1: 20000, spl: 65 };
const sensFreqAt = (u) => SENS.f0 * Math.pow(SENS.f1 / SENS.f0, u);

// 슬라이더 고역 한계 로직: 1회 조절, 최종 u 위치를 기록
function sensSliderLogic() {
  let finalU = null;
  return {
    next() { return finalU === null ? { index: 1, total: 1 } : null; },
    setAnswer(u) { finalU = u; },
    result() {
      if (finalU === null) return { valid: false };
      return {
        valid: true, u: finalU,
        hz: Math.round(sensFreqAt(finalU)),
        sensitivity: Math.round(finalU * 100)
      };
    },
    progress() { return ''; }
  };
}

// 연속 사인파 오실레이터 (슬라이더 움직임에 따라 주파수 실시간 변경)
let sensOsc = null;

function sensToneStart(freqHz) {
  sensToneStop();
  const ctx = p2Ctx();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freqHz;
  g.gain.value = splToAmp(SENS.spl);
  osc.connect(g);
  g.connect(p2Out());
  osc.start();
  sensOsc = { osc, g };
}

function sensToneSetFreq(freqHz) {
  if (!sensOsc) return;
  sensOsc.osc.frequency.setTargetAtTime(freqHz, p2Ctx().currentTime, 0.015);
}

function sensToneStop() {
  if (!sensOsc) return;
  try {
    const t = p2Ctx().currentTime;
    sensOsc.g.gain.setTargetAtTime(0, t, 0.02);
    sensOsc.osc.stop(t + 0.1);
    sensOsc.osc.disconnect();
    sensOsc.g.disconnect();
  } catch (e) {}
  sensOsc = null;
}

/* =====================================================================
 * ⑥ 중앙 (ref js/tests/center.js)
 * 가상의 방 안 정해진 자리에 모노 음원 6개를 놓고(CENTER_ROOM), 좌우로 끌면 방 안에서 바라보는 방향이 돎 (사용자 지시 11/12).
 * 음원마다 68번 귀 HRIR(36방향)로 자리를 만들고, 고개를 돌리면 여섯 자리가 함께 돎. 지금 음원은 비트의 악기 6개(임시. 파일 6개가 오면 교체).
 * 가운데의 기준은 정면에 놓인 킥(사용자 확정): 결과 = 킥의 좌우 치우침(°, + 오른쪽). 앞뒤는 묻지 않음. 시작은 킥이 좌우로 45–90° 치우친 곳.
 * 달팽이는 끈 각도만큼 정확히 따라 돎(visuals.js의 turnOutline). 시작 자세는 늘 같아서 어디가 가운데인지 알려 주지 않음.
 * ===================================================================== */

const CENTER_TEST = {
  trials: 2, minValid: 2, minMoveDeg: 3, spl: 65,
  hrirFile: 'media/part2/ear068.f32', voiceFile: 'media/part2/voice.wav',
  nDir: 36, taps: 256, irRate: 48000, rampSec: 0.02, fadeInSec: 1.0
};
// 방 안의 음원 자리: stem 비트 악기, deg 정면(킥) 기준 방위(+ 오른쪽), dist 거리(멀수록 작게). 자리와 거리는 Claude가 정함
const CENTER_ROOM = [
  { stem: 'kick', deg: 0, dist: 1 },
  { stem: 'sub', deg: 180, dist: 1.5 },
  { stem: 'snare', deg: -55, dist: 1.25 },
  { stem: 'blip', deg: 55, dist: 1.25 },
  { stem: 'hat', deg: -125, dist: 1.45 },
  { stem: 'chop', deg: 125, dist: 1.45 }
];
let centerAssets = null; // Promise → { irs, sources: [{ buf, deg, dist }], gain }

function centerLogic() {
  const finals = [];
  let i = 0;
  return {
    next() {
      if (i >= CENTER_TEST.trials) return null;
      i++;
      const side = Math.random() < 0.5 ? -1 : 1, lat = 45 + Math.random() * 45;
      const off = wrap180(Math.random() < 0.5 ? side * lat : side * (180 - lat));
      return { index: i, total: CENTER_TEST.trials, off };
    },
    answer(tr, key, st) {
      const rad = st.angle * Math.PI / 180;
      const lat = Math.round(Math.asin(Math.sin(rad)) * 1800 / Math.PI) / 10; // 앞이든 뒤든 가운데 = 0, + 오른쪽
      finals.push({ off: round1(tr.off), angle: round1(st.angle), lat, moved: round1(st.moved), ms: st.ms, ok: true });
      return null;
    },
    result() {
      const ok = finals.filter((f) => f.ok);
      const base = { trials: finals, validN: ok.length };
      if (ok.length < CENTER_TEST.minValid) return { ...base, valid: false, code: 'Rx' };
      const deg = round1(ok.reduce((s, f) => s + f.lat, 0) / ok.length);
      return { ...base, valid: true, deg, code: `R${Math.round(deg)}` };
    },
    soFar() { return finals.length ? finals.reduce((s, f) => s + f.lat, 0) / finals.length : null; },
    progress() { return `${Math.min(i, CENTER_TEST.trials)} / ${CENTER_TEST.trials}`; }
  };
}

// 36방향 HRIR 쌍 (왼귀 = H[k], 오른귀 = H[−k]). 방향 k 의 각도 = −10k (+ 오른쪽). 한 번만 읽음
function prepareCenter() {
  if (centerAssets) return centerAssets;
  const ctx = p2Ctx();
  centerAssets = (async () => {
    const raw = new Float32Array(await (await fetch(CENTER_TEST.hrirFile)).arrayBuffer());
    const n = Math.round(CENTER_TEST.taps * ctx.sampleRate / CENTER_TEST.irRate);
    const tap = (k) => {
      const src = raw.subarray(k * CENTER_TEST.taps, (k + 1) * CENTER_TEST.taps);
      if (n === CENTER_TEST.taps) return src;
      const out = new Float32Array(n), r = CENTER_TEST.taps / n;
      for (let i = 0; i < n; i++) { const x = i * r, j = Math.floor(x), f = x - j; out[i] = (src[j] || 0) * (1 - f) + (src[j + 1] || 0) * f; }
      return out;
    };
    const irs = [];
    for (let k = 0; k < CENTER_TEST.nDir; k++) {
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      b.getChannelData(0).set(tap(k));
      b.getChannelData(1).set(tap((CENTER_TEST.nDir - k) % CENTER_TEST.nDir));
      irs.push(b);
    }
    // 크기 기준은 전체 비트로 재고, 같은 게인을 악기 6개에 똑같이 씀 (악기 사이 비율 유지)
    let voice, sources;
    try {
      voice = await renderBeatLoop(P2_GROOVE.bpm, 'FULL');
      sources = [];
      for (const spot of CENTER_ROOM) sources.push({ ...spot, buf: await renderBeatLoop(P2_GROOVE.bpm, 'FULL', 1, spot.stem) });
    } catch (e) {
      const ab = await (await fetch(CENTER_TEST.voiceFile)).arrayBuffer();
      voice = await new Promise((res, rej) => {
        const p = ctx.decodeAudioData(ab, res, rej);
        if (p && p.then) p.then(res, rej);
      });
      sources = [{ buf: voice, deg: 0, dist: 1 }]; // 비트를 못 그리면 말소리 하나만 정면에
    }
    // Calibrate the actual filtered beat. IR energy alone assumes white noise rather
    // than the spectrum of this band-limited source. One gain for all angles
    // preserves the HRIR's left/right balance, phase and directional level differences.
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const reference = new Off(2, voice.length + n, ctx.sampleRate);
    const src = reference.createBufferSource(), conv = reference.createConvolver();
    src.buffer = voice; conv.normalize = false; conv.buffer = irs[0];
    src.connect(conv); conv.connect(reference.destination); src.start(0);
    const rendered = await reference.startRendering();
    const measured = measureLoudness(bufferChannels(rendered), rendered.sampleRate);
    const gain = splToAmp(CENTER_TEST.spl) / Math.SQRT2 / measured.kRms;
    return { irs, sources, gain };
  })();
  centerAssets.catch(() => { centerAssets = null; }); // 실패하면 다음에 다시 읽음
  return centerAssets;
}

// 음원 하나를 각도 a 에 놓는 장치 (ref와 같음: 두 칸의 컨볼버를 섞고, 램프를 취소하지 않아 돌릴 때 지지직이 없음)
function centerPlacer(ctx, bus, A, buf, startAngle) {
  const N = CENTER_TEST.nDir;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const level = ctx.createGain();
  level.gain.value = 0;
  src.connect(level);
  const slots = [0, 1].map(() => { const g = ctx.createGain(); g.gain.value = 0; level.connect(g); return { g, conv: null, dir: -1, wt: 0 }; });
  function setConv(slot, dir) {
    const c = ctx.createConvolver();
    c.normalize = false;
    c.buffer = A.irs[dir];
    const old = slot.conv;
    if (old) { try { slot.g.disconnect(old); } catch (e) { /* 이미 끊김 */ } }
    slot.g.connect(c);
    c.connect(bus);
    slot.conv = c;
    slot.dir = dir;
    if (old) setTimeout(() => { try { old.disconnect(); } catch (e) { /* 이미 끊김 */ } }, 50);
  }
  const kOf = (a) => ((-a / 10) % N + N) % N;
  const slotOf = (dir) => slots[dir % 2];
  let angle = startAngle, stopped = false, timer = null;
  const k0 = kOf(angle);
  let cell = Math.floor(k0) % N, frac = k0 - Math.floor(k0);
  let endAt = 0;
  setConv(slotOf(cell), cell);
  setConv(slotOf((cell + 1) % N), (cell + 1) % N);
  slotOf(cell).wt = 1 - frac;
  slotOf((cell + 1) % N).wt = frac;
  slots.forEach((s) => { s.g.gain.value = s.wt; });
  function later(sec) { timer = setTimeout(pump, Math.max(1, sec * 1000 + 1)); }
  function pump() {
    timer = null;
    if (stopped) return;
    const now = ctx.currentTime;
    if (now < endAt) return later(endAt - now);
    const d = ((kOf(angle) - (cell + frac)) % N + N * 1.5) % N - N / 2;
    if (Math.abs(d) < 1e-9) return;
    if (d > 0 && frac >= 1 - 1e-9) {
      const nd = (cell + 2) % N;
      setConv(slotOf(nd), nd);
      cell = (cell + 1) % N; frac = 0;
      return pump();
    }
    if (d < 0 && frac <= 1e-9) {
      const nd = (cell - 1 + N) % N;
      setConv(slotOf(nd), nd);
      cell = nd; frac = 1;
      return pump();
    }
    frac = Math.min(1, Math.max(0, frac + d));
    const tS = now, tE = tS + CENTER_TEST.rampSec;
    [[slotOf(cell), 1 - frac], [slotOf((cell + 1) % N), frac]].forEach(([s, v]) => {
      s.g.gain.setValueAtTime(s.wt, tS);
      s.g.gain.linearRampToValueAtTime(v, tE);
      s.wt = v;
    });
    endAt = tE;
    later(CENTER_TEST.rampSec);
  }
  return {
    src, level,
    setAngle(a) { angle = a; if (!timer && !stopped) pump(); },
    stop() {
      stopped = true;
      if (timer) { clearTimeout(timer); timer = null; }
      setTimeout(() => { slots.forEach((s) => { try { s.g.disconnect(); if (s.conv) s.conv.disconnect(); } catch (e) { /* 무시 */ } }); }, 150);
    }
  };
}

// 방 전체: 음원마다 자리 장치를 하나씩. angle = 정면 기준(킥)이 지금 들리는 방위(+ 오른쪽). 돌리면 모든 음원이 같이 돎
function startCenter(tr, A) {
  const ctx = p2Ctx(), bus = p2Out();
  let angle = tr.off, moved = 0, stopped = false;
  const t0 = performance.now();
  const tF = ctx.currentTime + 0.03; // 여섯 음원을 같은 순간에 시작해 박자가 어긋나지 않게
  const placers = A.sources.map((spot) => {
    const pl = centerPlacer(ctx, bus, A, spot.buf, wrap180(angle + spot.deg));
    pl.gain = A.gain / spot.dist;
    pl.level.gain.setValueAtTime(0, tF); // 갑자기 귀에 붙지 않게 천천히 들어옴
    pl.level.gain.linearRampToValueAtTime(pl.gain, tF + CENTER_TEST.fadeInSec);
    pl.src.start(tF);
    return { pl, deg: spot.deg };
  });
  return {
    turn(deltaDeg) {
      if (!deltaDeg || stopped) return;
      const a = wrap180(angle + deltaDeg);
      moved += Math.abs(wrap180(a - angle));
      angle = a;
      placers.forEach(({ pl, deg }) => pl.setAngle(wrap180(angle + deg)));
    },
    state() { return { angle, moved, ms: Math.round(performance.now() - t0) }; },
    alive() { return !stopped; },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime, k = Math.min(1, Math.max(0, (now - tF) / CENTER_TEST.fadeInSec));
      placers.forEach(({ pl }) => {
        pl.level.gain.cancelScheduledValues(now);
        pl.level.gain.setValueAtTime(pl.gain * k, now);
        pl.level.gain.linearRampToValueAtTime(0, now + 0.05);
        try { pl.src.stop(Math.max(now, tF) + 0.07); } catch (e) { /* 이미 멈춤 */ }
        pl.stop();
      });
    }
  };
}

/* =====================================================================
 * ⑦ 우세 귀 — 옥타브 착청 (ref js/tests/octave.js)
 * 400 Hz 와 800 Hz 가 0.25초씩(120 BPM 8분음표) 두 귀에 엇갈려 번갈아(틈 없이) 4초, 밑에 4분음표 킥.
 * "높은 음이 어디서 들리나". 3번(홀수라 비기지 않음), 다시 듣기 한 번.
 * ===================================================================== */

const OCT = { lowHz: 400, highHz: 800, toneMs: 250, tones: 16, spl: 60, xfadeMs: 4, edgeMs: 20, trials: 3, replay: 1 };

function octLogic() {
  const answers = [];
  let n = 0;
  return {
    next() {
      if (n >= OCT.trials) return null;
      n++;
      return { index: n, total: OCT.trials, startHigh: Math.random() < 0.5 ? 'L' : 'R' };
    },
    answer(tr, key, rtMs) {
      answers.push({ index: tr.index, startHigh: tr.startHigh, key, rtMs: Math.round(rtMs) });
      return null;
    },
    result() {
      const lr = answers.filter((a) => a.key === 'L' || a.key === 'R');
      const nR = lr.filter((a) => a.key === 'R').length, nL = lr.length - nR;
      const base = { answers, nR, nL, nU: answers.length - lr.length };
      if (lr.length < 3) return { ...base, valid: false, reason: 'unsure', code: 'Dx' };
      if (nR === nL) return { ...base, valid: false, reason: 'even', code: 'Dx' };
      const side = nR > nL ? 'R' : 'L';
      const consistency = Math.max(nR, nL) / lr.length;
      const strength = (consistency - 0.5) * 2; // 3:0 → 1, 2:1 → .33
      const d = (side === 'R' ? 1 : -1) * Math.round(strength * 100);
      return { ...base, valid: true, side, consistency, strength, weak: strength < 0.6, code: 'D' + d };
    },
    progress() { return `${Math.min(n, OCT.trials)} / ${OCT.trials}`; }
  };
}

function octBuffer(tr) {
  const ctx = p2Ctx();
  const sr = ctx.sampleRate, nTone = Math.round(OCT.toneMs / 1000 * sr), n = nTone * OCT.tones;
  const x = Math.max(1, Math.round(OCT.xfadeMs / 1000 * sr)), edge = Math.round(OCT.edgeMs / 1000 * sr);
  const buf = ctx.createBuffer(2, n, sr), L = buf.getChannelData(0), R = buf.getChannelData(1);
  const amp = splToAmp(OCT.spl);
  const highLeftAt = (k) => (k % 2 === 0) === (tr.startHigh === 'L');
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / nTone), j = i - k * nTone, now = highLeftAt(k) ? 1 : 0;
    let h = now;
    if (k > 0 && j < x) { const before = highLeftAt(k - 1) ? 1 : 0, w = 0.5 - 0.5 * Math.cos(Math.PI * j / x); h = before + (now - before) * w; }
    const e = amp * fadeAt(i, n, edge), sH = Math.sin(2 * Math.PI * OCT.highHz * i / sr), sL = Math.sin(2 * Math.PI * OCT.lowHz * i / sr);
    L[i] = e * (h * sH + (1 - h) * sL);
    R[i] = e * ((1 - h) * sH + h * sL);
  }
  for (let k = 0; k < OCT.tones; k += 2) p2AddKick(buf, k * nTone, P2_GROOVE.earKickSpl);
  return buf;
}

/* =====================================================================
 * ⑧ 바탕음 귀 · 배음 귀 (ref js/tests/f0.js, Seither-Preisler 외 2007 AAT 줄인 판)
 * AB: 실제 배음은 올라가고 귀가 채우는 바탕음은 내려감. 3쌍 × 두 순서 = 6번, 앞에 듣기만 하는 예시 1번. 다시 듣기 한 번.
 * ===================================================================== */

const F0 = { toneMs: 500, gapMs: 250, rampMs: 10, spl: 60, pairIds: [2, 6, 7], replay: 1 };
const F0_PROF = { a: { lo: [2, 4], hi: [5, 10] }, b: { lo: [3, 6], hi: [7, 14] }, c: { lo: [4, 8], hi: [9, 18] } };
const F0_PAIRS = [
  { id: 1, p: 'a', iv: '장3도', hi: 250, lo: 200 }, { id: 2, p: 'a', iv: '완전4도', hi: 320, lo: 240 }, { id: 3, p: 'a', iv: '완전5도', hi: 300, lo: 200 },
  { id: 4, p: 'b', iv: '장3도', hi: 200, lo: 160 }, { id: 5, p: 'b', iv: '완전4도', hi: 240, lo: 180 }, { id: 6, p: 'b', iv: '완전5도', hi: 270, lo: 180 },
  { id: 7, p: 'c', iv: '완전4도', hi: 160, lo: 120 }, { id: 8, p: 'c', iv: '완전5도', hi: 180, lo: 120 },
  { id: 9, p: 'a', iv: '장2도', hi: 270, lo: 240 }, { id: 10, p: 'b', iv: '장2도', hi: 225, lo: 200 }
];
const F0_EXAMPLE = { id: 'w1', p: 'a', iv: '완전4도', hi: 360, lo: 270, order: 'AB' }; // 듣기만 하는 예시 (답을 받지 않음)

function f0Logic() {
  const pairs = F0_PAIRS.filter((x) => F0.pairIds.includes(x.id));
  let main;
  do { main = p2Shuffle(pairs.flatMap((x) => [{ ...x, order: 'AB' }, { ...x, order: 'BA' }]), Math.random); }
  while (main.some((x, k) => k > 0 && main[k - 1].id === x.id)); // 같은 쌍이 붙어 나오지 않게
  const resp = [];
  let i = 0;
  return {
    next() {
      if (i >= main.length) return null;
      return { ...main[i++], index: i, total: main.length };
    },
    answer(tr, key, rtMs) {
      const f0dir = tr.order === 'AB' ? 'down' : 'up';
      resp.push({ id: tr.id, iv: tr.iv, p: tr.p, order: tr.order, key, rtMs: Math.round(rtMs),
        mode: key === 'unsure' ? null : key === f0dir ? 'F0' : 'SP' });
      return null;
    },
    result() {
      const R = resp;
      const F = R.filter((x) => x.mode === 'F0').length, S = R.filter((x) => x.mode === 'SP').length;
      const U = R.length - F - S, n = F + S;
      const up = R.filter((x) => x.key === 'up').length, down = R.filter((x) => x.key === 'down').length;
      const base = { answers: R, F, S, U, n };
      if (n < Math.ceil(F0.pairIds.length * 2 * 0.6)) return { ...base, valid: false, reason: 'unsure', code: 'Bx' };
      if (Math.max(up, down) / n >= 0.875) return { ...base, valid: false, reason: 'oneSide', code: 'Bx' };
      const idx = Math.round((F - S) / n * 100);
      const cat = idx >= 50 ? 'f0' : idx <= -50 ? 'spectral' : 'both';
      return { ...base, valid: true, idx, cat, code: 'B' + idx };
    },
    soFar() { return { F: resp.filter((x) => x.mode === 'F0').length, S: resp.filter((x) => x.mode === 'SP').length }; },
    progress() { return `${i} / ${main.length}`; }
  };
}

// 바탕음 f0 의 h1..h2 번 배음, 배음 크기 1/h, 같은 RMS (명목 dB SPL)
function f0Tone(sr, f0, h1, h2) {
  const n = Math.round(F0.toneMs / 1000 * sr), r = Math.round(F0.rampMs / 1000 * sr), d = new Float32Array(n);
  for (let h = h1; h <= h2; h++) {
    const w = 2 * Math.PI * h * f0 / sr, a = 1 / h;
    for (let i = 0; i < n; i++) d[i] += a * Math.sin(w * i);
  }
  let e = 0;
  for (let i = 0; i < n; i++) e += d[i] * d[i];
  const g = splToAmp(F0.spl) / Math.SQRT2 / Math.sqrt(e / n);
  for (let i = 0; i < n; i++) d[i] *= g * fadeAt(i, n, r);
  return d;
}

function f0Buffer(tr) {
  const ctx = p2Ctx();
  const sr = ctx.sampleRate, P = F0_PROF[tr.p];
  const A = f0Tone(sr, tr.hi, P.lo[0], P.lo[1]), B = f0Tone(sr, tr.lo, P.hi[0], P.hi[1]);
  const first = tr.order === 'AB' ? A : B, second = tr.order === 'AB' ? B : A, gap = Math.round(F0.gapMs / 1000 * sr);
  // 앞에 8분음표 하이햇 카운트인
  const eighth = Math.round(P2_BEAT_SEC / 2 * sr), lead = eighth * P2_GROOVE.countIn;
  const buf = ctx.createBuffer(2, lead + first.length + gap + second.length, sr);
  for (const ch of [0, 1]) { const d = buf.getChannelData(ch); d.set(first, lead); d.set(second, lead + first.length + gap); }
  for (let k = 0; k < P2_GROOVE.countIn; k++) p2AddHat(buf, k * eighth, P2_GROOVE.hatSpl - (k % 2 ? 4 : 0));
  return buf;
}

/* =====================================================================
 * 단계 진행
 * phase: 'lead'(안내) → ⑦⑧ 'example'(듣기만 하는 예시) · 'lead' → 시행마다
 *   ⑤ 'pressing'(소리 나는 동안 톡) → 'choice'(더듬이 톡 또는 꾹)  ⑥ 'adjusting'(쓸어서 돌리고 꾹)  ⑦⑧ 'playing'(답 잠김) → 'answer'(끌고 손 떼기)
 *   → 'wait'(다음 시행까지) → … → 다음 단계
 * ===================================================================== */

// voice: 시작 안내(앞 단계의 확정 안내가 맨 앞), example: 듣기만 하는 예시 소리, voiceAfter: 예시 뒤 안내
const PART2_TESTS = {
  PART2_SENSITIVITY: { logic: sensSliderLogic, voice: 'sensitivityIntro' },
  PART2_CENTER: { logic: centerLogic, voice: 'centerIntro' },
  PART2_EAR: {
    logic: octLogic, buffer: octBuffer, replay: OCT.replay, voice: 'earIntro',
    example: () => octBuffer({ startHigh: Math.random() < 0.5 ? 'L' : 'R' }), voiceAfter: ['7-2', '7-3', '7-4', '7-5']
  },
  PART2_PITCH: {
    logic: f0Logic, buffer: f0Buffer, replay: F0.replay, voice: 'pitchIntro',
    example: () => f0Buffer(F0_EXAMPLE), voiceAfter: ['8-2', '8-3', '8-4', '8-5']
  }
};

function isPart2Stage(stage) {
  return !!PART2_TESTS[stage];
}

function part2Later(ms, fn) {
  const p2 = part2State();
  const tok = p2.token;
  clearTimeout(part2Timer);
  part2Timer = setTimeout(() => { if (tok === p2.token) fn(); }, ms);
}

/**
 * 단계 시작 (part1_audio.js의 goToStep()에서 호출)
 */
function beginPart2Stage(stage) {
  const p2 = part2State();
  p2.token++;
  p2.logic = PART2_TESTS[stage].logic();
  p2.trial = null;
  p2.phase = 'lead';
  p2.note = null;
  p2.roll = 0;
  p2.moved = 0;
  p2.spin = 0;
  p2.frozenU = null;
  prepareCenter().catch(() => {}); // ⑥ 소리를 미리 읽어 둠
  part2Intro(PART2_TESTS[stage]);
}

// 새 한/영 지시문: 시작 안내 → 1초 뒤 첫 시행 (⑦⑧ 예시 없음)
async function part2Intro(test) {
  const p2 = part2State();
  const tok = p2.token;
  lockInput();
  await say(voicePlan(test.voice));
  if (tok !== p2.token) return;
  part2Later(P2_TIMING.leadMs, () => {
    unlockInput(0);
    part2Next();
  });
}

function part2Next() {
  const p2 = part2State();
  const tr = p2.logic.next();
  if (!tr) return finishPart2Stage();
  p2.trial = tr;
  const stage = window.GlobalState.currentStage;
  p2.replayLeft = currentLang() === 'en' ? 0 : (PART2_TESTS[stage].replay || 0);
  if (stage === 'PART2_CENTER' && tr.index > 1) {
    // 두 번째 검사음은 안내 없이 1초 뒤 (지시문)
    p2.phase = 'lead';
    part2Later(P2_TIMING.leadMs, () => {
      unlockInput(0);
      part2Present(tr);
    });
    return;
  }
  part2Present(tr);
}

function part2Present(tr) {
  const p2 = part2State();
  const stage = window.GlobalState.currentStage;
  const tok = ++p2.token;
  p2.note = null;
  stopPart2Sounds();

  if (stage === 'PART2_SENSITIVITY') {
    p2.phase = 'adjusting';
    p2.roll = -1; // 맨 왼쪽에서 시작 (8 kHz)
    p2.moved = 0;
    p2.confirmGuide = false;
    p2.lastDragAt = millis();
    sensToneStart(sensFreqAt(0));
    return;
  }

  if (stage === 'PART2_CENTER') {
    p2.phase = 'loading';
    p2.moved = 0;
    prepareCenter().then((A) => {
      if (tok !== p2.token) return;
      part2Ctrl = startCenter(tr, A);
      p2.phase = 'adjusting';
    }, () => {
      // 소리를 못 읽으면 잠시 뒤 다시 (전시 중 멈추지 않게)
      if (tok === p2.token) part2Later(2000, () => part2Present(tr));
    });
    return;
  }

  // ⑦ ⑧ 듣고 답하기
  p2.phase = 'playing';
  p2.roll = 0;
  p2.moved = 0;
  if (!tr._buf) tr._buf = PART2_TESTS[stage].buffer(tr);
  const v = p2Play(tr._buf);
  v.onEnd = () => {
    if (tok !== p2.token) return;
    p2.phase = 'answer';
    p2.answerAt = millis();
  };
}

// 답한 뒤. (⑤는 슬라이더 방식으로 finishPart2Stage를 직접 호출하므로 여기 오지 않음)
function part2AfterAnswer(key, value) {
  const p2 = part2State();
  p2.token++;
  p2.phase = 'wait';
  p2.logic.answer(p2.trial, key, value);
  part2Later(P2_TIMING.gapMs, part2Next);
}

async function finishPart2Stage() {
  const stage = window.GlobalState.currentStage;
  const p2 = part2State();
  const res = p2.logic.result();
  storePart2Result(stage, res);
  stopPart2Sounds();
  confirmStep();
}

/**
 * 결과를 psychoProfile에 (원래 결과 객체는 raw에 그대로)
 */
function storePart2Result(stage, r) {
  const psy = window.GlobalState.psychoProfile;
  if (stage === 'PART2_SENSITIVITY') {
    psy.raw.sensitivity = r;
    psy.twist = r.valid ? r.u : null;
    psy.maxFreqHz = r.valid ? r.hz : null;
    psy.sensitivity = r.valid ? r.sensitivity : null;
  } else if (stage === 'PART2_CENTER') {
    psy.raw.center = r;
    psy.centerDeg = r.valid ? r.deg : null;
    psy.centerImage = !r.valid ? null : Math.abs(r.deg) <= CENTER_SIDE_DEG ? 'C' : r.deg > 0 ? 'R' : 'L';
  } else if (stage === 'PART2_EAR') {
    psy.raw.octave = r;
    psy.dominantEar = r.valid ? (r.side === 'R' ? 'RIGHT' : 'LEFT') : null;
    psy.earStrength = r.valid ? Math.round(r.strength * 100) : null;
  } else if (stage === 'PART2_PITCH') {
    psy.raw.f0 = r;
    psy.pitchMode = r.valid ? { f0: 'F', both: 'B', spectral: 'H' }[r.cat] : null;
    psy.pitchIndex = r.valid ? r.idx : null;
  }
}

function resetPsychoProfile() {
  Object.assign(window.GlobalState.psychoProfile, {
    maxFreqHz: null, sensitivity: null, centerDeg: null, centerImage: null,
    dominantEar: null, earStrength: null, pitchMode: null, pitchIndex: null, twist: null,
    raw: { sensitivity: null, center: null, octave: null, f0: null }
  });
}

function stopPart2Sounds() {
  clearTimeout(part2Timer);
  part2Voices.forEach((v) => v.stop(0.03));
  part2Voices = [];
  if (part2Ctrl) { part2Ctrl.stop(); part2Ctrl = null; }
  sensToneStop();
  const p2 = part2State();
  p2.voice = null;
}

// 단계를 떠날 때 (part1_audio.js goToStep / restartFlow)
function leavePart2() {
  part2State().token++;
  stopPart2Sounds();
}

function isPart2Playing() {
  const ph = part2State().phase;
  return ph === 'playing' || ph === 'lead' || ph === 'example' || ph === 'loading';
}

// 매 프레임 (part1_audio.js의 updateFlow()에서 호출). 지금은 할 일 없음
function updatePart2() {
  const p2 = part2State();
  if (window.GlobalState.currentStage !== 'PART2_SENSITIVITY' || p2.phase !== 'adjusting') return;
  if (p2.moved >= PART2_MOVE_THRESHOLD && !p2.confirmGuide && !voiceBusy() && millis() - p2.lastDragAt > CONFIRM_VOICE_QUIET_MS) {
    p2.confirmGuide = true;
    say(voicePlan('sensitivityConfirm'));
  }
}

/* =====================================================================
 * 손짓 (main.js)
 * ===================================================================== */

/**
 * ⑤는 슬라이더 방식으로 바뀌어 톡 처리 불필요
 */
function part2Tap() { return false; }

/**
 * 좌우로 쓴 양(화면 너비 비율, 오른쪽 +). ⑤는 주파수 슬라이더, ⑥은 비트를 돌리고, ⑦⑧은 껍질을 굴림
 */
function dragRoll(dxRatio) {
  const p2 = part2State();
  const stage = window.GlobalState.currentStage;
  if (stage === 'PART2_SENSITIVITY') {
    if (p2.phase !== 'adjusting') return;
    p2.lastDragAt = millis();
    p2.moved += Math.abs(dxRatio * PART2_ROLL_SPAN);
    p2.roll = constrain(p2.roll + dxRatio * PART2_ROLL_SPAN, -1, 1);
    sensToneSetFreq(sensFreqAt((p2.roll + 1) / 2));
    return;
  }
  if (stage === 'PART2_CENTER') {
    if (p2.phase !== 'adjusting' || !part2Ctrl) return;
    const d = dxRatio * CENTER_DEG_PER_WIDTH;
    part2Ctrl.turn(d);
    p2.spin += d;
    p2.moved = part2Ctrl.state().moved;
    return;
  }
  if (stage === 'PART2_EAR' || stage === 'PART2_PITCH') {
    if (p2.phase !== 'answer') return;
    // 끝에 닿은 채로 더 미는 것도 고르려는 동작으로 셈
    p2.moved += Math.abs(dxRatio * PART2_ROLL_SPAN);
    p2.roll = constrain(p2.roll + dxRatio * PART2_ROLL_SPAN, -1, 1);
  }
}

/**
 * 손을 뗌.
 * ⑤는 손을 떼어도 조절 상태를 유지하고, 달팽이를 꾹 눌러 확정.
 * ⑦⑧ 왼/오른쪽 자리로 껍질이 굴러가 멈추고 그대로 답이 됨 (덜 굴렸으면 가운데로 돌아오고 답 안 함)
 */
function releaseRoll() {
  const p2 = part2State();
  const stage = window.GlobalState.currentStage;
  if (stage === 'PART2_SENSITIVITY') return;
  if (stage !== 'PART2_EAR' && stage !== 'PART2_PITCH') return;
  const ok = canConfirmPart2();
  const side = rollSide(p2.roll);
  p2.roll = side === 'L' ? -PART2_SNAP : side === 'R' ? PART2_SNAP : 0;
  if (ok) confirmPart2();
}

// 터치가 끊기면 답하지 않고 가운데로
function cancelRoll() {
  // 고역 조절값은 터치가 끊겨도 유지하며, 꾹 누르기로만 확정합니다.
  if (window.GlobalState.currentStage === 'PART2_SENSITIVITY') return;
  part2State().roll = 0;
}

function rollSide(roll) {
  return roll < -PART2_SIDE_THRESHOLD ? 'L' : roll > PART2_SIDE_THRESHOLD ? 'R' : null;
}

function canConfirmPart2() {
  const p2 = part2State();
  const stage = window.GlobalState.currentStage;
  if (stage === 'PART2_SENSITIVITY') return p2.phase === 'adjusting' && p2.moved >= PART2_MOVE_THRESHOLD && !!p2.confirmGuide;
  if (stage === 'PART2_CENTER') return p2.phase === 'adjusting' && p2.moved >= CENTER_TEST.minMoveDeg;
  if (stage === 'PART2_EAR' || stage === 'PART2_PITCH') return p2.phase === 'answer' && p2.moved >= PART2_MOVE_THRESHOLD && rollSide(p2.roll) !== null;
  return false;
}

/**
 * 답: ⑥은 달팽이 꾹, ⑦⑧은 껍질을 굴리고 손을 뗄 때 (releaseRoll)
 */
function confirmPart2() {
  if (!canConfirmPart2()) return;
  const p2 = part2State();
  const stage = window.GlobalState.currentStage;
  if (stage === 'PART2_SENSITIVITY') {
    const u = (p2.roll + 1) / 2;
    p2.logic.setAnswer(u);
    sensToneStop();
    p2.phase = 'wait';
    p2.token++;
    finishPart2Stage();
    return;
  }
  if (stage === 'PART2_CENTER') {
    const st = part2Ctrl.state();
    part2Ctrl.stop();
    part2Ctrl = null;
    part2AfterAnswer('ok', st);
    return;
  }
  const side = rollSide(p2.roll);
  const key = stage === 'PART2_EAR' ? side : side === 'R' ? 'up' : 'down';
  part2AfterAnswer(key, millis() - p2.answerAt);
}

// 더듬이 톡 = 한 번 더 듣기 (⑦⑧ 시행마다 한 번. ⑤는 슬라이더 방식이므로 다시 듣기 없음)
function canReplayPart2() {
  if (currentLang() === 'en') return false;
  const p2 = part2State();
  const stage = window.GlobalState.currentStage;
  return (stage === 'PART2_EAR' || stage === 'PART2_PITCH') && p2.phase === 'answer' && p2.replayLeft > 0;
}

function replayPart2() {
  if (!canReplayPart2()) return;
  const p2 = part2State();
  p2.replayLeft--;
  part2Present(p2.trial);
}

/* =====================================================================
 * 비주얼용
 * ===================================================================== */

// 이 검사 안에서 몇 번째인지 (예: "3 / 6")
function getPart2Progress() {
  const p2 = part2State();
  if (!p2.trial || !p2.logic) return '';
  return p2.logic.progress();
}

// ⑤ 슬라이더 위치 u (0 = 8 kHz, 1 = 20 kHz). 조절 중이면 실시간 위치, 아니면 null
function part2SensU() {
  const gs = window.GlobalState;
  if (gs.currentStage !== 'PART2_SENSITIVITY') return null;
  const p2 = gs.part2;
  return p2.phase === 'adjusting' ? (p2.roll + 1) / 2 : null;
}

// 달팽이 꼬임 정도 0~1 (고역 한계). ⑤ 전에는 null(꼬이지 않은 한 줄)
// ⑤ 동안: 슬라이더 위치에 따라 실시간으로 바뀜. ⑤ 뒤: 최종 자리 (결과에 남음)
function part2Twist() {
  const gs = window.GlobalState;
  const psy = gs.psychoProfile;
  if (typeof psy.twist === 'number') return psy.twist;
  if (gs.currentStage !== 'PART2_SENSITIVITY') return null;
  const live = part2SensU();
  return live !== null ? live : 0;
}

// ⑥ 끌어서 돌린 각도(°). 달팽이가 이만큼 정확히 따라 돎. 시행이 시작될 때의 자세가 0이라 가운데가 어딘지는 알려 주지 않음
function part2CenterTurnDeg() {
  return window.GlobalState.currentStage === 'PART2_CENTER' ? part2State().spin : 0;
}

// 앞이든 뒤든 좌우 치우침(°, + 오른쪽)
const lateralDeg = (a) => Math.asin(Math.sin(a * Math.PI / 180)) * 180 / Math.PI;

// ⑥ 달팽이 색을 정할 치우침(°). 돌리는 동안은 지금 자리를 실시간으로, 시행 사이에는 지금까지의 평균 (사용자 지시 11/03)
function part2CenterLiveDeg() {
  const gs = window.GlobalState;
  if (gs.currentStage !== 'PART2_CENTER') return null;
  if (part2Ctrl && part2Ctrl.alive()) return lateralDeg(part2Ctrl.state().angle);
  const p2 = part2State();
  return p2.logic && p2.logic.soFar ? p2.logic.soFar() : null;
}

// ⑧ 점액 모양: 지금 고르려는 쪽이 바탕음(F, 네모)인지 배음(H, 동그라미)인지와 지금까지 답한 수
// 달팽이가 가 있는 쪽(roll)으로 정함. 시행마다 순서(AB/BA)에 따라 같은 쪽도 뜻이 바뀜
function part2PitchSlime() {
  const gs = window.GlobalState;
  const p2 = part2State();
  if (gs.currentStage !== 'PART2_PITCH' || !p2.logic) return null;
  const tally = p2.logic.soFar();
  let live = null;
  if ((p2.phase === 'answer' || p2.phase === 'wait') && p2.trial && Math.abs(p2.roll) > 0.05) {
    const key = p2.roll > 0 ? 'up' : 'down';
    live = key === (p2.trial.order === 'AB' ? 'down' : 'up') ? 'F' : 'H';
  }
  return { live, F: tally.F, S: tally.S };
}
