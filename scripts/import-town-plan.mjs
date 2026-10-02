// SHP -> TownPlan importer.
// Usage:
//   npm run import:plan -- assets/shp/silchester.zip
//   npm run import:plan -- assets/shp/            (every .zip/.shp in dir)
//   npm run import:plan -- assets/shp/walls.shp   (single layer)
//
// Input:  .shp + sidecars (.dbf/.shx/.prj) or a .zip containing them.
// Output: src/domain/townPlan.generated.ts (GENERATED_* vectors).
//
// Coordinate handling:
// - If GeoJSON coords look like OSGB36 eastings/northings (300k-700k E,
//   100k-700k N) they are treated as EPSG:27700 and shifted to a local
//   frame: x = E - FORUM_E, z = N0 - N  (+x east, +z south, origin forum).
// - If coords look like lon/lat they are projected via proj4 to OSGB first.
// - Otherwise they are assumed already local metres and passed through.
// Forum origin default = Silchester forum approx (E 464020, N 162450).
// Override: FORUM_E / FORUM_N env vars, or --forum-e / --forum-n flags.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'src', 'domain', 'townPlan.generated.ts');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((f) => {
    const [k, v] = f.slice(2).split('=');
    return [k, v ?? '1'];
  }),
);
const FORUM_E = Number(process.env.FORUM_E ?? flags['forum-e'] ?? 464020);
const FORUM_N = Number(process.env.FORUM_N ?? flags['forum-n'] ?? 162450);
const MAX_WALL_PTS = 96;
const MAX_STREETS = 120;

let shp = null;
let proj4 = null;
try {
  ({ default: shp } = await import('shpjs'));
} catch {
  console.error('[import] missing dep "shpjs" — run: npm i -D shpjs proj4');
  process.exit(1);
}
try {
  ({ default: proj4 } = await import('proj4'));
} catch { /* lon/lat input without proj4: will pass through */ }

proj4?.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs');
const wgs84 = 'EPSG:4326';
const osgb = 'EPSG:27700';

function collectInputs(targets) {
  const files = [];
  const push = (p) => {
    let st;
    try { st = statSync(p); } catch { console.warn(`[import] not found: ${p}`); return; }
    if (st.isDirectory()) {
      for (const f of readdirSync(p)) {
        const e = extname(f).toLowerCase();
        if (e === '.zip' || e === '.shp') files.push(join(p, f));
      }
    } else files.push(p);
  };
  (targets.length ? targets : ['assets/shp']).forEach((t) => push(join(ROOT, t)));
  return [...new Set(files)];
}

function looksOSGB(x, y) {
  return x > 100000 && x < 800000 && y > 50000 && y < 1300000;
}
function looksLonLat(x, y) {
  return Math.abs(x) <= 180 && Math.abs(y) <= 90;
}
function toLocal(x, y) {
  if (looksOSGB(x, y)) return { x: x - FORUM_E, z: FORUM_N - y };
  if (looksLonLat(x, y) && proj4) {
    const [e, n] = proj4(wgs84, osgb, [x, y]);
    return { x: e - FORUM_E, z: FORUM_N - n };
  }
  return { x, z: y }; // already local (or unprojectable) — pass through
}

// Ramer-Douglas-Peucker for polyline decimation (keeps wall/street counts in perf budget).
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

function ringToLocal(ring) {
  return ring.map(([x, y]) => toLocal(x, y)).map((p) => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 }));
}
function geomEach(geom, fn) {
  if (!geom) return;
  const { type, coordinates: c } = geom;
  if (type === 'LineString') fn(c);
  else if (type === 'MultiLineString') c.forEach(fn);
  else if (type === 'Polygon') c.forEach(fn);
  else if (type === 'MultiPolygon') c.forEach((poly) => poly.forEach(fn));
  else if (type === 'Point') fn([[c[0], c[1]]]);
  else if (type === 'MultiPoint') fn(c);
}

function classifyLayer(name, props) {
  const n = `${name} ${(props ?? []).join(' ')}`.toLowerCase();
  if (/amphi/.test(n)) return 'amphitheatre';
  if (/wall|defen|rampart|circuit/.test(n)) return 'walls';
  if (/gate|entrance/.test(n)) return 'gates';
  if (/road|street|via|thoroughfare|track/.test(n)) return 'streets';
  if (/forum|basilica|bath|mansio|temple|church|palace|house|insula|build|shop|structure/.test(n)) return 'buildings';
  return 'buildings'; // default: footprint layer
}

function layerKindFromProps(props) {
  const s = JSON.stringify(props ?? {}).toLowerCase();
  if (/basilica/.test(s)) return 'basilica';
  if (/forum/.test(s)) return 'forum';
  if (/bath/.test(s)) return 'baths';
  if (/mansio/.test(s)) return 'mansio';
  if (/temple/.test(s)) return 'temple';
  if (/church|st.?mary/.test(s)) return 'church';
  if (/shop/.test(s)) return 'shop';
  if (/tower|bastion/.test(s)) return 'wall-tower';
  return 'house';
}

async function parseFile(file) {
  const buf = readFileSync(file);
  const name = basename(file, extname(file));
  if (extname(file).toLowerCase() === '.zip') return { name, geo: await shp(buf) };
  // .shp path: shpjs needs combined buffer; try sibling .dbf if present.
  const dir = dirname(file);
  try {
    const dbf = readFileSync(join(dir, `${name}.dbf`));
    return { name, geo: await shp.combine([shp.parseShp(buf), shp.parseDbf(dbf)]) };
  } catch {
    return { name, geo: await shp(buf) };
  }
}

const inputs = collectInputs(args);
if (!inputs.length) {
  console.error('[import] no .shp/.zip found. Drop files into assets/shp/ first.');
  process.exit(1);
}

const walls = [];
const gates = [];
const streets = [];
const buildings = [];
let amphi = null;
const meta = {};

for (const file of inputs) {
  const { name, geo } = await parseFile(file);
  const feats = Array.isArray(geo) ? geo : geo.features ?? [];
  meta[name] = feats.length;
  const propKeys = [...new Set(feats.flatMap((f) => Object.keys(f.properties ?? {})))];
  const cls = classifyLayer(name, propKeys);
  console.log(`[import] ${basename(file)}: ${feats.length} feats -> ${cls}`);

  for (const f of feats) {
    const p = f.properties ?? {};
    if (cls === 'walls') {
      geomEach(f.geometry, (line) => {
        const pts = rdp(ringToLocal(line), 4);
        // accumulate longest ring as the circuit; short bits become towers later
        if (pts.length >= walls.length) walls.push(...pts.splice(0, MAX_WALL_PTS));
      });
    } else if (cls === 'gates') {
      geomEach(f.geometry, (line) => {
        const [lx, ly] = line[0];
        const { x, z } = toLocal(lx, ly);
        gates.push({ id: String(p.id ?? p.name ?? `gate-${gates.length}`).toLowerCase().replace(/\s+/g, '-'), x: Math.round(x), z: Math.round(z), rotY: 0 });
      });
    } else if (cls === 'streets') {
      geomEach(f.geometry, (line) => {
        if (line.length < 2) return;
        const pts = rdp(ringToLocal(line), 2);
        for (let i = 0; i < pts.length - 1 && streets.length < MAX_STREETS; i++) {
          const a = pts[i], b = pts[i + 1];
          if (Math.hypot(b.x - a.x, b.z - a.z) < 5) continue;
          streets.push({ x1: Math.round(a.x), z1: Math.round(a.z), x2: Math.round(b.x), z2: Math.round(b.z), width: /main|cardo|decumanus|via/.test(JSON.stringify(p).toLowerCase()) ? 8 : 5 });
        }
      });
    } else if (cls === 'amphitheatre') {
      geomEach(f.geometry, (line) => {
        const pts = ringToLocal(line);
        const xs = pts.map((q) => q.x), zs = pts.map((q) => q.z);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        amphi = { x: Math.round(cx), z: Math.round(cz), rx: Math.round((Math.max(...xs) - Math.min(...xs)) / 2), rz: Math.round((Math.max(...zs) - Math.min(...zs)) / 2), h: 9 };
      });
    } else {
      geomEach(f.geometry, (line) => {
        const pts = ringToLocal(line);
        const xs = pts.map((q) => q.x), zs = pts.map((q) => q.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minZ = Math.min(...zs), maxZ = Math.max(...zs);
        const w = Math.max(4, maxX - minX), d = Math.max(4, maxZ - minZ);
        if (w > 200 || d > 200) return; // skip parish-size polygons
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
        buildings.push({
          id: String(p.id ?? p.name ?? `${name}-${buildings.length}`).toLowerCase().replace(/\s+/g, '-').slice(0, 40),
          kind: layerKindFromProps(p),
          x: Math.round(cx * 10) / 10, z: Math.round(cz * 10) / 10,
          w: Math.round(w * 10) / 10, d: Math.round(d * 10) / 10,
          h: /forum|basilica|bath|temple|church/.test(layerKindFromProps(p)) ? 9 : 5.5,
          rotY: 0,
        });
      });
    }
  }
}

// Dedupe/cap: keep perf budget (160 infill houses max in townPlan).
const seen = new Set();
const uniqBuildings = buildings.filter((b) => {
  const k = `${Math.round(b.x / 4)}:${Math.round(b.z / 4)}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
}).slice(0, 400);

const fmt = (o) => JSON.stringify(o);
const out = `// AUTO-GENERATED by scripts/import-town-plan.mjs — do not hand-edit.
// Source: assets/shp (${Object.entries(meta).map(([k, v]) => `${k}:${v}`).join(', ') || 'empty'})
// Forum origin OSGB E${FORUM_E} N${FORUM_N}. Rerun: npm run import:plan -- assets/shp/
export const GENERATED_WALLS: Array<{ x: number; z: number }> = ${fmt(walls.slice(0, MAX_WALL_PTS))};

export const GENERATED_GATES: Array<{ id: string; x: number; z: number; rotY: number }> = ${fmt(gates.slice(0, 8))};

export const GENERATED_STREETS: Array<{ x1: number; z1: number; x2: number; z2: number; width: number }> = ${fmt(streets.slice(0, MAX_STREETS))};

export interface GeneratedBuilding { id: string; kind: string; x: number; z: number; w: number; d: number; h: number; rotY: number }
export const GENERATED_BUILDINGS: GeneratedBuilding[] = ${fmt(uniqBuildings)};

export const GENERATED_AMPHITHEATRE: { x: number; z: number; rx: number; rz: number; h: number } | null = ${fmt(amphi)};

export const GENERATED_TERRAIN: { size: number; grid: number; heights: number[] } = { size: 1400, grid: 0, heights: [] };

export const GENERATED_WATER: Array<Array<{ x: number; z: number }>> = [];

export const GENERATED_EARTHWORKS: Array<{ x1: number; z1: number; x2: number; z2: number }> = [];

export const GENERATED_META = ${fmt({ source: inputs.map((f) => basename(f)).join(','), layers: meta })};
`;
writeFileSync(OUT, out);
console.log(`[import] wrote ${OUT}`);
console.log(`[import] walls:${Math.min(walls.length, MAX_WALL_PTS)} gates:${gates.length} streets:${Math.min(streets.length, MAX_STREETS)} buildings:${uniqBuildings.length} amphi:${amphi ? 'yes' : 'no'}`);
if (!walls.length) console.warn('[import] NOTE: no wall circuit detected — check layer name contains wall/defence/circuit.');
