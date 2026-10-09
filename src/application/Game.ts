import * as THREE from 'three';
import { buildTownPlan, PERF_BUDGET, wallGapIntervals, type TownPlan } from '../domain/townPlan.js';
import { LAYER_STORAGE_KEY, defaultLayerVisibility, parseLayerVisibility, type LayerId } from '../domain/layers.js';
import { decideRenderMode, detectCapabilities } from './quality.js';
import { createRenderer, type RenderAdapter } from '../presentation/rendererFactory.js';
import { buildWorld } from '../presentation/WorldBuilder.js';
import {
  AUTO_TIER_STORAGE_KEY, BUILDING_LOOK_STORAGE_KEY, SLOW_FRAME_MS, SLOW_WINDOW_MS,
  parseAutoTierCache, parseBuildingLook, stepDownTier, tierForLook, tierFromBench,
  type BuildingLook, type QualityTier,
} from '../domain/displaySettings.js';
import { bakeGrainTexture } from '../presentation/kit/wallBake.js';
import { measureWallCost } from '../presentation/kit/wallBench.js';
import type { KeyBuildingDisplay } from '../presentation/kit/planWorld.js';
import type { SurfaceStyle } from '../presentation/kit/atlasTiled.js';
import { KEY_PLANS } from '../domain/keyPlans.generated.js';
import type { ReconstructionViewer } from '../presentation/inspector/ReconstructionViewer.js';
import { GhostController } from './GhostController.js';
import {
  GHOST_COSTUMES, GHOST_COUNT, GHOST_MAX, parseSpokenCostumeIds, SPOKEN_GHOSTS_STORAGE_KEY, type GhostCostumeId,
} from '../domain/ghosts.js';
import { GHOST_COSTUME_LABELS } from '../presentation/kit/ghosts.js';
import { appendTurn, DIALOGUE_COOLDOWN_MS, DIALOGUE_MAX_TURNS, DIALOGUE_RADIUS, FAREWELL_CHOICE, type DialogueTurn } from '../domain/dialogue.js';
import type { PersonaBank } from '../domain/dialogueBank.js';
import { pickChoices, pickFarewell, pickGreeting, pickReply } from '../domain/dialogueBankSelect.js';
import { eraDateLabel, FALLBACK_FAREWELLS, getOfflineReply, NPC_PERSONAS, yearsAgoFromEra, type NpcPersona } from '../domain/npcPersonas.js';
import { cachedBank, clearSeenEver, loadBank, loadSeenEver, prefetchBanks, saveSeenEver } from './DialogueBankClient.js';
import { PlayerControls, hitsPoly, type ControlMode, type TouchDir } from '../presentation/PlayerControls.js';
import {
  COLLECTIBLES_STORAGE_KEY, collectibleSeeds, parseCollectedIds, placeCollectibles,
  type PlacedCollectible,
} from '../domain/collectibles.js';
import {
  CollectibleController, COLLECTIBLE_HEX_COLLECTED, COLLECTIBLE_HEX_UNCOLLECTED,
} from './CollectibleController.js';

/** localStorage key for the desktop / touch-D-pad control mode choice. */
const CONTROL_MODE_KEY = 'silchester.controls';

/** Show the "explore the reconstruction" prompt within this many metres of a rebuilt building. */
const RECON_PROMPT_M = 15;

/** localStorage key for the ghost-NPC toggle (separate from 3D layers). */
const GHOSTS_STORAGE_KEY = 'silchester-ghosts-v1';

export class Game {
  private renderer!: RenderAdapter;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1100);
  private controls!: PlayerControls;
  private clock = new THREE.Clock();
  private plan: TownPlan = buildTownPlan(1234);
  private world = buildWorld(this.plan);
  /** Rendered frames in the current 500ms HUD window (tick runs unthrottled). */
  private frames = 0;
  private lastFpsT = performance.now();
  private fps = 0;
  /** GPU saver: sim runs every vsync, but `render()` is gated to ~30fps
   * active / ~12fps idle (see tick). Dirty flag forces the next render. */
  private lastRenderT = 0;
  private sceneDirty = true;
  private lastRenderPX = Infinity;
  private lastRenderPY = Infinity;
  private lastRenderPZ = Infinity;
  private lastRenderRY = Infinity;
  private lastRenderRX = Infinity;
  private mapOpen = false;
  private terrainCache: HTMLCanvasElement | null = null;
  /** Interactive GIS viewer viewport: centre in local metres + scale in px per metre. */
  private mapView = { cx: 0, cz: 0, scale: 0 };
  private mapNavBound = false;
  /** Overlay canvas for live player/ghost markers (GIS canvas stays static). */
  private markerMapCanvas: HTMLCanvasElement | null = null;
  private markerMapCtx: CanvasRenderingContext2D | null = null;
  /** Reused so the overlay tick does not allocate a Vector3 every vsync. */
  private readonly mapHeading = new THREE.Vector3();
  /** Packed x,z world metres for the GIS ghost overlay (N <= GHOST_MAX). */
  private readonly ghostMapXZ = new Float32Array(GHOST_MAX * 2);
  /** Parallel 0/1 spoken-to flags for ghostMapXZ (same N). */
  private readonly ghostMapSpoken = new Uint8Array(GHOST_MAX);
  /** Overlay pulse is capped at ~24fps so a full-canvas clear never rides vsync. */
  private lastMarkerT = 0;
  private layerVisibility: Record<LayerId, boolean> = defaultLayerVisibility();
  /** "Reconstructed buildings" look (HUD setting) and the tier Auto resolved to. */
  private buildingLook: BuildingLook = 'auto';
  private autoTier: QualityTier = 'high';
  /** Slow-frame watcher for Auto: smoothed tick interval near plan-built buildings. */
  private frameEmaMs = 16;
  private slowSinceT = 0;
  /** Cached physics lists: rebuilt only when layer visibility changes (see applyLayerVisibility). */
  private cachedColliders: import('../presentation/WorldBuilder.js').Collider[] = [];
  private cachedCircles: import('../presentation/PlayerControls.js').CircleCollider[] = [];
  private cachedPolys: import('../presentation/PlayerControls.js').PolyCollider[] = [];
  private cachedBands: import('../presentation/PlayerControls.js').EllipseBand[] = [];
  private physicsDirty = true;
  private drainsBox: HTMLInputElement | null = null;
  private detailMapQueued = false;
  /** Wall-gap intervals per circuit edge, computed once (walls + gates are
   * static). Same `half = 7` default as the 3D mesh/colliders, so map, minimap
   * and model agree on gateway openings without re-sampling every redraw. */
  private wallGaps: Array<Array<[number, number]>> = [];
  private wallGapCache(): Array<Array<[number, number]>> {
    if (!this.wallGaps.length && this.plan.walls.length) {
      this.wallGaps = this.plan.walls.map((a, i) => {
        const b = this.plan.walls[(i + 1) % this.plan.walls.length];
        return wallGapIntervals(a.x, a.z, b.x, b.z, this.plan.gates);
      });
    }
    return this.wallGaps;
  }

  /** Set by layer/resize changes; GIS cache is rebuilt then, not every marker tick. */
  private minimapDirty = true;
  /** Offscreen town plan; live player/ghost/item dots composite on top at ~24fps. */
  private minimapGis: HTMLCanvasElement | null = null;

  /** Rebuild the GIS cache only when layers/size change. Markers are cheap
   * and live on the visible canvas (see drawMinimapMarkers). */
  private maybeDrawMinimapGis(canvas: HTMLCanvasElement): void {
    const W = canvas.width, H = canvas.height;
    if (
      !this.minimapDirty &&
      this.minimapGis &&
      this.minimapGis.width === W &&
      this.minimapGis.height === H
    ) return;
    this.minimapDirty = false;
    this.drawMinimapGis(W, H);
  }
  private ghosts!: GhostController;
  private ghostsVisible = true;
  /** Proximity dialogue: one ghost at a time stops and talks (harvested bank, else curated lines). */
  private dialogueOpen = false;
  private dialogueGhostId: string | null = null;
  private dialogueCheckT = 0;
  private dialogueCooldowns = new Map<string, number>();
  private dialogueHistory: DialogueTurn[] = [];
  private dialogueTurn = 0;
  private dialogueLoading = false;
  private dialogueAbort: AbortController | null = null;
  /** Harvested topic graph for the ghost currently talking. Null uses the short curated lines. */
  private dialogueBank: PersonaBank | null = null;
  private dialogueNodeId: string | null = null;
  /** Choice-button node ids. Slot 3 is always null (farewell). */
  private dialogueChoiceIds: (string | null)[] = [null, null, null, null];
  private dialogueSeen = new Set<string>();
  /** Last reply variant shown per node, so the next meeting can pick another. */
  private dialogueLastReplyIdx = new Map<string, number>();
  /** Discoverable 3D scans: placed markers + collected set (persisted). */
  private collectibles: CollectibleController | null = null;
  private placedCollectibles: PlacedCollectible[] = [];
  private collectedIds = new Set<string>();
  private collectibleOpen = false;
  private collectibleId: string | null = null;
  private inventoryOpen = false;
  /** Costume ids the player has spoken to (persisted). */
  private spokenCostumes = new Set<GhostCostumeId>();
  private ghostsJournalOpen = false;
  private aboutOpen = false;
  /** Ids currently inside discovery radius (edge-trigger: must exit + re-enter). */
  private insideCollectible = new Set<string>();
  private collectCheckT = 0;
  private toastTimer = 0;
  /** Reconstruction viewer (code-split, loaded on first open). Open = game paused. */
  private reconOpen = false;
  private recon: ReconstructionViewer | null = null;
  /** Plan-built building the player is near (prompt shown), if any. */
  private reconNearId: string | null = null;
  private reconCheckT = 0;
  /** The game loop, stopped while the viewer is open. */
  private loop: (() => void) | null = null;

  async init(app: HTMLElement, statsEl: HTMLElement, minimap: HTMLCanvasElement): Promise<void> {
    const tier = decideRenderMode(detectCapabilities());
    // WebGPU is opt-in only (?webgpu or #webgpu): the three/webgpu chunk
    // (~705 KB) downloads solely on that path. The default WebGL2 tier above
    // already matches its pixels (dpr 1.25, fogFar 900).
    const webgpuOptIn = /[?#&]webgpu\b/.test(window.location.search + window.location.hash);
    this.renderer = await createRenderer(tier.dpr, webgpuOptIn);
    console.debug(`[silchester] backend: ${this.renderer.backend} · dpr ${tier.dpr} · draws ${this.world.drawCalls} · tris ~${this.world.tris.toLocaleString()}`);
    app.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x9db8d6);
    this.scene.fog = new THREE.Fog(0x9db8d6, 120, tier.fogFar);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x4a5a3f, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(180, 260, 120);
    if (tier.shadows && 'shadow' in sun) {
      sun.castShadow = false; // greybox: keep baked-only for perf; enable per-key-building later
    }
    this.scene.add(sun);
    this.scene.add(this.world.group);
    // Reconstructed (plan-built) buildings: bake the small wall-grain tile, then pick
    // the look. Auto runs a short GPU test once per GPU (cached) to choose its tier.
    if (this.renderer.webgl) bakeGrainTexture(this.renderer.webgl);
    this.buildingLook = parseBuildingLook(localStorage.getItem(BUILDING_LOOK_STORAGE_KEY));
    if (this.buildingLook === 'auto') this.autoTier = this.resolveAutoTier();
    this.applyBuildingLook();
    // Ghost NPCs: street-walking cloak figures (own toggle, not a 3D layer).
    this.ghosts = new GhostController(this.plan, GHOST_COUNT);
    this.scene.add(this.ghosts.group);
    this.ghostsVisible = this.parseGhostsVisible(localStorage.getItem(GHOSTS_STORAGE_KEY));
    this.ghosts.setVisible(this.ghostsVisible);
    // Discoverable 3D scans: seeded scatter (explicit x/z pass through, so
    // items can be pinned to exact find-spots later without code changes).
    this.placedCollectibles = placeCollectibles(collectibleSeeds(), this.plan);
    this.collectibles = new CollectibleController(this.placedCollectibles, this.world.groundY);
    this.scene.add(this.collectibles.group);
    for (const id of parseCollectedIds(localStorage.getItem(COLLECTIBLES_STORAGE_KEY))) {
      if (this.placedCollectibles.some((p) => p.id === id)) this.collectedIds.add(id);
    }
    this.collectibles.setCollected(this.collectedIds);
    for (const id of parseSpokenCostumeIds(localStorage.getItem(SPOKEN_GHOSTS_STORAGE_KEY))) {
      this.spokenCostumes.add(id);
    }
    prefetchBanks(GHOST_COSTUMES);
    this.layerVisibility = parseLayerVisibility(localStorage.getItem(LAYER_STORAGE_KEY));
    this.applyLayerVisibility();

    if (this.world.drawCalls > PERF_BUDGET.maxDrawCalls) {
      console.warn(`[perf] draw calls ${this.world.drawCalls} exceed budget ${PERF_BUDGET.maxDrawCalls}`);
    }

    this.controls = new PlayerControls(this.camera, this.renderer.domElement);
    // Spawn outside the real south gate (GIS-derived when imported), facing
    // inward so the player can walk straight into town through the gateway.
    // Nudge to collision-free ground: spawning inside any box freezes movement
    // (tryMoveBox blocks all directions), so walk further outward until free.
    const sg = this.plan.gates.find((g) => g.id === 'south-gate') ?? { x: 15, z: 270 };
    let ccx = 0, ccz = 0;
    for (const w of this.plan.walls) { ccx += w.x; ccz += w.z; }
    ccx /= Math.max(1, this.plan.walls.length); ccz /= Math.max(1, this.plan.walls.length);
    const inw = Math.hypot(ccx - sg.x, ccz - sg.z) || 1;
    const idx = (ccx - sg.x) / inw, idz = (ccz - sg.z) / inw;
    const blocked = (x: number, z: number, r: number): boolean =>
      this.world.colliders.some((c) => x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) ||
      this.world.polys.some((p) => hitsPoly(x, z, r, p));
    let sx = sg.x - idx * 15, sz = sg.z - idz * 15, guard = 0;
    while (blocked(sx, sz, 0.6) && guard++ < 40) { sx -= idx * 2; sz -= idz * 2; }
    // Face inward: forward is (-sin yaw, -cos yaw), so yaw = atan2(-idx, -idz).
    this.controls.spawn(sx, sz, Math.atan2(-idx, -idz));
    this.camera.position.y = this.world.groundY(sx, sz) + this.controls.eyeHeight;
    // Dev only: ?at=x,z[,headingDeg] spawns elsewhere (e.g. ?at=164,95,180 at the baths' street front).
    if (import.meta.env.DEV) {
      const at = /[?&#]at=(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?/.exec(window.location.search + window.location.hash);
      if (at) {
        const ax = Number(at[1]), az = Number(at[2]);
        this.controls.spawn(ax, az, ((Number(at[3]) || 0) * Math.PI) / 180);
        this.camera.position.y = this.world.groundY(ax, az) + this.controls.eyeHeight;
      }
    }

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.minimapDirty = true;
      this.sceneDirty = true;
      if (this.mapOpen) this.requestDetailMap();
    });

    const overlay = document.getElementById('overlay');
    const paused = document.getElementById('paused');
    const setLockHint = (): void => { /* HUD mouse readout removed */ };
    overlay?.addEventListener('click', () => this.enter());
    document.getElementById('overlay-ok')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.enter();
    });
    paused?.addEventListener('click', () => this.enter());
    document.addEventListener('pointerlockchange', () => {
      // Desktop defaults to a free mouse (WASD / drag look). Never treat
      // an unlocked cursor as "paused".
      if (paused) paused.style.display = 'none';
      setLockHint();
    });
    document.addEventListener('pointerlockerror', () => {
      // Touch devices have no pointer lock — don't nag there.
      if (this.controlMode === 'touch') return;
    });
    this.lockHintRefresh = setLockHint;
    this.initControlMode();
    setLockHint();

    // Detailed GIS map: click the minimap to open (works while mouse is free).
    minimap.title = 'Open detailed GIS map (M)';
    minimap.addEventListener('click', () => this.openMap());
    document.getElementById('map-close')?.addEventListener('click', () => this.closeMap());
    document.getElementById('map-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'map-overlay') this.closeMap();
    });
    this.initMapViewer();
    document.querySelectorAll<HTMLInputElement>('#map-legend input[data-layer]').forEach((box) => {
      box.addEventListener('change', () => { this.cachedMapLayers = null; this.requestDetailMap(); });
    });
    // Drains layer (GIS 27): hidden by default in 3D and on maps; the legend
    // checkbox re-enables it everywhere. Data is retained either way.
    const drainsBox = document.querySelector<HTMLInputElement>('#map-legend input[data-layer="drains"]');
    this.drainsBox = drainsBox;
    if (drainsBox) {
      this.world.setDrainsVisible(drainsBox.checked);
      drainsBox.addEventListener('change', () => {
        this.world.setDrainsVisible(drainsBox.checked);
        this.minimapDirty = true;
        this.sceneDirty = true;
        this.requestDetailMap();
      });
    }

    // 3D model show/hide: HUD checkboxes + number-key shortcuts, persisted.
    document.querySelectorAll<HTMLInputElement>('#layers input[data-3dlayer]').forEach((box) => {
      const id = (box.dataset['3dlayer'] ?? '') as LayerId;
      box.checked = this.layerVisibility[id] ?? true;
      box.addEventListener('change', () => this.setLayer(id, box.checked));
    });
    // Reconstructed buildings look: Auto / Detailed / Standard / Plain / Evidence, persisted.
    const lookSel = document.getElementById('building-look') as HTMLSelectElement | null;
    if (lookSel) {
      lookSel.value = this.buildingLook;
      lookSel.addEventListener('change', () => this.setBuildingLook(parseBuildingLook(lookSel.value)));
    }
    // Ghost NPCs: own HUD checkbox + G / 6 shortcut, persisted separately.
    document.querySelectorAll<HTMLInputElement>('#layers input[data-ghost]').forEach((box) => {
      box.checked = this.ghostsVisible;
      box.addEventListener('change', () => this.setGhostsVisible(box.checked));
    });
    // Ghost dialogue responses: each button picks that dynamic choice.
    document.querySelectorAll<HTMLButtonElement>('#dialogue-responses button').forEach((btn, i) => {
      btn.addEventListener('click', () => void this.answerDialogue(i));
    });
    // Collectibles: view modal + inventory browsing.
    document.getElementById('collection-open')?.addEventListener('click', () => this.openInventory());
    document.getElementById('collectible-close')?.addEventListener('click', () => this.closeCollectible());
    document.getElementById('collectible-browse')?.addEventListener('click', () => {
      this.closeCollectible();
      this.openInventory();
    });
    document.getElementById('collectible-modal')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'collectible-modal') this.closeCollectible();
    });
    document.getElementById('inventory-close')?.addEventListener('click', () => this.closeInventory());
    document.getElementById('inventory-modal')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'inventory-modal') this.closeInventory();
    });
    document.getElementById('inventory-clear')?.addEventListener('click', () => this.showInventoryClearConfirm());
    document.getElementById('inventory-clear-cancel')?.addEventListener('click', () => this.hideInventoryClearConfirm());
    document.getElementById('inventory-clear-yes')?.addEventListener('click', () => this.clearInventories());
    document.getElementById('ghosts-open')?.addEventListener('click', () => this.openGhostsJournal());
    document.getElementById('ghosts-close')?.addEventListener('click', () => this.closeGhostsJournal());
    document.getElementById('ghosts-modal')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'ghosts-modal') this.closeGhostsJournal();
    });
    const aboutOpenBtn = document.getElementById('about-open');
    aboutOpenBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openAbout();
    });
    document.getElementById('about-close')?.addEventListener('click', () => this.closeAbout());
    document.getElementById('about-modal')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'about-modal') this.closeAbout();
    });
    document.getElementById('collect-toast')?.addEventListener('click', () => this.hideToast());
    this.initReconstructionEntryPoints();
    this.updateCollectionHud();
    this.updateGhostsHud();
    document.addEventListener('keydown', (e) => {
      // Reconstruction viewer: it handles its own keys (Esc closes it) while the game is paused.
      if (this.reconOpen) return;
      if (e.code === 'Escape' && this.aboutOpen) { this.closeAbout(); return; }
      // Start overlay: any keypress enters town (same as clicking it).
      // Consumed here so the dismissing key can't also toggle layers/map.
      if (!this.entered) {
        this.enter();
        // Space dismissed the overlay; don't also hop on that same keydown.
        if (e.code === 'Space') this.controls.suppressPendingJump();
        return;
      }
      if (e.code === 'Escape' && this.collectibleOpen) { this.closeCollectible(); return; }
      if (e.code === 'Escape' && this.inventoryOpen) {
        const confirm = document.getElementById('inventory-clear-confirm');
        if (confirm && !confirm.hidden) { this.hideInventoryClearConfirm(); return; }
        this.closeInventory();
        return;
      }
      if (e.code === 'Escape' && this.ghostsJournalOpen) { this.closeGhostsJournal(); return; }
      if (e.code === 'Escape' && this.dialogueOpen) { this.closeDialogue(); return; }
      if (e.code === 'Escape' && this.mapOpen) this.closeMap();
      // Modal dialogue: 1-4 pick a response; other shortcuts stay dormant
      // until answered (movement keys are tracked separately and still work).
      if (this.dialogueOpen && !(e.target instanceof HTMLInputElement)) {
        const opt = ['Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Digit3', 'Numpad3', 'Digit4', 'Numpad4'].indexOf(e.code);
        if (opt >= 0) this.answerDialogue(opt >> 1);
        return;
      }
      if (this.collectibleOpen || this.inventoryOpen || this.ghostsJournalOpen || this.aboutOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'KeyI' && !e.repeat) {
        // Near a rebuilt building (prompt showing) I explores it; elsewhere it opens the collection.
        if (this.reconNearId && !this.mapOpen) { void this.openReconstruction(this.reconNearId); return; }
        if (this.inventoryOpen) this.closeInventory();
        else this.openInventory();
        return;
      }
      if (e.code === 'KeyJ' && !e.repeat) {
        if (this.ghostsJournalOpen) this.closeGhostsJournal();
        else this.openGhostsJournal();
        return;
      }
      if (e.code === 'KeyE' && !e.repeat) {
        this.openNearestCollectible();
        return;
      }
      if (e.code === 'KeyM' && !e.repeat) {
        if (this.mapOpen) this.closeMap();
        else this.openMap();
        return;
      }
      if ((e.code === 'KeyG' || e.code === 'Digit6') && !e.repeat) {
        this.setGhostsVisible(!this.ghostsVisible);
        return;
      }
      if (this.mapOpen && (e.code === 'Equal' || e.code === 'NumpadAdd')) { this.zoomMapAtCenter(1.4); return; }
      if (this.mapOpen && (e.code === 'Minus' || e.code === 'NumpadSubtract')) { this.zoomMapAtCenter(1 / 1.4); return; }
      if (this.mapOpen && e.code === 'Digit0') { this.resetMapView(); return; }
      const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
      if (idx < 0) return;
      const id = (['roads', 'key', 'buildings', 'footprints', 'walls'] as LayerId[])[idx];
      this.setLayer(id, !this.layerVisibility[id]);
    });

    this.loop = () => this.tick(statsEl, minimap);
    this.renderer.setAnimationLoop(this.loop);
  }

  private entered = false;
  private controlMode: ControlMode = 'desktop';
  private touchBound = false;
  private lockHintRefresh: (() => void) | null = null;
  /** Last-frame walk input, used to collapse the HUD on movement *start* (touch). */
  private wasMoving = false;

  /** Enter (or re-enter) the town: hide prompts. Mouse stays free. */
  enter(): void {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';
    const paused = document.getElementById('paused');
    if (paused) paused.style.display = 'none';
    this.entered = true;
    // Desktop no longer captures the pointer: arrows walk immediately and
    // the cursor stays free for HUD links. WASD / drag look around.
  }

  /** Movement input source: keyboard+mouse or touch D-pad + drag look. Persisted. */
  setControlMode(mode: ControlMode): void {
    this.controlMode = mode;
    this.controls?.setControlMode(mode);
    try {
      localStorage.setItem(CONTROL_MODE_KEY, mode);
    } catch { /* private-mode storage may throw — mode still applies */ }
    this.applyControlMode();
  }

  private detectTouchDevice(): boolean {
    try {
      if (window.matchMedia?.('(pointer: coarse)').matches) return true;
    } catch { /* matchMedia unavailable — fall through */ }
    return navigator.maxTouchPoints > 0 && !window.matchMedia?.('(pointer: fine)').matches;
  }

  /** Read the persisted choice (defaulting to touch on coarse-pointer devices),
   * sync the HUD radios + hint copy, bind the D-pad once, show/hide the overlay. */
  private initControlMode(): void {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(CONTROL_MODE_KEY);
    } catch { /* private-mode storage may throw — fall back to detection */ }
    const initial: ControlMode =
      stored === 'touch' || stored === 'desktop'
        ? stored
        : this.detectTouchDevice() ? 'touch' : 'desktop';
    this.controlMode = initial;
    this.controls.setControlMode(initial);
    document.querySelectorAll<HTMLInputElement>('input[name="controlmode"]').forEach((radio) => {
      radio.checked = radio.value === initial;
      radio.addEventListener('change', () => {
        if (radio.checked) this.setControlMode(radio.value as ControlMode);
      });
    });
    this.initTouchControls();
    this.applyControlMode();
  }

  private applyControlMode(): void {
    const touch = this.controlMode === 'touch';
    document.querySelectorAll<HTMLInputElement>('input[name="controlmode"]').forEach((radio) => {
      radio.checked = radio.value === this.controlMode;
    });
    const touchUi = document.getElementById('touch-ui');
    if (touchUi) touchUi.hidden = !touch;
    const hint = document.getElementById('controls-hint');
    if (hint) {
      hint.innerHTML = touch
        ? 'Tap to walk. Hold the D-pad to move, hold <kbd>RUN</kbd> to run, drag the scene to look.'
        : 'Arrow keys move, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> look, <kbd>Shift</kbd> run, <kbd>Space</kbd> jump, <kbd>M</kbd> map.';
    }
    const title = document.getElementById('overlay-title');
    if (title && !this.entered) title.textContent = 'Enter Calleva Atrebatum';
    const desktopHelp = document.getElementById('overlay-controls');
    if (desktopHelp) desktopHelp.hidden = touch || this.detectTouchDevice();
    if (!touch) {
      this.controls?.clearTouch();
      const runBtn = document.getElementById('run-toggle');
      if (runBtn) {
        runBtn.setAttribute('aria-pressed', 'false');
        runBtn.classList.remove('active');
      }
    } else {
      // Touch needs no pointer lock: never leave the slim resume bar up.
      const paused = document.getElementById('paused');
      if (paused) paused.style.display = 'none';
      const runBtn = document.getElementById('run-toggle');
      if (runBtn) {
        const on = runBtn.getAttribute('aria-pressed') === 'true';
        this.controls?.setTouchRun(on);
      }
    }
    this.lockHintRefresh?.();
  }

  /** Press-and-hold D-pad buttons + hold-to-run. Bound once; idempotent. */
  private initTouchControls(): void {
    if (this.touchBound) return;
    this.touchBound = true;
    document.querySelectorAll<HTMLButtonElement>('#dpad button[data-dir]').forEach((btn) => {
      const dir = (btn.dataset.dir ?? '') as TouchDir;
      if (dir !== 'forward' && dir !== 'back' && dir !== 'left' && dir !== 'right') return;
      const press = (e: PointerEvent): void => {
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
        btn.classList.add('active');
        this.controls.setTouchDir(dir, true);
      };
      const release = (e: PointerEvent): void => {
        e.preventDefault();
        btn.classList.remove('active');
        this.controls.setTouchDir(dir, false);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', () => {
        btn.classList.remove('active');
        this.controls.setTouchDir(dir, false);
      });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const runBtn = document.getElementById('run-toggle');
    if (runBtn) {
      // Hold-to-run (same as Shift on desktop). Pointer events, not click:
      // while a D-pad finger is held, RUN is a non-primary pointer and
      // browsers do not synthesize click. Capture keeps run on if the finger
      // slides off the button.
      let runPointerId: number | null = null;
      const setRun = (on: boolean): void => {
        runBtn.setAttribute('aria-pressed', String(on));
        runBtn.classList.toggle('active', on);
        this.controls.setTouchRun(on);
      };
      const press = (e: PointerEvent): void => {
        if (e.button !== 0) return;
        if (runPointerId !== null) return;
        e.preventDefault();
        e.stopPropagation();
        try { runBtn.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
        runPointerId = e.pointerId;
        setRun(true);
      };
      const release = (e: PointerEvent): void => {
        if (runPointerId !== null && e.pointerId !== runPointerId) return;
        e.preventDefault();
        runPointerId = null;
        setRun(false);
      };
      runBtn.addEventListener('pointerdown', press);
      runBtn.addEventListener('pointerup', release);
      runBtn.addEventListener('pointercancel', release);
      runBtn.addEventListener('lostpointercapture', release);
      runBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      runBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  /** Show/hide one 3D model category. Hidden layers are also non-collidable. */
  setLayer(id: LayerId, visible: boolean): void {
    this.layerVisibility[id] = visible;
    this.applyLayerVisibility();
    try {
      localStorage.setItem(LAYER_STORAGE_KEY, JSON.stringify(this.layerVisibility));
    } catch { /* private-mode storage may throw — visibility still applies */ }
  }

  /** Show/hide ghost NPCs. Persisted separately from 3D layers. */
  setGhostsVisible(visible: boolean): void {
    this.ghostsVisible = visible;
    this.ghosts?.setVisible(visible);
    this.sceneDirty = true;
    document.querySelectorAll<HTMLInputElement>('#layers input[data-ghost]').forEach((box) => {
      box.checked = visible;
    });
    try {
      localStorage.setItem(GHOSTS_STORAGE_KEY, JSON.stringify(visible));
    } catch { /* private-mode storage may throw — visibility still applies */ }
  }

  private parseGhostsVisible(raw: string | null): boolean {
    if (raw == null) return true;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed === true;
    } catch {
      return true;
    }
  }

  /** Proximity check (throttled): meeting a ghost holds it and opens hello UI. */
  private checkGhostDialogue(dt: number): void {
    if (this.dialogueOpen || this.aboutOpen || !this.ghostsVisible || !this.entered || !this.ghosts) return;
    this.dialogueCheckT += dt;
    if (this.dialogueCheckT < 0.2) return;
    this.dialogueCheckT = 0;
    const hit = this.ghosts.nearestWithin(this.camera.position.x, this.camera.position.z, DIALOGUE_RADIUS);
    if (!hit || this.ghosts.isHeld(hit.id)) return;
    if (performance.now() - (this.dialogueCooldowns.get(hit.id) ?? 0) < DIALOGUE_COOLDOWN_MS) return;
    this.openDialogue(hit.id);
  }

  private openDialogue(ghostId: string): void {
    const costume: GhostCostumeId | undefined = this.ghosts.costumeById(ghostId);
    const persona = costume ? NPC_PERSONAS[costume] : undefined;
    this.dialogueOpen = true;
    const returning = Boolean(costume && this.spokenCostumes.has(costume));
    this.dialogueGhostId = ghostId;
    this.dialogueHistory = [];
    this.dialogueTurn = 0;
    this.dialogueBank = null;
    this.dialogueNodeId = null;
    this.dialogueChoiceIds = [null, null, null, null];
    this.dialogueSeen = new Set();
    this.dialogueLoading = false;
    this.dialogueAbort?.abort();
    this.dialogueAbort = null;
    this.ghosts.hold(ghostId);
    if (costume) this.markGhostSpoken(costume);
    // Free the mouse so the response buttons are clickable (same as the map).
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* already unlocked */ }
    }
    // Pointer-lock/focus transitions can swallow a keyup, leaving a movement
    // key stuck down (player glides without input). Drop held keys here; the
    // user re-presses to walk. Held-key repeats re-add, so intentional
    // movement during dialogue still works.
    this.controls.clearKeys();
    const roleEl = document.getElementById('dialogue-role');
    const nameEl = document.getElementById('dialogue-name');
    const yearEl = document.getElementById('dialogue-year');
    if (roleEl) roleEl.textContent = costume ? GHOST_COSTUME_LABELS[costume] : 'Ghost';
    if (nameEl) nameEl.textContent = persona?.name ?? '';
    if (yearEl) {
      yearEl.replaceChildren();
      if (persona) {
        yearEl.append(eraDateLabel(persona.era));
        const ago = yearsAgoFromEra(persona.era);
        if (ago != null) {
          yearEl.append(' ');
          const span = document.createElement('span');
          span.className = 'dialogue-years-ago';
          span.textContent = `(${ago.toLocaleString('en-GB')} years ago)`;
          yearEl.append(span);
        }
      }
    }
    const status = document.getElementById('dialogue-status');
    if (status) {
      status.classList.remove('busy');
      status.textContent = '';
    }
    const el = document.getElementById('dialogue');
    if (el) {
      el.hidden = false;
      el.style.display = 'flex';
    }
    // Wait for this ghost's harvested bank. A missing file uses the short curated lines.
    if (costume) {
      const cached = cachedBank(costume);
      if (cached) this.showBankGreeting(cached, returning);
      else {
        this.setDialogueLoading(true);
        void loadBank(costume).then((loaded) => {
          if (!this.dialogueOpen || this.dialogueGhostId !== ghostId) return;
          this.setDialogueLoading(false);
          if (loaded) this.showBankGreeting(loaded, returning);
          else this.showCuratedGreeting(persona);
        });
      }
    } else {
      this.showCuratedGreeting(persona);
    }
    // Collectible diamonds live on the minimap overlay (see drawMinimapMarkers);
    // force a GIS cache rebuild only if layers changed while chatting.
    this.minimapDirty = true;
    this.requestDetailMap();
  }

  private showCuratedGreeting(persona: NpcPersona | undefined): void {
    const greeting = persona?.greeting ?? { reply: 'Hello.', choices: ['Hello — who are you?', 'What happened here?', 'What is this place?', 'Farewell.'] as [string, string, string, string] };
    this.dialogueBank = null;
    this.dialogueHistory = [{ speaker: 'ghost', text: greeting.reply }];
    this.renderDialogue(greeting.reply, greeting.choices);
  }

  private showBankGreeting(bank: PersonaBank, returning: boolean): void {
    this.dialogueBank = bank;
    const greeting = pickGreeting(bank, returning, Math.random);
    this.dialogueHistory = [{ speaker: 'ghost', text: greeting.reply }];
    const chosen = this.bankChoiceLabels(greeting.next ?? []);
    this.dialogueChoiceIds = chosen.ids;
    this.renderDialogue(greeting.reply, chosen.labels);
  }

  /** Render one NPC line + its 4 player choices (kbd 1-4 labels kept). */
  private renderDialogue(reply: string, choices: readonly [string, string, string, string] | string[]): void {
    const line = document.getElementById('dialogue-line');
    if (line) {
      line.classList.remove('thinking');
      line.textContent = reply;
    }
    const btns = document.querySelectorAll<HTMLButtonElement>('#dialogue-responses button');
    btns.forEach((btn, i) => {
      const text = choices[i] ?? (i === 3 ? 'Farewell.' : '…');
      // Keep the <kbd>1/2/3/4</kbd> prefix; replace only the label after it.
      const kbd = btn.querySelector('kbd');
      btn.textContent = '';
      if (kbd) {
        kbd.textContent = String(i + 1);
        btn.appendChild(kbd);
        btn.append(` ${text}`);
      } else {
        btn.textContent = `${i + 1} ${text}`;
      }
      btn.disabled = this.dialogueLoading;
    });
  }

  private setDialogueLoading(loading: boolean): void {
    this.dialogueLoading = loading;
    document.querySelectorAll<HTMLButtonElement>('#dialogue-responses button').forEach((b) => {
      b.disabled = loading;
    });
    const line = document.getElementById('dialogue-line');
    const status = document.getElementById('dialogue-status');
    if (loading) {
      if (line) {
        line.classList.add('thinking');
        line.textContent = 'Thinking…';
      }
      if (status) {
        status.classList.add('busy');
        status.textContent = 'The ghost is thinking…';
      }
    } else {
      if (line) line.classList.remove('thinking');
      if (status) status.classList.remove('busy');
    }
  }

  /** Three bank follow-ups plus farewell in slot 4. Empty when the graph runs out. */
  private bankChoiceLabels(nextIds: readonly string[]): { labels: [string, string, string, string]; ids: (string | null)[] } {
    const bank = this.dialogueBank;
    const costume = this.dialogueGhostId ? this.ghosts.costumeById(this.dialogueGhostId) : undefined;
    const opts = bank
      ? pickChoices(bank, nextIds, {
        turn: this.dialogueTurn,
        seenThisMeeting: this.dialogueSeen,
        seenEver: costume ? loadSeenEver(costume) : new Set<string>(),
      }, Math.random)
      : [];
    if (opts.length === 0) {
      return {
        labels: [FAREWELL_CHOICE, FAREWELL_CHOICE, FAREWELL_CHOICE, FAREWELL_CHOICE],
        ids: [null, null, null, null],
      };
    }
    return {
      labels: [
        opts[0]?.text ?? '…',
        opts[1]?.text ?? '…',
        opts[2]?.text ?? '…',
        FAREWELL_CHOICE,
      ],
      ids: [opts[0]?.nodeId ?? null, opts[1]?.nodeId ?? null, opts[2]?.nodeId ?? null, null],
    };
  }

  /** Pick a dialogue response by click or keyboard (1-4). Farewell closes. */
  private async answerDialogue(index: number): Promise<void> {
    if (!this.dialogueOpen || this.dialogueLoading) return;
    const btns = document.querySelectorAll<HTMLButtonElement>('#dialogue-responses button');
    const btn = btns[index];
    if (!btn) { this.closeDialogue(); return; }
    const label = (btn.textContent ?? '').replace(/^\s*[1234]\s*/, '').trim();
    // Gentle exit: any farewell choice just closes (ghost farewell line kept).
    if (/farewell/i.test(label)) { this.closeDialogue(); return; }
    const costume = this.dialogueGhostId ? this.ghosts.costumeById(this.dialogueGhostId) : undefined;
    if (!costume) { this.closeDialogue(); return; }
    if (this.dialogueBank && !this.dialogueChoiceIds[index]) return;
    this.dialogueHistory = appendTurn(this.dialogueHistory, { speaker: 'player', text: label });
    this.dialogueTurn += 1;
    // Forced farewell at the cap: show a closing line, then close.
    if (this.dialogueTurn >= DIALOGUE_MAX_TURNS) {
      const bye = this.dialogueBank ? pickFarewell(this.dialogueBank, Math.random) : FALLBACK_FAREWELLS[costume];
      this.renderDialogue(bye, ['Farewell.', 'Farewell.', 'Farewell.', 'Farewell.']);
      window.setTimeout(() => this.closeDialogue(), 1400);
      return;
    }
    if (this.dialogueBank) {
      const nodeId = this.dialogueChoiceIds[index];
      const node = nodeId ? this.dialogueBank.nodes[nodeId] : undefined;
      if (!nodeId || !node) { this.closeDialogue(); return; }
      this.dialogueNodeId = nodeId;
      this.dialogueSeen.add(nodeId);
      const ever = loadSeenEver(costume);
      ever.add(nodeId);
      saveSeenEver(costume, ever);
      const reply = pickReply(node, this.dialogueLastReplyIdx.get(nodeId) ?? null, Math.random);
      this.dialogueLastReplyIdx.set(nodeId, reply.index);
      this.setDialogueLoading(true);
      const abort = new AbortController();
      this.dialogueAbort = abort;
      const wait = 350 + Math.floor(Math.random() * 301);
      try {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, wait);
          abort.signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve(); }, { once: true });
        });
        if (!this.dialogueOpen || abort.signal.aborted) return;
        this.dialogueHistory = appendTurn(this.dialogueHistory, { speaker: 'ghost', text: reply.text });
        this.setDialogueLoading(false);
        const bankStatus = document.getElementById('dialogue-status');
        if (bankStatus) bankStatus.textContent = '';
        const chosen = this.bankChoiceLabels(node.next ?? []);
        this.dialogueChoiceIds = chosen.ids;
        this.renderDialogue(reply.text, chosen.labels);
      } finally {
        if (this.dialogueAbort === abort) this.dialogueAbort = null;
      }
      return;
    }
    // No harvested bank: short curated lines only.
    const fb = getOfflineReply(costume, this.dialogueTurn);
    this.dialogueHistory = appendTurn(this.dialogueHistory, { speaker: 'ghost', text: fb.reply });
    this.renderDialogue(fb.reply, fb.choices);
  }

  private closeDialogue(): void {
    if (!this.dialogueOpen) return;
    this.dialogueAbort?.abort();
    this.dialogueAbort = null;
    this.dialogueLoading = false;
    this.dialogueOpen = false;
    if (this.dialogueGhostId) {
      this.ghosts.release(this.dialogueGhostId);
      this.dialogueCooldowns.set(this.dialogueGhostId, performance.now());
      this.dialogueGhostId = null;
    }
    this.dialogueHistory = [];
    this.dialogueTurn = 0;
    this.dialogueBank = null;
    this.dialogueNodeId = null;
    this.dialogueChoiceIds = [null, null, null, null];
    this.dialogueSeen.clear();
    const el = document.getElementById('dialogue');
    if (el) {
      el.style.display = 'none';
      el.hidden = true;
    }
    // Detail-map collectible hints expire when the chat ends.
    this.minimapDirty = true;
    this.requestDetailMap();
  }

  /** Edge-triggered discovery: walking into a marker radius auto-opens it. */
  private checkCollectibleDiscovery(dt: number): void {
    if (!this.entered || !this.placedCollectibles.length) return;
    this.collectCheckT += dt;
    if (this.collectCheckT < 0.2) return;
    this.collectCheckT = 0;
    const px = this.camera.position.x, pz = this.camera.position.z;
    for (const p of this.placedCollectibles) {
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d <= p.radius) {
        if (!this.insideCollectible.has(p.id)) {
          this.insideCollectible.add(p.id);
          if (!this.collectibleOpen && !this.inventoryOpen && !this.ghostsJournalOpen && !this.aboutOpen && !this.dialogueOpen && !this.mapOpen) {
            this.openCollectible(p.id);
          }
        }
      } else if (d > p.radius + 1.5) {
        this.insideCollectible.delete(p.id);
      }
    }
  }

  /** Manual fallback (E key): open the nearest marker within 1.6x radius. */
  private openNearestCollectible(): void {
    if (this.collectibleOpen || this.inventoryOpen || this.ghostsJournalOpen || this.aboutOpen || this.dialogueOpen || this.mapOpen) return;
    let best: PlacedCollectible | null = null;
    let bestD = Infinity;
    for (const p of this.placedCollectibles) {
      const d = Math.hypot(p.x - this.camera.position.x, p.z - this.camera.position.z);
      if (d <= p.radius * 1.6 && d < bestD) { best = p; bestD = d; }
    }
    if (best) this.openCollectible(best.id);
  }

  private openCollectible(id: string): void {
    const item = this.placedCollectibles.find((p) => p.id === id);
    if (!item) return;
    this.closeDialogue();
    this.closeInventory();
    this.closeGhostsJournal();
    this.collectibleOpen = true;
    this.collectibleId = id;
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* already unlocked */ }
    }
    this.controls.clearKeys();
    const firstFind = !this.collectedIds.has(id);
    if (firstFind) {
      this.collectedIds.add(id);
      this.collectibles?.markCollected(id);
      try {
        localStorage.setItem(COLLECTIBLES_STORAGE_KEY, JSON.stringify([...this.collectedIds]));
      } catch { /* private-mode storage may throw — collection still applies */ }
      this.updateCollectionHud();
      this.minimapDirty = true;
      if (this.mapOpen) this.requestDetailMap();
      this.showToast(`Collected: ${item.title} (${this.collectedIds.size}/${this.placedCollectibles.length})`);
    }
    const title = document.getElementById('collectible-title');
    if (title) title.textContent = item.title;
    const kind = document.getElementById('collectible-kind');
    if (kind) kind.textContent = item.kind === 'site' ? 'Excavation site · 3D scan' : 'Artefact · 3D scan';
    const caption = document.getElementById('collectible-caption');
    if (caption) caption.textContent = item.caption;
    const frame = document.getElementById('collectible-frame') as HTMLIFrameElement | null;
    if (frame) {
      frame.title = item.title;
      frame.src = item.embedSrc;
    }
    const attr = document.getElementById('collectible-attr');
    if (attr) {
      attr.innerHTML = '';
      const modelLink = document.createElement('a');
      modelLink.href = item.attributionUrl;
      modelLink.target = '_blank';
      modelLink.rel = 'noopener noreferrer nofollow';
      modelLink.textContent = item.title;
      const by = document.createTextNode(` by ${item.author} on `);
      const authorLink = document.createElement('a');
      authorLink.href = item.authorUrl;
      authorLink.target = '_blank';
      authorLink.rel = 'noopener noreferrer nofollow';
      authorLink.textContent = item.author;
      const on = document.createTextNode(' on ');
      const sk = document.createElement('a');
      sk.href = 'https://sketchfab.com';
      sk.target = '_blank';
      sk.rel = 'noopener noreferrer nofollow';
      sk.textContent = 'Sketchfab';
      attr.append(modelLink, by, authorLink, on, sk);
    }
    const progress = document.getElementById('collectible-progress');
    if (progress) {
      const remaining = this.placedCollectibles.length - this.collectedIds.size;
      progress.textContent = firstFind
        ? `Added to your collection (${this.collectedIds.size}/${this.placedCollectibles.length} · ${remaining} to find)`
        : `Already in your collection (${this.collectedIds.size}/${this.placedCollectibles.length} · ${remaining} to find)`;
    }
    const el = document.getElementById('collectible-modal');
    if (el) {
      el.hidden = false;
      el.style.display = 'flex';
    }
  }

  private closeCollectible(): void {
    if (!this.collectibleOpen) return;
    this.collectibleOpen = false;
    this.collectibleId = null;
    // Clear the iframe so Sketchfab stops playing/downloading in background.
    const frame = document.getElementById('collectible-frame') as HTMLIFrameElement | null;
    if (frame) frame.removeAttribute('src');
    const el = document.getElementById('collectible-modal');
    if (el) {
      el.style.display = 'none';
      el.hidden = true;
    }
    // insideCollectible keeps the id: no instant re-trigger while standing
    // in the radius — the player must walk out and back in.
  }

  private openInventory(): void {
    this.closeDialogue();
    this.closeCollectible();
    this.closeGhostsJournal();
    this.inventoryOpen = true;
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* already unlocked */ }
    }
    this.controls.clearKeys();
    this.hideInventoryClearConfirm();
    this.fillInventory();
    const el = document.getElementById('inventory-modal');
    if (el) {
      el.hidden = false;
      el.style.display = 'flex';
    }
  }

  private fillInventory(): void {
    const list = document.getElementById('inventory-list');
    if (list) {
      list.innerHTML = '';
      const found = this.placedCollectibles.filter((p) => this.collectedIds.has(p.id));
      if (!found.length) {
        const p = document.createElement('p');
        p.className = 'inventory-empty';
        p.textContent = 'Nothing collected yet — walk into a gold marker to collect it.';
        list.appendChild(p);
      }
      for (const item of found) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inventory-item';
        btn.textContent = `${item.kind === 'site' ? '◇' : '◆'} ${item.title}`;
        btn.addEventListener('click', () => this.openCollectible(item.id));
        list.appendChild(btn);
      }
    }
    const remaining = document.getElementById('inventory-remaining');
    if (remaining) {
      const n = this.placedCollectibles.length - this.collectedIds.size;
      remaining.textContent = n === 0
        ? 'Collection complete — you found every scan.'
        : `${n} scan${n === 1 ? '' : 's'} still hidden out there.`;
    }
    const clear = document.getElementById('inventory-clear') as HTMLButtonElement | null;
    if (clear) clear.disabled = this.collectedIds.size === 0 && this.spokenCostumes.size === 0;
  }

  private inventoriesEmpty(): boolean {
    return this.collectedIds.size === 0 && this.spokenCostumes.size === 0;
  }

  private showInventoryClearConfirm(): void {
    if (this.inventoriesEmpty()) return;
    const btn = document.getElementById('inventory-clear');
    const confirm = document.getElementById('inventory-clear-confirm');
    if (btn) btn.hidden = true;
    if (confirm) {
      confirm.hidden = false;
      document.getElementById('inventory-clear-cancel')?.focus();
    }
  }

  private hideInventoryClearConfirm(): void {
    const btn = document.getElementById('inventory-clear') as HTMLButtonElement | null;
    const confirm = document.getElementById('inventory-clear-confirm');
    if (confirm) confirm.hidden = true;
    if (btn) {
      btn.hidden = false;
      btn.disabled = this.inventoriesEmpty();
    }
  }

  private clearInventories(): void {
    if (this.inventoriesEmpty()) {
      this.hideInventoryClearConfirm();
      return;
    }
    this.collectedIds.clear();
    this.spokenCostumes.clear();
    this.insideCollectible.clear();
    this.collectibles?.setCollected([]);
    try { localStorage.removeItem(COLLECTIBLES_STORAGE_KEY); } catch { /* private-mode */ }
    try { localStorage.removeItem(SPOKEN_GHOSTS_STORAGE_KEY); } catch { /* private-mode */ }
    clearSeenEver();
    this.updateCollectionHud();
    this.updateGhostsHud();
    this.minimapDirty = true;
    this.sceneDirty = true;
    if (this.mapOpen) this.requestDetailMap();
    this.hideInventoryClearConfirm();
    this.fillInventory();
    this.showToast('Inventories cleared');
  }

  private closeInventory(): void {
    if (!this.inventoryOpen) return;
    this.inventoryOpen = false;
    this.hideInventoryClearConfirm();
    const el = document.getElementById('inventory-modal');
    if (el) {
      el.style.display = 'none';
      el.hidden = true;
    }
  }

  private ghostTotal(): number {
    return this.ghosts?.count || GHOST_COSTUMES.length || GHOST_COUNT;
  }

  private markGhostSpoken(costume: GhostCostumeId): void {
    if (this.spokenCostumes.has(costume)) return;
    this.spokenCostumes.add(costume);
    try {
      localStorage.setItem(SPOKEN_GHOSTS_STORAGE_KEY, JSON.stringify([...this.spokenCostumes]));
    } catch { /* private-mode storage may throw — the count still applies */ }
    this.updateGhostsHud();
    if (this.ghostsJournalOpen) this.fillGhostsJournal();
  }

  private openGhostsJournal(): void {
    this.closeDialogue();
    this.closeCollectible();
    this.closeInventory();
    this.ghostsJournalOpen = true;
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* already unlocked */ }
    }
    this.controls.clearKeys();
    this.fillGhostsJournal();
    const el = document.getElementById('ghosts-modal');
    if (el) {
      el.hidden = false;
      el.style.display = 'flex';
    }
  }

  private fillGhostsJournal(): void {
    const list = document.getElementById('ghosts-list');
    if (list) {
      list.innerHTML = '';
      for (const costume of GHOST_COSTUMES) {
        const met = this.spokenCostumes.has(costume);
        const persona = NPC_PERSONAS[costume];
        const row = document.createElement('div');
        row.className = met ? 'ghost-item met' : 'ghost-item unmet';
        const who = document.createElement('span');
        who.className = 'ghost-who';
        who.textContent = met
          ? `✓ ${persona.name}`
          : '○ Not yet spoken to';
        const role = document.createElement('span');
        role.className = 'ghost-role';
        role.textContent = met
          ? `${GHOST_COSTUME_LABELS[costume]} · ${persona.role}`
          : GHOST_COSTUME_LABELS[costume];
        row.append(who, role);
        list.appendChild(row);
      }
    }
    const remaining = document.getElementById('ghosts-remaining');
    if (remaining) {
      const total = this.ghostTotal();
      const n = Math.max(0, total - this.spokenCostumes.size);
      remaining.textContent = n === 0
        ? 'You have spoken to every ghost walking Calleva.'
        : `${n} ghost${n === 1 ? '' : 's'} still walking — greet them in the streets.`;
    }
  }

  private closeGhostsJournal(): void {
    if (!this.ghostsJournalOpen) return;
    this.ghostsJournalOpen = false;
    const el = document.getElementById('ghosts-modal');
    if (el) {
      el.style.display = 'none';
      el.hidden = true;
    }
  }

  private openAbout(): void {
    this.aboutOpen = true;
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* already unlocked */ }
    }
    this.controls.clearKeys();
    const el = document.getElementById('about-modal');
    if (el) {
      el.hidden = false;
      el.style.display = 'flex';
    }
    document.getElementById('about-close')?.focus();
  }

  private closeAbout(): void {
    if (!this.aboutOpen) return;
    this.aboutOpen = false;
    const el = document.getElementById('about-modal');
    if (el) {
      el.style.display = 'none';
      el.hidden = true;
    }
  }

  private updateCollectionHud(): void {
    const el = document.getElementById('collection-count');
    if (el) {
      const remaining = this.placedCollectibles.length - this.collectedIds.size;
      el.textContent = `${this.collectedIds.size}/${this.placedCollectibles.length} collected · ${remaining} to find`;
    }
  }

  private updateGhostsHud(): void {
    const el = document.getElementById('ghosts-count');
    if (el) {
      const total = this.ghostTotal();
      const remaining = Math.max(0, total - this.spokenCostumes.size);
      el.textContent = `${this.spokenCostumes.size}/${total} spoken to · ${remaining} still walking`;
    }
  }

  private showToast(text: string): void {
    const el = document.getElementById('collect-toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.hideToast(), 3500);
  }

  private hideToast(): void {
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = 0;
    const el = document.getElementById('collect-toast');
    if (el) {
      el.textContent = '';
      el.hidden = true;
    }
  }

  private applyLayerVisibility(): void {
    (Object.keys(this.layerVisibility) as LayerId[]).forEach((id) => {
      this.world.layerGroups[id].visible = this.layerVisibility[id];
    });
    this.physicsDirty = true;
    this.minimapDirty = true;
    this.sceneDirty = true;
    document.querySelectorAll<HTMLInputElement>('#layers input[data-3dlayer]').forEach((box) => {
      const id = (box.dataset['3dlayer'] ?? '') as LayerId;
      if (id in this.layerVisibility) box.checked = this.layerVisibility[id];
    });
    if (this.mapOpen) this.requestDetailMap();
  }

  /** Coalesce rapid map redraws (pan/pinch/wheel) to one per animation frame. */
  private requestDetailMap(): void {
    if (!this.mapOpen) return;
    if (this.detailMapQueued) return;
    this.detailMapQueued = true;
    requestAnimationFrame(() => {
      this.detailMapQueued = false;
      if (this.mapOpen) this.drawDetailMap();
    });
  }

  /** Rebuild cached physics lists after a visibility change. No per-frame allocation. */
  private refreshPhysicsCache(): void {
    const colliders: import('../presentation/WorldBuilder.js').Collider[] = [];
    (Object.keys(this.layerVisibility) as LayerId[]).forEach((id) => {
      if (this.layerVisibility[id]) colliders.push(...this.world.collidersByLayer[id]);
    });
    this.cachedColliders = colliders;
    const circles: import('../presentation/PlayerControls.js').CircleCollider[] = [];
    // Base circles predate per-layer tagging (always on); key-layer circles toggle.
    const tagged = new Set(this.world.circlesByLayer.key);
    for (const c of this.world.circles) {
      if (tagged.has(c)) {
        if (this.layerVisibility.key) circles.push(c);
      } else {
        circles.push(c);
      }
    }
    this.cachedCircles = circles;
    const polys: import('../presentation/PlayerControls.js').PolyCollider[] = [];
    (Object.keys(this.layerVisibility) as LayerId[]).forEach((id) => {
      if (this.layerVisibility[id]) polys.push(...this.world.polysByLayer[id]);
    });
    this.cachedPolys = polys;
    this.cachedBands = this.layerVisibility.key ? this.world.bands : [];
    this.physicsDirty = false;
  }

  private activeColliders(): import('../presentation/WorldBuilder.js').Collider[] {
    if (this.physicsDirty) this.refreshPhysicsCache();
    return this.cachedColliders;
  }

  private activeCircles(): import('../presentation/PlayerControls.js').CircleCollider[] {
    if (this.physicsDirty) this.refreshPhysicsCache();
    return this.cachedCircles;
  }

  /** On mobile/touch, fold the top-left Calleva panel the moment walking starts. */
  private collapseHudOnMoveStart(): void {
    const moving = this.controlMode === 'touch' && this.entered && this.controls.hasMoveInput;
    if (moving && !this.wasMoving) {
      const hud = document.getElementById('hud') as HTMLDetailsElement | null;
      if (hud?.open) hud.open = false;
    }
    this.wasMoving = moving;
  }

  /** True when the view differs from the last rendered frame (move or look). */
  private cameraMovedSinceRender(): boolean {
    const p = this.camera.position;
    const r = this.camera.rotation;
    return (
      Math.abs(p.x - this.lastRenderPX) > 1e-4 ||
      Math.abs(p.y - this.lastRenderPY) > 1e-4 ||
      Math.abs(p.z - this.lastRenderPZ) > 1e-4 ||
      Math.abs(r.y - this.lastRenderRY) > 1e-4 ||
      Math.abs(r.x - this.lastRenderRX) > 1e-4
    );
  }

  private snapshotRenderCamera(): void {
    const p = this.camera.position;
    const r = this.camera.rotation;
    this.lastRenderPX = p.x;
    this.lastRenderPY = p.y;
    this.lastRenderPZ = p.z;
    this.lastRenderRY = r.y;
    this.lastRenderRX = r.x;
  }

  /** Auto tier for this GPU: cached result, else a short off-screen wall test (~0.1-0.5 s, once). */
  private resolveAutoTier(): QualityTier {
    const webgl = this.renderer.webgl;
    if (!webgl) return 'plain'; // experimental WebGPU path: the tiled wall shader is WebGL2-only
    const gpu = this.gpuName();
    const cached = parseAutoTierCache(localStorage.getItem(AUTO_TIER_STORAGE_KEY), gpu);
    if (cached) return cached.tier;
    const extraMs = measureWallCost(webgl);
    const tier = tierFromBench(extraMs);
    localStorage.setItem(AUTO_TIER_STORAGE_KEY, JSON.stringify({ gpu, tier, extraMs: Math.round(extraMs * 10) / 10 }));
    console.debug(`[silchester] building look auto: wall test +${extraMs.toFixed(1)} ms full-screen -> ${tier}`);
    return tier;
  }

  /** GPU description used to key the cached Auto tier. */
  private gpuName(): string {
    const gl = this.renderer.webgl?.getContext();
    if (!gl) return 'webgpu';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }

  private setBuildingLook(look: BuildingLook): void {
    this.buildingLook = look;
    localStorage.setItem(BUILDING_LOOK_STORAGE_KEY, look);
    if (look === 'auto') this.autoTier = this.resolveAutoTier();
    this.applyBuildingLook();
  }

  private applyBuildingLook(): void {
    const tier = tierForLook(this.buildingLook, this.autoTier);
    const styles: Record<QualityTier, KeyBuildingDisplay> = { high: 'hybrid', standard: 'hybridLite', plain: 'plain' };
    this.world.setKeyBuildingDisplay(tier ? styles[tier] : 'evidence');
    const legend = document.getElementById('evidence-legend');
    if (legend) legend.hidden = this.buildingLook !== 'evidence';
    const note = document.getElementById('building-look-auto');
    if (note) {
      const names: Record<QualityTier, string> = { high: 'Detailed', standard: 'Standard', plain: 'Plain' };
      note.textContent = this.buildingLook === 'auto' ? `Auto chose: ${names[this.autoTier]}` : '';
    }
    this.sceneDirty = true;
  }

  /** Auto only: if frames stay slow near a reconstructed building, step down a tier (never up). */
  private watchBuildingFrames(ms: number, active: boolean, now: number): void {
    if (this.buildingLook !== 'auto' || this.autoTier === 'plain' || !active || document.hidden || ms > 500) {
      this.slowSinceT = 0;
      return;
    }
    const { x, z } = this.camera.position;
    const near = this.world.planBuildings.some((b) => Math.hypot(x - b.centre.x, z - b.centre.z) < b.radius + 60);
    if (!near) { this.slowSinceT = 0; return; }
    this.frameEmaMs = this.frameEmaMs * 0.9 + ms * 0.1;
    if (this.frameEmaMs <= SLOW_FRAME_MS) { this.slowSinceT = 0; return; }
    if (!this.slowSinceT) { this.slowSinceT = now; return; }
    if (now - this.slowSinceT < SLOW_WINDOW_MS) return;
    this.autoTier = stepDownTier(this.autoTier);
    if (this.renderer.webgl) localStorage.setItem(AUTO_TIER_STORAGE_KEY, JSON.stringify({ gpu: this.gpuName(), tier: this.autoTier, extraMs: -1 }));
    console.debug(`[silchester] building look auto: slow frames (${this.frameEmaMs.toFixed(0)} ms) -> ${this.autoTier}`);
    this.slowSinceT = 0;
    this.frameEmaMs = 16;
    this.applyBuildingLook();
  }

  private tick(statsEl: HTMLElement, minimap: HTMLCanvasElement): void {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    if (this.physicsDirty) this.refreshPhysicsCache();
    this.controls.update(dt, this.cachedColliders, this.cachedCircles, this.cachedBands, this.world.groundY, this.cachedPolys);
    this.collapseHudOnMoveStart();
    this.ghosts?.update(dt, this.world.groundY, this.camera.position.x, this.camera.position.z);
    this.checkGhostDialogue(dt);
    this.collectibles?.update(dt, this.world.groundY);
    this.checkCollectibleDiscovery(dt);
    this.checkReconstructionPrompt(dt);
    // GPU saver: cheap sim stays per-vsync (small dt keeps collisions
    // accurate), expensive GPU render is throttled. Active (walking or
    // looking) targets ~30fps; idle (static view, ghost bob only) ~12fps.
    const now = performance.now();
    const active = this.controls.hasMoveInput || this.cameraMovedSinceRender();
    const interval = active ? 1000 / 30 : 1000 / 12;
    this.watchBuildingFrames(rawDt * 1000, active, now);
    if (this.sceneDirty || now - this.lastRenderT >= interval) {
      this.sceneDirty = false;
      this.lastRenderT = now;
      this.snapshotRenderCamera();
      void this.renderer.render(this.scene, this.camera);
      this.frames++;
    }

    if (now - this.lastFpsT >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsT));
      this.frames = 0;
      this.lastFpsT = now;
      statsEl.textContent = `${this.fps} fps · ${this.renderer.drawCalls()} calls · ${(this.renderer.triangles() / 1000).toFixed(0)}k tris · x ${this.camera.position.x.toFixed(0)} z ${this.camera.position.z.toFixed(0)}`;
    }
    // Ghost pulse + player heading live on overlays only. Never redraw GIS
    // vectors for this — 16 arcs is cheap; the plan geometry is not.
    // 24fps is enough for a sine pulse; pan/zoom still paints immediately
    // via drawDetailMap. Minimap blits its GIS cache then paints markers.
    if (now - this.lastMarkerT >= 1000 / 24) {
      this.lastMarkerT = now;
      this.maybeDrawMinimapGis(minimap);
      this.drawMinimapMarkers(minimap);
      if (this.mapOpen) this.drawMapMarkers();
    }
  }

  private openMap(): void {
    this.closeDialogue();
    this.closeCollectible();
    this.closeInventory();
    this.closeGhostsJournal();
    this.mapOpen = true;
    // Free the mouse so the legend checkboxes/buttons are clickable.
    // Without this the pointer stays locked to the 3D view and the user
    // cannot select/deselect map options.
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* already unlocked */ }
    }
    const paused = document.getElementById('paused');
    if (paused) paused.style.display = 'none';
    const el = document.getElementById('map-overlay');
    if (el) {
      el.style.display = 'flex';
      el.offsetHeight; // force layout so the canvas has a real CSS box
    }
    this.syncDetailMapSize();
    this.resetMapView(false);
    this.drawDetailMap();
  }

  private closeMap(): void {
    this.mapOpen = false;
    const pop = document.getElementById('map-recon');
    if (pop) pop.hidden = true;
    const el = document.getElementById('map-overlay');
    if (el) el.style.display = 'none';
  }

  /** Fit the whole walled town + amphitheatre into the detail canvas. */
  private resetMapView(redraw = true): void {
    const canvas = document.getElementById('detailmap') as HTMLCanvasElement | null;
    const W = canvas?.width ?? 720, H = canvas?.height ?? 720;
    const fit = this.fitMapToTown(W, H);
    this.mapView.cx = fit.cx;
    this.mapView.cz = fit.cz;
    this.mapView.scale = fit.scale;
    if (redraw) this.drawDetailMap();
  }

  /** Centre the GIS town in the canvas and scale to fill the shorter leftover axis. */
  private fitMapToTown(W: number, H: number): { cx: number; cz: number; scale: number } {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const add = (x: number, z: number): void => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    };
    for (const w of this.plan.walls) add(w.x, w.z);
    const a = this.plan.amphitheatre;
    add(a.x - a.rx, a.z - a.rz);
    add(a.x + a.rx, a.z + a.rz);
    if (!Number.isFinite(minX)) return { cx: 15, cz: 15, scale: Math.min(W, H) / 1050 };
    const margin = 70;
    const xSpan = Math.max(1, maxX - minX + margin * 2);
    const zSpan = Math.max(1, maxZ - minZ + margin * 2);
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      scale: Math.min(W / xSpan, H / zSpan),
    };
  }

  /** Match the GIS + overlay canvases to the laid-out CSS box (and device pixel ratio). */
  private syncDetailMapSize(): boolean {
    const canvas = document.getElementById('detailmap') as HTMLCanvasElement | null;
    if (!canvas) return false;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW < 2 || cssH < 2) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    const overlay = this.ensureMarkerCanvas();
    const gisChanged = canvas.width !== w || canvas.height !== h;
    if (gisChanged) {
      const oldMin = Math.min(canvas.width, canvas.height);
      canvas.width = w;
      canvas.height = h;
      if (this.mapView.scale && oldMin > 0) {
        this.mapView.scale *= Math.min(w, h) / oldMin;
      }
    }
    if (overlay && (overlay.width !== w || overlay.height !== h)) {
      overlay.width = w;
      overlay.height = h;
    }
    return gisChanged;
  }

  private ensureMarkerCanvas(): HTMLCanvasElement | null {
    if (this.markerMapCanvas) return this.markerMapCanvas;
    const canvas = document.getElementById('detailmap-markers') as HTMLCanvasElement | null;
    if (!canvas) return null;
    this.markerMapCanvas = canvas;
    this.markerMapCtx = canvas.getContext('2d');
    return canvas;
  }

  private zoomMapAtPoint(sx: number, sy: number, factor: number): void {
    const canvas = document.getElementById('detailmap') as HTMLCanvasElement | null;
    if (!canvas) return;
    const v = this.mapView;
    const fit = this.fitMapToTown(canvas.width, canvas.height).scale;
    const base = v.scale || fit;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const next = Math.max(fit * 0.4, Math.min(40 * dpr, base * factor));
    if (next === base) return;
    // Keep the world point under the cursor fixed.
    const rect = canvas.getBoundingClientRect();
    const px = ((sx - rect.left) / Math.max(1, rect.width)) * canvas.width;
    const py = ((sy - rect.top) / Math.max(1, rect.height)) * canvas.height;
    const wx = v.cx + (px - canvas.width / 2) / base;
    const wz = v.cz + (py - canvas.height / 2) / base;
    v.scale = next;
    v.cx = wx - (px - canvas.width / 2) / next;
    v.cz = wz - (py - canvas.height / 2) / next;
    this.requestDetailMap();
  }

  private zoomMapAtCenter(factor: number): void {
    const canvas = document.getElementById('detailmap') as HTMLCanvasElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    this.zoomMapAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  /** Drag-pan, wheel-zoom, double-click and pinch navigation for the GIS canvas. */
  private initMapViewer(): void {
    if (this.mapNavBound) return;
    this.mapNavBound = true;
    const canvas = document.getElementById('detailmap') as HTMLCanvasElement | null;
    if (!canvas) return;
    new ResizeObserver(() => { if (this.mapOpen) this.requestDetailMap(); }).observe(canvas);
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    document.getElementById('map-zoom-in')?.addEventListener('click', (e) => { e.stopPropagation(); this.zoomMapAtCenter(1.5); });
    document.getElementById('map-zoom-out')?.addEventListener('click', (e) => { e.stopPropagation(); this.zoomMapAtCenter(1 / 1.5); });
    document.getElementById('map-reset')?.addEventListener('click', (e) => { e.stopPropagation(); this.resetMapView(); });
    document.getElementById('map-show-all')?.addEventListener('click', (e) => { e.stopPropagation(); this.showAllLayers(); });
    document.getElementById('map-find')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.mapView.cx = this.camera.position.x;
      this.mapView.cz = this.camera.position.z;
      if (!this.mapView.scale) this.resetMapView(false);
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      this.mapView.scale = Math.max(this.mapView.scale, 4 * dpr);
      this.requestDetailMap();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomMapAtPoint(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    canvas.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.zoomMapAtPoint(e.clientX, e.clientY, 2);
    });

    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const rect = canvas.getBoundingClientRect();
      const cssToPx = canvas.width / Math.max(1, rect.width);
      if (pointers.size === 1) {
        // Single-finger / mouse drag pans the viewport.
        const dxPx = (e.clientX - prev.x) * cssToPx;
        const dyPx = (e.clientY - prev.y) * cssToPx;
        this.mapView.cx -= dxPx / this.mapView.scale;
        this.mapView.cz -= dyPx / this.mapView.scale;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.requestDetailMap();
      } else if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && d > 0) {
          this.zoomMapAtPoint((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
        }
        pinchDist = d;
      }
    });
    const endPointer = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      if (!pointers.size) canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    // A click (not a drag) on a rebuilt building offers its reconstruction.
    let clickFrom: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => { clickFrom = pointers.size <= 1 ? { x: e.clientX, y: e.clientY } : null; });
    canvas.addEventListener('pointerup', (e) => {
      if (clickFrom && Math.hypot(e.clientX - clickFrom.x, e.clientY - clickFrom.y) < 6) this.mapClick(e.clientX, e.clientY);
      clickFrom = null;
    });
  }

  /** Map click: offer "Explore the reconstruction" beside a rebuilt building, else hide the offer. */
  private mapClick(clientX: number, clientY: number): void {
    const canvas = document.getElementById('detailmap') as HTMLCanvasElement | null;
    const pop = document.getElementById('map-recon');
    if (!canvas || !pop) return;
    const rect = canvas.getBoundingClientRect(), v = this.mapView;
    const cssToPx = canvas.width / Math.max(1, rect.width);
    const x = v.cx + ((clientX - rect.left) * cssToPx - canvas.width / 2) / v.scale;
    const z = v.cz + ((clientY - rect.top) * cssToPx - canvas.height / 2) / v.scale;
    const slop = (6 * cssToPx) / v.scale; // about 6 css px
    const hit = this.layerVisibility.key ? this.world.planBuildings.find((b) => b.distanceTo(x, z) <= slop) : undefined;
    if (!hit) { pop.hidden = true; return; }
    const name = document.getElementById('map-recon-name');
    if (name) name.textContent = KEY_PLANS[hit.id]?.name ?? hit.id;
    pop.dataset.id = hit.id;
    pop.hidden = false;
    // beside the click, kept inside the map
    const wrap = pop.parentElement!.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(clientX - wrap.left + 10, wrap.width - pop.offsetWidth - 8))}px`;
    pop.style.top = `${Math.max(8, Math.min(clientY - wrap.top + 10, wrap.height - pop.offsetHeight - 8))}px`;
    pop.querySelector('button')?.focus();
  }

  /** HUD list, proximity prompt and map offer for the reconstruction viewer. */
  private initReconstructionEntryPoints(): void {
    const list = document.getElementById('recon-list');
    for (const b of this.world.planBuildings) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.textContent = `Explore the reconstruction: ${KEY_PLANS[b.id]?.name ?? b.id}`;
      btn.addEventListener('click', () => void this.openReconstruction(b.id));
      list?.append(btn);
    }
    document.getElementById('recon-prompt')?.addEventListener('click', () => {
      if (this.reconNearId) void this.openReconstruction(this.reconNearId);
    });
    document.getElementById('map-recon-open')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = document.getElementById('map-recon')?.dataset.id;
      if (id) void this.openReconstruction(id);
    });
  }

  /** Show the prompt while the player is near or inside a rebuilt building (checked ~4x a second). */
  private checkReconstructionPrompt(dt: number): void {
    this.reconCheckT -= dt;
    if (this.reconCheckT > 0) return;
    this.reconCheckT = 0.25;
    const { x, z } = this.camera.position;
    const near = this.layerVisibility.key ? this.world.planBuildings.find((b) => b.distanceTo(x, z) < RECON_PROMPT_M) : undefined;
    const id = near?.id ?? null;
    if (id === this.reconNearId) return;
    this.reconNearId = id;
    const el = document.getElementById('recon-prompt');
    if (!el) return;
    el.hidden = !id;
    if (!id) return;
    el.replaceChildren();
    if (this.controlMode !== 'touch') {
      const k = document.createElement('kbd');
      k.textContent = 'I';
      el.append(k);
    }
    const name = KEY_PLANS[id]?.name ?? id;
    el.append(window.innerWidth < 500 ? 'Explore the reconstruction' : `Explore the reconstruction: ${name}`);
    el.setAttribute('aria-label', `Explore the reconstruction of the ${name.toLowerCase()}`);
  }

  /** Open the reconstruction viewer: pauses the game (simulation and rendering) and frees the mouse. */
  private async openReconstruction(id: string): Promise<void> {
    const plan = KEY_PLANS[id];
    if (this.reconOpen || !plan) return;
    this.reconOpen = true;
    this.closeDialogue();
    this.closeCollectible();
    this.closeInventory();
    this.closeGhostsJournal();
    this.closeAbout();
    this.closeMap();
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* already unlocked */ }
    }
    this.controls.clearKeys();
    this.renderer.setAnimationLoop(null);
    const prompt = document.getElementById('recon-prompt');
    if (prompt) prompt.hidden = true;
    try {
      const { ReconstructionViewer } = await import('../presentation/inspector/ReconstructionViewer.js');
      // Materials mode shows walls in the game's current style (Evidence look: the Auto tier's).
      const styles: Record<QualityTier, SurfaceStyle> = { high: 'hybrid', standard: 'hybridLite', plain: 'plain' };
      this.recon = new ReconstructionViewer(plan, {
        renderer: this.renderer.webgl,
        surfaceStyle: styles[tierForLook(this.buildingLook, this.autoTier) ?? this.autoTier],
        touch: this.controlMode === 'touch',
        onClose: () => this.resumeFromReconstruction(),
      });
      this.recon.open();
    } catch (err) {
      console.error('[silchester] reconstruction viewer failed to load', err);
      this.resumeFromReconstruction();
      this.showToast('The reconstruction viewer could not be loaded.');
    }
  }

  /** Viewer closed: give the renderer back its size and resume where the player was. */
  private resumeFromReconstruction(): void {
    this.recon = null;
    this.reconOpen = false;
    this.controls.clearKeys();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.clock.getDelta(); // the paused time is not one long frame
    this.sceneDirty = true;
    this.reconNearId = null; // re-show the prompt on the next check
    this.reconCheckT = 0;
    if (this.loop) this.renderer.setAnimationLoop(this.loop);
  }

  /** Cached legend-checkbox set; invalidated on every legend `change`
   * (see init) so per-redraw map code never touches the DOM. */
  private cachedMapLayers: Set<string> | null = null;

  /** Per-contour world bboxes (same pad semantics as the point test; the bbox
   * stage only ever rejects what the point test would also reject). */
  private contourBboxes: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  /** Per-building world bbox + outline flag (bbox scanned once, not per shade pass). */
  private bldgBox: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; outlined: boolean }> = [];
  /** Shade bucket tag per building: 1-5 for GIS shades, else 0. */
  private bldgShadeTag: number[] = [];
  /** Unshaded house/shop prefilter (loop's kind-skip + visibility checks stay as-is). */
  private bldgInfill: boolean[] = [];
  /** Plan-order indices of temples/churches (second footprint pass + labels). */
  private templeChurchIdx: number[] = [];
  /** Plan-order indices of labelled key buildings (map labels). */
  private keyLabelIdx: number[] = [];
  private mapGeoCacheReady = false;

  /** One-time scan of static plan geometry for the 2D maps. Walls/gates never
   * change after import, so bboxes, shade tags and index lists stay valid. */
  private ensureMapGeoCache(): void {
    if (this.mapGeoCacheReady) return;
    this.mapGeoCacheReady = true;
    this.contourBboxes = this.plan.contours.map((c) => {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of c.pts) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
      return { minX, maxX, minZ, maxZ };
    });
    this.plan.buildings.forEach((b, i) => {
      if (b.outline && b.outline.length >= 3) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of b.outline) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
        }
        this.bldgBox[i] = { minX, maxX, minZ, maxZ, outlined: true };
      } else {
        this.bldgBox[i] = { minX: b.x, maxX: b.x, minZ: b.z, maxZ: b.z, outlined: false };
      }
      this.bldgShadeTag[i] = b.shade != null && b.shade >= 1 && b.shade <= 5 ? b.shade : 0;
      this.bldgInfill[i] = b.shade == null && b.kind !== 'ruin' && b.kind !== 'temple' && b.kind !== 'church';
      if (b.kind === 'temple' || b.kind === 'church') this.templeChurchIdx.push(i);
      if (b.kind === 'forum' || b.kind === 'basilica' || b.kind === 'baths' || b.kind === 'mansio' || b.kind === 'temple' || b.kind === 'church') {
        this.keyLabelIdx.push(i);
      }
    });
  }

  private mapLayers(): Set<string> {
    if (!this.cachedMapLayers) {
      const on = new Set<string>();
      document.querySelectorAll<HTMLInputElement>('#map-legend input[data-layer]').forEach((box) => {
        if (box.checked) on.add(box.dataset.layer ?? '');
      });
      this.cachedMapLayers = on;
    }
    return this.cachedMapLayers;
  }

  /**
   * Legend-ON map content that is suppressed by the 3D show/hide toggles
   * (HUD checkboxes / keys 1-5, persisted in localStorage). The viewer honours
   * both switches, so without this the legend would claim a layer is on while
   * nothing renders — e.g. footprints vanish when "Other building footprints"
   * is off. Each GIS file has its own legend checkbox; shades 1-5 share the 3D
   * "Other building footprints" toggle (the flat GIS overlay, not the extruded
   * "Other buildings" massing), wall (04) shares "Town walls & gates".
   */
  private mapSuppressed(): string[] {
    const layers = this.mapLayers();
    const lv = this.layerVisibility;
    const out: string[] = [];
    if (layers.has('streets') && !lv.roads) out.push('roads (GIS 26)');
    if (layers.has('drains') && !lv.roads) out.push('drains (GIS 27)');
    const anyShadeOn = ['shade1', 'shade2', 'shade3', 'shade4', 'shade5'].some((s) => layers.has(s));
    if (anyShadeOn) {
      if (!lv.footprints && !lv.key) out.push('all buildings');
      else {
        if (!lv.footprints) out.push('shades 1-5 (Great Plan)');
        if (!lv.key) out.push('temples / church / amphitheatre');
      }
    }
    if (layers.has('walls') && !lv.walls) out.push('town wall & gates');
    return [...new Set(out)];
  }

  /** Show/hide the "hidden by 3D toggles" notice in the map panel. */
  private updateMapWarn(): void {
    const el = document.getElementById('map-warn');
    if (!el) return;
    const hidden = this.mapSuppressed();
    if (!hidden.length) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    const list = el.querySelector('#map-warn-list');
    if (list) list.textContent = hidden.join(' · ');
  }

  /** Re-enable every 3D layer (also restores the coupled map content). */
  private showAllLayers(): void {
    (['roads', 'key', 'buildings', 'footprints', 'walls'] as LayerId[]).forEach((id) => this.setLayer(id, true));
  }

  /**
   * Interactive GIS viewer: renders the exact imported vector surfaces
   * (road polygons with holes, building footprint rings, water rings) under a
   * pannable/zoomable viewport — not OBB/centre-line approximations — plus a
   * live player marker, labels and a scale bar.
   */
  private drawDetailMap(): void {
    const canvas = document.getElementById('detailmap') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    this.syncDetailMapSize();
    const W = canvas.width, H = canvas.height;
    const R = 700; // half-extent in metres (matches 1400m terrain)
    const v = this.mapView;
    if (!v.scale) {
      const fit = this.fitMapToTown(W, H);
      v.cx = fit.cx; v.cz = fit.cz; v.scale = fit.scale;
    }
    // Clamp pan so the town cannot be lost off-screen.
    v.cx = Math.max(-900, Math.min(900, v.cx));
    v.cz = Math.max(-900, Math.min(900, v.cz));
    this.updateMapWarn();
    const toMap = (x: number, z: number): [number, number] => [
      W / 2 + (x - v.cx) * v.scale,
      H / 2 + (z - v.cz) * v.scale,
    ];
    // Scalar projection (no tuple allocs): algebraically identical to toMap.
    // Deliberately NOT batched into shared paths: every remaining multi-stroke
    // pass here uses translucent paint, where separate stroke() calls
    // double-blend overlaps and a merged path would union them — different
    // pixels at crossings (including on duplicate GIS artifacts). Fills are
    // already single-path per style and stay exactly as they are.
    const inView = (x: number, z: number, pad = 0): boolean => {
      const mx = W / 2 + (x - v.cx) * v.scale, mz = H / 2 + (z - v.cz) * v.scale;
      return mx >= -pad && mx <= W + pad && mz >= -pad && mz <= H + pad;
    };
    const layers = this.mapLayers();
    // Static plan-geometry cache for the passes below (contours, buildings,
    // labels). Idempotent; also warms the cache when only labels are on.
    this.ensureMapGeoCache();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);

    // Relief backdrop from the imported contour heightfield, drawn under the
    // current viewport (terrain spans [-R, R] in both axes).
    const terr = this.plan.terrain;
    if (layers.has('terrain') && terr.heights.length) {
      if (!this.terrainCache) {
        const c = document.createElement('canvas');
        c.width = terr.grid; c.height = terr.grid;
        const cctx = c.getContext('2d');
        if (cctx) {
          let lo = Infinity, hi = -Infinity;
          for (const h of terr.heights) { if (h < lo) lo = h; if (h > hi) hi = h; }
          const img = cctx.createImageData(terr.grid, terr.grid);
          terr.heights.forEach((h, i) => {
            const f = hi > lo ? (h - lo) / (hi - lo) : 0.5;
            // Cool slate-green so tan/gold building fills and dark outlines read on top.
            img.data[i * 4] = 36 + f * 78;
            img.data[i * 4 + 1] = 48 + f * 62;
            img.data[i * 4 + 2] = 46 + f * 48;
            img.data[i * 4 + 3] = 255;
          });
          cctx.putImageData(img, 0, 0);
          this.terrainCache = c;
        }
      }
      if (this.terrainCache) {
        ctx.imageSmoothingEnabled = true;
        const [tx, ty] = toMap(-R, -R);
        ctx.drawImage(this.terrainCache, tx, ty, 2 * R * v.scale, 2 * R * v.scale);
      }
    }

    // Exact 1m contour vectors (GIS 01, elev in m OD) over the relief backdrop.
    // Index contours (multiple of 5m) draw brighter/thicker; elevations label
    // the longest lines once zoomed in.
    if (layers.has('contours')) {
      this.ensureMapGeoCache();
      for (let ci = 0; ci < this.plan.contours.length; ci++) {
        const c = this.plan.contours[ci];
        // Cheap bbox stage first: projection is affine in world coords, so a
        // bbox fully outside the padded view cannot hold a visible point and
        // the per-point test below would reject it too. Survivors run the
        // exact same point test as before — no culling-behaviour change.
        const cb = this.contourBboxes[ci];
        if (cb) {
          const x0 = W / 2 + (cb.minX - v.cx) * v.scale, x1 = W / 2 + (cb.maxX - v.cx) * v.scale;
          const z0 = H / 2 + (cb.minZ - v.cz) * v.scale, z1 = H / 2 + (cb.maxZ - v.cz) * v.scale;
          if (Math.max(x0, x1) < -40 || Math.min(x0, x1) > W + 40 || Math.max(z0, z1) < -40 || Math.min(z0, z1) > H + 40) continue;
        }
        if (!c.pts.some((p) => inView(p.x, p.z, 40))) continue;
        const index = Math.round(c.elev) % 5 === 0;
        ctx.strokeStyle = index ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.22)';
        ctx.lineWidth = index ? 1.4 : 0.8;
        ctx.beginPath();
        c.pts.forEach((p, i) => {
          const mx = W / 2 + (p.x - v.cx) * v.scale, mz = H / 2 + (p.z - v.cz) * v.scale;
          if (i === 0) ctx.moveTo(mx, mz); else ctx.lineTo(mx, mz);
        });
        ctx.stroke();
      }
      if (v.scale > 2.5) {
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        let labelled = 0;
        for (const c of this.plan.contours) {
          if (labelled >= 40) break;
          if (Math.round(c.elev) % 5 !== 0) continue;
          const mid = c.pts[Math.floor(c.pts.length / 2)];
          if (!mid || !inView(mid.x, mid.z, 0)) continue;
          const [mx, mz] = toMap(mid.x, mid.z);
          if (mx < 0 || mx > W || mz < 0 || mz > H) continue;
          const text = `${c.elev.toFixed(0)}m`;
          ctx.strokeText(text, mx + 3, mz - 3);
          ctx.fillText(text, mx + 3, mz - 3);
          labelled++;
        }
      }
    }

    // Earthwork banks (GIS 03 hatchures chained along the bank; width = scarp).
    // Line width follows zoom like drains.
    if (layers.has('earthworks')) {
      for (const s of this.plan.earthworks) {
        if (!inView(s.x1, s.z1, 20) && !inView(s.x2, s.z2, 20)) continue;
        const [ax, az] = toMap(s.x1, s.z1);
        const [bx, bz] = toMap(s.x2, s.z2);
        ctx.strokeStyle = 'rgba(160,120,80,.85)';
        ctx.lineWidth = Math.max(1, (s.width || 1.4) * v.scale);
        ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
      }
    }

    // Water polygons (exact GIS rings).
    if (layers.has('water')) {
      ctx.fillStyle = 'rgba(46,95,122,.9)'; ctx.beginPath();
        for (const ring of this.plan.water) {
          if (!ring.some((p) => inView(p.x, p.z, 40))) continue;
          ring.forEach((p, i) => {
            const mx = W / 2 + (p.x - v.cx) * v.scale, mz = H / 2 + (p.z - v.cz) * v.scale;
            if (i === 0) ctx.moveTo(mx, mz); else ctx.lineTo(mx, mz);
          });
          ctx.closePath();
        }
      ctx.fill('evenodd');
    }

    // Streets: exact GIS 26 road surfaces (outer rings + holes), as in 3D.
    // 2D legend toggle AND 3D "Roads" toggle must both be on.
    if (layers.has('streets') && this.layerVisibility.roads) {
      if (this.plan.roadPolys.length) {
        ctx.beginPath();
        for (const poly of this.plan.roadPolys) {
          if (!poly.outer.some((p) => inView(p.x, p.z, 60))) continue;
          poly.outer.forEach((p, i) => {
            const mx = W / 2 + (p.x - v.cx) * v.scale, mz = H / 2 + (p.z - v.cz) * v.scale;
            if (i === 0) ctx.moveTo(mx, mz); else ctx.lineTo(mx, mz);
          });
          ctx.closePath();
          for (const hole of poly.holes ?? []) {
            hole.forEach((p, i) => {
              const mx = W / 2 + (p.x - v.cx) * v.scale, mz = H / 2 + (p.z - v.cz) * v.scale;
              if (i === 0) ctx.moveTo(mx, mz); else ctx.lineTo(mx, mz);
            });
            ctx.closePath();
          }
        }
        ctx.fillStyle = 'rgba(194,168,120,.85)';
        ctx.fill('evenodd');
        // Crisp kerb edge once zoomed close enough to see it.
        if (v.scale > 2) {
          ctx.strokeStyle = 'rgba(90,70,45,.55)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else {
        for (const s of this.plan.streets) {
          if (!inView(s.x1, s.z1, 20) && !inView(s.x2, s.z2, 20)) continue;
          const [ax, az] = toMap(s.x1, s.z1);
          const [bx, bz] = toMap(s.x2, s.z2);
          ctx.strokeStyle = s.width >= 8 ? '#c2a878' : 'rgba(194,168,120,.6)';
          ctx.lineWidth = Math.max(1, s.width * v.scale);
          ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
        }
      }
    }

    // Drains (GIS 27 roadside ditches only — never merged into streets).
    // Own 2D legend toggle; shares the 3D "Roads" toggle. True ditch widths.
    if (layers.has('drains') && this.layerVisibility.roads) {
      for (const s of this.plan.drains) {
        if (!inView(s.x1, s.z1, 20) && !inView(s.x2, s.z2, 20)) continue;
        const [ax, az] = toMap(s.x1, s.z1);
        const [bx, bz] = toMap(s.x2, s.z2);
        ctx.strokeStyle = 'rgba(125,148,168,.75)';
        ctx.lineWidth = Math.max(1, s.width * v.scale);
        ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
      }
    }

    // Great Plan building footprints: GIS outline rings + holes (evenodd),
    // OBB fallback for procedural infill. One legend checkbox per GIS file
    // (10-14 = shades 1-5) AND matching 3D toggle: shades share the 3D
    // "Other building footprints" overlay (same rings as the flat 3D mesh, not
    // the extruded "Other buildings" massing); hand-placed temples/church
    // share "Key". Hollow key kits (forum/basilica/baths/mansio) are not
    // drawn as OBB boxes — their surveyed GIS rings (underKey) still fill
    // with the Great Plan shades. Infill houses (no shade) follow shades 1-3;
    // hand-placed temples/church (no shade) follow any shade toggle.
    const shadeOn = (n: number): boolean => layers.has(`shade${n}`);
    const anyShade = shadeOn(1) || shadeOn(2) || shadeOn(3) || shadeOn(4) || shadeOn(5);
    const houseShade = shadeOn(1) || shadeOn(2) || shadeOn(3);
    if (anyShade && (this.layerVisibility.footprints || this.layerVisibility.key)) {
      this.ensureMapGeoCache();
      const KEY_KINDS = new Set(['temple', 'church']);
      // Same projection test as the old per-redraw ring scan, but over the
      // cached bbox (identical min/max values) — same boolean, no ring walk.
      const cachedBboxInView = (idx: number, pad = 8): boolean => {
        const box = this.bldgBox[idx];
        if (!box) return false;
        const x0 = W / 2 + (box.minX - v.cx) * v.scale, z0 = H / 2 + (box.minZ - v.cz) * v.scale;
        const x1 = W / 2 + (box.maxX - v.cx) * v.scale, z1 = H / 2 + (box.maxZ - v.cz) * v.scale;
        const loX = Math.min(x0, x1), hiX = Math.max(x0, x1);
        const loZ = Math.min(z0, z1), hiZ = Math.max(z0, z1);
        return hiX >= -pad && loX <= W + pad && hiZ >= -pad && loZ <= H + pad;
      };
      const bldgInView = (idx: number, b: { x: number; z: number; w: number; d: number }): boolean => {
        if (this.bldgBox[idx]?.outlined) return cachedBboxInView(idx);
        const pad = Math.max(b.w, b.d) * v.scale + 8;
        return inView(b.x, b.z, pad);
      };
      const traceObb = (bx: number, bz: number, w: number, d: number, rotY: number): void => {
        const c = Math.cos(rotY), s = Math.sin(rotY);
        const hw = w / 2, hd = d / 2;
        const corners: Array<[number, number]> = [
          [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd],
        ];
        corners.forEach(([lx, lz], i) => {
          const wx = bx + lx * c + lz * s;
          const wz = bz - lx * s + lz * c;
          const mx = W / 2 + (wx - v.cx) * v.scale, mz = H / 2 + (wz - v.cz) * v.scale;
          if (i === 0) ctx.moveTo(mx, mz); else ctx.lineTo(mx, mz);
        });
        ctx.closePath();
      };
      const tracePath = (ring: Array<{ x: number; z: number }>): void => {
        ring.forEach((p, i) => {
          const mx = W / 2 + (p.x - v.cx) * v.scale, mz = H / 2 + (p.z - v.cz) * v.scale;
          if (i === 0) ctx.moveTo(mx, mz); else ctx.lineTo(mx, mz);
        });
        ctx.closePath();
      };
      const traceBuilding = (b: {
        outline?: Array<{ x: number; z: number }>;
        holes?: Array<Array<{ x: number; z: number }>>;
        x: number; z: number; w: number; d: number; rotY: number;
      }): void => {
        if (b.outline && b.outline.length >= 3) {
          tracePath(b.outline);
          for (const hole of b.holes ?? []) {
            if (hole.length >= 3) tracePath(hole);
          }
        } else {
          traceObb(b.x, b.z, b.w, b.d, b.rotY);
        }
      };
      const shadeVisible = (b: { shade?: number; kind: string }): boolean => {
        if (b.shade != null) return shadeOn(b.shade);
        if (b.kind === 'house' || b.kind === 'shop') return houseShade;
        return anyShade;
      };
      const fills: Array<[number, string]> = [
        [1, 'rgba(214,164,88,.95)'],
        [2, 'rgba(214,128,48,.95)'],
        [3, 'rgba(232,176,32,.95)'],
        [4, 'rgba(168,168,172,.92)'],
        [5, 'rgba(236,236,238,.92)'],
      ];
      const infillShade = shadeOn(1) ? 1 : shadeOn(2) ? 2 : shadeOn(3) ? 3 : 0;
      for (const [shade, style] of fills) {
        if (!shadeOn(shade)) continue;
        ctx.beginPath();
        for (let bi = 0; bi < this.plan.buildings.length; bi++) {
          // Shade-bucket prefilter: integer-tag compare only. Inclusion is
          // still decided by the unchanged predicates below, in plan order,
          // so the traced subpath sequence is identical.
          if (this.bldgShadeTag[bi] !== shade && !(this.bldgInfill[bi] && shade === infillShade)) continue;
          const b = this.plan.buildings[bi];
          if (b.kind === 'forum' || b.kind === 'basilica' || b.kind === 'baths' || b.kind === 'mansio') continue;
          if (b.shade == null) {
            if (b.kind === 'ruin' || KEY_KINDS.has(b.kind)) continue;
            if (shade !== infillShade) continue;
          } else if (b.shade !== shade) continue;
          if (KEY_KINDS.has(b.kind) ? !this.layerVisibility.key : !this.layerVisibility.footprints) continue;
          if (!shadeVisible(b)) continue;
          if (!bldgInView(bi, b)) continue;
          traceBuilding(b);
        }
        ctx.fillStyle = style;
        ctx.fill('evenodd');
        ctx.strokeStyle = shade === 5 ? 'rgba(22,20,18,.95)' : 'rgba(18,12,8,.92)';
        ctx.lineWidth = Math.max(1.35, 0.55 * v.scale);
        ctx.stroke();
      }
      ctx.beginPath();
      for (const bi of this.templeChurchIdx) {
        const b = this.plan.buildings[bi];
        if (!this.layerVisibility.key) continue;
        if (!shadeVisible(b)) continue;
        if (!bldgInView(bi, b)) continue;
        traceBuilding(b);
      }
      ctx.fillStyle = '#b0433a';
      ctx.fill('evenodd');
      if (v.scale > 2) {
        ctx.strokeStyle = 'rgba(18,12,8,.92)';
        ctx.lineWidth = Math.max(1.35, 0.55 * v.scale);
        ctx.stroke();
      }
    }

    // Town wall circuit + gates (GIS 04): own legend checkbox AND the 3D
    // "Town walls & gates" toggle must both be on.
    // Same gatehouse gaps as the 3D mesh, so map and model agree on openings.
    if (layers.has('walls') && this.layerVisibility.walls) {
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2.5; ctx.beginPath();
      const gaps = this.wallGapCache();
      for (let i = 0; i < this.plan.walls.length; i++) {
        const a = this.plan.walls[i], b = this.plan.walls[(i + 1) % this.plan.walls.length];
        for (const [t0, t1] of gaps[i] ?? []) {
          const [sx, sz] = toMap(a.x + (b.x - a.x) * t0, a.z + (b.z - a.z) * t0);
          const [ex, ez] = toMap(a.x + (b.x - a.x) * t1, a.z + (b.z - a.z) * t1);
          ctx.moveTo(sx, sz); ctx.lineTo(ex, ez);
        }
      }
      ctx.stroke();

      // Gates (constant screen size so they stay visible at any zoom).
      ctx.fillStyle = '#fff';
      for (const g of this.plan.gates) {
        if (!inView(g.x, g.z, 10)) continue;
        const [gx, gz] = toMap(g.x, g.z);
        ctx.fillRect(gx - 3, gz - 3, 6, 6);
      }
    }

    // Amphitheatre ellipse (GIS 04 source, 3D key-buildings layer).
    // Shown when the wall (04) legend box is on AND key buildings are visible.
    if (layers.has('walls') && this.layerVisibility.key) {
      const a = this.plan.amphitheatre;
      const [ax, az] = toMap(a.x, a.z);
      ctx.strokeStyle = '#9c8a6a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ax, az, a.rx * v.scale, a.rz * v.scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Labels for key buildings + gates (with halo so they read over relief).
    if (layers.has('labels')) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      const label = (text: string, x: number, z: number): void => {
        const [mx, mz] = toMap(x, z);
        if (mx < 0 || mx > W || mz < 0 || mz > H) return;
        ctx.strokeText(text, mx + 5, mz - 5);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, mx + 5, mz - 5);
      };
      if (this.layerVisibility.key) {
        for (const bi of this.keyLabelIdx) {
          const b = this.plan.buildings[bi];
          label(b.kind === 'church' ? 'St Mary' : b.id, b.x, b.z);
        }
      }
      if (this.layerVisibility.walls && layers.has('walls')) {
        for (const g of this.plan.gates) {
          const [gx, gz] = toMap(g.x, g.z);
          if (gx < 0 || gx > W || gz < 0 || gz > H) continue;
          ctx.strokeText(g.id, gx + 6, gz + 4);
          ctx.fillStyle = '#fff';
          ctx.fillText(g.id, gx + 6, gz + 4);
        }
      }
    }

    // Collectible 3D scans stay off the GIS viewer except while chatting
    // with a ghost (dialogueOpen): the ghosts hint at locations without
    // making them free to browse. Gold diamonds still to find, green collected.
    if (this.dialogueOpen && this.placedCollectibles.length) {
      for (const c of this.placedCollectibles) {
        if (!inView(c.x, c.z, 12)) continue;
        const [mx, mz] = toMap(c.x, c.z);
        const found = this.collectedIds.has(c.id);
        ctx.fillStyle = found ? COLLECTIBLE_HEX_COLLECTED : COLLECTIBLE_HEX_UNCOLLECTED;
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        const r = 5;
        ctx.beginPath();
        ctx.moveTo(mx, mz - r);
        ctx.lineTo(mx + r, mz);
        ctx.lineTo(mx, mz + r);
        ctx.lineTo(mx - r, mz);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Player + ghosts live on the overlay canvas (see drawMapMarkers) so the
    // pulse/heading can update every vsync without re-stroking GIS vectors.
    this.drawMapMarkers();
    // Scale bar (bottom-left, screen-space): pick a nice metric length.
    {
      const target = 120; // px
      const metres = target / v.scale;
      const pow = Math.pow(10, Math.floor(Math.log10(metres)));
      const nice = [1, 2, 5, 10].map((m) => m * pow).find((m) => m * v.scale >= 60) ?? 10 * pow;
      const len = nice * v.scale;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(10, H - 26, len + 12, 20);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(16, H - 12); ctx.lineTo(16 + len, H - 12);
      ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, 16, H - 16);
    }
  }

  /**
   * Pulsing ghost dots. `scale` is canvas-px per world metre; `size` scales
   * the halo/core (1 on the GIS overlay, smaller on the 180px minimap).
   * Icy blue until you have spoken to that costume; hot pink afterwards.
   */
  private paintGhostDots(
    ctx: CanvasRenderingContext2D,
    ox: number, oz: number, scale: number,
    W: number, H: number, size: number,
  ): void {
    if (!this.ghostsVisible || !this.ghosts) return;
    const n = this.ghosts.writeXZ(this.ghostMapXZ, this.ghostMapSpoken, this.spokenCostumes);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
    const haloR = (5 + pulse * 8) * size;
    const coreR = (3.2 + pulse * 1.6) * size;
    const pad = haloR + 2;
    const paint = (spoken: 0 | 1, color: string): void => {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.14 + pulse * 0.28;
      for (let i = 0; i < n; i++) {
        if (this.ghostMapSpoken[i] !== spoken) continue;
        const mx = ox + this.ghostMapXZ[i * 2] * scale;
        const mz = oz + this.ghostMapXZ[i * 2 + 1] * scale;
        if (mx < -pad || mx > W + pad || mz < -pad || mz > H + pad) continue;
        ctx.beginPath();
        ctx.arc(mx, mz, haloR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.72 + pulse * 0.28;
      for (let i = 0; i < n; i++) {
        if (this.ghostMapSpoken[i] !== spoken) continue;
        const mx = ox + this.ghostMapXZ[i * 2] * scale;
        const mz = oz + this.ghostMapXZ[i * 2 + 1] * scale;
        if (mx < -pad || mx > W + pad || mz < -pad || mz > H + pad) continue;
        ctx.beginPath();
        ctx.arc(mx, mz, coreR, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    paint(0, '#c8e6ff');
    paint(1, '#ff3d9a');
    ctx.globalAlpha = 1;
  }

  /** Gold/green diamonds for 3D-scan find-spots. */
  private paintCollectibleDiamonds(
    ctx: CanvasRenderingContext2D,
    ox: number, oz: number, scale: number,
    r: number,
  ): void {
    if (!this.placedCollectibles.length) return;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, r * 0.3);
    for (const c of this.placedCollectibles) {
      const mx = ox + c.x * scale;
      const mz = oz + c.z * scale;
      ctx.fillStyle = this.collectedIds.has(c.id) ? COLLECTIBLE_HEX_COLLECTED : COLLECTIBLE_HEX_UNCOLLECTED;
      ctx.beginPath();
      ctx.moveTo(mx, mz - r);
      ctx.lineTo(mx + r, mz);
      ctx.lineTo(mx, mz + r);
      ctx.lineTo(mx - r, mz);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * Live player + pulsing ghost dots on the overlay canvas. Clear+16 arcs;
   * the GIS plan is never redrawn from here. Skips layout reads (sizing is
   * done in syncDetailMapSize on open/resize/pan). Tick caps this at ~24fps;
   * pan/zoom still call it immediately so markers stay under the cursor.
   */
  private drawMapMarkers(): void {
    if (!this.mapOpen) return;
    const canvas = this.ensureMarkerCanvas();
    const ctx = this.markerMapCtx;
    if (!canvas || !ctx) return;
    const W = canvas.width, H = canvas.height;
    const v = this.mapView;
    if (W < 2 || H < 2 || !v.scale) return;
    ctx.clearRect(0, 0, W, H);
    const ox = W / 2 - v.cx * v.scale;
    const oz = H / 2 - v.cz * v.scale;
    this.paintGhostDots(ctx, ox, oz, v.scale, W, H, 1);

    const px = ox + this.camera.position.x * v.scale;
    const pz = oz + this.camera.position.z * v.scale;
    const dir = this.mapHeading;
    this.camera.getWorldDirection(dir);
    const dl = Math.hypot(dir.x, dir.z) || 1;
    ctx.strokeStyle = '#2eff6e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(px + (dir.x / dl) * 12, pz + (dir.z / dl) * 12);
    ctx.stroke();
    ctx.fillStyle = '#2eff6e';
    ctx.beginPath();
    ctx.arc(px, pz, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /** Town plan only — no player/ghost/item dots (those composite live). */
  private drawMinimapGis(W: number, H: number): void {
    let gis = this.minimapGis;
    if (!gis || gis.width !== W || gis.height !== H) {
      gis = document.createElement('canvas');
      gis.width = W;
      gis.height = H;
      this.minimapGis = gis;
    }
    const ctx = gis.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    const toMap = (x: number, z: number): [number, number] => [
      W / 2 + (x / 700) * (W / 2),
      H / 2 + (z / 700) * (H / 2),
    ];
    // walls (from live plan, so SHP import shows up here too; gate gaps as in 3D)
    if (this.layerVisibility.walls) {
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; ctx.beginPath();
      const gaps = this.wallGapCache();
      for (let i = 0; i < this.plan.walls.length; i++) {
        const a = this.plan.walls[i], b = this.plan.walls[(i + 1) % this.plan.walls.length];
        for (const [t0, t1] of gaps[i] ?? []) {
          const [sx, sz] = toMap(a.x + (b.x - a.x) * t0, a.z + (b.z - a.z) * t0);
          const [ex, ez] = toMap(a.x + (b.x - a.x) * t1, a.z + (b.z - a.z) * t1);
          ctx.moveTo(sx, sz); ctx.lineTo(ex, ez);
        }
      }
      ctx.stroke();
    }
    // streets (GIS 26 surfaces; centre-lines only as pre-import fallback)
    // The main road poly is one giant connected surface whose holes are the
    // insulae blocks — holes must be cut out with 'evenodd' (as the detail
    // map does), otherwise whole blocks infill brown.
    if (this.layerVisibility.roads) {
      if (this.plan.roadPolys.length) {
        ctx.beginPath();
        for (const poly of this.plan.roadPolys) {
          poly.outer.forEach((p, i) => {
            const [mx, mz] = toMap(p.x, p.z);
            if (i === 0) ctx.moveTo(mx, mz); else ctx.lineTo(mx, mz);
          });
          ctx.closePath();
          for (const hole of poly.holes ?? []) {
            hole.forEach((p, i) => {
              const [mx, mz] = toMap(p.x, p.z);
              if (i === 0) ctx.moveTo(mx, mz); else ctx.lineTo(mx, mz);
            });
            ctx.closePath();
          }
        }
        ctx.fillStyle = 'rgba(194,168,120,.85)';
        ctx.fill('evenodd');
      } else {
        for (const s of this.plan.streets) {
          const [ax, az] = toMap(s.x1, s.z1);
          const [bx, bz] = toMap(s.x2, s.z2);
          ctx.strokeStyle = s.width >= 8 ? '#c2a878' : 'rgba(194,168,120,.55)';
          ctx.lineWidth = s.width >= 8 ? 2 : 1;
          ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
        }
      }
    }
    // drains (GIS 27) follow the detail-legend toggle; hidden by default
    const showDrains = this.drainsBox?.checked ?? document.querySelector<HTMLInputElement>('#map-legend input[data-layer="drains"]')?.checked ?? false;
    if (this.layerVisibility.roads && showDrains) {
      ctx.strokeStyle = 'rgba(125,148,168,.8)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const s of this.plan.drains) {
        const [ax, az] = toMap(s.x1, s.z1);
        const [bx, bz] = toMap(s.x2, s.z2);
        ctx.moveTo(ax, az); ctx.lineTo(bx, bz);
      }
      ctx.stroke();
    }
    // earthworks (GIS 03): same bank centre-lines as the 3D mounds.
    ctx.strokeStyle = 'rgba(160,120,80,.8)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of this.plan.earthworks) {
      const [ax, az] = toMap(s.x1, s.z1);
      const [bx, bz] = toMap(s.x2, s.z2);
      ctx.moveTo(ax, az); ctx.lineTo(bx, bz);
    }
    ctx.stroke();
    // gates
    if (this.layerVisibility.walls) {
      ctx.fillStyle = '#fff';
      for (const g of this.plan.gates) {
        const [gx, gz] = toMap(g.x, g.z);
        ctx.fillRect(gx - 1.5, gz - 1.5, 3, 3);
      }
    }
    // amphitheatre (outside east wall, part of key buildings)
    if (this.layerVisibility.key) {
      const a = this.plan.amphitheatre;
      const [ax, az] = toMap(a.x, a.z);
      ctx.strokeStyle = '#9c8a6a'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ax, az, (a.rx / 700) * (W / 2), (a.rz / 700) * (H / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // forum marker (part of key buildings)
    if (this.layerVisibility.key) {
      const [fx, fz] = toMap(8, 0);
      ctx.fillStyle = '#b0433a';
      ctx.fillRect(fx - 2, fz - 2, 4, 4);
    }
  }

  /**
   * Blit cached GIS then live markers. 180×180 drawImage + ~16 arcs; the
   * town plan is never restroked here.
   */
  private drawMinimapMarkers(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    const gis = this.minimapGis;
    if (!ctx || !gis) return;
    const W = canvas.width, H = canvas.height;
    ctx.drawImage(gis, 0, 0);
    const scale = W / 1400;
    const ox = W / 2, oz = H / 2;
    this.paintGhostDots(ctx, ox, oz, scale, W, H, 0.55);
    // Item find-spots stay on the HUD minimap (the GIS viewer still only
    // reveals them while chatting, so zooming the town is not a spoiler).
    this.paintCollectibleDiamonds(ctx, ox, oz, scale, 3.5);
    const px = ox + this.camera.position.x * scale;
    const pz = oz + this.camera.position.z * scale;
    ctx.fillStyle = '#2eff6e';
    ctx.beginPath(); ctx.arc(px, pz, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
