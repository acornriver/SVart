/**
 * 청각 다변기 (Sound Variator) - 소리 크기 · 스펙트럼 재기
 *
 * 비트와 북서울 녹음의 크기를 같은 기준으로 맞추고(①에서 맞춘 볼륨이 ②③과 결과 화면에서 어긋나지 않게),
 * 음량 보정(getLoudnessCompDb)에 쓸 실제 스펙트럼을 잽니다.
 * - 크기: K-가중 RMS (ITU-R BS.1770의 두 필터, 앞 쉘프 +4 dB · 38 Hz 하이패스). 단순 RMS는 서브 베이스가 많은 소리를
 *   실제보다 크게 쳐서, 서브가 많은 비트가 녹음보다 작게 들렸음 (11/03 검토)
 * - 스펙트럼: getLoudnessCompDb와 같은 48칸(20 Hz–20 kHz 로그 간격) 각 칸의 파워
 */

const LOUD_TARGET = 0.05;   // K-가중 RMS 목표 (-26 dB, 예전 RMS 기준과 같은 숫자)
const SPECTRUM_BANDS = 48;  // 20 Hz ~ 20 kHz 로그 간격
const SPECTRUM_FFT = 8192;

function spectrumBandFreq(i) {
  return 20 * Math.pow(1000, i / (SPECTRUM_BANDS - 1));
}

// RBJ 바이쿼드 계수 (BS.1770 필터를 표본률에 맞게 다시 계산)
function kWeightCoeffs(sr) {
  const shelf = (() => {
    const f0 = 1681.97, G = 3.99984, Q = 0.7072;
    const A = Math.pow(10, G / 40), w = 2 * Math.PI * f0 / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Q), k = 2 * Math.sqrt(A) * al;
    const a0 = (A + 1) - (A - 1) * c + k;
    return [A * ((A + 1) + (A - 1) * c + k) / a0, -2 * A * ((A - 1) + (A + 1) * c) / a0, A * ((A + 1) + (A - 1) * c - k) / a0,
      2 * ((A - 1) - (A + 1) * c) / a0, ((A + 1) - (A - 1) * c - k) / a0];
  })();
  const hp = (() => {
    const f0 = 38.13, Q = 0.5003, w = 2 * Math.PI * f0 / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    return [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0];
  })();
  return [shelf, hp];
}

/**
 * 채널 배열(Float32Array들)의 K-가중 RMS와 표본 피크
 */
function measureLoudness(channels, sr) {
  const filters = kWeightCoeffs(sr);
  let sum = 0, count = 0, peak = 0;
  channels.forEach((d) => {
    const st = filters.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < d.length; i++) {
      let x = d[i];
      if (Math.abs(x) > peak) peak = Math.abs(x);
      for (let f = 0; f < filters.length; f++) {
        const [b0, b1, b2, a1, a2] = filters[f], s = st[f];
        const y = b0 * x + b1 * s[0] + b2 * s[1] - a1 * s[2] - a2 * s[3];
        s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y;
        x = y;
      }
      sum += x * x;
    }
    count += d.length;
  });
  return { kRms: Math.max(1e-6, Math.sqrt(sum / Math.max(1, count))), peak: Math.max(1e-6, peak) };
}

// 제자리 실수 FFT (기수 2). re, im 길이 n
function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * 48칸 각 칸의 파워 (상대값). 길면 고르게 maxFrames개 창만 봄. 칸에 들어가는 빈이 없으면 가장 가까운 빈의 밀도로 채움
 */
function measureSpectrum(channels, sr, maxFrames = 48) {
  const N = SPECTRUM_FFT, len = channels[0].length;
  const frames = Math.max(1, Math.min(maxFrames, Math.floor(len / N)));
  const hop = frames > 1 ? Math.floor((len - N) / (frames - 1)) : 0;
  const pow = new Float64Array(N / 2);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    re.fill(0); im.fill(0);
    const o = f * hop;
    channels.forEach((d) => {
      for (let i = 0; i < N && o + i < len; i++) re[i] += d[o + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    });
    fftInPlace(re, im);
    for (let k = 1; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
  }
  const binHz = sr / N, r = Math.pow(1000, 1 / (SPECTRUM_BANDS - 1));
  const out = [];
  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    const fc = spectrumBandFreq(i), lo = fc / Math.sqrt(r), hi = fc * Math.sqrt(r);
    let p = 0, n = 0;
    for (let k = Math.ceil(lo / binHz); k < hi / binHz && k < N / 2; k++) { p += pow[k]; n++; }
    if (!n) p = pow[Math.min(N / 2 - 1, Math.max(1, Math.round(fc / binHz)))] * (hi - lo) / binHz;
    out.push(p + 1e-12);
  }
  return out;
}

function bufferChannels(buffer) {
  return Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
}
