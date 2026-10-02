import * as THREE from 'three';

// Single procedural texture atlas (no downloads).
// 1024x1024, 4x4 grid of 256px cells. UV origin bottom-left (CanvasTexture flipY default true
// means canvas row 0 (top) is v=1; we compute rects accordingly).
export type AtlasCell =
  | 'stone' | 'plaster' | 'timber' | 'tile'
  | 'street' | 'grass' | 'wood' | 'arena' | 'water';

export interface AtlasRect { u0: number; v0: number; u1: number; v1: number }

const CELLS: Record<AtlasCell, [number, number]> = {
  stone: [0, 0], plaster: [1, 0], timber: [2, 0], tile: [3, 0],
  street: [0, 1], grass: [1, 1], wood: [2, 1], arena: [3, 1],
  water: [0, 2],
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
  // unused cells: mid grey
  ctx.fillStyle = '#808080'; ctx.fillRect(S, S * 2, S * 3, S * 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  const material = new THREE.MeshLambertMaterial({ map: texture });
  cached = { texture, material };
  return cached;
}
