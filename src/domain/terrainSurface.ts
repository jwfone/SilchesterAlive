import { sampleTerrain, type TownPlan } from './townPlan.js';

// The one definition of "ground level". The visible ground mesh is built from this
// surface and every height query (placement, walking, decals) reads the same surface,
// so nothing can float above or sink below what is drawn. Key buildings stand on
// levelled platforms: flat inside a rectangle, ramping back to the natural contours.

/** Axis-aligned rectangle (world metres) that is levelled flat, with a ramp back to natural ground. */
export interface Platform { minX: number; maxX: number; minZ: number; maxZ: number; ramp: number }

export interface TerrainSurface {
  /** Grid lines (ascending, same set for x and z); nodes sit at every pair. */
  coords: number[];
  /** Node heights, row-major: heights[j * coords.length + i] at (coords[i], coords[j]). */
  heights: Float32Array;
  /** Level (metres) each platform was flattened to, in the order given. */
  levels: number[];
  /** Height of the drawn surface at (x, z): the mesh's own triangles, edge-clamped. */
  sample: (x: number, z: number) => number;
}

/** Grid lines closer than this to a platform line are dropped (avoids sliver cells). */
const MIN_LINE_GAP = 2;
/** Beyond this distance from the origin the natural grid is thinned to every other line. */
const FAR_FIELD = 420;

export function buildTerrainSurface(terrain: TownPlan['terrain'], scale: number, platforms: Platform[] = []): TerrainSurface {
  const half = terrain.size / 2;
  const natural = (x: number, z: number): number => sampleTerrain(terrain, x, z) * scale;
  if (!terrain.heights.length) {
    return { coords: [-half, half], heights: new Float32Array(4), levels: platforms.map(() => 0), sample: () => 0 };
  }

  // Natural nodes at the heightfield's own texel centres (plus the clamped edge), so the
  // mesh follows the data instead of resampling it half a cell out.
  const cell = terrain.size / terrain.grid;
  const levels = platforms.map((p) => {
    let sum = 0, n = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { sum += natural(p.minX + ((p.maxX - p.minX) * i) / 8, p.minZ + ((p.maxZ - p.minZ) * j) / 8); n++; }
    return sum / n;
  });
  const platformLines: number[] = [];
  for (const p of platforms) platformLines.push(p.minX - p.ramp, p.minX, p.maxX, p.maxX + p.ramp, p.minZ - p.ramp, p.minZ, p.maxZ, p.maxZ + p.ramp);
  const lines = [...new Set(platformLines.map((v) => Math.round(v * 1000) / 1000))].filter((v) => v > -half && v < half);
  const coarse = [-half, half];
  for (let k = 0; k < terrain.grid; k++) {
    const c = -half + (k + 0.5) * cell;
    if (Math.abs(c) <= FAR_FIELD || k % 2 === 0) coarse.push(c); // far from the town every other line is plenty
  }
  for (const v of coarse) if (v === -half || v === half || lines.every((l) => Math.abs(l - v) >= MIN_LINE_GAP)) lines.push(v);
  const coords = [...new Set(lines)].sort((a, b) => a - b);

  const n = coords.length;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = coords[i], z = coords[j];
      let h = natural(x, z);
      platforms.forEach((p, k) => {
        const d = Math.max(p.minX - x, 0, x - p.maxX, p.minZ - z, 0, z - p.maxZ);
        if (d >= p.ramp) return;
        const t = 1 - d / p.ramp;
        h += (levels[k] - h) * (t * t * (3 - 2 * t));
      });
      heights[j * n + i] = h;
    }
  }

  const find = (v: number): number => {
    let lo = 0, hi = n - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (coords[mid] <= v) lo = mid; else hi = mid - 1; }
    return lo;
  };
  // Cells split along the (x0,z1)-(x1,z0) diagonal; the mesh index buffer uses the same split.
  const sample = (px: number, pz: number): number => {
    const x = Math.min(half, Math.max(-half, px)), z = Math.min(half, Math.max(-half, pz));
    const i = find(x), j = find(z);
    const x0 = coords[i], x1 = coords[i + 1], z0 = coords[j], z1 = coords[j + 1];
    const tx = (x - x0) / (x1 - x0), tz = (z - z0) / (z1 - z0);
    const h00 = heights[j * n + i], h10 = heights[j * n + i + 1], h01 = heights[(j + 1) * n + i], h11 = heights[(j + 1) * n + i + 1];
    return tx + tz <= 1 ? h00 + (h10 - h00) * tx + (h01 - h00) * tz : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  };
  return { coords, heights, levels, sample };
}
