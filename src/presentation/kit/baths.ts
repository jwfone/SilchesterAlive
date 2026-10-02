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

interface Seg { x0: number; x1: number }

function splitGaps(x0: number, x1: number, doors: number[], w: number): Seg[] {
  const edges = [x0, ...doors.flatMap(d => [d - w / 2, d + w / 2]), x1];
  const out: Seg[] = [];
  for (let i = 0; i < edges.length; i += 2) {
    if (edges[i + 1] - edges[i] > 0.4) out.push({ x0: edges[i], x1: edges[i + 1] });
  }
  return out;
}

// Walkable baths (SE quarter, centre ~150,150): furnace annex + caldarium +
// tepidarium + apodyterium enfilade, frigidarium court with plunge pool.
// All flat floors (kinematic controller); hypocaust shown as exterior cutaway.
export function buildBaths(mat: THREE.Material): ComplexBuild {
  const parts: THREE.BufferGeometry[] = [];
  const boxes: ComplexBuild['boxes'] = [];
  const circles: ComplexBuild['circles'] = [];
  let tris = 0;

  const H = 6, T = 1;
  const zN = 142, zS = 158;         // perimeter N/S walls
  const xW = 127, xE = 161;         // heated block W/E bounds (court beyond xE)
  const bayDoors = 2.6;

  const wallX = (x0: number, x1: number, z: number, h: number, cell: AtlasCell = 'stone'): void => {
    const g = new THREE.BoxGeometry(x1 - x0, h, T);
    remapUV(g, cell, Math.max(1, Math.round((x1 - x0) / 8)), 1);
    g.translate((x0 + x1) / 2, h / 2, z);
    parts.push(g);
    boxes.push({ minX: x0, maxX: x1, minZ: z - T / 2, maxZ: z + T / 2, h });
  };
  const wallZ = (z0: number, z1: number, x: number, h: number, cell: AtlasCell = 'stone'): void => {
    const g = new THREE.BoxGeometry(T, h, z1 - z0);
    remapUV(g, cell, 1, 1);
    g.translate(x, h / 2, (z0 + z1) / 2);
    parts.push(g);
    boxes.push({ minX: x - T / 2, maxX: x + T / 2, minZ: z0, maxZ: z1, h });
  };
  const lintelX = (dc: number, w: number, z: number): void => {
    const g = new THREE.BoxGeometry(w, 1.2, T + 0.3);
    remapUV(g, 'stone', 1, 1);
    g.translate(dc, 3.6, z);
    parts.push(g);
  };
  const floorSlab = (x0: number, x1: number, z0: number, z1: number, cell: AtlasCell = 'arena'): void => {
    const g = new THREE.BoxGeometry(x1 - x0, 0.25, z1 - z0);
    remapUV(g, cell, Math.round((x1 - x0) / 6), Math.round((z1 - z0) / 6));
    g.translate((x0 + x1) / 2, 0.12, (z0 + z1) / 2);
    parts.push(g);
  };

  // Floors: heated block + court
  floorSlab(xW, xE, zN, zS);
  floorSlab(xE, 173, 139, 161);

  // N perimeter with entrance gap (tepidarium door at x145)
  for (const s of splitGaps(xW, xE, [145], 2.6)) wallX(s.x0, s.x1, zN, H);
  lintelX(145, 2.6, zN);
  // S perimeter solid + pilae cutaway outside caldarium
  wallX(xW, xE, zS, H);
  // W wall of caldarium with furnace arch gap (2m at z150)
  for (const [z0, z1] of [[zN, 149], [151, zS]] as Array<[number, number]>) wallZ(z0, z1, xW, H);
  // Cross walls with enfilade doors (centre z150)
  for (const wx of [139, 151]) {
    for (const s of splitGaps(zN, zS, [150], bayDoors)) {
      const g = new THREE.BoxGeometry(T, H - 1, s.x1 - s.x0);
      remapUV(g, 'stone', 1, 1);
      g.translate(wx, (H - 1) / 2, (s.x0 + s.x1) / 2);
      parts.push(g);
      boxes.push({ minX: wx - T / 2, maxX: wx + T / 2, minZ: s.x0, maxZ: s.x1, h: H - 1 });
    }
    const lin = new THREE.BoxGeometry(T + 0.3, 1.2, bayDoors);
    remapUV(lin, 'stone', 1, 1);
    lin.translate(wx, 3.6, 150);
    parts.push(lin);
  }
  // E wall of apodyterium with 3m door to court
  for (const s of splitGaps(zN + 1, zS - 1, [150], 3)) {
    const g = new THREE.BoxGeometry(T, H - 1, s.x1 - s.x0);
    remapUV(g, 'stone', 1, 1);
    g.translate(xE, (H - 1) / 2, (s.x0 + s.x1) / 2);
    parts.push(g);
    boxes.push({ minX: xE - T / 2, maxX: xE + T / 2, minZ: s.x0, maxZ: s.x1, h: H - 1 });
  }

  // Furnace annex (x121-127, z145-155): solid except stoke arch facing caldarium
  {
    const fx0 = 121, fx1 = 127, fz0 = 145, fz1 = 155, fh = 4;
    floorSlab(fx0, fx1, fz0, fz1, 'street');
    wallX(fx0, fx1, fz0, fh); wallX(fx0, fx1, fz1, fh);
    wallZ(fz0, fz1, fx0, fh);
    // E side: segments around 2m stoke arch + dark arch face
    wallZ(fz0, 149, fx1, fh); wallZ(151, fz1, fx1, fh);
    const arch = new THREE.BoxGeometry(0.3, 2, 2);
    remapUV(arch, 'wood', 1, 1);
    arch.translate(fx1, 1, 150);
    parts.push(arch);
    // lean-to shed roof sloping east-down
    const roof = new THREE.BoxGeometry(8, 0.3, 12);
    remapUV(roof, 'tile', 2, 2);
    roof.rotateZ(0.18);
    roof.translate((fx0 + fx1) / 2, fh + 0.4, 150);
    parts.push(roof);
    // chimney
    const ch = new THREE.BoxGeometry(1.2, 3, 1.2);
    remapUV(ch, 'stone', 1, 1);
    ch.translate(fx0 + 1, fh + 1.5, fz0 + 1);
    parts.push(ch);
  }

  // Hypocaust cutaway: pilae stacks + suspended slab edge, S exterior of caldarium
  {
    for (let ix = 0; ix < 6; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        const p = new THREE.BoxGeometry(0.32, 0.8, 0.32);
        remapUV(p, 'stone', 1, 1);
        p.translate(129 + ix * 1.4, 0.4, 159.2 + iz * 1.1);
        parts.push(p);
      }
    }
    const slab = new THREE.BoxGeometry(9, 0.35, 3);
    remapUV(slab, 'stone', 2, 1);
    slab.translate(132.5, 0.95, 159.7);
    parts.push(slab);
    boxes.push({ minX: 128, maxX: 137, minZ: 158.6, maxZ: 160.8, h: 1.2 });
  }

  // Gabled roofs over heated rooms (ridge E-W)
  for (const [rx0, rx1, rz, rd, rh, ry] of [
    [xW, 139, 150, 18, 3, H], [139, 151, 150, 18, 2.6, H - 1], [151, xE, 150, 16, 2.4, H - 2],
  ] as Array<[number, number, number, number, number, number]>) {
    const g = buildGableRoofGeometry(rx1 - rx0 + 1, rd, rh, 0.8);
    g.translate((rx0 + rx1) / 2, ry, rz);
    parts.push(g);
  }

  // Frigidarium court parapet (h1.5) with E entrance gap + plunge pool
  {
    const px0 = 161, px1 = 173, pz0 = 139, pz1 = 161, ph = 1.5, pt = 0.6;
    for (const s of splitGaps(px0, px1, [], 0)) {
      const g = new THREE.BoxGeometry(s.x1 - s.x0, ph, pt);
      remapUV(g, 'stone', 3, 1); g.translate((s.x0 + s.x1) / 2, ph / 2, pz0); parts.push(g);
      boxes.push({ minX: s.x0, maxX: s.x1, minZ: pz0 - pt / 2, maxZ: pz0 + pt / 2, h: ph });
      const g2 = new THREE.BoxGeometry(s.x1 - s.x0, ph, pt);
      remapUV(g2, 'stone', 3, 1); g2.translate((s.x0 + s.x1) / 2, ph / 2, pz1); parts.push(g2);
      boxes.push({ minX: s.x0, maxX: s.x1, minZ: pz1 - pt / 2, maxZ: pz1 + pt / 2, h: ph });
    }
    for (const s of splitGaps(pz0, pz1, [150], 3.5)) {
      const g = new THREE.BoxGeometry(pt, ph, s.x1 - s.x0);
      remapUV(g, 'stone', 1, 1); g.translate(px1, ph / 2, (s.x0 + s.x1) / 2); parts.push(g);
      boxes.push({ minX: px1 - pt / 2, maxX: px1 + pt / 2, minZ: s.x0, maxZ: s.x1, h: ph });
    }
    // plunge pool basin 8x5 at (167,150): floor + water + rim
    const bx = 167, bz = 150, bw = 8, bd = 5, rimH = 1.1, rt = 0.5;
    const basin = new THREE.BoxGeometry(bw, 0.15, bd);
    remapUV(basin, 'stone', 2, 1); basin.translate(bx, 0.07, bz); parts.push(basin);
    const water = new THREE.BoxGeometry(bw - rt * 2, 0.1, bd - rt * 2);
    remapUV(water, 'water', 2, 1); water.translate(bx, 0.55, bz); parts.push(water);
    const rim = (w: number, d: number, x: number, z: number): void => {
      const g = new THREE.BoxGeometry(w, rimH, d);
      remapUV(g, 'stone', 2, 1); g.translate(x, rimH / 2, z); parts.push(g);
      boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: rimH });
    };
    rim(bw, rt, bx, bz - bd / 2 + rt / 2); rim(bw, rt, bx, bz + bd / 2 - rt / 2);
    rim(rt, bd - rt * 2, bx - bw / 2 + rt / 2, bz); rim(rt, bd - rt * 2, bx + bw / 2 - rt / 2, bz);
  }

  const merged = mergeMixed(parts, 'baths');
  const count = (merged.index ? merged.index.count : merged.attributes.position.count) / 3;
  return { mesh: new THREE.Mesh(merged, mat), circles, boxes, tris: Math.round(count) };
}
