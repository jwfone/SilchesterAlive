// Dev-only wall materials lab (tools/materials.html): one model, one camera,
// four surface styles side by side, for choosing how plan-built buildings look.
//   http://localhost:5173/tools/materials.html?id=baths
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildFromPlan, type BuildingPlan } from '../presentation/kit/planBuilding.js';
import { createTiledAtlasMaterial, type SurfaceStyle } from '../presentation/kit/atlasTiled.js';
import { bakeGrainTexture, bakeWallTextures } from '../presentation/kit/wallBake.js';

const id = new URLSearchParams(location.search).get('id') ?? 'baths';
const plan = (await (await fetch(`/assets/key-plans/${id}.plan.json`)).json()) as BuildingPlan;

// ?only=weathered,hybrid shows just those styles (bigger panes for close comparison)
const only = new URLSearchParams(location.search).get('only')?.split(',');
const allPanes: Array<{ style: SurfaceStyle; title: string; note: string }> = [
  { style: 'texture', title: 'A · Painted texture (current)', note: 'one 2 × 1.6 m tile, repeated' },
  { style: 'procedural', title: 'B · Generated stonework', note: 'every block and brick its own size and tone' },
  { style: 'weathered', title: 'C · Generated + weathering', note: 'B plus colour drift, damp base, run-off streaks' },
  { style: 'plain', title: 'D · Plain', note: 'flat colour per material' },
  { style: 'baked', title: 'E · Baked C', note: 'C rendered once at load into 16 m seamless tiles' },
  { style: 'hybrid', title: 'F · Hybrid C', note: 'live block layout + small baked grain tile' },
];
const panes = only ? allPanes.filter((p) => only.includes(p.style)) : allPanes;

const stage = document.getElementById('stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setScissorTest(true);
stage.append(renderer.domElement);
const bake = bakeWallTextures(renderer);
const grainBake = bakeGrainTexture(renderer);
document.querySelector('p.note')!.textContent += ` Bake for E: ${bake.ms} ms drawing + ${bake.compileMs} ms shader compile at load, ${(bake.bytes / 1048576).toFixed(1)} MB of GPU memory. Bake for F: ${grainBake.ms} ms, ${(grainBake.bytes / 1048576).toFixed(1)} MB.`;
const labels = panes.map((p) => {
  const d = document.createElement('div');
  d.className = 'label';
  d.innerHTML = `<b>${p.title}</b><span>${p.note}</span>`;
  stage.append(d);
  return d;
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9d6de);
scene.add(new THREE.HemisphereLight(0xeef2ff, 0x7a7060, 1.0));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.9);
sun.position.set(-40, 60, 30); sun.target.position.set(14, 0, -33);
scene.add(sun, sun.target);
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2).translate(14.5, -0.02, -33), new THREE.MeshLambertMaterial({ color: 0x86986e })));

const built = buildFromPlan(plan, { lod: 0 });
const mesh = new THREE.Mesh(built.geometry);
scene.add(mesh);
const mats = panes.map((p) => createTiledAtlasMaterial({}, p.style));

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
// Model space: x = u (east), z = -v (north). West wall at x = 0.45; cold-bath window at v = 33.
const presets: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  detail: [new THREE.Vector3(-1.6, 1.5, -40.2), new THREE.Vector3(0.45, 1.4, -41)],
  close: [new THREE.Vector3(-6, 1.8, -29), new THREE.Vector3(0.45, 3.2, -34)],
  corner: [new THREE.Vector3(-9, 2.2, -69), new THREE.Vector3(1.5, 3, -58)],
  long: [new THREE.Vector3(-4, 1.7, -19), new THREE.Vector3(0.45, 3, -60)],
  street: [new THREE.Vector3(13, 1.8, -80), new THREE.Vector3(13, 3.5, -60)],
  aerial: [new THREE.Vector3(55, 40, 14), new THREE.Vector3(14, 2, -33)],
  aerialN: [new THREE.Vector3(-20, 38, -115), new THREE.Vector3(14, 2, -40)],
};
const setCam = (k: string): void => {
  const [eye, target] = presets[k];
  camera.position.copy(eye); controls.target.copy(target); controls.update();
  document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === k)));
  draw();
};
document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => b.addEventListener('click', () => setCam(b.dataset.cam!)));

function draw(): void {
  const W = stage.clientWidth, H = stage.clientHeight;
  renderer.setSize(W, H, false);
  const narrow = W < 700;
  const cols = narrow ? 1 : Math.min(3, panes.length), rows = Math.ceil(panes.length / cols);
  const pw = Math.floor(W / cols), ph = Math.floor(H / rows);
  camera.aspect = pw / ph; camera.updateProjectionMatrix();
  panes.forEach((_, i) => {
    const cx = (i % cols) * pw, cy = Math.floor(i / cols) * ph;
    // WebGL viewport origin is bottom-left
    renderer.setViewport(cx, H - cy - ph, pw - 2, ph - 2);
    renderer.setScissor(cx, H - cy - ph, pw - 2, ph - 2);
    mesh.material = mats[i];
    renderer.render(scene, camera);
    labels[i].style.left = `${cx + 8}px`; labels[i].style.top = `${cy + 8}px`;
  });
}
// Rough GPU cost per style: full-stage render of the wall close-up, synchronised
// each frame with a 1-pixel readback. Run from the console: await bench(40, 'street')
// Pass size [w, h] to render off-screen at that resolution, e.g. [2400, 1350] = 1080p at the game's 1.25x.
async function bench(frames = 120, view = 'close', size?: [number, number]): Promise<Record<string, number>> {
  setCam(view);
  const [W, H] = size ?? [stage.clientWidth, stage.clientHeight];
  const rt = size ? new THREE.WebGLRenderTarget(W, H, { samples: 4 }) : null;
  renderer.setRenderTarget(rt);
  const gl = renderer.getContext(), px = new Uint8Array(4);
  if (rt) { rt.viewport.set(0, 0, W, H); rt.scissor.set(0, 0, W, H); rt.scissorTest = false; } else { renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); }
  camera.aspect = W / H; camera.updateProjectionMatrix();
  const out: Record<string, number> = {};
  for (let pass = 0; pass < 2; pass++) { // pass 0 warms up shaders
    for (const [i, p] of panes.entries()) {
      mesh.material = mats[i];
      const t0 = performance.now();
      for (let f = 0; f < frames; f++) { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      if (pass) out[p.style] = Math.round(((performance.now() - t0) / frames) * 100) / 100;
    }
  }
  renderer.setRenderTarget(null); rt?.dispose();
  draw();
  return out;
}
(window as unknown as { bench: typeof bench }).bench = bench;
controls.addEventListener('change', draw);
addEventListener('resize', draw);
setCam('close');
