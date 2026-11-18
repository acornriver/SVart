/* Current result copy is read from copy.js. Conditions describe its stored input values. */
const ResultCopyCatalog = (() => {
  const centerLimit = 5; // Kept in sync with CENTER_SIDE_DEG in part2_audio.js by the catalog test.
  const defaults = Object.freeze({
    volDb: -18, lowDb: 6, highDb: -2, register: 'MID', maxHz: 15200,
    maxMeasured: true, centerDeg: -8, centerMeasured: true, ear: 'RIGHT', pitch: 'F'
  });
  const groups = [
    ['title', '유형 제목 · ②③ 저음·고음 조합'], ['tone', '②③ 저음·고음 선호'],
    ['ear', '⑦ 우세 귀'], ['hf', '⑤ 고역 한계'], ['vol', '① 선호 음량'],
    ['center', '⑥ 편한 자리'], ['register', '④ 멜로디 음역'],
    ['pitch', '⑧ 바탕음·배음'], ['missing', '결과값이 없는 경우']
  ];
  const tags = { ear: '⑦', tone: '②③', hf: '⑤', vol: '①', center: '⑥', register: '④', pitch: '⑧' };
  const labels = { ear: '우세 귀', tone: '저음·고음 선호', hf: '고역 한계', vol: '선호 음량', center: '편한 자리', register: '멜로디 음역', pitch: '바탕음·배음' };

  function profile(values) {
    const register = EAR_CODE.REGISTER.find(item => item.id === values.register);
    return {
      masterVolume: Math.pow(10, values.volDb / 20),
      lowShelf: { freq: 200, gain: values.lowDb }, highShelf: { freq: 4000, gain: values.highDb },
      registerPeak: { register: values.register, freq: register?.peakHz ?? 400, gain: EAR_CODE.PEAK_GAIN_DB, q: EAR_CODE.PEAK_Q }
    };
  }

  function psycho(values) {
    const centerImage = Math.abs(values.centerDeg) <= centerLimit ? 'C' : values.centerDeg > 0 ? 'R' : 'L';
    return {
      maxFreqHz: values.maxMeasured ? values.maxHz : null,
      centerDeg: values.centerMeasured ? values.centerDeg : null,
      centerImage: values.centerMeasured ? centerImage : null,
      dominantEar: values.ear, pitchMode: values.pitch
    };
  }

  function analyse(values, lang) {
    const previous = window.GlobalState.lang;
    try {
      window.GlobalState.lang = lang;
      const p = profile(values), ps = psycho(values);
      const result = getSnailAnalysis(p, ps, '');
      const keys = [ps.dominantEar && 'ear', 'tone', typeof ps.maxFreqHz === 'number' && 'hf', 'vol',
        ps.centerImage && 'center', p.registerPeak.register && 'register', ps.pitchMode && 'pitch'].filter(Boolean);
      if (keys.length !== result.items.length) throw new Error('앱 결과 항목과 문구 연결을 확인해 주세요.');
      return { title: result.title, items: Object.fromEntries(keys.map((key, i) => [key, result.items[i]])), code: getFullEarCode(p, ps) };
    } finally { window.GlobalState.lang = previous; }
  }

  function rows() {
    const result = [];
    const add = (id, group, condition, patch, key, note = '') => {
      const values = { ...defaults, ...patch };
      const ko = analyse(values, 'ko'), en = analyse(values, 'en');
      result.push({ id, group, condition, ko: key === 'title' ? ko.title : ko.items[key] ?? '',
        en: key === 'title' ? en.title : en.items[key] ?? '', note });
    };
    const boundary = EAR_CODE.SHELF_STEP_DB / 2;
    const low = [[-8, 'T', `저음 < −${boundary} dB`], [0, 'E', `−${boundary} dB ≤ 저음 < +${boundary} dB`], [8, 'W', `저음 ≥ +${boundary} dB`]];
    const high = [[-8, 'V', `고음 < −${boundary} dB`], [0, 'E', `−${boundary} dB ≤ 고음 < +${boundary} dB`], [8, 'S', `고음 ≥ +${boundary} dB`]];
    for (const [lowDb, l, lc] of low) for (const [highDb, h, hc] of high) {
      const condition = `${lc}\n${hc}`;
      add(`TITLE_${l}${h}`, 'title', condition, { lowDb, highDb }, 'title');
      add(`TONE_${l}${h}`, 'tone', condition, { lowDb, highDb }, 'tone');
    }
    add('EAR_LEFT', 'ear', '⑦ 결과 LEFT · 왼쪽', { ear: 'LEFT' }, 'ear');
    add('EAR_RIGHT', 'ear', '⑦ 결과 RIGHT · 오른쪽', { ear: 'RIGHT' }, 'ear');
    HEARING_AGE.forEach((age, i) => {
      add(`HEARING_${age.hz}`, 'hf', `${age.hz / 1000} kHz 이상${i ? ` · ${HEARING_AGE[i - 1].hz / 1000} kHz 미만` : ''}`,
        { maxHz: age.hz }, 'hf', '나이 표현의 기준값은 현재 구현된 초안입니다.');
    });
    add('HEARING_FREQUENCY', 'hf', `${HEARING_AGE.at(-1).hz / 1000} kHz 미만`, { maxHz: 13200 }, 'hf', '측정 주파수만 표시합니다.');
    result.filter(row => row.group === 'hf').forEach(row => {
      for (const lang of ['ko', 'en']) row[lang] = row[lang].replace(/\d+(?:\.\d+)?(?=\s*kHz)/, '{kHz}');
    });
    const { loud, quiet } = LOUD_WORDS_DB;
    add('VOLUME_LOUD', 'vol', `계산된 음량 ≥ ${loud} dB`, { volDb: loud + 2 }, 'vol');
    add('VOLUME_MODERATE', 'vol', `${quiet} dB < 계산된 음량 < ${loud} dB`, { volDb: (loud + quiet) / 2 }, 'vol');
    add('VOLUME_QUIET', 'vol', `계산된 음량 ≤ ${quiet} dB`, { volDb: quiet - 2 }, 'vol');
    add('CENTER_LEFT', 'center', `⑥ 각도 < −${centerLimit}° · L`, { centerDeg: -20 }, 'center');
    add('CENTER_MIDDLE', 'center', `−${centerLimit}° ≤ ⑥ 각도 ≤ +${centerLimit}° · C`, { centerDeg: 0 }, 'center');
    add('CENTER_RIGHT', 'center', `⑥ 각도 > +${centerLimit}° · R`, { centerDeg: 20 }, 'center');
    for (const [register, label] of [['LOW', 'A · 낮은 멜로디'], ['MID', 'B · 가운데 멜로디'], ['HIGH', 'C · 높은 멜로디']]) {
      add(`REGISTER_${register}`, 'register', `④ ${label} 선택`, { register }, 'register');
    }
    for (const [pitch, label] of [['F', '바탕음'], ['B', '함께'], ['H', '배음']]) {
      add(`PITCH_${pitch}`, 'pitch', `⑧ 결과 ${pitch} · ${label}`, { pitch }, 'pitch');
    }
    for (const [id, label, patch, key] of [
      ['EAR', '⑦ 우세 귀 결과 없음', { ear: null }, 'ear'],
      ['HEARING', '⑤ 고역 한계 결과 없음', { maxMeasured: false }, 'hf'],
      ['CENTER', '⑥ 편한 자리 결과 없음', { centerMeasured: false }, 'center'],
      ['REGISTER', '④ 멜로디 선택 결과 없음', { register: null }, 'register'],
      ['PITCH', '⑧ 바탕음·배음 결과 없음', { pitch: null }, 'pitch']
    ]) add(`MISSING_${id}`, 'missing', label, patch, key, '현재 화면에서 해당 항목을 생략합니다.');
    return groups.flatMap(([group]) => result.filter(row => row.group === group));
  }

  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function documentHtml({ worksheet = true } = {}) {
    const cell = 'border:1px solid #aaa;padding:8px;vertical-align:top;text-align:left;overflow-wrap:anywhere;';
    const all = rows();
    const tables = groups.map(([group, label]) => `<h2>${escape(label)}</h2><table style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <thead><tr><th style="${cell}width:24%;">ID·표시 조건</th><th style="${cell}width:38%;">한국어</th><th style="${cell}width:38%;">English</th></tr></thead>
      <tbody>${all.filter(row => row.group === group).map(row => `<tr>
      <td style="${cell}"><b>${escape(row.id)}</b><br>${escape(row.condition).replace(/\n/g, '<br>')}${row.note ? '<p>' + escape(row.note) + '</p>' : ''}</td>
      <td lang="ko" style="${cell}"><b>현재 문구</b><p>${escape(row.ko) || '해당 항목 생략'}</p>${worksheet ? '<b>확정안</b><p>[작성]</p>' : ''}</td>
      <td lang="en" style="${cell}"><b>Current copy</b><p>${escape(row.en) || 'Item omitted'}</p>${worksheet ? '<b>Final copy</b><p>[작성]</p>' : ''}</td></tr>`).join('')}</tbody></table>`).join('');
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${worksheet ? '결과 문구 작성용 표' : '결과 문구·표시 조건 안내'}</title>
      <style>@page{size:A4 landscape;margin:15mm}thead{display:table-header-group}tr{break-inside:avoid}h2{font-size:16pt;margin-top:28px}</style></head>
      <body style="font-family:Arial,'Apple SD Gothic Neo',sans-serif;font-size:11pt;line-height:1.6;max-width:1100px;margin:28px auto;padding:0 20px;">
      <h1>모든 귀는 […] 이다 · ${worksheet ? '결과 문구 작성용 표' : '결과 문구·표시 조건 안내'}</h1><p>2026-11-18 구조 기준. 유형 제목 1줄과 분석 항목 최대 7줄로 조합합니다.</p>
      ${worksheet ? '<p>작성자 [작성]　검토자 [작성]　버전·날짜 [작성]</p>' : '<p>제목은 ② 저음·③ 고음의 3×3 조합으로 정합니다. 분석 순서는 ⑦ 우세 귀 → ②③ 저음·고음 → ⑤ 고역 한계 → ① 음량 → ⑥ 편한 자리 → ④ 멜로디 → ⑧ 바탕음·배음입니다.</p>'}
      <p>각 조건의 한·영 확정안을 적어 주세요. {kHz}는 측정값이 들어가는 자리입니다. ID와 함께 전달하면 앱 문구와 대조할 수 있습니다.</p>
      ${tables}${worksheet ? '<h2>구조·조건 변경 의견</h2><p>[추가할 항목, 조건 변경, 한 화면 구성에 대한 의견]</p>' : '<p><a href="./">결과 미리보기·작성용 표 다운로드로 돌아가기</a></p>'}</body></html>`;
  }

  return { defaults, groups, tags, labels, centerLimit, profile, psycho, analyse, rows, escape, documentHtml };
})();
