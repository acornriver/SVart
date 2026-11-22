import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { launch, sleep } from './qc/lib.mjs';
const out = process.argv[2];
const appUrl = process.env.SVART_URL || 'http://localhost:8765/index.html';
const pageUrl = new URL('resulttest/', appUrl);
const c = await launch(out, { fast: false, w: 1440, h: 1000, url: appUrl });
const until = async expression => {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await c.ev(expression)) return; await sleep(60); }
  throw new Error('Timeout: ' + expression);
};
try {
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await c.send('Page.navigate', { url: pageUrl.href.replace(/\/$/, '') });
  await until('typeof ResultCopyCatalog !== "undefined" && document.querySelectorAll("#items li").length === 7');
  assert.equal(await c.ev('location.pathname'), pageUrl.pathname);
  assert.equal(await c.ev('document.querySelectorAll("#catalog-tables tbody tr").length'), 43);
  assert.equal(await c.ev('document.querySelectorAll("#rules tbody tr").length'), 9);
  await c.ev('document.fonts.ready');
  await c.shot('desktop');
  await c.ev(`document.querySelector('[data-lang="en"]').click()`);
  assert.equal(await c.ev('document.getElementById("title").textContent'), "You're a Hippo Snail!");
  assert.equal(await c.ev('document.getElementById("result").lang'), 'en');
  await c.ev(`document.getElementById('lowDb').value=-4; document.getElementById('lowDb').dispatchEvent(new Event('input',{bubbles:true}));
    document.getElementById('highDb').value=4; document.getElementById('highDb').dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.equal(await c.ev('document.getElementById("title").textContent'), "You're a Dolphin Snail!");
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
  const file = out + '/result-copy-worksheet-2026-11-18.html';
  rmSync(file, { force: true });
  await c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
  await c.ev('document.getElementById("download").click()');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !existsSync(file)) await sleep(80);
  const downloaded = readFileSync(file, 'utf8');
  assert.equal((downloaded.match(/<tbody>/g) || []).length, 9);
  assert.equal((downloaded.match(/<b>확정안<\/b>/g) || []).length, 43);
  assert.ok(downloaded.includes('HEARING_16000') && downloaded.includes('{kHz}'));
  assert.ok(downloaded.includes("You&#39;re a Sloth Snail!") && downloaded.includes('나무늘보 달팽이예요!') && downloaded.includes('ANIMAL_BAT'));
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await c.ev('window.scrollTo(0,0)'); await sleep(150); await c.shot('mobile');
  assert.equal(await c.ev('document.documentElement.scrollWidth <= innerWidth'), true);
  await c.ev('document.getElementById("catalog").scrollIntoView()'); await c.shot('mobile-catalog');
  assert.equal(await c.ev('document.documentElement.scrollWidth <= innerWidth'), true);
  for (const path of ['guide.html', '../docs/result-copy-worksheet.md', '../docs/result-copy-guide.md']) {
    assert.equal((await fetch(new URL(path, pageUrl))).status, 200);
  }
  await c.send('Page.navigate', { url: new URL('guide.html', pageUrl).href });
  await until('document.querySelectorAll("tbody tr").length === 43');
  await c.shot('mobile-guide');
  assert.equal(await c.ev('document.documentElement.scrollWidth <= innerWidth'), true);
  // 동물·행동 한 줄 미리보기 페이지: 앱과 같은 규칙으로 11가지·6가지
  await c.send('Page.navigate', { url: new URL('animal.html', pageUrl).href });
  await until('document.querySelectorAll("#animal-table tbody tr").length === 11 && document.querySelectorAll("#behaviour-table tbody tr").length === 6');
  assert.equal(await c.ev('document.getElementById("animal").textContent'), '하마 달팽이예요!');
  assert.equal(await c.ev('document.documentElement.scrollWidth <= innerWidth'), true);
  await c.shot('mobile-animal');
  assert.deepEqual(c.errors, []);
  console.log('✓ /resulttest redirect, 43 bilingual conditions, boundary/missing inputs, search, HTML download, document links, desktop/mobile layouts; errors: none');
} finally { c.close(); }
