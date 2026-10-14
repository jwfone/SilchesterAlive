// Amphitheatre bowl geometry (pure, no three.js): the one definition of the arena wall ring, the
// seating and bank profile, the passages and recesses, used by the mesh generator (planBuilding),
// walking (planWorld floorAt), the ground hole (WorldBuilder) and the smoke test.
// Plan coordinates as keyPlan.ts (u east-ish, v north-ish); heights above the arena floor.
import { planToWorld, type BuildingPlan, type PlanArena, type PlanSeg, type UV } from './keyPlan.js';

const DEG = Math.PI / 180;
const norm = (a: number): number => ((a % 360) + 360) % 360;

/** Wall centreline radius at a polar angle (degrees), interpolated between the ring samples. */
export function ringRadius(ar: PlanArena, deg: number): number {
  const n = ar.ring.length, step = 360 / n, k = norm(deg) / step, i = Math.floor(k), f = k - i;
  return ar.ring[i % n][1] * (1 - f) + ar.ring[(i + 1) % n][1] * f;
}

/** Point `d` metres outward from the wall centreline at a polar angle. */
export function ringPoint(ar: PlanArena, deg: number, d = 0): UV {
  const r = ringRadius(ar, deg) + d;
  return [ar.c[0] + r * Math.cos(deg * DEG), ar.c[1] + r * Math.sin(deg * DEG)];
}

/** Polar angle (degrees, 0..360) of a plan point about the arena centre. */
export function polarDeg(ar: PlanArena, u: number, v: number): number {
  return norm(Math.atan2(v - ar.c[1], u - ar.c[0]) / DEG);
}

/** Whether a polar angle falls inside an angle range [from, to] that may wrap through 0. */
export function inRange(deg: number, from: number, to: number): boolean {
  const d = norm(deg), a = norm(from), b = norm(to);
  return a <= b ? d >= a && d <= b : d >= a || d <= b;
}

/** The arena-wall opening at a polar angle, if any. */
export function openingAt(ar: PlanArena, deg: number, kind?: 'passage' | 'recess'): PlanArena['openings'][number] | undefined {
  return ar.openings.find((o) => (!kind || o.kind === kind) && inRange(deg, o.from, o.to));
}

/** Seating and bank profile: key distances (from the wall centreline) and heights. */
export function arenaProfile(ar: PlanArena): { rowsEnd: number; crestY: number; crestEnd: number; slope: number } {
  const rowsEnd = ar.t / 2 + ar.seating.rows * ar.seating.tread;
  const crestY = ar.h + ar.seating.rows * ar.seating.rise;
  const crestEnd = rowsEnd + ar.bank.crest;
  return { rowsEnd, crestY, crestEnd, slope: (crestY - ar.ground) / Math.max(0.5, ar.bank.toe - crestEnd) };
}

/** Height of the seating / bank surface `d` metres outward from the wall centreline (no passage cut). */
export function profileY(ar: PlanArena, d: number): number {
  const { rowsEnd, crestY, crestEnd } = arenaProfile(ar);
  if (d < ar.t / 2) return ar.h;
  if (d < rowsEnd) return ar.h + Math.min(ar.seating.rows - 1, Math.floor((d - ar.t / 2) / ar.seating.tread)) * ar.seating.rise;
  if (d <= crestEnd) return crestY;
  if (d >= ar.bank.toe) return ar.ground;
  return crestY + ((ar.ground - crestY) * (d - crestEnd)) / (ar.bank.toe - crestEnd);
}

/** A passage wall as a line: unit direction (outward), length, and point projection. */
export function segFrame(s: PlanSeg): { du: number; dv: number; L: number; ax: (p: UV) => number; lat: (p: UV) => number } {
  const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1, du = (s.b[0] - s.a[0]) / L, dv = (s.b[1] - s.a[1]) / L;
  return {
    du, dv, L,
    ax: (p) => (p[0] - s.a[0]) * du + (p[1] - s.a[1]) * dv,
    lat: (p) => (p[0] - s.a[0]) * -dv + (p[1] - s.a[1]) * du,
  };
}

/** How steeply the bank's end falls beside a passage wall's outer end (multiple of the outer slope). */
const END_STEEP = 6;

/** Cap on the bank's height near the passages: the earth falls away beyond the outer ends of the passage
 * walls, so the entrances stay open; beside a wall (retained by it) there is no cap. */
export function bankCap(ar: PlanArena, p: UV): number {
  const { slope } = arenaProfile(ar);
  let cap = Infinity;
  for (const ps of ar.passages) {
    for (const w of ps.walls) {
      const f = segFrame(w);
      cap = Math.min(cap, ar.ground + slope * (Math.abs(f.lat(p)) + END_STEEP * Math.max(0, f.L - f.ax(p))));
    }
  }
  return cap;
}

/** Inside a passage corridor (between its two wall centrelines, beyond the arena): distance along it, else undefined. */
export function corridorAt(ar: PlanArena, p: UV): { ax: number; L: number } | undefined {
  for (const ps of ar.passages) {
    const [f0, f1] = ps.walls.map(segFrame);
    const l0 = f0.lat(p), l1 = f1.lat(p);
    // between the lines: signed lateral distances of opposite sign relative to each other's side
    const s0 = f0.lat(ps.walls[1].a), s1 = f1.lat(ps.walls[0].a);
    if (!(l0 * s0 > 0 && l1 * s1 > 0)) continue;
    const ax = (f0.ax(p) + f1.ax(p)) / 2;
    if (ax < 0) continue;
    return { ax, L: (f0.L + f1.L) / 2 };
  }
  return undefined;
}

/** Inside a recess (its half disc beyond the centre, or the neck back to the arena wall). */
export function inRecess(ar: PlanArena, p: UV): boolean {
  for (const rc of ar.recesses) {
    const ri = rc.r - rc.t / 2;
    const ou = rc.c[0] - ar.c[0], ov = rc.c[1] - ar.c[1], od = Math.hypot(ou, ov), nu = ou / od, nv = ov / od;
    const s = (p[0] - rc.c[0]) * nu + (p[1] - rc.c[1]) * nv, l = -(p[0] - rc.c[0]) * nv + (p[1] - rc.c[1]) * nu;
    if (s >= 0 && Math.hypot(s, l) <= ri) return true;
    const sWall = ringRadius(ar, polarDeg(ar, rc.c[0], rc.c[1])) - od; // ring centreline relative to the recess centre (negative)
    if (s < 0 && s >= sWall && Math.abs(l) <= ri) return true;
  }
  return false;
}

/** Walkable height (above the arena floor) of the bowl at a plan point; undefined outside the outer toe. */
export function arenaHeightAt(ar: PlanArena, u: number, v: number): number | undefined {
  const p: UV = [u, v];
  const deg = polarDeg(ar, u, v);
  const d = Math.hypot(u - ar.c[0], v - ar.c[1]) - ringRadius(ar, deg);
  if (d > ar.bank.toe) return undefined;
  if (d < -ar.t / 2) return 0;
  const cor = corridorAt(ar, p);
  if (cor) return ar.ground * Math.min(1, cor.ax / cor.L);
  if (inRecess(ar, p)) return 0;
  if (d < ar.t / 2 && openingAt(ar, deg)) return 0; // through the wall at an entrance or a recess mouth
  const y = profileY(ar, d);
  const { rowsEnd } = arenaProfile(ar);
  return d >= rowsEnd ? Math.max(ar.ground, Math.min(y, bankCap(ar, p))) : y;
}

/** Plan-space bounds of everything a plan builds: walls, apses and an arena's banks out to the toe. */
export function planExtentUV(plan: BuildingPlan): { u0: number; u1: number; v0: number; v1: number } {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  const add = (u: number, v: number): void => { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); };
  for (const w of plan.walls) { add(w.a[0], w.a[1]); add(w.b[0], w.b[1]); }
  const ar = plan.arena;
  if (ar) {
    for (let k = 0; k < 360; k += 2) { const p = ringPoint(ar, k, ar.bank.toe); add(p[0], p[1]); }
    for (const ps of ar.passages) for (const w of ps.walls) { add(w.a[0], w.a[1]); add(w.b[0], w.b[1]); }
  }
  return { u0, u1, v0, v1 };
}

/** World-axis-aligned rectangle the ground mesh leaves open under a sunken arena (the bowl, banks and
 * passages fill it with their own surfaces, out to an apron at ground level). */
export function arenaHoleWorld(plan: BuildingPlan): { minX: number; maxX: number; minZ: number; maxZ: number } | undefined {
  const ar = plan.arena;
  if (!ar) return undefined;
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let k = 0; k < 360; k += 1) {
    const [u, v] = ringPoint(ar, k, ar.bank.toe), p = planToWorld(plan, u, v);
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
  }
  const pad = 0.5;
  return { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad };
}
