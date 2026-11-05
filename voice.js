/**
 * 청각 다변기 (Sound Variator) - 음성 안내 (차민휘 제작, 일레븐랩스)
 *
 * 파일: media/voice/k/k<번호>.mp3 (한국어), media/voice/e/e<번호>.mp3 (영어). 번호와 문구는 copy.js의 VOICE_COPY.
 * 0-1~0-3은 파일만 있고 재생하지 않음: iPad는 첫 터치 전에 소리를 못 내서 첫 화면은 글자로만 보여 줌 (사용자 선택 11/05)
 *
 * 줄을 넘기는 것은 재생 끝 이벤트가 아니라 타이머입니다. 오디오가 멈추거나 파일을 못 읽어도 안내가 흐름을 막으면 안 되기 때문입니다.
 * 음성을 꺼도 같은 시간 동안 자막이 나옵니다. EQ·① 볼륨과 무관한 고정 크기로 바로 출력하고, 말하는 동안 비트와 녹음을 줄입니다.
 */

const VOICE_FILES = { ko: 'media/voice/k/k', en: 'media/voice/e/e' };
const VOICE_LEVEL = 1;          // 원본이 말소리 구간 RMS 약 -27 dB, 피크 0.31. Part 2 검사음과 비슷한 크기. 헤드폰으로 들어 보고 조정
const VOICE_GAP_MS = 200;       // 줄 사이 숨 고르기
const VOICE_FALLBACK_SEC = 0.09; // 파일을 못 읽었을 때 글자당 자막을 보여 줄 시간
const VOICE_LOAD_TRIES = 3;

const voiceClips = { ko: {}, en: {} };
let voiceBus = null;
let voiceSrc = null;
let voiceQueue = [];
let voiceNow = null;   // 지금 말하는 줄의 번호
let voiceRun = 0;      // say()·hushVoice()마다 늘어남 (늦게 도는 타이머 무시용)
let voiceTimer = null;
let voiceDone = null;  // 지금 say()의 Promise

/**
 * 음성을 미리 풀어 둠 (main.js의 setup()에서 호출). 못 읽은 줄은 자막만 나옴
 */
function loadVoice() {
  const ctx = getAudioContext();
  LANGS.forEach(async (lang) => {
    for (const id of Object.keys(VOICE_COPY)) {
      for (let k = 0; k < VOICE_LOAD_TRIES && !voiceClips[lang][id]; k++) {
        try {
          const res = await fetch(`${VOICE_FILES[lang]}${id}.mp3`);
          if (!res.ok) continue;
          const ab = await res.arrayBuffer();
          voiceClips[lang][id] = await new Promise((ok, fail) => {
            const p = ctx.decodeAudioData(ab, ok, fail);
            if (p && p.then) p.then(ok, fail);
          });
        } catch (e) {
          // 다음 시도로
        }
      }
    }
  });
}

function setVoiceOn(on) {
  window.GlobalState.voiceOn = on;
  if (voiceBus) voiceBus.gain.value = on ? VOICE_LEVEL : 0;
  if (!on) setVoiceDuck(false);
  else if (voiceNow) setVoiceDuck(true);
}

function getVoiceBus() {
  if (!voiceBus) {
    const ctx = getAudioContext();
    voiceBus = ctx.createGain();
    voiceBus.gain.value = window.GlobalState.voiceOn ? VOICE_LEVEL : 0;
    voiceBus.connect(ctx.destination);
  }
  return voiceBus;
}

/**
 * 하던 안내를 끊고 ids를 차례로 말함. 끝까지 말하면 true, 도중에 끊기면 false
 */
function say(ids) {
  hushVoice();
  voiceQueue = [...ids];
  const run = voiceRun;
  return new Promise((resolve) => {
    voiceDone = resolve;
    nextVoiceLine(run);
  });
}

function nextVoiceLine(run) {
  if (run !== voiceRun) return;
  stopVoiceSource();
  const id = voiceQueue.shift();
  if (!id) {
    voiceNow = null;
    setVoiceDuck(false);
    settleVoice(true);
    return;
  }
  voiceNow = id;
  const clip = voiceClips[currentLang()][id];
  if (clip && window.GlobalState.isAudioInitialized) {
    const ctx = getAudioContext();
    voiceSrc = ctx.createBufferSource();
    voiceSrc.buffer = clip;
    voiceSrc.connect(getVoiceBus());
    voiceSrc.start();
  }
  if (window.GlobalState.voiceOn) setVoiceDuck(true);
  const ms = (clip ? clip.duration : voiceText(id).length * VOICE_FALLBACK_SEC) * 1000;
  voiceTimer = setTimeout(() => nextVoiceLine(run), ms + VOICE_GAP_MS);
}

function stopVoiceSource() {
  if (!voiceSrc) return;
  try { voiceSrc.stop(); voiceSrc.disconnect(); } catch (e) { /* 이미 멈춤 */ }
  voiceSrc = null;
}

function settleVoice(finished) {
  const done = voiceDone;
  voiceDone = null;
  if (done) done(finished);
}

// 안내를 바로 끊음 (단계를 옮기거나 관람객이 먼저 조작했을 때)
function hushVoice() {
  voiceRun++;
  clearTimeout(voiceTimer);
  stopVoiceSource();
  voiceQueue = [];
  voiceNow = null;
  setVoiceDuck(false);
  settleVoice(false);
}

function voiceBusy() {
  return voiceNow !== null;
}

// 지금 말하는 줄의 자막
function voiceLine() {
  return voiceNow ? voiceText(voiceNow) : '';
}
