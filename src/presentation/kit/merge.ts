import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// mergeGeometries requires all-indexed or all-non-indexed input and returns
// null on mismatch. Our kit mixes Box/Cylinder/Cone (indexed) with custom
// prisms (non-indexed), so normalize everything to non-indexed first.
// Throws an explicit error instead of failing downstream with a null crash.
export function mergeMixed(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const flat = parts.map(p => (p.index ? p.toNonIndexed() : p));
  const merged = mergeGeometries(flat, false);
  parts.forEach(p => p.dispose());
  flat.forEach(g => {
    if (!parts.includes(g)) g.dispose();
  });
  if (!merged) throw new Error(`kit merge failed: ${label}`);
  return merged;
}
