import * as THREE from 'three';
import { remapUV } from './atlas.js';

// Gabled tegula/imbrex roof prism with overhang.
// Ridge along local X axis. Footprint w*d, wall-top at y=0, apex at y=rise.
// ~10 tris: 2 slopes (2 quads) + 2 gable triangles + optional underside skip.
// Key buildings keep atlas tile UVs; pass tiled:false for untextured house roofs.
export function buildGableRoofGeometry(
  w = 1,
  d = 1,
  rise = 0.35,
  overhang = 0.12,
  opts: { tiled?: boolean } = {},
): THREE.BufferGeometry {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  // vertices: eaves corners (y=0) + ridge ends (y=rise)
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
  const R0 = [-hw, rise, 0], R1 = [hw, rise, 0];
  const positions: number[] = [
    // south slope (D,C,R1,R0)
    ...D, ...C, ...R1, ...D, ...R1, ...R0,
    // north slope (B,A,R0,R1)
    ...B, ...A, ...R0, ...B, ...R0, ...R1,
    // west gable (A,D,R0)
    ...A, ...D, ...R0,
    // east gable (C,B,R1)
    ...C, ...B, ...R1,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // simple planar UVs per face so tile courses run down-slope
  const uvs: number[] = [];
  const quad = (su: number, sv: number): void => { uvs.push(0, 0, su, 0, su, sv, 0, 0, su, sv, 0, sv); };
  quad(w, 1); quad(w, 1);
  uvs.push(0, 0, 1, 0, 0.5, 1, 1, 0, 1, 1, 0.5, 0);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  if (opts.tiled !== false) remapUV(geo, 'tile', 3, 2);
  return geo;
}
