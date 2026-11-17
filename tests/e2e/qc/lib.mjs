// QC 보조 (11/17): 헤드리스 크롬을 띄우고, 빠른 모드(×8)로 관람객 한 명을 끝까지 돌리는 도구. 앱 파일은 건드리지 않음
// 쓰는 곳: soak.mjs(연속 관람객) · touch.mjs(터치·여러 손가락) · edge.mjs(방치·음성 끔·화면 크기) · cloud.mjs(에뮬레이터 전송)
// 서버: python3 scripts/serve.py   실행 예: node tests/e2e/qc/soak.mjs <출력폴더(절대경로)> 6   (한 번에 하나씩만 돌릴 것)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';

const REPO = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(out, { w = 1024, h = 768, touch = false, url = 'http://localhost:8765/index.html', lang = 'ko', fast = true } = {}) {
  rmSync(out + '/profile', { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const portFile = `${out}/profile/DevToolsActivePort`;
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=0', `--window-size=${w},${h}`, '--enable-precise-memory-info', '--js-flags=--expose-gc',
    '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + out + '/profile', 'about:blank'
  ], { stdio: 'ignore' });
  process.on('exit', () => chrome.kill());
  let targets; const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      if (r.ok) { targets = await r.json(); if (targets.some(t => t.type === 'page')) break; }
    } catch { /* starting */ }
    await sleep(80);
  }
  if (!targets?.some(t => t.type === 'page')) throw new Error('Chrome did not start');
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = {}; const errors = []; const warnings = []; const audio = { nodes: 0, created: 0, live: new Map() }; const failed = []; const open = new Map(); const contexts = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = JSON.stringify(msg.params.args.map(a => a.value ?? a.description));
      if (msg.params.type === 'error') errors.push('console.error: ' + text);
      if (msg.params.type === 'warning') warnings.push(text);
    }
    if (msg.method === 'WebAudio.contextCreated') contexts.push(msg.params.context);
    if (msg.method === 'WebAudio.audioNodeCreated') { audio.nodes++; audio.created++; audio.live.set(msg.params.node.nodeId, msg.params.node.nodeType + '@' + msg.params.node.contextId.slice(0, 6)); }
    if (msg.method === 'WebAudio.audioNodeWillBeDestroyed') { audio.nodes--; audio.live.delete(msg.params.nodeId); }
    if (msg.method === 'Network.requestWillBeSent') open.set(msg.params.requestId, msg.params.request.url);
    if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') open.delete(msg.params.requestId);
    if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) failed.push(msg.params.errorText + ' ' + (msg.params.blockedReason || ''));
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error('eval failed: ' + expr.slice(0, 120) + ' → ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable'); await send('WebAudio.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: touch });
  if (touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const c = { send, ev, shot, errors, warnings, audio, failed, contexts, w, h, touch, lang, out, fast, close: () => { ws.close(); chrome.kill(); } };
  Object.assign(c, inputs(c));
  for (let attempt = 1; ; attempt++) {
    await send('Page.navigate', { url });
    try { await c.until("typeof setupIntro === 'function' && !!document.querySelector('.intro .title-btn') && !!document.querySelector('canvas')", 12000); break; }
    catch (e) {
      console.log(`  [load stuck, attempt ${attempt}] pending:`, [...open.values()].map(u => u.replace(/^https?:\/\/[^/]+/, '')).slice(0, 12), 'readyState', await ev('document.readyState'), 'scripts', await ev("[typeof p5, typeof GlobalState, typeof setupIntro, typeof setup].join()"));
      if (attempt >= 4) throw e; open.clear();
    }
  }
  await ev(`GlobalState.lang = ${JSON.stringify(lang)}; refreshIntroText()`);
  await c.until("voiceIds(currentLang()).filter(id => !VOICE_PENDING[currentLang()].includes(id)).every(id => !!voiceClips[currentLang()][id])", 25000);
  if (fast) {
    const src = readFileSync(REPO + '/tests/e2e/fast-flow.mjs', 'utf8');
    const fn = src.slice(src.indexOf('function installFastMode()'), src.indexOf('export async function runFastFlow'));
    await ev(`(${fn})()`);
  }
  await c.until('MemeFX.ready()');
  return c;
}

function inputs(c) {
  const { send, ev } = c;
  const until = async (expr, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await ev(expr)) return; await sleep(30); }
    throw new Error('timeout: ' + expr + '; state=' + JSON.stringify(await ev('(typeof millis === "function" ? {stage: GlobalState.currentStage, phase: GlobalState.part2.phase, voice: voiceNow, locked: inputLocked(), rp: GlobalState.part1.resultPhase} : "page not loaded")')));
  };
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...(type === 'mouseMoved' ? { buttons: 1 } : {}) });
  const touchEv = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id ?? i })) });
  const down = (p) => c.touch ? touchEv('touchStart', [p]) : mouse('mousePressed', p.x, p.y);
  const move = (p) => c.touch ? touchEv('touchMove', [p]) : mouse('mouseMoved', p.x, p.y);
  const up = (p) => c.touch ? touchEv('touchEnd', []) : mouse('mouseReleased', p.x, p.y);
  const tap = async (p) => { await down(p); await sleep(35); await up(p); await sleep(60); };
  const drag = async (dx, dy, o = { x: c.w / 2, y: c.h * 0.45 }) => {
    await down(o);
    for (let k = 1; k <= 10; k++) { await move({ x: o.x + dx * k / 10, y: o.y + dy * k / 10 }); await sleep(10); }
    await up({ x: o.x + dx, y: o.y + dy }); await sleep(70);
  };
  const targets = () => ev('getTouchTargets()');
  const hold = async (ms = 1100) => { const p = (await targets()).snail; await down(p); await sleep(ms); await up(p); await sleep(50); };
  const ready = () => until('!inputLocked() && !voiceBusy()');
  const confirm = async () => { await until('canHoldConfirm()'); await hold(); };
  const stage = (name, t) => until(`GlobalState.currentStage === '${name}'`, t);
  const center = (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  return { until, mouse, touchEv, down, move, up, tap, drag, targets, hold, ready, confirm, stage, center };
}

// 관람객 한 명: 첫 화면 → … → 감상 → 보내기 → QR → 첫 화면. hooks[단계이름](c)는 그 단계가 조작 가능해졌을 때 불림
export async function visitor(c, hooks = {}, { send = true } = {}) {
  const hook = async (name) => { if (hooks[name]) await hooks[name](c); };
  await c.until("GlobalState.currentStage === 'INIT' && !!document.querySelector('.intro:not(.started):not(.gone) .title-btn')");
  await hook('INIT');
  if (c.touch) await c.tap(await c.center('.intro .title-btn')); else await c.ev("document.querySelector('.intro .title-btn').click()");
  for (const name of ['PART1_VOLUME', 'PART1_LOW', 'PART1_HIGH']) {
    await c.stage(name); await c.ready(); await hook(name); if (await c.ev(`GlobalState.currentStage !== '${name}'`)) continue; await c.drag(0, -200 + Math.random() * 380); if (!(await c.ev('canConfirmAdjust()'))) await c.drag(0, -160); await c.confirm();
  }
  await c.stage('PART1_REGISTER'); await c.ready(); await hook('PART1_REGISTER');
  await c.tap((await c.targets()).spots[Math.floor(Math.random() * 3)]);
  await c.until('GlobalState.part1.register.playingCard < 0'); await c.confirm();
  await c.stage('PART2_SENSITIVITY'); await c.ready(); await hook('PART2_SENSITIVITY'); await c.drag(120 + Math.random() * 200, 0); await c.confirm();
  await c.stage('PART2_CENTER');
  for (let i = 0; i < 2; i++) { await c.until("GlobalState.part2.phase === 'adjusting'"); if (!i) await hook('PART2_CENTER'); await c.drag(i ? -180 : 150, 0); await c.confirm(); }
  await c.stage('PART2_EAR');
  for (let i = 1; i <= 3; i++) { await c.until(`GlobalState.part2.phase === 'answer' && GlobalState.part2.trial.index === ${i}`); if (i === 1) await hook('PART2_EAR'); await c.drag(Math.random() < 0.5 ? 250 : -250, 0); }
  await c.stage('PART2_PITCH');
  for (let i = 1; i <= 6; i++) { await c.until(`GlobalState.part2.phase === 'answer' && GlobalState.part2.trial.index === ${i}`); if (i === 1) await hook('PART2_PITCH'); await c.drag(Math.random() < 0.5 ? 250 : -250, 0); }
  await c.stage('RESULT'); await hook('RESULT_START');
  await c.until("GlobalState.part1.resultPhase === 'ready'", 60000); await c.ready(); await c.until('!resultAction.hidden'); await hook('RESULT');
  await c.tap((await c.targets()).analysisNext);
  await c.stage('MUSIC'); await c.ready(); await hook('MUSIC');
  if (!send) return;
  await c.drag(c.w * 0.25, 0, (await c.targets()).snail);
  await c.until('GlobalState.tour.sendAt !== null', 3000);
  await c.until('towerCard && !towerCard.hidden'); await hook('CARD');
  await sleep(1800);
  if (c.touch) await c.tap({ x: c.w / 2, y: c.h / 2 }); else await c.ev('towerCard.click()');
  await c.stage('INIT');
}
