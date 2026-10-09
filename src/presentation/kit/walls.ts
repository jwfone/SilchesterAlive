import * as THREE from 'three';
import { remapUV, cellRect } from './atlas.js';
import { mergeMixed } from './merge.js';

// Roman town wall segment along local Z: coursed rubble core + coping + foundation.
// Low-poly merged single geometry (~30 tris), stone atlas UVs tiled by length.
/** `sink`: how far the footing runs below the base line, so the wall meets lower ground on a slope. */
export function buildWallSegmentGeometry(len: number, h: number, t: number, sink = 0): THREE.BufferGeometry {
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
  if (sink > 0.01) {
    const under = new THREE.BoxGeometry(t + 0.9, sink, len);
    remapUV(under, 'stone', Math.max(1, Math.round(len / 4)), 1);
    under.translate(0, -sink / 2, 0);
    parts.push(under);
  }

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
  const towerH = 9, towerW = 4, sink = 1.2; // tower footings run below the base line (sloping sites)
  for (const sx of [-5, 5]) {
    const foot = new THREE.BoxGeometry(towerW, sink, towerW);
    remapUV(foot, 'stone', 1, 1);
    foot.translate(sx, -sink / 2, 0);
    parts.push(foot);
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
