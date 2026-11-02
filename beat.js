/**
 * 청각 다변기 (Sound Variator) - 검사용 비트
 *
 * ①②③ 검사 소리. p5.sound가 쓰는 오디오 컨텍스트 위에서 Web Audio 노드로 직접 합성합니다
 * (p5.Part는 화면 프레임에 묶여 박자가 밀릴 수 있어, 미리 예약하는 스케줄러를 씀).
 * 악기를 세 묶음(저역 · 중역 · 고역)으로 나눠, 단계마다 묶음 크기만 바꿔 같은 비트에서 대역만 강조합니다.
 *   FULL : ① 전체 비트 (넓은 대역)
 *   LOW  : ② 킥과 베이스가 크게 (저역이 풍부)
 *   HIGH : ③ 하이햇과 쉐이커가 크게 (고역이 풍부)
 * 비트는 개인 EQ 체인 입력(lowShelfFilter)으로 들어가므로 EQ와 음량 보정이 그대로 적용됩니다.
 * 비주얼은 getBeatPulse()로 킥 · 스네어 · 하이햇이 방금 쳤는지를 읽어 달팽이를 비트에 태웁니다.
 * renderBeatLoop()는 같은 비트를 다른 템포로 버퍼에 미리 그려 둡니다(Part 2 ⑥에서 머리 둘레로 돌리는 소리).
 */

const BEAT = {
  bpm: 96,
  steps: 32,          // 16분음표 32칸 = 2마디
  lookahead: 0.15,    // 이만큼(초) 앞까지 미리 예약
  tickMs: 25,
  fade: 0.3
};

// 묶음별 크기. norm은 섞인 소리의 RMS가 북서울 녹음(-26 dBFS)과 같아지도록 헤드리스 크롬에서 7초 평균을 재서 맞춘 값
// (norm 1일 때 FULL -12.0 / LOW -10.4 / HIGH -30.5 dBFS). ①에서 맞춘 크기가 ②③과 결과 화면에서 어긋나지 않게
const BEAT_MIXES = {
  FULL: { low: 1, mid: 1, high: 1, norm: 0.2 },
  LOW: { low: 1.3, mid: 0.22, high: 0.06, norm: 0.165 },
  HIGH: { low: 0.05, mid: 0.22, high: 1.6, norm: 1.68 }
};

// 패턴 (32칸 중 치는 칸)
const BEAT_PATTERN = {
  kick: [0, 10, 16, 26, 30],
  snare: [8, 24],
  openHat: [14, 30],
  stab: [6, 22],
  // 베이스: [칸, 주파수 Hz, 길이(칸)]
  bass: [[0, 55, 6], [10, 55, 4], [16, 43.65, 6], [26, 49, 4]]
};
const STAB_CHORD = [220, 261.63, 329.63, 392]; // Am7

let beatOut = null;
let beatBuses = null;
let beatNoise = null;
let beatTimer = null;
let beatOn = false;
let beatMix = 'FULL';
let beatNextTime = 0;
let beatStep = 0;
let beatHits = { kick: [], snare: [], hat: [] }; // 예약한 타격 시각 (비주얼용)
let beatLive = null; // 악기가 소리를 보낼 곳 { ctx, low, mid, high }. 실시간은 beatBuses, 미리 그릴 때는 OfflineAudioContext

/**
 * 노드 만들기 (part1_audio.js의 setupAudioPipeline()에서 호출). dest: EQ 체인 입력 노드
 */
function setupBeat(dest) {
  const ctx = getAudioContext();
  beatOut = ctx.createGain();
  beatOut.gain.value = 0;
  beatOut.connect(dest);
  beatBuses = {};
  ['low', 'mid', 'high'].forEach((k) => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(beatOut);
    beatBuses[k] = g;
  });
  beatLive = { ctx, ...beatBuses };
  beatNoise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = beatNoise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function startBeat(mixName) {
  if (!beatOut) return;
  const ctx = getAudioContext();
  const mix = BEAT_MIXES[mixName];
  beatMix = mixName;
  ['low', 'mid', 'high'].forEach((k) => beatBuses[k].gain.setTargetAtTime(mix[k], ctx.currentTime, BEAT.fade / 3));
  beatOut.gain.setTargetAtTime(mix.norm, ctx.currentTime, BEAT.fade / 3);
  if (!beatOn) {
    beatOn = true;
    beatNextTime = ctx.currentTime + 0.08;
    beatStep = 0;
  }
  ensureBeatRunning();
}

function stopBeat() {
  if (!beatOut || !beatOn) return;
  beatOn = false;
  beatOut.gain.setTargetAtTime(0, getAudioContext().currentTime, BEAT.fade / 3);
  setTimeout(() => {
    if (!beatOn && beatTimer) { clearInterval(beatTimer); beatTimer = null; }
  }, BEAT.fade * 1000 + 200);
}

function isBeatOn() {
  return beatOn;
}

// 스케줄러가 어떤 이유로든 멈춰 있으면 다시 켬 (watchActiveSource에서도 부름)
function ensureBeatRunning() {
  if (beatOn && !beatTimer) beatTimer = setInterval(scheduleBeat, BEAT.tickMs);
}

function scheduleBeat() {
  const ctx = getAudioContext();
  if (!beatOn || ctx.state !== 'running') return;
  // 화면 잠금 등으로 오래 멈췄다 돌아오면 밀린 박자를 한꺼번에 치지 않고 지금부터 다시
  if (beatNextTime < ctx.currentTime - 0.1) beatNextTime = ctx.currentTime + 0.05;
  const stepDur = 60 / BEAT.bpm / 4;
  while (beatNextTime < ctx.currentTime + BEAT.lookahead) {
    playBeatStep(beatStep, beatNextTime, stepDur);
    beatNextTime += stepDur;
    beatStep = (beatStep + 1) % BEAT.steps;
  }
}

// B: 소리를 보낼 곳 (기본은 실시간 비트). 미리 그릴 때는 비주얼용 타격 시각을 남기지 않음
function playBeatStep(s, t, stepDur, B = beatLive) {
  if (BEAT_PATTERN.kick.includes(s)) { beatKick(B, t); markHit(B, 'kick', t); }
  if (BEAT_PATTERN.snare.includes(s)) { beatSnare(B, t); markHit(B, 'snare', t); }
  if (BEAT_PATTERN.openHat.includes(s)) { beatHat(B, t, 0.28, 0.2); markHit(B, 'hat', t); }
  else if (s % 2 === 0) { beatHat(B, t, 0.045, s % 4 === 0 ? 0.32 : 0.22); markHit(B, 'hat', t); }
  beatShaker(B, t, s % 4 === 2 ? 1 : s % 2 ? 0.55 : 0.75);
  if (BEAT_PATTERN.stab.includes(s)) beatStab(B, t);
  BEAT_PATTERN.bass.forEach(([at, f, len]) => { if (at === s) beatBass(B, t, f, len * stepDur); });
}

function markHit(B, type, t) {
  if (B !== beatLive) return;
  const arr = beatHits[type];
  arr.push(t);
  if (arr.length > 8) arr.shift();
}

/**
 * 비주얼용: 방금 친 정도 0~1 (킥 · 스네어 · 하이햇). 지금 들리는 묶음 크기를 곱해 안 들리는 악기에는 반응하지 않음
 */
function getBeatPulse() {
  const out = { kick: 0, snare: 0, hat: 0 };
  if (!beatOut) return out;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const level = beatOut.gain.value / BEAT_MIXES[beatMix].norm; // 켜진 정도 0~1
  const weight = { kick: beatBuses.low.gain.value, snare: beatBuses.mid.gain.value, hat: beatBuses.high.gain.value };
  const rate = { kick: 7, snare: 9, hat: 18 };
  Object.keys(out).forEach((k) => {
    let last = -1;
    beatHits[k].forEach((t) => { if (t <= now && t > last) last = t; });
    if (last >= 0) out[k] = Math.exp(-(now - last) * rate[k]) * Math.min(1, weight[k]) * Math.min(1, level);
  });
  return out;
}

/**
 * 비트 2마디를 bpm 템포로 한 바퀴 이음새 없이 도는 모노 버퍼로 그림 (Promise).
 * 두 바퀴를 그리고 뒤 바퀴만 쓰므로, 끝에서 넘어가는 킥 꼬리가 앞머리에 그대로 붙음
 */
function renderBeatLoop(bpm, mixName) {
  const live = getAudioContext();
  const sr = live.sampleRate, stepDur = 60 / bpm / 4;
  const n = Math.round(BEAT.steps * stepDur * sr);
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new Off(1, n * 2, sr);
  const mix = BEAT_MIXES[mixName];
  const B = { ctx: off };
  ['low', 'mid', 'high'].forEach((k) => {
    const g = off.createGain();
    g.gain.value = mix[k];
    g.connect(off.destination);
    B[k] = g;
  });
  for (let i = 0; i < BEAT.steps * 2; i++) playBeatStep(i % BEAT.steps, i * stepDur, stepDur, B);
  return new Promise((res, rej) => {
    off.oncomplete = (e) => res(e.renderedBuffer);
    const p = off.startRendering();
    if (p && p.then) p.then(res, rej);
  }).then((r) => {
    const out = live.createBuffer(1, n, sr);
    out.getChannelData(0).set(r.getChannelData(0).subarray(n, n * 2));
    return out;
  });
}

/* ---------- 악기 (B: 소리를 보낼 곳 { ctx, low, mid, high }) ---------- */

function beatEnv(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function beatNoiseSrc(ctx, t, dur) {

  const src = ctx.createBufferSource();
  src.buffer = beatNoise;
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
  return src;
}

function beatKick(B, t) {
  const ctx = B.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = ctx.createGain();
  beatEnv(g, t, 0.9, 0.004, 0.42);
  osc.connect(g);
  g.connect(B.low);
  osc.start(t);
  osc.stop(t + 0.5);
}

function beatBass(B, t, f, dur) {
  const ctx = B.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  g.gain.setValueAtTime(0.5, t + Math.max(0.03, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(lp);
  lp.connect(g);
  g.connect(B.low);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function beatSnare(B, t) {
  const ctx = B.ctx;
  const src = beatNoiseSrc(ctx, t, 0.22);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  beatEnv(g, t, 0.55, 0.002, 0.2);
  src.connect(bp);
  bp.connect(g);
  g.connect(B.mid);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(170, t + 0.08);
  const og = ctx.createGain();
  beatEnv(og, t, 0.3, 0.002, 0.1);
  osc.connect(og);
  og.connect(B.mid);
  osc.start(t);
  osc.stop(t + 0.15);
}

function beatHat(B, t, decay, peak) {
  const ctx = B.ctx;
  const src = beatNoiseSrc(ctx, t, decay);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  beatEnv(g, t, peak, 0.002, decay);
  src.connect(hp);
  hp.connect(g);
  g.connect(B.high);
}

function beatShaker(B, t, vel) {
  const ctx = B.ctx;
  const src = beatNoiseSrc(ctx, t, 0.07);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 10000;
  bp.Q.value = 1.2;
  const g = ctx.createGain();
  beatEnv(g, t, 0.16 * vel, 0.008, 0.06);
  src.connect(bp);
  bp.connect(g);
  g.connect(B.high);
}

function beatStab(B, t) {
  const ctx = B.ctx;
  const g = ctx.createGain();
  beatEnv(g, t, 0.07, 0.005, 0.28);
  g.connect(B.mid);
  STAB_CHORD.forEach((f) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}
