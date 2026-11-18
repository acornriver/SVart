(() => {
  const catalog = ResultCopyCatalog;
  const state = { ...catalog.defaults };
  const escape = catalog.escape;
  const allRows = catalog.rows();
  const groupLabel = group => catalog.groups.find(([key]) => key === group)[1];
  let selected = 'tone';

  const formats = {
    volDb: value => `${value} dB`, lowDb: value => `${value > 0 ? '+' : ''}${value} dB`,
    highDb: value => `${value > 0 ? '+' : ''}${value} dB`, maxHz: value => `${(value / 1000).toFixed(1)} kHz`,
    centerDeg: value => `${value > 0 ? '+' : ''}${value}°`
  };
  function slider(key, label, min, max, step, ends, measured) {
    return `<div class="control"><div class="control-top"><label for="${key}">${label}</label><output class="value" for="${key}" data-value="${key}"></output></div>
      <input id="${key}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state[key]}">
      <div class="ends"><span>${ends[0]}</span><span>${ends[1]}</span></div>
      ${measured ? `<div class="check"><input id="${measured}" data-key="${measured}" type="checkbox" checked><label for="${measured}">측정 결과 있음</label></div>` : ''}</div>`;
  }
  function choice(key, label, options) {
    return `<div class="control"><div id="label-${key}"><b>${label}</b></div><div class="options" role="group" aria-labelledby="label-${key}">
      ${options.map(([value, text]) => `<button type="button" data-key="${key}" data-option="${value ?? ''}">${text}</button>`).join('')}</div></div>`;
  }
  const controls = document.getElementById('controls');
  controls.innerHTML = `<p class="part">PART 1</p>
    ${slider('volDb', '① 편한 크기', -40, 0, 1, ['작게', '크게'])}
    ${slider('lowDb', '② 저음', -10, 10, .5, ['덜어냄', '더함'])}
    ${slider('highDb', '③ 고음', -10, 10, .5, ['덜어냄', '더함'])}
    ${choice('register', '④ 멜로디 음역', [['LOW', 'A 낮은'], ['MID', 'B 가운데'], ['HIGH', 'C 높은'], [null, '결과 없음']])}
    <p class="part">PART 2</p>
    ${slider('maxHz', '⑤ 고역 한계', 8000, 20000, 100, ['8 kHz', '20 kHz'], 'maxMeasured')}
    ${slider('centerDeg', '⑥ 편한 자리', -90, 90, 1, ['왼쪽', '오른쪽'], 'centerMeasured')}
    ${choice('ear', '⑦ 우세 귀', [['LEFT', '왼쪽'], ['RIGHT', '오른쪽'], [null, '결과 없음']])}
    ${choice('pitch', '⑧ 바탕음·배음', [['F', 'F 바탕음'], ['B', 'B 함께'], ['H', 'H 배음'], [null, '결과 없음']])}`;

  function activeIds() {
    const p = catalog.profile(state), ps = catalog.psycho(state);
    const tone = shelfToLetter(state.lowDb, 'LOW') + shelfToLetter(state.highDb, 'HIGH');
    const age = HEARING_AGE.find(item => state.maxHz >= item.hz);
    const db = 20 * Math.log10(Math.max(p.masterVolume, 1e-4));
    return new Set([
      'TITLE_' + tone, 'TONE_' + tone,
      state.ear ? 'EAR_' + state.ear : 'MISSING_EAR',
      state.maxMeasured ? 'HEARING_' + (age ? age.hz : 'FREQUENCY') : 'MISSING_HEARING',
      'VOLUME_' + (db >= LOUD_WORDS_DB.loud ? 'LOUD' : db <= LOUD_WORDS_DB.quiet ? 'QUIET' : 'MODERATE'),
      state.centerMeasured ? 'CENTER_' + ({ L: 'LEFT', C: 'MIDDLE', R: 'RIGHT' }[ps.centerImage]) : 'MISSING_CENTER',
      state.register ? 'REGISTER_' + state.register : 'MISSING_REGISTER',
      state.pitch ? 'PITCH_' + state.pitch : 'MISSING_PITCH'
    ]);
  }

  function table(rows, active) {
    return `<table class="condition-table"><thead><tr><th>표시 조건</th><th lang="ko">한국어</th><th lang="en">English</th></tr></thead><tbody>
      ${rows.map(row => `<tr${active.has(row.id) ? ' class="current"' : ''}><td><span class="id">${escape(row.id)}</span>${escape(row.condition).replace(/\n/g, '<br>')}
      ${active.has(row.id) ? '<small class="current-label">현재 조건</small>' : ''}${row.note ? '<small class="note">' + escape(row.note) + '</small>' : ''}</td>
      <td data-label="한국어" lang="ko">${escape(row.ko) || '<span class="helper">해당 항목 생략</span>'}</td>
      <td data-label="English" lang="en">${escape(row.en) || '<span class="helper">Item omitted</span>'}</td></tr>`).join('')}</tbody></table>`;
  }
  function renderCatalog(active) {
    const query = document.getElementById('search').value.trim().toLocaleLowerCase();
    const found = allRows.filter(row => [row.id, row.condition, row.ko, row.en, row.note, groupLabel(row.group)].join(' ').toLocaleLowerCase().includes(query));
    document.getElementById('search-status').textContent = query ? `${found.length}개 조건이 검색되었습니다.` : `전체 ${allRows.length}개 조건`;
    document.getElementById('catalog-tables').innerHTML = catalog.groups.map(([key, label]) => {
      const rows = found.filter(row => row.group === key);
      return rows.length ? `<div data-group="${key}"><h3>${label}</h3>${table(rows, active)}</div>` : '';
    }).join('');
  }
  function render() {
    const lang = window.GlobalState.lang;
    const result = catalog.analyse(state, lang), active = activeIds();
    document.getElementById('result').lang = lang;
    document.getElementById('code').textContent = result.code;
    document.getElementById('title').textContent = result.title;
    document.getElementById('items').innerHTML = Object.entries(result.items).map(([key, value]) => `<li><button type="button" data-item="${key}" aria-label="${catalog.labels[key]} 표시 조건 보기" aria-pressed="${selected === key}"><span class="tag">${catalog.tags[key]}</span><span>${escape(value)}</span></button></li>`).join('');
    document.getElementById('rules').innerHTML = `<h3>${groupLabel(selected)}</h3>${table(allRows.filter(row => row.group === selected), active)}`;
    Object.entries(formats).forEach(([key, format]) => {
      const flag = { maxHz: 'maxMeasured', centerDeg: 'centerMeasured' }[key];
      controls.querySelector(`[data-value="${key}"]`).textContent = flag && !state[flag] ? '결과 없음' : format(state[key]);
      controls.querySelector(`[data-key="${key}"]`).disabled = flag ? !state[flag] : false;
    });
    controls.querySelectorAll('button[data-option]').forEach(button => {
      const value = button.dataset.option || null;
      const on = state[button.dataset.key] === value;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('[data-lang]').forEach(button => {
      const on = button.dataset.lang === lang;
      button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on));
    });
    renderCatalog(active);
  }
  const groupFor = { volDb: 'vol', lowDb: 'tone', highDb: 'tone', register: 'register', maxHz: 'hf', maxMeasured: 'hf', centerDeg: 'center', centerMeasured: 'center', ear: 'ear', pitch: 'pitch' };
  controls.addEventListener('input', event => {
    const key = event.target.dataset.key;
    if (!key) return;
    state[key] = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
    selected = event.target.type === 'checkbox' && !state[key] ? 'missing' : groupFor[key];
    render();
  });
  controls.addEventListener('click', event => {
    const button = event.target.closest('button[data-option]');
    if (!button) return;
    const value = button.dataset.option || null;
    state[button.dataset.key] = value;
    selected = value ? groupFor[button.dataset.key] : 'missing';
    render();
  });
  document.getElementById('items').addEventListener('click', event => {
    const button = event.target.closest('button[data-item]');
    if (button) { selected = button.dataset.item; render(); }
  });
  document.querySelector('.langs').addEventListener('click', event => {
    const button = event.target.closest('button[data-lang]');
    if (button) { window.GlobalState.lang = button.dataset.lang; render(); }
  });
  document.getElementById('search').addEventListener('input', () => renderCatalog(activeIds()));
  function download() {
    const url = URL.createObjectURL(new Blob([catalog.documentHtml()], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'result-copy-worksheet-2026-11-18.html';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  document.getElementById('download').addEventListener('click', download);
  document.querySelector('[data-download]').addEventListener('click', download);
  render();
})();
