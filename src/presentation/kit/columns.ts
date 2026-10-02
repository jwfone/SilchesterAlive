import * as THREE from 'three';
import { remapUV } from './atlas.js';
import { mergeMixed } from './merge.js';

// Roman column: stone base + 7-sided tapered shaft + capital. ~60 tris. Instanced for porticos.
export function buildColumnGeometry(h = 5): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.BoxGeometry(1.1, 0.35, 1.1);
  remapUV(base, 'stone', 1, 1);
  base.translate(0, 0.17, 0);
  parts.push(base);
  const shaft = new THREE.CylinderGeometry(0.32, 0.38, h, 7);
  remapUV(shaft, 'stone', 2, 2);
  shaft.translate(0, 0.35 + h / 2, 0);
  parts.push(shaft);
  const cap = new THREE.BoxGeometry(0.95, 0.3, 0.95);
  remapUV(cap, 'stone', 1, 1);
  cap.translate(0, 0.35 + h + 0.15, 0);
  parts.push(cap);
  const merged = mergeMixed(parts, 'column');
  return merged;
}
