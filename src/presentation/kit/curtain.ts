import * as THREE from 'three';
import type { AtlasCell } from './atlas.js';
import type { Ev } from '../../domain/keyPlan.js';
import { FACE, WALL } from '../../domain/townWall.js';

// The town wall's section swept along a polyline: external plinth, outer face, crenellated parapet,
// wall-walk, inner face above the set-off, the set-off and the lower inner face (domain/townWall.ts
// WALL / FACE). Used by the curtain-wall generator (kit/townWall.ts) and by the gates' own stretches
// of wall (planBuilding, walls of kind 'curtain'), so both are the same section.
// Points are 2D (a, b) mapped to model space by `M`; `townLeft` says the town lies to the left of the
// path (left of direction (da, db) is (-db, da)). Heights are above each vertex's foot.

type Tint = Ev | 'N';
/** The part of planBuilding's accumulator used here. */
export interface CurtainAcc {
  poly(pts: THREE.Vector3[], cell: AtlasCell, ev: Tint, want?: THREE.Vector3): void;
}
export interface CurtainOpts {
  lod: 0 | 1 | 2;
  /** Facing cell for the wall faces. */
  mas: AtlasCell;
  /** How far the faces run below each foot (footings on sloping ground). */
  drop: number;
  /** Close the section at the path's start / end. */
  capA: boolean; capB: boolean;
  /** Evidence for the body (the section) and for the parapet and merlons. */
  ev: Ev; evParapet: Ev;
  /** Called per element as it is emitted (planBuilding tags picking ranges). */
  onPart?: (part: 'body' | 'parapet') => void;
}

const UP = new THREE.Vector3(0, 1, 0);

export function emitCurtain(acc: CurtainAcc, pts: Array<[number, number]>, foot: number[], townLeft: boolean,
  M: (a: number, b: number, y: number) => THREE.Vector3, o: CurtainOpts): void {
  const n = pts.length;
  if (n < 2) return;
  const sg = townLeft ? 1 : -1;
  // segment left normals and per-vertex mitres (offset per metre of d)
  const segL: Array<[number, number]> = [], segD: Array<[number, number]> = [];
  for (let i = 0; i < n - 1; i++) {
    const da = pts[i + 1][0] - pts[i][0], db = pts[i + 1][1] - pts[i][1], L = Math.hypot(da, db) || 1;
    segD.push([da / L, db / L]); segL.push([-db / L, da / L]);
  }
  const mit: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const l0 = segL[Math.max(0, i - 1)], l1 = segL[Math.min(n - 2, i)];
    let ma = l0[0] + l1[0], mb = l0[1] + l1[1];
    const ml = Math.hypot(ma, mb) || 1; ma /= ml; mb /= ml;
    const k = 1 / Math.max(0.5, ma * l1[0] + mb * l1[1]);
    mit.push([ma * k * sg, mb * k * sg]);
  }
  const P = (i: number, d: number, y: number): THREE.Vector3 => M(pts[i][0] + mit[i][0] * d, pts[i][1] + mit[i][1] * d, foot[i] + y);
  /** Horizontal direction (model space) of +d along segment i. */
  const dirD = (i: number): THREE.Vector3 => {
    const a = M(pts[i][0], pts[i][1], 0), b = M(pts[i][0] + segL[i][0] * sg, pts[i][1] + segL[i][1] * sg, 0);
    return b.sub(a).normalize();
  };
  const part = (p: 'body' | 'parapet'): void => o.onPart?.(p);
  // profile strips: [d0, y0] -> [d1, y1], facing
  type Strip = { a: [number, number]; b: [number, number]; face: 'out' | 'in' | 'up'; cell: AtlasCell | 'mas'; parapet?: boolean };
  const yb = -o.drop;
  const strips: Strip[] = [
    { a: [FACE.plinth, yb], b: [FACE.plinth, WALL.plinthY], face: 'out', cell: 'stone' },
    { a: [FACE.plinth, WALL.plinthY], b: [FACE.outer, WALL.plinthY], face: 'up', cell: 'stone' },
    { a: [FACE.outer, WALL.plinthY], b: [FACE.outer, WALL.walk], face: 'out', cell: 'mas' },
    { a: [FACE.outer, WALL.walk], b: [FACE.outer, WALL.breast], face: 'out', cell: 'mas', parapet: true },
    { a: [FACE.outer, WALL.breast], b: [FACE.parapetIn, WALL.breast], face: 'up', cell: 'stone', parapet: true },
    { a: [FACE.parapetIn, WALL.breast], b: [FACE.parapetIn, WALL.walk], face: 'in', cell: 'mas', parapet: true },
    { a: [FACE.parapetIn, WALL.walk], b: [FACE.innerUpper, WALL.walk], face: 'up', cell: 'stone' },
    { a: [FACE.innerUpper, WALL.walk], b: [FACE.innerUpper, WALL.setoffY], face: 'in', cell: 'mas' },
    { a: [FACE.innerUpper, WALL.setoffY], b: [FACE.innerLower, WALL.setoffY], face: 'up', cell: 'stone' },
    { a: [FACE.innerLower, WALL.setoffY], b: [FACE.innerLower, yb], face: 'in', cell: 'mas' },
  ];
  for (let i = 0; i < n - 1; i++) {
    const dd = dirD(i);
    for (const s of strips) {
      part(s.parapet ? 'parapet' : 'body');
      const want = s.face === 'up' ? UP : s.face === 'in' ? dd : dd.clone().negate();
      const cell = s.cell === 'mas' ? o.mas : s.cell;
      acc.poly([P(i, s.a[0], s.a[1]), P(i + 1, s.a[0], s.a[1]), P(i + 1, s.b[0], s.b[1]), P(i, s.b[0], s.b[1])], cell, s.parapet ? o.evParapet : o.ev, want);
    }
  }
  // end caps: the section as rectangles
  const cap = (i: number, sign: number): void => {
    const s = i === 0 ? 0 : n - 2;
    const along = M(pts[s + 1][0], pts[s + 1][1], 0).sub(M(pts[s][0], pts[s][1], 0)).normalize().multiplyScalar(sign);
    const rects: Array<[number, number, number, number, boolean]> = [
      [FACE.plinth, FACE.innerLower, yb, WALL.plinthY, false],
      [FACE.outer, FACE.innerLower, WALL.plinthY, WALL.setoffY, false],
      [FACE.outer, FACE.innerUpper, WALL.setoffY, WALL.walk, false],
      [FACE.outer, FACE.parapetIn, WALL.walk, WALL.breast, true],
    ];
    for (const [d0, d1, y0, y1, pp] of rects) {
      part(pp ? 'parapet' : 'body');
      acc.poly([P(i, d0, y0), P(i, d1, y0), P(i, d1, y1), P(i, d0, y1)], o.mas, pp ? o.evParapet : o.ev, along);
    }
  };
  if (o.capA) cap(0, -1);
  if (o.capB) cap(n - 1, 1);
  // merlons on the parapet, every merlon + crenel along each segment
  if (o.lod < 2) {
    part('parapet');
    const pitch = WALL.merlon + WALL.crenel;
    for (let i = 0; i < n - 1; i++) {
      const A = pts[i], B = pts[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const k = Math.floor((L - WALL.merlon) / pitch);
      if (k < 0) continue;
      const s0 = (L - (k * pitch + WALL.merlon)) / 2;
      const [da, db] = segD[i], [la, lb] = [segL[i][0] * sg, segL[i][1] * sg];
      const dd = dirD(i), al = M(A[0] + da, A[1] + db, 0).sub(M(A[0], A[1], 0)).normalize();
      for (let m = 0; m <= k; m++) {
        const sa = s0 + m * pitch, sb = sa + WALL.merlon;
        const fa = foot[i] + ((foot[i + 1] - foot[i]) * (sa + sb) / 2) / L;
        const Q = (s: number, d: number, y: number): THREE.Vector3 => M(A[0] + da * s + la * d, A[1] + db * s + lb * d, fa + y);
        const y0 = WALL.breast, y1 = WALL.top, d0 = FACE.outer, d1 = FACE.parapetIn;
        acc.poly([Q(sa, d0, y0), Q(sb, d0, y0), Q(sb, d0, y1), Q(sa, d0, y1)], o.mas, o.evParapet, dd.clone().negate());
        acc.poly([Q(sa, d1, y0), Q(sb, d1, y0), Q(sb, d1, y1), Q(sa, d1, y1)], o.mas, o.evParapet, dd);
        acc.poly([Q(sa, d0, y0), Q(sa, d1, y0), Q(sa, d1, y1), Q(sa, d0, y1)], o.mas, o.evParapet, al.clone().negate());
        acc.poly([Q(sb, d0, y0), Q(sb, d1, y0), Q(sb, d1, y1), Q(sb, d0, y1)], o.mas, o.evParapet, al);
        acc.poly([Q(sa, d0, y1), Q(sb, d0, y1), Q(sb, d1, y1), Q(sa, d1, y1)], 'stone', o.evParapet, UP);
      }
    }
  }
}

/** Merlons on top of an ordinary wall a -> b (a tower's parapet): `h` is the merlon top; the breastwork is 0.8 m lower. */
export function emitMerlons(acc: CurtainAcc, a: [number, number], b: [number, number], t: number, h: number,
  M: (a: number, b: number, y: number) => THREE.Vector3, mas: AtlasCell, ev: Ev): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) return;
  const da = (b[0] - a[0]) / L, db = (b[1] - a[1]) / L, la = -db, lb = da;
  const pitch = WALL.merlon + WALL.crenel, k = Math.floor((L + t - WALL.merlon) / pitch);
  if (k < 0) return;
  const s0 = -t / 2 + (L + t - (k * pitch + WALL.merlon)) / 2;
  const Q = (s: number, d: number, y: number): THREE.Vector3 => M(a[0] + da * s + la * d, a[1] + db * s + lb * d, y);
  const nL = Q(0, 1, 0).sub(Q(0, 0, 0)).normalize(), al = Q(1, 0, 0).sub(Q(0, 0, 0)).normalize();
  const y0 = h - (WALL.top - WALL.breast), y1 = h, d0 = -t / 2, d1 = t / 2;
  for (let m = 0; m <= k; m++) {
    const sa = s0 + m * pitch, sb = sa + WALL.merlon;
    acc.poly([Q(sa, d0, y0), Q(sb, d0, y0), Q(sb, d0, y1), Q(sa, d0, y1)], mas, ev, nL.clone().negate());
    acc.poly([Q(sa, d1, y0), Q(sb, d1, y0), Q(sb, d1, y1), Q(sa, d1, y1)], mas, ev, nL);
    acc.poly([Q(sa, d0, y0), Q(sa, d1, y0), Q(sa, d1, y1), Q(sa, d0, y1)], mas, ev, al.clone().negate());
    acc.poly([Q(sb, d0, y0), Q(sb, d1, y0), Q(sb, d1, y1), Q(sb, d0, y1)], mas, ev, al);
    acc.poly([Q(sa, d0, y1), Q(sb, d0, y1), Q(sb, d1, y1), Q(sa, d1, y1)], 'stone', ev, UP);
  }
}
