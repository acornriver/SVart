/**
 * 청각 다변기 (Sound Variator) - 화면 문구 (한국어 / English)
 *
 * 모든 안내 문구를 여기 한곳에 키로 모읍니다. 화면은 t('키')로만 문구를 가져옵니다.
 * - 말투: 차민휘 지시문의 존댓말 안내 (11/05부터. 예전의 달팽이 반말은 없앰)
 * - 음성 안내 자막은 VOICE_COPY에 번호로 모으고, 그 번호가 곧 media/voice의 파일 번호입니다.
 */

const LANGS = ['ko', 'en'];

// 단계 이름 (안내는 VOICE_COPY의 음성·자막)
const STAGE_COPY = {
  PART1_VOLUME: { ko: { title: '편한 크기' }, en: { title: 'Comfortable volume' } },
  PART1_LOW: { ko: { title: '꼬리 빚기' }, en: { title: 'Shape the tail' } },
  PART1_HIGH: { ko: { title: '머리 빚기' }, en: { title: 'Shape the head' } },
  PART1_REGISTER: { ko: { title: '껍질 얹기' }, en: { title: 'Place the shell' } },
  PART2_SENSITIVITY: { ko: { title: '어디까지 들리나요?' }, en: { title: 'How high can you hear?' } },
  PART2_CENTER: { ko: { title: '가운데는 어디인가요?' }, en: { title: 'Where is the middle?' } },
  PART2_EAR: { ko: { title: '어느 쪽 소리가 더 높게 들리나요?' }, en: { title: 'Which side sounds higher?' } },
  RESULT: { ko: { title: '나의 청감' }, en: { title: 'My ear profile' } },
  MUSIC: { ko: { title: '세 가지 음악 들어보기' }, en: { title: 'Listen to three tracks' } },
  PART2_PITCH: { ko: { title: '올라갔나요? 내려갔나요?' }, en: { title: 'Up or down?' } }
};

// 음성 안내의 자막 (차민휘 지시문 그대로, media/voice 파일과 번호가 같음). 재생 시점은 part1_audio.js · part2_audio.js
// 녹음이 아직 없는 줄. 녹음이 오면 media/voice에 넣고 여기서 지움. 그 전까지는 소리 없이 자막만 나옴
const VOICE_PENDING = {
  ko: [],
  en: []
};

const VOICE_COPY = {
  '1-1': { ko: '손가락으로 화면을 위로 쓸어 올려보세요.', en: "Swipe up on the screen with your finger." },
  '1-2': { ko: '달팽이의 몸이 쭉 늘어나요.', en: "Watch the snail’s body stretch." },
  '1-3': { ko: '아래로 쓸어 내리면 몸이 줄어들어요.', en: "Swipe down to make its body shrink." },
  '1-4': { ko: '소리도 함께 커지고 작아지는 걸 들어보세요.', en: "Listen as the sound gets louder and softer, too." },
  '1-5': { ko: '편안하게 들리면 달팽이를 길게 눌러주세요.', en: "When the sound feels comfortable, press and hold the snail." },
  '1-6': { ko: '선택하신 소리에 맞춰 몸의 크기가 정해졌어요.', en: "The snail’s body size is now set to match the sound you chose." },
  '2-1': { ko: '달팽이가 조금씩 모습을 갖춰가고 있어요.', en: "The snail is taking shape, little by little." },
  '2-2': { ko: '이번에는 편안하게 들리는 소리에 맞춰 꼬리를 다듬어볼게요.', en: "Now, let’s adjust its tail to match a sound that feels comfortable to you." },
  '2-3': { ko: '손가락으로 화면을 위아래로 쓸며 소리의 변화를 들어보세요.', en: "Swipe up and down on the screen with your finger, and listen to how the sound changes." },
  '2-4': { ko: '가장 편안하게 들리는 소리를 찾으셨다면, 달팽이를 길게 눌러주세요.', en: "Once you find the sound that feels most comfortable, press and hold the snail." },
  '2-5': { ko: '선택하신 소리에 맞춰 꼬리 모양이 정해졌어요.', en: "The tail’s shape is now set to match the sound you chose." },
  '3-1': { ko: '꼬리에 이어, 이번에는 머리를 다듬어볼게요.', en: "Now that we’ve adjusted the tail, let’s shape the head." },
  '3-2': { ko: '손가락으로 화면을 위아래로 쓸며 소리의 변화를 들어보세요.', en: "Swipe up and down on the screen with your finger, and listen to how the sound changes." },
  '3-3': { ko: '가장 편안하게 들리는 소리를 찾아보세요.', en: "Find the sound that feels most comfortable to you." },
  '3-4': { ko: '편안하게 들리면 달팽이를 길게 눌러주세요.', en: "When the sound feels comfortable, press and hold the snail." },
  '3-5': { ko: '선택하신 소리에 맞춰 머리 모양이 정해졌어요.', en: "The head’s shape is now set to match the sound you chose." },
  '4-1': { ko: '이제 등껍질의 자리를 정해볼게요.', en: "Now, let’s choose where the shell will sit." },
  '4-2': { ko: '같은 멜로디를 세 가지 소리로 들려드릴게요.', en: "You’ll hear the same melody played with three different sounds." },
  '4-3': { ko: '소리가 나오는 동안 표시되는 자리를 함께 살펴보세요.', en: "As each sound plays, look at the position marked on the screen." },
  '4-4': { ko: '세 자리를 하나씩 눌러 멜로디를 다시 들어보세요.', en: '' },
  '4-5': { ko: '가장 편안하게 들리는 자리를 고른 뒤, 달팽이를 길게 눌러주세요.', en: "Choose the position where the sound feels most comfortable, then press and hold the snail." },
  '4-6': { ko: '선택하신 소리에 맞춰 등껍질의 자리가 정해졌어요.', en: "The shell’s position is now set to match the sound you chose." },
  '4-7': { ko: '더듬이를 누르면 세 가지 소리를 다시 들을 수 있어요.', en: '' },
  '4-8': { ko: '세 가지 소리를 차례로 다시 들려드릴게요.', en: '' },
  '5-1': { ko: '이번에는 소리가 언제 사라지는지 들어볼게요.', en: "This time, listen for the moment the sound disappears." },
  '5-2': { ko: '소리가 더 이상 들리지 않을 때, 화면 아무 곳이나 한 번 눌러주세요.', en: "Slide the snail to the right until the sound disappears. Stop there, then press and hold the snail to confirm." },
  '5-3': { ko: '한 번 더 들어보시려면 더듬이를 눌러주세요.', en: '' },
  '5-4': { ko: '다음으로 넘어가려면 달팽이를 길게 눌러주세요.', en: "To continue, press and hold the snail." },
  '5-5': { ko: '소리를 듣는 동안 달팽이의 선이 돌돌 말렸어요.', en: "As you listened, the snail’s line coiled up." },
  '5-6': { ko: '같은 방법으로 한 번 더 들어볼게요.', en: '' },
  '5-7': { ko: '아직 소리가 시작되기 전이에요.', en: "The sound hasn’t started yet." },
  '5-8': { ko: '더듬이를 눌러 다시 들어보세요.', en: '' },
  '6-1': { ko: '이번에는 소리가 가운데에서 들리도록 맞춰볼게요.', en: "This time, let’s adjust the sound so you hear it in the center." },
  '6-2': { ko: '손가락으로 화면을 왼쪽이나 오른쪽으로 쓸어보세요.', en: "Swipe left or right on the screen with your finger." },
  '6-3': { ko: '소리가 가운데에서 들리면, 달팽이를 길게 눌러주세요.', en: "When you hear the sound in the center, press and hold the snail." },
  '6-4': { ko: '한 번 더 가운데를 찾아볼게요.', en: "Let’s find the center once more." },
  '6-5': { ko: '달팽이의 색이 정해졌어요.', en: "The snail’s color is now set." },
  '7-1': { ko: '이번에는 소리가 들리는 방향을 찾아볼게요.', en: "This time, let’s find which side the sound is coming from." },
  '7-2': { ko: '방금 들은 소리가 어느 쪽 귀에서 들리는지 들어보세요.', en: "Notice which ear you heard the sound in." },
  '7-3': { ko: '높은 음이 들린 쪽으로 달팽이를 밀어주세요.', en: "Slide the snail toward the side where you heard the higher note." },
  '7-4': { ko: '손을 떼면 선택이 완료돼요.', en: "Lift your finger to confirm your choice." },
  '7-5': { ko: '세 번 진행할게요.', en: "We’ll do this three times." },
  '7-6': { ko: '달팽이의 등껍질 모양이 정해졌어요.', en: "The shape of the snail’s shell is now set." },
  '8-1': { ko: '마지막으로, 두 소리를 듣고 달팽이를 움직여볼게요.', en: "Finally, let’s listen to two sounds and move the snail." },
  '8-2': { ko: '뒤의 소리가 앞의 소리보다 올라가는 느낌이면, 달팽이를 오른쪽으로 밀어주세요.', en: "If the second sound seems to go up from the first, slide the snail to the right." },
  '8-3': { ko: '내려가는 느낌이면, 왼쪽으로 밀어주세요.', en: "If it seems to go down, slide the snail to the left." },
  '8-4': { ko: '손을 떼면 선택이 완료돼요.', en: "Lift your finger to confirm your choice." },
  '8-5': { ko: '여섯 번 진행할게요.', en: "We’ll do this six times." },
  '8-6': { ko: '선택에 따라 달팽이가 움직이며, 흔적을 남겼어요.', en: "As you made your choices, the snail moved and left a trail." },
  '9-1': { ko: '지금까지 고른 소리가 모여, 한 마리의 달팽이가 완성됐어요.', en: "All the sounds you’ve chosen have come together, and your snail is now complete." }
};

const COPY = {
  ko: {
    'ear.pitchHelp': '소리 크기 말고, 음의 높이를 들어보세요.',
    'voice.volume': '안내 음량',
    'intro.before': '모든 귀는 ',
    'intro.after': ' 이다',
    'intro.placeholder': '이름',
    'intro.headphones': '헤드폰을 착용해주세요.',
    'intro.name': '괄호 안에 이름을 입력해주세요.',
    'intro.done': '입력을 마치면 키보드의 완료를 눌러주세요.',
    'intro.voice': '음성 안내',

    'hint.listening': '잘 들어보세요…',
    'hint.analysis': '달팽이를 꾹 눌러 음악 들어보기 →',
    'music.preview': '지금은 북서울의 소리로 미리 들어보세요',
    'hint.result1': '슬라이더로 원래 소리와 내 귀 소리를 비교해보세요',
    'hint.result2': '달팽이를 오른쪽으로 밀면 청감타워로 가요',
    'result.eqOrig': '원래 소리',
    'result.eqMine': '내 귀 EQ',


    'axis.low': '낮은 소리',
    'axis.high': '높은 소리',
    'ear.L': '왼쪽',
    'ear.R': '오른쪽',
    'pitch.L': '내려갔어요',
    'pitch.R': '올라갔어요',
    'center.L': '왼쪽으로 치우친 가운데',
    'center.C': '한가운데',
    'center.R': '오른쪽으로 치우친 가운데',
    'side.L': '왼쪽 귀',
    'side.R': '오른쪽 귀',

    'result.before': '모든 귀는 ',
    'result.after': ' 이다',
    'result.original': '원래 소리를 듣는 중',
    'tour.line': '이 귀로 북서울미술관 주변을 걸어 볼게요',
    'tour.now': '지금 걷는 곳',
    'artist.wonwoori': '원우리',
    'artist.felix': '펠릭스 쿠빈',
    'artist.collaboration': '콜라보 음악',
    'place.water': '당현천',
    'place.train-go': '중계역 지하철',
    'place.car-move': '북서울미술관 앞',
    'sent.title': '청감타워로 갔어요',
    'sent.sub': '다음 귀를 기다릴게요',
    'word.low': '저음',
    'word.high': '고음',
    'row.volume': '크기',
    'row.low': '꼬리 · 저음',
    'row.high': '머리 · 고음',
    'row.register': '껍질 · 음역',
    'row.hearing': '꼬임 · 들리는 높이',
    'row.pan': '색 · 가운데',
    'row.ear': '껍질 모양 · 우세 귀',
    'row.pitch': '바탕음/배음',
    'register.LOW': '저음역',
    'register.MID': '중음역',
    'register.HIGH': '고음역',
    'pitch.F': '바탕음 귀',
    'pitch.B': '두 귀',
    'pitch.H': '배음 귀',
    'khz': (k) => `${k} kHz까지`,
    'lowWords': ['얇게', '그대로', '웅웅'],
    'highWords': ['보들', '그대로', '쨍'],
  },
  en: {
    'ear.pitchHelp': 'Listen for pitch, rather than volume.',
    'voice.volume': 'Voice volume',
    'intro.before': 'Every ear is ',
    'intro.after': '',
    'intro.placeholder': 'name',
    'intro.headphones': 'Please put on your headphones.',
    'intro.name': 'Please enter your name inside the brackets.',
    'intro.done': 'When you’re finished, tap Done on the keyboard.',
    'intro.voice': 'Voice guide',

    'hint.listening': 'Listen…',
    'hint.analysis': 'Press and hold the snail to listen →',
    'music.preview': 'Preview the sounds around Buk-Seoul',
    'hint.result1': 'Slide to compare the original sound and your ear EQ',
    'hint.result2': 'Push the snail to the right to send it to the Hearing Tower',
    'result.eqOrig': 'Original',
    'result.eqMine': 'My Ear EQ',


    'axis.low': 'low',
    'axis.high': 'high',
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
    'tour.line': 'Let’s walk around the Buk-Seoul Museum of Art with these ears',
    'tour.now': 'Now walking',
    'artist.wonwoori': 'WONWOORI',
    'artist.felix': 'Felix Kubin',
    'artist.collaboration': 'Collaboration',
    'place.water': 'Danghyeoncheon Stream',
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
    'row.ear': 'Shell shape · leading ear',
    'row.pitch': 'Pitch mode',
    'register.LOW': 'Low',
    'register.MID': 'Mid',
    'register.HIGH': 'High',
    'pitch.F': 'Fundamental ear',
    'pitch.B': 'Both ears',
    'pitch.H': 'Overtone ear',
    'khz': (k) => `up to ${k} kHz`,
    'lowWords': ['thin', 'as is', 'warm'],
    'highWords': ['velvet', 'as is', 'shiny'],
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

// 음성 안내 번호 → 지금 언어의 자막
function voiceText(id) {
  return memeText(id) !== undefined ? memeText(id) : (VOICE_COPY[id]?.[currentLang()] || '');
}

function stageCopy(stage) {
  const c = STAGE_COPY[stage];
  return c ? c[currentLang()] || c.ko : null;
}

// Result copy describes this participant's choices, without population rankings.
function getSnailAnalysis(profile, psycho, name) {
  const ko = currentLang() === 'ko';
  const low = shelfToLetter(profile.lowShelf.gain, 'LOW');
  const high = shelfToLetter(profile.highShelf.gain, 'HIGH');
  const names = { TV: ['차분한', 'quiet'], TE: ['가벼운', 'light'], TS: ['선명한', 'crisp'], EV: ['부드러운', 'gentle'], EE: ['균형 잡힌', 'balanced'], ES: ['또렷한', 'bright'], WV: ['포근한', 'warm'], WE: ['묵직한', 'deep'], WS: ['풍성한', 'vivid'] };
  const type = (names[low + high] || ['개성 있는', 'distinctive'])[ko ? 0 : 1];
  const bass = { T: ['가벼운 저음', 'lighter bass'], E: ['자연스러운 저음', 'natural bass'], W: ['풍성한 저음', 'fuller bass'] }[low][ko ? 0 : 1];
  const treble = { V: ['부드러운 고음', 'softer treble'], E: ['자연스러운 고음', 'natural treble'], S: ['또렷한 고음', 'brighter treble'] }[high][ko ? 0 : 1];
  const ear = psycho.dominantEar;
  const side = ear === 'LEFT' ? (ko ? '왼' : 'left') : (ko ? '오른' : 'right');
  const paragraphs = [ko ? `${bass}과 ${treble}이 편안한 소리로 느껴졌어요.` : `You chose ${bass} and ${treble} as your comfortable sound.`];
  if (ear) paragraphs.push(ko ? `소리로 비유하면 ${side}손잡이예요. 높은 음을 ${side}쪽에서 더 자주 골랐어요.` : `In sound, think of yourself as ${side}-handed: you chose the higher note on the ${side} more often.`);
  const pitch = psycho.pitchMode;
  if (pitch) paragraphs.push(ko ? ({ F: '소리를 받쳐주는 낮은 바탕음을 따라 음의 움직임을 느끼는 편이에요.', H: '소리 위로 겹쳐지는 높은 울림을 따라 음의 움직임을 느끼는 편이에요.', B: '낮은 바탕음과 높은 울림을 함께 따라 음의 움직임을 느꼈어요.' }[pitch]) : ({ F: 'You tended to follow the low foundation when hearing a melody move.', H: 'You tended to follow the higher overtones when hearing a melody move.', B: 'You followed both the low foundation and the higher overtones.' }[pitch]));
  const userName = String(name || '').trim();
  return { title: ko ? `${userName ? userName + '님은 ' : ''}${type} 달팽이예요` : `${userName ? userName + ', your' : 'Your'} snail is ${type}`, paragraphs };
}
