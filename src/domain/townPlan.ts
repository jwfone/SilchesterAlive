// Pure town layout data for Calleva Atrebatum (Silchester).
// No three.js / DOM imports — this is the extensible source of truth.
// Coordinates in metres: +x east, +z south, origin at forum.
// Derived from English Heritage phased plan + Silchester Mapping Project:
// walled ~40ha, 4 gates, grid streets, forum-basilica centre,
// baths SE, mansio near south gate, temples, amphitheatre outside E wall.

import { mulberry32 } from './rng.js';
import {
  GENERATED_AMPHITHEATRE,
  GENERATED_BUILDINGS,
  GENERATED_CONTOURS,
  GENERATED_DRAINS,
  GENERATED_EARTHWORKS,
  GENERATED_GATES,
  GENERATED_KEYS,
  GENERATED_ROAD_POLYS,
  GENERATED_STREETS,
  GENERATED_TERRAIN,
  GENERATED_WALLS,
  GENERATED_WATER,
} from './townPlan.generated.js';
import { KEY_PLANS } from './keyPlans.generated.js';

/** User-pinned anchor (assets/key-buildings.geojson via GENERATED_KEYS), if present. */
export function keyAnchor(id: string): { x: number; z: number; w: number; d: number; rotY: number } | undefined {
  return (GENERATED_KEYS as Array<{ id: string; x: number; z: number; w: number; d: number; rotY: number }>).find((k) => k.id === id);
}

/** Rotated-rectangle containment (local metres), pad expands all sides. */
function insideKeyFootprint(
  px: number, pz: number,
  cx: number, cz: number, w: number, d: number, rotY: number, pad = 6,
): boolean {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const dx = px - cx, dz = pz - cz;
  // world -> kit-local: kit local X maps to (cos, -sin), local Z to (sin, cos)
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= w / 2 + pad && Math.abs(lz) <= d / 2 + pad;
}

export interface Vec2 { x: number; z: number }
export type BuildingKind =
  | 'forum' | 'basilica' | 'baths' | 'mansio' | 'temple'
  | 'church' | 'house' | 'shop' | 'ruin' | 'wall-tower' | 'amphitheatre';

export interface BuildingSpec {
  id: string;
  kind: BuildingKind;
  x: number; z: number;
  w: number; d: number; h: number;
  rotY: number;
  /** Exact GIS footprint ring (local metres) when imported; OBB (w/d/rotY) is a fallback. */
  outline?: Vec2[];
  /** Inner rings of the GIS footprint (courtyards / donuts). */
  holes?: Vec2[][];
  /** True when polygon area < 6 m² — low 3D slab, but shade stays the GIS file. */
  stub?: boolean;
  /** Great Plan shade 1-5 (GIS files 10-14) when imported; undefined for infill/key buildings. */
  shade?: number;
  /**
   * GIS ring on a user-pinned key plot (forum, baths, mansio, temples, church).
   * Keep the surveyed outline on the 2D map and the 3D footprint overlay;
   * do not extrude it as generic masonry and do not collide with it.
   */
  underKey?: boolean;
}

export interface StreetSpec { x1: number; z1: number; x2: number; z2: number; width: number; /** Crest height (m) for earthwork banks. */ h?: number }
export interface RoadPoly { outer: Vec2[]; holes: Vec2[][] }
export interface GateSpec { id: string; x: number; z: number; rotY: number }
export interface ContourLine { elev: number; pts: Vec2[] }

export interface TownPlan {
  seed: number;
  walls: Vec2[];          // closed polygon (last connects to first)
  wallHeight: number; wallThickness: number;
  gates: GateSpec[];
  streets: StreetSpec[]; // GIS 26 centre-lines (logic only: gates, infill)
  roadPolys: RoadPoly[]; // GIS 26 surfaces (visuals + maps; exact joins/widths)
  drains: StreetSpec[]; // GIS 27 roadside drains only — own layer, never merged into streets
  buildings: BuildingSpec[];
  amphitheatre: { x: number; z: number; rx: number; rz: number; h: number };
  terrain: { size: number; grid: number; heights: number[] }; // median-centred relief, y≈0
  contours: ContourLine[]; // exact GIS 01 1m contour vectors (elev in m OD, local metres)
  water: Vec2[][];        // pond/stream outlines (flat decals)
  earthworks: StreetSpec[]; // GIS 03 banks: hatchures chained into centre-lines at true scarp width
}

/** Bank width from a GIS hatchure scarp length (minor-axis ticks are ~0.6m cartographic ink). */
export function earthworkWidth(s: { width?: number }): number {
  return Math.max(2.2, Math.min(18, s.width || 4));
}

/** Crest height above local contour terrain. Prefers importer contour-drop `h`. */
export function earthworkHeight(s: { width?: number; h?: number }): number {
  if (typeof s.h === 'number' && s.h >= 0.8) return Math.max(1.05, Math.min(3.8, s.h));
  return Math.max(1.15, Math.min(3.6, earthworkWidth(s) * 0.48));
}

/** Cosine mound: `u` is distance / (width/2), 1 at the crest, 0 at the toe. */
export function earthworkProfile(u: number): number {
  const t = Math.max(0, Math.min(1, u));
  return 0.5 + 0.5 * Math.cos(Math.PI * t);
}

/** Bilinear sample of terrain relief at local (x,z). Returns 0 outside coverage. */
export function sampleTerrain(t: TownPlan['terrain'], x: number, z: number): number {
  const { size, grid, heights } = t;
  if (!heights.length) return 0;
  const half = size / 2;
  const fx = ((x + half) / size) * grid - 0.5;
  const fz = ((z + half) / size) * grid - 0.5;
  const x0 = Math.max(0, Math.min(grid - 2, Math.floor(fx)));
  const z0 = Math.max(0, Math.min(grid - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const tz = Math.max(0, Math.min(1, fz - z0));
  const h00 = heights[z0 * grid + x0], h10 = heights[z0 * grid + x0 + 1];
  const h01 = heights[(z0 + 1) * grid + x0], h11 = heights[(z0 + 1) * grid + x0 + 1];
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

/**
 * Split one wall-circuit edge into the [t0, t1] param intervals left after
 * cutting gatehouse openings. Samples the edge every ~1m and drops samples
 * within `half` metres of any gate, then re-chains the survivors — so gaps
 * follow gate positions exactly (including gates near corners, which project
 * onto two adjacent edges). Matches the collider openings (same half-width),
 * so visuals, collision and maps agree on where gateways are.
 */
export function wallGapIntervals(
  ax: number, az: number, bx: number, bz: number,
  gates: GateSpec[], half = 7,
): Array<[number, number]> {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return [];
  const n = Math.max(1, Math.ceil(len)); // ~1m sampling
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let k = 0; k <= n; k++) {
    const px = ax + (dx * k) / n, pz = az + (dz * k) / n;
    const kept = gates.every((g) => Math.hypot(g.x - px, g.z - pz) >= half);
    if (kept && start < 0) start = k;
    if ((!kept || k === n) && start >= 0) {
      const end = !kept ? k - 1 : k;
      if (end > start) out.push([start / n, end / n]);
      start = -1;
    }
  }
  return out;
}

// Simplified wall circuit (~2.3km, encloses ~40ha). Deliberately coarse:
// WorldBuilder thickens edges; colliders use the same polygon.
// Overridden by GENERATED_WALLS after `npm run import:plan`.
const WALLS_FALLBACK: Vec2[] = [
  { x: -310, z: -240 }, { x: -170, z: -305 }, { x: 170, z: -295 },
  { x: 295, z: -170 }, { x: 290, z: 210 }, { x: 140, z: 300 },
  { x: -190, z: 290 }, { x: -310, z: 140 },
];
const WALLS: Vec2[] = GENERATED_WALLS.length >= 4 ? GENERATED_WALLS : WALLS_FALLBACK;

const GATES_FALLBACK: GateSpec[] = [
  { id: 'north-gate', x: 0, z: -300, rotY: 0 },
  { id: 'south-gate', x: 15, z: 295, rotY: 0 },
  { id: 'east-gate', x: 292, z: 15, rotY: Math.PI / 2 },
  { id: 'west-gate', x: -310, z: -30, rotY: Math.PI / 2 },
];
const GATES: GateSpec[] = GENERATED_GATES.length ? GENERATED_GATES as GateSpec[] : GATES_FALLBACK;

function mainStreets(): StreetSpec[] {
  if (GENERATED_STREETS.length) return GENERATED_STREETS as StreetSpec[];
  const s: StreetSpec[] = [
    // cardo / decumanus through forum
    { x1: -310, z1: -30, x2: 292, z2: 15, width: 8 },   // E-W (slight skew like real Calleva)
    { x1: 0, z1: -300, x2: 15, z2: 295, width: 8 },     // N-S
  ];
  // secondary grid every ~90m
  for (let gx = -270; gx <= 270; gx += 90) {
    if (Math.abs(gx - 8) < 30) continue;
    s.push({ x1: gx, z1: -290, x2: gx + 10, z2: 285, width: 5 });
  }
  for (let gz = -240; gz <= 250; gz += 85) {
    if (Math.abs(gz) < 30) continue;
    s.push({ x1: -300, z1: gz, x2: 285, z2: gz + 8, width: 5 });
  }
  return s;
}

// Public reserves (half-extents) that houses must avoid.
// Centres follow user-pinned anchors (GENERATED_KEYS) when present, so the
// forum/baths interiors stay clear of generic infill wherever the keys move.
// Half-extents cover the largest of kit size and anchor size, plus margin.
function anchorReserve(id: string, kitW: number, kitD: number, fbX: number, fbZ: number): { x: number; z: number; hw: number; hd: number } {
  const a = keyAnchor(id);
  const cx = a?.x ?? fbX, cz = a?.z ?? fbZ;
  const half = Math.max(kitW, kitD, a?.w ?? 0, a?.d ?? 0) / 2 + 8;
  return { x: cx, z: cz, hw: half, hd: half };
}
const FORUM_COMPLEX_DESIGN = { x: 8, z: -8 }; // centre of forum+basilica kit pair
function forumComplexCentre(): { x: number; z: number } {
  const a = keyAnchor('forum-basilica');
  return a ? { x: a.x, z: a.z } : { ...FORUM_COMPLEX_DESIGN };
}
const RESERVES = [
  { ...anchorReserve('forum-basilica', 68, 72, 8, -8), }, // forum E + basilica W
  { ...anchorReserve('baths', 44, 30, 150, 150), },       // baths
  { ...anchorReserve('mansio-courtyard', 52, 26, 40, 245), }, // mansio
  { ...templeReserve(), }, // temples precinct (anchor midpoint when pinned)
  { ...anchorReserve('church-st-mary', 20, 10, 238, 10), }, // St Mary plot
];

/** Reserve covering both temples: anchor midpoint + span when pinned. */
function templeReserve(): { x: number; z: number; hw: number; hd: number } {
  const t1 = keyAnchor('temple-1'), t2 = keyAnchor('temple-2');
  if (t1 && t2) {
    const cx = (t1.x + t2.x) / 2, cz = (t1.z + t2.z) / 2;
    const half = Math.max(
      Math.abs(t1.x - t2.x) + 18, Math.abs(t1.z - t2.z) + 18, 36,
    ) / 2 + 8;
    return { x: cx, z: cz, hw: half, hd: half };
  }
  return { x: -115, z: -70, hw: 35, hd: 30 };
}

export function insideReserve(x: number, z: number, pad = 12): boolean {
  return RESERVES.some(r => Math.abs(x - r.x) < r.hw + pad && Math.abs(z - r.z) < r.hd + pad);
}

function nearStreet(x: number, z: number, streets: StreetSpec[], pad = 9): boolean {
  // streets are near-axis-aligned; use segment distance approx via bbox + width
  for (const s of streets) {
    const minX = Math.min(s.x1, s.x2) - pad - s.width / 2;
    const maxX = Math.max(s.x1, s.x2) + pad + s.width / 2;
    const minZ = Math.min(s.z1, s.z2) - pad - s.width / 2;
    const maxZ = Math.max(s.z1, s.z2) + pad + s.width / 2;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true;
  }
  return false;
}

function insideWalls(x: number, z: number): boolean {
  // ray-cast point in polygon
  let inside = false;
  const p = WALLS;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i].x, zi = p[i].z, xj = p[j].x, zj = p[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function buildTownPlan(seed = 1234): TownPlan {
  const rand = mulberry32(seed);
  const streets = mainStreets();
  const drains = (GENERATED_DRAINS ?? []) as StreetSpec[];
  const traffic = [...streets, ...drains]; // infill keeps clear of roads and drains alike
  const buildings: BuildingSpec[] = [
    { id: 'forum', kind: 'forum', x: 28, z: -8, w: 38, d: 56, h: 8, rotY: 0 },
    { id: 'basilica', kind: 'basilica', x: -12, z: -8, w: 18, d: 72, h: 14, rotY: 0 },
    { id: 'baths', kind: 'baths', x: 150, z: 150, w: 44, d: 30, h: 9, rotY: 0.08 },
    { id: 'mansio', kind: 'mansio', x: 40, z: 245, w: 52, d: 26, h: 7, rotY: 0 },
    { id: 'temple-1', kind: 'temple', x: -125, z: -80, w: 18, d: 18, h: 10, rotY: 0.2 },
    { id: 'temple-2', kind: 'temple', x: -100, z: -58, w: 14, d: 14, h: 8, rotY: 0.2 },
    { id: 'church-st-mary', kind: 'church', x: 238, z: 10, w: 20, d: 10, h: 8, rotY: 0.1 },
  ];

  // Snap key buildings to user-pinned anchors (assets/key-buildings.geojson).
  // Forum + basilica move together so the kit pair keeps its internal offset.
  // Mansio anchor is the courtyard: the whole inn recentres on it (within a
  // few metres of the full-complex centre). The baths anchor is the full
  // surveyed outline (assets/key-plans/baths.review.json), so the baths take its
  // size and rotation too; the building itself is generated from its plan
  // (assets/key-plans/baths.plan.json).
  {
    const fb = keyAnchor('forum-basilica');
    if (fb) {
      const dx = fb.x - FORUM_COMPLEX_DESIGN.x, dz = fb.z - FORUM_COMPLEX_DESIGN.z;
      for (const b of buildings) {
        if (b.id === 'forum' || b.id === 'basilica') { b.x += dx; b.z += dz; }
      }
    }
    const mc = keyAnchor('mansio-courtyard');
    if (mc) {
      const m = buildings.find((b) => b.id === 'mansio');
      if (m) { m.x = mc.x; m.z = mc.z; }
    }
    // Temples and church are centre-pinned only: position follows the anchor,
    // size and rotation stay kit placeholders until full outlines are pinned.
    for (const id of ['temple-1', 'temple-2', 'church-st-mary'] as const) {
      const a = keyAnchor(id);
      if (a) {
        const t = buildings.find((b) => b.id === id);
        if (t) { t.x = a.x; t.z = a.z; }
      }
    }
    const ba = keyAnchor('baths');
    if (ba) {
      const b = buildings.find((b) => b.id === 'baths');
      if (b) { b.x = ba.x; b.z = ba.z; b.w = ba.w; b.d = ba.d; b.rotY = ba.rotY; }
    }
  }

  // Kit footprints (post-snap): GIS rings whose centroid sits on a key plot
  // stay in the plan as footprint-only (2D map + 3D overlay). They must not
  // be dropped — that blanked the surveyed forum/baths/mansio/temple traces.
  const forumC = forumComplexCentre();
  const bathsB = buildings.find((b) => b.id === 'baths')!;
  const mansioB = buildings.find((b) => b.id === 'mansio')!;
  const keyFootprints = [
    { cx: forumC.x, cz: forumC.z, w: 80, d: 84, rotY: 0 }, // forum+basilica envelope (basilica W, forum E)
    { cx: bathsB.x, cz: bathsB.z, w: bathsB.w, d: bathsB.d, rotY: bathsB.rotY },
    { cx: mansioB.x, cz: mansioB.z, w: mansioB.w, d: mansioB.d, rotY: mansioB.rotY },
  ];
  for (const id of ['temple-1', 'temple-2', 'church-st-mary'] as const) {
    const t = buildings.find((b) => b.id === id)!;
    keyFootprints.push({ cx: t.x, cz: t.z, w: t.w, d: t.d, rotY: t.rotY });
  }
  const insideKey = (x: number, z: number): boolean =>
    keyFootprints.some((f) => insideKeyFootprint(x, z, f.cx, f.cz, f.w, f.d, f.rotY));
  // Plan-built key buildings (generated from assets/key-plans) stand on their exact
  // surveyed outline, so any GIS ring reaching into it (not just one centred on it)
  // becomes overlay-only; otherwise e.g. a long street-side ring would be extruded
  // straight through the baths' frontage.
  const planBuiltFootprints = Object.keys(KEY_PLANS)
    .map((id) => buildings.find((b) => b.id === id))
    .filter((b): b is BuildingSpec => !!b)
    .map((b) => ({ cx: b.x, cz: b.z, w: b.w, d: b.d, rotY: b.rotY }));
  const reachesPlanBuilt = (outline: Array<{ x: number; z: number }> | undefined): boolean =>
    !!outline && outline.some((p) => planBuiltFootprints.some((f) => insideKeyFootprint(p.x, p.z, f.cx, f.cz, f.w, f.d, f.rotY, 0.5)));

  // Imported footprints replace/augment the procedural infill when present.
  // Named key buildings (forum/baths/...) always stay; imported houses fill gaps.
  // Shade 4-5 or area stubs arrive as low 'ruin' slabs (merged footprint mesh).
  // The original Great Plan shade (1-5, GIS files 10-14) is preserved on
  // `shade` so the GIS viewer can toggle each file separately.
  const ALLOWED = new Set(['forum', 'basilica', 'baths', 'mansio', 'temple', 'church', 'house', 'shop', 'ruin', 'wall-tower', 'amphitheatre']);
  const imported: typeof GENERATED_BUILDINGS = [];
  for (const g of GENERATED_BUILDINGS) {
    const shade = (g as { shade?: number }).shade ?? 1;
    const stub = !!(g as { stub?: boolean }).stub;
    const kind = stub || shade >= 4 ? 'ruin' : (g.kind as BuildingSpec['kind']);
    if (!ALLOWED.has(kind)) continue;
    imported.push(g);
    buildings.push({ ...g, kind, shade, stub, underKey: insideKey(g.x, g.z) || reachesPlanBuilt(g.outline) || undefined });
  }

  const hasGIS = imported.length > 40;

  // Infill insulae: only when GIS footprints are absent. With Great Plan
  // coverage the imported polygons are the town; fake houses hide GIS detail
  // and spend extra draw calls on kits.
  if (!hasGIS) {
    let n = 0;
    for (let gx = -280; gx <= 260; gx += 34) {
      for (let gz = -260; gz <= 260; gz += 32) {
        const jx = gx + (rand() - 0.5) * 10;
        const jz = gz + (rand() - 0.5) * 10;
        if (!insideWalls(jx, jz)) continue;
        if (insideReserve(jx, jz)) continue;
        if (nearStreet(jx, jz, traffic)) continue;
        if (rand() < 0.22) continue; // gardens / empty plots / workshops
        const shop = rand() < 0.18;
        buildings.push({
          id: `house-${n++}`,
          kind: shop ? 'shop' : 'house',
          x: jx, z: jz,
          w: 10 + rand() * 8, d: 8 + rand() * 6,
          h: 4.5 + rand() * 2.5,
          rotY: (rand() - 0.5) * 0.12,
        });
        if (n >= 160) break;
      }
    }
  }

  return {
    seed,
    walls: WALLS,
    wallHeight: 6, wallThickness: 4,
    gates: GATES,
    streets,
    roadPolys: ((GENERATED_ROAD_POLYS ?? []) as RoadPoly[]).filter(
      (p) => Array.isArray(p?.outer) && p.outer.length >= 3,
    ),
    drains,
    buildings,
    amphitheatre: GENERATED_AMPHITHEATRE ?? { x: 480, z: 45, rx: 34, rz: 27, h: 9 },
    terrain: GENERATED_TERRAIN?.heights?.length
      ? GENERATED_TERRAIN
      : { size: 1400, grid: 0, heights: [] },
    contours: ((GENERATED_CONTOURS ?? []) as ContourLine[]).filter(
      (c) => Array.isArray(c?.pts) && c.pts.length >= 2,
    ),
    water: (GENERATED_WATER ?? []) as Vec2[][],
    earthworks: (GENERATED_EARTHWORKS ?? []) as StreetSpec[],
  };
}

export const PERF_BUDGET = {
  maxHouses: 2500,   // Great Plan masonry + infill (merged footprints / kits)
  maxRuins: 2500,   // shade 4-5 + area stubs (merged low slabs)
  maxDrawCalls: 42, // roads use 2 (GIS polygon surfaces + drain instances)
  maxTrisInView: 350_000,
  maxAssetMB: 2,
};
