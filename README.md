# 🎧 청각 다변기 (Sound Variator) — Part 1
> **2026 서울시립 북서울미술관 전시 사운드 프로젝트**  
> **Part 1: 개인화 등청감 EQ 및 커스텀 그레이 노이즈 도출 (acornriverPart)**

스마트폰(iOS / Android)의 자이로 센서 및 터치 인터랙션을 활용하여 관람객 개개인의 청각 특성에 맞는 **등청감 곡선(Equal-Loudness Curve)**을 도출하고, 이에 기반한 **맞춤형 그레이 노이즈(Custom Gray Noise)**를 실시간 합성하는 인터랙티브 사운드 웹 애플리케이션입니다.

---

## 📌 핵심 기능 (Core Features)

1. **단일 터치 언락 (Single Gesture Unlock)**
   - 브라우저 자동 재생 제한(Web Audio Context) 해제와 iOS 13+ 모바일 자이로 센서 권한(`DeviceOrientationEvent.requestPermission`)을 첫 터치 한 번으로 동시 획득합니다.
2. **자이로 센서 & PC 마우스 폴백 (Sensor Fallback)**
   - 모바일 환경에서는 기기의 기울기(`beta`, `gamma`)를 읽어와 오디오를 제어합니다.
   - PC/데스크톱 브라우저 접속 시 자동으로 마우스 커서 좌표(`mouseX`, `mouseY`)가 센서 각도를 시뮬레이션하여 개발 및 테스트가 용이합니다.
3. **클러치(Hold to Tune) UX 메커니즘**
   - 기기를 움직일 때 이전 주파수 대역의 Gain 값이 망가지는 것을 방지하기 위해 **클러치 방식**을 적용했습니다.
   - 화면 중앙의 **[HOLD TO TUNE]** 영역을 누르고 있는 동안에만 기기를 앞뒤로 기울여 현재 대역의 Gain(-15dB ~ +15dB)을 조절할 수 있으며, 손을 떼는 순간 값이 고정(Lock)됩니다.
4. **5-Band Peaking EQ 오디오 파이프라인**
   - 중심 주파수: `60Hz`, `250Hz`, `1kHz`, `4kHz`, `8kHz`
   - 직렬(Series Chain) 연결 구조로 신호가 전달되며 실시간 FFT 분석을 통해 시각화됩니다.
5. **독립 모듈형 구조**
   - 단일 전역 상태(`window.GlobalState`)를 기준으로 오디오와 비주얼 렌더링이 완벽히 분리되어 있어, 향후 비주얼 아티스트나 팀원의 작업과 유연하게 결합할 수 있습니다.

---

## 📂 파일 구조 (File Architecture)

```
acornriverPart/
├── index.html        # 뷰포트 고정, 모바일 제스처 차단 CSS, p5.js CDN 및 스크립트 로드
├── globalState.js    # 전역 상태 객체 (window.GlobalState) 정의
├── part1_audio.js    # 오디오 버스, 5-Band EQ 체인, 자이로/마우스 센서 로직
├── visuals.js        # 등청감 곡선, FFT 스펙트럼, 클러치 피드백, UI 렌더러
├── main.js           # p5.js 라이프사이클(setup, draw) 및 터치/마우스 이벤트 라우터
└── README.md         # 프로젝트 문서
```

---

## 🎛️ 전역 상태 규격 (`globalState.js`)

비주얼 팀원 또는 타 모듈에서 `window.GlobalState`를 통해 현재 센서 수치와 EQ 설정값에 직접 접근할 수 있습니다:

```javascript
window.GlobalState = {
  currentStage: 'INIT', // 'INIT' | 'TUNING' | 'PROFILE'
  isAudioInitialized: false,
  isGyroAvailable: false,

  // 센서 및 정규화 값 (비주얼 연동용)
  sensor: {
    rawBeta: 0,            // 앞뒤 기울기 (-45 ~ +45 deg)
    rawGamma: 0,           // 좌우 기울기 (-45 ~ +45 deg)
    smoothBeta: 0,         // Lerp 스무딩 값
    smoothGamma: 0,
    normX: 0.5,            // 0.0 ~ 1.0 (모바일 Gamma 또는 PC 마우스 X)
    normY: 0.5,            // 0.0 ~ 1.0 (모바일 Beta 또는 PC 마우스 Y)
    isClutchActive: false, // 클러치 누름 여부
    activeBandIndex: 2     // 현재 선택된 대역 인덱스 (0: 60Hz ~ 4: 8kHz)
  },

  // Part 1 개인화 등청감 EQ 결과값
  userEQProfile: {
    freqs: [60, 250, 1000, 4000, 8000],
    gains: [0, 0, 0, 0, 0], // dB 단위 (-15 ~ +15)
    masterVolume: 0.5
  },

  // 오디오 분석 노드 참조
  audioNodes: {
    fft: null,          // p5.FFT 인스턴스 (실시간 주파수 분석)
    amplitude: null,    // p5.Amplitude 인스턴스 (음량 레벨 분석)
    eqChainInput: null, // 소스 연결용 체인 입력단
    masterGain: null    // 마스터 출력 게인 노드
  }
};
```

---

## 🚀 로컬 실행 방법 (Local Development)

정적 파일 기반이므로 별도의 복잡한 빌드 과정 없이 정적 웹 서버로 즉시 실행할 수 있습니다.

### 방법 1: Node.js (npx)
```bash
npx serve ./
```

### 방법 2: Python 3
```bash
python3 -m http.server 8080
```
브라우저에서 `http://localhost:8080`으로 접속하여 테스트합니다.

---

## 🌐 GitHub Pages 배포 가이드

1. **HTTPS 필수 주의사항**:
   - 모바일 Safari 및 최신 Chrome은 **보안 컨텍스트(`https://`)에서만 자이로 센서 접근 권한을 허용**합니다.
   - GitHub Pages는 기본적으로 HTTPS가 적용되므로 스마트폰 실기기 테스트에 가장 적합합니다.
2. **배포 단계**:
   - 이 저장소의 모든 파일을 GitHub Repository의 `main` 브랜치에 푸시합니다.
   - 저장소 **Settings** ➔ **Pages**로 이동합니다.
   - **Branch**를 `main`, 폴더를 `/(root)`로 지정 후 **Save**합니다.
   - 생성된 URL(`https://<username>.github.io/<repo>/`)로 스마트폰(iOS Safari, Android Chrome) 및 iPad에서 바로 접속해 테스트할 수 있습니다.

---

## 🎵 현장 녹음 음원(Zoom H4essential 샘플) 교체 방법

기본 상태에서는 외부 에셋 파일 없이도 즉시 작동하도록 **내장 화이트 노이즈(`p5.Noise('white')`)**를 소스로 사용합니다.  
향후 현장 녹음 음원(비행기 이착륙음, 금속 타격음 등의 루프 WAV 파일)으로 교체할 때는:

1. 프로젝트 루트에 `assets/` 폴더를 만들고 음원 파일(예: `ambient_loop.wav`)을 넣습니다.
2. `main.js`의 `preload()`에서 파일을 로드합니다:
   ```javascript
   let customSample;
   function preload() {
     customSample = loadSound('./assets/ambient_loop.wav');
   }
   ```
3. `part1_audio.js`에 준비되어 있는 `useSampleSource()` 함수를 호출합니다:
   ```javascript
   useSampleSource(customSample);
   ```
   * 체인 입력단에 자동으로 연결되고 노이즈 소스는 정지됩니다.

---

## 📱 조작 가이드 (Interaction Guide)

| 동작 | 조작 방법 |
| :--- | :--- |
| **사운드 및 센서 시작** | 초기 화면의 `🎧 시작하기` 버튼 탭 |
| **주파수 대역 선택** | 하단 5개 탭(`60Hz ~ 8kHz`) 직접 터치 또는 기기를 좌우(`gamma`)로 기울이기 |
| **대역별 Gain 조절** | 중앙 `[HOLD TO TUNE]` 패드를 누른 채 스마트폰을 앞뒤로 기울이기 (손을 떼면 고정) |
| **EQ 초기화** | 하단 `🔄 EQ 초기화 (Flat)` 버튼 탭 (모든 대역 0dB 리셋) |
| **결과 프로파일 확인** | 하단 `📊 결과 프로파일 보기` 탭 (대역별 최종 수치 및 요약 카드 확인) |
