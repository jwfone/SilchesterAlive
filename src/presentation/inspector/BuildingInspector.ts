// Reconstruction viewer core for plan-built key buildings: measured orthographic
// elevations and sections (with section caps, 1 m grid, height ruler and scale
// bar) plus a spinnable 3D model, coloured by evidence or by material, with
// hover / tap notes on each part. Used by the in-game viewer
// (ReconstructionViewer) and the dev drawings page (tools/elevations.html).
//
// One WebGL renderer draws every view: each view is rendered into a viewport
// and scissor at the corner of the renderer's drawing buffer, then copied onto
// that view's own 2D canvas. So the game can lend its renderer (no extra WebGL
// context, which phones limit) and the views stay ordinary DOM that scrolls.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildFromPlan, elementAtFace, elementTriangles, type BuildingPlan, type Lod, type PlanBuild, type PlanElement } from '../kit/planBuilding.js';
import { createTiledAtlasMaterial, type SurfaceStyle } from '../kit/atlasTiled.js';
import { describeElement } from './elementInfo.js';
import { miniInline } from './miniMarkdown.js';
import { Tooltip } from './tooltip.js';
import type { PlanDrawing } from '../../domain/keyPlan.js';

export type InspectorMode = 'ev' | 'mat' | 'plain';

export interface ViewSpec {
  id: string;
  /** Caption, Markdown inline (**bold**). */
  caption: string;
  /** Full-width in a two-column layout. */
  wide: boolean;
  /** Width / height; undefined = fill the host element. */
  aspect?: number;
  ortho?: { dir: THREE.Vector3; target: THREE.Vector3; width: number; height: number; yMid: number; clip?: THREE.Plane };
}

export interface InspectorOptions {
  /** Renderer to borrow (the game's). Its size, pixel ratio and clipping are restored on dispose. */
  renderer?: THREE.WebGLRenderer;
  /** Wall style for the Materials mode (the game's current quality tier). */
  surfaceStyle?: SurfaceStyle;
  /** Where the hover / tap note is attached (default body). */
  tooltipHost?: HTMLElement;
  /** Called with the picked part's text (or null), e.g. for an aria-live region. */
  onPick?: (text: string | null) => void;
}

interface View {
  spec: ViewSpec;
  fig: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  stencil: THREE.Mesh[];
  highlight: THREE.Mesh;
  groundLine?: THREE.Mesh;
  controls?: OrbitControls;
  /** Frames the 3D camera for the current aspect (until the user moves it). */
  fit?: () => void;
  ro: ResizeObserver;
}

const DIRS: Record<PlanDrawing['from'], THREE.Vector3> = {
  n: new THREE.Vector3(0, 0, 1), s: new THREE.Vector3(0, 0, -1), e: new THREE.Vector3(-1, 0, 0), w: new THREE.Vector3(1, 0, 0),
};
const DEFAULT_DRAWINGS: PlanDrawing[] = [
  { from: 'n', caption: '**North elevation**' }, { from: 's', caption: '**South elevation**' },
  { from: 'e', caption: '**East elevation**' }, { from: 'w', caption: '**West elevation**' },
];
const EV_LINE = 0x2a241c;

export class BuildingInspector {
  readonly drawingSpecs: ViewSpec[];
  readonly modelSpec: ViewSpec;
  mode: InspectorMode = 'ev';
  lod: Lod = 0;
  readonly trisByLod: Record<Lod, number>;
  private build!: PlanBuild;
  private solid!: THREE.BufferGeometry;
  private edgeGeo!: THREE.BufferGeometry;
  private highlightGeo = new THREE.BufferGeometry();
  private highlighted: string | null = null;
  private readonly views: View[] = [];
  private readonly renderer: THREE.WebGLRenderer;
  private readonly ownsRenderer: boolean;
  private readonly saved: { pr: number; size: THREE.Vector2; clipping: boolean };
  private readonly hasStencil: boolean;
  private readonly tip: Tooltip;
  private readonly dirty = new Set<View>();
  private raf = 0;
  private readonly bufSize = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly centre: THREE.Vector3;

  constructor(readonly plan: BuildingPlan, private readonly opts: InspectorOptions = {}) {
    this.ownsRenderer = !opts.renderer;
    this.renderer = opts.renderer ?? new THREE.WebGLRenderer({ antialias: true, stencil: true });
    const r = this.renderer;
    this.saved = { pr: r.getPixelRatio(), size: r.getSize(new THREE.Vector2()), clipping: r.localClippingEnabled };
    this.hasStencil = !!r.getContext().getContextAttributes()?.stencil;
    r.localClippingEnabled = true;
    this.tip = new Tooltip(opts.tooltipHost);
    this.trisByLod = { 0: 0, 1: 0, 2: 0 };
    for (const L of [1, 2] as Lod[]) {
      const b = buildFromPlan(plan, { lod: L });
      this.trisByLod[L] = b.tris;
      b.geometry.dispose();
    }
    this.rebuildGeometry();
    this.trisByLod[0] = this.build.tris;

    // Frame the drawings on the building: plan extent and height.
    this.build.geometry.computeBoundingBox();
    const bb = this.build.geometry.boundingBox!;
    this.centre = bb.getCenter(new THREE.Vector3());
    const maxH = bb.max.y;
    this.drawingSpecs = (plan.drawings ?? DEFAULT_DRAWINGS).map((d, i) => {
      const dir = DIRS[d.from];
      const across = d.from === 'n' || d.from === 's' ? bb.max.x - bb.min.x : bb.max.z - bb.min.z;
      const width = Math.ceil(across + 7), height = maxH + 5, aspect = width / height;
      const target = new THREE.Vector3(this.centre.x, 0, this.centre.z);
      let clip: THREE.Plane | undefined;
      if (d.cut !== undefined) {
        // keep what lies beyond the cut, seen from the viewer's side
        const p0 = d.from === 'n' || d.from === 's' ? new THREE.Vector3(0, 0, -d.cut) : new THREE.Vector3(d.cut, 0, 0);
        clip = new THREE.Plane().setFromNormalAndCoplanarPoint(dir, p0);
      }
      return { id: `drawing-${i}`, caption: d.caption, wide: aspect > 3, aspect, ortho: { dir, target, width, height, yMid: height / 2 - 3, clip } };
    });
    this.modelSpec = { id: 'model', caption: '**3D model**: drag to turn, scroll or pinch to zoom.', wide: true };
  }

  /** Create a view (figure with canvas and caption) inside `host`. */
  addView(spec: ViewSpec, host: HTMLElement, opts: { caption?: boolean } = {}): HTMLElement {
    const fig = document.createElement('figure');
    if (spec.wide) fig.classList.add('wide');
    const wrap = document.createElement('div');
    wrap.className = 'view';
    if (spec.aspect) wrap.style.aspectRatio = String(spec.aspect);
    const canvas = document.createElement('canvas');
    // drawings let the page scroll under a finger; the 3D view takes drags itself
    canvas.style.cssText = `display:block;width:100%;height:100%;touch-action:${spec.ortho ? 'pan-x pan-y' : 'none'}`;
    const plainCaption = spec.caption.replace(/\*\*/g, '');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', plainCaption);
    wrap.append(canvas);
    fig.append(wrap);
    if (opts.caption !== false) {
      const cap = document.createElement('figcaption');
      cap.innerHTML = miniInline(spec.caption);
      fig.append(cap);
    }
    host.append(fig);

    const scene = new THREE.Scene();
    // Drawings: neutral light; the 3D model uses the game's sky and sun (see Game.init).
    const o = spec.ortho;
    scene.add(o ? new THREE.HemisphereLight(0xffffff, 0x8a8070, 1.1) : new THREE.HemisphereLight(0xdfeaff, 0x4a5a3f, 0.95));
    const sun = o ? new THREE.DirectionalLight(0xffffff, 1.6) : new THREE.DirectionalLight(0xfff2dd, 1.6);
    scene.add(sun, sun.target);
    let camera: View['camera'];
    let controls: OrbitControls | undefined;
    let groundLine: THREE.Mesh | undefined;
    let fit: (() => void) | undefined;
    if (o) {
      scene.background = new THREE.Color(0xffffff);
      const cam = new THREE.OrthographicCamera(-o.width / 2, o.width / 2, o.height / 2, -o.height / 2, 0.1, 1000);
      cam.position.copy(o.target).addScaledVector(o.dir, -200).setY(o.yMid);
      cam.lookAt(o.target.x, o.yMid, o.target.z);
      camera = cam;
      // light from the viewer's upper left
      const right = o.dir.clone().cross(new THREE.Vector3(0, 1, 0));
      sun.position.copy(o.target).addScaledVector(o.dir, -40).addScaledVector(right, -25).add(new THREE.Vector3(0, 35, 0));
      sun.target.position.copy(o.target);
      // Drawing grid behind the building: 1 m faint, 5 m stronger; vertical lines every 5 m.
      const pos: number[] = [], col: number[] = [];
      const back = o.target.clone().addScaledVector(o.dir, 80), half = o.width / 2;
      const P = (s: number, y: number): THREE.Vector3 => back.clone().addScaledVector(right, s).setY(y);
      const c = new THREE.Color();
      const line = (a: THREE.Vector3, b: THREE.Vector3, hex: number): void => {
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z); c.set(hex); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      };
      const y0 = Math.floor(o.yMid - o.height / 2), y1 = o.yMid + o.height / 2;
      for (let y = y0; y <= y1; y++) if (y !== 0) line(P(-half, y), P(half, y), y % 5 === 0 ? 0xc9c0b0 : 0xe7e1d6);
      for (let x = 0; x <= o.width; x += 5) line(P(x - half, y0), P(x - half, y1), 0xefe9df);
      const grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
      grid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      grid.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      scene.add(grid);
      // Ground line: a thin strip ~2 px tall (scaled to the canvas in draw()).
      groundLine = new THREE.Mesh(new THREE.PlaneGeometry(o.width, 1), new THREE.MeshBasicMaterial({ color: 0x5b5246 }));
      groundLine.position.copy(o.target).addScaledVector(o.dir, 60);
      groundLine.lookAt(groundLine.position.clone().sub(o.dir));
      scene.add(groundLine);
    } else {
      scene.background = new THREE.Color(0x9db8d6); // the game's sky
      const ext = Math.max(this.build.geometry.boundingBox!.max.x - this.build.geometry.boundingBox!.min.x, this.build.geometry.boundingBox!.max.z - this.build.geometry.boundingBox!.min.z);
      const cam = new THREE.PerspectiveCamera(35, spec.aspect ?? 1.6, 0.5, 1500);
      camera = cam;
      controls = new OrbitControls(cam, canvas);
      controls.target.set(this.centre.x, 2, this.centre.z);
      controls.minDistance = 8;
      controls.maxDistance = ext * 3;
      controls.maxPolarAngle = Math.PI * 0.495;
      // From the street side (north-east), far enough to fit the whole building at the
      // view's current shape; re-fitted on resize until the player turns or zooms.
      const bb = this.build.geometry.boundingBox!, dir = new THREE.Vector3(0.62, 0.55, -0.56).normalize();
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : 0, i & 4 ? bb.max.z : bb.min.z));
      const right = new THREE.Vector3(), up = new THREE.Vector3();
      fit = (): void => {
        // centre the building's box in the frame and move in or out until it fills ~88% of it
        const target = controls!.target.set(this.centre.x, 2, this.centre.z);
        let d = ext * 1.2;
        for (let k = 0; k < 8; k++) {
          cam.position.copy(target).addScaledVector(dir, d);
          cam.lookAt(target);
          cam.updateMatrixWorld();
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          for (const c of corners) {
            const p = c.clone().project(cam);
            x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
          }
          const halfH = d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
          right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
          target.addScaledVector(right, ((x0 + x1) / 2) * halfH * cam.aspect).addScaledVector(up, ((y0 + y1) / 2) * halfH);
          d *= 0.3 + 0.7 * (Math.max(x1 - x0, y1 - y0) / 2 / 0.88);
        }
        cam.position.copy(target).addScaledVector(dir, d);
        controls!.update();
      };
      fit();
      controls.addEventListener('start', () => { fit = undefined; view.fit = undefined; });
      sun.position.copy(this.centre).add(new THREE.Vector3(180, 260, 120));
      sun.target.position.copy(this.centre);
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2).translate(this.centre.x, -0.02, this.centre.z),
        new THREE.MeshLambertMaterial({ color: 0x8fa27a })));
    }

    const mesh = new THREE.Mesh(this.build.geometry);
    mesh.renderOrder = 6;
    const stencil: THREE.Mesh[] = [];
    const clip = o?.clip;
    // Section cap ("poché"): stencil-count back minus front faces behind the cut
    // plane, then fill the plane wherever the count is odd (inside masonry).
    if (clip && this.hasStencil) {
      const stencilMat = (side: THREE.Side, op: THREE.StencilOp): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
        side, clippingPlanes: [clip], depthWrite: false, depthTest: false, colorWrite: false,
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op,
      });
      const backFaces = new THREE.Mesh(this.solid, stencilMat(THREE.BackSide, THREE.IncrementWrapStencilOp));
      const frontFaces = new THREE.Mesh(this.solid, stencilMat(THREE.FrontSide, THREE.DecrementWrapStencilOp));
      backFaces.renderOrder = frontFaces.renderOrder = 1;
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({
        color: 0x3b342b, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
      }));
      cap.renderOrder = 1.1;
      clip.coplanarPoint(cap.position);
      cap.lookAt(cap.position.clone().sub(clip.normal)); // face the viewer (on the cut-away side)
      cap.onAfterRender = (r) => r.clearStencil();
      scene.add(backFaces, frontFaces, cap);
      stencil.push(backFaces, frontFaces);
    }
    const edges = new THREE.LineSegments(this.edgeGeo, new THREE.LineBasicMaterial({
      color: EV_LINE, transparent: true, opacity: 0.45, clippingPlanes: clip ? [clip] : [],
    }));
    const highlight = new THREE.Mesh(this.highlightGeo, new THREE.MeshBasicMaterial({
      color: 0xffd34d, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthFunc: THREE.LessEqualDepth,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, clippingPlanes: clip ? [clip] : [],
    }));
    highlight.renderOrder = 7;
    scene.add(mesh, edges, highlight);

    const ctx = canvas.getContext('2d')!;
    const ro = new ResizeObserver(() => this.requestRender(view));
    const view: View = { spec, fig, canvas, ctx, scene, camera, mesh, edges, stencil, highlight, groundLine, controls, fit, ro };
    ro.observe(canvas);
    this.views.push(view);
    this.applyMaterial(view);
    controls?.addEventListener('change', () => this.requestRender(view));
    controls?.addEventListener('start', () => { this.tip.hide(); });
    this.bindPicking(view);
    this.requestRender(view);
    return fig;
  }

  setMode(mode: InspectorMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const v of this.views) this.applyMaterial(v);
    this.requestRender();
  }

  setLod(lod: Lod): void {
    if (lod === this.lod) return;
    this.lod = lod;
    const old = [this.build.geometry, this.solid, this.edgeGeo];
    this.rebuildGeometry();
    for (const v of this.views) {
      v.mesh.geometry = this.build.geometry;
      v.edges.geometry = this.edgeGeo;
      for (const s of v.stencil) s.geometry = this.solid;
    }
    for (const g of old) g.dispose();
    this.setHighlight(null);
    this.requestRender();
  }

  /** Redraw one view, or all of them, on the next frame (hidden views wait until shown). */
  requestRender(view?: View): void {
    for (const v of view ? [view] : this.views) this.dirty.add(v);
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.flush(); });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const v of this.views) {
      v.ro.disconnect();
      v.controls?.dispose();
      v.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== this.build.geometry && m.geometry !== this.solid && m.geometry !== this.edgeGeo && m.geometry !== this.highlightGeo) m.geometry.dispose();
        for (const mat of ([] as THREE.Material[]).concat((m.material as THREE.Material | THREE.Material[] | undefined) ?? [])) mat.dispose();
      });
    }
    this.views.length = 0;
    this.build.geometry.dispose(); this.solid.dispose(); this.edgeGeo.dispose(); this.highlightGeo.dispose();
    this.tip.dispose();
    const r = this.renderer;
    r.setScissorTest(false);
    r.localClippingEnabled = this.saved.clipping;
    if (this.ownsRenderer) { r.dispose(); return; }
    r.setPixelRatio(this.saved.pr);
    r.setSize(this.saved.size.x, this.saved.size.y, false);
    r.setViewport(0, 0, this.saved.size.x, this.saved.size.y);
  }

  private rebuildGeometry(): void {
    this.build = buildFromPlan(this.plan, { lod: this.lod, evidenceColors: true });
    this.solid = buildFromPlan(this.plan, { lod: this.lod, solidOnly: true }).geometry; // closed solids for section caps
    this.edgeGeo = new THREE.EdgesGeometry(this.build.geometry, 25);
  }

  private applyMaterial(v: View): void {
    const clip = v.spec.ortho?.clip ? [v.spec.ortho.clip] : [];
    (v.mesh.material as THREE.Material).dispose();
    v.mesh.material = this.mode === 'ev'
      ? new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: clip, side: THREE.DoubleSide })
      : createTiledAtlasMaterial({ clippingPlanes: clip, side: THREE.DoubleSide }, this.mode === 'plain' ? 'plain' : (this.opts.surfaceStyle ?? 'hybrid'));
    v.edges.visible = this.mode === 'ev';
  }

  private flush(): void {
    const r = this.renderer;
    const views = [...this.dirty];
    this.dirty.clear();
    for (const v of views) {
      const cw = v.canvas.clientWidth, ch = v.canvas.clientHeight;
      if (cw < 2 || ch < 2) continue; // hidden tab: drawn when shown (ResizeObserver)
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
      if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
      if (v.camera instanceof THREE.PerspectiveCamera && Math.abs(v.camera.aspect - w / h) > 1e-3) {
        v.camera.aspect = w / h;
        v.camera.updateProjectionMatrix();
        v.fit?.();
      }
      const o = v.spec.ortho;
      if (o && v.groundLine) v.groundLine.scale.y = (2 * o.width) / w; // 2 device px
      // Borrowed renderer: work in device pixels and grow the drawing buffer if needed.
      if (r.getPixelRatio() !== 1) r.setPixelRatio(1);
      r.getDrawingBufferSize(this.bufSize);
      if (this.bufSize.x < w || this.bufSize.y < h) {
        r.setSize(Math.max(this.bufSize.x, w), Math.max(this.bufSize.y, h), false);
        r.getDrawingBufferSize(this.bufSize);
      }
      r.setViewport(0, 0, w, h);
      r.setScissor(0, 0, w, h);
      r.setScissorTest(true);
      r.render(v.scene, v.camera);
      r.setScissorTest(false);
      // Viewport (0,0) is the buffer's bottom-left: copy that corner, in the same task.
      v.ctx.drawImage(r.domElement, 0, this.bufSize.y - h, w, h, 0, 0, w, h);
      if (o) this.drawAnnotations(v, w, h, dpr);
    }
  }

  /** Height ruler and 10 m scale bar over an orthographic drawing. */
  private drawAnnotations(v: View, W: number, H: number, dpr: number): void {
    const o = v.spec.ortho!, ctx = v.ctx, mPerPx = o.width / W;
    const top = o.yMid + o.height / 2;
    const yPx = (y: number): number => (top - y) / mPerPx;
    ctx.font = `${11 * dpr}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.fillStyle = '#6b655b';
    for (let y = 0; y <= top; y += 2) {
      ctx.strokeText(`${y} m`, 4 * dpr, yPx(y));
      ctx.fillText(`${y} m`, 4 * dpr, yPx(y));
    }
    const bx = W - 12 * dpr - 10 / mPerPx, by = H - 14 * dpr;
    ctx.fillStyle = '#23201b';
    for (let i = 0; i < 10; i += 2) ctx.fillRect(bx + i / mPerPx, by, 1 / mPerPx, 5 * dpr);
    ctx.strokeStyle = '#23201b'; ctx.lineWidth = dpr; ctx.strokeRect(bx, by, 10 / mPerPx, 5 * dpr);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('10 m', bx, by - 4 * dpr);
  }

  // ---------------- picking ----------------

  private pickAt(v: View, clientX: number, clientY: number): { el: PlanElement; point: THREE.Vector3 } | null {
    const rect = v.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, v.camera);
    const clip = v.spec.ortho?.clip;
    for (const hit of this.raycaster.intersectObject(v.mesh, false)) {
      if (clip && clip.distanceToPoint(hit.point) < 0) continue; // cut away
      if (hit.faceIndex == null) continue;
      const el = elementAtFace(this.build, hit.faceIndex);
      return el ? { el, point: hit.point } : null;
    }
    return null;
  }

  private setHighlight(id: string | null): void {
    if (id === this.highlighted) return;
    this.highlighted = id;
    const g = new THREE.BufferGeometry();
    if (id) {
      const src = this.build.geometry.getAttribute('position').array as Float32Array, out: number[] = [];
      for (const [a, b] of elementTriangles(this.build, id)) for (let i = a * 9; i < b * 9; i++) out.push(src[i]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    }
    this.highlightGeo.dispose();
    this.highlightGeo = g;
    for (const v of this.views) v.highlight.geometry = g;
    this.requestRender();
  }

  /** Show what is under the pointer: hover with a mouse, tap on touch. */
  private bindPicking(v: View): void {
    let down: { x: number; y: number } | null = null;
    let pending: PointerEvent | null = null;
    const show = (e: PointerEvent): void => {
      const hit = this.pickAt(v, e.clientX, e.clientY);
      if (!hit) { this.clearPick(); return; }
      const info = describeElement(this.plan, hit.el, [hit.point.x, -hit.point.z]);
      this.tip.show(info, e.clientX, e.clientY);
      this.setHighlight(hit.el.id);
      this.opts.onPick?.([info.title, ...info.lines].join('. '));
    };
    v.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      if (!pending) requestAnimationFrame(() => { if (pending) show(pending); pending = null; });
      pending = e;
    });
    v.canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { pending = null; this.clearPick(); } });
    v.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; if (e.pointerType !== 'mouse') this.clearPick(); });
    v.canvas.addEventListener('pointerup', (e) => {
      // a tap (not a drag) picks on touch / pen
      if (e.pointerType !== 'mouse' && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) show(e);
      down = null;
    });
  }

  clearPick(): void {
    this.tip.hide();
    this.setHighlight(null);
    this.opts.onPick?.(null);
  }
}
