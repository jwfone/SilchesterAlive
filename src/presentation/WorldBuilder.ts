import * as THREE from 'three';
import { sampleTerrain, wallGapIntervals, insideReserve, earthworkWidth, earthworkHeight, earthworkProfile, type TownPlan } from '../domain/townPlan.js';
import { getAtlas, remapUV } from './kit/atlas.js';
import { mergeMixed } from './kit/merge.js';
import { buildWallSegmentGeometry, buildGateGeometry } from './kit/walls.js';
import { buildGableRoofGeometry } from './kit/roofs.js';
import { buildHouseWithOpeningsGeometry } from './kit/houses.js';
import { buildColumnGeometry } from './kit/columns.js';
import { buildForumComplex } from './kit/forum.js';
import { buildMansio } from './kit/mansio.js';
import { placePlanBuilding, setPlanBuildingDisplay, type KeyBuildingDisplay, type PlacedPlanBuilding } from './kit/planWorld.js';
import { KEY_PLANS } from '../domain/keyPlans.generated.js';
import { buildAmphitheatre, type EllipseBand } from './kit/amphitheatre.js';
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
  groundY: (x: number, z: number) => number;
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

function emptyLayerPolys(): LayerPolys {
  return { roads: [], key: [], buildings: [], footprints: [], walls: [] };
}

function physicsForPlanByLayer(plan: TownPlan): { boxes: LayerColliders; polys: LayerPolys } {
  // footprints is a flat decal overlay: never collidable (empty by design).
  const boxes: LayerColliders = { roads: [], key: [], buildings: [], footprints: [], walls: [] };
  const polys = emptyLayerPolys();
  const t = plan.wallThickness / 2 + 0.6;
  const GATE_HALF = 7; // gatehouse opening half-width
  const distToSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    return Math.hypot(px - (ax + dx * u), pz - (az + dz * u));
  };
  for (let i = 0; i < plan.walls.length; i++) {
    const a = plan.walls[i];
    const b = plan.walls[(i + 1) % plan.walls.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 12));
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const x0 = a.x + dx * t0, z0 = a.z + dz * t0;
      const x1 = a.x + dx * t1, z1 = a.z + dz * t1;
      // carve gate openings by true segment distance (midpoint tests miss gates
      // that fall between 12m sub-segment midpoints on long GIS runs)
      if (plan.gates.some(g => distToSeg(g.x, g.z, x0, z0, x1, z1) < GATE_HALF)) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const cpad = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) / 2 + t;
      boxes.walls.push({ minX: cx - cpad - 0.5, maxX: cx + cpad + 0.5, minZ: cz - t - 1, maxZ: cz + t + 1 });
    }
  }
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
  const gy = (x: number, z: number): number => sampleTerrain(plan.terrain, x, z) * RELIEF_SCALE;
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
  const planFloors: Array<(x: number, z: number) => number | undefined> = [];
  /** Walkable ground: contour terrain plus grass-bank lift (player rides over banks), or a building floor. */
  const groundY = (x: number, z: number): number => {
    const ground = gy(x, z) + bankLift(x, z);
    for (const floorAt of planFloors) {
      const y = floorAt(x, z);
      if (y !== undefined) return Math.max(ground, y);
    }
    return ground;
  };
  let tris = 0;
  const countTris = (g: THREE.BufferGeometry, instances = 1): void => {
    const idx = g.index ? g.index.count : g.attributes.position.count;
    tris += (idx / 3) * instances;
  };

  // Ground: displaced plane from GIS contours when present (1 draw).
  // 64x64 segments matches the 64-grid heightfield exactly (grid nodes land on
  // texel centres), so no detail is lost vs a finer mesh; falls back to flat quad pre-import.
  {
    const SEG = plan.terrain.heights.length ? 64 : 1;
    const g = new THREE.PlaneGeometry(1400, 1400, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    if (SEG > 1) {
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, gy(pos.getX(i), pos.getZ(i)));
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    }
    remapUV(g, 'grass', 90, 90);
    const ground = new THREE.Mesh(g, kitMat);
    ground.position.y = 0;
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
          const g = new THREE.ShapeGeometry(shape);
          if (!g.attributes.position || g.attributes.position.count < 3) continue;
          g.rotateX(-Math.PI / 2); // shape (x,-z) -> world (x, 0, z)
          const pos = g.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++) {
            pos.setY(i, gy(pos.getX(i), pos.getZ(i)) + 0.22);
          }
          pos.needsUpdate = true;
          g.computeVertexNormals();
          remapUV(g, 'street', 1, 1);
          roadParts.push(g);
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
      const mesh = new THREE.Mesh(merged, kitMat);
      mesh.renderOrder = 1; // above ground, below AO blobs
      layerGroups.roads.add(mesh);
      countTris(merged);
    }
    const items = [
      ...roadFallback.map((s) => ({ s, y: 0.08 })),
      ...plan.drains.map((s) => ({ s, y: 0.02 })),
    ];
    const drainBase = roadFallback.length;
    const g = new THREE.BoxGeometry(1, 0.15, 1);
    remapUV(g, 'street', 1, 1);
    const inst = new THREE.InstancedMesh(g, kitMat, Math.max(1, items.length));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
    const writeInstance = (it: { s: { x1: number; z1: number; x2: number; z2: number; width: number }; y: number }, i: number, visible: boolean): void => {
      const s = it.s;
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      P.set((s.x1 + s.x2) / 2, gy((s.x1 + s.x2) / 2, (s.z1 + s.z2) / 2) + it.y, (s.z1 + s.z2) / 2);
      E.set(0, ang + Math.PI / 2, 0); Q.setFromEuler(E);
      if (visible) S.set(len, 1, s.width);
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

  // Walls: coursed-rubble kit, all edges merged into ONE static mesh (1 draw).
  // The circuit stops at gatehouses (same 7m half-gap the colliders carve),
  // so each gateway reads as a real opening framed by the gate towers.
  {
    const segs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < plan.walls.length; i++) {
      const a = plan.walls[i], b = plan.walls[(i + 1) % plan.walls.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) continue; // polar-sorted circuit can repeat points at the seam
      const ang = Math.atan2(dx, dz);
      for (const [t0, t1] of wallGapIntervals(a.x, a.z, b.x, b.z, plan.gates)) {
        const plen = (t1 - t0) * len;
        if (plen < 0.5) continue;
        const cx = a.x + (dx * (t0 + t1)) / 2, cz = a.z + (dz * (t0 + t1)) / 2;
        const g = buildWallSegmentGeometry(plen, plan.wallHeight, plan.wallThickness);
        g.rotateY(ang);
        g.translate(cx, gy(cx, cz), cz);
        segs.push(g);
        shadowsByLayer.walls.push({ x: cx, z: cz, w: plan.wallThickness + 3, d: plen + 2, rotY: ang });
      }
    }
    const merged = mergeMixed(segs, 'town-walls');
    layerGroups.walls.add(new THREE.Mesh(merged, kitMat));
    countTris(merged);
    const gateG = buildGateGeometry();
    const gates = new THREE.InstancedMesh(gateG, kitMat, Math.max(1, plan.gates.length));
    {
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
      plan.gates.forEach((gt, i) => {
        E.set(0, gt.rotY, 0); Q.setFromEuler(E);
        P.set(gt.x, gy(gt.x, gt.z), gt.z);
        M.compose(P, Q, S);
        gates.setMatrixAt(i, M);
        shadowsByLayer.walls.push({ x: gt.x, z: gt.z, w: 16, d: 8, rotY: gt.rotY });
      });
    }
    gates.instanceMatrix.needsUpdate = true;
    gates.count = plan.gates.length;
    layerGroups.walls.add(gates);
    countTris(gateG, plan.gates.length);
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
          // footprints overlay below uses the same rings at gy+0.18, so a
          // flat slab at gy+0.3 left a visible 12cm double layer when both
          // the "Other buildings" and "Other building footprints" layers
          // were on. Extruding from the ground up swallows the coincident
          // footprint plane inside the solid (top stays at the old height),
          // so only one surface is ever visible.
          const slabH = Math.max(0.2, b.h * 0.5);
          g = new THREE.ExtrudeGeometry(shape, { depth: slabH, bevelEnabled: false, steps: 1, curveSegments: 1 });
          if (!g.attributes.position || g.attributes.position.count < 3) { g.dispose(); continue; }
          g.rotateX(-Math.PI / 2);
          g.translate(0, gy(b.x, b.z), 0);
        } else {
          g = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false, steps: 1, curveSegments: 1 });
          if (!g.attributes.position || g.attributes.position.count < 3) { g.dispose(); continue; }
          g.rotateX(-Math.PI / 2);
          g.translate(0, gy(b.x, b.z), 0);
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
    // above and the 2D map, draped just above ground (below roads/AO/slabs so a
    // coincident slab or road always wins — no z-fighting either way). Single
    // merged mesh = +1 draw. No colliders, no AO spots.
    const footprintParts: THREE.BufferGeometry[] = [];
    for (const b of gisFootprints) {
      try {
        const g = new THREE.ShapeGeometry(toShape(b.outline!, b.holes));
        if (!g.attributes.position || g.attributes.position.count < 3) { g.dispose(); continue; }
        g.rotateX(-Math.PI / 2);
        const pos = g.attributes.position as THREE.BufferAttribute;
        const y0 = gy(b.x, b.z) + 0.18;
        for (let i = 0; i < pos.count; i++) pos.setY(i, y0);
        pos.needsUpdate = true;
        g.computeVertexNormals();
        if (g.attributes.uv) remapUV(g, 'stone', 1, 1);
        footprintParts.push(g);
      } catch {
        continue;
      }
    }
    if (footprintParts.length) {
      const merged = mergeMixed(footprintParts, 'gis-footprints-flat');
      const mesh = new THREE.Mesh(merged, kitMat);
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
  // Forum-basilica key complex (walkable interior).
  // The kit is authored around (8,-8) then yawed 90° (basilica west, forum east);
  // the whole complex is shifted so its centre lands on the plan centre
  // (user-pinned GIS insula when present).
  const forumColSpots: Array<{ x: number; z: number; h: number }> = [];
  {
    const fB = plan.buildings.find((b) => b.id === 'forum');
    const bB = plan.buildings.find((b) => b.id === 'basilica');
    const ccx = fB && bB ? (fB.x + bB.x) / 2 : 8;
    const ccz = fB && bB ? (fB.z + bB.z) / 2 : -8;
    const dx = ccx - 8, dz = ccz - -8;
    const forum = buildForumComplex(kitMat);
    const fy = gy(ccx, ccz);
    for (const m of forum.meshes) { m.position.x += dx; m.position.z += dz; m.position.y += fy; layerGroups.key.add(m); }
    for (const c of forum.boxColliders) { c.minX += dx; c.maxX += dx; c.minZ += dz; c.maxZ += dz; colliders.push(c); collidersByLayer.key.push(c); }
    for (const c of forum.circleColliders) { c.x += dx; c.z += dz; circles.push(c); circlesByLayer.key.push(c); }
    for (const s of forum.columnSpots) forumColSpots.push({ x: s.x + dx, z: s.z + dz, h: s.h });
    tris += forum.tris;
    shadowsByLayer.key.push({ x: ccx - 20, z: ccz, w: 24, d: 78 });
    shadowsByLayer.key.push({ x: ccx + 20, z: ccz, w: 42, d: 60 });
  }

  // Plan-built key buildings (assets/key-plans/*.plan.json via keyPlans.generated.ts):
  // the baths, generated from the surveyed wall plan with three levels of detail.
  const planBuildings: PlacedPlanBuilding[] = [];
  for (const kp of Object.values(KEY_PLANS)) {
    const placed = placePlanBuilding(kp, gy);
    layerGroups.key.add(placed.object);
    planFloors.push(placed.floorAt);
    for (const p of placed.polys) { polys.push(p); polysByLayer.key.push(p); }
    for (const c of placed.boxes) { colliders.push(c); collidersByLayer.key.push(c); }
    for (const c of placed.circles) { circles.push(c); circlesByLayer.key.push(c); }
    tris += placed.tris;
    shadowsByLayer.key.push(placed.shadow);
    planBuildings.push(placed);
  }
  const planMeshes = planBuildings.flatMap((b) => b.meshes);
  const setKeyBuildingDisplay = (mode: KeyBuildingDisplay): void => setPlanBuildingDisplay(planMeshes, mode);

  // Mansio key complex (walkable courtyard inn).
  // Kit builds in design coords around (40,245); shifted to the plan spot.
  {
    const pM = plan.buildings.find((b) => b.id === 'mansio');
    const mx = pM?.x ?? 40, mz = pM?.z ?? 245;
    const dx = mx - 40, dz = mz - 245;
    const mansio = buildMansio(kitMat);
    mansio.mesh.position.x += dx; mansio.mesh.position.z += dz;
    mansio.mesh.position.y += gy(mx, mz);
    layerGroups.key.add(mansio.mesh);
    for (const c of mansio.boxes) { c.minX += dx; c.maxX += dx; c.minZ += dz; c.maxZ += dz; colliders.push(c); collidersByLayer.key.push(c); }
    for (const c of mansio.circles) { c.x += dx; c.z += dz; circles.push(c); circlesByLayer.key.push(c); }
    tris += mansio.tris;
    shadowsByLayer.key.push({ x: mx, z: mz, w: 56, d: 30 });
  }

  // Solid public buildings (temples, church only — rest are hollow key buildings)
  {
    const publicBs = plan.buildings.filter(x => x.kind === 'temple' || x.kind === 'church');
    for (const b of publicBs) {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      const cell = b.kind === 'baths' ? 'stone' : 'plaster';
      remapUV(g, cell, Math.max(1, Math.round(b.w / 8)), 1);
      const mesh = new THREE.Mesh(g, kitMat);
      mesh.position.set(b.x, gy(b.x, b.z) + b.h / 2 + 0.1, b.z);
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
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, gy(pos.getX(i), pos.getZ(i)) + 0.15);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      remapUV(g, 'water', 1, 1);
      parts.push(g);
    }
    if (parts.length) {
      const merged = mergeMixed(parts, 'water');
      const mesh = new THREE.Mesh(merged, kitMat);
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
      const mesh = new THREE.Mesh(g, kitMat);
      mesh.name = 'gis-earthworks';
      group.add(mesh);
      countTris(g);
    }
  }

  // Portico columns: forum/nave spots + temple rows, one InstancedMesh
  // (baths/mansio carry their own timber porticos inside their merged complexes)
  // Columns belong to the key-buildings layer (forum + temples).
  {
    const spots: Array<{ x: number; z: number; h: number }> = [...forumColSpots];
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

  // Amphitheatre key building: LOD stepped cavea + podium/arena/outer/entrances
  {
    const amphi = buildAmphitheatre(plan.amphitheatre, kitMat);
    const ay = gy(plan.amphitheatre.x, plan.amphitheatre.z);
    amphi.lod.position.y = ay;
    for (const m of amphi.extras) m.position.y += ay;
    layerGroups.key.add(amphi.lod);
    for (const m of amphi.extras) layerGroups.key.add(m);
    bands.push(amphi.band);
    tris += amphi.tris;
    shadowsByLayer.key.push({ x: plan.amphitheatre.x, z: plan.amphitheatre.z, w: plan.amphitheatre.rx * 2.4, d: plan.amphitheatre.rz * 2.4 });
  }

  // Baked AO: one contact-shadow decal mesh per layer so hiding a layer also
  // hides its shadows (otherwise shadows float where buildings were).
  {
    (Object.keys(shadowsByLayer) as LayerId[]).forEach((id) => {
      const list = shadowsByLayer[id];
      if (!list.length) return;
      for (const s of list) s.y = gy(s.x, s.z) + 0.25;
      layerGroups[id].add(buildContactShadows(list));
    });
  }

  let drawCalls = 0;
  // LOD alternates (plan-built buildings) never draw at the same time as their level 0.
  group.traverse((o) => { if (((o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh) && !o.userData.lodAlternate) drawCalls++; });
  return { group, layerGroups, colliders, collidersByLayer, circles, circlesByLayer, polys, polysByLayer, bands, drawCalls, tris: Math.round(tris), groundY, setDrainsVisible, planBuildings, setKeyBuildingDisplay };
}
