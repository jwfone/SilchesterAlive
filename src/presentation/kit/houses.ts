import * as THREE from 'three';
import { remapUV } from './atlas.js';
import { mergeMixed } from './merge.js';

// Unit house body (1x1x1 centred at origin, base y=0): stone base band + plaster/timber upper.
// UV trick: side-face verts with y<0.32 map into stone cell, rest into timber/plaster.
// Timber variant for shops/houses alternation via second geometry.
function paintBodyBands(box: THREE.BoxGeometry, upper: 'plaster' | 'timber'): void {
  const pos = box.attributes.position as THREE.BufferAttribute;
  const uv = box.attributes.uv as THREE.BufferAttribute;
  const stone = { u0: 0.004, v0: 0.754, u1: 0.246, v1: 0.996 }; // must match atlas stone cell
  const top = upper === 'timber'
    ? { u0: 0.504, v0: 0.754, u1: 0.746, v1: 0.996 }
    : { u0: 0.254, v0: 0.754, u1: 0.496, v1: 0.996 };
  for (let i = 0; i < uv.count; i++) {
    const y = pos.getY(i) + 0.5; // 0..1 (box centred)
    const isTopCap = Math.abs(pos.getY(i) - 0.5) < 1e-4;
    const isBottom = Math.abs(pos.getY(i) + 0.5) < 1e-4;
    if (isTopCap || isBottom) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, stone.u0 + u * (stone.u1 - stone.u0), stone.v0 + v * (stone.v1 - stone.v0));
      continue;
    }
    const r = y < 0.3 ? stone : top;
    // tile sides 2x so courses read at house scale (instances scale up further)
    let u = uv.getX(i) * 2;
    let v = uv.getY(i) * (y < 0.3 ? 0.5 : 1.5);
    u -= Math.floor(u); v -= Math.floor(v);
    uv.setXY(i, r.u0 + u * (r.u1 - r.u0), r.v0 + v * (r.v1 - r.v0));
  }
  uv.needsUpdate = true;
}

export function buildHouseBodyGeometry(variant: 'plaster' | 'timber'): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0); // base at y=0 for instancing
  paintBodyBands(g, variant);
  return g;
}

// Door/window dark insets as merged thin boxes on +Z face (2 draws saved -> 0, part of body).
export function buildHouseWithOpeningsGeometry(variant: 'plaster' | 'timber'): THREE.BufferGeometry {
  const body = buildHouseBodyGeometry(variant);
  const dark = new THREE.MeshBasicMaterial();
  void dark;
  const parts: THREE.BufferGeometry[] = [body];
  const door = new THREE.BoxGeometry(0.16, 0.42, 0.02);
  remapUV(door, 'wood', 1, 1);
  door.translate(-0.18, 0.21, 0.505);
  parts.push(door);
  for (const wx of [0.14, 0.32]) {
    const win = new THREE.BoxGeometry(0.12, 0.12, 0.02);
    remapUV(win, 'wood', 1, 1);
    win.translate(wx, 0.55, 0.505);
    parts.push(win);
  }
  const merged = mergeMixed(parts, `house-${variant}`);
  return merged;
}
