// 먼저 에뮬레이터를 8181로 띄움: JAVA_HOME=/opt/homebrew/opt/openjdk@21 firebase emulators:start --only firestore --project svart-tower --config <포트 8181 설정 파일>
// 실제 전송 경로: 앱 → (로컬 에뮬레이터의) Firestore. 운영 DB에는 닿지 않음 (?emulator=1 이면 앱이 127.0.0.1 에뮬레이터에만 연결)
import { launch, visitor, sleep } from './lib.mjs';
const EMU = 'http://127.0.0.1:8181/v1/projects/svart-test/databases/(default)/documents/ears/';
const notes = []; const note = (ok, text) => { notes.push((ok ? 'ok   ' : 'FAIL ') + text); console.log((ok ? '  ok   ' : '  FAIL ') + text); };
const c = await launch(process.argv[2], { url: 'http://localhost:8765/index.html?emulator=1&emulatorPort=8181' });
const status = () => c.ev('svartCloud.status()');
const get = async (id) => { const r = await fetch(EMU + id, { headers: { Authorization: 'Bearer owner' } }); return r.ok ? r.json() : null; };
note((await status()).enabled && await c.ev('_isFirebaseEmulator()'), '에뮬레이터 모드로 전송 켜짐: ' + JSON.stringify(await status()));

// 1) 온라인: 보내면 문서가 규칙을 통과해 저장됨
let id1, code1, hue1;
await visitor(c, { CARD: async () => { id1 = await c.ev('GlobalState.tour.earId'); code1 = await c.ev('EAR_RESULT.code'); hue1 = await c.ev('GlobalState.psychoProfile.hueDeg'); note(await c.ev(`new URL(towerCardUrl).searchParams.get('ear') === ${JSON.stringify(id1)}`), 'QR 주소에 클라우드 ID ' + id1); } });
await c.until('svartCloud.status().pending === 0', 30000);
const d1 = await get(id1);
const f = d1 && d1.fields;
note(!!d1, `온라인 전송: 문서 ${id1} 저장됨, 대기열 ${JSON.stringify(await status())}`);
if (f) {
  const prof = f.profile.mapValue.fields;
  note(f.code.stringValue === code1 && f.v.integerValue === '2', `저장된 코드 ${f.code.stringValue} = 화면 코드 ${code1}, v=${f.v.integerValue}`);
  note(Math.abs(Number(prof.hueDeg.doubleValue ?? prof.hueDeg.integerValue) - hue1) < 0.01, `저장된 색상 ${prof.hueDeg.doubleValue ?? prof.hueDeg.integerValue} = 달팽이 색상 ${hue1.toFixed(2)}`);
  note(!('name' in f) || f.name.nullValue !== undefined || f.name.stringValue === '', '이름은 저장하지 않음: ' + JSON.stringify(f.name ?? null));
  console.log('  문서 필드:', Object.keys(f).join(', '), '| profile:', Object.keys(prof).join(', '));
}
// 2) 와이파이 끊김: 대기열에 남고 화면은 그대로 진행, 다시 연결되면 올라감
let id2;
await visitor(c, {
  MUSIC: async () => { await c.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); },
  CARD: async () => { id2 = await c.ev('GlobalState.tour.earId'); await sleep(1500); note(!!id2 && (await status()).pending === 1, `오프라인에서 보냄: QR 화면은 뜨고(ID ${id2}) 대기열 ${JSON.stringify(await status())}`); await c.shot('offline-card'); }
});
note(await get(id2) === null, '오프라인 동안에는 문서 없음');
await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await c.ev("window.dispatchEvent(new Event('online'))");
await c.until('svartCloud.status().pending === 0', 90000);
note(!!(await get(id2)), `다시 연결되자 대기열이 비고 문서 ${id2} 저장됨: ${JSON.stringify(await status())}`);
// 3) 오프라인에서 보낸 뒤 페이지를 새로 열어도(전원 재시작) 대기열이 살아 있다가 올라감
let id3;
await visitor(c, {
  MUSIC: async () => { await c.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); },
  CARD: async () => { id3 = await c.ev('GlobalState.tour.earId'); }
});
await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await c.send('Page.reload'); await sleep(1500);
await c.until("typeof svartCloud === 'object'", 20000);
const afterReload = await status();
await c.until('svartCloud.status().pending === 0', 60000);
note(afterReload.pending >= 0 && !!(await get(id3)), `새로고침 뒤에도 대기열 유지(${afterReload.pending}건) → 문서 ${id3} 저장됨`);
note((await status()).rejected === 0, '규칙에 거부된 문서 없음: ' + JSON.stringify(await status()));
console.log('warnings:', [...new Set(c.warnings)].slice(0, 6));
console.log('errors:', c.errors.length ? c.errors.slice(0, 5) : 'none');
console.log('FAILS:', notes.filter(n => n.startsWith('FAIL')));
c.close(); process.exit(0);
