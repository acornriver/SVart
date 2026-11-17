// Exhaustive spelling-plan regression, including language aliases and supplied assets.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../hearingCodeVoice.js', import.meta.url), 'utf8') + '\nthis.api = HearingCodeVoice;', context);
const { plan, assetIds } = context.api;
const root = new URL('../../', import.meta.url);
for (const lang of ['ko', 'en']) {
  assert.equal(assetIds(lang).length, lang === 'ko' ? 24 : 26);
  for (const id of assetIds(lang)) assert.ok(existsSync(new URL(`media/voice/code-reading/${lang}/${id}.mp3`, root)));
}
let count = 0;
for (const a of 'OAI') for (const b of 'TEW') for (const c of 'VES')
for (const d of 'LCR') for (const e of 'LR') for (const f of 'FBH')
for (let tenth = 80; tenth <= 200; tenth++) for (let volume = 0; volume <= 9; volume++) {
  const frequency = (tenth / 10).toFixed(1);
  const code = `${a}${b}${c}-${d}${e}${f}(${frequency}k/${volume})`;
  for (const lang of ['ko', 'en']) {
    const units = plan(code, lang);
    const digit = value => lang === 'ko' && (value === '2' || value === '5') ? 'letter_' + (value === '2' ? 'e' : 'o') : 'digit_' + value;
    const expected = [...`${a}${b}${c}${d}${e}${f}`].map(letter => 'letter_' + letter.toLowerCase())
      .concat([...frequency].map(value => value === '.' ? 'decimal_point' : digit(value)), 'kilohertz', digit(String(volume)));
    assert.equal(units.map(unit => unit.id).join(','), expected.join(','));
    assert.equal(units[2].gapMs, 250);
    assert.equal(units[5].gapMs, 350);
    assert.equal(units.at(-3).gapMs, 100);
    assert.equal(units.at(-2).gapMs, 350);
    assert.equal(units.at(-1).gapMs, 0);
    assert.ok(units.every(unit => unit.path === `media/voice/code-reading/${lang}/${unit.id}.mp3`));
    count++;
  }
}
for (const code of ['IWS-RLF(20.1k/6)', 'IWS-RLF(7.9k/6)', 'IWS-RLF(13.25k/6)', 'IWS-RLF(13.2k/10)', 'IWS-RLF(13.2/6)', 'XWS-RLF(13.2k/6)', 'IWS- RLF(13.2k/6)', 'IWS-RLF(08.0k/6)', 'IWS-·LF(13.2k/6)', 'IWS-RLF(–k/6)', null]) {
  assert.throws(() => plan(code, 'ko'));
}
assert.throws(() => plan('IWS-RLF(13.2k/6)', 'ja'));
assert.equal(plan(' \nIWS-RLF(13.2k/6)\n', 'ko')[0].id, 'letter_i');
console.log(`${count} language-specific plans passed (588060 codes × 2); 50 assets present.`);

// A failed or superseded preload must never start a partial spelling sequence.
function playerHarness() {
  const requests = [];
  const starts = [];
  const state = { lang: 'ko', voiceOn: true, isAudioInitialized: true };
  const audio = {
    currentTime: 0,
    decodeAudioData: async () => ({ duration: .1 }),
    createBufferSource: () => ({ connect() {}, disconnect() {}, stop() {}, start(at) { starts.push(at); } })
  };
  const env = vm.createContext({
    console: { warn() {} }, window: { GlobalState: state },
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController,
    currentLang: () => state.lang, getAudioContext: () => audio,
    getVoiceBus: () => ({}), applyVoiceGain() {}, setVoiceDuck() {},
    fetch: path => new Promise(resolve => requests.push({ path, resolve })),
    hushVoice: () => env.api.stop()
  });
  vm.runInContext(readFileSync(new URL('../../hearingCodeVoice.js', import.meta.url), 'utf8') + '\nthis.api = HearingCodeVoice;', env);
  return { api: env.api, starts, requests };
}
{
  const { api, starts, requests } = playerHarness();
  const played = api.play('IWS-RLF(13.2k/6)', 'ko');
  requests.forEach((request, index) => request.resolve({ ok: index !== requests.length - 1, arrayBuffer: async () => new ArrayBuffer(1) }));
  assert.equal(await played, false);
  assert.equal(starts.length, 0);
  assert.equal(api.busy(), false);
}
{
  const { api, starts, requests } = playerHarness();
  const first = api.play('IWS-RLF(13.2k/6)', 'ko');
  const second = api.play('AEE-CRB(10.0k/2)', 'ko');
  assert.equal(await first, false);
  api.stop();
  assert.equal(await second, false);
  requests.forEach(request => request.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(starts.length, 0);
}
console.log('Missing assets and cancellation during shared preloading passed.');
