# 밈 효과음 실험 (2026-11-09)

작업 브랜치: `experiment/meme-sfx-captions`. 실험 전의 달팽이 방향·ABC 배치·코드·검사 설계는 그대로입니다.

전달받은 12개 MP3를 이 폴더에 원본 그대로 보관합니다. `originals.json`에 원본 SHA-256을 기록했고 update와 바이트 단위로 대조했습니다. 미사용 8개도 보관합니다. `update/`는 삭제해도 됩니다.

| 순간 | 원본 | 재생 파일 | 자막 |
| --- | --- | --- | --- |
| ① 크기 확정 뒤 | mac-quack.mp3 | media/sfx/memes/size.mp3 | 크기 접수. |
| ④ 껍질 자리 확정 뒤 | bbyororong.mp3 | media/sfx/memes/shell.mp3 | 껍질 착붙. |
| ⑧ 완료 → 분석 직전 | ta-da.mp3 | media/sfx/memes/reveal.mp3 | 나… 달팽이 됐다. |
| 감상 화면에서 청감타워로 보내기 | dj-stop.mp3 | media/sfx/memes/depart.mp3 | 청감타워로 퇴근 ↗ |

정답/오답을 암시하는 소리, 놀람·뼈 소리, 긴 드럼롤·박수는 사용하지 않습니다. 개별 검사 시행과 듣기·조절 중에는 효과음을 넣지 않습니다. 효과음 앞에서 기존 안내와 소스를 정지하고, 짧은 효과와 자막이 끝난 뒤 다음 단계 안내를 시작합니다.

재생 파일은 무음을 덜어내고 모노/44.1kHz/128kbps로 정리했습니다. gain만 줄여 일반 효과는 약 −27 LUFS, 피크는 −9dBFS 이하를 목표로 삼았습니다. 짧은 오리 소리는 통합 음량 측정 창보다 짧아서 보수적으로 −16dB 줄였습니다. 파형 양 끝에 짧은 페이드를 적용했습니다. 정확한 편집 구간과 gain은 `edits.json`입니다.

레포 루트에서 `python3 scripts/prepare-meme-sfx.py`로 재생성할 수 있습니다.

`memeFX.js`가 재생·전환 취소·누락 시 대체 타이머·자막을 관리하고 `memeFX.css`가 짧은 CapCut 스타일 팝업을 만듭니다. 음성 안내 켜기/끄기와 음성 크기 슬라이더가 효과음에도 적용됩니다. EQ와 검사 음량에는 영향을 주지 않습니다. 반복 점멸이나 화면 전체 섬광은 사용하지 않습니다. `prefers-reduced-motion`에서는 자막 애니메이션을 끕니다.

평소 검증: `node tests/e2e/flow.mjs /tmp/svart-sfx-fast ko --fast`.
실제 효과음 시간·음성 끄기·중도 리셋·파일 누락 검증: `node tests/e2e/meme-sfx.mjs /tmp/svart-sfx-realtime ko`.
초기 상태 백업은 `/tmp/svart-before-meme-sfx/`에 tracked patch와 untracked archive로 보존했습니다. 사용자 요청으로 기존 작업과 효과음 실험을 함께 이 브랜치에 커밋·푸시합니다. main에는 병합하지 않습니다.
