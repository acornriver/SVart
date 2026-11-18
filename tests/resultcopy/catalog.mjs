import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../', import.meta.url);
const context = vm.createContext({ window: { GlobalState: { lang: 'ko' } } });
for (const path of ['voiceMemesound.js', 'earCode.js', 'copy.js', 'resulttest/catalog.js']) {
  vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
}
const api = vm.runInContext('ResultCopyCatalog', context);
const rows = api.rows();
assert.equal(rows.length, 41);
assert.equal(new Set(rows.map(row => row.id)).size, 41);
assert.equal(rows.filter(row => row.group === 'title').length, 9);
assert.equal(rows.filter(row => row.group === 'missing').length, 5);
for (const row of rows) {
  assert.equal(typeof row.ko, 'string');
  assert.equal(typeof row.en, 'string');
  if (row.group !== 'missing') assert.ok(row.ko && row.en, row.id);
  if (row.group === 'hf') assert.ok(row.ko.includes('{kHz}') && row.en.includes('{kHz}'));
}
const source = readFileSync(new URL('part2_audio.js', root), 'utf8');
assert.equal(api.centerLimit, Number(/const CENTER_SIDE_DEG\s*=\s*(\d+)/.exec(source)[1]));
assert.equal(readFileSync(new URL('resulttest/guide.html', root), 'utf8'), api.documentHtml({ worksheet: false }), 'Regenerate guide using node scripts/export-result-copy.mjs');
assert.ok(api.documentHtml().includes('Final copy'));
assert.ok(!api.documentHtml({ worksheet: false }).includes('[작성]'));
let checked = 0;
for (let missing = 0; missing < 32; missing++) for (const lang of ['ko', 'en']) {
  const values = { ...api.defaults,
    ear: missing & 1 ? null : 'LEFT', maxMeasured: !(missing & 2), centerMeasured: !(missing & 4),
    register: missing & 8 ? null : 'LOW', pitch: missing & 16 ? null : 'H' };
  const result = api.analyse(values, lang);
  context.window.GlobalState.lang = lang;
  context.p = api.profile(values); context.ps = api.psycho(values);
  const expected = vm.runInContext('getSnailAnalysis(p,ps,"")', context);
  assert.equal(result.title, expected.title);
  assert.equal(JSON.stringify(Object.values(result.items)), JSON.stringify(expected.items));
  assert.equal(Object.keys(result.items).length, 7 - [...Array(5).keys()].filter(i => missing & (1 << i)).length);
  checked++;
}
for (const lowDb of [-4.001, -4, 3.999, 4]) for (const highDb of [-4.001, -4, 3.999, 4])
for (const volDb of [-26.01, -26, -25.99, -12.01, -12, -11.99])
for (const maxHz of [13999, 14000, 14999, 15000, 15999, 16000])
for (const centerDeg of [-5.001, -5, 5, 5.001]) for (const lang of ['ko', 'en']) {
  const values = { ...api.defaults, lowDb, highDb, volDb, maxHz, centerDeg };
  const result = api.analyse(values, lang);
  context.window.GlobalState.lang = lang;
  context.p = api.profile(values); context.ps = api.psycho(values);
  const expected = vm.runInContext('getSnailAnalysis(p,ps,"")', context);
  assert.equal(result.title, expected.title);
  assert.equal(JSON.stringify(Object.values(result.items)), JSON.stringify(expected.items));
  checked++;
}
console.log(`41 bilingual condition rows; ${checked} boundary/missing cases match actual app copy; static guide current.`);
