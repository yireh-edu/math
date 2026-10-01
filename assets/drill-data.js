/*
 * 이레 수학 · 연산 연습 문제 만들기 (브라우저에서 바로 만듦)
 *   연산마다 자릿수 단계가 있고, 단계마다 문제를 미리 정해진 순서로 만들어 둠
 *   (같은 기기에서는 같은 번호의 문제가 같아서 오답노트가 그대로 유지됨)
 *   단계를 더하려면 OPS의 levels에 [자릿수1, 자릿수2]를 추가하세요.
 */
(function () {
  const OPS = [
    { key: 'add', label: '덧셈', sign: '+', levels: [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2], [3, 3], [4, 3], [4, 4]] },
    { key: 'sub', label: '뺄셈', sign: '−', levels: [[1, 1], [2, 1], [2, 2], [3, 1], [3, 2], [3, 3], [4, 3], [4, 4]] },
    { key: 'mul', label: '곱셈', sign: '×', levels: [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [3, 2], [3, 3], [4, 2]] },
    // 나눗셈: [나뉘는 수 자릿수, 나누는 수 자릿수]. 나누어떨어지는 것과 나머지가 있는 것
    { key: 'div', label: '나눗셈', sign: '÷', levels: [[2, 1], [3, 1], [3, 2], [4, 2]] },
    { key: 'rem', label: '나머지 나눗셈', sign: '÷', levels: [[2, 1], [3, 1], [3, 2], [4, 2]] },
  ];
  const DIGIT = ['', '한', '두', '세', '네', '다섯'];
  const PER_LEVEL = 300;

  function rng(seed) {
    let a = 2166136261;
    for (const ch of seed) { a ^= ch.codePointAt(0); a = Math.imul(a, 16777619); }
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  // n자리 수 (한 자리는 1~9, 곱셈·나눗셈의 한 자리는 2~9로 너무 쉬운 ×1, ÷1을 뺌)
  const num = (r, n, small = 1) => n === 1 ? between(r, small, 9) : between(r, 10 ** (n - 1), 10 ** n - 1);
  const lo = n => n === 1 ? 1 : 10 ** (n - 1), hi = n => 10 ** n - 1;

  function make(op, [d1, d2], r) {
    if (op.key === 'add') { const a = num(r, d1), b = num(r, d2); return { a, b, ans: a + b }; }
    if (op.key === 'sub') {
      // 같은 자릿수면 큰 수에서 작은 수를 빼서 답이 0 이상
      let a = num(r, d1), b = num(r, d2);
      if (b > a) [a, b] = [b, a];
      return { a, b, ans: a - b };
    }
    if (op.key === 'mul') { const a = num(r, d1, 2), b = num(r, d2, 2); return { a, b, ans: a * b }; }
    // 나눗셈: 나누는 수를 먼저 고르고, 나뉘는 수가 d1자리가 되는 몫을 고름
    for (let k = 0; k < 50; k++) {
      const b = num(r, d2, 2);
      const qLo = Math.ceil(lo(d1) / b), qHi = Math.floor(hi(d1) / b);
      if (qLo > qHi || qHi < 2) continue;
      const q = between(r, Math.max(2, qLo), qHi);
      if (op.key === 'div') return { a: b * q, b, ans: q };
      const rem = between(r, 1, b - 1), a = b * q + rem;
      if (a > hi(d1)) continue;
      return { a, b, q, rem };
    }
    return null;
  }

  const data = {}, labels = {}, ops = [];
  for (const op of OPS) {
    const keys = [];
    for (const lv of op.levels) {
      const key = `${op.key}-${lv.join('')}`;
      const r = rng(`irae-drill-${key}`), seen = new Set(), items = [];
      for (let tries = 0; items.length < PER_LEVEL && tries < PER_LEVEL * 20; tries++) {
        const p = make(op, lv, r);
        if (!p || seen.has(`${p.a}|${p.b}`)) continue;
        seen.add(`${p.a}|${p.b}`);
        const expr = `${p.a} ${op.sign} ${p.b}`;
        if (op.key === 'rem') {
          items.push({ t: 'short', kind: op.label, unit: '',
            q: `몫과 나머지를 구하세요.<span class="calc">${expr}</span><span class="hint-letters">몫, 나머지 순서로 쉼표를 넣어 쓰세요 (예: 7, 3)</span>`,
            a: [`${p.q},${p.rem}`, `${p.q}…${p.rem}`, `${p.q}...${p.rem}`, `몫${p.q}나머지${p.rem}`, `${p.q}나머지${p.rem}`],
            answerText: `몫 ${p.q}, 나머지 ${p.rem}`,
            sol: `${expr} = ${p.q} … ${p.rem}  (확인: ${p.b} × ${p.q} + ${p.rem} = ${p.a})` });
        } else {
          items.push({ t: 'short', kind: op.label, unit: '', q: `계산해 보세요.<span class="calc">${expr} = ?</span>`, a: p.ans, sol: `${expr} = ${p.ans}` });
        }
      }
      data[key] = items;
      labels[key] = `${DIGIT[lv[0]]} 자리 ${op.sign} ${DIGIT[lv[1]]} 자리`;
      keys.push(key);
    }
    ops.push({ key: op.key, label: op.label, tracks: keys });
  }
  window.QUIZ_DATA = data;
  window.QUIZ_TRACKS = labels;
  window.QUIZ_OPS = ops;
})();
