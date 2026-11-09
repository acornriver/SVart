/** Experimental accents. Only after committed choices / sending; never on individual answers.
 * Original SFX and edit manifest: source/sfx/memes/. Playback ignores the participant EQ.
 */
window.MemeFX = (() => {
  const cues = {
    size: { duration: .65, ko: ['크기 접수.', '이 정도가 딱이네'], en: ['SIZE LOCKED.', 'That feels right.'] },
    shell: { duration: 1.7, ko: ['껍질 착붙.', '제법 달팽이 같아졌는데?'], en: ['SHELL ACQUIRED.', 'Looking suspiciously snail-like.'] },
    reveal: { duration: 1.41, ko: ['나… 달팽이 됐다.', '내가 고른 소리로 완성'], en: ['WAIT. I’M A SNAIL.', 'Made from the sounds you chose.'] },
    depart: { duration: .87, ko: ['청감타워로 퇴근 ↗', '내 귀는 먼저 가볼게요'], en: ['OFF TO THE TOWER ↗', 'My ears are heading out.'] }
  };
  const buffers = {};
  const history = [];
  let loading, active = null, epoch = 0, transitioning = false, caption;

  function load() {
    if (loading) return loading;
    loading = Promise.all(Object.keys(cues).map(async key => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(`./media/sfx/memes/${key}.mp3`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          buffers[key] = await getAudioContext().decodeAudioData(await response.arrayBuffer());
          return;
        } catch { /* Missing accents must never prevent a visitor from continuing. */ }
      }
    }));
    return loading;
  }

  function show(key) {
    if (!caption) {
      caption = document.createElement('div');
      caption.className = 'meme-pop';
      caption.setAttribute('role', 'status');
      caption.setAttribute('aria-live', 'polite');
      document.body.appendChild(caption);
    }
    const [title, detail] = cues[key][currentLang()];
    const strong = document.createElement('strong'); strong.textContent = title;
    const small = document.createElement('span'); small.textContent = detail;
    caption.replaceChildren(strong, small);
    caption.dataset.cue = key;
    caption.classList.remove('on');
    void caption.offsetWidth;
    caption.classList.add('on');
  }

  function stop() {
    if (caption) caption.classList.remove('on');
    if (!active) return;
    const current = active; active = null;
    clearTimeout(current.timer);
    try { current.src?.stop(); current.src?.disconnect(); current.gain?.disconnect(); } catch { /* Already finished. */ }
    current.record.status = 'cancelled';
    current.resolve(false);
  }

  function cancel() { epoch++; transitioning = false; stop(); }
  function updateGain() {
    if (active?.gain) active.gain.gain.setTargetAtTime(voiceGain() * .8, getAudioContext().currentTime, .01);
  }

  function play(key) {
    stop();
    show(key);
    const record = { key, stage: GlobalState.currentStage, voice: voiceBusy(), source: activeSourceKey, status: 'playing', silent: !GlobalState.voiceOn, at: performance.now() };
    history.push(record);
    return new Promise(resolve => {
      const current = active = { resolve, record, src: null, gain: null, timer: null };
      try {
        if (buffers[key] && GlobalState.isAudioInitialized) {
          const ctx = getAudioContext();
          current.src = ctx.createBufferSource(); current.src.buffer = buffers[key];
          current.gain = ctx.createGain(); current.gain.gain.value = voiceGain() * .8;
          current.src.connect(current.gain); current.gain.connect(ctx.destination);
          current.src.start();
        }
      } catch { /* Caption and timeout still complete if audio is unavailable. */ }
      // Real-time deadline also completes while audio is suspended or a file is unavailable.
      current.timer = setTimeout(() => {
        if (active !== current) return;
        active = null;
        try { current.src?.stop(); current.src?.disconnect(); current.gain?.disconnect(); } catch { /* Already ended. */ }
        if (caption) caption.classList.remove('on');
        record.status = 'completed'; record.endedAt = performance.now();
        resolve(true);
      }, cues[key].duration * 1000 + 60);
    });
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
    hushVoice(); stopVoice(); registerPlayToken++; leavePart2();
    setActiveSource(null, .04);
    lockInput();
    const done = await play(key);
    if (!done || run !== epoch) return;
    transitioning = false;
    proceed(); // goToStep restores the next guide's normal lock lifecycle.
  }

  function depart() {
    hushVoice(); setActiveSource(null, .04);
    return play('depart');
  }

  return { load, cancel, transition, depart, cueFor, updateGain, history,
    ready: () => Object.keys(cues).every(key => !!buffers[key]),
    busy: () => transitioning || active !== null,
    activeKey: () => active?.record.key || null,
    gain: () => active?.gain?.gain.value ?? 0 };
})();
