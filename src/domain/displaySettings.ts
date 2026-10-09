// "Reconstructed buildings" display setting and quality tiers (pure, no three.js / DOM).
//
// Look (user setting, persisted):
//   auto      pick a quality tier for this device (start-up GPU test, cached per GPU),
//             then step down if frames stay slow near a reconstructed building
//   high      generated weathered stonework (surface style 'hybrid')
//   standard  the same without fine grain and streaks ('hybridLite')
//   plain     flat colour per material
//   evidence  colour by evidence level (Silchester / comparison / conjecture)

export type BuildingLook = 'auto' | 'high' | 'standard' | 'plain' | 'evidence';
export type QualityTier = 'high' | 'standard' | 'plain';

export const BUILDING_LOOKS: BuildingLook[] = ['auto', 'high', 'standard', 'plain', 'evidence'];
export const BUILDING_LOOK_STORAGE_KEY = 'silchester-building-look-v1';
export const AUTO_TIER_STORAGE_KEY = 'silchester-auto-tier-v1';

/** Extra GPU ms for a screen full of High-tier wall above which Auto starts lower. */
export const TIER_LIMITS_MS = { high: 10, standard: 20 };
/** Average frame interval (ms) near a reconstructed building that triggers a step down. */
export const SLOW_FRAME_MS = 50;
/** How long frames must stay slow before stepping down (ms). */
export const SLOW_WINDOW_MS = 3000;

export function parseBuildingLook(raw: string | null): BuildingLook {
  return BUILDING_LOOKS.includes(raw as BuildingLook) ? (raw as BuildingLook) : 'auto';
}

/** Tier for a measured cost (extra ms per frame for a full screen of wall at High). */
export function tierFromBench(extraMs: number): QualityTier {
  if (!Number.isFinite(extraMs) || extraMs <= TIER_LIMITS_MS.high) return 'high';
  return extraMs <= TIER_LIMITS_MS.standard ? 'standard' : 'plain';
}

export function stepDownTier(t: QualityTier): QualityTier {
  return t === 'high' ? 'standard' : 'plain';
}

/** The tier a non-auto look forces (evidence has no tier). */
export function tierForLook(look: BuildingLook, autoTier: QualityTier): QualityTier | null {
  if (look === 'auto') return autoTier;
  if (look === 'evidence') return null;
  return look;
}

/**
 * Cached Auto result, keyed by the GPU it was measured on. Only high / standard are
 * cached: a noisy measurement that landed on plain must not lock the textures out,
 * so plain is re-tested each load (and plain entries stored by older builds are ignored).
 */
export interface AutoTierCache { gpu: string; tier: QualityTier; extraMs: number }

export function parseAutoTierCache(raw: string | null, gpu: string): AutoTierCache | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AutoTierCache>;
    if (v.gpu !== gpu || (v.tier !== 'high' && v.tier !== 'standard')) return null;
    return { gpu, tier: v.tier, extraMs: Number(v.extraMs) || 0 };
  } catch {
    return null;
  }
}
