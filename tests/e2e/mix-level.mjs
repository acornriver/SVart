// Render production sources through the actual mix graph; no accelerated audio.
// Usage: node tests/e2e/mix-level.mjs /tmp/svart-mix-audit (local server: 8765)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';

const OUT = process.argv[2];
const URL = 'http://localhost:8765/index.html';
const W = 744, H = 1133;
const portFile = `${OUT}/profile/DevToolsActivePort`;
const requestedPort = process.env.SVART_CDP_PORT || '0';
mkdirSync(OUT, { recursive: true });
if (requestedPort === '0' && existsSync(portFile)) unlinkSync(portFile);

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=' + requestedPort, `--window-size=${W},${H}`,
  '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + OUT + '/profile', 'about:blank'
], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Chrome chooses a fresh port by default, so parallel runs cannot attach to an old test tab.
let targets;
const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
  try {
    const port = requestedPort === '0' ? readFileSync(portFile, 'utf8').split('\n')[0].trim() : requestedPort;
    const response = await fetch(`http://127.0.0.1:${port}/json`);
    if (response.ok) {
      targets = await response.json();
      if (targets.some(t => t.type === 'page')) break;
    }
  } catch { /* Chrome is still starting. */ }
  await sleep(80);
}
if (!targets?.some(t => t.type === 'page')) throw new Error('Chrome did not start within 15 seconds');
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = {}; const errors = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console.error: ' + JSON.stringify(msg.params.args.map((a) => a.value ?? a.description)));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: URL });


const delay = ms => new Promise(r => setTimeout(r,ms));
const until = async expr => { const t=Date.now();while(Date.now()-t<30000){if(await ev(expr))return;await delay(50);}throw Error('timeout '+expr); };
await until("!!document.querySelector('.intro .title-btn') && MemeFX.ready()");
await ev("document.querySelector('.intro .title-btn').click()");
await until("GlobalState.currentStage === 'PART1_VOLUME'");
await until("voiceIds('ko').every(id=>voiceClips.ko[id]) && voiceIds('en').every(id=>voiceClips.en[id]) && TOUR_PLACES.every(p=>sampleSources[p.key])");
await ev('beatCalibrated');
const result = await ev(`(${audit.toString()})().catch(e=>({auditError:e.stack||String(e)}))`);
if(typeof result!=='number') throw Error('Audio audit failed: '+JSON.stringify({result,errors}));
const records=[];
for(let i=0;i<result;i++) {
  const item=await ev(`(() => {const {wav,...rest}=__mixAudit[${i}];return rest})()`);
  const encoded=await ev(`__mixAudit[${i}].wav || null`);
  if(encoded) writeFileSync(OUT+'/'+item.id+'.wav',Buffer.from(encoded,'base64'));
  records.push(item);
}

for(const group of [...new Set(records.map(r=>r.group))]) {
  const rows=records.filter(r=>r.group===group);
  console.log(group, rows.length, 'peak max',Math.max(...rows.map(r=>r.peakDb)).toFixed(2), 'K RMS range',Math.min(...rows.map(r=>r.loudDb)).toFixed(1),Math.max(...rows.map(r=>r.loudDb)).toFixed(1));
}
const failures=[];
for(const row of records) if(!Number.isFinite(row.peakDb)||row.peakDb>-1) failures.push(row.id+' peak '+row.peakDb);
for(const row of records.filter(r=>r.group==='part2')) if(Math.abs(row.gainDb-6)>.2) failures.push(row.id+' test ratio changed');
const beatEq=records.filter(r=>r.group==='beat-EQ');
if(Math.max(...beatEq.map(r=>r.loudDb))-Math.min(...beatEq.map(r=>r.loudDb))>1) failures.push('EQ loudness spread exceeds 1dB');
if(failures.length) errors.push(...failures);
writeFileSync(OUT+'/mix-report.json',JSON.stringify({mix:await ev('AudioMix.status()'),records,errors},null,2));
console.log('errors:', errors.length?errors:'none');
ws.close();chrome.kill();process.exit(errors.length?1:0);

async function audit() {
  hushVoice(); stopVoice(); leavePart2(); setActiveSource(null,0);
  const rows=[], worst={}, sr=getAudioContext().sampleRate, db=x=>20*Math.log10(Math.max(x,1e-9));
  const Off=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  function wav(buffer) {
    const n=buffer.length,ch=buffer.numberOfChannels,ab=new ArrayBuffer(44+n*ch*2),v=new DataView(ab);
    const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
    str(0,'RIFF');v.setUint32(4,36+n*ch*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*ch*2,true);
    for(let i=0;i<n;i++)for(let c=0;c<ch;c++)v.setInt16(44+(i*ch+c)*2,Math.round(Math.max(-1,Math.min(1,buffer.getChannelData(c)[i]))*32767),true);
    const u=new Uint8Array(ab);let text='';for(let i=0;i<u.length;i+=16384)text+=String.fromCharCode(...u.subarray(i,i+16384));return btoa(text);
  }
  function add(group,id,b,extra={},save=false) {
    const m=measureLoudness(bufferChannels(b),b.sampleRate);
    const row={group,id,loudDb:db(m.kRms),peakDb:db(m.peak),...extra,...(save?{wav:wav(b)}:{})};
    rows.push(row);
    if((group.endsWith('-EQ') || group==='voice-max' || group==='effects-max') && (!worst[group] || row.peakDb>worst[group].row.peakDb)) worst[group]={row,buffer:b};
  }
  async function render(b,bus,level=1,profile=null,protect=true) {
    const ctx=new Off(2,Math.ceil((b.duration+.3)*sr),sr), source=ctx.createBufferSource(),g=ctx.createGain();
    source.buffer=b;g.gain.value=level;source.connect(g);let end=g;
    if(profile) {
      for(const [type,f,gain,q] of [['lowshelf',200,profile.low,1],['peaking',profile.freq,3,1],['highshelf',4000,profile.high,1]]) {
        const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.value=f;filter.gain.value=gain;filter.Q.value=q;end.connect(filter);end=filter;
      }
      const comp=ctx.createGain();comp.gain.value=dbToGain(profile.comp);end.connect(comp);end=comp;
    }
    const graph=protect?AudioMix.createGraph(ctx):null;
    end.connect(graph?graph.buses[bus]:ctx.destination);source.start(0);return ctx.startRendering();
  }
  // Internal beat calibration remains -26dB; the common output provides the lift.
  for(const name of ['FULL','LOW','HIGH']) {
    const b=await renderBeatLoop(BEAT.bpm,name,2),norm=BEAT_MIXES[name].norm;
    add('beat-flat','beat-'+name,await render(b,'program',norm),{},true);
    for(const [low,high] of [[-10,-10],[-10,10],[10,-10],[10,10]])for(const reg of REGISTERS) {
      GlobalState.userEQProfile.lowShelf.gain=low;GlobalState.userEQProfile.highShelf.gain=high;
      Object.assign(GlobalState.userEQProfile.registerPeak,{register:reg.id,freq:reg.peakHz,gain:3,q:1});
      add('beat-EQ','beat-'+name+'-'+low+'-'+high+'-'+reg.id,await render(b,'program',norm,{low,high,freq:reg.peakHz,comp:getLoudnessCompDb(beatSpectra[name])}));
    }
  }
  // Normalize all three entire recordings, then test the window around their largest peak.
  for(const place of TOUR_PLACES) {
    const full=sampleSources[place.key].buffer;let peakAt=0,peak=0;
    for(let c=0;c<full.numberOfChannels;c++){const d=full.getChannelData(c);for(let i=0;i<d.length;i++)if(Math.abs(d[i])>peak){peak=Math.abs(d[i]);peakAt=i;}}
    const begin=Math.max(0,Math.min(full.length-8*full.sampleRate,peakAt-4*full.sampleRate));
    const b=getAudioContext().createBuffer(full.numberOfChannels,Math.min(full.length,8*full.sampleRate),full.sampleRate);
    for(let c=0;c<b.numberOfChannels;c++)b.getChannelData(c).set(full.getChannelData(c).subarray(begin,begin+b.length));
    add('music-flat','music-'+place.key,await render(b,'program',sampleLevels[place.key]),{},true);
    for(const [low,high] of [[-10,-10],[-10,10],[10,-10],[10,10]])for(const reg of REGISTERS) {
      GlobalState.userEQProfile.lowShelf.gain=low;GlobalState.userEQProfile.highShelf.gain=high;
      Object.assign(GlobalState.userEQProfile.registerPeak,{register:reg.id,freq:reg.peakHz,gain:3,q:1});
      add('music-EQ','music-'+place.key+'-'+low+'-'+high+'-'+reg.id,await render(b,'program',sampleLevels[place.key],{low,high,freq:reg.peakHz,comp:getLoudnessCompDb(sampleSpectra[place.key])}));
    }
  }
  for(const reg of REGISTERS) {
    const ctx=new Off(2,Math.ceil((MELODY_LENGTH+2.6)*sr),sr),graph=AudioMix.createGraph(ctx);
    createRegisterVoice(reg.id,ctx,graph.buses.program);
    add('melody','melody-'+reg.id,await ctx.startRendering(),{},true);
  }
  for(const lang of ['ko','en'])for(const id of voiceIds(lang)) {
    const b=voiceClips[lang][id];
    add('voice-default','voice-'+lang+'-'+id,await render(b,'voice',VOICE_LEVEL_START**2),{},true);
    add('voice-max','voice-max-'+lang+'-'+id,await render(b,'voice',1));
  }
  const sequences={size:[['size',0],['sting',.28]],shell:[['gasp',0],['shell',.42]],reveal:[['roll',0],['fanfare',.8],['clap',1.45]]};
  for(const [name,seq] of Object.entries(sequences)) {
    const ctx=new Off(2,sr*4,sr),graph=AudioMix.createGraph(ctx),gain=ctx.createGain();gain.gain.value=VOICE_LEVEL_START**2;gain.connect(graph.buses.effects);
    for(const [key,at] of seq) {const b=await getAudioContext().decodeAudioData(await(await fetch('media/sfx/memes/'+key+'.mp3')).arrayBuffer());const source=ctx.createBufferSource();source.buffer=b;source.connect(gain);source.start(at);}
    add('effects-default','effect-'+name,await ctx.startRendering(),{},true);
    const maxCtx=new Off(2,sr*4,sr),maxGraph=AudioMix.createGraph(maxCtx);
    for(const [key,at] of seq) {const b=await getAudioContext().decodeAudioData(await(await fetch('media/sfx/memes/'+key+'.mp3')).arrayBuffer());const source=maxCtx.createBufferSource();source.buffer=b;source.connect(maxGraph.buses.effects);source.start(at);}
    add('effects-max','effect-max-'+name,await maxCtx.startRendering());
  }
  const p2=[['octave-left',octBuffer({startHigh:'L'})],['octave-right',octBuffer({startHigh:'R'})],...F0_PAIRS.filter(p=>F0.pairIds.includes(p.id)).flatMap(p=>['AB','BA'].map(order=>['f0-'+p.id+'-'+order,f0Buffer({...p,order})]))];
  for(const [id,b] of p2) {
    const before=await render(b,'part2',1,null,false),after=await render(b,'part2');
    const a=measureLoudness(bufferChannels(after),sr),z=measureLoudness(bufferChannels(before),sr);
    add('part2',id,after,{gainDb:db(a.kRms/z.kRms)},true);
  }
  const A=await prepareCenter();
  const energy=d=>d.reduce((s,x)=>s+x*x,0),irEnergy=Math.sqrt((energy(A.irs[0].getChannelData(0))+energy(A.irs[0].getChannelData(1)))/2);
  const legacyCenterGain=splToAmp(CENTER_TEST.spl)/Math.SQRT2/(Math.sqrt(energy(A.voice.getChannelData(0))/A.voice.length)*irEnergy);
  for(let dir=0;dir<A.irs.length;dir++) {
    const ctx=new Off(2,Math.ceil((A.voice.duration+.1)*sr),sr),graph=AudioMix.createGraph(ctx),source=ctx.createBufferSource(),conv=ctx.createConvolver(),g=ctx.createGain();
    source.buffer=A.voice;conv.normalize=false;conv.buffer=A.irs[dir];g.gain.value=A.gain;source.connect(g);g.connect(conv);conv.connect(graph.buses.part2);source.start(0);
    add('center','center-'+dir,await ctx.startRendering(),{calibrationChangeDb:db(A.gain/legacyCenterGain)},dir===0||dir===9||dir===27);
  }
  for(const hz of [8000,12000,16000,20000]) {
    const ctx=new Off(2,sr,sr),graph=AudioMix.createGraph(ctx),osc=ctx.createOscillator(),g=ctx.createGain();osc.frequency.value=hz;g.gain.value=splToAmp(SENS.spl);osc.connect(g);g.connect(graph.buses.part2);osc.start(0);
    add('sensitivity','sensitivity-'+hz,await ctx.startRendering(),{},true);
  }
  for(const [group,item] of Object.entries(worst)) rows.push({...item.row,id:'worst-'+group,group:'stress',wav:wav(item.buffer)});
  window.__mixAudit=rows;return rows.length;
}
