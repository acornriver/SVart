// 전체 흐름 테스트: 첫 화면(언어) → 이름 → 8검사(Part 2: 톡 · 돌리기 · 굴리기) → 결과(북서울 산책, 비교, 보내기) → 자동으로 첫 화면 → 다음 관람객 → 방치 시 첫 화면
// 버튼 없는 손짓(쓸기, 달팽이 꾹, 더듬이 톡, 등 위 자리 톡, 누르고 있기, 밀기)을 실제 마우스 이벤트로 하며, 단계마다 스크린샷을 <출력폴더>/*.png로 남김. 마지막 줄이 'errors: none'이어야 함
// 실행: (레포 루트에서) python3 -m http.server 8765 &   그다음   node tests/e2e/flow.mjs <출력폴더(절대경로)> [ko|en]
// 맥의 Google Chrome을 헤드리스로 띄워 CDP(포트 9333)로 조종함. Node 22 이상(내장 WebSocket)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2];
const URL = 'http://localhost:8765/index.html';
const LANG = process.argv[3] || 'ko';
const W = 744, H = 1133;
mkdirSync(OUT, { recursive: true });

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9333', `--window-size=${W},${H}`,
  '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + OUT + '/profile', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = {}; const errors = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console.error: ' + JSON.stringify(msg.params.args.map((a) => a.value ?? a.description)));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
const tap = async (x, y) => { await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); await sleep(420); };
const T = () => ev('getTouchTargets()');
// 꾹 누르기 (달팽이 위에서 움직이지 않고)
const hold = async (x, y, ms = 1200, mid) => { await mouse('mousePressed', x, y); await sleep(ms / 2); if (mid) await mid(); await sleep(ms / 2); await mouse('mouseReleased', x, y); await sleep(450); };
const holdSnail = async (mid) => { const t = await T(); await hold(t.snail.x, t.snail.y, 1200, mid); };
const tapAntenna = async () => { await waitUntil('!!(getTouchTargets() && getTouchTargets().antenna)'); const t = await T(); await tap(t.antenna.x, t.antenna.y); };
const stage = () => ev('GlobalState.currentStage');
const drag = async (dy) => {
  const x = W / 2, y0 = 500;
  await mouse('mousePressed', x, y0);
  for (let k = 1; k <= 10; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y0 - dy * k / 10, button: 'left', buttons: 1 }); await sleep(16); }
  await mouse('mouseReleased', x, y0 - dy); await sleep(400);
};
const expect = async (s) => { const cur = await stage(); if (cur !== s) throw new Error(`expected ${s}, got ${cur}`); console.log('✓', s); };

const hdrag = async (dx) => {
  const x0 = W / 2, y = 520;
  await mouse('mousePressed', x0, y);
  for (let k = 1; k <= 10; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + dx * k / 10, y, button: 'left', buttons: 1 }); await sleep(16); }
  await mouse('mouseReleased', x0 + dx, y); await sleep(500);
};
// 좌우로 끈 채 잠깐 멈춰서(mid) 고르는 중 모습을 보고 손을 뗌
const hdragHold = async (dx, mid) => {
  const x0 = W / 2, y = 520;
  await mouse('mousePressed', x0, y);
  for (let k = 1; k <= 10; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + dx * k / 10, y, button: 'left', buttons: 1 }); await sleep(16); }
  await mid();
  await mouse('mouseReleased', x0 + dx, y); await sleep(500);
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: URL });
await sleep(4000);
await expect('INIT');
if (LANG === 'en') { const b = await ev(`(() => { const r = document.querySelector('.langs [data-lang=en]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await tap(b.x, b.y); }
console.log('  lang', await ev('GlobalState.lang'));
await shot('00-intro');
console.log('  voice clips', await ev('JSON.stringify({ ko: Object.keys(voiceClips.ko).length, en: Object.keys(voiceClips.en).length })'), '(모두 50)');
// 확성기: 끄고 켜기. 끈 모습을 찍고 다시 켜서 시작
{ const b = await ev(`(() => { const r = document.querySelector('.spk').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await tap(b.x, b.y); console.log('  speaker off', await ev('GlobalState.voiceOn')); await shot('00-intro-voice-off');
  await tap(b.x, b.y); console.log('  speaker on', await ev('GlobalState.voiceOn')); }
await ev(`(() => { const i = document.querySelector('.intro input'); i.value = '${LANG === 'en' ? 'Mina' : '민혁'}'; i.dispatchEvent(new Event('input')); document.querySelector('.intro form').requestSubmit(); })()`);
await sleep(2500); await expect('PART1_VOLUME');
console.log('  subtitle', await ev('voiceLine()'), 'duck', await ev('duckGain.output.gain.value.toFixed(2)'));
await shot('00-voice-subtitle');
const waitUntil = async (expr, ms = 40000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return; await sleep(80); } throw new Error('timeout: ' + expr); };
const unlocked = () => waitUntil('!inputLocked()');
const canHold = () => waitUntil('canHoldConfirm()');
const control = () => ev('GlobalState.part1.control.toFixed(4)');

// 안내 잠금: 말하는 동안 쓸어도 값이 안 바뀜. 슬라이더는 잠겨 있어도 움직이고 값(control)을 건드리지 않음
{ const c0 = await control(); await drag(150); console.log('  locked', await ev('inputLocked()'), 'swipe ignored', c0 === await control());
  const b = await ev('voiceSliderBox()');
  await tap(b.x1, b.y); console.log('  slider max → level', (await ev('GlobalState.voiceLevel')).toFixed(2), 'gain', (await ev('voiceBus ? voiceBus.gain.value : -1')).toFixed(2));
  await tap(b.x0 + (b.x1 - b.x0) * 0.63, b.y); console.log('  slider back → level', (await ev('GlobalState.voiceLevel')).toFixed(2), 'value kept', c0 === await control());
  // 잠긴 동안 누른 손가락은 풀린 뒤 움직여도 무시
  await mouse('mousePressed', W / 2, 500); await unlocked();
  for (let k = 1; k <= 10; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W / 2, y: 500 - k * 15, button: 'left', buttons: 1 }); await sleep(16); }
  await mouse('mouseReleased', W / 2, 350); await sleep(100); console.log('  finger from lock ignored', c0 === await control()); }

// ① 움직이기 전 꾹 → 확정 안 됨, 쓸고 나서도 확정 안내 전에는 꾹 → 안 됨, 안내를 들은 뒤 꾹 → 다음
await holdSnail(); await expect('PART1_VOLUME');
await drag(250); console.log('  swiped up → voice', await ev('voiceNow')); await sleep(1200);
await drag(-120); console.log('  swiped down → voice', await ev('voiceNow')); await sleep(400);
await holdSnail(); await expect('PART1_VOLUME');
await canHold(); await holdSnail(() => shot('01-volume-holding')); await expect('PART1_LOW');
console.log('  next stage carries confirm line', await ev('voiceNow'));
{ const c0 = await control(); await drag(200); console.log('  intro not cut → busy', await ev('voiceBusy()'), 'swipe ignored', c0 === await control()); }
await unlocked(); await drag(200); await canHold(); await shot('02-low');
await holdSnail(); await expect('PART1_HIGH');
await unlocked(); await drag(220); await canHold(); await shot('03-high');
await holdSnail(); await expect('PART1_REGISTER');
console.log('  loudness comp', await ev("JSON.stringify({ measured: Array.isArray(sourceSpectrum('HIGH')), highPlus10: +getLoudnessCompDb(sourceSpectrum('HIGH')).toFixed(1), eq: GlobalState.userEQProfile.highShelf.gain.toFixed(1) })"));

// ④ 자동 재생 → 등 위 자리 톡 → 더듬이 톡(다시 듣기) → 꾹
await waitUntil('GlobalState.part1.register.playingCard >= 0'); console.log('  melody after intro, voice busy', await ev('voiceBusy()')); await sleep(1200); await shot('04-register-playing');
await waitUntil('!GlobalState.part1.register.isAutoPlaying');
const spots = (await T()).spots;
await tap(spots[0].x, spots[0].y); console.log('  tap during task voice → card', await ev('GlobalState.part1.register.selectedCard'), '(-1이어야 함)');
await unlocked();
await tap(spots[2].x, spots[2].y); console.log('  picked card', await ev('GlobalState.part1.register.selectedCard'));
await canHold(); await shot('04-register-picked'); // 카드 선택 + 4-4·4-7 안내 완료 대기
await tap(spots[2].x, spots[2].y); console.log('  card re-tap → playing', await ev('GlobalState.part1.register.playingCard'), '(2이어야 함)');
await waitUntil('GlobalState.part1.register.playingCard < 0'); // 재생 완료 대기
await holdSnail(); await expect('PART2_SENSITIVITY');
console.log('  register', await ev('GlobalState.userEQProfile.registerPeak.register'));

// ⑤ 고역 예민도: 밀어서 조절하고 손을 떼면 유지, 달팽이를 꾹 눌러 답 확정
const waitPhase = async (ph, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await ev('GlobalState.part2.phase')) === ph) return; await sleep(80); } throw new Error('phase ' + ph + ' timeout, now ' + await ev('GlobalState.part2.phase')); };
await sleep(800); await shot('05-sens-lead');
await waitPhase('adjusting'); await sleep(100);
console.log('  sens adjusting, roll', await ev('GlobalState.part2.roll'), 'freq', (await ev('part2SensU()')));
{ const b = await ev('voiceSliderBox()'); await tap(b.x0 + 60, b.y); console.log('  voice slider tap → phase still adjusting:', await ev('GlobalState.part2.phase')); }
await shot('05-sens-adjusting');
// 조금만 밀면 아직 answer 안 됨
await hdrag(50); console.log('  small drag → phase', await ev('GlobalState.part2.phase'), 'moved', (await ev('GlobalState.part2.moved')).toFixed(2));
// 충분히 밀어도 유지, 다시 조절한 뒤 꾹 눌러 확정
await hdrag(400); await sleep(100); await shot('05-sens-done');
await expect('PART2_SENSITIVITY');
await hdrag(-120); await expect('PART2_SENSITIVITY');
await canHold(); await holdSnail(() => shot('05-sens-holding'));
await sleep(900); await expect('PART2_CENTER');
console.log('  sens', JSON.stringify(await ev('({ hz: GlobalState.psychoProfile.maxFreqHz, s: GlobalState.psychoProfile.sensitivity, twist: GlobalState.psychoProfile.twist })')));

// ⑥ 중앙: 돌리기 전 꾹 → 안 됨, 좌우로 쓸고 꾹 (2번)
await waitPhase('adjusting');
await holdSnail(); console.log('  center hold before turn → phase', await ev('GlobalState.part2.phase'));
for (let k = 0; k < 2; k++) {
  await waitPhase('adjusting');
  await hdrag(k === 1 ? -180 : 150); if (k === 0) { await sleep(500); await shot('06-center'); console.log('  live color deg', (await ev('part2CenterLiveDeg()')).toFixed(1)); }
  await holdSnail();
}
await sleep(900); await expect('PART2_EAR');
console.log('  center', await ev('GlobalState.psychoProfile.centerDeg'), await ev('GlobalState.psychoProfile.centerImage'));

// ⑦ 우세 귀: 안내 → 듣기만 하는 예시 → 안내 → 시행. 덜 굴리면 답 안 됨, 더듬이로 한 번 더 듣기, 굴리고 손을 떼면 바로 답 (3번)
await waitPhase('example'); console.log('  ear example, answers', await ev('GlobalState.part2.trial === null'), 'locked', await ev('inputLocked()')); await shot('07-ear-example');
for (let k = 0; k < 3; k++) {
  await waitPhase('answer');
  if (k === 0) {
    await sleep(300); await shot('07-ear-hint');
    await hdrag(60); console.log('  ear small roll → phase', await ev('GlobalState.part2.phase'), '(answer여야 함)');
    await tapAntenna(); console.log('  antenna replay → phase', await ev('GlobalState.part2.phase'), 'left', await ev('GlobalState.part2.replayLeft'));
    await waitPhase('answer');
  }
  if (k === 0) { await hdragHold(-250, async () => { await sleep(700); await shot('07-ear-live-left'); }); }
  else await hdrag(k === 2 ? -250 : 250);
  console.log('  ear release → phase', await ev('GlobalState.part2.phase'));
}
await sleep(900); await expect('PART2_PITCH');
console.log('  ear', await ev('GlobalState.psychoProfile.dominantEar'), await ev('GlobalState.psychoProfile.earStrength'));
await sleep(800); await shot('07-ear-antennae');

// ⑧ 바탕음·배음: 예시(답 없음) + 6번. 순서에 따라 답이 갈리게 (AB → 내려감 = 바탕음 쪽)
await waitPhase('example');
for (let k = 0; k < 6; k++) {
  await waitPhase('answer');
  const order = await ev('GlobalState.part2.trial.order');
  const dir = k % 4 === 3 ? (order === 'AB' ? 1 : -1) : (order === 'AB' ? -1 : 1);
  if (k === 3) await hdragHold(dir * 250, async () => { await sleep(700); await shot('08-pitch-live'); }); else await hdrag(dir * 250);
  if (k === 4) { await sleep(500); await shot('08-pitch-trail'); }
}
await waitUntil("GlobalState.currentStage === 'RESULT'", 40000); await shot('08-pitch-outro'); await expect('RESULT');
console.log('  result voice', await ev('voiceNow'));
console.log('  psycho', JSON.stringify(await ev('GlobalState.psychoProfile')));

// 결과: 빈 곳을 누르고 있으면 원래 소리, 떼면 내 소리. 달팽이를 오른쪽으로 밀면 보내기
await sleep(2500); await shot('10-result-subtitle'); await sleep(3000); await shot('10-result');
await canHold(); await holdSnail(); await expect('MUSIC');
await sleep(1500);
for (const i of [2, 0, 1]) {
  const t = await T(); await tap(t.tracks[i].x, t.tracks[i].y); await sleep(1800);
  if (!(await ev(`GlobalState.tour.index === ${i} && GlobalState.tour.pinned && activeSourceKey === TOUR_PLACES[${i}].key`))) throw new Error('track selection failed: ' + i);
  const pos = await ev('({ actual: cur.cx, target: targetParams(calculateUILayout()).cx, listen: resultListenState().dir })');
  if (Math.abs(pos.actual - pos.target) > 3) throw new Error('snail did not reach track');
  await shot('10-music-track-' + i);
}
const sb = (await T()).eqSlider;
await mouse('mousePressed', sb.x1, sb.y);
for (const mix of [0, 0.25, 0.75, 1]) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sb.x0 + (sb.x1 - sb.x0) * mix, y: sb.y, button: 'left', buttons: 1 }); await sleep(150);
  if (!(await ev(`Math.abs(GlobalState.part1.eqMix - ${mix}) < 0.01 && Math.abs(lowShelfFilter.biquad.gain.value - GlobalState.userEQProfile.lowShelf.gain * ${mix}) < 0.05`))) throw new Error('EQ slider failed at ' + mix);
}
await mouse('mouseReleased', sb.x1, sb.y); await shot('10-music-eq');
console.log('  tracks, snail movement and continuous EQ slider passed');
console.log('  code', await ev('getFullEarCode(GlobalState.userEQProfile, GlobalState.psychoProfile)'), 'place', await ev('tourPlace().key'));
await hold(80, 300, 1400, async () => { console.log('  holding empty → bypass', await ev('GlobalState.part1.isBypassed')); await shot('11-result-original'); });
console.log('  released → bypass', await ev('GlobalState.part1.isBypassed'));
const sn = (await T()).snail;
await mouse('mousePressed', sn.x, sn.y);
for (let k = 1; k <= 12; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sn.x + W * 0.3 * k / 12, y: sn.y, button: 'left', buttons: 1 }); await sleep(20); }
await mouse('mouseReleased', sn.x + W * 0.3, sn.y); console.log('  pushed → sending', await ev('GlobalState.tour.sendAt !== null'), 'bypass', await ev('GlobalState.part1.isBypassed'));
await sleep(1600); await shot('13-sending');
await sleep(3500); await shot('14-sent');
await sleep(5000); await expect('INIT');
console.log('  after send: source', await ev('String(activeSourceKey)'), 'video', await ev('String(backdropKey)'));

// 다음 관람객 → 중간에 자리를 뜨면 첫 화면으로
await ev(`(() => { const i = document.querySelector('.intro input'); i.value = 'two'; document.querySelector('.intro form').requestSubmit(); })()`);
await sleep(2500); await expect('PART1_VOLUME');
console.log('  2nd visitor beat on', await ev('isBeatOn()'), 'lang', await ev('GlobalState.lang'));
await ev('lastActivity -= (IDLE_RESET_SECONDS + 1) * 1000'); await sleep(300); await expect('INIT');
console.log('  idle reset → beat on', await ev('isBeatOn()'), 'voice', await ev('voiceBusy()'), 'duck', await ev('duckGain.output.gain.value.toFixed(2)'));
console.log('  level reset', (await ev('GlobalState.voiceLevel')).toFixed(2), 'voice on', await ev('GlobalState.voiceOn'));

// 음성을 꺼도 자막 시간만큼 잠기고, 슬라이더는 없음
await ev(`(() => { setVoiceOn(false); const i = document.querySelector('.intro input'); i.value = 'three'; document.querySelector('.intro form').requestSubmit(); })()`);
await sleep(2500); await expect('PART1_VOLUME');
console.log('  voice off → subtitle', await ev('voiceLine()'), 'locked', await ev('inputLocked()'), 'slider', await ev('voiceSliderShown()'));
await ev('lastActivity -= (IDLE_RESET_SECONDS + 1) * 1000'); await sleep(300); await expect('INIT');
console.log('errors:', errors.length ? errors : 'none');
ws.close(); chrome.kill(); process.exit(errors.length ? 1 : 0);
