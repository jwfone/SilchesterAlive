// Pure ghost-wander logic for Calleva street-walkers (no three.js / DOM).
// Ghosts walk GIS street centre-lines so they never clip buildings: the
// street graph is built once from plan.streets, filtered to segments inside
// the walled town. Per-frame stepping is O(ghosts), no collision queries.
//
// Extension seams (reserved, not implemented): GhostSpec already carries a
// stable `id` plus `scale`/`tint` slots so later per-ghost costumes are a
// data-only change; dialogue can map a picked mesh -> spec.id via the
// controller's id <-> object map.

import type { TownPlan } from './townPlan.js';

export type GhostCostumeId =
  | 'soldier' | 'magistrate' | 'matron' | 'labourer' | 'traveller' | 'briton'
  | 'swineherd' | 'fieldwife' | 'child' | 'coiner' | 'priestess'
  | 'lucco' | 'junia' | 'enica' | 'elen' | 'bassa';

/** Fixed roster: one of each costume, shuffled at spawn. */
export const GHOST_COSTUMES: GhostCostumeId[] = [
  'soldier', 'magistrate', 'matron', 'labourer', 'traveller', 'briton',
  'swineherd', 'fieldwife', 'child', 'coiner', 'priestess',
  'lucco', 'junia', 'enica', 'elen', 'bassa',
];

export interface GhostSpec {
  id: string;
  costume: GhostCostumeId;
  /** Index into StreetGraph.edges of the current segment. */
  edge: number;
  /** 0..1 position along the edge. */
  t: number;
  /** Travel direction along the edge (+1 or -1). */
  dir: 1 | -1;
  /** Metres per second. */
  speed: number;
  /** Phase offset for hover-bob (radians). */
  phase: number;
  /** Reserved for later per-ghost costumes (uniform now). */
  scale: number;
  /** Reserved for later per-ghost tint (uniform now). */
  tint: number;
}

export interface StreetEdge {
  ax: number; az: number; bx: number; bz: number;
  len: number;
}

export interface StreetGraph {
  edges: StreetEdge[];
  /** Node key -> edge indices meeting at that node. */
  adjacency: Map<string, number[]>;
  /** Edge index -> [nodeKeyA, nodeKeyB]. */
  edgeNodes: Array<[string, string]>;
}

export const GHOST_COUNT = 16;
export const GHOST_MAX = 16;
/** localStorage key for costume ids the player has spoken to. */
export const SPOKEN_GHOSTS_STORAGE_KEY = 'silchester-spoken-ghosts-v1';

const COSTUME_SET: ReadonlySet<string> = new Set(GHOST_COSTUMES);

export function isGhostCostumeId(v: unknown): v is GhostCostumeId {
  return typeof v === 'string' && COSTUME_SET.has(v);
}

/** Parse spoken-to costume ids from storage (tolerates garbage). */
export function parseSpokenCostumeIds(raw: string | null): GhostCostumeId[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter(isGhostCostumeId))];
  } catch {
    return [];
  }
}

function pointInPolygon(x: number, z: number, poly: Array<{ x: number; z: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Quantized node key: endpoints within ~CELL metres share a junction. */
function nodeKey(x: number, z: number, cell = 12): string {
  return `${Math.round(x / cell)}:${Math.round(z / cell)}`;
}

/**
 * Build a walkable graph from town streets. Only segments whose midpoint is
 * inside the wall circuit are kept, so ghosts stay in town (approach roads
 * outside the walls are excluded). Edges shorter than 2m are dropped.
 */
export function buildStreetGraph(plan: TownPlan): StreetGraph {
  const edges: StreetEdge[] = [];
  const adjacency = new Map<string, number[]>();
  const edgeNodes: Array<[string, string]> = [];
  for (const s of plan.streets) {
    const mx = (s.x1 + s.x2) / 2, mz = (s.z1 + s.z2) / 2;
    if (!pointInPolygon(mx, mz, plan.walls)) continue;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (len < 2) continue;
    const idx = edges.length;
    edges.push({ ax: s.x1, az: s.z1, bx: s.x2, bz: s.z2, len });
    const ka = nodeKey(s.x1, s.z1), kb = nodeKey(s.x2, s.z2);
    edgeNodes.push([ka, kb]);
    const la = adjacency.get(ka);
    if (la) la.push(idx); else adjacency.set(ka, [idx]);
    if (kb !== ka) {
      const lb = adjacency.get(kb);
      if (lb) lb.push(idx); else adjacency.set(kb, [idx]);
    }
  }
  return { edges, adjacency, edgeNodes };
}

/** Position of a spec along its edge (metres, town-local). */
export function ghostPosition(spec: GhostSpec, graph: StreetGraph): { x: number; z: number } {
  const e = graph.edges[spec.edge];
  if (!e) return { x: 0, z: 0 };
  const t = Math.max(0, Math.min(1, spec.t));
  return { x: e.ax + (e.bx - e.ax) * t, z: e.az + (e.bz - e.az) * t };
}

/** Heading (radians, yaw convention matching PlayerControls) for a spec. */
export function ghostHeading(spec: GhostSpec, graph: StreetGraph): number {
  const e = graph.edges[spec.edge];
  if (!e) return 0;
  const dx = (e.bx - e.ax) * spec.dir, dz = (e.bz - e.az) * spec.dir;
  return Math.atan2(-dx, -dz);
}

function pickNextEdge(
  graph: StreetGraph, arrivedNode: string, arrivedEdge: number, rand: () => number,
): { edge: number; dir: 1 | -1 } {
  const options = (graph.adjacency.get(arrivedNode) ?? []).filter((i) => graph.edges[i] !== undefined);
  if (!options.length) {
    // Dead end (should be rare inside town): turn around on the same edge.
    return { edge: arrivedEdge, dir: 1 as const };
  }
  // Prefer not to U-turn: 70% avoid the arrival edge when alternatives exist.
  const others = options.filter((i) => i !== arrivedEdge);
  const pool = others.length && rand() < 0.7 ? others : options;
  const next = pool[Math.floor(rand() * pool.length)];
  // Orientation (which end of `next` to start from) is resolved by the
  // caller from the arrival position; same-edge means reverse.
  if (next === arrivedEdge) return { edge: next, dir: 1 as const };
  return { edge: next, dir: 1 as const };
}

/**
 * Deterministic initial specs spread across the graph (seeded rand injected
 * for testability; Game passes Math.random or a mulberry32 instance).
 */
export function createGhostSpecs(graph: StreetGraph, count: number, rand: () => number): GhostSpec[] {
  const specs: GhostSpec[] = [];
  const n = Math.max(0, Math.min(GHOST_MAX, count, graph.edges.length));
  // One of each costume: shuffled roster so the ghosts are all distinct.
  const roster = [...GHOST_COSTUMES];
  for (let i = roster.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [roster[i], roster[j]] = [roster[j], roster[i]];
  }
  for (let i = 0; i < n; i++) {
    const edge = Math.floor(rand() * graph.edges.length);
    specs.push({
      id: `ghost-${i}`,
      costume: roster[i % roster.length],
      edge,
      t: rand(),
      dir: rand() < 0.5 ? 1 : -1,
      speed: 1.2 + rand() * 0.6,
      phase: rand() * Math.PI * 2,
      scale: 0.95 + rand() * 0.1,
      tint: i % roster.length,
    });
  }
  return specs;
}

/**
 * Advance all ghosts by dt seconds. Pure: mutates specs in place, no allocs
 * beyond the loop. At segment ends, chooses a connected edge at the arrival
 * junction (see pickNextEdge).
 */
export function stepGhosts(
  specs: GhostSpec[], graph: StreetGraph, dt: number, rand: () => number,
): void {
  for (const s of specs) stepGhost(s, graph, dt, rand);
}

/** Advance one ghost (lets callers skip held/talking ghosts). */
export function stepGhost(
  s: GhostSpec, graph: StreetGraph, dt: number, rand: () => number,
): void {
  if (!graph.edges.length) return;
  const e = graph.edges[s.edge];
  if (!e) {
    s.edge = Math.floor(rand() * graph.edges.length);
    s.t = 0;
    s.dir = 1;
    return;
  }
  const advance = (s.speed * dt) / Math.max(e.len, 1e-6);
  s.t += advance * s.dir;
  if (s.t < 1 && s.t > 0) return;
  // Arrived at node B (t>=1) or node A (t<=0): pick a connected edge.
  const [ka, kb] = graph.edgeNodes[s.edge];
  const arrivedNode = s.t >= 1 ? kb : ka;
  const arrivedPos = s.t >= 1 ? { x: e.bx, z: e.bz } : { x: e.ax, z: e.az };
  const { edge: next } = pickNextEdge(graph, arrivedNode, s.edge, rand);
  const ne = graph.edges[next];
  if (!ne) {
    s.t = Math.max(0, Math.min(1, s.t));
    s.dir = (s.dir === 1 ? -1 : 1) as 1 | -1;
    return;
  }
  // Orient: start at the endpoint nearest the arrival position.
  const dA = Math.hypot(ne.ax - arrivedPos.x, ne.az - arrivedPos.z);
  const dB = Math.hypot(ne.bx - arrivedPos.x, ne.bz - arrivedPos.z);
  s.edge = next;
  if (dA <= dB) { s.dir = 1; s.t = 0; }
  else { s.dir = -1; s.t = 1; }
}
