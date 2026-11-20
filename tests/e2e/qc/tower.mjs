// SVartTower QC: 배포본(읽기 전용)과 로컬 가짜 데이터 모드. 운영 DB에는 쓰지 않음
// 사용: node tests/e2e/qc/tower.mjs <출력폴더> prod|mock|mobile-prod|mobile-local   (mock·mobile-local은 python3 scripts/serve-tower.py 먼저)
// mobile-prod는 같은 출력 폴더 상위의 prod/prod-ears.json(prod 실행 결과)에서 실제 ID를 읽음
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { browser, sleep } from './towerlib.mjs';
const OUT = process.argv[2], MODE = process.argv[3];
const PROD = 'https://acornriver.github.io/SVartTower/';
const LOCAL = 'http://localhost:8766/';
const notes = []; const note = (ok, t) => { notes.push((ok ? 'ok   ' : 'FAIL ') + t); console.log((ok ? '  ok   ' : '  FAIL ') + t); };

const towerState = `({ onTower: snails.filter(s => s.ear).length, all: snails.length, pool: earPool.length, queue: buildQueue.length, total: totalCount, feed: feedStarted, portals: typeof portals !== 'undefined' ? portals.length : null })`;

if (MODE === 'prod' || MODE === 'mock') {
  const b = await browser(OUT, { w: 1920, h: 1080 });
  const url = MODE === 'prod' ? PROD : LOCAL + '?mock=1&arrive=2';
  await b.go(url);
  note(await b.until("typeof snails !== 'undefined' && typeof feedStarted !== 'undefined' && feedStarted", 30000), `${MODE}: TV 화면이 뜨고 피드 시작`);
  await b.until("snails.filter(s => s.ear).length > 0", 30000);
  await sleep(4000);
  const s0 = await b.ev(towerState); console.log('  state', JSON.stringify(s0));
  note(s0.onTower > 0, `${MODE}: 타워에 달팽이 ${s0.onTower}마리 (대기 ${s0.pool}, 전체 ${s0.total})`);
  await b.shot(MODE + '-tv-start');
  const h0 = await b.heap(); const f0 = await b.fps();
  console.log('  heap', h0, 'MB fps', f0);
  // 장시간: 가짜 모드는 2초마다 도착 → 3분이면 약 90마리가 와서 무대 교체·최대 마릿수 한도를 넘김
  const minutes = MODE === 'mock' ? 3 : 1.5;
  const t0 = Date.now(); let maxAll = 0;
  while (Date.now() - t0 < minutes * 60000) { await sleep(10000); const s = await b.ev(towerState); maxAll = Math.max(maxAll, s.all); }
  const s1 = await b.ev(towerState); const h1 = await b.heap(); const f1 = await b.fps();
  console.log('  after', minutes, 'min', JSON.stringify(s1), 'heap', h1, 'fps', f1);
  note(maxAll <= 40, `${MODE}: 최대 마릿수 한도 지킴 (가장 많을 때 ${maxAll}, 한도 40)`);
  note(f1 >= 30, `${MODE}: ${minutes}분 뒤 프레임 ${f1}fps (시작 ${f0})`);
  note(h1 - h0 < 30, `${MODE}: ${minutes}분 동안 메모리 ${h0} → ${h1} MB`);
  await b.shot(MODE + '-tv-after');
  // 디버그 창과 키
  await b.ev("towerKey('d')"); await sleep(600); await b.shot(MODE + '-tv-debug'); await b.ev("towerKey('d')");
  if (MODE === 'prod') {
    const ids = await b.ev("snails.filter(s => s.ear).slice(0, 3).map(s => ({ id: s.ear.earId, code: s.ear.code, hue: s.ear.profile && s.ear.profile.hueDeg }))");
    writeFileSync(OUT + '/prod-ears.json', JSON.stringify(ids));
    console.log('  sample ears', JSON.stringify(ids));
  }
  note(!b.failed.length, `${MODE}: 실패한 요청 없음 ${JSON.stringify(b.failed.slice(0, 4))}`);
  console.log('warnings:', [...new Set(b.warnings)].slice(0, 5));
  console.log('errors:', b.errors.length ? b.errors.slice(0, 5) : 'none');
  b.close();
}

if (MODE === 'mobile-prod' || MODE === 'mobile-local') {
  const base = MODE === 'mobile-prod' ? PROD + 'mobile/' : LOCAL + 'mobile/?mock=1';
  const join = (q) => base + (base.includes('?') ? '&' : '?') + q;
  const b = await browser(OUT, { w: 390, h: 844, mobile: true, touch: true });
  const read = () => b.ev(`({ own: own && own.code, ownId: own && own.earId, hue: own && own.profile && own.profile.hueDeg, cards: gallery.size, status: document.getElementById('code-status').textContent, feed: document.getElementById('feed-status').textContent, play: !play.disabled, snails: typeof snails !== 'undefined' ? snails.length : null })`);
  // 1) 주소 없이
  await b.go(base); await b.until('gallery.size > 0', 20000); await sleep(1500);
  let r = await read(); console.log('  plain', JSON.stringify(r));
  note(r.cards > 0 && !r.own && r.snails > 0, `${MODE}: 주소 없이 열면 달팽이 목록 ${r.cards}개, 타워 ${r.snails}마리`);
  await b.shot('m1-plain');
  // 2) 코드 + 색상 (QR에서 전송이 안 된 경우)
  await b.go(join('code=' + encodeURIComponent('IWS-RLF(13.2k/6)') + '&hue=120')); await b.until('!!own', 10000); await sleep(800);
  r = await read(); console.log('  code+hue', JSON.stringify(r));
  note(r.own === 'IWS-RLF(13.2k/6)' && r.hue === 120 && r.play, `${MODE}: code+hue로 열면 내 달팽이(${r.own}, 색 ${r.hue})와 재생 버튼`);
  await b.shot('m2-code-hue');
  // 3) 잘못된 코드
  await b.go(join('code=XXX')); await sleep(2500); r = await read();
  note(!r.own, `${MODE}: 잘못된 코드는 무시 (${JSON.stringify(r.status)})`);
  // 4) 실제 ID (배포본: 타워 화면에서 읽어 둔 실제 문서)
  if (MODE === 'mobile-prod') {
    let ears = []; try { ears = JSON.parse(readFileSync(OUT + '/../prod/prod-ears.json', 'utf8')); } catch {}
    const e = ears.find(x => /^[A-Z0-9]{10}$/.test(x.id));
    if (e) {
      await b.go(join(`ear=${e.id}&code=${encodeURIComponent(e.code)}&hue=${Math.round(e.hue ?? 0)}`)); await b.until('!!own && !!own.earId', 15000); await sleep(800);
      r = await read(); console.log('  ear', JSON.stringify(r));
      note(r.ownId === e.id && r.own === e.code, `${MODE}: 실제 ID로 열면 DB에서 같은 결과를 불러옴 (${e.id} ${r.own}, 상태 "${r.status}")`);
      await b.shot('m4-real-ear');
    } else note(false, '타워 화면에서 실제 ID를 얻지 못함');
    // 없는 ID
    await b.go(join('ear=ZZZZZZZZZZ&code=' + encodeURIComponent('OWS-LLB(10.0k/4)'))); await sleep(5000); r = await read();
    note(r.own === 'OWS-LLB(10.0k/4)' && !r.ownId, `${MODE}: 없는 ID면 코드로 대신 그림 ("${r.status}")`);
  }
  // 5) 재생·곡 바꾸기·비교
  await b.go(join('code=' + encodeURIComponent('AWE-RRB(10.8k/9)'))); await b.until('!!own && gallery.size > 0', 15000); await sleep(800);
  await b.ev("play.click()"); await sleep(2500);
  const p1 = await b.ev("({ paused: player.paused, t: player.currentTime, src: player.getAttribute('src'), err: document.getElementById('audio-status').textContent })");
  note(!p1.paused && p1.t > 0.5, `${MODE}: 재생 버튼 → 소리 재생 (${p1.src}, ${p1.t.toFixed(1)}초, "${p1.err}")`);
  for (const tr of ['train-go', 'car-move', 'water']) {
    await b.ev(`(() => { const s = document.getElementById('track'); s.value = '${tr}'; s.dispatchEvent(new Event('change')); })()`); await sleep(1800);
    const p = await b.ev("({ paused: player.paused, t: player.currentTime, src: player.getAttribute('src') })");
    note(!p.paused && p.src.includes(tr) && p.t > 0.3, `${MODE}: 곡 '${tr}'로 바꿔도 계속 재생 (${p.t.toFixed(1)}초)`);
  }
  await b.ev("document.querySelector('#ears .ear-card:not([hidden])').click()"); await sleep(800);
  const c = await b.ev("({ side, sel: selected && selected.code, otherOn: document.getElementById('other-listening').getAttribute('aria-pressed'), mixOwn: comparison.chains ? comparison.chains.own.mix.gain.value : null, playing: !player.paused })");
  await sleep(500);
  const c2 = await b.ev("({ mixOwn: comparison.chains.own.mix.gain.value, mixOther: comparison.chains.other.mix.gain.value })");
  note(c.side === 'other' && !!c.sel && c.playing && c2.mixOther > 0.9 && c2.mixOwn < 0.1, `${MODE}: 다른 달팽이를 고르면 그 귀로 바뀌어 재생 (${c.sel}, 내 귀 ${c2.mixOwn.toFixed(2)} / 다른 귀 ${c2.mixOther.toFixed(2)})`);
  await b.ev("document.getElementById('own-listening').click()"); await sleep(600);
  const c3 = await b.ev("({ mixOwn: comparison.chains.own.mix.gain.value, mixOther: comparison.chains.other.mix.gain.value })");
  note(c3.mixOwn > 0.9 && c3.mixOther < 0.1, `${MODE}: '내 귀'로 돌아오기 (${c3.mixOwn.toFixed(2)} / ${c3.mixOther.toFixed(2)})`);
  await b.ev("play.click()"); await sleep(300); note(await b.ev('player.paused'), `${MODE}: 일시정지`);
  await b.ev("scrollTo(0, 0)"); await b.shot('m5-compare-top');
  const full = await b.ev('document.documentElement.scrollHeight'); console.log('  page height', full);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: Math.min(full, 4000), deviceScaleFactor: 1, mobile: true }); await sleep(800); await b.shot('m6-full');
  // 가로 넘침 확인
  const ow = await b.ev("[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.tagName + '#' + e.id + '.' + e.className).slice(0, 5)");
  note(!ow.length, `${MODE}: 가로로 넘치는 요소 없음 ${JSON.stringify(ow)}`);
  // 작은 휴대폰
  await b.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true }); await sleep(800);
  const ow2 = await b.ev("[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.tagName + '#' + e.id + '.' + e.className).slice(0, 5)");
  note(!ow2.length, `${MODE}: 320px 폭에서도 가로 넘침 없음 ${JSON.stringify(ow2)}`); await b.shot('m7-320');
  note(!b.failed.length, `${MODE}: 실패한 요청 없음 ${JSON.stringify(b.failed.slice(0, 4))}`);
  console.log('warnings:', [...new Set(b.warnings)].slice(0, 5));
  console.log('errors:', b.errors.length ? b.errors.slice(0, 5) : 'none');
  b.close();
}
console.log('FAILS:', notes.filter(n => n.startsWith('FAIL')));
process.exit(0);
