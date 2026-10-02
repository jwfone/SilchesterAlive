// Pure collectible-scan data + placement (no three.js / DOM).
// Sources: assets/collectibles.csv via src/domain/collectibles.generated.ts
// (npm run import:collectibles). Items with explicit x/z stay fixed so they
// can be pinned to exact find-spots later; items without x/z are scattered
// deterministically (seeded) inside the wall circuit.

import { mulberry32 } from './rng.js';
import type { TownPlan } from './townPlan.js';
import { GENERATED_COLLECTIBLES } from './collectibles.generated.js';

export type CollectibleKind = 'site' | 'artefact';

export interface CollectibleSeed {
  id: string;
  title: string;
  caption: string;
  embedSrc: string;
  attributionUrl: string;
  author: string;
  authorUrl: string;
  kind: CollectibleKind;
  x?: number;
  z?: number;
}

export interface PlacedCollectible extends CollectibleSeed {
  x: number;
  z: number;
  /** Discovery radius in metres. */
  radius: number;
}

export const COLLECTIBLE_DEFAULT_RADIUS = 6;
/** localStorage key for collected ids (array of strings). */
export const COLLECTIBLES_STORAGE_KEY = 'silchester-collectibles-v1';
/** Seed for the initial random scatter; bump to reshuffle unpinned items. */
export const COLLECTIBLES_PLACE_SEED = 20260918;

/** Validated seed list: generated CSV rows only (https Sketchfab embeds). */
export function collectibleSeeds(): CollectibleSeed[] {
  const out: CollectibleSeed[] = [];
  for (const g of GENERATED_COLLECTIBLES) {
    if (!g.id || !g.embedSrc) continue;
    let ok = false;
    try {
      const u = new URL(g.embedSrc);
      ok = u.protocol === 'https:' && /(^|\.)sketchfab\.com$/.test(u.hostname);
    } catch { ok = false; }
    if (!ok) continue;
    out.push({
      id: g.id,
      title: g.title || g.id,
      caption: g.caption || '',
      embedSrc: g.embedSrc,
      attributionUrl: g.attributionUrl || g.embedSrc,
      author: g.author || 'Sketchfab',
      authorUrl: g.authorUrl || 'https://sketchfab.com',
      kind: g.kind === 'site' ? 'site' : 'artefact',
      ...(Number.isFinite(g.x) && Number.isFinite(g.z) ? { x: g.x as number, z: g.z as number } : {}),
    });
  }
  return out;
}

function pointInPolygon(x: number, z: number, poly: Array<{ x: number; z: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Place every seed: explicit x/z passes through untouched; the rest are
 * scattered with a seeded RNG inside the walls, kept apart from each other
 * (min separation) and off building centres. Deterministic for the same
 * plan + seed, so the scatter is stable until items get pinned.
 */
export function placeCollectibles(
  seeds: CollectibleSeed[],
  plan: TownPlan,
  seed = COLLECTIBLES_PLACE_SEED,
): PlacedCollectible[] {
  const rand = mulberry32(seed);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const w of plan.walls) {
    if (w.x < minX) minX = w.x; if (w.x > maxX) maxX = w.x;
    if (w.z < minZ) minZ = w.z; if (w.z > maxZ) maxZ = w.z;
  }
  if (!Number.isFinite(minX)) { minX = -300; maxX = 300; minZ = -300; maxZ = 300; }
  const placed: PlacedCollectible[] = [];
  const taken: Array<{ x: number; z: number }> = [];
  const clearOfBuildings = (x: number, z: number): boolean => {
    for (const b of plan.buildings) {
      if (b.outline && b.outline.length >= 3) {
        if (pointInPolygon(x, z, b.outline)) return false;
      } else if (Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3) return false;
    }
    return true;
  };
  for (const s of seeds) {
    if (Number.isFinite(s.x) && Number.isFinite(s.z)) {
      placed.push({ ...s, x: s.x as number, z: s.z as number, radius: COLLECTIBLE_DEFAULT_RADIUS });
      taken.push({ x: s.x as number, z: s.z as number });
      continue;
    }
    let bx = 0, bz = 0, found = false;
    for (let attempt = 0; attempt < 250; attempt++) {
      const x = minX + rand() * (maxX - minX);
      const z = minZ + rand() * (maxZ - minZ);
      if (!pointInPolygon(x, z, plan.walls)) continue;
      if (!clearOfBuildings(x, z)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 30)) continue;
      bx = x; bz = z; found = true;
      break;
    }
    if (!found) { bx = (minX + maxX) / 2; bz = (minZ + maxZ) / 2; }
    placed.push({ ...s, x: bx, z: bz, radius: COLLECTIBLE_DEFAULT_RADIUS });
    taken.push({ x: bx, z: bz });
  }
  return placed;
}

/** Parse collected ids from storage (tolerates garbage). */
export function parseCollectedIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((x): x is string => typeof x === 'string'))];
  } catch {
    return [];
  }
}
