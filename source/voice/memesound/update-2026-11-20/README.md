# 2026-11-20 속삭임 재녹음과 ⑤→⑥ 문장 복원

차민휘 님이 11/20에 전달한 파일 원본입니다. 체크섬은 `originals.json`에 있습니다.

- `w_re-1_01` / `w_re-2_01`: ③ `m3-1` 한/영 첫 문장 (11/17의 `w_re-1`/`w_re-2`를 대체)
- `w_re-3_01` / `w_re-4_01`: ⑤ `m5-1` 한/영 첫 문장 (11/17의 `w_re-3`/`w_re-4`를 대체)
- `add_01` / `add_02`: ⑤ 종료 후 `m5-5` 앞부분. 화난 음성으로 바꾸면서 빠졌던 "어? 소리를 듣는 사이에 화면 속 선이 돌돌" / "Oh! While you were listening, the line on the screen"을 되살림. 뒤에는 11/12의 `a-3` / `a-4`("감겼어욕!" / "All curled up, yup!")를 그대로 이어 붙임 (사용자 선택)

새 녹음 부분은 끝 무음만 0.2초 남기고 잘랐고(m5-5 앞부분은 0.08초), 부분마다 −27 LUFS에 맞춘 뒤 완성 파일을 −27 LUFS로 보정했습니다(gain만, 음정·속도 그대로). 실제 구간과 보정량은 한/영 `segments.json`에 있습니다.

영어 `m5-5` 자막은 사용자 선택으로 전달 문장 "Oh! While you were listening, the line on the screen curled up!"을 씁니다(녹음 끝말 "All curled up, yup!"과 조금 다름).
