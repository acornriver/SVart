/**
 * 청각 다변기 (Sound Variator) - 귀 프로필 코드 단독 테스트
 *
 * - 글자를 누르면 parseEarCode로 되살린 EQ를 녹음에 바로 입힘 (본 작품과 같은 체인과 음량 보정)
 * - [모든 글자 하나씩 듣기]: 지금 코드에서 한 자리씩만 바꿔 음역 → 저음 → 고음 → 음량 글자를 차례로 들려줌
 * - 헤더의 숫자: 가능한 코드 750개 전부 parseEarCode → getEarCode로 다시 같은 코드가 나오는지 확인한 결과
 */

const SOURCES = [
  { key: 'car-move',   name: '차 (결과)',   file: '../../media/audio/car-move.m4a' },
  { key: 'water',      name: '물 (볼륨)',   file: '../../media/audio/water.m4a' },
  { key: 'train-go',   name: '열차 (저음)', file: '../../media/audio/train-go.m4a' },
  { key: 'walk-stair', name: '계단 (고음)', file: '../../media/audio/walk-stair.m4a' }
];

// 본 작품(part1_audio.js)과 같은 값
const SAMPLE_TARGET_RMS = 0.05;
const SAMPLE_PEAK_CEILING = 0.9;
const TOUR_STEP_SECONDS = 2.5;

const SLOTS = [
  { key: 'reg',  name: '음역', letters: EAR_CODE.REGISTER.map((r) => r.letter), words: ['저 100Hz', '중 400Hz', '고 2.5kHz'] },
  { key: 'low',  name: '저음', letters: EAR_CODE.LOW.letters, words: EAR_CODE.LOW.words },
  { key: 'high', name: '고음', letters: EAR_CODE.HIGH.letters, words: EAR_CODE.HIGH.words },
  { key: 'vol',  name: '음량', letters: '0123456789'.split(''), words: [] }
];

let ctx = null;
let lowShelf, peak, highShelf, comp, master;
let buffers = {};
let levels = {};
let currentSource = null;
let currentKey = SOURCES[0].key;

let code = { reg: 'A', low: 'E', high: 'E', vol: '5' };
let bypass = false;
let tourToken = 0;

const $ = (id) => document.getElementById(id);
const codeString = (c) => c.reg + c.low + c.high + '/' + c.vol;

buildSlots();
buildSources();
$('roundtrip').textContent = checkAllCodes();
$('startOverlay').addEventListener('click', start);
$('tourBtn').addEventListener('click', toggleTour);
$('bypassBtn').addEventListener('click', toggleBypass);
$('randomBtn').addEventListener('click', randomCode);
$('loadBtn').addEventListener('click', loadTyped);
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadTyped(); });
document.addEventListener('touchend', resumeAudio);
document.addEventListener('click', resumeAudio);
window.addEventListener('resize', drawCurve);
render();

/**
 * 1. 오디오
 */
async function start() {
  $('startOverlay').style.display = 'none';
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();

  lowShelf = new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: 200 });
  peak = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 400, Q: EAR_CODE.PEAK_Q });
  highShelf = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 4000 });
  comp = new GainNode(ctx);
  master = new GainNode(ctx);
  lowShelf.connect(peak).connect(highShelf).connect(comp).connect(master).connect(ctx.destination);

  setStatus('녹음 불러오는 중…');
  await Promise.all(SOURCES.map(async (s) => {
    const data = await (await fetch(s.file)).arrayBuffer();
    buffers[s.key] = await ctx.decodeAudioData(data);
    const { rms, peak: pk } = getBufferStats(buffers[s.key]);
    levels[s.key] = Math.min(SAMPLE_TARGET_RMS / rms, SAMPLE_PEAK_CEILING / pk);
  }));

  playSource(currentKey);
  applyCode();
}

function resumeAudio() {
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
}

function playSource(key) {
  currentKey = key;
  if (currentSource) {
    currentSource.src.stop();
    currentSource.src.disconnect();
  }
  if (!ctx || !buffers[key]) return render();
  const src = new AudioBufferSourceNode(ctx, { buffer: buffers[key], loop: true });
  const level = new GainNode(ctx, { gain: levels[key] });
  src.connect(level).connect(lowShelf);
  src.start();
  currentSource = { src, level };
  applyCode();
}

function getBufferStats(buffer) {
  let sum = 0;
  let count = 0;
  let pk = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
      pk = Math.max(pk, Math.abs(data[i]));
    }
    count += data.length;
  }
  return { rms: Math.max(1e-6, Math.sqrt(sum / count)), peak: Math.max(1e-6, pk) };
}

/**
 * 2. 코드 → EQ. 화면에 보이는 글자를 문자열로 만든 뒤 parseEarCode로 되살려서 적용
 *    (본 작품에서 코드를 불러오는 것과 같은 경로)
 */
function applyCode() {
  const profile = parseEarCode(codeString(code));
  render();
  if (!ctx) return;

  const t = ctx.currentTime;
  const ramp = 0.08;
  lowShelf.gain.setTargetAtTime(bypass ? 0 : profile.lowShelf.gain, t, ramp / 3);
  peak.frequency.setTargetAtTime(profile.registerPeak.freq, t, ramp / 3);
  peak.gain.setTargetAtTime(bypass ? 0 : profile.registerPeak.gain, t, ramp / 3);
  highShelf.gain.setTargetAtTime(bypass ? 0 : profile.highShelf.gain, t, ramp / 3);
  master.gain.setTargetAtTime(profile.masterVolume, t, ramp / 3);

  // 필터 값이 실제로 바뀐 뒤 응답을 읽어야 해서 램프가 거의 끝난 다음(시정수의 9배)에 보정값 계산
  setTimeout(() => {
    const db = bypass ? 0 : getLoudnessCompDb();
    comp.gain.setTargetAtTime(Math.pow(10, db / 20), ctx.currentTime, ramp / 3);
    drawCurve();
    setStatus(describe(profile, db));
  }, 250);
}

// part1_audio.js의 getLoudnessCompDb와 같은 계산 (pink 스펙트럼 × A-가중치). 필터 응답은 브라우저에서 직접 읽음
function getLoudnessCompDb() {
  const n = 48;
  const freqs = new Float32Array(n);
  for (let i = 0; i < n; i++) freqs[i] = 20 * Math.pow(1000, i / (n - 1));
  const eq = getChainResponseDb(freqs);
  let before = 0;
  let after = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.pow(aWeighting(freqs[i]), 2);
    before += w;
    after += w * Math.pow(10, eq[i] / 10);
  }
  return Math.max(-12, Math.min(12, -10 * Math.log10(after / before)));
}

function getChainResponseDb(freqs) {
  const out = new Float32Array(freqs.length);
  const mag = new Float32Array(freqs.length);
  const phase = new Float32Array(freqs.length);
  [lowShelf, peak, highShelf].forEach((f) => {
    f.getFrequencyResponse(freqs, mag, phase);
    for (let i = 0; i < freqs.length; i++) out[i] += 20 * Math.log10(mag[i]);
  });
  return out;
}

function aWeighting(f) {
  const f2 = f * f;
  const ra = (12194 * 12194 * f2 * f2) /
    ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
  return ra * 1.2589;
}

/**
 * 3. 조작
 */
function pick(slot, letter) {
  stopTour();
  code[slot] = letter;
  applyCode();
}

function toggleBypass() {
  bypass = !bypass;
  applyCode();
}

function randomCode() {
  stopTour();
  SLOTS.forEach((s) => { code[s.key] = s.letters[Math.floor(Math.random() * s.letters.length)]; });
  applyCode();
}

function loadTyped() {
  const typed = $('codeInput').value.trim();
  const profile = parseEarCode(typed);
  if (!profile) {
    setStatus(`"${typed}"은(는) 코드 형식이 아닙니다. 예) IwS/6`);
    return;
  }
  stopTour();
  code = { reg: typed[0], low: typed[1], high: typed[2], vol: typed[4] };
  applyCode();
}

// 지금 코드에서 한 자리씩만 바꿔 모든 글자를 차례로 들려주고, 끝나면 원래 코드로 돌아옴
async function toggleTour() {
  if (tourToken) return stopTour();
  const token = ++tourToken;
  const base = { ...code };
  bypass = false;
  $('tourBtn').classList.add('active');
  $('tourBtn').textContent = '멈추기';

  for (const slot of SLOTS) {
    for (const letter of slot.letters) {
      if (tourToken !== token) return;
      code = { ...base, [slot.key]: letter };
      applyCode();
      markTouring(slot.key, letter);
      await new Promise((r) => setTimeout(r, TOUR_STEP_SECONDS * 1000));
    }
  }
  if (tourToken !== token) return;
  code = base;
  stopTour();
  applyCode();
}

function stopTour() {
  tourToken = 0;
  markTouring(null);
  $('tourBtn').classList.remove('active');
  $('tourBtn').textContent = '모든 글자 하나씩 듣기';
}

/**
 * 4. 화면
 */
function buildSlots() {
  SLOTS.forEach((slot) => {
    const row = document.createElement('div');
    row.className = 'slot';
    row.innerHTML = `<span class="name">${slot.name}</span><div class="letters"></div>`;
    slot.letters.forEach((letter, i) => {
      const b = document.createElement('button');
      b.className = 'mono';
      b.dataset.slot = slot.key;
      b.dataset.letter = letter;
      b.innerHTML = letter + (slot.words[i] ? `<span class="sub">${slot.words[i]}</span>` : '');
      b.addEventListener('click', () => pick(slot.key, letter));
      row.querySelector('.letters').appendChild(b);
    });
    $('slots').appendChild(row);
  });
}

function buildSources() {
  SOURCES.forEach((s) => {
    const b = document.createElement('button');
    b.textContent = s.name;
    b.dataset.source = s.key;
    b.addEventListener('click', () => playSource(s.key));
    $('sourceRow').appendChild(b);
  });
}

function render() {
  $('code').textContent = codeString(code);
  $('bypassBtn').classList.toggle('active', bypass);
  document.querySelectorAll('.letters button').forEach((b) => {
    b.classList.toggle('on', code[b.dataset.slot] === b.dataset.letter);
  });
  document.querySelectorAll('[data-source]').forEach((b) => {
    b.classList.toggle('primary', b.dataset.source === currentKey);
  });
  const reg = SLOTS[0].words[SLOTS[0].letters.indexOf(code.reg)];
  const low = EAR_CODE.LOW.words[EAR_CODE.LOW.letters.indexOf(code.low)];
  const high = EAR_CODE.HIGH.words[EAR_CODE.HIGH.letters.indexOf(code.high)];
  $('codeWords').textContent = `음역 ${reg} · 저음 ${low} · 고음 ${high} · 음량 ${code.vol}` + (bypass ? '  (지금은 원래 소리)' : '');
}

function markTouring(slot, letter) {
  document.querySelectorAll('.letters button').forEach((b) => {
    b.classList.toggle('touring', b.dataset.slot === slot && b.dataset.letter === letter);
  });
}

function describe(p, compDb) {
  const f = (v) => (v > 0 ? '+' : '') + v.toFixed(1);
  const volDb = 20 * Math.log10(p.masterVolume);
  return `불러온 값  peak ${p.registerPeak.freq}Hz ${f(p.registerPeak.gain)}dB · low shelf ${f(p.lowShelf.gain)}dB · high shelf ${f(p.highShelf.gain)}dB\n` +
    `음량 ${p.masterVolume.toFixed(3)} (${f(volDb)}dB) · 체감 음량 보정 ${f(compDb)}dB`;
}

function setStatus(text) {
  $('status').textContent = text;
}

// 가로 20Hz~20kHz(로그), 세로 ±12dB
function drawCurve() {
  const cv = $('curve');
  const dpr = window.devicePixelRatio || 1;
  cv.width = cv.clientWidth * dpr;
  cv.height = cv.clientHeight * dpr;
  const g = cv.getContext('2d');
  const w = cv.width;
  const h = cv.height;
  const y = (db) => h / 2 - (db / 12) * (h / 2 - 8 * dpr);
  g.clearRect(0, 0, w, h);

  g.strokeStyle = '#e0ddd6';
  g.lineWidth = dpr;
  [100, 1000, 10000].forEach((hz) => {
    const x = Math.log10(hz / 20) / 3 * w;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
  });
  g.beginPath(); g.moveTo(0, y(0)); g.lineTo(w, y(0)); g.stroke();
  g.fillStyle = '#999';
  g.font = `${10 * dpr}px IBM Plex Mono, monospace`;
  ['100', '1k', '10k'].forEach((t, i) => g.fillText(t, Math.log10([100, 1000, 10000][i] / 20) / 3 * w + 4 * dpr, h - 6 * dpr));

  if (!ctx) return;
  const n = 200;
  const freqs = new Float32Array(n);
  for (let i = 0; i < n; i++) freqs[i] = 20 * Math.pow(1000, i / (n - 1));
  const db = getChainResponseDb(freqs);
  g.strokeStyle = bypass ? '#999' : '#111';
  g.lineWidth = 2 * dpr;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w;
    i ? g.lineTo(x, y(db[i])) : g.moveTo(x, y(db[i]));
  }
  g.stroke();
}

/**
 * 5. 가능한 코드 전부(3 × 5 × 5 × 10 = 750개)가 불러온 뒤 다시 같은 코드로 돌아오는지
 */
function checkAllCodes() {
  let total = 0;
  let ok = 0;
  SLOTS[0].letters.forEach((r) => SLOTS[1].letters.forEach((l) => SLOTS[2].letters.forEach((hi) =>
    SLOTS[3].letters.forEach((v) => {
      const c = r + l + hi + '/' + v;
      total++;
      if (getEarCode(parseEarCode(c)) === c) ok++;
    }))));
  return `${ok}/${total} 코드 왕복 OK`;
}
