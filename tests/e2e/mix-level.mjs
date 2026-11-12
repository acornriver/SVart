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
await until("LANGS.every(lang=>voiceIds(lang).filter(id=>!VOICE_PENDING[lang].includes(id)).every(id=>voiceClips[lang][id])) && TOUR_PLACES.every(p=>sampleSources[p.key])");
await ev('Promise.all([beatCalibrated, registerCalibrated])');
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
for(const row of records.filter(r=>r.group==='part2')) if(Math.abs(row.gainDb-10)>.2) failures.push(row.id+' test ratio changed');
const beatEq=records.filter(r=>r.group==='beat-EQ');
// Compare EQ settings on the same input; FULL/LOW/HIGH have different spectra
// and different flat reference levels even before applying EQ.
for(const name of ['FULL','LOW','HIGH']) {
  const levels=beatEq.filter(r=>r.id.startsWith('beat-'+name+'-')).map(r=>r.loudDb);
  if(Math.max(...levels)-Math.min(...levels)>1) failures.push(name+' EQ loudness spread exceeds 1dB');
}
const melodies=records.filter(row=>row.group==='melody');
if(Math.max(...melodies.map(row=>row.activeLoudDb))-Math.min(...melodies.map(row=>row.activeLoudDb))>.5) failures.push('Melody register loudness spread exceeds 0.5dB');
const front=records.find(row=>row.group==='center'&&row.id==='center-0');
const left=records.find(row=>row.group==='center'&&row.id==='center-9');
const right=records.find(row=>row.group==='center'&&row.id==='center-27');
if(Math.abs(front.balanceDb)>.05 || Math.abs(left.balanceDb+right.balanceDb)>.1 || left.balanceDb*right.balanceDb>=0) failures.push('Mono center image is not symmetric');
for(const volumeDb of [-40,-20,0]) {
  const beat=records.find(row=>row.group==='participant'&&row.kind==='beat'&&row.volumeDb===volumeDb);
  const melodies=records.filter(row=>row.group==='participant'&&row.kind==='melody'&&row.volumeDb===volumeDb);
  if(melodies.some(row=>Math.abs(row.loudDb-beat.loudDb)>3)) failures.push('Melody/beat level mismatch at '+volumeDb+'dB');
}
if(failures.length) errors.push(...failures);
writeFileSync(OUT+'/mix-report.json',JSON.stringify({mix:await ev('AudioMix.status()'),records,errors},null,2));
console.log('errors:', errors.length?errors:'none');
ws.close();chrome.kill();process.exit(errors.length?1:0);

async function audit() {
  hushVoice(); stopVoice(); leavePart2(); setActiveSource(null,0);
  const rows=[], worst={}, sr=getAudioContext().sampleRate, db=x=>20*Math.log10(Math.max(x,1e-9));
  GlobalState.currentStage='PART1_REGISTER';
  GlobalState.userEQProfile.masterVolume=1;
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
    const active = bufferChannels(b).map(channel => channel.subarray(0,Math.ceil((MELODY_LENGTH+.5)*sr)));
    const row={group,id,loudDb:db(m.kRms),peakDb:db(m.peak),...(group==='melody'?{activeLoudDb:db(measureLoudness(active,sr).kRms)}:{}),...extra,...(save?{wav:wav(b)}:{})};
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
  async function renderSensitivity(hz, volume=1) {
    const ctx=new Off(2,sr,sr),graph=AudioMix.createGraph(ctx),osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.frequency.value=hz;gain.gain.value=splToAmp(SENS.spl)*volume;
    osc.connect(gain);gain.connect(graph.buses.part2);osc.start(0);
    return ctx.startRendering();
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
  for(const lang of ['ko','en'])for(const id of voiceIds(lang).filter(id=>!VOICE_PENDING[lang].includes(id))) {
    const b=voiceClips[lang][id];
    add('voice-default','voice-'+lang+'-'+id,await render(b,'voice',VOICE_LEVEL_START**2),{},true);
    add('voice-max','voice-max-'+lang+'-'+id,await render(b,'voice',1));
  }
  const sequences={size:[['size',0],['sting',.28]],shell:[['gasp',0],['shell',.42]],reveal:[['roll',0],['fanfare',.8],['clap',1.45]]};
  for(const [name,seq] of Object.entries(sequences)) {
    const ctx=new Off(2,sr*4,sr),graph=AudioMix.createGraph(ctx),gain=ctx.createGain();gain.gain.value=VOICE_LEVEL_START**2;gain.connect(graph.buses.effects);
    for(const [key,at] of seq) {const b=await getAudioContext().decodeAudioData(await(await fetch('media/sfx/memes/'+key+'.mp3')).arrayBuffer());const source=ctx.createBufferSource();source.buffer=b;const level=ctx.createGain();level.gain.value=MemeFX.soundLevel(key);source.connect(level);level.connect(gain);source.start(at);}
    add('effects-default','effect-'+name,await ctx.startRendering(),{},true);
    const maxCtx=new Off(2,sr*4,sr),maxGraph=AudioMix.createGraph(maxCtx);
    for(const [key,at] of seq) {const b=await getAudioContext().decodeAudioData(await(await fetch('media/sfx/memes/'+key+'.mp3')).arrayBuffer());const source=maxCtx.createBufferSource();source.buffer=b;const level=maxCtx.createGain();level.gain.value=MemeFX.soundLevel(key);source.connect(level);level.connect(maxGraph.buses.effects);source.start(at);}
    add('effects-max','effect-max-'+name,await maxCtx.startRendering());
  }
  const p2=[['octave-left',octBuffer({startHigh:'L'})],['octave-right',octBuffer({startHigh:'R'})],...F0_PAIRS.filter(p=>F0.pairIds.includes(p.id)).flatMap(p=>['AB','BA'].map(order=>['f0-'+p.id+'-'+order,f0Buffer({...p,order})]))];
  for(const [id,b] of p2) {
    const before=await render(b,'part2',1,null,false),after=await render(b,'part2');
    const a=measureLoudness(bufferChannels(after),sr),z=measureLoudness(bufferChannels(before),sr);
    add('part2',id,after,{gainDb:db(a.kRms/z.kRms)},true);
  }
  const A=await prepareCenter();
  if(A.voice.numberOfChannels !== 1) throw Error('Center stimulus must have one mono source');
  const liveContext=getAudioContext();
  const createSource=liveContext.createBufferSource;
  let sourceCount=0;
  let controller;
  liveContext.createBufferSource=function(){sourceCount++;return createSource.call(this);};
  try { controller=startCenter({off:60},A); }
  finally { liveContext.createBufferSource=createSource; }
  controller.turn(90);controller.turn(-180);controller.turn(180);
  if(sourceCount!==1 || controller.state().angle!==150) throw Error('Center rotation created multiple sources or lost its angle');
  controller.stop();controller.stop();
  if(controller.alive()) throw Error('Center source did not stop');

  for(let dir=0;dir<A.irs.length;dir++) {
    const ctx=new Off(2,Math.ceil((A.voice.duration+.1)*sr),sr),graph=AudioMix.createGraph(ctx);
    const placer=centerPlacer(ctx,graph.buses.part2,A,A.voice,wrap180(-10*dir));
    placer.level.gain.value=A.gain;
    placer.src.start(0);
    const buffer=await ctx.startRendering();
    const left=measureLoudness([buffer.getChannelData(0)],sr).kRms;
    const right=measureLoudness([buffer.getChannelData(1)],sr).kRms;
    add('center','center-'+dir,buffer,{balanceDb:db(right/left)},dir===0||dir===9||dir===27);
  }
  for(const hz of [8000,12000,16000,20000]) {
    add('sensitivity','sensitivity-'+hz,await renderSensitivity(hz),{},true);
  }
  // Every loaded cue, including the standalone result drum roll and sting.
  for(const key of ['size','sting','gasp','shell','roll','fanfare','clap']) {
    const buffer=await getAudioContext().decodeAudioData(await(await fetch('media/sfx/memes/'+key+'.mp3')).arrayBuffer());
    add('effect-single','effect-single-'+key,await render(buffer,'effects',MemeFX.soundLevel(key)*VOICE_LEVEL_START**2),{},true);
  }
  // Apply the actual participant/voice gains used by the live buses.
  for(const volumeDb of [-40,-20,0]) {
    GlobalState.currentStage='PART1_REGISTER';
    GlobalState.userEQProfile.masterVolume=dbToGain(volumeDb);
    const volume=AudioMix.participantGain();
    const beat=await renderBeatLoop(BEAT.bpm,'FULL',2);
    add('participant','participant-beat-'+volumeDb,await render(beat,'program',BEAT_MIXES.FULL.norm*volume),{volumeDb,kind:'beat'});
    for(const reg of REGISTERS) {
      const ctx=new Off(2,Math.ceil((MELODY_LENGTH+.5)*sr),sr),graph=AudioMix.createGraph(ctx),gain=ctx.createGain();
      gain.gain.value=volume;gain.connect(graph.buses.program);
      createRegisterVoice(reg.id,ctx,gain);
      add('participant','participant-melody-'+reg.id+'-'+volumeDb,await ctx.startRendering(),{volumeDb,kind:'melody'});
    }
    GlobalState.currentStage='PART2_EAR';
    const testVolume=p2Out().gain.value;
    if(Math.abs(testVolume-volume)>1e-6) throw Error('Part 2 ignored selected volume');
    for(const [id,buffer] of p2) {
      add('participant','participant-'+id+'-'+volumeDb,await render(buffer,'part2',testVolume),{volumeDb,kind:'part2'});
    }
    for(const hz of [8000,12000,16000,20000]) {
      add('participant','participant-sensitivity-'+hz+'-'+volumeDb,await renderSensitivity(hz,testVolume),{volumeDb,kind:'sensitivity'});
    }
    const centerContext=new Off(2,Math.ceil((A.voice.duration+.1)*sr),sr),centerGraph=AudioMix.createGraph(centerContext);
    const center=centerPlacer(centerContext,centerGraph.buses.part2,A,A.voice,0);
    center.level.gain.value=A.gain*testVolume;center.src.start(0);
    add('participant','participant-center-'+volumeDb,await centerContext.startRendering(),{volumeDb,kind:'center'});
    for(const key of ['size','sting','gasp','shell','roll','fanfare','clap']) {
      const buffer=await getAudioContext().decodeAudioData(await(await fetch('media/sfx/memes/'+key+'.mp3')).arrayBuffer());
      add('participant','participant-effect-'+key+'-'+volumeDb,await render(buffer,'effects',MemeFX.soundLevel(key)*voiceGain(true)),{volumeDb,kind:'effect'});
    }
    for(const lang of LANGS) {
      GlobalState.lang=lang;
      for(const id of voiceIds(lang).filter(id=>!VOICE_PENDING[lang].includes(id))) {
        if(volumeDb!==-20 && id!=='m4-1') continue;
        add('participant','participant-voice-'+lang+'-'+id+'-'+volumeDb,await render(voiceClips[lang][id],'voice',voiceGain()),{volumeDb,kind:'voice'});
      }
    }
  }
  GlobalState.currentStage='PART1_VOLUME';
  for(const lang of LANGS) {
    GlobalState.lang=lang;
    add('voice-intro','voice-intro-'+lang,await render(voiceClips[lang]['m1-1'],'voice',voiceGain()),{},true);
  }
  GlobalState.currentStage='PART2_CENTER';
  GlobalState.userEQProfile.masterVolume=.1;
  GlobalState.voiceOn=false;
  if(voiceGain()!==0 || voiceGain(true)!==0 || Math.abs(p2Out().gain.value-.1)>1e-6) throw Error('Voice mute affected test volume');
  GlobalState.voiceOn=true;
  for(const [group,item] of Object.entries(worst)) rows.push({...item.row,id:'worst-'+group,group:'stress',wav:wav(item.buffer)});
  window.__mixAudit=rows;return rows.length;
}
