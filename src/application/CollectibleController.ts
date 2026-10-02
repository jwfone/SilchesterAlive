import * as THREE from 'three';
import type { PlacedCollectible } from '../domain/collectibles.js';

export const COLLECTIBLE_COLOR_UNCOLLECTED = 0xffd34d;
export const COLLECTIBLE_COLOR_COLLECTED = 0x3dcc6e;
export const COLLECTIBLE_HEX_UNCOLLECTED = '#ffd34d';
export const COLLECTIBLE_HEX_COLLECTED = '#3dcc6e';

// 3D markers for discoverable 3D scans. Two InstancedMeshes (2 draw calls):
// a gold octahedron while still to find, a green one once collected. A shared
// gold emissive on one mesh would keep found items looking yellow.
export class CollectibleController {
  readonly group = new THREE.Group();
  private uncollectedMesh: THREE.InstancedMesh;
  private collectedMesh: THREE.InstancedMesh;
  private items: PlacedCollectible[] = [];
  private collected = new Set<string>();
  private time = 0;
  private dummy = new THREE.Object3D();
  private groundY: (x: number, z: number) => number;

  constructor(items: PlacedCollectible[], groundY: (x: number, z: number) => number) {
    this.items = items;
    this.groundY = groundY;
    this.group.name = 'collectibles';
    const geo = new THREE.OctahedronGeometry(0.9);
    const n = Math.max(1, items.length);
    this.uncollectedMesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({ color: COLLECTIBLE_COLOR_UNCOLLECTED, emissive: 0x8a6d1f }),
      n,
    );
    this.collectedMesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({ color: COLLECTIBLE_COLOR_COLLECTED, emissive: 0x145a32 }),
      n,
    );
    this.uncollectedMesh.count = items.length;
    this.collectedMesh.count = items.length;
    this.uncollectedMesh.name = 'collectibles-uncollected';
    this.collectedMesh.name = 'collectibles-collected';
    this.uncollectedMesh.frustumCulled = false;
    this.collectedMesh.frustumCulled = false;
    this.syncAll(0, groundY);
    this.group.add(this.uncollectedMesh, this.collectedMesh);
  }

  get placed(): PlacedCollectible[] {
    return this.items;
  }

  isCollected(id: string): boolean {
    return this.collected.has(id);
  }

  setCollected(ids: Iterable<string>): void {
    this.collected = new Set(ids);
    this.syncAll(this.time, this.groundY);
  }

  markCollected(id: string): void {
    this.collected.add(id);
    this.syncAll(this.time, this.groundY);
  }

  /** Idle animation: bob + spin the beacons. Cheap for N < 100. */
  update(dt: number, groundY: (x: number, z: number) => number): void {
    if (!this.items.length) return;
    this.groundY = groundY;
    this.time += dt;
    this.syncAll(this.time, groundY);
  }

  private syncAll(time: number, groundY: (x: number, z: number) => number): void {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const found = this.collected.has(it.id);
      const bob = Math.sin(time * 1.8 + i * 1.7) * 0.25;
      this.dummy.position.set(it.x, groundY(it.x, it.z) + 2.2 + bob, it.z);
      this.dummy.rotation.set(0, time * 0.9 + i, 0);
      const base = (it.kind === 'site' ? 1.5 : 1.0) * (found ? 0.7 : 1.0);
      this.dummy.scale.setScalar(found ? 0 : base);
      this.dummy.updateMatrix();
      this.uncollectedMesh.setMatrixAt(i, this.dummy.matrix);
      this.dummy.scale.setScalar(found ? base : 0);
      this.dummy.updateMatrix();
      this.collectedMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.uncollectedMesh.instanceMatrix.needsUpdate = true;
    this.collectedMesh.instanceMatrix.needsUpdate = true;
  }
}
