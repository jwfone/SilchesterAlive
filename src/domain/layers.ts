// Show/hide layers for the 3D model (pure, no three.js / DOM imports).
// Categories match the GIS data the model is based on, with one interpretive split:
// Great Plan footprint shades (10-14) become "other buildings", while hand-placed
// interpretive reconstructions (forum, baths, ...) become "key buildings".
// Formerly called "hero buildings" — renamed to "key buildings".
// "footprints" is the flat GIS outline overlay (same rings as the 2D map and the
// basis of the extruded "buildings" massing); it carries no colliders or shadows.

export type LayerId = 'roads' | 'key' | 'buildings' | 'footprints' | 'walls';

export interface LayerMeta {
  id: LayerId;
  /** User-facing label. */
  label: string;
  /** GIS provenance shown in title text. */
  gis: string;
  /** Keyboard shortcut (1-5). */
  shortcut: string;
}

export const LAYERS: LayerMeta[] = [
  { id: 'roads', label: 'Roads', gis: 'GIS 26 roads + 27 drains', shortcut: '1' },
  { id: 'key', label: 'Key buildings', gis: 'interpretive: forum, baths, mansio, temples, church, amphitheatre', shortcut: '2' },
  { id: 'buildings', label: 'Other buildings', gis: 'GIS 10-14 Great Plan shades 1-5 + infill (extruded massing)', shortcut: '3' },
  { id: 'footprints', label: 'Other building footprints', gis: 'GIS 10-14 Great Plan outlines (flat overlay, same rings as 2D map)', shortcut: '4' },
  { id: 'walls', label: 'Town walls & gates', gis: 'GIS 04 wall circuit', shortcut: '5' },
];

export const LAYER_IDS: LayerId[] = LAYERS.map((l) => l.id);

// v3: other buildings (extruded Great Plan massing) start visible. Bumped so a
// previously saved "off" from v2 cannot override the new default.
export const LAYER_STORAGE_KEY = 'silchester-layers-v3';

export function defaultLayerVisibility(): Record<LayerId, boolean> {
  return { roads: true, key: true, buildings: true, footprints: true, walls: true };
}

export function parseLayerVisibility(raw: string | null): Record<LayerId, boolean> {
  const fallback = defaultLayerVisibility();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<LayerId, unknown>>;
    // Strict booleans only: localStorage is attacker-writable (same-origin /
    // extensions), so truthy junk like "yes"/1 must not flip layer state.
    const flag = (v: unknown): boolean => (v === true ? true : v === false ? false : true);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    return {
      roads: flag(parsed.roads),
      key: flag(parsed.key),
      buildings: flag(parsed.buildings),
      // v1 saves lack footprints: default ON so the overlay is visible.
      footprints: parsed.footprints === undefined ? true : flag(parsed.footprints),
      walls: flag(parsed.walls),
    };
  } catch {
    return fallback;
  }
}
