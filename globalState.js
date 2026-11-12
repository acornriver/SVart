/**
 * 청각 다변기 (Sound Variator) - Global State
 *
 * 이름 입력 → Part 1 (① 볼륨 ② 저음 ③ 고음 ④ 음역) → Part 2 (⑤ 고역 예민도 ⑥ 중앙 ⑦ 우세 귀 ⑧ 바탕음·배음) → 결과(달팽이)
 * 둥근 덩어리를 단계마다 빚어 달팽이를 만들고, Part 2 결과는 꼬임(⑤) · 색(⑥) · 더듬이(⑦) · 점액(⑧)이 됩니다.
 * 모든 파트와 비주얼 팀원이 읽고 쓰는 단일 상태 객체입니다.
 */

window.GlobalState = {
  // 'INIT' | 'NAMED' | 'PART1_VOLUME' | 'PART1_LOW' | 'PART1_HIGH' | 'PART1_REGISTER'
  // | 'PART2_SENSITIVITY' | 'PART2_CENTER' | 'PART2_EAR' | 'PART2_PITCH' | 'RESULT' | 'MUSIC'
  // (NAMED: 이름을 넣고 첫 검사로 넘어가는 사이의 짧은 전환)
  currentStage: 'INIT',

  isAudioInitialized: false,
  userName: '',
  lang: 'ko',              // 'ko' | 'en' 첫 화면에서 고름 (문구는 copy.js)
  voiceOn: true,           // 음성 안내. 첫 화면 확성기 버튼. 꺼도 자막은 나옴 (voice.js)
  voiceLevel: 0.8,        // 음성 안내 크기 슬라이더 자리 0.0 ~ 1.0 (voice.js의 VOICE_LEVEL_START)

  // Part 1 진행 상태 (UI 렌더링용)
  part1: {
    stepIndex: 0,          // FLOW_STAGES 안의 위치
    control: 0.5,          // 현재 단계 조절값 0.0 ~ 1.0 (게이지 위치)
    hasMoved: false,       // 단계 시작 후 충분히 움직였는지 (확정 조건)
    lastDragAt: -1e9,      // 마지막으로 쓴 시각(millis). 비주얼의 손가락 자국용
    register: {
      order: [],           // 카드에 배정된 음역 id. x축이 음고라 항상 ['LOW', 'MID', 'HIGH']
      playOrder: [],       // 처음 들려주는 카드 순서 (무작위, 예: [1, 0, 2])
      playingCard: -1,     // 현재 재생 중인 카드 인덱스
      selectedCard: -1,
      isAutoPlaying: false
    },
    isBypassed: false,     // 결과 단계: true면 EQ 없이 원래 소리 (eqMix < 0.5)
    eqMix: 1               // 결과 단계: 원래 소리(0.0) ↔ 내 귀 EQ(1.0) 슬라이더 위치
  },

  // Part 2 진행 상태 (part2_audio.js, 검사 내용은 ref/part2 (1).html)
  part2: {
    phase: 'lead',         // 'lead' | 'example' | 'pressing' | 'choice' | 'loading' | 'adjusting' | 'playing' | 'answer' | 'wait'
    token: 0,              // 단계·시행이 바뀌면 늘어남 (늦게 도는 타이머 무시용)
    logic: null,           // 검사 진행·채점 (sensLogic 등)
    trial: null,           // 지금 시행
    note: null,            // ⑤ 소리 전에 눌렀으면 'early'
    roll: 0,               // ⑦⑧ 껍질 위치 -1(왼쪽) ~ 1(오른쪽)
    moved: 0,              // ⑦⑧ 굴린 누적량, ⑥ 돌린 각도 누적
    spin: 0,               // ⑥ 껍질이 제자리에서 돈 각도(°)
    replayLeft: 0,         // ⑦⑧ 이 시행에서 남은 다시 듣기
    answerAt: 0,           // ⑦⑧ 답할 수 있게 된 시각(millis)
    voice: null,           // ⑤ 지금 울리는 삐 소리
    tapAt: 0,              // ⑤ 마지막으로 톡 한 시각(millis)
    frozenU: null          // ⑤ 톡 한 순간의 경로 위치 (그 꼬임으로 멈춤)
  },

  // 결과 화면: 북서울 산책(3곡 선택)과 청감타워로 보내기 (tour.js)
  tour: {
    index: 0,              // TOUR_PLACES 안의 지금 소리 (0 ~ 5)
    startAt: 0,            // 감상을 시작한 시각(millis). 청감타워 안내 시점 계산용
    earId: null,           // 보낸 결과의 클라우드 ID (QR 주소용). 로컬에서는 null
    placeAt: 0,            // 이 장소에 들어온 시각(millis)
    sendAt: null,          // 보내기를 누른 시각(millis). null이면 아직
    listenAt: -1e9,        // 곡 버튼을 눌러 달팽이가 귀 기울여 듣기 시작한 시각(millis)
    pinned: false,         // 곡 버튼을 눌렀으면 그 곡에 고정 (자동으로 넘어가지 않음)
  },

  // Part 1 결과 (최종 감상 곡의 개인 EQ, Part 2 기준 볼륨)
  userEQProfile: {
    masterVolume: 0.5,                                   // 0.0 ~ 1.0
    lowShelf: { freq: 200, gain: 0 },                    // dB
    highShelf: { freq: 4000, gain: 0 },                  // dB
    registerPeak: { register: null, freq: 400, gain: 0, q: 1 } // register: 'LOW' | 'MID' | 'HIGH'
  },

  // Part 2 결과 (raw에 검사별 결과 전부)
  psychoProfile: {
    maxFreqHz: null,       // ⑤ 소리가 사라진 높이 (8000 ~ 16000)
    sensitivity: null,     // ⑤ 예민도 0 ~ 100
    twist: null,           // ⑤ 달팽이 꼬임 0 ~ 1 (톡 한 순간의 평균)
    centerDeg: null,       // ⑥ 좌우 치우침 (°, + 오른쪽) → 달팽이 색
    centerImage: null,     // ⑥ 'L' | 'C' | 'R'
    dominantEar: null,     // ⑦ 'LEFT' | 'RIGHT' → 그쪽 더듬이가 길어짐
    earStrength: null,     // ⑦ 0 ~ 100
    pitchMode: null,       // ⑧ 'F' 바탕음 귀 | 'B' 두 귀 | 'H' 배음 귀 → 점액 모양
    pitchIndex: null,      // ⑧ 지수 -100 ~ 100
    raw: { sensitivity: null, center: null, octave: null, f0: null }
  },

  // 오디오 노드 참조 (비주얼 팀원 및 Part 2 공유용)
  audioNodes: {
    fft: null,             // p5.FFT (masterGain 출력 분석)
    amplitude: null,       // p5.Amplitude (masterGain 출력 분석)
    eqChainInput: null,    // 개인 EQ 체인 입력단 (최종 음원을 여기에 연결)
    masterGain: null       // 마스터 출력단 (EQ를 우회할 Part 2 소스는 여기에 직접 연결)
  }
};
