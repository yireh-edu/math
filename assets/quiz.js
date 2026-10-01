/*
 * 이레 퀴즈 프로그램 (모든 학년 페이지가 함께 씀)
 * 학년 페이지가 window.QUIZ_CONFIG와 window.QUIZ_DATA를 먼저 정해 두고 이 파일을 불러옵니다.
 *   QUIZ_CONFIG = { subject:'math'|'english', grade:'e1'…'h3', title, period:'week'|'day', math:bool, speech:bool }
 *   QUIZ_DATA   = { general:[문제…], bible:[문제…] }
 * 문제 종류(t):
 *   mc     5지선다        { q, c:[보기5], a:정답번호(0부터), sol }
 *   short  단답형(숫자)   { q, a:숫자, sol }
 *   word   단어           { w, p:'v'|'a'|'n'|'ad', m:뜻 }      → 뜻 고르기 / 단어 고르기로 자동 출제
 *   expr   숙어·표현      { w, m:뜻, r?:출처 }
 *   cloze  빈칸 채우기    { s:'… ___ …', a:정답, d:[오답4], e?:해설, ko?:뜻, r?:출처 }
 *   공통으로 cat(분류), unit(단원), kind(유형)를 붙일 수 있습니다.
 * 새 문제는 목록 끝에 추가하세요. (순서가 바뀌면 학생의 오답노트 기록이 어긋납니다)
 */
(function () {
  const CFG = window.QUIZ_CONFIG;
  // 숙제 모드: homework/current.js의 window.HOMEWORK = { sets: [ { id, title, label, due, note, questions: [...] } ] }
  const HW = CFG.mode === 'homework';
  const HW_SETS = HW ? ((window.HOMEWORK && window.HOMEWORK.sets) || []).filter(s => s && s.id && Array.isArray(s.questions) && s.questions.length) : [];
  const DATA = window.QUIZ_DATA || { general: [], bible: [] };
  const GRADE_LABEL = { e1:'초1', e2:'초2', e3:'초3', e4:'초4', e5:'초5', e6:'초6', m1:'중1', m2:'중2', m3:'중3', h1:'고1', h2:'고2', h3:'고3' };
  const TRACK_LABEL = { s1: '1학기', s2: '2학기', elem: '초등', mid: '중등', high: '고등', general: '전체', bible: '성경', ...(window.QUIZ_TRACKS || {}) };
  // 연산 연습 모드: 문제를 자릿수 단계별로 만들어 둔 것(drill-data.js)을 연습·오답노트로 풂
  const DRILL = CFG.mode === 'drill';
  const OPS = DRILL ? (window.QUIZ_OPS || []) : [];
  const opOf = t => OPS.find(o => o.tracks.includes(t));
  // 단계별 문제 모드: 단계(QUIZ_STAGES)를 차례로 통과하면 다음 단계가 열림. 과정(초등·중등·고등)마다 첫 단계는 처음부터 열려 있음
  const STAGE = CFG.mode === 'stage';
  const STAGES = STAGE ? (window.QUIZ_STAGES || []) : [];
  const SHEET = DRILL || STAGE;   // 10문제를 다 쓰고 [채점하기]로 한 번에 채점
  const PASS = 8;
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const POS = { v: 'v.', a: 'adj.', n: 'n.', ad: 'adv.' };
  const POS_KO = { v: '동사', a: '형용사', n: '명사', ad: '부사' };
  const LABELS = ['①', '②', '③', '④', '⑤'];
  const CIRCLE = 'M50 7C79 5 95 29 93 54C90 82 61 96 38 91C15 86 4 61 9 38C14 17 35 5 60 9';
  const SLASH = 'M18 88L84 10';
  const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const KEY = HW ? 'irae-homework' : `irae-${CFG.subject}`;
  const WEEK = CFG.period === 'week';
  const PERIOD_NAME = WEEK ? '이번 주' : '오늘의';
  const $ = s => document.querySelector(s);

  // ── 날짜 (한국 시간) ──
  function kstToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function toUTC(d) { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); }
  function addDays(d, n) { return new Date(toUTC(d) + n * 864e5).toISOString().slice(0, 10); }
  function mondayOf(d) { return addDays(d, -((new Date(toUTC(d)).getUTCDay() + 6) % 7)); }
  function md(d) { const t = new Date(toUTC(d)); return `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일`; }
  function periodLabel(p) {
    if (WEEK) return `${md(p)} ~ ${md(addDays(p, 6))}`;
    return `${md(p)} (${'일월화수목금토'[new Date(toUTC(p)).getUTCDay()]})`;
  }
  const STEP = WEEK ? 7 : 1;
  const THIS_PERIOD = WEEK ? mondayOf(kstToday()) : kstToday();
  // CFG.start: 이 날짜부터 시작 (이레 영어는 첫날부터 날마다 새 세트). 그 전 날짜로는 넘어가지 않음
  const START = CFG.start || '';
  const EPOCH = START || (WEEK ? '2025-12-29' : '2026-01-01');
  function periodIndex(p) { return Math.round((toUTC(p) - toUTC(EPOCH)) / (STEP * 864e5)); }

  // ── 날짜로 정해지는 난수 ──
  function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = hash(String(seed));
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffle(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // 한 바퀴를 다 돌 때까지 같은 문제가 다시 나오지 않고, 바퀴마다 순서를 새로 섞음
  function pickCycle(seed, total, index, count) {
    const out = [];
    for (let k = 0; k < count; k++) {
      const pos = index * count + k;
      const order = shuffle([...Array(total).keys()], rng(`${seed}-cycle-${Math.floor(pos / total)}`));
      let cand = order.at(pos % total);
      if (out.includes(cand)) cand = order.find(i => !out.includes(i));
      out.push(cand);
    }
    return out;
  }

  // ── 저장 (학생 브라우저) ──
  function load(name, fallback) { try { return JSON.parse(localStorage.getItem(`${KEY}-${name}`)) ?? fallback; } catch { return fallback; } }
  function save(name, value) { try { localStorage.setItem(`${KEY}-${name}`, JSON.stringify(value)); } catch {} }

  // ── 상태 ──
  const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(new Date()));
  const nowSem = month >= 3 && month <= 8 ? 's1' : 's2';
  let track = load(`track-${CFG.grade || 'level'}`, CFG.defaultTrack || nowSem);
  if (!DATA[track] || !DATA[track].length) track = Object.keys(TRACK_LABEL).find(k => (DATA[k] || []).length) || 's1';
  let tab = load(`tabsel-${CFG.grade}`, 'period');   // period | practice | wrong (마지막으로 보던 탭)
  if (!['period', 'practice', 'wrong', 'concept'].includes(tab)) tab = 'period';
  if (SHEET && tab === 'period') tab = 'practice';
  const stageBest = () => load('stage-best', {});
  function stageOpen(id) {
    const i = STAGES.findIndex(x => x.id === id);
    if (i < 0) return false;
    if (i === 0 || STAGES[i - 1].part !== STAGES[i].part) return true;
    return (stageBest()[STAGES[i - 1].id] || 0) >= PASS;
  }
  const stars = n => n >= 10 ? 3 : n >= 9 ? 2 : n >= PASS ? 1 : 0;
  const starText = n => '★'.repeat(stars(n)) + '☆'.repeat(3 - stars(n));
  let view = THIS_PERIOD;
  let deck = [], idx = 0, results = [], retrying = false;
  const memo = {};
  // 숙제 모드에서 지금 보고 있는 숙제
  let hwId = load('set', HW_SETS.length ? HW_SETS[0].id : '');
  if (HW && !HW_SETS.some(s => s.id === hwId)) hwId = HW_SETS.length ? HW_SETS[0].id : '';
  const hwSet = () => HW_SETS.find(s => s.id === hwId);
  if (HW) { tab = 'hw'; track = hwSet() && hwSet().track === 'bible' ? 'bible' : 'general'; }
  const revealed = new Set();   // 서술형: 정답을 펼쳐 본 문제
  const pool = () => HW ? (hwSet() ? hwSet().questions : []) : (DATA[track] || []);
  const poolKey = () => HW ? `hw-${hwId}` : `${CFG.grade}-${track}`;
  const periodSize = () => { if (CFG.mix) return CFG.mix.reduce((s, m) => s + m[1], 0); const n = pool().length; return n >= 20 ? 10 : Math.min(n, 5); };
  const orderPicks = new Map();   // 단어 배열: 문제마다 지금까지 누른 카드
  if (!HW && CFG.grade) save('last-grade', CFG.grade);

  function texSafe(v) { return typeof v === 'string' && CFG.math ? v.replace(/\$[^$]*\$/g, m => m.replace(/</g, '\\lt ').replace(/>/g, '\\gt ')) : v; }
  function esc(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
  function fmtChoice(c) { return CFG.math && /^[-\d.\s]+$/.test(c) ? `$${c}$` : c; }

  // ── 문제 만들기 ──
  function sameTrackAll(type) {
    // 이 학년 문제가 모자랄 때 오답 보기를 채우기 위해 같은 과정의 다른 문제를 씀
    return pool().filter(it => it.t === type);
  }
  function distract(item, type, rand, key) {
    const others = sameTrackAll(type).filter(o => o !== item && o[key] !== item[key]);
    const more = ((DATA.more || {})[track] || {})[type] || []; // 다른 학년의 같은 과정 단어·표현
    const sameP = list => list.filter(o => !item.p || o.p === item.p);
    const otherP = list => list.filter(o => item.p && o.p !== item.p);
    const picked = [];
    for (const o of [...shuffle(sameP(others), rand), ...shuffle(otherP(others), rand), ...shuffle(sameP(more), rand),
      ...shuffle(otherP(more), rand), ...shuffle(FALLBACK[type] || [], rand)]) {
      if (picked.length === 4) break;
      if (o[key] !== item[key] && !picked.some(p => p[key] === o[key])) picked.push(o);
    }
    return picked;
  }
  // 오답 보기가 4개 안 될 때 쓰는 예비 보기
  const FALLBACK = {
    word: ['사과|n', '학교|n', '달리다|v', '큰|a', '친구|n', '먹다|v', '행복한|a', '물|n'].map((x, i) => { const [m, p] = x.split('|'); return { w: ['apple', 'school', 'run', 'big', 'friend', 'eat', 'happy', 'water'][i], m, p }; }),
    expr: [{ w: 'give up', m: '포기하다' }, { w: 'look after', m: '돌보다' }, { w: 'put off', m: '미루다' }, { w: 'find out', m: '알아내다' }],
  };

  // 문제에 그림(img)이 있으면 문제 아래에 붙임
  function build(item, i, rand, dirHint) {
    const q = buildInner(item, i, rand, dirHint);
    // 수식 속 < > 가 HTML 태그로 읽혀 글이 사라지지 않게 TeX 기호로 바꿈 (선생님이 숙제에 $a<b$ 처럼 써도 됨)
    if (CFG.math) {
      q.q = texSafe(q.q); q.sol = texSafe(q.sol); q.answer = texSafe(q.answer);
      if (q.choices) q.choices = q.choices.map(texSafe);
    }
    if (item.img) q.q += `<img class="q-img" src="${esc(item.img)}" alt="${esc(item.imgAlt || '문제 그림')}">`;
    return q;
  }
  function buildInner(item, i, rand, dirHint) {
    const src = `${poolKey()}#${i}`;
    const base = { src, cat: item.cat || (track === 'bible' ? '성경' : ''), unit: item.unit || '', kind: item.kind || '' };
    if (item.t === 'mc') {
      return { ...base, type: 'mc', q: item.q, choices: item.c.map(fmtChoice), ans: item.a, sol: item.sol || '', kind: base.kind || '5지선다' };
    }
    if (item.t === 'short') {
      // a가 숫자면 숫자로, 글자(또는 여러 개의 정답 목록)면 대소문자·띄어쓰기를 무시하고 비교
      const text = typeof item.a !== 'number';
      return { ...base, type: 'short', text, q: item.q, ans: item.a, sol: item.sol || '', kind: base.kind || '단답형', ...(item.answerText ? { answerText: item.answerText } : {}) };
    }
    if (item.t === 'open') {
      // 서술형: 풀어 본 뒤 정답을 펼쳐 보고 스스로 채점
      return { ...base, type: 'open', q: item.q, answer: item.answer || '', sol: item.sol || '', kind: base.kind || '서술형' };
    }
    if (item.t === 'word' && dirHint === 'spell') {
      // 철자 쓰기: 뜻과 글자 수를 보고(소리도 들을 수 있음) 단어를 직접 입력
      return { ...base, type: 'short', text: true, kind: '철자 쓰기', ans: item.w, say: item.w,
        q: `다음 뜻을 가진 영어 단어를 쓰세요.<span class="kor">${esc(item.m)}</span><span class="hint-letters">${item.w.length}글자 · ${esc(item.w[0])}(으)로 시작</span>`,
        sol: `<span class="en">${esc(item.w)}</span>${item.p ? ` (${POS_KO[item.p]})` : ''} ${esc(item.m)}` };
    }
    if (item.t === 'word' && dirHint === 'listen') {
      // 듣고 고르기: 단어는 보여 주지 않고 소리만
      const opts = shuffle([item, ...distract(item, 'word', rand, 'm')], rand);
      return { ...base, type: 'mc', kind: '듣고 고르기', ans: opts.indexOf(item), say: item.w, sayLabel: '소리 듣기', sayBig: true,
        q: '소리를 듣고 알맞은 단어를 고르세요.',
        choices: opts.map(o => `<span class="en">${esc(o.w)}</span>`),
        sol: `<span class="en">${esc(item.w)}</span> ${esc(item.m)}` };
    }
    if (item.t === 'sent' && dirHint === 'order') {
      // 단어 배열: 우리말 뜻을 보고 단어 카드를 순서대로 누름
      const words = item.s.split(' ');
      let order = shuffle([...words.keys()], rand);
      if (order.every((k, j) => k === j) && words.length > 1) order = [...order.slice(1), order[0]];
      return { ...base, type: 'order', kind: '단어 배열', words, order, answerText: item.s, sayAfter: item.s, sayLabel: '문장 듣기',
        q: `우리말에 맞게 단어를 순서대로 누르세요.<span class="kor">${esc(item.ko)}</span>`,
        sol: `<span class="en">${esc(item.s)}</span><span class="ko">뜻: ${esc(item.ko)}</span>` };
    }
    if (item.t === 'sent') {
      // 문장 해석: 영어 문장을 보고 알맞은 우리말 고르기
      const others = shuffle(pool().filter(o => o.t === 'sent' && o !== item && o.ko !== item.ko), rand).slice(0, 4);
      const opts = shuffle([item, ...others], rand);
      return { ...base, type: 'mc', kind: '문장 해석', ans: opts.indexOf(item), say: item.s, sayLabel: '문장 듣기',
        q: `다음 문장의 뜻으로 알맞은 것은?<span class="sentence">${esc(item.s)}</span>`,
        choices: opts.map(o => esc(o.ko)),
        sol: `<span class="en">${esc(item.s)}</span><span class="ko">뜻: ${esc(item.ko)}</span>` };
    }
    if (item.t === 'word') {
      const opts = shuffle([item, ...distract(item, 'word', rand, 'm')], rand);
      const ans = opts.indexOf(item);
      const dir = dirHint || (rand() < 0.7 ? 'wm' : 'mw');
      if (dir === 'wm') {
        return { ...base, type: 'mc', kind: '뜻 고르기', ans, say: item.w,
          q: `다음 단어의 뜻으로 알맞은 것은?<span class="head">${esc(item.w)}${item.p ? `<span class="pos">${POS[item.p]}</span>` : ''}</span>`,
          choices: opts.map(o => esc(o.m)),
          sol: `<span class="en">${esc(item.w)}</span>${item.p ? ` (${POS_KO[item.p]})` : ''} ${esc(item.m)}` };
      }
      return { ...base, type: 'mc', kind: '단어 고르기', ans, sayAfter: item.w, sayLabel: '정답 발음 듣기', sayChoices: opts.map(o => o.w),
        q: `다음 뜻을 가진 단어는?<span class="kor">${esc(item.m)}</span>`,
        choices: opts.map(o => `<span class="en">${esc(o.w)}</span>`),
        sol: opts.map(o => `<span class="en">${esc(o.w)}</span> ${esc(o.m)}`).join(' · ') };
    }
    if (item.t === 'expr') {
      const opts = shuffle([item, ...distract(item, 'expr', rand, 'm')], rand);
      return { ...base, type: 'mc', kind: base.kind || (track === 'bible' ? '성경에서 온 표현' : CFG.mix ? '숙어·표현' : '숙어'), ans: opts.indexOf(item), say: item.w,
        q: `다음 표현의 뜻으로 알맞은 것은?<span class="head">${esc(item.w)}</span>`,
        choices: opts.map(o => esc(o.m)),
        sol: `<span class="en">${esc(item.w)}</span> ${esc(item.m)}${item.r ? ` · 출처: ${esc(item.r)}` : ''}` };
    }
    // cloze
    const opts = shuffle([item.a, ...item.d], rand);
    const sentence = esc(item.s).replace('___', '<span class="blank"></span>');
    return { ...base, type: 'mc', kind: base.kind || (item.r ? '구절 빈칸' : '빈칸 채우기'), ans: opts.indexOf(item.a),
      sayAfter: item.s.replace('___', item.a), sayLabel: item.r ? '구절 듣기' : '완성 문장 듣기', sayChoices: opts,
      q: `빈칸에 들어갈 말로 알맞은 것은?${item.r ? ` <span class="ref">${esc(item.r)}</span>` : ''}<span class="sentence">${sentence}</span>`,
      choices: opts.map(o => `<span class="en">${esc(o)}</span>`),
      sol: `정답 <span class="en">${esc(item.a)}</span>. ${item.e ? esc(item.e) : ''}${item.ko ? `<span class="ko">뜻: ${esc(item.ko)}${item.r ? ` (${esc(item.r)})` : ''}</span>` : ''}` };
  }

  // 섞어 내기(CFG.mix): [[종류, 개수], …] 종류 = word(뜻 고르기) · listen · spell · expr · cloze · trans · order
  const MIX_SOURCE = { word: 'word', listen: 'word', spell: 'word', expr: 'expr', cloze: 'cloze', trans: 'sent', order: 'sent' };
  const MIX_HINT = { word: 'wm', listen: 'listen', spell: 'spell', order: 'order' };
  function mixCandidates(kind) {
    const src = MIX_SOURCE[kind];
    return [...pool().keys()].filter(i => {
      const it = pool()[i];
      if (it.t !== src) return false;
      return kind !== 'spell' || /^[A-Za-z]{2,12}$/.test(it.w);   // 철자 쓰기는 띄어쓰기 없는 짧은 단어만
    });
  }
  function mixDeck(pickFor) {
    const used = new Set(), out = [];
    for (const [kind, n] of CFG.mix) {
      const cands = mixCandidates(kind);
      if (!cands.length) continue;
      for (const i of pickFor(kind, cands, n)) {
        // 같은 날 같은 단어·문장이 두 번 나오지 않게
        const idx = used.has(cands[i]) ? cands.find(c => !used.has(c)) : cands[i];
        if (idx === undefined) continue;
        used.add(idx);
        out.push([idx, kind]);
      }
    }
    return out;
  }
  function periodDeck(p) {
    const items = pool();
    if (!items.length) return [];
    const rand = rng(`${KEY}-${poolKey()}-${p}`);
    if (CFG.mix) {
      return mixDeck((kind, cands, n) => pickCycle(`${KEY}-${poolKey()}-${kind}`, cands.length, periodIndex(p), Math.min(n, cands.length)))
        .map(([i, kind]) => build(items.at(i), i, rand, MIX_HINT[kind]));
    }
    return pickCycle(`${KEY}-${poolKey()}`, items.length, periodIndex(p), periodSize()).map(i => build(items.at(i), i, rand));
  }
  function practiceDeck() {
    const items = pool();
    if (CFG.mix) {
      return mixDeck((kind, cands, n) => shuffle([...cands.keys()], Math.random).slice(0, n))
        .map(([i, kind]) => build(items.at(i), i, Math.random, MIX_HINT[kind]));
    }
    return shuffle([...items.keys()], Math.random).slice(0, 10).map(i => build(items.at(i), i, Math.random));
  }
  // 숙제: 선생님이 적은 순서 그대로, 보기 섞기는 숙제마다 고정
  function hwDeck() {
    return pool().map((item, i) => build(item, i, rng(`${KEY}-${hwId}-${i}`)));
  }
  function wrongDeck() {
    const wrong = new Set(load('wrong', []));
    const items = pool();
    const ids = [...items.keys()].filter(i => wrong.has(`${poolKey()}#${i}`));
    return shuffle(ids, Math.random).slice(0, 10).map(i => build(items.at(i), i, Math.random));
  }

  // ── 진행 기록 ──
  function stateKey() { return `${poolKey()}|${tab}${tab === 'period' ? `|${view}` : ''}`; }
  function deckSig() { return deck.map(q => q.src).join(','); }
  // 숙제 문제가 바뀌었는지 확인하는 표시 (문제 글과 정답으로 만듦)
  function hwSig() { return String(hash(deck.map(q => `${q.q}|${JSON.stringify(q.ans ?? q.answer)}`).join('\n'))); }
  function stash() {
    if (HW) {
      if (retrying) return;
      const all = load('session', {});
      all[hwId] = { idx, results, sig: hwSig() };
      save('session', all);
      return;
    }
    memo[stateKey()] = { deck, idx, results, retrying };
    // 연습·오답노트는 뽑힌 문제까지 통째로 저장해서 새로고침해도 이어서 풀 수 있게 함
    if (tab !== 'period') save(`tab-${stateKey()}`, { deck, idx, results, retrying });
    if (tab === 'period' && !retrying) {
      const all = load('session', {});
      all[`${poolKey()}|${view}`] = { idx, results, sig: deckSig() };
      const keep = addDays(THIS_PERIOD, -60);
      for (const k of Object.keys(all)) if (k.split('|')[1] < keep) delete all[k];
      save('session', all);
    }
  }
  function doneMap() { return load('done', {}); }
  function streak() {
    const done = doneMap();
    let p = done[`${poolKey()}|${THIS_PERIOD}`] ? THIS_PERIOD : addDays(THIS_PERIOD, -STEP), n = 0;
    while (done[`${poolKey()}|${p}`]) { n++; p = addDays(p, -STEP); }
    return n;
  }

  function start(fresh = false) {
    if (HW) {
      deck = hwDeck(); retrying = false; revealed.clear();
      const s = fresh ? null : load('session', {})[hwId];
      const ok = s && s.sig === hwSig() && Array.isArray(s.results);
      results = ok ? s.results : [];
      idx = ok ? Math.min(s.idx, deck.length) : 0;
      if (fresh) { const done = load('done', {}); delete done[hwId]; save('done', done); }
      stash();
      renderAll();
      return;
    }
    if (tab === 'concept') {
      if (conceptList().length) { deck = []; idx = 0; results = []; retrying = false; renderAll(); return; }
      tab = 'period';
    }
    let saved = memo[stateKey()];
    if (!fresh && !saved && tab !== 'period') {
      const s = load(`tab-${stateKey()}`, null);
      if (s && Array.isArray(s.deck) && s.deck.length) saved = s;
    }
    if (!fresh && saved && saved.deck.length) {
      ({ deck, idx, results, retrying } = saved);
    } else if (tab === 'period') {
      deck = periodDeck(view);
      const s = fresh ? null : load('session', {})[`${poolKey()}|${view}`];
      const ok = s && s.sig === deckSig();
      idx = ok ? s.idx : 0; results = ok ? s.results : []; retrying = false;
    } else {
      deck = tab === 'practice' ? practiceDeck() : wrongDeck();
      idx = 0; results = []; retrying = false;
    }
    if (SHEET) { if (fresh) save(draftKey(), []); loadDrafts(); }
    stash();
    renderAll();
  }

  // ── 발음 듣기 ──
  const CAN_SPEAK = CFG.speech && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  function speak(text, btn) {
    if (!CAN_SPEAK) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.9;
      const voices = synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
      const v = voices.find(x => /en[-_]US/i.test(x.lang) && /google|samantha|aria|jenny|natural/i.test(x.name)) || voices.find(x => /en[-_]US/i.test(x.lang)) || voices.at(0);
      if (v) u.voice = v;
      document.querySelectorAll('.playing').forEach(b => b.classList.remove('playing'));
      btn?.classList.add('playing');
      u.onend = u.onerror = () => btn?.classList.remove('playing');
      synth.speak(u);
    } catch {}
  }
  function stopSpeech() { if (CAN_SPEAK) window.speechSynthesis.cancel(); }
  function sayButton(text, label, big) { return CAN_SPEAK ? `<button class="say${big ? ' big' : ''}" type="button" data-say="${esc(text)}">${SPEAKER}${label}</button>` : ''; }
  if (CAN_SPEAK) window.speechSynthesis.getVoices();

  // ── 연습장 (손으로 풀어 보기) ──
  // 선(획) 단위로 기억해서 화면 옮기기, 골라서 옮기기, 되돌리기가 됨. 문제마다 따로 기억하고, 페이지를 닫으면 지워짐
  //   그리기: 검은 펜 / 빨간 펜     지우개: 닿은 선을 통째로 지움
  //   선택: 올가미로 둘러서 고른 뒤, 상자 안을 끌어 옮김
  //   이동: 끌어서 화면 옮기기 (두 손가락으로 끌어도 됨. 애플펜슬을 쓰면 손가락 하나로도 옮겨짐)
  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/></svg>';
  const scratchStore = new Map();   // 문제 → { strokes, ox, oy, hist, fig }
  // 문제 그림(그래프 등)을 연습장 바닥에 깔기: fig = { x, y, w, h, alpha } (모눈과 같은 좌표라 화면을 옮기면 같이 움직임)
  const FIG_STATES = [null, 1, 0.4];   // 빼기 → 진하게 → 흐리게
  const figImgs = new Map();
  function figImage(src) {
    if (!figImgs.has(src)) { const im = new Image(); im.onload = () => { if (pad && !pad.sheet.hidden) { placeFig(); redrawPad(); } }; im.src = src; figImgs.set(src, im); }
    return figImgs.get(src);
  }
  let pad = null;
  const PEN_W = 2.6, ERASE_R = 12, GRID = 24;
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#18212E'; }
  function buildPad() {
    const back = document.createElement('div');
    back.className = 'sheet-backdrop'; back.hidden = true; back.dataset.act = 'scratch-close';
    const sheet = document.createElement('section');
    sheet.className = 'sheet'; sheet.hidden = true;
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', '연습장');
    sheet.innerHTML = `
      <div class="sheet-bar">
        <span class="title">연습장</span>
        <div class="tool-group">
          <button class="tool" type="button" data-tool="ink" aria-pressed="true" aria-label="검은 펜"><span class="swatch"></span></button>
          <button class="tool" type="button" data-tool="red" aria-pressed="false" aria-label="빨간 펜"><span class="swatch red"></span></button>
          <button class="tool" type="button" data-tool="erase" aria-pressed="false">지우개</button>
          <button class="tool" type="button" data-tool="lasso" aria-pressed="false">선택</button>
          <button class="tool" type="button" data-tool="hand" aria-pressed="false">이동</button>
        </div>
        <div class="tool-group">
          <button class="tool fig-btn" type="button" data-act="scratch-figure" hidden>그림 놓기</button>
          <button class="tool" type="button" data-act="scratch-undo">되돌리기</button>
          <button class="tool" type="button" data-act="scratch-home">제자리</button>
          <button class="tool" type="button" data-act="scratch-clear">모두 지우기</button>
          <button class="tool close" type="button" data-act="scratch-close">닫기</button>
        </div>
      </div>
      <div class="sheet-q"></div>
      <div class="pad-wrap"><canvas class="pad"></canvas><p class="pad-hint">손가락이나 펜으로 풀어 보세요<br>두 손가락으로 끌면 화면이 옮겨져요</p></div>`;
    document.body.append(back, sheet);
    const canvas = sheet.querySelector('canvas');
    pad = { back, sheet, canvas, ctx: canvas.getContext('2d'), hint: sheet.querySelector('.pad-hint'), qEl: sheet.querySelector('.sheet-q'),
      page: null, tool: 'ink', w: 0, h: 0, dpr: 0, penSeen: false, pointers: new Map(),
      mode: null, cur: null, erased: null, lasso: null, sel: null, drag: null, pan: null };

    const screenPos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const toWorld = ([x, y]) => [x + pad.page.ox, y + pad.page.oy];
    const touches = () => [...pad.pointers.values()].filter(p => p.type === 'touch');
    const mid = list => [(list[0].x + list[1].x) / 2, (list[0].y + list[1].y) / 2];

    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const sp = screenPos(e);
      pad.pointers.set(e.pointerId, { x: sp[0], y: sp[1], type: e.pointerType });
      if (e.pointerType === 'pen') pad.penSeen = true;
      // 두 손가락 → 화면 옮기기 (첫 손가락으로 막 그리던 선은 취소)
      if (e.pointerType === 'touch' && touches().length >= 2) {
        cancelCurrent();
        const m = mid(touches());
        pad.mode = 'pan2'; pad.pan = { m0: m, ox0: pad.page.ox, oy0: pad.page.oy };
        return;
      }
      // 이동 도구이거나, 애플펜슬을 쓰는 중에 손가락을 대면 → 화면 옮기기
      if (pad.tool === 'hand' || (e.pointerType === 'touch' && pad.penSeen)) {
        pad.mode = 'pan1'; pad.pan = { id: e.pointerId, s0: sp, ox0: pad.page.ox, oy0: pad.page.oy };
        return;
      }
      const w = toWorld(sp);
      if (pad.tool === 'ink' || pad.tool === 'red') {
        pad.cur = { tool: pad.tool, pts: [w] };
        pad.page.strokes.push(pad.cur);
        pad.mode = 'draw';
        drawStroke(pad.cur, 0);
        pad.hint.hidden = true;
      } else if (pad.tool === 'erase') {
        pad.mode = 'erase'; pad.erased = [];
        eraseAt(w);
      } else if (pad.tool === 'lasso') {
        if (pad.sel && inBox(w, pad.sel.box)) { pad.mode = 'move'; pad.drag = { last: w, dx: 0, dy: 0 }; }
        else { pad.sel = null; pad.mode = 'lasso'; pad.lasso = [w]; redrawPad(); }
      }
    });

    canvas.addEventListener('pointermove', e => {
      const p = pad.pointers.get(e.pointerId);
      if (!p) return;
      const sp = screenPos(e);
      p.x = sp[0]; p.y = sp[1];
      const mode = pad.mode;
      if (mode === 'pan2') {
        const t = touches();
        if (t.length < 2) return;
        const m = mid(t);
        pad.page.ox = pad.pan.ox0 - (m[0] - pad.pan.m0[0]);
        pad.page.oy = pad.pan.oy0 - (m[1] - pad.pan.m0[1]);
        redrawPad();
      } else if (mode === 'pan1' && e.pointerId === pad.pan.id) {
        pad.page.ox = pad.pan.ox0 - (sp[0] - pad.pan.s0[0]);
        pad.page.oy = pad.pan.oy0 - (sp[1] - pad.pan.s0[1]);
        redrawPad();
      } else if (mode === 'draw' || mode === 'erase' || mode === 'lasso') {
        // 빠르게 움직일 때 빠진 점까지 모두 받아서 펜 끝을 정확히 따라감
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        const pts = (events.length ? events : [e]).map(ev => toWorld(screenPos(ev)));
        if (mode === 'draw') {
          const from = pad.cur.pts.length - 1;
          pad.cur.pts.push(...pts);
          drawStroke(pad.cur, from);
        } else if (mode === 'erase') {
          for (const w of pts) eraseAt(w);
        } else {
          pad.lasso.push(...pts);
          redrawPad();
        }
      } else if (mode === 'move') {
        const w = toWorld(sp);
        const dx = w[0] - pad.drag.last[0], dy = w[1] - pad.drag.last[1];
        pad.drag.last = w; pad.drag.dx += dx; pad.drag.dy += dy;
        shiftStrokes(pad.sel.strokes, dx, dy);
        pad.sel.box = [pad.sel.box[0] + dx, pad.sel.box[1] + dy, pad.sel.box[2] + dx, pad.sel.box[3] + dy];
        redrawPad();
      }
    });

    const end = e => {
      pad.pointers.delete(e.pointerId);
      const mode = pad.mode, page = pad.page;
      if (mode === 'pan2') { if (touches().length < 2) pad.mode = null; return; }
      if (mode === 'pan1' && e.pointerId !== pad.pan.id) return;
      if (mode === 'draw' && pad.cur) page.hist.push({ t: 'add', s: pad.cur });
      if (mode === 'erase' && pad.erased.length) page.hist.push({ t: 'erase', items: pad.erased });
      if (mode === 'lasso') { selectInLasso(); pad.lasso = null; redrawPad(); }
      if (mode === 'move' && (pad.drag.dx || pad.drag.dy)) page.hist.push({ t: 'move', ss: pad.sel.strokes, dx: pad.drag.dx, dy: pad.drag.dy });
      pad.mode = null; pad.cur = null; pad.erased = null; pad.drag = null; pad.pan = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    // 휴대폰 기본 동작(길게 눌러 선택·메뉴, 화면 끌기)을 막음
    const stop = ev => { if (ev.cancelable) ev.preventDefault(); };
    canvas.addEventListener('touchstart', stop, { passive: false });
    canvas.addEventListener('touchmove', stop, { passive: false });
    sheet.addEventListener('contextmenu', stop);
    sheet.addEventListener('selectstart', stop);
    // 그림판 크기가 바뀌면(수식이 그려져 문제 영역이 커질 때, 화면 회전, 주소창 변화) 바로 다시 맞춤 → 펜 끝과 선이 어긋나지 않게
    if (window.ResizeObserver) new ResizeObserver(() => { if (!pad.sheet.hidden) sizePad(); }).observe(canvas);
    window.addEventListener('resize', () => { if (!pad.sheet.hidden) sizePad(); });
  }

  function cancelCurrent() {
    if (pad.mode === 'draw' && pad.cur) {
      const i = pad.page.strokes.indexOf(pad.cur);
      if (i >= 0) pad.page.strokes.splice(i, 1);
    }
    if (pad.mode === 'erase' && pad.erased && pad.erased.length) pad.page.hist.push({ t: 'erase', items: pad.erased });
    pad.cur = null; pad.erased = null; pad.lasso = null; pad.mode = null;
    redrawPad();
  }
  function shiftStrokes(list, dx, dy) { for (const s of list) for (const pt of s.pts) { pt[0] += dx; pt[1] += dy; } }
  function segDist(p, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L)) : 0;
    return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
  }
  function eraseAt(w) {
    const strokes = pad.page.strokes;
    let hit = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const pts = strokes[i].pts;
      const touched = pts.length === 1 ? Math.hypot(pts[0][0] - w[0], pts[0][1] - w[1]) < ERASE_R
        : pts.some((pt, k) => k > 0 && segDist(w, pts[k - 1], pt) < ERASE_R);
      if (touched) { pad.erased.push({ s: strokes[i], i }); strokes.splice(i, 1); hit = true; }
    }
    if (hit) redrawPad();
  }
  function inPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function boxOf(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of list) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0 - 10, y0 - 10, x1 + 10, y1 + 10];
  }
  function inBox(w, b) { return w[0] >= b[0] && w[0] <= b[2] && w[1] >= b[1] && w[1] <= b[3]; }
  function selectInLasso() {
    const poly = pad.lasso;
    pad.sel = null;
    if (!poly || poly.length < 3) return;
    // 선의 점 중 절반 이상이 올가미 안에 있으면 고른 것으로 봄
    const picked = pad.page.strokes.filter(s => s.pts.filter(pt => inPoly(pt, poly)).length >= Math.ceil(s.pts.length / 2));
    if (picked.length) pad.sel = { strokes: picked, box: boxOf(picked) };
  }

  function drawStroke(s, from) {
    const { ctx } = pad;
    ctx.save();
    ctx.translate(-pad.page.ox, -pad.page.oy);
    ctx.strokeStyle = ctx.fillStyle = s.tool === 'red' ? cssVar('--pen') : cssVar('--ink');
    ctx.lineWidth = PEN_W; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const p = s.pts;
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], PEN_W / 2, 0, Math.PI * 2); ctx.fill(); }
    else {
      const a = Math.max(0, from);
      ctx.beginPath();
      ctx.moveTo(p[a][0], p[a][1]);
      for (let i = a + 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  }
  function redrawPad() {
    const { ctx, canvas, page } = pad;
    if (!page) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
    // 모눈: 화면을 옮기면 같이 움직여서 옮겨진 것이 보이게
    ctx.save();
    ctx.strokeStyle = cssVar('--grid'); ctx.lineWidth = 1;
    ctx.beginPath();
    const offX = -(((page.ox % GRID) + GRID) % GRID), offY = -(((page.oy % GRID) + GRID) % GRID);
    for (let x = offX; x <= pad.w; x += GRID) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, pad.h); }
    for (let y = offY; y <= pad.h; y += GRID) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(pad.w, Math.round(y) + 0.5); }
    ctx.stroke();
    ctx.restore();
    if (page.fig && pad.figSrc) {
      const im = figImage(pad.figSrc), f = page.fig;
      if (im.complete && im.naturalWidth && f.w) {
        ctx.save(); ctx.translate(-page.ox, -page.oy); ctx.globalAlpha = f.alpha;
        ctx.fillStyle = '#fff'; ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.drawImage(im, f.x, f.y, f.w, f.h);
        ctx.restore();
      }
    }
    for (const s of page.strokes) drawStroke(s, 0);
    ctx.save();
    ctx.translate(-page.ox, -page.oy);
    ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = cssVar('--sel');
    if (pad.lasso && pad.lasso.length > 1) {
      ctx.beginPath(); ctx.moveTo(pad.lasso[0][0], pad.lasso[0][1]);
      for (const [x, y] of pad.lasso) ctx.lineTo(x, y);
      ctx.stroke();
    }
    if (pad.sel) {
      const [x0, y0, x1, y1] = pad.sel.box;
      ctx.fillStyle = cssVar('--sel-soft'); ctx.globalAlpha = 0.35; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.globalAlpha = 1;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.restore();
    pad.hint.hidden = page.strokes.length > 0 || !!pad.lasso || !!page.fig;
  }
  function sizePad() {
    const r = pad.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width || !r.height) return;
    if (r.width === pad.w && r.height === pad.h && dpr === pad.dpr) return;
    pad.w = r.width; pad.h = r.height; pad.dpr = dpr;
    pad.canvas.width = Math.round(r.width * dpr); pad.canvas.height = Math.round(r.height * dpr);
    pad.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawPad();
  }
  function undoPad() {
    const page = pad.page, a = page.hist.pop();
    if (!a) return;
    if (a.t === 'add') { const i = page.strokes.indexOf(a.s); if (i >= 0) page.strokes.splice(i, 1); }
    else if (a.t === 'erase') { for (const it of a.items.slice().sort((x, y) => x.i - y.i)) page.strokes.splice(Math.min(it.i, page.strokes.length), 0, it.s); }
    else if (a.t === 'move') shiftStrokes(a.ss, -a.dx, -a.dy);
    else if (a.t === 'clear') page.strokes.splice(0, page.strokes.length, ...a.prev);
    pad.sel = null;
    redrawPad();
  }
  function clearPad() {
    const page = pad.page;
    if (!page.strokes.length) return;
    page.hist.push({ t: 'clear', prev: page.strokes.slice() });
    page.strokes.length = 0; pad.sel = null;
    redrawPad();
  }
  // 그림 크기: 연습장 너비에 맞추되 너무 크지 않게, 비율은 그대로
  function placeFig() {
    const f = pad.page && pad.page.fig, im = pad.figSrc && figImage(pad.figSrc);
    if (!f || f.w || !im || !im.complete || !im.naturalWidth || !pad.w) return;
    const w = Math.min(pad.w - 32, 440, im.naturalWidth * 2);
    f.w = w; f.h = w * im.naturalHeight / im.naturalWidth; f.x = 16; f.y = 16;
  }
  function cycleFig() {
    const page = pad.page;
    const cur = page.fig ? FIG_STATES.indexOf(page.fig.alpha) : 0;
    const next = FIG_STATES[(cur + 1) % FIG_STATES.length];
    if (next === null) page.fig = null;
    else if (page.fig) page.fig.alpha = next;
    else { page.fig = { x: 16, y: 16, w: 0, h: 0, alpha: next }; page.ox = 0; page.oy = 0; placeFig(); }
    syncFigBtn(); redrawPad();
  }
  function syncFigBtn() {
    const b = pad.sheet.querySelector('.fig-btn'), f = pad.page.fig;
    b.hidden = !pad.figSrc;
    b.textContent = !f ? '그림 놓기' : f.alpha === 1 ? '그림 흐리게' : '그림 빼기';
    b.setAttribute('aria-pressed', String(!!f));
    pad.qEl.classList.toggle('fig-on', !!f);
  }
  function setTool(t) {
    pad.tool = t; pad.sel = null; pad.lasso = null;
    pad.sheet.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    redrawPad();
  }
  function openScratch() {
    const q = deck.at(idx);
    if (!q) return;
    if (!pad) buildPad();
    if (!scratchStore.has(q.src)) scratchStore.set(q.src, { strokes: [], ox: 0, oy: 0, hist: [] });
    pad.page = scratchStore.get(q.src);
    pad.sel = null; pad.lasso = null; pad.mode = null; pad.pointers.clear();
    pad.qEl.innerHTML = `<strong>${idx + 1}.</strong> ${q.q}${q.type === 'mc' ? `<ol>${q.choices.map((c, i) => `<li>${LABELS.at(i)} ${c}</li>`).join('')}</ol>` : ''}`;
    const qi = pad.qEl.querySelector('img.q-img');
    pad.figSrc = qi ? qi.src : null;
    if (pad.figSrc) figImage(pad.figSrc);
    syncFigBtn();
    pad.back.hidden = false; pad.sheet.hidden = false;
    document.body.classList.add('sheet-open');
    pad.w = 0; sizePad(); placeFig(); redrawPad();
    typeset(pad.qEl);
    pad.sheet.querySelector('.close').focus({ preventScroll: true });
  }
  function closeScratch() {
    if (!pad || pad.sheet.hidden) return;
    pad.back.hidden = true; pad.sheet.hidden = true; pad.mode = null; pad.cur = null; pad.pointers.clear();
    document.body.classList.remove('sheet-open');
    const b = $('.scratch-btn'); if (b) b.focus({ preventScroll: true });
  }
  const scratchOpen = () => pad && !pad.sheet.hidden;

  // ── 화면 ──
  function mark(kind, small) {
    return `<svg class="mark${small ? ' small' : ''}" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="${kind === 'ok' ? CIRCLE : SLASH}"/></svg>`;
  }
  function typeset(el) { if (CFG.math && window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([el]).catch(() => {}); }

  function dueInfo(due) {
    if (!due) return '';
    const days = Math.round((toUTC(due) - toUTC(kstToday())) / 864e5);
    const tag = days > 0 ? `D-${days}` : days === 0 ? '오늘 마감' : '마감 지남';
    return `<span class="badge${days < 0 ? ' late' : ''}">${tag}</span> 마감 ${periodLabelDay(due)}`;
  }
  function periodLabelDay(d) { return `${md(d)} (${'일월화수목금토'[new Date(toUTC(d)).getUTCDay()]})`; }
  function renderHwPicker() {
    const s = hwSet();
    if (!s) { $('#picker').innerHTML = '<p class="empty">아직 올라온 숙제가 없어요. 선생님이 숙제를 올리면 여기에 나와요.</p>'; return; }
    $('#picker').innerHTML = `
      ${HW_SETS.length > 1 ? `<div class="chips">${HW_SETS.map(x => `<button class="chip" type="button" data-set="${esc(x.id)}" aria-pressed="${x.id === hwId}">${esc(x.label || x.title)}</button>`).join('')}</div>` : ''}
      <div class="hw-info">
        <strong class="hw-title">${esc(s.title)}</strong>
        <span class="hw-due">${dueInfo(s.due)}</span>
        ${s.note ? `<p class="hw-note">${esc(s.note)}</p>` : ''}
      </div>`;
  }
  function renderPicker() {
    if (HW) { renderHwPicker(); return; }
    if (STAGE) {
      const cur = STAGES.find(x => x.id === track) || STAGES[0];
      const parts = [...new Set(STAGES.map(x => x.part))], best = stageBest();
      $('#picker').innerHTML = `
        <div class="pick-row"><span class="lbl">과정</span>
          <div class="chips levels ops">${parts.map(p => `<button class="chip" type="button" data-part="${p}" aria-pressed="${p === cur.part}">${p}</button>`).join('')}</div></div>
        <ol class="stage-map">${STAGES.filter(x => x.part === cur.part).map(x => {
          const n = STAGES.indexOf(x) + 1, open = stageOpen(x.id), b = best[x.id] || 0;
          return `<li><button class="stage-btn${stars(b) ? ' cleared' : ''}" type="button" data-track="${x.id}" aria-pressed="${x.id === track}" ${open ? '' : 'disabled'}>
            <span class="stage-n">${open ? n : LOCK}</span><span class="stage-t">${esc(x.title)}</span>
            <span class="stage-stars" aria-label="별 ${stars(b)}개">${open ? starText(b) : ''}</span></button></li>`;
        }).join('')}</ol>
        <p class="stage-note">과정마다 첫 단계는 바로 풀 수 있어요. 10문제 중 ${PASS}문제 이상 맞히면 다음 단계가 열려요.</p>`;
      return;
    }
    if (DRILL) {
      const op = opOf(track);
      $('#picker').innerHTML = `
        <div class="pick-row"><span class="lbl">연산</span>
          <div class="chips levels ops">${OPS.map(o => `<button class="chip" type="button" data-op="${o.key}" aria-pressed="${o === op}">${o.label}</button>`).join('')}</div></div>
        <div class="pick-row"><span class="lbl">단계</span>
          <div class="chips levels">${op.tracks.map((t, i) => `<button class="chip" type="button" data-track="${t}" aria-pressed="${t === track}"><span class="n">${i + 1}</span>${TRACK_LABEL[t]}</button>`).join('')}</div></div>`;
      return;
    }
    const tracks = Object.keys(TRACK_LABEL).filter(t => (DATA[t] || []).length);
    $('#picker').innerHTML = `
      ${CFG.grade ? `<div class="pick-row"><span class="lbl">학년</span><strong>${GRADE_LABEL[CFG.grade]}</strong><a href="index.html">다른 학년 고르기</a></div>` : ''}
      ${tracks.length > 1 ? `<div class="pick-row"><span class="lbl">${CFG.trackLabel || '학기'}</span>
        <div class="seg track">${tracks.map(t => `<button type="button" data-track="${t}" aria-pressed="${t === track}">${TRACK_LABEL[t]} <span class="n">${DATA[t].length}</span></button>`).join('')}</div>
      </div>` : ''}`;
  }
  function renderTabs() {
    if (HW) { $('#tabs').innerHTML = ''; return; }
    const wrong = new Set(load('wrong', []));
    const wrongN = [...pool().keys()].filter(i => wrong.has(`${poolKey()}#${i}`)).length;
    const tabs = SHEET ? [['practice', '문제 풀기', 10], ['wrong', '오답노트', wrongN]]
      : [...(conceptList().length ? [['concept', '개념', conceptList().length]] : []), ['period', `${PERIOD_NAME} 퀴즈`, periodSize()], ['practice', '연습', pool().length], ['wrong', '오답노트', wrongN]];
    $('#tabs').innerHTML = tabs.map(([k, name, n]) => `<button class="chip" type="button" data-tab="${k}" aria-pressed="${k === tab}">${name}<span class="n">${n}</span></button>`).join('');
  }
  function renderDay() {
    if (HW) {
      if (!deck.length) { $('#day').innerHTML = ''; return; }
      const answered = deck.filter((_, i) => results.at(i)).length;
      const right = results.filter(r => r && r.correct).length;
      $('#day').innerHTML = `<span class="date">진행 ${answered} / ${deck.length}</span>
        ${answered ? `<span class="badge">맞힌 문제 ${right}</span>` : ''}
        <p class="sub">${retrying ? '틀린 문제만 다시 푸는 중이에요. 제출 기록은 바뀌지 않아요.' : '번호를 누르면 그 문제로 이동해요. 푼 곳까지 저장돼서 나중에 이어서 풀 수 있어요.'}</p>`;
      return;
    }
    const who = CFG.grade ? `${GRADE_LABEL[CFG.grade]} · ${TRACK_LABEL[track]}` : TRACK_LABEL[track];
    if (tab === 'concept') {
      $('#day').innerHTML = `<span class="date">${who} 개념</span>
        <button class="btn present-btn" type="button" data-present="0">${PRESENT_ICON}크게 보기 (수업용)</button>
        <p class="sub">단원마다 꼭 알아야 할 개념이에요. 카드를 눌러 펼쳐 읽고, 확인 문제로 바로 풀어 봐요. 수업 때는 ‘크게 보기’로 한 장씩 넘기며 설명할 수 있어요.</p>`;
      return;
    }
    if (tab === 'period') {
      const done = doneMap()[`${poolKey()}|${view}`];
      const s = streak();
      $('#day').innerHTML = `
        <button class="nav" type="button" data-act="prev" aria-label="이전" ${START && view <= START ? 'disabled' : ''}>◀</button>
        <span class="date">${periodLabel(view)}</span>
        <button class="nav" type="button" data-act="next-period" aria-label="다음" ${view >= THIS_PERIOD ? 'disabled' : ''}>▶</button>
        ${done ? `<span class="badge">완료 ${done.right}/${done.total}</span>` : ''}
        ${s ? `<span class="streak">연속 ${s}${WEEK ? '주' : '일'}</span>` : ''}
        <p class="sub">${view === THIS_PERIOD ? `${who} ${PERIOD_NAME} ${deck.length}문제예요.` : `지난 ${WEEK ? '주' : '날'}의 문제예요. 놓친 ${WEEK ? '주' : '날'}를 채워 보세요.`}${pool().length < 20 ? ` 문제가 더 추가되면 한 번에 10문제씩 나와요.` : ''}</p>`;
    } else if (STAGE && tab === 'practice') {
      const st = STAGES.find(x => x.id === track), b = stageBest()[track] || 0;
      $('#day').innerHTML = `<span class="date">${STAGES.indexOf(st) + 1}단계 · ${esc(st.title)}</span>${b ? `<span class="badge">최고 ${b} / 10 ${'★'.repeat(stars(b))}</span>` : ''}
        <p class="sub">${pool().length}문제 중 10문제를 골라요. 다 풀고 ‘채점하기’를 누르세요. ${PASS}문제 이상 맞히면 통과예요.</p>`;
    } else if (DRILL && tab === 'practice') {
      const op = opOf(track);
      $('#day').innerHTML = `<span class="date">${op.label} ${op.tracks.indexOf(track) + 1}단계 · ${TRACK_LABEL[track]}</span><p class="sub">10문제씩 풀어요. 다 풀면 ‘새 10문제’로 계속 풀 수 있고, 9문제 이상 맞히면 다음 단계로 올라갈 수 있어요.</p>`;
    } else if (tab === 'practice') {
      $('#day').innerHTML = `<span class="date">${who} 연습</span><p class="sub">전체 ${pool().length}문제 중 무작위로 10문제를 골라요. 다 풀면 ‘새 10문제’로 바꿀 수 있어요.</p>`;
    } else {
      $('#day').innerHTML = `<span class="date">${who} 오답노트</span><p class="sub">틀린 문제에서 골라요. 다시 맞히면 오답노트에서 빠집니다.</p>`;
    }
  }
  function renderDots() {
    $('#dots').innerHTML = deck.map((_, i) => {
      const r = results.at(i);
      const cls = `dot ${r ? (r.correct ? 'ok' : 'no') : ''}${i === idx ? ' now' : ''}`;
      // 숙제는 번호를 눌러 문제를 옮겨 다닐 수 있음
      return `<button class="${cls}" type="button" data-goto="${i}" aria-label="${i + 1}번 문제${r ? (r.correct ? ' (맞음)' : ' (틀림)') : ''}">${i + 1}</button>`;
    }).join('');
  }
  function renderStage() {
    renderDots();
    const stage = $('#stage');
    if (SHEET && deck.length) { $('#dots').innerHTML = ''; stage.innerHTML = sheetHTML(); typeset(stage); return; }
    if (tab === 'concept') { stage.innerHTML = conceptsHTML(); typeset(stage); return; }
    if (!deck.length) {
      stage.innerHTML = HW ? '' : `<div class="card"><p class="empty">${tab === 'wrong' ? '오답노트가 비어 있어요. 문제를 풀다 틀리면 여기에 모입니다.' : '아직 이 과정에 문제가 없어요.'}</p></div>`;
      return;
    }
    stage.innerHTML = idx < deck.length ? questionHTML(deck.at(idx)) : summaryHTML();
    typeset(stage);
    // 키보드가 있는 PC에서만 입력칸에 바로 커서를 둠. 휴대폰은 자판이 문제를 가리므로 학생이 입력칸을 누를 때 열리게 함
    const inp = $('#short-answer');
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (inp && !results.at(idx) && !touch) inp.focus({ preventScroll: true });
  }
  function renderAll() { renderPicker(); renderTabs(); renderDay(); renderStage(); }

  // ── 개념 (학생이 혼자 읽기 + 수업용 크게 보기) ──
  // 학년 페이지가 data/concepts-과목-학년.js 를 불러오면 window.QUIZ_CONCEPTS = { s1: [...], s2: [...] }
  //   개념 하나: { unit, title, body: [문단…], tip, examples: [{ q, sol }] (영어는 [{ en, ko }]), check: 문제 하나 }
  const PRESENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
  const openConcepts = new Set(), revealedEx = new Set(), conceptAns = new Map();
  function conceptList() { return HW || SHEET ? [] : ((window.QUIZ_CONCEPTS || {})[track] || []); }
  function conceptBodyHTML(c) {
    return `<div class="c-body">${(c.body || []).map(p => `<p>${texSafe(p)}</p>`).join('')}${c.tip ? `<p class="c-tip">${texSafe(c.tip)}</p>` : ''}</div>`;
  }
  // 예제: 수학은 [풀이 보기]로 펼침. 영어 예문은 소리 듣기, 크게 보기에서는 [해석 보기]로 펼침
  function exampleHTML(ex, key, big) {
    if (ex.en !== undefined) {
      const shown = !big || revealedEx.has(key);
      return `<div class="c-ex en"><p class="c-en">${esc(ex.en)}</p>${sayButton(ex.en, '듣기')}
        ${shown ? `<p class="c-ko">${esc(ex.ko)}</p>` : `<button class="btn ghost" type="button" data-reveal-ex="${key}">해석 보기</button>`}</div>`;
    }
    const shown = revealedEx.has(key);
    return `<div class="c-ex"><p class="c-q"><span class="k">예제</span>${texSafe(ex.q)}</p>
      ${shown ? `<div class="sol"><span class="k">풀이</span>${texSafe(ex.sol)}</div>` : `<button class="btn ghost" type="button" data-reveal-ex="${key}">풀이 보기</button>`}</div>`;
  }
  function checkHTML(c, key) {
    const q = c.check;
    if (!q) return '';
    const res = conceptAns.get(key);
    const body = q.t === 'mc'
      ? `<ol class="ws-choices">${q.c.map((ch, k) => {
          const cls = res ? (k === q.a ? ' right' : k === res.picked ? ' picked-wrong' : ' dim') : '';
          return `<li><button class="ws-choice${cls}" type="button" data-ccheck="${key}:${k}" ${res ? 'disabled' : ''}><span class="lab">${LABELS.at(k)}</span><span>${fmtChoice(texSafe(ch))}</span></button></li>`;
        }).join('')}</ol>`
      : `<form class="short c-form" data-cform="${key}"><input class="ws-in" name="a" ${typeof q.a === 'number' ? 'inputmode="decimal"' : 'autocapitalize="off" spellcheck="false"'} autocomplete="off" placeholder="답" aria-label="확인 문제 답" ${res ? `value="${esc(res.picked)}" disabled` : ''}>${res ? '' : '<button class="btn" type="submit">확인</button>'}</form>`;
    const fb = res ? `<p class="verdict ${res.correct ? 'ok' : ''}" role="status">${res.correct ? '정답이에요!' : `아쉬워요. 정답은 ${q.t === 'mc' ? LABELS.at(q.a) : esc(q.a)}`}</p>
      <div class="sol"><span class="k">해설</span>${texSafe(q.sol || '')}</div>
      <button class="btn ghost small" type="button" data-cretry="${key}">다시 풀기</button>` : '';
    return `<div class="c-check"><p class="c-q"><span class="k">확인 문제</span>${texSafe(q.q)}</p>${body}${fb}</div>`;
  }
  function answerConcept(key, value) {
    const c = conceptList()[Number(key)];
    if (!c || !c.check || conceptAns.has(key)) return;
    const q = c.check, picked = q.t === 'mc' ? Number(value) : String(value).trim();
    if (picked === '') return;
    const correct = isCorrect({ type: q.t === 'mc' ? 'mc' : 'short', text: typeof q.a !== 'number', ans: q.a }, picked);
    conceptAns.set(key, { picked, correct });
    rerenderConcepts();
  }
  function conceptsHTML() {
    const list = conceptList();
    return `<div class="concepts">${list.map((c, ci) => {
      const open = openConcepts.has(ci);
      return `<article class="card concept${open ? ' open' : ''}">
        <button class="c-head" type="button" data-concept="${ci}" aria-expanded="${open}">
          <span class="c-n">${ci + 1}</span><span class="c-names"><span class="c-unit">${esc(c.unit || '')}</span><span class="c-title">${esc(c.title)}</span></span>
          <span class="c-chev" aria-hidden="true">${open ? '접기 ▲' : '펼치기 ▼'}</span></button>
        ${open ? `<div class="c-main">${conceptBodyHTML(c)}
          ${(c.examples || []).map((ex, k) => exampleHTML(ex, `${ci}-${k}`, false)).join('')}
          ${checkHTML(c, String(ci))}
          <div class="row"><button class="btn ghost" type="button" data-present="${ci}">${PRESENT_ICON}이 개념 크게 보기</button></div></div>` : ''}
      </article>`;
    }).join('')}</div>`;
  }
  function rerenderConcepts() { if (present) renderSlide(); else if (tab === 'concept') { $('#stage').innerHTML = conceptsHTML(); typeset($('#stage')); } }

  // 크게 보기: 개념 → 예제(하나씩) → 확인 문제 순서로 한 장씩. ← → 키, 화면 밀기, 아래 버튼으로 넘김
  let present = null;
  function slidesFor(list) {
    const out = [];
    list.forEach((c, ci) => {
      out.push({ ci, kind: 'idea' });
      (c.examples || []).forEach((_, k) => out.push({ ci, kind: 'ex', k }));
      if (c.check) out.push({ ci, kind: 'check' });
    });
    return out;
  }
  function openPresent(fromCi) {
    const list = conceptList();
    if (!list.length) return;
    const slides = slidesFor(list);
    let el = $('#present');
    if (!el) {
      el = document.createElement('div');
      el.id = 'present'; el.className = 'present'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '개념 크게 보기');
      el.innerHTML = `<div class="p-bar"><span class="p-where"></span><span class="p-count"></span><button class="tool close" type="button" data-act="p-close">닫기</button></div>
        <div class="p-stage"></div>
        <div class="p-nav"><button class="btn ghost" type="button" data-act="p-prev">◀ 이전</button><button class="btn" type="button" data-act="p-next">다음 ▶</button></div>`;
      document.body.appendChild(el);
      let x0 = null;
      el.addEventListener('pointerdown', e => { if (!e.target.closest('button, input')) x0 = e.clientX; });
      el.addEventListener('pointerup', e => { if (x0 !== null && Math.abs(e.clientX - x0) > 70) movePresent(e.clientX < x0 ? 1 : -1); x0 = null; });
    }
    // 수업할 때는 풀이·해석을 가린 채로 시작
    revealedEx.clear();
    present = { slides, i: Math.max(0, slides.findIndex(x => x.ci === fromCi)) };
    el.hidden = false;
    document.body.classList.add('sheet-open');
    try { if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {}); } catch {}
    renderSlide();
  }
  function closePresent() {
    const el = $('#present');
    if (!el || !present) return;
    present = null; el.hidden = true;
    document.body.classList.remove('sheet-open');
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch {}
    stopSpeech();
    if (tab === 'concept') rerenderConcepts();
  }
  function movePresent(d) {
    if (!present) return;
    const i = present.i + d;
    if (i < 0 || i >= present.slides.length) return;
    present.i = i; stopSpeech(); renderSlide();
  }
  function renderSlide() {
    const el = $('#present'), list = conceptList(), sl = present.slides[present.i], c = list[sl.ci];
    el.querySelector('.p-where').textContent = `${sl.ci + 1}. ${c.title}`;
    el.querySelector('.p-count').textContent = `${present.i + 1} / ${present.slides.length}`;
    el.querySelector('[data-act="p-prev"]').disabled = present.i === 0;
    el.querySelector('[data-act="p-next"]').disabled = present.i === present.slides.length - 1;
    const st = el.querySelector('.p-stage');
    st.innerHTML = sl.kind === 'idea'
      ? `<p class="p-unit">${esc(c.unit || '')}</p><h2 class="p-title">${esc(c.title)}</h2>${conceptBodyHTML(c)}`
      : sl.kind === 'ex'
        ? `<p class="p-unit">${esc(c.title)} · 예${(c.examples || []).length > 1 ? ` ${sl.k + 1}` : ''}</p>${exampleHTML(c.examples[sl.k], `${sl.ci}-${sl.k}`, true)}`
        : `<p class="p-unit">${esc(c.title)}</p>${checkHTML(c, String(sl.ci))}`;
    st.scrollTop = 0;
    typeset(st);
  }

  function questionHTML(q) {
    const res = results.at(idx);
    const done = !!res;
    let body;
    if (q.type === 'mc') {
      body = `<ol class="choices">${q.choices.map((c, i) => {
        let cls = '', m = '';
        if (done) {
          if (i === q.ans) { cls = 'right'; m = mark('ok', true); }
          else if (i === res.picked) { cls = 'picked-wrong'; m = mark('no', true); }
          else cls = 'dim';
        }
        const mini = q.sayChoices && CAN_SPEAK ? `<button class="say-mini" type="button" data-say="${esc(q.sayChoices.at(i))}" aria-label="${LABELS.at(i)} 발음 듣기">${SPEAKER}</button>` : '';
        return `<li><button class="choice ${cls}" type="button" data-pick="${i}" ${done ? 'disabled' : ''}><span class="lab">${LABELS.at(i)}${m}</span><span>${c}</span></button>${mini}</li>`;
      }).join('')}</ol>`;
    } else if (q.type === 'order') {
      // 단어 배열: 아래 카드를 누르면 위 줄에 차례로 놓이고, 위 카드를 누르면 되돌아감
      const picks = done ? res.picked : (orderPicks.get(q.src) || []);
      const line = picks.map((k, pos) => `<button class="tok on" type="button" data-untok="${pos}" ${done ? 'disabled' : ''}>${esc(q.words[k])}</button>`).join('');
      const bank = q.order.map(k => picks.includes(k)
        ? `<span class="tok ghost" aria-hidden="true">${esc(q.words[k])}</span>`
        : `<button class="tok" type="button" data-tok="${k}">${esc(q.words[k])}</button>`).join('');
      body = `<div class="order">
        <div class="order-line${done ? (res.correct ? ' ok' : ' no') : ''}" aria-label="내가 만든 문장">${line || '<span class="order-hint">아래 단어를 순서대로 눌러 보세요</span>'}</div>
        ${done ? '' : `<div class="order-bank">${bank}</div>
        <div class="row"><button class="btn ghost" type="button" data-act="order-reset">다시</button>
        <button class="btn" type="button" data-act="order-check" ${picks.length === q.words.length ? '' : 'disabled'}>확인</button></div>`}
      </div>`;
    } else if (q.type === 'open') {
      // 서술형: 풀기 → 정답 확인 → 스스로 채점
      const open = done || revealed.has(q.src);
      body = !open
        ? `<div class="open-box"><p class="hint">연습장이나 공책에 풀어 본 뒤 정답을 확인하세요.</p><button class="btn" type="button" data-act="reveal">정답 확인</button></div>`
        : `<div class="sol"><span class="k">정답</span>${q.answer}${q.sol ? `<span class="k" style="margin-top:10px">풀이</span>${q.sol}` : ''}</div>
           ${done ? '' : `<div class="self-row"><span>내 풀이와 비교해 보세요.</span><button class="btn" type="button" data-self="right">맞았어요</button><button class="btn ghost" type="button" data-self="wrong">틀렸어요</button></div>`}`;
    } else {
      body = `<form class="short" id="short-form">
        <label for="short-answer" class="hint">${q.text ? '답을 입력하세요' : '답을 숫자로 입력하세요'}</label>
        <input id="short-answer" ${q.text ? 'autocapitalize="off" spellcheck="false"' : 'inputmode="decimal"'} autocomplete="off" ${done ? `value="${esc(res.picked)}" disabled` : ''}>
        ${done ? '' : `${q.text ? '' : '<button class="btn ghost" type="button" data-act="neg" aria-label="음수 부호 넣기/빼기">±</button>'}<button class="btn" type="submit">확인</button>`}
      </form>`;
    }
    const last = idx === deck.length - 1;
    const answerText = q.type === 'mc' ? LABELS.at(q.ans) : q.answerText || [].concat(q.ans).join(' 또는 ');
    const verdict = q.type === 'open'
      ? (res && res.correct ? '맞았어요!' : '다음엔 맞힐 수 있어요.')
      : (res && res.correct ? '정답이에요!' : `아쉬워요. 정답은 ${answerText}`);
    const feedback = done ? `
      <p class="verdict ${res.correct ? 'ok' : ''}" role="status">${verdict}</p>
      ${q.type === 'open' ? '' : `<div class="sol"><span class="k">해설</span>${q.sol || '해설이 없어요.'}</div>`}
      <div class="row">${q.sayAfter ? sayButton(q.sayAfter, q.sayLabel) : ''}<button class="btn" type="button" data-act="next" id="next-btn">${last ? '결과 보기' : '다음 문제 →'}</button></div>` : '';
    const meta = [q.cat ? `<span>${esc(q.cat)}</span>` : '', q.unit ? `<span>${q.cat ? '· ' : ''}${esc(q.unit)}</span>` : '',
      `<span class="tag${track === 'bible' ? ' bible' : ''}">${esc(q.kind)}</span>`].join('');
    return `<article class="card">
      <div class="qhead">
        <div class="qnum">${idx + 1}${done ? mark(res.correct ? 'ok' : 'no') : ''}</div>
        <div><div class="meta">${meta}</div><p class="qtext">${q.q}</p></div>
      </div>
      <div class="tools-row">${q.say ? sayButton(q.say, q.sayLabel && !q.sayAfter ? q.sayLabel : '발음 듣기', q.sayBig) : ''}<button class="scratch-btn" type="button" data-act="scratch">${PENCIL}연습장</button></div>
      ${body}
      ${feedback}
    </article>`;
  }

  // 숙제 결과(제출) 화면
  function hwSummaryHTML() {
    const s = hwSet();
    const total = deck.length;
    const todo = deck.map((_, i) => i).filter(i => !results.at(i));
    if (todo.length && !retrying) {
      return `<article class="card">
        <p class="verdict">아직 안 푼 문제가 ${todo.length}개 있어요.</p>
        <p class="empty">${todo.map(i => i + 1).join(', ')}번</p>
        <div class="row"><button class="btn" type="button" data-goto="${todo[0]}">${todo[0] + 1}번부터 풀기</button></div>
      </article>`;
    }
    if (retrying) {
      const right = results.filter(r => r && r.correct).length;
      return `<article class="card">
        <div class="score"><span class="big">${right} / ${total}${mark('ok')}</span><p>틀린 문제 다시 풀기를 마쳤어요. 제출 기록은 처음 결과 그대로예요.</p></div>
        <div class="row"><button class="btn" type="button" data-act="hw-back">제출 화면으로</button></div>
      </article>`;
    }
    const right = results.filter(r => r && r.correct).length;
    const wrongNums = deck.map((_, i) => i).filter(i => !results.at(i).correct).map(i => i + 1);
    const at = (load('done', {})[hwId] || {}).at;
    const when = at ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(at)) : '';
    const name = load('name', '');
    return `<article class="card submit-card">
      <div class="score"><span class="big">${right} / ${total}${mark('ok')}</span><p>숙제를 다 풀었어요. 이름을 적고 아래 방법대로 결과를 선생님께 보내 주세요.</p></div>
      <div class="submit-sheet" id="submit-sheet">
        <div class="submit-row"><span class="k">숙제</span><span>${esc(s.title)}</span></div>
        <div class="submit-row"><label class="k" for="hw-name">이름</label><input id="hw-name" autocomplete="name" placeholder="이름을 적어 주세요" value="${esc(name)}"></div>
        <div class="submit-row"><span class="k">점수</span><span>${right} / ${total}</span></div>
        <div class="submit-row"><span class="k">완료</span><span>${when}</span></div>
        <div class="ox-grid" aria-label="문제별 결과">${deck.map((_, i) => `<span class="${results.at(i).correct ? 'o' : 'x'}">${i + 1}</span>`).join('')}</div>
      </div>
      <ol class="send-steps">
        <li>위 칸에 <b>이름</b>을 적어요.</li>
        <li><b>[카톡으로 보내기]</b>를 누르고, 나오는 목록에서 <b>카카오톡</b> → <b>선생님</b>(또는 반 단톡방)을 골라 보내요.</li>
        <li>카톡이 목록에 없으면 <b>[결과 복사]</b>를 누르고, 카톡의 선생님 채팅방 입력 칸을 길게 눌러 <b>붙여넣기</b> → 보내기.</li>
      </ol>
      <div class="row">
        ${wrongNums.length ? '<button class="btn ghost" type="button" data-act="retry-wrong">틀린 문제만 다시</button>' : ''}
        <button class="btn ghost" type="button" data-act="copy">결과 복사</button>
        <button class="btn" type="button" data-act="share">카톡으로 보내기</button>
      </div>
      <p class="copy-msg" id="copy-msg" role="status"></p>
      <textarea class="copy-fallback" id="copy-fallback" hidden readonly aria-label="복사할 결과"></textarea>
      <div class="row"><button class="btn ghost" type="button" data-act="hw-reset">처음부터 다시 풀기</button></div>
    </article>`;
  }
  function hwResultText() {
    const s = hwSet();
    const right = results.filter(r => r && r.correct).length;
    const wrongNums = deck.map((_, i) => i).filter(i => results.at(i) && !results.at(i).correct).map(i => i + 1);
    const at = (load('done', {})[hwId] || {}).at;
    const when = at ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(at)) : '';
    return `[${CFG.title} 숙제] ${s.title}\n이름: ${load('name', '') || '(이름 없음)'}\n점수: ${right} / ${deck.length}\n완료: ${when}\n틀린 문제: ${wrongNums.length ? wrongNums.join(', ') + '번' : '없음'}`;
  }

  // ── 연산 연습: 시험지처럼 한 화면에 10문제 → 다 쓰고 [채점하기]로 한 번에 채점 ──
  let drafts = [];   // 채점 전에 적어 둔 답
  const draftKey = () => `drafts-${stateKey()}${retrying ? '-retry' : ''}`;
  function loadDrafts() { drafts = load(draftKey(), []); if (!Array.isArray(drafts)) drafts = []; }
  function sheetHTML() {
    const graded = deck.every((_, i) => results.at(i));
    const rows = deck.map((q, i) => {
      const r = results.at(i);
      if (STAGE) return stageRowHTML(q, i, r);
      const calc = (q.q.match(/<span class="calc">(.*?)<\/span>/) || [])[1] || q.q;
      const val = r ? r.picked : (drafts[i] ?? '');
      return `<li class="ws-row${r ? (r.correct ? ' ok' : ' no') : ''}">
        <span class="ws-n">${i + 1}${r ? mark(r.correct ? 'ok' : 'no', true) : ''}</span>
        <span class="ws-q">${calc.replace(/ = \?$/, ' =')}</span>
        <input class="ws-in" data-ws="${i}" ${q.text ? 'inputmode="text" autocapitalize="off" spellcheck="false" placeholder="몫, 나머지"' : 'inputmode="numeric"'} autocomplete="off" aria-label="${i + 1}번 답" value="${esc(val)}" ${r ? 'disabled' : ''}>
        <button class="ws-pad" type="button" data-ws-pad="${i}" aria-label="${i + 1}번 연습장">${PENCIL}</button>
        ${r && !r.correct ? `<span class="ws-ans">정답 ${esc(q.answerText || [].concat(q.ans)[0])}</span>` : ''}
      </li>`;
    }).join('');
    const right = results.filter(r => r && r.correct).length;
    const left = draftsLeft();
    const msg = STAGE && tab === 'practice' && !retrying
      ? (right >= PASS ? `통과했어요! ${'★'.repeat(stars(right))}${nextLevel() ? ' 다음 단계가 열렸어요.' : STAGES.at(-1).id === track ? ' 마지막 단계까지 왔어요!' : ''}` : `${PASS}문제 이상 맞혀야 통과예요. 해설을 읽고 다시 도전해 봐요!`)
      : right === deck.length ? '전부 맞혔어요!' : right / deck.length >= 0.7 ? '잘했어요. 틀린 문제를 한 번 더 풀어 봐요.' : '정답을 보고 다시 풀어 봐요.';
    const foot = graded
      ? `<div class="score"><span class="big">${right} / ${deck.length}${mark('ok')}</span><p>${msg}</p></div>
        <div class="row">
          ${right < deck.length ? '<button class="btn ghost" type="button" data-act="retry-wrong">틀린 문제만 다시</button>' : ''}
          <button class="btn${nextLevel() ? ' ghost' : ''}" type="button" data-act="restart">새 10문제</button>
          ${nextLevel() ? `<button class="btn" type="button" data-track="${nextLevel()}">다음 단계: ${STAGE ? `${STAGES.findIndex(x => x.id === nextLevel()) + 1}. ` : ''}${TRACK_LABEL[nextLevel()]} →</button>` : ''}
        </div>`
      : `<div class="row ws-grade"><button class="btn" type="button" data-act="grade" id="grade-btn">채점하기</button>
          <span class="ws-left" id="ws-left">${left ? `안 쓴 답 ${left}개` : '다 썼어요!'}</span></div>`;
    return `<article class="card ws${retrying ? ' retry' : ''}">
      ${retrying ? '<p class="sub">틀린 문제만 다시 푸는 중이에요.</p>' : ''}
      <ol class="ws-list${STAGE ? ' stage' : ''}">${rows}</ol>
      ${foot}
    </article>`;
  }
  const draftsLeft = () => deck.filter((_, i) => !results.at(i) && !String(drafts[i] ?? '').trim()).length;
  function updateLeft() { const el = $('#ws-left'), left = draftsLeft(); if (el) el.textContent = left ? `안 쓴 답 ${left}개` : '다 썼어요!'; }
  // 단계별 문제: 문제 글·보기가 길어서 카드 모양으로 한 문제씩 세로로
  function stageRowHTML(q, i, r) {
    const d = drafts[i] ?? '';
    let body;
    if (q.type === 'mc') {
      const picked = r ? r.picked : d;
      body = `<ol class="ws-choices">${q.choices.map((c, k) => {
        const cls = r ? (k === q.ans ? ' right' : String(k) === String(picked) ? ' picked-wrong' : ' dim') : '';
        return `<li><button class="ws-choice${cls}" type="button" data-ws-pick="${i}:${k}" aria-pressed="${String(k) === String(picked)}" ${r ? 'disabled' : ''}><span class="lab">${LABELS.at(k)}</span><span>${c}</span></button></li>`;
      }).join('')}</ol>`;
    } else {
      body = `<div class="ws-short"><input class="ws-in" data-ws="${i}" inputmode="${q.text ? 'text' : 'decimal'}" autocomplete="off" aria-label="${i + 1}번 답" placeholder="답" value="${esc(r ? r.picked : d)}" ${r ? 'disabled' : ''}>${r || q.text || (STAGES.find(x => x.id === track) || {}).part === '초등' ? '' : `<button class="btn ghost" type="button" data-ws-neg="${i}" aria-label="음수 부호 넣기/빼기">±</button>`}</div>`;
    }
    const fb = r && !r.correct ? `<div class="sol"><span class="k">정답 ${q.type === 'mc' ? LABELS.at(q.ans) : esc(q.answerText || [].concat(q.ans)[0])}</span>${q.sol || ''}</div>` : '';
    return `<li class="ws-item${r ? (r.correct ? ' ok' : ' no') : ''}">
      <div class="qhead"><div class="qnum">${i + 1}${r ? mark(r.correct ? 'ok' : 'no') : ''}</div>
        <div><div class="meta"><span class="tag">${esc(q.kind)}</span></div><p class="qtext">${q.q}</p></div>
        <button class="ws-pad" type="button" data-ws-pad="${i}" aria-label="${i + 1}번 연습장">${PENCIL}</button></div>
      ${body}${fb}
    </li>`;
  }
  function gradeSheet() {
    const wrong = new Set(load('wrong', []));
    deck.forEach((q, i) => {
      if (results.at(i)) return;
      const picked = String(drafts[i] ?? '').trim();
      const correct = !!picked && isCorrect(q, picked);
      results[i] = { correct, picked };
      if (!retrying || correct) correct ? wrong.delete(q.src) : wrong.add(q.src);
    });
    save('wrong', [...wrong]);
    if (STAGE && tab === 'practice' && !retrying) {
      // 단계 기록: 가장 많이 맞힌 개수
      const best = stageBest(), right = results.filter(x => x && x.correct).length;
      if (right > (best[track] || 0)) { best[track] = right; save('stage-best', best); }
      renderPicker();
    }
    drafts = []; save(draftKey(), []);
    idx = deck.length;
    stash(); renderTabs(); renderDay(); renderStage();
    const sc = document.querySelector('.ws .score'); if (sc && sc.scrollIntoView) sc.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function isCorrect(q, value) {
    if (q.type === 'mc') return String(value) !== '' && Number(value) === q.ans;
    const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]$/, '');
    const tight = s => norm(s).replace(/\s+/g, '');
    return q.text ? [].concat(q.ans).some(a => norm(a) === norm(value) || (DRILL && tight(a) === tight(value)))
      : Number(String(value).replace(/,/g, '')) === q.ans;
  }

  // 연산 연습: 이번 10문제에서 9개 이상 맞히면 다음 단계 버튼
  function nextLevel() {
    if (!SHEET || tab !== 'practice' || retrying) return '';
    const right = results.filter(r => r && r.correct).length;
    if (STAGE) { const i = STAGES.findIndex(x => x.id === track); return right >= PASS && i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1].id : ''; }
    const op = opOf(track), i = op ? op.tracks.indexOf(track) : -1;
    return right >= Math.ceil(deck.length * 0.9) && i >= 0 && i < op.tracks.length - 1 ? op.tracks[i + 1] : '';
  }
  function summaryHTML() {
    if (HW) return hwSummaryHTML();
    const todo = deck.map((_, i) => i).filter(i => !results.at(i));
    if (todo.length) {
      return `<article class="card">
        <p class="verdict">아직 안 푼 문제가 ${todo.length}개 있어요.</p>
        <p class="empty">${todo.map(i => i + 1).join(', ')}번</p>
        <div class="row"><button class="btn" type="button" data-goto="${todo[0]}">${todo[0] + 1}번부터 풀기</button></div>
      </article>`;
    }
    const total = deck.length;
    const right = results.filter(r => r && r.correct).length;
    const wrongQs = deck.filter((_, i) => !(results.at(i) && results.at(i).correct));
    const msg = right === total ? '전부 맞혔어요!' : right / total >= 0.7 ? '잘했어요. 틀린 문제만 한 번 더 보세요.' : '해설을 읽고 다시 풀어 봐요.';
    const tail = tab === 'period' && view === THIS_PERIOD ? (WEEK ? ' 다음 주 월요일에 새 문제가 나와요.' : ' 내일 새 문제가 나와요.') : '';
    return `<article class="card">
      <div class="score"><span class="big">${right} / ${total}${mark('ok')}</span><p>${msg}${tail}</p></div>
      ${wrongQs.length ? `<ul class="wrong-list">${wrongQs.map(q => `<li><div class="meta"><span>${esc(q.kind)}</span></div>${q.type === 'short' || !q.say ? q.q + '<br>' : ''}${q.sol}</li>`).join('')}</ul>` : ''}
      <div class="row">
        ${wrongQs.length ? '<button class="btn ghost" type="button" data-act="retry-wrong">틀린 문제만 다시</button>' : ''}
        <button class="btn${nextLevel() ? ' ghost' : ''}" type="button" data-act="restart">${tab === 'period' ? '처음부터 다시 풀기' : '새 10문제'}</button>
        ${nextLevel() ? `<button class="btn" type="button" data-track="${nextLevel()}">다음 단계: ${TRACK_LABEL[nextLevel()]} →</button>` : ''}
      </div>
    </article>`;
  }

  function answer(value) {
    const q = deck.at(idx);
    if (!q || results.at(idx)) return;
    let correct, picked;
    const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]$/, '');
    if (q.type === 'mc') { picked = value; correct = value === q.ans; }
    else if (q.type === 'open') { picked = value; correct = value === 'right'; }
    else if (q.type === 'order') { picked = value; correct = value.map(k => q.words[k]).join(' ') === q.answerText; orderPicks.delete(q.src); }
    else {
      picked = String(value).trim();
      if (!picked) return;
      correct = isCorrect(q, picked);
    }
    results[idx] = { correct, picked };
    if (HW) {
      // 처음으로 모든 문제를 끝낸 시각을 기록 (제출 화면에 표시)
      const done = load('done', {});
      if (!retrying && deck.every((_, i) => results.at(i)) && !done[hwId]) {
        done[hwId] = { at: new Date().toISOString() };
        save('done', done);
      }
      stash();
      renderDay(); renderStage();
      const nb = $('#next-btn'); if (nb) nb.focus({ preventScroll: true });
      return;
    }
    const wrong = new Set(load('wrong', []));
    correct ? wrong.delete(q.src) : wrong.add(q.src);
    save('wrong', [...wrong]);
    if (tab === 'period' && !retrying && deck.every((_, i) => results.at(i))) {
      const done = doneMap();
      done[`${poolKey()}|${view}`] = { right: results.filter(r => r.correct).length, total: deck.length };
      save('done', done);
    }
    stash();
    renderTabs(); renderDay(); renderStage();
    const nb = $('#next-btn'); if (nb) nb.focus({ preventScroll: true });
  }
  function next() { stopSpeech(); closeScratch(); idx += 1; stash(); renderStage(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  // 숙제 모드 전용 버튼들. 처리했으면 true
  let resetArmed = false;
  function hwClick(e, act) {
    const setBtn = e.target.closest('[data-set]');
    if (setBtn) {
      if (setBtn.dataset.set !== hwId) { stopSpeech(); closeScratch(); hwId = setBtn.dataset.set; save('set', hwId); start(); }
      return true;
    }
    const go = e.target.closest('[data-goto]');
    if (go) {
      stopSpeech(); closeScratch(); resetArmed = false;
      idx = Number(go.dataset.goto); stash(); renderStage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }
    const self = e.target.closest('[data-self]');
    if (self) { answer(self.dataset.self); return true; }
    if (act === 'reveal') { revealed.add(deck.at(idx).src); renderStage(); return true; }
    if (act === 'hw-back') { start(); return true; }
    if (act === 'copy' || act === 'share') {
      const nameEl = $('#hw-name'); if (nameEl) save('name', nameEl.value.trim());
      const msg = $('#copy-msg'), box = $('#copy-fallback');
      // 이름이 없으면 선생님이 누구 결과인지 알 수 없어서 먼저 적게 함
      if (!load('name', '')) { msg.textContent = '이름을 먼저 적어 주세요.'; if (nameEl) nameEl.focus(); return true; }
      const text = hwResultText();
      const fallback = () => { box.hidden = false; box.value = text; box.focus(); box.select(); msg.textContent = '아래 글을 길게 눌러 복사한 뒤, 카톡의 선생님 채팅방에 붙여 넣어 보내 주세요.'; };
      const copy = () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => { msg.textContent = '복사했어요. 카톡을 열어 선생님 채팅방 입력 칸을 길게 눌러 붙여넣기 한 뒤 보내 주세요.'; }, fallback);
        } else fallback();
      };
      // 카톡으로 보내기: 휴대폰의 공유하기 목록(카카오톡 등)을 띄움. 공유하기가 없는 브라우저(PC 등)는 복사로
      if (act === 'share' && navigator.share) {
        navigator.share({ title: `${CFG.title} 숙제 결과`, text }).then(() => { msg.textContent = '보냈어요. 선생님 채팅방에 잘 갔는지 확인해 주세요.'; },
          err => { if (!err || err.name !== 'AbortError') copy(); });
      } else copy();
      return true;
    }
    if (act === 'hw-reset') {
      // 기록을 지우는 버튼이라 한 번 더 눌러야 실행
      const btn = e.target.closest('[data-act]');
      if (!resetArmed) { resetArmed = true; btn.textContent = '한 번 더 누르면 푼 기록이 지워져요'; return true; }
      resetArmed = false; start(true); return true;
    }
    return false;
  }
  document.addEventListener('input', e => {
    if (HW && e.target.id === 'hw-name') save('name', e.target.value.trim());
    if (SHEET && e.target.dataset && e.target.dataset.ws !== undefined) {
      drafts[Number(e.target.dataset.ws)] = e.target.value; save(draftKey(), drafts);
      updateLeft();
    }
  });

  document.addEventListener('click', e => {
    const goBtn = !HW && e.target.closest('[data-goto]');
    if (goBtn) {
      stopSpeech(); closeScratch();
      idx = Number(goBtn.dataset.goto); stash(); renderStage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const conceptBtn = e.target.closest('[data-concept]');
    if (conceptBtn) {
      const ci = Number(conceptBtn.dataset.concept);
      openConcepts.has(ci) ? openConcepts.delete(ci) : openConcepts.add(ci);
      rerenderConcepts(); return;
    }
    const exBtn = e.target.closest('[data-reveal-ex]');
    if (exBtn) { revealedEx.add(exBtn.dataset.revealEx); rerenderConcepts(); return; }
    const cBtn = e.target.closest('[data-ccheck]');
    if (cBtn) { if (!cBtn.disabled) { const [key, k] = cBtn.dataset.ccheck.split(':'); answerConcept(key, k); } return; }
    const cRetry = e.target.closest('[data-cretry]');
    if (cRetry) { conceptAns.delete(cRetry.dataset.cretry); rerenderConcepts(); return; }
    const pBtn = e.target.closest('[data-present]');
    if (pBtn) { openPresent(Number(pBtn.dataset.present)); return; }
    const pAct = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
    if (pAct === 'p-close') { closePresent(); return; }
    if (pAct === 'p-prev') { movePresent(-1); return; }
    if (pAct === 'p-next') { movePresent(1); return; }
    const tool = e.target.closest('[data-tool]');
    if (tool && pad) { setTool(tool.dataset.tool); return; }
    const sa = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
    if (sa === 'scratch') { openScratch(); return; }
    if (sa === 'scratch-close') { closeScratch(); return; }
    if (sa === 'scratch-figure') { if (pad) cycleFig(); return; }
    if (sa === 'scratch-undo') { if (pad) undoPad(); return; }
    if (sa === 'scratch-clear') { if (pad) clearPad(); return; }
    if (sa === 'scratch-home') { if (pad) { pad.page.ox = 0; pad.page.oy = 0; redrawPad(); } return; }
    const say = e.target.closest('[data-say]');
    if (say) { speak(say.dataset.say, say); return; }
    if (HW && hwClick(e, sa)) return;
    const opBtn = DRILL && e.target.closest('[data-op]');
    if (opBtn) {
      const op = OPS.find(o => o.key === opBtn.dataset.op);
      if (!op || op === opOf(track)) return;
      // 연산을 바꾸면 그 연산에서 마지막으로 하던 단계로
      const lastT = load(`op-${op.key}`, op.tracks[0]);
      track = op.tracks.includes(lastT) ? lastT : op.tracks[0];
      save('track-level', track); tab = 'practice'; save(`tabsel-${CFG.grade}`, tab); closeScratch(); start(); return;
    }
    const tr = e.target.closest('[data-track]');
    if (tr) {
      if (tr.dataset.track === track) return;
      stopSpeech(); closeScratch(); track = tr.dataset.track; save(`track-${CFG.grade || 'level'}`, track);
      if (DRILL) { save(`op-${opOf(track).key}`, track); tab = 'practice'; save(`tabsel-${CFG.grade}`, tab); start(true); return; }
      if (STAGE) { tab = 'practice'; save(`tabsel-${CFG.grade}`, tab); start(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      tab = 'period'; save(`tabsel-${CFG.grade}`, tab); view = THIS_PERIOD; start(); return;
    }
    const tb = e.target.closest('[data-tab]');
    if (tb) {
      if (tb.dataset.tab === tab && (tab !== 'period' || view === THIS_PERIOD)) return;
      stopSpeech(); tab = tb.dataset.tab; save(`tabsel-${CFG.grade}`, tab); view = THIS_PERIOD; start(); return;
    }
    // 단어 배열 카드
    const tok = e.target.closest('[data-tok]'), untok = e.target.closest('[data-untok]');
    if (tok || untok || sa === 'order-reset' || sa === 'order-check') {
      const q = deck.at(idx);
      if (!q || q.type !== 'order' || results.at(idx)) return;
      const picks = (orderPicks.get(q.src) || []).slice();
      if (tok) picks.push(Number(tok.dataset.tok));
      if (untok) picks.splice(Number(untok.dataset.untok), 1);
      if (sa === 'order-reset') picks.length = 0;
      if (sa === 'order-check') { if (picks.length === q.words.length) answer(picks); return; }
      orderPicks.set(q.src, picks);
      renderStage();
      return;
    }
    if (SHEET && sa === 'grade') { gradeSheet(); return; }
    const wsPick = SHEET && e.target.closest('[data-ws-pick]');
    if (wsPick) {
      if (wsPick.disabled) return;
      const [i, k] = wsPick.dataset.wsPick.split(':');
      drafts[Number(i)] = k; save(draftKey(), drafts);
      wsPick.closest('.ws-choices').querySelectorAll('[data-ws-pick]').forEach(b => b.setAttribute('aria-pressed', String(b === wsPick)));
      updateLeft(); return;
    }
    const wsNeg = SHEET && e.target.closest('[data-ws-neg]');
    if (wsNeg) {
      const inp = document.querySelector(`[data-ws="${wsNeg.dataset.wsNeg}"]`);
      if (inp) { inp.value = inp.value.startsWith('-') ? inp.value.slice(1) : '-' + inp.value; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      return;
    }
    const partBtn = STAGE && e.target.closest('[data-part]');
    if (partBtn) {
      // 과정을 바꾸면 그 과정에서 열린 단계 중 가장 높은 단계로
      const list = STAGES.filter(x => x.part === partBtn.dataset.part), open = list.filter(x => stageOpen(x.id));
      const t = (open.at(-1) || list[0]).id;
      if (t !== track) { track = t; save('track-level', track); tab = 'practice'; save(`tabsel-${CFG.grade}`, tab); closeScratch(); start(); }
      return;
    }
    const wsPad = SHEET && e.target.closest('[data-ws-pad]');
    if (wsPad) { idx = Number(wsPad.dataset.wsPad); openScratch(); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick && !pick.disabled) { answer(Number(pick.dataset.pick)); return; }
    const act = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
    if (act === 'next') next();
    if (act === 'neg') {
      // 휴대폰 숫자 키패드에는 − 키가 없는 경우가 많아서 버튼으로 부호를 바꿈
      const inp = $('#short-answer');
      if (inp) { inp.value = inp.value.startsWith('-') ? inp.value.slice(1) : '-' + inp.value; }
    }
    if (act === 'restart') start(true);
    if (act === 'prev' && !(START && view <= START)) { view = addDays(view, -STEP); start(); }
    if (act === 'next-period' && view < THIS_PERIOD) { view = addDays(view, STEP); start(); }
    if (act === 'retry-wrong') {
      deck = deck.filter((_, i) => !(results.at(i) && results.at(i).correct));
      idx = 0; results = []; retrying = true;
      if (SHEET) { save(draftKey(), []); drafts = []; }
      stash(); renderStage();
    }
  });
  document.addEventListener('submit', e => {
    if (e.target.dataset && e.target.dataset.cform !== undefined) { e.preventDefault(); answerConcept(e.target.dataset.cform, e.target.querySelector('input').value); return; }
    if (e.target.id !== 'short-form') return;
    e.preventDefault();
    answer($('#short-answer').value);
  });
  document.addEventListener('keydown', e => {
    if (present) {
      if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') closePresent(); return; }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); movePresent(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); movePresent(-1); }
      else if (e.key === 'Escape') closePresent();
      return;
    }
    if (scratchOpen()) { if (e.key === 'Escape') closeScratch(); return; }
    // 연산 연습: 답 칸에서 Enter → 다음 칸, 마지막 칸이면 채점하기 버튼으로
    if (SHEET && e.key === 'Enter' && e.target.dataset && e.target.dataset.ws !== undefined) {
      e.preventDefault();
      const ins = [...document.querySelectorAll('.ws-in:not([disabled])')], nxt = ins[ins.indexOf(e.target) + 1];
      (nxt || $('#grade-btn'))?.focus();
      return;
    }
    if (e.target.tagName === 'INPUT') return;
    const q = deck.at(idx);
    if (!q) return;
    if (q.type === 'mc' && !results.at(idx) && /^[1-5]$/.test(e.key)) answer(Number(e.key) - 1);
    else if (e.key === 'Enter' && results.at(idx) && !e.target.closest('button')) next();
  });

  // 한 줄 로고(예: "이레수학" 그림) 옆에는 제목에서 로고 글자를 뺀 나머지만 (중1, 숙제 …). 읽기 프로그램에는 전체 제목
  function brandRow(src, logoText, heading) {
    const rest = heading.startsWith(logoText) ? heading.slice(logoText.length).trim() : heading;
    return `<div class="brand-row"><img class="brand-wide" src="${src}" alt="${logoText}">${rest ? `<h1><span class="sr">${logoText} </span>${rest}</h1>` : `<h1 class="sr">${heading}</h1>`}</div>`;
  }

  // 뼈대 그리기
  const heading = HW || !CFG.grade ? CFG.title : `${CFG.title} ${GRADE_LABEL[CFG.grade]}`;
  document.title = heading;
  $('#app').innerHTML = `
    <header>
      ${CFG.home === false ? '' : `<a class="home" href="${CFG.home || '../index.html'}">${CFG.homeLabel || '← 이레 처음으로'}</a>`}
      <span class="eyebrow">${CFG.eyebrow || ''}</span>
      ${CFG.logo ? brandRow(CFG.logo, CFG.logoText || CFG.title, heading) : `<h1>${heading}</h1>`}
      <p class="lead">${CFG.lead || ''}</p>
      ${(CFG.links || []).map(l => `<a class="app-link" href="${l.href}">${l.label}</a>`).join('')}
    </header>
    <section class="picker" id="picker" aria-label="${HW ? '숙제 정보' : '학년과 과정'}"></section>
    <nav class="chips" id="tabs" aria-label="퀴즈 종류"></nav>
    <section class="day" id="day" aria-live="polite"></section>
    <div class="dots" id="dots" role="navigation" aria-label="문제 번호"></div>
    <main id="stage"></main>
    <footer>${CFG.footer || ''}</footer>`;
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && present) closePresent(); });
  window.IRAE_READY = () => { typeset($('#stage')); if (present) typeset($('#present .p-stage')); };
  // 점검용: 문제 하나를 만들어 보거나 과정을 바꿔 봄
  window.IRAE_DEBUG = { pad: () => pad, deck: () => deck, build: (t, i) => { const keep = track; track = t; const q = build(pool()[i], i, Math.random); track = keep; return q; }, periodDeck: (t, p) => { const keep = track; track = t; const d = periodDeck(p); track = keep; return d; } };
  start();
})();
