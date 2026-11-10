# 체험 흐름 테스트

먼저 레포 루트에서 `python3 -m http.server 8765`로 앱을 실행합니다. macOS Google Chrome과 Node 22 이상이 필요합니다.

## 평소 수정 확인: 빠른 모드

```sh
node tests/e2e/flow.mjs /tmp/svart-fast-ko ko --fast
node tests/e2e/flow.mjs /tmp/svart-fast-en en --fast
```

대략 1분 내외에 제목 클릭부터 8개 검사, 결과 저장, EQ 슬라이더, 청감타워 보내기, 다음 관람객과 방치 리셋까지 확인합니다. 실제 마우스 이벤트로 쓸기·톡·꾹 누르기를 수행합니다. 안내 잠금, 조절 전 확정 금지, 시행 횟수, 다시 듣기, 한국어 안내·멜로디 순서도 assertion으로 확인합니다.

가속 코드는 테스트 브라우저에만 주입합니다. 앱 파일과 전역 시계는 바꾸지 않고, 안내와 검사 버퍼는 8배속으로 재생합니다. 음역 멜로디의 대기·단계 사이 간격·보내기 종료 대기도 단축합니다. **실제 꾹 누르기 0.9초와 조절·채점 조건은 유지합니다.** 화면 상단에 FAST TEST 표시가 나옵니다.

이 모드는 음질·음고·박자·실제 안내 시간 검증용으로 쓸 수 없습니다. 소리, 음성 시간, 오디오 스케줄러를 수정했을 때는 아래 정상 속도 테스트와 실제 청취를 함께 확인합니다.

출력 폴더에 주요 화면 PNG와 `fast-summary.json`(언어·시간·통과 단계·오류)을 남깁니다. 실패하면 `fast-failure.png`와 `fast-failure.json`(실패 원인·단계·터치 좌표·재생 이력)을 남기고 종료 코드 1을 반환합니다. 초기 브라우저 로딩 자체가 실패하면 콘솔 오류로 확인합니다.

## 정상 속도로 전체 확인

```sh
node tests/e2e/flow.mjs /tmp/svart-full-ko ko
node tests/e2e/flow.mjs /tmp/svart-full-en en
```

기존 정상 속도 검증과 단계별 스크린샷을 유지합니다. 안내를 모두 듣는 만큼 몇 분 걸립니다. `flow.mjs`는 자동으로 빈 CDP 포트를 골라 병렬 실행 시 다른 테스트 탭에 붙지 않습니다. 필요할 때만 `SVART_CDP_PORT`로 포트를 지정합니다. 동시 실행은 서로 다른 출력 폴더를 사용합니다.

## 멈춤 복구·비트 음량

```sh
node tests/e2e/stall.mjs /tmp/svart-stall
node tests/e2e/beat-level.mjs /tmp/svart-beat
```

가속하지 않고 실제 시간으로 확인합니다. 두 테스트는 기본 CDP 9333 포트를 사용하므로 동시에 실행하지 않습니다(`stall.mjs`는 `SVART_CDP_PORT`로 변경 가능).

## 밈 효과음 브랜치의 실제 시간 검증

`node tests/e2e/meme-sfx.mjs /tmp/svart-sfx-realtime ko`로 크기·껍질·완성 효과·자막을 실제 속도로 재생하고, 음성 끄기와 중간 리셋·파일 누락 대체 타이머를 검증합니다. 가로·세로 첫 화면과 슬라이더, 장면별 FX 화면 PNG도 남깁니다. 출발·도착 FX가 제거됐는지, 완성 장면의 좌우·가로세로 화면 이탈, 보내기 중 리셋·모션 줄이기 설정도 확인합니다. 이 검증에는 가속을 적용하지 않습니다.

## 믹스 레벨·헤드룸 검증

`node tests/e2e/mix-level.mjs /tmp/svart-mix-audit`는 실제 소스 생성기와 공통 믹서로 비트·EQ 극단값·감상 피크 구간·멜로디·한영 안내 기본/최대값·효과 조합·Part 2/HRIR를 렌더링합니다. `mix-report.json`과 WAV를 남기며 샘플 피크·검사음 이득·EQ 음량 편차 기준을 검사합니다. 이어 `python3 scripts/check-mix-truepeak.py /tmp/svart-mix-audit`로 FFmpeg 트루피크와 LUFS를 검증합니다. [설정과 측정 기준](../../docs/audio-mix.md).
