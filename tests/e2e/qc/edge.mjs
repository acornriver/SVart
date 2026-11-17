// 방치 리셋(모든 단계), 음성 끄기, 화면 크기 변화(주소창), 세로 화면
import { launch, visitor, sleep } from './lib.mjs';
const mode = process.argv[3];
const notes = [];
const note = (ok, text) => { notes.push((ok ? 'ok   ' : 'FAIL ') + text); console.log((ok ? '  ok   ' : '  FAIL ') + text); };
class Stop extends Error {}
const clean = (c) => c.ev(`(() => { const g = GlobalState, bad = [];
  if (g.currentStage !== 'INIT') bad.push('stage ' + g.currentStage);
  if (isBeatOn()) bad.push('beat'); if (voiceBusy()) bad.push('voice'); if (inputLocked()) bad.push('lock');
  if (backdropKey !== null) bad.push('backdrop'); if (!towerCard.hidden) bad.push('card'); if (!resultAction.hidden) bad.push('next-btn');
  if (MemeFX.busy() || document.querySelector('.meme-pop.on')) bad.push('meme'); if (g.part1.resultPhase !== null) bad.push('resultPhase');
  if (pointer) bad.push('pointer'); if (g.part2.voice) bad.push('p2voice');
  if (!document.querySelector('.intro:not(.started):not(.gone) .title-btn')) bad.push('intro hidden');
  return bad; })()`);

if (mode === 'idle') {
  const c = await launch(process.argv[2], {});
  const stages = ['PART1_VOLUME', 'PART1_LOW', 'PART1_HIGH', 'PART1_REGISTER', 'PART2_SENSITIVITY', 'PART2_CENTER', 'PART2_EAR', 'PART2_PITCH', 'RESULT_START', 'RESULT', 'MUSIC'];
  for (const s of stages) {
    const hooks = { [s]: async () => {
      if (s === 'MUSIC') { await c.tap((await c.targets()).tracks[4]); await sleep(300); }
      if (s === 'PART2_EAR') { const o = { x: c.w / 2, y: c.h * 0.45 }; await c.down(o); await c.move({ x: o.x + 80, y: o.y }); await c.up({ x: o.x + 80, y: o.y }); } // 덜 민 채로 떠남
      await c.ev('lastActivity -= (IDLE_RESET_SECONDS + 1) * 1000'); await c.stage('INIT', 3000); throw new Stop();
    } };
    try { await visitor(c, hooks); } catch (e) { if (!(e instanceof Stop)) throw e; }
    await sleep(400);
    const bad = await clean(c);
    await sleep(2500); // 늦게 도는 타이머(분석 화면 순서, 검사음)가 첫 화면을 건드리지 않는지
    const bad2 = await clean(c);
    const sound = await c.ev('(() => { const a = GlobalState.audioNodes.amplitude; return a ? a.getLevel() : 0; })()');
    note(!bad.length && !bad2.length, `${s}에서 2분 방치 → 첫 화면 (남은 것: ${[...bad, ...bad2].join(', ') || '없음'}, 2.5초 뒤 출력 레벨 ${sound.toFixed(4)})`);
  }
  // 누르고 있는 동안에는 방치로 치지 않음, 떼면 그때부터 다시 셈
  try { await visitor(c, { PART1_VOLUME: async () => {
    const p = (await c.targets()).snail; await c.down(p); await c.ev('lastActivity -= (IDLE_RESET_SECONDS + 1) * 1000'); await sleep(300);
    const s1 = await c.ev('GlobalState.currentStage'); await c.up(p); await sleep(300); const s2 = await c.ev('GlobalState.currentStage');
    note(s1 === 'PART1_VOLUME' && s2 === 'PART1_VOLUME', `손가락을 대고 있는 동안에는 방치 리셋 안 함 (${s1} → 뗀 뒤 ${s2})`);
    throw new Stop(); } }); } catch (e) { if (!(e instanceof Stop)) throw e; }
  await c.ev('restartFlow()'); await sleep(500);
  // 방치 뒤에도 다음 관람객이 끝까지 감
  await visitor(c); note(true, '방치 리셋 11번 뒤 다음 관람객 완주');
  console.log('errors:', c.errors.length ? c.errors : 'none'); c.close();
}

if (mode === 'voiceoff') {
  for (const lang of ['ko', 'en']) {
    const c = await launch(process.argv[2] + '-' + lang, { lang });
    await c.ev("document.querySelector('.intro .spk').click()");
    note(await c.ev('GlobalState.voiceOn === false'), `${lang}: 첫 화면에서 음성 끔`);
    let subtitles = 0, voiced = 0;
    const poll = setInterval(async () => { try { const r = await c.ev('({ line: voiceLine(), gain: voiceBus ? voiceBus.gain.value : 0 })'); if (r.line) subtitles++; if (r.gain > 0.001) voiced++; } catch {} }, 150);
    await visitor(c, { MUSIC: async () => { await c.shot('voiceoff-music'); }, PART1_LOW: async () => { await sleep(50); } });
    clearInterval(poll);
    note(subtitles > 20 && voiced === 0, `${lang}: 음성 끄고 완주. 자막 관측 ${subtitles}회, 음성 게인이 0보다 컸던 횟수 ${voiced}회`);
    await sleep(600);
    note(await c.ev('GlobalState.voiceOn === true && !document.querySelector(".intro .spk").classList.contains("muted")'), `${lang}: 다음 관람객에게는 음성이 다시 켜짐`);
    note(true, `${lang}: 다음 관람객의 첫 화면 언어 = ${await c.ev('GlobalState.lang')} (언어는 초기화하지 않음)`);
    console.log('errors:', c.errors.length ? c.errors : 'none'); c.close(); await sleep(500);
  }
}

if (mode === 'resize') {
  const c = await launch(process.argv[2], { touch: true });
  const set = (w, h) => c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
  const hooks = {};
  for (const s of ['PART1_VOLUME', 'PART1_LOW', 'PART1_HIGH', 'PART1_REGISTER', 'PART2_SENSITIVITY', 'PART2_CENTER', 'PART2_EAR', 'PART2_PITCH', 'RESULT', 'MUSIC', 'CARD']) hooks[s] = async () => {
    await set(1024, 704); await sleep(450); await c.shot('toolbar-' + s);
    const fit = await c.ev(`(() => { const t = getTouchTargets() || {}; const pts = [t.snail, ...(t.spots || []), ...(t.tracks || []), t.analysisNext].filter(Boolean); const cv = document.querySelector('canvas').getBoundingClientRect(); return { canvas: [Math.round(cv.width), Math.round(cv.height)], out: pts.filter(p => p.x < 0 || p.x > innerWidth || p.y < 0 || p.y > innerHeight).length, n: pts.length, inner: [innerWidth, innerHeight] }; })()`);
    note(fit.out === 0 && fit.canvas[1] === 704, `${s}: 주소창이 보이는 높이(1024×704)에서 조작 대상 ${fit.n}개가 화면 안, 캔버스 ${fit.canvas}`);
    if (s === 'PART1_HIGH') { // 세로로 돌리면 안내가 덮고 입력 무시
      await set(768, 1024); await sleep(450); await c.shot('portrait');
      const before = await c.ev('GlobalState.part1.control');
      const rot = await c.ev("getComputedStyle(document.querySelector('.rotate')).display + '/' + portraitBlocked()");
      await c.drag(0, -200, { x: 384, y: 600 });
      const after = await c.ev('GlobalState.part1.control');
      note(rot === 'flex/true' && before === after, `세로로 들면 회전 안내(${rot})가 덮고 쓸기 무시 (${before.toFixed(2)} → ${after.toFixed(2)})`);
      // 꾹 누르는 중에 돌리면 확정되지 않음
      await set(1024, 768); await sleep(400); await c.drag(0, -180); await c.until('canHoldConfirm()');
      const p = (await c.targets()).snail; await c.down(p); await sleep(400); await set(768, 1024); await sleep(900);
      const st = await c.ev('GlobalState.currentStage + "/" + (pointer && pointer.mode)'); await c.touchEv('touchEnd', []);
      note(st === 'PART1_HIGH/null', `꾹 누르는 중 세로로 돌리면 확정되지 않고 손가락을 놓은 것으로 침 (${st})`);
    }
    await set(1024, 768); await sleep(450);
    note(await c.ev("getComputedStyle(document.querySelector('.rotate')).display === 'none' && !portraitBlocked()"), `${s}: 가로로 돌아오면 안내가 사라짐`);
  };
  await visitor(c, hooks);
  console.log('errors:', c.errors.length ? c.errors : 'none'); c.close();
}
console.log('FAILS:', notes.filter(n => n.startsWith('FAIL')));
process.exit(0);
