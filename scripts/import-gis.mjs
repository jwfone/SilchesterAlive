// GIS -> TownPlan importer (full-accuracy pipeline).
// Usage:
//   npm run import:gis
//   npm run import:gis -- GIS\ data            (default source dir)
//   npm run import:gis -- --layer=04,26,27     (subset by filename prefix)
//   npm run import:gis -- --audit-buildings    (GeoJSON overlays for GIS 10-14)
//
// Source:  11 Silchester Mapping Project zips (EPSG:27700, OSGB eastings/northings).
// NOTE: shpjs auto-reprojects to WGS84 lon/lat when a .prj is present, so this
// script converts lon/lat -> OSGB via proj4, then shifts to the local forum
// frame: x = E - FORUM_E, z = FORUM_N - N  (+x east, +z south, origin forum).
// Forum origin default = Silchester forum approx (E 464020, N 162450).
// Override: FORUM_E / FORUM_N env vars, or --forum-e / --forum-n flags.
//
// Per-layer mapping (by filename, NOT by generic keyword classifier):
//   01_contours   LineStrings + Elevation  -> terrain heightfield (IDW, median-centred)
//   02_water      Polygons                 -> WATER_POLYS (flat decals)
//   03_earthworks Hatchure polygons        -> bank centre-lines (ticks chained, true scarp width)
//   04_wall       15 strip polygons        -> wall centerline circuit + gates + amphitheatre ellipse
//   10-14_shades  Footprint polygons       -> buildings with PCA orientation + shade 1-5
//   26_roads      1 giant MultiPolygon     -> STREETS (road centre-lines from ring-edge pairs)
//   27_drains     Thin roadside-drain polygons -> DRAINS (own layer, true ditch width; never merged into streets)
//
// Perf policy: caps are enforced HERE (importer fails loudly if exceeded after
// decimation), so the renderer keeps its budgets: <=40 draws, <=350k tris.
// Output: src/domain/townPlan.generated.ts + audit to stdout (GENERATED_META).

import { mkdirSync, readdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'src', 'domain', 'townPlan.generated.ts');

const rawArgs = process.argv.slice(2);
const flags = Object.fromEntries(
  rawArgs.filter((a) => a.startsWith('--')).map((f) => {
    const [k, v] = f.slice(2).split('=');
    return [k, v ?? '1'];
  }),
);
const targets = rawArgs.filter((a) => !a.startsWith('--'));
const FORUM_E = Number(process.env.FORUM_E ?? flags['forum-e'] ?? 464020);
const FORUM_N = Number(process.env.FORUM_N ?? flags['forum-n'] ?? 162450);
const LAYER_FILTER = (flags.layer ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const AUDIT_BUILDINGS = flags['audit-buildings'] != null;

// Caps (perf policy — see header). Streets/drains are uncapped: one
// InstancedMesh each (1 draw), so count only costs ~12 tris per piece.
const MAX_WALL_PTS = 400; // 11+ strip frags x 24 pts + arc infill; ~10k tris merged
const MAX_BUILDINGS = 4000; // all 5 Great Plan shades (merged footprint meshes: 1-2 draws)
const MAX_BUILDING_RING_PTS = 80; // per ring after unclose+RDP; was a hard 24-pt slice
const MAX_WATER_PTS = 3000;
const MAX_EARTH_PTS = 8000;
const MAX_CONTOUR_PTS = 20000;
const TERRAIN_GRID = 64; // 64x64 heightfield over TERRAIN_SIZE
const TERRAIN_SIZE = 1400; // matches ground plane

let shp = null;
let proj4 = null;
try {
  ({ default: shp } = await import('shpjs'));
} catch {
  console.error('[import:gis] missing dep "shpjs" — run: npm install');
  process.exit(1);
}
try {
  ({ default: proj4 } = await import('proj4'));
} catch {
  console.error('[import:gis] missing dep "proj4" — run: npm install');
  process.exit(1);
}
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs');

// ---------- geo helpers ----------
function looksLonLat(x, y) {
  return Math.abs(x) <= 180 && Math.abs(y) <= 90;
}
function toLocal(x, y) {
  if (looksLonLat(x, y)) {
    const [e, n] = proj4('EPSG:4326', 'EPSG:27700', [x, y]);
    return { x: e - FORUM_E, z: FORUM_N - n };
  }
  return { x: x - FORUM_E, z: FORUM_N - y }; // already OSGB
}
const r1 = (v) => Math.round(v * 10) / 10;

function rdp(pts, eps = 3) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  const dist = (p, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
  };
  while (stack.length) {
    const [i0, i1] = stack.pop();
    let dmax = 0, imax = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = dist(pts[i], pts[i0], pts[i1]);
      if (d > dmax) { dmax = d; imax = i; }
    }
    if (dmax > eps) { keep[imax] = true; stack.push([i0, imax], [imax, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Uniform stride-subsample to ≤max pts (shape-preserving; unlike RDP it is
 * safe on closed rings, where RDP's degenerate first==last baseline collapses
 * thin wall strips to a handful of points). */
function strideCap(pts, max = 3000) {
  if (pts.length <= max) return pts;
  const stride = Math.ceil(pts.length / max);
  return pts.filter((_, i) => i % stride === 0);
}
/** PCA oriented bbox for a point set. Returns {cx,cz,w,d,rotY} (w = major axis). */
function pcaBox(pts) {
  const n = pts.length;
  let mx = 0, mz = 0;
  for (const p of pts) { mx += p.x; mz += p.z; }
  mx /= n; mz /= n;
  let sxx = 0, sxz = 0, szz = 0;
  for (const p of pts) {
    const dx = p.x - mx, dz = p.z - mz;
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz;
  }
  sxx /= n; sxz /= n; szz /= n;
  // eigenvector of largest eigenvalue of 2x2
  const tr = sxx + szz, det = sxx * szz - sxz * sxz;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc;
  let ax = l1 - szz, az = sxz;
  if (Math.hypot(ax, az) < 1e-9) { ax = 1; az = 0; }
  const al = Math.hypot(ax, az); ax /= al; az /= al;
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (const p of pts) {
    const dx = p.x - mx, dz = p.z - mz;
    const a = dx * ax + dz * az, b = -dx * az + dz * ax;
    if (a < minA) minA = a; if (a > maxA) maxA = a;
    if (b < minB) minB = b; if (b > maxB) maxB = b;
  }
  const cA = (minA + maxA) / 2, cB = (minB + maxB) / 2;
  // three.js rotation: local +z axis maps to (sin(rotY), cos(rotY)); box length axis (ax,az)
  const rotY = Math.atan2(ax, az);
  return {
    x: r1(mx + ax * cA - az * cB),
    z: r1(mz + az * cA + ax * cB),
    w: r1(Math.max(2, maxA - minA)),
    d: r1(Math.max(2, maxB - minB)),
    rotY: Math.round(rotY * 1000) / 1000,
  };
}

/** PCA with true extents (no 2m floor). Hatchure ticks are ~3×0.6m; flooring
 * both axes at 2m turned every earthwork into a 2m-wide rib along the scarp. */
function pcaRaw(pts) {
  const n = pts.length;
  let mx = 0, mz = 0;
  for (const p of pts) { mx += p.x; mz += p.z; }
  mx /= n; mz /= n;
  let sxx = 0, sxz = 0, szz = 0;
  for (const p of pts) {
    const dx = p.x - mx, dz = p.z - mz;
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz;
  }
  sxx /= n; sxz /= n; szz /= n;
  const tr = sxx + szz, det = sxx * szz - sxz * sxz;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc;
  let ax = l1 - szz, az = sxz;
  if (Math.hypot(ax, az) < 1e-9) { ax = 1; az = 0; }
  const al = Math.hypot(ax, az); ax /= al; az /= al;
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (const p of pts) {
    const dx = p.x - mx, dz = p.z - mz;
    const a = dx * ax + dz * az, b = -dx * az + dz * ax;
    if (a < minA) minA = a; if (a > maxA) maxA = a;
    if (b < minB) minB = b; if (b > maxB) maxB = b;
  }
  const cA = (minA + maxA) / 2, cB = (minB + maxB) / 2;
  return {
    x: mx + ax * cA - az * cB,
    z: mz + az * cA + ax * cB,
    w: maxA - minA,
    d: maxB - minB,
    ax, az,
  };
}

function resamplePolyline(pts, step) {
  if (pts.length < 2) return pts;
  const out = [{ x: pts[0].x, z: pts[0].z }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let x0 = pts[i - 1].x, z0 = pts[i - 1].z;
    const x1 = pts[i].x, z1 = pts[i].z;
    let seg = Math.hypot(x1 - x0, z1 - z0);
    if (seg < 1e-6) continue;
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      x0 += (x1 - x0) * t;
      z0 += (z1 - z0) * t;
      out.push({ x: x0, z: z0 });
      seg = Math.hypot(x1 - x0, z1 - z0);
      acc = 0;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(out[out.length - 1].x - last.x, out[out.length - 1].z - last.z) > 0.6) {
    out.push({ x: last.x, z: last.z });
  }
  return out;
}

/** Chain OS hatchure ticks into bank centre-lines. Neighbours sit along the
 * bank (perpendicular to each tick's long/scarp axis), ~1.3–4m apart. */
function chainHatchures(marks, maxLink = 6.5) {
  const n = marks.length;
  const CELL = 8;
  const buckets = new Map();
  const ck = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (let i = 0; i < n; i++) {
    const k = ck(marks[i].x, marks[i].z);
    let list = buckets.get(k);
    if (!list) { list = []; buckets.set(k, list); }
    list.push(i);
  }
  const near = (i) => {
    const m = marks[i];
    const ix = Math.floor(m.x / CELL), iz = Math.floor(m.z / CELL);
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = buckets.get(`${ix + dx},${iz + dz}`);
        if (!list) continue;
        for (const j of list) if (j !== i) out.push(j);
      }
    }
    return out;
  };
  const best = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const a = marks[i];
    const cands = [];
    for (const j of near(i)) {
      const b = marks[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.35 || dist > maxLink) continue;
      if (Math.abs(a.ax * b.ax + a.az * b.az) < 0.55) continue;
      const alongSlope = Math.abs(dx * a.ax + dz * a.az);
      const alongBank = Math.abs(-dx * a.az + dz * a.ax);
      if (alongBank < alongSlope * 0.65) continue;
      cands.push({ j, dist });
    }
    cands.sort((u, v) => u.dist - v.dist);
    best[i] = cands.slice(0, 2).map((c) => c.j);
  }
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) {
    for (const j of best[i]) {
      if (best[j].includes(i)) {
        adj[i].add(j);
        adj[j].add(i);
      }
    }
  }
  const used = new Uint8Array(n);
  const chains = [];
  const walk = (start) => {
    const ids = [start];
    used[start] = 1;
    let prev = -1, cur = start;
    while (true) {
      let next = -1;
      for (const j of adj[cur]) {
        if (j !== prev && !used[j]) { next = j; break; }
      }
      if (next < 0) break;
      used[next] = 1;
      ids.push(next);
      prev = cur;
      cur = next;
    }
    if (ids.length > 3 && adj[ids[ids.length - 1]].has(ids[0])) ids.push(ids[0]);
    return ids;
  };
  for (let i = 0; i < n; i++) {
    if (used[i] || adj[i].size > 1) continue;
    chains.push(walk(i));
  }
  for (let i = 0; i < n; i++) {
    if (!used[i]) chains.push(walk(i));
  }
  return chains;
}

function makeElevSampler(samples) {
  if (!samples.length) return null;
  const CELL = 25;
  const grid = new Map();
  for (const s of samples) {
    const k = `${Math.floor(s.x / CELL)},${Math.floor(s.z / CELL)}`;
    let list = grid.get(k);
    if (!list) { list = []; grid.set(k, list); }
    list.push(s);
  }
  return (x, z) => {
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
    let num = 0, den = 0, n = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(`${ix + dx},${iz + dz}`);
        if (!list) continue;
        for (const s of list) {
          const d2 = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z) || 0.25;
          const w = 1 / d2;
          num += s.elev * w;
          den += w;
          n++;
        }
      }
    }
    return n >= 3 && den > 0 ? num / den : null;
  };
}

function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a / 2);
}

/**
 * Centerline of a thin strip polygon (town-wall segments): split the outer ring
 * at its two farthest points into side A/B, resample both to K samples, average.
 * Returns {line, width}.
 */
function stripCenterline(ring, K = 24) {
  if (ring.length < 8) return null;
  let i0 = 0, i1 = 0, best = -1;
  for (let i = 0; i < ring.length; i += 2) {
    for (let j = i + 4; j < ring.length; j += 2) {
      const d = Math.hypot(ring[i].x - ring[j].x, ring[i].z - ring[j].z);
      if (d > best) { best = d; i0 = i; i1 = j; }
    }
  }
  if (best < 8) return null; // not a wall-length strip
  const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
  const sideA = ring.slice(lo, hi + 1);
  const sideB = [...ring.slice(hi), ...ring.slice(0, lo + 1)];
  const sample = (side, k) => {
    // resample by arclength
    const cum = [0];
    for (let i = 1; i < side.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(side[i].x - side[i - 1].x, side[i].z - side[i - 1].z));
    }
    const total = cum[cum.length - 1] || 1;
    const out = [];
    let j = 0;
    for (let s = 0; s < k; s++) {
      const t = (s / (k - 1)) * total;
      while (j < cum.length - 2 && cum[j + 1] < t) j++;
      const f = (t - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      out.push({
        x: side[j].x + (side[j + 1].x - side[j].x) * f,
        z: side[j].z + (side[j + 1].z - side[j].z) * f,
      });
    }
    return out;
  };
  const A = sample(sideA, K), B = sample(sideB, K);
  // B runs opposite direction — reverse so endpoints correspond
  B.reverse();
  const line = A.map((a, i) => ({ x: r1((a.x + B[i].x) / 2), z: r1((a.z + B[i].z) / 2) }));
  let wSum = 0;
  for (let i = 0; i < K; i++) wSum += Math.hypot(A[i].x - B[i].x, A[i].z - B[i].z);
  return { line, width: wSum / K };
}

/** Order disjoint centerline fragments into one circuit: sort all fragment points
 * by angle around the fragment centroid (wall strips ring the town, so polar
 * sort reconstructs the circuit order). Gaps >45m between consecutive points
 * are infilled along the arc (item 6) so the circuit rounds corners instead
 * of cutting straight chords across un-digitised stretches. Falls back to
 * greedy chaining if the spread is not ring-like. */
function chainFragments(frags) {
  const pts = frags.flatMap((f) => f.line);
  if (!pts.length) return [];
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p.x; cz += p.z; }
  cx /= pts.length; cz /= pts.length;
  // ring check: mean radius vs spread — walls ring the town, so use polar sort
  const radii = pts.map((p) => Math.hypot(p.x - cx, p.z - cz));
  const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
  const spread = Math.sqrt(radii.reduce((a, r) => a + (r - meanR) * (r - meanR), 0) / radii.length);
  if (spread / Math.max(1, meanR) < 0.6) {
    const sorted = pts
      .map((p) => ({ p, a: Math.atan2(p.x - cx, p.z - cz) }))
      .sort((u, v) => u.a - v.a)
      .map((u) => u.p);
    // Infill angular gaps along the arc (centre = fragment centroid).
    const out = [];
    let gaps = 0, added = 0, maxGap = 0;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i], b = sorted[(i + 1) % sorted.length];
      out.push(a);
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d <= 45) continue;
      gaps++;
      if (d > maxGap) maxGap = d;
      const aa = Math.atan2(a.x - cx, a.z - cz);
      let ab = Math.atan2(b.x - cx, b.z - cz);
      while (ab < aa) ab += 2 * Math.PI; // forward in sorted order
      const ra = Math.hypot(a.x - cx, a.z - cz), rb = Math.hypot(b.x - cx, b.z - cz);
      const n = Math.min(24, Math.floor(d / 20));
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const ang = aa + (ab - aa) * t, r = ra + (rb - ra) * t;
        out.push({ x: r1(cx + r * Math.sin(ang)), z: r1(cz + r * Math.cos(ang)) });
        added++;
      }
    }
    if (gaps) console.log(`[import:gis] walls: ${gaps} gaps arc-infilled (+${added} pts, max ${maxGap.toFixed(0)}m)`);
    return out;
  }
  // fallback: greedy endpoint chaining (previous behaviour)
  const used = new Array(frags.length).fill(false);
  let cur = frags.map((f) => f.line).reduce((a, b) => (a.length >= b.length ? a : b));
  const seedIdx = frags.findIndex((f) => f.line === cur);
  used[seedIdx] = true;
  const out = [...cur];
  for (let n = 1; n < frags.length; n++) {
    const end = out[out.length - 1];
    let bi = -1, bFlip = false, bDist = Infinity;
    frags.forEach((f, i) => {
      if (used[i]) return;
      const s = f.line[0], e = f.line[f.line.length - 1];
      const ds = Math.hypot(s.x - end.x, s.z - end.z);
      const de = Math.hypot(e.x - end.x, e.z - end.z);
      if (ds < bDist) { bDist = ds; bi = i; bFlip = false; }
      if (de < bDist) { bDist = de; bi = i; bFlip = true; }
    });
    if (bi < 0 || bDist > 120) break; // gap too big (gate / missing stretch) — stop chaining
    used[bi] = true;
    const seg = bFlip ? [...frags[bi].line].reverse() : frags[bi].line;
    out.push(...seg.slice(1));
  }
  return out;
}

// ---------- input collection ----------
function collectInputs(targets) {
  const files = [];
  const push = (p) => {
    let st;
    try { st = statSync(p); } catch { console.warn(`[import:gis] not found: ${p}`); return; }
    if (st.isDirectory()) {
      for (const f of readdirSync(p)) {
        const e = extname(f).toLowerCase();
        if (e === '.zip' || e === '.shp') files.push(join(p, f));
      }
    } else files.push(p);
  };
  (targets.length ? targets : [join('GIS data')]).forEach((t) => push(join(ROOT, t)));
  let list = [...new Set(files)].sort();
  if (LAYER_FILTER.length) {
    list = list.filter((f) => LAYER_FILTER.some((k) => basename(f).startsWith(k)));
  }
  return list;
}

async function parseFile(file) {
  const buf = readFileSync(file);
  const name = basename(file, extname(file));
  const geo = await shp(buf); // auto-reprojected lon/lat when .prj present
  return { name, feats: Array.isArray(geo) ? geo : geo.features ?? [], geo };
}

/** Flatten every FeatureCollection in a GIS 10-14 zip. Other prefixes keep parseFile.feats. */
function flattenBuildingLayers(geo, zipName) {
  const log = (label, n) => console.log(`[import:gis] ${zipName} inner: ${label} ${n} feats`);
  if (!geo) return [];
  if (Array.isArray(geo)) {
    if (geo.length && (geo[0]?.type === 'Feature' || geo[0]?.geometry)) {
      log('(array)', geo.length);
      return geo;
    }
    const out = [];
    for (const g of geo) {
      const feats = g?.features ?? [];
      log(g?.fileName ?? 'layer', feats.length);
      out.push(...feats);
    }
    return out;
  }
  if (geo.type === 'FeatureCollection' || Array.isArray(geo.features)) {
    log(geo.fileName ?? zipName, (geo.features ?? []).length);
    return geo.features ?? [];
  }
  const out = [];
  for (const [k, v] of Object.entries(geo)) {
    if (!v || k === 'fileName') continue;
    const feats = Array.isArray(v) ? v : v.features ?? [];
    if (!feats.length) continue;
    log(k, feats.length);
    out.push(...feats);
  }
  return out;
}

function eachPolygon(geom, fn) {
  if (!geom) return;
  const { type, coordinates: c } = geom;
  if (type === 'Polygon' && c?.[0]) fn(c[0], c.slice(1));
  else if (type === 'MultiPolygon') {
    for (const poly of c ?? []) {
      if (poly?.[0]) fn(poly[0], poly.slice(1));
    }
  }
}

function uncloseRing(pts) {
  if (pts.length < 2) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  if (Math.hypot(a.x - b.x, a.z - b.z) < 0.05) return pts.slice(0, -1);
  return pts;
}

/** RDP on an unclosed ring, then stride-cap. Reclose for storage. */
function simplifyRing(pts, eps = 0.4, maxPts = MAX_BUILDING_RING_PTS) {
  let r = uncloseRing(pts);
  if (r.length < 3) return pts;
  r = rdp(r, eps);
  r = strideCap(r, maxPts);
  if (r.length < 3) r = strideCap(uncloseRing(pts), maxPts);
  if (r.length >= 3) {
    const a = r[0], b = r[r.length - 1];
    if (Math.hypot(a.x - b.x, a.z - b.z) >= 0.05) r = [...r, { x: a.x, z: a.z }];
  }
  return r;
}

function obbCorners(box) {
  const c = Math.cos(box.rotY), s = Math.sin(box.rotY);
  const hw = box.w / 2, hd = box.d / 2;
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const ring = corners.map(([lx, lz]) => ({
    x: r1(box.x + lx * c + lz * s),
    z: r1(box.z - lx * s + lz * c),
  }));
  ring.push({ ...ring[0] });
  return ring;
}

function ringToOsGb(ring) {
  const coords = ring.map((p) => [r1(p.x + FORUM_E), r1(FORUM_N - p.z)]);
  const a = coords[0], b = coords[coords.length - 1];
  if (!a || !b) return coords;
  if (a[0] !== b[0] || a[1] !== b[1]) coords.push([a[0], a[1]]);
  return coords;
}

function auditFeature(outer, holes, props) {
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [ringToOsGb(outer), ...(holes ?? []).filter((h) => h.length >= 3).map(ringToOsGb)],
    },
  };
}

function eachRing(geom, fn) {
  if (!geom) return;
  const { type, coordinates: c } = geom;
  if (type === 'LineString') fn(c, null);
  else if (type === 'MultiLineString') c.forEach((l) => fn(l, null));
  // Polygon rings: index 0 is the outer ring, >0 are holes (callers that
  // need closed shapes skip holes; line-samplers treat every ring alike).
  else if (type === 'Polygon') c.forEach((r, i) => fn(r, i));
  else if (type === 'MultiPolygon') c.forEach((poly) => poly.forEach((r, i) => fn(r, i)));
  else if (type === 'Point') fn([[c[0], c[1]]], null);
  else if (type === 'MultiPoint') fn(c, null);
}
const toLocalRing = (ring) =>
  ring.map(([x, y]) => toLocal(x, y)).map((p) => ({ x: r1(p.x), z: r1(p.z) }));

// ---------- accumulators ----------
const walls = { frags: [] };
const gates = [];
const streets = []; // GIS 26 roads only (centre-lines kept for logic: gates, infill)
const roadPolys = []; // GIS 26 road surfaces as polygons (visuals: exact joins/widths)
const drains = []; // GIS 27 roadside drains only — never merged into streets
const buildings = [];
let amphi = null;
const amphiCands = [];
const terrainSamples = []; // {x,z,elev}
const contours = []; // {elev, pts: Vec2[]} — exact 1m contour vectors for the GIS map
const water = [];
const earth = []; // {x1,z1,x2,z2,width,h} — chained bank centre-lines, width = scarp length
const meta = {};
const drops = {};

function noteDrop(layer, reason, n = 1) {
  drops[`${layer}:${reason}`] = (drops[`${layer}:${reason}`] ?? 0) + n;
}

const buildingAudit = {
  raw: [], kept: [], outline: [], obb: [], dropped: [],
  stats: {
    holes: 0, rdpCollapse: 0, vertsRaw: 0, vertsOut: 0,
    iouPoor: 0, n: 0, areaRatioSum: 0, notPolygon: 0,
  },
};

// ---------- layer extractors ----------
function extractContours(name, feats) {
  let pts = 0;
  const R = TERRAIN_SIZE / 2 + 20;
  const lines = [];
  for (const f of feats) {
    const elev = Number(f.properties?.Elevation ?? NaN);
    if (!Number.isFinite(elev)) { noteDrop(name, 'no-elevation'); continue; }
    eachRing(f.geometry, (line) => {
      const local = toLocalRing(line);
      for (let i = 0; i < local.length; i += 4) {
        terrainSamples.push({ x: local[i].x, z: local[i].z, elev });
        pts++;
      }
      // Exact vector for the detailed map: RDP-simplified, play-area only.
      const simp = rdp(local, 1.5);
      if (simp.length < 2) { noteDrop(name, 'contour-degenerate'); return; }
      if (simp.every((p) => Math.abs(p.x) > R || Math.abs(p.z) > R)) { noteDrop(name, 'contour-outside'); return; }
      lines.push({ elev: Math.round(elev * 10) / 10, pts: simp, len: simp.length });
    });
  }
  // Largest-first into the point budget so far-field wiggles drop first.
  lines.sort((a, b) => b.len - a.len);
  let kept = 0;
  for (const l of lines) {
    if (kept + l.pts.length > MAX_CONTOUR_PTS) { noteDrop(name, 'contour-over-cap'); continue; }
    kept += l.pts.length;
    contours.push({ elev: l.elev, pts: l.pts });
  }
  meta[name] = pts;
  meta[`${name}:vectors`] = `${contours.length} lines/${kept} pts`;
}

function extractWater(name, feats) {
  // Item 8: keep rings touching the play area (TERRAIN_SIZE square); far-field
  // ponds cost budget but never render meaningfully (fog far < 900m).
  const R = TERRAIN_SIZE / 2;
  let pts = 0;
  for (const f of feats) {
    eachRing(f.geometry, (ring) => {
      const local = rdp(toLocalRing(ring), 1.5);
      if (local.length < 4) { noteDrop(name, 'degenerate'); return; }
      if (local.every((p) => Math.abs(p.x) > R || Math.abs(p.z) > R)) { noteDrop(name, 'outside-play-area'); return; }
      if (pts + local.length > MAX_WATER_PTS) { noteDrop(name, 'over-cap'); return; }
      water.push(local);
      pts += local.length;
    });
  }
  meta[name] = water.length;
}

function extractEarthworks(name, feats) {
  // GIS 03 is OS hatchure ticks (median 0.64m², ~3.3×0.63m), not bank polygons.
  // The long axis is the scarp (downslope); neighbours sit along the bank.
  // Chain ticks into centre-lines, width = hatchure length × 1.5 (scarp + inner
  // face). Crest height prefers the 1m-contour drop along the tick (GIS 01).
  const marks = [];
  for (const f of feats) {
    eachRing(f.geometry, (ring, idx) => {
      if (idx > 0) return;
      const local = toLocalRing(ring);
      if (local.length < 3) { noteDrop(name, 'degenerate'); return; }
      const box = pcaRaw(local);
      if (box.w < 0.8) { noteDrop(name, 'dot'); return; }
      marks.push({ x: box.x, z: box.z, ax: box.ax, az: box.az, len: box.w });
    });
  }
  const R = TERRAIN_SIZE / 2;
  const inArea = marks.filter((m) => Math.abs(m.x) <= R && Math.abs(m.z) <= R);
  if (inArea.length < marks.length) noteDrop(name, 'outside-play-area', marks.length - inArea.length);

  const elevAt = makeElevSampler(terrainSamples);
  const chains = chainHatchures(inArea);
  const maxSegs = Math.floor(MAX_EARTH_PTS / 2);
  let dropped = 0;
  for (const ids of chains) {
    const chain = ids.map((i) => inArea[i]);
    const lens = chain.map((m) => m.len).sort((a, b) => a - b);
    const scarp = lens[Math.floor(lens.length / 2)] || 4;
    const width = Math.max(2.5, Math.min(18, scarp * 1.5));
    let h = Math.max(1.15, Math.min(3.6, width * 0.48));
    if (elevAt) {
      const drops = [];
      for (const m of chain) {
        const e0 = elevAt(m.x - m.ax * m.len / 2, m.z - m.az * m.len / 2);
        const e1 = elevAt(m.x + m.ax * m.len / 2, m.z + m.az * m.len / 2);
        if (e0 != null && e1 != null) drops.push(Math.abs(e1 - e0));
      }
      if (drops.length >= 2) {
        drops.sort((a, b) => a - b);
        const med = drops[Math.floor(drops.length / 2)];
        if (med >= 0.7 && med <= 5) h = Math.max(h, Math.min(3.6, med));
      }
    }
    h = r1(h);
    const w = r1(width);
    let pts;
    if (chain.length === 1) {
      const m = chain[0];
      const bx = -m.az, bz = m.ax;
      const half = 2.2;
      pts = [
        { x: m.x - bx * half, z: m.z - bz * half },
        { x: m.x + bx * half, z: m.z + bz * half },
      ];
    } else {
      const raw = chain.map((m) => ({ x: m.x, z: m.z }));
      pts = resamplePolyline(rdp(raw, 1.2), 4);
      if (pts.length < 2) pts = [raw[0], raw[raw.length - 1]];
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (earth.length >= maxSegs) { dropped += pts.length - 1 - i; break; }
      const a = pts[i], b = pts[i + 1];
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.5) continue;
      earth.push({
        x1: r1(a.x), z1: r1(a.z),
        x2: r1(b.x), z2: r1(b.z),
        width: w, h,
      });
    }
  }
  if (dropped) noteDrop(name, 'over-cap', dropped);
  meta[name] = feats.length;
  meta[`${name}:banks`] = `${chains.length} chains/${earth.length} segs`;
  console.log(`[import:gis] ${name}: ${inArea.length} hatchures -> ${chains.length} banks, ${earth.length} segs`);
}

function extractWallAndAmphi(name, feats) {
  for (const f of feats) {
    eachRing(f.geometry, (ring, idx) => {
      if (idx > 0) { noteDrop(name, 'hole-skipped'); return; } // wall-strip holes are not wall runs
      const local = toLocalRing(ring);
      if (local.length < 8) { noteDrop(name, 'degenerate'); return; }
      const xs = local.map((p) => p.x), zs = local.map((p) => p.z);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      // Amphitheatre candidates: far east of town (x > 380), compact, thin ring
      const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs);
      const a = ringArea(local);
      if (cx > 380 && w < 80 && d < 120 && a < 400) {
        amphiCands.push(local);
        return;
      }
      const cl = stripCenterline(strideCap(local, 3000), 24);
      if (!cl) { noteDrop(name, 'no-centerline'); return; }
      walls.frags.push({ ...cl, src: name });
    });
  }
  meta[name] = feats.length;
}

function extractBuildings(name, shade, feats) {
  let kept = 0;
  for (const f of feats) {
    const gtype = f.geometry?.type;
    if (gtype !== 'Polygon' && gtype !== 'MultiPolygon') {
      buildingAudit.stats.notPolygon++;
      noteDrop(name, 'not-polygon');
      continue;
    }
    eachPolygon(f.geometry, (outerRing, holeRings) => {
      const local = toLocalRing(outerRing);
      const holesLocal = (holeRings ?? []).map(toLocalRing).filter((h) => h.length >= 3);
      buildingAudit.stats.holes += holesLocal.length;
      buildingAudit.stats.vertsRaw += local.length + holesLocal.reduce((s, h) => s + h.length, 0);
      if (AUDIT_BUILDINGS) {
        buildingAudit.raw.push(auditFeature(local, holesLocal, { layer: name, shade, holes: holesLocal.length }));
      }
      if (local.length < 4) {
        noteDrop(name, 'degenerate');
        if (AUDIT_BUILDINGS) buildingAudit.dropped.push(auditFeature(local, holesLocal, { layer: name, reason: 'degenerate' }));
        return;
      }
      const a = Math.max(0, ringArea(local) - holesLocal.reduce((s, h) => s + ringArea(h), 0));
      // Keep ALL digitised footprints: the Great Plan is mostly small wall
      // fragments (median 1-3m²), so the old 2m² "sliver" cut dropped ~47% of
      // all rings. Only sub-0.2m² dust (digitising noise) is skipped.
      if (a < 0.2) {
        noteDrop(name, 'sliver');
        if (AUDIT_BUILDINGS) buildingAudit.dropped.push(auditFeature(local, holesLocal, { layer: name, reason: 'sliver', area: r1(a) }));
        return;
      }
      if (a > 40000) {
        noteDrop(name, 'parish-size');
        if (AUDIT_BUILDINGS) buildingAudit.dropped.push(auditFeature(local, holesLocal, { layer: name, reason: 'parish-size', area: r1(a) }));
        return;
      }
      // Closed-ring RDP uses a zero-length first==last baseline and can collapse
      // thin fragments; compare against unclosed RDP for the audit score.
      const closedRdp = rdp(local, 0.4);
      const openRdp = rdp(uncloseRing(local), 0.4);
      if (closedRdp.length < 4 && openRdp.length >= 4) buildingAudit.stats.rdpCollapse++;

      const isStub = a < 6;
      const box = pcaBox(local);
      let outline = simplifyRing(local, 0.4, MAX_BUILDING_RING_PTS);
      if (outline.length < 4) outline = local;
      const holes = holesLocal
        .map((h) => {
          const s = simplifyRing(h, 0.4, MAX_BUILDING_RING_PTS);
          return s.length >= 4 ? s : h;
        })
        .filter((h) => h.length >= 4);
      if (outline.length < 4) {
        noteDrop(name, 'simplify-empty');
        if (AUDIT_BUILDINGS) buildingAudit.dropped.push(auditFeature(local, holesLocal, { layer: name, reason: 'simplify-empty' }));
        return;
      }
      buildingAudit.stats.vertsOut += outline.length + holes.reduce((s, h) => s + h.length, 0);
      // Item 4: house kit (bodies, gable roofs with ridge on X, doors on +Z,
      // map overlay) puts w on local X, but pcaBox documents major w on local
      // Z (drains/earthworks rely on that). Convert building angles only:
      // rotY - PI/2 maps the major axis onto local X. Key buildings are hand-placed
      // in kit convention and untouched; drains/earth keep pcaBox convention.
      let rotY = box.rotY - Math.PI / 2;
      if (rotY < -Math.PI) rotY += 2 * Math.PI;
      rotY = Math.round(rotY * 1000) / 1000;
      const renderBox = { ...box, rotY };
      const obbArea = Math.max(1e-3, box.w * box.d);
      const areaRatio = a / obbArea;
      buildingAudit.stats.n++;
      buildingAudit.stats.areaRatioSum += areaRatio;
      if (areaRatio < 0.7) buildingAudit.stats.iouPoor++;

      const rec = {
        id: `${name}-${kept}`.toLowerCase().replace(/\s+/g, '-').slice(0, 44),
        kind: 'house',
        shade, // GIS file identity; do not remap stubs onto shade 5
        stub: isStub,
        x: box.x, z: box.z, w: box.w, d: box.d,
        h: isStub ? 0.6 : shade <= 2 ? 5.5 : shade === 3 ? 4.5 : 1.2,
        rotY,
        outline,
      };
      if (holes.length) rec.holes = holes;
      buildings.push(rec);
      if (AUDIT_BUILDINGS) {
        buildingAudit.kept.push(auditFeature(local, holesLocal, { layer: name, shade, stub: isStub, area: r1(a), areaRatio: r1(areaRatio) }));
        buildingAudit.outline.push(auditFeature(outline, holes, { layer: name, shade, stub: isStub, n: outline.length }));
        buildingAudit.obb.push(auditFeature(obbCorners(renderBox), [], { layer: name, shade, w: box.w, d: box.d, areaRatio: r1(areaRatio) }));
      }
      kept++;
    });
  }
  meta[name] = kept;
}

function extractRoads(name, feats) {
  // 26: one giant metalled-road polygon — ring edges trace road EDGES, so each
  // road contributes two parallel edge-lines ~road-width apart. Emit the
  // centre-line of each edge-pair (item 1); unpaired edges pass through.
  // Every segment is kept (no cap, no upper length bound — long rural runs
  // are split into <=45m pieces later); only sub-10m jaggies are skipped.
  // Visuals now come from extractRoadPolys (exact surfaces); centre-lines
  // are retained for logic only (gate crossings, building infill).
  const cands = [];
  for (const f of feats) {
    eachRing(f.geometry, (ring) => {
      const local = rdp(toLocalRing(ring), 4);
      for (let i = 0; i < local.length - 1; i++) {
        const a = local[i], b = local[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 10) continue;
        cands.push({
          x1: a.x, z1: a.z, x2: b.x, z2: b.z,
          mx: (a.x + b.x) / 2, mz: (a.z + b.z) / 2,
          ux: (b.x - a.x) / len, uz: (b.z - a.z) / len,
          len, used: false,
        });
      }
    });
  }
  // Greedy undirected pairing: angle <10deg, lateral <10m, longitudinal overlap.
  const ANG_MAX = (10 * Math.PI) / 180;
  let pairs = 0;
  const emit = (s) => {
    streets.push(s);
    return true;
  };
  let kept = 0;
  for (let i = 0; i < cands.length; i++) {
    const A = cands[i];
    if (A.used) continue;
    let bi = -1, bLat = Infinity;
    for (let j = i + 1; j < cands.length; j++) {
      const B = cands[j];
      if (B.used) continue;
      let dot = A.ux * B.ux + A.uz * B.uz;
      const ang = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot))));
      if (ang > ANG_MAX) continue;
      const dx = B.mx - A.mx, dz = B.mz - A.mz;
      const lat = Math.abs(dx * A.uz - dz * A.ux);
      const lon = Math.abs(dx * A.ux + dz * A.uz);
      if (lat > 10 || lat < 0.5) continue;
      if (lon > Math.min(A.len, B.len) * 0.8) continue; // end-to-end, not a pair
      if (lat < bLat) { bLat = lat; bi = j; }
    }
    if (bi >= 0) {
      const B = cands[bi];
      // align orientations, average direction + midpoint, keep mean length
      const flip = A.ux * B.ux + A.uz * B.uz < 0 ? -1 : 1;
      let ux = A.ux + flip * B.ux, uz = A.uz + flip * B.uz;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul; uz /= ul;
      const mx = (A.mx + B.mx) / 2, mz = (A.mz + B.mz) / 2;
      const len = (A.len + B.len) / 2;
      emit({
        x1: r1(mx - (ux * len) / 2), z1: r1(mz - (uz * len) / 2),
        x2: r1(mx + (ux * len) / 2), z2: r1(mz + (uz * len) / 2),
        width: 6,
      });
      A.used = B.used = true;
      pairs++;
      kept++;
    }
  }
  for (const c of cands) {
    if (c.used) continue;
    emit({ x1: c.x1, z1: c.z1, x2: c.x2, z2: c.z2, width: 6 });
    kept++;
  }
  console.log(`[import:gis] ${name}: ${cands.length} edge segs -> ${kept} 26-roads (${pairs} centre-paired, uncapped)`);
  meta[name] = kept;
  extractRoadPolys(name, feats);
}

// Visual road surfaces: keep the GIS polygons as-is (outer + holes per poly),
// RDP-simplified and filtered to the play area. Triangulation failures are
// handled at render time per-poly (skipped + logged), so the importer only
// guarantees clean, closed, decimated rings under a point cap.
const MAX_ROAD_POLY_PTS = 15000;
function extractRoadPolys(name, feats) {
  const R = TERRAIN_SIZE / 2 + 20;
  const polys = [];
  const polyOf = (geom) => {
    if (!geom) return [];
    if (geom.type === 'Polygon') return [geom.coordinates];
    if (geom.type === 'MultiPolygon') return geom.coordinates;
    return [];
  };
  for (const f of feats) {
    for (const poly of polyOf(f.geometry)) {
      const rings = [];
      for (const ring of poly) {
        const local = rdp(toLocalRing(ring), 1.25);
        if (local.length < 4) { noteDrop(name, 'poly-degenerate'); continue; }
        // close ring explicitly for the renderer
        const first = local[0], last = local[local.length - 1];
        if (first.x !== last.x || first.z !== last.z) local.push({ x: first.x, z: first.z });
        if (local.length < 4) { noteDrop(name, 'poly-degenerate'); continue; }
        rings.push(local);
      }
      if (!rings.length) continue;
      // outer = largest absolute area; rest are holes
      rings.sort((a, b) => ringArea(b) - ringArea(a));
      const outer = rings[0], holes = rings.slice(1);
      // keep polys touching the play area (same rule as water)
      const touches =
        outer.some((p) => Math.abs(p.x) <= R && Math.abs(p.z) <= R) ||
        holes.some((h) => h.some((p) => Math.abs(p.x) <= R && Math.abs(p.z) <= R));
      if (!touches) { noteDrop(name, 'poly-outside-play-area'); continue; }
      polys.push({ outer, holes, area: ringArea(outer) });
    }
  }
  // largest-first into the point budget so far-field slivers drop first
  polys.sort((a, b) => b.area - a.area);
  let pts = 0;
  for (const p of polys) {
    const n = p.outer.length + p.holes.reduce((a, h) => a + h.length, 0);
    if (pts + n > MAX_ROAD_POLY_PTS) { noteDrop(name, 'poly-over-cap'); continue; }
    pts += n;
    roadPolys.push({ outer: p.outer, holes: p.holes });
  }
  console.log(`[import:gis] ${name}: ${polys.length} road polys kept as surfaces (${pts} pts, cap ${MAX_ROAD_POLY_PTS})`);
}

function extractDrains(name, feats) {
  // 27: roadside DRAINS — not roads. Each thin polygon's PCA long axis is the
  // ditch line, kept in its own layer at true ditch width. Never merged into
  // streets; sub-4m dots are digitising noise.
  let kept = 0;
  for (const f of feats) {
    eachRing(f.geometry, (ring) => {
      const local = toLocalRing(ring);
      if (local.length < 4) { noteDrop(name, 'degenerate'); return; }
      const box = pcaBox(local);
      if (box.w < 4) { noteDrop(name, 'dot'); return; }
      const dx = Math.sin(box.rotY) * box.w, dz = Math.cos(box.rotY) * box.w;
      drains.push({
        x1: r1(box.x - dx / 2), z1: r1(box.z - dz / 2),
        x2: r1(box.x + dx / 2), z2: r1(box.z + dz / 2),
        width: Math.max(1.5, Math.min(4, r1(box.d))),
      });
      kept++;
    });
  }
  meta[name] = kept;
}

// ---------- run ----------
const inputs = collectInputs(targets);
if (!inputs.length) {
  console.error('[import:gis] no .shp/.zip found. Expected GIS data/*.zip');
  process.exit(1);
}

for (const file of inputs) {
  const { name, feats, geo } = await parseFile(file);
  console.log(`[import:gis] ${basename(file)}: ${feats.length} feats`);
  if (/^01_/.test(name)) extractContours(name, feats);
  else if (/^02_/.test(name)) extractWater(name, feats);
  else if (/^03_/.test(name)) extractEarthworks(name, feats);
  else if (/^04_/.test(name)) extractWallAndAmphi(name, feats);
  else if (/^10_/.test(name)) extractBuildings(name, 1, flattenBuildingLayers(geo, name));
  else if (/^11_/.test(name)) extractBuildings(name, 2, flattenBuildingLayers(geo, name));
  else if (/^12_/.test(name)) extractBuildings(name, 3, flattenBuildingLayers(geo, name));
  else if (/^13_/.test(name)) extractBuildings(name, 4, flattenBuildingLayers(geo, name));
  else if (/^14_/.test(name)) extractBuildings(name, 5, flattenBuildingLayers(geo, name));
  else if (/^26_/.test(name)) extractRoads(name, feats);
  else if (/^27_/.test(name)) extractDrains(name, feats);
  else console.warn(`[import:gis] unmapped layer ${name} — skipped`);
}

// ---------- post-process ----------
// Walls: chain fragments -> dedupe -> cap. (Dedupe, NOT global RDP: RDP
// collapses gentle arc-infill back into the straight chords the infill was
// meant to replace.) Gates: fragment junctions + road crossings, snapped to
// the four canonical N/S/E/W positions.
const DEBUG_WALLS = process.env.GIS_DEBUG_WALLS === '1';
let wallPts = chainFragments(walls.frags);
wallPts = wallPts.filter((p, i) => i === 0 || Math.hypot(p.x - wallPts[i - 1].x, p.z - wallPts[i - 1].z) >= 2).slice(0, MAX_WALL_PTS);
if (wallPts.length < 4) console.warn('[import:gis] NOTE: wall circuit weak — check 04 layer.');
if (DEBUG_WALLS) {
  for (const f of walls.frags) {
    const a = f.line[0], b = f.line[f.line.length - 1];
    console.log(`[debug-walls] frag src=${f.src} n=${f.line.length} width=${f.width.toFixed(1)} ends=(${a.x},${a.z})-(${b.x},${b.z})`);
  }
}
{
  // gate candidates: endpoints of each fragment (retiled to the final circuit by proximity)
  const ends = [];
  for (const f of walls.frags) {
    ends.push(f.line[0], f.line[f.line.length - 1]);
  }
  // cluster endpoints within 30m; clusters of 2+ (fragment junction) = gate
  const clusters = [];
  for (const e of ends) {
    const c = clusters.find((k) => Math.hypot(k.x - e.x, k.z - e.z) < 30);
    if (c) { c.x = (c.x + e.x) / 2; c.z = (c.z + e.z) / 2; c.n++; }
    else clusters.push({ x: e.x, z: e.z, n: 1 });
  }
  const gateSpots = clusters.filter((c) => c.n >= 2).slice(0, 8);
  gateSpots.forEach((g) => { g.src = 'junction'; });
  // Augment with road/drain-wall crossings: Roman roads pierce the circuit at
  // gates. (The digitised wall strips don't always break at gate positions,
  // so junctions alone miss gates — but roads and their flanking drains run
  // through them. Both layers feed crossings; gates stay canonical in item 7.)
  const crossTraffic = [...streets, ...drains];
  if (wallPts.length >= 4 && crossTraffic.length) {
    const segInt = (a, b, c, d) => {
      const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z };
      const den = r.x * s.z - r.z * s.x;
      if (Math.abs(den) < 1e-9) return null;
      const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den;
      const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) return null;
      return { x: a.x + r.x * t, z: a.z + r.z * t };
    };
    const wallEdges = wallPts.map((p, i) => [p, wallPts[(i + 1) % wallPts.length]]);
    const crossings = [];
    for (const s of crossTraffic) {
      const a = { x: s.x1, z: s.z1 }, b = { x: s.x2, z: s.z2 };
      for (const [c, d] of wallEdges) {
        const hit = segInt(a, b, c, d);
        if (hit) { crossings.push(hit); break; }
      }
    }
    for (const h of crossings) {
      const near = gateSpots.find((g) => Math.hypot(g.x - h.x, g.z - h.z) < 25);
      if (near) { near.n++; continue; }
      if (gateSpots.length >= 8) { noteDrop('gates', 'over-cap'); break; }
      gateSpots.push({ x: h.x, z: h.z, n: 1, src: 'crossing' });
    }
  }
  // (cardinal-ray fallback is applied after naming, below)
  {
    const xs = gateSpots.map((g) => g.x), zs = gateSpots.map((g) => g.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    gateSpots.sort((a, b) =>
      Math.max(Math.abs(b.x - cx), Math.abs(b.z - cz)) - Math.max(Math.abs(a.x - cx), Math.abs(a.z - cz)),
    ); // outermost first: E/W/N/S extremes get canonical names
    const usedNames = new Set();
    const nameFor = (g) => {
      const dx = g.x - cx, dz = g.z - cz;
      const cands = Math.abs(dx) > Math.abs(dz)
        ? (dx > 0 ? ['east-gate'] : ['west-gate'])
        : (dz > 0 ? ['south-gate'] : ['north-gate']);
      for (const n of [...cands, `gate-${gateSpots.indexOf(g)}`]) {
        if (!usedNames.has(n)) { usedNames.add(n); return n; }
      }
      return `gate-${gateSpots.indexOf(g)}`;
    };
    gateSpots.forEach((g) => { g.name = nameFor(g); });
  }
  // rotY: gate passage (local Z between the towers) must run ACROSS the wall,
  // i.e. rotY = wall tangent + PI/2 (gate is PI-symmetric, so mod PI is fine).
  // Previously the raw tangent was used, standing the towers across the wall.
  const gateRotY = (tangent) => {
    let r = tangent + Math.PI / 2;
    while (r > Math.PI) r -= Math.PI;
    while (r <= -Math.PI) r += Math.PI;
    return Math.round(r * 1000) / 1000;
  };
  const pushGate = (g, id) => {
    let bi = 0, bd = Infinity;
    wallPts.forEach((p, j) => {
      const d = Math.hypot(p.x - g.x, p.z - g.z);
      if (d < bd) { bd = d; bi = j; }
    });
    const a = wallPts[Math.max(0, bi - 1)], b = wallPts[Math.min(wallPts.length - 1, bi + 1)];
    const rotY = gateRotY(Math.atan2(b.x - a.x, b.z - a.z));
    gates.push({
      id, x: Math.round(g.x), z: Math.round(g.z), rotY,
    });
    if (DEBUG_WALLS) console.log(`[debug-walls] gate ${id} at (${g.x.toFixed(0)},${g.z.toFixed(0)}) src=${g.src ?? '?'} rotY=${rotY}`);
  };
  gateSpots.forEach((g) => pushGate(g, g.name ?? `gate-${gates.length}`));
  // Item 7: exactly the four canonical gates (Calleva had N/S/E/W).
  // Junction/crossing spots already carry canonical names where the extremes
  // were unambiguous; numbered extras only fill a missing cardinal direction
  // (nearest extra within 150m of its ray hit), then are dropped.
  {
    let cx = 0, cz = 0;
    for (const p of wallPts) { cx += p.x; cz += p.z; }
    cx /= wallPts.length; cz /= wallPts.length;
    const rayHit = (dx, dz) => {
      let best = null, bd = Infinity;
      for (let i = 0; i < wallPts.length; i++) {
        const c = wallPts[i], d = wallPts[(i + 1) % wallPts.length];
        const ex = d.x - c.x, ez = d.z - c.z;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c.x - cx) * ez - (c.z - cz) * ex) / den;
        const u = ((c.x - cx) * dz - (c.z - cz) * dx) / den;
        if (t > 0 && u >= 0 && u <= 1 && t < bd) { bd = t; best = { x: cx + dx * t, z: cz + dz * t }; }
      }
      return best;
    };
    const tangentRotY = (gx, gz) => {
      let bi = 0, bd = Infinity;
      wallPts.forEach((p, j) => {
        const d = Math.hypot(p.x - gx, p.z - gz);
        if (d < bd) { bd = d; bi = j; }
      });
      const a = wallPts[Math.max(0, bi - 1)], b = wallPts[Math.min(wallPts.length - 1, bi + 1)];
      return gateRotY(Math.atan2(b.x - a.x, b.z - a.z));
    };
    const final = [];
    for (const [name, dx, dz] of [['north-gate', 0, -1], ['south-gate', 0, 1], ['east-gate', 1, 0], ['west-gate', -1, 0]]) {
      const named = gates.find((g) => g.id === name);
      if (named) { final.push(named); continue; }
      const hit = rayHit(dx, dz);
      if (!hit) { noteDrop('gates', 'no-cardinal-hit'); continue; }
      let best = null, bd = 150;
      for (const g of gates) {
        if (!g.id.startsWith('gate-') || final.includes(g)) continue;
        const d = Math.hypot(g.x - hit.x, g.z - hit.z);
        if (d < bd) { bd = d; best = g; }
      }
      if (best) { best.id = name; final.push(best); continue; }
      final.push({ id: name, x: Math.round(hit.x), z: Math.round(hit.z), rotY: tangentRotY(hit.x, hit.z) });
      if (DEBUG_WALLS) console.log(`[debug-walls] gate ${name} from cardinal-ray fallback at (${hit.x.toFixed(0)},${hit.z.toFixed(0)})`);
    }
    const dropped = gates.length - final.length;
    if (dropped > 0) noteDrop('gates', 'non-canonical-dropped', dropped);
    gates.length = 0;
    gates.push(...final);
  }
}

// Amphitheatre: fit ellipse (centroid + PCA half-extents) over candidates.
if (amphiCands.length) {
  const all = amphiCands.flat();
  const box = pcaBox(all);
  amphi = {
    x: Math.round(box.x), z: Math.round(box.z),
    rx: Math.max(12, Math.round(box.w / 2)), rz: Math.max(12, Math.round(box.d / 2)),
    h: 9,
  };
}

// Buildings: shade 1-2 first, dedupe exact duplicates on a 1m grid, cap.
// (The old 4m grid merged distinct adjacent wall fragments of the same
// insula, hiding real GIS detail — only true near-duplicates are dropped.)
buildings.sort((a, b) => a.shade - b.shade);
{
  const seen = new Set();
  const uniq = [];
  for (const b of buildings) {
    const k = `${Math.round(b.x / 1)}:${Math.round(b.z / 1)}:${b.shade}`;
    if (seen.has(k)) {
      noteDrop('buildings', 'duplicate-cell');
      if (AUDIT_BUILDINGS && b.outline) {
        buildingAudit.dropped.push(auditFeature(b.outline, b.holes ?? [], { layer: b.id, reason: 'duplicate-cell', shade: b.shade }));
      }
      continue;
    }
    seen.add(k);
    uniq.push(b);
    if (uniq.length >= MAX_BUILDINGS) break;
  }
  if (buildings.length > uniq.length) noteDrop('buildings', 'over-cap', buildings.length - uniq.length);
  buildings.length = 0;
  buildings.push(...uniq);
}

{
  const s = buildingAudit.stats;
  const meanRatio = s.n ? (s.areaRatioSum / s.n) : 0;
  const poorPct = s.n ? (100 * s.iouPoor / s.n) : 0;
  console.log(
    `[import:gis] buildings audit: n=${s.n} holes=${s.holes} verts ${s.vertsRaw}->${s.vertsOut} ` +
    `rdpCollapse=${s.rdpCollapse} meanArea/OBB=${meanRatio.toFixed(2)} iouPoor(<0.7)=${s.iouPoor} (${poorPct.toFixed(0)}%) ` +
    `notPolygon=${s.notPolygon}`,
  );
  meta.__buildingsAudit = {
    n: s.n, holes: s.holes, vertsRaw: s.vertsRaw, vertsOut: s.vertsOut,
    rdpCollapse: s.rdpCollapse, meanAreaObb: r1(meanRatio), iouPoor: s.iouPoor,
  };
}

if (AUDIT_BUILDINGS) {
  const dir = join(ROOT, 'tmp', 'audit-buildings');
  mkdirSync(dir, { recursive: true });
  const fc = (features) => JSON.stringify({
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'EPSG:27700' } },
    features,
  });
  writeFileSync(join(dir, 'raw.geojson'), fc(buildingAudit.raw));
  writeFileSync(join(dir, 'kept.geojson'), fc(buildingAudit.kept));
  writeFileSync(join(dir, 'outline.geojson'), fc(buildingAudit.outline));
  writeFileSync(join(dir, 'obb.geojson'), fc(buildingAudit.obb));
  writeFileSync(join(dir, 'dropped.geojson'), fc(buildingAudit.dropped));
  console.log(`[import:gis] wrote building audit GeoJSON under ${dir}`);
}

// Streets (26) and drains (27) stay separate layers: no dedup, no cap, no
// inside-first ordering — every GIS segment is drawn. Split long runs so
// instanced boxes sit on terrain without floating ends.
const splitRun = (list) => {
  const out = [];
  for (const s of list) {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const n = Math.max(1, Math.ceil(len / 45));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      out.push({
        x1: r1(s.x1 + (s.x2 - s.x1) * t0), z1: r1(s.z1 + (s.z2 - s.z1) * t0),
        x2: r1(s.x1 + (s.x2 - s.x1) * t1), z2: r1(s.z1 + (s.z2 - s.z1) * t1),
        width: s.width,
      });
    }
  }
  return out;
};
const finalStreets = splitRun(streets);
const finalDrains = splitRun(drains);
console.log(`[import:gis] streets: ${finalStreets.length} pieces from ${streets.length} 26-roads; drains: ${finalDrains.length} pieces from ${drains.length} 27-drains (uncapped, unmerged)`);

// Terrain: IDW (p=2) onto TERRAIN_GRID x TERRAIN_GRID, median-centred so y=0 stays playable.
let terrain = { size: TERRAIN_SIZE, grid: TERRAIN_GRID, heights: [] };
if (terrainSamples.length) {
  const elevs = terrainSamples.map((s) => s.elev).sort((a, b) => a - b);
  const median = elevs[Math.floor(elevs.length / 2)];
  const H = TERRAIN_GRID, S = TERRAIN_SIZE, half = S / 2;
  const heights = [];
  // stride sampling for speed (contours are dense: every 4th pt already)
  const step = Math.max(1, Math.floor(terrainSamples.length / 20000));
  const pts = terrainSamples.filter((_, i) => i % step === 0);
  for (let gz = 0; gz < H; gz++) {
    const z = -half + ((gz + 0.5) / H) * S; // grid row -> local z (north negative)
    for (let gx = 0; gx < H; gx++) {
      const x = -half + ((gx + 0.5) / H) * S;
      let num = 0, den = 0;
      for (const p of pts) {
        const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) + 1e-6;
        const w = 1 / d2;
        num += (p.elev - median) * w;
        den += w;
      }
      heights.push(Math.round((num / den) * 10) / 10);
    }
  }
  terrain = { size: S, grid: H, heights };
  meta.__terrain = `samples:${pts.length} median:${median.toFixed(1)} range:[${Math.min(...heights).toFixed(1)},${Math.max(...heights).toFixed(1)}]`;
}

// ---------- key building anchors (user-pinned truth) ----------
// assets/key-buildings.geojson: one Polygon per key in EPSG:27700 (E,N).
// Converted to local (x = E - FORUM_E, z = FORUM_N - N); centre + PCA box
// emitted as GENERATED_KEYS. Missing file -> empty array (hand fallback).
const keyAnchors = [];
try {
  const keyPath = join(ROOT, 'assets', 'key-buildings.geojson');
  if (existsSync(keyPath)) {
    const raw = readFileSync(keyPath, 'utf8');
    const fc = JSON.parse(raw);
    for (const f of fc.features ?? []) {
      const id = String(f.properties?.id ?? '').trim();
      if (!id || id === 'undefined') continue;
      if (f.properties?.status?.startsWith?.('guess')) continue; // not yet pinned
      const coords = f.geometry?.coordinates?.[0];
      if (!Array.isArray(coords) || coords.length < 4) { noteDrop('keys', `${id || '?'}:bad-geom`); continue; }
      const local = coords.map(([E, N]) => ({ x: r1(E - FORUM_E), z: r1(FORUM_N - N) }));
      const clean = uncloseRing(local);
      if (clean.length < 3) { noteDrop('keys', `${id}:degenerate`); continue; }
      const box = pcaBox(clean);
      let rotY = box.rotY - Math.PI / 2; // pca -> kit convention (same as buildings)
      while (rotY <= -Math.PI) rotY += 2 * Math.PI;
      while (rotY > Math.PI) rotY -= 2 * Math.PI;
      rotY = Math.round(rotY * 1000) / 1000;
      keyAnchors.push({
        id, x: box.x, z: box.z, w: box.w, d: box.d, rotY,
        outline: simplifyRing(local, 0.4, MAX_BUILDING_RING_PTS),
      });
    }
    console.log(`[import:gis] keys: ${keyAnchors.length} anchors from assets/key-buildings.geojson (${keyAnchors.map((k) => k.id).join(', ') || 'none'})`);
  } else {
    console.log('[import:gis] keys: no assets/key-buildings.geojson — hand fallback');
  }
} catch (err) {
  console.warn(`[import:gis] keys: failed to read anchors (${err?.message ?? err}) — hand fallback`);
}

// ---------- emit ----------
const fmt = (o) => JSON.stringify(o);
const out = `// AUTO-GENERATED by scripts/import-gis.mjs — do not hand-edit.
// Source: GIS data (${Object.entries(meta).map(([k, v]) => `${k}:${v}`).join(', ') || 'empty'})
// Forum origin OSGB E${FORUM_E} N${FORUM_N}. Rerun: npm run import:gis
export const GENERATED_WALLS: Array<{ x: number; z: number }> = ${fmt(wallPts)};

export const GENERATED_GATES: Array<{ id: string; x: number; z: number; rotY: number }> = ${fmt(gates.slice(0, 8))};

export const GENERATED_STREETS: Array<{ x1: number; z1: number; x2: number; z2: number; width: number }> = ${fmt(finalStreets)};

export const GENERATED_ROAD_POLYS: Array<{ outer: Array<{ x: number; z: number }>; holes: Array<Array<{ x: number; z: number }>> }> = ${fmt(roadPolys)};

export const GENERATED_DRAINS: Array<{ x1: number; z1: number; x2: number; z2: number; width: number }> = ${fmt(finalDrains)};

export interface GeneratedBuilding { id: string; kind: string; shade: number; stub?: boolean; x: number; z: number; w: number; d: number; h: number; rotY: number; outline: Array<{ x: number; z: number }>; holes?: Array<Array<{ x: number; z: number }>> }
export const GENERATED_BUILDINGS: GeneratedBuilding[] = ${fmt(buildings)};

export const GENERATED_AMPHITHEATRE: { x: number; z: number; rx: number; rz: number; h: number } | null = ${fmt(amphi)};

export const GENERATED_TERRAIN: { size: number; grid: number; heights: number[] } = ${fmt(terrain)};

export const GENERATED_CONTOURS: Array<{ elev: number; pts: Array<{ x: number; z: number }> }> = ${fmt(contours)};

export const GENERATED_WATER: Array<Array<{ x: number; z: number }>> = ${fmt(water)};

export const GENERATED_EARTHWORKS: Array<{ x1: number; z1: number; x2: number; z2: number; width: number; h?: number }> = ${fmt(earth)};

export interface GeneratedKey { id: string; x: number; z: number; w: number; d: number; rotY: number; outline: Array<{ x: number; z: number }> }
export const GENERATED_KEYS: GeneratedKey[] = ${fmt(keyAnchors)};

export const GENERATED_META = ${fmt({ source: inputs.map((f) => basename(f)).join(','), layers: meta, drops })};
`;
writeFileSync(OUT, out);
console.log(`[import:gis] wrote ${OUT}`);
console.log(`[import:gis] walls:${wallPts.length} gates:${gates.length} streets:${finalStreets.length} roadPolys:${roadPolys.length} drains:${finalDrains.length} buildings:${buildings.length} keys:${keyAnchors.length} amphi:${amphi ? `${amphi.x},${amphi.z} rx${amphi.rx} rz${amphi.rz}` : 'no'} water:${water.length} earth:${earth.length} contours:${contours.length} terrain:${terrain.heights.length ? `${terrain.grid}x${terrain.grid}` : 'empty'}`);
if (Object.keys(drops).length) console.log(`[import:gis] drops: ${fmt(drops)}`);
