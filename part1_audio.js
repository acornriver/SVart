/**
 * 청각 다변기 (Sound Variator) - Part 1 Audio Engine
 *
 * [Part 1: 파트별 청취로 만드는 개인 선호 EQ]
 * ① 편한 볼륨    : 넓은 대역 소리를 들으며 위아래로 쓸어 크기 맞추기 → masterVolume
 * ② 음역 고르기  : 같은 멜로디 저/중/고 중 하나 고르기 (듣는 순서 무작위) → registerPeak
 * ③ 저음 맞추기  : 저역이 풍부한 소리로 low shelf 맞추기             → lowShelf
 * ④ 고음 맞추기  : 고역이 풍부한 소리로 high shelf 맞추기            → highShelf
 * ⑤ 결과        : 개인 EQ가 입혀진 소리 ↔ 원래 소리 비교
 *
 * - 한 단계에 한 파트, 한 축(위아래 쓸기)만 조절. 시작값은 매번 무작위.
 * - 충분히 움직인 뒤 확정 버튼으로 확정.
 * - EQ를 바꿔도 체감 음량이 같도록 자동 음량 보정 (큰 소리를 고르는 편향 방지).
 *
 * 신호 흐름:
 *   단계별 소스 → lowShelf → registerPeak → highShelf → loudnessComp → masterGain → 출력
 *   멜로디(②)  ─────────────────────────────────────────────────────→ masterGain
 */

const PART1_STAGES = ['PART1_VOLUME', 'PART1_REGISTER', 'PART1_LOW', 'PART1_HIGH', 'PART1_RESULT'];

// 단계별 소스. file에 경로를 넣으면 녹음 파일을 쓰고, 비워두면 noise 색으로 대체.
// spectrum은 음량 보정 계산에 쓰는 대략적인 스펙트럼 기울기 ('white' | 'pink' | 'brown')
// 예) file: './sounds/dangyeoncheon.mp3' (북서울 주변 녹음이 오면 교체)
const PART1_SOURCES = {
  VOLUME: { file: null, noise: 'pink',  spectrum: 'pink',  level: 0.35 }, // 넓은 대역: 당현천 물소리 등
  LOW:    { file: null, noise: 'brown', spectrum: 'brown', level: 0.35 }, // 저역: 지하철 진입 럼블 등
  HIGH:   { file: null, noise: 'white', spectrum: 'white', level: 0.15 }, // 고역: 숲 바람, 나뭇잎 등
  RESULT: { file: null, noise: 'pink',  spectrum: 'pink',  level: 0.35 }  // 결과 감상용
};

// 조절 단계 설정 (값 단위는 모두 dB). span: 화면 높이만큼 쓸었을 때 바뀌는 양
const PART1_ADJUST = {
  PART1_VOLUME: { min: -40, max: 0,  startMin: -26, startMax: -14, span: 60, moveThreshold: 6 },
  PART1_LOW:    { min: -10, max: 10, startMin: -6,  startMax: 6,   span: 30, moveThreshold: 3 },
  PART1_HIGH:   { min: -10, max: 10, startMin: -6,  startMax: 6,   span: 30, moveThreshold: 3 }
};

const MIN_STEP_SECONDS = 1.5; // 단계 시작 직후 오확정 방지

// ② 음역 고르기: 도 미 솔 라 솔 미 도, 8분음표 6개 + 4분음표 1개 @ 120 BPM
const MELODY_STEPS = [0, 4, 7, 9, 7, 4, 0];
const MELODY_DURS = [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.5];
const MELODY_LENGTH = MELODY_DURS.reduce((a, b) => a + b, 0);
const MELODY_ENV = { attack: 0.01, decay: 0.15, sustain: 0.3, release: 0.2 };
const MELODY_BASE_AMP = 0.3;
const MELODY_GAP = 0.7;

// defaultOffsetDb: 등청감 보정 출발점. tests/register 페이지에서 보정한 값이 있으면 그걸 씀
const REGISTERS = [
  { id: 'LOW',  name: '저음역', range: 'C2–A2', baseMidi: 36, peakHz: 100,  defaultOffsetDb: 6 },
  { id: 'MID',  name: '중음역', range: 'C4–A4', baseMidi: 60, peakHz: 400,  defaultOffsetDb: 0 },
  { id: 'HIGH', name: '고음역', range: 'C6–A6', baseMidi: 84, peakHz: 2500, defaultOffsetDb: -2 }
];
const REGISTER_PEAK_GAIN = 3;
const REGISTER_PEAK_Q = 1;
const REGISTER_CALIB_KEY = 'svart.registerTest';

// 오디오 노드 내부 참조
let lowShelfFilter = null;
let peakFilter = null;
let highShelfFilter = null;
let loudnessComp = null;
let masterGain = null;
let noiseSources = {};     // { pink, brown, white }: p5.Noise
let sampleSources = {};    // { VOLUME, LOW, ... }: p5.SoundFile (file이 지정된 경우만)
let activeSourceKey = null;

// 조절 단계 내부 상태
let adjustValue = 0;       // 현재 값 (dB)
let movedPath = 0;         // 단계 시작 후 값이 움직인 누적량 (dB)
let stepElapsed = 0;

// 음역 고르기 내부 상태
let registerOffsets = {};
let registerPlayToken = 0;
let currentVoice = null;

/**
 * 0. 녹음 파일 미리 불러오기 (main.js의 preload()에서 호출)
 */
function preloadPart1() {
  Object.keys(PART1_SOURCES).forEach((key) => {
    const file = PART1_SOURCES[key].file;
    if (file) sampleSources[key] = loadSound(file);
  });
}

/**
 * 1. 첫 터치: 오디오 언락 + 오디오 체인 + ① 시작
 */
function initAudioPart1() {
  if (window.GlobalState.isAudioInitialized) return;

  // iOS는 touchend/click 안에서만 오디오 언락을 사용자 제스처로 인정
  userStartAudio();
  getAudioContext().resume();
  setupAudioPipeline();
  loadRegisterCalibration();

  window.GlobalState.isAudioInitialized = true;
  goToPart1Step(0);
}

/**
 * 개인 EQ 체인 생성
 */
function setupAudioPipeline() {
  const profile = window.GlobalState.userEQProfile;

  lowShelfFilter = new p5.Filter('lowshelf');
  peakFilter = new p5.Filter('peaking');
  highShelfFilter = new p5.Filter('highshelf');
  [lowShelfFilter, peakFilter, highShelfFilter].forEach((f) => f.disconnect());

  lowShelfFilter.freq(profile.lowShelf.freq);
  lowShelfFilter.gain(0);
  peakFilter.freq(profile.registerPeak.freq);
  peakFilter.res(REGISTER_PEAK_Q);
  peakFilter.gain(0);
  highShelfFilter.freq(profile.highShelf.freq);
  highShelfFilter.gain(0);

  // p5.Gain은 입력단이 기본 0.5(-6dB)라 1로 맞춤
  loudnessComp = new p5.Gain();
  loudnessComp.input.gain.value = 1;
  loudnessComp.amp(1);

  masterGain = new p5.Gain();
  masterGain.input.gain.value = 1;
  masterGain.amp(profile.masterVolume);

  lowShelfFilter.connect(peakFilter);
  peakFilter.connect(highShelfFilter);
  highShelfFilter.connect(loudnessComp);
  loudnessComp.connect(masterGain);
  masterGain.connect();

  // 단계별 소스: 노이즈는 미리 켜두고 음량으로만 전환
  ['pink', 'brown', 'white'].forEach((type) => {
    const n = new p5.Noise(type);
    n.disconnect();
    n.connect(lowShelfFilter);
    n.amp(0);
    n.start();
    noiseSources[type] = n;
  });
  Object.values(sampleSources).forEach((s) => {
    s.disconnect();
    s.connect(lowShelfFilter);
  });

  const fft = new p5.FFT(0.8, 512);
  fft.setInput(masterGain);
  const amplitude = new p5.Amplitude();
  amplitude.setInput(masterGain);

  const nodes = window.GlobalState.audioNodes;
  nodes.fft = fft;
  nodes.amplitude = amplitude;
  nodes.eqChainInput = lowShelfFilter;
  nodes.masterGain = masterGain;
}

/**
 * 단계별 소스 전환 (0.3초 크로스페이드). key가 null이면 모두 끔
 */
function setActiveSource(key) {
  const fade = 0.3;

  const prevKey = activeSourceKey;
  if (prevKey && prevKey !== key && sampleSources[prevKey]) {
    const prevSample = sampleSources[prevKey];
    prevSample.setVolume(0, fade);
    // 페이드 사이에 다시 이 소스로 돌아오지 않았을 때만 정지
    setTimeout(() => { if (activeSourceKey !== prevKey) prevSample.stop(); }, fade * 1000 + 50);
  }
  Object.entries(noiseSources).forEach(([type, n]) => {
    const isTarget = key && !sampleSources[key] && PART1_SOURCES[key].noise === type;
    n.amp(isTarget ? PART1_SOURCES[key].level : 0, fade);
  });

  if (key && sampleSources[key]) {
    const s = sampleSources[key];
    if (!s.isPlaying()) {
      s.setVolume(0);
      s.loop();
    }
    s.setVolume(PART1_SOURCES[key].level, fade);
  }

  activeSourceKey = key;
}

/**
 * 2. 단계 이동
 */
function goToPart1Step(index) {
  const gs = window.GlobalState;
  const stage = PART1_STAGES[index];
  gs.currentStage = stage;
  gs.part1.stepIndex = index;
  gs.part1.hasMoved = false;

  stopVoice();
  registerPlayToken++;

  if (stage === 'PART1_VOLUME') {
    setActiveSource('VOLUME');
    beginAdjust(stage);
  } else if (stage === 'PART1_REGISTER') {
    setActiveSource(null);
    startRegisterTrial();
  } else if (stage === 'PART1_LOW') {
    setActiveSource('LOW');
    beginAdjust(stage);
  } else if (stage === 'PART1_HIGH') {
    setActiveSource('HIGH');
    beginAdjust(stage);
  } else if (stage === 'PART1_RESULT') {
    gs.part1.isBypassed = false;
    setActiveSource('RESULT'); // 음량 보정이 결과 소스 스펙트럼 기준이 되도록 먼저 전환
    applyEQ();
    console.log('[Part 1] userEQProfile', JSON.parse(JSON.stringify(gs.userEQProfile)));
  }
}

function confirmPart1Step() {
  const next = window.GlobalState.part1.stepIndex + 1;
  if (next < PART1_STAGES.length) goToPart1Step(next);
}

function restartPart1() {
  const profile = window.GlobalState.userEQProfile;
  profile.lowShelf.gain = 0;
  profile.highShelf.gain = 0;
  profile.registerPeak.register = null;
  profile.registerPeak.gain = 0;
  window.GlobalState.part1.isBypassed = false;
  applyEQ();
  goToPart1Step(0);
}

/**
 * 3. 매 프레임 업데이트 (main.js의 draw()에서 호출)
 */
function updatePart1(dt) {
  if (!window.GlobalState.isAudioInitialized) return;

  const stage = window.GlobalState.currentStage;
  if (PART1_ADJUST[stage]) updateAdjust(stage, dt);
}

/**
 * 4. ①③④ 조절 단계: 위아래로 쓸기 → 값
 */
function beginAdjust(stage) {
  const cfg = PART1_ADJUST[stage];
  adjustValue = random(cfg.startMin, cfg.startMax);
  movedPath = 0;
  stepElapsed = 0;
  applyAdjust(stage);
}

function updateAdjust(stage, dt) {
  const cfg = PART1_ADJUST[stage];
  const p1 = window.GlobalState.part1;
  stepElapsed += dt;
  p1.hasMoved = movedPath >= cfg.moveThreshold && stepElapsed >= MIN_STEP_SECONDS;
}

/**
 * 쓸어 올린 양(화면 높이 비율, 위로 +)만큼 값을 옮김. 상대 조작이라 무작위 시작값이 유지되고,
 * 범위 끝에서 더 밀어도 값만 멈추므로 되돌릴 때 죽은 구간이 없다.
 */
function dragAdjust(dyRatio) {
  const stage = window.GlobalState.currentStage;
  const cfg = PART1_ADJUST[stage];
  if (!cfg) return;

  const next = constrain(adjustValue + dyRatio * cfg.span, cfg.min, cfg.max);
  movedPath += Math.abs(next - adjustValue);
  adjustValue = next;
  applyAdjust(stage);
}

function applyAdjust(stage) {
  const cfg = PART1_ADJUST[stage];
  window.GlobalState.part1.control = (adjustValue - cfg.min) / (cfg.max - cfg.min);
  applyAdjustValue(stage);
}

function applyAdjustValue(stage) {
  const profile = window.GlobalState.userEQProfile;
  if (stage === 'PART1_VOLUME') {
    profile.masterVolume = dbToGain(adjustValue);
    masterGain.amp(profile.masterVolume, 0.05);
  } else if (stage === 'PART1_LOW') {
    profile.lowShelf.gain = adjustValue;
    applyEQ();
  } else if (stage === 'PART1_HIGH') {
    profile.highShelf.gain = adjustValue;
    applyEQ();
  }
}

/**
 * 확정 버튼
 */
function tapConfirmAdjust() {
  if (window.GlobalState.part1.hasMoved) confirmPart1Step();
}

/**
 * 5. EQ 적용 + 체감 음량 보정
 */
function applyEQ() {
  const profile = window.GlobalState.userEQProfile;
  const bypass = window.GlobalState.part1.isBypassed;

  lowShelfFilter.gain(bypass ? 0 : profile.lowShelf.gain);
  peakFilter.freq(profile.registerPeak.freq);
  peakFilter.gain(bypass ? 0 : profile.registerPeak.gain);
  highShelfFilter.gain(bypass ? 0 : profile.highShelf.gain);

  const spectrum = activeSourceKey ? PART1_SOURCES[activeSourceKey].spectrum : 'pink';
  const compDb = bypass ? 0 : getLoudnessCompDb(spectrum);
  loudnessComp.amp(dbToGain(compDb), 0.08);
}

/**
 * EQ가 바꾼 체감 음량을 되돌리는 보정값(dB).
 * 소스 스펙트럼 × A-가중치로 EQ 전후 파워를 비교한다.
 */
function getLoudnessCompDb(spectrum) {
  const profile = window.GlobalState.userEQProfile;
  let before = 0;
  let after = 0;

  for (let i = 0; i < 48; i++) {
    const f = 20 * Math.pow(1000, i / 47); // 20Hz ~ 20kHz 로그 간격
    // 로그 간격 한 칸에 들어있는 파워: white ∝ f, pink 일정, brown ∝ 1/f
    const s = spectrum === 'white' ? f : spectrum === 'brown' ? 1 / f : 1;
    const w = s * Math.pow(aWeighting(f), 2);
    const eqDb = getEQResponseDb(f, profile);
    before += w;
    after += w * Math.pow(10, eqDb / 10);
  }
  return constrain(-10 * Math.log10(after / before), -12, 12);
}

/**
 * 개인 EQ의 주파수 f에서 이득(dB). Web Audio BiquadFilter와 같은 공식(RBJ Cookbook).
 * 비주얼에서 곡선을 그릴 때도 사용.
 */
function getEQResponseDb(f, profile) {
  const fs = getAudioContext().sampleRate;
  return biquadResponseDb('lowshelf', profile.lowShelf.freq, profile.lowShelf.gain, 1, f, fs) +
    biquadResponseDb('peaking', profile.registerPeak.freq, profile.registerPeak.gain, profile.registerPeak.q, f, fs) +
    biquadResponseDb('highshelf', profile.highShelf.freq, profile.highShelf.gain, 1, f, fs);
}

function biquadResponseDb(type, f0, gainDb, q, f, fs) {
  if (gainDb === 0) return 0;

  const A = Math.pow(10, gainDb / 40);
  const w0 = 2 * Math.PI * f0 / fs;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  let b0, b1, b2, a0, a1, a2;

  if (type === 'peaking') {
    const alpha = sinW / (2 * q);
    b0 = 1 + alpha * A; b1 = -2 * cosW; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cosW; a2 = 1 - alpha / A;
  } else {
    // Web Audio 쉘프는 기울기 S = 1 고정
    const alpha = sinW / 2 * Math.SQRT2;
    const k = 2 * Math.sqrt(A) * alpha;
    if (type === 'lowshelf') {
      b0 = A * ((A + 1) - (A - 1) * cosW + k);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW);
      b2 = A * ((A + 1) - (A - 1) * cosW - k);
      a0 = (A + 1) + (A - 1) * cosW + k;
      a1 = -2 * ((A - 1) + (A + 1) * cosW);
      a2 = (A + 1) + (A - 1) * cosW - k;
    } else {
      b0 = A * ((A + 1) + (A - 1) * cosW + k);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
      b2 = A * ((A + 1) + (A - 1) * cosW - k);
      a0 = (A + 1) - (A - 1) * cosW + k;
      a1 = 2 * ((A - 1) - (A + 1) * cosW);
      a2 = (A + 1) - (A - 1) * cosW - k;
    }
  }

  // |H(e^jw)|
  const w = 2 * Math.PI * f / fs;
  const c1 = Math.cos(w), s1 = Math.sin(w);
  const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const numRe = b0 + b1 * c1 + b2 * c2, numIm = -(b1 * s1 + b2 * s2);
  const denRe = a0 + a1 * c1 + a2 * c2, denIm = -(a1 * s1 + a2 * s2);
  const mag2 = (numRe * numRe + numIm * numIm) / (denRe * denRe + denIm * denIm);
  return 10 * Math.log10(mag2);
}

function aWeighting(f) {
  const f2 = f * f;
  const ra = (12194 * 12194 * f2 * f2) /
    ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
  return ra * 1.2589; // 1kHz에서 1
}

/**
 * 결과 단계: 내 EQ ↔ 원래 소리 비교
 */
function toggleResultBypass() {
  const p1 = window.GlobalState.part1;
  p1.isBypassed = !p1.isBypassed;
  applyEQ();
}

/**
 * 6. ② 음역 고르기
 */
function startRegisterTrial() {
  const reg = window.GlobalState.part1.register;
  // 카드는 x축(음고) 위 제자리에 고정하고, 처음 들려주는 순서만 무작위
  reg.order = REGISTERS.map((r) => r.id);
  reg.playOrder = shuffle([0, 1, 2]);
  reg.selectedCard = -1;
  reg.playingCard = -1;
  playAllRegisterCards();
}

async function playAllRegisterCards() {
  const reg = window.GlobalState.part1.register;
  const token = ++registerPlayToken;
  reg.isAutoPlaying = true;

  for (const i of reg.playOrder) {
    if (token !== registerPlayToken) return;
    reg.playingCard = i;
    playRegister(reg.order[i]);
    await wait((MELODY_LENGTH + MELODY_GAP) * 1000);
  }
  if (token !== registerPlayToken) return;

  reg.playingCard = -1;
  reg.isAutoPlaying = false;
}

async function tapRegisterCard(i) {
  const reg = window.GlobalState.part1.register;
  if (reg.isAutoPlaying) return;

  reg.selectedCard = i;
  const token = ++registerPlayToken;
  reg.playingCard = i;
  playRegister(reg.order[i]);
  await wait(MELODY_LENGTH * 1000);
  if (token === registerPlayToken) reg.playingCard = -1;
}

function replayAllRegisterCards() {
  const reg = window.GlobalState.part1.register;
  if (reg.isAutoPlaying) return;
  stopVoice();
  playAllRegisterCards();
}

function confirmRegister() {
  const reg = window.GlobalState.part1.register;
  if (reg.isAutoPlaying || reg.selectedCard < 0) return;

  const chosen = REGISTERS.find((r) => r.id === reg.order[reg.selectedCard]);
  const peak = window.GlobalState.userEQProfile.registerPeak;
  peak.register = chosen.id;
  peak.freq = chosen.peakHz;
  peak.gain = REGISTER_PEAK_GAIN;
  peak.q = REGISTER_PEAK_Q;
  applyEQ();

  confirmPart1Step();
}

/**
 * 멜로디 재생: 음마다 삼각파 오실레이터 + 엔벨로프. EQ를 거치지 않고 masterGain으로.
 * (엔벨로프 하나로 여러 음을 예약하면 다음 음의 어택이 앞 음의 릴리스 꼬리를 잘라먹음)
 */
function playRegister(registerId) {
  stopVoice();

  const reg = REGISTERS.find((r) => r.id === registerId);
  const level = Math.min(0.95, MELODY_BASE_AMP * dbToGain(getRegisterOffset(reg)));
  const notes = [];
  let t = 0;

  MELODY_STEPS.forEach((step, n) => {
    const dur = MELODY_DURS[n];
    const osc = new p5.Oscillator(midiToFreq(reg.baseMidi + step), 'triangle');
    osc.disconnect();
    osc.connect(masterGain);
    osc.amp(0);
    osc.start();

    const env = new p5.Envelope();
    env.setADSR(MELODY_ENV.attack, MELODY_ENV.decay, MELODY_ENV.sustain, MELODY_ENV.release);
    env.setRange(level, 0);
    // play()는 sustainTime을 정수로 잘라버려서(~~) 직접 어택/릴리스를 예약
    env.triggerAttack(osc, t);
    env.triggerRelease(osc, t + Math.max(MELODY_ENV.attack + MELODY_ENV.decay, dur - 0.05));

    notes.push({ osc, env });
    t += dur;
  });

  const voice = { notes, disposed: false };
  currentVoice = voice;
  setTimeout(() => disposeVoice(voice), (t + MELODY_ENV.release + 0.2) * 1000);
}

function stopVoice() {
  if (!currentVoice) return;
  const voice = currentVoice;
  currentVoice = null;
  voice.notes.forEach(({ osc }) => osc.stop(0.03));
  setTimeout(() => disposeVoice(voice), 200);
}

function disposeVoice(voice) {
  if (voice.disposed) return;
  voice.disposed = true;
  if (currentVoice === voice) currentVoice = null;
  voice.notes.forEach(({ osc, env }) => {
    osc.stop();
    osc.dispose();
    env.dispose();
  });
}

function loadRegisterCalibration() {
  try {
    const saved = JSON.parse(localStorage.getItem(REGISTER_CALIB_KEY));
    registerOffsets = (saved && saved.offsets) || {};
  } catch (e) {
    registerOffsets = {};
  }
}

function getRegisterOffset(reg) {
  const v = registerOffsets[reg.id];
  return typeof v === 'number' ? v : reg.defaultOffsetDb;
}

// 유틸
function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
