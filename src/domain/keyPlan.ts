// Curated key-building plans (assets/key-plans/<id>.plan.json): types and frame maths.
// Pure data, no three.js. Plan coordinates: u east-ish, v north-ish (metres) in the
// building's frame; the frame maps them to OSGB and from there to the game's local
// metres (x = E - FORUM_E, z = FORUM_N - N, the same origin scripts/import-gis.mjs uses).

/** OSGB origin of the game's local frame (scripts/import-gis.mjs FORUM_E / FORUM_N). */
export const FORUM_ORIGIN_EN: [number, number] = [464020, 162450];

export type Ev = 'S' | 'C' | 'X';
export type UV = [number, number];

/** A doorway or passage: `oh` is its height, or with `arch` the springing height of a
 * semicircular head rising a further w/2 (gateways, tribunal arches). `y0`: its sill above the
 * floor (a tower door opening onto a platform). */
export interface PlanOpening { at: number; w: number; oh: number; arch?: boolean; y0?: number; conjecture?: boolean; note?: string }
export interface PlanWindow { at: number; w: number; sill: number; head: number; ev?: Ev; note?: string }
export interface PlanWall {
  id: string; a: UV; b: UV; t: number; h: number; ev?: Ev;
  /** `curtain`: a stretch of the town wall's own section (plinth, inner set-off, walk, parapet; see townWall.ts),
   * its field side to the `outer` side of a -> b ('l' = left). */
  kind?: 'stylobate' | 'curtain'; outer?: 'l' | 'r';
  /** Exterior face, reveals and quoins of this wall, instead of the plan's facing ('plasterRed': rendered and painted red). */
  material?: 'stone' | 'brick' | 'plasterRed';
  /** Merlons along the top: a crenellated parapet (tower tops). */
  crenel?: boolean;
  openings?: PlanOpening[]; windows?: PlanWindow[]; note?: string;
}
export interface PlanRoom {
  id: string; name: string; poly: UV[]; floor?: string; finish?: 'exterior';
  vault?: boolean; note?: string;
  /** Raised solid floor (m above the plan's ground), e.g. a temple podium filled with earth: walked as a deck
   * (reached by stairs), and wall faces below it, buried in the fill, are not drawn. */
  floorY?: number;
  /** Plan drawing: label position and relative size (default: polygon centre, 1). */
  labelAt?: UV; labelSize?: number;
  pool?: { poly: UV[]; depth: number; rimT: number };
  labrum?: { c: UV; r: number };
  base?: { poly: UV[]; h: number; note?: string };
  /** Inside wall finish (default: a painted dado to 1 m above the floor, pink plaster above): a dado of Purbeck marble
   * slabs and/or white stucco panels above it. */
  lining?: { dado?: 'painted' | 'purbeck'; upper?: 'plaster' | 'stucco'; ev?: Ev; note?: string };
}
export interface PlanApse {
  id: string; c: UV; r: number; t: number; start: number; end: number; h: number; ev?: Ev;
  roof?: 'semidome' | 'none';
  windows?: Array<{ angle: number; w: number; sill: number; head: number; note?: string }>;
  note?: string;
  /** Distance from the apse centre (its chord) back to the room's wall line, when the
   * surveyed apse is a shallow segment: the gap gets a ceiling, roof and floor. */
  neck?: number;
  /** Raised floor (m above the room floor), e.g. a tribunal; a riser closes its front. */
  floorH?: number;
}
export interface PlanColumns {
  id: string; kind?: 'pier'; d: number; h: number; y0?: number; ev?: Ev;
  at?: UV[]; spacing?: number; on?: string[];
  beam?: boolean | { from: UV; to: UV }; arch?: boolean; note?: string;
}
/** Roofs. `peristyle`: a ring round a court sloping inward (highY at `outer`, lowY at `inner`); `ambulatory`: a ring
 * round a central block sloping outward (highY against `inner`, lowY at `outer`), hipped at the corners; `hip`: a hipped
 * (pyramid, for a square) roof over `poly` from `eaves`. */
export interface PlanRoof {
  id: string; type: 'gable' | 'lean-to' | 'peristyle' | 'ambulatory' | 'hip'; ev?: Ev;
  poly?: UV[]; ridge?: 'u' | 'v'; eaves?: number;
  highSide?: 'n' | 's' | 'e' | 'w'; highY?: number; lowY?: number; closeEnds?: boolean;
  outer?: UV[]; inner?: UV[];
  /** ambulatory / hip: the roof's own axes turned this many degrees (ccw) from the plan's, about its inner block's centre. */
  angleDeg?: number;
}
/** A drawing for the reconstruction viewer: an elevation seen from one side, or a
 * section cut at `at` metres (u for views from e/w, v for views from n/s). */
export interface PlanDrawing { from: 'n' | 's' | 'e' | 'w'; cut?: number; caption: string }

/** A straight wall run a -> b (centreline) of thickness t. */
export interface PlanSeg { a: UV; b: UV; t: number }
/** An opening in the arena wall between two polar angles (degrees ccw from +u about the arena centre). */
export interface ArenaOpening { id: string; from: number; to: number; kind: 'passage' | 'recess'; oh?: number; arch?: boolean }
/**
 * An amphitheatre bowl: an arena sunk below the surrounding ground inside a curved wall, earth banks
 * carrying timber seating, entrance passages through the banks and small recesses off the arena.
 * Heights are metres above the arena floor (the plan's y = 0); the surrounding ground is at `ground`.
 * Distances `d` are measured outward from the wall centreline along the ray from the centre `c`.
 */
export interface PlanArena {
  id: string; c: UV;
  /** Wall centreline as polar samples [degrees ccw from +u, radius], evenly spaced, closed. */
  ring: Array<[number, number]>;
  t: number; h: number; ground: number; floor?: string; ev?: Ev; note?: string;
  openings: ArenaOpening[];
  rail?: { h: number; ev?: Ev; note?: string };
  seating: { rows: number; tread: number; rise: number; ev?: Ev; note?: string };
  /** Earth walk behind the rows (`crest` m wide) and the bank's outer toe (`toe` m from the wall). */
  bank: { crest: number; toe: number; ev?: Ev; note?: string };
  palisade?: { h: number; ev?: Ev; note?: string };
  passages: Array<{ id: string; walls: [PlanSeg, PlanSeg]; ev?: Ev; floor?: string; note?: string }>;
  recesses: Array<{ id: string; c: UV; r: number; t: number; h: number; ev?: Ev; note?: string }>;
  stairs?: Array<{ id: string; angle: number; w: number; ev?: Ev; note?: string }>;
}

/** A flat timber deck at height `y` (a gate's platform, a tower floor): walkable from above, a ceiling below. */
export interface PlanPlatform { id: string; poly: UV[]; y: number; ev?: Ev; note?: string }
/** A straight flight of steps rising from `a` (at y0) to `b` (at y1), `w` wide. */
export interface PlanStair { id: string; a: UV; b: UV; w: number; y0: number; y1: number; ev?: Ev; note?: string }

/** A piece of furniture or sculpture, drawn at the walkable detail level only (except altars, also seen from outside).
 * `at` is its centre on the floor (a plaque: on the wall's face), `y0` the floor it stands on, `facing` the plan
 * bearing its front looks along (degrees anticlockwise from +u: 0 = east in a temple frame), w x d x h its overall
 * width (across the front), depth and height.
 *   statue  a moulded pedestal w x d x h carrying a draped standing figure `figureH` tall (the deity unknown: no
 *           attributes but an offering dish), the pedestal's die faced with an inscribed panel
 *   table   an offering table: a slab on a pier, with two small lamps and a dish on it
 *   plaque  a thin inscribed slab (d thick) fixed to a wall's face at `at`, its centre 1.6 m above its floor `y0`
 *   altar   a stone altar: moulded base and capital, bolsters (pulvini) and a focus on top */
export interface PlanFitting {
  id: string; kind: 'statue' | 'table' | 'plaque' | 'altar';
  at: UV; y0?: number; facing: number; w: number; d: number; h: number;
  figureH?: number;
  material?: 'limestone' | 'greensand' | 'purbeck';
  ev?: Ev; note?: string;
}

/** The town wall's circuit (assets/key-plans/town-wall.json): centreline runs between the gates (game x, z) and counterforts. */
export interface TownWallData {
  runs: Array<Array<[number, number]>>;
  counterforts: Array<{ at: [number, number]; n: [number, number]; len: number; ev: Ev; src?: string }>;
}

export interface BuildingPlan {
  id: string; pitchDeg?: number;
  /** Wall facing: Greensand with brick bands (default, the baths), flint with tile bonding courses, or flint with
   * single courses of brown ironstone at uneven heights (the amphitheatre), or flint with double courses of limestone slabs
   * (the town wall and its gates). */
  facing?: 'greensand' | 'flint' | 'flint-ironstone' | 'flint-limestone';
  /** Display name (viewer title, HUD list). */
  name?: string;
  /** Short date shown, e.g. "c. AD 270–280". */
  dateShown?: string;
  drawings?: PlanDrawing[];
  frame: { originEN: [number, number]; angleDeg: number };
  rooms: PlanRoom[]; walls: PlanWall[]; apses?: PlanApse[]; columns?: PlanColumns[]; roofs?: PlanRoof[];
  arena?: PlanArena;
  platforms?: PlanPlatform[]; stairs?: PlanStair[];
  fittings?: PlanFitting[];
  /** Town gates: where the curtain-wall generator stops (plan points on the wall's centreline), the rampart
   * behind the flanks (polygons), and how the ditch is crossed. */
  curtainEnds?: UV[]; mound?: UV[][]; crossing?: 'bridge' | 'causeway'; crossingEv?: Ev;
}

/** Plan (u, v) -> OSGB (E, N) using the plan frame. */
export function planToEN(plan: BuildingPlan, u: number, v: number): [number, number] {
  const a = (plan.frame.angleDeg * Math.PI) / 180, [oE, oN] = plan.frame.originEN;
  return [oE + u * Math.cos(a) - v * Math.sin(a), oN + u * Math.sin(a) + v * Math.cos(a)];
}

/** Plan (u, v) -> game local metres (x east, z south). */
export function planToWorld(plan: BuildingPlan, u: number, v: number): { x: number; z: number } {
  const [E, N] = planToEN(plan, u, v);
  return { x: E - FORUM_ORIGIN_EN[0], z: FORUM_ORIGIN_EN[1] - N };
}

/** Rotation about +Y that takes plan model space (x = u, z = -v) into the game frame. */
export function planRotationY(plan: BuildingPlan): number {
  return (plan.frame.angleDeg * Math.PI) / 180;
}


/** Game local metres (x east, z south) -> plan (u, v). Inverse of planToWorld. */
export function worldToPlan(plan: BuildingPlan, x: number, z: number): [number, number] {
  const a = (plan.frame.angleDeg * Math.PI) / 180, [oE, oN] = plan.frame.originEN;
  const dE = x + FORUM_ORIGIN_EN[0] - oE, dN = FORUM_ORIGIN_EN[1] - z - oN;
  return [dE * Math.cos(a) + dN * Math.sin(a), -dE * Math.sin(a) + dN * Math.cos(a)];
}
