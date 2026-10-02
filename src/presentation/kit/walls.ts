import * as THREE from 'three';
import { remapUV, cellRect } from './atlas.js';
import { mergeMixed } from './merge.js';

// Roman town wall segment along local Z: coursed rubble core + coping + foundation.
// Low-poly merged single geometry (~30 tris), stone atlas UVs tiled by length.
export function buildWallSegmentGeometry(len: number, h: number, t: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const core = new THREE.BoxGeometry(t, h, len);
  remapUV(core, 'stone', Math.max(1, Math.round(len / 4)), 1);
  core.translate(0, h / 2, 0);
  parts.push(core);

  const coping = new THREE.BoxGeometry(t + 0.7, 0.45, len);
  remapUV(coping, 'stone', Math.max(1, Math.round(len / 4)), 1);
  coping.translate(0, h + 0.22, 0);
  parts.push(coping);

  const footing = new THREE.BoxGeometry(t + 0.9, 0.6, len);
  remapUV(footing, 'stone', Math.max(1, Math.round(len / 4)), 1);
  footing.translate(0, 0.3, 0);
  parts.push(footing);

  // pilaster buttress every ~16m (cheap rhythm detail, 1 box each)
  const n = Math.floor(len / 16);
  for (let i = 0; i < n; i++) {
    const px = -len / 2 + ((i + 0.5) / n) * len;
    const pil = new THREE.BoxGeometry(t + 0.8, h * 0.8, 1.2);
    remapUV(pil, 'stone', 1, 1);
    pil.translate(0, h * 0.4, px);
    parts.push(pil);
  }
  const merged = mergeMixed(parts, 'wall-segment');
  return merged;
}

// Gate: two square towers with pyramid caps + connecting arch band (lintel).
// Single merged geometry, instanced 4x for N/S/E/W gates.
export function buildGateGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const towerH = 9, towerW = 4;
  for (const sx of [-5, 5]) {
    const tower = new THREE.BoxGeometry(towerW, towerH, towerW);
    remapUV(tower, 'stone', 1, 2);
    tower.translate(sx, towerH / 2, 0);
    parts.push(tower);
    const cap = new THREE.ConeGeometry(towerW * 0.78, 2.4, 4);
    remapUV(cap, 'tile', 1, 1);
    cap.rotateY(Math.PI / 4);
    cap.translate(sx, towerH + 1.2, 0);
    parts.push(cap);
  }
  const lintel = new THREE.BoxGeometry(14, 1.6, 3.4);
  remapUV(lintel, 'wood', 2, 1);
  lintel.translate(0, 6.4, 0);
  parts.push(lintel);
  // arch face above opening (plaster/stone band with timber UV to read as gate)
  const face = new THREE.BoxGeometry(14, 1.2, 0.4);
  // map face UVs into stone cell manually (merge keeps existing uvs)
  remapUV(face, 'stone', 3, 1);
  face.translate(0, 7.8, 0);
  parts.push(face);
  const merged = mergeMixed(parts, 'gate');
  void cellRect;
  return merged;
}
