/**
 * 청각 다변기 (Sound Variator) - Global State
 * 
 * [Part 1: 개인화 등청감 EQ 및 커스텀 그레이 노이즈 도출]
 * 센서 입력, 오디오 노드, 등청감 EQ 프로파일 상태를 관리하는 단일 상태 객체입니다.
 */

window.GlobalState = {
  // 현재 인터랙션 스테이지 ('INIT' | 'TUNING' | 'PROFILE')
  currentStage: 'INIT',
  
  isAudioInitialized: false,
  isGyroAvailable: false,

  // 센서 및 인터랙션 상태
  sensor: {
    rawBeta: 0,            // 앞뒤 기울기 (-45 ~ +45 deg)
    rawGamma: 0,           // 좌우 기울기 (-45 ~ +45 deg)
    smoothBeta: 0,         // Lerp 스무딩 값
    smoothGamma: 0,        // Lerp 스무딩 값
    normX: 0.5,            // 0.0 ~ 1.0 정규화된 좌우 값 (모바일 Gamma 또는 PC 마우스 X)
    normY: 0.5,            // 0.0 ~ 1.0 정규화된 앞뒤 값 (모바일 Beta 또는 PC 마우스 Y)
    isClutchActive: false, // 클러치 패드 누름 여부 (누르고 있을 때만 Gain 변경)
    activeBandIndex: 2     // 현재 선택된 주파수 대역 인덱스 (0: 60Hz, 1: 250Hz, 2: 1kHz, 3: 4kHz, 4: 8kHz)
  },

  // 개인화 등청감 EQ 프로파일 데이터
  userEQProfile: {
    freqs: [60, 250, 1000, 4000, 8000], // 5-Band 중심 주파수 (Hz)
    gains: [0, 0, 0, 0, 0],              // 각 대역 게인 (-15 ~ +15 dB)
    masterVolume: 0.5                    // 마스터 출력 볼륨 (0.0 ~ 1.0)
  },

  // 실시간 오디오 분석 및 오디오 노드 참조
  audioNodes: {
    fft: null,          // p5.FFT 인스턴스
    amplitude: null,    // p5.Amplitude 인스턴스
    eqChainInput: null, // 5-Band EQ 체인 입력단 (소스 연결용)
    masterGain: null    // 마스터 게인 노드
  }
};
