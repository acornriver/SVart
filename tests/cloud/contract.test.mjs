/** Local-only contract/rules/sender/feed integration. Start Firestore emulator on 8181 first. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
const root = resolve(import.meta.dirname, '../..');
const source = path => readFileSync(resolve(root, path), 'utf8');
const timers = new Set();
function context(extra = {}, data = new Map()) {
  const window = { addEventListener() {}, CloudConfig: { CLOUD_ENABLED: true, FIREBASE_CONFIG: { projectId: 'demo-svart-contract' }, STORE_NAMES: false, APP_VERSION: '2.0.0', FEED_CACHE_TIMEOUT_MS: 120000, FEED_COUNT_INTERVAL_MS: 300000 }, _isFirebaseLocalDev: () => false, FIREBASE_BASE: 'test://firebase', ...extra };
  const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)) };
  const ctx = vm.createContext({ window, localStorage, location: { search: '', hostname: 'test.invalid' }, navigator: { onLine: true }, crypto: webcrypto, URLSearchParams, console,
    setTimeout: (fn,ms) => { const id=setTimeout(fn,ms);timers.add(id);return id; }, clearTimeout,
    setInterval: (fn,ms) => { const id=setInterval(fn,ms);timers.add(id);return id; }, clearInterval
  });
  // The VM has a different Object prototype; normalize only the test transport boundary.
  let facade;
  const loadSDK = async () => {
    if (!facade) {
      const exports = { ...sdk, setDoc: (ref, data, ...args) => {
        const { createdAt, ...payload } = data;
        return sdk.setDoc(ref, { ...JSON.parse(JSON.stringify(payload)), createdAt }, ...args);
      }};
      facade = new vm.SyntheticModule(Object.keys(exports), function() {
        for (const [key,value] of Object.entries(exports)) this.setExport(key,value);
      }, { context: ctx });
      await facade.link(() => {}); await facade.evaluate();
    }
    return facade;
  };
  const run = (code, name) => new vm.Script(code, { filename: name, importModuleDynamically: loadSDK }).runInContext(ctx);
  run(source('earCode.js'), 'earCode.js'); run(source('cloud/schema.js'), 'schema.js');
  return { window, data, run, ctx };
}
const api = context();
function result(hz=20000) {
  return { name: '민혁', lang: 'en', savedAt: 1800000000000,
    userEQProfile: { masterVolume: .125, lowShelf: { gain: 7.12345 }, highShelf: { gain: -6.54321 }, registerPeak: { register: 'HIGH' } },
    psychoProfile: { maxFreqHz: hz, sensitivity: 67, twist: .532258064516129, centerDeg: -12.3456, centerImage: 'R', dominantEar: 'LEFT', earStrength: 33, pitchMode: 'F', pitchIndex: 67 }
  };
}
const ID='ABCDEFGHJK';
function body(hz=20000, id=ID) { return JSON.parse(JSON.stringify(api.window.EarSchema.buildDoc(result(hz),id))); }
const env = await initializeTestEnvironment({ projectId: 'demo-svart-contract', firestore: { host: '127.0.0.1', port: 8181, rules: source('firestore.rules') } });
const db=env.unauthenticatedContext().firestore();
let passed=0;
async function test(name, fn) { await env.clearFirestore(); await fn(); console.log('✓',name);passed++; }
try {
  await test('current values and new code are preserved', async()=>{
    const value=body(18000);
    assert.equal(value.v,2);assert.equal(value.codeVersion,2);
    assert.equal(value.profile.maxFreqHz,18000);assert.equal(value.profile.twistAmount,.532258064516129);
    assert.equal(value.profile.lowDb,7.12345);assert.equal(value.profile.centerDeg,-12.3456);
    assert.equal(value.name,null);assert.match(value.code,/^IWV-RLF\(18\.0k\/[0-9]\)$/);
  });
  for(const hz of [8000,13200,16000,18000,20000]) await test(`${hz} Hz accepted without truncation`, async()=>{
    const value=body(hz);await assertSucceeds(setDoc(doc(db,'ears',ID),{...value,createdAt:serverTimestamp()}));
    assert.equal((await getDoc(doc(db,'ears',ID))).data().profile.maxFreqHz,hz);
  });
  for(const [field,value] of [['maxFreqHz',20001],['maxFreqHz',7999],['maxFreqHz','20000'],['twistAmount',1.01],['lowDb',11],['volDb',-41],['centerImage','X'],['dominantEar','BOTH']]) await test(`invalid ${field}=${value} denied`, async()=>{
    const data=body();data.profile[field]=value;
    await assertFails(setDoc(doc(db,'ears',ID),{...data,createdAt:serverTimestamp()}));
  });
  await test('unknown Part 2 fields may be null', async()=>{
    const data=api.window.EarSchema.buildDoc({userEQProfile:result().userEQProfile,psychoProfile:{}},ID);
    await assertSucceeds(setDoc(doc(db,'ears',ID),{...JSON.parse(JSON.stringify(data)),createdAt:serverTimestamp()}));
  });
  for(const overrides of [{v:1},{codeVersion:1},{code:'IwS/6 · RLF 13.2'},{hidden:true},{extra:'forbidden'},{createdAt:Timestamp.fromMillis(1)}]) await test(`invalid envelope ${Object.keys(overrides)} denied`, async()=>{
    await assertFails(setDoc(doc(db,'ears',ID),{...body(),createdAt:serverTimestamp(),...overrides}));
  });
  await test('profile requires complete known fields', async()=>{
    const extra=body();extra.profile.extra=1;
    await assertFails(setDoc(doc(db,'ears',ID),{...extra,createdAt:serverTimestamp()}));
    delete extra.profile.extra;delete extra.profile.twistAmount;
    await assertFails(setDoc(doc(db,'ears',ID),{...extra,createdAt:serverTimestamp()}));
  });
  await test('client update/delete prohibited; hidden data stays private', async()=>{
    await setDoc(doc(db,'ears',ID),{...body(),createdAt:serverTimestamp()});
    await assertFails(updateDoc(doc(db,'ears',ID),{name:'changed'}));await assertFails(deleteDoc(doc(db,'ears',ID)));
    await env.withSecurityRulesDisabled(async admin=>updateDoc(doc(admin.firestore(),'ears',ID),{hidden:true}));
    await assertFails(getDoc(doc(db,'ears',ID)));
  });
  await test('sender -> Firestore -> real feed callback -> Tower mapping', async()=>{
    const store=new Map();const sender=context({_initFirebase:async()=>({db})},store);
    sender.run(source('cloud/send.js'),'send.js');
    const receiverDb=env.unauthenticatedContext().firestore();
    const receiver=context({_initFirebase:async()=>({db:receiverDb})});
    receiver.run(source('../SVartTower/cloud/feed.js'),'tower-feed.js');
    receiver.run(source('../SVartTower/mapping.js'),'tower-mapping.js');
    let initial, arrivals=[], removed=[];
    receiver.window.svartFeed.startFeed({ onInitial:list=>initial=list, onArrive:(ear,meta)=>arrivals.push({ear,meta}), onRemove:id=>removed.push(id) });
    const until=async fn=>{const start=Date.now();while(Date.now()-start<12000){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('integration timeout');};
    await until(()=>initial!==undefined);assert.equal(initial.length,0);
    for(const hz of [18000,20000]) {
      const id=sender.window.svartCloud.sendEar(result(hz));await sender.window.svartCloud.flush();
      await until(()=>arrivals.some(x=>x.ear.earId===id));
      const item=arrivals.find(x=>x.ear.earId===id);
      assert.equal(item.ear.v,2);assert.equal(item.ear.codeVersion,2);assert.equal(item.ear.profile.maxFreqHz,hz);assert.equal(item.meta.animate,true);
      assert.equal(receiver.window.TowerMapping.mapProfile(item.ear.profile).maxFreqHz,hz);
      assert.equal(sender.window.svartCloud.status().pending,0);
    }
    const id=arrivals[0].ear.earId;
    await env.withSecurityRulesDisabled(async admin=>updateDoc(doc(admin.firestore(),'ears',id),{hidden:true}));
    await until(()=>removed.includes(id));receiver.window.svartFeed.stopFeed();
  });
  await test('offline retry persists; already-written IDs do not duplicate', async()=>{
    const store=new Map();let online=false;
    const sender=context({_initFirebase:async()=>{if(!online)throw new Error('offline');return {db};}},store);
    sender.run(source('cloud/send.js'),'send.js');
    const id=sender.window.svartCloud.sendEar(result());await sender.window.svartCloud.flush();
    let queue=JSON.parse(store.get('svart.outbox.v2'));assert.equal(queue.length,1);assert.equal(queue[0].attempts,1);
    online=true;const saved=queue[0].doc;queue[0].nextAt=0;store.set('svart.outbox.v2',JSON.stringify(queue));await sender.window.svartCloud.flush();
    assert.equal(sender.window.svartCloud.status().pending,0);
    store.set('svart.outbox.v2',JSON.stringify([{earId:id,doc:saved,attempts:0,nextAt:0}]));await sender.window.svartCloud.flush();
    assert.equal(sender.window.svartCloud.status().pending,0);assert.equal((await getDoc(doc(db,'ears',id))).data().earId,id);
  });
  await test('old outbox remains intact; local development cannot upload', async()=>{
    const store=new Map([['svart.outbox','[{"legacy":true}]']]);
    const sender=context({_isFirebaseLocalDev:()=>true},store);sender.run(source('cloud/send.js'),'send.js');
    assert.equal(sender.window.svartCloud.sendEar(result()),null);assert.equal(sender.window.svartCloud.status().legacyPending,1);
    assert.equal(store.get('svart.outbox'),'[{"legacy":true}]');assert.equal(sender.window.svartCloud.status().pending,0);
  });
  console.log(`${passed} backend contract/integration tests passed.`);
} finally { for(const timer of timers){clearTimeout(timer);clearInterval(timer);} await env.cleanup(); }
