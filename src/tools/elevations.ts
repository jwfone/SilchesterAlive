// Dev-only drawings page for plan-built key buildings (tools/elevations.html).
// Renders the real generator output as measured orthographic elevations and
// sections (plus a 3D view), coloured by evidence level or by material.
//   http://localhost:5173/tools/elevations.html?id=baths
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildFromPlan, type BuildingPlan, type Lod } from '../presentation/kit/planBuilding.js';
import { createTiledAtlasMaterial } from '../presentation/kit/atlasTiled.js';
import { miniMarkdown } from '../presentation/inspector/miniMarkdown.js';

interface ViewDef {
  id: string; caption: string; wide?: boolean; aspect: number;
  ortho?: { eye: THREE.Vector3; target: THREE.Vector3; width: number; yMid: number; clip?: THREE.Plane };
}

const id = new URLSearchParams(location.search).get('id') ?? 'baths';
const plan = (await (await fetch(`/assets/key-plans/${id}.plan.json`)).json()) as BuildingPlan;
document.getElementById('title')!.textContent = `${id}: elevation drawings`;
void fetch(`/assets/key-plans/${id}.about.md`).then((r) => (r.ok ? r.text() : '')).then((md) => {
  document.getElementById('about')!.innerHTML = miniMarkdown(md);
});

// Model space: x = u (east-ish), z = -v (north-ish = -z). Baths: u 0..29, v 0..66.
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const views: ViewDef[] = [
  { id: 'north', aspect: 16 / 7, caption: '<b>Street front</b>: north elevation, seen from the street (east is on the left).',
    ortho: { eye: V(14.5, 5, -200), target: V(14.5, 5, -33), width: 36, yMid: 5 } },
  { id: 'xsec', aspect: 16 / 7, caption: '<b>Section through the hot rooms</b>: cut across the caldarium (v = 20) looking north; tepidaria, cold room and changing hall rise behind.',
    ortho: { eye: V(14.5, 5, 200), target: V(14.5, 5, -33), width: 36, yMid: 5, clip: new THREE.Plane(V(0, 0, -1), -20) } },
  { id: 'long', wide: true, aspect: 5.2, caption: '<b>Long section on the central axis</b> (u = 12.45) looking west: street portico and entrance (right), palaestra, apodyterium, frigidarium with labrum, tepidarium, caldarium and second caldarium (left).',
    ortho: { eye: V(200, 5, -33), target: V(12.45, 5, -33), width: 72, yMid: 5.5, clip: new THREE.Plane(V(-1, 0, 0), 12.45) } },
  { id: 'west', wide: true, aspect: 5.2, caption: '<b>West elevation</b>: long side seen from the west (north on the left). The window over the cold bath is where the 1903–4 excavators found window glass.',
    ortho: { eye: V(-200, 5, -33), target: V(14.5, 5, -33), width: 72, yMid: 5.5 } },
  { id: '3d', wide: true, aspect: 16 / 8, caption: '<b>3D view</b>: drag to turn, scroll to zoom.' },
];

const main = document.getElementById('views')!;
interface Live { def: ViewDef; renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera; mesh: THREE.Mesh; edges: THREE.LineSegments; overlay: HTMLCanvasElement; ruler: HTMLDivElement; controls?: OrbitControls }
const live: Live[] = [];

for (const def of views) {
  const fig = document.createElement('figure');
  if (def.wide) fig.className = 'wide';
  const wrap = document.createElement('div');
  wrap.className = 'view';
  wrap.style.aspectRatio = String(def.aspect);
  const overlay = document.createElement('canvas');
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true }); // stencil: section caps
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.domElement.style.position = 'relative';
  const ruler = document.createElement('div');
  ruler.className = 'ruler';
  wrap.append(overlay, renderer.domElement, ruler);
  const cap = document.createElement('figcaption');
  cap.innerHTML = def.caption;
  fig.append(wrap, cap);
  main.append(fig);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  scene.add(sun, sun.target);
  let camera: THREE.Camera;
  let controls: OrbitControls | undefined;
  if (def.ortho) {
    const o = def.ortho;
    const cam = new THREE.OrthographicCamera(-o.width / 2, o.width / 2, o.width / def.aspect / 2, -o.width / def.aspect / 2, 0.1, 1000);
    cam.position.copy(o.eye); cam.lookAt(o.target);
    // shift so yMid is the vertical centre
    cam.position.y = o.yMid; cam.lookAt(o.target.x, o.yMid, o.target.z);
    camera = cam;
    // light from the viewer's upper left
    const right = new THREE.Vector3().subVectors(o.target, o.eye).normalize().cross(V(0, 1, 0));
    sun.position.copy(o.target).add(new THREE.Vector3().subVectors(o.eye, o.target).normalize().multiplyScalar(40)).add(right.multiplyScalar(-25)).add(V(0, 35, 0));
    sun.target.position.copy(o.target);
  } else {
    const cam = new THREE.PerspectiveCamera(35, def.aspect, 0.5, 1000);
    cam.position.set(58, 42, 12); camera = cam;
    controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(14.5, 2, -33); controls.update();
    sun.position.set(60, 80, 30); sun.target.position.set(14.5, 0, -33);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2).translate(14.5, -0.02, -33), new THREE.MeshLambertMaterial({ color: 0x8fa27a })));
  }
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.renderOrder = 6;
  // Section cap ("poché"): stencil-count back minus front faces behind the cut
  // plane, then fill the plane wherever the count is odd (inside masonry).
  if (def.ortho?.clip) {
    const clip = def.ortho.clip;
    const stencilMat = (side: THREE.Side, op: THREE.StencilOp): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
      side, clippingPlanes: [clip], depthWrite: false, depthTest: false, colorWrite: false,
      stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op,
    });
    const back = new THREE.Mesh(mesh.geometry, stencilMat(THREE.BackSide, THREE.IncrementWrapStencilOp));
    const front = new THREE.Mesh(mesh.geometry, stencilMat(THREE.FrontSide, THREE.DecrementWrapStencilOp));
    back.renderOrder = front.renderOrder = 1;
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({
      color: 0x3b342b, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    }));
    cap.renderOrder = 1.1;
    clip.coplanarPoint(cap.position);
    cap.lookAt(cap.position.clone().sub(clip.normal)); // face the camera (on the cut-away side)
    cap.onAfterRender = (r) => r.clearStencil();
    scene.add(back, front, cap);
    mesh.userData.stencil = [back, front];
  }
  const edges = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x2a241c, transparent: true, opacity: 0.45, clippingPlanes: def.ortho?.clip ? [def.ortho.clip] : [] }));
  scene.add(mesh, edges);
  const l: Live = { def, renderer, scene, camera, mesh, edges, overlay, ruler, controls };
  controls?.addEventListener('change', () => draw(l));
  live.push(l);
}

let mode: 'ev' | 'mat' | 'plain' = 'ev';
let lod: Lod = 0;
const trisByLod: number[] = [];
for (const L of [0, 1, 2] as Lod[]) trisByLod[L] = buildFromPlan(plan, { lod: L }).tris;

function rebuild(): void {
  const built = buildFromPlan(plan, { lod, evidenceColors: true });
  const solid = buildFromPlan(plan, { lod, solidOnly: true }).geometry; // closed solids for section caps
  const edgeGeo = new THREE.EdgesGeometry(built.geometry, 25);
  // all views share one geometry: dispose the previous build once
  live[0].mesh.geometry.dispose(); live[0].edges.geometry.dispose();
  for (const l of live) ((l.mesh.userData.stencil ?? [])[0] as THREE.Mesh | undefined)?.geometry.dispose();
  for (const l of live) {
    const clip = l.def.ortho?.clip ? [l.def.ortho.clip] : [];
    l.mesh.geometry = built.geometry;
    for (const s of (l.mesh.userData.stencil ?? []) as THREE.Mesh[]) s.geometry = solid;
    (l.mesh.material as THREE.Material).dispose?.();
    l.mesh.material = mode === 'ev'
      ? new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: clip, side: THREE.DoubleSide })
      : createTiledAtlasMaterial({ clippingPlanes: clip, side: THREE.DoubleSide }, mode === 'plain' ? 'plain' : 'procedural');
    l.edges.geometry = edgeGeo;
    l.edges.visible = mode === 'ev';
  }
  document.getElementById('tris')!.textContent =
    `triangles: LOD0 ${trisByLod[0].toLocaleString()} · LOD1 ${trisByLod[1].toLocaleString()} · LOD2 ${trisByLod[2].toLocaleString()} (showing LOD${lod})`;
  resize();
}

function resize(): void {
  for (const l of live) {
    const w = l.renderer.domElement.parentElement!.clientWidth, h = Math.round(w / l.def.aspect);
    l.renderer.setSize(w, h, false);
    l.overlay.width = w * devicePixelRatio; l.overlay.height = h * devicePixelRatio;
    draw(l);
  }
}

// Background grid (1 m faint, 5 m stronger, ground line) and height ruler for ortho views.
function draw(l: Live): void {
  l.renderer.render(l.scene, l.camera);
  const o = l.def.ortho;
  const ctx = l.overlay.getContext('2d')!;
  ctx.clearRect(0, 0, l.overlay.width, l.overlay.height);
  l.ruler.innerHTML = '';
  if (!o) return;
  const W = l.overlay.width, H = l.overlay.height, mPerPx = o.width / W, hM = o.width / l.def.aspect;
  const top = o.yMid + hM / 2;
  const yPx = (y: number): number => (top - y) / mPerPx;
  for (let y = Math.floor(o.yMid - hM / 2); y <= top; y++) {
    ctx.strokeStyle = y === 0 ? '#5b5246' : y % 5 === 0 ? '#c9c0b0' : '#e7e1d6';
    ctx.lineWidth = (y === 0 ? 2 : 1) * devicePixelRatio;
    ctx.beginPath(); ctx.moveTo(0, yPx(y)); ctx.lineTo(W, yPx(y)); ctx.stroke();
    if (y >= 0 && y % 2 === 0) {
      const d = document.createElement('div');
      d.style.top = `${(yPx(y) / H) * 100}%`;
      d.textContent = `${y} m`;
      l.ruler.append(d);
    }
  }
  for (let x = 0; x * 1 <= o.width; x++) {
    if (x % 5) continue;
    ctx.strokeStyle = '#efe9df'; ctx.lineWidth = devicePixelRatio;
    ctx.beginPath(); ctx.moveTo(x / mPerPx, 0); ctx.lineTo(x / mPerPx, H); ctx.stroke();
  }
  // 10 m scale bar
  const bx = W - 12 * devicePixelRatio - 10 / mPerPx, by = H - 14 * devicePixelRatio;
  ctx.fillStyle = '#23201b';
  for (let i = 0; i < 10; i += 2) ctx.fillRect(bx + i / mPerPx, by, 1 / mPerPx, 5 * devicePixelRatio);
  ctx.strokeStyle = '#23201b'; ctx.lineWidth = devicePixelRatio; ctx.strokeRect(bx, by, 10 / mPerPx, 5 * devicePixelRatio);
  ctx.font = `${11 * devicePixelRatio}px system-ui`; ctx.fillText('10 m', bx, by - 4 * devicePixelRatio);
}

const press = (sel: string, on: (b: HTMLButtonElement) => boolean): void =>
  document.querySelectorAll<HTMLButtonElement>(sel).forEach((b) => b.setAttribute('aria-pressed', String(on(b))));
for (const m of ['ev', 'mat', 'plain'] as const) {
  document.getElementById(`mode-${m}`)!.addEventListener('click', () => { mode = m; press('#mode-ev,#mode-mat,#mode-plain', (b) => b.id === `mode-${m}`); rebuild(); });
}
document.querySelectorAll<HTMLButtonElement>('[data-lod]').forEach((b) => b.addEventListener('click', () => {
  lod = Number(b.dataset.lod) as Lod; press('[data-lod]', (x) => x === b); rebuild();
}));
addEventListener('resize', resize);
rebuild();
