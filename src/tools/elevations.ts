// Dev-only drawings page for plan-built key buildings (tools/elevations.html): a
// thin wrapper round the reconstruction viewer's BuildingInspector, laying out
// every drawing, the 3D view, the plan and the notes on one page.
//   http://localhost:5173/tools/elevations.html?id=baths
import * as THREE from 'three';
import type { BuildingPlan, Lod } from '../presentation/kit/planBuilding.js';
import { BuildingInspector, type InspectorMode } from '../presentation/inspector/BuildingInspector.js';
import { PlanDrawing } from '../presentation/inspector/planDrawing.js';
import { loadAboutNotes } from '../presentation/inspector/aboutNotes.js';
import { miniMarkdown } from '../presentation/inspector/miniMarkdown.js';
import { bakeGrainTexture } from '../presentation/kit/wallBake.js';

const id = new URLSearchParams(location.search).get('id') ?? 'baths';
const plan = (await (await fetch(`/assets/key-plans/${id}.plan.json`)).json()) as BuildingPlan;
document.getElementById('title')!.textContent = `${plan.name ?? id}: elevation drawings`;
void loadAboutNotes(id).then((md) => { document.getElementById('about')!.innerHTML = miniMarkdown(md ?? ''); });

// One renderer for every view (as in the game); the Materials mode's wall grain is baked on it.
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
bakeGrainTexture(renderer);
const inspector = new BuildingInspector(plan, { renderer, surfaceStyle: 'hybrid' });
const main = document.getElementById('views')!;
for (const spec of inspector.drawingSpecs) inspector.addView(spec, main);
inspector.addView({ ...inspector.modelSpec, aspect: 2 }, main);
const planFig = document.createElement('figure');
planFig.className = 'wide';
const planWrap = document.createElement('div');
planWrap.className = 'view';
planWrap.style.aspectRatio = '4 / 5';
planWrap.style.maxHeight = '80vh';
planFig.append(planWrap);
const planCap = document.createElement('figcaption');
planCap.innerHTML = '<b>Plan</b>: drawn from the plan file; north is up.';
const planKey = document.createElement('div');
planCap.append(planKey);
planFig.append(planCap);
main.append(planFig);
const planDrawing = new PlanDrawing(plan, planWrap, planKey);

const t = inspector.trisByLod;
const showTris = (): void => {
  document.getElementById('tris')!.textContent =
    `triangles: LOD0 ${t[0].toLocaleString()} · LOD1 ${t[1].toLocaleString()} · LOD2 ${t[2].toLocaleString()} (showing LOD${inspector.lod})`;
};
showTris();
const press = (sel: string, on: (b: HTMLButtonElement) => boolean): void =>
  document.querySelectorAll<HTMLButtonElement>(sel).forEach((b) => b.setAttribute('aria-pressed', String(on(b))));
for (const m of ['ev', 'mat', 'plain'] as InspectorMode[]) {
  document.getElementById(`mode-${m}`)!.addEventListener('click', () => {
    press('#mode-ev,#mode-mat,#mode-plain', (b) => b.id === `mode-${m}`);
    inspector.setMode(m);
    planDrawing.setMode(m);
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-lod]').forEach((b) => b.addEventListener('click', () => {
  press('[data-lod]', (x) => x === b);
  inspector.setLod(Number(b.dataset.lod) as Lod);
  showTris();
}));
