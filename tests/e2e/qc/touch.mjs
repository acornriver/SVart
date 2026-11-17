// 실제 터치 이벤트로 전체 흐름 + 여러 손가락·손바닥 입력 내성
import { launch, visitor, sleep } from './lib.mjs';
const c = await launch(process.argv[2], { touch: true, lang: process.argv[3] || 'ko' });
const notes = [];
const note = (ok, text) => { notes.push((ok ? 'ok   ' : 'FAIL ') + text); console.log((ok ? '  ok   ' : '  FAIL ') + text); };
const st = () => c.ev('({ stage: GlobalState.currentStage, control: GlobalState.part1.control, phase: GlobalState.part2.phase, trial: GlobalState.part2.trial && GlobalState.part2.trial.index, pointer: pointer && pointer.mode })');
// 손가락 둘·셋을 한꺼번에 대고 움직였다 떼기 (손바닥, 옆 사람 손)
const chaos = async (name) => {
  const before = await st();
  const A = { x: c.w * 0.3, y: c.h * 0.5, id: 0 }, B = { x: c.w * 0.7, y: c.h * 0.55, id: 1 }, C = { x: c.w * 0.5, y: c.h * 0.8, id: 2 };
  await c.touchEv('touchStart', [A]); await sleep(30);
  await c.touchEv('touchStart', [A, B]); await sleep(30);
  await c.touchEv('touchStart', [A, B, C]); await sleep(60);
  for (let k = 1; k <= 6; k++) { await c.touchEv('touchMove', [{ ...A, y: A.y - k * 4 }, { ...B, x: B.x - k * 30, y: B.y + k * 5 }, { ...C, x: C.x + k * 20 }]); await sleep(12); }
  await c.touchEv('touchEnd', [A, B]); await sleep(30);
  await c.touchEv('touchEnd', [A]); await sleep(30);
  await c.touchEv('touchEnd', []); await sleep(150);
  const after = await st();
  note(after.stage === before.stage && after.pointer === null, `${name}: 세 손가락 뒤 단계 유지·손가락 상태 정리 (${before.stage} → ${after.stage}, pointer ${after.pointer}${before.control !== after.control ? ', 값 ' + before.control.toFixed(2) + '→' + after.control.toFixed(2) : ''})`);
  // 터치가 중간에 끊김(시스템 제스처)
  await c.touchEv('touchStart', [A]); await sleep(40); await c.touchEv('touchCancel', []); await sleep(120);
  note((await st()).pointer === null, `${name}: touchcancel 뒤 손가락 상태 정리`);
};
const hooks = {};
for (const s of ['PART1_VOLUME', 'PART1_LOW', 'PART1_HIGH', 'PART1_REGISTER', 'PART2_SENSITIVITY', 'PART2_CENTER', 'PART2_EAR', 'PART2_PITCH', 'RESULT']) hooks[s] = () => chaos(s);
// 꾹 누르는 중에 다른 손가락이 닿으면?
hooks.PART1_LOW = async () => {
  await chaos('PART1_LOW');
  await c.drag(0, -180); await c.until('canHoldConfirm()');
  const p = { ...(await c.targets()).snail, id: 0 }, B = { x: c.w * 0.85, y: c.h * 0.3, id: 1 };
  await c.touchEv('touchStart', [p]); await sleep(500);
  await c.touchEv('touchStart', [p, B]); await sleep(650);
  const s1 = await st();
  await c.touchEv('touchEnd', [p]); await c.touchEv('touchEnd', []); await sleep(300);
  note(s1.stage === 'PART1_HIGH', `꾹 누르는 중(0.5초) 다른 손가락이 닿아도 0.9초에 확정됨 → 1.15초 시점 ${s1.stage}`);
};
hooks.MUSIC = async () => {
  await c.shot('touch-music');
  // 빈 곳 찾기
  const empty = await c.ev(`(() => { for (const [fx, fy] of [[0.5, 0.2], [0.12, 0.2], [0.88, 0.25], [0.5, 0.12], [0.1, 0.5], [0.9, 0.5]]) { const x = width * fx, y = height * fy; if (!hitSnail(x, y) && hitResultTrack(x, y) < 0 && !hitResultEqSlider(x, y) && !hitVoiceSlider(x, y)) return { x, y }; } return null; })()`);
  note(!!empty, '감상: 빈 곳 좌표 ' + JSON.stringify(empty));
  const A = { ...empty, id: 0 }, B = { x: empty.x + 60, y: empty.y + 30, id: 1 };
  await c.touchEv('touchStart', [A]); await sleep(300);
  const m1 = await c.ev('GlobalState.part1.eqMix');
  await c.touchEv('touchEnd', []); await sleep(200);
  const m2 = await c.ev('GlobalState.part1.eqMix');
  note(m1 === 0 && m2 === 1, `감상: 한 손가락으로 빈 곳 누르면 원래 소리(${m1}), 떼면 내 귀(${m2})`);
  await c.touchEv('touchStart', [A]); await sleep(200);
  await c.touchEv('touchStart', [A, B]); await sleep(200);
  await c.touchEv('touchEnd', [A]); await sleep(60);
  await c.touchEv('touchEnd', []); await sleep(250);
  const m3 = await c.ev('GlobalState.part1.eqMix');
  note(m3 === 1, `감상: 두 손가락으로 빈 곳을 눌렀다 떼면 슬라이더가 내 귀(1)로 돌아와야 함 → ${m3}`);
  if (m3 !== 1) await c.ev('setResultEqMix(1)');
  // 슬라이더를 터치로 끌기
  const b = (await c.targets()).eqSlider;
  await c.touchEv('touchStart', [{ x: b.x1, y: b.y, id: 0 }]);
  for (let k = 1; k <= 8; k++) { await c.touchEv('touchMove', [{ x: b.x1 - (b.x1 - b.x0) * k / 8 * 0.6, y: b.y, id: 0 }]); await sleep(15); }
  await c.touchEv('touchEnd', []); await sleep(120);
  const m4 = await c.ev('GlobalState.part1.eqMix');
  note(Math.abs(m4 - 0.4) < 0.05, `감상: 슬라이더를 터치로 끌기 → ${m4.toFixed(2)}`);
  for (const k of [4, 1]) { await c.tap((await c.targets()).tracks[k]); await sleep(200); note(await c.ev(`GlobalState.tour.index === ${k}`), `감상: 곡 버튼 ${k} 터치`); }
  await chaos('MUSIC');
  note(await c.ev('GlobalState.tour.sendAt === null'), '감상: 여러 손가락으로는 보내지지 않음');
  await c.ev('setResultEqMix(1)');
};
hooks.CARD = async () => { await sleep(600); await c.shot('touch-card'); };
await visitor(c, hooks);
note(true, '터치만으로 첫 화면 → 검사 → 분석 → 감상 → 보내기 → QR → 첫 화면 완주');
console.log('errors:', c.errors.length ? c.errors : 'none');
console.log('FAILS:', notes.filter(n => n.startsWith('FAIL')));
c.close(); process.exit(0);
