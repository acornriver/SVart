# 🎧 청각 다변기 (Sound Variator) — Part 1
> **2026 서울시립 북서울미술관 전시 사운드 프로젝트**  
> **Part 1: 파트별 청취로 만드는 개인 선호 EQ (acornriverPart)**  
> 🔗 **웹 데모**: [https://acornriver.github.io/SVart/](https://acornriver.github.io/SVart/)

관람객이 소파에 앉아 아이패드를 손에 들고 무선 헤드폰으로 참여합니다.  
흰 노이즈를 들으며 여러 대역을 한꺼번에 맞추는 대신, **한 단계에 한 파트만** 들려주고 **한 축(위아래 쓸기)만** 조절해 개인 선호 EQ를 만듭니다. 결과 EQ는 세 작가의 곡에 적용됩니다. 아이패드에서 p5.js + p5.sound만으로 단독 실행합니다.

---

## 📌 진행 흐름 (약 75초)

| 단계 | 들려주는 소리 | 관람객이 하는 일 | 결과값 |
| :--- | :--- | :--- | :--- |
| **① 편한 볼륨** | 넓은 대역 소리 (당현천 물소리) | 위아래로 쓸어 편한 크기로 맞추기 | `masterVolume` |
| **② 음역 고르기** | 같은 멜로디 "도 미 솔 라 솔 미 도"를 저(C2)/중(C4)/고(C6)로 | 음고 축 위 A/B/C 중 하나 고르기 (듣는 순서 무작위) | `registerPeak` (100Hz / 400Hz / 2.5kHz, +3dB, Q 1) |
| **③ 저음 맞추기** | 저역이 풍부한 소리 (7호선 열차) | 위아래로 쓸어 저음을 더하거나 빼기 | `lowShelf` (200Hz, ±10dB) |
| **④ 고음 맞추기** | 고역이 풍부한 소리 (미술관 계단 발소리) | 위아래로 쓸어 고음을 더하거나 빼기 | `highShelf` (4kHz, ±10dB) |
| **⑤ 결과** | 개인 EQ를 입힌 소리 | 내 EQ ↔ 원래 소리 번갈아 듣기 | `userEQProfile` 확정 |

### 측정 원칙
- **한 축만**: 매 단계 화면을 위아래로 쓸어서만 조절합니다. 위로 쓸면 커지거나 많아지고, 아래로 쓸면 줄어듭니다. 손가락 위치가 아니라 쓴 거리만큼 바뀌는 상대 조작이라 무작위 시작값이 유지됩니다.
- **시작값 무작위**: 처음 놓인 자리에 끌려가지 않도록 매 단계 시작값을 무작위로 둡니다.
- **버튼으로 확정**: 충분히 움직인 뒤에만 `여기가 좋아요` 버튼이 켜집니다.
- **음량 자동 보정**: EQ를 바꿔도 체감 음량(A-가중 파워)이 같도록 보정합니다. 큰 소리를 더 좋다고 고르는 편향을 막기 위해서입니다.
- **숫자는 숨김**: 조절 중에는 dB 값이나 눈금 숫자를 보여주지 않습니다. 값은 우상단에 작은 디버그 숫자로만 표시합니다. 다만 막 모양은 EQ를 따라 바뀌므로, 관람객이 귀 대신 '매끈한 모양'에 맞추는지 실기 테스트에서 지켜봐야 합니다.
- **② 강제 선택**: 세 음역은 A/B/C로만 표시하고 "모르겠다"는 선택지가 없습니다. x축이 음고라 자리는 낮은 음역부터 왼쪽→오른쪽으로 고정이고, 처음 들려주는 순서만 무작위입니다.

### 비주얼
- **x축 = 음고**: 모든 단계에서 가로축은 20Hz ~ 20kHz 로그 축입니다. 왼쪽이 낮은 소리(남보라), 오른쪽이 높은 소리(청록)입니다.
- **막**: 가는 사인 곡선을 겹쳐 그린 반투명 막입니다 (참고: Che-Yu Wu, *SoulFish*). 두께는 그 높이의 소리를 얼마나 키웠는지(개인 EQ + 볼륨), 일렁임은 지금 실제로 나는 소리(FFT)를 따릅니다. 가운데 척추의 가시가 주파수 눈금입니다.
- ③④에서는 바꾸는 음역(저음은 왼쪽, 고음은 오른쪽)에 옅은 빛이 비칩니다. ②에서는 지금 울리는 음역이 부풀어 오릅니다.

---

## 📂 파일 구조

```
SVart/
├── index.html            # 뷰포트 고정, 모바일 제스처 차단 CSS, p5.js CDN 및 스크립트 로드
├── globalState.js        # 전역 상태 객체 (window.GlobalState)
├── part1_audio.js        # 단계 진행, 소스 전환, 개인 EQ 체인, 음량 보정, 멜로디 신스, 쓸기 조작
├── visuals.js            # 막 비주얼 + 단계별 화면 렌더러 + 터치 영역
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

  part1: {
    stepIndex: 0,            // 0 ~ 4
    control: 0.5,            // 현재 단계 조절값 0.0 ~ 1.0
    hasMoved: false,         // 확정 가능 여부
    register: { order: [], playOrder: [], playingCard: -1, selectedCard: -1, isAutoPlaying: false },
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
2. **쓸기 감도**: 너무 예민하거나 둔하면 `part1_audio.js`의 `PART1_ADJUST`에서 `span`(화면 높이만큼 쓸었을 때 바뀌는 dB)을 조절합니다.

---

## 🚀 로컬 실행 & 배포

```bash
python3 -m http.server 8080   # http://localhost:8080
```

- PC에서는 마우스를 누른 채 위아래로 끌면 쓸기와 같습니다.
- 실기기 테스트는 GitHub Pages([https://acornriver.github.io/SVart/](https://acornriver.github.io/SVart/))로 합니다.
