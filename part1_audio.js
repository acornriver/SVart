/**
 * 청각 다변기 (Sound Variator) - Part 1 Audio & Sensor Engine
 * 
 * [Part 1: 개인화 등청감 EQ 및 커스텀 그레이 노이즈 도출]
 * - 오디오 엔진 언락 및 iOS 13+ 모바일 자이로 권한 동시 획득
 * - 모바일 자이로 센서 & PC 마우스 폴백 자동 전환 시스템
 * - 5-Band Peaking EQ 직렬 체인 (60Hz, 250Hz, 1kHz, 4kHz, 8kHz)
 * - 내장 White Noise 소스 및 추후 Zoom H4essential 현장음 교체 지원 구조 (useSampleSource)
 * - 클러치(Clutch: Hold to Tune) 기반 자이로 Gain 제어 및 대역 전환 로직
 * - EQ 초기화(Flat Reset) 및 프로파일 저장/확인 기능
 */

// 오디오 노드 및 소스 내부 참조
let noiseSource = null;
let activeSource = null; // 현재 재생 중인 소스 (Noise 또는 SoundFile)
let eqFilters = [];      // 5개의 p5.Filter('peaking') 배열
let masterGain = null;   // p5.Gain 인스턴스

// 센서 처리 관련 변수
let hasReceivedOrientation = false;
let clutchAnchorBeta = 0;   // 클러치 누른 순간의 기준 Beta 각도
let clutchAnchorGain = 0;   // 클러치 누른 순간의 초기 Gain 값

// 클러치 비작동 시 Gamma 기울기 기반 대역 이동 쿨다운
let bandSwitchCooldown = 0;

/**
 * 1. Part 1 오디오 및 센서 초기화 (단일 터치 제스처로 언락)
 * 브라우저 자동 재생 정책(AudioContext unlock)과 iOS 자이로 권한을 동시에 요청합니다.
 */
function initAudioPart1() {
  if (window.GlobalState.isAudioInitialized) return;

  console.log('[Part 1] Initializing Audio Engine & Sensors...');

  // A. Web Audio Context Unlock
  if (typeof userStartAudio === 'function') {
    userStartAudio();
  }
  const ctx = getAudioContext();
  if (ctx && ctx.state !== 'running') {
    ctx.resume();
  }

  // B. iOS 13+ DeviceOrientation 권한 요청 및 이벤트 바인딩
  setupOrientationSensor();

  // C. 5-Band Peaking EQ 오디오 체인 생성
  setupAudioPipeline();

  // D. 전역 상태 갱신 및 소스 재생 시작
  window.GlobalState.isAudioInitialized = true;
  window.GlobalState.currentStage = 'TUNING';

  if (activeSource) {
    if (activeSource.start) activeSource.start();
    else if (activeSource.loop) activeSource.loop();
    activeSource.amp(window.GlobalState.userEQProfile.masterVolume * 0.7, 0.3);
  }

  console.log('[Part 1] Audio initialized & pipeline running.');
}

/**
 * 모바일 자이로 센서 이벤트 리스너 등록 및 iOS 권한 요청
 */
function setupOrientationSensor() {
  const handleOrientation = (event) => {
    if (event.beta !== null && event.gamma !== null) {
      hasReceivedOrientation = true;
      window.GlobalState.isGyroAvailable = true;

      // 앞뒤(-45 ~ 45), 좌우(-45 ~ 45) 클램핑
      window.GlobalState.sensor.rawBeta = constrain(event.beta, -45, 45);
      window.GlobalState.sensor.rawGamma = constrain(event.gamma, -45, 45);
    }
  };

  // iOS 13+ 권한 요청
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then((permissionState) => {
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation, true);
          console.log('[Sensor] iOS DeviceOrientation permission granted.');
        } else {
          console.warn('[Sensor] iOS DeviceOrientation permission denied. Falling back to PC mouse mode.');
          window.GlobalState.isGyroAvailable = false;
        }
      })
      .catch((err) => {
        console.warn('[Sensor] DeviceOrientation requestPermission error:', err);
        window.GlobalState.isGyroAvailable = false;
      });
  } else if ('ondeviceorientation' in window || typeof DeviceOrientationEvent !== 'undefined') {
    // Android 및 일반 브라우저
    window.addEventListener('deviceorientation', handleOrientation, true);
    console.log('[Sensor] Standard DeviceOrientation listener attached.');
  } else {
    console.log('[Sensor] DeviceOrientation not supported on this device. Using mouse fallback.');
    window.GlobalState.isGyroAvailable = false;
  }
}

/**
 * 5-Band Peaking EQ 오디오 체인 생성 및 연결
 * 
 * 신호 흐름:
 * TestSource -> Filter[0] -> Filter[1] -> Filter[2] -> Filter[3] -> Filter[4] -> MasterGain -> FFT / Destination
 */
function setupAudioPipeline() {
  const freqs = window.GlobalState.userEQProfile.freqs; // [60, 250, 1000, 4000, 8000]

  // 1. 기본 노이즈 소스 생성 (화이트 노이즈)
  // 추후 useSampleSource()를 통해 현장음 파일로 즉시 교체 가능
  noiseSource = new p5.Noise('white');
  noiseSource.disconnect();
  activeSource = noiseSource;

  // 2. 5개의 Peaking 필터 직렬 체이닝
  eqFilters = [];
  for (let i = 0; i < freqs.length; i++) {
    const filter = new p5.Filter('peaking');
    filter.disconnect();
    filter.freq(freqs[i]);
    filter.res(2.0); // Q(Resonance) 값: 인접 대역 간 자연스러운 오버랩
    filter.gain(window.GlobalState.userEQProfile.gains[i]); // 초기 Gain: 0 dB
    eqFilters.push(filter);
  }

  // 필터 간 직렬 연결
  for (let i = 0; i < eqFilters.length - 1; i++) {
    eqFilters[i].connect(eqFilters[i + 1]);
  }

  // 3. 소스를 첫 번째 필터에 연결
  activeSource.connect(eqFilters[0]);

  // 4. 마스터 게인 노드 생성 (볼륨 조절 및 최종 출력 버스)
  masterGain = new p5.Gain();
  masterGain.amp(window.GlobalState.userEQProfile.masterVolume);
  
  // 마지막 필터를 MasterGain에 연결하고 MasterGain을 스피커로 출력
  eqFilters[eqFilters.length - 1].connect(masterGain);
  masterGain.connect();

  // 5. 분석용 FFT 및 Amplitude 노드 생성
  const fft = new p5.FFT(0.8, 512);
  fft.setInput(masterGain);

  const amplitude = new p5.Amplitude();
  amplitude.setInput(masterGain);

  // 6. 전역 상태에 오디오 노드 참조 등록
  window.GlobalState.audioNodes.fft = fft;
  window.GlobalState.audioNodes.amplitude = amplitude;
  window.GlobalState.audioNodes.eqChainInput = eqFilters[0];
  window.GlobalState.audioNodes.masterGain = masterGain;

  console.log('[Part 1] 5-Band Peaking EQ chain established.');
}

/**
 * 2. 센서 데이터 및 오디오 실시간 업데이트 함수 (main.js의 draw()에서 호출)
 */
function updatePart1AudioAndSensors() {
  if (!window.GlobalState.isAudioInitialized) return;

  const sensor = window.GlobalState.sensor;

  // A. 센서 입력 폴백 처리 (자이로 미지원/PC 환경에서는 마우스 좌표 사용)
  if (!window.GlobalState.isGyroAvailable || !hasReceivedOrientation) {
    // 마우스 X: 0 ~ width -> -45 ~ +45도 (Gamma)
    sensor.rawGamma = map(mouseX, 0, width, -45, 45, true);
    // 마우스 Y: height ~ 0 -> -45 ~ +45도 (Beta: 위로 올릴수록 양수)
    sensor.rawBeta = map(mouseY, height, 0, -45, 45, true);
  }

  // B. 부드러운 스무딩 (Lerp) 적용
  const lerpFactor = 0.15;
  sensor.smoothBeta = lerp(sensor.smoothBeta, sensor.rawBeta, lerpFactor);
  sensor.smoothGamma = lerp(sensor.smoothGamma, sensor.rawGamma, lerpFactor);

  // C. 해상도 독립적 정규화 값 갱신 (0.0 ~ 1.0)
  sensor.normX = map(sensor.smoothGamma, -45, 45, 0.0, 1.0, true);
  sensor.normY = map(sensor.smoothBeta, -45, 45, 0.0, 1.0, true);

  // D. 클러치(Clutch) UX 기반 Gain 제어 및 대역 이동 로직
  if (sensor.isClutchActive) {
    // [클러치 홀드 중]: 현재 선택된 대역의 Gain 값만 실시간 튜닝
    const deltaBeta = sensor.smoothBeta - clutchAnchorBeta;
    const targetGain = constrain(clutchAnchorGain + deltaBeta * 0.7, -15, 15);
    
    const bandIdx = sensor.activeBandIndex;
    window.GlobalState.userEQProfile.gains[bandIdx] = targetGain;
    if (eqFilters[bandIdx]) {
      eqFilters[bandIdx].gain(targetGain);
    }
  } else {
    // [클러치 릴리즈 상태]: 기기를 좌우(Gamma)로 기울여 대역 포커스 변경
    if (bandSwitchCooldown > 0) {
      bandSwitchCooldown--;
    } else {
      const g = sensor.smoothGamma;
      let newIdx = sensor.activeBandIndex;
      if (g < -22) newIdx = 0;
      else if (g < -7) newIdx = 1;
      else if (g < 7) newIdx = 2;
      else if (g < 22) newIdx = 3;
      else newIdx = 4;

      if (newIdx !== sensor.activeBandIndex) {
        sensor.activeBandIndex = newIdx;
        bandSwitchCooldown = 15; // 약 0.25초 쿨다운
      }
    }
  }
}

/**
 * 3. 클러치 인터랙션 이벤트 핸들러
 */
function activateClutch() {
  const sensor = window.GlobalState.sensor;
  sensor.isClutchActive = true;
  clutchAnchorBeta = sensor.smoothBeta;
  clutchAnchorGain = window.GlobalState.userEQProfile.gains[sensor.activeBandIndex];
}

function releaseClutch() {
  const sensor = window.GlobalState.sensor;
  sensor.isClutchActive = false;
}

/**
 * 특정 주파수 대역을 직접 선택 (하단 탭 터치 시 호출)
 * @param {number} index - 0 ~ 4
 */
function selectBand(index) {
  if (index >= 0 && index < 5) {
    window.GlobalState.sensor.activeBandIndex = index;
    clutchAnchorBeta = window.GlobalState.sensor.smoothBeta;
    clutchAnchorGain = window.GlobalState.userEQProfile.gains[index];
  }
}

/**
 * 4. 모든 주파수 대역의 Gain을 0dB(Flat)로 리셋
 */
function resetEQ() {
  const profile = window.GlobalState.userEQProfile;
  for (let i = 0; i < profile.gains.length; i++) {
    profile.gains[i] = 0;
    if (eqFilters[i]) {
      eqFilters[i].gain(0);
    }
  }
  clutchAnchorGain = 0;
  console.log('[Part 1] EQ Profile reset to Flat (0 dB).');
}

/**
 * 5. 마스터 볼륨 설정
 * @param {number} vol - 0.0 ~ 1.0
 */
function setMasterVolume(vol) {
  const clampedVol = constrain(vol, 0.0, 1.0);
  window.GlobalState.userEQProfile.masterVolume = clampedVol;
  if (masterGain) {
    masterGain.amp(clampedVol, 0.1);
  }
}

/**
 * 6. [확장 소스 연결] Zoom H4essential 또는 현장 녹음 샘플(WAV)로 교체하는 분기 함수
 * 
 * [사용 방법]:
 * 1) soundFile을 p5.SoundFile로 로드 (예: preload()에서 sample = loadSound('./assets/field_recording.wav'))
 * 2) initAudioPart1() 이후 useSampleSource(sample) 호출
 * 
 * @param {p5.SoundFile} soundFile - 재생할 p5.SoundFile 인스턴스
 */
function useSampleSource(soundFile) {
  if (!soundFile) {
    console.warn('[Part 1] useSampleSource called with null or invalid soundFile.');
    return;
  }

  if (activeSource) {
    if (activeSource.stop) activeSource.stop();
    activeSource.disconnect();
  }

  activeSource = soundFile;
  activeSource.disconnect();

  if (window.GlobalState.audioNodes.eqChainInput) {
    activeSource.connect(window.GlobalState.audioNodes.eqChainInput);
  }

  activeSource.loop();
  activeSource.amp(window.GlobalState.userEQProfile.masterVolume * 0.7);
  console.log('[Part 1] Source replaced with custom sample loop.');
}

/**
 * 7. 튜닝 모드와 프로파일 요약 모드 토글
 */
function toggleProfileView() {
  if (window.GlobalState.currentStage === 'TUNING') {
    window.GlobalState.currentStage = 'PROFILE';
  } else if (window.GlobalState.currentStage === 'PROFILE') {
    window.GlobalState.currentStage = 'TUNING';
  }
  console.log('[Part 1] Current Stage toggled to:', window.GlobalState.currentStage);
}
