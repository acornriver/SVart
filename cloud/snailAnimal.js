/**
 * 달팽이 동물 유형 (11/22, 원우리 작가 확정: 동물 버전. 동물·문구·기준은 Claude 초안을 작가가 승인).
 * 아이패드 결과 화면, 청감타워 휴대폰 화면이 같은 동물을 보이도록 **청감 코드 글자만으로** 고릅니다.
 * (DB 문서에도 code가 있어 예전 문서까지 같은 규칙. 전송 규약·Firestore 규칙은 바꾸지 않음)
 * 원본은 SVart/cloud. 고치면 python3 scripts/sync-tower-cloud.py로 타워에 복사합니다.
 *
 * 코드 형식: [음역 O/A/I][저음 T/E/W][고음 V/E/S]-[가운데 L/C/R/·][귀][바탕음](kHz k/음량 0~9)
 * 위에서부터 먼저 맞는 동물 하나. 음량 숫자는 −40~0 dB를 0~9로 나눈 값(7 이상 ≈ −9 dB 이상, 3 이하 ≈ −27 dB 이하)
 */
window.SnailAnimal = (() => {
  const LIST = [
    { id: 'BAT', ko: '박쥐', en: 'Bat', rule: '⑤ 고역 한계 17 kHz 이상', test: t => t.khz !== null && t.khz >= 17,
      lineKo: '남들한텐 조용한 방도 당신에겐 시끄러워요. 박쥐랑 수다 떨 수 있는 귀!',
      lineEn: 'A silent room is never silent for you. You could gossip with bats.' },
    { id: 'PEACOCK', ko: '공작', en: 'Peacock', rule: '② 저음 더함(W) + ③ 고음 더함(S)', test: t => t.low === 'W' && t.high === 'S',
      lineKo: '저음도 고음도 다 크게! 소리도 화려하게 펼쳐야 직성이 풀려요.',
      lineEn: 'Big bass, big treble. Your sound has to fan out every feather.' },
    { id: 'HIPPO', ko: '하마', en: 'Hippo', rule: '② 저음 더함(W)', test: t => t.low === 'W',
      lineKo: '쿵, 쿵. 강바닥까지 울리는 저음이 있어야 마음이 놓여요.',
      lineEn: 'Boom, boom. You need bass that shakes the riverbed.' },
    { id: 'DOLPHIN', ko: '돌고래', en: 'Dolphin', rule: '③ 고음 더함(S)', test: t => t.high === 'S',
      lineKo: '반짝이는 고음이 좋아요. 바닷속에서 끝없이 신호를 보내는 타입!',
      lineEn: 'You love sparkling highs. Always sending signals under the sea.' },
    { id: 'SLOTH', ko: '나무늘보', en: 'Sloth', rule: '② 저음 덜어냄(T) + ③ 고음 덜어냄(V)', test: t => t.low === 'T' && t.high === 'V',
      lineKo: '저음도 고음도 덜어낸 담백한 소리. 느긋하게, 조용하게, 천천히.',
      lineEn: 'Less bass, less treble. Slow, calm and plain is perfect.' },
    { id: 'LION', ko: '사자', en: 'Lion', rule: '① 편한 크기 숫자 7~9 (약 −9 dB 이상)', test: t => t.vol !== null && t.vol >= 7,
      lineKo: '크게, 더 크게! 어떤 소리 앞에서도 물러서지 않아요.',
      lineEn: 'Louder, louder! You never back down from a sound.' },
    { id: 'CAT', ko: '고양이', en: 'Cat', rule: '① 편한 크기 숫자 0~3 (약 −27 dB 이하)', test: t => t.vol !== null && t.vol <= 3,
      lineKo: '작게 틀어도 다 들려요. 몰래 엿듣는 데는 천재.',
      lineEn: 'Even the quietest sounds reach you. A genius eavesdropper.' },
    { id: 'WHALE', ko: '고래', en: 'Whale', rule: '④ 멜로디 A(낮은 음, O) 선택', test: t => t.register === 'LOW',
      lineKo: '낮은 멜로디가 제일 편해요. 깊은 바다에서 노래하는 귀.',
      lineEn: 'Low melodies feel best. You sing from the deep sea.' },
    { id: 'SQUIRREL', ko: '다람쥐', en: 'Squirrel', rule: '④ 멜로디 C(높은 음, I) 선택', test: t => t.register === 'HIGH',
      lineKo: '높은 멜로디가 제일 편해요. 나무 꼭대기에서 재잘재잘.',
      lineEn: 'High melodies feel best. Chattering away at the treetops.' },
    { id: 'OWL', ko: '부엉이', en: 'Owl', rule: '⑥ 편한 자리가 어느 쪽에도 치우치지 않음(C)', test: t => t.center === 'C',
      lineKo: '어느 쪽으로도 기울지 않는 귀. 균형 감각이 남다른 밤의 귀.',
      lineEn: 'Your ears lean to neither side. A night ear with perfect balance.' },
    { id: 'BEAR', ko: '곰', en: 'Bear', rule: '위 어디에도 해당하지 않음', test: () => true,
      lineKo: '무던하고 든든한 귀. 어떤 소리든 일단 꼭 안아 줘요.',
      lineEn: 'Easygoing and steady. You give every sound a big hug.' }
  ];

  // 코드 → 판정에 쓰는 글자들. 예전 짧은 코드(IwS/6)와 Part 2 없는 코드도 읽음. 형식이 틀리면 null
  function traits(code) {
    const text = String(code || '').trim().toUpperCase().replace(/K(?=\/)/, 'k');
    const full = /^([OAI])([TEW])([VES])-?([LCR·])?([LR·])?([FBH·])?(?:\((\d{1,2}(?:\.\d)?|–)k\/([0-9])\))?$/.exec(text);
    const short = /^([OAI])([TEW])([VES])\/([0-9])$/.exec(text);
    if (!full && !short) return null;
    const m = full || short;
    const khz = full && m[7] && m[7] !== '–' ? Number(m[7]) : null;
    const vol = full ? (m[8] === undefined ? null : Number(m[8])) : Number(m[4]);
    return { register: { O: 'LOW', A: 'MID', I: 'HIGH' }[m[1]], low: m[2], high: m[3], center: full && m[4] && m[4] !== '·' ? m[4] : null, khz, vol };
  }

  function fromCode(code) {
    const t = traits(code);
    return t ? LIST.find(animal => animal.test(t)) : null;
  }
  const en = lang => lang === 'en';
  const name = (animal, lang) => en(lang) ? animal.en : animal.ko;
  return {
    LIST, traits, fromCode,
    title: (animal, lang) => en(lang) ? `You're a ${animal.en} Snail!` : `${animal.ko} 달팽이예요!`,
    line: (animal, lang) => en(lang) ? animal.lineEn : animal.lineKo,
    earName: (animal, lang) => en(lang) ? `${animal.en} ear` : `${animal.ko} 귀`,
    name
  };
})();
