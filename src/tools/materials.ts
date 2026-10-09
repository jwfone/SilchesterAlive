// Dev-only materials lab (tools/materials.html): one model, one camera,
// surface styles side by side, for choosing how plan-built buildings look.
//   http://localhost:5173/tools/materials.html?id=baths            walls
//   http://localhost:5173/tools/materials.html?id=baths&set=roof   roofs
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildFromPlan, type BuildingPlan } from '../presentation/kit/planBuilding.js';
import { createTiledAtlasMaterial, type SurfaceStyle } from '../presentation/kit/atlasTiled.js';
import { bakeGrainTexture, bakeWallTextures } from '../presentation/kit/wallBake.js';

const id = new URLSearchParams(location.search).get('id') ?? 'baths';
const plan = (await (await fetch(`/assets/key-plans/${id}.plan.json`)).json()) as BuildingPlan;

// ?only=weathered,hybrid shows just those panes (bigger panes for close comparison);
// ?set=roof shows the roof panes (keys roofOld, roof, roofTrim, roofLite; roofOldLite on request).
const params = new URLSearchParams(location.search);
const only = params.get('only')?.split(',');
const roofSet = params.get('set') === 'roof';
interface Pane { key: string; style: SurfaceStyle; title: string; note: string; trim?: false; roof?: boolean; benchOnly?: boolean }
const allPanes: Pane[] = [
  { key: 'texture', style: 'texture', title: 'A · Painted texture (current)', note: 'one 2 × 1.6 m tile, repeated' },
  { key: 'procedural', style: 'procedural', title: 'B · Generated stonework', note: 'every block and brick its own size and tone' },
  { key: 'weathered', style: 'weathered', title: 'C · Generated + weathering', note: 'B plus colour drift, damp base, run-off streaks' },
  { key: 'plain', style: 'plain', title: 'D · Plain', note: 'flat colour per material' },
  { key: 'baked', style: 'baked', title: 'E · Baked C', note: 'C rendered once at load into 16 m seamless tiles' },
  { key: 'hybrid', style: 'hybrid', title: 'F · Hybrid C', note: 'live block layout + small baked grain tile' },
  { key: 'roofOld', style: 'paintedRoof', roof: true, trim: false, title: 'R0 · Painted roof (before)', note: 'one 3.2 × 4 m tile, repeated' },
  { key: 'roof', style: 'hybrid', roof: true, trim: false, title: 'R1 · Generated tiles, no trim', note: 'every tegula and imbrex its own tone; relief in the lighting' },
  { key: 'roofTrim', style: 'hybrid', roof: true, title: 'R2 · High (in the game)', note: 'R1 + ridge / hip cap rows and the tile edge at eaves and verges' },
  { key: 'roofOldLite', style: 'paintedRoofLite', roof: true, trim: false, benchOnly: true, title: 'R0s · Painted roof, Standard walls', note: 'baseline for R3 (?only=roofOldLite,roofLite)' },
  { key: 'roofLite', style: 'hybridLite', roof: true, title: 'R3 · Standard (in the game)', note: 'R2 without fine grain, lichen or repair patches (1 texture read)' },
];
const panes = only ? allPanes.filter((p) => only.includes(p.key)) : allPanes.filter((p) => !!p.roof === roofSet && !p.benchOnly);

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

// Two copies of the model: as in the game (with roof trim: ridge caps, tile edges) and without.
const geoGame = buildFromPlan(plan, { lod: 0 }).geometry;
const geoNoTrim = buildFromPlan(plan, { lod: 0, roofTrim: false }).geometry;
const mesh = new THREE.Mesh(geoGame);
scene.add(mesh);
const mats = panes.map((p) => createTiledAtlasMaterial({}, p.style));
const usePane = (i: number): void => { mesh.material = mats[i]; mesh.geometry = panes[i].trim === false ? geoNoTrim : geoGame; };

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
  // roofs: the apodyterium's north slope from above the ambulatory; from the palaestra court; the roofscape
  roofDetail: [new THREE.Vector3(6, 8.9, -46.6), new THREE.Vector3(7.5, 7.2, -43)],
  roofClose: [new THREE.Vector3(3.5, 9.2, -48.5), new THREE.Vector3(9, 7.2, -41.5)],
  roofCourt: [new THREE.Vector3(16, 1.7, -55), new THREE.Vector3(11, 5.6, -44)],
  roofAerial: [new THREE.Vector3(42, 30, -78), new THREE.Vector3(13, 5, -33)],
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
    usePane(i);
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
      usePane(i);
      const t0 = performance.now();
      for (let f = 0; f < frames; f++) { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      if (pass) out[p.key] = Math.round(((performance.now() - t0) / frames) * 100) / 100;
    }
  }
  renderer.setRenderTarget(null); rt?.dispose();
  draw();
  return out;
}
// Review picture: every pane rendered at pw x ph into one labelled grid (2 columns), as a PNG
// data URL. From the console: await snap('roofClose')
function snap(view: string, pw = 1200, ph = 675): string {
  setCam(view);
  const cols = Math.min(2, panes.length), rows = Math.ceil(panes.length / cols);
  const W = cols * pw, H = rows * ph, pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  camera.aspect = pw / ph; camera.updateProjectionMatrix();
  panes.forEach((_, i) => {
    const x = (i % cols) * pw, y = H - (Math.floor(i / cols) + 1) * ph;
    renderer.setViewport(x, y, pw - 4, ph - 4); renderer.setScissor(x, y, pw - 4, ph - 4);
    usePane(i);
    renderer.render(scene, camera);
  });
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.drawImage(renderer.domElement, 0, 0); // same task as the render: the buffer is still there
  g.font = '600 26px system-ui, sans-serif';
  panes.forEach((p, i) => {
    const x = (i % cols) * pw + 14, y = Math.floor(i / cols) * ph + 14;
    g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillRect(x, y, g.measureText(p.title).width + 24, 44);
    g.fillStyle = '#23201b'; g.fillText(p.title, x + 12, y + 31);
  });
  renderer.setPixelRatio(pr);
  draw();
  return out.toDataURL('image/png');
}
(window as unknown as { bench: typeof bench }).bench = bench;
(window as unknown as { snap: typeof snap }).snap = snap;
controls.addEventListener('change', draw);
addEventListener('resize', draw);
setCam(params.get('cam') ?? (roofSet ? 'roofClose' : 'close'));
