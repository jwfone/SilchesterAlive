import * as THREE from 'three';
import type { AtlasCell } from './atlas.js';
import { CELL_TILE_M, cellVec } from './atlasTiled.js';

// Key buildings generated from a curated plan (assets/key-plans/<id>.plan.json):
// rooms, walls with doors/windows, apses, columns and roofs in the building's
// local frame (u east-ish, v north-ish, metres; see the plan's `frame`).
// Model space: x = u, y = up, z = -v. Everything merges into one indexed-free
// geometry for getTiledAtlasMaterial() (1 draw). Three levels of detail:
//   lod 0  walkable interior: both wall faces, floors, vaults, pools, columns
//   lod 1  exterior shell: outward faces, openings, glass, simple columns
//   lod 2  massing: exterior walls without openings, roofs
// `evidenceColors` adds a vertex `color` per element from its evidence level
// (S Silchester / C comparison / X conjecture) for the elevation drawings.

import type { Ev, UV, PlanOpening, PlanWindow, PlanWall, PlanRoom, PlanApse, PlanColumns, PlanRoof, BuildingPlan } from '../../domain/keyPlan.js';
export type { Ev, UV, PlanOpening, PlanWindow, PlanWall, PlanRoom, PlanApse, PlanColumns, PlanRoof, BuildingPlan };

export type Lod = 0 | 1 | 2;
export interface PlanBuildOptions {
  lod: Lod; evidenceColors?: boolean;
  /** Closed solids only (walls, piers, columns): for stencil section caps in the drawings. */
  solidOnly?: boolean;
  /** Extend walls this far below the floor (footings), so they meet lower ground on sloping sites. */
  footingDrop?: number;
}
/** Collision footprint in plan coordinates: box along a->b of thickness t, or a circle. */
export type PlanFootprint =
  | { kind: 'box'; a: UV; b: UV; t: number; h: number }
  | { kind: 'circle'; c: UV; r: number; h: number };
export interface PlanBuild { geometry: THREE.BufferGeometry; tris: number; footprints: PlanFootprint[] }

const EV_RGB: Record<Ev | 'N' | 'gS' | 'gC' | 'gX', [number, number, number]> = {
  S: [0.33, 0.66, 0.36], C: [0.92, 0.64, 0.2], X: [0.85, 0.33, 0.3], N: [0.8, 0.78, 0.74],
  // glass: darker shade of its evidence colour so windows read in the drawings
  gS: [0.16, 0.4, 0.2], gC: [0.55, 0.36, 0.08], gX: [0.5, 0.16, 0.14],
};
type Tint = keyof typeof EV_RGB;

type V3 = THREE.Vector3;
const v3 = (u: number, y: number, v: number): V3 => new THREE.Vector3(u, y, -v);

/** Triangle soup with tiling UVs, per-vertex atlas cell and optional evidence colour. */
class Acc {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; cell: number[] = []; col: number[] = [];
  /** Set while emitting open surfaces (roofs, floors, glass...); dropped when solidOnly. */
  surface = false;
  constructor(readonly evidence: boolean, readonly solidOnly = false) {}
  /** Emit open surfaces (not closed solids) inside fn. */
  surf(fn: () => void): void { const was = this.surface; this.surface = true; fn(); this.surface = was; }

  /** Planar polygon (convex, ordered); flipped if its normal opposes `want`. UVs: metres along
   * the face's own axes (first edge = u) scaled by the cell's tile size, or `fit` 0..1. */
  poly(pts: V3[], cell: AtlasCell, ev: Tint, want?: V3, fit = false): void {
    if (pts.length < 3 || (this.solidOnly && this.surface)) return;
    let p = pts;
    let n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    if (want && n.dot(want) < 0) { p = [...p].reverse(); n = n.negate(); }
    const e1 = new THREE.Vector3().subVectors(p[1], p[0]);
    if (Math.abs(n.y) > 0.99) e1.set(1, 0, 0); else e1.y = 0; // horizontal u axis on walls / roofs
    e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    // Keep "v" pointing up on walls so courses/bands line up across corners.
    if (Math.abs(n.y) <= 0.99 && e2.y < 0) { e1.negate(); e2.negate(); }
    const [tw, th] = CELL_TILE_M[cell];
    const c4 = cellVec(cell);
    const rgb = EV_RGB[ev];
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    if (fit) for (const q of p) { const a = q.dot(e1), b = q.dot(e2); uMin = Math.min(uMin, a); uMax = Math.max(uMax, a); vMin = Math.min(vMin, b); vMax = Math.max(vMax, b); }
    const push = (q: V3): void => {
      this.pos.push(q.x, q.y, q.z);
      this.nor.push(n.x, n.y, n.z);
      if (fit) this.uv.push(0.002 + 0.996 * (q.dot(e1) - uMin) / (uMax - uMin || 1), 0.002 + 0.996 * (q.dot(e2) - vMin) / (vMax - vMin || 1));
      else this.uv.push(q.dot(e1) / tw, q.dot(e2) / th);
      this.cell.push(...c4);
      if (this.evidence) this.col.push(...rgb);
    };
    for (let i = 1; i < p.length - 1; i++) { push(p[0]); push(p[i]); push(p[i + 1]); }
  }

  /** Axis-aligned-in-plan box from plan rect corners (u0,v0)-(u1,v1), y0..y1, all faces. */
  box(u0: number, v0: number, u1: number, v1: number, y0: number, y1: number, cell: AtlasCell, ev: Ev | 'N', bottom = false): void {
    const c = v3((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2);
    const P = (u: number, y: number, v: number): V3 => v3(u, y, v);
    const faces: V3[][] = [
      [P(u0, y0, v0), P(u1, y0, v0), P(u1, y1, v0), P(u0, y1, v0)],
      [P(u0, y0, v1), P(u1, y0, v1), P(u1, y1, v1), P(u0, y1, v1)],
      [P(u0, y0, v0), P(u0, y0, v1), P(u0, y1, v1), P(u0, y1, v0)],
      [P(u1, y0, v0), P(u1, y0, v1), P(u1, y1, v1), P(u1, y1, v0)],
      [P(u0, y1, v0), P(u1, y1, v0), P(u1, y1, v1), P(u0, y1, v1)],
    ];
    if (bottom) faces.push([P(u0, y0, v0), P(u1, y0, v0), P(u1, y0, v1), P(u0, y0, v1)]);
    for (const f of faces) {
      const m = f.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(1 / 4);
      this.poly(f, cell, ev, m.sub(c));
    }
  }

  /** Vertical cylinder (n sides) at plan point, optional top cap. */
  cylinder(cu: number, cv: number, r0: number, r1: number, y0: number, y1: number, n: number, cell: AtlasCell, ev: Ev | 'N', top = true): void {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const q = [v3(cu + r0 * Math.cos(a0), y0, cv + r0 * Math.sin(a0)), v3(cu + r0 * Math.cos(a1), y0, cv + r0 * Math.sin(a1)),
        v3(cu + r1 * Math.cos(a1), y1, cv + r1 * Math.sin(a1)), v3(cu + r1 * Math.cos(a0), y1, cv + r1 * Math.sin(a0))];
      const am = (a0 + a1) / 2;
      this.poly(q, cell, ev, v3(Math.cos(am), 0, Math.sin(am)));
    }
    if (top) {
      const ring: V3[] = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push(v3(cu + r1 * Math.cos(a), y1, cv + r1 * Math.sin(a))); }
      this.poly(ring, cell, ev, new THREE.Vector3(0, 1, 0));
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('cellRect', new THREE.Float32BufferAttribute(this.cell, 4));
    if (this.evidence) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

function inPoly(u: number, v: number, poly: UV[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i], [uj, vj] = poly[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}
const bounds = (poly: UV[]): { u0: number; u1: number; v0: number; v1: number } => ({
  u0: Math.min(...poly.map((p) => p[0])), u1: Math.max(...poly.map((p) => p[0])),
  v0: Math.min(...poly.map((p) => p[1])), v1: Math.max(...poly.map((p) => p[1])),
});

const FLOOR_CELL: Record<string, AtlasCell> = {
  gravel: 'street', tile: 'brick', 'tesserae-white': 'mosaic', signinum: 'signinum',
  'signinum-polished': 'signinum', hypocaust: 'signinum', earth: 'street',
};

export function buildFromPlan(plan: BuildingPlan, opts: PlanBuildOptions): PlanBuild {
  const { lod } = opts;
  const drop = opts.footingDrop ?? 0;
  const acc = new Acc(!!opts.evidenceColors, !!opts.solidOnly);
  const footprints: PlanFootprint[] = [];
  const pitch = Math.tan(((plan.pitchDeg ?? 22) * Math.PI) / 180);
  const interiorRooms = plan.rooms.filter((r) => r.finish !== 'exterior');

  // Height of the roof surface over a plan point (undefined = open sky).
  const roofHeightAt = (u: number, v: number): number | undefined => {
    for (const rf of plan.roofs ?? []) {
      if (rf.type === 'gable' && rf.poly && inPoly(u, v, rf.poly)) {
        const B = bounds(rf.poly);
        const db = (rf.ridge ?? 'u') === 'u' ? Math.min(v - B.v0, B.v1 - v) : Math.min(u - B.u0, B.u1 - u);
        return (rf.eaves ?? 6) + db * pitch;
      }
      if (rf.type === 'lean-to' && rf.poly && inPoly(u, v, rf.poly)) {
        const B = bounds(rf.poly), hi = rf.highY ?? 4, lo = rf.lowY ?? 3, side = rf.highSide ?? 's';
        const s = side === 's' ? (v - B.v0) / (B.v1 - B.v0) : side === 'n' ? (B.v1 - v) / (B.v1 - B.v0)
          : side === 'w' ? (u - B.u0) / (B.u1 - B.u0) : (B.u1 - u) / (B.u1 - B.u0);
        return hi + (lo - hi) * s;
      }
      if (rf.type === 'peristyle' && rf.outer && rf.inner && inPoly(u, v, rf.outer) && !inPoly(u, v, rf.inner)) {
        const O = bounds(rf.outer), I = bounds(rf.inner), hi = rf.highY ?? 4.5, lo = rf.lowY ?? 3;
        const sides = [[u - O.u0, I.u0 - O.u0], [O.u1 - u, O.u1 - I.u1], [v - O.v0, I.v0 - O.v0], [O.v1 - v, O.v1 - I.v1]];
        const [d, depth] = sides.reduce((m, x) => (x[0] < m[0] ? x : m));
        return hi + (lo - hi) * Math.min(1, d / depth);
      }
    }
    return undefined;
  };
  /** Height up to which a wall face looking at (u, v) is indoors: 0 outdoors, else the
   * roof height there (faces above a lower neighbouring roof are exterior). */
  const interiorHeight = (u: number, v: number): number => {
    if (!interiorRooms.some((r) => inPoly(u, v, r.poly))) return 0;
    return roofHeightAt(u, v) ?? Infinity;
  };
  /** Which room + roof a plan point is in (heights vary along a wall; identity does not). */
  const sideKeyAt = (u: number, v: number): string => {
    const room = interiorRooms.findIndex((r) => inPoly(u, v, r.poly));
    const roof = (plan.roofs ?? []).findIndex((rf) => (rf.poly && inPoly(u, v, rf.poly))
      || (rf.outer && rf.inner && inPoly(u, v, rf.outer) && !inPoly(u, v, rf.inner)));
    return `${room}|${roof}`;
  };

  // Interior face: dado below 1 m, plaster above (split so the dado band is exact).
  const interiorFace = (q: (y: number) => [V3, V3], y0: number, y1: number, want: V3, ev: Ev | 'N'): void => {
    const cut = Math.min(Math.max(1.0, y0), y1);
    if (cut > y0) { const [a, b] = q(y0), [c, d] = q(cut); acc.poly([a, b, d, c], 'dado', ev, want); }
    if (y1 > cut) { const [a, b] = q(cut), [c, d] = q(y1); acc.poly([a, b, d, c], 'plasterPink', ev, want); }
  };

  // ---------------- walls ----------------
  const wallById = new Map(plan.walls.map((w) => [w.id, w]));
  for (const w of plan.walls) {
    const ev = w.ev ?? 'C';
    const [au, av] = w.a, [bu, bv] = w.b;
    const L = Math.hypot(bu - au, bv - av);
    if (L < 1e-6) continue;
    const du = (bu - au) / L, dv = (bv - av) / L;
    const nu = -dv, nv = du; // left normal in plan
    const half = w.t / 2;
    const P = (s: number, off: number, y: number): V3 => v3(au + du * s + nu * off, y, av + dv * s + nv * off);
    const sideL = v3(nu, 0, nv), sideR = sideL.clone().negate();
    const along = v3(du, 0, dv);
    // How high is each side indoors at distance s along the wall? (sampled just beyond each face)
    const sideIn = (s: number, side: number): number =>
      interiorHeight(au + du * s + side * nu * (half + 0.3), av + dv * s + side * nv * (half + 0.3));
    const extCell: AtlasCell = w.material ?? 'masonry';
    // Split where the room or roof on either side changes (e.g. a wall that is partly an annex wall).
    const key = (s: number): string => {
      const at = (side: number): string => sideKeyAt(au + du * s + side * nu * (half + 0.3), av + dv * s + side * nv * (half + 0.3));
      return `${at(1)}/${at(-1)}`;
    };
    const sideCuts: number[] = [];
    for (let s = 0.75; s < L; s += 0.5) {
      const p = s - 0.5;
      if (key(p) !== key(s)) {
        let lo = p, hi = s; // bisect to ~1 cm
        for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (key(m) === key(lo)) lo = m; else hi = m; }
        sideCuts.push((lo + hi) / 2);
      }
    }

    // Holes along the wall: doors 0..oh, windows sill..head (none at lod 2).
    type Hole = { s0: number; s1: number; y0: number; y1: number; glass: boolean; ev: Ev };
    const holes: Hole[] = [];
    if (lod < 2) {
      for (const o of w.openings ?? []) holes.push({ s0: o.at - o.w / 2, s1: o.at + o.w / 2, y0: 0, y1: Math.min(o.oh, w.h), glass: false, ev });
      for (const o of w.windows ?? []) holes.push({ s0: o.at - o.w / 2, s1: o.at + o.w / 2, y0: o.sill, y1: o.head, glass: true, ev: o.ev ?? 'C' });
    }
    const S0 = -half, S1 = L + half; // extend to close corners
    const holeEdges = new Set(holes.flatMap((h) => [h.s0, h.s1]));
    const cuts = [...new Set([S0, S1, ...sideCuts, ...holes.flatMap((h) => [h.s0, h.s1])])].filter((s) => s >= S0 && s <= S1).sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const s0 = cuts[i], s1 = cuts[i + 1];
      if (s1 - s0 < 1e-4) continue;
      const mid = (s0 + s1) / 2;
      const sm = Math.min(L - 0.05, Math.max(0.05, mid)); // sample inside the wall's own length
      const inL = sideIn(sm, 1), inR = sideIn(sm, -1);
      const here = holes.filter((h) => mid > h.s0 && mid < h.s1);
      // solid y-ranges = [0,h] minus the holes covering this interval
      let solids: Array<[number, number]> = [[-drop, w.h]];
      for (const h of here) {
        solids = solids.flatMap(([a, b]) => {
          const out: Array<[number, number]> = [];
          if (h.y0 > a) out.push([a, Math.min(b, h.y0)]);
          if (h.y1 < b) out.push([Math.max(a, h.y1), b]);
          return out.filter(([x, y]) => y - x > 1e-4);
        });
      }
      for (const [y0, y1] of solids) {
        if (y0 < 1.2 && y1 > 0.3) footprints.push({ kind: 'box', a: [au + du * s0, av + dv * s0], b: [au + du * s1, av + dv * s1], t: w.t, h: y1 });
        if (lod >= 1 && inL >= y1 && inR >= y1) continue; // indoors on both sides: invisible from outside
        const q = (side: number) => (y: number): [V3, V3] => [P(s0, side * half, y), P(s1, side * half, y)];
        // each face: plaster indoors up to the neighbouring roof, masonry above / outdoors
        const face = (side: number, inH: number, want: V3): void => {
          const yi = Math.min(y1, Math.max(y0, inH));
          if (yi > y0 && lod === 0) interiorFace(q(side), y0, yi, want, ev);
          if (y1 > yi) { const [a, b] = q(side)(yi), [c, d] = q(side)(y1); acc.poly([a, b, d, c], extCell, ev, want); }
        };
        face(1, inL, sideL);
        face(-1, inR, sideR);
        // top (wall top or sill), underside (lintel / window head)
        acc.poly([P(s0, -half, y1), P(s1, -half, y1), P(s1, half, y1), P(s0, half, y1)], 'stone', 'N', UP);
        if (y0 > 0) acc.poly([P(s0, -half, y0), P(s1, -half, y0), P(s1, half, y0), P(s0, half, y0)], 'brick', ev, DOWN);
        // ends / reveals (brick quoins); none at internal split points
        if (s0 === S0 || holeEdges.has(s0)) acc.poly([P(s0, -half, y0), P(s0, half, y0), P(s0, half, y1), P(s0, -half, y1)], w.material ?? 'brick', ev, along.clone().negate());
        if (s1 === S1 || holeEdges.has(s1)) acc.poly([P(s1, -half, y0), P(s1, half, y0), P(s1, half, y1), P(s1, -half, y1)], w.material ?? 'brick', ev, along);
      }
      // glass, set in the middle of the wall thickness
      if (lod < 2) {
        for (const h of here.filter((x) => x.glass)) {
          const pts = [P(s0, 0, h.y0), P(s1, 0, h.y0), P(s1, 0, h.y1), P(s0, 0, h.y1)];
          const g = `g${h.ev}` as Tint;
          acc.surf(() => {
            if (inL < h.y1 || lod === 0) acc.poly(pts, 'window', g, sideL, true);
            if (inR < h.y1 || lod === 0) acc.poly(pts, 'window', g, sideR, true);
          });
        }
      }
    }
  }

  // ---------------- apses ----------------
  for (const ap of plan.apses ?? []) {
    acc.surface = false;
    const ev = ap.ev ?? 'C';
    const ri = ap.r - ap.t / 2, ro = ap.r + ap.t / 2;
    const a0 = (ap.start * Math.PI) / 180, a1 = (ap.end * Math.PI) / 180;
    const n = lod === 2 ? 4 : 10;
    const at = (r: number, a: number, y: number): V3 => v3(ap.c[0] + r * Math.cos(a), y, ap.c[1] + r * Math.sin(a));
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n, tm = (t0 + t1) / 2;
      const win = lod < 2 ? (ap.windows ?? []).find((wd) => Math.abs(((wd.angle * Math.PI) / 180) - tm) < Math.abs(t1 - t0) / 2 + 1e-6) : undefined;
      const solids: Array<[number, number]> = win ? [[-drop, win.sill], [win.head, ap.h]] : [[-drop, ap.h]];
      const out = at(1, tm, 0).sub(at(0, tm, 0));
      for (const [y0, y1] of solids) {
        acc.poly([at(ro, t0, y0), at(ro, t1, y0), at(ro, t1, y1), at(ro, t0, y1)], 'masonry', ev, out);
        if (lod === 0) interiorFace((y) => [at(ri, t0, y), at(ri, t1, y)], y0, y1, out.clone().negate(), ev);
        acc.poly([at(ri, t0, y1), at(ri, t1, y1), at(ro, t1, y1), at(ro, t0, y1)], 'stone', 'N', UP);
        if (y0 > 0) acc.poly([at(ri, t0, y0), at(ri, t1, y0), at(ro, t1, y0), at(ro, t0, y0)], 'brick', ev, DOWN);
        if (win) {
          // reveals face back along the arc: -tangent at t0, +tangent at t1
          const dir = Math.sign(a1 - a0) || 1;
          acc.poly([at(ri, t0, y0), at(ro, t0, y0), at(ro, t0, y1), at(ri, t0, y1)], 'brick', ev, v3(Math.sin(t0) * dir, 0, -Math.cos(t0) * dir));
          acc.poly([at(ri, t1, y0), at(ro, t1, y0), at(ro, t1, y1), at(ri, t1, y1)], 'brick', ev, v3(-Math.sin(t1) * dir, 0, Math.cos(t1) * dir));
        }
      }
      if (win) {
        const pane = [at(ap.r, t0, win.sill), at(ap.r, t1, win.sill), at(ap.r, t1, win.head), at(ap.r, t0, win.head)];
        acc.surf(() => {
          acc.poly(pane, 'window', `g${ev}` as Tint, out, true);
          if (lod === 0) acc.poly(pane, 'window', `g${ev}` as Tint, out.clone().negate(), true); // seen from inside
        });
      }
      footprints.push({ kind: 'box', a: [ap.c[0] + ap.r * Math.cos(t0), ap.c[1] + ap.r * Math.sin(t0)], b: [ap.c[0] + ap.r * Math.cos(t1), ap.c[1] + ap.r * Math.sin(t1)], t: ap.t, h: ap.h });
    }
    // half-dome inside (lod 0), half-cone roof outside: open surfaces
    acc.surface = true;
    // The apse opens toward the room along -mid (mid = centre of its arc); a neck runs
    // from the chord back to the room's wall line.
    const am = (a0 + a1) / 2, neck = ap.neck ?? 0;
    const nU = -Math.cos(am), nV = -Math.sin(am);       // toward the room
    const cU = -nV, cV = nU;                              // along the chord
    const N = (s: number, c: number, y: number): V3 => v3(ap.c[0] + nU * s + cU * c, y, ap.c[1] + nV * s + cV * c);
    if (lod === 0) {
      const spring = ap.h - ri - 0.3, rows = 4;
      // floor: half disc + neck
      for (let i = 0; i < n; i++) {
        const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
        acc.poly([v3(ap.c[0], 0.03, ap.c[1]), at(ri, t0, 0.03), at(ri, t1, 0.03)], 'signinum', 'N', UP);
      }
      if (neck > 0) {
        acc.poly([N(0, -ri, 0.03), N(neck, -ri, 0.03), N(neck, ri, 0.03), N(0, ri, 0.03)], 'signinum', 'N', UP);
        // ceiling: the dome's half-circle profile carried back to the wall line
        for (let k = 0; k < 8; k++) {
          const p0 = (k / 8) * Math.PI, p1 = ((k + 1) / 8) * Math.PI;
          const q = [N(0, ri * Math.cos(p0), spring + ri * Math.sin(p0)), N(neck, ri * Math.cos(p0), spring + ri * Math.sin(p0)),
            N(neck, ri * Math.cos(p1), spring + ri * Math.sin(p1)), N(0, ri * Math.cos(p1), spring + ri * Math.sin(p1))];
          const pm = (p0 + p1) / 2;
          acc.poly(q, 'plasterPink', ev, N(0, -Math.cos(pm), -Math.sin(pm)).sub(N(0, 0, 0)));
        }
      }
      for (let i = 0; i < n; i++) {
        const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
        for (let k = 0; k < rows; k++) {
          const p0 = (k / rows) * Math.PI / 2, p1 = ((k + 1) / rows) * Math.PI / 2;
          const D = (t: number, p: number): V3 => at(ri * Math.cos(p), t, spring + ri * Math.sin(p));
          const quad = [D(t0, p0), D(t1, p0), D(t1, p1), D(t0, p1)];
          const m = quad.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(0.25);
          acc.poly(quad, 'plasterPink', ev, v3(ap.c[0], spring, ap.c[1]).sub(m));
        }
      }
    }
    if (ap.roof !== 'none') {
      const rr = ro + 0.3, apex = ap.h + rr * pitch * 0.8, eave = ap.h - 0.3 * pitch;
      for (let i = 0; i < n; i++) {
        const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n, tm = (t0 + t1) / 2;
        acc.poly([at(rr, t0, eave), at(rr, t1, eave), v3(ap.c[0], apex, ap.c[1])], 'tile', ap.ev ?? 'C', at(1, tm, 0).sub(at(0, tm, 0)).add(UP));
      }
      if (neck > 0) {
        // two slopes carrying the half-cone's ridge back into the main roof
        const back = neck + 0.4;
        acc.poly([N(0, rr, eave), N(back, rr, eave), N(back, 0, apex), N(0, 0, apex)], 'tile', ap.ev ?? 'C', UP);
        acc.poly([N(0, -rr, eave), N(back, -rr, eave), N(back, 0, apex), N(0, 0, apex)], 'tile', ap.ev ?? 'C', UP);
      }
    }
  }

  // ---------------- floors, pools, fittings (lod 0) ----------------
  // Floors, roofs and vaults are open surfaces (no closed volume).
  acc.surface = true;
  if (lod === 0) {
    for (const r of plan.rooms) {
      const cell = FLOOR_CELL[r.floor ?? 'gravel'] ?? 'signinum';
      const B = bounds(r.poly);
      const rects: Array<[number, number, number, number]> = [];
      if (r.pool) {
        const p = bounds(r.pool.poly);
        rects.push([B.u0, B.v0, B.u1, p.v0], [B.u0, p.v1, B.u1, B.v1], [B.u0, p.v0, p.u0, p.v1], [p.u1, p.v0, B.u1, p.v1]);
      } else rects.push([B.u0, B.v0, B.u1, B.v1]);
      for (const [u0, v0, u1, v1] of rects) {
        if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) continue;
        acc.poly([v3(u0, 0.03, v0), v3(u1, 0.03, v0), v3(u1, 0.03, v1), v3(u0, 0.03, v1)], cell, 'N', UP);
      }
      if (r.pool) {
        // Raised basin: rim walls round a sunken-looking water surface (ground can't be cut).
        const p = bounds(r.pool.poly), rt = r.pool.rimT, rimH = 0.55;
        acc.box(p.u0, p.v0, p.u1, p.v0 + rt, 0, rimH, 'stone', 'C');
        acc.box(p.u0, p.v1 - rt, p.u1, p.v1, 0, rimH, 'stone', 'C');
        acc.box(p.u0, p.v0 + rt, p.u0 + rt, p.v1 - rt, 0, rimH, 'stone', 'C');
        acc.box(p.u1 - rt, p.v0 + rt, p.u1, p.v1 - rt, 0, rimH, 'stone', 'C');
        acc.poly([v3(p.u0 + rt, rimH - 0.12, p.v0 + rt), v3(p.u1 - rt, rimH - 0.12, p.v0 + rt), v3(p.u1 - rt, rimH - 0.12, p.v1 - rt), v3(p.u0 + rt, rimH - 0.12, p.v1 - rt)], 'water', 'N', UP);
        footprints.push({ kind: 'box', a: [p.u0, (p.v0 + p.v1) / 2], b: [p.u1, (p.v0 + p.v1) / 2], t: p.v1 - p.v0, h: rimH });
      }
      if (r.labrum) {
        const [cu, cv] = r.labrum.c;
        acc.cylinder(cu, cv, 0.22, 0.18, 0, 0.8, 8, 'stone', 'S', false);
        acc.cylinder(cu, cv, 0.35, r.labrum.r, 0.8, 1.0, 12, 'stone', 'S', false);
        acc.cylinder(cu, cv, r.labrum.r - 0.05, r.labrum.r - 0.05, 0.96, 0.96, 12, 'water', 'N', true);
        footprints.push({ kind: 'circle', c: [cu, cv], r: r.labrum.r, h: 1 });
      }
      if (r.base) {
        const b = bounds(r.base.poly);
        acc.box(b.u0, b.v0, b.u1, b.v1, 0, r.base.h, 'masonry', 'S');
        footprints.push({ kind: 'box', a: [b.u0, (b.v0 + b.v1) / 2], b: [b.u1, (b.v0 + b.v1) / 2], t: b.v1 - b.v0, h: r.base.h });
      }
    }
  }

  // ---------------- roofs ----------------
  const OH = 0.35; // eaves overhang
  const roofOver = (u: number, v: number): PlanRoof | undefined =>
    (plan.roofs ?? []).find((rf) => rf.poly && inPoly(u, v, rf.poly));
  for (const rf of plan.roofs ?? []) {
    const ev = rf.ev ?? 'C';
    if (rf.type === 'gable' && rf.poly) {
      const B = bounds(rf.poly);
      // Work in (a = along ridge, b = across) then map back to (u, v).
      const alongU = (rf.ridge ?? 'u') === 'u';
      const [a0, a1, b0, b1] = alongU ? [B.u0, B.u1, B.v0, B.v1] : [B.v0, B.v1, B.u0, B.u1];
      const P = (a: number, y: number, b: number): V3 => (alongU ? v3(a, y, b) : v3(b, y, a));
      const e = rf.eaves ?? 6, hb = (b1 - b0) / 2, bm = (b0 + b1) / 2, ridgeY = e + hb * pitch, eY = e - OH * pitch;
      const slopeA = [P(a0 - OH, eY, b0 - OH), P(a1 + OH, eY, b0 - OH), P(a1 + OH, ridgeY, bm), P(a0 - OH, ridgeY, bm)];
      const slopeB = [P(a0 - OH, eY, b1 + OH), P(a1 + OH, eY, b1 + OH), P(a1 + OH, ridgeY, bm), P(a0 - OH, ridgeY, bm)];
      acc.poly(slopeA, 'tile', ev, UP); acc.poly(slopeB, 'tile', ev, UP);
      if (lod === 0) { acc.poly(slopeA, 'wood', ev, DOWN); acc.poly(slopeB, 'wood', ev, DOWN); }
      // gable triangles over the end walls
      for (const a of [a0, a1]) {
        const tri = [P(a, e, b0), P(a, e, b1), P(a, ridgeY, bm)];
        const outward = alongU ? v3(a === a0 ? -1 : 1, 0, 0) : v3(0, 0, a === a0 ? -1 : 1);
        acc.poly(tri, 'masonry', ev, outward);
        if (lod === 0) acc.poly(tri, 'masonry', ev, outward.clone().negate());
      }
    } else if (rf.type === 'lean-to' && rf.poly) {
      const B = bounds(rf.poly), hi = rf.highY ?? 4, lo = rf.lowY ?? 3;
      // Parametrise across the slope: s = 0 at the high side, 1 at the low side.
      const side = rf.highSide ?? 's';
      const corner = (s: number, t: number, y: number): V3 => {
        if (side === 's') return v3(B.u0 + t * (B.u1 - B.u0), y, B.v0 + s * (B.v1 - B.v0));
        if (side === 'n') return v3(B.u0 + t * (B.u1 - B.u0), y, B.v1 - s * (B.v1 - B.v0));
        if (side === 'w') return v3(B.u0 + s * (B.u1 - B.u0), y, B.v0 + t * (B.v1 - B.v0));
        return v3(B.u1 - s * (B.u1 - B.u0), y, B.v0 + t * (B.v1 - B.v0));
      };
      const depth = side === 's' || side === 'n' ? B.v1 - B.v0 : B.u1 - B.u0;
      const sOver = 1 + OH / depth, yOver = lo - (hi - lo) * (OH / depth);
      const top = [corner(0, 0, hi), corner(0, 1, hi), corner(sOver, 1, yOver), corner(sOver, 0, yOver)];
      acc.poly(top, 'tile', ev, UP);
      if (lod === 0) acc.poly(top, 'wood', ev, DOWN);
      if (rf.closeEnds) {
        for (const t of [0, 1]) {
          // vertical gable-end triangle between the wall tops (at lowY) and the slope
          acc.poly([corner(0, t, hi), corner(1, t, lo), corner(0, t, lo)], 'masonry', ev, corner(0.5, t, 0).sub(corner(0.5, 0.5, 0)));
        }
      }
    } else if (rf.type === 'peristyle' && rf.outer && rf.inner) {
      const O = bounds(rf.outer), I = bounds(rf.inner), hi = rf.highY ?? 4.5, lo = rf.lowY ?? 3;
      // Inner edge overhangs the colonnade by OH, dropping along the slope.
      const depthAvg = ((I.u0 - O.u0) + (O.u1 - I.u1) + (I.v0 - O.v0) + (O.v1 - I.v1)) / 4;
      const loOver = lo - (hi - lo) * (OH / depthAvg);
      const Iu0 = I.u0 + OH, Iu1 = I.u1 - OH, Iv0 = I.v0 + OH, Iv1 = I.v1 - OH;
      const strips: V3[][] = [
        [v3(O.u0, hi, O.v1), v3(O.u1, hi, O.v1), v3(Iu1, loOver, Iv1), v3(Iu0, loOver, Iv1)],
        [v3(O.u0, hi, O.v0), v3(O.u1, hi, O.v0), v3(Iu1, loOver, Iv0), v3(Iu0, loOver, Iv0)],
        [v3(O.u0, hi, O.v0), v3(O.u0, hi, O.v1), v3(Iu0, loOver, Iv1), v3(Iu0, loOver, Iv0)],
        [v3(O.u1, hi, O.v0), v3(O.u1, hi, O.v1), v3(Iu1, loOver, Iv1), v3(Iu1, loOver, Iv0)],
      ];
      for (const s of strips) { acc.poly(s, 'tile', ev, UP); if (lod === 0) acc.poly(s, 'wood', ev, DOWN); }
    }
  }

  // ---------------- barrel vaults (lod 0) ----------------
  if (lod === 0) {
    for (const r of plan.rooms.filter((x) => x.vault)) {
      const B = bounds(r.poly), inset = 0.4;
      const cu = (B.u0 + B.u1) / 2, cv = (B.v0 + B.v1) / 2;
      const eaves = roofOver(cu, cv)?.eaves ?? 6;
      const lenU = B.u1 - B.u0, lenV = B.v1 - B.v0;
      const alongU = lenU >= lenV;
      const span = (alongU ? lenV : lenU) - 2 * inset, rad = span / 2, spring = eaves - rad - 0.05;
      const [a0, a1] = alongU ? [B.u0 + inset, B.u1 - inset] : [B.v0 + inset, B.v1 - inset];
      const bc = alongU ? cv : cu;
      const P = (a: number, y: number, b: number): V3 => (alongU ? v3(a, y, b) : v3(b, y, a));
      const n = 10;
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * Math.PI, t1 = ((i + 1) / n) * Math.PI;
        const q = [P(a0, spring + rad * Math.sin(t0), bc + rad * Math.cos(t0)), P(a1, spring + rad * Math.sin(t0), bc + rad * Math.cos(t0)),
          P(a1, spring + rad * Math.sin(t1), bc + rad * Math.cos(t1)), P(a0, spring + rad * Math.sin(t1), bc + rad * Math.cos(t1))];
        const tm = (t0 + t1) / 2;
        acc.poly(q, 'plasterPink', 'S', P(0, -Math.sin(tm), -Math.cos(tm)).sub(P(0, 0, 0)));
      }
    }
  }

  // ---------------- columns, piers, beams, arches ----------------
  acc.surface = false;
  if (lod < 2) {
    for (const cg of plan.columns ?? []) {
      const ev = cg.ev ?? 'C', y0 = cg.y0 ?? 0;
      let pts: UV[] = [...(cg.at ?? [])];
      if (cg.on && cg.spacing) {
        const seen = new Set<string>();
        for (const wid of cg.on) {
          const w = wallById.get(wid); if (!w) continue;
          const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
          const k = Math.max(1, Math.round(L / cg.spacing));
          for (let i = 0; i <= k; i++) {
            const s = (i / k) * L;
            if ((w.openings ?? []).some((o) => Math.abs(s - o.at) < o.w / 2 + 0.25)) continue;
            const p: UV = [w.a[0] + ((w.b[0] - w.a[0]) * s) / L, w.a[1] + ((w.b[1] - w.a[1]) * s) / L];
            const key = `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
            if (!seen.has(key)) { seen.add(key); pts.push(p); }
          }
        }
      }
      if (cg.kind === 'pier') {
        for (const [u, v] of pts) {
          acc.box(u - cg.d / 2, v - cg.d / 2, u + cg.d / 2, v + cg.d / 2, y0, y0 + cg.h, 'brick', ev);
          footprints.push({ kind: 'box', a: [u - cg.d / 2, v], b: [u + cg.d / 2, v], t: cg.d, h: cg.h });
        }
        if (cg.arch && pts.length === 2) {
          // Brick arch spanning the clear gap between the two piers (plan line along u).
          const [p0, p1] = pts[0][0] < pts[1][0] ? [pts[0], pts[1]] : [pts[1], pts[0]];
          const uA = p0[0] + cg.d / 2, uB = p1[0] - cg.d / 2, vC = p0[1], hd = cg.d / 2;
          const rad = (uB - uA) / 2, cu = (uA + uB) / 2, ySpring = y0 + cg.h, yTop = ySpring + rad + 0.55;
          const n = 8;
          acc.surface = true; // arch skin is not a closed solid
          for (let i = 0; i < n; i++) {
            const t0 = Math.PI - (i / n) * Math.PI, t1 = Math.PI - ((i + 1) / n) * Math.PI;
            const x0 = cu + rad * Math.cos(t0), x1 = cu + rad * Math.cos(t1);
            const y0a = ySpring + rad * Math.sin(t0), y1a = ySpring + rad * Math.sin(t1);
            for (const side of [-1, 1]) acc.poly([v3(x0, y0a, vC + side * hd), v3(x1, y1a, vC + side * hd), v3(x1, yTop, vC + side * hd), v3(x0, yTop, vC + side * hd)], 'brick', ev, v3(0, 0, side));
            acc.poly([v3(x0, y0a, vC - hd), v3(x1, y1a, vC - hd), v3(x1, y1a, vC + hd), v3(x0, y0a, vC + hd)], 'brick', ev, v3(cu, ySpring, vC).sub(v3((x0 + x1) / 2, (y0a + y1a) / 2, vC)));
          }
          // over the piers and the top
          acc.box(p0[0] - cg.d / 2, vC - hd, uA, vC + hd, ySpring, yTop, 'brick', ev);
          acc.box(uB, vC - hd, p1[0] + cg.d / 2, vC + hd, ySpring, yTop, 'brick', ev);
          acc.poly([v3(uA, yTop, vC - hd), v3(uB, yTop, vC - hd), v3(uB, yTop, vC + hd), v3(uA, yTop, vC + hd)], 'stone', 'N', UP);
          acc.surface = false;
        }
        continue;
      }
      const r = cg.d / 2, shaftH = cg.h - 0.24;
      for (const [u, v] of pts) {
        if (lod === 0) {
          // dressed limestone: smooth cream ('plaster' cell), not coursed ashlar
          acc.box(u - r * 1.4, v - r * 1.4, u + r * 1.4, v + r * 1.4, y0, y0 + 0.12, 'plaster', ev);
          acc.cylinder(u, v, r, r * 0.85, y0 + 0.12, y0 + 0.12 + shaftH, 8, 'plaster', ev, false);
          acc.box(u - r * 1.35, v - r * 1.35, u + r * 1.35, v + r * 1.35, y0 + 0.12 + shaftH, y0 + cg.h, 'plaster', ev);
        } else acc.cylinder(u, v, r, r * 0.85, y0, y0 + cg.h, 4, 'plaster', ev, false);
        footprints.push({ kind: 'circle', c: [u, v], r: r * 1.3, h: cg.h });
      }
      // timber beams over the columns
      const beamY = y0 + cg.h, bw = 0.22;
      const beam = (a: UV, b: UV): void => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]), du = (b[0] - a[0]) / L, dv = (b[1] - a[1]) / L, nu = -dv * bw / 2, nv = du * bw / 2;
        const ext = bw / 2;
        const A: UV = [a[0] - du * ext, a[1] - dv * ext], Bq: UV = [b[0] + du * ext, b[1] + dv * ext];
        const corners = [[A[0] + nu, A[1] + nv], [Bq[0] + nu, Bq[1] + nv], [Bq[0] - nu, Bq[1] - nv], [A[0] - nu, A[1] - nv]] as UV[];
        const bot = corners.map(([cu2, cv2]) => v3(cu2, beamY, cv2)), topq = corners.map(([cu2, cv2]) => v3(cu2, beamY + 0.25, cv2));
        acc.poly(topq, 'wood', ev, UP); acc.poly(bot, 'wood', ev, DOWN);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          const mid = bot[i].clone().add(bot[j]).multiplyScalar(0.5);
          const cen = bot.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(0.25);
          acc.poly([bot[i], bot[j], topq[j], topq[i]], 'wood', ev, mid.sub(cen));
        }
      };
      if (cg.beam === true) for (const wid of cg.on ?? []) { const w = wallById.get(wid); if (w) beam(w.a, w.b); }
      else if (cg.beam && typeof cg.beam === 'object') beam(cg.beam.from, cg.beam.to);
    }
  }

  const geometry = acc.build();
  return { geometry, tris: acc.pos.length / 9, footprints };
}

