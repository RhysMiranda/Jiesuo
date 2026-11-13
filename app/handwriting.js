/* Jiesuo handwriting: find the characters closest to a drawing. Pure, no DOM.
   Each stroke is reduced to its start, middle and end; a drawing is compared with each character
   of about the same stroke count, in writing order, and also in any order (with a small penalty),
   so a beginner's stroke order mistakes still find the character. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JiesuoHandwriting = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const DIGITS = "0123456789abcdefghijklmnopqrstuv";
  const SKIP = 0.45; // cost of a stroke with no partner
  const ORDER_PENALTY = 0.04;

  /** Points [[x,y],...] per stroke scaled into a unit square, keeping the shape's proportions. */
  function normalise(strokes) {
    const pts = strokes.flat();
    if (!pts.length) return [];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const size = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1e-6);
    const dx = (size - (Math.max(...xs) - x0)) / 2, dy = (size - (Math.max(...ys) - y0)) / 2;
    return strokes.map((s) => s.map(([x, y]) => [(x - x0 + dx) / size, (y - y0 + dy) / size]));
  }

  /** A drawn stroke (many points) as start, middle by length, and end. */
  function keyPoints(points) {
    if (points.length === 1) return [points[0], points[0], points[0]];
    let total = 0;
    const acc = [0];
    for (let k = 1; k < points.length; k++) { total += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]); acc.push(total); }
    let k = acc.findIndex((d) => d >= total / 2);
    if (k < 0) k = points.length - 1;
    return [points[0], points[k], points[points.length - 1]];
  }

  /** The index file to [{ch, strokes}] in unit squares. */
  function load(index) {
    const chars = Array.from(index.chars);
    return chars.map((ch, n) => {
      const code = index.strokes[n];
      const strokes = [];
      for (let k = 0; k + 6 <= code.length; k += 6) {
        const v = Array.from(code.slice(k, k + 6)).map((c) => DIGITS.indexOf(c) + 0.5);
        strokes.push([[v[0], v[1]], [v[2], v[3]], [v[4], v[5]]]);
      }
      return { ch, rank: n, strokes: normalise(strokes) };
    });
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const strokeCost = (a, b) => (dist(a[0], b[0]) + dist(a[1], b[1]) + dist(a[2], b[2])) / 3;

  /** In-order alignment: strokes matched in sequence, any extra or missing ones paid for. */
  function ordered(a, b) {
    const n = a.length, m = b.length;
    let prev = Array.from({ length: m + 1 }, (_, j) => j * SKIP);
    for (let i = 1; i <= n; i++) {
      const cur = [i * SKIP];
      for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j - 1] + strokeCost(a[i - 1], b[j - 1]), prev[j] + SKIP, cur[j - 1] + SKIP);
      prev = cur;
    }
    return prev[m] / Math.max(n, m);
  }

  /** Any-order matching: the cheapest pairs first. */
  function unordered(a, b) {
    const pairs = [];
    a.forEach((s, i) => b.forEach((t, j) => pairs.push([strokeCost(s, t), i, j])));
    pairs.sort((x, y) => x[0] - y[0]);
    const ua = new Set(), ub = new Set();
    let sum = 0;
    for (const [c, i, j] of pairs) {
      if (ua.has(i) || ub.has(j)) continue;
      ua.add(i); ub.add(j); sum += c;
    }
    return (sum + SKIP * Math.abs(a.length - b.length)) / Math.max(a.length, b.length) + ORDER_PENALTY;
  }

  /** The k characters closest to the drawing (strokes of [x, y] points, y down), best first. */
  function recognise(chars, drawn, k = 8) {
    const strokes = drawn.filter((s) => s.length).map(keyPoints);
    if (!strokes.length) return [];
    const mine = normalise(strokes);
    const n = mine.length, slack = Math.max(2, Math.round(n * 0.25));
    const scored = [];
    for (const c of chars) {
      if (Math.abs(c.strokes.length - n) > slack) continue;
      const s = Math.min(ordered(mine, c.strokes), unordered(mine, c.strokes)) + c.rank * 2e-6; // ties go to the commoner
      scored.push([s, c.ch]);
    }
    scored.sort((x, y) => x[0] - y[0]);
    return scored.slice(0, k).map(([score, ch]) => ({ ch, score }));
  }

  return { load, recognise, normalise, keyPoints };
});
