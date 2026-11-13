# 2026-11-12 최신 안내 음원

`ref/update/f-1, f-2, w, a /`에서 전달받은 MP3를 이름의 앞뒤 공백만 정리하여 보관합니다. 추가 전달된 `a-7.mp3`, `a-8.mp3`는 `ref/update/`에서 옮겼습니다. 원본 SHA-256은 `originals.json`에 있습니다. `a-5(1).mp3`는 `a-5.mp3`와 바이트까지 같아 하나로 합쳤습니다. 원본 보존을 확인한 뒤 `ref/update`를 정리했습니다.

| 한국어 / 영어 원본 | 앱 안내 | 반영 위치 |
| --- | --- | --- |
| w-1 / w-2 | m3-1 | ③ 머리 빚기 첫 문장 (속삭임) |
| a-1 / a-2 | m4-1 | ④ 껍질 얹기 첫 문장 (화내는 말투) |
| a-7 / a-8 | m4-5 | ④ 종료 후 “저 지금 뭐가 되는 거죠?” / “What am I turning into?” |
| w-3 / w-4 | m5-1 | ⑤ 고역 한계 첫 문장 (속삭임) |
| a-3 / a-4 | m5-5 | ⑤ 종료 후 “감겼어욕!” / “All curled up, yup!” |
| a-5 / a-6 | m8-3 | ⑧ 최초 횟수 안내의 완성 멘트 |
| last_001 / last_002 | m9-7 | 결과에서 음악으로 이동하는 안내 (첫 문장만). f-1 / f-2를 대체 |
| last_003 / last_004 | m9-4 | 분석 화면 "자, 당신의 청감 코드는…! 두두둥!" / "And your hearing code is… dun dun duuun!" (전체, 11/13 추가) |

③④⑤의 뒤쪽 조작 안내와 ⑧의 “여섯 번 해볼게요” / “Let’s do this six times.”는 기존 FLAC에서 유지합니다. 문장 사이 무음에서 연결하고 속도·음정·말투는 바꾸지 않습니다. 새 원본은 gain만 조절해 기존 안내와 같은 약 −27 LUFS로 맞췄습니다. 한/영 `segments.json`의 `parts`가 실제 재생 파일을 만드는 순서·원본·구간·gain을 기록합니다. 연결 후 통합 음량의 보정은 `outputGainDb`로 기록합니다. `parts`가 있으면 기존 `start`/`end`/`gainDb`는 과거 통합 녹음의 이력이며 재생성에는 쓰지 않습니다.

```sh
python3 scripts/split-memesound.py --ids m3-1 m4-1 m4-5 m5-1 m5-5 m8-3 m9-7
python3 scripts/split-memesound.py --lang en --ids m3-1 m4-1 m4-5 m5-1 m5-5 m8-3 m9-7
python3 scripts/split-memesound.py --verify-only
python3 scripts/split-memesound.py --lang en --verify-only
```

결과 보고서에서 아래 텍스트를 눌러 이동하도록 바뀌었으므로 last_001/last_002의 “달팽이를 꾹 눌러주세요” / “Press and hold the snail.” 부분은 재생하지 않습니다. 첫 문장만 문장 사이 무음에서 잘라 사용합니다(한 0.08~1.91초, 영 0~2.06초). `last_001.mp3`, `last_002.mp3`는 `ref/update/`에서 복사했고, 예전 f-1 / f-2는 쓰지 않지만 보관합니다.

`m9-7`은 녹음 대기 목록에서 제거했습니다. `m6-1`, `m6-3`, `m9-4`~`m9-6`은 여전히 녹음 대기입니다.

검증: 한/영 fast flow(67.9초/67.5초), 정상 속도 멜로디·결과 구간, 원본 체크섬·언어별 30개 파일 디코딩·길이, 새 12개 안내의 약 −27 LUFS 계측을 확인했습니다. 결과 텍스트 클릭·달팽이 놀이와 터치 취소·키보드 이동도 검증했습니다.
