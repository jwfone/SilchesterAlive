import * as THREE from 'three';
import type { Collider } from './WorldBuilder.js';

export interface CircleCollider { x: number; z: number; r: number }

/** Movement input source: arrows + WASD/mouse look, or touch D-pad + drag look. */
export type ControlMode = 'desktop' | 'touch';

/** D-pad direction ids used by the touch overlay. */
export type TouchDir = 'forward' | 'back' | 'left' | 'right';
/** GIS footprint extrusion: collide with the polygon, not its OBB AABB. */
export interface PolyCollider {
  outline: Array<{ x: number; z: number }>;
  holes?: Array<Array<{ x: number; z: number }>>;
  minX: number; maxX: number; minZ: number; maxZ: number;
}
export interface EllipseBand {
  x: number; z: number;
  rxO: number; rzO: number;   // outer seating edge
  rxI: number; rzI: number;   // inner arena edge
  gapHalfAngle: number;       // entrance corridors around angle 0 / PI are walkable
}

export function pointInRing(x: number, z: number, ring: Array<{ x: number; z: number }>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, zi = ring[i].z, xj = ring[j].x, zj = ring[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSeg2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-12) {
    const ex = px - ax, ez = pz - az;
    return ex * ex + ez * ez;
  }
  let u = ((px - ax) * dx + (pz - az) * dz) / l2;
  if (u < 0) u = 0; else if (u > 1) u = 1;
  const ex = px - (ax + dx * u), ez = pz - (az + dz * u);
  return ex * ex + ez * ez;
}

function nearRing(x: number, z: number, r: number, ring: Array<{ x: number; z: number }>): boolean {
  const r2 = r * r;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (distToSeg2(x, z, ring[j].x, ring[j].z, ring[i].x, ring[i].z) < r2) return true;
  }
  return false;
}

/** True when a circle at (x,z) overlaps the extruded GIS footprint. */
export function hitsPoly(x: number, z: number, r: number, poly: PolyCollider): boolean {
  if (x + r < poly.minX || x - r > poly.maxX || z + r < poly.minZ || z - r > poly.maxZ) return false;
  const inOuter = pointInRing(x, z, poly.outline);
  let inHole = false;
  for (const hole of poly.holes ?? []) {
    if (pointInRing(x, z, hole)) { inHole = true; break; }
  }
  if (inOuter && !inHole) return true;
  if (nearRing(x, z, r, poly.outline)) return true;
  for (const hole of poly.holes ?? []) {
    if (nearRing(x, z, r, hole)) return true;
  }
  return false;
}

// Minimal kinematic first-person controller (no physics engine).
// XZ collision: AABB list (axis-separated) + GIS polygons + circle push-out + amphitheatre seating band.
export class PlayerControls {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = Math.PI; // face north by default (toward forum from south gate)
  private pitch = 0;
  private keys = new Set<string>();
  private touchDirs = new Set<TouchDir>();
  private touchRun = false;
  private controlMode: ControlMode = 'desktop';
  private lookPointerId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private jumpQueued = false;
  private suppressJump = false;
  private grounded = true;
  vel = new THREE.Vector3();
  eyeHeight = 1.7;
  walkSpeed = 9;
  runSpeed = 18;
  /** Peak hop is v²/(2g) ≈ 2.3m, enough to clear the baths pool rim. */
  jumpSpeed = 10;
  /** Downward acceleration while airborne, metres per second squared. */
  gravity = 22;
  radius = 0.5;
  /** Drag-look gain for touch (higher than mouse: fingers cover fewer px). */
  touchLookSpeed = 0.0045;
  /** Drag-look gain for a free mouse (pointer lock uses the same scale). */
  mouseLookSpeed = 0.0022;
  /** WASD orbit speed, radians per second. */
  keyLookSpeed = 2.2;

  constructor(camera: THREE.PerspectiveCamera, private dom: HTMLElement) {
    this.camera = camera;
    window.addEventListener('keydown', e => {
      const typing = e.target instanceof HTMLInputElement
        || e.target instanceof HTMLTextAreaElement
        || e.target instanceof HTMLSelectElement;
      if (typing) return;
      this.keys.add(e.code);
      // Arrows walk; Space jumps. Stop both scrolling the page behind the canvas.
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space') {
        e.preventDefault();
      }
      if (e.code === 'Space' && !e.repeat) {
        if (this.suppressJump) this.suppressJump = false;
        else this.jumpQueued = true;
      }
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.suppressJump = false;
    });
    // Stuck-key guard: if keyup is missed across a focus/pointer-lock
    // transition (e.g. a dialogue freeing the mouse mid-stride), the player
    // would otherwise glide without input. Blurring always drops keys.
    window.addEventListener('blur', () => this.clearKeys());
    // Optional FPS look if something else captures the pointer. Desktop
    // defaults to a free cursor: WASD orbits, and drag-look is below.
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement == null) return;
      this.applyLook(-e.movementX * this.mouseLookSpeed, -e.movementY * this.mouseLookSpeed);
    });
    // Drag-look (orbit): pointer on the 3D canvas turns the view. The mouse
    // stays free (no pointer lock). The D-pad overlay is separate DOM so it
    // never starts a look-drag. touch-action:none lets us receive pointermove
    // without the page scrolling.
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => {
      if (this.lookPointerId !== null) return; // single-pointer look only
      if (document.pointerLockElement) return;
      if (e.button !== 0) return;
      this.lookPointerId = e.pointerId;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      try { this.dom.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookPointerId) return;
      const dx = e.clientX - this.lookLastX;
      const dy = e.clientY - this.lookLastY;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      const speed = e.pointerType === 'touch' ? this.touchLookSpeed : this.mouseLookSpeed;
      this.applyLook(-dx * speed, -dy * speed);
    });
    const endLook = (e: PointerEvent): void => {
      if (e.pointerId === this.lookPointerId) this.lookPointerId = null;
    };
    dom.addEventListener('pointerup', endLook);
    dom.addEventListener('pointercancel', endLook);
    dom.addEventListener('lostpointercapture', endLook);
  }

  get isLocked(): boolean { return document.pointerLockElement != null; }

  get mode(): ControlMode { return this.controlMode; }

  /** True while any walk input (arrows / D-pad) is held. Look (WASD / drag) does not count. */
  get hasMoveInput(): boolean {
    if (this.touchDirs.size > 0) return true;
    return this.keys.has('ArrowUp') || this.keys.has('ArrowDown') || this.keys.has('ArrowLeft') || this.keys.has('ArrowRight');
  }

  setControlMode(mode: ControlMode): void {
    this.controlMode = mode;
    if (mode === 'desktop') this.clearTouch();
    else this.lookPointerId = null;
  }

  /** D-pad overlay drives these (press-and-hold; several dirs may be held). */
  setTouchDir(dir: TouchDir, pressed: boolean): void {
    if (pressed) this.touchDirs.add(dir);
    else this.touchDirs.delete(dir);
  }

  setTouchRun(run: boolean): void { this.touchRun = run; }

  /** Drop all held movement keys (stuck-key guard for focus transitions). */
  clearKeys(): void {
    this.keys.clear();
    this.jumpQueued = false;
    this.suppressJump = false;
  }

  /** Drop a pending Space jump (e.g. the key that dismissed the start overlay). */
  suppressPendingJump(): void {
    this.jumpQueued = false;
    this.keys.delete('Space');
    this.suppressJump = true;
  }

  clearTouch(): void {
    this.touchDirs.clear();
    this.touchRun = false;
    this.lookPointerId = null;
  }

  /** Ask the browser to capture the mouse. Safe to call repeatedly; failures
   * (e.g. ESC cooldown, unsupported) are swallowed — caller polls isLocked. */
  requestLock(): void {
    if (this.isLocked) return;
    try {
      const el = this.dom as HTMLElement & { requestPointerLock: () => Promise<void> | void };
      const ret = el.requestPointerLock();
      if (ret && typeof (ret as Promise<void>).catch === 'function') {
        (ret as Promise<void>).catch(() => { /* user must click again */ });
      }
    } catch { /* cooldown or unsupported — user clicks again */ }
  }

  spawn(x: number, z: number, yaw: number): void {
    this.camera.position.set(x, this.eyeHeight, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.jumpQueued = false;
    this.suppressJump = false;
  }

  update(dt: number, boxes: Collider[], circles: CircleCollider[] = [], bands: EllipseBand[] = [], groundY: (x: number, z: number) => number = () => 0, polys: PolyCollider[] = []): void {
    this.applyKeyLook(dt);
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchRun;
    const speed = run ? this.runSpeed : this.walkSpeed;
    const keyF = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    const keyS = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const touchF = (this.touchDirs.has('forward') ? 1 : 0) - (this.touchDirs.has('back') ? 1 : 0);
    const touchS = (this.touchDirs.has('right') ? 1 : 0) - (this.touchDirs.has('left') ? 1 : 0);
    const f = Math.max(-1, Math.min(1, keyF + touchF));
    const s = Math.max(-1, Math.min(1, keyS + touchS));
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward is (-sin, -cos) for yaw convention
    let mx = (-sin * f + cos * s);
    let mz = (-cos * f - sin * s);
    const len = Math.hypot(mx, mz) || 1;
    mx = (mx / len) * speed * dt * (f || s ? 1 : 0);
    mz = (mz / len) * speed * dt * (f || s ? 1 : 0);

    const p = this.camera.position;
    this.applyJump(dt, groundY(p.x, p.z) + this.eyeHeight);
    const clearance = p.y - this.eyeHeight - groundY(p.x, p.z);
    this.tryMoveBox(p, mx, 0, boxes, polys, clearance);
    this.tryMoveBox(p, 0, mz, boxes, polys, clearance);
    this.resolveCircles(p, circles);
    this.resolveBands(p, bands);

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  /** WASD orbits yaw/pitch. Desktop-only; touch look is drag on the canvas. */
  private applyKeyLook(dt: number): void {
    if (this.controlMode !== 'desktop') return;
    const yaw = (this.keys.has('KeyA') ? 1 : 0) - (this.keys.has('KeyD') ? 1 : 0);
    const pitch = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    if (!yaw && !pitch) return;
    this.applyLook(yaw * this.keyLookSpeed * dt, pitch * this.keyLookSpeed * dt);
  }

  /** Space hops while grounded; gravity pulls the camera back to eye height. */
  private applyJump(dt: number, floorY: number): void {
    const p = this.camera.position;
    if (this.jumpQueued && this.grounded) {
      this.vel.y = this.jumpSpeed;
      this.grounded = false;
    }
    this.jumpQueued = false;
    if (this.grounded) {
      p.y = floorY;
      this.vel.y = 0;
      return;
    }
    this.vel.y -= this.gravity * dt;
    p.y += this.vel.y * dt;
    if (p.y <= floorY) {
      p.y = floorY;
      this.vel.y = 0;
      this.grounded = true;
    }
  }

  private applyLook(dyaw: number, dpitch: number): void {
    this.yaw += dyaw;
    this.pitch += dpitch;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  private tryMoveBox(p: THREE.Vector3, dx: number, dz: number, boxes: Collider[], polys: PolyCollider[], clearance: number): void {
    const nx = p.x + dx, nz = p.z + dz;
    const r = this.radius;
    for (const c of boxes) {
      if (c.h != null && clearance >= c.h) continue; // jumping over a short wall
      if (nx + r > c.minX && nx - r < c.maxX && nz + r > c.minZ && nz - r < c.maxZ) {
        // Already overlapping (landed on a thin rim): allow walking out.
        if (p.x + r > c.minX && p.x - r < c.maxX && p.z + r > c.minZ && p.z - r < c.maxZ) continue;
        return;
      }
    }
    for (const poly of polys) {
      if (hitsPoly(nx, nz, r, poly)) return;
    }
    p.x = nx; p.z = nz;
  }

  private resolveCircles(p: THREE.Vector3, circles: CircleCollider[]): void {
    for (const c of circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const dist = Math.hypot(dx, dz);
      const min = c.r + this.radius;
      if (dist < min && dist > 1e-4) {
        p.x = c.x + (dx / dist) * min;
        p.z = c.z + (dz / dist) * min;
      }
    }
  }

  private resolveBands(p: THREE.Vector3, bands: EllipseBand[]): void {
    for (const b of bands) {
      const dx = p.x - b.x, dz = p.z - b.z;
      // entrance corridors along ±x: walkable if close to the axis
      const ang = Math.atan2(dz / Math.max(b.rzO, 1), dx / Math.max(b.rxO, 1));
      const dAxis = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
      const dAxisW = Math.abs(Math.atan2(Math.sin(ang - Math.PI), Math.cos(ang - Math.PI)));
      if (Math.min(dAxis, dAxisW) < b.gapHalfAngle && Math.abs(dz) < 3.5) continue;
      const eO = (dx * dx) / (b.rxO * b.rxO) + (dz * dz) / (b.rzO * b.rzO);
      const eI = (dx * dx) / (b.rxI * b.rxI) + (dz * dz) / (b.rzI * b.rzI);
      if (eO < 1 && eI > 1) {
        // inside seating band: push to whichever edge is nearer
        if (eO > 0.55) {
          // push outward
          const s = 1 / Math.sqrt(Math.max(eO, 1e-6)) + 0.02;
          p.x = b.x + dx * s;
          p.z = b.z + dz * s;
        } else {
          // push inward to arena
          const s = 1 / Math.sqrt(Math.max(eI, 1e-6)) - 0.02;
          p.x = b.x + dx * s;
          p.z = b.z + dz * s;
        }
      }
    }
  }
}
