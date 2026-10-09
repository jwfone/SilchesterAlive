import * as THREE from 'three';

// Bake the generated, weathered wall surfaces once into large seamless tiles,
// so walls cost a plain texture lookup at runtime (style 'baked' in atlasTiled.ts).
//
//   masonry  16 m x 6.4 m  (8 bands of 3 Greensand courses + 3 brick courses)  2048 x 1024 px
//   brick     8 m x 2.24 m (32 courses of 0.07 m)                              1024 x  288 px
//
// Everything in the bake is periodic over the tile: block lengths divide the tile
// width, hashes wrap by unit count, and noise lattices wrap at integer periods.
// Only the damp base (depends on height above ground) is left to the runtime shader.

export interface BakedWalls { masonry: THREE.Texture; brick: THREE.Texture; ms: number; compileMs: number; bytes: number }
export const MASONRY_TILE_M: [number, number] = [16, 6.4];
export const BRICK_TILE_M: [number, number] = [8, 2.24];

let baked: BakedWalls | null = null;
/** Placeholder until baked (1x1 mid stone) so materials can bind a sampler early. */
export const placeholderWallTexture = new THREE.DataTexture(new Uint8Array([170, 162, 138, 255]), 1, 1);
placeholderWallTexture.needsUpdate = true;
export function getBakedWalls(): BakedWalls | null { return baked; }

const BAKE_GLSL = /* glsl */ `
precision highp float;
uniform vec2 uSize;     // tile size in metres
uniform int uKind;      // 0 masonry, 1 brick, 2 grain (data, 1 m tile)
in vec2 vUv;
out vec4 outColor;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// value noise on a lattice that wraps every 'per' cells
float pnoise(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, per), i1 = mod(i + 1.0, per);
  return mix(mix(h1(i0), h1(vec2(i1.x, i0.y)), f.x), mix(h1(vec2(i0.x, i1.y)), h1(i1), f.x), f.y);
}
// fbm in tile units t (0..1), base lattice 'per' cells per tile, doubling per octave
float pfbm(vec2 t, vec2 per) {
  float a = 0.5, s = 0.0;
  for (int k = 0; k < 4; k++) { s += a * pnoise(t * per, per); per *= 2.0; a *= 0.5; }
  return s;
}
float joint(float f, float len, float mortar, float w) { float d = min(f, len - f); return smoothstep(mortar - w, mortar + w, d); }
// noise at 'freq' cycles per metre, wrapped to the tile
float tn(vec2 m, vec2 freq) { vec2 per = floor(uSize * freq + 0.5); return pnoise(m / uSize * per, per); }

vec3 brickColour(float r, float r2, vec2 m) {
  vec3 col = mix(vec3(0.52, 0.22, 0.13), vec3(0.74, 0.38, 0.23), r);
  col = mix(col, vec3(0.45, 0.3, 0.24), step(0.9, r2) * 0.6);
  return col * (0.9 + 0.2 * tn(m, vec2(30.0, 60.0)));
}
vec3 masonry(vec2 m) {
  float band = floor(m.y / 0.8), yb = m.y - band * 0.8;
  bool isBrick = yb >= 0.6;
  float ch = isBrick ? 0.2 / 3.0 : 0.2;
  float cy = isBrick ? yb - 0.6 : yb;
  float course = floor(cy / ch);
  float cid = band * 10.0 + (isBrick ? 5.0 + course : course);
  float len0 = isBrick ? mix(0.38, 0.46, h1(vec2(cid, 1.3))) : mix(0.3, 0.62, h1(vec2(cid, 3.1)));
  float n = max(1.0, floor(uSize.x / len0 + 0.5)), len = uSize.x / n;   // whole units per tile
  float bx = (m.x + h1(vec2(cid, 7.7)) * len) / len;
  float unit = mod(floor(bx), n);
  float fx = fract(bx) * len, fy = cy - course * ch;
  float w = 0.6 / 128.0; // ~half a texel at 128 px/m
  float inside = joint(fx, len, isBrick ? 0.01 : 0.016, w) * joint(fy, ch, isBrick ? 0.008 : 0.014, w);
  float r = h1(vec2(unit, cid)), r2 = h1(vec2(cid, unit + 9.0));
  vec3 col;
  if (isBrick) col = brickColour(r, r2, m);
  else {
    col = mix(vec3(0.47, 0.47, 0.36), vec3(0.64, 0.62, 0.48), r);
    col = mix(col, vec3(0.56, 0.5, 0.4), r2 * 0.45);
    col *= 0.86 + 0.28 * tn(m + cid, vec2(10.0, 10.0));
  }
  vec3 mortar = vec3(0.79, 0.76, 0.69) * (0.9 + 0.1 * tn(m, vec2(25.0, 25.0)));
  return mix(mortar, col, inside);
}
vec3 brick(vec2 m) {
  float ch = 0.07, course = floor(m.y / ch);
  float n = floor(uSize.x / 0.44 + 0.5), len = uSize.x / n;
  float bx = (m.x + mod(course, 2.0) * 0.5 * len) / len;
  float unit = mod(floor(bx), n);
  float w = 0.6 / 128.0;
  float inside = joint(fract(bx) * len, len, 0.012, w) * joint(m.y - course * ch, ch, 0.012, w);
  return mix(vec3(0.8, 0.77, 0.7), brickColour(h1(vec2(unit, course)), h1(vec2(course, unit + 9.0)), m), inside);
}
void main() {
  vec2 m = vUv * uSize, t = vUv;
  if (uKind == 2) {
    // grain tile for the hybrid style: four independent tileable noises
    outColor = vec4(pfbm(t, vec2(8.0)), pnoise(t * 32.0, vec2(32.0)), pfbm(t, vec2(4.0)), pfbm(t, vec2(6.0)));
    return;
  }
  vec3 col = uKind == 0 ? masonry(m) : brick(m);
  // weathering that tiles: metre-scale colour drift + run-off streaks
  col *= 0.78 + 0.42 * pfbm(t, floor(uSize * vec2(0.375, 0.3125) + 0.5));
  float streak = pnoise(vec2(t.x * floor(uSize.x * 1.75 + 0.5), 0.5), vec2(floor(uSize.x * 1.75 + 0.5), 1.0))
    * smoothstep(0.55, 1.0, pfbm(t, vec2(floor(uSize.x + 0.5), 2.0)));
  col *= 1.0 - 0.3 * streak;
  outColor = vec4(col, 1.0);
}`;

let compileMs = 0;
function bakeOne(renderer: THREE.WebGLRenderer, kind: 0 | 1 | 2, size: [number, number], w: number, h: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false,
  });
  rt.texture.colorSpace = kind === 2 ? THREE.NoColorSpace : THREE.SRGBColorSpace; // grain is data, not colour
  rt.texture.anisotropy = 4;
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: 'out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BAKE_GLSL,
    uniforms: { uSize: { value: new THREE.Vector2(...size) }, uKind: { value: kind } },
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.Camera();
  const prev = renderer.getRenderTarget();
  const c0 = performance.now();
  renderer.compile(scene, cam); // separate the one-off shader compile from the draw
  const gl = renderer.getContext();
  gl.finish();
  compileMs += performance.now() - c0;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  quad.geometry.dispose(); mat.dispose();
  return rt;
}

/** Bake once (idempotent). ~2.3 M pixels of shader work plus mipmaps; returns timing and GPU bytes. */
export function bakeWallTextures(renderer: THREE.WebGLRenderer): BakedWalls {
  if (baked) return baked;
  const t0 = performance.now();
  const m = bakeOne(renderer, 0, MASONRY_TILE_M, 2048, 1024);
  const b = bakeOne(renderer, 1, BRICK_TILE_M, 1024, 288);
  // force completion so the timing is real
  const gl = renderer.getContext(), px = new Uint8Array(4);
  renderer.setRenderTarget(b); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); renderer.setRenderTarget(null);
  const bytes = Math.round((2048 * 1024 + 1024 * 288) * 4 * (4 / 3)); // RGBA8 + mip chain
  const r1 = (x: number): number => Math.round(x * 10) / 10;
  baked = { masonry: m.texture, brick: b.texture, ms: r1(performance.now() - t0 - compileMs), compileMs: r1(compileMs), bytes };
  wallUniforms.uBakedMasonry.value = m.texture;
  wallUniforms.uBakedBrick.value = b.texture;
  return baked;
}

/** Shared sampler uniforms for every tiled material; the bake functions fill them in. */
export const wallUniforms = {
  uBakedMasonry: { value: placeholderWallTexture as THREE.Texture },
  uBakedBrick: { value: placeholderWallTexture as THREE.Texture },
  uGrain: { value: placeholderWallTexture as THREE.Texture },
};

let grain: { texture: THREE.Texture; ms: number; bytes: number } | null = null;
/** Bake the hybrid style's small grain tile once (512 x 512 data, ~1.4 MB with mips). */
export function bakeGrainTexture(renderer: THREE.WebGLRenderer): { texture: THREE.Texture; ms: number; bytes: number } {
  if (grain) return grain;
  const t0 = performance.now(), c0 = compileMs;
  const rt = bakeOne(renderer, 2, [1, 1], 512, 512);
  const gl = renderer.getContext(), px = new Uint8Array(4);
  renderer.setRenderTarget(rt); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); renderer.setRenderTarget(null);
  grain = { texture: rt.texture, ms: Math.round((performance.now() - t0 - (compileMs - c0)) * 10) / 10, bytes: Math.round(512 * 512 * 4 * (4 / 3)) };
  wallUniforms.uGrain.value = rt.texture;
  return grain;
}
