// Draft wall centrelines for a key building from its Great Plan rings.
//
//   node scripts/key-walls.mjs baths
//
// Rings classified "in" by assets/key-plans/<id>.review.json (minus any listed
// in its "omit" array, e.g. later-phase walls) are rotated into the building
// frame given by the key anchor in assets/key-buildings.geojson: origin at the
// anchor's first corner, +u along its first edge, +v perpendicular (metres).
// Straight wall runs are found by pairing parallel, overlapping ring edges a
// wall-thickness apart; curved runs (apses) are reported as circle fits.
// Writes tmp/key-plans/<id>.walls.draft.json for hand curation into
// assets/key-plans/<id>.plan.json; it is a starting point, not the plan.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const id = process.argv[2];
if (!id) { console.error('usage: node scripts/key-walls.mjs <key-id>'); process.exit(1); }

const review = JSON.parse(readFileSync(join(ROOT, 'assets', 'key-plans', `${id}.review.json`), 'utf8'));
const keys = JSON.parse(readFileSync(join(ROOT, 'assets', 'key-buildings.geojson'), 'utf8'));
const raw = JSON.parse(readFileSync(join(ROOT, 'tmp', 'audit-buildings', 'raw.geojson'), 'utf8'));
const anchor = keys.features.find((f) => f.properties.id === id).geometry.coordinates[0];

// Frame: SW-most corner as origin, u along the edge that runs roughly east.
const corners = anchor.slice(0, 4);
const o = corners.reduce((b, p) => (p[0] + p[1] < b[0] + b[1] ? p : b));
const oi = corners.indexOf(o);
const nb = [corners[(oi + 1) % 4], corners[(oi + 3) % 4]];
const east = nb.reduce((b, p) => (Math.abs(p[0] - o[0]) > Math.abs(b[0] - o[0]) ? p : b));
const ang = Math.atan2(east[1] - o[1], east[0] - o[0]);
const ca = Math.cos(ang), sa = Math.sin(ang);
const toLocal = ([E, N]) => { const dx = E - o[0], dy = N - o[1]; return [dx * ca + dy * sa, -dx * sa + dy * ca]; };
const r2 = (v) => Math.round(v * 100) / 100;

const omit = new Set(review.omit ?? []);
const refs = Object.entries(review.rings).filter(([k, v]) => v.cls === 'in' && !omit.has(k)).map(([k]) => k);

// Collect edges (local), keep near-axis-aligned straight ones.
const edges = [];
const curvy = [];
for (const ref of refs) {
  for (const ring of raw.features[+ref.slice(1)].geometry.coordinates) {
    const L = ring.map(toLocal);
    let shortRun = [];
    const flushCurve = () => {
      if (shortRun.length >= 6) curvy.push({ ref, pts: shortRun.map((p) => p.map(r2)) });
      shortRun = [];
    };
    for (let i = 0; i < L.length - 1; i++) {
      const a = L[i], b = L[i + 1];
      const du = b[0] - a[0], dv = b[1] - a[1], len = Math.hypot(du, dv);
      if (len < 0.05) continue;
      const axis = Math.abs(du) >= Math.abs(dv) ? 'u' : 'v';
      const skew = Math.abs(axis === 'u' ? dv / len : du / len);
      if (len >= 0.8 && skew < 0.08) {
        flushCurve();
        edges.push({ ref, axis, c: axis === 'u' ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2, lo: Math.min(axis === 'u' ? a[0] : a[1], axis === 'u' ? b[0] : b[1]), hi: Math.max(axis === 'u' ? a[0] : a[1], axis === 'u' ? b[0] : b[1]) });
      } else if (len < 1.2) {
        if (!shortRun.length) shortRun.push(a);
        shortRun.push(b);
      } else flushCurve();
    }
    flushCurve();
  }
}

// Pair parallel edges 0.4-1.6 m apart with >= 0.8 m overlap into wall runs.
const walls = [];
const used = new Set();
for (let i = 0; i < edges.length; i++) {
  let best = null;
  for (let j = 0; j < edges.length; j++) {
    if (i === j || used.has(j) || edges[i].axis !== edges[j].axis) continue;
    const t = Math.abs(edges[i].c - edges[j].c);
    const lo = Math.max(edges[i].lo, edges[j].lo), hi = Math.min(edges[i].hi, edges[j].hi);
    if (t < 0.4 || t > 1.6 || hi - lo < 0.8) continue;
    if (!best || hi - lo > best.ov) best = { j, t, lo, hi, ov: hi - lo };
  }
  if (!best || used.has(i)) continue;
  used.add(i); used.add(best.j);
  const c = (edges[i].c + edges[best.j].c) / 2;
  walls.push({ axis: edges[i].axis, c: r2(c), from: r2(best.lo), to: r2(best.hi), t: r2(best.t), rings: [...new Set([edges[i].ref, edges[best.j].ref])] });
}

// Merge collinear runs (same axis, centre within 0.3 m, gap < 0.3 m).
walls.sort((a, b) => (a.axis === b.axis ? a.c - b.c || a.from - b.from : a.axis < b.axis ? -1 : 1));
const merged = [];
for (const w of walls) {
  const p = merged[merged.length - 1];
  if (p && p.axis === w.axis && Math.abs(p.c - w.c) < 0.3 && w.from - p.to < 0.3) {
    p.to = Math.max(p.to, w.to); p.t = r2((p.t + w.t) / 2); p.rings = [...new Set([...p.rings, ...w.rings])];
  } else merged.push({ ...w });
}

// Circle fit (algebraic, Kasa) for curved runs -> apse candidates.
const fitCircle = (pts) => {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  const n = pts.length;
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], B = [sxz, syz, sz];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  const [A, Bc, C] = [0, 1, 2].map((c) => det(M.map((r, i) => r.map((v, j) => (j === c ? B[i] : v)))) / D);
  const cx = A / 2, cy = Bc / 2;
  return { cx: r2(cx), cy: r2(cy), r: r2(Math.sqrt(C + cx * cx + cy * cy)) };
};
const apses = curvy.map((c) => ({ ref: c.ref, n: c.pts.length, ...fitCircle(c.pts) }));

const out = {
  id,
  frame: { originEN: o, angleDeg: r2((ang * 180) / Math.PI), note: 'local u,v metres; E,N = origin + R(angle)·(u,v)' },
  rings: refs,
  walls: merged.map((w, k) => ({ id: `w${k}`, ...w })),
  apses,
};
mkdirSync(join(ROOT, 'tmp', 'key-plans'), { recursive: true });
const file = join(ROOT, 'tmp', 'key-plans', `${id}.walls.draft.json`);
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`[key-walls] ${id}: ${refs.length} rings, ${edges.length} straight edges -> ${merged.length} wall runs, ${apses.length} curved runs -> ${file}`);
