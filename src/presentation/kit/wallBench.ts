import * as THREE from 'three';
import { cellVec, CELL_TILE_M, createTiledAtlasMaterial, type SurfaceStyle } from './atlasTiled.js';

// Start-up GPU test for the Auto quality tier: render a wall that fills the screen
// (off-screen, at the canvas's real drawing-buffer size) with the High style and with
// Plain, a few synchronised frames each, and return the extra milliseconds High costs.
// Mirrors the materials lab benchmark (tools/materials.html) at a fraction of the frames.

function wallQuad(widthM: number, heightM: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(2, 2);
  const [tw, th] = CELL_TILE_M.masonry;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * widthM) / tw, (uv.getY(i) * heightM) / th);
  const c = cellVec('masonry');
  g.setAttribute('cellRect', new THREE.Float32BufferAttribute(Array.from({ length: uv.count }, () => c).flat(), 4));
  return g;
}

/**
 * Extra ms per frame High costs over Plain: the best (lowest) of several rounds, since
 * a single run on a laptop GPU is easily inflated by power state, throttling or shader
 * compilation, and the result decides the tier.
 */
export function measureWallCost(renderer: THREE.WebGLRenderer, frames = 6, rounds = 3): number {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y);
  // ~6 m of wall across the screen: about what fills the view when standing close.
  const geo = wallQuad(6, (6 * size.y) / size.x);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  const mesh = new THREE.Mesh(geo);
  mesh.position.z = -1;
  scene.add(mesh);
  const gl = renderer.getContext(), px = new Uint8Array(4);
  const prev = renderer.getRenderTarget();
  const mats: Record<'plain' | 'high', THREE.Material> = {
    plain: createTiledAtlasMaterial({}, 'plain'),
    high: createTiledAtlasMaterial({}, 'hybrid'),
  };
  const time = (mat: THREE.Material): number => {
    mesh.material = mat;
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) { renderer.render(scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return (performance.now() - t0) / frames;
  };
  try {
    renderer.setRenderTarget(rt);
    for (const mat of Object.values(mats)) { // warm-up: compile + first draw, not timed
      mesh.material = mat;
      renderer.render(scene, cam);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    let best = Infinity;
    for (let r = 0; r < rounds; r++) best = Math.min(best, time(mats.high) - time(mats.plain));
    return Math.max(0, best);
  } finally {
    renderer.setRenderTarget(prev);
    for (const mat of Object.values(mats)) mat.dispose();
    rt.dispose(); geo.dispose();
  }
}
