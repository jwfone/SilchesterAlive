import * as THREE from 'three';
import { cellRect, getAtlas, type AtlasCell } from './atlas.js';
import { BRICK_TILE_M, MASONRY_TILE_M, wallUniforms } from './wallBake.js';

// Per-pixel atlas tiling for plan-built key buildings.
//
// remapUV() wraps UVs per *vertex*, so a face whose UVs span whole repeats
// collapses (both edges wrap to 0). Here geometry keeps real-world tiling UVs
// (metres / CELL_TILE_M) plus a per-vertex `cellRect` (u0, v0, du, dv); the
// fragment shader wraps with fract() and samples with textureGrad() using the
// unwrapped derivatives, so there are no mip seams at repeat boundaries.
// Same atlas texture, one material -> still one draw call per merged mesh.
// WebGL2 only: the experimental ?webgpu path ignores onBeforeCompile.
//
// Surface styles (uniform, switchable without rebuilding geometry):
//   texture     painted atlas cells
//   procedural  masonry + brick generated per block from world position (no repeats)
//   weathered   procedural + large-scale colour drift, damp/soiled base, eaves staining
//   plain       each surface its cell's average colour (atlas mip 8 = 1 texel per cell)
//   baked       weathered look pre-rendered once into large seamless tiles (wallBake.ts):
//               texture-lookup cost at runtime; only the damp base is computed live
//   hybrid      'High' tier. Walls: weathered look with live block layout (integer hash) and a
//               small baked grain tile sampled at unrelated scales: no visible repeat, a fraction
//               of C's cost. Roofs: generated tegulae and imbrices (roofF): live courses and files,
//               per-tile firing tone, imbrex relief through the lighting normal, lichen and
//               repair patches from the grain tile.
//   hybridLite  'Standard' tier: hybrid without fine grain or streaks on walls, and roofs
//               without fine grain, lichen or repair patches (1 texture read)
//   paintedRoof / paintedRoofLite  hybrid / hybridLite walls with the old painted roof cell:
//               materials-lab baselines only

export type SurfaceStyle = 'texture' | 'procedural' | 'weathered' | 'plain' | 'baked' | 'hybrid' | 'hybridLite' | 'paintedRoof' | 'paintedRoofLite';
const STYLE_ID: Record<SurfaceStyle, number> = { texture: 0, procedural: 1, weathered: 2, plain: 3, baked: 4, hybrid: 5, hybridLite: 6, paintedRoof: 7, paintedRoofLite: 8 };

/** Real-world size (metres, w x h) of one repeat of each cell's painting. */
export const CELL_TILE_M: Record<AtlasCell, [number, number]> = {
  stone: [2, 2], plaster: [2, 2], timber: [2, 2], tile: [3.2, 4],
  street: [4, 4], grass: [4, 4], wood: [2, 2], arena: [4, 4], water: [4, 4],
  masonry: [2, 1.6], plasterPink: [2, 2], dado: [2, 1], signinum: [2, 2],
  mosaic: [1, 1], window: [1, 1], brick: [1, 0.56], flint: [2, 1.6], flintIron: [2, 1.6], flintLime: [2, 1.6],
};

/** cellRect packed as the shader attribute (u0, v0, du, dv). */
export function cellVec(cell: AtlasCell): [number, number, number, number] {
  const r = cellRect(cell);
  return [r.u0, r.v0, r.u1 - r.u0, r.v1 - r.v0];
}

/** Tile courses in each bonding band of a flint wall (chosen in the materials lab; see the forum brief). */
export const FLINT_TILE_COURSES = 2;

let cached: THREE.MeshLambertMaterial | null = null;

/** Shared instance for the game (one material, one program). */
export function getTiledAtlasMaterial(): THREE.MeshLambertMaterial {
  cached ??= createTiledAtlasMaterial();
  return cached;
}

/** Switch a tiled material's surface style (takes effect next frame; no recompile). */
export function setSurfaceStyle(mat: THREE.Material, style: SurfaceStyle): void {
  mat.userData.surfaceStyle = style;
  const u = mat.userData.uniforms as { uStyle: THREE.IUniform<number> } | undefined;
  if (u) u.uStyle.value = STYLE_ID[style];
}

const GLSL_HELPERS = /* glsl */ `
uniform int uStyle;
uniform vec2 uMasonryCell;
uniform vec2 uBrickCell;
uniform vec2 uFlintCell;
uniform vec2 uFlintIronCell;
uniform vec2 uFlintLimeCell;
uniform float uFlintTiles;
uniform vec2 uTileCell;
uniform sampler2D uBakedMasonry;
uniform sampler2D uBakedBrick;
uniform sampler2D uGrain;
varying vec4 vCellRect;
varying float vLocalY;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
// Wall look for the style (the lab baselines 7/8 use hybrid / hybridLite walls).
int wallStyle() { return uStyle == 7 ? 5 : uStyle == 8 ? 6 : uStyle; }
bool isCell(vec2 c) { return all(lessThan(abs(vCellRect.xy - c), vec2(1e-3))); }
// Anti-aliased "inside the unit, away from the mortar joint" factor.
float joint(float f, float len, float mortar, float w) {
  float d = min(f, len - f);
  return smoothstep(mortar - w, mortar + w, d);
}
// Greensand courses (0.2 m) with bands of 3 brick courses every 0.8 m; m = metres (x along, y up).
vec3 masonryAt(vec2 m) {
  float band = floor(m.y / 0.8), yb = m.y - band * 0.8;
  if (m.y < 0.0) yb = mod(m.y, 0.6); // below floor level (footings): Greensand only, no brick band at the foot of the wall
  bool isBrick = yb >= 0.6;
  float ch = isBrick ? 0.2 / 3.0 : 0.2;
  float cy = isBrick ? yb - 0.6 : yb;
  float course = floor(cy / ch);
  float cid = band * 10.0 + (isBrick ? 5.0 + course : course);
  float len = isBrick ? mix(0.38, 0.46, h1(vec2(cid, 1.3))) : mix(0.3, 0.62, h1(vec2(cid, 3.1)));
  float bx = (m.x + h1(vec2(cid, 7.7)) * len) / len;
  float unit = floor(bx);
  // block lengths also vary within a course: stretch each unit by its own factor
  float fx = fract(bx) * len, fy = cy - course * ch;
  float w = fwidth(m.x) + fwidth(m.y);
  float inside = joint(fx, len, isBrick ? 0.01 : 0.016, w) * joint(fy, ch, isBrick ? 0.008 : 0.014, w);
  float r = h1(vec2(unit, cid)), r2 = h1(vec2(cid, unit + 9.0));
  vec3 col;
  if (isBrick) {
    col = mix(vec3(0.52, 0.22, 0.13), vec3(0.74, 0.38, 0.23), r);
    col = mix(col, vec3(0.45, 0.3, 0.24), step(0.9, r2) * 0.6); // the odd over-fired brick
    col *= 0.9 + 0.2 * vnoise(m * vec2(30.0, 60.0));
  } else {
    col = mix(vec3(0.47, 0.47, 0.36), vec3(0.64, 0.62, 0.48), r);
    col = mix(col, vec3(0.56, 0.5, 0.4), r2 * 0.45); // warmer, iron-stained blocks
    col *= 0.86 + 0.28 * vnoise(m * 9.0 + cid);
  }
  vec3 mortar = vec3(0.79, 0.76, 0.69) * (0.9 + 0.1 * vnoise(m * 25.0));
  return mix(mortar, col, inside);
}
// Roman brick (lydion ~0.42 x 0.045 m + mortar) in running bond.
// --- hybrid (F): integer hash instead of sin(); grain from the baked tile ---
float ih(float a, float b) {
  uvec2 q = uvec2(ivec2(int(a), int(b)) + ivec2(65536));
  uint h = (q.x * 1597334677u) ^ (q.y * 3812015801u);
  h ^= h >> 16; h *= 0x85EBCA6Bu; h ^= h >> 13; h *= 0xC2B2AE35u; h ^= h >> 16;
  return float(h) * (1.0 / 4294967295.0);
}
// Block along a course with varied lengths but broken joints (as in the excavation photos):
// joints sit on a grid of mean length L, shifted by 'off' (0 or 0.5 => half-bond with the
// course below) and jittered by up to +/-J*L, so lengths vary block by block and joints of
// neighbouring courses stay at least (0.5 - 2J)*L apart. Returns (block id, x within block, length).
vec3 courseBlock(float x, float L, float off, float J, float salt) {
  float u = x / L - off, k = floor(u);
  float jk = (ih(k, salt) - 0.5) * 2.0 * J, jk1 = (ih(k + 1.0, salt) - 0.5) * 2.0 * J;
  float a = k + jk, b = k + 1.0 + jk1;
  if (u < a) { b = a; k -= 1.0; a = k + (ih(k, salt) - 0.5) * 2.0 * J; }
  else if (u >= b) { a = b; k += 1.0; b = k + 1.0 + (ih(k + 1.0, salt) - 0.5) * 2.0 * J; }
  return vec3(k, (u - a) * L, (b - a) * L);
}
// Brick in a bonding course: lydion-type bricks ~0.44 m on the face, half-bond, the odd reused half brick.
vec3 brickBlock(float x, float course, float salt) {
  vec3 blk = courseBlock(x, 0.44, 0.5 * mod(course, 2.0), 0.05, salt);
  if (ih(blk.x, salt + 51.0) < 0.12) {           // broken brick: two halves
    float h = blk.z * 0.5;
    if (blk.y >= h) { blk.y -= h; blk.x = blk.x * 2.0 + 1.0; } else blk.x = blk.x * 2.0;
    blk.z = h;
  } else blk.x = blk.x * 2.0;
  return blk;
}
vec3 masonryF(vec2 m) {
  // 0.8 m bands, uniform within a wall: 0.6 m of Greensand facing in 5 courses
  // (~0.12 m, heights varying a little) then 3 brick courses of ~0.067 m
  // (4-4.5 cm brick + ~2 cm mortar). Height-only, so bands meet at corners.
  float band = floor(m.y / 0.8), yb = m.y - band * 0.8;
  if (m.y < 0.0) yb = mod(m.y, 0.6); // below floor level (footings): Greensand only, no brick band at the foot of the wall
  bool isBrick = yb >= 0.6;
  float ch, fy, course;
  if (isBrick) {
    ch = 0.2 / 3.0; course = floor((yb - 0.6) / ch); fy = yb - 0.6 - course * ch;
  } else {
    // Course k spans boundaries B(k)..B(k+1); inner boundaries jitter +/-1.5 cm around
    // k * 0.12 (bed joints 0.09-0.15 m apart), outer ones fixed at 0 and 0.6. Only the two
    // boundaries around this pixel are evaluated (no loop over the band).
    float k = min(floor(yb / 0.12), 4.0);
    float b0 = k * 0.12 + (k > 0.0 ? (ih(band, k + 20.0) - 0.5) * 0.03 : 0.0);
    float b1 = k < 4.0 ? (k + 1.0) * 0.12 + (ih(band, k + 21.0) - 0.5) * 0.03 : 0.6;
    if (yb < b0) { k -= 1.0; b1 = b0; b0 = k * 0.12 + (k > 0.0 ? (ih(band, k + 20.0) - 0.5) * 0.03 : 0.0); }
    else if (yb >= b1) { k += 1.0; b0 = b1; b1 = k < 4.0 ? (k + 1.0) * 0.12 + (ih(band, k + 21.0) - 0.5) * 0.03 : 0.6; }
    course = k; ch = b1 - b0; fy = yb - b0;
  }
  float cid = band * 10.0 + (isBrick ? 5.0 + course : course);
  // Greensand blocks: mean 0.22 m (lengths ~0.17-0.27 m, ~1.3-2x course height), half-bond.
  vec3 blk = isBrick ? brickBlock(m.x, course, cid * 7.0 + 3.0)
                     : courseBlock(m.x, 0.22, 0.5 * mod(course, 2.0), 0.12, cid * 7.0 + 3.0);
  float unit = blk.x, fx = blk.y, len = blk.z;
  float px = fwidth(m.x) + fwidth(m.y);
  float inside = joint(fx, len, isBrick ? 0.008 : 0.009, px) * joint(fy, ch, isBrick ? 0.011 : 0.009, px);
  float r = ih(unit, cid), r2 = ih(cid, unit + 9.0);
  // Distance: fade the fine grain out as it drops below a pixel, and hand its contrast
  // to things that stay visible far away (block-to-block tone, 0.4-1.7 m mottling),
  // so distant walls keep texture instead of turning flat and stripy.
  float far = wallStyle() == 6 ? 1.0 : smoothstep(0.015, 0.09, px); // Standard tier: never fine grain
  vec3 col;
  if (isBrick) {
    col = mix(vec3(0.52, 0.22, 0.13), vec3(0.74, 0.38, 0.23), r);
    col = mix(col, vec3(0.45, 0.3, 0.24), step(0.9, r2) * 0.6);
    col *= 0.9 + 0.2 * (far < 1.0 ? mix(texture(uGrain, m * vec2(1.0, 2.0)).g, 0.5, far) : 0.5);
  } else {
    col = mix(vec3(0.47, 0.47, 0.36), vec3(0.64, 0.62, 0.48), r);
    col = mix(col, vec3(0.56, 0.5, 0.4), r2 * 0.45);
    col *= 0.82 + 0.38 * (far < 1.0 ? mix(texture(uGrain, m * 0.9 + vec2(r, r2)).r, 0.47, far) : 0.47); // per-block offset: no two blocks alike
  }
  col *= 1.0 + (r2 - 0.5) * 0.22 * far;                                  // stronger block-to-block tone
  col *= 1.0 + (texture(uGrain, m / 1.7 + 0.13).r - 0.47) * 0.55 * far;   // mid-scale mottling
  vec3 mortar = vec3(0.79, 0.76, 0.69) * (0.9 + 0.1 * (far < 1.0 ? mix(texture(uGrain, m * 0.8).g, 0.5, far) : 0.5));
  return mix(mortar, col, inside);
}
// Flint facing with tile bonding courses (forum-basilica; evidence in docs/key-buildings/forum-basilica.md
// "Wall facing"): 0.6 m of flint nodules in 5 rough courses (~0.12 m, as the town wall's 4-5 flint courses),
// then uFlintTiles courses of brick/tile (~0.067 m each), repeated. Nodules ~0.12-0.22 m long, rounded,
// set in plenty of lime mortar; most show pale grey cortex, some a broken dark face, a few iron-stained.
vec3 flintCourses(vec2 m, float yb, float H, float n, float band, float px, float far, vec3 mortar);
vec3 flintF(vec2 m) {
  float tileH = 0.2 / 3.0, nt = uFlintTiles, bandH = 0.6 + nt * tileH;
  float band = floor(m.y / bandH), yb = m.y - band * bandH;
  if (m.y < 0.0) yb = mod(m.y, 0.6); // footings: flint only
  float px = fwidth(m.x) + fwidth(m.y);
  float far = wallStyle() == 6 ? 1.0 : smoothstep(0.015, 0.09, px);
  vec3 mortar = vec3(0.79, 0.76, 0.69) * (0.9 + 0.1 * (far < 1.0 ? mix(texture(uGrain, m * 0.8).g, 0.5, far) : 0.5));
  if (yb >= 0.6) {
    float course = floor((yb - 0.6) / tileH), fy = yb - 0.6 - course * tileH;
    float cid = band * 10.0 + 5.0 + course;
    vec3 blk = brickBlock(m.x, course, cid * 7.0 + 3.0);
    float inside = joint(blk.y, blk.z, 0.008, px) * joint(fy, tileH, 0.011, px);
    float r = ih(blk.x, cid), r2 = ih(cid, blk.x + 9.0);
    vec3 col = mix(vec3(0.52, 0.22, 0.13), vec3(0.74, 0.38, 0.23), r);
    col = mix(col, vec3(0.45, 0.3, 0.24), step(0.9, r2) * 0.6);
    col *= 0.9 + 0.2 * (far < 1.0 ? mix(texture(uGrain, m * vec2(1.0, 2.0)).g, 0.5, far) : 0.5);
    col *= 1.0 + (r2 - 0.5) * 0.22 * far;
    return mix(mortar, col, inside);
  }
  return flintCourses(m, yb, 0.6, 5.0, band, px, far, mortar);
}
// Rough flint courses filling a band of height H with n courses: bed lines jittered +/-1.5 cm (as masonryF).
// yb = height within the band; band = the band's index (seeds). Shared by flintF and flintIronF.
vec3 flintCourses(vec2 m, float yb, float H, float n, float band, float px, float far, vec3 mortar) {
  float c = H / n;
  float k = min(floor(yb / c), n - 1.0);
  float b0 = k * c + (k > 0.0 ? (ih(band, k + 40.0) - 0.5) * 0.03 : 0.0);
  float b1 = k < n - 1.0 ? (k + 1.0) * c + (ih(band, k + 41.0) - 0.5) * 0.03 : H;
  if (yb < b0) { k -= 1.0; b1 = b0; b0 = k * c + (k > 0.0 ? (ih(band, k + 40.0) - 0.5) * 0.03 : 0.0); }
  else if (yb >= b1) { k += 1.0; b0 = b1; b1 = k < n - 1.0 ? (k + 1.0) * c + (ih(band, k + 41.0) - 0.5) * 0.03 : H; }
  float ch = b1 - b0, fy = yb - b0, cid = band * 10.0 + k;
  vec3 blk = courseBlock(m.x, 0.17, 0.5 * mod(k, 2.0), 0.3, cid * 7.0 + 5.0);
  float r = ih(blk.x, cid), r2 = ih(cid, blk.x + 9.0), r3 = ih(blk.x + 3.0, cid + 17.0);
  // rounded nodule inside its cell; lumpy outline; mortar shows round it
  vec2 q = vec2(blk.y / blk.z, fy / ch) * 2.0 - 1.0;
  q += vec2(r2 - 0.5, r3 - 0.5) * vec2(0.12, 0.22);                 // set a little off-centre: rough courses
  vec2 sc = vec2(0.9 + 0.1 * r, 0.88 + 0.16 * r3);                   // packed tight: thin mortar between
  float ex = mix(1.7, 2.6, r);                                       // knobbly to rounded
  // lumpy, angular outline: two grain scales, strongest near
  float lump = far < 1.0 ? (texture(uGrain, m * 2.6 + vec2(r, r3)).r - 0.47) * 0.4 * (1.0 - far) : 0.0;
  float d = pow(pow(abs(q.x / sc.x), ex) + pow(abs(q.y / sc.y), ex), 1.0 / ex) + lump;
  float wq = px * 2.0 / min(blk.z, ch) + 0.04;                      // soft edge: weathered arrises
  float inside = 1.0 - smoothstep(1.0 - wq, 1.0 + wq, d);
  vec3 col;
  if (r2 < 0.12) col = mix(vec3(0.24, 0.25, 0.28), vec3(0.4, 0.41, 0.44), r);          // broken face: dark blue-grey
  else if (r2 > 0.9) col = mix(vec3(0.6, 0.52, 0.4), vec3(0.7, 0.62, 0.5), r);         // iron-stained cortex
  else col = mix(vec3(0.6, 0.6, 0.57), vec3(0.84, 0.83, 0.78), r);                    // grey to white cortex
  col *= mix(0.84 + 0.2 * (1.0 - d * d), 1.0, far);                                    // rounded: a little darker at the edge
  col *= 0.86 + 0.28 * (far < 1.0 ? mix(texture(uGrain, m * 1.3 + vec2(r, r2)).r, 0.47, far) : 0.47);
  col *= 1.0 + (r - 0.5) * 0.2 * far;                                                  // nodule-to-nodule tone
  col *= 1.0 + (texture(uGrain, m / 1.7 + 0.41).r - 0.47) * 0.45 * far;               // mid-scale mottling
  // at distance the mortar/flint mix reads as one speckled surface: keep it pale and even
  return mix(mortar, col, inside);
}
// Flint with single courses of flat brown ironstone slabs at uneven heights (the amphitheatre's arena wall and
// recesses: "flint and brown ironstone", Fulford 2002; spacing and slabs from site photographs, see
// docs/key-buildings/amphitheatre.md "Wall facing"). Ironstone course k sits at k * 0.5 m +/- 0.12 m (so 0.26-0.74 m
// apart), 5-8 cm thick; slabs 0.25-0.45 m long, brown to buff-grey; rough flint courses (~0.11 m) between.
vec3 flintIronF(vec2 m) {
  float px = fwidth(m.x) + fwidth(m.y);
  float far = wallStyle() == 6 ? 1.0 : smoothstep(0.015, 0.09, px);
  vec3 mortar = vec3(0.79, 0.76, 0.69) * (0.9 + 0.1 * (far < 1.0 ? mix(texture(uGrain, m * 0.8).g, 0.5, far) : 0.5));
  if (m.y < 0.0) return flintCourses(m, mod(m.y, 0.55), 0.55, 5.0, floor(m.y / 0.55) - 50.0, px, far, mortar); // footings: flint only
  // the ironstone course at or below m.y (course k nominally at k * 0.5 m)
  float k = floor(m.y / 0.5) + 1.0, y0 = 0.0;
  for (int i = 0; i < 3; i++) { y0 = k * 0.5 + (ih(k, 61.0) - 0.5) * 0.24; if (y0 <= m.y) break; k -= 1.0; }
  float th = 0.05 + 0.03 * ih(k, 62.0), yNext = (k + 1.0) * 0.5 + (ih(k + 1.0, 61.0) - 0.5) * 0.24;
  float yb = m.y - y0;
  if (k < 1.0) { y0 = 0.0; yb = m.y; th = 0.0; } // flint from the foot up to the first course
  if (yb < th) {
    // slabs: flat, long, uneven lengths; thin joints
    vec3 blk = courseBlock(m.x, 0.34, ih(k, 63.0), 0.3, k * 13.0 + 7.0);
    float inside = joint(blk.y, blk.z, 0.012, px) * joint(yb, th, 0.008, px);
    float r = ih(blk.x, k + 70.0), r2 = ih(k + 71.0, blk.x);
    vec3 col = mix(vec3(0.42, 0.29, 0.18), vec3(0.62, 0.45, 0.28), r);                 // brown ironstone
    col = mix(col, vec3(0.55, 0.5, 0.42), step(0.75, r2) * 0.7);                      // some buff-grey slabs
    // stone, not wood: blotchy iron staining and a darker weathered edge, no streaks
    float blot = far < 1.0 ? (texture(uGrain, m * 2.2 + vec2(r, r2)).g - 0.5) * 0.3 * (1.0 - far) : 0.0;
    float edge = 1.0 - 0.18 * (1.0 - far) * (1.0 - smoothstep(0.0, 0.012, min(yb, th - yb)));
    col *= (0.92 + blot + 0.14 * (far < 1.0 ? mix(texture(uGrain, m * 1.4 + r2).r, 0.47, far) : 0.47)) * edge;
    col *= 1.0 + (r - 0.5) * 0.2 * far;
    return mix(mortar, col, inside);
  }
  float H = yNext - y0 - th, n = max(2.0, floor(H / 0.11 + 0.5));
  return flintCourses(m, yb - th, H, n, k + 100.0, px, far, mortar);
}
// The town wall (docs/key-buildings/town-walls.md "Materials"): flint in 4 or 5 rough courses (0.55 m) then a double
// course of flat slabs (~6.5 cm each) through the wall's thickness, "after every 4-5 flint layers there were double horizontal
// courses of limestone" (Collis 1983); the slabs of mixed stone (C&F 2016; Fulford 2002: limestone from the Bath region; the
// user's photographs: one double course of long brown ironstone slabs, others of thinner grey and grey-brown slabs). Each band
// has a dominant stone, brown ironstone in about 4 bands in 10, grey to buff limestone in the rest, with a third of its slabs
// of the other kinds; slabs 5-9 cm thick, now and then only one course. Bands every 0.68 m, level along the wall (Collis: the
// string courses of two gangs "more or less correspond").
vec3 flintLimeF(vec2 m) {
  float bandH = 0.68;
  float px = fwidth(m.x) + fwidth(m.y);
  float far = wallStyle() == 6 ? 1.0 : smoothstep(0.015, 0.09, px);
  vec3 mortar = vec3(0.79, 0.76, 0.69) * (0.9 + 0.1 * (far < 1.0 ? mix(texture(uGrain, m * 0.8).g, 0.5, far) : 0.5));
  if (m.y < 0.0) return flintCourses(m, mod(m.y, 0.55), 0.55, 5.0, floor(m.y / 0.55) - 50.0, px, far, mortar); // footings
  float band = floor(m.y / bandH), yb = m.y - band * bandH;
  float slabH = 0.05 + 0.04 * ih(band, 83.0), nSlab = ih(band, 84.0) < 0.15 ? 1.0 : 2.0;
  float flintH = bandH - nSlab * slabH;
  if (yb >= flintH) {
    float course = min(floor((yb - flintH) / slabH), nSlab - 1.0), fy = yb - flintH - course * slabH;
    float cid = band * 10.0 + 5.0 + course;
    // long flat slabs, uneven lengths, joints broken against the course below
    vec3 blk = courseBlock(m.x, 0.42, 0.5 * mod(course, 2.0) + 0.25 * ih(band, 81.0), 0.3, cid * 7.0 + 3.0);
    float inside = joint(blk.y, blk.z, 0.012, px) * joint(fy, slabH, 0.009, px);
    float r = ih(blk.x, cid), r2 = ih(cid, blk.x + 9.0);
    bool ironBand = ih(band, 85.0) < 0.4;
    bool iron = r2 < 0.67 ? ironBand : !ironBand;                                          // the band's stone, or another
    vec3 col = iron ? mix(vec3(0.36, 0.24, 0.15), vec3(0.54, 0.37, 0.23), r)               // brown ironstone
                    : mix(vec3(0.44, 0.43, 0.4), vec3(0.64, 0.6, 0.5), r);                // grey to buff limestone
    col = mix(col, vec3(0.4, 0.4, 0.39), step(0.88, ih(blk.x + 5.0, cid)) * 0.7);         // the odd dark weathered slab
    float blot = far < 1.0 ? (texture(uGrain, m * 2.0 + vec2(r, r2)).g - 0.5) * 0.24 * (1.0 - far) : 0.0;
    float edge = 1.0 - 0.16 * (1.0 - far) * (1.0 - smoothstep(0.0, 0.012, min(fy, slabH - fy)));
    col *= (0.93 + blot + 0.12 * (far < 1.0 ? mix(texture(uGrain, m * 1.4 + r2).r, 0.47, far) : 0.47)) * edge;
    col *= 1.0 + (r - 0.5) * 0.18 * far;
    return mix(mortar, col, inside);
  }
  return flintCourses(m, yb, flintH, ih(band, 82.0) < 0.5 ? 4.0 : 5.0, band, px, far, mortar); // 4-5 flint layers
}
vec3 brickF(vec2 m) {
  // All-brick surfaces (piers, quoins): same bricks and joints as the bonding courses.
  float ch = 0.2 / 3.0, course = floor(m.y / ch);
  vec3 blk = brickBlock(m.x, course, course * 7.0 + 11.0);
  float px = fwidth(m.x) + fwidth(m.y);
  float inside = joint(blk.y, blk.z, 0.008, px) * joint(m.y - course * ch, ch, 0.011, px);
  float r = ih(blk.x, course), r2 = ih(course, blk.x + 9.0);
  vec3 col = mix(vec3(0.52, 0.22, 0.13), vec3(0.74, 0.38, 0.23), r);
  col = mix(col, vec3(0.45, 0.3, 0.24), step(0.9, r2) * 0.6);
  float far = wallStyle() == 6 ? 1.0 : smoothstep(0.015, 0.09, px);
  col *= 0.9 + 0.2 * (far < 1.0 ? mix(texture(uGrain, m * vec2(1.0, 2.0)).g, 0.5, far) : 0.5);
  col *= 1.0 + (texture(uGrain, m / 1.7 + 0.29).r - 0.47) * 0.45 * far;
  return mix(vec3(0.8, 0.77, 0.7), col, inside);
}
// --- roofs (hybrid / hybridLite): tegulae and imbrices; sizes and laying in docs/key-buildings/baths.md "Roof tiles" ---
// m = metres: x along the eaves, y up the slope from the eaves line (planBuilding roofPoly);
// y in -2..-0.5 is a tile edge strip (eaves / verge), y < -2 a ridge or hip cap row.
const float RW = 0.36;  // file spacing = tegula breadth (Silchester tegulae 0.35-0.36 m wide)
const float RC = 0.37;  // tegula course: 0.45 m tile less ~0.08 m lap over the tile below
const float RI = 0.33;  // imbrex course: ~0.40 m imbrex less ~0.07 m lap
vec2 gRoofGrad = vec2(0.0); // slope of the tile surface (dh/dx, dh/dy), bent into the lighting normal
bool gRoof = false;
// Tile colour by firing (red Reading-clay fabric; the Insula IX tiles vary with firing).
vec3 tileTone(float r, float r2) {
  vec3 c = mix(vec3(0.54, 0.23, 0.13), vec3(0.68, 0.33, 0.19), r);
  c = mix(c, vec3(0.4, 0.22, 0.17), step(0.94, r2) * 0.6);            // over-fired, purplish brown
  c = mix(c, vec3(0.74, 0.45, 0.28), step(r2, 0.05) * 0.5);           // under-fired, pale orange
  return mix(c, vec3(0.7, 0.58, 0.44), step(0.999, fract(r2 * 97.0)));  // the rare white-firing tile
}
vec3 roofF(vec2 m, bool lite) {
  float px = fwidth(m.x) + fwidth(m.y);
  float far = lite ? 1.0 : smoothstep(0.015, 0.09, px);  // fine grain fades as it drops below a pixel
  // Pattern -> its average once it drops below a few pixels, judged per direction: at grazing
  // angles the up-slope footprint is large while the files across the slope are still sharp.
  float pxX = fwidth(m.x), pxY = fwidth(m.y);
  float flatF = smoothstep(0.09, 0.2, pxX);               // files (0.36 m): imbrices and their shading, held to ~3 px
  float flatY = smoothstep(0.03, 0.1, pxY);               // courses: laps and lower edges
  float relief = 1.0 - smoothstep(0.06, 0.15, pxX);       // bent normals fade a little earlier (no shimmer)
  vec3 col; vec2 grad = vec2(0.0);
  if (m.y < -2.0) {
    // ridge / hip cap: imbrices along the line, each lapping the next (~0.33 m showing)
    float k = floor(m.x / RI), f = m.x - k * RI;
    col = tileTone(ih(k, 701.0), ih(702.0, k)) * (1.0 - 0.4 * (1.0 - smoothstep(0.03, 0.1, pxX)) * smoothstep(RI - 0.025, RI, f));
  } else if (m.y < -0.5) {
    // tile edge: tegula ends (~3 cm) over the shadow under the eaves
    float yy = m.y + 1.0, t = floor(m.x / RW);
    col = mix(vec3(0.16, 0.11, 0.08), tileTone(ih(t, 703.0), ih(704.0, t)) * 0.85, smoothstep(-0.034, -0.03, yy));
  } else {
    float file = floor(m.x / RW + 0.5), dx = m.x - file * RW, ad = abs(dx); // imbrex over the joint at file * RW
    float tf = floor(m.x / RW), course = floor(m.y / RC), fy = m.y - course * RC;
    float ic = floor(m.y / RI), iy = m.y - ic * RI;
    float hw = mix(0.085, 0.07, iy / RI);                 // imbrex half-width, wide end down the slope
    // tegula pan: lower edge rounded (catches the light), step shadow where the next course laps it
    vec3 pan = tileTone(ih(tf, course), ih(course, tf + 9.0));
    float lap = smoothstep(RC - 0.03, RC - 0.004, fy), lip = 1.0 - smoothstep(0.0, 0.014, fy);
    pan *= mix(1.0 - 0.45 * lap, 1.0 - 0.45 * 0.05, flatY);
    // occlusion beside the imbrices: a dark channel at the foot of each, easing out over ~8 cm
    pan *= mix(0.88 * mix(0.38, 1.0, smoothstep(hw - 0.004, hw + 0.06, ad)), 0.8, flatF);
    grad.y = 0.9 * lip * (1.0 - flatY);
    // imbrex: half-round in section (rise ~7 cm), its lapped top end shadowed by the one above
    vec3 imb = tileTone(ih(file, ic + 300.0), ih(ic + 300.0, file)) * mix(1.0 - 0.4 * smoothstep(RI - 0.025, RI - 0.003, iy), 0.97, flatY);
    float on = 1.0 - smoothstep(hw - 0.5 * pxX, hw + 0.5 * pxX, ad);
    float t = min(ad / hw, 0.96), hgt = sqrt(1.0 - t * t);
    imb *= mix(1.14 - 0.55 * t * t, 1.0, flatF);          // crown catches the sky, flanks fall into shade
    vec2 igrad = vec2(-sign(dx) * 0.07 / hw * t / hgt, 0.0);
    grad = mix(grad, igrad, on);
    on = mix(on, 2.0 * 0.078 / RW, flatF);
    col = mix(pan, imb, on);
    // weathering: newer repair patches (whole tiles), lichen (High only: 3 texture reads), grime toward the eaves
    if (!lite) {
      float patchy = smoothstep(0.6, 0.64, texture(uGrain, vec2((tf + 0.5) * RW, (course + 0.5) * RC) / 13.0 + 0.71).b);
      col *= mix(1.0, 1.1, patchy);
      float lich = smoothstep(0.55, 0.75, texture(uGrain, m / 2.3 + 0.2).a) * (1.0 - 0.8 * patchy);
      lich *= mix(smoothstep(0.35, 0.65, texture(uGrain, m * 1.7).r), 0.5, far);
      col = mix(col, mix(vec3(0.6, 0.6, 0.5), vec3(0.66, 0.58, 0.34), texture(uGrain, m / 5.1).g), lich * 0.55);
    }
    col *= mix(0.82, 1.0, smoothstep(0.0, 2.5, m.y));
  }
  if (!lite) col *= 0.88 + 0.24 * mix(texture(uGrain, m * 1.1 + 0.37).r, 0.47, far);
  float drift = lite ? texture(uGrain, m / 9.0).b : texture(uGrain, m / 9.0).b * 0.6 + texture(uGrain, m / 23.0 + 0.37).b * 0.4;
  col *= 0.8 + 0.4 * (0.47 + (drift - 0.47) * 1.5);
  gRoofGrad = grad * relief;
  gRoof = true;
  return col;
}
vec3 brickAt(vec2 m) {
  float ch = 0.07, course = floor(m.y / ch);
  float len = 0.44, bx = (m.x + mod(course, 2.0) * 0.5 * len + h1(vec2(course, 2.0)) * 0.08) / len;
  float unit = floor(bx);
  float w = fwidth(m.x) + fwidth(m.y);
  float inside = joint(fract(bx) * len, len, 0.012, w) * joint(m.y - course * ch, ch, 0.012, w);
  float r = h1(vec2(unit, course));
  vec3 col = mix(vec3(0.52, 0.22, 0.13), vec3(0.74, 0.38, 0.23), r) * (0.9 + 0.2 * vnoise(m * vec2(30.0, 60.0)));
  return mix(vec3(0.8, 0.77, 0.7), col, inside);
}
`;

/** New instance (e.g. per-view clipping planes in the drawings tool). */
export function createTiledAtlasMaterial(params: THREE.MeshLambertMaterialParameters = {}, style: SurfaceStyle = 'texture'): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ ...params, map: getAtlas().texture });
  mat.userData.surfaceStyle = style;
  mat.onBeforeCompile = (shader) => {
    const uniforms = {
      uStyle: { value: STYLE_ID[mat.userData.surfaceStyle as SurfaceStyle] },
      uMasonryCell: { value: new THREE.Vector2(...cellVec('masonry').slice(0, 2)) },
      uBrickCell: { value: new THREE.Vector2(...cellVec('brick').slice(0, 2)) },
      uFlintCell: { value: new THREE.Vector2(...cellVec('flint').slice(0, 2)) },
      uFlintIronCell: { value: new THREE.Vector2(...cellVec('flintIron').slice(0, 2)) },
      uFlintLimeCell: { value: new THREE.Vector2(...cellVec('flintLime').slice(0, 2)) },
      uFlintTiles: { value: (mat.userData.flintTiles as number | undefined) ?? FLINT_TILE_COURSES },
      uTileCell: { value: new THREE.Vector2(...cellVec('tile').slice(0, 2)) },
    };
    Object.assign(shader.uniforms, uniforms, wallUniforms);
    mat.userData.uniforms = uniforms;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec4 cellRect;\nvarying vec4 vCellRect;\nvarying float vLocalY;\nvoid main() {')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vCellRect = cellRect;\n  vLocalY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${GLSL_HELPERS}\nvoid main() {`)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec2 tUv = vMapUv;
  vec4 sampledDiffuseColor;
  if (uStyle == 3) {
    // plain: the cell's average colour (mip 8 of the 1024 atlas = one texel per cell)
    sampledDiffuseColor = textureLod(map, vCellRect.xy + 0.5 * vCellRect.zw, 8.0);
    // stone and brick read better as clean buff / red than as their texture's average
    if (isCell(uMasonryCell)) sampledDiffuseColor = vec4(0.68, 0.64, 0.54, 1.0);
    if (isCell(uBrickCell)) sampledDiffuseColor = vec4(0.66, 0.33, 0.21, 1.0);
    if (isCell(uFlintCell)) sampledDiffuseColor = vec4(0.72, 0.71, 0.66, 1.0);
    if (isCell(uFlintIronCell)) sampledDiffuseColor = vec4(0.7, 0.67, 0.6, 1.0);
    if (isCell(uFlintLimeCell)) sampledDiffuseColor = vec4(0.72, 0.7, 0.63, 1.0);
  } else if ((wallStyle() == 5 || wallStyle() == 6) && isCell(uMasonryCell)) {
    sampledDiffuseColor = vec4(masonryF(tUv * vec2(2.0, 1.6)), 1.0);
  } else if ((wallStyle() == 5 || wallStyle() == 6) && isCell(uFlintCell)) {
    sampledDiffuseColor = vec4(flintF(tUv * vec2(2.0, 1.6)), 1.0);
  } else if ((wallStyle() == 5 || wallStyle() == 6) && isCell(uFlintIronCell)) {
    sampledDiffuseColor = vec4(flintIronF(tUv * vec2(2.0, 1.6)), 1.0);
  } else if ((wallStyle() == 5 || wallStyle() == 6) && isCell(uFlintLimeCell)) {
    sampledDiffuseColor = vec4(flintLimeF(tUv * vec2(2.0, 1.6)), 1.0);
  } else if ((wallStyle() == 5 || wallStyle() == 6) && isCell(uBrickCell)) {
    sampledDiffuseColor = vec4(brickF(tUv * vec2(1.0, 0.56)), 1.0);
  } else if ((uStyle == 5 || uStyle == 6) && isCell(uTileCell)) {
    sampledDiffuseColor = vec4(roofF(tUv * vec2(${CELL_TILE_M.tile[0]}, ${CELL_TILE_M.tile[1]}), uStyle == 6), 1.0);
  } else if (uStyle == 4 && isCell(uMasonryCell)) {
    sampledDiffuseColor = texture(uBakedMasonry, tUv * vec2(${CELL_TILE_M.masonry[0] / MASONRY_TILE_M[0]}, ${CELL_TILE_M.masonry[1] / MASONRY_TILE_M[1]}));
  } else if (uStyle == 4 && isCell(uBrickCell)) {
    sampledDiffuseColor = texture(uBakedBrick, tUv * vec2(${CELL_TILE_M.brick[0] / BRICK_TILE_M[0]}, ${CELL_TILE_M.brick[1] / BRICK_TILE_M[1]}));
  } else if (uStyle >= 1 && isCell(uMasonryCell)) {
    sampledDiffuseColor = vec4(masonryAt(tUv * vec2(2.0, 1.6)), 1.0);
  } else if (uStyle >= 1 && isCell(uBrickCell)) {
    sampledDiffuseColor = vec4(brickAt(tUv * vec2(1.0, 0.56)), 1.0);
  } else {
    vec2 aUv = vCellRect.xy + fract(tUv) * vCellRect.zw;
    sampledDiffuseColor = textureGrad(map, aUv, dFdx(tUv) * vCellRect.zw, dFdy(tUv) * vCellRect.zw);
  }
  if ((wallStyle() == 5 || wallStyle() == 6) && (isCell(uMasonryCell) || isCell(uBrickCell) || isCell(uFlintCell) || isCell(uFlintIronCell) || isCell(uFlintLimeCell))) {
    vec2 m = tUv * (isCell(uBrickCell) ? vec2(1.0, 0.56) : vec2(2.0, 1.6));
    // colour drift from two unrelated scales of the grain tile: no visible period
    float drift = texture(uGrain, m / 11.0).b * 0.6 + texture(uGrain, m / 29.3 + 0.37).b * 0.4;
    drift = 0.47 + (drift - 0.47) * 1.6; // blending two noises flattens contrast: restore it to match C
    sampledDiffuseColor.rgb *= 0.78 + 0.42 * drift;
    float damp = 1.0 - smoothstep(0.0, 0.9, vLocalY);
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * vec3(0.72, 0.76, 0.66), damp * 0.95);
    if (wallStyle() == 5) {
      float streak = texture(uGrain, vec2(m.x / 18.8, 0.31)).g * smoothstep(0.55, 1.0, texture(uGrain, vec2(m.x / 6.67, m.y / 40.0)).a);
      sampledDiffuseColor.rgb *= 1.0 - 0.3 * streak;
    }
  }
  if (uStyle == 4 && (isCell(uMasonryCell) || isCell(uBrickCell))) {
    float damp = 1.0 - smoothstep(0.0, 0.9, vLocalY);              // rising damp: height-dependent, so live
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * vec3(0.72, 0.76, 0.66), damp * 0.95);
  }
  if (uStyle == 2 && (isCell(uMasonryCell) || isCell(uBrickCell))) {
    vec2 m = tUv * (isCell(uMasonryCell) ? vec2(2.0, 1.6) : vec2(1.0, 0.56));
    float drift = fbm(m * 0.35);                                   // metre-scale colour drift
    sampledDiffuseColor.rgb *= 0.78 + 0.42 * drift;
    float damp = 1.0 - smoothstep(0.0, 0.9, vLocalY);              // rising damp / splash zone
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * vec3(0.72, 0.76, 0.66), damp * 0.95);
    float streak = vnoise(vec2(m.x * 1.7, 0.0)) * smoothstep(0.55, 1.0, fbm(vec2(m.x * 0.9, m.y * 0.15)));
    sampledDiffuseColor.rgb *= 1.0 - 0.3 * streak;                 // run-off streaks
  }
  diffuseColor *= sampledDiffuseColor;
#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  {
    // Roof relief: bend the normal by the tile surface's slope (frame from screen derivatives,
    // taken outside the branch so they are defined for every pixel of the quad).
    vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
    vec2 rm = vMapUv * vec2(${CELL_TILE_M.tile[0]}, ${CELL_TILE_M.tile[1]});
    vec2 st0 = dFdx(rm), st1 = dFdy(rm);
    if (gRoof) {
      vec3 q1perp = cross(q1, normal), q0perp = cross(normal, q0);
      vec3 T = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y;
      float det = max(dot(T, T), dot(B, B));
      float sc = det == 0.0 ? 0.0 : inversesqrt(det);
      normal = normalize(normal - sc * (gRoofGrad.x * T + gRoofGrad.y * B));
    }
  }`,
      );
  };
  mat.customProgramCacheKey = () => 'atlas-tiled-v8';
  return mat;
}
