// The town wall's stone phase (c. 260–280) as pure geometry: its section, the circuit between the
// gates, the rampart behind it, the ditch in front, and the heights you walk at. The curtain mesh
// (presentation/kit/townWall.ts), the gates' own stretches of wall (planBuilding, kind 'curtain'),
// the ground (WorldBuilder) and the smoke test all read this, so they cannot disagree.
// Evidence and the reasoning for every figure: docs/key-buildings/town-walls.md.
//
// Distances `d` across the wall are measured from the centreline of the upper wall (the GIS strip),
// positive towards the town. Heights are metres above the ground at the wall's foot.

import { planToWorld, worldToPlan, type BuildingPlan, type TownWallData, type UV } from './keyPlan.js';

/** The wall's section (✔ Fox & St John Hope 1890, Collis 1983, C&F 2016; heights from Boon's estimate read as 6 m overall). */
export const WALL = {
  /** Upper wall, above the inner set-off: 2.97 m less the 2 ft set-off. */
  upper: 2.37,
  /** Inner set-off ("set back 2 feet throughout its circuit") and its height ("about 2m (7 feet)"). */
  setoff: 0.6, setoffY: 2.0,
  /** External plinth (0.23 m) and its top. */
  plinth: 0.23, plinthY: 0.35,
  /** Wall-walk, parapet (0.6 m thick) breastwork top and merlon top. */
  walk: 4.2, parapetT: 0.6, breast: 5.2, top: 6.0,
  /** Merlons and the gaps between them. */
  merlon: 1.0, crenel: 1.0,
} as const;

/** Faces of the section as distances from the centreline (+ town side). */
export const FACE = {
  plinth: -(WALL.upper / 2 + WALL.plinth),
  outer: -WALL.upper / 2,
  parapetIn: -WALL.upper / 2 + WALL.parapetT,
  innerUpper: WALL.upper / 2,
  innerLower: WALL.upper / 2 + WALL.setoff,
} as const;

/** The earlier earth bank behind the wall: crest 3.0 m, 4 m wide against the wall, back slope over 7 m
 * (C&F fig. 8.2 proportions; Startin's section about 29 m²). It buries the set-off. */
export const RAMPART = { crest: 3.0, crestW: 4.0, back: 7.0 } as const;

/** The U-shaped outer ditch: about 12 m wide, from 10 m beyond the wall face, about 2 m deep (C&F). */
export const DITCH = { from: 10, width: 12, depth: 2.0 } as const;

/** Counterforts: the lower thickness carried up to the walk, 12 ft along the wall; steps from the
 * rampart's crest up onto each (Cotton's and Boon's reading; the steps are conjecture). */
export const COUNTERFORT = { stairTo: FACE.innerLower + 1.8, stairW: 1.6 } as const;

/** Rampart height (above the wall's foot) at distance d inside the wall. */
export function rampartAt(d: number): number {
  const d0 = FACE.innerUpper, d1 = d0 + WALL.setoff + RAMPART.crestW, d2 = d1 + RAMPART.back;
  if (d < d0 || d >= d2) return 0;
  if (d <= d1) return RAMPART.crest;
  const t = (d - d1) / RAMPART.back;
  return RAMPART.crest * (1 - t * t * (3 - 2 * t));
}

/** Ditch depth (negative) at distance d (negative: outside the wall). */
export function ditchAt(d: number): number {
  const d0 = FACE.outer - DITCH.from, d1 = d0 - DITCH.width;
  if (d > d0 || d < d1) return 0;
  const t = (d0 - d) / DITCH.width;
  return -DITCH.depth * (1 - Math.cos(2 * Math.PI * t)) / 2;
}
/** Furthest reach of the rampart (inside) and the ditch (outside) from the centreline. */
export const REACH = { inside: FACE.innerLower + RAMPART.crestW + RAMPART.back, outside: -FACE.outer + DITCH.from + DITCH.width } as const;

// ------------------------------------------------------------------------------------------------
// The circuit

export interface XZ { x: number; z: number }
/** One straight piece of the line: a run of the wall (between two gates) or a gate's chord (ditch only). */
export interface WallSeg {
  ax: number; az: number; bx: number; bz: number; len: number;
  /** Unit direction a -> b and the normal towards the town. */
  dx: number; dz: number; nx: number; nz: number;
  kind: 'run' | 'chord';
  run: number; seg: number;
  /** Distance along the run to a, the run's length. */
  s0: number; runLen: number;
  /** The gate at each end of the run (index into gates), or the gate this chord crosses. */
  gateA: number; gateB: number;
}

export interface TownGate {
  id: string; plan: BuildingPlan;
  /** Middle of the gate (between its curtain ends) and the unit direction out to the field (plan +v). */
  centre: XZ; out: XZ; along: XZ;
  ends: [XZ, XZ];
  crossing: 'bridge' | 'causeway';
  hasMound: boolean;
}

export interface TownWall {
  segs: WallSeg[];
  gates: TownGate[];
  counterforts: TownWallData['counterforts'];
  /** Signed distance from the line, the nearest piece and the raw position along it (metres from a). */
  nearest: (x: number, z: number) => { d: number; seg: WallSeg; t: number } | undefined;
}

const CELL = 32;

/** Build the circuit from the wall data and the gate plans (ids ending '-gate'). */
export function buildTownWall(data: TownWallData, plans: Record<string, BuildingPlan>): TownWall {
  const gates: TownGate[] = Object.values(plans).filter((p) => p.id.endsWith('-gate') && p.curtainEnds?.length === 2).map((plan) => {
    const [e0, e1] = plan.curtainEnds!.map(([u, v]) => planToWorld(plan, u, v));
    const c = { x: (e0.x + e1.x) / 2, z: (e0.z + e1.z) / 2 };
    const o0 = planToWorld(plan, 0, 0), ov = planToWorld(plan, 0, 1), ou = planToWorld(plan, 1, 0);
    return {
      id: plan.id, plan, centre: c, out: { x: ov.x - o0.x, z: ov.z - o0.z }, along: { x: ou.x - o0.x, z: ou.z - o0.z },
      ends: [e0, e1], crossing: plan.crossing ?? 'causeway', hasMound: !!plan.mound?.length,
    };
  });
  const gateAt = (p: XZ): number => {
    let best = -1, bd = 3;
    gates.forEach((g, i) => { for (const e of g.ends) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = i; } } });
    return best;
  };
  const segs: WallSeg[] = [];
  const push = (a: XZ, b: XZ, kind: WallSeg['kind'], run: number, seg: number, s0: number, runLen: number, gA: number, gB: number): void => {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 1e-3) return;
    let nx = -dz / len, nz = dx / len;
    // normal towards the town: the circuit encloses the origin's side (the forum)
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (nx * -mx + nz * -mz < 0) { nx = -nx; nz = -nz; }
    segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, len, dx: dx / len, dz: dz / len, nx, nz, kind, run, seg, s0, runLen, gateA: gA, gateB: gB });
  };
  data.runs.forEach((pts, r) => {
    const P = pts.map(([x, z]) => ({ x, z }));
    let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
    const gA = gateAt(P[0]), gB = gateAt(P[P.length - 1]);
    let s = 0;
    for (let i = 1; i < P.length; i++) { push(P[i - 1], P[i], 'run', r, i - 1, s, L, gA, gB); s += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); }
  });
  // gate chords: the ditch carries on across each gate between its curtain ends
  gates.forEach((g, i) => push(g.ends[0], g.ends[1], 'chord', -1, 0, 0, Math.hypot(g.ends[1].x - g.ends[0].x, g.ends[1].z - g.ends[0].z), i, i));

  // spatial hash over the reach of each piece
  const grid = new Map<number, number[]>();
  const key = (ix: number, iz: number): number => (ix + 2048) * 8192 + (iz + 2048);
  const pad = Math.max(REACH.inside, REACH.outside) + 2;
  segs.forEach((g, k) => {
    const x0 = Math.floor((Math.min(g.ax, g.bx) - pad) / CELL), x1 = Math.floor((Math.max(g.ax, g.bx) + pad) / CELL);
    const z0 = Math.floor((Math.min(g.az, g.bz) - pad) / CELL), z1 = Math.floor((Math.max(g.az, g.bz) + pad) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const kk = key(ix, iz); const l = grid.get(kk); if (l) l.push(k); else grid.set(kk, [k]); }
  });
  const nearest = (x: number, z: number): { d: number; seg: WallSeg; t: number } | undefined => {
    const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return undefined;
    let best: { d: number; seg: WallSeg; t: number } | undefined, bd = Infinity;
    for (const k of l) {
      const g = segs[k];
      const t = (x - g.ax) * g.dx + (z - g.az) * g.dz;
      const tc = Math.max(0, Math.min(g.len, t));
      const px = g.ax + g.dx * tc, pz = g.az + g.dz * tc;
      const dist = Math.hypot(x - px, z - pz);
      if (dist < bd) { bd = dist; best = { d: (x - g.ax) * g.nx + (z - g.az) * g.nz, seg: g, t }; }
    }
    return best;
  };
  return { segs, gates, counterforts: data.counterforts, nearest };
}

// ------------------------------------------------------------------------------------------------
// Ground: the rampart and the ditch as a height offset on the levelled terrain

function inPoly(u: number, v: number, poly: UV[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i], [uj, vj] = poly[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}
function distToPoly(u: number, v: number, poly: UV[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - az) * dz) / l2));
    best = Math.min(best, Math.hypot(u - ax - dx * t, v - az - dz * t));
  }
  return best;
}

/** Half-width of the road over a causeway, and the slope beyond it to the full ditch. */
const CAUSEWAY = { half: 3.5, slope: 4 } as const;

/** Height of the earthworks above (rampart, gate mounds) or below (ditch) the levelled ground at (x, z). */
export function earthworkOffset(tw: TownWall, x: number, z: number): number {
  // inside a gate: its rooms are clear, its mounds stand behind the flanks
  for (const g of tw.gates) {
    if (Math.abs(x - g.centre.x) > 40 || Math.abs(z - g.centre.z) > 40) continue;
    const [u, v] = worldToPlan(g.plan, x, z);
    const rooms = g.plan.rooms.some((r) => inPoly(u, v, r.poly));
    if (rooms) return 0;
    if (g.plan.mound?.length) {
      const vWall = g.plan.curtainEnds![0][1] - FACE.innerUpper;
      let h = 0;
      for (const m of g.plan.mound) {
        if (inPoly(u, v, m)) { h = RAMPART.crest; break; }
        if (v < vWall) { const dd = distToPoly(u, v, m); if (dd < RAMPART.back) h = Math.max(h, RAMPART.crest * (1 - dd / RAMPART.back)); }
      }
      if (h > 0) return h;
    }
  }
  const n = tw.nearest(x, z);
  if (!n) return 0;
  const { d, seg, t } = n;
  if (d >= 0) {
    if (seg.kind !== 'run') return 0;
    const sAlong = seg.s0 + t;
    // no rampart beyond the run's ends; at a gate without mounds it slopes down to the passage
    if (sAlong < 0 || sAlong > seg.runLen) return 0;
    let h = rampartAt(d);
    for (const [gi, from] of [[seg.gateA, sAlong], [seg.gateB, seg.runLen - sAlong]] as const) {
      if (gi >= 0 && !tw.gates[gi].hasMound) h = Math.min(h, from * 0.75);
    }
    return h;
  }
  let y = ditchAt(d);
  if (y === 0) return 0;
  // causeways: the road crosses on undug ground
  for (const g of tw.gates) {
    if (g.crossing !== 'causeway') continue;
    const rx = x - g.centre.x, rz = z - g.centre.z;
    const ahead = rx * g.out.x + rz * g.out.z;
    if (ahead < 0 || ahead > REACH.outside + 4) continue;
    const lat = Math.abs(rx * g.along.x + rz * g.along.z);
    if (lat < CAUSEWAY.half) return 0;
    if (lat < CAUSEWAY.half + CAUSEWAY.slope) y *= (lat - CAUSEWAY.half) / CAUSEWAY.slope;
  }
  return y;
}

/** Whether an axis-aligned rectangle may reach into the ditch (so the coarse ground there is redrawn). */
export function touchesDitch(tw: TownWall, x0: number, z0: number, x1: number, z1: number): boolean {
  const step = 2;
  for (let x = x0; x <= x1 + 1e-6; x += step) for (let z = z0; z <= z1 + 1e-6; z += step) {
    const n = tw.nearest(x, z);
    if (!n) continue;
    if (n.d < FACE.outer - DITCH.from + 3 && n.d > FACE.outer - DITCH.from - DITCH.width - 3) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------------
// Walking: the wall-walk, the counterforts' tops and their steps, as decks above the wall's foot

export interface Deck { y: number }

/** Height above the wall's foot of the walkable top at (x, z): the walk (between the parapet and the inner
 * face), a counterfort's top, or its steps from the rampart crest; undefined elsewhere. `foot` gives the
 * ground at the wall's foot (the centreline point). */
export function wallDeckAt(tw: TownWall, x: number, z: number): { y: number; footX: number; footZ: number } | undefined {
  const n = tw.nearest(x, z);
  if (!n || n.seg.kind !== 'run') return undefined;
  const { d, seg, t } = n;
  if (t < -0.2 || t > seg.len + 0.2) {
    const sAlong = seg.s0 + t;
    if (sAlong < -0.2 || sAlong > seg.runLen + 0.2) return undefined;
  }
  const tc = Math.max(0, Math.min(seg.len, t));
  const footX = seg.ax + seg.dx * tc, footZ = seg.az + seg.dz * tc;
  if (d >= FACE.parapetIn && d <= FACE.innerUpper) return { y: WALL.walk, footX, footZ };
  if (d > FACE.innerUpper && d <= COUNTERFORT.stairTo) {
    for (const c of tw.counterforts) {
      const rx = x - c.at[0], rz = z - c.at[1];
      if (Math.abs(rx) > 8 || Math.abs(rz) > 8) continue;
      const along = Math.abs(rx * c.n[1] - rz * c.n[0]);
      if (d <= FACE.innerLower && along <= c.len / 2) return { y: WALL.walk, footX, footZ };
      if (d > FACE.innerLower && along <= COUNTERFORT.stairW / 2) {
        const f = (COUNTERFORT.stairTo - d) / (COUNTERFORT.stairTo - FACE.innerLower);
        return { y: RAMPART.crest + (WALL.walk - RAMPART.crest) * f, footX, footZ };
      }
    }
  }
  return undefined;
}
