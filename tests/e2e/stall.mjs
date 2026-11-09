// 멈춤 복구 테스트 (전시 내내 소리·영상이 멈추면 안 됨): 비트(suspend, 스케줄러 죽음, 실수로 정지),
// 결과 화면 녹음 정지, 영상 일시정지·끝, 오디오 suspend, 오프라인에서 장소 4곳 순회. 모두 true / running이어야 함
// 실행: (레포 루트에서) python3 -m http.server 8765 &   그다음   node tests/e2e/stall.mjs <출력폴더(절대경로)>
// 맥의 Google Chrome을 헤드리스로 띄워 CDP(포트 9333)로 조종함. Node 22 이상(내장 WebSocket)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2];
const URL = process.argv[3] || 'http://localhost:8765/index.html';
const W = 744, H = 1133;
mkdirSync(OUT, { recursive: true });

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=' + (process.env.SVART_CDP_PORT || 9333), `--window-size=${W},${H}`,
  '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + OUT + '/profile', 'about:blank'
], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const targets = await (await fetch(`http://127.0.0.1:${process.env.SVART_CDP_PORT || 9333}/json`)).json();
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
const hold = async (x, y, ms = 1200) => { await mouse('mousePressed', x, y); await sleep(ms); await mouse('mouseReleased', x, y); await sleep(450); };
const holdSnail = async () => { const t = await T(); await hold(t.snail.x, t.snail.y); };
const stage = () => ev('GlobalState.currentStage');
const drag = async (dy) => {
  const x = W / 2, y0 = 500;
  await mouse('mousePressed', x, y0);
  for (let k = 1; k <= 10; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y0 - dy * k / 10, button: 'left', buttons: 1 }); await sleep(16); }
  await mouse('mouseReleased', x, y0 - dy); await sleep(400);
};
const expect = async (s) => { const cur = await stage(); if (cur !== s) throw new Error(`expected ${s}, got ${cur}`); console.log('✓', s); };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: URL });
await sleep(4000);
await ev(`(() => { const i = document.querySelector('.intro input'); i.value = '시험'; document.querySelector('.intro form').requestSubmit(); })()`);
await sleep(2500); await expect('PART1_VOLUME');
const hits = () => ev('beatHits.kick.length + ":" + beatHits.kick[beatHits.kick.length-1]?.toFixed(2)');
console.log('beat running', await hits());
await ev('getAudioContext().suspend()'); await sleep(2500);
console.log('suspend → ', await ev('getAudioContext().state'), 'beat', await hits());
await ev('clearInterval(beatTimer); beatTimer = null'); await sleep(2000);
console.log('scheduler killed → timer back', await ev('beatTimer !== null'), 'beat', await hits());
await ev('stopBeat()'); await sleep(2000);
console.log('beat stopped by accident → on', await ev('isBeatOn()'));
// 결과 화면
await ev('goToStep(9)'); await expect('MUSIC'); await sleep(1500);
console.log('tour', await ev('activeSourceKey'), 'video playing', await ev('!backdropVideos[backdropKey].paused'));
await ev('sampleSources[activeSourceKey].stop()'); await sleep(2500);
console.log('recording stop → playing', await ev('sampleSources[activeSourceKey].isPlaying()'));
await ev('backdropVideos[backdropKey].pause()'); await sleep(2500);
console.log('video pause → playing', await ev('!backdropVideos[backdropKey].paused'));
await ev('(() => { const v = backdropVideos[backdropKey]; v.loop = false; v.currentTime = v.duration - 0.2; })()'); await sleep(3000);
console.log('video end → playing', await ev('!backdropVideos[backdropKey].paused'), 't', await ev('backdropVideos[backdropKey].currentTime.toFixed(1)'));
await ev('getAudioContext().suspend()'); await sleep(2500);
console.log('result suspend → ', await ev('getAudioContext().state'));
await send('Network.enable'); await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
for (let k = 0; k < 4; k++) { await ev('GlobalState.tour.placeAt -= 15000'); await sleep(2500); console.log('offline place', await ev('tourPlace().key'), 'video playing', await ev('!backdropVideos[backdropKey].paused && backdropVideos[backdropKey].readyState'), 'audio', await ev('sampleSources[activeSourceKey].isPlaying()')); }
console.log('errors:', errors.length ? errors : 'none');
ws.close(); chrome.kill(); process.exit(errors.length ? 1 : 0);
