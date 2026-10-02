import * as THREE from 'three';
import { remapUV } from './atlas.js';
import { buildGableRoofGeometry } from './roofs.js';
import { mergeMixed } from './merge.js';

export interface ForumBuild {
  meshes: THREE.Object3D[];
  columnSpots: Array<{ x: number; z: number; h: number }>;
  circleColliders: Array<{ x: number; z: number; r: number }>;
  boxColliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  tris: number;
}

function wallPart(w: number, h: number, d: number, x: number, y: number, z: number, cell: 'stone' | 'plaster' = 'stone'): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  remapUV(g, cell, Math.max(1, Math.round(w / 8)), 1);
  g.translate(x, y, z);
  return g;
}

// Walkable forum-basilica complex (replaces the old solid boxes).
// Authored N-S (basilica north of the courtyard, long hall along X) then yawed
// +90° around (8,-8) so the basilica sits west and the forum east, matching
// the GIS insula. Doors face the courtyard; the apse is at the south end.
// Basilica: hollow hall 72x18, N wall solid, S wall with 3 doors (4m), E wall solid,
// W wall split for apse opening, W apse half-rotunda, 2x8 nave columns, big timber gable roof.
// Forum courtyard: paved slab + E/W/N portico colonnades with lean-to roofs, S side open.
const FORUM_KIT_CX = 8, FORUM_KIT_CZ = -8;
export function buildForumComplex(mat: THREE.Material): ForumBuild {
  const bx = 8, bz = -28;      // basilica centre before yaw (north of courtyard)
  const fx = 8, fz = 12;       // forum centre before yaw (south of basilica)
  const meshes: THREE.Object3D[] = [];
  const columnSpots: Array<{ x: number; z: number; h: number }> = [];
  const circleColliders: Array<{ x: number; z: number; r: number }> = [];
  const boxColliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  let tris = 0;
  // All static parts share one material: accumulate then merge to a single
  // draw (same transforms/UVs, just one Mesh instead of ~7).
  const staticParts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry): void => {
    staticParts.push(g);
  };
  const col = (x: number, z: number, h: number): void => {
    columnSpots.push({ x, z, h });
    circleColliders.push({ x, z, r: 0.65 });
  };

  // --- Basilica floor ---
  {
    const g = new THREE.BoxGeometry(72, 0.25, 18);
    remapUV(g, 'arena', 9, 2);
    g.translate(bx, 0.12, bz);
    add(g);
  }

  // --- Basilica walls (merged into one geometry, 1 draw) ---
  {
    const parts: THREE.BufferGeometry[] = [];
    const H = 10, T = 1;
    const zN = bz - 8.5, zS = bz + 8.5;
    parts.push(wallPart(72, H, T, bx, H / 2, zN)); // N solid
    // S wall with 3 door gaps (4m at bx-20, bx, bx+20)
    const doorW = 4;
    const doorXs = [bx - 20, bx, bx + 20];
    const edges = [bx - 36, ...doorXs.flatMap(d => [d - doorW / 2, d + doorW / 2]), bx + 36];
    for (let i = 0; i < edges.length; i += 2) {
      const x0 = edges[i], x1 = edges[i + 1];
      if (x1 - x0 < 0.5) continue;
      parts.push(wallPart(x1 - x0, H, T, (x0 + x1) / 2, H / 2, zS));
      boxColliders.push({ minX: x0, maxX: x1, minZ: zS - T / 2, maxZ: zS + T / 2 });
    }
    boxColliders.push({ minX: bx - 36, maxX: bx + 36, minZ: zN - T / 2, maxZ: zN + T / 2 });
    // E wall solid
    const e = new THREE.BoxGeometry(T, H, 18);
    remapUV(e, 'stone', 2, 1); e.translate(bx + 35.5, H / 2, bz);
    parts.push(e);
    boxColliders.push({ minX: bx + 35, maxX: bx + 36, minZ: bz - 9, maxZ: bz + 9 });
    // W wall: two segments leaving 8m apse opening
    for (const [z0, z1] of [[bz - 9, bz - 4], [bz + 4, bz + 9]] as Array<[number, number]>) {
      const seg = new THREE.BoxGeometry(T, H, z1 - z0);
      remapUV(seg, 'stone', 1, 1); seg.translate(bx - 35.5, H / 2, (z0 + z1) / 2);
      parts.push(seg);
      boxColliders.push({ minX: bx - 36, maxX: bx - 35, minZ: z0, maxZ: z1 });
    }
    const merged = mergeMixed(parts, 'basilica-walls');
    add(merged);
  }

  // --- Apse (half-rotunda west of basilica) ---
  {
    const r = 7;
    const wall = new THREE.CylinderGeometry(r, r, 9, 12, 1, true, Math.PI / 2, Math.PI);
    remapUV(wall, 'stone', 4, 1);
    wall.translate(bx - 35.5, 4.5, bz);
    add(wall);
    const cap = new THREE.ConeGeometry(r + 0.4, 3, 12, 1, true);
    remapUV(cap, 'tile', 4, 1);
    cap.translate(bx - 35.5, 10.5, bz);
    add(cap);
    boxColliders.push({ minX: bx - 44, maxX: bx - 35, minZ: bz - 8, maxZ: bz + 8 });
  }

  // --- Basilica roof (big gable, ridge along X) ---
  {
    const g = buildGableRoofGeometry(76, 22, 5, 1.2);
    g.translate(bx, 10, bz);
    add(g);
  }

  // --- Nave colonnades: 2 rows x 8 ---
  for (let i = 0; i < 8; i++) {
    const x = bx - 28 + i * 8;
    col(x, bz - 4.5, 6);
    col(x, bz + 4.5, 6);
  }

  // --- Forum courtyard pavement ---
  {
    const g = new THREE.BoxGeometry(56, 0.25, 38);
    remapUV(g, 'arena', 7, 5);
    g.translate(fx, 0.12, fz);
    add(g);
  }

  // --- Forum porticos: columns + lean-to roof strips on N/E/W ---
  {
    const roofParts: THREE.BufferGeometry[] = [];
    const strip = (w: number, d: number, x: number, z: number): void => {
      const g = new THREE.BoxGeometry(w, 0.35, d);
      remapUV(g, 'tile', Math.round(w / 4), 1);
      g.translate(x, 4.6, z);
      roofParts.push(g);
    };
    // N row (between forum and basilica)
    for (let i = 0; i < 8; i++) col(fx - 24.5 + i * 7, fz - 16, 4);
    strip(56, 4.5, fx, fz - 16);
    // E row
    for (let i = 0; i < 5; i++) col(fx + 25, fz - 12 + i * 6.5, 4);
    strip(4.5, 38, fx + 25, fz);
    // W row
    for (let i = 0; i < 5; i++) col(fx - 25, fz - 12 + i * 6.5, 4);
    strip(4.5, 38, fx - 25, fz);
    const merged = mergeMixed(roofParts, 'forum-portico-roofs');
    add(merged);
  }

  if (staticParts.length) {
    const merged = mergeMixed(staticParts, 'forum');
    tris = Math.round((merged.index ? merged.index.count : merged.attributes.position.count) / 3);
    meshes.push(new THREE.Mesh(merged, mat));
  }

  // Yaw the intact kit so basilica is west, forum east (Silchester / GIS).
  const yaw = (x: number, z: number): { x: number; z: number } => {
    const rx = x - FORUM_KIT_CX, rz = z - FORUM_KIT_CZ;
    return { x: FORUM_KIT_CX + rz, z: FORUM_KIT_CZ - rx };
  };
  for (const m of meshes) {
    const g = (m as THREE.Mesh).geometry;
    if (!g) continue;
    g.translate(-FORUM_KIT_CX, 0, -FORUM_KIT_CZ);
    g.rotateY(Math.PI / 2);
    g.translate(FORUM_KIT_CX, 0, FORUM_KIT_CZ);
  }
  for (const s of columnSpots) {
    const p = yaw(s.x, s.z); s.x = p.x; s.z = p.z;
  }
  for (const c of circleColliders) {
    const p = yaw(c.x, c.z); c.x = p.x; c.z = p.z;
  }
  for (const b of boxColliders) {
    const p0 = yaw(b.minX, b.minZ), p1 = yaw(b.minX, b.maxZ);
    const p2 = yaw(b.maxX, b.minZ), p3 = yaw(b.maxX, b.maxZ);
    b.minX = Math.min(p0.x, p1.x, p2.x, p3.x);
    b.maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
    b.minZ = Math.min(p0.z, p1.z, p2.z, p3.z);
    b.maxZ = Math.max(p0.z, p1.z, p2.z, p3.z);
  }

  return { meshes, columnSpots, circleColliders, boxColliders, tris };
}
