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
    if (Math.abs(y - world.terrainY(x, z)) > 1e-3) throw new Error(`ground mesh differs from terrainY at (${x.toFixed(0)},${z.toFixed(0)}): ${y} vs ${world.terrainY(x, z)}`);
  }
  for (const pb of world.planBuildings) {
    let lo = Infinity, hi = -Infinity;
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const y = world.terrainY(pb.centre.x + (i * pb.radius) / 6, pb.centre.z + (j * pb.radius) / 6);
      if (Math.hypot(i, j) <= 3) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
    if (hi - lo > 0.05) throw new Error(`${pb.id} is not on a levelled platform: ground varies ${(hi - lo).toFixed(2)} m under it`);
    const floor = pb.floorAt(pb.centre.x, pb.centre.z);
    if (floor !== undefined && (floor < lo || floor > hi + 0.1)) throw new Error(`${pb.id} floor ${floor} is off the ground ${lo}..${hi}`);
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
// Plan-built key buildings (baths): built from the plan, placed on its surveyed
// footprint, with three LOD levels, colliders, and only one level counted as a draw.
{
  const baths = world.planBuildings.find((b) => b.id === 'baths');
  if (!baths) throw new Error('plan-built baths missing from the world');
  if (!KEY_PLANS.baths) throw new Error('KEY_PLANS.baths missing (npm run import:keyplans)');
  if (baths.object.levels.length !== 3) throw new Error(`baths LOD levels ${baths.object.levels.length} != 3`);
  const t = baths.trisByLod;
  if (!(t[0] > t[1] && t[1] > t[2] && t[2] > 0)) throw new Error(`baths LOD tris not decreasing: ${t[0]}/${t[1]}/${t[2]}`);
  if (t[0] > 12000) throw new Error(`baths LOD0 ${t[0]} tris over 12k budget`);
  if (baths.polys.length < 20) throw new Error(`baths has only ${baths.polys.length} wall colliders`);
  // Centre sits on the pinned key anchor (GENERATED_KEYS baths, ~66 x 30 m around 163.9, 144).
  if (Math.hypot(baths.centre.x - 163.9, baths.centre.z - 144) > 3) {
    throw new Error(`baths centre off its footprint: ${baths.centre.x.toFixed(1)}, ${baths.centre.z.toFixed(1)}`);
  }
  // The entrance gap in the facade must be walkable; the solid west wall must block.
  const door = planToWorld(KEY_PLANS.baths, 13.1, 61.1);
  if (world.polys.some((p) => hitsPoly(door.x, door.z, 0.3, p))) throw new Error('baths entrance is blocked by a collider');
  const wall = planToWorld(KEY_PLANS.baths, 0.45, 50);
  if (!world.polys.some((p) => hitsPoly(wall.x, wall.z, 0.3, p))) throw new Error('baths west wall has no collider');
  let alt = 0;
  world.group.traverse((o) => { if (o.userData.lodAlternate) alt++; });
  if (alt !== 2 * world.planBuildings.length) throw new Error(`expected ${2 * world.planBuildings.length} LOD alternates, got ${alt}`);
  world.setKeyBuildingDisplay('evidence');
  world.setKeyBuildingDisplay('hybrid');
  // Viewer picking: every triangle belongs to a plan element; the cold-bath window resolves.
  const proximity = baths.distanceTo(160, 104);
  if (!(proximity > 0 && proximity < 15)) throw new Error(`dev spawn 160,104 should be just outside the baths (got ${proximity.toFixed(1)} m)`);
  for (const lod of [0, 1, 2] as const) {
    const b = buildFromPlan(KEY_PLANS.baths, { lod });
    for (let i = 1; i < b.elementRanges.length; i += 2) if (b.elementRanges[i] < 0) throw new Error(`baths lod ${lod}: untagged triangles at ${b.elementRanges[i - 1]}`);
    const win = elementTriangles(b, 'west-frig/window0');
    if (lod < 2 && (!win.length || elementAtFace(b, win[0][0])?.note?.includes('1903') !== true)) throw new Error(`baths lod ${lod}: cold-bath window not pickable`);
    if (elementAtFace(b, b.tris - 1) === undefined) throw new Error(`baths lod ${lod}: last triangle has no element`);
    b.geometry.dispose();
  }
  console.log(`plan buildings ${world.planBuildings.map((b) => `${b.id} lod ${b.trisByLod[0]}/${b.trisByLod[1]}/${b.trisByLod[2]} tris, ${b.polys.length} walls`).join('; ')}`);
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
