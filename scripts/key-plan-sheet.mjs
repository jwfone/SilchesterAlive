// Plan sheet in the building's local frame (u east-ish, v north-ish, metres):
// 1 m grid, georeferenced underlays, Great Plan rings, draft wall runs and,
// when present, the curated plan (assets/key-plans/<id>.plan.json) with room
// names. Used to read off coordinates while curating and as the simple
// picture for review.
//
//   node scripts/key-plan-sheet.mjs baths [--no-draft] [--no-under]
//
// Writes tmp/key-plans/<id>.sheet.html (self-contained).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const id = process.argv[2];
const showDraft = !process.argv.includes('--no-draft');
const showUnder = !process.argv.includes('--no-under');
const P = (...p) => join(ROOT, ...p);
const review = JSON.parse(readFileSync(P('assets', 'key-plans', `${id}.review.json`), 'utf8'));
const draft = JSON.parse(readFileSync(P('tmp', 'key-plans', `${id}.walls.draft.json`), 'utf8'));
const planPath = P('assets', 'key-plans', `${id}.plan.json`);
const plan = existsSync(planPath) ? JSON.parse(readFileSync(planPath, 'utf8')) : null;
const raw = JSON.parse(readFileSync(P('tmp', 'audit-buildings', 'raw.geojson'), 'utf8'));

const [oE, oN] = draft.frame.originEN;
const a = (draft.frame.angleDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
const toLocal = ([E, N]) => { const dx = E - oE, dy = N - oN; return [dx * ca + dy * sa, -dx * sa + dy * ca]; };
// SVG y down: y = -v.
const pt = ([u, v]) => `${u.toFixed(2)},${(-v).toFixed(2)}`;
const path = (rings) => rings.map((r) => 'M' + r.map(pt).join('L') + 'Z').join('');

const W = 32, H = 69, U0 = -1, V0 = -1.5;
let svg = '';
// underlay: image px -> OSGB affine (fitted like key-review) -> local
for (const u of showUnder ? review.underlays ?? [] : []) {
  const pts = u.points;
  const solve = (k) => {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
    for (const p of pts) { const row = [p[0], p[1], 1], t = p[2 + k]; for (let i = 0; i < 3; i++) { B[i] += row[i] * t; for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j]; } }
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(A);
    return [0, 1, 2].map((c) => det(A.map((r, i) => r.map((v, j) => (j === c ? B[i] : v)))) / D);
  };
  const [eA, eB, eC] = solve(0), [nA, nB, nC] = solve(1);
  // local u = (E-oE)ca + (N-oN)sa ; svg y = -v = (E-oE)sa - (N-oN)ca
  const m = [
    eA * ca + nA * sa, eA * sa - nA * ca,
    eB * ca + nB * sa, eB * sa - nB * ca,
    (eC - oE) * ca + (nC - oN) * sa, (eC - oE) * sa - (nC - oN) * ca,
  ];
  const img = readFileSync(P('tmp', 'research', u.file)).toString('base64');
  svg += `<image href="data:image/jpeg;base64,${img}" width="${u.width}" height="${u.height}" transform="matrix(${m.map((x) => x.toFixed(6)).join(' ')})" opacity="0.55" preserveAspectRatio="none"/>`;
}
// grid
for (let u = Math.ceil(U0); u <= U0 + W; u++) svg += `<line x1="${u}" x2="${u}" y1="${-(V0 + H)}" y2="${-V0}" stroke="${u % 5 ? '#0002' : '#0005'}" stroke-width="${u % 5 ? 0.03 : 0.06}"/>`;
for (let v = Math.ceil(V0); v <= V0 + H; v++) svg += `<line x1="${U0}" x2="${U0 + W}" y1="${-v}" y2="${-v}" stroke="${v % 5 ? '#0002' : '#0005'}" stroke-width="${v % 5 ? 0.03 : 0.06}"/>`;
for (let u = 0; u <= U0 + W; u += 5) svg += `<text x="${u}" y="${-V0 - 0.3}" font-size="0.9" text-anchor="middle">${u}</text>`;
for (let v = 0; v <= V0 + H; v += 5) svg += `<text x="${U0 + 0.1}" y="${-v - 0.15}" font-size="0.9">${v}</text>`;
// rings (omitted ones dashed red)
const omit = new Set(review.omit ?? []);
for (const [ref, r] of Object.entries(review.rings)) {
  if (r.cls !== 'in') continue;
  const rings = raw.features[+ref.slice(1)].geometry.coordinates.map((ring) => ring.map(toLocal));
  svg += omit.has(ref)
    ? `<path d="${path(rings)}" fill="none" stroke="#c0392b" stroke-width="0.12" stroke-dasharray="0.4 0.25"/>`
    : `<path d="${path(rings)}" fill="#3a2f2580" fill-rule="evenodd" stroke="none"/>`;
}
// draft wall runs
if (showDraft) for (const w of draft.walls) {
  const [x1, y1, x2, y2] = w.axis === 'u' ? [w.from, -w.c, w.to, -w.c] : [w.c, -w.from, w.c, -w.to];
  svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1f6fd0" stroke-width="0.12"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 0.15}" font-size="0.45" fill="#1f6fd0" text-anchor="middle">${w.id}</text>`;
}
// curated plan
if (plan) {
  for (const r of plan.rooms ?? []) {
    svg += `<path d="${path([r.poly])}" fill="${r.color ?? '#2e8b5733'}" stroke="#2e8b57" stroke-width="0.08"/>`;
    const [cx, cy] = r.labelAt ?? [r.poly.reduce((s, p) => s + p[0], 0) / r.poly.length, r.poly.reduce((s, p) => s + p[1], 0) / r.poly.length];
    svg += `<text x="${cx}" y="${-cy}" font-size="${r.labelSize ?? 0.9}" text-anchor="middle" font-weight="600" fill="#123">${r.name}</text>`;
  }
  for (const w of plan.walls ?? []) {
    svg += `<line x1="${w.a[0]}" y1="${-w.a[1]}" x2="${w.b[0]}" y2="${-w.b[1]}" stroke="#d35400" stroke-width="${w.t}" stroke-opacity="0.75" stroke-linecap="butt"/>`;
    for (const op of w.openings ?? []) {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L;
      const c0 = op.at - op.w / 2, c1 = op.at + op.w / 2;
      svg += `<line x1="${w.a[0] + ux * c0}" y1="${-(w.a[1] + uy * c0)}" x2="${w.a[0] + ux * c1}" y2="${-(w.a[1] + uy * c1)}" stroke="#fff" stroke-width="${w.t + 0.05}"/>`;
    }
  }
  for (const ap of plan.apses ?? []) {
    const r = ap.r, s = (ap.start * Math.PI) / 180, e = (ap.end * Math.PI) / 180;
    const p0 = [ap.c[0] + r * Math.cos(s), ap.c[1] + r * Math.sin(s)], p1 = [ap.c[0] + r * Math.cos(e), ap.c[1] + r * Math.sin(e)];
    svg += `<path d="M${pt(p0)}A${r},${r} 0 ${Math.abs(e - s) > Math.PI ? 1 : 0} 0 ${pt(p1)}" fill="none" stroke="#d35400" stroke-width="${ap.t}" stroke-opacity="0.75"/>`;
  }
  for (const c of plan.columns ?? []) for (const p of c.at ?? []) svg += `<circle cx="${p[0]}" cy="${-p[1]}" r="${c.d / 2}" fill="#7d3c98"/>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Plan sheet: ${id}</title>
<style>body{margin:0;background:#fbfaf6;font:13px system-ui}svg{display:block;width:100%;height:auto}svg text{font-family:system-ui;fill:#333}</style></head>
<body><svg xmlns="http://www.w3.org/2000/svg" viewBox="${U0} ${-(V0 + H)} ${W} ${H}">${svg}</svg></body></html>`;
mkdirSync(P('tmp', 'key-plans'), { recursive: true });
writeFileSync(P('tmp', 'key-plans', `${id}.sheet.html`), html);
console.log(`[key-plan-sheet] ${id} -> tmp/key-plans/${id}.sheet.html${plan ? ' (with curated plan)' : ''}`);
