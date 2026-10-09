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

export function measureWallCost(renderer: THREE.WebGLRenderer, frames = 6): number {
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
  const time = (style: SurfaceStyle): number => {
    const mat = createTiledAtlasMaterial({}, style);
    mesh.material = mat;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam); // warm-up: compile + first draw
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) { renderer.render(scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    const ms = (performance.now() - t0) / frames;
    mat.dispose();
    return ms;
  };
  try {
    const plain = time('plain'), high = time('hybrid');
    return Math.max(0, high - plain);
  } finally {
    renderer.setRenderTarget(prev);
    rt.dispose(); geo.dispose();
  }
}
