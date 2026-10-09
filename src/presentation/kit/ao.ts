import * as THREE from 'three';
import { drapeOnGround } from './decal.js';

// Baked AO v1: contact-shadow decals (1 transparent draw, zero runtime cost)
// + the stone-base bands already in the atlas UVs. No dynamic lights/shadows needed.

export interface ShadowSpot { x: number; z: number; w: number; d: number; rotY?: number }

let sharedBlob: THREE.CanvasTexture | null = null;

function blobTexture(): THREE.CanvasTexture {
  if (sharedBlob) return sharedBlob;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,.42)');
  grd.addColorStop(0.7, 'rgba(0,0,0,.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  sharedBlob = tex;
  return tex;
}

/** Metres above the ground the decals sit; the depth bias below does the real work of beating the terrain and roads. */
const SHADOW_LIFT = 0.08;
/** Depth bias (depth-buffer units) in front of every other ground decal, so a blob always shows over the road or footprint under it. */
const SHADOW_BIAS = -14;

/**
 * One draped mesh of blob decals. Each spot starts as a quad and is split where the ground bends
 * away from it (see drapeOnGround), so a decal on a slope neither floats off the ground nor sinks in.
 */
export function buildContactShadows(spots: ShadowSpot[], ground: (x: number, z: number) => number, grid: number[]): THREE.Mesh {
  const pos: number[] = [], uv: number[] = [];
  for (const s of spots) {
    const r = s.rotY ?? 0, c = Math.cos(r), sn = Math.sin(r);
    const at = (fx: number, fz: number): [number, number] => {
      const lx = (fx - 0.5) * s.w, lz = (fz - 0.5) * s.d;
      return [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
    };
    // corners (fx, fz) counter-clockwise seen from above: (0,0) (0,1) (1,0) / (1,0) (0,1) (1,1)
    for (const [fx, fz] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]) {
      const [x, z] = at(fx, fz);
      pos.push(x, 0, z);
      uv.push(fx, 1 - fz);
    }
  }
  const flat = new THREE.BufferGeometry();
  flat.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  flat.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const g = drapeOnGround(flat, ground, SHADOW_LIFT, grid);
  flat.dispose();
  const m = new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, depthWrite: false, opacity: 1,
    polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: SHADOW_BIAS,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false; // single spread-out mesh; keep simple (1 draw either way)
  return mesh;
}
