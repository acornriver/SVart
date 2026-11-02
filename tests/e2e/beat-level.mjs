// 비트 묶음(FULL / LOW / HIGH)별 RMS 측정. 북서울 녹음과 같은 -26 dBFS(0.05)가 목표.
// 비트 소리를 바꾸면 이걸로 재고 beat.js의 BEAT_MIXES norm을 'norm for 0.05' 값에 현재 norm을 곱한 값으로 고침
// 실행: (레포 루트에서) python3 -m http.server 8765 &   그다음   node tests/e2e/beat-level.mjs <출력폴더(절대경로)>
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
await send('Page.navigate', { url: URL });
await sleep(4000);
await ev(`(() => { const i = document.querySelector('.intro input'); i.value = 'm'; document.querySelector('.intro form').requestSubmit(); })()`);
await sleep(2500);
await ev(`window.__an = getAudioContext().createAnalyser(); __an.fftSize = 2048; beatOut.connect(__an); setActiveSource(null); true`);
for (const mix of ['FULL', 'LOW', 'HIGH']) {
  await ev(`(() => { startBeat('${mix}'); window.__acc = { s: 0, n: 0 }; const buf = new Float32Array(2048);
    clearInterval(window.__iv); window.__iv = setInterval(() => { __an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; __acc.s += s; __acc.n += buf.length; }, 40); })()`);
  await sleep(7000);
  const rms = await ev('Math.sqrt(__acc.s / __acc.n)');
  console.log(mix, 'rms', rms.toFixed(4), 'dBFS', (20 * Math.log10(rms)).toFixed(1), 'norm for 0.05 →', (0.05 / rms).toFixed(3));
}
console.log('errors:', errors.length ? errors : 'none');
ws.close(); chrome.kill(); process.exit(0);
