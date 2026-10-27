/*
 * 이레 수학 · 첫 화면 (오늘 할 것) → hw-site/assets/hub.js
 *   [이어서 풀기] 마지막으로 보던 화면 (localStorage 'irae-math-last', 각 화면이 남김)
 *   네 칸: 숙제(homework.html) · 단계별 문제(stage.html) · DT 익히기(dt.html) · 연산 연습(drill.html)
 *   내 학년('irae-math-grade'): 처음 한 번 고르면 DT 학년과 단계별 문제의 과정(초등·중등·고등)을 맞춰 둠
 * 읽는 것: window.HOMEWORK(current.js) · window.HUB_STAGES(단계 목록) · window.QUIZ_OPS/QUIZ_TRACKS(drill-data.js) · window.DT_COURSES/DT_COUNTS(dt-data.js)
 */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const get = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const CFG = window.HUB_CONFIG || {};

  const GRADES = [['E1', '초1'], ['E2', '초2'], ['E3', '초3'], ['E4', '초4'], ['E5', '초5'], ['E6', '초6'], ['M1', '중1'], ['M2', '중2'], ['M3', '중3'], ['H1', '고1'], ['H2', '고2'], ['H3', '고3']];
  const gradeLabel = g => (GRADES.find(x => x[0] === g) || [, ''])[1];
  // 학년 → DT 과정 (고1 공통수학1, 고2 대수, 고3 미적분Ⅰ) · 단계별 문제 과정
  const dtCourseOf = g => ({ H1: 'C1', H2: 'AL', H3: 'CA' })[g] || g;
  const partOf = g => g[0] === 'E' ? '초등' : g[0] === 'M' ? '중등' : '고등';
  let pickGrade = false;

  // ── 숙제 ──
  function kstToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  const toUTC = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  function hwTile() {
    const sets = ((window.HOMEWORK && window.HOMEWORK.sets) || []).filter(s => s && s.id && Array.isArray(s.questions) && s.questions.length);
    if (!sets.length) return { sub: '지금은 숙제가 없어요', quiet: true };
    const cur = get('irae-homework-set', '');
    const s = sets.find(x => x.id === cur) || sets[0];
    const done = get('irae-homework-done', {})[s.id];
    const ses = get('irae-homework-session', {})[s.id];
    const res = ses && Array.isArray(ses.results) ? ses.results : [];
    const n = res.filter(Boolean).length, total = s.questions.length;
    const days = s.due ? Math.round((toUTC(s.due) - toUTC(kstToday())) / 864e5) : null;
    const dueTxt = days == null ? '' : days > 0 ? `D-${days}` : days === 0 ? '오늘 마감' : '마감 지남';
    if (done) return { sub: `다 풀었어요 ✓ ${res.filter(r => r && r.correct).length} / ${total}`, title2: s.label || s.title };
    if (n) return { sub: `${n} / ${total} 푸는 중${dueTxt ? ' · ' + dueTxt : ''}`, title2: s.label || s.title, hot: days == null || days >= 0 };
    return { sub: days != null && days < 0 ? `${total}문제 · 마감이 지났어요` : `${total}문제${dueTxt ? ' · ' + dueTxt : ''}`, title2: s.label || s.title, hot: days == null || days >= 0, badge: days != null && days < 0 ? '' : '새 숙제' };
  }

  // ── 단계별 문제 ──
  const STAGES = window.HUB_STAGES || [];
  const PASS = 8;
  const stageBest = () => get('irae-stage-stage-best', {});
  function stageOpen(id) {
    const i = STAGES.findIndex(x => x.id === id);
    if (i < 0) return false;
    if (i === 0 || STAGES[i - 1].part !== STAGES[i].part) return true;
    return (stageBest()[STAGES[i - 1].id] || 0) >= PASS;
  }
  function stageTile() {
    const st = STAGES.find(x => x.id === get('irae-stage-track-level', '')) || STAGES[0];
    if (!st) return { sub: '' };
    const b = stageBest()[st.id] || 0, stars = b >= 10 ? 3 : b >= 9 ? 2 : b >= PASS ? 1 : 0;
    return { sub: `${st.part} ${STAGES.filter(x => x.part === st.part).indexOf(st) + 1}단계 · ${st.title}`, stars: '★'.repeat(stars) + '☆'.repeat(3 - stars) };
  }

  // ── DT 익히기 (dt-app.js 와 같은 익힘 기준) ──
  const COURSES = window.DT_COURSES || [], COUNTS = window.DT_COUNTS || {};
  const BY_ID = new Map();
  for (const c of COURSES) for (const it of c.items) BY_ID.set(it.id, { it, course: c.id });
  function dtTile() {
    const c = COURSES.find(x => x.id === get('irae-dt-course', '')) || COURSES[0];
    if (!c) return { sub: '' };
    const known = get('irae-dt-known', {}), best = get('irae-dtp-stage-best', {});
    const solved = id => { const n = COUNTS[id] || 0; return !n || (best[id] || 0) >= Math.ceil(Math.min(10, n) * 0.8); };
    const mastered = id => !!known[id] && solved(id);
    const open = it => it.pre.every(p => !BY_ID.has(p) || BY_ID.get(p).course !== c.id || mastered(p));
    const nx = c.items.find(it => !mastered(it.id) && open(it));
    const m = c.items.filter(it => mastered(it.id)).length;
    return { sub: nx ? `${c.label} · 다음: ${nx.name}` : `${c.label} · 다 익혔어요`, prog: `${m} / ${c.items.length}`, href: `dt.html?next=${encodeURIComponent(c.id)}` };
  }

  // ── 연산 연습 ──
  function drillTile() {
    const OPS = window.QUIZ_OPS || [], TR = window.QUIZ_TRACKS || {};
    const t = get('irae-drill-track-level', '');
    const op = OPS.find(o => o.tracks.includes(t)) || OPS[0];
    if (!op) return { sub: '' };
    const tr = op.tracks.includes(t) ? t : op.tracks[0];
    return { sub: `${op.label} ${op.tracks.indexOf(tr) + 1}단계 · ${TR[tr] || ''}` };
  }

  // 학년을 고르면 DT 학년과 단계별 문제 과정을 맞춤 (이미 그 과정에서 풀던 단계는 그대로)
  function setGrade(g) {
    put('irae-math-grade', g);
    const dc = dtCourseOf(g);
    if (COURSES.some(c => c.id === dc)) put('irae-dt-course', dc);
    const part = partOf(g), curSt = STAGES.find(x => x.id === get('irae-stage-track-level', ''));
    if (!curSt || curSt.part !== part) {
      const list = STAGES.filter(x => x.part === part), open = list.filter(x => stageOpen(x.id));
      const t = (open.at(-1) || list[0]);
      if (t) put('irae-stage-track-level', t.id);
    }
  }

  const ICON = {
    hw: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/></svg>',
    stage: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h5v-5h5v-5h5V5"/><path d="M4 20h16"/></svg>',
    dt: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/></svg>',
    drill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h4M8 4v4M14 6h4M6 16l4 4M10 16l-4 4M14 16h4M14 19h4"/></svg>',
  };
  function tileHTML(key, href, title, t) {
    return `<a class="tile tile-${key}${t.hot ? ' hot' : ''}${t.quiet ? ' quiet' : ''}" href="${href}">
      <span class="tile-top"><span class="tile-ic">${ICON[key]}</span><span class="tile-t">${title}</span>${t.badge ? `<span class="tile-badge">${esc(t.badge)}</span>` : ''}</span>
      ${t.title2 ? `<span class="tile-s2">${esc(t.title2)}</span>` : ''}
      <span class="tile-sub">${esc(t.sub)}${t.stars ? ` <span class="tile-stars">${t.stars}</span>` : ''}${t.prog ? ` <span class="tile-prog">익힘 ${esc(t.prog)}</span>` : ''}</span>
    </a>`;
  }

  function render() {
    const g = get('irae-math-grade', '');
    const last = get(CFG.lastKey || 'irae-math-last', null);
    const dt = dtTile();
    $('#hub').innerHTML = `
      <header class="hub-head">
        <img class="hub-logo" src="${CFG.logo}" alt="이레 수학">
        <button class="grade-btn" type="button" data-act="grade" aria-expanded="${pickGrade}">${g ? `${gradeLabel(g)} ▾` : '학년 고르기 ▾'}</button>
      </header>
      ${!g || pickGrade ? `<section class="grade-pick" aria-label="내 학년">
        <p class="gp-q">${g ? '학년을 바꿀까요?' : '몇 학년이에요?'} <span>고르면 DT와 단계별 문제가 내 학년에 맞춰져요.</span></p>
        <div class="gp-chips">${GRADES.map(([id, l]) => `<button class="chip" type="button" data-grade="${id}" aria-pressed="${id === g}">${l}</button>`).join('')}</div>
      </section>` : ''}
      ${last && last.href ? `<a class="resume" href="${esc(last.href)}"><span class="r-play" aria-hidden="true">▶</span><span class="r-txt"><b>이어서 풀기</b><span>${esc(last.title)} · ${esc(last.sub || '')}</span></span></a>` : ''}
      <nav class="tiles" aria-label="이레 수학 메뉴">
        ${tileHTML('hw', 'homework.html', '숙제', hwTile())}
        ${tileHTML('stage', 'stage.html', '단계별 문제', stageTile())}
        ${tileHTML('dt', dt.href || 'dt.html', 'DT 익히기', dt)}
        ${tileHTML('drill', 'drill.html', '연산 연습', drillTile())}
      </nav>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !$('#hub').contains(b)) return;
    if (b.dataset.act === 'grade') { pickGrade = !pickGrade; render(); return; }
    if (b.dataset.grade) { setGrade(b.dataset.grade); pickGrade = false; render(); }
  });
  render();
  // 맨 아래 안내는 한 번만 그림 (로그인·기록 백업 버튼이 여기에 붙음)
  const ft = document.createElement('footer'); ft.innerHTML = CFG.footer || ''; $('#hub').after(ft);
  window.HUB_DEBUG = { render, setGrade };
})();
