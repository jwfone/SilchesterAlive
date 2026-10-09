// Key-building review page: pinned footprint + Great Plan wall rings + the
// current kit outline, drawn in OSGB (EPSG:27700) so ring ids and coordinates
// can be checked against QGIS. Click a ring to cycle its classification;
// the panel lists the result as JSON to paste back.
//
//   node scripts/key-review.mjs baths [--margin 45]
//
// Reads tmp/audit-buildings/raw.geojson (unsimplified rings, written by
// `npm run import:gis -- --audit-buildings`), assets/key-buildings.geojson and
// assets/key-plans/<id>.review.json (optional pre-classification).
// Writes tmp/key-review/<id>.html.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import proj4 from 'proj4';

proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs');

const ROOT = process.cwd();
const id = process.argv[2];
const mi = process.argv.indexOf('--margin');
const margin = mi > 0 ? Number(process.argv[mi + 1]) : 45;
if (!id) { console.error('usage: node scripts/key-review.mjs <key-id> [--margin m]'); process.exit(1); }

const FORUM_E = 464020, FORUM_N = 162450;
const fromLocal = (x, z) => [x + FORUM_E, FORUM_N - z];

// Current kit outlines (local metres, after WorldBuilder's translate-only
// placement) so the mismatch is visible. Rectangles: [x0, z0, x1, z1, label].
const KIT = {
  baths: (() => {
    const dx = 159 - 150, dz = 145 - 150;
    return [
      [127, 142, 139, 158, 'caldarium'], [139, 142, 151, 158, 'tepidarium'], [151, 142, 161, 158, 'apodyterium'],
      [121, 145, 127, 155, 'furnace'], [161, 139, 173, 161, 'frigidarium court'],
    ].map(([x0, z0, x1, z1, l]) => [x0 + dx, z0 + dz, x1 + dx, z1 + dz, l]);
  })(),
};

const keys = JSON.parse(readFileSync(join(ROOT, 'assets', 'key-buildings.geojson'), 'utf8'));
const key = keys.features.find((f) => f.properties.id === id);
if (!key) { console.error(`no key "${id}" in assets/key-buildings.geojson`); process.exit(1); }
const plot = key.geometry.coordinates[0];
const xs = plot.map((p) => p[0]), ys = plot.map((p) => p[1]);
const win = { e0: Math.min(...xs) - margin, e1: Math.max(...xs) + margin, n0: Math.min(...ys) - margin, n1: Math.max(...ys) + margin };

const rawPath = join(ROOT, 'tmp', 'audit-buildings', 'raw.geojson');
if (!existsSync(rawPath)) { console.error('missing tmp/audit-buildings/raw.geojson — run import:gis with --audit-buildings'); process.exit(1); }
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));

const area = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };
const rings = [];
raw.features.forEach((f, fi) => {
  const [outer, ...holes] = f.geometry.coordinates;
  const inWin = outer.some(([e, n]) => e >= win.e0 && e <= win.e1 && n >= win.n0 && n <= win.n1);
  if (!inWin) return;
  const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length, cy = outer.reduce((s, p) => s + p[1], 0) / outer.length;
  const [lon, lat] = proj4('EPSG:27700', 'EPSG:4326', [cx, cy]);
  rings.push({
    ref: `r${fi}`, shade: f.properties.shade, layer: f.properties.layer,
    area: Math.round((area(outer) - holes.reduce((s, h) => s + area(h), 0)) * 10) / 10,
    centre: [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10], latlon: [Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6],
    rings: [outer, ...holes],
  });
});

// Street surfaces for orientation (local metres in the generated plan).
const gen = readFileSync(join(ROOT, 'src', 'domain', 'townPlan.generated.ts'), 'utf8');
const grab = (name) => { const i = gen.indexOf(`export const ${name}`); const s = gen.indexOf('= ', i) + 1; const e = gen.indexOf(';\n', s); return JSON.parse(gen.slice(s, e)); };
const roads = grab('GENERATED_ROAD_POLYS')
  .map((p) => [p.outer, ...p.holes].map((r) => r.map((q) => fromLocal(q.x, q.z))))
  .filter((rs) => rs[0].some(([e, n]) => e >= win.e0 - 50 && e <= win.e1 + 50 && n >= win.n0 - 50 && n <= win.n1 + 50));

const reviewPath = join(ROOT, 'assets', 'key-plans', `${id}.review.json`);
const review = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, 'utf8')) : { rings: {} };

const kit = (KIT[id] ?? []).map(([x0, z0, x1, z1, l]) => ({ label: l, ring: [fromLocal(x0, z0), fromLocal(x1, z0), fromLocal(x1, z1), fromLocal(x0, z1), fromLocal(x0, z0)] }));

// Georeferenced underlays (e.g. a scanned excavation plan): least-squares
// affine from control points [px, py, E, N]. Images stay in tmp/ (not ours to
// commit) and are embedded in the generated page as data URIs.
const fitAffine = (pts) => {
  // Solve [u v 1] * [a b c]^T = target for x and y separately (normal equations).
  const solve = (k) => {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
    for (const p of pts) {
      const row = [p[0], p[1], 1], t = k === 0 ? p[2] : -p[3];
      for (let i = 0; i < 3; i++) { B[i] += row[i] * t; for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j]; }
    }
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(A);
    return [0, 1, 2].map((c) => det(A.map((r, i) => r.map((v, j) => (j === c ? B[i] : v)))) / D);
  };
  const [a, b, c] = solve(0), [d, e, f] = solve(1);
  const resid = pts.map((p) => Math.hypot(a * p[0] + b * p[1] + c - p[2], d * p[0] + e * p[1] + f + p[3]));
  return { m: [a, d, b, e, c, f], resid };
};
const underlays = (review.underlays ?? []).map((u) => {
  const { m, resid } = fitAffine(u.points);
  console.log(`[key-review] underlay ${u.file}: residuals ${resid.map((r) => r.toFixed(2)).join(', ')} m`);
  const img = readFileSync(join(ROOT, 'tmp', 'research', u.file));
  const href = `data:image/${u.file.endsWith('.png') ? 'png' : 'jpeg'};base64,${img.toString('base64')}`;
  return { href, label: u.label, w: u.width, h: u.height, m, opacity: u.opacity ?? 0.6 };
});

const data = { id, win, plot, rings, roads, kit, review, underlays };
const html = readFileSync(join(ROOT, 'scripts', 'key-review.template.html'), 'utf8')
  .replace('/*DATA*/null', JSON.stringify(data))
  .replaceAll('__ID__', id);
mkdirSync(join(ROOT, 'tmp', 'key-review'), { recursive: true });
const out = join(ROOT, 'tmp', 'key-review', `${id}.html`);
writeFileSync(out, html);
console.log(`[key-review] ${id}: ${rings.length} rings in window (${Math.round(win.e1 - win.e0)} x ${Math.round(win.n1 - win.n0)} m) -> ${out}`);
