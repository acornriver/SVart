/** Caption edits happen only between committed choices, never during a listening trial.
 * Sound cuts: scripts/prepare-capcut-sfx.py, source/sfx/memes/capcut-edits.json.
 */
window.MemeFX = (() => {
  const cues = {
    size: { duration: 2, sounds: [['size', 0], ['sting', .28]], beats: [[.28, 'hit']],
      ko: ['크기', '접수', '이 정도가 딱.', '접수 완료'], en: ['SIZE', 'LOCKED', 'That’s the one.', 'LOCKED IN'] },
    shell: { duration: 2.65, sounds: [['gasp', 0], ['shell', .42]], beats: [[.42, 'hit']],
      ko: ['껍질', '착붙', '어머. 내 껍질이잖아?', '찰떡궁합'], en: ['SHELL', 'ACQUIRED', 'Oh. That’s my shell.', 'A PERFECT FIT'] },
    reveal: { duration: 3.4, sounds: [['roll', 0], ['fanfare', .8], ['clap', 1.45]], beats: [[.8, 'hit'], [1.45, 'encore']],
      ko: ['나…', '달팽이 됐다.', '인생 첫 달팽이 데뷔', '축  달팽이 탄생  하'], en: ['WAIT…', 'I’M A SNAIL.', 'My snail era starts now.', 'A SNAIL IS BORN'] }
  };
  const buffers = {}, history = [];
  let loading, active = null, epoch = 0, transitioning = false, caption;
  const soundKeys = [...new Set(Object.values(cues).flatMap(cue => cue.sounds.map(([key]) => key)))];

  function load() {
    if (loading) return loading;
    loading = Promise.all(soundKeys.map(async key => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(`./media/sfx/memes/${key}.mp3`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          buffers[key] = await getAudioContext().decodeAudioData(await response.arrayBuffer());
          return;
        } catch { /* Caption edits still finish if a sound is missing. */ }
      }
    }));
    return loading;
  }

  function textNode(tag, className, text) {
    const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
  }

  function show(key) {
    if (!caption) {
      caption = document.createElement('div'); caption.className = 'meme-pop';
      caption.setAttribute('role', 'status'); caption.setAttribute('aria-live', 'polite');
      document.body.appendChild(caption);
    }
    const [lead, finish, detail, stamp] = cues[key][currentLang()];
    caption.setAttribute('aria-label', `${lead} ${finish}. ${detail}`);
    const scene = document.createElement('div'); scene.className = 'meme-scene'; scene.setAttribute('aria-hidden', 'true');
    scene.append(textNode('span', 'meme-lead', lead), textNode('strong', 'meme-finish', finish),
      textNode('span', 'meme-detail', detail), textNode('span', 'meme-stamp', stamp));
    const decoration = document.createElement('div'); decoration.className = 'meme-decoration';
    decoration.setAttribute('aria-hidden', 'true');
    const marks = key === 'shell' ? ['♥', '♥', '♥', '♥', '♥', '♥', '♥', '♥']
      : key === 'reveal' ? [currentLang() === 'ko' ? '축' : '★', currentLang() === 'ko' ? '하' : '★', '✧', '✧'] : ['✦', '✦', '✧', '✧'];
    marks.forEach((text, i) => {
      const mark = textNode('i', 'meme-mark', text); mark.style.setProperty('--i', i); decoration.appendChild(mark);
    });
    caption.classList.remove('on');
    caption.replaceChildren(decoration, scene);
    caption.dataset.cue = key; caption.dataset.beat = 'setup'; caption.dataset.lang = currentLang();
    document.body.dataset.memeCue = key; document.body.dataset.memeBeat = 'setup';
    void caption.offsetWidth;
    caption.classList.add('on');
  }

  function clearPicture() {
    caption?.classList.remove('on');
    delete document.body.dataset.memeCue; delete document.body.dataset.memeBeat;
  }
  function dispose(current) {
    clearTimeout(current.timer); current.beatTimers.forEach(clearTimeout);
    current.sources.forEach(src => { try { src.stop(); src.disconnect(); } catch {} });
    try { current.gain?.disconnect(); } catch {}
  }
  function stop() {
    clearPicture();
    if (!active) return;
    const current = active; active = null; dispose(current);
    current.record.status = 'cancelled'; current.resolve(false);
  }
  function cancel() { epoch++; transitioning = false; stop(); }
  function updateGain() {
    if (active?.gain) active.gain.gain.setTargetAtTime(voiceGain(), getAudioContext().currentTime, .01);
  }
  function play(key) {
    stop(); show(key);
    const cue = cues[key];
    const record = { key, stage: GlobalState.currentStage, voice: voiceBusy(), source: activeSourceKey,
      status: 'playing', silent: !GlobalState.voiceOn, at: performance.now(), sounds: cue.sounds.map(([sound, at]) => ({sound, at})) };
    history.push(record);
    return new Promise(resolve => {
      const current = active = { resolve, record, sources: [], gain: null, timer: null, beatTimers: [] };
      try {
        if (GlobalState.isAudioInitialized) {
          const ctx = getAudioContext();
          current.gain = ctx.createGain(); current.gain.gain.value = voiceGain();
          current.gain.connect(AudioMix.bus('effects'));
          const start = ctx.currentTime;
          cue.sounds.forEach(([sound, at]) => {
            if (!buffers[sound]) return;
            const src = ctx.createBufferSource(); src.buffer = buffers[sound]; src.connect(current.gain);
            current.sources.push(src); src.start(start + at);
          });
        }
      } catch { /* Real-time visual cuts and the deadline do not depend on audio. */ }
      cue.beats.forEach(([at, beat]) => current.beatTimers.push(setTimeout(() => {
        if (active !== current) return;
        caption.dataset.beat = beat; document.body.dataset.memeBeat = beat;
      }, at * 1000)));
      current.timer = setTimeout(() => {
        if (active !== current) return;
        active = null; dispose(current); clearPicture();
        record.status = 'completed'; record.endedAt = performance.now(); resolve(true);
      }, cue.duration * 1000 + 60);
    });
  }
  // 장면 없이 효과음 하나만 (분석 화면의 드럼롤·짜잔). 안내 음량 슬라이더를 따름
  function sound(key) {
    if (!buffers[key] || !GlobalState.isAudioInitialized) return;
    try {
      const ctx = getAudioContext(), gain = ctx.createGain(), src = ctx.createBufferSource();
      gain.gain.value = voiceGain(); gain.connect(AudioMix.bus('effects'));
      src.buffer = buffers[key]; src.connect(gain); src.onended = () => { try { gain.disconnect(); } catch {} };
      src.start();
    } catch { /* 소리가 없어도 화면은 진행 */ }
  }
  function cueFor(stage, next) {
    if (next === 'RESULT') return 'reveal';
    if (stage === 'PART1_VOLUME') return 'size';
    if (stage === 'PART1_REGISTER') return 'shell';
    return null;
  }
  async function transition(key, proceed) {
    if (transitioning) return;
    transitioning = true;
    const run = ++epoch;
    hushVoice(); stopVoice(); registerPlayToken++; leavePart2(); setActiveSource(null, .04); lockInput();
    const done = await play(key);
    if (!done || run !== epoch) return;
    transitioning = false; proceed();
  }
  return { load, cancel, transition, cueFor, sound, updateGain, history,
    ready: () => soundKeys.every(key => !!buffers[key]), busy: () => transitioning || active !== null,
    activeKey: () => active?.record.key || null, gain: () => active?.gain?.gain.value ?? 0 };
})();
