/*
 * 이레 수학 · DT (정의 Definition · 정리 Theorem) 페이지 프로그램 → hw-site/assets/dt.js
 * 데이터는 assets/dt-data.js 의 window.DT_COURSES (irae-src/dt-map.js 에서 만듦)
 *   배우기: 과정별 DT 카드. 앞 DT를 누르면 그 카드로 감
 *   외우기: 카드를 보고 떠올린 뒤 [정답 보기] → [알았어요]/[다시 볼래요]. 다시 볼 카드는 뒤로 돌아옴
 *   이레 DT집: 외운 카드 모아 보기
 *   익히기 길: 앞 DT 순서대로 한 장씩 — 배우기 → 외우기 → 문제로 익히기(practice.html, 80% 이상) → 다음 카드가 열림.
 *             익힌 카드가 모이면 섞어 풀기(처음 보는 꼴에도 꺼내 쓰기)
 * 기록: localStorage 'irae-dt-known' = { 카드번호: 외운 날 }, 'irae-dt-course', 'irae-dt-tab'
 *       문제로 익힌 기록은 DT 연습 화면이 'irae-dtp-stage-best' = { 카드번호: 가장 많이 맞힌 수 } 에 둠
 */
(function () {
  const CFG = window.QUIZ_CONFIG || {};
  const COURSES = window.DT_COURSES || [];
  const PARTS = [...new Set(COURSES.map(c => c.part))];
  const BY_ID = new Map();
  for (const c of COURSES) for (const it of c.items) BY_ID.set(it.id, Object.assign(it, { course: c.id }));
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function load(name, fb) { try { const v = JSON.parse(localStorage.getItem('irae-dt-' + name)); return v == null ? fb : v; } catch (e) { return fb; } }
  function save(name, v) { try { localStorage.setItem('irae-dt-' + name, JSON.stringify(v)); } catch (e) {} }
  function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

  let course = load('course', COURSES.length ? COURSES[0].id : '');
  // dt.html?c=M1 처럼 과정을 정해서 열 수 있음 (이레 학년 페이지의 'DT 카드' 버튼)
  const qc = new URLSearchParams(location.search).get('c');
  if (qc && COURSES.some(c => c.id === qc)) { course = qc; save('course', course); }
  if (!COURSES.some(c => c.id === course)) course = COURSES.length ? COURSES[0].id : '';
  let tab = load('tab', 'path');
  if (!['path', 'learn', 'memo', 'book'].includes(tab)) tab = 'path';
  // dt.html?next=E1 : DT 연습을 마치고 돌아오면 그 학년의 익히기 길로
  const qn = new URLSearchParams(location.search).get('next');
  if (qn !== null) { tab = 'path'; save('tab', tab); if (COURSES.some(c => c.id === qn)) { course = qn; save('course', course); } }
  let query = '';
  let focusId = '';
  // 외우기 진행 (새로고침해도 이어서)
  let memo = load('memo', null);
  const known = () => load('known', {});
  const cur = () => COURSES.find(c => c.id === course);
  const KIND = { D: '정의', T: '정리' };
  // ── 익힘: 외웠고, 풀 문제가 있으면 DT 연습에서 80% 이상 맞힌 적이 있음 (practice.html 과 같은 기준) ──
  const COUNTS = window.DT_COUNTS || {};
  const PRACTICE = CFG.practicePage || 'practice.html';
  const countOf = id => COUNTS[id] || 0;
  const passOf = id => Math.ceil(Math.min(10, countOf(id)) * 0.8);
  function bestOf(id) { try { return (JSON.parse(localStorage.getItem('irae-dtp-stage-best')) || {})[id] || 0; } catch (e) { return 0; } }
  const solved = id => !countOf(id) || bestOf(id) >= passOf(id);
  const mastered = id => !!known()[id] && solved(id);
  // 열림: 같은 학년 안의 앞 DT를 모두 익힘 (다른 학년의 앞 DT는 그 학년 길에서)
  const isOpen = it => it.pre.every(p => !BY_ID.has(p) || BY_ID.get(p).course !== it.course || mastered(p));
  const stateOf = it => mastered(it.id) ? 'done' : !isOpen(it) ? 'lock' : known()[it.id] ? 'solve' : 'learn';
  const nextCard = c => c.items.find(it => stateOf(it) === 'learn' || stateOf(it) === 'solve');
  const practiceBtn = (it, cls = 'ghost') => countOf(it.id) ? `<a class="btn ${cls} small" href="${PRACTICE}?dt=${encodeURIComponent(it.id)}">문제로 익히기 (${countOf(it.id)}문제)${solved(it.id) && bestOf(it.id) ? ' ✓' : ''}</a>` : '';

  // ── 외우기 빈칸: 정의 카드는 정의하는 말(이름의 낱말)을 문장에서 비움 ──
  function blankTerms(it) {
    if (it.k !== 'D') return [];
    const words = it.name.split(/[·・,()\s]+/).map(w => w.replace(/(와|과)$/, '')).filter(w => w.length >= 2 && it.text.includes(w));
    return [...new Set(words)].sort((a, b) => b.length - a.length);
  }
  function blanked(it) {
    const terms = blankTerms(it);
    if (!terms.length) return '';
    let html = esc(it.text);
    const re = new RegExp(terms.map(t => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    // 같은 낱말은 같은 번호 빈칸
    const num = new Map();
    html = html.replace(re, m => { if (!num.has(m)) num.set(m, num.size + 1); return `<span class="dt-blank">(${num.get(m)})</span>`; });
    return num.size ? html : '';
  }

  // ── 카드 그리기 ──
  function preLinks(it) {
    if (!it.pre.length) return '<span class="dt-none">없음 (처음 배우는 카드)</span>';
    return it.pre.map(p => {
      const t = BY_ID.get(p);
      return `<button class="dt-pre" type="button" data-go="${esc(p)}">${esc(p)}${t ? ` ${esc(t.name)}` : ''}</button>`;
    }).join('');
  }
  function cardHTML(it, opts = {}) {
    const k = known()[it.id];
    return `<article class="dt-card ${it.k === 'D' ? 'is-d' : 'is-t'}${it.id === focusId ? ' focus' : ''}" id="dt-${esc(it.id)}">
      <div class="dt-head"><span class="dt-id">${esc(it.id)}</span><span class="dt-kind">${KIND[it.k]}</span><strong class="dt-name">${esc(it.name)}</strong>${mastered(it.id) ? '<span class="dt-known dt-mastered" title="외우고 문제로 익힌 카드">익힘 ✓</span>' : k ? '<span class="dt-known" title="외운 카드">외움 ✓</span>' : ''}</div>
      <p class="dt-text">${esc(it.text)}</p>
      ${it.app ? `<p class="dt-app"><b>적용</b> ${esc(it.app)}</p>` : ''}
      ${opts.compact ? '' : `<div class="dt-meta"><span class="dt-lbl">앞 DT</span><div class="dt-pres">${preLinks(it)}</div></div>
      <div class="dt-meta"><span class="dt-lbl">성취기준</span><span class="dt-std">${it.std.map(s => esc(s)).join(', ')}</span></div>`}
      ${opts.compact ? '' : `<div class="dt-actions dt-card-acts">${practiceBtn(it)}</div>`}
      ${opts.unknow ? `<button class="btn ghost small" type="button" data-unknow="${esc(it.id)}">다시 외우기로 보내기</button>` : ''}
    </article>`;
  }

  let pickerOpen = false;   // CFG.compact: 학년 고르기를 펼쳤는지
  function renderPicker() {
    const c = cur();
    if (!c) { $('#picker').innerHTML = '<p class="empty">DT 카드가 아직 없어요.</p>'; return; }
    const kn = known();
    if (CFG.compact && !pickerOpen) {
      $('#picker').innerHTML = `<div class="pick-sum"><span class="pick-now"><span class="pick-part">${esc(c.part)}</span> ${esc(c.label)}</span>
        <button class="btn ghost small" type="button" data-act="picker-open" aria-expanded="false">학년 바꾸기 ▾</button></div>`;
      return;
    }
    $('#picker').innerHTML = `${CFG.compact ? `<div class="pick-sum"><span class="pick-now">학년 고르기</span><button class="btn ghost small" type="button" data-act="picker-close" aria-expanded="true">접기 ▴</button></div>` : ''}
      <div class="pick-row"><span class="lbl">과정</span>
        <div class="chips levels ops">${PARTS.map(p => `<button class="chip" type="button" data-part="${esc(p)}" aria-pressed="${p === c.part}">${esc(p)}</button>`).join('')}</div></div>
      <div class="pick-row"><span class="lbl">학년</span>
        <div class="chips levels">${COURSES.filter(x => x.part === c.part).map(x => {
          const n = x.items.filter(it => mastered(it.id)).length;
          return `<button class="chip dt-chip" type="button" data-course="${x.id}" aria-pressed="${x.id === course}">${esc(x.label)}<span class="n">${n}/${x.items.length}</span></button>`;
        }).join('')}</div></div>`;
  }
  function renderTabs() {
    const c = cur(); if (!c) { $('#tabs').innerHTML = ''; return; }
    const kn = known();
    const left = c.items.filter(it => !kn[it.id]).length;
    const all = Object.keys(kn).filter(id => BY_ID.has(id)).length;
    const tabs = [['path', '익히기 길', `${c.items.filter(it => mastered(it.id)).length}/${c.items.length}`], ['learn', '배우기', c.items.length], ['memo', '외우기', left], ['book', '이레 DT집', all]];
    $('#tabs').innerHTML = tabs.map(([k, name, n]) => `<button class="chip" type="button" data-tab="${k}" aria-pressed="${k === tab}">${name}<span class="n">${n}</span></button>`).join('');
  }
  function renderDay() {
    const c = cur(); if (!c) { $('#day').innerHTML = ''; return; }
    const d = c.items.filter(i => i.k === 'D').length, t = c.items.length - d;
    if (tab === 'path') {
      const m = c.items.filter(it => mastered(it.id)).length;
      $('#day').innerHTML = `${CFG.compact ? '' : `<span class="date">${esc(c.label)} 익히기 길</span><span class="badge">익힌 카드 ${m} / ${c.items.length}</span>`}
        <p class="sub">${CFG.compact ? '한 장씩 <b>배우기 → 외우기 → 문제로 익히기</b>. 문제를 80% 이상 맞히면 다음 카드가 열려요.' : `앞 DT부터 한 장씩 익혀요. 한 장은 <b>배우기 → 외우기 → 문제로 익히기</b> 순서예요. 문제를 ${'80%'} 이상 맞히면 익힌 카드가 되고, 그 카드를 앞 DT로 쓰는 다음 카드가 열려요.`}</p>
        <div class="dt-bar" aria-hidden="true"><span style="width:${Math.round(m / c.items.length * 100)}%"></span></div>`;
    } else if (tab === 'learn') {
      $('#day').innerHTML = `<span class="date">${esc(c.label)} DT</span><span class="badge dt-badge-d">정의 ${d}</span><span class="badge">정리 ${t}</span>
        <p class="sub"><b>정의(D)</b>는 증명하지 않는 약속, <b>정리(T)</b>는 앞 DT로 증명할 수 있는 참인 문장이에요. 카드를 소리 내어 읽고, 그림을 그려 가며 배워요. 모르는 말은 ‘앞 DT’를 눌러 먼저 봐요.</p>
        <input class="dt-search" id="dt-search" type="search" placeholder="번호나 이름으로 찾기 (예: M2-T22, 피타고라스)" value="${esc(query)}" aria-label="DT 찾기">`;
    } else if (tab === 'memo') {
      const left = memo && memo.course === course ? memo.queue.length : c.items.filter(it => !known()[it.id]).length;
      $('#day').innerHTML = `<span class="date">${esc(c.label)} 외우기</span><span class="badge">남은 카드 ${left}</span>
        <p class="sub">카드를 보고 먼저 떠올려 말하거나 써 본 뒤 ‘정답 보기’를 눌러요. 맞게 떠올렸으면 ‘알았어요’, 아니면 ‘다시 볼래요’를 누르면 그 카드가 뒤에 다시 나와요.</p>`;
    } else {
      $('#day').innerHTML = `<span class="date">이레 DT집</span>
        <p class="sub">외우기에서 ‘알았어요’를 누른 카드가 모여요. 학년마다 모은 카드를 다시 읽어 보세요.</p>`;
    }
  }

  // ── 익히기 길 ──
  const STATE_TXT = { done: '익힘 ✓', solve: '문제로 익히기', learn: '배울 차례', lock: '잠김' };
  function pathHTML() {
    const c = cur(), nx = nextCard(c);
    const mixN = c.items.filter(it => mastered(it.id) && countOf(it.id)).length;
    let top;
    if (!nx) top = `<div class="card dt-next done"><p class="dt-done-big">${esc(c.label)} DT를 모두 익혔어요!</p>
      <p>이제 섞어 풀기로 처음 보는 꼴의 문제에도 꺼내 써 봐요.</p>
      <div class="dt-actions">${mixN ? `<a class="btn" href="${PRACTICE}?mix=${c.id}">섞어 풀기</a>` : ''}${COURSES[COURSES.indexOf(c) + 1] ? `<button class="btn ghost" type="button" data-course="${COURSES[COURSES.indexOf(c) + 1].id}">다음 학년: ${esc(COURSES[COURSES.indexOf(c) + 1].label)} →</button>` : ''}</div></div>`;
    else {
      const st = stateOf(nx), kn = !!known()[nx.id];
      top = `<div class="card dt-next ${nx.k === 'D' ? 'is-d' : 'is-t'}"><p class="dt-next-lbl">다음 할 것</p>
        ${cardHTML(nx, { compact: true })}
        <ol class="dt-steps">
          <li class="${'done'}">① 배우기 — 카드를 소리 내어 읽고, 예를 하나 떠올려 봐요.</li>
          <li class="${kn ? 'done' : 'now'}">② 외우기 — 카드를 안 보고 말해 봐요. ${kn ? '✓' : ''}</li>
          <li class="${st === 'solve' ? 'now' : ''}">③ 문제로 익히기 — ${countOf(nx.id) ? `${countOf(nx.id) > 10 ? `${countOf(nx.id)}문제 중 10문제를 풀고` : `${countOf(nx.id)}문제를 모두 풀고`} ${passOf(nx.id)}문제 이상 맞히면 익힘` : '아직 문제가 없어서 외우면 익힘이에요'}</li>
        </ol>
        <div class="dt-actions">${kn ? '' : `<button class="btn" type="button" data-memo-one="${esc(nx.id)}">외우기</button>`}${countOf(nx.id) ? `<a class="btn${kn ? '' : ' ghost'}" href="${PRACTICE}?dt=${encodeURIComponent(nx.id)}">문제로 익히기</a>` : ''}
          ${mixN >= 2 ? `<a class="btn ghost" href="${PRACTICE}?mix=${c.id}">익힌 것 섞어 풀기 (${mixN}장)</a>` : ''}</div></div>`;
    }
    const rows = c.items.map(it => {
      const st = stateOf(it);
      return `<li class="dt-path-row st-${st}${nx && it.id === nx.id ? ' is-next' : ''}">
        <span class="dt-path-k ${it.k === 'D' ? 'is-d' : 'is-t'}">${it.k}</span>
        <button class="dt-path-name" type="button" data-go="${esc(it.id)}"${st === 'lock' ? ' title="앞 DT를 먼저 익혀요"' : ''}><span class="dt-id">${esc(it.id)}</span> ${esc(it.name)}</button>
        <span class="dt-path-st">${STATE_TXT[st]}</span></li>`;
    }).join('');
    return `${top}<ol class="dt-path">${rows}</ol>`;
  }

  // ── 배우기 ──
  function learnHTML() {
    const c = cur();
    const q = query.trim().toLowerCase();
    const list = q ? COURSES.flatMap(x => x.items).filter(it => it.id.toLowerCase().includes(q) || it.name.toLowerCase().includes(q) || it.text.toLowerCase().includes(q)) : c.items;
    if (!list.length) return '<div class="card"><p class="empty">찾는 카드가 없어요.</p></div>';
    return `<div class="dt-list">${q ? `<p class="dt-found">${list.length}장 찾았어요</p>` : ''}${list.map(it => cardHTML(it)).join('')}</div>`;
  }

  // ── 외우기 ──
  function newMemo() {
    const c = cur(), kn = known();
    memo = { course, queue: c.items.filter(it => !kn[it.id]).map(it => it.id), shown: false, done: [], again: [] };
    save('memo', memo);
  }
  function memoHTML() {
    if (!memo || memo.course !== course) newMemo();
    if (!memo.queue.length) {
      const again = [...new Set(memo.again)].filter(id => BY_ID.has(id));
      const pres = [...new Set(again.flatMap(id => BY_ID.get(id).pre))].filter(id => !known()[id]);
      const left = cur().items.filter(it => !known()[it.id]).length;
      return `<div class="card dt-done">
        <p class="dt-done-big">${left ? '오늘 외우기를 마쳤어요!' : `${esc(cur().label)} DT를 모두 외웠어요!`}</p>
        <p>이번에 외운 카드 ${memo.done.length}장${again.length ? ` · 다시 본 카드 ${again.length}장` : ''}</p>
        ${pres.length ? `<p class="dt-tip">자꾸 막히는 카드는 앞 DT부터 다시 봐요:</p><div class="dt-pres">${pres.map(p => `<button class="dt-pre" type="button" data-go="${esc(p)}">${esc(p)} ${esc(BY_ID.get(p).name)}</button>`).join('')}</div>` : ''}
        <div class="dt-actions">${memo.one ? `<button class="btn" type="button" data-tab="path">익히기 길로 →</button>` : ''}${left && !memo.one ? '<button class="btn" type="button" data-act="memo-restart">남은 카드 다시 외우기</button>' : ''}<button class="btn ghost" type="button" data-tab="book">이레 DT집 보기</button></div>
      </div>`;
    }
    const it = BY_ID.get(memo.queue[0]);
    const bl = blanked(it);
    const prompt = bl
      ? `<p class="dt-ask">빈칸에 들어갈 말을 떠올려 보세요.</p><p class="dt-text">${bl}</p>`
      : `<p class="dt-ask">${it.k === 'D' ? '이 말의 뜻(정의)을 떠올려 말해 보세요.' : '이 정리의 내용을 떠올려 말해 보세요.'}</p><p class="dt-front">${esc(it.name)}</p>`;
    return `<div class="card dt-memo ${it.k === 'D' ? 'is-d' : 'is-t'}">
      <div class="dt-head"><span class="dt-id">${esc(it.id)}</span><span class="dt-kind">${KIND[it.k]}</span>${bl ? `<strong class="dt-name">${esc(it.name.replace(/./g, '○'))}</strong>` : ''}<span class="dt-left">${memo.done.length + 1} / ${memo.done.length + memo.queue.length}</span></div>
      ${memo.shown ? `<div class="dt-answer">${cardHTML(it, { compact: true })}</div>
        <div class="dt-actions"><button class="btn" type="button" data-act="memo-ok">알았어요 ✓</button><button class="btn ghost" type="button" data-act="memo-again">다시 볼래요</button></div>`
      : `${prompt}<div class="dt-actions"><button class="btn" type="button" data-act="memo-show">정답 보기</button></div>`}
    </div>`;
  }

  // ── 이레 DT집 ──
  function bookHTML() {
    const kn = known();
    const got = COURSES.map(c => ({ c, items: c.items.filter(it => kn[it.id]) })).filter(x => x.items.length);
    if (!got.length) return '<div class="card"><p class="empty">아직 모은 카드가 없어요. ‘외우기’에서 ‘알았어요’를 누르면 여기에 모여요.</p></div>';
    return got.map(({ c, items }) => `<section class="dt-book">
      <h2>${esc(c.label)} <span class="n">${items.length} / ${c.items.length}</span></h2>
      <div class="dt-bar" aria-hidden="true"><span style="width:${Math.round(items.length / c.items.length * 100)}%"></span></div>
      <div class="dt-list">${items.map(it => cardHTML(it, { compact: true, unknow: true })).join('')}</div>
    </section>`).join('');
  }

  function renderStage() {
    const st = $('#stage');
    if (!cur()) { st.innerHTML = ''; return; }
    st.innerHTML = tab === 'path' ? pathHTML() : tab === 'learn' ? learnHTML() : tab === 'memo' ? memoHTML() : bookHTML();
    if (focusId) {
      const el = document.getElementById('dt-' + focusId);
      if (el) el.scrollIntoView({ block: 'center' });
    }
  }
  function renderAll() { renderPicker(); renderTabs(); renderDay(); renderStage(); recordLast(); }
  // 첫 화면의 [이어서 풀기] (CFG.lastKey)
  function recordLast() {
    const c = cur(); if (!CFG.lastKey || !c) return;
    const nx = nextCard(c);
    try { localStorage.setItem(CFG.lastKey, JSON.stringify({ href: 'dt.html', title: 'DT 익히기', sub: `${c.label}${nx ? ' · 다음: ' + nx.name : ' · 다 익혔어요'}`, at: Date.now() })); } catch (e) {}
  }

  function go(id) {
    const it = BY_ID.get(id); if (!it) return;
    course = it.course; save('course', course);
    tab = 'learn'; save('tab', tab); query = ''; focusId = id;
    renderAll();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !$('#app').contains(b)) return;
    // 학년·메뉴를 직접 고르면 주소의 #카드번호를 지움 (새로고침했을 때 그 카드로 되돌아가지 않게)
    if ((b.dataset.part || b.dataset.course || b.dataset.tab) && location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (b.dataset.part) { const c = COURSES.find(x => x.part === b.dataset.part); if (c && c.part !== cur().part) { course = c.id; save('course', course); focusId = ''; renderAll(); } return; }
    if (b.dataset.act === 'picker-open' || b.dataset.act === 'picker-close') { pickerOpen = b.dataset.act === 'picker-open'; renderPicker(); return; }
    if (b.dataset.course) { pickerOpen = false; course = b.dataset.course; save('course', course); focusId = ''; query = ''; renderAll(); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; save('tab', tab); focusId = ''; renderAll(); window.scrollTo({ top: $('#tabs').offsetTop - 12 }); return; }
    if (b.dataset.go) { go(b.dataset.go); history.replaceState(null, '', '#' + b.dataset.go); return; }
    if (b.dataset.unknow) { const kn = known(); delete kn[b.dataset.unknow]; save('known', kn); if (memo && memo.course === BY_ID.get(b.dataset.unknow).course && !memo.queue.includes(b.dataset.unknow)) { memo.queue.push(b.dataset.unknow); save('memo', memo); } renderAll(); return; }
    const act = b.dataset.act;
    if (act === 'memo-show') { memo.shown = true; save('memo', memo); renderStage(); return; }
    if (act === 'memo-ok') {
      const id = memo.queue.shift(); const kn = known(); kn[id] = today(); save('known', kn);
      memo.done.push(id); memo.shown = false; save('memo', memo); renderAll(); return;
    }
    if (act === 'memo-again') { const id = memo.queue.shift(); memo.queue.push(id); memo.again.push(id); memo.shown = false; save('memo', memo); renderAll(); return; }
    if (act === 'memo-restart') { newMemo(); renderAll(); return; }
    if (b.dataset.memoOne) { memo = { course, queue: [b.dataset.memoOne], shown: false, done: [], again: [], one: true }; save('memo', memo); tab = 'memo'; save('tab', tab); renderAll(); window.scrollTo({ top: $('#tabs').offsetTop - 12 }); return; }
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'dt-search') return;
    query = e.target.value; focusId = '';
    renderStage();
  });

  // 뼈대 (숙제 페이지와 같은 머리글)
  const VER_TAG = (function () {
    const m = ((document.currentScript && document.currentScript.src) || '').match(/[?&]v=(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (!m) return '';
    const t = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) + 9 * 36e5), p = n => String(n).padStart(2, '0');
    return `<br><span class="ver">버전 ${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}</span>`;
  })();
  const rest = CFG.title && CFG.logoText && CFG.title.startsWith(CFG.logoText) ? CFG.title.slice(CFG.logoText.length).trim() : CFG.title;
  document.title = CFG.title || '이레 수학 DT';
  $('#app').innerHTML = CFG.compact ? `
    <header class="cbar"><a class="home" href="${CFG.home || 'index.html'}">${CFG.homeLabel || '← 처음'}</a><h1>${CFG.shortTitle || CFG.title}</h1></header>
    <section class="picker" id="picker" aria-label="학년"></section>
    <nav class="chips" id="tabs" aria-label="DT 메뉴"></nav>
    <section class="day" id="day" aria-live="polite"></section>
    <main id="stage"></main>
    <footer>${CFG.footer || ''}${VER_TAG}</footer>` : `
    <header>
      <a class="home" href="${CFG.home || 'index.html'}">${CFG.homeLabel || '← 숙제로'}</a>
      <span class="eyebrow">${CFG.eyebrow || ''}</span>
      ${CFG.logo ? `<div class="brand-row"><img class="brand-wide" src="${CFG.logo}" alt="${CFG.logoText}"><h1><span class="sr">${CFG.logoText} </span>${rest}</h1></div>` : `<h1>${CFG.title}</h1>`}
      <p class="lead">${CFG.lead || ''}</p>
      ${(CFG.links || []).map(l => `<a class="app-link" href="${l.href}">${l.label}</a>`).join('')}
    </header>
    <section class="picker" id="picker" aria-label="과정과 학년"></section>
    <nav class="chips" id="tabs" aria-label="DT 메뉴"></nav>
    <section class="day" id="day" aria-live="polite"></section>
    <main id="stage"></main>
    <footer>${CFG.footer || ''}${VER_TAG}</footer>`;
  const hashId = decodeURIComponent(location.hash.slice(1));
  if (BY_ID.has(hashId)) go(hashId); else renderAll();
  window.addEventListener('hashchange', () => { const id = decodeURIComponent(location.hash.slice(1)); if (BY_ID.has(id)) go(id); });
  window.DT_DEBUG = { course: () => course, known, memo: () => memo, blanked: id => blanked(BY_ID.get(id)), byId: id => BY_ID.get(id), mastered, stateOf: id => stateOf(BY_ID.get(id)), nextCard: () => nextCard(cur()), countOf };
})();
