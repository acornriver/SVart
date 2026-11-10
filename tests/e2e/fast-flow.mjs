// Test-browser-only acceleration. No production files, global clock, or gesture thresholds are changed.
// This checks interaction/state transitions, not sound quality or real-time audio scheduling.
function installFastMode() {
  const rate = 8;
  const state = window.__fastFlow = { rate, voices: [], buffers: [], melodies: [] };
  const originalLine = nextVoiceLine;
  nextVoiceLine = function (run) {
    if (run !== voiceRun) return;
    originalLine(run);
    if (voiceNow === null) return;
    state.voices.push({ stage: GlobalState.currentStage, id: voiceNow });
    const clip = voiceClips[currentLang()][voiceNow];
    const duration = clip ? clip.duration * 1000 : voiceText(voiceNow).length * VOICE_FALLBACK_SEC * 1000;
    clearTimeout(voiceTimer);
    if (voiceSrc) voiceSrc.playbackRate.value = rate;
    voiceTimer = setTimeout(() => nextVoiceLine(run), Math.max(80, (duration + VOICE_GAP_MS) / rate));
  };
  const originalPlay = p2Play;
  p2Play = function (buffer) {
    state.buffers.push({ stage: GlobalState.currentStage, phase: part2State().phase });
    const handle = originalPlay(buffer);
    handle.src.playbackRate.value = rate; // Keep the real onended event and normal scoring path.
    return handle;
  };
  const originalWait = wait;
  wait = (ms) => originalWait(ms / rate); // Register melody presentation/replay waits only.
  const originalRegister = playRegister;
  playRegister = function (id) { state.melodies.push(id); return originalRegister(id); };
  const originalLater = part2Later;
  part2Later = (ms, fn) => originalLater(ms / rate, fn);
  const originalUnlock = unlockInput;
  unlockInput = (ms = INPUT_UNLOCK_MS) => originalUnlock(ms / rate);
  const originalSend = sendToTower;
  sendToTower = function () {
    // Only the two synchronous send/reset timers are shortened. Never scale the global clock.
    const nativeTimeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => nativeTimeout(fn, ms / rate, ...args);
    try { return originalSend(); } finally { window.setTimeout = nativeTimeout; }
  };
  const badge = document.createElement('div');
  badge.textContent = 'FAST TEST ×8 · 청취 검증 제외';
  badge.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:99;pointer-events:none;color:#ff3b1f;background:#000;font:11px monospace;padding:3px 8px';
  document.body.appendChild(badge);
}

export async function runFastFlow({ send, ev, shot, lang }) {
  const started = Date.now();
  const timeline = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const check = async (expr, message) => {
    if (!(await ev(expr))) throw new Error(message + ': ' + expr);
  };
  const until = async (expr, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await ev(expr)) return;
      await sleep(30);
    }
    throw new Error('fast flow timeout: ' + expr + '; state=' + JSON.stringify(await ev('({stage: GlobalState.currentStage, phase: GlobalState.part2.phase, voice: voiceNow})')));
  };
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...(type === 'mouseMoved' ? { buttons: 1 } : {}) });
  const tap = async (point) => { await mouse('mousePressed', point.x, point.y); await sleep(35); await mouse('mouseReleased', point.x, point.y); await sleep(40); };
  const targets = () => ev('getTouchTargets()');
  const drag = async (dx, dy, origin = { x: 372, y: 500 }) => {
    await mouse('mousePressed', origin.x, origin.y);
    for (let k = 1; k <= 10; k++) { await mouse('mouseMoved', origin.x + dx * k / 10, origin.y + dy * k / 10); await sleep(8); }
    await check('cur.face === 1 && bodyShape().face === 1', 'Snail turned away from the right during a drag');
    await mouse('mouseReleased', origin.x + dx, origin.y + dy);
    await sleep(60);
  };
  const hold = async () => {
    const p = (await targets()).snail;
    await mouse('mousePressed', p.x, p.y);
    await sleep(1100); // The real 900ms threshold is deliberately preserved.
    await mouse('mouseReleased', p.x, p.y);
    await sleep(40);
  };
  const stage = async (name) => {
    await until(`GlobalState.currentStage === '${name}'`);
    const seconds = +((Date.now() - started) / 1000).toFixed(1);
    timeline.push({ stage: name, seconds });
    console.log(`✓ ${name} (${seconds}s)`);
  };
  const ready = () => until('!inputLocked() && !voiceBusy()');
  const confirm = async () => {
    await until('canHoldConfirm()'); await hold();
    const cue = await ev('MemeFX.activeKey()');
    if (cue) await shot('fast-meme-' + cue);
  };

  await until("typeof setupIntro === 'function' && !!document.querySelector('.intro .title-btn') && !!document.querySelector('canvas')", 20000);
  await ev(`GlobalState.lang = ${JSON.stringify(lang)}; refreshIntroText()`);
  await until("voiceIds(currentLang()).filter(id => !VOICE_PENDING[currentLang()].includes(id)).every(id => !!voiceClips[currentLang()][id])", 20000);
  await ev(`(${installFastMode.toString()})()`);
  await stage('INIT');
  await until('MemeFX.ready()');
  await shot('fast-00-intro');
  await ev("document.querySelector('.intro .title-btn').click()");
  await stage('PART1_VOLUME');
  await check('inputLocked() && voiceBusy()', 'Intro must lock gestures');
  const value = await ev('GlobalState.part1.control');
  await drag(0, -150);
  await check(`GlobalState.part1.control === ${value}`, 'Swipe during guide changed the value');
  await ready();
  await hold();
  await check("GlobalState.currentStage === 'PART1_VOLUME'", 'Hold before adjustment advanced the stage');
  await shot('fast-01-volume-ready');
  await drag(0, -220);
  await confirm();

  for (const name of ['PART1_LOW', 'PART1_HIGH']) {
    await stage(name); await ready(); await drag(0, -220); await confirm();
  }
  await stage('PART1_REGISTER');
  await ready();
  await check('!GlobalState.part1.register.isAutoPlaying', 'Register guide unlocked before melody sequence ended');
  await check("JSON.stringify(registerLetters()) === JSON.stringify(['A','B','C'])", 'Wrong register layout labels');
  await check(`JSON.stringify(__fastFlow.melodies.slice(0, 3)) === '${JSON.stringify(['MID', 'LOW', 'HIGH'])}'`, 'Wrong initial melody order');
  await tap((await targets()).spots[2]);
  await until('GlobalState.part1.register.playingCard < 0');
  await shot('fast-04-register');
  await confirm();

  await stage('PART2_SENSITIVITY'); await ready();
  await hold();
  await check("GlobalState.currentStage === 'PART2_SENSITIVITY'", 'Sensitivity confirmed without adjustment');
  await drag(220, 0);
  await check("GlobalState.currentStage === 'PART2_SENSITIVITY' && GlobalState.part2.phase === 'adjusting'", 'Sensitivity confirmed on release');
  await confirm();
  await stage('PART2_CENTER');
  for (let i = 0; i < 2; i++) {
    await until("GlobalState.part2.phase === 'adjusting'");
    await drag(i ? -180 : 150, 0); await confirm();
  }

  await stage('PART2_EAR');
  for (let i = 1; i <= 3; i++) {
    await until(`GlobalState.part2.phase === 'answer' && GlobalState.part2.trial.index === ${i}`);
    if (i === 1) {
      await shot('fast-07-ear');
      await drag(45, 0);
      await check("GlobalState.part2.phase === 'answer' && GlobalState.part2.trial.index === 1", 'Small drag answered the ear trial');
      await sleep(350); // Let the released snail/feelers settle before sampling the touch target.
      const replayTargets = await targets();
      const antenna = replayTargets.antenna;
      const visible = antenna && antenna.x > 20 && antenna.x < 724 && antenna.y > 20 && antenna.y < 1113;
      await tap(visible ? antenna : replayTargets.snail);
      await check('GlobalState.part2.replayLeft === 0', 'Replay was not consumed');
      await until("GlobalState.part2.phase === 'answer'");
    }
    await drag(i === 2 ? 250 : -250, 0);
  }
  await stage('PART2_PITCH');
  for (let i = 1; i <= 6; i++) {
    await until(`GlobalState.part2.phase === 'answer' && GlobalState.part2.trial.index === ${i}`);
    if (i === 1) await shot('fast-08-pitch');
    const order = await ev('GlobalState.part2.trial.order');
    const direction = (order === 'AB' ? -1 : 1) * (i === 4 ? -1 : 1);
    await drag(direction * 250, 0);
  }
  await until("MemeFX.activeKey() === 'reveal'");
  await sleep(180); await shot('fast-meme-reveal');
  await stage('RESULT');
  await check('GlobalState.psychoProfile.raw.center.validN === 2 && GlobalState.psychoProfile.raw.octave.answers.length === 3 && GlobalState.psychoProfile.raw.f0.answers.length === 6', 'Wrong trial counts');
  await check("!!window.EAR_RESULT && !!localStorage.getItem('svart.earProfile')", 'Result was not saved');
  await ready();
  await check("__fastFlow.voices.every(x => x.id.startsWith('m'))", 'Legacy guide played');
  await check("JSON.stringify(__fastFlow.voices.filter(x => x.stage === 'PART2_CENTER').map(x => x.id)) === JSON.stringify(['m5-5','m6-1','m6-2','m6-4','m6-3'])", 'Wrong center guide order');
  await check("!__fastFlow.buffers.some(x => x.phase === 'example')", 'Unexpected legacy example');
  await check("JSON.stringify(__fastFlow.voices.filter(x => x.stage === 'RESULT').map(x => x.id)) === JSON.stringify(['m9-1','m9-2'])", 'Wrong result guides');
  await shot('fast-09-analysis');
  await send('Emulation.setDeviceMetricsOverride', { width: 1133, height: 744, deviceScaleFactor: 1, mobile: false });
  await sleep(500); await shot('fast-09-analysis-landscape');
  await send('Emulation.setDeviceMetricsOverride', { width: 744, height: 1133, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await confirm(); await stage('MUSIC'); await ready();
  await check("__fastFlow.voices.some(x => x.stage === 'MUSIC' && x.id === 'm9-3')", 'Missing music guide');
  for (const i of [2, 0, 1]) {
    await tap((await targets()).tracks[i]);
    await check(`GlobalState.tour.index === ${i} && GlobalState.tour.pinned`, 'Track selection failed');
    await until('Math.abs(cur.cx - targetParams(calculateUILayout()).cx) < 3');
  }
  await shot('fast-10-music');
  await send('Emulation.setDeviceMetricsOverride', { width: 1133, height: 744, deviceScaleFactor: 1, mobile: false });
  await sleep(500); await shot('fast-10-music-landscape');
  await send('Emulation.setDeviceMetricsOverride', { width: 744, height: 1133, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const b = (await targets()).eqSlider;
  await tap({ x: b.x0 + (b.x1 - b.x0) * 0.25, y: b.y });
  await check('Math.abs(GlobalState.part1.eqMix - 0.25) < 0.02', 'EQ slider did not respond');
  const p = (await targets()).snail;
  await drag(744 * 0.25, 0, p);
  await check('GlobalState.tour.sendAt !== null', 'Snail did not send');
  await stage('INIT');
  await until("!!document.querySelector('.intro:not(.started):not(.gone) .title-btn')"); // Wait for the next draw to show the intro before the next visitor clicks.
  await ev("document.querySelector('.intro .title-btn').click()");
  await stage('PART1_VOLUME');
  await ev('lastActivity -= (IDLE_RESET_SECONDS + 1) * 1000');
  await stage('INIT');
  await check('!isBeatOn() && !voiceBusy() && !inputLocked()', 'Idle reset did not stop audio/guides');
  await check("JSON.stringify(MemeFX.history.map(x => x.key)) === JSON.stringify(['size','shell','reveal'])", 'Wrong meme cue order');
  await check('MemeFX.history.every(x => !x.voice && x.source === null)', 'Meme SFX overlapped a guide or inspection source');
  await check('!MemeFX.busy() && !document.querySelector(".meme-pop.on")', 'Meme SFX/caption leaked after reset');
  const seconds = +((Date.now() - started) / 1000).toFixed(1);
  console.log(`FAST ×8 finished in ${seconds}s (real-time listening not tested)`);
  return { mode: 'fast', rate: 8, language: lang, seconds, timeline, realTimeAudioVerified: false };
}
