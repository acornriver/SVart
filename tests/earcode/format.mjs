// Pure code-format checks; no browser or audio required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../earCode.js', import.meta.url), 'utf8') + '\nthis.api = { EAR_CODE, getEarCode, getFullEarCode, parseEarCode, digitToVolume, shelfToLetter };', ctx);
const { EAR_CODE, getEarCode, getFullEarCode, parseEarCode, digitToVolume, shelfToLetter } = ctx.api;
assert.equal(shelfToLetter(-10, 'LOW'), 'T');
assert.equal(shelfToLetter(0, 'LOW'), 'E');
assert.equal(shelfToLetter(10, 'LOW'), 'W');
assert.equal(shelfToLetter(-10, 'HIGH'), 'V');
assert.equal(shelfToLetter(0, 'HIGH'), 'E');
assert.equal(shelfToLetter(10, 'HIGH'), 'S');
let count = 0;
for (const reg of EAR_CODE.REGISTER) for (const low of 'TEW') for (const high of 'VES') for (let volume = 0; volume < 10; volume++) {
  const short = `${reg.letter}${low}${high}/${volume}`;
  const profile = parseEarCode(short);
  assert.equal(getEarCode(profile), short);
  for (const center of 'LCR') for (const ear of ['LEFT', 'RIGHT']) for (const pitch of 'FBH') {
    const psycho = { centerImage: center, dominantEar: ear, pitchMode: pitch, maxFreqHz: 13200 };
    const code = getFullEarCode(profile, psycho);
    assert.equal(code, `${reg.letter}${low}${high}-${center}${ear === 'LEFT' ? 'L' : 'R'}${pitch}(13.2k/${volume})`);
    const restored = parseEarCode(code);
    assert.ok(restored);
    assert.equal(getFullEarCode(restored, psycho), code);
    count++;
  }
}
const legacy = parseEarCode('IwS/6');
assert.equal(legacy.lowShelf.gain, 4);
assert.equal(legacy.masterVolume, digitToVolume(6));
assert.equal(parseEarCode('IWS-RLF(13.2k/6)').highShelf.gain, 8);
for (const invalid of ['IWS-RLF(13.2k/60)', 'IWS-RLF(abc/6)', 'xxx', 'IWS-RLF(13.2k/6)junk']) assert.equal(parseEarCode(invalid), null);
console.log(`${count} full code round trips passed; legacy codes remain readable.`);
