import * as THREE from 'three';
import type { AtlasCell } from './atlas.js';
import type { Ev, PlanArena, PlanSeg, UV } from '../../domain/keyPlan.js';
import { arenaProfile, bankCap, openingAt, polarDeg, profileY, ringPoint, ringRadius, segFrame } from '../../domain/arenaPlan.js';

// An amphitheatre bowl from a plan's `arena` (see domain/arenaPlan.ts for the shared geometry):
// sunken arena floor inside a curved wall, timber seat rows on earth banks, a crest walk with a
// fence, the outer bank slope, stone-walled entrance passages, vaulted recesses off the arena,
// outside stairs, and an apron at ground level out to the hole the ground mesh leaves for it.
// Model space as planBuilding (x = u, y = up, z = -v); the arena floor is y = 0.
//   lod 0  everything, swept every 3 degrees; seat rows as treads and risers
//   lod 1  every 6 degrees; the seating as one slope; no rail, fence, stairs or recess interiors
//   lod 2  every 12 degrees; as lod 1

type Tint = Ev | 'N';
/** The part of planBuilding's triangle accumulator this module uses. */
export interface ArenaAcc {
  surface: boolean;
  /** Closed solids only (section caps in the drawings). */
  readonly solidOnly: boolean;
  /** Vertex positions and normals emitted so far (3 floats each): the earth's shading is smoothed in place. */
  readonly pos: number[];
  readonly nor: number[];
  poly(pts: THREE.Vector3[], cell: AtlasCell, ev: Tint, want?: THREE.Vector3, fit?: boolean): void;
}
export type ArenaElementKind = 'arena-wall' | 'passage-wall' | 'seating' | 'bank' | 'rail' | 'palisade' | 'stair' | 'recess' | 'floor' | 'vault';
export interface ArenaCtx {
  acc: ArenaAcc;
  tag: (e: { id: string; kind: ArenaElementKind; ref: string; ev?: Ev; note?: string; conjecture?: boolean }) => void;
  lod: 0 | 1 | 2;
  mas: AtlasCell;
  drop: number;
  footprints: Array<{ kind: 'box'; a: UV; b: UV; t: number; h: number } | { kind: 'circle'; c: UV; r: number; h: number }>;
  /** Plan-space corners of the ground hole (an apron fills it from the bank's toe); none in the drawings. */
  apron?: UV[];
}

const v3 = (u: number, y: number, v: number): THREE.Vector3 => new THREE.Vector3(u, y, -v);
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const norm = (a: number): number => ((a % 360) + 360) % 360;

/** Smooth shading over the vertices emitted in [from, to) (vertex indices): each vertex takes the mean of the face
 * normals at its position (to 1 cm) that lie within `creaseDeg` of its own, so rounded earth shades smoothly while
 * sharper edges (the step behind the top row) stay crisp. */
function smoothNormals(acc: ArenaAcc, from: number, to: number, creaseDeg = 50): void {
  const key = (i: number): string => `${Math.round(acc.pos[i * 3] * 100)},${Math.round(acc.pos[i * 3 + 1] * 100)},${Math.round(acc.pos[i * 3 + 2] * 100)}`;
  const groups = new Map<string, number[]>();
  for (let i = from; i < to; i++) { const k = key(i); const g = groups.get(k); if (g) g.push(i); else groups.set(k, [i]); }
  const face = acc.nor.slice(from * 3, to * 3), cos = Math.cos((creaseDeg * Math.PI) / 180);
  const F = (i: number, c: number): number => face[(i - from) * 3 + c];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    for (const i of g) {
      let x = 0, y = 0, z = 0;
      for (const j of g) {
        if (F(i, 0) * F(j, 0) + F(i, 1) * F(j, 1) + F(i, 2) * F(j, 2) < cos) continue;
        x += F(j, 0); y += F(j, 1); z += F(j, 2);
      }
      const l = Math.hypot(x, y, z) || 1;
      acc.nor[i * 3] = x / l; acc.nor[i * 3 + 1] = y / l; acc.nor[i * 3 + 2] = z / l;
    }
  }
}

export function buildArena(ar: PlanArena, ctx: ArenaCtx): void {
  const { acc, tag, lod, mas } = ctx;
  const step = lod === 0 ? 3 : lod === 1 ? 6 : 12;
  const P = arenaProfile(ar);
  const evWall = ar.ev ?? 'S';
  const c = ar.c;
  /** Outward horizontal direction (model space) at a polar angle. */
  const out = (deg: number): THREE.Vector3 => v3(Math.cos((deg * Math.PI) / 180), 0, Math.sin((deg * Math.PI) / 180));
  const at = (p: UV, y: number): THREE.Vector3 => v3(p[0], y, p[1]);

  // -------- angular samples: sectors between the passages; the passages' boundary angles exactly
  const passOpen = ar.openings.filter((o) => o.kind === 'passage').sort((a, b) => norm(a.from) - norm(b.from));
  /** Which passage wall starts at a boundary angle (its inner end lies on the ring there). */
  const wallAt = (deg: number): PlanSeg | undefined => {
    let best: PlanSeg | undefined, bd = 0.6;
    for (const ps of ar.passages) for (const w of ps.walls) {
      const d = Math.abs(((polarDeg(ar, w.a[0], w.a[1]) - deg + 540) % 360) - 180);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  };
  const sectors: Array<{ angles: number[]; fine: number[]; w0?: PlanSeg; w1?: PlanSeg }> = [];
  // The banks fall away beside the passages' outer ends over a few degrees: sample the bank finer there.
  const nearEnds = lod === 0 ? [0.6, 1.2, 2, 3, 4.5, 6.5, 9] : lod === 1 ? [1.5, 4, 8] : [3, 8];
  for (let i = 0; i < passOpen.length; i++) {
    const a = norm(passOpen[i].to), bRaw = norm(passOpen[(i + 1) % passOpen.length].from), b = bRaw > a ? bRaw : bRaw + 360;
    const angles = [a];
    for (let k = Math.ceil(a / step) * step; k < b - 1e-6; k += step) if (k > a + 1e-6) angles.push(k);
    angles.push(b);
    const fine = [...new Set([...angles, ...nearEnds.flatMap((o) => [a + o, b - o])].map((x) => Math.round(x * 1000) / 1000))]
      .filter((x) => x >= a && x <= b).sort((x, y) => x - y);
    sectors.push({ angles, fine, w0: wallAt(a), w1: wallAt(bRaw) });
  }
  /** A point `d` out from the wall centreline at sample `i` of a sector; the end samples are put on the
   * passage wall's line, so the banks meet the walls without a wedge-shaped gap. */
  const secPt = (s: (typeof sectors)[number], i: number, d: number, list = s.angles): UV => {
    const p = ringPoint(ar, list[i], d);
    const w = i === 0 ? s.w0 : i === list.length - 1 ? s.w1 : undefined;
    if (!w) return p;
    const f = segFrame(w), k = f.ax(p);
    return [w.a[0] + f.du * k, w.a[1] + f.dv * k];
  };
  /** Bank height at a point: the profile, capped beside the passages' outer ends. */
  const bankY = (p: UV, d: number): number => Math.max(ar.ground, Math.min(profileY(ar, d), bankCap(ar, p)));

  // -------- arena floor (all lods)
  acc.surface = true;
  tag({ id: 'arena/floor', kind: 'floor', ref: ar.id, ev: evWall, note: 'Arena floor of sand and gravel: the arena, recess and passage floors were raised with sand and gravel in the 3rd century (Fulford 1989, via Kovacsovics 1993)' });
  {
    const fy = 0.03;
    // Across a passage's mouth the floor runs out to the straight line where the passage's ramp starts (between
    // its walls' inner faces at the arena wall's line), so no curved strip is left between them.
    const mouth = ar.passages.map((ps) => {
      const [w0, w1] = ps.walls, f0 = segFrame(w0), f1 = segFrame(w1);
      const side0 = Math.sign(f0.lat(w1.a)) || 1, side1 = Math.sign(f1.lat(w0.a)) || 1;
      const A: UV = [w0.a[0] - f0.dv * side0 * (w0.t / 2), w0.a[1] + f0.du * side0 * (w0.t / 2)];
      const B: UV = [w1.a[0] - f1.dv * side1 * (w1.t / 2), w1.a[1] + f1.du * side1 * (w1.t / 2)];
      return { A, B, from: polarDeg(ar, A[0], A[1]), to: polarDeg(ar, B[0], B[1]) };
    });
    /** Floor edge at a polar angle: on a mouth's line inside a passage opening, else the arena wall's inner face. */
    const edge = (deg: number): UV => {
      for (const m of mouth) {
        const lo = Math.min(m.from, m.to), hi = Math.max(m.from, m.to);
        if (!(deg > lo && deg < hi && hi - lo < 180)) continue;
        const du = Math.cos((deg * Math.PI) / 180), dv = Math.sin((deg * Math.PI) / 180);
        const eu = m.B[0] - m.A[0], ev = m.B[1] - m.A[1], den = du * ev - dv * eu;
        const t = ((m.A[0] - c[0]) * ev - (m.A[1] - c[1]) * eu) / den;
        return [c[0] + du * t, c[1] + dv * t];
      }
      return ringPoint(ar, deg, -ar.t / 2);
    };
    const angles: number[] = [];
    for (let k = 0; k < 360; k += step) angles.push(k);
    for (const m of mouth) angles.push(m.from, m.to);
    angles.sort((x, y) => x - y);
    for (let i = 0; i < angles.length; i++) {
      const a0 = angles[i], a1 = i + 1 < angles.length ? angles[i + 1] : angles[0] + 360;
      if (a1 - a0 < 1e-4) continue;
      acc.poly([at(c, fy), at(edge(a0), fy), at(edge(a1 % 360), fy)], 'arena', evWall, UP);
    }
  }

  // -------- arena wall (all lods): inner face and top; recess mouths arched at lod 0
  acc.surface = false;
  tag({ id: 'arena/wall', kind: 'arena-wall', ref: ar.id, ev: evWall, note: ar.note });
  const wallAngles: number[] = [];
  for (let k = 0; k < 360; k += step) wallAngles.push(k);
  for (const o of ar.openings) wallAngles.push(norm(o.from), norm(o.to));
  const wa = [...new Set(wallAngles.map((a) => Math.round(a * 1000) / 1000))].sort((a, b) => a - b);
  for (let i = 0; i < wa.length; i++) {
    const a0 = wa[i], a1 = i + 1 < wa.length ? wa[i + 1] : wa[0] + 360, am = (a0 + a1) / 2;
    if (openingAt(ar, am, 'passage')) continue;
    const rec = lod === 0 ? openingAt(ar, am, 'recess') : undefined;
    const i0 = ringPoint(ar, a0, -ar.t / 2), i1 = ringPoint(ar, a1, -ar.t / 2), o0 = ringPoint(ar, a0, ar.t / 2), o1 = ringPoint(ar, a1, ar.t / 2);
    const inward = out(am).negate();
    if (rec) {
      // arched mouth: slices of masonry above a semicircular head springing at `oh`
      const n = 6, half = (norm(rec.to - rec.from) / 2) * (Math.PI / 180) * ringRadius(ar, am), mid = norm(rec.from) + norm(rec.to - rec.from) / 2;
      const oh = rec.oh ?? 1.7;
      for (let k = 0; k < n; k++) {
        const b0 = a0 + ((a1 - a0) * k) / n, b1 = a0 + ((a1 - a0) * (k + 1)) / n;
        const s0 = (norm(b0 - mid + 180) - 180) * (Math.PI / 180) * ringRadius(ar, b0), s1 = (norm(b1 - mid + 180) - 180) * (Math.PI / 180) * ringRadius(ar, b1);
        const y0 = Math.min(ar.h, oh + Math.sqrt(Math.max(0, half * half - s0 * s0))), y1 = Math.min(ar.h, oh + Math.sqrt(Math.max(0, half * half - s1 * s1)));
        const j0 = ringPoint(ar, b0, -ar.t / 2), j1 = ringPoint(ar, b1, -ar.t / 2), q0 = ringPoint(ar, b0, ar.t / 2), q1 = ringPoint(ar, b1, ar.t / 2);
        const bm = (b0 + b1) / 2;
        acc.poly([at(j0, y0), at(j1, y1), at(j1, ar.h), at(j0, ar.h)], mas, evWall, out(bm).negate());
        acc.poly([at(q0, y0), at(q1, y1), at(q1, ar.h), at(q0, ar.h)], mas, evWall, out(bm));
        acc.poly([at(j0, y0), at(j1, y1), at(q1, y1), at(q0, y0)], mas, evWall, DOWN);
        acc.poly([at(j0, ar.h), at(j1, ar.h), at(q1, ar.h), at(q0, ar.h)], 'stone', 'N', UP);
      }
      // reveals below the springing, facing into the opening
      for (const [a, sgn] of [[a0, 1], [a1, -1]] as Array<[number, number]>) {
        if (Math.abs(norm(a) - norm(sgn > 0 ? rec.from : rec.to)) > 0.01) continue; // only at the mouth's edges
        const j = ringPoint(ar, a, -ar.t / 2), q = ringPoint(ar, a, ar.t / 2);
        const tangent = v3(-Math.sin((a * Math.PI) / 180) * sgn, 0, Math.cos((a * Math.PI) / 180) * sgn);
        acc.poly([at(j, -ctx.drop), at(q, -ctx.drop), at(q, oh), at(j, oh)], mas, evWall, tangent);
      }
      continue;
    }
    acc.poly([at(i0, -ctx.drop), at(i1, -ctx.drop), at(i1, ar.h), at(i0, ar.h)], mas, evWall, inward);
    acc.poly([at(i0, ar.h), at(i1, ar.h), at(o1, ar.h), at(o0, ar.h)], 'stone', 'N', UP);
    // the outer face is buried in the bank: only the drawings' section caps need it (a closed solid)
    if (acc.solidOnly) acc.poly([at(o0, -ctx.drop), at(o1, -ctx.drop), at(o1, ar.h), at(o0, ar.h)], mas, evWall, out(am));
    const m0 = ringPoint(ar, a0), m1 = ringPoint(ar, a1);
    if (!openingAt(ar, am, 'recess')) ctx.footprints.push({ kind: 'box', a: m0, b: m1, t: ar.t, h: ar.h });
    // wall ends at the passages, facing into the passage
    for (const [a, sgn] of [[a0, -1], [a1, 1]] as Array<[number, number]>) {
      if (!openingAt(ar, a + sgn * 0.01, 'passage')) continue;
      const tangent = v3(-Math.sin((a * Math.PI) / 180) * sgn, 0, Math.cos((a * Math.PI) / 180) * sgn);
      acc.poly([at(ringPoint(ar, a, -ar.t / 2), -ctx.drop), at(ringPoint(ar, a, ar.t / 2), -ctx.drop), at(ringPoint(ar, a, ar.t / 2), ar.h), at(ringPoint(ar, a, -ar.t / 2), ar.h)], mas, evWall, tangent);
    }
  }

  // -------- timber rail on the wall top (lod 0)
  if (lod === 0 && ar.rail) {
    const rail = ar.rail;
    acc.surface = true;
    tag({ id: 'arena/rail', kind: 'rail', ref: ar.id, ev: rail.ev ?? 'X', note: rail.note });
    for (let i = 0; i < wa.length; i++) {
      const a0 = wa[i], a1 = i + 1 < wa.length ? wa[i + 1] : wa[0] + 360;
      if (openingAt(ar, (a0 + a1) / 2, 'passage')) continue;
      const p0 = ringPoint(ar, a0, -ar.t / 2 + 0.08), p1 = ringPoint(ar, a1, -ar.t / 2 + 0.08);
      const q = [at(p0, ar.h), at(p1, ar.h), at(p1, ar.h + rail.h), at(p0, ar.h + rail.h)];
      acc.poly(q, 'wood', rail.ev ?? 'X', out((a0 + a1) / 2).negate());
      acc.poly(q, 'wood', rail.ev ?? 'X', out((a0 + a1) / 2));
    }
  }

  // -------- seating (rows at lod 0, one slope otherwise), crest walk and outer bank slope
  const S = ar.seating, evSeat = S.ev ?? 'C', evBank = ar.bank.ev ?? 'S';
  acc.surface = true;
  tag({ id: 'arena/seating', kind: 'seating', ref: ar.id, ev: evSeat, note: S.note });
  for (const s of sectors) {
    for (let i = 0; i + 1 < s.angles.length; i++) {
      const am = (s.angles[i] + s.angles[i + 1]) / 2, inward = out(am).negate();
      if (lod === 0) {
        for (let k = 0; k < S.rows; k++) {
          const d0 = ar.t / 2 + k * S.tread, d1 = d0 + S.tread, y = ar.h + k * S.rise, yNext = k + 1 < S.rows ? y + S.rise : P.crestY;
          const a0 = secPt(s, i, d0), b0 = secPt(s, i + 1, d0), a1 = secPt(s, i, d1), b1 = secPt(s, i + 1, d1);
          acc.poly([at(a0, y), at(b0, y), at(b1, y), at(a1, y)], 'wood', evSeat, UP);
          acc.poly([at(a1, y), at(b1, y), at(b1, yNext), at(a1, yNext)], 'wood', evSeat, inward);
        }
      } else {
        const a0 = secPt(s, i, ar.t / 2), b0 = secPt(s, i + 1, ar.t / 2), a1 = secPt(s, i, P.rowsEnd), b1 = secPt(s, i + 1, P.rowsEnd);
        acc.poly([at(a0, ar.h), at(b0, ar.h), at(b1, P.crestY), at(a1, P.crestY)], 'wood', evSeat, UP);
      }
    }
  }
  tag({ id: 'arena/bank', kind: 'bank', ref: ar.id, ev: evBank, note: ar.bank.note });
  const earthFrom = acc.pos.length / 3;
  for (const s of sectors) {
    // breaks at the passage walls' outer ends, so the bank's end drops to the ground there (no overhang)
    const ends = [s.w0, s.w1].filter((w): w is PlanSeg => !!w).map((w) => segFrame(w).L).filter((L) => L > P.crestEnd && L < ar.bank.toe);
    const ds = [P.rowsEnd, P.crestEnd, ...ends, ar.bank.toe].sort((x, y) => x - y);
    const L = s.fine;
    for (let i = 0; i + 1 < L.length; i++) {
      const am = (L[i] + L[i + 1]) / 2;
      const pa = ds.map((d) => secPt(s, i, d, L)), pb = ds.map((d) => secPt(s, i + 1, d, L));
      const ya = pa.map((p, k) => bankY(p, ds[k])), yb = pb.map((p, k) => bankY(p, ds[k]));
      // where the cap lowers the walk below the top row, a step down behind the rows
      if (ya[0] < P.crestY - 0.01 || yb[0] < P.crestY - 0.01) acc.poly([at(pa[0], ya[0]), at(pb[0], yb[0]), at(pb[0], P.crestY), at(pa[0], P.crestY)], 'grass', evBank, out(am));
      for (let k = 0; k + 1 < ds.length; k++) acc.poly([at(pa[k], ya[k]), at(pb[k], yb[k]), at(pb[k + 1], yb[k + 1]), at(pa[k + 1], ya[k + 1])], 'grass', evBank, UP);
    }
    // close each end of the bank down to the ground, facing its passage (no face where the bank already meets the
    // ground; beyond the passage wall it fills any edge left raised above the passage floor)
    for (const [i, w] of [[0, s.w0], [L.length - 1, s.w1]] as Array<[number, PlanSeg | undefined]>) {
      if (!w) continue;
      const ps = ar.passages.find((q) => q.walls.includes(w));
      const other = ps?.walls.find((q) => q !== w);
      if (!other) continue;
      const f = segFrame(w), side = Math.sign(f.lat(other.a)) || 1, want = v3(-f.dv * side, 0, f.du * side);
      const pts = ds.map((d) => secPt(s, i, d, L)), ys = pts.map((p, k) => bankY(p, ds[k]));
      for (let k = 0; k + 1 < ds.length; k++) {
        if (ds[k + 1] <= f.L + 0.01) continue; // beside the wall: the wall closes it
        if (ys[k] - ar.ground < 0.005 && ys[k + 1] - ar.ground < 0.005) continue;
        // a corner where the bank meets the ground is a triangle: drop the repeated point (the accumulator takes its
        // normal from the first three points)
        const q = [at(pts[k], ar.ground), at(pts[k + 1], ar.ground), at(pts[k + 1], ys[k + 1]), at(pts[k], ys[k])]
          .filter((p, j, arr) => j === 0 || p.distanceToSquared(arr[j - 1]) > 1e-8);
        if (q.length > 3 && q[q.length - 1].distanceToSquared(q[0]) < 1e-8) q.pop();
        acc.poly(q, 'grass', evBank, want);
      }
    }
  }

  const earthTo = acc.pos.length / 3;

  // -------- fence along the back of the crest walk (lod 0), with gaps for the stairs
  if (lod === 0 && ar.palisade) {
    const pal = ar.palisade, d = P.crestEnd - 0.1;
    const stairGap = (deg: number): boolean => (ar.stairs ?? []).some((st) => {
      const half = ((st.w / 2 + 0.2) / (ringRadius(ar, st.angle) + d)) * (180 / Math.PI);
      return Math.abs(((deg - st.angle + 540) % 360) - 180) < half;
    });
    tag({ id: 'arena/palisade', kind: 'palisade', ref: ar.id, ev: pal.ev ?? 'C', note: pal.note });
    for (const s of sectors) {
      const L = s.fine;
      for (let i = 0; i + 1 < L.length; i++) {
        const am = (L[i] + L[i + 1]) / 2;
        if (stairGap(am)) continue;
        const p0 = secPt(s, i, d, L), p1 = secPt(s, i + 1, d, L), y0 = bankY(p0, d), y1 = bankY(p1, d);
        if (y0 < P.crestY - 1 && y1 < P.crestY - 1) continue; // fence stops where the bank falls away at the passages
        const q = [at(p0, y0), at(p1, y1), at(p1, y1 + pal.h), at(p0, y0 + pal.h)];
        acc.poly(q, 'wood', pal.ev ?? 'C', out(am));
        acc.poly(q, 'wood', pal.ev ?? 'C', out(am).negate());
      }
    }
  }

  // -------- passages: retaining walls whose tops follow the seating, and ramped gravel floors
  for (const ps of ar.passages) {
    const ev = ps.ev ?? 'S';
    const [w0, w1] = ps.walls;
    const f0 = segFrame(w0), f1 = segFrame(w1);
    /** Wall top over a distance along the wall: the row nosings, the crest walk, then the bank slope. */
    const topY = (ax: number): number => {
      if (ax <= ar.t / 2) return ar.h;
      if (ax < P.rowsEnd) return Math.min(P.crestY, ar.h + S.rise * ((ax - ar.t / 2) / S.tread + 1));
      return Math.max(ar.ground + 0.3, profileY(ar, ax));
    };
    acc.surface = false;
    for (const [w, f, other] of [[w0, f0, w1], [w1, f1, w0]] as Array<[PlanSeg, ReturnType<typeof segFrame>, PlanSeg]>) {
      tag({ id: `${ps.id}/${w === w0 ? 'w' : 'e'}-wall`, kind: 'passage-wall', ref: ps.id, ev, note: ps.note });
      const side = Math.sign(f.lat(other.a)) || 1; // toward the corridor
      const nIn = v3(-f.dv * side, 0, f.du * side);
      const half = w.t / 2;
      const Pt = (ax: number, off: number): UV => [w.a[0] + f.du * ax - f.dv * off, w.a[1] + f.dv * ax + f.du * off];
      // from half a wall-thickness inside the arena wall's line (the passages are not quite radial: no sliver at the join)
      const breaks = [-ar.t / 2, ar.t / 2, P.rowsEnd, P.crestEnd, f.L].filter((x) => x <= f.L + 1e-6).sort((a, b) => a - b);
      for (let k = 0; k + 1 < breaks.length; k++) {
        const s0 = breaks[k], s1 = breaks[k + 1];
        if (s1 - s0 < 1e-3) continue;
        const ya = topY(s0 + 1e-4), yb = topY(s1 - 1e-4);
        for (const sg of [side, -side]) {
          if (sg !== side && lod > 0) continue; // the bank side is buried except at its top
          const o = sg * half;
          acc.poly([at(Pt(s0, o), -ctx.drop), at(Pt(s1, o), -ctx.drop), at(Pt(s1, o), yb), at(Pt(s0, o), ya)], mas, ev, sg === side ? nIn : nIn.clone().negate());
        }
        acc.poly([at(Pt(s0, -half), ya), at(Pt(s1, -half), yb), at(Pt(s1, half), yb), at(Pt(s0, half), ya)], 'stone', 'N', UP);
      }
      const ys = topY(-ar.t / 2); // inner end, inside the arena wall's line: closes the wall where it meets the arena wall
      acc.poly([at(Pt(-ar.t / 2, -half), -ctx.drop), at(Pt(-ar.t / 2, half), -ctx.drop), at(Pt(-ar.t / 2, half), ys), at(Pt(-ar.t / 2, -half), ys)], mas, ev, v3(-f.du, 0, -f.dv));
      const ye = topY(f.L - 1e-4);
      acc.poly([at(Pt(f.L, -half), -ctx.drop), at(Pt(f.L, half), -ctx.drop), at(Pt(f.L, half), ye), at(Pt(f.L, -half), ye)], mas, ev, v3(f.du, 0, f.dv));
      ctx.footprints.push({ kind: 'box', a: w.a, b: w.b, t: w.t, h: ar.h });
    }
    // floor: from the arena up to the old ground level at the walls' ends, then level out to the toe
    acc.surface = true;
    tag({ id: `${ps.id}/floor`, kind: 'floor', ref: ps.id, ev, note: 'Passage floor of gravel, rising from the arena to the old ground level' });
    const inner = (w: PlanSeg, f: ReturnType<typeof segFrame>, other: PlanSeg, ax: number): UV => {
      const side = Math.sign(f.lat(other.a)) || 1, o = side * (w.t / 2);
      return [w.a[0] + f.du * ax - f.dv * o, w.a[1] + f.dv * ax + f.du * o];
    };
    const L0 = f0.L, L1 = f1.L;
    acc.poly([at(inner(w0, f0, w1, 0), 0.03), at(inner(w1, f1, w0, 0), 0.03), at(inner(w1, f1, w0, L1), ar.ground + 0.03), at(inner(w0, f0, w1, L0), ar.ground + 0.03)], 'street', ev, UP);
    // beyond the walls: between their ends and the toe points of the banks either side
    const sec0 = sectors.find((s) => s.w1 === w0 || s.w0 === w0), sec1 = sectors.find((s) => s.w1 === w1 || s.w0 === w1);
    const toeOf = (s: (typeof sectors)[number] | undefined, w: PlanSeg): UV => {
      if (!s) return w.b;
      return s.w0 === w ? secPt(s, 0, ar.bank.toe) : secPt(s, s.angles.length - 1, ar.bank.toe);
    };
    // shares the ramp's end corners (no T-junction crack across the mouth); fanned from a toe corner so no
    // first triangle is degenerate
    const gy = ar.ground + 0.03;
    acc.poly([at(toeOf(sec0, w0), gy - 0.01), at(w0.b, gy), at(inner(w0, f0, w1, L0), gy), at(inner(w1, f1, w0, L1), gy), at(w1.b, gy), at(toeOf(sec1, w1), gy - 0.01)], 'street', ev, UP);
  }

  // -------- recesses (lod 0): floor, walls, half-dome and a short barrel vault back to the arena wall
  if (lod === 0) {
    for (const rc of ar.recesses) {
      const ev = rc.ev ?? 'S';
      const ri = rc.r - rc.t / 2, ro = rc.r + rc.t / 2;
      const ou = rc.c[0] - c[0], ov = rc.c[1] - c[1], od = Math.hypot(ou, ov), nu = ou / od, nv = ov / od;
      const sWall = ringRadius(ar, polarDeg(ar, rc.c[0], rc.c[1])) + ar.t / 2 - od; // arena wall's outer face, rel. the recess centre
      const N = (s: number, l: number): UV => [rc.c[0] + nu * s - nv * l, rc.c[1] + nv * s + nu * l];
      const op = ar.openings.find((o) => o.kind === 'recess' && o.id === rc.id);
      const spring = op?.oh ?? 1.7, n = 8;
      acc.surface = true; // inner faces only (the walls are buried in the bank): not closed solids
      tag({ id: rc.id, kind: 'recess', ref: rc.id, ev, note: rc.note });
      // half-circle wall (inner face) and the neck's two side walls
      for (let k = 0; k < n; k++) {
        const t0 = -Math.PI / 2 + (k * Math.PI) / n, t1 = -Math.PI / 2 + ((k + 1) * Math.PI) / n, tm = (t0 + t1) / 2;
        const p0 = N(ri * Math.cos(t0), ri * Math.sin(t0)), p1 = N(ri * Math.cos(t1), ri * Math.sin(t1));
        acc.poly([at(p0, -ctx.drop), at(p1, -ctx.drop), at(p1, spring), at(p0, spring)], mas, ev, v3(-(nu * Math.cos(tm) - nv * Math.sin(tm)), 0, -(nv * Math.cos(tm) + nu * Math.sin(tm))));
        const q0 = N(rc.r * Math.cos(t0), rc.r * Math.sin(t0)), q1 = N(rc.r * Math.cos(t1), rc.r * Math.sin(t1));
        ctx.footprints.push({ kind: 'box', a: q0, b: q1, t: rc.t, h: rc.h });
      }
      for (const l of [-ri, ri]) {
        acc.poly([at(N(sWall - ar.t, l), -ctx.drop), at(N(0, l), -ctx.drop), at(N(0, l), spring), at(N(sWall - ar.t, l), spring)], mas, ev, v3(-Math.sign(l) * -nv, 0, -Math.sign(l) * nu));
        const lo = Math.sign(l) * rc.r;
        ctx.footprints.push({ kind: 'box', a: N(sWall, lo), b: N(0, lo), t: rc.t, h: rc.h });
      }
      acc.surface = true;
      tag({ id: `${rc.id}/floor`, kind: 'floor', ref: rc.id, ev: evWall, note: 'Recess floor, raised with sand and gravel with the arena' });
      for (let k = 0; k < n; k++) {
        const t0 = -Math.PI / 2 + (k * Math.PI) / n, t1 = -Math.PI / 2 + ((k + 1) * Math.PI) / n;
        acc.poly([at(rc.c, 0.03), at(N(ri * Math.cos(t0), ri * Math.sin(t0)), 0.03), at(N(ri * Math.cos(t1), ri * Math.sin(t1)), 0.03)], 'arena', evWall, UP);
      }
      // the neck's floor, carried through the arena wall's thickness under the arch
      acc.poly([at(N(sWall - ar.t, -ri), 0.03), at(N(0, -ri), 0.03), at(N(0, ri), 0.03), at(N(sWall - ar.t, ri), 0.03)], 'arena', evWall, UP);
      tag({ id: `${rc.id}/vault`, kind: 'vault', ref: rc.id, ev: 'C', note: 'The recesses were probably vaulted (Fulford 2002); the form of the vault is a reconstruction' });
      const rows = 4;
      for (let k = 0; k < n; k++) {
        const t0 = -Math.PI / 2 + (k * Math.PI) / n, t1 = -Math.PI / 2 + ((k + 1) * Math.PI) / n;
        for (let j = 0; j < rows; j++) {
          const p0 = (j / rows) * (Math.PI / 2), p1 = ((j + 1) / rows) * (Math.PI / 2);
          const D = (t: number, p: number): THREE.Vector3 => at(N(ri * Math.cos(p) * Math.cos(t), ri * Math.cos(p) * Math.sin(t)), spring + ri * Math.sin(p));
          const quad = [D(t0, p0), D(t1, p0), D(t1, p1), D(t0, p1)];
          const m = quad.reduce((sum, q) => sum.add(q), new THREE.Vector3()).multiplyScalar(0.25);
          acc.poly(quad, 'stone', 'C', at(rc.c, spring).sub(m));
        }
      }
      for (let k = 0; k < n; k++) {
        const p0 = (k / n) * Math.PI, p1 = ((k + 1) / n) * Math.PI, pm = (p0 + p1) / 2;
        const B = (s: number, p: number): THREE.Vector3 => at(N(s, ri * Math.cos(p)), spring + ri * Math.sin(p));
        acc.poly([B(sWall - ar.t, p0), B(0, p0), B(0, p1), B(sWall - ar.t, p1)], 'stone', 'C', at(N(0, 0), spring).sub(at(N(0, ri * Math.cos(pm)), spring + ri * Math.sin(pm))));
      }
      void ro;
    }
  }

  // -------- outside stairs up the bank slope (lod 0)
  if (lod === 0) {
    for (const st of ar.stairs ?? []) {
      const ev = st.ev ?? 'X';
      tag({ id: st.id, kind: 'stair', ref: st.id, ev, note: st.note, conjecture: true });
      const steps = Math.max(2, Math.ceil((P.crestY - ar.ground) / 0.3));
      const dir = [Math.cos((st.angle * Math.PI) / 180), Math.sin((st.angle * Math.PI) / 180)];
      const lat = [-dir[1] * (st.w / 2), dir[0] * (st.w / 2)];
      const base = ringPoint(ar, st.angle, 0), r0 = ringRadius(ar, st.angle);
      const Q = (d: number, sgn: number): UV => [c[0] + dir[0] * (r0 + d) + sgn * lat[0], c[1] + dir[1] * (r0 + d) + sgn * lat[1]];
      void base;
      for (let k = 0; k < steps; k++) {
        // step k: tread at height y, from the crest down; its outer edge sits on the slope
        const y = P.crestY - (k + 1) * ((P.crestY - ar.ground) / steps);
        const dOut = P.crestEnd + ((P.crestY - y) / (P.crestY - ar.ground)) * (ar.bank.toe - P.crestEnd);
        const dIn = P.crestEnd + ((P.crestY - (y + (P.crestY - ar.ground) / steps)) / (P.crestY - ar.ground)) * (ar.bank.toe - P.crestEnd);
        const yTop = y + (P.crestY - ar.ground) / steps;
        acc.poly([at(Q(dIn, -1), yTop), at(Q(dIn, 1), yTop), at(Q(dOut, 1), yTop), at(Q(dOut, -1), yTop)], 'wood', ev, UP);
        acc.poly([at(Q(dOut, -1), y), at(Q(dOut, 1), y), at(Q(dOut, 1), yTop), at(Q(dOut, -1), yTop)], 'wood', ev, v3(dir[0], 0, dir[1]));
        for (const sg of [-1, 1]) acc.poly([at(Q(dIn, sg), yTop), at(Q(dOut, sg), yTop), at(Q(dOut, sg), y)], 'wood', ev, v3(sg * lat[0], 0, sg * lat[1]));
      }
    }
  }

  // -------- apron: level ground from the bank's toe out to the ground hole's edge
  if (ctx.apron) {
    const rect = ctx.apron;
    tag({ id: 'arena/apron', kind: 'bank', ref: ar.id, ev: evBank, note: 'Ground round the amphitheatre' });
    // toe boundary in angular order: each sector's toe points (ends on the passage walls' lines)
    const toe: UV[] = [];
    for (const s of sectors) for (let i = 0; i < s.fine.length; i++) toe.push(secPt(s, i, ar.bank.toe, s.fine));
    // rect corners as extra rays
    const ang = (p: UV): number => polarDeg(ar, p[0], p[1]);
    const rays = toe.map((p) => ({ a: ang(p), p }));
    for (const q of rect) {
      const a = ang(q);
      rays.push({ a, p: ringPoint(ar, a, ar.bank.toe) });
    }
    rays.sort((x, y) => x.a - y.a);
    /** Where the ray from the centre through p leaves the rectangle. */
    const hit = (p: UV): UV => {
      const du = p[0] - c[0], dv = p[1] - c[1];
      let best = Infinity;
      for (let i = 0; i < rect.length; i++) {
        const A = rect[i], B = rect[(i + 1) % rect.length];
        const eu = B[0] - A[0], ev2 = B[1] - A[1], den = du * ev2 - dv * eu;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((A[0] - c[0]) * ev2 - (A[1] - c[1]) * eu) / den, s = ((A[0] - c[0]) * dv - (A[1] - c[1]) * du) / den;
        if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) best = Math.min(best, t);
      }
      return [c[0] + du * best, c[1] + dv * best];
    };
    const y = ar.ground + 0.02;
    for (let i = 0; i < rays.length; i++) {
      const A = rays[i], B = rays[(i + 1) % rays.length];
      acc.poly([at(A.p, y), at(B.p, y), at(hit(B.p), y), at(hit(A.p), y)], 'grass', evBank, UP);
    }
  }
  smoothNormals(acc, earthFrom, earthTo);
}
