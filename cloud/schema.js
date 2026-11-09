/** Canonical SVart -> Firestore ears contract. SVart is the source of truth. */
window.EarSchema = (() => {
  const VERSION = 2, CODE_VERSION = 2;
  const MIN_FREQ_HZ = 8000, MAX_FREQ_HZ = 20000;
  const ID_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;
  const numeric = (value, low, high, fallback = null) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(low, Math.min(high, value)) : fallback;
  const choice = (value, values) => values.includes(value) ? value : null;
  function profileFromResult(result) {
    const eq = result.userEQProfile || {}, psy = result.psychoProfile || {};
    const volume = typeof eq.masterVolume === 'number' && eq.masterVolume > 0 ? 20 * Math.log10(eq.masterVolume) : -40;
    return {
      volDb: numeric(volume, -40, 0, -40),
      lowDb: numeric(eq.lowShelf?.gain, -10, 10, 0),
      highDb: numeric(eq.highShelf?.gain, -10, 10, 0),
      register: choice(eq.registerPeak?.register, ['LOW', 'MID', 'HIGH']),
      maxFreqHz: numeric(psy.maxFreqHz, MIN_FREQ_HZ, MAX_FREQ_HZ),
      sensitivity: numeric(psy.sensitivity, 0, 100),
      twistAmount: numeric(psy.twist, 0, 1),
      centerDeg: numeric(psy.centerDeg, -180, 180),
      centerImage: choice(psy.centerImage, ['L', 'C', 'R']),
      dominantEar: choice(psy.dominantEar, ['LEFT', 'RIGHT']),
      earStrength: numeric(psy.earStrength, 0, 100),
      pitchMode: choice(psy.pitchMode, ['F', 'B', 'H']),
      pitchIndex: numeric(psy.pitchIndex, -100, 100)
    };
  }
  function profileCode(p) {
    return getFullEarCode({ masterVolume: 10 ** (p.volDb / 20), lowShelf: { gain: p.lowDb }, highShelf: { gain: p.highDb }, registerPeak: { register: p.register } }, {
      maxFreqHz: p.maxFreqHz, centerImage: p.centerImage, dominantEar: p.dominantEar, pitchMode: p.pitchMode
    });
  }
  function buildDoc(result, earId, { storeNames = false, seat = null, app = '2.0.0' } = {}) {
    if (!ID_PATTERN.test(earId)) throw new Error('Invalid earId');
    const profile = profileFromResult(result);
    return {
      v: VERSION, earId, codeVersion: CODE_VERSION, code: profileCode(profile), profile,
      name: storeNames && typeof result.name === 'string' ? result.name.trim().slice(0, 12) || null : null,
      lang: result.lang === 'en' ? 'en' : 'ko',
      seat: Number.isInteger(seat) && seat >= 1 && seat <= 6 ? seat : null,
      clientAt: typeof result.savedAt === 'number' && Number.isFinite(result.savedAt) ? Math.max(0, Math.floor(result.savedAt)) : Date.now(),
      hidden: false, app: String(app).slice(0, 20)
    };
  }
  return { VERSION, CODE_VERSION, MIN_FREQ_HZ, MAX_FREQ_HZ, ID_PATTERN, profileFromResult, profileCode, buildDoc };
})();
