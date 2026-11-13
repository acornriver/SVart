// 검사 결과가 감상 소리에 실제로 걸리는지 확인 (11/13).
//   1) 필터 노드 값이 프로필과 같은가  2) 노드의 실제 주파수 응답이 계산식과 같은가  3) 나오는 소리의 스펙트럼이 그만큼 기우는가
//   4) 비교 슬라이더(0 / 0.5 / 1)와 빈 곳 누르기(원래 소리)  5) 여섯 소리 모두 같은 체인을 지나는가  6) Part 2 결과는 소리를 바꾸지 않는가
// 실행: (레포 루트에서) python3 -m http.server 8765 &   그다음   node tests/e2e/eq-apply.mjs <출력폴더(절대경로)>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2];
const URL = process.argv[3] || 'http://localhost:8765/index.html';
mkdirSync(OUT, { recursive: true });
const PORT = process.env.SVART_CDP_PORT || 9355;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=' + PORT, '--window-size=1180,820',
  '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + OUT + '/profile', 'about:blank'
], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = {}; const errors = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed: ' + expr); return r.result?.result?.value; };
const until = async (expr, timeout = 40000) => { const t = Date.now(); while (Date.now() - t < timeout) { if (await ev(expr)) return; await sleep(200); } throw new Error('timeout: ' + expr); };
const fails = [];
const ok = (cond, label, detail = '') => { console.log((cond ? '✓ ' : '✗ ') + label + (detail ? '  ' + detail : '')); if (!cond) fails.push(label); };
const r1 = (x) => Math.round(x * 10) / 10;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(4000);
await ev("document.querySelector('.intro .title-btn').click()");
await until("GlobalState.currentStage === 'PART1_VOLUME'");

// 검사 결과를 직접 넣음: ① -12dB, ② 저음 +8dB, ③ 고음 -6dB, ④ 높은 멜로디(2.5kHz +3dB)
const PROFILE = { volDb: -12, lowDb: 8, highDb: -6, register: 'HIGH', peakHz: 2500 };
await ev(`(() => { const p = GlobalState.userEQProfile;
  p.masterVolume = dbToGain(${PROFILE.volDb}); p.lowShelf.gain = ${PROFILE.lowDb}; p.highShelf.gain = ${PROFILE.highDb};
  p.registerPeak = { register: '${PROFILE.register}', freq: ${PROFILE.peakHz}, gain: REGISTER_PEAK_GAIN, q: REGISTER_PEAK_Q };
  masterGain.amp(p.masterVolume, 0.05);
  goToStep(FLOW_STAGES.indexOf('MUSIC')); })()`);
await until("GlobalState.currentStage === 'MUSIC' && TOUR_PLACES.every(p => sampleSources[p.key])");
await ev('hushVoice()'); await sleep(1500);

// 측정 도구: 필터 노드의 실제 응답, 출력(masterGain 뒤)의 평균 스펙트럼
await ev(`window.__eq = {
  nodes: () => ({
    low:  { type: lowShelfFilter.biquad.type,  hz: lowShelfFilter.biquad.frequency.value,  db: lowShelfFilter.biquad.gain.value },
    peak: { type: peakFilter.biquad.type,      hz: peakFilter.biquad.frequency.value,      db: peakFilter.biquad.gain.value, q: peakFilter.biquad.Q.value },
    high: { type: highShelfFilter.biquad.type, hz: highShelfFilter.biquad.frequency.value, db: highShelfFilter.biquad.gain.value },
    masterDb: 20 * Math.log10(masterGain.output.gain.value)
  }),
  response: (freqs) => { const f = new Float32Array(freqs), ph = new Float32Array(f.length), sum = new Float32Array(f.length);
    [lowShelfFilter, peakFilter, highShelfFilter].forEach(x => { const m = new Float32Array(f.length); x.biquad.getFrequencyResponse(f, m, ph); m.forEach((v, i) => sum[i] += 20 * Math.log10(v)); });
    return Array.from(sum); },
  analyser: (() => { const a = getAudioContext().createAnalyser(); a.fftSize = 8192; a.smoothingTimeConstant = 0; masterGain.output.connect(a); return a; })(),
  // lo ~ hi Hz 대역 파워(dB)를 ms 동안 평균
  bands: async (ranges, ms) => { const a = window.__eq.analyser, buf = new Float32Array(a.frequencyBinCount), hzPerBin = getAudioContext().sampleRate / a.fftSize;
    const acc = ranges.map(() => 0); let n = 0; const end = performance.now() + ms;
    while (performance.now() < end) { a.getFloatFrequencyData(buf);
      ranges.forEach(([lo, hi], k) => { let s = 0; for (let i = Math.ceil(lo / hzPerBin); i <= hi / hzPerBin; i++) s += Math.pow(10, buf[i] / 10); acc[k] += s; });
      n++; await new Promise(r => setTimeout(r, 40)); }
    return acc.map(v => 10 * Math.log10(v / n)); }
}; true`);

// 1) 노드 값
await ev('setResultEqMix(1)'); await sleep(400);
const n = await ev('__eq.nodes()');
console.log('nodes', JSON.stringify(n));
ok(n.low.type === 'lowshelf' && n.low.hz === 200 && Math.abs(n.low.db - PROFILE.lowDb) < 0.01, '② 저음 → lowshelf 200Hz', `${r1(n.low.db)} dB`);
ok(n.high.type === 'highshelf' && n.high.hz === 4000 && Math.abs(n.high.db - PROFILE.highDb) < 0.01, '③ 고음 → highshelf 4kHz', `${r1(n.high.db)} dB`);
ok(n.peak.type === 'peaking' && n.peak.hz === PROFILE.peakHz && Math.abs(n.peak.db - 3) < 0.01 && Math.abs(n.peak.q - 1) < 0.01, '④ 음역 → peaking', `${n.peak.hz} Hz +${r1(n.peak.db)} dB Q${n.peak.q}`);
ok(Math.abs(n.masterDb - PROFILE.volDb) < 0.1, '① 볼륨 → masterGain', `${r1(n.masterDb)} dB`);

// 2) 실제 응답 = 계산식
const FREQS = [50, 100, 200, 400, 1000, 2500, 4000, 8000, 16000];
const live = await ev(`__eq.response(${JSON.stringify(FREQS)})`);
const calc = await ev(`${JSON.stringify(FREQS)}.map(f => getEQResponseDb(f, GlobalState.userEQProfile, 1))`);
const table = FREQS.map((f, i) => ({ hz: f, liveDb: r1(live[i]), calcDb: r1(calc[i]) }));
console.table(table);
ok(FREQS.every((f, i) => Math.abs(live[i] - calc[i]) < 0.15), '필터의 실제 주파수 응답이 계산식과 같음');

// 3) 실제 소리: 내 귀(1) − 원래 소리(0)의 대역별 차이. 음량 보정이 전체를 같이 움직이므로 저역과 고역의 차(기울기)로 봄
const RANGES = [[40, 120], [8000, 14000]];
const expectTilt = (await ev(`(() => { const p = GlobalState.userEQProfile; return getEQResponseDb(70, p, 1) - getEQResponseDb(10500, p, 1); })()`));
const sound = [];
for (let i = 0; i < 6; i++) {
  await ev(`selectTourPlace(${i})`); await sleep(2500);
  // 녹음은 계속 변하므로 내 귀 / 원래 소리를 짧게 번갈아 여러 번 재서 평균함
  const on = [0, 0], off = [0, 0], CYCLES = 8;
  for (let c = 0; c < CYCLES; c++) {
    await ev('setResultEqMix(1)'); await sleep(250); const a = await ev(`__eq.bands(${JSON.stringify(RANGES)}, 600)`);
    await ev('setResultEqMix(0)'); await sleep(250); const b = await ev(`__eq.bands(${JSON.stringify(RANGES)}, 600)`);
    a.forEach((v, k) => { on[k] += v / CYCLES; }); b.forEach((v, k) => { off[k] += v / CYCLES; });
  }
  const key = await ev('tourPlace().key');
  const tilt = (on[0] - off[0]) - (on[1] - off[1]);
  sound.push({ track: key, lowChangeDb: r1(on[0] - off[0]), highChangeDb: r1(on[1] - off[1]), tiltDb: r1(tilt), expectedTiltDb: r1(expectTilt) });
  ok(await ev('sampleSources[activeSourceKey].isPlaying()') && Math.abs(tilt - expectTilt) < 4, `소리 ${i + 1} (${key}): 저역↔고역 기울기가 EQ만큼 바뀜`, `${r1(tilt)} dB (예상 ${r1(expectTilt)})`);
}
console.table(sound);

// 4) 슬라이더와 빈 곳 누르기
await ev('setResultEqMix(0.5)'); await sleep(300);
const half = await ev('__eq.nodes()');
ok(Math.abs(half.low.db - PROFILE.lowDb / 2) < 0.01 && Math.abs(half.high.db - PROFILE.highDb / 2) < 0.01 && Math.abs(half.peak.db - 1.5) < 0.01, '슬라이더 가운데 = EQ 절반', JSON.stringify([half.low.db, half.peak.db, half.high.db]));
await ev('setResultEqMix(0)'); await sleep(300);
const zero = await ev('__eq.nodes()');
ok(zero.low.db === 0 && zero.high.db === 0 && zero.peak.db === 0 && Math.abs(zero.masterDb - PROFILE.volDb) < 0.1, "슬라이더 '원래 소리' = EQ 0 (① 볼륨은 그대로)");
await ev('setResultEqMix(1); setResultBypass(true)'); await sleep(300);
const hold = await ev('__eq.nodes()');
ok(hold.low.db === 0 && hold.high.db === 0 && hold.peak.db === 0, '빈 곳 누르는 동안 = EQ 0');
await ev('setResultEqMix(1)'); await sleep(300);

// 5) Part 2 결과를 크게 바꿔도 소리 쪽 값은 그대로인가
const before = JSON.stringify(await ev('__eq.nodes()')) + JSON.stringify(await ev(`__eq.response(${JSON.stringify(FREQS)})`));
await ev("Object.assign(GlobalState.psychoProfile, { maxFreqHz: 8000, centerDeg: 40, centerImage: 'L', dominantEar: 'LEFT', pitchMode: 'H', pitchIndex: 100 }); applyEQ()"); await sleep(400);
const after = JSON.stringify(await ev('__eq.nodes()')) + JSON.stringify(await ev(`__eq.response(${JSON.stringify(FREQS)})`));
ok(before === after, 'Part 2 결과(⑤⑥⑦⑧)는 필터·볼륨을 바꾸지 않음 (소리에 반영 안 됨)');

writeFileSync(`${OUT}/eq-apply.json`, JSON.stringify({ profile: PROFILE, nodes: n, response: table, sound, fails, errors }, null, 2));
console.log(fails.length || errors.length ? 'errors: ' + JSON.stringify([...fails, ...errors]) : 'errors: none');
process.exit(fails.length || errors.length ? 1 : 0);
