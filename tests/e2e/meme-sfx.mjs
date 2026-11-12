// 밈 효과음 실시간 검증: 4개 효과, 음성 끄기, 리셋 취소, 파일 누락 복구.
// 전체 흐름 테스트: 첫 화면(언어) → 이름 → 8검사(Part 2: 톡 · 돌리기 · 굴리기) → 결과(북서울 산책, 비교, 보내기) → 자동으로 첫 화면 → 다음 관람객 → 방치 시 첫 화면
// 버튼 없는 손짓(쓸기, 달팽이 꾹, 더듬이 톡, 등 위 자리 톡, 누르고 있기, 밀기)을 실제 마우스 이벤트로 하며, 단계마다 스크린샷을 <출력폴더>/*.png로 남김. 마지막 줄이 'errors: none'이어야 함
// 빠른 검증: node tests/e2e/flow.mjs /tmp/svart-fast ko --fast (브라우저 안에서만 안내/검사음 8배속)
// 실행: (레포 루트에서) python3 -m http.server 8765 &   그다음   node tests/e2e/flow.mjs <출력폴더(절대경로)> [ko|en]
// 맥의 Google Chrome을 헤드리스로 띄워 CDP(자동 빈 포트)로 조종함. Node 22 이상(내장 WebSocket)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';

const OUT = process.argv[2];
const URL = 'http://localhost:8765/index.html';
const LANG = process.argv.slice(3).find(arg => arg === 'ko' || arg === 'en') || 'ko';
const W = 744, H = 1133;
const portFile = `${OUT}/profile/DevToolsActivePort`;
const requestedPort = process.env.SVART_CDP_PORT || '0';
mkdirSync(OUT, { recursive: true });
if (requestedPort === '0' && existsSync(portFile)) unlinkSync(portFile);

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=' + requestedPort, `--window-size=${W},${H}`,
  '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + OUT + '/profile', 'about:blank'
], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Chrome chooses a fresh port by default, so parallel runs cannot attach to an old test tab.
let targets;
const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
  try {
    const port = requestedPort === '0' ? readFileSync(portFile, 'utf8').split('\n')[0].trim() : requestedPort;
    const response = await fetch(`http://127.0.0.1:${port}/json`);
    if (response.ok) {
      targets = await response.json();
      if (targets.some(t => t.type === 'page')) break;
    }
  } catch { /* Chrome is still starting. */ }
  await sleep(80);
}
if (!targets?.some(t => t.type === 'page')) throw new Error('Chrome did not start within 15 seconds');
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
const expect = async (s) => { const start = Date.now(); while (Date.now() - start < 6000) { if (await stage() === s) { console.log('✓', s); return; } await sleep(40); } throw new Error(`expected ${s}, got ${await stage()}`); };

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
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: URL });

const delay = ms => new Promise(r => setTimeout(r,ms));
const until = async expr => { const start=Date.now(); while(Date.now()-start<12000){if(await ev(expr))return;await delay(30);}throw new Error('timeout '+expr); };
const check = async (expr,msg) => {if(!await ev(expr))throw new Error(msg);};
await until("!!document.querySelector('.intro .title-btn') && MemeFX.ready()");
await ev(`GlobalState.lang = '${LANG}'; refreshIntroText()`);
await ev('document.fonts.ready');
await shot('intro-portrait');
console.log('intro title', await ev("({size:getComputedStyle(intro.titleBtn).fontSize,width:intro.titleBtn.getBoundingClientRect().width,viewport:innerWidth})"));
await send('Emulation.setDeviceMetricsOverride', { width: 1133, height: 744, deviceScaleFactor: 1, mobile: false });
await delay(250); await shot('intro-landscape');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await ev("document.querySelector('.intro .title-btn').click()");
await until("GlobalState.currentStage === 'PART1_VOLUME'");
await delay(800); await shot('volume-slider-portrait');
await send('Emulation.setDeviceMetricsOverride', { width: 1133, height: 744, deviceScaleFactor: 1, mobile: false });
await delay(200); await shot('volume-slider-landscape');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
for(const key of ['size','shell','reveal']) {
  if (key === 'shell') await ev("GlobalState.userEQProfile.registerPeak.register='HIGH';goToStep(3);");
  if (key === 'reveal') await ev("goToStep(7)"); // 실제 흐름처럼 ⑧에서 완성 장면으로 (분석 화면은 스스로 안내를 이어 가므로 그 위에서 띄우지 않음)
  await ev(`window.__done=false; MemeFX.transition('${key}',()=>{window.__done=true;unlockInput(0)}); true`);
  await delay(key === 'reveal' ? 1150 : 650);await shot('meme-'+key);
  await check("MemeFX.busy() && inputLocked() && !voiceBusy() && activeSourceKey === null",'SFX overlaps guide/source or fails to lock');
  await until('window.__done');
  const record=await ev('MemeFX.history.at(-1)');
  if(record.status!=='completed')throw new Error('cue did not complete');
  console.log('cue',key,'real duration',Math.round(record.endedAt-record.at),'ms');
}
// Reproduce the real transition from the last left/right answer, including large bodies.
for (const [w,h] of [[744,1133],[1133,744]]) {
  await send('Emulation.setDeviceMetricsOverride', {width:w,height:h,deviceScaleFactor:1,mobile:false});
  for (const side of [-1,1]) {
    await ev(`goToStep(7);GlobalState.userEQProfile.masterVolume=1;GlobalState.userEQProfile.lowShelf.gain=10;GlobalState.userEQProfile.highShelf.gain=10;GlobalState.part2.roll=${side}*PART2_SNAP;Object.assign(cur,targetParams(calculateUILayout()));window.__done=false;MemeFX.transition('reveal',()=>{goToStep(8);window.__done=true});true`);
    for(const pause of [40,160,650,600,800]) {
      await delay(pause);
      await check("getComputedStyle(document.querySelector('canvas')).transform === 'none'", 'Reveal zoomed the whole canvas');
      await check("bodyShape().pts.concat(antennaTips).every(p=>p.x>=0 && p.x<=width && p.y>=0 && p.y<=height)", 'Reveal pushed the snail outside the viewport');
    }
    await shot(`reveal-${w}-${side<0?'left':'right'}`);
    await until('window.__done');
    await check('Math.abs(cur.cx-width/2)<2', 'Reveal did not recenter the snail');
  }
}
await send('Emulation.setDeviceMetricsOverride', {width:W,height:H,deviceScaleFactor:1,mobile:false});
console.log('reveal left/right bounds in portrait/landscape passed');
await ev("setVoiceOn(false); window.__done=false; MemeFX.transition('shell',()=>{window.__done=true;unlockInput(0)}); true");
await delay(100);await check('MemeFX.gain() === 0','voice mute did not mute SFX');await until('window.__done');
console.log('mute passed');
await ev("setVoiceOn(true);goToStep(9);sendToTower()");
await delay(700);
await check("!MemeFX.busy() && !document.body.dataset.memeCue", 'Departure still played an effect');
await until('sendProgress() === 1');
await delay(700); await shot('plain-arrival');
await check("!MemeFX.busy() && !document.querySelector('.meme-pop.on')", 'Arrival still played an effect');
await until("GlobalState.currentStage === 'INIT'");
await check("!MemeFX.busy() && !document.querySelector('.meme-pop.on')", 'Arrival leaked after reset');
console.log('departure/arrival without FX passed');
// Also cancel during the walk: no delayed arrival may survive a reset.
await ev("goToStep(9);sendToTower();restartFlow()");
await delay(4400);
await check("GlobalState.currentStage === 'INIT' && !MemeFX.busy()", 'Reset left an arrival timer');
await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await ev("window.__done=false;MemeFX.transition('reveal',()=>{window.__done=true;unlockInput(0)});true");
await delay(100); await shot('meme-reduced-motion');
await check("getComputedStyle(document.querySelector('.meme-finish')).animationName === 'none' && getComputedStyle(document.querySelector('.meme-finish')).opacity === '1'", 'Reduced motion hid the final title');
await until('window.__done');
await send('Emulation.setEmulatedMedia', {features:[]});
await ev("setVoiceOn(true); window.__unexpected=false; MemeFX.transition('shell',()=>window.__unexpected=true); true");
await delay(100);await ev('restartFlow()');await delay(1900);
await check("!window.__unexpected && GlobalState.currentStage === 'INIT' && !MemeFX.busy() && !document.querySelector('.meme-pop.on')",'reset left a stale transition/caption');
console.log('cancel/reset passed');
await send('Network.setBlockedURLs',{urls:['*media/sfx/memes/*']});await send('Page.reload',{ignoreCache:true});
await until("!!document.querySelector('.intro .title-btn') && typeof MemeFX !== 'undefined'");
await ev("document.querySelector('.intro .title-btn').click()");
await until("GlobalState.currentStage === 'PART1_VOLUME'");
await ev("window.__done=false;MemeFX.transition('shell',()=>{window.__done=true;unlockInput(0)});true");
await until('window.__done');await check('!MemeFX.ready() && !MemeFX.busy() && !inputLocked()','Missing SFX stalled flow');
console.log('missing-file fallback passed');
console.log('errors:',errors);ws.close();chrome.kill();process.exit(errors.length?1:0);
