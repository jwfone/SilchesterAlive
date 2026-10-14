import * as THREE from 'three';
import { insideReserve, earthworkWidth, earthworkHeight, earthworkProfile, type TownPlan } from '../domain/townPlan.js';
import { getAtlas, remapUV } from './kit/atlas.js';
import { mergeMixed } from './kit/merge.js';
import { carveRects, drapeOnGround, type Rect } from './kit/decal.js';
import { buildTownWallMesh } from './kit/townWall.js';
import { getTiledAtlasMaterial } from './kit/atlasTiled.js';
import { DITCH, FACE, buildTownWall, earthworkOffset, wallDeckAt, type TownWall } from '../domain/townWall.js';
import { buildGableRoofGeometry } from './kit/roofs.js';
import { buildHouseWithOpeningsGeometry } from './kit/houses.js';
import { buildColumnGeometry } from './kit/columns.js';
import { buildTerrainSurface, type Platform } from '../domain/terrainSurface.js';
import { DECK_STEP, placePlanBuilding, planFootprintBounds, setPlanBuildingDisplay, type KeyBuildingDisplay, type PlacedPlanBuilding } from './kit/planWorld.js';
import { KEY_PLANS, TOWN_WALL } from '../domain/keyPlans.generated.js';
import { planToWorld, worldToPlan } from '../domain/keyPlan.js';
import type { EllipseBand } from './PlayerControls.js';
import { arenaHoleWorld, planExtentUV } from '../domain/arenaPlan.js';
import { buildContactShadows, type ShadowSpot } from './kit/ao.js';
import type { CircleCollider, PolyCollider } from './PlayerControls.js';
import type { LayerId } from '../domain/layers.js';

export interface Collider {
  minX: number; maxX: number; minZ: number; maxZ: number;
  /** Obstacle height in metres. Omitted = infinitely tall (cannot jump over). */
  h?: number;
}

export type LayerGroups = Record<LayerId, THREE.Group>;
export type LayerColliders = Record<LayerId, Collider[]>;
export type LayerCircles = Record<LayerId, CircleCollider[]>;
export type LayerPolys = Record<LayerId, PolyCollider[]>;

export interface BuiltWorld {
  group: THREE.Group;
  layerGroups: LayerGroups;
  colliders: Collider[];
  collidersByLayer: LayerColliders;
  circles: CircleCollider[];
  circlesByLayer: LayerCircles;
  polys: PolyCollider[];
  polysByLayer: LayerPolys;
  bands: EllipseBand[];
  drawCalls: number;
  tris: number;
  /** Walkable height at (x, z). With `feet` (the walker's foot height), raised decks a step or less above the
   * feet count too: the wall-walk, a gate's platform, stairs, bridges. */
  groundY: (x: number, z: number, feet?: number) => number;
  /** Drawn terrain surface height (no banks or building floors): what the ground mesh shows. */
  terrainY: (x: number, z: number) => number;
  /** The town wall's circuit, gates and earthworks (domain/townWall.ts), and its mesh's triangle counts. */
  townWall: TownWall;
  townWallTris: { wall: number; earth: number; total: number };
  /** Show/hide drain instances inside the shared roads mesh (drains hidden by default). */
  setDrainsVisible: (visible: boolean) => void;
  /** Key buildings generated from curated plans (assets/key-plans), e.g. the baths. */
  planBuildings: PlacedPlanBuilding[];
  /** Display mode for plan-built buildings: a surface style (quality tier) or evidence colours. */
  setKeyBuildingDisplay: (mode: KeyBuildingDisplay) => void;
}

// Relief is median-centred GIS terrain (up to ±16m at the plateau edge).
// Full relief would bury streets/AO decals, so the greybox plays it at 25%.
const RELIEF_SCALE = 0.25;
/** Levelled ground under key buildings: flat this far beyond the footprint, then a ramp. */
const PLATFORM_MARGIN = 2;
const PLATFORM_RAMP = 6;
/**
 * Ground decals (roads, footprint overlay, water) lie this far above the ground. Order between layers
 * and against the terrain at any distance comes from a depth bias per layer (DECAL_BIAS, in depth-buffer
 * units, so it scales with distance the way depth precision does), not from height.
 */
const DECAL_LIFT = 0.06;
const DECAL_BIAS = { earthworks: -2, water: -4, footprints: -7, roads: -10 };

function emptyLayerPolys(): LayerPolys {
  return { roads: [], key: [], buildings: [], footprints: [], walls: [] };
}

function physicsForPlanByLayer(plan: TownPlan): { boxes: LayerColliders; polys: LayerPolys } {
  // footprints is a flat decal overlay: never collidable (empty by design).
  const boxes: LayerColliders = { roads: [], key: [], buildings: [], footprints: [], walls: [] };
  const polys = emptyLayerPolys();
  // The town wall's colliders come from its own generator (kit/townWall.ts, in buildWorld): they carry
  // the walk's height, so the wall-walk is walkable.
  for (const b of plan.buildings) {
    if (b.kind === 'forum' || b.kind === 'basilica' || b.kind === 'baths' || b.kind === 'mansio') continue; // hollow key buildings have own colliders
    // GIS traces: skip tiny stubs and footprints that sit on key plots so the
    // forum/baths interiors stay walkable while the plan still renders.
    if (b.outline && b.outline.length >= 3) {
      if (b.stub) continue;
      if (b.underKey) continue;
      if (insideReserve(b.x, b.z, 2)) continue;
      // Low ruin slabs are walk-over traces; a 2D box around them was an
      // invisible wall. Masonry extrusions collide with the GIS ring itself
      // (not the PCA OBB AABB, which fills courtyards and crosses streets).
      if (b.kind === 'ruin') continue;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of b.outline) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
      polys.buildings.push({ outline: b.outline, holes: b.holes, minX, maxX, minZ, maxZ });
      continue;
    }
    // Kit houses/temples/church: axis-aligned bound of the rotY-oriented box,
    // matching the instanced mesh (unrotated AABBs used to transpose near ±90°).
    const hw = b.w / 2, hd = b.d / 2;
    const c = Math.abs(Math.cos(b.rotY)), s = Math.abs(Math.sin(b.rotY));
    const ex = hw * c + hd * s, ez = hw * s + hd * c;
    const box = { minX: b.x - ex, maxX: b.x + ex, minZ: b.z - ez, maxZ: b.z + ez };
    // Solid temples/church render in the key-buildings layer; leftover infill
    // houses/shops/ruins (no GIS ring) render in the other-buildings layer.
    if (b.kind === 'temple' || b.kind === 'church') boxes.key.push(box);
    else boxes.buildings.push(box);
  }
  return { boxes, polys };
}

/** Derive axis-aligned colliders (walls as thick segments, houses as boxes), tagged by layer. */
export function collidersForPlanByLayer(plan: TownPlan): LayerColliders {
  return physicsForPlanByLayer(plan).boxes;
}

export function polysForPlanByLayer(plan: TownPlan): LayerPolys {
  return physicsForPlanByLayer(plan).polys;
}

/** Derive axis-aligned colliders (walls as thick segments, houses as boxes). */
export function collidersForPlan(plan: TownPlan): Collider[] {
  const byLayer = collidersForPlanByLayer(plan);
  return [...byLayer.walls, ...byLayer.key, ...byLayer.buildings];
}

const COLUMN_UNIT_H = 5.65; // buildColumnGeometry(5): base .35 + shaft 5 + cap .3

/** The ground's material with the ditch cut out: fragments over the grid quads given are discarded (the
 * earthworks mesh draws the ditch there). A world-space mask texture at 0.5 m. */
function ditchMaskedMaterial(base: THREE.Material, quads: Array<[number, number, number, number]>): THREE.Material {
  if (!quads.length) return base;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [a, b, c, d] of quads) { x0 = Math.min(x0, a); z0 = Math.min(z0, b); x1 = Math.max(x1, c); z1 = Math.max(z1, d); }
  const RES = 0.5, W = Math.ceil((x1 - x0) / RES), H = Math.ceil((z1 - z0) / RES);
  const data = new Uint8Array(W * H);
  // the quads sit on the 2.5 m grid, a whole number of mask pixels, so marking pixel centres covers them exactly
  for (const [a, b, c, d] of quads) {
    const i0 = Math.ceil((a - x0) / RES - 0.5), i1 = Math.floor((c - x0) / RES - 0.5);
    const j0 = Math.ceil((b - z0) / RES - 0.5), j1 = Math.floor((d - z0) / RES - 0.5);
    for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) data[j * W + i] = 255;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDitchMask = { value: tex };
    sh.uniforms.uDitchRect = { value: new THREE.Vector4(x0, z0, x1 - x0, z1 - z0) };
    sh.vertexShader = 'varying vec2 vGroundXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGroundXZ = position.xz;');
    sh.fragmentShader = 'uniform sampler2D uDitchMask;\nuniform vec4 uDitchRect;\nvarying vec2 vGroundXZ;\n' + sh.fragmentShader.replace('void main() {',
      'void main() {\n  vec2 dm = (vGroundXZ - uDitchRect.xy) / uDitchRect.zw;\n  if (dm.x > 0.0 && dm.x < 1.0 && dm.y > 0.0 && dm.y < 1.0 && texture2D(uDitchMask, dm).r > 0.5) discard;');
  };
  m.customProgramCacheKey = () => 'ground-ditch-mask';
  return m;
}

export function buildWorld(plan: TownPlan): BuiltWorld {
  const group = new THREE.Group();
  const layerGroups: LayerGroups = {
    roads: new THREE.Group(),
    key: new THREE.Group(),
    buildings: new THREE.Group(),
    footprints: new THREE.Group(),
    walls: new THREE.Group(),
  };
  layerGroups.roads.name = 'layer-roads';
  layerGroups.key.name = 'layer-key';
  layerGroups.buildings.name = 'layer-buildings';
  layerGroups.footprints.name = 'layer-footprints';
  layerGroups.walls.name = 'layer-walls';
  group.add(layerGroups.roads, layerGroups.key, layerGroups.buildings, layerGroups.footprints, layerGroups.walls);
  const { boxes: collidersByLayer, polys: polysByLayer } = physicsForPlanByLayer(plan);
  const colliders = [...collidersByLayer.walls, ...collidersByLayer.key, ...collidersByLayer.buildings];
  const polys = [...polysByLayer.buildings, ...polysByLayer.key];
  const circles: CircleCollider[] = [];
  const circlesByLayer: LayerCircles = { roads: [], key: [], buildings: [], footprints: [], walls: [] };
  const bands: EllipseBand[] = [];
  // footprints carry no AO decals: hiding "buildings" must not leave floating shadows and vice versa.
  const shadowsByLayer: Record<LayerId, ShadowSpot[]> = { roads: [], key: [], buildings: [], footprints: [], walls: [] };
  const atlas = getAtlas();
  const kitMat = atlas.material;
  /** The kit material with a depth bias: for surfaces that lie on the ground (see DECAL_BIAS). */
  const decalMaterial = (units: number): THREE.MeshLambertMaterial => {
    const m = kitMat.clone();
    m.polygonOffset = true; m.polygonOffsetFactor = 0; m.polygonOffsetUnits = units;
    return m;
  };
  // Key buildings stand on levelled platforms (the terrain is flattened under each, with a short
  // ramp back to the contours), so floors, walls and the ground agree. Their kits do not depend on
  // the ground, so they are built first to learn their footprints.
  const publicBs = plan.buildings.filter((x) => x.kind === 'temple' || x.kind === 'church');
  const platforms: Platform[] = [];
  /** Key buildings' own footprints: ground decals (roads) are cut out of these, the reconstruction has its own floors. */
  const keepOuts: Rect[] = [];
  const addPlatform = (minX: number, maxX: number, minZ: number, maxZ: number): void => {
    keepOuts.push({ minX, maxX, minZ, maxZ });
    const p: Platform = { minX: minX - PLATFORM_MARGIN, maxX: maxX + PLATFORM_MARGIN, minZ: minZ - PLATFORM_MARGIN, maxZ: maxZ + PLATFORM_MARGIN, ramp: PLATFORM_RAMP };
    // Neighbouring buildings (the two temples) share one platform: fewer grid lines, no thin ridge between.
    const near = PLATFORM_RAMP * 2 + 6;
    const q = platforms.find((o) => p.minX < o.maxX + near && p.maxX > o.minX - near && p.minZ < o.maxZ + near && p.maxZ > o.minZ - near);
    if (!q) { platforms.push(p); return; }
    q.minX = Math.min(q.minX, p.minX); q.maxX = Math.max(q.maxX, p.maxX); q.minZ = Math.min(q.minZ, p.minZ); q.maxZ = Math.max(q.maxZ, p.maxZ);
  };
  {
    for (const b of publicBs) {
      const c = Math.abs(Math.cos(b.rotY)), sn = Math.abs(Math.sin(b.rotY));
      const ex = (b.w / 2) * c + (b.d / 2) * sn, ez = (b.w / 2) * sn + (b.d / 2) * c;
      addPlatform(b.x - ex, b.x + ex, b.z - ez, b.z + ez);
    }
    // (not the town gates: they stand on the wall line, which follows the ground; a platform each would add
    // grid lines across the whole terrain and every draped decal)
    for (const kp of Object.values(KEY_PLANS)) { if (kp.id.endsWith('-gate')) continue; const b = planFootprintBounds(kp); addPlatform(b.minX, b.maxX, b.minZ, b.maxZ); }
  }
  // A sunken arena (the amphitheatre) sits in a hole in the drawn ground that its own surfaces fill.
  const groundHoles = Object.values(KEY_PLANS).map(arenaHoleWorld).filter((h): h is NonNullable<typeof h> => !!h);
  const surface = buildTerrainSurface(plan.terrain, RELIEF_SCALE, platforms, groundHoles);
  // The town wall (stone phase): its rampart behind and ditch in front are part of the ground. The ditch
  // lowers the drawn terrain (a mesh of its own fills it; the coarse ground mesh is hidden there); the
  // rampart and the gates' mounds stand on it, walkable like the grass banks.
  const townWall = buildTownWall(TOWN_WALL, KEY_PLANS);
  /** Levelled terrain without the earthworks (the wall's foot, the ditch's lips). */
  const gyBase = surface.sample;
  // The gates stand on ground levelled locally (to the highest point under each, blending back over 4 m), drawn by
  // the earthworks mesh: a platform in the terrain grid would add lines across the whole ground and every decal.
  const GATE_BLEND = 4;
  const gateLevels = townWall.gates.map((g) => {
    const e = planExtentUV(g.plan);
    let level = -Infinity;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) {
      const p = planToWorld(g.plan, e.u0 + ((e.u1 - e.u0) * i) / 8, e.v0 + ((e.v1 - e.v0) * j) / 4);
      level = Math.max(level, gyBase(p.x, p.z));
    }
    return { plan: g.plan, e, level, c: g.centre, r: Math.hypot(e.u1 - e.u0, e.v1 - e.v0) / 2 + GATE_BLEND + 2 };
  });
  /** Height the gate's levelling raises the ground at (x, z) (0 away from the gates). */
  const gateLift = (x: number, z: number): number => {
    for (const gl of gateLevels) {
      if (Math.abs(x - gl.c.x) > gl.r || Math.abs(z - gl.c.z) > gl.r) continue;
      const [u, v] = worldToPlan(gl.plan, x, z);
      const d = Math.hypot(Math.max(gl.e.u0 - 1 - u, 0, u - gl.e.u1 - 1), Math.max(gl.e.v0 - 1 - v, 0, v - gl.e.v1 - 1));
      if (d >= GATE_BLEND) continue;
      const t = d / GATE_BLEND, w = 1 - t * t * (3 - 2 * t);
      return Math.max(0, gl.level - gyBase(x, z)) * w;
    }
    return 0;
  };
  /** The levelled ground the wall and the gates stand on, before the ditch. */
  const gyLevel = (x: number, z: number): number => gyBase(x, z) + gateLift(x, z);
  /** Drawn ground height: the terrain mesh itself (see domain/terrainSurface), down in the ditch, levelled at the gates. */
  const gy = (x: number, z: number): number => { const o = earthworkOffset(townWall, x, z); return gyLevel(x, z) + (o < 0 ? o : 0); };
  /** Rampart and gate mounds above the drawn ground. */
  const rampartLift = (x: number, z: number): number => Math.max(0, earthworkOffset(townWall, x, z));
  let bridgeDeckAt: (x: number, z: number) => number | undefined = () => undefined;
  // Spatial hash over earthwork bank segments so ground-lift and mound meshing
  // only test nearby centre-lines (chained GIS 03 hatchures).
  const BANK_CELL = 25;
  const bankGrid = new Map<number, number[]>();
  const bankCellKey = (ix: number, iz: number): number => ix * 4096 + iz;
  plan.earthworks.forEach((s, i) => {
    const pad = earthworkWidth(s) / 2;
    const x0 = Math.floor((Math.min(s.x1, s.x2) - pad + 1024) / BANK_CELL);
    const x1 = Math.floor((Math.max(s.x1, s.x2) + pad + 1024) / BANK_CELL);
    const z0 = Math.floor((Math.min(s.z1, s.z2) - pad + 1024) / BANK_CELL);
    const z1 = Math.floor((Math.max(s.z1, s.z2) + pad + 1024) / BANK_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = bankCellKey(ix, iz);
        let list = bankGrid.get(k);
        if (!list) { list = []; bankGrid.set(k, list); }
        list.push(i);
      }
    }
  });
  /** Extra height above contour terrain when standing on a grass bank (0 elsewhere). */
  const bankLift = (x: number, z: number): number => {
    const list = bankGrid.get(bankCellKey(
      Math.floor((x + 1024) / BANK_CELL),
      Math.floor((z + 1024) / BANK_CELL),
    ));
    if (!list) return 0;
    let lift = 0;
    for (const i of list) {
      const s = plan.earthworks[i];
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / l2));
      const dist = Math.hypot(x - (s.x1 + dx * t), z - (s.z1 + dz * t));
      const w = earthworkWidth(s);
      if (dist > w / 2) continue;
      const h = earthworkProfile(dist / (w / 2)) * earthworkHeight(s);
      if (h > lift) lift = h;
    }
    return lift;
  };
  /** Floors of plan-built buildings (filled in below): inside their rooms you walk on the floor. */
  const planFloors: Array<{ at: (x: number, z: number, feet?: number) => number | undefined; overrides: boolean }> = [];
  /** Walkable ground: contour terrain plus grass-bank lift (player rides over banks), or a building floor
   * (a sunken arena's floor replaces the ground; other floors stand on it). */
  const groundY = (x: number, z: number, feet?: number): number => {
    let ground = gy(x, z) + bankLift(x, z) + rampartLift(x, z);
    for (const f of planFloors) {
      const y = f.at(x, z, feet);
      if (y !== undefined) { ground = f.overrides ? y : Math.max(ground, y); break; }
    }
    if (feet !== undefined) {
      // the wall-walk, counterforts and their steps; the bridges over the ditch
      const d = wallDeckAt(townWall, x, z);
      if (d) { const y = gyLevel(d.footX, d.footZ) + d.y; if (y <= feet + DECK_STEP) ground = Math.max(ground, y); }
      const b = bridgeDeckAt(x, z);
      if (b !== undefined && b <= feet + DECK_STEP) ground = Math.max(ground, b);
    }
    return ground;
  };
  let tris = 0;
  const countTris = (g: THREE.BufferGeometry, instances = 1): void => {
    const idx = g.index ? g.index.count : g.attributes.position.count;
    tris += (idx / 3) * instances;
  };

  const builtWall = buildTownWallMesh(townWall, gyLevel, { raised: gateLift });
  bridgeDeckAt = builtWall.bridgeDeckAt;
  // roads stop at the ditch where a bridge carries them over it (the deck is the road there)
  for (const g of townWall.gates.filter((x) => x.crossing === 'bridge')) {
    const s0 = -FACE.outer + DITCH.from - 0.5, s1 = -FACE.outer + DITCH.from + DITCH.width + 0.5, half = 3;
    const xs: number[] = [], zs: number[] = [];
    for (const sv of [s0, s1]) for (const l of [-half, half]) { xs.push(g.centre.x + g.out.x * sv + g.along.x * l); zs.push(g.centre.z + g.out.z * sv + g.along.z * l); }
    keepOuts.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
  }
  const townWallMeshes: THREE.Mesh[] = [];
  const groundMaterial = ditchMaskedMaterial(kitMat, builtWall.ditchQuads);

  // Ground: the terrain surface as a mesh (1 draw): nodes at the heightfield's texel centres plus
  // grid lines at each platform edge. Falls back to a flat quad pre-import.
  {
    const { coords, heights } = surface;
    const n = coords.length;
    const positions = new Float32Array(n * n * 3), uvs = new Float32Array(n * n * 2);
    const half = plan.terrain.size / 2;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        positions.set([coords[i], heights[k], coords[j]], k * 3);
        uvs.set([(coords[i] + half) / (2 * half), 1 - (coords[j] + half) / (2 * half)], k * 2);
      }
    }
    const index: number[] = [];
    const inHole = (x: number, z: number): boolean => surface.holes.some((h) => x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ);
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        if (inHole((coords[i] + coords[i + 1]) / 2, (coords[j] + coords[j + 1]) / 2)) continue;
        const v00 = j * n + i, v10 = v00 + 1, v01 = v00 + n, v11 = v01 + 1;
        index.push(v00, v01, v10, v10, v01, v11); // split along the diagonal TerrainSurface.sample uses
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    remapUV(g, 'grass', 90, 90);
    const ground = new THREE.Mesh(g, groundMaterial);
    ground.name = 'ground';
    group.add(ground);
    countTris(g);
  }

  // Streets (GIS 26 surfaces) + drains (GIS 27): drains stay one InstancedMesh
  // of unit boxes (1 draw). Roads render as draped GIS polygons (exact joins
  // and true widths) merged into ONE static mesh (1 draw) — same decal pattern
  // as water. Centre-line boxes are kept only as a pre-import fallback when
  // plan.roadPolys is empty. Drains sit just below road slabs so coincident
  // lines hide under roads while flanking ditches peek out alongside.
  // Single mesh keeps the draw budget flat; layers stay distinct in data and
  // on the 2D maps. Drains are hidden by default via setDrainsVisible.
  let setDrainsVisible: (visible: boolean) => void = () => {};
  {
    // Road surfaces first (renderOrder 1, below drains at 2? no — roads above
    // ground, drains peek alongside; failed polys fall back to boxes).
    const roadParts: THREE.BufferGeometry[] = [];
    let roadFallback: Array<{ x1: number; z1: number; x2: number; z2: number; width: number }> = [];
    if (plan.roadPolys.length) {
      for (const poly of plan.roadPolys) {
        try {
          if (!poly.outer || poly.outer.length < 3) continue;
          const shape = new THREE.Shape(poly.outer.map((p) => new THREE.Vector2(p.x, -p.z)));
          for (const hole of poly.holes ?? []) {
            if (hole.length < 3) continue;
            shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, -p.z))));
          }
          const flat = new THREE.ShapeGeometry(shape);
          if (!flat.attributes.position || flat.attributes.position.count < 3) continue;
          flat.rotateX(-Math.PI / 2); // shape (x,-z) -> world (x, 0, z)
          const g = carveRects(flat, keepOuts);
          if (!g) continue;
          const draped = drapeOnGround(g, gy, DECAL_LIFT, surface.coords);
          draped.computeVertexNormals();
          remapUV(draped, 'street', 1, 1);
          roadParts.push(draped);
        } catch {
          continue; // per-poly skip (bad ring): rest of network still renders
        }
      }
      if (!roadParts.length) roadFallback = plan.streets; // total triangulation failure
    } else {
      roadFallback = plan.streets;
    }
    if (roadParts.length) {
      const merged = mergeMixed(roadParts, 'roads');
      const mesh = new THREE.Mesh(merged, decalMaterial(DECAL_BIAS.roads));
      mesh.name = 'roads';
      mesh.renderOrder = 1; // above ground, below AO blobs
      layerGroups.roads.add(mesh);
      countTris(merged);
    }
    const items = [
      ...roadFallback.map((s) => ({ s, y: DECAL_LIFT - 0.075 })),
      ...plan.drains.map((s) => ({ s, y: 0.01 - 0.075 })), // top just under the road surface
    ];
    const drainBase = roadFallback.length;
    const g = new THREE.BoxGeometry(1, 0.15, 1);
    remapUV(g, 'street', 1, 1);
    const inst = new THREE.InstancedMesh(g, decalMaterial(DECAL_BIAS.water), Math.max(1, items.length));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
    const writeInstance = (it: { s: { x1: number; z1: number; x2: number; z2: number; width: number }; y: number }, i: number, visible: boolean): void => {
      const s = it.s;
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      // Flat top at the middle's height; the box is deepened to reach the lowest ground along it.
      const cx = (s.x1 + s.x2) / 2, cz = (s.z1 + s.z2) / 2;
      const top = gy(cx, cz) + it.y + 0.075;
      const bottom = Math.min(top - 0.15, gy(s.x1, s.z1) - 0.05, gy(s.x2, s.z2) - 0.05, gy(cx, cz) - 0.05);
      P.set(cx, (top + bottom) / 2, cz);
      E.set(0, ang + Math.PI / 2, 0); Q.setFromEuler(E);
      if (visible) S.set(len, (top - bottom) / 0.15, s.width);
      else S.set(0, 0, 0);
      M.compose(P, Q, S);
      inst.setMatrixAt(i, M);
    };
    items.forEach((it, i) => writeInstance(it, i, true));
    inst.instanceMatrix.needsUpdate = true;
    inst.count = items.length;
    layerGroups.roads.add(inst);
    countTris(g, items.length);
    const drainItems = items.slice(drainBase);
    // Hiding via `count` (not zero-scale matrices): hidden drains are skipped
    // entirely instead of rasterising degenerate triangles. Hide keeps the
    // road-fallback instances (`count = drainBase`); show restores the full
    // range. Matrices are rewritten on show so a previous hide can never
    // leave stale zero-scales behind.
    setDrainsVisible = (visible: boolean): void => {
      if (visible) {
        drainItems.forEach((it, k) => writeInstance(it, drainBase + k, true));
        inst.count = items.length;
      } else {
        inst.count = drainBase;
      }
      inst.instanceMatrix.needsUpdate = true;
    };
  }

  // The town wall between the gates (kit/townWall.ts): the excavated section, crenellated parapet, counterforts
  // with steps, the rampart and ditch, bridges; one mesh in the tiled material (one draw). The gates are
  // plan-built (assets/key-plans/*-gate.plan.json, placed with the other plan buildings, walls layer).
  {
    for (const p of builtWall.polys) { polysByLayer.walls.push(p); polys.push(p); }
    const mesh = new THREE.Mesh(builtWall.geometry, getTiledAtlasMaterial());
    mesh.name = 'town-wall';
    layerGroups.walls.add(mesh);
    tris += builtWall.tris;
    townWallMeshes.push(mesh);
  }

  // Great Plan (GIS 10-14): merged footprint meshes (exact rings + holes).
  // Masonry (shade 1-3, not stubs) is a short extrude; ruins/stubs are thin
  // solid extrusions (not floating flats, so the coincident footprint overlay
  // stays hidden inside them) — 1-2 draws, independent of footprint count. Procedural infill
  // without an outline still uses the house-kit InstancedMeshes.
  // Rings flagged underKey still join the flat overlay (and the 2D map) so
  // surveyed key-plot traces are visible; they are not extruded.
  const KEY_SKIP = new Set(['forum', 'basilica', 'baths', 'mansio', 'temple', 'church']);
  const gisFootprints = plan.buildings.filter(
    (b) => !KEY_SKIP.has(b.kind) && (b.outline?.length ?? 0) >= 3,
  );
  const houses = plan.buildings.filter(
    (b) => (b.kind === 'house' || b.kind === 'shop') && (b.outline?.length ?? 0) < 3,
  );
  const ruins = plan.buildings.filter(
    (b) => b.kind === 'ruin' && (b.outline?.length ?? 0) < 3,
  );
  {
    const toShape = (outer: Array<{ x: number; z: number }>, holes?: Array<Array<{ x: number; z: number }>>): THREE.Shape => {
      const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, -p.z)));
      for (const hole of holes ?? []) {
        if (hole.length < 3) continue;
        shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, -p.z))));
      }
      return shape;
    };
    /**
     * Extrusion base and depth for a ring: the top stays at the centre-ground height + `h`, but the
     * base runs down to the lowest ground under the ring, so no side of it hangs above a slope.
     */
    const standOnGround = (b: (typeof gisFootprints)[number], h: number): [number, number] => {
      const top = gy(b.x, b.z) + h;
      let low = gy(b.x, b.z);
      for (const p of b.outline!) low = Math.min(low, gy(p.x, p.z));
      low -= 0.05;
      return [low, top - low];
    };
    const masonryParts: THREE.BufferGeometry[] = [];
    const slabParts: THREE.BufferGeometry[] = [];
    const masonryBs: typeof gisFootprints = [];
    for (const b of gisFootprints) {
      try {
        // Footprint-only: surveyed rings on key plots belong on the overlay
        // (and the 2D map), not as generic extrusions inside the kits.
        if (b.underKey) continue;
        const shape = toShape(b.outline!, b.holes);
        const isSlab = b.kind === 'ruin' || !!b.stub;
        if (!isSlab) masonryBs.push(b);
        let g: THREE.BufferGeometry;
        if (isSlab) {
          // Thin solid extrusion (not a floating flat plane): the flat
          // footprints overlay below uses the same rings just above the ground, so a
          // flat slab at gy+0.3 left a visible 12cm double layer when both
          // the "Other buildings" and "Other building footprints" layers
          // were on. Extruding from the ground up swallows the coincident
          // footprint plane inside the solid (top stays at the old height),
          // so only one surface is ever visible.
          const slabH = Math.max(0.2, b.h * 0.5);
          const [low, depth] = standOnGround(b, slabH);
          g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
          if (!g.attributes.position || g.attributes.position.count < 3) { g.dispose(); continue; }
          g.rotateX(-Math.PI / 2);
          g.translate(0, low, 0);
        } else {
          const [low, depth] = standOnGround(b, b.h);
          g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
          if (!g.attributes.position || g.attributes.position.count < 3) { g.dispose(); continue; }
          g.rotateX(-Math.PI / 2);
          g.translate(0, low, 0);
        }
        g.computeVertexNormals();
        if (g.attributes.uv) remapUV(g, isSlab ? 'stone' : 'plaster', 1, 1);
        (isSlab ? slabParts : masonryParts).push(g);
        shadowsByLayer.buildings.push({ x: b.x, z: b.z, w: b.w * 1.35, d: b.d * 1.35, rotY: b.rotY });
      } catch {
        continue;
      }
    }
    if (masonryParts.length) {
      const merged = mergeMixed(masonryParts, 'gis-buildings-masonry');
      const mesh = new THREE.Mesh(merged, kitMat);
      mesh.name = 'gis-buildings-masonry';
      layerGroups.buildings.add(mesh);
      countTris(merged);
    }
    if (slabParts.length) {
      const merged = mergeMixed(slabParts, 'gis-buildings-slabs');
      const mesh = new THREE.Mesh(merged, kitMat);
      mesh.name = 'gis-buildings-slabs';
      layerGroups.buildings.add(mesh);
      countTris(merged);
    }
    // Other-buildings roofs: a simple pointed cap per masonry extrusion. Each
    // roof triangle starts on the wall-top perimeter (the same outline ring
    // the extrusion sides end on, at gy+b.h — no eaves, no overhang) and
    // rises to a single apex over the building centre, so roof and walls
    // share every eave edge by construction and can never float apart.
    // (The previous OBB-prism roofs did float: Great Plan rings are wall
    // fragments filling only ~20% of their OBB, so OBB-sized prisms sat over
    // empty ground.) Untextured terracotta Lambert, no UVs. All caps merged
    // into ONE mesh = +1 draw, ~1 tri per outline edge. Ruin/stub slabs stay
    // roofless. Rings with holes (courtyards) are capped over the outer ring
    // only — courtyard reads as roofed-over, a greybox simplification.
    if (masonryBs.length) {
      const roofPositions: number[] = [];
      for (const b of masonryBs) {
        const ring = b.outline!;
        // Drop the closing duplicate (rings are stored closed) and any
        // degenerate zero-length edges so normals stay valid.
        let n = ring.length;
        const first = ring[0], last = ring[ring.length - 1];
        if (n > 1 && Math.hypot(last.x - first.x, last.z - first.z) < 1e-6) n--;
        if (n < 3) continue;
        const topY = gy(b.x, b.z) + b.h;
        // Rise from the minor-axis span ≈ (d/2)*tan(~27°), clamped so tiny
        // fragments don't go pancake-flat and large ranges don't spike.
        const apexY = topY + Math.max(1.0, Math.min(3.0, b.d * 0.26));
        for (let i = 0; i < n; i++) {
          const p0 = ring[i], p1 = ring[(i + 1) % n];
          if (Math.hypot(p1.x - p0.x, p1.z - p0.z) < 1e-6) continue;
          roofPositions.push(p0.x, topY, p0.z, p1.x, topY, p1.z, b.x, apexY, b.z);
        }
      }
      if (roofPositions.length) {
        const roofG = new THREE.BufferGeometry();
        roofG.setAttribute('position', new THREE.Float32BufferAttribute(roofPositions, 3));
        roofG.computeVertexNormals();
        const roofMat = new THREE.MeshLambertMaterial({ color: 0xa05a3a, side: THREE.DoubleSide });
        const roofs = new THREE.Mesh(roofG, roofMat);
        roofs.name = 'gis-buildings-roofs';
        layerGroups.buildings.add(roofs);
        countTris(roofG);
      }
    }
    // Flat GIS outline overlay: same gisFootprints rings+holes as the extrusions
    // above and the 2D map, draped just above ground (depth-biased below roads/AO/slabs so a
    // coincident slab or road always wins — no z-fighting either way). Single
    // merged mesh = +1 draw. No colliders, no AO spots.
    // Rings lying wholly inside a plan-built building are represented by its model (walls, or
    // left out on purpose, like the forum's second colonnade line): no flat copy on its floors.
    const insidePlanBuilt = Object.values(KEY_PLANS).map((kp) => {
      const e = planExtentUV(kp), u0 = e.u0 - 0.8, u1 = e.u1 + 0.8, v0 = e.v0 - 0.8, v1 = e.v1 + 0.8;
      return (x: number, z: number): boolean => { const [u, v] = worldToPlan(kp, x, z); return u >= u0 && u <= u1 && v >= v0 && v <= v1; };
    });
    const footprintParts: THREE.BufferGeometry[] = [];
    for (const b of gisFootprints) {
      if (b.outline!.every((p) => insidePlanBuilt.some((f) => f(p.x, p.z)))) continue;
      try {
        const g = new THREE.ShapeGeometry(toShape(b.outline!, b.holes));
        if (!g.attributes.position || g.attributes.position.count < 3) { g.dispose(); continue; }
        g.rotateX(-Math.PI / 2);
        const draped = drapeOnGround(g, gy, DECAL_LIFT, surface.coords);
        draped.computeVertexNormals();
        remapUV(draped, 'stone', 1, 1);
        footprintParts.push(draped);
      } catch {
        continue;
      }
    }
    if (footprintParts.length) {
      const merged = mergeMixed(footprintParts, 'gis-footprints-flat');
      const mesh = new THREE.Mesh(merged, decalMaterial(DECAL_BIAS.footprints));
      mesh.name = 'gis-footprints-flat';
      mesh.renderOrder = 1;
      layerGroups.footprints.add(mesh);
      countTris(merged);
    }
  }
  {
    const plasterList = houses.filter((_, i) => i % 2 === 0);
    const timberList = houses.filter((_, i) => i % 2 === 1);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
    const C = new THREE.Color();

    const mkBodies = (list: typeof houses, variant: 'plaster' | 'timber'): void => {
      if (list.length === 0) return;
      const g = buildHouseWithOpeningsGeometry(variant);
      const inst = new THREE.InstancedMesh(g, kitMat, list.length);
      list.forEach((b, i) => {
        E.set(0, b.rotY, 0); Q.setFromEuler(E);
        P.set(b.x, gy(b.x, b.z), b.z); S.set(b.w, b.h, b.d);
        M.compose(P, Q, S);
        inst.setMatrixAt(i, M);
        const tint = 0.92 + ((b.x * 13 + b.z * 7) % 10) / 10 * 0.12;
        inst.setColorAt(i, C.setRGB(tint, tint * (b.kind === 'shop' ? 0.97 : 1.0), tint * 0.96));
        shadowsByLayer.buildings.push({ x: b.x, z: b.z, w: b.w * 1.35, d: b.d * 1.35, rotY: b.rotY });
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      layerGroups.buildings.add(inst);
      countTris(g, list.length);
    };
    mkBodies(plasterList, 'plaster');
    mkBodies(timberList, 'timber');

    if (houses.length) {
      // Unit gable scaled per house: atlas tile UVs stretch badly, so these
      // roofs are a plain terracotta Lambert (key buildings keep tiled kitMat).
      const roofG = buildGableRoofGeometry(1, 1, 1, 0.1, { tiled: false });
      const roofMat = new THREE.MeshLambertMaterial({ color: 0xa05a3a });
      const roofs = new THREE.InstancedMesh(roofG, roofMat, houses.length);
      houses.forEach((b, i) => {
        E.set(0, b.rotY, 0); Q.setFromEuler(E);
        const rise = 1.8 + ((Math.abs(b.x * 3 + b.z * 5) % 10) / 10) * 1.2;
        P.set(b.x, gy(b.x, b.z) + b.h, b.z); S.set(b.w * 1.1, rise, b.d * 1.15);
        M.compose(P, Q, S);
        roofs.setMatrixAt(i, M);
        const tint = 0.9 + ((b.x * 11 + b.z * 3) % 10) / 10 * 0.16;
        roofs.setColorAt(i, C.setRGB(tint, tint * 0.95, tint * 0.9));
      });
      roofs.instanceMatrix.needsUpdate = true;
      if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
      layerGroups.buildings.add(roofs);
      countTris(roofG, houses.length);
    }

    if (ruins.length) {
      const g = new THREE.BoxGeometry(1, 1, 1);
      remapUV(g, 'stone', 1, 1);
      const inst = new THREE.InstancedMesh(g, kitMat, ruins.length);
      ruins.forEach((b, i) => {
        E.set(0, b.rotY, 0); Q.setFromEuler(E);
        P.set(b.x, gy(b.x, b.z) + b.h / 2, b.z); S.set(b.w, Math.max(0.4, b.h), b.d);
        M.compose(P, Q, S);
        inst.setMatrixAt(i, M);
      });
      inst.instanceMatrix.needsUpdate = true;
      layerGroups.buildings.add(inst);
      countTris(g, ruins.length);
    }
  }
  // Plan-built key buildings (assets/key-plans/*.plan.json via keyPlans.generated.ts):
  // the baths and the forum-basilica, generated from their surveyed wall plans with three levels of detail.
  const planBuildings: PlacedPlanBuilding[] = [];
  for (const kp of Object.values(KEY_PLANS)) {
    const placed = placePlanBuilding(kp, gy);
    const layer: LayerId = kp.id.endsWith('-gate') ? 'walls' : 'key'; // the town gates belong with the wall
    layerGroups[layer].add(placed.object);
    planFloors.push({ at: placed.floorAt, overrides: placed.floorOverrides });
    for (const p of placed.polys) { polys.push(p); polysByLayer[layer].push(p); }
    for (const c of placed.boxes) { colliders.push(c); collidersByLayer[layer].push(c); }
    for (const c of placed.circles) { circles.push(c); circlesByLayer[layer].push(c); }
    tris += placed.tris;
    if (!kp.arena) shadowsByLayer[layer].push(placed.shadow); // a ground decal would float over a sunken arena
    planBuildings.push(placed);
  }
  const planMeshes = [...planBuildings.flatMap((b) => b.meshes), ...townWallMeshes];
  const setKeyBuildingDisplay = (mode: KeyBuildingDisplay): void => setPlanBuildingDisplay(planMeshes, mode);


  // Solid public buildings (temples, church only — rest are hollow key buildings)
  {
    for (const b of publicBs) {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      const cell = b.kind === 'baths' ? 'stone' : 'plaster';
      remapUV(g, cell, Math.max(1, Math.round(b.w / 8)), 1);
      const mesh = new THREE.Mesh(g, kitMat);
      mesh.position.set(b.x, gy(b.x, b.z) + b.h / 2 - 0.05, b.z); // base sunk 5 cm into its platform
      mesh.rotation.y = b.rotY;
      mesh.updateMatrix();
      layerGroups.key.add(mesh);
      countTris(g);
      shadowsByLayer.key.push({ x: b.x, z: b.z, w: b.w * 1.3, d: b.d * 1.3, rotY: b.rotY });
    }
  }

  // Water: pond/stream outlines as decals draped on terrain (1 draw, water cell)
  if (plan.water.length) {
    const parts: THREE.BufferGeometry[] = [];
    for (const ring of plan.water) {
      if (ring.length < 3) continue;
      const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, -p.z)));
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2); // shape (x,-z) -> world (x, 0, z)
      const draped = drapeOnGround(g, gy, DECAL_LIFT, surface.coords);
      draped.computeVertexNormals();
      remapUV(draped, 'water', 1, 1);
      parts.push(draped);
    }
    if (parts.length) {
      const merged = mergeMixed(parts, 'water');
      const mesh = new THREE.Mesh(merged, decalMaterial(DECAL_BIAS.water));
      mesh.renderOrder = 2; // above ground, below AO blobs
      group.add(mesh);
      countTris(merged);
    }
  }

  // Earthworks (GIS 03 hatchures chained to banks, GIS 01 contour drop for
  // crest height): one 1.25m grid of cosine mounds, max-blended so opposite
  // scarp ticks merge into a single turf bank. Draped on contour terrain.
  if (plan.earthworks.length) {
    const CELL = 1.25;
    const ORIGIN = -700;
    const N = Math.round(1400 / CELL);
    const occupied = new Set<number>();
    const cellKey = (i: number, j: number): number => i * 2048 + j;
    for (const s of plan.earthworks) {
      const pad = earthworkWidth(s) / 2 + CELL;
      const i0 = Math.max(0, Math.floor((Math.min(s.x1, s.x2) - pad - ORIGIN) / CELL));
      const i1 = Math.min(N - 1, Math.floor((Math.max(s.x1, s.x2) + pad - ORIGIN) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(s.z1, s.z2) - pad - ORIGIN) / CELL));
      const j1 = Math.min(N - 1, Math.floor((Math.max(s.z1, s.z2) + pad - ORIGIN) / CELL));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) occupied.add(cellKey(i, j));
      }
    }
    const vertIndex = new Map<number, number>();
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    const corner = (i: number, j: number): number => {
      const k = cellKey(i, j);
      let vi = vertIndex.get(k);
      if (vi !== undefined) return vi;
      const x = ORIGIN + i * CELL, z = ORIGIN + j * CELL;
      const lift = bankLift(x, z);
      vi = positions.length / 3;
      positions.push(x, gy(x, z) + lift, z);
      uvs.push(x / 8, z / 8);
      vertIndex.set(k, vi);
      return vi;
    };
    const liftAt = (i: number, j: number): number => {
      const k = cellKey(i, j);
      const vi = vertIndex.get(k);
      if (vi !== undefined) return positions[vi * 3 + 1] - gy(ORIGIN + i * CELL, ORIGIN + j * CELL);
      return bankLift(ORIGIN + i * CELL, ORIGIN + j * CELL);
    };
    for (const ck of occupied) {
      const i = (ck / 2048) | 0, j = ck - i * 2048;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const h00 = liftAt(i, j), h10 = liftAt(i + 1, j), h01 = liftAt(i, j + 1), h11 = liftAt(i + 1, j + 1);
      if (Math.max(h00, h10, h01, h11) < 0.05) continue;
      const a = corner(i, j), b = corner(i + 1, j), c = corner(i, j + 1), d = corner(i + 1, j + 1);
      index.push(a, c, b, b, c, d);
    }
    if (index.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(index);
      g.computeVertexNormals();
      remapUV(g, 'grass', 1, 1);
      // Its rim lies exactly on the ground mesh: bias it so the two never fight.
      const mesh = new THREE.Mesh(g, decalMaterial(DECAL_BIAS.earthworks));
      mesh.name = 'gis-earthworks';
      group.add(mesh);
      countTris(g);
    }
  }

  // Portico columns: temple rows, one InstancedMesh (plan-built buildings
  // carry their own columns inside their merged meshes). Key-buildings layer.
  {
    const spots: Array<{ x: number; z: number; h: number }> = [];
    const row = (cx: number, cz: number, n: number, spacing: number, rotY: number, h: number): void => {
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * spacing;
        const x = cx + Math.cos(rotY) * off, z = cz - Math.sin(rotY) * off;
        spots.push({ x, z, h });
        const cc = { x, z, r: 0.65 };
        circles.push(cc);
        circlesByLayer.key.push(cc);
      }
    };
    // Temple portico rows follow the plan temples (front = +z face, as designed).
    const t1 = plan.buildings.find((b) => b.id === 'temple-1');
    const t2 = plan.buildings.find((b) => b.id === 'temple-2');
    row(t1?.x ?? -125, (t1?.z ?? -80) + 12, 4, 4, 0.2, 5);
    row(t2?.x ?? -100, (t2?.z ?? -58) + 10, 4, 3.5, 0.2, 5);
    const colG = buildColumnGeometry(5);
    const cols = new THREE.InstancedMesh(colG, kitMat, Math.max(1, spots.length));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
    spots.forEach((c, i) => {
      E.set(0, 0, 0); Q.setFromEuler(E);
      P.set(c.x, gy(c.x, c.z), c.z); S.set(1, c.h / COLUMN_UNIT_H, 1);
      M.compose(P, Q, S);
      cols.setMatrixAt(i, M);
    });
    cols.instanceMatrix.needsUpdate = true;
    cols.count = spots.length;
    layerGroups.key.add(cols);
    countTris(colG, spots.length);
  }

  // Baked AO: one contact-shadow decal mesh per layer so hiding a layer also
  // hides its shadows (otherwise shadows float where buildings were).
  {
    (Object.keys(shadowsByLayer) as LayerId[]).forEach((id) => {
      const list = shadowsByLayer[id];
      if (!list.length) return;
      layerGroups[id].add(buildContactShadows(list, gy, surface.coords));
    });
  }

  let drawCalls = 0;
  // LOD alternates (plan-built buildings) never draw at the same time as their level 0.
  group.traverse((o) => { if (((o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh) && !o.userData.lodAlternate) drawCalls++; });
  return { group, layerGroups, colliders, collidersByLayer, circles, circlesByLayer, polys, polysByLayer, bands, drawCalls, tris: Math.round(tris), groundY, terrainY: gy, townWall, townWallTris: { wall: builtWall.trisWall, earth: builtWall.trisEarth, total: builtWall.tris }, setDrainsVisible, planBuildings, setKeyBuildingDisplay };
}
