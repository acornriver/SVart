# 🎧 청각 다변기 (Sound Variator) — Part 1
> **2026 서울시립 북서울미술관 전시 사운드 프로젝트**  
> **Part 1: 파트별 청취로 만드는 개인 선호 EQ (acornriverPart)**  
> 🔗 **웹 데모**: [https://acornriver.github.io/SVart/](https://acornriver.github.io/SVart/)

관람객이 소파에 앉아 아이패드를 손에 들고 무선 헤드폰으로 참여합니다.  
흰 노이즈를 들으며 여러 대역을 한꺼번에 맞추는 대신, **한 단계에 한 파트만** 들려주고 **한 축(앞뒤 기울기)만** 조절해 개인 선호 EQ를 만듭니다. 결과 EQ는 세 작가의 곡에 적용됩니다. 아이패드에서 p5.js + p5.sound만으로 단독 실행합니다.

---

## 📌 진행 흐름 (약 75초)

| 단계 | 들려주는 소리 | 관람객이 하는 일 | 결과값 |
| :--- | :--- | :--- | :--- |
| **① 편한 볼륨** | 넓은 대역 소리 (북서울 환경음 자리, 지금은 핑크 노이즈) | 기울여서 편한 크기로 맞추기 | `masterVolume` |
| **② 음역 고르기** | 같은 멜로디 "도 미 솔 라 솔 미 도"를 저(C2)/중(C4)/고(C6)로 | A/B/C 카드 중 하나 고르기 (순서 무작위) | `registerPeak` (100Hz / 400Hz / 2.5kHz, +3dB, Q 1) |
| **③ 저음 맞추기** | 저역이 풍부한 소리 (지금은 브라운 노이즈) | 기울여서 저음을 더하거나 빼기 | `lowShelf` (200Hz, ±10dB) |
| **④ 고음 맞추기** | 고역이 풍부한 소리 (지금은 화이트 노이즈) | 기울여서 고음을 더하거나 빼기 | `highShelf` (4kHz, ±10dB) |
| **⑤ 결과** | 개인 EQ를 입힌 소리 | 내 EQ ↔ 원래 소리 번갈아 듣기 | `userEQProfile` 확정 |

### 측정 원칙
- **한 축만**: 매 단계 앞뒤 기울기 하나로만 조절합니다. 기기를 세우면 커지거나 많아지고, 눕히면 줄어듭니다.
- **시작값 무작위**: 처음 놓인 자리에 끌려가지 않도록 매 단계 시작값을 무작위로 둡니다.
- **멈추면 확정**: 충분히 움직인 뒤 2초간 멈추면 다음 단계로 넘어갑니다. `여기가 좋아요` 버튼으로도 확정할 수 있습니다.
- **음량 자동 보정**: EQ를 바꿔도 체감 음량(A-가중 파워)이 같도록 보정합니다. 큰 소리를 더 좋다고 고르는 편향을 막기 위해서입니다.
- **화면이 답을 알려주지 않음**: 조절 중에는 dB 값이나 곡선을 크게 보여주지 않습니다. 표식은 기울기만 따라가고, 값은 우상단에 작은 디버그 숫자로만 표시합니다.
- **② 강제 선택**: 카드는 A/B/C로만 표시하고 "모르겠다"는 선택지가 없습니다.

---

## 📂 파일 구조

```
SVart/
├── index.html            # 뷰포트 고정, 모바일 제스처 차단 CSS, p5.js CDN 및 스크립트 로드
├── globalState.js        # 전역 상태 객체 (window.GlobalState)
├── part1_audio.js        # 단계 진행, 소스 전환, 개인 EQ 체인, 음량 보정, 멜로디 신스, 센서
├── visuals.js            # 단계별 화면 렌더러 + 터치 영역
├── main.js               # p5.js 라이프사이클 및 단계별 터치 라우팅
└── tests/register/       # ② 음역 고르기 단독 테스트 + 음역별 음량 보정 도구
```

신호 흐름:

```
단계별 소스 → lowShelf → registerPeak → highShelf → loudnessComp → masterGain → 출력
멜로디(②)  ─────────────────────────────────────────────────────→ masterGain
```

- 최종 감상 곡은 `GlobalState.audioNodes.eqChainInput`에 연결하면 개인 EQ가 적용됩니다.
- EQ를 거치면 안 되는 Part 2 순음과 착청 소스는 `GlobalState.audioNodes.masterGain`에 바로 연결합니다.

---

## 🎛️ 전역 상태 규격 (`globalState.js`)

```javascript
window.GlobalState = {
  // 'INIT' | 'PART1_VOLUME' | 'PART1_REGISTER' | 'PART1_LOW' | 'PART1_HIGH' | 'PART1_RESULT'
  currentStage: 'INIT',
  isAudioInitialized: false,
  isGyroAvailable: false,

  sensor: {
    rawBeta: 0, rawGamma: 0, // 기기 원본 값 (deg)
    tilt: 0, roll: 0,        // 화면 방향 보정 + 스무딩된 앞뒤/좌우 기울기 (deg)
    normX: 0.5, normY: 0.5   // 단계 시작 자세 기준 0.0 ~ 1.0
  },

  part1: {
    stepIndex: 0,            // 0 ~ 4
    control: 0.5,            // 현재 단계 조절값 0.0 ~ 1.0
    hasMoved: false,         // 확정 가능 여부
    dwell: 0,                // 멈춤 확정 진행도 0.0 ~ 1.0
    register: { order: [], playingCard: -1, selectedCard: -1, isAutoPlaying: false },
    isBypassed: false        // 결과 단계에서 원래 소리 듣는 중
  },

  userEQProfile: {
    masterVolume: 0.5,
    lowShelf: { freq: 200, gain: 0 },
    highShelf: { freq: 4000, gain: 0 },
    registerPeak: { register: null, freq: 400, gain: 0, q: 1 }
  },

  psychoProfile: { maxFreqHz: null, dominantEar: null, speechIllusion: {} }, // Part 2
  audioNodes: { fft: null, amplitude: null, eqChainInput: null, masterGain: null }
};
```

---

## 🎵 녹음 파일로 교체하기

`part1_audio.js` 맨 위의 `PART1_SOURCES`에서 단계별로 `file` 경로만 채우면 됩니다. 비워두면 노이즈로 대체합니다.

```javascript
const PART1_SOURCES = {
  VOLUME: { file: './sounds/dangyeoncheon.mp3', noise: 'pink',  spectrum: 'pink',  level: 0.35 },
  LOW:    { file: './sounds/hagye_station.mp3', noise: 'brown', spectrum: 'brown', level: 0.35 },
  ...
};
```

- `spectrum`은 음량 보정 계산에 쓰는 대략적인 스펙트럼 기울기입니다 (`white` / `pink` / `brown`).
- `level`은 소스별 기본 음량입니다. 실기기에서 귀로 맞춰주세요.
- 원본 WAV는 GitHub 100MB 제한에 걸리므로, 루프 구간만 잘라 mp3/m4a로 압축해서 넣으세요.

---

## 🔧 실기기 보정

1. **② 음역별 음량**: `tests/register/`를 아이패드와 헤드폰으로 열고 `[보정]` 패널에서 세 음역이 같은 크기로 들리게 맞춥니다. 같은 기기에서는 본 앱이 그 값을 자동으로 읽어 씁니다(`localStorage`). 확정된 값은 `REGISTERS`의 `defaultOffsetDb`에 옮겨 적어주세요.
2. **기울기 방향**: 아이패드를 가로로 들었을 때 세우기/눕히기 방향이 반대로 느껴지면 `part1_audio.js`의 `TILT_INVERT`를 `true`로 바꿉니다.

---

## 🚀 로컬 실행 & 배포

```bash
python3 -m http.server 8080   # http://localhost:8080
```

- PC에서는 자이로 대신 **화면을 누른 채 위아래로 끌면** 기울기를 흉내 냅니다.
- 자이로는 HTTPS에서만 동작하므로 실기기 테스트는 GitHub Pages([https://acornriver.github.io/SVart/](https://acornriver.github.io/SVart/))로 합니다.
- iOS는 첫 터치 때 동작 및 방향 접근 권한을 묻습니다. 허용해야 기울기를 쓸 수 있습니다.
