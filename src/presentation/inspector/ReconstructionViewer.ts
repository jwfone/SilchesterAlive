// In-game reconstruction viewer: a full-screen overlay with tabs (3D model,
// Drawings, Plan, How it was made), the Evidence / Materials / Plain toolbar with
// its legend, and a small "Technical" toggle for level of detail. Loaded with
// import() the first time it is opened, so it adds nothing to start-up; the
// notes Markdown is fetched only when its tab is shown. The game pauses while
// it is open and lends its renderer (see BuildingInspector).
import type * as THREE from 'three';
import type { BuildingPlan, Lod } from '../kit/planBuilding.js';
import type { SurfaceStyle } from '../kit/atlasTiled.js';
import { BuildingInspector, type InspectorMode } from './BuildingInspector.js';
import { PlanDrawing } from './planDrawing.js';
import { loadAboutNotes } from './aboutNotes.js';
import { miniMarkdown } from './miniMarkdown.js';
import { EV_COLOR, EV_LABEL } from './elementInfo.js';
import './reconstruction.css';

export interface ReconstructionViewerOptions {
  renderer?: THREE.WebGLRenderer;
  surfaceStyle?: SurfaceStyle;
  /** Touch controls: say "tap" rather than "point at". */
  touch?: boolean;
  onClose: () => void;
}

type TabId = 'model' | 'drawings' | 'plan' | 'notes';
const TABS: Array<[TabId, string]> = [['model', '3D model'], ['drawings', 'Drawings'], ['plan', 'Plan'], ['notes', 'How it was made']];
const MODES: Array<[InspectorMode, string]> = [['ev', 'Evidence'], ['mat', 'Materials'], ['plain', 'Plain']];

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

export class ReconstructionViewer {
  private readonly root = h('div', 'rv');
  private readonly inspector: BuildingInspector;
  private plan: PlanDrawing | null = null;
  private readonly panels = new Map<TabId, HTMLElement>();
  private readonly tabs = new Map<TabId, HTMLButtonElement>();
  private readonly built = new Set<TabId>();
  private readonly live = h('div', 'rv-sr');
  private readonly legend = h('p', 'rv-legend');
  /** Toolbar and hint: hidden on the notes tab, where they do nothing. */
  private readonly chrome: HTMLElement[] = [];
  private returnFocus: Element | null = null;
  private closed = false;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (e.key === 'Tab') this.trapFocus(e);
  };

  constructor(private readonly buildingPlan: BuildingPlan, private readonly opts: ReconstructionViewerOptions) {
    const name = buildingPlan.name ?? buildingPlan.id;
    const root = this.root;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'rv-title');

    // Header: title and close.
    const head = h('header', 'rv-head');
    const titles = h('div');
    titles.append(h('div', 'rv-kicker', `Reconstruction${buildingPlan.dateShown ? ` · as it may have looked ${buildingPlan.dateShown}` : ''}`));
    const title = h('h2', undefined, name);
    title.id = 'rv-title';
    titles.append(title);
    const close = h('button', 'rv-close');
    close.type = 'button';
    close.innerHTML = '× Close <kbd>Esc</kbd>';
    close.setAttribute('aria-label', 'Close the reconstruction and return to the town');
    close.addEventListener('click', () => this.close());
    head.append(titles, close);

    // Tabs.
    const tablist = h('div', 'rv-tabs');
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Views of the reconstruction');
    for (const [id, label] of TABS) {
      const tab = h('button', 'rv-tab', label);
      tab.type = 'button';
      tab.id = `rv-tab-${id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `rv-panel-${id}`);
      tab.addEventListener('click', () => this.showTab(id));
      this.tabs.set(id, tab);
      tablist.append(tab);
    }
    tablist.addEventListener('keydown', (e) => {
      const ids = TABS.map(([id]) => id), cur = ids.findIndex((id) => this.tabs.get(id) === document.activeElement);
      if (cur < 0) return;
      const next = e.key === 'ArrowRight' ? (cur + 1) % ids.length : e.key === 'ArrowLeft' ? (cur + ids.length - 1) % ids.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : -1;
      if (next < 0) return;
      e.preventDefault();
      this.showTab(ids[next]);
      this.tabs.get(ids[next])!.focus();
    });

    // Toolbar: colouring, legend, technical.
    const tools = h('div', 'rv-tools');
    const seg = h('div', 'rv-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Colour the model by');
    const modeButtons: HTMLButtonElement[] = [];
    for (const [mode, label] of MODES) {
      const b = h('button', undefined, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(mode === 'ev'));
      b.addEventListener('click', () => {
        for (const x of modeButtons) x.setAttribute('aria-pressed', String(x === b));
        this.inspector.setMode(mode);
        this.plan?.setMode(mode);
        this.legend.hidden = mode !== 'ev';
      });
      modeButtons.push(b);
      seg.append(b);
    }
    for (const ev of ['S', 'C', 'X'] as const) {
      const item = h('span');
      const sw = h('i');
      sw.style.background = EV_COLOR[ev];
      item.append(sw, EV_LABEL[ev]);
      this.legend.append(item);
    }
    const grey = h('span');
    const sw = h('i');
    sw.style.background = '#ccc7bd';
    grey.append(sw, 'Floors, wall tops');
    this.legend.append(grey);
    const tech = h('label', 'rv-tech');
    const techBox = h('input');
    techBox.type = 'checkbox';
    tech.append(techBox, 'Technical');
    const techPanel = h('div', 'rv-techpanel');
    techPanel.hidden = true;
    techBox.addEventListener('change', () => { techPanel.hidden = !techBox.checked; });
    tools.append(seg, this.legend, tech, techPanel);

    // Panels.
    const body = h('div', 'rv-body');
    for (const [id] of TABS) {
      const p = h('section', `rv-panel rv-panel-${id}`);
      p.id = `rv-panel-${id}`;
      p.setAttribute('role', 'tabpanel');
      p.setAttribute('aria-labelledby', `rv-tab-${id}`);
      p.tabIndex = id === 'notes' || id === 'drawings' ? 0 : -1; // scrollable panels take keyboard focus
      p.hidden = true;
      this.panels.set(id, p);
      body.append(p);
    }
    const hint = h('p', 'rv-hint', `${opts.touch ? 'Tap' : 'Point at'} any part of the model, drawings or plan to see what it is and how we know.`);
    this.live.setAttribute('aria-live', 'polite');
    this.chrome.push(tools, hint);
    root.append(head, tablist, tools, hint, body, this.live);

    this.inspector = new BuildingInspector(buildingPlan, {
      renderer: opts.renderer, surfaceStyle: opts.surfaceStyle, tooltipHost: root,
      onPick: (text) => { this.live.textContent = text ?? ''; },
    });
    // Technical: level of detail and triangle counts.
    const t = this.inspector.trisByLod;
    techPanel.append('Level of detail ');
    const lodButtons: HTMLButtonElement[] = [];
    for (const L of [0, 1, 2] as Lod[]) {
      const b = h('button', undefined, String(L));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(L === 0));
      b.setAttribute('aria-label', `Level of detail ${L}: ${t[L].toLocaleString()} triangles`);
      b.addEventListener('click', () => {
        for (const x of lodButtons) x.setAttribute('aria-pressed', String(x === b));
        this.inspector.setLod(L);
      });
      lodButtons.push(b);
      techPanel.append(b);
    }
    techPanel.append(h('span', 'rv-tris', `Triangles: ${t[0].toLocaleString()} (walk-in) · ${t[1].toLocaleString()} (near) · ${t[2].toLocaleString()} (far)`));
  }

  open(): void {
    this.returnFocus = document.activeElement;
    document.body.append(this.root);
    document.addEventListener('keydown', this.onKey, true);
    this.showTab('model');
    this.tabs.get('model')!.focus();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    document.removeEventListener('keydown', this.onKey, true);
    this.inspector.dispose();
    this.plan?.dispose();
    this.root.remove();
    if (this.returnFocus instanceof HTMLElement && this.returnFocus.isConnected) this.returnFocus.focus();
    this.opts.onClose();
  }

  private showTab(id: TabId): void {
    for (const [tid, tab] of this.tabs) {
      const on = tid === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      this.panels.get(tid)!.hidden = !on;
    }
    for (const el of this.chrome) el.hidden = id === 'notes';
    this.inspector.clearPick();
    this.plan?.hideTip();
    if (!this.built.has(id)) { this.built.add(id); this.buildTab(id); }
  }

  private buildTab(id: TabId): void {
    const panel = this.panels.get(id)!;
    if (id === 'model') {
      this.inspector.addView(this.inspector.modelSpec, panel);
    } else if (id === 'drawings') {
      const grid = h('div', 'rv-drawings');
      for (const spec of this.inspector.drawingSpecs) this.inspector.addView(spec, grid);
      panel.append(grid);
      const note = h('p', 'rv-note', 'Drawn to scale: heights in metres on the left, a 10 m scale bar bottom right. Dark fill marks walls cut by a section.');
      panel.append(note);
    } else if (id === 'plan') {
      const wrap = h('div', 'rv-plan');
      const canvasBox = h('div', 'rv-plan-canvas');
      const side = h('aside', 'rv-plan-side');
      side.append(h('h3', undefined, 'Plan'), h('p', undefined, 'Drawn from the excavated plan; north is up. Pink rooms were heated from below (hypocausts); blue marks the plunge baths and basin.'));
      const key = h('div', 'rv-plan-key');
      side.append(key);
      wrap.append(canvasBox, side);
      panel.append(wrap);
      this.plan = new PlanDrawing(this.buildingPlan, canvasBox, key, this.root, (text) => { this.live.textContent = text ?? ''; });
      this.plan.setMode(this.inspector.mode);
    } else {
      const article = h('article', 'rv-notes', 'Loading…');
      panel.append(article);
      void loadAboutNotes(this.buildingPlan.id).then((md) => {
        article.innerHTML = md ? miniMarkdown(md) : '<p>No notes yet for this building.</p>';
      }, () => { article.textContent = 'The notes could not be loaded.'; });
    }
  }

  private trapFocus(e: KeyboardEvent): void {
    const focusable = [...this.root.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!this.root.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
