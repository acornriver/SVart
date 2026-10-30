/**
 * 청각 다변기 (Sound Variator) - 귀 프로필 코드 (Part 1 음색 + 음량)
 *
 * 형식: [음역][저음][고음]/[음량]   예) IwS/6
 * - 음역: O(저 100Hz) A(중 400Hz) I(고 2.5kHz). 오·아·이 순으로 높게 들리는 모음
 * - 저음: T t E w W  (Thin ~ Warm, 대문자 = 많이, 소문자 = 조금, E = 그대로)
 * - 고음: V v E s S  (Velvet ~ Shiny)
 * - 음량: 0~9, -40~0dB를 고르게 나눔 (약 4.4dB 간격)
 * 쉘프 게인은 4dB 칸(대표값 -8 -4 0 4 8)이라 되살렸을 때 EQ 곡선 오차는 최대 약 2dB.
 * 글자 이름은 미확정 (원우리 작가 확인 필요). Part 2 글자 D N B M C P L R F H와 겹치지 않게 고름.
 */

const EAR_CODE = {
  REGISTER: [
    { letter: 'O', id: 'LOW',  peakHz: 100 },
    { letter: 'A', id: 'MID',  peakHz: 400 },
    { letter: 'I', id: 'HIGH', peakHz: 2500 }
  ],
  LOW:  { letters: ['T', 't', 'E', 'w', 'W'], words: ['얇게', '조금 얇게', '그대로', '조금 웅웅', '웅웅'] },
  HIGH: { letters: ['V', 'v', 'E', 's', 'S'], words: ['보들', '조금 보들', '그대로', '조금 쨍', '쨍'] },
  SHELF_STEP_DB: 4,
  PEAK_GAIN_DB: 3,
  PEAK_Q: 1,
  VOLUME_MIN_DB: -40,
  VOLUME_STEPS: 9
};

function shelfToLetter(gainDb, axis) {
  const k = Math.max(-2, Math.min(2, Math.round(gainDb / EAR_CODE.SHELF_STEP_DB)));
  return EAR_CODE[axis].letters[k + 2];
}

function letterToShelf(letter, axis) {
  const i = EAR_CODE[axis].letters.indexOf(letter);
  return i < 0 ? null : (i - 2) * EAR_CODE.SHELF_STEP_DB;
}

function volumeToDigit(gain) {
  const db = 20 * Math.log10(Math.max(gain, 1e-6));
  const t = (db - EAR_CODE.VOLUME_MIN_DB) / -EAR_CODE.VOLUME_MIN_DB;
  return Math.max(0, Math.min(EAR_CODE.VOLUME_STEPS, Math.round(t * EAR_CODE.VOLUME_STEPS)));
}

function digitToVolume(d) {
  const db = EAR_CODE.VOLUME_MIN_DB * (1 - d / EAR_CODE.VOLUME_STEPS);
  return Math.pow(10, db / 20);
}

/** userEQProfile → "IwS/6" */
function getEarCode(profile) {
  const reg = EAR_CODE.REGISTER.find((r) => r.id === profile.registerPeak.register) || EAR_CODE.REGISTER[1];
  return reg.letter +
    shelfToLetter(profile.lowShelf.gain, 'LOW') +
    shelfToLetter(profile.highShelf.gain, 'HIGH') +
    '/' + volumeToDigit(profile.masterVolume);
}

/** "IwS/6" → userEQProfile 모양의 객체. 형식이 틀리면 null */
function parseEarCode(code) {
  const m = /^([OAI])([TtEwW])([VvEsS])\/([0-9])$/.exec(String(code).trim());
  if (!m) return null;
  const reg = EAR_CODE.REGISTER.find((r) => r.letter === m[1]);
  return {
    masterVolume: digitToVolume(Number(m[4])),
    lowShelf: { freq: 200, gain: letterToShelf(m[2], 'LOW') },
    highShelf: { freq: 4000, gain: letterToShelf(m[3], 'HIGH') },
    registerPeak: { register: reg.id, freq: reg.peakHz, gain: EAR_CODE.PEAK_GAIN_DB, q: EAR_CODE.PEAK_Q }
  };
}
