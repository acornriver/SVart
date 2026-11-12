// Capture the live output after the production p5/Web Audio chains at normal speed.
// Usage: node tests/e2e/audio-balance.mjs /tmp/svart-audio-balance (local server: 8765)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';

const OUT = process.argv[2];
const URL = 'http://localhost:8765/index.html';
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
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: URL });



const until = async expression => {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (await ev(expression)) return;
    await sleep(60);
  }
  throw Error('timeout ' + expression);
};
await until("!!document.querySelector('.intro .title-btn') && MemeFX.ready()");
await ev("document.querySelector('.intro .title-btn').click()");
await until("GlobalState.currentStage === 'PART1_VOLUME'");
await until("LANGS.every(lang => voiceIds(lang).filter(id => !VOICE_PENDING[lang].includes(id)).every(id => !!voiceClips[lang][id]))");
await ev('Promise.all([beatCalibrated, registerCalibrated])');
const result = await ev(`(${captureBalance.toString()})().catch(error => ({error: error.stack}))`);
if (!Array.isArray(result)) throw Error(JSON.stringify({result, errors}));
const beat = result.find(row => row.id === 'beat');
const failures = result.filter(row => row.id !== 'f0' && Math.abs(row.loudDb - beat.loudDb) > 6);
const pitch = result.find(row => row.id === 'f0');
if (Math.abs(pitch.activeLoudDb - beat.loudDb) > 6) failures.push(pitch);
if (result.some(row => row.peakDb > -1)) errors.push('Live output peak exceeded -1dBFS');
if (failures.length) errors.push('Live level mismatch: ' + JSON.stringify(failures));
writeFileSync(OUT + '/audio-balance.json', JSON.stringify({volumeDb: -20, records: result, errors}, null, 2));
result.forEach(row => console.log(row.id, 'K RMS', row.loudDb.toFixed(2), 'peak', row.peakDb.toFixed(2), 'active', row.activeLoudDb?.toFixed(2)));
console.log('errors:', errors.length ? errors : 'none');
ws.close(); chrome.kill(); process.exit(errors.length ? 1 : 0);

async function captureBalance() {
  const ctx = getAudioContext();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const db = value => 20 * Math.log10(Math.max(value, 1e-9));
  const records = [];
  // This tap records the final production output; it never changes the audible gain.
  function record(milliseconds, begin = () => {}, windows = []) {
    return new Promise((resolve, reject) => {
      const size = Math.ceil(milliseconds * ctx.sampleRate / 1000);
      const data = [new Float32Array(size), new Float32Array(size)];
      const recorder = ctx.createScriptProcessor(1024, 2, 2);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      AudioMix.graph().output.connect(recorder);
      recorder.connect(silent); silent.connect(ctx.destination);
      let written = 0;
      const cleanup = () => {
        clearTimeout(timer);
        recorder.onaudioprocess = null;
        AudioMix.graph().output.disconnect(recorder);
        recorder.disconnect(); silent.disconnect();
      };
      const timer = setTimeout(() => { cleanup(); reject(Error('Live recorder stalled')); }, milliseconds + 8000);
      recorder.onaudioprocess = event => {
        const length = Math.min(event.inputBuffer.length, size - written);
        for (let channel = 0; channel < 2; channel++) data[channel].set(event.inputBuffer.getChannelData(channel).subarray(0, length), written);
        written += length;
        if (written < size) return;
        const measured = measureLoudness(data, ctx.sampleRate);
        const result = {loudDb: db(measured.kRms), peakDb: db(measured.peak)};
        if (windows.length) {
          const active = data.map(channel => Float32Array.from(windows.flatMap(([start, end]) => Array.from(channel.subarray(Math.round(start * ctx.sampleRate), Math.round(end * ctx.sampleRate))))));
          result.activeLoudDb = db(measureLoudness(active, ctx.sampleRate).kRms);
        }
        cleanup(); resolve(result);
      };
      begin();
    });
  }
  hushVoice(); registerPlayToken++; leavePart2(); stopVoice();
  GlobalState.currentStage = 'PART1_LOW';
  GlobalState.userEQProfile.masterVolume = .1;
  GlobalState.userEQProfile.lowShelf.gain = 0;
  GlobalState.userEQProfile.highShelf.gain = 0;
  GlobalState.userEQProfile.registerPeak.gain = 0;
  masterGain.amp(.1, 0);
  applyVoiceGain();
  setActiveSource('VOLUME'); applyEQ();
  await pause(800);
  records.push({id: 'beat', ...await record(4000)});
  setActiveSource(null, 0);
  await pause(700);
  GlobalState.currentStage = 'PART1_REGISTER';
  for (const reg of REGISTERS) {
    stopVoice(); await pause(150);
    records.push({id: 'melody-' + reg.id, ...await record((MELODY_LENGTH + .5) * 1000, () => playRegister(reg.id))});
  }
  stopVoice(); await pause(150);
  for (const lang of LANGS) {
    GlobalState.lang = lang;
    applyVoiceGain();
    records.push({id: 'voice-' + lang, ...await record((voiceClips[lang]['m4-1'].duration + .1) * 1000, () => say(['m4-1']))});
    hushVoice();
  }
  GlobalState.currentStage = 'PART2_CENTER';
  const center = startCenter({off: 0}, await prepareCenter());
  await pause(1200);
  records.push({id: 'center', ...await record(4000)});
  center.stop(); await pause(200);
  GlobalState.currentStage = 'PART2_EAR';
  const octave = octBuffer({startHigh: 'L'});
  records.push({id: 'octave', ...await record((octave.duration + .1) * 1000, () => p2Play(octave))});
  GlobalState.currentStage = 'PART2_PITCH';
  const pitch = f0Buffer({...F0_PAIRS.find(pair => pair.id === 2), order: 'AB'});
  const lead = P2_BEAT_SEC / 2 * P2_GROOVE.countIn + .03;
  records.push({id: 'f0', ...await record((pitch.duration + .1) * 1000, () => p2Play(pitch), [[lead, lead + .5], [lead + .75, lead + 1.25]])});
  leavePart2();
  return records;
}
