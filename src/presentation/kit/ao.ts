import * as THREE from 'three';

// Baked AO v1: contact-shadow decals (1 instanced transparent draw, zero runtime cost)
// + the stone-base bands already in the atlas UVs. No dynamic lights/shadows needed.

export interface ShadowSpot { x: number; z: number; w: number; d: number; rotY?: number; y?: number }

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

export function buildContactShadows(spots: ShadowSpot[]): THREE.InstancedMesh {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 1,
  });
  const inst = new THREE.InstancedMesh(g, m, Math.max(1, spots.length));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  spots.forEach((s, i) => {
    E.set(0, s.rotY ?? 0, 0); Q.setFromEuler(E);
    P.set(s.x, s.y ?? 0.22, s.z); S.set(s.w, 1, s.d);
    M.compose(P, Q, S);
    inst.setMatrixAt(i, M);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.renderOrder = 1;
  inst.frustumCulled = false; // single spread-out mesh; keep simple (1 draw either way)
  return inst;
}
