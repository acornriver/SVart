/* 결과 제목 새 초안 (11/21, Claude 초안 · 작가 검토용). 앱(copy.js)에는 아직 넣지 않았습니다.
 * 1) 동물 유형: 청감 코드에 담긴 값만으로 정해서, 나중에 청감타워·휴대폰에서도 같은 동물을 보여 줄 수 있습니다.
 * 2) 행동 한 줄: 검사하는 동안의 시간·조작량으로 정합니다. 코드에 없는 값이라 아이패드에서만 보입니다.
 * 근거에 충실하기보다 재미있고 조금 충격적인 쪽으로 썼습니다(사용자 요청). 동물 고르기는 위에서부터 먼저 맞는 것 하나. */
const AnimalDraft = (() => {
  // 위에서부터 먼저 맞는 동물 하나. when(v)의 v는 아래 traits()가 만든 값
  const animals = [
    { id: 'BAT', ko: '박쥐', en: 'Bat', emoji: '🦇',
      rule: '⑤ 고역 한계 17 kHz 이상', when: v => v.maxHz !== null && v.maxHz >= 17000,
      lineKo: '남들한텐 조용한 방도 당신에겐 시끄러워요. 박쥐랑 수다 떨 수 있는 귀!',
      lineEn: 'A silent room is never silent for you. You could gossip with bats.' },
    { id: 'PEACOCK', ko: '공작', en: 'Peacock', emoji: '🦚',
      rule: '② 저음 더함 + ③ 고음 더함', when: v => v.low === 'W' && v.high === 'S',
      lineKo: '저음도 고음도 다 크게! 소리도 화려하게 펼쳐야 직성이 풀려요.',
      lineEn: 'Big bass, big treble. Your sound has to fan out every feather.' },
    { id: 'HIPPO', ko: '하마', en: 'Hippo', emoji: '🦛',
      rule: '② 저음 더함', when: v => v.low === 'W',
      lineKo: '쿵, 쿵. 강바닥까지 울리는 저음이 있어야 마음이 놓여요.',
      lineEn: 'Boom, boom. You need bass that shakes the riverbed.' },
    { id: 'DOLPHIN', ko: '돌고래', en: 'Dolphin', emoji: '🐬',
      rule: '③ 고음 더함', when: v => v.high === 'S',
      lineKo: '반짝이는 고음이 좋아요. 바닷속에서 끝없이 신호를 보내는 타입!',
      lineEn: 'You love sparkling highs. Always sending signals under the sea.' },
    { id: 'SLOTH', ko: '나무늘보', en: 'Sloth', emoji: '🦥',
      rule: '② 저음 덜어냄 + ③ 고음 덜어냄', when: v => v.low === 'T' && v.high === 'V',
      lineKo: '저음도 고음도 덜어낸 담백한 소리. 느긋하게, 조용하게, 천천히.',
      lineEn: 'Less bass, less treble. Slow, calm and plain is perfect.' },
    { id: 'LION', ko: '사자', en: 'Lion', emoji: '🦁',
      rule: '① 편한 크기 −12 dB 이상(크게)', when: v => v.volDb >= -12,
      lineKo: '크게, 더 크게! 어떤 소리 앞에서도 물러서지 않아요.',
      lineEn: 'Louder, louder! You never back down from a sound.' },
    { id: 'CAT', ko: '고양이', en: 'Cat', emoji: '🐈',
      rule: '① 편한 크기 −26 dB 이하(작게)', when: v => v.volDb <= -26,
      lineKo: '작게 틀어도 다 들려요. 몰래 엿듣는 데는 천재.',
      lineEn: 'Even the quietest sounds reach you. A genius eavesdropper.' },
    { id: 'WHALE', ko: '고래', en: 'Whale', emoji: '🐋',
      rule: '④ 멜로디 A(낮은 음) 선택', when: v => v.register === 'LOW',
      lineKo: '낮은 멜로디가 제일 편해요. 깊은 바다에서 노래하는 귀.',
      lineEn: 'Low melodies feel best. You sing from the deep sea.' },
    { id: 'SQUIRREL', ko: '다람쥐', en: 'Squirrel', emoji: '🐿️',
      rule: '④ 멜로디 C(높은 음) 선택', when: v => v.register === 'HIGH',
      lineKo: '높은 멜로디가 제일 편해요. 나무 꼭대기에서 재잘재잘.',
      lineEn: 'High melodies feel best. Chattering away at the treetops.' },
    { id: 'OWL', ko: '부엉이', en: 'Owl', emoji: '🦉',
      rule: '⑥ 편한 자리가 가운데', when: v => v.center === 'C',
      lineKo: '소리가 딱 가운데 있을 때 편해요. 균형 감각이 남다른 밤의 귀.',
      lineEn: 'You like sound right in the middle. A night ear with perfect balance.' },
    { id: 'BEAR', ko: '곰', en: 'Bear', emoji: '🐻',
      rule: '위 어디에도 해당하지 않음', when: () => true,
      lineKo: '무던하고 든든한 귀. 어떤 소리든 일단 꼭 안아 줘요.',
      lineEn: 'Easygoing and steady. You give every sound a big hug.' }
  ];

  // 행동 한 줄: 위에서부터 먼저 맞는 것 하나 (기준값은 Claude 초안)
  const behaviours = [
    { id: 'ADVENTURER', ko: '모험가 스타일', en: 'Adventurer style',
      rule: '①②③ 노브를 평균 40 dB 이상 돌림', when: b => b.turnDb >= 40,
      lineKo: '끝에서 끝까지 다 돌려 본 모험가 스타일이에요!', lineEn: 'You turned every knob end to end. Adventurer style!' },
    { id: 'DETECTIVE', ko: '탐정 스타일', en: 'Detective style',
      rule: '①②③ 평균 15초 이상 조절', when: b => b.adjustSec >= 15,
      lineKo: '오래오래 듣고 골랐어요. 꼼꼼한 탐정 스타일!', lineEn: 'You listened long and chose with care. Detective style!' },
    { id: 'LIGHTNING', ko: '번개 직감파', en: 'Lightning instinct',
      rule: '⑦⑧ 평균 1초 안에 답함', when: b => b.answerSec <= 1,
      lineKo: '듣자마자 바로 답! 번개 같은 직감파예요.', lineEn: 'You answered the moment you heard it. Lightning instinct!' },
    { id: 'PHILOSOPHER', ko: '철학자 스타일', en: 'Philosopher style',
      rule: '⑦⑧ 평균 3초 이상 고민', when: b => b.answerSec >= 3,
      lineKo: '답 하나에도 깊이 고민했어요. 생각 많은 철학자 스타일.', lineEn: 'Every answer got deep thought. Philosopher style.' },
    { id: 'DECIDER', ko: '결단파', en: 'Quick decider',
      rule: '①②③ 평균 5초 이하 조절', when: b => b.adjustSec <= 5,
      lineKo: '처음 느낌을 믿고 바로 정했어요. 시원한 결단파!', lineEn: 'You trusted your first feeling. A quick decider!' },
    { id: 'STEADY', ko: '차근차근', en: 'Steady pace',
      rule: '위 어디에도 해당하지 않음', when: () => true,
      lineKo: '자기 속도대로 차근차근 들었어요.', lineEn: 'You listened at your own steady pace.' }
  ];

  // 미리보기 입력값 → 동물 고르기에 쓰는 값 (모두 청감 코드에 들어 있는 값)
  function traits(s) {
    const centerImage = Math.abs(s.centerDeg) <= 5 ? 'C' : s.centerDeg > 0 ? 'R' : 'L';
    return {
      low: shelfToLetter(s.lowDb, 'LOW'), high: shelfToLetter(s.highDb, 'HIGH'), volDb: s.volDb,
      register: s.register, maxHz: s.maxMeasured ? s.maxHz : null,
      center: s.centerMeasured ? centerImage : null, ear: s.ear, pitch: s.pitch
    };
  }
  const animalFor = s => animals.find(a => a.when(traits(s)));
  const behaviourFor = b => behaviours.find(x => x.when(b));

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
  return { animals, behaviours, traits, animalFor, behaviourFor, distribution };
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
    const res = document.getElementById('result'); res.lang = lang;
    document.getElementById('code').textContent = r.code;
    document.getElementById('animal').textContent = en ? `You're a ${a.en} Snail!` : `${a.ko} 달팽이예요!`;
    document.getElementById('emoji').textContent = a.emoji;
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
    AnimalDraft.animals.map((a, i) => `<tr data-id="${a.id}"><td><span class="id">${i + 1}. ${a.emoji} ${esc(a.ko)} · ${esc(a.en)}</span>${esc(a.rule)}<small class="note">가정한 관람객 중 약 ${Math.round(dist[i].share * 100)}%</small><small class="current-label">현재 결과</small></td>
      <td data-label="한국어" lang="ko"><b>${esc(a.ko)} 달팽이예요!</b><br>${esc(a.lineKo)}</td><td data-label="English" lang="en"><b>You're a ${esc(a.en)} Snail!</b><br>${esc(a.lineEn)}</td></tr>`).join('')}</tbody>`;
  document.getElementById('behaviour-table').innerHTML = `<thead><tr><th>순서 · 조건</th><th lang="ko">한국어</th><th lang="en">English</th></tr></thead><tbody>${
    AnimalDraft.behaviours.map((b, i) => `<tr data-id="${b.id}"><td><span class="id">${i + 1}. ${esc(b.ko)}</span>${esc(b.rule)}<small class="current-label">현재 결과</small></td>
      <td data-label="한국어" lang="ko">${esc(b.lineKo)}</td><td data-label="English" lang="en">${esc(b.lineEn)}</td></tr>`).join('')}</tbody>`;
  render();
})();
