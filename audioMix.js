/** Exhibition mix. Digital levels only; headphone SPL still depends on the device volume.
 * Keep participant EQ/volume and psychoacoustic stimulus ratios upstream of this shared output.
 */
window.AudioMix = (() => {
  const settings = Object.freeze({
    driveDb: 7, outputTrimDb: -1, // nominal +6 dB, leaving room after peak protection
    programDb: 0, voiceDb: 0, effectsDb: -1, part2Db: 0, melodyTrimDb: -12,
    thresholdDb: -5, makeupCompensationDb: -2.85, kneeDb: 0, ratio: 20, attackSec: .001, releaseSec: .12
  });
  const gainAt = db => Math.pow(10, db / 20);
  let live;

  // Also used by offline mix verification; one stereo-linked protector for every source.
  function createGraph(ctx, connectDestination = true) {
    const sum = ctx.createGain(), drive = ctx.createGain(), protector = ctx.createDynamicsCompressor(), output = ctx.createGain();
    [sum, drive, output].forEach(node => { node.channelCount = 2; node.channelCountMode = 'explicit'; });
    protector.channelCount = 2; protector.channelCountMode = 'explicit';
    drive.gain.value = gainAt(settings.driveDb);
    // Web Audio compressors apply automatic makeup gain; cancel it for a predictable lift.
    output.gain.value = gainAt(settings.outputTrimDb + settings.makeupCompensationDb);
    protector.threshold.value = settings.thresholdDb;
    protector.knee.value = settings.kneeDb;
    protector.ratio.value = settings.ratio;
    protector.attack.value = settings.attackSec;
    protector.release.value = settings.releaseSec;
    sum.connect(drive); drive.connect(protector); protector.connect(output);
    if (connectDestination) output.connect(ctx.destination);
    const buses = {};
    for (const name of ['program', 'voice', 'effects', 'part2']) {
      const node = ctx.createGain(); node.gain.value = gainAt(settings[name + 'Db']);
      node.connect(sum); buses[name] = node;
    }
    return { ctx, buses, sum, drive, protector, output };
  }
  function graph() {
    if (!live) live = createGraph(getAudioContext());
    return live;
  }
  function bus(name) {
    const node = graph().buses[name];
    if (!node) throw new Error('Unknown mix bus: ' + name);
    return node;
  }
  function status() {
    return { ...settings, nominalBoostDb: settings.driveDb + settings.outputTrimDb,
      initialized: !!live, reductionDb: live?.protector.reduction ?? 0 };
  }
  return { settings, createGraph, bus, graph, status };
})();
