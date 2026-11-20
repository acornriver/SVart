import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export async function browser(out, { w, h, mobile = false, touch = false }) {
  rmSync(out + '/profile', { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--window-size=${w},${h}`, '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--user-data-dir=' + out + '/profile', 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => chrome.kill());
  let targets; for (let k = 0; k < 200; k++) { try { const port = readFileSync(out + '/profile/DevToolsActivePort', 'utf8').split('\n')[0].trim(); targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {} await sleep(80); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = {}, errors = [], warnings = [], failed = [], urls = new Map();
  ws.addEventListener('message', m => { const msg = JSON.parse(m.data); if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled') { const t = JSON.stringify(msg.params.args.map(a => a.value ?? a.description)).slice(0, 300); if (msg.params.type === 'error') errors.push('console.error ' + t); if (msg.params.type === 'warning') warnings.push(t); }
    if (msg.method === 'Network.requestWillBeSent') urls.set(msg.params.requestId, msg.params.request.url);
    if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) failed.push((urls.get(msg.params.requestId) || '') + ' ' + msg.params.errorText);
    if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) failed.push(msg.params.response.url + ' HTTP ' + msg.params.response.status);
  });
  const send = (method, params = {}) => new Promise(r => { const k = ++id; pending[k] = r; ws.send(JSON.stringify({ id: k, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error('eval: ' + expr.slice(0, 100) + ' → ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0]); return r.result?.result?.value; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
  const until = async (expr, t = 20000) => { const s = Date.now(); while (Date.now() - s < t) { try { if (await ev(expr)) return true; } catch {} await sleep(100); } return false; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const go = async (url) => { await send('Page.navigate', { url }); await sleep(500); };
  const heap = async () => { await send('HeapProfiler.collectGarbage'); const u = (await send('Runtime.getHeapUsage')).result.usedSize; return +(u / 1048576).toFixed(1); };
  const fps = async (ms = 3000) => ev(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); })`);
  return { send, ev, shot, until, go, heap, fps, errors, warnings, failed, close: () => { ws.close(); chrome.kill(); } };
}

