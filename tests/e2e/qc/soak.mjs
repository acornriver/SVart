// 관람객 N명을 한 페이지에서 연달아 돌려 메모리·오디오 노드·DOM이 쌓이는지와 다음 관람객에게 상태가 남는지 확인
import { launch, visitor, sleep } from './lib.mjs';
const OUT = process.argv[2], N = Number(process.argv[3] || 6);
const c = await launch(OUT, {});
const rows = []; let prevTypes = {};
const types = () => { const t = {}; for (const v of c.audio.live.values()) t[v] = (t[v] || 0) + 1; return t; };
const measure = async (label) => {
  await c.send('HeapProfiler.collectGarbage'); await sleep(300);
  const heap = (await c.send('Runtime.getHeapUsage')).result.usedSize;
  const dom = (await c.send('Memory.getDOMCounters')).result;
  const extra = await c.ev(`({ ctx: getAudioContext().state, fps: Math.round(frameRate()), videos: document.querySelectorAll('video').length, playing: [...document.querySelectorAll('video')].filter(v => !v.paused).length, els: document.querySelectorAll('*').length, timers: sendTimers.length })`);
  const row = { label, heapMB: +(heap / 1048576).toFixed(1), nodes: dom.nodes, listeners: dom.jsEventListeners, audioNodes: c.audio.nodes, audioCreated: c.audio.created, ...extra };
  rows.push(row); console.log(JSON.stringify(row));
};
await measure('start');
const codes = [];
for (let i = 1; i <= N; i++) {
  let hue;
  await visitor(c, {
    MUSIC: async (c) => {
      codes.push(await c.ev('EAR_RESULT.code')); hue = await c.ev('GlobalState.psychoProfile.hueStart');
      for (const k of [3, 1, 5, 0]) { await c.tap((await c.targets()).tracks[k]); await sleep(250); }
      const b = (await c.targets()).eqSlider; await c.tap({ x: b.x0 + (b.x1 - b.x0) * 0.3, y: b.y });
      const v = await c.ev('voiceSliderBox()'); await c.tap({ x: v.x0 + (v.x1 - v.x0) * 0.2, y: v.y });
    }
  });
  // 다음 관람객에게 남으면 안 되는 것
  const leak = await c.ev(`(() => { const g = GlobalState, p = g.userEQProfile, bad = [];
    if (p.lowShelf.gain || p.highShelf.gain || p.registerPeak.register !== null || p.registerPeak.gain) bad.push('eq');
    if (g.part1.eqMix !== 1 || g.part1.isBypassed) bad.push('eqMix');
    if (g.voiceLevel !== VOICE_LEVEL_START || !g.voiceOn) bad.push('voice ' + g.voiceLevel);
    if (g.psychoProfile.hueDeg !== null || g.psychoProfile.maxFreqHz !== null || g.psychoProfile.dominantEar !== null) bad.push('psycho');
    if (!towerCard.hidden || towerCardUrl) bad.push('card');
    if (isBeatOn() || voiceBusy() || inputLocked()) bad.push('audio/lock');
    if (backdropKey !== null) bad.push('backdrop');
    if (MemeFX.busy() || document.querySelector('.meme-pop.on')) bad.push('meme');
    if (sendTimers.length) bad.push('timers');
    return bad; })()`);
  if (leak.length) throw new Error(`visitor ${i} left state behind: ${leak}`);
  await sleep(1500); // 소리 페이드아웃이 끝날 시간
  await measure('after ' + i);
  { const t = types(), d = {}; for (const k of new Set([...Object.keys(t), ...Object.keys(prevTypes)])) if ((t[k] || 0) !== (prevTypes[k] || 0)) d[k] = (t[k] || 0) - (prevTypes[k] || 0); if (i > 1) console.log('  node diff', JSON.stringify(d)); if (i === 1) console.log('  types', JSON.stringify(Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 14))); prevTypes = t; }
  console.log('  hueStart', Math.round(hue), 'code', codes[i - 1]);
}
await c.shot('soak-end');
const first = rows[1], last = rows[rows.length - 1];
console.log('heap growth per visitor (MB):', ((last.heapMB - first.heapMB) / (N - 1)).toFixed(2), '| audio nodes', first.audioNodes, '→', last.audioNodes, '| DOM', first.nodes, '→', last.nodes, '| listeners', first.listeners, '→', last.listeners);
console.log('warnings:', [...new Set(c.warnings)].slice(0, 10));
console.log('errors:', c.errors.length ? c.errors : 'none');
c.close(); process.exit(c.errors.length ? 1 : 0);
