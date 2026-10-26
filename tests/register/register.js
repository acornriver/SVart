/**
 * 청각 다변기 (Sound Variator) - Part 1 · ② 음역 고르기 단독 테스트
 *
 * - 같은 선율(도 미 솔 라 솔 미 도)을 저/중/고 세 음역으로 들려주고 하나를 강제 선택
 * - 카드는 A/B/C로만 표시하고 순서는 매 시행마다 무작위
 * - 음역별 음량 보정(dB)은 [보정] 패널에서 아이패드 + 헤드폰 조합으로 귀로 맞춤
 * - 선택된 음역은 EQ peak(중심 주파수, +3dB, Q 1)로 변환
 */

// 선율: 도 미 솔 라 솔 미 도 (기준음 대비 반음 간격), 8분음표 6개 + 4분음표 1개 @ 120 BPM
const MELODY_STEPS = [0, 4, 7, 9, 7, 4, 0];
const MELODY_DURS = [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.5];
const MELODY_LENGTH = MELODY_DURS.reduce((a, b) => a + b, 0); // 2.0초

// 엔벨로프: 어택 10ms, 디케이 150ms, 서스테인 0.3, 릴리스 200ms
const ENV_ATTACK = 0.01;
const ENV_DECAY = 0.15;
const ENV_SUSTAIN = 0.3;
const ENV_RELEASE = 0.2;

const BASE_AMP = 0.3;
const GAP_BETWEEN_CARDS = 0.7; // 자동 재생 시 카드 사이 쉬는 시간(초)

// 음역 정의 (2옥타브 간격). defaultOffsetDb는 등청감 보정 출발점 — 실제 장비로 귀로 조정할 것
const REGISTERS = [
  { id: 'LOW',  name: '저음역', range: 'C2–A2', baseMidi: 36, peakHz: 100,  defaultOffsetDb: 6 },
  { id: 'MID',  name: '중음역', range: 'C4–A4', baseMidi: 60, peakHz: 400,  defaultOffsetDb: 0 },
  { id: 'HIGH', name: '고음역', range: 'C6–A6', baseMidi: 84, peakHz: 2500, defaultOffsetDb: -2 }
];

const PEAK_GAIN_DB = 3;
const PEAK_Q = 1;

const CARD_LABELS = ['A', 'B', 'C'];
const STORAGE_KEY = 'svart.registerTest';

// 상태
let calib = { offsets: {}, master: 0.8 };
let pickHistory = [];    // 이전 시행들의 선택 기록 (일관성 확인용)
let cardOrder = [];      // 이번 시행에서 A/B/C에 배정된 REGISTERS 인덱스
let selectedCard = -1;
let isAutoPlaying = false;
let playToken = 0;       // 재생 중단 판별용
let currentVoice = null; // { notes: [{ osc, env }], disposed }

// DOM 참조
let cardsEl, promptEl, resultEl, confirmBtn, replayAllBtn;

function setup() {
  noCanvas();
  loadStorage();

  cardsEl = document.getElementById('cards');
  promptEl = document.getElementById('prompt');
  resultEl = document.getElementById('result');
  confirmBtn = document.getElementById('confirmBtn');
  replayAllBtn = document.getElementById('replayAllBtn');

  document.getElementById('startOverlay').addEventListener('click', onStart);
  confirmBtn.addEventListener('click', onConfirm);
  replayAllBtn.addEventListener('click', onReplayAllOrNext);
  document.getElementById('calibToggle').addEventListener('click', () => {
    document.getElementById('calibPanel').classList.toggle('open');
  });

  buildCalibPanel();
}

/**
 * 1. 첫 터치: 오디오 언락 후 첫 시행 시작
 */
function onStart() {
  userStartAudio();
  outputVolume(calib.master);
  document.getElementById('startOverlay').style.display = 'none';
  startTrial();
}

/**
 * 2. 시행 시작: 순서 섞기 → 카드 생성 → 세 음역 자동 재생
 */
function startTrial() {
  cardOrder = shuffle([0, 1, 2]);
  selectedCard = -1;
  resultEl.style.display = 'none';
  cardsEl.style.display = '';
  confirmBtn.style.display = '';
  confirmBtn.disabled = true;
  replayAllBtn.textContent = '다시 전부 듣기';

  cardsEl.innerHTML = '';
  CARD_LABELS.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'card';
    btn.innerHTML = `<span>${label}</span><span class="sub">탭해서 다시 듣기</span>`;
    btn.addEventListener('click', () => onCardTap(i));
    cardsEl.appendChild(btn);
  });

  playAllCards();
}

async function playAllCards() {
  const token = ++playToken;
  isAutoPlaying = true;
  setCardsEnabled(false);
  replayAllBtn.disabled = true;
  promptEl.textContent = '같은 멜로디를 세 번 들려드릴게요.';

  for (let i = 0; i < CARD_LABELS.length; i++) {
    if (token !== playToken) return;
    highlightCard(i);
    playRegister(cardOrder[i]);
    await wait((MELODY_LENGTH + GAP_BETWEEN_CARDS) * 1000);
  }
  if (token !== playToken) return;

  highlightCard(-1);
  isAutoPlaying = false;
  setCardsEnabled(true);
  replayAllBtn.disabled = false;
  promptEl.textContent = '어느 쪽이 가장 편하게 들렸나요? 카드를 눌러 다시 들을 수 있어요.';
}

/**
 * 3. 카드 탭: 선택 + 해당 음역 재생 (재생 중이면 끊고 새로 재생)
 */
async function onCardTap(i) {
  if (isAutoPlaying) return;

  selectedCard = i;
  confirmBtn.disabled = false;
  [...cardsEl.children].forEach((el, j) => el.classList.toggle('selected', j === i));

  const token = ++playToken;
  highlightCard(i);
  playRegister(cardOrder[i]);
  await wait(MELODY_LENGTH * 1000);
  if (token === playToken) highlightCard(-1);
}

/**
 * 4. 확정: 결과 공개 + EQ peak 변환 + 기록
 */
function onConfirm() {
  if (selectedCard < 0) return;
  stopVoice();
  playToken++;

  const reg = REGISTERS[cardOrder[selectedCard]];
  const result = {
    register: reg.id,
    peak: { freq: reg.peakHz, gain: PEAK_GAIN_DB, q: PEAK_Q },
    order: cardOrder.map((idx) => REGISTERS[idx].id),
    offsetsDb: { ...calib.offsets },
    time: new Date().toISOString()
  };
  pickHistory.push(result);
  saveStorage();
  window.RegisterTestResult = result;
  console.log('[Register Test] result', result);

  const mapping = cardOrder
    .map((idx, i) => `${CARD_LABELS[i]} = ${REGISTERS[idx].name}`)
    .join(' · ');

  promptEl.textContent = `${CARD_LABELS[selectedCard]}를 골랐어요. ${reg.name}이에요.`;
  resultEl.innerHTML =
    `<div class="mono">${mapping}</div>` +
    `<div>선택 음역: <b>${reg.name}</b> (${reg.range})</div>` +
    `<div class="mono">→ EQ PEAK ${formatHz(reg.peakHz)} · +${PEAK_GAIN_DB}dB · Q ${PEAK_Q}</div>`;
  resultEl.style.display = 'block';
  cardsEl.style.display = 'none';
  confirmBtn.style.display = 'none';
  replayAllBtn.textContent = '한 번 더 (순서 섞기)';
  replayAllBtn.disabled = false;

  renderTally();
}

function onReplayAllOrNext() {
  if (resultEl.style.display === 'block') {
    startTrial();
  } else {
    stopVoice();
    playAllCards();
  }
}

/**
 * 5. 신스: 재생마다 삼각파 오실레이터 + 엔벨로프를 새로 만들고, 끝나면 정리
 */
function playRegister(regIndex) {
  stopVoice();

  const reg = REGISTERS[regIndex];
  const level = Math.min(0.95, BASE_AMP * dbToGain(getOffset(reg.id)));

  // 음마다 오실레이터 + 엔벨로프를 따로 둔다.
  // 엔벨로프 하나로 여러 음을 예약하면 다음 음의 어택이 앞 음의 릴리스 꼬리를 잘라먹는다.
  const notes = [];
  let t = 0;
  MELODY_STEPS.forEach((step, n) => {
    const dur = MELODY_DURS[n];

    const osc = new p5.Oscillator(midiToFreq(reg.baseMidi + step), 'triangle');
    osc.amp(0);
    osc.start();

    const env = new p5.Envelope();
    env.setADSR(ENV_ATTACK, ENV_DECAY, ENV_SUSTAIN, ENV_RELEASE);
    env.setRange(level, 0);
    // play()는 sustainTime을 정수로 잘라버려서(~~) 직접 어택/릴리스를 예약한다
    env.triggerAttack(osc, t);
    env.triggerRelease(osc, t + Math.max(ENV_ATTACK + ENV_DECAY, dur - 0.05));

    notes.push({ osc, env });
    t += dur;
  });

  const voice = { notes, disposed: false };
  currentVoice = voice;
  setTimeout(() => disposeVoice(voice), (t + ENV_RELEASE + 0.2) * 1000);
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

/**
 * 6. 보정 패널: 음역별 dB 오프셋 + 마스터 볼륨 (localStorage 저장)
 */
function buildCalibPanel() {
  const rows = document.getElementById('calibRows');
  rows.innerHTML = '';

  REGISTERS.forEach((reg, idx) => {
    const row = document.createElement('div');
    row.className = 'calib-row';
    row.innerHTML =
      `<span class="mono">${reg.id}</span>` +
      `<input type="range" min="-12" max="12" step="0.5" value="${getOffset(reg.id)}">` +
      `<span class="mono">${formatDb(getOffset(reg.id))}</span>` +
      `<button>재생</button>`;

    const slider = row.querySelector('input');
    const label = row.querySelectorAll('span')[1];
    slider.addEventListener('input', () => {
      calib.offsets[reg.id] = parseFloat(slider.value);
      label.textContent = formatDb(calib.offsets[reg.id]);
      saveStorage();
    });
    row.querySelector('button').addEventListener('click', () => {
      if (isAutoPlaying) return;
      playToken++;
      highlightCard(-1);
      playRegister(idx);
    });
    rows.appendChild(row);
  });

  const masterSlider = document.getElementById('masterSlider');
  const masterLabel = document.getElementById('masterLabel');
  masterSlider.value = calib.master;
  masterLabel.textContent = calib.master.toFixed(2);
  masterSlider.addEventListener('input', () => {
    calib.master = parseFloat(masterSlider.value);
    masterLabel.textContent = calib.master.toFixed(2);
    outputVolume(calib.master);
    saveStorage();
  });

  document.getElementById('resetCalibBtn').addEventListener('click', () => {
    calib.offsets = {};
    saveStorage();
    buildCalibPanel();
  });

  renderTally();
}

function renderTally() {
  const counts = { LOW: 0, MID: 0, HIGH: 0 };
  pickHistory.forEach((h) => counts[h.register]++);
  document.getElementById('tally').textContent =
    `선택 기록 ${pickHistory.length}회 · LOW ${counts.LOW} / MID ${counts.MID} / HIGH ${counts.HIGH}`;
}

// 유틸
function getOffset(id) {
  const v = calib.offsets[id];
  return typeof v === 'number' ? v : REGISTERS.find((r) => r.id === id).defaultOffsetDb;
}

function highlightCard(i) {
  [...cardsEl.children].forEach((el, j) => el.classList.toggle('playing', j === i));
}

function setCardsEnabled(enabled) {
  [...cardsEl.children].forEach((el) => { el.disabled = !enabled; });
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function formatDb(db) {
  return (db > 0 ? '+' : '') + db.toFixed(1) + 'dB';
}

function formatHz(hz) {
  return hz >= 1000 ? (hz / 1000) + 'kHz' : hz + 'Hz';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      calib = { offsets: saved.offsets || {}, master: saved.master ?? 0.8 };
      pickHistory = saved.history || [];
    }
  } catch (e) {
    // 저장소를 못 쓰는 환경(사파리 개인정보 보호 모드 등)에서는 기본값으로 진행
  }
}

function saveStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...calib, history: pickHistory }));
  } catch (e) {
    // 무시
  }
}
