/**
 * 청각 다변기 (Sound Variator) - Global State
 *
 * [Part 1: 파트별 청취로 만드는 개인 선호 EQ]
 * ① 편한 볼륨 → ② 음역 고르기 → ③ 저음 맞추기 → ④ 고음 맞추기 → ⑤ 결과
 * 모든 파트와 비주얼 팀원이 읽고 쓰는 단일 상태 객체입니다.
 */

window.GlobalState = {
  // 'INIT' | 'PART1_VOLUME' | 'PART1_REGISTER' | 'PART1_LOW' | 'PART1_HIGH' | 'PART1_RESULT'
  // (Part 2 스테이지는 팀원 A가 'PART2_*'로 추가)
  currentStage: 'INIT',

  isAudioInitialized: false,

  // Part 1 진행 상태 (UI 렌더링용)
  part1: {
    stepIndex: 0,          // 0 ~ 4 (① ~ ⑤)
    control: 0.5,          // 현재 단계 조절값 0.0 ~ 1.0 (게이지 위치)
    hasMoved: false,       // 단계 시작 후 충분히 움직였는지 (확정 조건)
    register: {
      order: [],           // 카드에 배정된 음역 id. x축이 음고라 항상 ['LOW', 'MID', 'HIGH']
      playOrder: [],       // 처음 들려주는 카드 순서 (무작위, 예: [1, 0, 2])
      playingCard: -1,     // 현재 재생 중인 카드 인덱스
      selectedCard: -1,
      isAutoPlaying: false
    },
    isBypassed: false      // 결과 단계: true면 EQ 없이 원래 소리
  },

  // Part 1 결과 (최종 감상 곡의 개인 EQ, Part 2 기준 볼륨)
  userEQProfile: {
    masterVolume: 0.5,                                   // 0.0 ~ 1.0
    lowShelf: { freq: 200, gain: 0 },                    // dB
    highShelf: { freq: 4000, gain: 0 },                  // dB
    registerPeak: { register: null, freq: 400, gain: 0, q: 1 } // register: 'LOW' | 'MID' | 'HIGH'
  },

  // Part 2 결과 (팀원 A가 기록할 영역)
  psychoProfile: {
    maxFreqHz: null,
    dominantEar: null,     // 'LEFT' | 'RIGHT' | 'ALTERNATING'
    speechIllusion: {}     // { yannyLaurel: null, whaleSong: null, jaCha: null }
  },

  // 오디오 노드 참조 (비주얼 팀원 및 Part 2 공유용)
  audioNodes: {
    fft: null,             // p5.FFT (masterGain 출력 분석)
    amplitude: null,       // p5.Amplitude (masterGain 출력 분석)
    eqChainInput: null,    // 개인 EQ 체인 입력단 (최종 음원을 여기에 연결)
    masterGain: null       // 마스터 출력단 (EQ를 우회할 Part 2 소스는 여기에 직접 연결)
  }
};
