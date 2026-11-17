// Normal-speed code voice scheduling and cancellation in the actual app/audio graph.
import assert from 'node:assert/strict';
import { launch, sleep } from './qc/lib.mjs';
const c = await launch(process.argv[2], { fast: false });
try {
  await c.ev('initAudio(); hushVoice();');
  await c.ev(`window.__codeStarts = []; window.__codeStops = [];
    const originalSource = getAudioContext().createBufferSource.bind(getAudioContext());
    getAudioContext().createBufferSource = function() {
      const source = originalSource();
      const start = source.start.bind(source), stop = source.stop.bind(source);
      source.start = function(at) { __codeStarts.push({at, duration: source.buffer.duration}); return start(at); };
      source.stop = function() { __codeStops.push(true); return stop(); };
      return source;
    };`);
  for (const lang of ['ko', 'en']) for (const code of ['IWS-RLF(13.2k/6)', 'OTV-LLF(8.0k/0)', 'IWS-RRH(20.0k/9)', 'AEE-CRB(10.0k/2)']) {
    await c.ev(`GlobalState.lang = '${lang}'; __codeStarts = [];`);
    const began = Date.now();
    assert.equal(await c.ev(`HearingCodeVoice.play(${JSON.stringify(code)}, '${lang}')`), true);
    const data = await c.ev(`({ starts: __codeStarts, plan: HearingCodeVoice.plan(${JSON.stringify(code)}, '${lang}'), busy: voiceBusy() })`);
    assert.equal(data.busy, false);
    assert.equal(data.starts.length, data.plan.length);
    for (let i = 1; i < data.starts.length; i++) {
      const previous = data.starts[i - 1];
      assert.ok(Math.abs(data.starts[i].at - previous.at - previous.duration - data.plan[i - 1].gapMs / 1000) < .00001);
    }
    const duration = data.starts.at(-1).at + data.starts.at(-1).duration - data.starts[0].at;
    assert.ok(Math.abs((Date.now() - began) / 1000 - duration) < .7);
    console.log('✓ normal-speed', lang, code, duration.toFixed(2) + 's');
  }
  await c.ev(`GlobalState.lang = 'ko'; window.__first = HearingCodeVoice.play('IWS-RLF(13.2k/6)', 'ko'); void 0;`);
  await sleep(180);
  await c.ev(`window.__second = HearingCodeVoice.play('AEE-CRB(10.0k/2)', 'ko'); void 0;`);
  assert.equal(await c.ev('__first'), false);
  await c.ev('hushVoice()');
  assert.equal(await c.ev('__second'), false);
  assert.equal(await c.ev('__codeStops.length > 0'), true);
  assert.equal(await c.ev('voiceBusy()'), false);
  await c.ev(`window.__language = HearingCodeVoice.play('IWS-RLF(13.2k/6)', 'ko'); GlobalState.lang = 'en';`);
  assert.equal(await c.ev('__language'), false);
  await c.ev('setVoiceOn(false)');
  await sleep(200); // The shared voice bus uses a 10 ms gain ramp.
  await c.ev(`__codeStarts = []; window.__muted = HearingCodeVoice.play('IWS-RLF(13.2k/6)', 'en'); void 0;`);
  await c.until('__codeStarts.length > 0');
  await sleep(100); // Read the effective gain after the render thread applies automation.
  assert.equal(await c.ev('voiceGain() === 0 && voiceBus.gain.value < .00001'), true);
  await c.ev('hushVoice(); setVoiceOn(true);');
  assert.equal(await c.ev('__muted'), false);
  await c.ev(`window.__reset = HearingCodeVoice.play('IWS-RLF(13.2k/6)', 'en'); restartFlow();`);
  assert.equal(await c.ev('__reset'), false);
  await c.ev(`window.__exit = HearingCodeVoice.play('IWS-RLF(13.2k/6)', 'en'); goToStep(0);`);
  assert.equal(await c.ev('__exit'), false);
  await c.ev('hushVoice()');
  assert.equal(await c.ev('voiceBusy()'), false);
  assert.deepEqual(c.errors, []);
  console.log('✓ replacement, language change, mute, reset and stage exit; errors: none');
} finally { c.close(); }
