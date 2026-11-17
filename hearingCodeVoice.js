/** Recorded, language-specific hearing-code spelling. No synthesized speech. */
const HearingCodeVoice = (() => {
  const letters = 'OAITEWVSLCRFBH';
  const cache = new Map();
  const loading = new Map();
  let active = null;

  function digitId(digit, lang) {
    if (lang === 'ko' && digit === '2') return 'letter_e';
    if (lang === 'ko' && digit === '5') return 'letter_o';
    return 'digit_' + digit;
  }

  function plan(code, lang) {
    if (lang !== 'ko' && lang !== 'en') throw new Error('Unsupported voice language');
    if (typeof code !== 'string') throw new Error('Invalid hearing code');
    const match = /^([OAI])([TEW])([VES])-([LCR])([LR])([FBH])\(((?:[89]|1[0-9]|20)\.[0-9])k\/([0-9])\)$/.exec(code.trim());
    if (!match || Math.round(Number(match[7]) * 10) > 200) throw new Error('Invalid hearing code');
    const ids = match.slice(1, 7).map(letter => 'letter_' + letter.toLowerCase());
    for (const character of match[7]) ids.push(character === '.' ? 'decimal_point' : digitId(character, lang));
    ids.push('kilohertz', digitId(match[8], lang));
    return ids.map((id, index) => {
      let gapMs = 80;
      if (index === 2) gapMs = 250;
      if (index === 5 || index === ids.length - 2) gapMs = 350;
      if (index === ids.length - 3) gapMs = 100;
      if (index === ids.length - 1) gapMs = 0;
      return { id, path: `media/voice/code-reading/${lang}/${id}.mp3`, gapMs };
    });
  }

  function assetIds(lang) {
    const digits = lang === 'ko' ? '01346789' : '0123456789';
    return [...letters.toLowerCase()].map(letter => 'letter_' + letter)
      .concat([...digits].map(digit => 'digit_' + digit), ['decimal_point', 'kilohertz']);
  }

  async function buffer(path) {
    if (cache.has(path)) return cache.get(path);
    if (loading.has(path)) return loading.get(path);
    const request = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(path, { signal: controller.signal });
        if (!response.ok) throw new Error(`Cannot load code voice: ${path}`);
        const decoded = await getAudioContext().decodeAudioData(await response.arrayBuffer());
        cache.set(path, decoded);
        return decoded;
      } finally {
        clearTimeout(timer);
        loading.delete(path);
      }
    })();
    loading.set(path, request);
    return request;
  }

  function load() {
    return Promise.allSettled(['ko', 'en'].flatMap(lang => assetIds(lang)
      .map(id => buffer(`media/voice/code-reading/${lang}/${id}.mp3`))));
  }

  function finish(request, completed) {
    if (active !== request) return;
    active = null;
    clearTimeout(request.timer);
    clearInterval(request.languageTimer);
    for (const source of request.sources) {
      source.onended = null;
      try { source.stop(); } catch (error) { /* Already ended. */ }
      source.disconnect();
    }
    setVoiceDuck(false);
    request.resolve(completed);
  }

  function stop() {
    if (active) finish(active, false);
  }

  async function schedule(request, units) {
    try {
      const buffers = await Promise.all(units.map(unit => buffer(unit.path)));
      if (active !== request) return;
      if (currentLang() !== request.lang || !window.GlobalState.isAudioInitialized) {
        finish(request, false);
        return;
      }
      const context = getAudioContext();
      let cursor = context.currentTime + .03;
      const bus = getVoiceBus();
      applyVoiceGain();
      setVoiceDuck(window.GlobalState.voiceOn);
      units.forEach((unit, index) => {
        const source = context.createBufferSource();
        source.buffer = buffers[index];
        source.connect(bus);
        request.sources.push(source);
        source.onended = () => {
          source.disconnect();
          if (index === units.length - 1) finish(request, true);
        };
        source.start(cursor);
        cursor += buffers[index].duration + unit.gapMs / 1000;
      });
      // Match ordinary guides' recovery when an audio context stops delivering ended events.
      request.timer = setTimeout(() => finish(request, false), (cursor - context.currentTime) * 1000 + 1500);
    } catch (error) {
      if (active === request) {
        console.warn('[code voice]', error.message);
        finish(request, false);
      }
    }
  }

  function play(code, lang = currentLang()) {
    hushVoice();
    let units;
    try { units = plan(code, lang); } catch (error) {
      console.warn('[code voice]', error.message);
      return Promise.resolve(false);
    }
    return new Promise(resolve => {
      const request = { lang, resolve, sources: [], timer: null, languageTimer: null };
      active = request;
      request.languageTimer = setInterval(() => {
        if (currentLang() !== lang) finish(request, false);
      }, 100);
      schedule(request, units);
    });
  }

  return { plan, assetIds, load, play, stop, busy: () => active !== null };
})();
