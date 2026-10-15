// Headless smoke test: builds the entire town (plan + all kit geometry)
// without a renderer/GPU. Run via `npm run smoke`. Throws on failure.
// The atlas/contact-shadow painters get a no-op 2D context — geometry
// construction is what we're verifying, not pixels.
import { buildTownPlan, PERF_BUDGET, earthworkWidth, earthworkHeight, earthworkProfile } from './domain/townPlan.js';
import { buildWorld } from './presentation/WorldBuilder.js';
import { hitsPoly, pointInRing } from './presentation/PlayerControls.js';
import {
  createGhostMesh, getGhostCostumes, getGhostCostumeGeometry, getGhostMaterial, ghostCostumeTriCount,
} from './presentation/kit/ghosts.js';
import { collectibleSeeds, placeCollectibles } from './domain/collectibles.js';
import { GHOST_COSTUMES, GHOST_MAX, parseSpokenCostumeIds } from './domain/ghosts.js';
import { mulberry32 } from './domain/rng.js';
import type { PersonaBank } from './domain/dialogueBank.js';
import { checkBankText, neverKnowsNeedle } from './domain/dialogueSafety.js';
import { pickChoices, pickReply } from './domain/dialogueBankSelect.js';
import { GhostController } from './application/GhostController.js';
import {
  CollectibleController, COLLECTIBLE_COLOR_COLLECTED, COLLECTIBLE_COLOR_UNCOLLECTED,
} from './application/CollectibleController.js';
import * as THREE from 'three';
import { parseAutoTierCache, parseBuildingLook, stepDownTier, tierForLook, tierFromBench } from './domain/displaySettings.js';
import { KEY_PLANS } from './domain/keyPlans.generated.js';
import { planToWorld } from './domain/keyPlan.js';
import { DITCH, FACE, RAMPART, WALL, earthworkOffset, wallDeckAt } from './domain/townWall.js';
import { arenaHoleWorld, arenaProfile, polarDeg, profileY, ringPoint, ringRadius } from './domain/arenaPlan.js';
import { buildFromPlan, elementAtFace, elementTriangles } from './presentation/kit/planBuilding.js';

function makeCtx(): unknown {
  const grad = { addColorStop(): void { /* no-op */ } };
  return new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad;
        return () => undefined;
      },
      set: () => true,
    },
  );
}

(globalThis as Record<string, unknown>).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
};

const plan = buildTownPlan(1234);
const houses = plan.buildings.filter(b => b.kind === 'house' || b.kind === 'shop').length;
const ruins = plan.buildings.filter(b => b.kind === 'ruin').length;
const gisFootprints = plan.buildings.filter(b => (b.outline?.length ?? 0) >= 3).length;
const world = buildWorld(plan);
const gisMeshes = world.layerGroups.buildings.children.filter(
  (o) => o.name === 'gis-buildings-masonry' || o.name === 'gis-buildings-slabs',
);
console.log(
  `buildings=${plan.buildings.length} houses=${houses} ruins=${ruins} gis=${gisFootprints} ` +
    `gisMeshes=${gisMeshes.length} draws=${world.drawCalls} ` +
    `tris=${world.tris} boxes=${world.colliders.length} polys=${world.polys.length} circles=${world.circles.length} bands=${world.bands.length}`,
);
// Layer show/hide wiring: groups exist, collider partition is lossless,
// toggling visibility flags works (Game.setLayer drives .visible the same way).
for (const id of ['roads', 'key', 'buildings', 'footprints', 'walls'] as const) {
  if (!world.layerGroups[id]) throw new Error(`missing layer group: ${id}`);
}
const partitioned =
  world.collidersByLayer.roads.length +
  world.collidersByLayer.key.length +
  world.collidersByLayer.buildings.length +
  world.collidersByLayer.footprints.length +
  world.collidersByLayer.walls.length;
if (partitioned !== world.colliders.length) {
  throw new Error(`collider partition mismatch: ${partitioned} vs ${world.colliders.length}`);
}
if (world.collidersByLayer.roads.length !== 0) throw new Error('roads layer should have no box colliders');
if (world.collidersByLayer.footprints.length !== 0) throw new Error('footprints layer should have no box colliders');
if (world.polysByLayer.footprints.length !== 0) throw new Error('footprints layer should have no poly colliders');
if (world.layerGroups.key.children.length === 0) throw new Error('key layer is empty');
if (world.layerGroups.roads.children.length === 0) throw new Error('roads layer is empty');
if (world.layerGroups.buildings.children.length === 0) throw new Error('buildings layer is empty');
if (gisFootprints > 40 && gisMeshes.length < 1) {
  throw new Error('missing GIS building footprint mesh');
}
if (gisFootprints > 40 && world.polysByLayer.buildings.length < 1) {
  throw new Error('GIS masonry should collide as polygons, not OBB boxes');
}
const polyPartitioned =
  world.polysByLayer.roads.length +
  world.polysByLayer.key.length +
  world.polysByLayer.buildings.length +
  world.polysByLayer.footprints.length +
  world.polysByLayer.walls.length;
if (polyPartitioned !== world.polys.length) {
  throw new Error(`poly partition mismatch: ${polyPartitioned} vs ${world.polys.length}`);
}
// Street centre-lines must stay walkable except where they graze a masonry
// ring (player radius 0.5m). The old OBB AABB colliders blocked empty space
// across roads, often metres from the visible extrusion.
{
  const KEY_SKIP = new Set(['forum', 'basilica', 'baths', 'mansio', 'temple', 'church']);
  const distToSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    return Math.hypot(px - (ax + dx * u), pz - (az + dz * u));
  };
  const distToMasonry = (x: number, z: number): number => {
    let min = Infinity;
    for (const b of plan.buildings) {
      if (KEY_SKIP.has(b.kind) || b.stub || b.kind === 'ruin') continue;
      const ring = b.outline;
      if (!ring || ring.length < 3) continue;
      const inHole = (b.holes ?? []).some((h) => pointInRing(x, z, h));
      if (pointInRing(x, z, ring) && !inHole) return 0;
      const rings = [ring, ...(b.holes ?? [])];
      for (const r of rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          min = Math.min(min, distToSeg(x, z, r[j].x, r[j].z, r[i].x, r[i].z));
        }
      }
    }
    return min;
  };
  const hitsBuilding = (x: number, z: number, r: number): boolean => {
    for (const c of world.collidersByLayer.buildings) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    for (const p of world.polysByLayer.buildings) {
      if (hitsPoly(x, z, r, p)) return true;
    }
    return false;
  };
  let blockedRoad = 0, checked = 0;
  for (const s of plan.streets) {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (len < 4) continue;
    const n = Math.max(1, Math.ceil(len / 10));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = s.x1 + (s.x2 - s.x1) * t, z = s.z1 + (s.z2 - s.z1) * t;
      if (distToMasonry(x, z) < 1) continue;
      checked++;
      if (hitsBuilding(x, z, 0.5)) blockedRoad++;
    }
  }
  if (gisFootprints > 40 && checked > 20 && blockedRoad > 0) {
    throw new Error(`other-buildings collision blocks roads: ${blockedRoad}/${checked} street samples`);
  }
  // OBB AABB corners that sit in empty space (the old invisible walls) must
  // not collide now that masonry uses the GIS ring.
  let phantom = 0, phantomChecked = 0;
  for (const b of plan.buildings) {
    if (KEY_SKIP.has(b.kind) || b.stub || b.kind === 'ruin') continue;
    if (!b.outline || b.outline.length < 3) continue;
    const hw = b.w / 2, hd = b.d / 2;
    const c = Math.abs(Math.cos(b.rotY)), s = Math.abs(Math.sin(b.rotY));
    const ex = hw * c + hd * s, ez = hw * s + hd * c;
    const corners: Array<[number, number]> = [
      [b.x - ex, b.z - ez], [b.x + ex, b.z - ez],
      [b.x - ex, b.z + ez], [b.x + ex, b.z + ez],
    ];
    for (const [x, z] of corners) {
      if (distToMasonry(x, z) < 1.5) continue;
      phantomChecked++;
      if (hitsBuilding(x, z, 0.5)) phantom++;
    }
  }
  if (gisFootprints > 40 && phantomChecked > 20 && phantom > 0) {
    throw new Error(`OBB empty-space still collides: ${phantom}/${phantomChecked} corners`);
  }
  let interiorHits = 0, interiorTests = 0;
  for (const p of world.polysByLayer.buildings) {
    const x = (p.minX + p.maxX) / 2, z = (p.minZ + p.maxZ) / 2;
    if (!pointInRing(x, z, p.outline)) continue;
    if ((p.holes ?? []).some((h) => pointInRing(x, z, h))) continue;
    interiorTests++;
    if (hitsPoly(x, z, 0.5, p)) interiorHits++;
    if (interiorTests >= 25) break;
  }
  if (interiorTests > 5 && interiorHits !== interiorTests) {
    throw new Error(`masonry interiors should collide: ${interiorHits}/${interiorTests}`);
  }
}
// Flat GIS overlay lives in its own layer (same rings as masonry/slabs + 2D map).
const footprintMeshes = world.layerGroups.footprints.children.filter(
  (o) => o.name === 'gis-footprints-flat',
);
if (gisFootprints > 40 && footprintMeshes.length < 1) {
  throw new Error('missing GIS footprint overlay mesh');
}
// Surveyed rings on key plots must stay in the plan (2D map + overlay) and
// must not become masonry colliders — dropping them blanked the forum etc.
const underKeyGis = plan.buildings.filter((b) => b.underKey && (b.outline?.length ?? 0) >= 3);
if (gisFootprints > 40 && underKeyGis.length < 1) {
  throw new Error('key-plot GIS footprints were dropped from the plan');
}
for (const b of underKeyGis) {
  if (world.polysByLayer.buildings.some((p) => p.outline === b.outline)) {
    throw new Error(`underKey GIS ${b.id} should not collide`);
  }
}
world.layerGroups.walls.visible = false;
if (world.layerGroups.walls.visible !== false) throw new Error('layer toggle failed');
world.layerGroups.walls.visible = true;
// Ground lift: cosine mound, crest = earthworkHeight, quarter-width = profile(0.5).
// Lower bound only — overlapping banks (opposite scarps) may add more lift.
{
  const segs = plan.earthworks.filter((s) => Math.hypot(s.x2 - s.x1, s.z2 - s.z1) >= 0.5).slice(0, 8);
  if (!segs.length) throw new Error('no earthworks to lift-check');
  const mound = world.group.children.find((o) => o.name === 'gis-earthworks');
  if (!mound) throw new Error('missing earthwork mound mesh');
  for (const s of segs) {
    const mx = (s.x1 + s.x2) / 2, mz = (s.z1 + s.z2) / 2;
    const base = world.terrainY(mx, mz);
    const H = earthworkHeight(s);
    const crest = world.groundY(mx, mz);
    if (crest < base + H - 0.08) {
      throw new Error(`earthwork crest lift missing at (${mx},${mz}): got ${crest}, want >= ${base + H}`);
    }
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const len = Math.hypot(dx, dz) || 1;
    const w = earthworkWidth(s);
    const qx = mx + (-dz / len) * (w / 4), qz = mz + (dx / len) * (w / 4);
    const qbase = world.terrainY(qx, qz);
    const quarter = world.groundY(qx, qz);
    const wantQ = qbase + earthworkProfile(0.5) * H;
    if (quarter < wantQ - 0.08) {
      throw new Error(`earthwork flank lift missing at (${qx},${qz}): got ${quarter}, want >= ${wantQ}`);
    }
  }
}
// One ground level: the drawn terrain mesh is exactly the surface every height query reads, key
// buildings stand on flat platforms (footprint ground within a centimetre of level), and nothing
// walkable sits more than a few centimetres off the ground it is built on.
{
  const ground = world.group.children.find((o) => o.name === 'ground') as THREE.Mesh | undefined;
  if (!ground) throw new Error('missing ground mesh');
  const gp = ground.geometry.attributes.position, gi = ground.geometry.index!;
  for (let t = 0; t < gi.count / 3; t += 11) {
    const a = gi.getX(t * 3), b = gi.getX(t * 3 + 1), c = gi.getX(t * 3 + 2);
    const x = (gp.getX(a) + gp.getX(b) + gp.getX(c)) / 3, z = (gp.getZ(a) + gp.getZ(b) + gp.getZ(c)) / 3;
    const y = (gp.getY(a) + gp.getY(b) + gp.getY(c)) / 3;
    if (earthworkOffset(world.townWall, x, z) < 0) continue; // over the ditch the ground is hidden and the earthworks mesh draws it
    if (world.planBuildings.some((pb) => pb.id.endsWith('-gate') && pb.distanceTo(x, z) < 6)) continue; // levelled at the gates by the same mesh
    if (Math.abs(y - world.terrainY(x, z)) > 1e-3) throw new Error(`ground mesh differs from terrainY at (${x.toFixed(0)},${z.toFixed(0)}): ${y} vs ${world.terrainY(x, z)}`);
  }
  for (const pb of world.planBuildings) {
    if (pb.id.endsWith('-gate')) continue; // the town gates stand on the wall line, which follows the ground (checked below)
    let lo = Infinity, hi = -Infinity;
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const y = world.terrainY(pb.centre.x + (i * pb.radius) / 6, pb.centre.z + (j * pb.radius) / 6);
      if (Math.hypot(i, j) <= 3) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
    if (hi - lo > 0.05) throw new Error(`${pb.id} is not on a levelled platform: ground varies ${(hi - lo).toFixed(2)} m under it`);
    const floor = pb.floorAt(pb.centre.x, pb.centre.z);
    const sunk = KEY_PLANS[pb.id]?.arena?.ground ?? 0; // a sunken arena's floor lies that far below its platform
    if (floor !== undefined && (floor < lo - sunk || floor > hi + 0.1 - sunk)) throw new Error(`${pb.id} floor ${floor} is off the ground ${lo}..${hi} (sunk ${sunk})`);
  }
}
if (houses > PERF_BUDGET.maxHouses) throw new Error(`house budget exceeded: ${houses}`);
if (ruins > PERF_BUDGET.maxRuins) throw new Error(`ruin budget exceeded: ${ruins}`);
if (world.drawCalls > PERF_BUDGET.maxDrawCalls) {
  throw new Error(`draw budget exceeded: ${world.drawCalls} > ${PERF_BUDGET.maxDrawCalls}`);
}
if (world.tris > PERF_BUDGET.maxTrisInView) {
  throw new Error(`tri budget exceeded: ${world.tris} > ${PERF_BUDGET.maxTrisInView}`);
}
// Ghosts are extra transparent draws outside the town mesh budget: one shared
// material, one mesh per costume, each under 800 tris.
const ghostMat = getGhostMaterial();
const ghostTriParts: string[] = [];
for (const id of getGhostCostumes()) {
  const g = getGhostCostumeGeometry(id);
  const tris = ghostCostumeTriCount(g);
  ghostTriParts.push(`${id}=${tris}`);
  if (tris > 800) throw new Error(`ghost ${id} tris ${tris} > 800`);
  const mesh = createGhostMesh(id);
  if (mesh.material !== ghostMat) throw new Error(`ghost ${id} did not share material`);
}
console.log(`ghosts ${ghostTriParts.join(' ')}`);
// Collectible 3D scans: ids unique, embeds Sketchfab-https, scatter lands
// inside the wall circuit (explicit x/z pins pass through untouched).
{
  const seeds = collectibleSeeds();
  if (seeds.length < 1) throw new Error('no collectible seeds (run npm run import:collectibles)');
  const seen = new Set(seeds.map((s) => s.id));
  if (seen.size !== seeds.length) throw new Error('duplicate collectible id');
  const placed = placeCollectibles(seeds, plan);
  const inPoly = (x: number, z: number): boolean => {
    let inside = false;
    const p = plan.walls;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const xi = p[i].x, zi = p[i].z, xj = p[j].x, zj = p[j].z;
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  for (const c of placed) {
    if (!inPoly(c.x, c.z)) throw new Error(`collectible ${c.id} placed outside walls`);
    if (!(c.radius >= 2 && c.radius <= 12)) throw new Error(`collectible ${c.id} bad radius`);
  }
  const beacons = new CollectibleController(placed, () => 0);
  const gold = beacons.group.getObjectByName('collectibles-uncollected') as THREE.InstancedMesh;
  const green = beacons.group.getObjectByName('collectibles-collected') as THREE.InstancedMesh;
  const goldMat = gold.material as THREE.MeshLambertMaterial;
  const greenMat = green.material as THREE.MeshLambertMaterial;
  if (goldMat.color.getHex() !== COLLECTIBLE_COLOR_UNCOLLECTED) throw new Error('uncollected beacon is not gold');
  if (greenMat.color.getHex() !== COLLECTIBLE_COLOR_COLLECTED) throw new Error('collected beacon is not green');
  const scaleAt = (mesh: THREE.InstancedMesh, i: number): number => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixScale(m).x;
  };
  if (!(scaleAt(gold, 0) > 0) || scaleAt(green, 0) !== 0) throw new Error('uncollected beacon should show gold, hide green');
  beacons.markCollected(placed[0].id);
  if (scaleAt(gold, 0) !== 0 || !(scaleAt(green, 0) > 0)) throw new Error('collected beacon should swap gold for green');
  beacons.setCollected([]);
  if (!(scaleAt(gold, 0) > 0) || scaleAt(green, 0) !== 0) throw new Error('cleared beacons should return to gold');
  console.log(`collectibles ${placed.map((c) => c.id).join(' ')}`);
}
// Spoken-ghost journal: storage parser keeps only known costume ids.
{
  if (parseSpokenCostumeIds(null).length !== 0) throw new Error('empty spoken ghosts should be []');
  if (parseSpokenCostumeIds('not-json').length !== 0) throw new Error('garbage spoken ghosts should be []');
  if (parseSpokenCostumeIds('["soldier","nope","soldier"]').join(',') !== 'soldier') {
    throw new Error('spoken ghosts should unique-filter known costumes');
  }
  const all = parseSpokenCostumeIds(JSON.stringify([...GHOST_COSTUMES, 'wizard']));
  if (all.length !== GHOST_COSTUMES.length) throw new Error('spoken ghosts should accept the full roster');
  const ghosts = new GhostController(plan, GHOST_COSTUMES.length, () => 0.5);
  const xz = new Float32Array(GHOST_MAX * 2);
  const flags = new Uint8Array(GHOST_MAX);
  const n = ghosts.writeXZ(xz, flags, new Set());
  if (n !== GHOST_COSTUMES.length) throw new Error('ghost writeXZ count');
  for (let i = 0; i < n; i++) if (flags[i] !== 0) throw new Error('unspoken map flags should be 0');
  ghosts.writeXZ(xz, flags, new Set(GHOST_COSTUMES));
  for (let i = 0; i < n; i++) if (flags[i] !== 1) throw new Error('spoken map flags should be 1');
}
// Dialogue bank selection: unseen-ever first, no repeats this meeting, deep gated, requires honoured.
{
  if (neverKnowsNeedle('stone town walls') !== 'walls') throw new Error('neverKnows needle should keep the longest word');
  const blocked = checkBankText('The museum has the evidence.', ['forum']);
  if (!blocked.includes('blocked')) throw new Error('blocked term should be flagged');
  if (checkBankText('I have never heard of the forum.', ['forum']).some((p) => p.startsWith('neverKnows:'))) {
    /* expected warning */
  } else throw new Error('neverKnows word should warn');

  const node = (
    id: string,
    topic: string,
    depth: 'intro' | 'mid' | 'deep',
    requires?: string[],
  ) => ({
    id, topic, depth, ask: [`Ask ${id}?`], replies: [`Reply ${id} one.`, `Reply ${id} two.`],
    next: [], reviewed: true, ...(requires ? { requires } : {}),
  });
  const bank: PersonaBank = {
    schemaVersion: 1,
    personaId: 'matron',
    bankVersion: 1,
    generatedAt: '2026-01-01',
    model: 'test',
    greetings: [],
    returnGreetings: [],
    farewells: ['Farewell.'],
    nodes: {
      food: node('food', 'food', 'intro'),
      home: node('home', 'home', 'intro'),
      work: node('work', 'work', 'intro'),
      seenA: node('seenA', 'trade', 'intro'),
      seenB: node('seenB', 'gods', 'intro'),
      seenC: node('seenC', 'clothes', 'intro'),
      deep: node('deep', 'food', 'deep'),
      locked: node('locked', 'family', 'mid', ['food']),
    },
  };
  const rng = mulberry32(1);
  const seenEver = new Set(['seenA', 'seenB', 'seenC']);
  const fresh = pickChoices(
    bank,
    ['food', 'home', 'work', 'seenA', 'seenB', 'seenC'],
    { turn: 0, seenThisMeeting: new Set(), seenEver },
    rng,
  );
  if (fresh.length > 3) throw new Error('pickChoices returned more than 3');
  if (fresh.length !== 3) throw new Error('pickChoices should fill 3 from fresh intros');
  for (const c of fresh) {
    if (seenEver.has(c.nodeId)) throw new Error(`pickChoices preferred seen-ever node ${c.nodeId}`);
  }
  const repeat = pickChoices(
    bank,
    ['food', 'home'],
    { turn: 0, seenThisMeeting: new Set(['food']), seenEver: new Set() },
    mulberry32(2),
  );
  if (repeat.some((c) => c.nodeId === 'food')) throw new Error('seen-this-meeting node was offered again');
  const early = pickChoices(
    bank,
    ['deep', 'home'],
    { turn: 1, seenThisMeeting: new Set(), seenEver: new Set() },
    mulberry32(3),
  );
  if (early.some((c) => c.nodeId === 'deep')) throw new Error('deep node offered before turn 2');
  const locked = pickChoices(
    bank,
    ['locked'],
    { turn: 3, seenThisMeeting: new Set(), seenEver: new Set() },
    mulberry32(4),
  );
  if (locked.some((c) => c.nodeId === 'locked')) throw new Error('requires was ignored');
  const open = pickChoices(
    bank,
    ['locked'],
    { turn: 3, seenThisMeeting: new Set(['food']), seenEver: new Set() },
    mulberry32(5),
  );
  if (!open.some((c) => c.nodeId === 'locked')) throw new Error('requires should unlock after the parent is seen');
  const many = pickChoices(
    bank,
    Object.keys(bank.nodes),
    { turn: 0, seenThisMeeting: new Set(), seenEver: new Set() },
    mulberry32(6),
  );
  if (many.length > 3) throw new Error('pickChoices exceeded 3 with a wide candidate list');
  const replied = pickReply(bank.nodes.food, 0, () => 0);
  if (replied.index === 0) throw new Error('pickReply should avoid the last variant');
  if (pickReply({ ...bank.nodes.food, replies: ['only'] }, 0, () => 0).index !== 0) {
    throw new Error('single reply has no alternative to avoid');
  }
}
// Plan-built key buildings: built from the plan, placed on its surveyed footprint, with three
// LOD levels (triangles decreasing, LOD0 under the building's cap), colliders, a walkable
// entrance, a solid wall, element picking on every triangle, and a dev spawn just outside.
{
  interface PlanCheck {
    id: string; cap: number; centre: [number, number]; minWalls: number;
    door: [number, number]; wall: [number, number]; spawn: [number, number];
    pick: { element: string; note: string };
  }
  /** World point of a plan point (for the gates, whose frames are not axis-aligned to the GIS). */
  const gw = (id: string, u: number, v: number): [number, number] => { const p = planToWorld(KEY_PLANS[id], u, v); return [p.x, p.z]; };
  /** A dev spawn 8 m out in the field in front of a gate (plan v up = the field). */
  const gs = (id: string): [number, number] => {
    const kp = KEY_PLANS[id], vs = kp.walls.flatMap((w) => [w.a[1], w.b[1]]), us = kp.walls.flatMap((w) => [w.a[0], w.b[0]]);
    return gw(id, (Math.min(...us) + Math.max(...us)) / 2, Math.max(...vs) + 8);
  };
  /** The building's own placed centre (the gates have no separate pin to compare with: their anchors were fitted to the same GIS). */
  const pc = (id: string): [number, number] => { const p = world.planBuildings.find((b) => b.id === id)!.centre; return [p.x, p.z]; };
  const checks: PlanCheck[] = [
    // baths: ~66 x 30 m anchor around 163.9, 144; facade entrance; west wall; cold-bath window (1903-4 glass)
    { id: 'baths', cap: 12000, centre: [163.9, 144], minWalls: 20, door: [13.1, 61.1], wall: [0.45, 50], spawn: [160, 104],
      pick: { element: 'west-frig/window0', note: '1903' } },
    // forum-basilica: 95.8 x 86 m anchor around -89.1, 45.4; the outer gateway arch; the basilica east wall;
    // the curia opening (1893). LOD0 cap 20k agreed for this building (docs/key-buildings/forum-basilica.md).
    { id: 'forum-basilica', cap: 20000, centre: [-89.1, 45.4], minWalls: 50, door: [95.12, 41.7], wall: [35.7, 30], spawn: [-38, 47],
      pick: { element: 'bas-w/door0', note: '1893' } },
    // mansio: 130 x 65.1 m anchor around 24.7, 313.8; the gate in the north outer wall; the long south wall; the door from the
    // outer court's gateway from the street (conjectural). LOD0 cap 16k agreed for this building (docs/key-buildings/mansio.md).
    { id: 'mansio', cap: 16000, centre: [24.7, 313.8], minWalls: 100, door: [44.3, 61.4], wall: [40, 0.24], spawn: [1.7, 281.8],
      pick: { element: 'd172/door0', note: 'street' } },
    // amphitheatre: 74.8 x 81.1 m anchor around 452.2, -156.3; the north passage's outer end; the arena wall (NE);
    // the arena wall's note (Fulford 2002). LOD0 cap 12k agreed for this building (docs/key-buildings/amphitheatre.md).
    { id: 'amphitheatre', cap: 12000, centre: [452.2, -156.3], minWalls: 60, door: [37.1, 72], wall: ringPoint(KEY_PLANS.amphitheatre.arena!, 45),
      spawn: [467, -197.4], pick: { element: 'arena/wall', note: 'ironstone' } },
    // the town gates (docs/key-buildings/town-walls.md): through the passage; a passage wall or the central wall; a part with a 1890 note.
    // LOD0 caps agreed 2026-10-14: 6k for the main gates, 3k for the minor ones.
    { id: 'north-gate', cap: 6000, centre: pc('north-gate'), minWalls: 10, door: [18.1, 3], wall: [15.6, 2.5], spawn: gs('north-gate'), pick: { element: 'arch-out/door0', note: 'timber sill' } },
    { id: 'south-gate', cap: 6000, centre: pc('south-gate'), minWalls: 10, door: [15.6, 3], wall: [13.3, 2.5], spawn: gs('south-gate'), pick: { element: 'steps', note: 'rude foundation' } },
    { id: 'west-gate', cap: 6000, centre: pc('west-gate'), minWalls: 15, door: [10.5, 2.5], wall: [12.95, 2], spawn: gs('west-gate'), pick: { element: 'pier', note: 'central wall' } },
    { id: 'east-gate', cap: 6000, centre: pc('east-gate'), minWalls: 15, door: [11, 3], wall: [13.5, 2], spawn: gs('east-gate'), pick: { element: 'arch-out-1/door0', note: '3.66 m' } },
    { id: 'lesser-west-gate', cap: 3000, centre: pc('lesser-west-gate'), minWalls: 2, door: [6.7, 2], wall: [4.4, 1.5], spawn: gs('lesser-west-gate'), pick: { element: 'arch-out/door0', note: 'iron shoe' } },
    { id: 'amphitheatre-gate', cap: 3000, centre: pc('amphitheatre-gate'), minWalls: 4, door: [7.8, 2.2], wall: [4.45, 1.0], spawn: gs('amphitheatre-gate'), pick: { element: 'arch/door0', note: '3.3 m' } },
    { id: 'se-gate', cap: 3000, centre: pc('se-gate'), minWalls: 2, door: [4.4, 3], wall: [3.2, 2], spawn: gs('se-gate'), pick: { element: 'arch/door0', note: 'drain' } },
  ];
  for (const c of checks) {
    const kp = KEY_PLANS[c.id];
    if (!kp) throw new Error(`KEY_PLANS['${c.id}'] missing (npm run import:keyplans)`);
    const pb = world.planBuildings.find((b) => b.id === c.id);
    if (!pb) throw new Error(`plan-built ${c.id} missing from the world`);
    if (pb.object.levels.length !== 3) throw new Error(`${c.id} LOD levels ${pb.object.levels.length} != 3`);
    const t = pb.trisByLod;
    if (!(t[0] > t[1] && t[1] > t[2] && t[2] > 0)) throw new Error(`${c.id} LOD tris not decreasing: ${t[0]}/${t[1]}/${t[2]}`);
    if (t[0] > c.cap) throw new Error(`${c.id} LOD0 ${t[0]} tris over its ${c.cap} budget`);
    if (pb.polys.length < c.minWalls) throw new Error(`${c.id} has only ${pb.polys.length} wall colliders`);
    if (Math.hypot(pb.centre.x - c.centre[0], pb.centre.z - c.centre[1]) > 3) {
      throw new Error(`${c.id} centre off its footprint: ${pb.centre.x.toFixed(1)}, ${pb.centre.z.toFixed(1)}`);
    }
    const door = planToWorld(kp, c.door[0], c.door[1]);
    const atFeet = (p: { top?: number }, x: number, z: number): boolean => p.top === undefined || world.terrainY(x, z) < p.top - 0.35;
    if (world.polys.some((p) => atFeet(p, door.x, door.z) && hitsPoly(door.x, door.z, 0.3, p))) throw new Error(`${c.id} entrance is blocked by a collider`);
    const wall = planToWorld(kp, c.wall[0], c.wall[1]);
    if (!world.polys.some((p) => hitsPoly(wall.x, wall.z, 0.3, p))) throw new Error(`${c.id} solid wall has no collider`);
    const proximity = pb.distanceTo(c.spawn[0], c.spawn[1]);
    if (!(proximity > 0 && proximity < 15)) throw new Error(`dev spawn ${c.spawn.join(',')} should be just outside ${c.id} (got ${proximity.toFixed(1)} m)`);
    for (const lod of [0, 1, 2] as const) {
      const b = buildFromPlan(kp, { lod });
      for (let i = 1; i < b.elementRanges.length; i += 2) if (b.elementRanges[i] < 0) throw new Error(`${c.id} lod ${lod}: untagged triangles at ${b.elementRanges[i - 1]}`);
      const el = elementTriangles(b, c.pick.element);
      if (lod < 2 && (!el.length || elementAtFace(b, el[0][0])?.note?.includes(c.pick.note) !== true)) throw new Error(`${c.id} lod ${lod}: ${c.pick.element} not pickable`);
      if (elementAtFace(b, b.tris - 1) === undefined) throw new Error(`${c.id} lod ${lod}: last triangle has no element`);
      b.geometry.dispose();
    }
  }
  // The amphitheatre: the arena 2 m below the ground round it, seats and banks walkable at their heights, the
  // passages rising to the old ground, and the drawn ground open over the bowl (its surfaces fill the hole).
  {
    const kp = KEY_PLANS.amphitheatre, ar = kp.arena!, pb = world.planBuildings.find((b) => b.id === 'amphitheatre')!;
    const W = (u: number, v: number): { x: number; z: number } => planToWorld(kp, u, v);
    const plat = world.terrainY(pb.centre.x, pb.centre.z);
    const at = (u: number, v: number): number => { const p = W(u, v); return world.groundY(p.x, p.z) - plat; };
    const near = (got: number, want: number, what: string): void => { if (Math.abs(got - want) > 0.06) throw new Error(`amphitheatre ${what}: ${got.toFixed(2)} m, want ${want.toFixed(2)}`); };
    near(at(ar.c[0], ar.c[1]), -ar.ground + 0.03, 'arena floor below the ground');
    const P = arenaProfile(ar), row = 5, d = ar.t / 2 + (row + 0.5) * ar.seating.tread;
    const sp = ringPoint(ar, 135, d);
    near(at(sp[0], sp[1]), -ar.ground + ar.h + row * ar.seating.rise, `seat row ${row + 1}`);
    const cr = ringPoint(ar, 135, P.rowsEnd + ar.bank.crest / 2);
    near(at(cr[0], cr[1]), -ar.ground + P.crestY, 'crest walk');
    const ap = ringPoint(ar, 135, ar.bank.toe + 1);
    near(at(ap[0], ap[1]), 0.02, 'ground beyond the toe');
    const ps = ar.passages[0].walls, mu = (ps[0].a[0] + ps[1].a[0]) / 2;
    const mid = at(mu, (ps[0].a[1] + ps[0].b[1]) / 2), end = at(mu, (ps[0].b[1] + ps[1].b[1]) / 2 - 0.2);
    if (!(mid > -ar.ground + 0.3 && mid < -0.3 && end > -0.2)) throw new Error(`amphitheatre passage should rise to the old ground: mid ${mid.toFixed(2)}, end ${end.toFixed(2)}`);
    const hole = arenaHoleWorld(kp)!;
    const ground = world.group.children.find((o) => o.name === 'ground') as THREE.Mesh;
    const gp = ground.geometry.attributes.position, gi = ground.geometry.index!;
    for (let t = 0; t < gi.count / 3; t++) {
      const x = (gp.getX(gi.getX(t * 3)) + gp.getX(gi.getX(t * 3 + 1)) + gp.getX(gi.getX(t * 3 + 2))) / 3;
      const z = (gp.getZ(gi.getX(t * 3)) + gp.getZ(gi.getX(t * 3 + 1)) + gp.getZ(gi.getX(t * 3 + 2))) / 3;
      if (x > hole.minX && x < hole.maxX && z > hole.minZ && z < hole.maxZ) throw new Error(`ground triangle drawn over the arena at ${x.toFixed(0)},${z.toFixed(0)}`);
    }
    // every enclosed space can be entered: the recesses open off the arena (mouth and middle free of colliders)
    for (const rc of ar.recesses) {
      const ou = rc.c[0] - ar.c[0], ov = rc.c[1] - ar.c[1], od = Math.hypot(ou, ov);
      for (const s of [-2.2, -1.2, 0]) {
        const p = W(rc.c[0] + (ou / od) * s, rc.c[1] + (ov / od) * s);
        if (world.polys.some((q) => hitsPoly(p.x, p.z, 0.3, q))) throw new Error(`amphitheatre ${rc.id} is blocked ${-s} m in front of its centre`);
        if (Math.abs(world.groundY(p.x, p.z) - plat + ar.ground - 0.03) > 0.06) throw new Error(`amphitheatre ${rc.id} floor is not at the arena's level`);
      }
    }
    // nothing shows through the seating: each recess vault's crown stays under the seats above it, and the arena
    // wall's top is the first row's tread
    for (const rc of ar.recesses) {
      const op = ar.openings.find((o) => o.id === rc.id), crown = (op?.oh ?? 1.7) + (rc.r - rc.t / 2);
      const od = Math.hypot(rc.c[0] - ar.c[0], rc.c[1] - ar.c[1]), R = ringRadius(ar, polarDeg(ar, rc.c[0], rc.c[1]));
      for (let d = 0; d <= od + rc.r + rc.t / 2 - R; d += 0.25) if (profileY(ar, d) < crown + 0.05) throw new Error(`amphitheatre ${rc.id} vault (crown ${crown.toFixed(2)} m) shows through the seating ${d} m out`);
    }
    if (Math.abs(profileY(ar, 0) - ar.h) > 1e-6 || Math.abs(profileY(ar, ar.t / 2 + 0.01) - ar.h) > 1e-6) throw new Error('amphitheatre: the first row must sit on the arena wall top');
    if (world.bands.length) throw new Error('the old amphitheatre seating band is still in use');
  }
  // The forum-basilica and the mansio are built in flint, the amphitheatre in flint with ironstone courses; the baths keep
  // the default Greensand facing.
  if (KEY_PLANS['forum-basilica'].facing !== 'flint' || KEY_PLANS.mansio.facing !== 'flint' || KEY_PLANS.amphitheatre.facing !== 'flint-ironstone' || KEY_PLANS.baths.facing) {
    throw new Error('wall facings: forum and mansio flint, amphitheatre flint-ironstone, baths default');
  }
  let alt = 0;
  world.group.traverse((o) => { if (o.userData.lodAlternate) alt++; });
  if (alt !== 2 * world.planBuildings.length) throw new Error(`expected ${2 * world.planBuildings.length} LOD alternates, got ${alt}`);
  world.setKeyBuildingDisplay('evidence');
  world.setKeyBuildingDisplay('hybrid');
  console.log(`plan buildings ${world.planBuildings.map((b) => `${b.id} lod ${b.trisByLod[0]}/${b.trisByLod[1]}/${b.trisByLod[2]} tris, ${b.polys.length} walls`).join('; ')}`);
}
// The town wall (stone phase): its section along the GIS line between seven plan-built gates, the rampart and the
// ditch in the ground, the wall-walk and gate platforms walkable, every gate passage, chamber and tower room open.
// Evidence and budgets: docs/key-buildings/town-walls.md.
{
  const tw = world.townWall;
  const blockedAt = (x: number, z: number, feet: number): boolean => world.polys.some((p) => (p.top === undefined || feet < p.top - 0.35) && hitsPoly(x, z, 0.3, p));
  const near = (got: number, want: number, tol: number, what: string): void => { if (Math.abs(got - want) > tol) throw new Error(`town wall ${what}: ${got.toFixed(2)}, want ${want.toFixed(2)}`); };
  if (world.townWallTris.wall > 24000) throw new Error(`town wall section ${world.townWallTris.wall} tris over its 24k budget`);
  if (world.group.getObjectByName('town-wall') === undefined) throw new Error('town wall mesh missing');
  // seven gates, plan-built, where the GIS draws them (the north gate is ~120 m west of the old one)
  const gateIds = ['north-gate', 'south-gate', 'east-gate', 'west-gate', 'lesser-west-gate', 'amphitheatre-gate', 'se-gate'];
  for (const id of gateIds) {
    const pb = world.planBuildings.find((b) => b.id === id);
    if (!pb) throw new Error(`gate ${id} missing`);
    const t = pb.trisByLod, cap = id.includes('-west-') || id.startsWith('amph') || id.startsWith('se') ? 3000 : 6000;
    if (!(t[0] > t[1] && t[1] > t[2] && t[2] > 0)) throw new Error(`${id} LOD tris not decreasing: ${t[0]}/${t[1]}/${t[2]}`);
    if (t[0] > cap) throw new Error(`${id} LOD0 ${t[0]} over its ${cap} budget`);
    if (!tw.gates.some((g) => g.id === id)) throw new Error(`${id} has no curtain ends`);
  }
  const ng = tw.gates.find((g) => g.id === 'north-gate')!;
  if (Math.hypot(ng.centre.x + 170, ng.centre.z + 349) > 4) throw new Error(`north gate at ${ng.centre.x.toFixed(0)},${ng.centre.z.toFixed(0)}, not on the GIS gate`);
  if (plan.gates.length !== 7) throw new Error(`plan.gates should list the seven gates, got ${plan.gates.length}`);
  // the section, the walk, the rampart and the ditch at the middle of the longest run
  const runSegs = tw.segs.filter((g) => g.kind === 'run');
  const sg = runSegs.reduce((a, b) => (b.len > a.len ? b : a));
  const at = (d: number): { x: number; z: number } => ({ x: (sg.ax + sg.bx) / 2 + sg.nx * d, z: (sg.az + sg.bz) / 2 + sg.nz * d });
  const c = at(0), foot = world.terrainY(c.x, c.z);
  if (!blockedAt(c.x, c.z, foot)) throw new Error('town wall: no collider on the wall at ground level');
  if (blockedAt(c.x, c.z, foot + WALL.walk)) throw new Error('town wall: the walk is blocked');
  near(world.groundY(c.x, c.z, foot + WALL.walk) - foot, WALL.walk, 0.05, 'walk height');
  const pp = at((FACE.outer + FACE.parapetIn) / 2);
  if (!blockedAt(pp.x, pp.z, foot + WALL.walk)) throw new Error('town wall: the parapet does not stop you on the walk');
  const crest = at(FACE.innerLower + RAMPART.crestW / 2);
  near(world.groundY(crest.x, crest.z) - world.terrainY(crest.x, crest.z), RAMPART.crest, 0.05, 'rampart crest');
  const ditch = at(FACE.outer - DITCH.from - DITCH.width / 2);
  near(earthworkOffset(tw, ditch.x, ditch.z), -DITCH.depth, 0.05, 'ditch depth');
  near(world.groundY(ditch.x, ditch.z) - world.terrainY(ditch.x, ditch.z), 0, 0.01, 'walking in the ditch');
  // counterforts' steps lead from the rampart's crest up to the walk
  // counterforts sit on the wall line, square to it, and those the crest reaches have steps
  for (const c of tw.counterforts) {
    const n = tw.nearest(c.at[0], c.at[1]);
    const off = n ? Math.hypot(c.at[0] - n.seg.ax - n.seg.dx * Math.max(0, Math.min(n.seg.len, n.t)), c.at[1] - n.seg.az - n.seg.dz * Math.max(0, Math.min(n.seg.len, n.t))) : Infinity;
    if (!n || off > 0.01 || Math.abs(n.seg.nx * c.n[0] + n.seg.nz * c.n[1]) < 0.85) throw new Error(`counterfort at ${c.at.map((v) => v.toFixed(0))} is off the wall line (off ${off.toFixed(3)}, dot ${n ? (n.seg.nx * c.n[0] + n.seg.nz * c.n[1]).toFixed(3) : "-"}, ${n?.seg.kind} run ${n?.seg.run} vs ${c.run})`);
  }
  if (tw.counterforts.filter((c) => c.stairs).length < tw.counterforts.length - 6) throw new Error('town wall: too few counterforts with steps');
  // the rampart reaches the back of the wall: the crest height just inside the inner face
  for (const sgx of runSegs.filter((g, i) => i % 7 === 0 && g.s0 + g.len / 2 > 5 && g.s0 + g.len / 2 < g.runLen - 5)) {
    const px = (sgx.ax + sgx.bx) / 2 + sgx.nx * (FACE.innerUpper + 0.3), pz = (sgx.az + sgx.bz) / 2 + sgx.nz * (FACE.innerUpper + 0.3);
    const lift = earthworkOffset(tw, px, pz);
    if (lift > 0.5 && Math.abs(lift - RAMPART.crest) > 0.05) throw new Error(`town wall: the rampart against the wall is ${lift.toFixed(2)} m, not the crest`);
  }
  const cf = tw.counterforts.find((c) => c.stairs)!;
  const st = { x: cf.at[0] + cf.n[0] * (FACE.innerLower + 0.2), z: cf.at[1] + cf.n[1] * (FACE.innerLower + 0.2) };
  const dk = wallDeckAt(tw, st.x, st.z);
  if (!dk || dk.y < RAMPART.crest + 0.6) throw new Error('town wall: no steps up a counterfort');
  // the gates: passages open at ground level, chambers and tower rooms entered, platforms walkable
  const P = (id: string, u: number, v: number): { x: number; z: number } => planToWorld(KEY_PLANS[id], u, v);
  const open = (id: string, u: number, v: number, what: string): void => {
    const p = P(id, u, v);
    if (blockedAt(p.x, p.z, world.terrainY(p.x, p.z))) throw new Error(`${id} ${what} is blocked`);
  };
  open('north-gate', 18.1, 3, 'passage'); open('north-gate', 18.1, 5.45, 'outer arch'); open('north-gate', 18.1, 0.9, 'inner arch');
  open('south-gate', 15.6, 3, 'passage'); open('south-gate', 15.6, 5.35, 'outer arch');
  for (const id of ['west-gate', 'east-gate']) {
    const kp = KEY_PLANS[id], pb = world.planBuildings.find((b) => b.id === id)!;
    for (const r of kp.rooms) { const [u, v] = r.poly.reduce((m, q) => [m[0] + q[0] / r.poly.length, m[1] + q[1] / r.poly.length], [0, 0]); open(id, u, v, r.name); }
    const base = pb.floorAt(pb.centre.x, pb.centre.z)! - 0.03;
    for (const w of kp.walls) for (const o of w.openings ?? []) {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), u = w.a[0] + ((w.b[0] - w.a[0]) * o.at) / L, v = w.a[1] + ((w.b[1] - w.a[1]) * o.at) / L;
      const p = P(id, u, v);
      if (blockedAt(p.x, p.z, base + (o.y0 ?? 0))) throw new Error(`${id} ${w.id} opening is blocked`);
    }
    // the platform over the passages: walkable from above, a ceiling over the passage below
    const pf = kp.platforms!.find((q) => q.id === 'platform')!, pr = kp.rooms.find((r) => r.id === 'passage-n')!;
    const [pu, pv] = pr.poly.reduce((m, q) => [m[0] + q[0] / pr.poly.length, m[1] + q[1] / pr.poly.length], [0, 0]);
    const p = P(id, pu, pv);
    near(world.groundY(p.x, p.z, base + pf.y) - base, pf.y, 0.05, `${id} platform`);
    near(world.groundY(p.x, p.z, base) - base, 0.03, 0.05, `${id} passage under the platform`);
    // the tower rooms have floors at the walk's level and a door off the platform
    for (const side of ['n', 's']) {
      const fl = kp.platforms!.find((q) => q.id === `gh${side}-floor`)!;
      const [fu, fv] = fl.poly.reduce((m, q) => [m[0] + q[0] / fl.poly.length, m[1] + q[1] / fl.poly.length], [0, 0]);
      const fp = P(id, fu, fv);
      near(world.groundY(fp.x, fp.z, base + fl.y) - base, fl.y, 0.05, `${id} tower room ${side} floor`);
      if (blockedAt(fp.x, fp.z, base + fl.y)) throw new Error(`${id} tower room ${side} is blocked`);
    }
  }
  open('lesser-west-gate', 6.7, 2, 'gateway'); open('amphitheatre-gate', 7.8, 2.2, 'gateway'); open('se-gate', 4.4, 3, 'footway'); open('se-gate', 4.4, 6.9, 'footway arch');
  // the south gate's steps reach its platform
  {
    const s0 = P('south-gate', 12.15, 0.8), s1 = P('south-gate', 12.15, 4.3), g0 = world.terrainY(s0.x, s0.z);
    if (world.groundY(s1.x, s1.z, g0 + 4) - g0 < 3.8) throw new Error('south gate: the steps do not reach the platform');
  }
  // bridges where the ditch runs on (west, Lesser West, amphitheatre); causeways elsewhere
  for (const g of tw.gates) {
    const s = -FACE.outer + DITCH.from + DITCH.width / 2, p = { x: g.centre.x + g.out.x * s, z: g.centre.z + g.out.z * s };
    const ground = world.terrainY(p.x, p.z), off = earthworkOffset(tw, p.x, p.z);
    if (g.crossing === 'bridge') {
      if (off > -1) throw new Error(`${g.id}: no ditch under its bridge`);
      if (world.groundY(p.x, p.z, ground + DITCH.depth + 0.3) - ground < DITCH.depth) throw new Error(`${g.id}: the bridge deck is not walkable`);
    } else if (off < -0.05) throw new Error(`${g.id}: the ditch cuts its causeway (${off.toFixed(2)})`);
  }
  // the gates stand on the ground the wall follows: no more than 0.6 m across each footprint
  for (const id of gateIds) {
    const pb = world.planBuildings.find((b) => b.id === id)!;
    let lo = Infinity, hi = -Infinity;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const x = pb.centre.x + (i * pb.radius) / 6, z = pb.centre.z + (j * pb.radius) / 6;
      if (earthworkOffset(tw, x, z) < 0) continue;
      const y = world.terrainY(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    if (hi - lo > 0.6) throw new Error(`${id}: the ground varies ${(hi - lo).toFixed(2)} m under it`);
  }
  // the gates: built in the town wall's facing, every triangle tagged for the viewer, the walk and parapet pickable
  for (const id of gateIds) {
    if (KEY_PLANS[id].facing !== 'flint-limestone') throw new Error(`${id} should be faced like the town wall (flint-limestone)`);
    for (const lod of [0, 1, 2] as const) {
      const b = buildFromPlan(KEY_PLANS[id], { lod });
      for (let i = 1; i < b.elementRanges.length; i += 2) if (b.elementRanges[i] < 0) throw new Error(`${id} lod ${lod}: untagged triangles`);
      if (elementAtFace(b, b.tris - 1) === undefined) throw new Error(`${id} lod ${lod}: last triangle has no element`);
      b.geometry.dispose();
    }
  }
  {
    const b = buildFromPlan(KEY_PLANS['north-gate'], { lod: 0 });
    if (elementTriangles(b, 'flank-w-1/parapet').length === 0) throw new Error('north gate: the flank parapet is not pickable');
    if (!elementTriangles(b, 'platform').length || elementAtFace(b, elementTriangles(b, 'platform')[0][0])?.note?.includes('platform') !== true) throw new Error('north gate: the platform is not pickable');
    b.geometry.dispose();
  }
  // no wall shows through a platform (only crenellated parapets and the wall's own section rise above one), and every arch
  // crown, with the platform's 0.3 m of beams over it, stays under the platform
  for (const id of gateIds) {
    const kp = KEY_PLANS[id];
    const inPoly = (u: number, v: number, poly: Array<[number, number]>): boolean => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [ui, vi] = poly[i], [uj, vj] = poly[j];
        if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
      }
      return inside;
    };
    for (const pf of kp.platforms ?? []) {
      for (const w of kp.walls) {
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        const under = (s: number): boolean => inPoly(w.a[0] + ((w.b[0] - w.a[0]) * s) / L, w.a[1] + ((w.b[1] - w.a[1]) * s) / L, pf.poly);
        const samples = Array.from({ length: Math.max(2, Math.ceil(L / 0.25)) + 1 }, (_, k) => (k * L) / Math.max(2, Math.ceil(L / 0.25)));
        if (!samples.some(under)) continue;
        const top = w.kind === 'curtain' ? WALL.walk : w.h;
        if (top > pf.y + 0.01 && !w.crenel && w.kind !== 'curtain') throw new Error(`${id}: wall ${w.id} (top ${top} m) shows through ${pf.id} (${pf.y} m)`);
        if (w.crenel && top > pf.y + 0.01 && w.h - (WALL.top - WALL.breast) < pf.y - 0.01 && pf.y < 7) {
          // a parapet rising through a deck must carry its merlons above it, not stop short of it
          throw new Error(`${id}: crenellated ${w.id} is solid only to ${(w.h - 0.8).toFixed(2)} m, below ${pf.id}`);
        }
        for (const o of w.openings ?? []) {
          if (!o.arch || !under(o.at)) continue;
          const crown = o.oh + o.w / 2;
          if (crown + 0.3 > pf.y + 0.01) throw new Error(`${id}: ${w.id}'s arch crown at ${crown.toFixed(2)} m leaves no room for ${pf.id}'s beams (${pf.y} m)`);
        }
      }
    }
  }
  // the old instanced gate kit is gone
  world.layerGroups.walls.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) throw new Error('old gate kit still in the walls layer'); });
  console.log(`town wall: section ${world.townWallTris.wall} tris, earthworks ${world.townWallTris.earth}, ${tw.counterforts.length} counterforts; gates ${gateIds.map((id) => world.planBuildings.find((b) => b.id === id)!.trisByLod[0]).join('/')}`);
}
// Reconstructed-buildings display setting: parsing and tier logic.
{
  if (parseBuildingLook(null) !== 'auto' || parseBuildingLook('plain') !== 'plain' || parseBuildingLook('junk') !== 'auto') throw new Error('parseBuildingLook');
  if (tierFromBench(4) !== 'high' || tierFromBench(15) !== 'standard' || tierFromBench(40) !== 'plain' || tierFromBench(NaN) !== 'high') throw new Error('tierFromBench');
  if (stepDownTier('high') !== 'standard' || stepDownTier('standard') !== 'plain' || stepDownTier('plain') !== 'plain') throw new Error('stepDownTier');
  if (tierForLook('evidence', 'high') !== null || tierForLook('auto', 'standard') !== 'standard' || tierForLook('plain', 'high') !== 'plain') throw new Error('tierForLook');
  if (parseAutoTierCache(JSON.stringify({ gpu: 'A', tier: 'standard', extraMs: 12 }), 'A')?.tier !== 'standard') throw new Error('auto cache');
  if (parseAutoTierCache(JSON.stringify({ gpu: 'A', tier: 'standard' }), 'B') !== null) throw new Error('auto cache must be per GPU');
  if (parseAutoTierCache('{bad', 'A') !== null) throw new Error('auto cache must tolerate garbage');
  if (parseAutoTierCache(JSON.stringify({ gpu: 'A', tier: 'plain', extraMs: 24 }), 'A') !== null) throw new Error('a cached plain must be re-tested, not trusted');
}
console.log('smoke OK');
