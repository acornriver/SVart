// 두 레포를 잇는 끝-끝 확인 (로컬 에뮬레이터 8181만 씀, 운영 DB에는 쓰지 않음)
// SVart 관람객이 보내기 → 이미 열려 있던 타워 TV에 포탈로 도착 → QR 주소로 연 모바일에서 같은 결과·색
// 준비: SVart 서버 8765(python3 scripts/serve.py), SVartTower 서버 8766(python3 scripts/serve-tower.py), 에뮬레이터 8181
// 실행: node tests/e2e/qc/cross.mjs <출력폴더> [ko|en]
import { launch, visitor, sleep } from './lib.mjs';
import { browser } from './towerlib.mjs';
const OUT = process.argv[2], LANG = process.argv[3] || 'ko';
const EMU = 'emulator=1&emulatorPort=8181';
const notes = []; const note = (ok, t) => { notes.push((ok ? 'ok   ' : 'FAIL ') + t); console.log((ok ? '  ok   ' : '  FAIL ') + t); };

// 1) SVart 관람객을 감상 화면까지 (아직 보내지 않음)
const app = await launch(OUT + '/app', { url: `http://localhost:8765/index.html?${EMU}`, lang: LANG });
await visitor(app, {}, { send: false });
const code = await app.ev('EAR_RESULT.code'), hue = await app.ev('GlobalState.psychoProfile.hueDeg');
console.log('  app result', code, hue.toFixed(1));

// 2) 타워 TV를 먼저 열어 둠
const tv = await browser(OUT + '/tv', { w: 1920, h: 1080 });
await tv.go(`http://localhost:8766/wall/?${EMU}`);
note(await tv.until('typeof feedStarted !== "undefined" && feedStarted', 30000), '타워 TV(에뮬레이터)가 뜨고 피드 시작');
await sleep(4000);
const before = await tv.ev('snails.filter(s => s.ear).length');

// 3) SVart에서 달팽이를 밀어 보냄
await app.drag(app.w * 0.25, 0, (await app.targets()).snail);
await app.until('towerCard && !towerCard.hidden', 20000);
const id = await app.ev('GlobalState.tour.earId'), qr = await app.ev('towerCardUrl');
// 빠른 모드에서는 QR 화면이 곧 첫 화면으로 돌아가므로 결과 화면의 동물은 지금 읽어 둠
const appAnimal = await app.ev("getSnailAnalysis(GlobalState.userEQProfile, GlobalState.psychoProfile, '').animal");
note(/^[A-Z0-9]{10}$/.test(id) && qr.includes('ear=' + id), `보내기: ID ${id}, QR ${qr}`);
await app.until('svartCloud.status().pending === 0', 30000);
note((await app.ev('svartCloud.status()')).pending === 0, '에뮬레이터에 저장됨(대기열 비움)');

// 4) 타워에 포탈로 도착
const arrived = await tv.until(`snails.some(s => s.ear && s.ear.earId === ${JSON.stringify(id)})`, 30000);
await sleep(1200); await tv.shot('tv-arriving');
const s = await tv.ev(`(() => { const sn = snails.find(s => s.ear && s.ear.earId === ${JSON.stringify(id)}); return sn && { code: sn.code, hue: sn.ear.profile.hueDeg, hz: sn.ear.profile.maxFreqHz, portal: typeof portals !== 'undefined' ? portals.length : null }; })()`);
note(arrived && s.code === code && Math.abs(s.hue - hue) < 0.01, `타워 TV에 실시간 도착: 코드 ${s && s.code}, 색 ${s && s.hue && s.hue.toFixed(1)} (보낸 색 ${hue.toFixed(1)}), 높이 ${s && s.hz}Hz, 포탈 ${s && s.portal}`);
note((await tv.ev('snails.filter(s => s.ear).length')) === before + 1, `타워 마릿수 ${before} → ${await tv.ev('snails.filter(s => s.ear).length')}`);
await sleep(5000); await tv.shot('tv-arrived');

// 5) QR 주소(호스트만 로컬로 바꿈)를 휴대폰 크기로 열기
const mob = await browser(OUT + '/mobile', { w: 390, h: 844, mobile: true, touch: true });
const u = new URL(qr); const local = `http://localhost:8766/${u.search}&${EMU}`;
await mob.go(local);
const got = await mob.until(`!!own && own.earId === ${JSON.stringify(id)}`, 20000);
await sleep(1000);
const m = await mob.ev("({ code: own && own.code, hue: own && own.profile.hueDeg, status: document.getElementById('code-status').textContent, cards: gallery.size })");
note(got && m.code === code && Math.abs(m.hue - hue) < 0.01, `모바일이 DB에서 자기 결과를 불러옴: ${m.code}, 색 ${m.hue && m.hue.toFixed(1)}, "${m.status}"`);
await mob.shot('mobile-own');
// 동물 (11/22): 아이패드 결과 화면의 동물 = 휴대폰의 동물, 영어 관람객은 휴대폰도 영어
const mobAnimal = await mob.ev("({ id: SnailAnimal.fromCode(own.code).id, text: document.getElementById('own-animal').textContent, lang: document.documentElement.lang })");
note(appAnimal === mobAnimal.id && mobAnimal.text.length > 0, `아이패드 동물 ${appAnimal} = 휴대폰 동물 ${mobAnimal.id} ('${mobAnimal.text}')`);
note(mobAnimal.lang === LANG && u.searchParams.get('lang') === (LANG === 'en' ? 'en' : null), `QR 언어 ${u.searchParams.get('lang') || 'ko'} → 휴대폰 화면 ${mobAnimal.lang}`);

console.log('errors app:', app.errors.length ? app.errors.slice(0, 3) : 'none', '| tv:', tv.errors.length ? tv.errors.slice(0, 3) : 'none', '| mobile:', mob.errors.length ? mob.errors.slice(0, 3) : 'none');
console.log('FAILS:', notes.filter(n => n.startsWith('FAIL')));
app.close(); tv.close(); mob.close(); process.exit(0);
