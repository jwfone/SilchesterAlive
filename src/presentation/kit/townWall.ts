import * as THREE from 'three';
import { Acc } from './planBuilding.js';
import { emitCurtain } from './curtain.js';
import { COUNTERFORT, DITCH, FACE, RAMPART, REACH, WALL, earthworkOffset, runSlice, type TownWall, type XZ } from '../../domain/townWall.js';

// The town wall's circuit between the gates (the gates themselves are plan-built key buildings):
// the wall's section along each run, counterforts with steps up from the rampart, the earth rampart
// and the ditch as a 2.5 m grid of ground in front of and behind it, and timber bridges where the
// ditch ran on across a gate. One merged mesh for the tiled material (one draw), with evidence
// colours. World coordinates (x east, z south). Evidence: docs/key-buildings/town-walls.md.

export interface WallPoly { outline: XZ[]; minX: number; maxX: number; minZ: number; maxZ: number; top: number }
export interface BuiltTownWall {
  geometry: THREE.BufferGeometry; tris: number;
  /** Colliders: the wall's body (top at the walk), the parapet (top of the merlons), counterforts, bridge rails. */
  polys: WallPoly[];
  /** Grid quads [x0, z0, x1, z1] whose ground lies in the ditch (the drawn terrain is hidden there). */
  ditchQuads: Array<[number, number, number, number]>;
  /** Walkable bridge decks: height at (x, z) or undefined. */
  bridgeDeckAt: (x: number, z: number) => number | undefined;
  /** Triangles in the wall (section, merlons, counterforts) and in the earthworks. */
  trisWall: number; trisEarth: number;
}

const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
/** Earthwork grid spacing (m). */
export const EARTH_GRID = 2.5;
/** Longest piece of wall between feet that follow the ground. */
const PIECE = 8;

function polyOf(pts: XZ[], top: number): WallPoly {
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  return { outline: pts, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), top };
}

/** `ground`: the levelled terrain without the earthworks (the wall's foot, the ditch's lips); `raised`: how much of
 * that is local levelling above the drawn terrain grid (at the gates), which this mesh draws too. */
export function buildTownWallMesh(tw: TownWall, ground: (x: number, z: number) => number, opts: { lod?: 0 | 1 | 2; raised?: (x: number, z: number) => number; facing?: 'flint' | 'flintLime' } = {}): BuiltTownWall {
  const lod = opts.lod ?? 0;
  const acc = new Acc(true);
  const W = (x: number, z: number, y: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const polys: WallPoly[] = [];

  // ---------------- the wall along each run
  const runs = new Map<number, typeof tw.segs>();
  for (const s of tw.segs) if (s.kind === 'run') { const l = runs.get(s.run); if (l) l.push(s); else runs.set(s.run, [s]); }
  for (const segs of runs.values()) {
    segs.sort((a, b) => a.seg - b.seg);
    const pts: Array<[number, number]> = [[segs[0].ax, segs[0].az]];
    for (const g of segs) {
      const k = Math.max(1, Math.ceil(g.len / PIECE));
      for (let j = 1; j <= k; j++) pts.push([g.ax + (g.bx - g.ax) * (j / k), g.az + (g.bz - g.az) * (j / k)]);
    }
    const foot = pts.map(([x, z]) => ground(x, z));
    const g0 = segs[0], townLeft = (-g0.dz) * g0.nx + g0.dx * g0.nz > 0;
    emitCurtain(acc, pts, foot, townLeft, W, { lod, mas: opts.facing ?? 'flintLime', drop: 0.8, capA: false, capB: false, ev: 'S', evParapet: 'C' });
    // colliders per piece: the body up to the walk, the parapet up to the merlons
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az) || 1;
      const lx = (-(bz - az) / L) * (townLeft ? 1 : -1), lz = ((bx - ax) / L) * (townLeft ? 1 : -1);
      const ring = (d0: number, d1: number): XZ[] => [
        { x: ax + lx * d0, z: az + lz * d0 }, { x: bx + lx * d0, z: bz + lz * d0 }, { x: bx + lx * d1, z: bz + lz * d1 }, { x: ax + lx * d1, z: az + lz * d1 }];
      const fy = Math.min(foot[i], foot[i + 1]);
      polys.push(polyOf(ring(FACE.plinth, FACE.innerUpper), fy + WALL.walk));
      polys.push(polyOf(ring(FACE.outer, FACE.parapetIn), fy + WALL.top));
    }
  }
  // ---------------- counterforts (swept along the wall line, so they bend with it) and their steps
  const cm = opts.facing ?? 'flintLime';
  for (const c of tw.counterforts) {
    const sl = runSlice(tw, c.run, c.s - c.len / 2, c.s + c.len / 2);
    if (sl.length < 2) continue;
    const foot = sl.map((p) => ground(p.x, p.z));
    const Q = (i: number, d: number, y: number): THREE.Vector3 => W(sl[i].x + sl[i].nx * d, sl[i].z + sl[i].nz * d, foot[i] + y);
    const d0 = FACE.innerUpper, d1 = FACE.innerLower, y0 = WALL.setoffY, y1 = WALL.walk;
    for (let i = 0; i + 1 < sl.length; i++) {
      const n = new THREE.Vector3(sl[i].nx, 0, sl[i].nz).normalize();
      acc.poly([Q(i, d1, y0), Q(i + 1, d1, y0), Q(i + 1, d1, y1), Q(i, d1, y1)], cm, c.ev, n);
      acc.poly([Q(i, d0, y1), Q(i + 1, d0, y1), Q(i + 1, d1, y1), Q(i, d1, y1)], 'stone', c.ev, UP);
      const ring = [Q(i, d0, 0), Q(i + 1, d0, 0), Q(i + 1, d1, 0), Q(i, d1, 0)].map((p) => ({ x: p.x, z: p.z }));
      polys.push(polyOf(ring, Math.min(foot[i], foot[i + 1]) + WALL.walk));
    }
    for (const [i, sg] of [[0, -1], [sl.length - 1, 1]] as const) {
      const al = Q(Math.min(i + 1, sl.length - 1), 0, 0).sub(Q(Math.max(i - 1, 0), 0, 0)).normalize().multiplyScalar(sg);
      acc.poly([Q(i, d0, y0), Q(i, d1, y0), Q(i, d1, y1), Q(i, d0, y1)], cm, c.ev, al);
    }
    if (!c.stairs) continue;
    // steps from the rampart's crest up onto the counterfort (conjecture), square to the wall at its middle
    const [cx, cz] = c.at, [nx, nz] = c.n, ax = -nz, az = nx, fy = ground(cx, cz);
    const S = (sv: number, d: number, y: number): THREE.Vector3 => W(cx + ax * sv + nx * d, cz + az * sv + nz * d, fy + y);
    const n = new THREE.Vector3(nx, 0, nz), alv = new THREE.Vector3(ax, 0, az);
    const sw = COUNTERFORT.stairW / 2, steps = 6, run = COUNTERFORT.stairTo - FACE.innerLower, rise = (WALL.walk - RAMPART.crest) / steps;
    for (let k = 0; k < steps; k++) {
      const dA = COUNTERFORT.stairTo - (k + 1) * (run / steps), dB = COUNTERFORT.stairTo - k * (run / steps);
      const yT = RAMPART.crest + (k + 1) * rise, yR = RAMPART.crest + k * rise;
      acc.poly([S(-sw, dA, yT), S(sw, dA, yT), S(sw, dB, yT), S(-sw, dB, yT)], 'stone', 'X', UP);
      acc.poly([S(-sw, dB, yR), S(sw, dB, yR), S(sw, dB, yT), S(-sw, dB, yT)], 'stone', 'X', n);
      for (const sv of [-sw, sw]) acc.poly([S(sv, dA, RAMPART.crest), S(sv, dB, RAMPART.crest), S(sv, dB, yT), S(sv, dA, yT)], 'stone', 'X', alv.clone().multiplyScalar(Math.sign(sv)));
    }
  }
  const trisWall = acc.pos.length / 9;

  // ---------------- earthworks: rampart (above the ground) and ditch (below it) on a 2.5 m grid
  const ditchQuads: Array<[number, number, number, number]> = [];
  {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const s of tw.segs) { x0 = Math.min(x0, s.ax, s.bx); x1 = Math.max(x1, s.ax, s.bx); z0 = Math.min(z0, s.az, s.bz); z1 = Math.max(z1, s.az, s.bz); }
    const pad = Math.max(REACH.inside, REACH.outside) + EARTH_GRID * 2;
    x0 = Math.floor((x0 - pad) / EARTH_GRID) * EARTH_GRID; z0 = Math.floor((z0 - pad) / EARTH_GRID) * EARTH_GRID;
    const nx = Math.ceil((x1 + pad - x0) / EARTH_GRID) + 1, nz = Math.ceil((z1 + pad - z0) / EARTH_GRID) + 1;
    const off = new Float32Array(nx * nz), gyv = new Float32Array(nx * nz), rz = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * EARTH_GRID, z = z0 + j * EARTH_GRID;
      const n = tw.nearest(x, z);
      const near = n && Math.abs(n.d) <= pad;
      off[j * nx + i] = near ? earthworkOffset(tw, x, z) : 0;
      if (near) { gyv[j * nx + i] = ground(x, z); rz[j * nx + i] = opts.raised?.(x, z) ?? 0; }
    }
    const E = 0.004;
    for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
      const k00 = j * nx + i, k10 = k00 + 1, k01 = k00 + nx, k11 = k01 + 1;
      const o = [off[k00], off[k10], off[k11], off[k01]], lifted = [rz[k00], rz[k10], rz[k11], rz[k01]];
      if (o.every((v) => Math.abs(v) < E) && lifted.every((v) => v < E)) continue;
      const xa = x0 + i * EARTH_GRID, za = z0 + j * EARTH_GRID, xb = xa + EARTH_GRID, zb = za + EARTH_GRID;
      const ditch = o.some((v) => v < -E);
      // over the ditch the drawn ground is hidden (WorldBuilder's mask) and the quads' outer corners sit 2 cm above it, so
      // no crack opens along the join; elsewhere zero-offset corners sit 3 cm under it,
      // so the two never fight at the edges
      const y = (k: number, ov: number): number => gyv[k] + (Math.abs(ov) < E && rz[k] < E ? (ditch ? 0.02 : -0.03) : ov);
      acc.poly([W(xa, za, y(k00, o[0])), W(xb, za, y(k10, o[1])), W(xb, zb, y(k11, o[2])), W(xa, zb, y(k01, o[3]))], 'grass', 'S', UP);
      if (ditch) ditchQuads.push([xa, za, xb, zb]);
    }
  }
  // the rampart's crest as a strip along each run, from the wall's inner face out across the flat top: the 2.5 m grid alone
  // cannot follow the face, and left the bank short of the wall where a grid cell straddled it. 2 cm over the grid there.
  {
    const d0 = FACE.innerUpper, d1 = FACE.innerLower + RAMPART.crestW, STEP = 2;
    for (const run of new Set(tw.segs.filter((g) => g.kind === 'run').map((g) => g.run))) {
      const segs = tw.segs.filter((g) => g.kind === 'run' && g.run === run);
      const len = segs.reduce((m, g) => Math.max(m, g.s0 + g.len), 0);
      const base = runSlice(tw, run, 0, len), pts: typeof base = [];
      for (let i = 0; i + 1 < base.length; i++) {
        // between two vertices the normal is that piece's own
        const a = base[i], b = base[i + 1], k = Math.max(1, Math.ceil((b.s - a.s) / STEP));
        const g = segs.find((q) => (a.s + b.s) / 2 >= q.s0 && (a.s + b.s) / 2 <= q.s0 + q.len) ?? segs[0];
        pts.push(a);
        for (let j = 1; j < k; j++) { const t = j / k; pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: g.nx, nz: g.nz, s: a.s + (b.s - a.s) * t }); }
      }
      pts.push(base[base.length - 1]);
      const h = pts.map((p) => earthworkOffset(tw, p.x + p.nx * (d0 + d1) / 2, p.z + p.nz * (d0 + d1) / 2));
      const V = (i: number, d: number): THREE.Vector3 => { const x = pts[i].x + pts[i].nx * d, z = pts[i].z + pts[i].nz * d; return W(x, z, ground(x, z) + h[i] + 0.02); };
      for (let i = 0; i + 1 < pts.length; i++) {
        if (h[i] < 0.3 && h[i + 1] < 0.3) continue; // no bank here (a minor gate's passage)
        acc.poly([V(i, d0), V(i + 1, d0), V(i + 1, d1), V(i, d1)], 'grass', 'S', UP);
      }
    }
  }
  const trisEarth = acc.pos.length / 9 - trisWall;

  // ---------------- bridges over the ditch (timber, conjecture): west, Lesser West and amphitheatre gates
  const decks: Array<{ c: XZ; out: XZ; along: XZ; s0: number; s1: number; y0: number; y1: number; half: number }> = [];
  for (const g of tw.gates.filter((x) => x.crossing === 'bridge')) {
    const s0 = -FACE.outer + DITCH.from - 1.2, s1 = -FACE.outer + DITCH.from + DITCH.width + 1.2, half = 1.8, th = 0.25;
    const at = (s: number, l: number): XZ => ({ x: g.centre.x + g.out.x * s + g.along.x * l, z: g.centre.z + g.out.z * s + g.along.z * l });
    const p0 = at(s0, 0), p1 = at(s1, 0);
    const y0 = ground(p0.x, p0.z) + th, y1 = ground(p1.x, p1.z) + th;
    decks.push({ c: g.centre, out: g.out, along: g.along, s0, s1, y0, y1, half });
    const Y = (s: number): number => y0 + ((y1 - y0) * (s - s0)) / (s1 - s0);
    const V = (s: number, l: number, dy: number): THREE.Vector3 => { const p = at(s, l); return W(p.x, p.z, Y(s) + dy); };
    const out = new THREE.Vector3(g.out.x, 0, g.out.z), al = new THREE.Vector3(g.along.x, 0, g.along.z);
    acc.poly([V(s0, -half, 0), V(s1, -half, 0), V(s1, half, 0), V(s0, half, 0)], 'wood', 'X', UP);
    acc.poly([V(s0, -half, -th), V(s1, -half, -th), V(s1, half, -th), V(s0, half, -th)], 'wood', 'X', DOWN);
    for (const l of [-half, half]) acc.poly([V(s0, l, -th), V(s1, l, -th), V(s1, l, 0), V(s0, l, 0)], 'wood', 'X', al.clone().multiplyScalar(Math.sign(l)));
    /** Upright timber r half-width at (s, l), from `yA` to `yB` (absolute heights). */
    const post = (s: number, l: number, r: number, yA: number, yB: number): void => {
      const C = (ds: number, dl: number, y: number): THREE.Vector3 => { const q = at(s + ds, l + dl); return W(q.x, q.z, y); };
      acc.poly([C(-r, -r, yA), C(-r, r, yA), C(-r, r, yB), C(-r, -r, yB)], 'wood', 'X', out.clone().negate());
      acc.poly([C(r, -r, yA), C(r, r, yA), C(r, r, yB), C(r, -r, yB)], 'wood', 'X', out);
      acc.poly([C(-r, -r, yA), C(r, -r, yA), C(r, -r, yB), C(-r, -r, yB)], 'wood', 'X', al.clone().negate());
      acc.poly([C(-r, r, yA), C(r, r, yA), C(r, r, yB), C(-r, r, yB)], 'wood', 'X', al);
    };
    // rails on posts
    for (const l of [-half + 0.08, half - 0.08]) {
      const n = Math.ceil((s1 - s0) / 2.4);
      for (let k = 0; k <= n; k++) { const s = s0 + ((s1 - s0) * k) / n; post(s, l, 0.07, Y(s), Y(s) + 1.0); }
      acc.poly([V(s0, l - 0.06, 1.0), V(s1, l - 0.06, 1.0), V(s1, l + 0.06, 1.0), V(s0, l + 0.06, 1.0)], 'wood', 'X', UP);
      acc.poly([V(s0, l, 0.9), V(s1, l, 0.9), V(s1, l, 1.0), V(s0, l, 1.0)], 'wood', 'X', al.clone().multiplyScalar(Math.sign(l)));
      const a = at(s0, l), b = at(s1, l), t = 0.12;
      polys.push(polyOf([{ x: a.x - g.along.x * t, z: a.z - g.along.z * t }, { x: b.x - g.along.x * t, z: b.z - g.along.z * t }, { x: b.x + g.along.x * t, z: b.z + g.along.z * t }, { x: a.x + g.along.x * t, z: a.z + g.along.z * t }], Math.max(y0, y1) + 1.0));
    }
    // two trestles in the ditch
    for (const f of [0.36, 0.64]) {
      const s = s0 + (s1 - s0) * f;
      for (const l of [-half + 0.3, half - 0.3]) {
        const p = at(s, l);
        post(s, l, 0.13, ground(p.x, p.z) + earthworkOffset(tw, p.x, p.z) - 0.1, Y(s) - th);
      }
    }
  }
  const bridgeDeckAt = (x: number, z: number): number | undefined => {
    for (const b of decks) {
      const rx = x - b.c.x, rz = z - b.c.z, s = rx * b.out.x + rz * b.out.z, l = rx * b.along.x + rz * b.along.z;
      if (s >= b.s0 && s <= b.s1 && Math.abs(l) <= b.half) return b.y0 + ((b.y1 - b.y0) * (s - b.s0)) / (b.s1 - b.s0);
    }
    return undefined;
  };

  const geometry = acc.build();
  return { geometry, tris: acc.pos.length / 9, polys, ditchQuads, bridgeDeckAt, trisWall, trisEarth };
}
