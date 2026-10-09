// Curated key-building plans (assets/key-plans/<id>.plan.json): types and frame maths.
// Pure data, no three.js. Plan coordinates: u east-ish, v north-ish (metres) in the
// building's frame; the frame maps them to OSGB and from there to the game's local
// metres (x = E - FORUM_E, z = FORUM_N - N, the same origin scripts/import-gis.mjs uses).

/** OSGB origin of the game's local frame (scripts/import-gis.mjs FORUM_E / FORUM_N). */
export const FORUM_ORIGIN_EN: [number, number] = [464020, 162450];

export type Ev = 'S' | 'C' | 'X';
export type UV = [number, number];

export interface PlanOpening { at: number; w: number; oh: number; conjecture?: boolean }
export interface PlanWindow { at: number; w: number; sill: number; head: number; ev?: Ev }
export interface PlanWall {
  id: string; a: UV; b: UV; t: number; h: number; ev?: Ev;
  kind?: 'stylobate'; material?: 'stone' | 'brick';
  openings?: PlanOpening[]; windows?: PlanWindow[];
}
export interface PlanRoom {
  id: string; name: string; poly: UV[]; floor?: string; finish?: 'exterior';
  vault?: boolean;
  pool?: { poly: UV[]; depth: number; rimT: number };
  labrum?: { c: UV; r: number };
  base?: { poly: UV[]; h: number };
}
export interface PlanApse {
  id: string; c: UV; r: number; t: number; start: number; end: number; h: number; ev?: Ev;
  roof?: 'semidome' | 'none';
  windows?: Array<{ angle: number; w: number; sill: number; head: number }>;
  /** Distance from the apse centre (its chord) back to the room's wall line, when the
   * surveyed apse is a shallow segment: the gap gets a ceiling, roof and floor. */
  neck?: number;
}
export interface PlanColumns {
  id: string; kind?: 'pier'; d: number; h: number; y0?: number; ev?: Ev;
  at?: UV[]; spacing?: number; on?: string[];
  beam?: boolean | { from: UV; to: UV }; arch?: boolean;
}
export interface PlanRoof {
  id: string; type: 'gable' | 'lean-to' | 'peristyle'; ev?: Ev;
  poly?: UV[]; ridge?: 'u' | 'v'; eaves?: number;
  highSide?: 'n' | 's' | 'e' | 'w'; highY?: number; lowY?: number; closeEnds?: boolean;
  outer?: UV[]; inner?: UV[];
}
export interface BuildingPlan {
  id: string; pitchDeg?: number;
  frame: { originEN: [number, number]; angleDeg: number };
  rooms: PlanRoom[]; walls: PlanWall[]; apses?: PlanApse[]; columns?: PlanColumns[]; roofs?: PlanRoof[];
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
