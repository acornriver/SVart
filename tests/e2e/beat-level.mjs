// 비트 묶음(FULL / LOW / HIGH)별 크기 확인. 11/03부터 norm은 앱이 시작할 때 직접 잼(beat.js calibrateBeat, K-가중 -26 dB, 피크 상한).
// 이 테스트는 잰 결과(loudDb가 -26 근처인지, peakDb가 상한 -10.5 아래인지)와 실제로 울리는 소리의 단순 RMS를 보여 줌.
// loudDb가 -26보다 많이 작으면 피크 상한에 걸린 것이니 그 묶음 소리의 크레스트(피크/평균)를 줄여야 함
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
await ev("document.querySelector('.intro .title-btn').click()");
await sleep(2500);
await ev(`window.__an = getAudioContext().createAnalyser(); __an.fftSize = 2048; beatOut.connect(__an); setActiveSource(null); true`);
await ev('beatCalibrated');
console.log('calibrated', await ev("JSON.stringify(Object.fromEntries(Object.entries(BEAT_MIXES).map(([k, m]) => [k, { norm: +m.norm.toFixed(3), loudDb: m.loudDb, peakDb: m.peakDb }])))"));
console.log('recordings gain dB', await ev("JSON.stringify(Object.fromEntries(Object.entries(sampleLevels).map(([k, v]) => [k, +(20 * Math.log10(v)).toFixed(1)])))"));
for (const mix of ['FULL', 'LOW', 'HIGH']) {
  await ev(`(() => { startBeat('${mix}'); window.__acc = { s: 0, n: 0 }; const buf = new Float32Array(2048);
    clearInterval(window.__iv); window.__iv = setInterval(() => { __an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; __acc.s += s; __acc.n += buf.length; }, 40); })()`);
  await sleep(7000);
  const rms = await ev('Math.sqrt(__acc.s / __acc.n)');
  console.log(mix, 'live plain rms dBFS', (20 * Math.log10(rms)).toFixed(1));
}
console.log('errors:', errors.length ? errors : 'none');
ws.close(); chrome.kill(); process.exit(errors.length ? 1 : 0);
