import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { launch, sleep } from './qc/lib.mjs';
const out = process.argv[2];
const c = await launch(out, { fast: false, w: 1440, h: 1000 });
const until = async expression => {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await c.ev(expression)) return; await sleep(60); }
  throw new Error('Timeout: ' + expression);
};
try {
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await c.send('Page.navigate', { url: 'http://localhost:8765/resulttest' });
  await until('typeof ResultCopyCatalog !== "undefined" && document.querySelectorAll("#items li").length === 7');
  assert.equal(await c.ev('location.pathname'), '/resulttest/');
  assert.equal(await c.ev('document.querySelectorAll("#catalog-tables tbody tr").length'), 41);
  assert.equal(await c.ev('document.querySelectorAll("#rules tbody tr").length'), 9);
  await c.ev('document.fonts.ready');
  await c.shot('desktop');
  await c.ev(`document.querySelector('[data-lang="en"]').click()`);
  assert.equal(await c.ev('document.getElementById("title").textContent'), 'Your snail is deep');
  assert.equal(await c.ev('document.getElementById("result").lang'), 'en');
  await c.ev(`document.getElementById('lowDb').value=-4; document.getElementById('lowDb').dispatchEvent(new Event('input',{bubbles:true}));
    document.getElementById('highDb').value=4; document.getElementById('highDb').dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.equal(await c.ev('document.getElementById("title").textContent'), 'Your snail is bright');
  assert.equal(await c.ev('document.querySelector("#rules .current .id").textContent'), 'TONE_ES');
  await c.ev(`document.querySelector('[data-key="ear"][data-option=""]').click();
    document.querySelector('[data-key="pitch"][data-option=""]').click();
    document.querySelector('[data-key="register"][data-option=""]').click();
    document.getElementById('maxMeasured').click();document.getElementById('centerMeasured').click();`);
  assert.equal(await c.ev('document.querySelectorAll("#items li").length'), 2);
  assert.equal(await c.ev('document.querySelector("#items li button").dataset.item'), 'tone');
  assert.equal(await c.ev('document.querySelectorAll("#rules .current").length'), 5);
  assert.equal(await c.ev('document.getElementById("maxHz").disabled && document.getElementById("centerDeg").disabled'), true);
  await c.ev(`document.getElementById('search').value='left-handed'; document.getElementById('search').dispatchEvent(new Event('input'));`);
  assert.equal(await c.ev('document.querySelectorAll("#catalog-tables tbody tr").length'), 1);
  await c.ev(`document.getElementById('catalog').scrollIntoView()`);
  await c.shot('search-bilingual');
  await c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
  await c.ev('document.getElementById("download").click()');
  const file = out + '/result-copy-worksheet-2026-11-18.html';
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !existsSync(file)) await sleep(80);
  const downloaded = readFileSync(file, 'utf8');
  assert.equal((downloaded.match(/<tbody>/g) || []).length, 9);
  assert.equal((downloaded.match(/<b>확정안<\/b>/g) || []).length, 41);
  assert.ok(downloaded.includes('HEARING_16000') && downloaded.includes('{kHz}'));
  assert.ok(downloaded.includes('Your snail is quiet') && downloaded.includes('차분한 달팽이예요'));
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await c.ev('window.scrollTo(0,0)'); await sleep(150); await c.shot('mobile');
  assert.equal(await c.ev('document.documentElement.scrollWidth <= innerWidth'), true);
  await c.ev('document.getElementById("catalog").scrollIntoView()'); await c.shot('mobile-catalog');
  assert.equal(await c.ev('document.documentElement.scrollWidth <= innerWidth'), true);
  for (const path of ['/resulttest/guide.html', '/docs/result-copy-worksheet.md', '/docs/result-copy-guide.md']) {
    assert.equal((await fetch('http://localhost:8765' + path)).status, 200);
  }
  await c.send('Page.navigate', { url: 'http://localhost:8765/resulttest/guide.html' });
  await until('document.querySelectorAll("tbody tr").length === 41');
  await c.shot('mobile-guide');
  assert.equal(await c.ev('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.deepEqual(c.errors, []);
  console.log('✓ /resulttest redirect, 41 bilingual conditions, boundary/missing inputs, search, HTML download, document links, desktop/mobile layouts; errors: none');
} finally { c.close(); }
