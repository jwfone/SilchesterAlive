import * as THREE from 'three';
import { remapUV } from './atlas.js';

export interface AmphiDetail { x: number; z: number; rx: number; rz: number; h: number }
export interface EllipseBand { x: number; z: number; rxO: number; rzO: number; rxI: number; rzI: number; gapHalfAngle: number }

export interface AmphiBuild {
  lod: THREE.LOD;
  extras: THREE.Object3D[];   // podium, arena, outer walls, entrance floors (shared kitMat)
  band: EllipseBand;          // seating blocker (walkable arena inside, ground outside)
  tris: number;
}

const TAU = Math.PI * 2;

// Stepped cavea ring: `steps` concentric elliptical steps from inner arena edge
// (arx,arz) outward to (rx,rz), each tread depth d ≈ (rx-arx)/steps, riser ≈ h/steps.
// Entrance gaps centred at angle 0 (+x, east) and PI (west), half-width gapHalfAngle.
function caveaGeometry(ax: number, az: number, arx: number, arz: number, rx: number, rz: number, h: number, steps: number, segs: number, gapHalfAngle: number, mat: THREE.Material): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const podiumH = 2.2;
  const quad = (ax3: number[], bx3: number[], cx3: number[], dx3: number[]): void => {
    positions.push(...ax3, ...bx3, ...cx3, ...ax3, ...cx3, ...dx3);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  for (let s = 0; s < steps; s++) {
    const f0 = s / steps, f1 = (s + 1) / steps;
    const inX0 = arx + (rx - arx) * f0, inZ0 = arz + (rz - arz) * f0;
    const inX1 = arx + (rx - arx) * f1, inZ1 = arz + (rz - arz) * f1;
    const y0 = podiumH + (h - podiumH) * f0;
    const y1 = podiumH + (h - podiumH) * f1;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
      const mid = (a0 + a1) / 2;
      // entrance gaps at angle 0 and PI
      const dEast = Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid)));
      const dWest = Math.abs(Math.atan2(Math.sin(mid - Math.PI), Math.cos(mid - Math.PI)));
      if (Math.min(dEast, dWest) < gapHalfAngle) continue;
      const p = (rx_: number, rz_: number, y: number, a: number): number[] =>
        [ax + rx_ * Math.cos(a), y, az + rz_ * Math.sin(a)];
      // tread (flat annulus strip at y1)
      quad(p(inX0, inZ0, y1, a0), p(inX0, inZ0, y1, a1), p(inX1, inZ1, y1, a1), p(inX1, inZ1, y1, a0));
      // riser (vertical strip from y0 to y1 at outer edge)
      quad(p(inX1, inZ1, y0, a0), p(inX1, inZ1, y0, a1), p(inX1, inZ1, y1, a1), p(inX1, inZ1, y1, a0));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  remapUV(g, 'stone', 10, 2);
  return new THREE.Mesh(g, mat);
}

export function buildAmphitheatre(detail: AmphiDetail, mat: THREE.Material): AmphiBuild {
  const { x: ax, z: az, rx, rz, h } = detail;
  const gapHalfAngle = 0.16;
  // arena ~55% of outer footprint
  const arx = rx * 0.55, arz = rz * 0.55;
  let tris = 0;
  const count = (g: THREE.BufferGeometry, instances = 1): void => {
    tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * instances;
  };
  const extras: THREE.Object3D[] = [];

  // LOD cavea: high (28 seg / 9 steps) near, low (12 seg / 4 steps) far
  const lod = new THREE.LOD();
  const high = caveaGeometry(ax, az, arx, arz, rx, rz, h, 9, 28, gapHalfAngle, mat);
  high.position.set(0, 0, 0);
  // geometry built in world coords already (ax/az baked); keep mesh at origin
  const low = caveaGeometry(ax, az, arx, arz, rx, rz, h, 4, 12, gapHalfAngle, mat);
  lod.addLevel(high, 0);
  lod.addLevel(low, 260);
  count(high.geometry as THREE.BufferGeometry);
  // note: low not counted (only one level rasterised)

  // Podium wall around arena (2.2m, with entrance gaps via 2 arc segments).
  // NOTE: gaps baked to ±x via geometry rotate (mesh scale must stay axis-aligned).
  for (const [start, len] of [[gapHalfAngle, Math.PI - gapHalfAngle * 2], [Math.PI + gapHalfAngle, Math.PI - gapHalfAngle * 2]] as Array<[number, number]>) {
    const g = new THREE.CylinderGeometry(1, 1, 2.2, 24, 1, true, start, len);
    remapUV(g, 'stone', 8, 1);
    g.rotateY(Math.PI / 2); // cylinder param 0 = +z; move gaps to ±x to match cavea
    const m = new THREE.Mesh(g, mat);
    m.scale.set(arx + 0.4, 1, arz + 0.4);
    m.position.set(ax, 1.1, az);
    extras.push(m);
    count(g);
  }

  // Arena floor
  {
    const g = new THREE.CircleGeometry(1, 28);
    remapUV(g, 'arena', 4, 4);
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(arx, arz, 1);
    m.position.set(ax, 0.12, az);
    extras.push(m);
    count(g);
  }

  // Outer wall: 2 arc segments leaving entrance gaps (baked rotation, see above)
  for (const [start, len] of [[gapHalfAngle * 1.4, Math.PI - gapHalfAngle * 2.8], [Math.PI + gapHalfAngle * 1.4, Math.PI - gapHalfAngle * 2.8]] as Array<[number, number]>) {
    const g = new THREE.CylinderGeometry(1, 1.06, h, 24, 1, true, start, len);
    remapUV(g, 'stone', 12, 1);
    g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.scale.set(rx + 1.5, 1, rz + 1.5);
    m.position.set(ax, h / 2, az);
    extras.push(m);
    count(g);
  }

  // Entrance passages: gravel floors + flanking walls (E and W)
  for (const dir of [1, -1]) {
    const ex = ax + dir * (rx * 0.75);
    const floor = new THREE.BoxGeometry(rx * 0.6, 0.2, 5);
    remapUV(floor, 'street', 4, 1);
    floor.translate(ex, 0.1, az);
    extras.push(new THREE.Mesh(floor, mat));
    count(floor);
    for (const side of [-3.2, 3.2]) {
      const w = new THREE.BoxGeometry(rx * 0.6, 3.2, 1);
      remapUV(w, 'stone', 6, 1);
      w.translate(ex, 1.6, az + side);
      extras.push(new THREE.Mesh(w, mat));
      count(w);
    }
  }

  const band: EllipseBand = { x: ax, z: az, rxO: rx + 1.5, rzO: rz + 1.5, rxI: arx - 0.5, rzI: arz - 0.5, gapHalfAngle: 0.22 };
  return { lod, extras, band, tris: Math.round(tris) };
}
