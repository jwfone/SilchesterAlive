import * as THREE from 'three';
import { planRotationY, planToWorld, worldToPlan, type BuildingPlan, type UV } from '../../domain/keyPlan.js';
import { arenaHeightAt, arenaHoleWorld, planExtentUV } from '../../domain/arenaPlan.js';
import { buildFromPlan, type Lod, type PlanFootprint } from './planBuilding.js';
import { FACE, WALL } from '../../domain/townWall.js';
import { getTiledAtlasMaterial, setSurfaceStyle, type SurfaceStyle } from './atlasTiled.js';
import type { Collider } from '../WorldBuilder.js';
import type { CircleCollider, PolyCollider } from '../PlayerControls.js';
import type { ShadowSpot } from './ao.js';

// Places a plan-built key building in the world: three levels of detail under a
// THREE.LOD centred on the building (so switch distances are measured from its
// middle), colliders converted to world coordinates, and a contact-shadow spot.
// All plan-built buildings share one tiled material (style = quality tier) and
// one evidence material, so display changes are a material swap, not a rebuild.

/** Distance (m) from the building centre at which each LOD level takes over. */
export const PLAN_LOD_DISTANCES: Record<Lod, number> = { 0: 0, 1: 110, 2: 260 };

/** Low obstacles (pool rims, dwarf walls, bases) under this height are jumpable boxes. */
const LOW_OBSTACLE_H = 1.2;

export interface PlacedPlanBuilding {
  id: string;
  object: THREE.LOD;
  meshes: THREE.Mesh[];
  /** Triangles at full detail (what the player sees up close). */
  tris: number;
  trisByLod: Record<Lod, number>;
  polys: PolyCollider[];
  boxes: Collider[];
  circles: CircleCollider[];
  shadow: ShadowSpot;
  /** World-space centre and radius (for proximity checks). */
  centre: { x: number; z: number }; radius: number;
  /** Walkable floor height inside the building's rooms, else undefined (open ground). */
  /** With `feet`, raised decks (platforms, stairs, wall-walks) a step or less above the feet count too. */
  floorAt: (x: number, z: number, feet?: number) => number | undefined;
  /** The floor replaces the ground rather than standing on it (a sunken arena: below the terrain). */
  floorOverrides: boolean;
  /** Metres from a world point to the building's plan rectangle (0 inside). */
  distanceTo: (x: number, z: number) => number;
}

export type KeyBuildingDisplay = SurfaceStyle | 'evidence';

let evidenceMat: THREE.MeshLambertMaterial | null = null;
function getEvidenceMaterial(): THREE.MeshLambertMaterial {
  evidenceMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  return evidenceMat;
}

/** Apply a display mode to plan-built meshes: a surface style, or evidence colours. */
export function setPlanBuildingDisplay(meshes: THREE.Mesh[], mode: KeyBuildingDisplay): void {
  const tiled = getTiledAtlasMaterial();
  if (mode !== 'evidence') setSurfaceStyle(tiled, mode);
  for (const m of meshes) m.material = mode === 'evidence' ? getEvidenceMaterial() : tiled;
}

/** Point in a plan room (rooms are axis-aligned rectangles in plan space). */
function inRect(u: number, v: number, poly: Array<[number, number]>): boolean {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const [pu, pv] of poly) { a = Math.min(a, pu); b = Math.max(b, pu); c = Math.min(c, pv); d = Math.max(d, pv); }
  return u >= a && u <= b && v >= c && v <= d;
}

/** Point on an apse floor: its half disc, or the neck back to the room's wall line. */
function inApse(u: number, v: number, ap: NonNullable<BuildingPlan['apses']>[number]): boolean {
  const du = u - ap.c[0], dv = v - ap.c[1];
  if (Math.hypot(du, dv) <= ap.r) return true;
  const am = ((ap.start + ap.end) / 2) * (Math.PI / 180);
  const nU = -Math.cos(am), nV = -Math.sin(am);          // toward the room
  const s = du * nU + dv * nV, c = -du * nV + dv * nU;
  return s >= 0 && s <= (ap.neck ?? 0) && Math.abs(c) <= ap.r;
}

/** World-space axis-aligned bounds of a plan's wall extent (the ground it must stand on). */
export function planFootprintBounds(plan: BuildingPlan): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const { u0, u1, v0, v1 } = planExtentUV(plan);
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) {
    const p = planToWorld(plan, u, v);
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
  }
  return b;
}

export function placePlanBuilding(plan: BuildingPlan, groundY: (x: number, z: number) => number): PlacedPlanBuilding {
  // Plan extent from its walls (u, v) (an arena's banks to their toe), and its centre in plan and world space.
  const { u0, u1, v0, v1 } = planExtentUV(plan);
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  const centre = planToWorld(plan, uc, vc);
  const rotY = planRotationY(plan);
  // Sit on the highest ground under the building so no floor is buried, and run the
  // walls down as footings to the lowest ground so none float (0.35 m across the baths).
  const samples: number[] = [];
  for (let u = u0; u <= u1 + 1e-6; u += (u1 - u0) / 8) {
    for (let v = v0; v <= v1 + 1e-6; v += (v1 - v0) / 16) {
      const p = planToWorld(plan, u, v);
      samples.push(groundY(p.x, p.z));
    }
  }
  // A sunken arena's floor lies `ground` metres below the levelled platform round it.
  const sunk = plan.arena?.ground ?? 0;
  const baseY = Math.max(...samples) + 0.02 - sunk;
  const footingDrop = baseY + sunk - Math.min(...samples) + 0.15;
  // The ground hole under an arena, as plan-space corners for the apron that fills it.
  const hole = arenaHoleWorld(plan);
  const apron: UV[] | undefined = hole && [[hole.minX, hole.minZ], [hole.maxX, hole.minZ], [hole.maxX, hole.maxZ], [hole.minX, hole.maxZ]]
    .map(([x, z]) => worldToPlan(plan, x, z));

  const lod = new THREE.LOD();
  lod.name = `plan-${plan.id}`;
  lod.position.set(centre.x, baseY, centre.z);
  lod.rotation.y = rotY;
  const meshes: THREE.Mesh[] = [];
  const trisByLod = { 0: 0, 1: 0, 2: 0 } as Record<Lod, number>;
  let footprints: PlanFootprint[] = [];
  for (const level of [0, 1, 2] as Lod[]) {
    const built = buildFromPlan(plan, { lod: level, evidenceColors: true, footingDrop, apron });
    const mesh = new THREE.Mesh(built.geometry, getTiledAtlasMaterial());
    mesh.name = `plan-${plan.id}-lod${level}`;
    mesh.position.set(-uc, 0, vc); // model space x = u, z = -v; centre the LOD on the building
    if (level > 0) mesh.userData.lodAlternate = true; // only one level draws at a time
    lod.addLevel(mesh, PLAN_LOD_DISTANCES[level]);
    meshes.push(mesh);
    trisByLod[level] = built.tris;
    if (level === 0) footprints = built.footprints;
  }

  // Colliders: tall wall pieces as rotated polygons; low obstacles as jumpable
  // boxes (the 1.5-degree rotation is negligible for a 1 m pool rim); columns as circles.
  const polys: PolyCollider[] = [], boxes: Collider[] = [], circles: CircleCollider[] = [];
  const W = (u: number, v: number): { x: number; z: number } => planToWorld(plan, u, v);
  for (const f of footprints) {
    if (f.kind === 'circle') {
      const c = W(f.c[0], f.c[1]);
      circles.push({ x: c.x, z: c.z, r: f.r });
      continue;
    }
    const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]) || 1;
    const nu = (-(f.b[1] - f.a[1]) / L) * (f.t / 2), nv = ((f.b[0] - f.a[0]) / L) * (f.t / 2);
    const ring = [W(f.a[0] + nu, f.a[1] + nv), W(f.b[0] + nu, f.b[1] + nv), W(f.b[0] - nu, f.b[1] - nv), W(f.a[0] - nu, f.a[1] - nv)];
    const xs = ring.map((p) => p.x), zs = ring.map((p) => p.z);
    const bb = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    if (f.h < LOW_OBSTACLE_H) boxes.push({ ...bb, h: f.h });
    else polys.push({ outline: ring, ...bb, top: baseY + f.h });
  }

  return {
    id: plan.id, object: lod, meshes, tris: trisByLod[0], trisByLod, polys, boxes, circles,
    shadow: { x: centre.x, z: centre.z, w: (u1 - u0) * 1.08, d: (v1 - v0) * 1.04, rotY },
    centre, radius: Math.hypot(u1 - u0, v1 - v0) / 2,
    distanceTo: (x, z) => {
      const [u, v] = worldToPlan(plan, x, z);
      return Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1));
    },
    floorOverrides: !!plan.arena,
    floorAt: (x, z, feet) => {
      const room = roomFloorAt(x, z);
      if (feet === undefined) return room;
      // raised decks (a gate's platform, a tower's floors, stairs, a flank's wall-walk): the highest one
      // at or a step above the feet
      const [u, v] = worldToPlan(plan, x, z);
      let best = room;
      for (const y of deckHeights(plan, u, v)) {
        const wy = baseY + y;
        if (wy <= feet + DECK_STEP && (best === undefined || wy > best)) best = wy;
      }
      return best;
    },
  };
  function roomFloorAt(x: number, z: number): number | undefined {
    {
      const [u, v] = worldToPlan(plan, x, z);
      if (plan.arena) {
        // the bowl, its banks and passages; level ground out to the hole's edge
        const y = arenaHeightAt(plan.arena, u, v);
        if (y !== undefined) return baseY + y;
        return hole && x >= hole.minX && x <= hole.maxX && z >= hole.minZ && z <= hole.maxZ ? baseY + plan.arena.ground + 0.02 : undefined;
      }
      if (u < u0 - 1 || u > u1 + 1 || v < v0 - 1 || v > v1 + 1) return undefined;
      const floored = plan.rooms.some((r) => inRect(u, v, r.poly)) || (plan.apses ?? []).some((ap) => inApse(u, v, ap));
      return floored ? baseY + 0.03 : undefined;
    }
  }
}

/** How far above your feet a deck may be and still be stepped onto (stairs, a deck's edge). */
export const DECK_STEP = 0.6;

function inPolygon(u: number, v: number, poly: UV[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i], [uj, vj] = poly[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

/** Heights (above the plan's floor) of the raised walkable surfaces over a plan point: platforms, stairs,
 * and the wall-walks of the plan's stretches of town wall (walls of kind 'curtain'). */
export function deckHeights(plan: BuildingPlan, u: number, v: number): number[] {
  const out: number[] = [];
  for (const p of plan.platforms ?? []) if (inPolygon(u, v, p.poly)) out.push(p.y);
  for (const st of plan.stairs ?? []) {
    const L = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]) || 1, du = (st.b[0] - st.a[0]) / L, dv = (st.b[1] - st.a[1]) / L;
    const s = (u - st.a[0]) * du + (v - st.a[1]) * dv, l = -(u - st.a[0]) * dv + (v - st.a[1]) * du;
    if (s >= -0.2 && s <= L + 0.2 && Math.abs(l) <= st.w / 2) out.push(st.y0 + ((st.y1 - st.y0) * Math.max(0, Math.min(L, s))) / L);
  }
  for (const w of plan.walls) {
    if (w.kind !== 'curtain') continue;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, du = (w.b[0] - w.a[0]) / L, dv = (w.b[1] - w.a[1]) / L;
    const s = (u - w.a[0]) * du + (v - w.a[1]) * dv;
    // d towards the town: the field side is w.outer ('l' = left of a -> b)
    const d = (-(u - w.a[0]) * dv + (v - w.a[1]) * du) * (w.outer === 'r' ? 1 : -1);
    if (s >= -FACE.innerUpper && s <= L + FACE.innerUpper && d >= FACE.parapetIn && d <= FACE.innerUpper) out.push(WALL.walk);
  }
  return out;
}
