# 🎧 청각 다변기 (Sound Variator) — 모든 귀는 [ ] 이다
> **2026 서울시립 북서울미술관 전시 사운드 프로젝트**  
> **이름 입력 → Part 1 선호 EQ 네 검사 → Part 2 네 검사(임시) → 달팽이와 청감 코드**  
> 🔗 **웹 데모**: [https://acornriver.github.io/SVart/](https://acornriver.github.io/SVart/)

관람객이 소파에 앉아 아이패드를 손에 들고 무선 헤드폰으로 참여합니다.  
흰 노이즈를 들으며 여러 대역을 한꺼번에 맞추는 대신, **한 단계에 한 파트만** 들려주고 **한 축(위아래 쓸기)만** 조절해 개인 선호 EQ를 만듭니다. 결과 EQ는 세 작가의 곡에 적용됩니다. 아이패드에서 p5.js + p5.sound만으로 단독 실행합니다.

현재 서브 브랜치 `sub/snail-hold-music-listening`에서는 ⑤ 고역 한계를 좌우로 밀어 조절한 뒤 **달팽이 꾹**으로 확정합니다(8~20kHz). 결과 분석(`RESULT`) 다음 감상 화면(`MUSIC`)에서 세 항목을 선택하면 달팽이가 그쪽으로 이동합니다. EQ 슬라이더는 원래 소리부터 개인 EQ까지 연속 적용됩니다. 작가 곡은 아직 전달 전이라 사용자 결정에 따라 환경음 세 개를 임시로 연결했습니다. 5-2 안내는 재녹음 전까지 자막만 표시합니다. 아래 설명에는 이전 흐름이 일부 남아 있습니다.

---

## 📌 진행 흐름

첫 화면 "모든 귀는 [   ] 이다"(English: "Every ear is [   ]")에서 오른쪽 위의 **한국어 / English**를 고르고, [ ] 안에 이름을 쓴 뒤 완료(Enter)를 누릅니다.
검정 바탕에 흰 선 하나로 그린 덩어리를 검사마다 빚어 달팽이를 만듭니다. 가로축은 음고라서 **왼쪽 꼬리가 낮은 소리, 오른쪽 머리가 높은 소리**입니다. 더듬이는 늘 오른쪽에 있어 달팽이는 오른쪽을 봅니다.

| 단계 | 들려주는 소리 | 관람객이 하는 일 | 결과값 | 달팽이에서 |
| :--- | :--- | :--- | :--- | :--- |
| **① 편한 크기** | 비트 전체 | 위아래로 쓸기 | `masterVolume` | 덩어리가 부풀거나 줄어듦 |
| **② 꼬리 빚기 (저음)** | 킥·베이스가 큰 비트 | 위아래로 쓸기 | `lowShelf` (200Hz, ±10dB) | 위로 쓸면 꼬리가 통통하게, 아래로 쓸면 눌려서 작게 |
| **③ 머리 빚기 (고음)** | 하이햇·쉐이커가 큰 비트 | 위아래로 쓸기 | `highShelf` (4kHz, ±10dB) | 위로 쓸면 머리가 크고 높이, 아래로 쓸면 눌려서 작게 |
| **④ 껍질 얹기 (음역)** | 같은 멜로디를 저(C2)/중(C4)/고(C6)로 | 등 위 A/B/C 자리 톡 (듣는 순서 무작위) | `registerPeak` (100Hz / 400Hz / 2.5kHz, +3dB, Q 1) | 껍질 자리: 왼쪽 / 가운데 / 오른쪽 |
| **⑤ 어디까지 들려? (고역 예민도)** | 8→16 kHz로 높아지며 작아지는 삐 소리 (2번) | 안 들리게 되는 순간 화면 아무 데나 톡 | `maxFreqHz`, `sensitivity`, `twist` | 삐 소리가 높아지는 동안 선이 이중나선으로 꼬이고, 톡 한 순간의 꼬임이 남음 |
| **⑥ 소리는 어디에? (중앙)** | 68번 귀 HRIR 말소리 (`media/part2/`) | 좌우로 쓸어 가운데로 맞춘 뒤 달팽이 꾹 (2번) | `centerDeg`, `centerImage` (L/C/R) | 좌우 치우침에 따라 달팽이 선 색이 정해짐 |
| **⑦ 어느 쪽이 높아? (우세 귀)** | 옥타브 착청 (Deutsch 1974, 3번) | 높은 음이 들린 쪽으로 껍질을 굴려 손을 뗌 | `dominantEar` (LEFT/RIGHT), `earStrength` | 우세한 쪽 더듬이가 길어짐 |
| **⑧ 올라갔어? 내려갔어? (바탕음·배음)** | 바탕음 없는 복합음 두 개 (듣기만 하는 예시 + 6번) | 올라갔으면 오른쪽, 내려갔으면 왼쪽으로 달팽이를 밀고 손을 뗌 | `pitchMode` (F/B/H), `pitchIndex` | 점액 모양 (F 네모 / H 동그라미 / B 섞임) |
| **결과: 북서울 산책** | 개인 EQ를 입힌 북서울 녹음: 당현천 → 중계역 계단 → 중계역 지하철 → 북서울미술관 앞, 15초씩 반복 | 누르고 있으면 원래 소리, 달팽이를 오른쪽으로 밀어 보내기 | 청감 코드 `IwS/6 · RLF 13.2` | 다 빚은 달팽이가 걷고, 뒤에 그 장소 영상(고대비 흑백) |

- **첫 화면의 확성기(음성 켜기/끄기)와 언어, 검사 화면 오른쪽 위의 음성 크기 슬라이더 말고는 버튼이 없습니다.** 확정은 달팽이를 꾹 누르기(0.9초, 손끝에 빨간 고리), 다시 듣기는 더듬이 톡, ④는 등 위 A/B/C 자리 톡, ⑤는 화면 아무 데나 톡, ⑥은 좌우로 쓸기 + 달팽이 꾹, ⑦⑧은 달팽이를 좌우로 밀고 손 떼기입니다. 결과 화면에서는 빈 곳을 누르고 있는 동안 원래 소리, 달팽이를 오른쪽으로 밀면 청감타워로 보냅니다. 2분 동안 아무도 안 만지면 첫 화면으로 돌아갑니다. 음성 안내가 나오는 동안은 위에 자막이, 조용할 때는 아래쪽에 지금 할 일이 나옵니다. 할 일을 알려 주는 안내와 듣기만 하는 예시가 나오는 동안은 터치를 받지 않고, 풀린 뒤 새로 시작한 터치부터 반영합니다.
- **비트**(`beat.js`): p5.sound의 오디오 컨텍스트 위에서 Web Audio로 직접 합성합니다. 96 BPM, 2마디 반복이고, 킥·베이스 / 스네어·코드 / 하이햇·쉐이커 세 묶음의 크기만 단계마다 바꿉니다. 세 묶음 모두 RMS를 북서울 녹음과 같은 −26 dBFS로 맞췄습니다(헤드리스 측정). ④ 멜로디와 Part 2 순음은 검사가 흐려지지 않게 비트 없이 들려줍니다.
- **Part 2 네 검사**(`part2_audio.js`): `ref/part2 (1).html`의 검사 설계·소리·채점을 옮기고, 답하는 방식만 이 앱의 손짓으로 바꿨습니다. 소리 크기는 ① 볼륨과 무관한 고정값(명목 dB SPL)이라 `part2Bus`로 바로 출력하며, 파형이 움직이도록 FFT 분석기에도 잇습니다. Part 2 결과는 달팽이의 꼬임(⑤)·색(⑥)·더듬이(⑦)·점액(⑧)이 됩니다.
- **청감타워로 보내기**: 달팽이가 오른쪽으로 기어 나가고, "청감타워로 갔어"를 보여 준 뒤 5초 후 첫 화면으로 돌아갑니다. 실제 업로드는 아직 없습니다. 결과는 `window.EAR_RESULT`와 `localStorage['svart.earProfile']`에 남깁니다.
- **청감 코드**: `[음역][저음][고음]/[음량] · [가운데][우세귀][배음·바탕] [가청 kHz]` (`earCode.js`). 글자 이름은 미확정입니다.
- **문구와 음성**: 모두 `copy.js`에 한국어/영어로 모여 있습니다. 음성 안내(`voice.js`, `media/voice/`)와 자막은 차민휘 지시문의 존댓말을 따르고, `VOICE_COPY`의 번호가 곧 파일 번호입니다.

### 측정 원칙
- **한 축만**: 매 단계 화면을 위아래로 쓸어서만 조절합니다. 위로 쓸면 커지거나 많아지고, 아래로 쓸면 줄어듭니다. 손가락 위치가 아니라 쓴 거리만큼 바뀌는 상대 조작이라 무작위 시작값이 유지됩니다.
- **시작값 무작위**: 처음 놓인 자리에 끌려가지 않도록 매 단계 시작값을 무작위로 둡니다.
- **버튼으로 확정**: 충분히 움직인 뒤에만 `여기가 좋아요` 버튼이 켜집니다.
- **음량 자동 보정**: EQ를 바꿔도 체감 음량(A-가중 파워)이 같도록 보정합니다. 큰 소리를 더 좋다고 고르는 편향을 막기 위해서입니다.
- **숫자는 숨김**: 조절 중에는 dB 값이나 눈금 숫자를 보여주지 않습니다. 값은 우상단에 작은 디버그 숫자로만 표시합니다. 다만 막 모양은 EQ를 따라 바뀌므로, 관람객이 귀 대신 '매끈한 모양'에 맞추는지 실기 테스트에서 지켜봐야 합니다.
- **② 강제 선택**: 세 음역은 A/B/C로만 표시하고 "모르겠다"는 선택지가 없습니다. x축이 음고라 자리는 낮은 음역부터 왼쪽→오른쪽으로 고정이고, 처음 들려주는 순서만 무작위입니다.

### 비주얼 (오디오비주얼, 고대비)
- 검정 바탕, 흰 선, 포인트 색은 신호 빨강(#ff3b1f) 하나입니다.
- 달팽이 윤곽은 지금 들리는 소리의 파형입니다(오실로스코프처럼, `p5.FFT.waveform()`). 껍질은 그 파형을 나선으로 만 선입니다. 파형 크기는 고른 볼륨으로 나눠 늘 비슷하게 보입니다.
- 비트를 탑니다. 킥에 몸이 눌리고 껍질이 튀며 선이 굵어지고, 화면 전체에 아주 옅은 섬광이 납니다. 스네어에는 몸 위로 흰 선이 튀고, 하이햇에는 더듬이가 까딱입니다. 섬광은 눈에 부담이 없도록 옅게만 씁니다.
- 위아래로 쓰는 동안 누르는 자리에 점선 손끝 고리와 눌린 자국이 생깁니다. 껍질은 굴러간 거리만큼 돌아가고, 등을 벗어나면 바닥으로 내려갑니다.
- 결과 화면에만 장소 영상을 캔버스 뒤에 깝니다(흑백, contrast 2.4). 영상은 시작할 때 blob으로 받아 두고, 1초마다 멈췄는지 확인해 다시 재생합니다.

---

## 📂 파일 구조

```
SVart/
├── index.html            # 뷰포트 고정, 모바일 제스처 차단 CSS, 이름 입력 CSS, p5.js CDN 및 스크립트 로드
├── globalState.js        # 전역 상태 객체 (window.GlobalState)
├── copy.js               # 화면 문구 (한국어 / English), t('키')로 가져옴
├── earCode.js            # 청감 코드 만들기·읽기
├── part1_audio.js        # 전체 단계 진행(FLOW_STAGES), 소스 전환, 개인 EQ 체인, 음량 보정, 멜로디 신스, 쓸기 조작
├── beat.js               # ①②③ 검사용 비트 (세 묶음 합성, 미리 예약하는 스케줄러, 비주얼용 타격 신호)
├── tour.js               # 결과: 북서울 산책(녹음 + 흑백 영상) · 청감타워로 보내기
├── part2_audio.js        # Part 2 임시 검사 네 개 (껍질 굴리기로 답함)
├── visuals.js            # 이름·언어 첫 화면 + 파형 달팽이 비주얼 + 단계별 화면 + 터치 영역
├── main.js               # p5.js 라이프사이클 및 단계별 터치 라우팅
├── ref/                  # 달팽이 원본 프로토타입 (ear-flow.html / ear-flow.js)
├── tests/register/       # ② 음역 고르기 단독 테스트 + 음역별 음량 보정 도구
└── tests/earcode/        # 청감 코드 글자별 EQ 들어 보기
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
  // 'INIT' | 'NAMED' | 'PART1_VOLUME' | 'PART1_LOW' | 'PART1_HIGH' | 'PART1_REGISTER'
  // | 'PART2_SENSITIVITY' | 'PART2_CENTER' | 'PART2_EAR' | 'PART2_PITCH' | 'RESULT'
  currentStage: 'INIT',
  isAudioInitialized: false,
  userName: '',
  lang: 'ko',               // 'ko' | 'en'

  part1: {
    stepIndex: 0,            // FLOW_STAGES 안의 위치
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

  psychoProfile: {
    maxFreqHz: null, sensitivity: null, twist: null,
    centerDeg: null, centerImage: null,
    dominantEar: null, earStrength: null,
    pitchMode: null, pitchIndex: null,
    raw: { sensitivity: null, center: null, octave: null, f0: null }
  },
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

1. **④ 음역별 음량**: `tests/register/`를 아이패드와 헤드폰으로 열고 `[보정]` 패널에서 세 음역이 같은 크기로 들리게 맞춥니다. 같은 기기에서는 본 앱이 그 값을 자동으로 읽어 씁니다(`localStorage`). 확정된 값은 `REGISTERS`의 `defaultOffsetDb`에 옮겨 적어주세요.
2. **쓸기 감도**: 너무 예민하거나 둔하면 `part1_audio.js`의 `PART1_ADJUST`에서 `span`(화면 높이만큼 쓸었을 때 바뀌는 dB)을 조절합니다.

---

## 🚀 로컬 실행 & 배포

```bash
python3 -m http.server 8080   # http://localhost:8080
```

- PC에서는 마우스를 누른 채 끌면 쓸기와 같습니다(Part 1 위아래, Part 2 좌우). 이름은 키보드로 쓰고 Enter를 누릅니다.
- 실기기 테스트는 GitHub Pages([https://acornriver.github.io/SVart/](https://acornriver.github.io/SVart/))로 합니다.
