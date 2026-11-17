// Delivered intro at normal speed, including resize, mute, cancellation and touch/keyboard entry.
import assert from 'node:assert/strict';
import { launch, sleep } from './qc/lib.mjs';
const c = await launch(process.argv[2], { fast: false, touch: true });
try {
  await c.ev('document.fonts.ready');
  await c.ev(`const originalIntroStart = startFlow;
    startFlow = function(volumeDb) {
      const before = { radius:cur.R0, y:cur.groundY, stage:GlobalState.currentStage };
      originalIntroStart(volumeDb);
      const target = targetParams(calculateUILayout());
      window.__introBoundary = { before, target: {radius:target.R0, y:target.groundY} };
    };`);
  for (const lang of ['ko', 'en']) {
    await c.ev(`GlobalState.lang = '${lang}'; refreshIntroText();`);
    await c.shot('intro-' + lang + '-title');
    const title = await c.ev(`(() => { const r = intro.titleBtn.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await c.tap(title);
    await c.until("GlobalState.currentStage === 'NAMED' && IntroSequence.busy()");
    const began = Date.now();
    const first = await c.ev('({radius:cur.R0,y:cur.groundY,volume:GlobalState.userEQProfile.masterVolume})');
    assert.equal(await c.ev('voiceBusy() || isBeatOn()'), false);
    for (const [at, name] of [[600,'dots'], [1800,'helix'], [3600,'coil'], [4900,'body'], [6100,'antennae']]) {
      await sleep(Math.max(0, began + at - Date.now()));
      await c.shot('intro-' + lang + '-' + name);
    }
    const before = await c.ev('({radius:cur.R0,y:cur.groundY,volume:GlobalState.userEQProfile.masterVolume})');
    await c.until("GlobalState.currentStage === 'PART1_VOLUME'");
    assert.ok(Date.now() - began >= 6200);
    await c.shot('intro-' + lang + '-volume');
    const after = await c.ev('({radius:cur.R0,y:cur.groundY,volume:GlobalState.userEQProfile.masterVolume})');
    assert.equal(first.volume, after.volume);
    assert.equal(before.volume, after.volume);
    assert.ok(Math.abs(before.radius - after.radius) < .01);
    assert.ok(Math.abs(before.y - after.y) < .01);
    const boundary = await c.ev('__introBoundary');
    assert.equal(boundary.before.stage, 'NAMED');
    assert.ok(Math.abs(boundary.before.radius - boundary.target.radius) < .01);
    assert.ok(Math.abs(boundary.before.y - boundary.target.y) < .01);
    assert.equal(await c.ev('IntroSequence.busy()'), false);
    assert.equal(await c.ev("intro.wrap.classList.contains('gone')"), true);
    await c.ev('restartFlow()');
    await c.until("GlobalState.currentStage === 'INIT' && !intro.titleBtn.disabled");
    assert.equal(await c.ev("intro.wrap.querySelector('.dots').style.opacity"), '');
    console.log('✓', lang, 'touch entry, 6.55s morph, exact first-test position/size/volume');
  }
  await c.ev("setVoiceOn(false); intro.titleBtn.click();");
  await c.until('IntroSequence.busy()');
  await sleep(1500);
  assert.equal(await c.ev('voiceGain()'), 0);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 704, deviceScaleFactor: 1, mobile: true });
  await sleep(250);
  assert.equal(await c.ev('height'), 704);
  assert.ok(await c.ev('Number.isFinite(cur.R0) && cur.R0 > 0 && cur.groundY < height'));
  await c.shot('intro-muted-resized');
  await c.ev('restartFlow()');
  await sleep(6500);
  assert.equal(await c.ev('GlobalState.currentStage'), 'INIT');
  assert.equal(await c.ev('IntroSequence.busy() || voiceBusy() || isBeatOn()'), false);
  await c.until('!intro.titleBtn.disabled');
  await c.ev('intro.titleBtn.focus()');
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await c.until('IntroSequence.busy()');
  await c.until("GlobalState.currentStage === 'PART1_VOLUME'");
  assert.deepEqual(c.errors, []);
  console.log('✓ mute, resize, cancellation, next visit and keyboard entry; errors: none');
} finally { if(c.errors.length) console.log('browser errors',c.errors); c.close(); }
