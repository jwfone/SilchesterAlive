import * as THREE from 'three';
import {
  buildStreetGraph, createGhostSpecs, ghostHeading, ghostPosition, stepGhost,
  type GhostCostumeId, type GhostSpec, type StreetGraph,
} from '../domain/ghosts.js';
import { createGhostMesh } from '../presentation/kit/ghosts.js';
import type { TownPlan } from '../domain/townPlan.js';

// Owns ghost state + meshes. One Mesh per ghost (N<=16: a few extra draws,
// well within budget) so each ghost keeps its own costume geometry.
// Held ghosts (talking) stop walking but keep hovering; mesh <-> spec.id
// mapping supports picking/dialogue.
export class GhostController {
  readonly group = new THREE.Group();
  private specs: GhostSpec[] = [];
  private meshes: THREE.Mesh[] = [];
  private graph: StreetGraph = { edges: [], adjacency: new Map(), edgeNodes: [] };
  private held = new Set<string>();
  private time = 0;
  private visible = true;
  private rand: () => number;

  constructor(plan: TownPlan, count: number, rand: () => number = Math.random) {
    this.rand = rand;
    this.graph = buildStreetGraph(plan);
    this.group.name = 'ghosts';
    this.setCount(count);
  }

  /** (Re)spawn N ghosts spread across the street graph. */
  setCount(count: number): void {
    for (const m of this.meshes) {
      this.group.remove(m);
    }
    this.meshes = [];
    this.specs = createGhostSpecs(this.graph, count, this.rand);
    this.specs.forEach((s, i) => {
      const mesh = createGhostMesh(s.costume);
      mesh.name = s.id;
      mesh.userData.ghostId = s.id;
      mesh.userData.ghostIndex = i;
      mesh.userData.costume = s.costume;
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
    this.group.visible = this.visible && this.meshes.length > 0;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.group.visible = visible && this.meshes.length > 0;
  }

  get count(): number {
    return this.specs.length;
  }

  /** Stop one ghost walking (talk); it keeps hovering in place. */
  hold(id: string): void {
    this.held.add(id);
  }

  release(id: string): void {
    this.held.delete(id);
  }

  isHeld(id: string): boolean {
    return this.held.has(id);
  }

  specById(id: string): GhostSpec | undefined {
    return this.specs.find((s) => s.id === id);
  }

  costumeById(id: string): GhostCostumeId | undefined {
    return this.specById(id)?.costume;
  }

  /**
   * Copy live world x,z into dest as packed pairs. Optional destSpoken[i]
   * is 1 if that ghost's costume is in `spoken`. Returns ghost count.
   * dest must hold at least 2*count floats. No allocations.
   */
  writeXZ(
    dest: Float32Array,
    destSpoken?: Uint8Array,
    spoken?: ReadonlySet<GhostCostumeId>,
  ): number {
    const n = this.meshes.length;
    for (let i = 0; i < n; i++) {
      const p = this.meshes[i].position;
      dest[i * 2] = p.x;
      dest[i * 2 + 1] = p.z;
      if (destSpoken) destSpoken[i] = spoken?.has(this.specs[i].costume) ? 1 : 0;
    }
    return n;
  }

  /**
   * Nearest ghost mesh within `radius` metres of (x,z), or null.
   * Returns the spec id + squared distance (no allocation on miss).
   */
  nearestWithin(x: number, z: number, radius: number): { id: string; dist: number } | null {
    let best: { id: string; dist: number } | null = null;
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      const dx = m.position.x - x, dz = m.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d <= radius && (!best || d < best.dist)) {
        best = { id: this.specs[i].id, dist: d };
      }
    }
    return best;
  }

  /**
   * Advance wander + hover-bob. Held ghosts stay put (still bobbing) and turn
   * to face the player when a player position is supplied. Skipped when hidden.
   */
  update(
    dt: number, groundY: (x: number, z: number) => number, px?: number, pz?: number,
  ): void {
    if (!this.visible || !this.specs.length) return;
    this.time += dt;
    for (let i = 0; i < this.specs.length; i++) {
      const s = this.specs[i];
      const mesh = this.meshes[i];
      const held = this.held.has(s.id);
      if (!held) stepGhost(s, this.graph, dt, this.rand);
      const p = ghostPosition(s, this.graph);
      const bob = Math.sin(this.time * 0.55 + s.phase) * 0.028;
      mesh.position.set(p.x, groundY(p.x, p.z) + 0.35 + bob, p.z);
      if (held && px !== undefined && pz !== undefined) {
        mesh.rotation.set(0, Math.atan2(-(px - p.x), -(pz - p.z)), 0);
      } else {
        mesh.rotation.set(0, ghostHeading(s, this.graph), Math.sin(this.time * 1.4 + s.phase) * 0.06);
      }
      const sc = s.scale;
      mesh.scale.set(sc, sc, sc);
    }
  }
}
