/**
 * 청각 다변기 (Sound Variator) - 검사용 비트
 *
 * ①②③ 검사 소리. p5.sound가 쓰는 오디오 컨텍스트 위에서 Web Audio 노드로 직접 합성합니다
 * (p5.Part는 화면 프레임에 묶여 박자가 밀릴 수 있어, 미리 예약하는 스케줄러를 씀).
 *
 * 소리 (11/03 사용자 "알바 노토, 이케다 료지 급으로" → 그 결의 미니멀 전자음으로 새로 짬. 곡을 베끼지 않고 재료만 그 결):
 *   순수 사인파, 딱 끊기는 게이트, 아주 짧은 클릭과 잡음 알갱이, 비트 깎은 데이터 소리, 좌우로 튀는 신호음, 넓은 빈 공간.
 *   저역  : 사인 서브 킥(120 → 48 Hz), 딱딱 끊기는 사인 서브 베이스(A1–E2)와 그 두 배음
 *   중역  : 비트 깎은 잡음 + 1 kHz 시험음 스네어, 좌우로 튀는 사인 신호음(880–3520 Hz), 킥 머리의 클릭
 *   고역  : 16분음표 잡음 틱(5 kHz 위), 8분음표 뒷박 히스(8 kHz 위), 딱딱 잘린 흰 잡음(6 kHz 위), 마디 끝 64분음표 래칫
 * 악기를 세 묶음(저역 · 중역 · 고역)으로 나눠, 단계마다 묶음 크기만 바꿔 같은 비트에서 대역만 강조합니다.
 *   FULL : ① 전체 비트 (넓은 대역)
 *   LOW  : ② 킥과 베이스가 크게 (저역이 풍부)
 *   HIGH : ③ 틱과 히스가 크게 (고역이 풍부)
 * 비트는 개인 EQ 체인 입력(lowShelfFilter)으로 들어가므로 EQ와 음량 보정이 그대로 적용됩니다.
 * 크기(norm)와 음량 보정용 스펙트럼은 시작할 때 비트를 미리 그려서 직접 잽니다(calibrateBeat, loudness.js).
 * 비주얼은 getBeatPulse()로 킥 · 스네어 · 하이햇(틱·히스)이 방금 쳤는지를 읽어 달팽이를 비트에 태웁니다.
 * renderBeatLoop()는 같은 비트를 다른 템포로 버퍼에 미리 그려 둡니다(Part 2 ⑥에서 머리 둘레로 돌리는 소리).
 * 템포·패턴·음높이·크기는 Claude가 정한 초안 (작가 확인 필요)
 */

const BEAT = {
  bpm: 120,           // Part 2(P2_GROOVE)와 같은 템포
  steps: 32,          // 16분음표 32칸 = 2마디
  lookahead: 0.15,    // 이만큼(초) 앞까지 미리 예약
  tickMs: 25,
  fade: 0.3
};

// 묶음별 크기. norm은 calibrateBeat()가 잰 값으로 바뀜(K-가중 RMS가 LOUD_TARGET, 피크는 BEAT_PEAK_CEIL 아래).
// 여기 적힌 norm은 재기 전 잠깐 쓰는 값
const BEAT_MIXES = {
  FULL: { low: 1, mid: 1, high: 1, norm: 0.3 },
  LOW: { low: 1.3, mid: 0.22, high: 0.06, norm: 0.3 },
  HIGH: { low: 0.05, mid: 0.22, high: 1.6, norm: 0.6 }
};
// 비트 피크 상한. p5.sound 최종 리미터(-3 dBFS)까지 셸프 +10 dB를 올려도 대부분 닿지 않게 (11/03 검토: 예전 HIGH는 +2 dBFS라 늘 눌렸음)
const BEAT_PEAK_CEIL = 0.3; // -10.5 dBFS

// 패턴 (32칸 중 치는 칸)
const BEAT_PATTERN = {
  kick: [[0, 1], [6, 0.7], [16, 1], [22, 0.7], [27, 0.55]],
  snare: [8, 24],
  // 서브 베이스: [칸, 주파수 Hz, 길이(칸)]. 딱 끊기는 사인. 킥과 겹치지 않게 킥 사이에 (A1 · B1 · D2 · E2)
  sub: [[1, 55, 3], [4, 55, 1], [8, 73.42, 3], [12, 61.74, 3], [17, 55, 3], [20, 55, 1], [24, 82.41, 2], [28, 61.74, 3]],
  // 신호음: [칸, 주파수 Hz, 좌우 -1 ~ 1]. 110 Hz의 배음 위에서
  blip: [[3, 1760, -0.75], [11, 2640, 0.75], [13, 1320, -0.6], [19, 1760, 0.75], [21, 3520, -0.75], [29, 880, 0.6]],
  openHiss: [14, 30],
  ratchet: [15, 31], // 이 칸에서 64분음표 알갱이 4개
  chop: [1, 3, 4, 5, 7, 9, 11, 12, 13, 17, 19, 20, 21, 23, 25, 27, 28, 29] // 16분음표로 딱딱 잘린 흰 잡음
};

let beatOut = null;
let beatBuses = null;
let beatNoise = null;
let beatCrush = null; // 비트 깎기 곡선 (WaveShaper)
let beatTimer = null;
let beatOn = false;
let beatMix = 'FULL';
let beatNextTime = 0;
let beatStep = 0;
let beatHits = { kick: [], snare: [], hat: [] }; // 예약한 타격 시각 (비주얼용)
let beatLive = null; // 악기가 소리를 보낼 곳 { ctx, low, mid, high }. 실시간은 beatBuses, 미리 그릴 때는 OfflineAudioContext
let beatSpectra = {}; // 묶음별 잰 스펙트럼 (음량 보정용, loudness.js 48칸)
let beatCalibrated = null; // Promise

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
  // 4비트쯤으로 깎음 (계단 9단)
  beatCrush = new Float32Array(1024);
  for (let i = 0; i < beatCrush.length; i++) beatCrush[i] = Math.round((i / 511.5 - 1) * 4) / 4;
  beatCalibrated = calibrateBeat().catch(() => {}); // 못 재면 적힌 norm 그대로
}

/**
 * 묶음마다 비트를 미리 그려 크기(norm)와 스펙트럼을 잼
 */
async function calibrateBeat() {
  for (const name of Object.keys(BEAT_MIXES)) {
    const buf = await renderBeatLoop(BEAT.bpm, name, 2);
    const ch = bufferChannels(buf);
    const { kRms, peak } = measureLoudness(ch, buf.sampleRate);
    const mix = BEAT_MIXES[name];
    mix.norm = Math.min(LOUD_TARGET / kRms, BEAT_PEAK_CEIL / peak);
    mix.peakDb = Math.round(20 * Math.log10(peak * mix.norm) * 10) / 10;
    mix.loudDb = Math.round(20 * Math.log10(kRms * mix.norm) * 10) / 10;
    beatSpectra[name] = measureSpectrum(ch, buf.sampleRate, 16);
    if (beatOn && beatMix === name) beatOut.gain.setTargetAtTime(mix.norm, getAudioContext().currentTime, BEAT.fade / 3);
  }
  if (typeof applyEQ === 'function' && window.GlobalState.isAudioInitialized) applyEQ(); // 잰 스펙트럼으로 음량 보정 다시
}

// 음량 보정용: 이 묶음의 잰 스펙트럼 (아직 못 쟀으면 null)
function beatSpectrum(name) {
  return beatSpectra[name] || null;
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
// B.only가 있으면 그 악기만 (Part 2 ⑥에서 악기를 하나씩 방 안에 놓으려고): kick · sub · snare · blip · hat · chop
function playBeatStep(s, t, stepDur, B = beatLive) {
  const on = (name) => !B.only || B.only === name;
  if (on('kick')) BEAT_PATTERN.kick.forEach(([at, vel]) => { if (at === s) { beatKick(B, t, vel); markHit(B, 'kick', t); } });
  if (on('sub')) BEAT_PATTERN.sub.forEach(([at, f, len]) => { if (at === s) beatSub(B, t, f, len * stepDur); });
  if (on('snare') && BEAT_PATTERN.snare.includes(s)) { beatSnare(B, t); markHit(B, 'snare', t); }
  if (on('blip')) BEAT_PATTERN.blip.forEach(([at, f, pan]) => { if (at === s) beatBlip(B, t, f, pan); });
  if (on('hat')) {
    // 16분음표 틱: 박 머리가 세고 사이는 약함, 좌우로 번갈아
    beatTick(B, t, s % 4 === 0 ? 1 : s % 2 === 0 ? 0.6 : 0.38, s % 2 ? 0.35 : -0.35);
    if (BEAT_PATTERN.openHiss.includes(s)) { beatHiss(B, t, 0.2, 0.1); markHit(B, 'hat', t); }
    else if (s % 4 === 2) { beatHiss(B, t, 0.04, 0.12); markHit(B, 'hat', t); }
    if (BEAT_PATTERN.ratchet.includes(s)) {
      for (let k = 0; k < 4; k++) beatGrain(B, t + k * stepDur / 4, 0.4 + 0.2 * k, -0.8 + 0.53 * k);
      markHit(B, 'hat', t);
    }
  }
  if (on('chop') && BEAT_PATTERN.chop.includes(s)) beatChop(B, t, stepDur * 0.5, s % 2 ? 0.5 : -0.5);
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
 * 비트 2마디를 bpm 템포로 한 바퀴 이음새 없이 도는 버퍼로 그림 (Promise, 기본 모노).
 * 두 바퀴를 그리고 뒤 바퀴만 쓰므로, 끝에서 넘어가는 킥 꼬리가 앞머리에 그대로 붙음
 */
function renderBeatLoop(bpm, mixName, channels = 1, only = null) {
  const live = getAudioContext();
  const sr = live.sampleRate, stepDur = 60 / bpm / 4;
  const n = Math.round(BEAT.steps * stepDur * sr);
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new Off(channels, n * 2, sr);
  const mix = BEAT_MIXES[mixName];
  const B = { ctx: off, only };
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
    const out = live.createBuffer(channels, n, sr);
    for (let ch = 0; ch < channels; ch++) out.getChannelData(ch).set(r.getChannelData(ch).subarray(n, n * 2));
    return out;
  });
}

/* ---------- 악기 (B: 소리를 보낼 곳 { ctx, low, mid, high }) ---------- */

function beatEnv(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

// 딱 끊기는 네모 엔벨로프 (사인 게이트). 앞뒤 ramp초만 부드럽게 해서 클릭 잡음은 안 남
function beatGate(g, t, level, dur, ramp = 0.004) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + ramp);
  g.gain.setValueAtTime(level, t + Math.max(ramp, dur - ramp));
  g.gain.linearRampToValueAtTime(0, t + dur);
}

function beatNoiseSrc(ctx, t, dur) {
  const src = ctx.createBufferSource();
  src.buffer = beatNoise;
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
  return src;
}

function beatPan(ctx, node, pan) {
  if (!pan || !ctx.createStereoPanner) return node;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  node.connect(p);
  return p;
}

function beatSine(ctx, f, t, dur) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = f;
  osc.start(t);
  osc.stop(t + dur + 0.02);
  return osc;
}

// 사인 서브 킥 (120 → 48 Hz) + 머리의 짧은 클릭(중역)
function beatKick(B, t, vel) {
  const ctx = B.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.05);
  const g = ctx.createGain();
  beatEnv(g, t, 0.6 * vel, 0.002, 0.26);
  osc.connect(g);
  g.connect(B.low);
  osc.start(t);
  osc.stop(t + 0.36);

  const src = beatNoiseSrc(ctx, t, 0.006);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200;
  bp.Q.value = 0.7;
  const cg = ctx.createGain();
  beatEnv(cg, t, 0.3 * vel, 0.0005, 0.005);
  src.connect(bp);
  bp.connect(cg);
  cg.connect(B.mid);
}

// 딱 끊기는 사인 서브 베이스. 이어폰에서도 들리게 두 배음을 조금
function beatSub(B, t, f, dur) {
  const ctx = B.ctx;
  const g = ctx.createGain();
  beatGate(g, t, 0.3, dur * 0.9, 0.005);
  beatSine(ctx, f, t, dur).connect(g);
  const h = ctx.createGain();
  h.gain.value = 0.35;
  beatSine(ctx, f * 2, t, dur).connect(h);
  h.connect(g);
  g.connect(B.low);
}

// 스네어: 비트 깎은 잡음 알갱이(2.5 kHz 둘레) + 1 kHz 시험음
function beatSnare(B, t) {
  const ctx = B.ctx;
  const src = beatNoiseSrc(ctx, t, 0.09);
  const crush = ctx.createWaveShaper();
  crush.curve = beatCrush;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2500;
  bp.Q.value = 0.9;
  const g = ctx.createGain();
  beatEnv(g, t, 0.5, 0.001, 0.08);
  src.connect(crush);
  crush.connect(bp);
  bp.connect(g);
  g.connect(B.mid);

  const tg = ctx.createGain();
  beatGate(tg, t, 0.12, 0.03, 0.002);
  beatSine(ctx, 1000, t, 0.03).connect(tg);
  tg.connect(B.mid);
}

// 좌우로 튀는 사인 신호음 (35 ms)
function beatBlip(B, t, f, pan) {
  const ctx = B.ctx;
  const g = ctx.createGain();
  beatGate(g, t, 0.1, 0.035, 0.003);
  beatSine(ctx, f, t, 0.035).connect(g);
  beatPan(ctx, g, pan).connect(B.mid);
}

// 16분음표 잡음 틱 (5 kHz 위, 아주 짧게)
function beatTick(B, t, vel, pan) {
  const ctx = B.ctx;
  const src = beatNoiseSrc(ctx, t, 0.012);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const g = ctx.createGain();
  beatEnv(g, t, 0.075 * vel, 0.0008, 0.022);
  src.connect(hp);
  hp.connect(g);
  beatPan(ctx, g, pan).connect(B.high);
}

// 뒷박 히스 (8 kHz 위). decay가 길면 열린 소리
function beatHiss(B, t, decay, peak) {
  const ctx = B.ctx;
  const src = beatNoiseSrc(ctx, t, decay);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 8000;
  const g = ctx.createGain();
  beatEnv(g, t, peak, 0.002, decay);
  src.connect(hp);
  hp.connect(g);
  g.connect(B.high);
}

// 래칫 알갱이: 비트 깎은 잡음 (4 kHz 위), 좌우로 쓸고 지나감
function beatGrain(B, t, vel, pan) {
  const ctx = B.ctx;
  const src = beatNoiseSrc(ctx, t, 0.02);
  const crush = ctx.createWaveShaper();
  crush.curve = beatCrush;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  const g = ctx.createGain();
  beatEnv(g, t, 0.08 * vel, 0.0008, 0.016);
  src.connect(crush);
  crush.connect(hp);
  hp.connect(g);
  beatPan(ctx, g, pan).connect(B.high);
}

// 딱딱 잘린 흰 잡음 (6 kHz 위, 네모 게이트)
function beatChop(B, t, dur, pan) {
  const ctx = B.ctx;
  const src = beatNoiseSrc(ctx, t, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6000;
  const g = ctx.createGain();
  beatGate(g, t, 0.12, dur, 0.003);
  src.connect(hp);
  hp.connect(g);
  beatPan(ctx, g, pan).connect(B.high);
}
