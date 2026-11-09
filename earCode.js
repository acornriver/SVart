/**
 * 청각 다변기 (Sound Variator) - 귀 프로필 코드 (Part 1 음색 + 음량)
 *
 * 형식: [음역][저음][고음]-[중앙][우세귀][바탕음·배음]([고역kHz]k/[음량])   예) IWS-RLF(13.2k/6)
 * - 음역: O(저 100Hz) A(중 400Hz) I(고 2.5kHz). 오·아·이 순으로 높게 들리는 모음
 * - 저음: T E W (얇게 / 그대로 / 웅웅)
 * - 고음: V E S (부드럽게 / 그대로 / 또렷하게)
 * - 음량: 0~9, -40~0dB를 고르게 나눔 (약 4.4dB 간격)
 * 쉘프 표시는 8dB 간격(-8 / 0 / +8). 실제 검사 조절값과 검사 순서는 바꾸지 않습니다.
 * 글자 이름은 미확정 (원우리 작가 확인 필요). Part 2 글자 L C R F B H와 겹치지 않게 고름.
 */

const EAR_CODE = {
  REGISTER: [
    { letter: 'O', id: 'LOW', peakHz: 100 },
    { letter: 'A', id: 'MID', peakHz: 400 },
    { letter: 'I', id: 'HIGH', peakHz: 2500 }
  ],
  LOW: { letters: ['T', 'E', 'W'], words: ['얇게', '그대로', '웅웅'] },
  HIGH: { letters: ['V', 'E', 'S'], words: ['보들', '그대로', '쨍'] },
  SHELF_STEP_DB: 8,
  PEAK_GAIN_DB: 3,
  PEAK_Q: 1,
  VOLUME_MIN_DB: -40,
  VOLUME_STEPS: 9
};

function shelfToLetter(gainDb, axis) {
  const k = Math.max(-1, Math.min(1, Math.round(gainDb / EAR_CODE.SHELF_STEP_DB)));
  return EAR_CODE[axis].letters[k + 1];
}

function letterToShelf(letter, axis) {
  // Previously saved short codes remain readable; new codes only emit uppercase.
  const legacy = { t: -4, w: 4, v: -4, s: 4 };
  if (letter in legacy) return legacy[letter];
  const i = EAR_CODE[axis].letters.indexOf(letter);
  return i < 0 ? null : (i - 1) * EAR_CODE.SHELF_STEP_DB;
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
  const text = String(code).trim();
  const full = /^([OAI])([TEW])([VES])-([LCR·])([LR·])([FBH·])\((\d+(?:\.\d+)?|–)k\/([0-9])\)$/.exec(text);
  const short = /^([OAI])([TtEwW])([VvEsS])\/([0-9])$/.exec(text);
  const m = full || short;
  if (!m) return null;
  const reg = EAR_CODE.REGISTER.find((r) => r.letter === m[1]);
  return {
    masterVolume: digitToVolume(Number(full ? m[8] : m[4])),
    lowShelf: { freq: 200, gain: letterToShelf(m[2], 'LOW') },
    highShelf: { freq: 4000, gain: letterToShelf(m[3], 'HIGH') },
    registerPeak: { register: reg.id, freq: reg.peakHz, gain: EAR_CODE.PEAK_GAIN_DB, q: EAR_CODE.PEAK_Q }
  };
}

/**
 * Part 2 글자: [중앙][우세 귀][바탕음·배음]   예) RLF (숫자는 전체 코드 맨 뒤)
 * - 중앙: L 왼쪽으로 치우침 / C 가운데(±5° 안) / R 오른쪽으로 치우침
 * - 우세 귀: L / R,  바탕음·배음: F 바탕음 귀 / B 두 귀 / H 배음 귀
 * - 고역 한계: 고역 예민도 검사에서 소리가 사라진 높이 (8.0 ~ 20.0)
 * 재지 못한 검사는 '·'(kHz는 '–'). 글자 이름은 Part 1과 마찬가지로 미확정.
 * 세기(중앙 °, 우세 귀 세기, 바탕음 지수)는 코드에 없고 psychoProfile에만 있음 (달팽이 색·더듬이에 쓰는 값)
 */
function getPart2Code(psycho) {
  const ear = { LEFT: 'L', RIGHT: 'R' }[psycho.dominantEar] || '·';
  return (psycho.centerImage || '·') + ear + (psycho.pitchMode || '·');
}

/** 전체 청감 코드. 예) "IWS-RLF(13.2k/6)" */
function getFullEarCode(profile, psycho) {
  const letters = getEarCode(profile).split('/')[0];
  const khz = typeof psycho.maxFreqHz === 'number' ? (psycho.maxFreqHz / 1000).toFixed(1) : '–';
  return `${letters}-${getPart2Code(psycho)}(${khz}k/${volumeToDigit(profile.masterVolume)})`;
}
