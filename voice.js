/**
 * 청각 다변기 (Sound Variator) - 음성 안내 (차민휘 제작, 일레븐랩스)
 *
 * 한국어: media/voice/memesound/m<번호>.mp3 (voiceMemesound.js), 영어: media/voice/e/e<번호>.mp3 (copy.js).
 * iPad는 첫 터치 전에 소리를 못 내서 첫 화면은 글자로만 보여 줌 (사용자 선택 11/05).
 *
 * 줄을 넘기는 것은 재생 끝 이벤트가 아니라 타이머입니다. 오디오가 멈추거나 파일을 못 읽어도 안내가 흐름을 막으면 안 되기 때문입니다.
 * 음성을 꺼도 같은 시간 동안 자막이 나옵니다. EQ·① 볼륨과 무관하게 바로 출력하고, 말하는 동안 비트와 녹음을 줄입니다.
 * 크기는 검사 화면 오른쪽 위의 슬라이더로 관람객이 조절합니다 (차민휘 전달사항 11/06).
 *
 * 안내 잠금: 할 일을 알려 주는 동안(안내, 듣기만 하는 예시)에는 터치를 받지 않습니다 (차민휘 전달사항 11/06).
 * 잠긴 동안 시작한 터치는 풀린 뒤에도 무시하고, 풀린 뒤 새로 시작한 터치부터 반영합니다 (main.js).
 */

const VOICE_FILES = { en: 'media/voice/e/e' };
const VOICE_LEVEL_START = 0.63; // 슬라이더 시작 자리. 소리는 자리의 제곱이라 -8 dB. 원본이 말소리 구간 K-가중 -27 dB로 ①의 최대(-26 dB)만큼 커서 낮춤. Claude가 정한 임시값
const VOICE_GAP_MS = 200;       // 줄 사이 숨 고르기
const VOICE_FALLBACK_SEC = 0.09; // 파일을 못 읽었을 때 글자당 자막을 보여 줄 시간
const VOICE_LOAD_TRIES = 3;
const INPUT_UNLOCK_MS = 1000;      // 안내가 끝나고 터치를 받기까지. 지시문의 1~3초 중 짧은 쪽 (Claude가 정한 임시값)
const INPUT_LOCK_MAX_MS = 60000;   // 예시음이 끝났다는 신호를 못 받아도 잠금이 풀리도록

const voiceClips = { ko: {}, en: {} };
let voiceBus = null;
let voiceSrc = null;
let voiceQueue = [];
let voiceNow = null;   // 지금 말하는 줄의 번호
let voiceRun = 0;      // say()·hushVoice()마다 늘어남 (늦게 도는 타이머 무시용)
let voiceTimer = null;
let voiceDone = null;  // 지금 say()의 Promise
let inputFreeAt = 0;   // 이 시각(millis)까지 터치를 받지 않음

/**
 * 음성을 미리 풀어 둠 (main.js의 setup()에서 호출). 못 읽은 줄은 자막만 나옴
 */
function loadVoice() {
  const ctx = getAudioContext();
  LANGS.forEach(async (lang) => {
    for (const id of voiceIds(lang)) {
      if (VOICE_PENDING[lang].includes(id)) continue; // 문구가 바뀐 줄의 옛 녹음은 틀지 않음
      for (let k = 0; k < VOICE_LOAD_TRIES && !voiceClips[lang][id]; k++) {
        try {
          const res = await fetch(voiceFile(lang, id));
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
  applyVoiceGain();
  if (!on) setVoiceDuck(false);
  else if (voiceNow) setVoiceDuck(!!voiceClips[currentLang()][voiceNow]);
}

// 슬라이더 자리 0~1
function setVoiceLevel(level) {
  window.GlobalState.voiceLevel = constrain(level, 0, 1);
  applyVoiceGain();
}

function resetVoiceLevel() {
  setVoiceLevel(VOICE_LEVEL_START);
}

function voiceGain() {
  const gs = window.GlobalState;
  return gs.voiceOn ? gs.voiceLevel * gs.voiceLevel : 0;
}

function applyVoiceGain() {
  MemeFX.updateGain();
  if (voiceBus) voiceBus.gain.setTargetAtTime(voiceGain(), getAudioContext().currentTime, 0.01);
}

function getVoiceBus() {
  if (!voiceBus) {
    const ctx = getAudioContext();
    voiceBus = ctx.createGain();
    voiceBus.gain.value = voiceGain();
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
  setVoiceDuck(!!clip && window.GlobalState.voiceOn); // 재녹음 전이라 자막만 나오는 줄에서는 비트를 줄이지 않음
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

function lockInput() {
  inputFreeAt = millis() + INPUT_LOCK_MAX_MS;
}

function unlockInput(afterMs = INPUT_UNLOCK_MS) {
  inputFreeAt = millis() + afterMs;
}

function inputLocked() {
  return millis() < inputFreeAt;
}

// 할 일을 알려 주는 안내: 끝나고 INPUT_UNLOCK_MS 뒤까지 터치를 받지 않음
async function sayGuide(ids) {
  lockInput();
  const finished = await say(ids);
  if (finished) unlockInput();
  return finished;
}

// 지금 말하는 줄의 자막
function voiceLine() {
  return voiceNow ? voiceText(voiceNow) : '';
}
