import * as THREE from 'three';

// Single procedural texture atlas (no downloads).
// 1024x1024, 4x4 grid of 256px cells. UV origin bottom-left (CanvasTexture flipY default true
// means canvas row 0 (top) is v=1; we compute rects accordingly).
export type AtlasCell =
  | 'stone' | 'plaster' | 'timber' | 'tile'
  | 'street' | 'grass' | 'wood' | 'arena' | 'water'
  // Plan-built key buildings (atlasTiled.ts samples these with per-pixel tiling).
  | 'masonry' | 'plasterPink' | 'dado' | 'signinum' | 'mosaic' | 'window' | 'brick';

export interface AtlasRect { u0: number; v0: number; u1: number; v1: number }

const CELLS: Record<AtlasCell, [number, number]> = {
  stone: [0, 0], plaster: [1, 0], timber: [2, 0], tile: [3, 0],
  street: [0, 1], grass: [1, 1], wood: [2, 1], arena: [3, 1],
  water: [0, 2], masonry: [1, 2], plasterPink: [2, 2], dado: [3, 2],
  signinum: [0, 3], mosaic: [1, 3], window: [2, 3], brick: [3, 3],
};

export function cellRect(cell: AtlasCell): AtlasRect {
  const [cx, cy] = CELLS[cell];
  const s = 1 / 4;
  // canvas y down; texture v up with flipY=true
  const u0 = cx * s, u1 = (cx + 1) * s;
  const v1 = 1 - cy * s, v0 = 1 - (cy + 1) * s;
  // inset slightly to avoid bleeding
  const pad = 0.004;
  return { u0: u0 + pad, v0: v0 + pad, u1: u1 - pad, v1: v1 - pad };
}

/** Remap a geometry's 0..1 UVs into an atlas cell, with optional repeat. */
export function remapUV(geo: THREE.BufferGeometry, cell: AtlasCell, repeatX = 1, repeatY = 1): THREE.BufferGeometry {
  const r = cellRect(cell);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i) * repeatX;
    let v = uv.getY(i) * repeatY;
    u = u - Math.floor(u);
    v = v - Math.floor(v);
    uv.setXY(i, r.u0 + u * (r.u1 - r.u0), r.v0 + v * (r.v1 - r.v0));
  }
  uv.needsUpdate = true;
  return geo;
}

function noiseOn(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, n: number, alpha: number, dark: string, light: string): void {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? dark : light;
    ctx.globalAlpha = alpha * (0.5 + Math.random() * 0.5);
    const px = x + Math.random() * s;
    const py = y + Math.random() * s;
    ctx.fillRect(px, py, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  ctx.globalAlpha = 1;
}

function paintStone(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#9a948a'; ctx.fillRect(x, y, s, s);
  // ashlar courses
  ctx.strokeStyle = 'rgba(60,55,48,.55)'; ctx.lineWidth = 2;
  const rows = 6;
  for (let r = 0; r <= rows; r++) {
    const yy = y + (r / rows) * s;
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + s, yy); ctx.stroke();
    for (let c = 0; c < 4; c++) {
      const xx = x + ((c + (r % 2) * 0.5) / 4) * s;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + s / rows); ctx.stroke();
    }
  }
  noiseOn(ctx, x, y, s, 500, 0.25, '#6e695f', '#b7b0a2');
}

function paintPlaster(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#d9c9a8'; ctx.fillRect(x, y, s, s);
  noiseOn(ctx, x, y, s, 350, 0.18, '#b8a67f', '#efe3c8');
}

function paintTimber(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  paintPlaster(ctx, x, y, s);
  ctx.fillStyle = '#5a4128';
  // frame: border + cross beams (Tudor/Roman timber infill look)
  ctx.fillRect(x, y, s, 14);
  ctx.fillRect(x, y + s - 14, s, 14);
  ctx.fillRect(x, y, 14, s);
  ctx.fillRect(x + s - 14, y, 14, s);
  ctx.fillRect(x, y + s / 2 - 7, s, 14);
  ctx.fillRect(x + s / 2 - 7, y, 14, s);
}

function paintTile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#a05a3a'; ctx.fillRect(x, y, s, s);
  // tegula rows + imbrex rounded ridges (vertical shading stripes)
  for (let r = 0; r < 8; r++) {
    const yy = y + (r / 8) * s;
    ctx.fillStyle = 'rgba(60,25,12,.5)'; ctx.fillRect(x, yy, s, 3);
    ctx.fillStyle = 'rgba(255,220,190,.18)'; ctx.fillRect(x, yy + 3, s, 3);
  }
  for (let c = 0; c < 8; c++) {
    const xx = x + (c / 8) * s;
    const grd = ctx.createLinearGradient(xx, 0, xx + s / 8, 0);
    grd.addColorStop(0, 'rgba(0,0,0,.35)');
    grd.addColorStop(0.5, 'rgba(255,230,200,.25)');
    grd.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = grd;
    ctx.fillRect(xx, y, s / 8, s);
  }
}

function paintStreet(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#b89f78'; ctx.fillRect(x, y, s, s);
  noiseOn(ctx, x, y, s, 700, 0.3, '#8a7554', '#d3bf98');
}

function paintGrass(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#5d7247'; ctx.fillRect(x, y, s, s);
  noiseOn(ctx, x, y, s, 700, 0.3, '#43552f', '#75895a');
}

function paintWood(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#6b4e2e'; ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = 'rgba(40,25,12,.6)'; ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(x, y + (i / 6) * s);
    ctx.bezierCurveTo(x + s * 0.3, y + (i / 6) * s + 6, x + s * 0.7, y + (i / 6) * s - 6, x + s, y + (i / 6) * s);
    ctx.stroke();
  }
}

function paintArena(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#c8b088'; ctx.fillRect(x, y, s, s);
  noiseOn(ctx, x, y, s, 500, 0.25, '#9a8262', '#e0cba0');
}

function paintWater(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#2e5f7a'; ctx.fillRect(x, y, s, s);
  // ripple streaks
  ctx.strokeStyle = 'rgba(200,230,240,.35)'; ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const yy = y + Math.random() * s;
    ctx.beginPath(); ctx.moveTo(x + Math.random() * s * 0.5, yy);
    ctx.lineTo(x + s * 0.5 + Math.random() * s * 0.5, yy + (Math.random() - 0.5) * 8);
    ctx.stroke();
  }
  noiseOn(ctx, x, y, s, 200, 0.2, '#1e4256', '#4a8299');
}

// --- Cells for plan-built key buildings. Each tiles seamlessly at the size in
// CELL_TILE_M (atlasTiled.ts), so courses and bands come out at true scale.

// Greensand courses with red brick bonding bands (Silchester baths, 2018/2019
// reports). Cell = 2.0 m wide x 1.6 m tall: two bands of 3 stone courses
// (0.2 m) + 3 brick courses (0.067 m).
function paintMasonry(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#c9c2b0'; ctx.fillRect(x, y, s, s); // mortar
  const pxPerM = s / 1.6;
  let yy = y;
  for (let band = 0; band < 2; band++) {
    for (let c = 0; c < 3; c++) {
      const h = 0.2 * pxPerM;
      const blocks = 5, off = (c % 2) * 0.5;
      for (let b = -1; b < blocks; b++) {
        const bx = x + ((b + off) / blocks) * s;
        const tone = 120 + ((b * 37 + c * 53 + band * 17) % 30);
        ctx.fillStyle = `rgb(${tone - 8},${tone},${tone - 30})`;
        ctx.fillRect(Math.max(x, bx + 1.5), yy + 1.5, Math.min(s / blocks - 3, x + s - bx - 1.5), h - 3);
      }
      yy += h;
    }
    for (let c = 0; c < 3; c++) {
      const h = (0.2 / 3) * pxPerM;
      const bricks = 6, off = (c % 2) * 0.5;
      for (let b = -1; b < bricks; b++) {
        const bx = x + ((b + off) / bricks) * s;
        ctx.fillStyle = (b + c) % 3 === 0 ? '#a24a32' : '#b5583a';
        ctx.fillRect(Math.max(x, bx + 1), yy + 1, Math.min(s / bricks - 2, x + s - bx - 1), h - 2);
      }
      yy += h;
    }
  }
  noiseOn(ctx, x, y, s, 600, 0.18, '#5e5a48', '#e2dccb');
}

// Pink lime plaster (Neronian fine plaster, Ravenglass-style pink render).
function paintPlasterPink(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#e4c3b2'; ctx.fillRect(x, y, s, s);
  noiseOn(ctx, x, y, s, 400, 0.14, '#c99f8c', '#f4dfd2');
}

// Painted dado: dark red with marbled flecks, a cream band at the top edge.
// Cell = 2 m wide x 1 m tall (one dado height).
function paintDado(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#8e3b2c'; ctx.fillRect(x, y, s, s);
  noiseOn(ctx, x, y, s, 500, 0.3, '#5e2219', '#c4705a');
  ctx.fillStyle = '#e9d9b8'; ctx.fillRect(x, y, s, s * 0.06);
  ctx.fillStyle = '#3d1712'; ctx.fillRect(x, y + s * 0.06, s, s * 0.015);
}

// Opus signinum: pink mortar with crushed tile.
function paintSigninum(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#c08a76'; ctx.fillRect(x, y, s, s);
  noiseOn(ctx, x, y, s, 900, 0.45, '#8e4a36', '#e2b9a6');
}

// White chalk tesserae with a black meander-free border grid (1 m cell).
function paintMosaic(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#9d9789'; ctx.fillRect(x, y, s, s);
  const n = 40, t = s / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const edge = i < 2 || j < 2;
      const v = 222 + ((i * 7 + j * 13) % 18);
      ctx.fillStyle = edge ? '#2a2826' : `rgb(${v},${v - 4},${v - 14})`;
      ctx.fillRect(x + i * t + 0.6, y + j * t + 0.6, t - 1.2, t - 1.2);
    }
  }
}

// Glazed window: greenish cast-glass panes in a timber frame (whole window per cell).
function paintWindow(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#4a3624'; ctx.fillRect(x, y, s, s);
  const n = 3, f = s * 0.05, pw = (s - f * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const px = x + f + i * (pw + f), py = y + f + j * (pw + f);
      const g = ctx.createLinearGradient(px, py, px + pw, py + pw);
      g.addColorStop(0, '#5f7f78'); g.addColorStop(0.5, '#39554f'); g.addColorStop(1, '#2a3f3b');
      ctx.fillStyle = g; ctx.fillRect(px, py, pw, pw);
    }
  }
}

// Roman brick (lydion) in running bond. Cell = 1 m wide x 0.56 m tall (8 courses).
function paintBrick(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#cfc4b0'; ctx.fillRect(x, y, s, s);
  const rows = 8, h = s / rows, per = 2.5;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 0.5;
    for (let b = -1; b < per; b++) {
      const bx = x + ((b + off) / per) * s;
      ctx.fillStyle = (b + r) % 3 ? '#b35a3c' : '#9e4a30';
      ctx.fillRect(Math.max(x, bx + 1.5), y + r * h + 1.5, Math.min(s / per - 3, x + s - bx - 1.5), h - 3);
    }
  }
  noiseOn(ctx, x, y, s, 300, 0.15, '#5a2a1a', '#e8b8a0');
}

export interface Atlas {
  texture: THREE.CanvasTexture;
  material: THREE.MeshLambertMaterial;
}

let cached: Atlas | null = null;

export function getAtlas(): Atlas {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const S = 256;
  paintStone(ctx, 0, 0, S); paintPlaster(ctx, S, 0, S); paintTimber(ctx, S * 2, 0, S); paintTile(ctx, S * 3, 0, S);
  paintStreet(ctx, 0, S, S); paintGrass(ctx, S, S, S); paintWood(ctx, S * 2, S, S); paintArena(ctx, S * 3, S, S);
  paintWater(ctx, 0, S * 2, S);
  // Clipped: these tile at cell edges, so overdraw must not bleed into neighbours.
  const clipped = (fn: typeof paintMasonry, cx: number, cy: number): void => {
    ctx.save(); ctx.beginPath(); ctx.rect(cx * S, cy * S, S, S); ctx.clip();
    fn(ctx, cx * S, cy * S, S);
    ctx.restore();
  };
  clipped(paintMasonry, 1, 2); clipped(paintPlasterPink, 2, 2); clipped(paintDado, 3, 2);
  clipped(paintSigninum, 0, 3); clipped(paintMosaic, 1, 3); clipped(paintWindow, 2, 3); clipped(paintBrick, 3, 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  const material = new THREE.MeshLambertMaterial({ map: texture });
  cached = { texture, material };
  return cached;
}
