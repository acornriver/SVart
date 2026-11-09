# SVart ↔ SVartTower 전송 규약 (v2)

사용자 결정(2026-11-09): **현재 SVart가 기준**입니다. SVartTower와 SVartSoft의 과거 규칙보다 이 규약을 우선합니다. 검사 순서는 바꾸지 않습니다.

- 기준 구현: `schema.js`, 서버 검증: 루트 `firestore.rules`.
- `ears/{earId}`에 `v: 2`, `codeVersion: 2`로 생성합니다. 청감 코드는 `IWS-RLF(13.2k/6)` 형식이며 저장 직전 실제 프로필에서 다시 계산합니다.
- `profile.maxFreqHz`는 **실제 Hz, 8000~20000**입니다. 16kHz로 자르거나 타워에서 범위를 늘리지 않습니다. EQ·꼬임·중앙각의 연속값도 반올림하지 않습니다.
- 프로필은 volDb(-40~0), lowDb/highDb(-10~10), register(LOW/MID/HIGH), maxFreqHz, sensitivity(0~100), twistAmount(0~1), centerDeg(-180~180), centerImage(L/C/R), dominantEar(LEFT/RIGHT), earStrength(0~100), pitchMode(F/B/H), pitchIndex(-100~100)입니다. Part 2 미측정 값은 null입니다.
- 이름은 기본 저장하지 않습니다. 클라이언트는 생성만 가능하고 수정·삭제는 금지합니다. hidden 문서는 공개 조회에서 제외합니다. 기존 v1 문서는 읽을 수 있지만 새 v1 생성은 허용하지 않습니다.

## 전송과 수신

`send.js`는 로컬 저장 대기열 `svart.outbox.v2`에 먼저 보관하고 전송합니다. 실패하면 5~60초 간격으로 재시도하며 같은 ID의 완료된 쓰기를 중복 생성하지 않습니다. 규칙 거부는 별도 `svart.outbox.v2.rejected`에 보관합니다. 과거 `svart.outbox`는 자동 변환하거나 지우지 않습니다. `svartCloud.status()`로 pending/rejected/legacyPending을 확인합니다.

일반 localhost와 `?dev=1`에서는 전송하지 않습니다. 로컬 에뮬레이터를 쓰려면 양쪽 URL에 `?emulator=1&emulatorPort=8181`을 붙입니다(테스트 프로젝트 `svart-test`). 운영 DB를 테스트 용도로 쓰지 않습니다.

타워는 첫 서버 스냅샷을 초기 목록으로, 이후 추가 문서를 도착 이벤트로 받습니다. 공통 파일은 SVart에서 수정한 뒤 동기화합니다:

```sh
python3 scripts/sync-tower-cloud.py
python3 scripts/sync-tower-cloud.py --check
```

타워의 `mapping.js`는 별도 시각화 코드입니다. 주파수는 원래 Hz를 유지합니다.

## 검증 및 배포 상태

Firestore 에뮬레이터를 127.0.0.1:8181에서 실행한 뒤:

```sh
npm ci --prefix tests/cloud
npm test --prefix tests/cloud
```

테스트는 `demo-svart-contract` 프로젝트만 사용합니다. 실제 SDK로 규칙 허용·거부, 전송→Firestore→타워 피드→매핑, 오프라인 재시도와 중복 방지를 검증합니다. Node VM 간 객체 원형 차이만 테스트 전송 경계에서 정규화합니다.

**이 작업은 로컬 파일 수정과 에뮬레이터 검증까지이며 운영 배포는 하지 않았습니다.** 실제 연결 전 새 `firestore.rules`와 `firestore.indexes.json`을 `svart-tower` 프로젝트에 배포해야 합니다. 새 스키마 규칙은 과거 앱의 v1 쓰기를 거부하므로 앱·타워 공개 시점도 함께 맞춥니다.
