/**
 * 청각 다변기 (Sound Variator) - 화면 문구 (한국어 / English)
 *
 * 모든 안내 문구를 여기 한곳에 키로 모읍니다. 화면은 t('키')로만 문구를 가져옵니다.
 * - 말투: 달팽이가 관람객에게 직접 말하는 반말 (영어도 1인칭 "I / my")
 * - 소리 안내(TTS, 일레븐랩스로 제작 중)는 아직 넣지 않았습니다. 단계 안내 키(STAGE_COPY의 단계 이름)를
 *   음성 파일 이름으로 쓰면 바로 연결할 수 있게 해 두었습니다. 파일 위치와 이름 규칙은 미확정입니다.
 */

const LANGS = ['ko', 'en'];

// 단계 안내: title + lines. 음역 단계는 멜로디를 다 들려준 뒤 linesAfter로 바뀜
const STAGE_COPY = {
  PART1_VOLUME: {
    ko: { title: '편한 크기', lines: ['비트가 흘러나오고 있어. 나를 위아래로 쓸면 커졌다 작아졌다 해.', '듣기 편한 크기에서 멈춰 줘.'] },
    en: { title: 'Comfortable volume', lines: ["Hear the beat? Swipe me up and down to make it louder or softer.", 'Stop where it feels comfortable.'] }
  },
  PART1_LOW: {
    ko: { title: '꼬리 빚기', lines: ['이제 내 꼬리를 빚어 줘. 위아래로 쓸면 쿵쿵 낮은 소리가 늘었다 줄었다 해.', '더 좋게 들릴 때 멈춰 줘.'] },
    en: { title: 'Shape my tail', lines: ['Now shape my tail. Swipe up and down and the boom-boom low sounds grow and shrink.', 'Stop when it sounds better to you.'] }
  },
  PART1_HIGH: {
    ko: { title: '머리 빚기', lines: ['이번엔 머리야. 위아래로 쓸면 치키치키 높은 소리가 늘었다 줄었다 해.', '더 좋게 들릴 때 멈춰 줘.'] },
    en: { title: 'Shape my head', lines: ['Now my head. Swipe up and down and the tss-tss high sounds grow and shrink.', 'Stop when it sounds better to you.'] }
  },
  PART1_REGISTER: {
    ko: {
      title: '껍질 얹기',
      lines: ['같은 노래를 세 가지 높이로 불러 볼게. 잘 들어 줘.'],
      linesAfter: ['어느 높이가 제일 편했어?', '내 등 위에서 그 자리를 톡 눌러 줘. 더듬이를 누르면 다시 불러 줄게.']
    },
    en: {
      title: 'Place my shell',
      lines: ["I'll sing the same tune at three heights. Listen closely."],
      linesAfter: ['Which height felt the most comfortable?', "Tap that spot on my back. Tap my antennae to hear it again."]
    }
  },
  PART2_SENSITIVITY: {
    ko: { title: '어디까지 들려?', lines: ['높은 "삐" 소리가 점점 작아지고 높아질 거야. 그동안 나는 점점 더 꼬여.', '안 들리게 되는 순간 화면 아무 데나 톡 눌러 줘. 한 번 더 듣고 싶으면 더듬이를 톡.'] },
    en: { title: 'How high can you hear?', lines: ['A high "beep" will get softer and higher, and I will twist tighter and tighter.', 'The moment you can no longer hear it, tap anywhere on the screen. Tap my antennae to hear it once more.'] }
  },
  PART2_CENTER: {
    ko: { title: '가운데는 어디?', lines: ['비트가 머리 둘레 어딘가에서 들려. 좌우로 쓸면 비트가 머리 둘레를 돌아.', '왼쪽도 오른쪽도 아닌 가운데에서 들리면 나를 꾹 눌러 줘. 내 색이 바뀌는 건 신경 쓰지 말고 귀로만 맞춰 줘. 두 번 할게.'] },
    en: { title: 'Where is the middle?', lines: ['The beat is somewhere around your head. Swipe left and right to move it around your head.', "When it sounds right in the middle, neither left nor right, press and hold me. Don't mind my color changing, just use your ears. We do this twice."] }
  },
  PART2_EAR: {
    ko: { title: '높은 음은 어느 쪽?', lines: ['높은 음과 낮은 음이 양쪽 귀에서 빠르게 번갈아 나와.', '높은 음이 들린 쪽으로 나를 보내 줘. 그쪽 더듬이가 쭉 늘어날 거야. 정답은 없어. 세 번 할게.'] },
    en: { title: 'Where is the high note?', lines: ['A high note and a low note quickly take turns in your two ears.', 'Send me toward the side where you hear the high note, and that antenna will stretch out. There is no right answer. Three times.'] }
  },
  PART2_PITCH: {
    ko: { title: '올라갔어? 내려갔어?', lines: ['두 음이 이어서 나와. 정답은 없으니 처음 느낌대로 골라 줘.', '올라갔으면 오른쪽, 내려갔으면 왼쪽으로 나를 보내 줘. 연습 한 번, 이어서 여섯 번이야.'] },
    en: { title: 'Up or down?', lines: ['Two notes play one after the other. There is no right answer, go with your first feeling.', 'If it went up, send me right. If down, send me left. One practice round, then six.'] }
  }
};

const COPY = {
  ko: {
    'intro.before': '모든 귀는 ',
    'intro.after': ' 이다',
    'intro.placeholder': '이름',
    'intro.hint': '헤드폰을 쓰고, [ ] 안에 이름을 써 줘',

    'hint.swipe': '화면 아무 곳이나 위아래로 쓸어 봐',
    'hint.hold': '마음에 들면 나를 꾹 눌러 줘',
    'hint.roll': '좌우로 쓸어서 나를 기어가게 해 봐',
    'hint.sensNext': '다 됐으면 나를 꾹 눌러 줘',
    'hint.sensAgain': '더듬이를 톡 누르면 한 번 더 들려줘',
    'hint.listening': '잘 들어 봐…',
    'hint.spot': '편한 높이 자리를 내 등 위에서 톡',
    'hint.antenna': '더듬이를 톡 누르면 다시 들려줘',
    'hint.result1': '화면을 누르고 있는 동안은 원래 소리',
    'hint.result2': '나를 오른쪽으로 밀면 청감타워로 가',


    'axis.low': '낮은 소리',
    'axis.high': '높은 소리',
    'hint.ready': '곧 시작해. 잘 들어 봐',
    'hint.tapGone': '안 들리게 되면 바로 화면 아무 데나 톡',
    'hint.turn': '좌우로 쓸어서 비트를 돌려 봐',
    'hint.holdCenter': '가운데서 들리면 나를 꾹 눌러 줘',
    'hint.antennaOnce': '더듬이를 톡 누르면 한 번 더 들려줘',
    'note.early': '소리가 나오기 전에 눌렀어. 더듬이를 톡 해서 다시 들어 줘',
    'p2.practice': '연습',
    'ear.L': '왼쪽',
    'ear.R': '오른쪽',
    'pitch.L': '내려갔어',
    'pitch.R': '올라갔어',
    'center.L': '왼쪽으로 치우친 가운데',
    'center.C': '한가운데',
    'center.R': '오른쪽으로 치우친 가운데',
    'side.L': '왼쪽 귀',
    'side.R': '오른쪽 귀',

    'result.before': '모든 귀는 ',
    'result.after': ' 이다',
    'result.original': '원래 소리를 듣는 중',
    'tour.line': '이 귀로 북서울미술관 주변을 걸어 볼게',
    'tour.now': '지금 걷는 곳',
    'place.water': '당현천',
    'place.walk-stair': '중계역 계단',
    'place.train-go': '중계역 지하철',
    'place.car-move': '북서울미술관 앞',
    'sent.title': '청감타워로 갔어',
    'sent.sub': '다음 귀를 기다릴게',
    'word.low': '저음',
    'word.high': '고음',
    'row.volume': '크기',
    'row.low': '꼬리 · 저음',
    'row.high': '머리 · 고음',
    'row.register': '껍질 · 음역',
    'row.hearing': '꼬임 · 들리는 높이',
    'row.pan': '색 · 가운데',
    'row.ear': '더듬이 · 우세 귀',
    'row.pitch': '점액 · 바탕음/배음',
    'register.LOW': '저음역',
    'register.MID': '중음역',
    'register.HIGH': '고음역',
    'pitch.F': '바탕음 귀',
    'pitch.B': '두 귀',
    'pitch.H': '배음 귀',
    'khz': (k) => `${k} kHz까지`,
    'lowWords': ['얇게', '조금 얇게', '그대로', '조금 웅웅', '웅웅'],
    'highWords': ['보들', '조금 보들', '그대로', '조금 쨍', '쨍']
  },
  en: {
    'intro.before': 'Every ear is ',
    'intro.after': '',
    'intro.placeholder': 'name',
    'intro.hint': 'Put on the headphones and write your name in [ ]',

    'hint.swipe': 'Swipe up and down anywhere',
    'hint.hold': 'Like it? Press and hold me',
    'hint.roll': 'Swipe left and right to make me crawl',
    'hint.sensNext': 'Done? Press and hold me',
    'hint.sensAgain': 'Tap my antennae to hear it once more',
    'hint.listening': 'Listen…',
    'hint.spot': 'Tap the comfortable height on my back',
    'hint.antenna': 'Tap my antennae to hear it again',
    'hint.result1': 'Hold the screen to hear the original',
    'hint.result2': 'Push me to the right to send me to the Hearing Tower',


    'axis.low': 'low',
    'axis.high': 'high',
    'hint.ready': 'Starting soon. Listen closely',
    'hint.tapGone': 'Tap anywhere as soon as it is gone',
    'hint.turn': 'Swipe left and right to move the beat',
    'hint.holdCenter': 'In the middle? Press and hold me',
    'hint.antennaOnce': 'Tap my antennae to hear it once more',
    'note.early': 'You tapped before the sound started. Tap my antennae to listen again',
    'p2.practice': 'practice',
    'ear.L': 'Left',
    'ear.R': 'Right',
    'pitch.L': 'Down',
    'pitch.R': 'Up',
    'center.L': 'Middle, leaning left',
    'center.C': 'Right in the middle',
    'center.R': 'Middle, leaning right',
    'side.L': 'Left ear',
    'side.R': 'Right ear',

    'result.before': 'Every ear is ',
    'result.after': '',
    'result.original': 'Playing the original',
    'tour.line': 'Let me walk around the Buk-Seoul Museum of Art with these ears',
    'tour.now': 'Now walking',
    'place.water': 'Danghyeoncheon Stream',
    'place.walk-stair': 'Junggye Station stairs',
    'place.train-go': 'Junggye Station subway',
    'place.car-move': 'In front of Buk-Seoul Museum of Art',
    'sent.title': 'Off to the Hearing Tower',
    'sent.sub': 'Waiting for the next ear',
    'word.low': 'low',
    'word.high': 'high',
    'row.volume': 'Size',
    'row.low': 'Tail · low',
    'row.high': 'Head · high',
    'row.register': 'Shell · register',
    'row.hearing': 'Twist · highest heard',
    'row.pan': 'Color · middle',
    'row.ear': 'Antennae · leading ear',
    'row.pitch': 'Slime · pitch',
    'register.LOW': 'Low',
    'register.MID': 'Mid',
    'register.HIGH': 'High',
    'pitch.F': 'Fundamental ear',
    'pitch.B': 'Both ears',
    'pitch.H': 'Overtone ear',
    'khz': (k) => `up to ${k} kHz`,
    'lowWords': ['thin', 'a bit thin', 'as is', 'a bit warm', 'warm'],
    'highWords': ['velvet', 'a bit velvet', 'as is', 'a bit shiny', 'shiny']
  }
};

function currentLang() {
  return window.GlobalState.lang;
}

/** 키 → 지금 언어의 문구. 없으면 한국어, 그래도 없으면 키 그대로 */
function t(key) {
  const lang = currentLang();
  const v = COPY[lang][key] !== undefined ? COPY[lang][key] : COPY.ko[key];
  return v !== undefined ? v : key;
}

function stageCopy(stage) {
  const c = STAGE_COPY[stage];
  return c ? c[currentLang()] || c.ko : null;
}
