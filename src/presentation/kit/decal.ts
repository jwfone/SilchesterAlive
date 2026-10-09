import * as THREE from 'three';

// Helpers for ground decals (roads, footprint overlay, water, contact shadows): flat triangle meshes
// with a position and uv attribute that lie on the terrain a few centimetres up.

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

type P = { x: number; z: number; u: number; v: number };

/** Edge length (m) below which a triangle on a rectangle's border is kept or dropped whole. */
const MIN_EDGE = 1.2;
const MAX_DEPTH = 6;
const EPS = 1e-6;

/**
 * Cut rectangles out of a flat (x, z) triangle mesh: triangles wholly inside a rectangle are dropped,
 * those crossing its border are split until small, then kept or dropped by their centre. Used to keep
 * ground decals (roads) out of key buildings' floors. Returns null when nothing is left. Triangles
 * clear of every rectangle pass through unchanged.
 */
export function carveRects(src: THREE.BufferGeometry, rects: Rect[]): THREE.BufferGeometry | null {
  const g = src.index ? src.toNonIndexed() : src;
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const outPos: number[] = [], outUv: number[] = [];
  type V = P & { y: number };
  const inside = (r: Rect, x: number, z: number): boolean => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
  const mid = (a: V, b: V): V => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 });
  const emit = (t: V[]): void => { for (const p of t) { outPos.push(p.x, p.y, p.z); outUv.push(p.u, p.v); } };
  const visit = (a: V, b: V, c: V, depth: number): void => {
    const x0 = Math.min(a.x, b.x, c.x), x1 = Math.max(a.x, b.x, c.x), z0 = Math.min(a.z, b.z, c.z), z1 = Math.max(a.z, b.z, c.z);
    const hit = rects.filter((r) => x1 > r.minX && x0 < r.maxX && z1 > r.minZ && z0 < r.maxZ);
    if (!hit.length) { emit([a, b, c]); return; }
    if (hit.some((r) => inside(r, a.x, a.z) && inside(r, b.x, b.z) && inside(r, c.x, c.z))) return;
    const longest = Math.max(Math.hypot(a.x - b.x, a.z - b.z), Math.hypot(b.x - c.x, b.z - c.z), Math.hypot(c.x - a.x, c.z - a.z));
    if (longest <= MIN_EDGE || depth >= MAX_DEPTH) {
      const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
      if (!hit.some((r) => inside(r, cx, cz))) emit([a, b, c]);
      return;
    }
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    visit(a, ab, ca, depth + 1); visit(ab, b, bc, depth + 1); visit(ca, bc, c, depth + 1); visit(ab, bc, ca, depth + 1);
  };
  for (let i = 0; i < pos.count; i += 3) {
    const p = (k: number): V => ({ x: pos.getX(i + k), y: pos.getY(i + k), z: pos.getZ(i + k), u: uv.getX(i + k), v: uv.getY(i + k) });
    visit(p(0), p(1), p(2), 0);
  }
  if (g !== src) g.dispose();
  if (!outPos.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
  return out;
}

/** Split a convex polygon by the line f = 0 into its negative and positive sides (either may be empty). */
function cut(poly: P[], f: (p: P) => number): [P[], P[]] {
  const d = poly.map(f);
  if (d.every((v) => v >= -EPS)) return [[], poly];
  if (d.every((v) => v <= EPS)) return [poly, []];
  const neg: P[] = [], posi: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = d[i], db = d[(i + 1) % poly.length];
    if (Math.abs(da) <= EPS) { neg.push(a); posi.push(a); } else (da < 0 ? neg : posi).push(a);
    if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
      const t = da / (da - db);
      const m: P = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t };
      neg.push(m); posi.push(m);
    }
  }
  return [neg, posi];
}

/** A decal may stray this far (m) under its lift before it is cut to fit the ground: it then stays above ground by at least `MARGIN`. */
const MARGIN = 0.01;

/** True when the flat triangle through the ground heights at its corners stays within `tol` of the ground. */
function staysOnGround(tri: P[], ground: (x: number, z: number) => number, tol: number): boolean {
  const [a, b, c] = tri, ya = ground(a.x, a.z), yb = ground(b.x, b.z), yc = ground(c.x, c.z);
  const n = 4;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; i + j <= n; j++) {
      const wb = i / n, wc = j / n, wa = 1 - wb - wc;
      if (wa > 0.999 || wb > 0.999 || wc > 0.999) continue;
      const x = a.x * wa + b.x * wb + c.x * wc, z = a.z * wa + b.z * wb + c.z * wc;
      if (Math.abs(ya * wa + yb * wb + yc * wc - ground(x, z)) > tol) return false;
    }
  }
  return true;
}

/**
 * Lay a flat (x, z) triangle mesh on the ground `lift` metres above it. Triangles that would stray
 * from the ground are cut along the terrain's own grid lines and cell diagonals, so every piece lies inside one flat terrain triangle
 * and, draped vertex by vertex, matches it exactly: a decal a few centimetres up never dips under a
 * slope or hovers over a hollow. UVs are interpolated through the cuts. `grid` is the terrain
 * surface's line coordinates (the same set for x and z).
 */
export function drapeOnGround(src: THREE.BufferGeometry, ground: (x: number, z: number) => number, lift: number, grid: number[]): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src;
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const outPos: number[] = [], outUv: number[] = [];
  const firstAbove = (v: number): number => {
    let lo = 0, hi = grid.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (grid[mid] <= v) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const splitAlong = (poly: P[], axis: 'x' | 'z'): P[][] => {
    const vals = poly.map((p) => p[axis]);
    let pieces: P[][] = [poly];
    for (let k = firstAbove(Math.min(...vals)); k < grid.length && grid[k] < Math.max(...vals); k++) {
      const line = grid[k], next: P[][] = [];
      for (const q of pieces) {
        const [n, p2] = cut(q, (p) => p[axis] - line);
        if (n.length >= 3) next.push(n);
        if (p2.length >= 3) next.push(p2);
      }
      pieces = next;
    }
    return pieces;
  };
  const emit = (poly: P[]): void => {
    for (let i = 1; i < poly.length - 1; i++) {
      for (const p of [poly[0], poly[i], poly[i + 1]]) { outPos.push(p.x, ground(p.x, p.z) + lift, p.z); outUv.push(p.u, p.v); }
    }
  };
  for (let i = 0; i < pos.count; i += 3) {
    const tri: P[] = [0, 1, 2].map((k) => ({ x: pos.getX(i + k), z: pos.getZ(i + k), u: uv.getX(i + k), v: uv.getY(i + k) }));
    if (staysOnGround(tri, ground, lift - MARGIN)) { emit(tri); continue; }
    // Cut along every x line, then every z line: each piece then lies in one grid cell.
    for (const poly of splitAlong(tri, 'x').flatMap((q) => splitAlong(q, 'z'))) {
      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length, cz = poly.reduce((s, p) => s + p.z, 0) / poly.length;
      const ci = Math.min(grid.length - 2, Math.max(0, firstAbove(cx) - 1)), cj = Math.min(grid.length - 2, Math.max(0, firstAbove(cz) - 1));
      const x0 = grid[ci], x1 = grid[ci + 1], z0 = grid[cj], z1 = grid[cj + 1];
      // ...and the cell's diagonal (the terrain mesh splits each cell along (x0,z1)-(x1,z0)).
      const [a, b] = cut(poly, (p) => (p.x - x0) / (x1 - x0) + (p.z - z0) / (z1 - z0) - 1);
      if (a.length >= 3) emit(a);
      if (b.length >= 3) emit(b);
    }
  }
  if (g !== src) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
  return out;
}
