import * as THREE from 'three';
import { remapUV, type AtlasCell } from './atlas.js';
import { buildGableRoofGeometry } from './roofs.js';
import { mergeMixed } from './merge.js';

export interface ComplexBuild {
  mesh: THREE.Object3D;       // everything static merged (1 draw, shared kitMat)
  circles: Array<{ x: number; z: number; r: number }>;
  boxes: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; h?: number }>;
  tris: number;
}

// Walkable mansio (courtyard coaching inn near south gate, centre ~40,245):
// N range of 4 rooms + E/W wings around a gravel courtyard, timber porticos,
// south gate posts, stable mangers in E wing, courtyard wellhead.
export function buildMansio(mat: THREE.Material): ComplexBuild {
  const parts: THREE.BufferGeometry[] = [];
  const boxes: ComplexBuild['boxes'] = [];
  const circles: ComplexBuild['circles'] = [];

  const bx = (w: number, h: number, d: number, x: number, y: number, z: number, cell: AtlasCell = 'stone'): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    remapUV(g, cell, Math.max(1, Math.round(w / 8)), 1);
    g.translate(x, y, z);
    parts.push(g);
  };
  const wallRunX = (x0: number, x1: number, z: number, h: number, t: number, doors: number[], dw: number): void => {
    const edges = [x0, ...doors.flatMap(d => [d - dw / 2, d + dw / 2]), x1];
    for (let i = 0; i < edges.length; i += 2) {
      if (edges[i + 1] - edges[i] < 0.4) continue;
      bx(edges[i + 1] - edges[i], h, t, (edges[i] + edges[i + 1]) / 2, h / 2, z);
      boxes.push({ minX: edges[i], maxX: edges[i + 1], minZ: z - t / 2, maxZ: z + t / 2 });
    }
    for (const d of doors) {
      const lin = new THREE.BoxGeometry(dw, 1.1, t + 0.3);
      remapUV(lin, 'stone', 1, 1);
      lin.translate(d, h - 0.55, z);
      parts.push(lin);
    }
  };

  const T = 1;
  // N range: x14-66, z232-240, h5; doors on S face
  bx(52, 5, T, 40, 2.5, 232); // N wall
  boxes.push({ minX: 14, maxX: 66, minZ: 231.5, maxZ: 232.5 });
  wallRunX(14, 66, 240, 5, T, [22, 34, 46, 58], 2);
  // gable ends of N range
  bx(T, 5, 8, 14, 2.5, 236); bx(T, 5, 8, 66, 2.5, 236);
  boxes.push({ minX: 13.5, maxX: 14.5, minZ: 232, maxZ: 240 });
  boxes.push({ minX: 65.5, maxX: 66.5, minZ: 232, maxZ: 240 });
  // partitions -> 4 rooms
  for (const px of [28, 40, 52]) {
    bx(0.6, 4.2, 8, px, 2.1, 236, 'plaster');
    boxes.push({ minX: px - 0.3, maxX: px + 0.3, minZ: 232, maxZ: 240 });
  }
  // N range roof (ridge E-W)
  {
    const g = buildGableRoofGeometry(54, 10.5, 2.6, 0.9);
    g.translate(40, 5, 236);
    parts.push(g);
  }

  // E wing: x58-66, z240-258; doors on W face (rooms z246, stable z254 wide)
  bx(8, 4.5, T, 62, 2.25, 258); // S end wall
  boxes.push({ minX: 58, maxX: 66, minZ: 257.5, maxZ: 258.5 });
  {
    // W face segments: doors at 246 (2.5m) and 254 (3.5m)
    const segs: Array<[number, number]> = [[240, 244.75], [247.25, 252.25], [255.75, 258]];
    for (const [z0, z1] of segs) {
      bx(T, 4.5, z1 - z0, 58, 2.25, (z0 + z1) / 2);
      boxes.push({ minX: 57.5, maxX: 58.5, minZ: z0, maxZ: z1 });
    }
  }
  bx(T, 4.5, 18, 66, 2.25, 249); // E outer wall
  boxes.push({ minX: 65.5, maxX: 66.5, minZ: 240, maxZ: 258 });
  {
    // partition wall z250 (stable vs rooms separated, stable entered from its own door)
    const g = new THREE.BoxGeometry(8, 4, 0.6);
    remapUV(g, 'plaster', 1, 1);
    g.translate(62, 2, 250);
    parts.push(g);
    boxes.push({ minX: 58, maxX: 66, minZ: 249.7, maxZ: 250.3 });
  }
  // W wing mirrored: x14-22, doors on E face at z246, z253
  {
    for (const [z0, z1] of [[240, 244.75], [247.25, 251.75], [254.25, 258]] as Array<[number, number]>) {
      bx(T, 4.5, z1 - z0, 22, 2.25, (z0 + z1) / 2);
      boxes.push({ minX: 21.5, maxX: 22.5, minZ: z0, maxZ: z1 });
    }
    bx(T, 4.5, 18, 14, 2.25, 249);
    boxes.push({ minX: 13.5, maxX: 14.5, minZ: 240, maxZ: 258 });
    bx(8, 4.5, T, 18, 2.25, 258);
    boxes.push({ minX: 14, maxX: 22, minZ: 257.5, maxZ: 258.5 });
    const g = new THREE.BoxGeometry(8, 4, 0.6);
    remapUV(g, 'plaster', 1, 1);
    g.translate(18, 2, 250);
    parts.push(g);
    boxes.push({ minX: 14, maxX: 22, minZ: 249.7, maxZ: 250.3 });
  }
  // wing roofs (ridge N-S)
  for (const wx of [62, 18]) {
    const g = buildGableRoofGeometry(20, 10.5, 2, 0.9);
    g.rotateY(Math.PI / 2);
    g.translate(wx, 4.5, 249);
    parts.push(g);
  }

  // Courtyard slab + portico posts + lean-to strips
  {
    const g = new THREE.BoxGeometry(36, 0.2, 18);
    remapUV(g, 'street', 6, 3);
    g.translate(40, 0.1, 249);
    parts.push(g);
    const post = (x: number, z: number): void => {
      const p = new THREE.BoxGeometry(0.35, 3.2, 0.35);
      remapUV(p, 'wood', 1, 1);
      p.translate(x, 1.6, z);
      parts.push(p);
      circles.push({ x, z, r: 0.35 });
    };
    for (let i = 0; i < 9; i++) post(24 + i * 4, 242.5);
    for (let i = 0; i < 4; i++) { post(55.5, 244 + i * 4); post(24.5, 244 + i * 4); }
    const lean = (w: number, d: number, x: number, y: number, z: number, tilt: number, axis: 'x' | 'z'): void => {
      const r = new THREE.BoxGeometry(w, 0.25, d);
      remapUV(r, 'tile', Math.max(1, Math.round(w / 4)), 1);
      if (axis === 'x') r.rotateX(tilt); else r.rotateZ(tilt);
      r.translate(x, y, z);
      parts.push(r);
    };
    lean(36, 3.5, 40, 4.1, 242.2, 0.22, 'x');
    lean(3.5, 16, 55.8, 3.9, 249, -0.22, 'z');
    lean(3.5, 16, 24.2, 3.9, 249, 0.22, 'z');
  }

  // South gate posts + lintel
  for (const gx of [36, 44]) {
    bx(1.6, 5, 1.6, gx, 2.5, 258);
    boxes.push({ minX: gx - 0.8, maxX: gx + 0.8, minZ: 257.2, maxZ: 258.8 });
  }
  bx(9.6, 1.4, 2, 40, 4.6, 258, 'wood');

  // Stable mangers (E wing stable room interior)
  for (const mz of [252, 254, 256]) {
    bx(0.6, 1, 2, 65, 0.5, mz, 'wood');
    boxes.push({ minX: 64.7, maxX: 65.3, minZ: mz - 1, maxZ: mz + 1 });
  }

  // Wellhead: drum + posts + cap
  {
    const drum = new THREE.CylinderGeometry(0.9, 1, 1, 10);
    remapUV(drum, 'stone', 2, 1);
    drum.translate(40, 0.5, 249);
    parts.push(drum);
    circles.push({ x: 40, z: 249, r: 1.1 });
    for (const s of [-0.9, 0.9]) {
      const p = new THREE.BoxGeometry(0.25, 2.2, 0.25);
      remapUV(p, 'wood', 1, 1);
      p.translate(40 + s, 1.6, 249);
      parts.push(p);
    }
    const cap = buildGableRoofGeometry(2.6, 1.6, 0.7, 0.2);
    cap.translate(40, 2.7, 249);
    parts.push(cap);
  }

  const merged = mergeMixed(parts, 'mansio');
  const count = (merged.index ? merged.index.count : merged.attributes.position.count) / 3;
  return { mesh: new THREE.Mesh(merged, mat), circles, boxes, tris: Math.round(count) };
}
