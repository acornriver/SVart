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
const tapAntenna = async () => { const t = await T(); await tap(t.antenna.x, t.antenna.y); };
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
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(4000);
await expect('INIT');
if (LANG === 'en') { const b = await ev(`(() => { const r = document.querySelector('.langs [data-lang=en]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await tap(b.x, b.y); }
console.log('  lang', await ev('GlobalState.lang'));
await shot('00-intro');
await ev(`(() => { const i = document.querySelector('.intro input'); i.value = '${LANG === 'en' ? 'Mina' : '민혁'}'; i.dispatchEvent(new Event('input')); document.querySelector('.intro form').requestSubmit(); })()`);
await sleep(2500); await expect('PART1_VOLUME');

// ① 움직이기 전 꾹 → 확정 안 됨, 쓸고 나서 꾹 → 다음
await holdSnail(); await expect('PART1_VOLUME');
await drag(250); await sleep(1200);
await holdSnail(() => shot('01-volume-holding')); await expect('PART1_LOW');
await drag(200); await sleep(1300); await shot('02-low');
await holdSnail(); await expect('PART1_HIGH');
await drag(220); await sleep(1300); await shot('03-high');
await holdSnail(); await expect('PART1_REGISTER');

// ④ 자동 재생 → 등 위 자리 톡 → 더듬이 톡(다시 듣기) → 꾹
await sleep(1200); await shot('04-register-playing');
await sleep(10000);
const spots = (await T()).spots;
await tap(spots[2].x, spots[2].y); console.log('  picked card', await ev('GlobalState.part1.register.selectedCard'));
await sleep(2400); await shot('04-register-picked');
await tapAntenna(); console.log('  antenna replay → autoplaying', await ev('GlobalState.part1.register.isAutoPlaying'));
await holdSnail(); await expect('PART1_REGISTER'); // 다시 듣는 중에는 확정 안 됨
await sleep(11000);
await holdSnail(); await expect('PART2_SENSITIVITY');
console.log('  register', await ev('GlobalState.userEQProfile.registerPeak.register'));

// ⑤ 고역 예민도: 삐 소리 동안 화면 아무 데나 톡. 2번째는 일부러 너무 일찍 → 마지막에 한 번 더
const waitPhase = async (ph, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await ev('GlobalState.part2.phase')) === ph) return; await sleep(80); } throw new Error('phase ' + ph + ' timeout, now ' + await ev('GlobalState.part2.phase')); };
await sleep(800); await shot('05-sens-lead');
await waitPhase('pressing'); await sleep(4500); await shot('05-sens-twisting'); console.log('  twist live', (await ev('part2Twist()')).toFixed(2));
await tap(100, 300); console.log('  tapped → frozen', (await ev('GlobalState.part2.frozenU')).toFixed(2), 'phase', await ev('GlobalState.part2.phase'));
await shot('05-sens-frozen');
await waitPhase('pressing'); await sleep(150); await tap(600, 900); console.log('  early note', await ev('GlobalState.part2.note'));
await waitPhase('pressing'); await sleep(7000); await tap(400, 400); // 일찍 누른 2번째를 다시
await sleep(900); await expect('PART2_CENTER');
console.log('  sens', JSON.stringify(await ev('({ hz: GlobalState.psychoProfile.maxFreqHz, s: GlobalState.psychoProfile.sensitivity, twist: GlobalState.psychoProfile.twist })')));

// ⑥ 중앙: 돌리기 전 꾹 → 안 됨, 좌우로 쓸고 꾹 (2번)
await waitPhase('adjusting');
await holdSnail(); console.log('  center hold before turn → phase', await ev('GlobalState.part2.phase'));
for (let k = 0; k < 2; k++) {
  await waitPhase('adjusting');
  await hdrag(k === 1 ? -180 : 150); if (k === 0) await shot('06-center');
  await holdSnail();
}
await sleep(900); await expect('PART2_EAR');
console.log('  center', await ev('GlobalState.psychoProfile.centerDeg'), await ev('GlobalState.psychoProfile.centerImage'));

// ⑦ 우세 귀: 덜 굴리면 답 안 됨, 더듬이로 한 번 더 듣기, 굴리고 손을 떼면 바로 답 (3번)
for (let k = 0; k < 3; k++) {
  await waitPhase('answer');
  if (k === 0) {
    await hdrag(60); console.log('  ear small roll → phase', await ev('GlobalState.part2.phase'), '(answer여야 함)');
    await tapAntenna(); console.log('  antenna replay → phase', await ev('GlobalState.part2.phase'), 'left', await ev('GlobalState.part2.replayLeft'));
    await waitPhase('answer');
  }
  await hdrag(k === 2 ? -250 : 250); if (k === 0) await shot('07-ear');
  console.log('  ear release → phase', await ev('GlobalState.part2.phase'));
}
await sleep(900); await expect('PART2_PITCH');
console.log('  ear', await ev('GlobalState.psychoProfile.dominantEar'), await ev('GlobalState.psychoProfile.earStrength'));
await sleep(800); await shot('07-ear-antennae');

// ⑧ 바탕음·배음: 연습 1 + 6번. 순서에 따라 답이 갈리게 (AB → 내려감 = 바탕음 쪽)
for (let k = 0; k < 7; k++) {
  await waitPhase('answer');
  const order = await ev('GlobalState.part2.trial.order');
  const dir = k % 4 === 3 ? (order === 'AB' ? 1 : -1) : (order === 'AB' ? -1 : 1);
  await hdrag(dir * 250); if (k === 3) await shot('08-pitch');
}
await sleep(900); await expect('RESULT');
console.log('  psycho', JSON.stringify(await ev('GlobalState.psychoProfile')));

// 결과: 빈 곳을 누르고 있으면 원래 소리, 떼면 내 소리. 달팽이를 오른쪽으로 밀면 보내기
await sleep(2500); await shot('10-result');
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
console.log('  idle reset → beat on', await ev('isBeatOn()'));
console.log('errors:', errors.length ? errors : 'none');
ws.close(); chrome.kill(); process.exit(0);
