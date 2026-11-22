/* 결과 제목 새 초안 (11/21, Claude 초안 · 작가 검토용). 앱(copy.js)에는 아직 넣지 않았습니다.
 * 1) 동물 유형: 청감 코드에 담긴 값만으로 정해서, 나중에 청감타워·휴대폰에서도 같은 동물을 보여 줄 수 있습니다.
 * 2) 행동 한 줄: 검사하는 동안의 시간·조작량으로 정합니다. 코드에 없는 값이라 아이패드에서만 보입니다.
 * 근거에 충실하기보다 재미있고 조금 충격적인 쪽으로 썼습니다(사용자 요청). 동물 고르기는 위에서부터 먼저 맞는 것 하나. */
/* 동물 유형 + 행동 한 줄 미리보기 (11/22 앱 반영). 앱과 같은 규칙을 그대로 불러옵니다:
 * 동물은 cloud/snailAnimal.js(청감 코드로 판정, 청감타워 휴대폰과 같음), 행동 한 줄은 copy.js의 BEHAVIOUR_LINES·getBehaviourLine
 * (아이패드 결과 화면에만 잠깐 보이고 저장·전송하지 않음). */
const AnimalDraft = (() => {
  const catalog = ResultCopyCatalog;
  const animals = window.SnailAnimal.LIST;
  const behaviours = BEHAVIOUR_LINES;
  const codeFor = s => getFullEarCode(catalog.profile(s), catalog.psycho(s));
  const animalFor = s => window.SnailAnimal.fromCode(codeFor(s));
  const behaviourFor = b => behaviours.find(x => x.test({ adjustSec: null, turnDb: null, answerSec: null, ...b }));

  // 동물이 한쪽으로 몰리지 않는지 보려고, 가정한 관람객 분포로 2만 명을 뽑아 비율을 셈
  function distribution(n = 20000) {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const normal = (m, sd) => m + sd * Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const counts = Object.fromEntries(animals.map(a => [a.id, 0]));
    for (let i = 0; i < n; i++) {
      const s = {
        volDb: clamp(normal(-19, 7), -40, 0), lowDb: clamp(normal(0, 5), -10, 10), highDb: clamp(normal(0, 5), -10, 10),
        register: ['LOW', 'MID', 'HIGH'][Math.floor(rand() * 3)], maxHz: clamp(normal(15500, 1400), 8000, 20000), maxMeasured: true,
        centerDeg: clamp(normal(0, 12), -90, 90), centerMeasured: true, ear: rand() < .5 ? 'LEFT' : 'RIGHT', pitch: 'F'
      };
      counts[animalFor(s).id]++;
    }
    return animals.map(a => ({ ...a, share: counts[a.id] / n }));
  }
  return { animals, behaviours, animalFor, behaviourFor, distribution };
})();

(() => {
  const catalog = ResultCopyCatalog, esc = catalog.escape;
  const state = { ...catalog.defaults };
  const beh = { adjustSec: 9, turnDb: 22, answerSec: 1.8 };
  const slider = (key, label, min, max, step, ends, measured) => `<div class="control"><div class="control-top"><label for="${key}">${label}</label><output class="value" data-value="${key}"></output></div>
    <input id="${key}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state[key] ?? beh[key]}">
    <div class="ends"><span>${ends[0]}</span><span>${ends[1]}</span></div>
    ${measured ? `<div class="check"><input id="${measured}" data-key="${measured}" type="checkbox" checked><label for="${measured}">측정 결과 있음</label></div>` : ''}</div>`;
  const choice = (key, label, options) => `<div class="control"><div id="label-${key}"><b>${label}</b></div><div class="options" role="group" aria-labelledby="label-${key}">
    ${options.map(([v, t]) => `<button type="button" data-key="${key}" data-option="${v ?? ''}">${t}</button>`).join('')}</div></div>`;
  const controls = document.getElementById('controls');
  controls.innerHTML = `<p class="part">검사 결과 → 동물</p>
    ${slider('volDb', '① 편한 크기', -40, 0, 1, ['작게', '크게'])}
    ${slider('lowDb', '② 저음', -10, 10, .5, ['덜어냄', '더함'])}
    ${slider('highDb', '③ 고음', -10, 10, .5, ['덜어냄', '더함'])}
    ${choice('register', '④ 멜로디 음역', [['LOW', 'A 낮은'], ['MID', 'B 가운데'], ['HIGH', 'C 높은'], [null, '결과 없음']])}
    ${slider('maxHz', '⑤ 고역 한계', 8000, 20000, 100, ['8 kHz', '20 kHz'], 'maxMeasured')}
    ${slider('centerDeg', '⑥ 편한 자리', -90, 90, 1, ['왼쪽', '오른쪽'], 'centerMeasured')}
    ${choice('ear', '⑦ 우세 귀', [['LEFT', '왼쪽'], ['RIGHT', '오른쪽'], [null, '결과 없음']])}
    ${choice('pitch', '⑧ 바탕음·배음', [['F', 'F 바탕음'], ['B', 'B 함께'], ['H', 'H 배음'], [null, '결과 없음']])}
    <p class="part">검사하는 동안의 행동 → 한 줄</p>
    ${slider('adjustSec', '①②③ 단계마다 조절한 시간(평균)', 2, 40, 1, ['짧게', '오래'])}
    ${slider('turnDb', '①②③ 노브를 돌린 양(평균)', 0, 80, 1, ['조금', '많이'])}
    ${slider('answerSec', '⑦⑧ 답하기까지 걸린 시간(평균)', .3, 6, .1, ['바로', '천천히'])}`;
  const formats = {
    volDb: v => `${v} dB`, lowDb: v => `${v > 0 ? '+' : ''}${v} dB`, highDb: v => `${v > 0 ? '+' : ''}${v} dB`,
    maxHz: v => `${(v / 1000).toFixed(1)} kHz`, centerDeg: v => `${v > 0 ? '+' : ''}${v}°`,
    adjustSec: v => `${v}초`, turnDb: v => `${v} dB`, answerSec: v => `${v.toFixed(1)}초`
  };

  function render() {
    const lang = window.GlobalState.lang, en = lang === 'en';
    const a = AnimalDraft.animalFor(state), b = AnimalDraft.behaviourFor(beh), r = catalog.analyse(state, lang);
    if (a.id !== r.animal) throw new Error('미리보기와 앱의 동물이 다릅니다');
    const res = document.getElementById('result'); res.lang = lang;
    document.getElementById('code').textContent = r.code;
    document.getElementById('animal').textContent = en ? `You're a ${a.en} Snail!` : `${a.ko} 달팽이예요!`;
    document.getElementById('animal-line').textContent = en ? a.lineEn : a.lineKo;
    document.getElementById('behaviour').textContent = en ? b.lineEn : b.lineKo;
    document.getElementById('why').innerHTML = `<b>${esc(a.ko)}</b>: ${esc(a.rule)} · <b>${esc(b.ko)}</b>: ${esc(b.rule)}`;
    document.getElementById('items').innerHTML = Object.entries(r.items).map(([k, v]) => `<li><span class="tag">${catalog.tags[k]}</span><span>${esc(v)}</span></li>`).join('');
    document.getElementById('old-title').textContent = r.title;
    Object.entries(formats).forEach(([key, f]) => {
      const flag = { maxHz: 'maxMeasured', centerDeg: 'centerMeasured' }[key];
      const val = key in beh ? beh[key] : state[key];
      controls.querySelector(`[data-value="${key}"]`).textContent = flag && !state[flag] ? '결과 없음' : f(val);
      controls.querySelector(`input[data-key="${key}"]`).disabled = flag ? !state[flag] : false;
    });
    controls.querySelectorAll('button[data-option]').forEach(btn => { const on = state[btn.dataset.key] === (btn.dataset.option || null); btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on)); });
    document.querySelectorAll('[data-lang]').forEach(btn => { const on = btn.dataset.lang === lang; btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on)); });
    document.querySelectorAll('#animal-table tr[data-id]').forEach(tr => tr.classList.toggle('current', tr.dataset.id === a.id));
    document.querySelectorAll('#behaviour-table tr[data-id]').forEach(tr => tr.classList.toggle('current', tr.dataset.id === b.id));
  }
  controls.addEventListener('input', e => {
    const k = e.target.dataset.key; if (!k) return;
    if (k in beh) beh[k] = Number(e.target.value);
    else state[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    render();
  });
  controls.addEventListener('click', e => { const btn = e.target.closest('button[data-option]'); if (!btn) return; state[btn.dataset.key] = btn.dataset.option || null; render(); });
  document.querySelector('.langs').addEventListener('click', e => { const btn = e.target.closest('button[data-lang]'); if (btn) { window.GlobalState.lang = btn.dataset.lang; render(); } });

  const dist = AnimalDraft.distribution();
  document.getElementById('animal-table').innerHTML = `<thead><tr><th>순서 · 조건</th><th lang="ko">한국어</th><th lang="en">English</th></tr></thead><tbody>${
    AnimalDraft.animals.map((a, i) => `<tr data-id="${a.id}"><td><span class="id">${i + 1}. ${esc(a.ko)} · ${esc(a.en)}</span>${esc(a.rule)}<small class="note">가정한 관람객 중 약 ${Math.round(dist[i].share * 100)}%</small><small class="current-label">현재 결과</small></td>
      <td data-label="한국어" lang="ko"><b>${esc(a.ko)} 달팽이예요!</b><br>${esc(a.lineKo)}</td><td data-label="English" lang="en"><b>You're a ${esc(a.en)} Snail!</b><br>${esc(a.lineEn)}</td></tr>`).join('')}</tbody>`;
  document.getElementById('behaviour-table').innerHTML = `<thead><tr><th>순서 · 조건</th><th lang="ko">한국어</th><th lang="en">English</th></tr></thead><tbody>${
    AnimalDraft.behaviours.map((b, i) => `<tr data-id="${b.id}"><td><span class="id">${i + 1}. ${esc(b.ko)}</span>${esc(b.rule)}<small class="current-label">현재 결과</small></td>
      <td data-label="한국어" lang="ko">${esc(b.lineKo)}</td><td data-label="English" lang="en">${esc(b.lineEn)}</td></tr>`).join('')}</tbody>`;
  render();
})();
