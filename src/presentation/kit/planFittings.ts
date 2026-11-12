import * as THREE from 'three';
import type { AtlasCell } from './atlas.js';
import type { BuildingPlan, Ev, PlanFitting, UV } from '../../domain/keyPlan.js';
import type { Acc, Lod, PlanElement, PlanFootprint } from './planBuilding.js';

// Furniture and sculpture in a plan-built building (plan.fittings; the temples' cellae and altars, see
// docs/key-buildings/temples.md "Inside the cellae"). Each fitting is built in its own frame: x to its right, y up,
// z forward (along `facing`), then placed at `at` on its floor `y0`. Interior pieces draw at the walkable level of
// detail only; altars, outdoors, at lod 0 and 1. Pedestals, tables and altars are collision boxes; plaques are not.

type V3 = THREE.Vector3;
type P3 = [number, number, number];
const v3 = (u: number, y: number, v: number): V3 => new THREE.Vector3(u, y, -v); // as planBuilding's v3
/** One ring of a lathe: height y, half-widths rx (across) and rz (front to back), centred at (cx, cz). */
interface Ring { y: number; rx: number; rz: number; cx?: number; cz?: number }

class Frame {
  private readonly fu: number; private readonly fv: number; private readonly ru: number; private readonly rv: number;
  constructor(readonly acc: Acc, readonly f: PlanFitting) {
    const a = (f.facing * Math.PI) / 180;
    this.fu = Math.cos(a); this.fv = Math.sin(a); this.ru = Math.sin(a); this.rv = -Math.cos(a);
  }
  P(x: number, y: number, z: number): V3 {
    const [u, v] = this.f.at;
    return v3(u + this.ru * x + this.fu * z, (this.f.y0 ?? 0) + y, v + this.rv * x + this.fv * z);
  }
  get ev(): Ev { return this.f.ev ?? 'X'; }
  /** A local direction in model space. */
  D(x: number, y: number, z: number): V3 { return this.P(x, y, z).sub(this.P(0, 0, 0)); }
  /** A box in the local frame (no bottom); `front` gives the +z face its own cell, laid 0..1 across it (fit). */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, cell: AtlasCell, front?: AtlasCell): void {
    const c = this.P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const Q = (x: number, y: number, z: number): V3 => this.P(x, y, z);
    const faces: Array<[V3[], boolean]> = [
      [[Q(x0, y0, z1), Q(x1, y0, z1), Q(x1, y1, z1), Q(x0, y1, z1)], true],
      [[Q(x0, y0, z0), Q(x1, y0, z0), Q(x1, y1, z0), Q(x0, y1, z0)], false],
      [[Q(x0, y0, z0), Q(x0, y0, z1), Q(x0, y1, z1), Q(x0, y1, z0)], false],
      [[Q(x1, y0, z0), Q(x1, y0, z1), Q(x1, y1, z1), Q(x1, y1, z0)], false],
      [[Q(x0, y1, z0), Q(x1, y1, z0), Q(x1, y1, z1), Q(x0, y1, z1)], false],
    ];
    for (const [f, isFront] of faces) {
      const m = f.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(1 / 4);
      this.acc.poly(f, isFront && front ? front : cell, this.ev, m.sub(c), isFront && !!front);
    }
  }
  /** Surface of revolution through rings (elliptical sections), n sides; `fold` ripples the outline (drapery). */
  lathe(rings: Ring[], n: number, cell: AtlasCell, cap = true, fold: (y: number) => number = () => 0): void {
    const pt = (r: Ring, i: number): V3 => {
      const t = (i / n) * Math.PI * 2, k = 1 + fold(r.y) * Math.cos(7 * t);
      return this.P((r.cx ?? 0) + r.rx * k * Math.cos(t), r.y, (r.cz ?? 0) + r.rz * k * Math.sin(t));
    };
    // smooth normals: the ellipse's own normal, turned by the folds' slope, tilted by the profile's slope (central difference)
    const nm = (j: number, i: number): V3 => {
      const r = rings[j], t = (i / n) * Math.PI * 2, a = fold(r.y), k = 1 + a * Math.cos(7 * t);
      const lo = rings[Math.max(0, j - 1)], hi = rings[Math.min(rings.length - 1, j + 1)];
      const slope = (Math.max(lo.rx, lo.rz) - Math.max(hi.rx, hi.rz)) / Math.max(1e-3, hi.y - lo.y);
      const tw = (7 * a * Math.sin(7 * t)) / k;
      const nx = r.rz * Math.cos(t) - tw * Math.sin(t) * r.rx, nz = r.rx * Math.sin(t) + tw * Math.cos(t) * r.rz;
      const h = Math.hypot(nx, nz) || 1;
      return this.D(nx / h, slope, nz / h);
    };
    for (let j = 0; j + 1 < rings.length; j++) {
      const a = rings[j], b = rings[j + 1];
      for (let i = 0; i < n; i++) {
        this.acc.polyN([pt(a, i), pt(a, i + 1), pt(b, i + 1), pt(b, i)], [nm(j, i), nm(j, i + 1), nm(j + 1, i + 1), nm(j + 1, i)], cell, this.ev);
      }
    }
    const top = rings[rings.length - 1];
    if (cap && top.rx > 1e-4) {
      const ring: V3[] = [];
      for (let i = 0; i < n; i++) ring.push(pt({ ...top, rx: top.rx, rz: top.rz }, i));
      this.acc.poly(ring, cell, this.ev, new THREE.Vector3(0, 1, 0));
    }
  }
  /** A round tube from p0 (radius r0) to p1 (r1), n sides, capped at p1 (an arm, a bolster). */
  tube(p0: P3, p1: P3, r0: number, r1: number, n: number, cell: AtlasCell, capBoth = false): void {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), ax = b.clone().sub(a).normalize();
    const ref = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(ax, ref).normalize(), e2 = new THREE.Vector3().crossVectors(ax, e1);
    const L = (p: V3): V3 => this.P(p.x, p.y, p.z);
    const at = (c: V3, r: number, t: number): V3 => c.clone().addScaledVector(e1, r * Math.cos(t)).addScaledVector(e2, r * Math.sin(t));
    const N = (t: number): V3 => L(at(a, 1, t)).sub(L(a));
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
      this.acc.polyN([at(a, r0, t0), at(a, r0, t1), at(b, r1, t1), at(b, r1, t0)].map(L), [N(t0), N(t1), N(t1), N(t0)], cell, this.ev);
    }
    const capAt = (c: V3, r: number, dir: V3): void => {
      const ring: V3[] = [];
      for (let i = 0; i < n; i++) ring.push(L(at(c, r, (i / n) * Math.PI * 2)));
      this.acc.poly(ring, cell, this.ev, L(c.clone().add(dir)).sub(L(c)));
    };
    capAt(b, r1, ax);
    if (capBoth) capAt(a, r0, ax.clone().negate());
  }
}

/** Collision box of a fitting: its w x d rectangle, h above the plan's floor. */
function footprintOf(f: PlanFitting, w: number, d: number, h: number): PlanFootprint {
  const a = (f.facing * Math.PI) / 180, fu = Math.cos(a), fv = Math.sin(a);
  const [u, v] = f.at;
  return { kind: 'box', a: [u - fu * d / 2, v - fv * d / 2] as UV, b: [u + fu * d / 2, v + fv * d / 2] as UV, t: w, h: (f.y0 ?? 0) + h };
}

/** A draped standing figure `H` tall, standing at local height y (the deity unknown: no attributes but an offering dish). */
function figure(F: Frame, y: number, H: number, cell: AtlasCell): void {
  const R = (yy: number, rx: number, rz: number, cx = 0, cz = 0): Ring => ({ y: y + yy * H, rx: rx * H, rz: rz * H, cx: cx * H, cz: cz * H });
  F.box(-0.2 * H, 0.2 * H, y, y + 0.04 * H, -0.14 * H, 0.14 * H, cell);                // its own plinth, carved with it
  // body in a long garment and mantle, folds below the waist (fluting fading upwards)
  const waist = y + 0.6 * H;
  F.lathe([R(0.04, 0.15, 0.11), R(0.08, 0.14, 0.1), R(0.25, 0.125, 0.09), R(0.42, 0.12, 0.085), R(0.52, 0.115, 0.08),
    R(0.6, 0.105, 0.072), R(0.7, 0.115, 0.075), R(0.78, 0.125, 0.07), R(0.81, 0.11, 0.065), R(0.835, 0.05, 0.045),
    R(0.86, 0.036, 0.038)], 20, cell, false, (yy) => (yy < waist ? 0.06 * Math.sqrt((waist - yy) / (0.56 * H)) : 0));
  // head
  F.lathe([R(0.85, 0.036, 0.04, 0, 0.006), R(0.875, 0.048, 0.054, 0, 0.006), R(0.905, 0.054, 0.06, 0, 0.006),
    R(0.935, 0.052, 0.058, 0, 0.006), R(0.96, 0.044, 0.05, 0, 0.004), R(0.98, 0.03, 0.034, 0, 0.002), R(0.993, 0.012, 0.014)], 14, cell);
  F.box(-0.009 * H, 0.009 * H, y + 0.895 * H, y + 0.93 * H, 0.05 * H, 0.074 * H, cell);   // nose
  const p = (x: number, yy: number, z: number): P3 => [x * H, y + yy * H, z * H];
  // right arm forward, holding out a dish (patera); left arm down, a fold of the mantle hanging from the forearm
  F.tube(p(0.105, 0.79, 0), p(0.135, 0.6, 0.02), 0.036 * H, 0.03 * H, 8, cell);
  F.tube(p(0.135, 0.6, 0.02), p(0.12, 0.585, 0.2), 0.03 * H, 0.023 * H, 8, cell);
  F.lathe([R(0.578, 0.02, 0.02, 0.12, 0.235), R(0.59, 0.05, 0.05, 0.12, 0.235), R(0.598, 0.056, 0.056, 0.12, 0.235)], 14, cell);
  F.tube(p(-0.105, 0.79, 0), p(-0.13, 0.6, -0.01), 0.036 * H, 0.03 * H, 8, cell);
  F.tube(p(-0.13, 0.6, -0.01), p(-0.115, 0.48, 0.06), 0.03 * H, 0.024 * H, 8, cell);
  F.lathe([R(0.3, 0.032, 0.022, -0.112, 0.05), R(0.4, 0.045, 0.028, -0.115, 0.05), R(0.5, 0.04, 0.03, -0.115, 0.045)], 10, cell);
}

/** A small oil lamp (body, nozzle) at local (x, z) on a surface at height y, its nozzle forward. */
function lamp(F: Frame, x: number, y: number, z: number): void {
  F.lathe([{ y, rx: 0.03, rz: 0.03, cx: x, cz: z }, { y: y + 0.015, rx: 0.04, rz: 0.04, cx: x, cz: z },
    { y: y + 0.03, rx: 0.035, rz: 0.035, cx: x, cz: z }, { y: y + 0.034, rx: 0.018, rz: 0.018, cx: x, cz: z }], 10, 'terracotta');
  F.box(x - 0.013, x + 0.013, y + 0.008, y + 0.026, z + 0.03, z + 0.075, 'terracotta');
}

export function emitFittings(acc: Acc, plan: BuildingPlan, lod: Lod, tag: (e: PlanElement) => void, footprints: PlanFootprint[]): void {
  for (const f of plan.fittings ?? []) {
    if (lod > (f.kind === 'altar' ? 1 : 0)) continue;
    const F = new Frame(acc, f);
    tag({ id: `fitting:${f.id}`, kind: f.kind, ref: f.id, ev: f.ev ?? 'X', note: f.note });
    const { w, d, h } = f;
    if (f.kind === 'statue') {
      // moulded pedestal: base and cornice in limestone, the die faced with Purbeck marble, an inscribed panel on its front
      const o = 0.06, H = f.figureH ?? 2;
      F.box(-w / 2 - o, w / 2 + o, 0, 0.15, -d / 2 - o, d / 2 + o, 'limestone');
      F.box(-w / 2, w / 2, 0.15, h - 0.15, -d / 2, d / 2, 'purbeck');
      F.box(-w / 2 + 0.15, w / 2 - 0.15, 0.3, h - 0.3, d / 2, d / 2 + 0.012, 'purbeck', 'inscription');
      F.box(-w / 2 - o, w / 2 + o, h - 0.15, h, -d / 2 - o, d / 2 + o, 'limestone');
      figure(F, h, H, f.material ?? 'limestone');
      if (lod === 0) footprints.push(footprintOf(f, w + 2 * o, d + 2 * o, h + H));
    } else if (f.kind === 'table') {
      // offering table: a slab on a pier, two lamps and a dish on it
      F.box(-0.3 * w, 0.3 * w, 0, 0.06, -0.35 * d, 0.35 * d, 'limestone');
      F.box(-0.15 * w, 0.15 * w, 0.06, h - 0.08, -0.22 * d, 0.22 * d, 'limestone');
      F.box(-w / 2, w / 2, h - 0.08, h, -d / 2, d / 2, f.material ?? 'purbeck');
      lamp(F, -0.32 * w, h, 0.05);
      lamp(F, 0.32 * w, h, 0.05);
      F.lathe([{ y: h, rx: 0.04, rz: 0.04 }, { y: h + 0.012, rx: 0.075, rz: 0.075 }, { y: h + 0.02, rx: 0.08, rz: 0.08 }], 14, 'terracotta');
      footprints.push(footprintOf(f, w, d, h));
    } else if (f.kind === 'plaque') {
      // fixed to the wall's face (at), its centre 1.6 m above the floor (y0)
      F.box(-w / 2, w / 2, 1.6 - h / 2, 1.6 + h / 2, 0, d, f.material ?? 'purbeck', 'inscription');
    } else if (f.kind === 'altar') {
      // moulded base, shaft, capital, bolsters (pulvini) along the sides and a focus (a shallow dish) on top
      const cell = f.material ?? 'greensand', r = Math.min(0.07 * h, 0.18 * w), yt = 0.9 * h;
      F.box(-w / 2, w / 2, 0, 0.14 * h, -d / 2, d / 2, cell);
      F.box(-0.4 * w, 0.4 * w, 0.14 * h, 0.76 * h, -0.4 * d, 0.4 * d, cell);
      F.box(-w / 2, w / 2, 0.76 * h, yt, -d / 2, d / 2, cell);
      for (const sx of [-1, 1]) F.tube([sx * (w / 2 - r), yt + r * 0.7, -d / 2], [sx * (w / 2 - r), yt + r * 0.7, d / 2], r, r, 8, cell, true);
      F.lathe([{ y: yt, rx: 0.26 * w, rz: 0.26 * Math.min(w, d) }, { y: yt + 0.04 * h, rx: 0.26 * w, rz: 0.26 * Math.min(w, d) }], 12, cell);
      if (lod === 0) footprints.push(footprintOf(f, w, d, h));
    }
  }
}
