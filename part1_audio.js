/**
 * 청각 다변기 (Sound Variator) - Part 1 Audio Engine
 *
 * [Part 1: 파트별 청취로 만드는 개인 선호 EQ]
 * ① 편한 볼륨    : 전체 비트를 들으며 위아래로 쓸어 크기 맞추기       → masterVolume (반죽 크기)
 * ② 저음 맞추기  : 킥·베이스가 큰 비트로 low shelf 맞추기           → lowShelf (꼬리)
 * ③ 고음 맞추기  : 하이햇·쉐이커가 큰 비트로 high shelf 맞추기       → highShelf (머리)
 * ④ 음역 고르기  : 같은 멜로디 저/중/고 중 하나 고르기 (듣는 순서 무작위) → registerPeak (껍질 자리)
 * → Part 2 검사 네 단계 (part2_audio.js: 고역 예민도 · 중앙 · 우세 귀 · 바탕음/배음)
 * 결과          : 개인 EQ를 입힌 북서울 주변 녹음을 장소마다 차례로 (tour.js) ↔ 원래 소리 비교
 *
 * - 한 단계에 한 파트, 한 축(위아래 쓸기)만 조절. 시작값은 매번 무작위.
 * - 충분히 움직인 뒤 확정 버튼으로 확정.
 * - EQ를 바꿔도 체감 음량이 같도록 자동 음량 보정 (큰 소리를 고르는 편향 방지).
 *
 * 신호 흐름:
 *   비트(①②③) · 북서울 녹음(결과) → lowShelf → registerPeak → highShelf → loudnessComp → masterGain → 출력
 *   멜로디(④)  ─────────────────────────────────────────────────────→ masterGain
 *   Part 2 검사음 ─────────────── part2Bus (① 볼륨과 무관한 고정 크기) ───→ 출력
 */

// 전체 진행 순서. Part 2 단계는 part2_audio.js가 맡음
const FLOW_STAGES = [
  'PART1_VOLUME', 'PART1_LOW', 'PART1_HIGH', 'PART1_REGISTER', // 둥근 반죽 → 꼬리 → 머리 → 껍질 얹기
  'PART2_SENSITIVITY', 'PART2_CENTER', 'PART2_EAR', 'PART2_PITCH',
  'RESULT'
];
const EAR_RESULT_KEY = 'svart.earProfile'; // 청감 클라우드 연결용으로 결과를 남겨 두는 자리

// ①②③ 검사 소리: 직접 만든 비트의 묶음 크기 (beat.js의 BEAT_MIXES).
// spectrum은 음량 보정 계산에 쓰는 대략적인 스펙트럼 기울기 ('white' | 'pink' | 'brown'). 잰 스펙트럼이 있으면 그걸 씀(loudness.js)
// 결과 화면의 북서울 녹음은 tour.js의 TOUR_PLACES. 불러온 뒤 K-가중 크기를 LOUD_TARGET으로 맞춤
const PART1_SOURCES = {
  VOLUME: { beat: 'FULL', spectrum: 'pink' },
  LOW:    { beat: 'LOW',  spectrum: 'brown' },
  HIGH:   { beat: 'HIGH', spectrum: 'white' }
};

// 녹음마다 크기가 달라 ①에서 맞춘 볼륨이 다음 단계에서 어긋나지 않도록 크기를 맞춤 (비트와 같은 K-가중 기준, LOUD_TARGET).
// 원본이 -53 ~ -37 dBFS로 작아 크게 키우는데, 발소리처럼 피크가 큰 녹음은 피크가 상한을 넘지 않는 데까지만 키움
const SAMPLE_PEAK_CEILING = 0.7;  // p5.sound 최종 리미터(-3 dBFS) 바로 아래

// 조절 단계 설정 (값 단위는 모두 dB). span: 화면 높이만큼 쓸었을 때 바뀌는 양
const PART1_ADJUST = {
  PART1_VOLUME: { min: -40, max: 0,  startMin: -26, startMax: -14, span: 60, moveThreshold: 6 },
  PART1_LOW:    { min: -10, max: 10, startMin: -6,  startMax: 6,   span: 30, moveThreshold: 3 },
  PART1_HIGH:   { min: -10, max: 10, startMin: -6,  startMax: 6,   span: 30, moveThreshold: 3 }
};

const MIN_STEP_SECONDS = 1.5; // 단계 시작 직후 오확정 방지
const SOURCE_WATCH_SECONDS = 1; // 이 간격으로 오디오가 살아 있는지 확인

// ④ 음역 고르기: 도 미 솔 도' 시 라 솔 · 미 레 도 (한 옥타브를 올라갔다 내려오는 짧은 노래, 11/02 사용자 "조금 더 음악적으로")
// 음색: 칼림바·전자피아노처럼 탁 친 뒤 울리다 사라지는 배음 4개 + 옅은 메아리. 선율·음색·메아리는 Claude가 정함
const MELODY_STEPS = [0, 4, 7, 12, 11, 9, 7, 4, 2, 0];
const MELODY_DURS = [0.2, 0.2, 0.2, 0.4, 0.2, 0.2, 0.4, 0.2, 0.2, 0.6];
const MELODY_LENGTH = MELODY_DURS.reduce((a, b) => a + b, 0);
const MELODY_PARTIALS = [   // 배음 번호, 크기, 사라지는 빠르기(초, 클수록 오래 울림)
  { n: 1, amp: 1,    tau: 0.42 },
  { n: 2, amp: 0.32, tau: 0.22 },
  { n: 3, amp: 0.12, tau: 0.12 },
  { n: 4, amp: 0.05, tau: 0.07 }
];
const MELODY_ECHO = { time: 0.3, feedback: 0.22, wet: 0.18 };
const MELODY_BASE_AMP = 0.42;   // 삼각파 서스테인 0.3과 비슷하게 들리도록 (귀로 다시 맞출 것)
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
let sampleSources = {};    // { 장소 key: p5.SoundFile } 북서울 녹음
let sampleLevels = {};     // { 장소 key: 크기를 맞춘 재생 볼륨 }
let sampleSpectra = {};    // { 장소 key: 잰 스펙트럼 (음량 보정용) }
let activeSourceKey = null;
let sourceWatchTimer = 0;

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
  TOUR_PLACES.forEach(({ key, audio }) => {
    sampleSources[key] = loadSound(audio);
  });
}

/**
 * 1. 오디오 언락 + 오디오 체인. 첫 화면에서 터치하거나 이름을 넣을 때 부름 (소리는 아직 안 남)
 */
function initAudio() {
  if (window.GlobalState.isAudioInitialized) return;

  // iOS는 touchend/click 안에서만 오디오 언락을 사용자 제스처로 인정
  userStartAudio();
  getAudioContext().resume();
  setupAudioPipeline();
  loadRegisterCalibration();

  // 화면 잠금, 블루투스 재연결, 다른 앱 소리 등으로 iOS가 오디오를 멈추면 돌아올 때 다시 깨움
  getAudioContext().addEventListener('statechange', ensureAudioRunning);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ensureAudioRunning();
  });

  window.GlobalState.isAudioInitialized = true;
}

/**
 * 이름을 넣은 뒤 첫 검사부터 시작
 */
function startFlow() {
  initAudio();
  goToStep(0);
}

/**
 * 오디오 컨텍스트가 멈춰 있으면 다시 켬. iOS는 사용자 제스처 안에서만 확실히 되므로 터치마다도 부름
 */
function ensureAudioRunning() {
  if (!window.GlobalState.isAudioInitialized) return;
  const ctx = getAudioContext();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
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

  setupBeat(lowShelfFilter.input);
  Object.entries(sampleSources).forEach(([key, s]) => {
    s.disconnect();
    s.connect(lowShelfFilter);
    const ch = bufferChannels(s.buffer);
    const { kRms, peak } = measureLoudness(ch, s.buffer.sampleRate);
    sampleLevels[key] = Math.min(LOUD_TARGET / kRms, SAMPLE_PEAK_CEILING / peak);
    sampleSpectra[key] = measureSpectrum(ch, s.buffer.sampleRate);
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
 * 소스 전환. key: PART1_SOURCES의 비트 이름 · TOUR_PLACES의 장소 key · null(모두 끔)
 */
function setActiveSource(key, fade = 0.3) {
  const prevKey = activeSourceKey;
  if (prevKey && prevKey !== key && sampleSources[prevKey]) {
    const prevSample = sampleSources[prevKey];
    prevSample.setVolume(0, fade);
    // 페이드 사이에 다시 이 소스로 돌아오지 않았을 때만 정지
    setTimeout(() => { if (activeSourceKey !== prevKey) prevSample.stop(); }, fade * 1000 + 50);
  }

  const beat = key && PART1_SOURCES[key] ? PART1_SOURCES[key].beat : null;
  if (beat) startBeat(beat);
  else stopBeat();

  if (key && sampleSources[key]) {
    const s = sampleSources[key];
    if (!s.isPlaying()) {
      s.setVolume(0);
      s.loop();
    }
    s.setVolume(sampleLevels[key], fade);
  }

  activeSourceKey = key;
}

// 잰 스펙트럼(48칸 배열)이 있으면 그것, 없으면 대략적인 기울기 이름
function sourceSpectrum(key) {
  if (PART1_SOURCES[key] && beatSpectrum(PART1_SOURCES[key].beat)) return beatSpectrum(PART1_SOURCES[key].beat);
  if (sampleSpectra[key]) return sampleSpectra[key];
  const src = PART1_SOURCES[key] || TOUR_PLACES.find((p) => p.key === key);
  return src ? src.spectrum : 'pink';
}

/**
 * 2. 단계 이동
 */
function goToStep(index) {
  const gs = window.GlobalState;
  const stage = FLOW_STAGES[index];
  gs.currentStage = stage;
  gs.part1.stepIndex = index;
  gs.part1.hasMoved = false;

  stopVoice();
  leavePart2();
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
  } else if (stage.startsWith('PART2_')) {
    setActiveSource(null); // Part 2 순음은 조용한 바탕에서
    beginPart2Stage(stage);
  } else if (stage === 'RESULT') {
    gs.part1.isBypassed = false;
    startTour(); // 북서울 산책. 장소를 바꿀 때마다 음량 보정도 그 녹음 기준으로
    saveEarResult();
  }
}

function confirmStep() {
  const next = window.GlobalState.part1.stepIndex + 1;
  if (next < FLOW_STAGES.length) goToStep(next);
}

/**
 * 결과를 window.EAR_RESULT와 localStorage에 남김 (청감 클라우드 연결용)
 */
function saveEarResult() {
  const gs = window.GlobalState;
  const out = {
    name: gs.userName,
    code: getFullEarCode(gs.userEQProfile, gs.psychoProfile),
    userEQProfile: JSON.parse(JSON.stringify(gs.userEQProfile)),
    psychoProfile: JSON.parse(JSON.stringify(gs.psychoProfile)),
    savedAt: Date.now()
  };
  window.EAR_RESULT = out;
  console.log('[결과]', out);
  try {
    localStorage.setItem(EAR_RESULT_KEY, JSON.stringify(out));
  } catch (e) {
    // 저장소를 못 쓰는 브라우저: 화면 결과만
  }
}

/**
 * 처음으로: 값을 모두 지우고 소리를 끈 뒤 이름 입력 화면으로
 */
function restartFlow() {
  const gs = window.GlobalState;
  const profile = gs.userEQProfile;
  profile.lowShelf.gain = 0;
  profile.highShelf.gain = 0;
  profile.registerPeak.register = null;
  profile.registerPeak.gain = 0;
  resetPsychoProfile();
  gs.part1.isBypassed = false;
  gs.part1.stepIndex = 0;
  gs.userName = '';

  stopVoice();
  leavePart2();
  stopTour();
  registerPlayToken++;
  if (gs.isAudioInitialized) {
    setActiveSource(null, 1);
    applyEQ();
  }
  gs.currentStage = 'INIT';
}

/**
 * 3. 매 프레임 업데이트 (main.js의 draw()에서 호출)
 */
function updateFlow(dt) {
  if (!window.GlobalState.isAudioInitialized) return;

  const stage = window.GlobalState.currentStage;
  if (PART1_ADJUST[stage]) updateAdjust(stage, dt);
  if (stage.startsWith('PART2_')) updatePart2();
  if (stage === 'RESULT') updateTour();

  sourceWatchTimer += dt;
  if (sourceWatchTimer >= SOURCE_WATCH_SECONDS) {
    sourceWatchTimer = 0;
    watchActiveSource();
  }
}

/**
 * 지금 단계의 비트나 녹음이 어떤 이유로든 멈춰 있으면 다시 재생
 */
function watchActiveSource() {
  ensureAudioRunning();
  if (PART1_SOURCES[activeSourceKey]) {
    if (!isBeatOn()) startBeat(PART1_SOURCES[activeSourceKey].beat);
    ensureBeatRunning();
    return;
  }
  const s = sampleSources[activeSourceKey];
  if (!s || s.isPlaying()) return;
  s.setVolume(0);
  s.loop();
  s.setVolume(sampleLevels[activeSourceKey], 0.3);
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
  window.GlobalState.part1.lastDragAt = millis(); // 비주얼: 반죽을 누르는 손가락 자국
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
  if (window.GlobalState.part1.hasMoved) confirmStep();
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

  const spectrum = sourceSpectrum(activeSourceKey);
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

  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    const f = spectrumBandFreq(i); // 20Hz ~ 20kHz 로그 간격
    // 로그 간격 한 칸에 들어있는 파워: 잰 값, 아니면 white ∝ f, pink 일정, brown ∝ 1/f
    const s = Array.isArray(spectrum) ? spectrum[i] : spectrum === 'white' ? f : spectrum === 'brown' ? 1 / f : 1;
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
  setResultBypass(!window.GlobalState.part1.isBypassed);
}

// 결과 화면: 화면을 누르고 있는 동안만 원래 소리 (main.js)
function setResultBypass(on) {
  const p1 = window.GlobalState.part1;
  if (p1.isBypassed === on) return;
  p1.isBypassed = on;
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

  confirmStep();
}

/**
 * 멜로디 재생: 음마다 배음 사인파 묶음 + 탁 치고 사라지는 엔벨로프 → 메아리 → masterGain (EQ는 거치지 않음)
 */
function playRegister(registerId) {
  stopVoice();

  const reg = REGISTERS.find((r) => r.id === registerId);
  const level = Math.min(0.95, MELODY_BASE_AMP * dbToGain(getRegisterOffset(reg)));
  const ctx = getAudioContext();
  const t0 = ctx.currentTime + 0.03;

  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(masterGain.input);
  // 메아리: 원래 소리 + 지연(되먹임)된 옅은 소리
  const delay = ctx.createDelay(1);
  delay.delayTime.value = MELODY_ECHO.time;
  const fb = ctx.createGain();
  fb.gain.value = MELODY_ECHO.feedback;
  const wet = ctx.createGain();
  wet.gain.value = MELODY_ECHO.wet;
  const dry = ctx.createGain();
  dry.connect(out);
  dry.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(out);

  const ampSum = MELODY_PARTIALS.reduce((a, p) => a + p.amp, 0);
  const oscs = [];
  let t = t0;
  MELODY_STEPS.forEach((step, k) => {
    const f = midiToFreq(reg.baseMidi + step);
    const end = t + MELODY_DURS[k] + 0.35; // 다음 음과 살짝 겹치며 울림이 이어짐
    MELODY_PARTIALS.forEach((p) => {
      if (f * p.n > 16000) return;
      const osc = ctx.createOscillator();
      osc.frequency.value = f * p.n;
      const g = ctx.createGain();
      const peak = level * p.amp / ampSum;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      g.gain.setTargetAtTime(0, t + 0.006, p.tau);
      g.gain.setValueAtTime(peak * Math.exp(-(end - 0.05 - t - 0.006) / p.tau), end - 0.05); // 그때 남은 크기에서 0으로
      g.gain.linearRampToValueAtTime(0, end);
      osc.connect(g);
      g.connect(dry);
      osc.start(t);
      osc.stop(end + 0.01);
      oscs.push(osc);
    });
    t += MELODY_DURS[k];
  });

  const voice = { oscs, out, nodes: [dry, delay, fb, wet], disposed: false };
  currentVoice = voice;
  setTimeout(() => disposeVoice(voice), (t - t0 + 2.5) * 1000); // 메아리가 사라진 뒤
}

function stopVoice() {
  if (!currentVoice) return;
  const voice = currentVoice;
  currentVoice = null;
  const now = getAudioContext().currentTime;
  voice.out.gain.cancelScheduledValues(now);
  voice.out.gain.setValueAtTime(voice.out.gain.value, now);
  voice.out.gain.linearRampToValueAtTime(0, now + 0.03);
  setTimeout(() => disposeVoice(voice), 200);
}

function disposeVoice(voice) {
  if (voice.disposed) return;
  voice.disposed = true;
  if (currentVoice === voice) currentVoice = null;
  voice.oscs.forEach((o) => { try { o.stop(); } catch (e) { /* 이미 멈춤 */ } });
  [voice.out, ...voice.nodes].forEach((n) => { try { n.disconnect(); } catch (e) { /* 이미 끊김 */ } });
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
