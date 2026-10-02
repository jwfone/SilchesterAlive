import * as THREE from 'three';
import { mergeMixed } from './merge.js';
import type { GhostCostumeId } from '../../domain/ghosts.js';

// Period costumes for Calleva ghosts: procedural low-poly figures built from
// primitives (<800 tris each), one cached geometry per costume. All parts
// carry vertex colors; a single shared translucent material renders them, so
// the sixteen ghosts cost 16 draws total and stay ghostlike (pale + transparent)
// while reading as distinct figures:
//   soldier    — galea + crest, banded cuirass, scutum, gladius
//   magistrate — lathe toga, purple clavus, scroll across the chest
//   matron     — flared stola, draped palla (not a cone), bun, market basket
//   labourer   — short belted tunic, flat pileus, hod of tiles
//   traveller  — hooded paenula, satchel, amphora
//   briton     — warm wool, bracae, cloak + brooch, bronze torc, staff
//   swineherd  — muddy tunic, leg-wraps, hood, spear + pig bell (post-Roman)
//   fieldwife  — dull-green kirtle, white wimple, sickle + basket (medieval)
//   child      — short small figure, satchel, hoop (Roman boy)
//   coiner     — leather apron, hammer + coin die (Iron Age mint)
//   priestess  — cream robe, red sash, offering bowl (Romano-British temple)
//   lucco      — russet cloak, bracae, message bag, riding crop
//   junia      — ochre ankle dress, headcloth, tally rods, small oil jug
//   enica      — short plum tunic, distaff, wool skein
//   elen       — short girl, faded blue tunic, rag doll
//   bassa      — woodland tunic, soft cap, leash, hound at heel

const COSTUME_ORDER: GhostCostumeId[] = [
  'soldier', 'magistrate', 'matron', 'labourer', 'traveller', 'briton',
  'swineherd', 'fieldwife', 'child', 'coiner', 'priestess',
  'lucco', 'junia', 'enica', 'elen', 'bassa',
];

/** Short speaker labels for dialogue ("Legionary ghost says: …"). */
export const GHOST_COSTUME_LABELS: Record<GhostCostumeId, string> = {
  soldier: 'Legionary ghost',
  magistrate: 'Magistrate ghost',
  matron: 'Matron ghost',
  labourer: 'Labourer ghost',
  traveller: 'Traveller ghost',
  briton: 'Atrebates ghost',
  swineherd: 'Swineherd ghost',
  fieldwife: 'Fieldwife ghost',
  child: 'Boy ghost',
  coiner: 'Coiner ghost',
  priestess: 'Priestess ghost',
  lucco: 'Rider ghost',
  junia: 'Oil-seller ghost',
  enica: 'Weaver ghost',
  elen: 'Girl ghost',
  bassa: 'Huntsman ghost',
};

const geometryCache = new Map<GhostCostumeId, THREE.BufferGeometry>();
let sharedMaterial: THREE.MeshBasicMaterial | null = null;

// Pale ghost palette: costume hues washed out so translucency reads.
// Briton wool / traveller cloak / labourer clay are split so short-tunic
// figures do not share a colour at street distance.
const C = {
  skin: 0xe8e2d4,
  iron: 0xc9cfd6,
  crest: 0xd97f70,
  soldierTunic: 0xd49080,
  leather: 0xb99a7a,
  togaWhite: 0xe6e2d4,
  stripe: 0xa888c0,
  stola: 0x9bb0c8,
  veil: 0x8fa8c0,
  labourTunic: 0xc4b090,
  belt: 0x8f7a5c,
  britonWool: 0xc9a882,
  britonCloak: 0xb8a090,
  bronze: 0xc4a878,
  cloakGrey: 0xb8c4c0,
  wood: 0xb8a07a,
  tile: 0xc9a090,
  amphora: 0xc0a888,
  hair: 0xb0a898,
  swineherdTunic: 0x9a8a6a,
  legwrap: 0x7a6a5a,
  hoodBrown: 0x8a7a62,
  bellBronze: 0xb89a68,
  kirtleGreen: 0x8aa080,
  wimple: 0xe2dcc8,
  sickleIron: 0xb8c0c8,
  childTunic: 0xd0a890,
  apron: 0x8f7a6a,
  robeCream: 0xd8d0c0,
  sashRed: 0xa85858,
  bowlBronze: 0xb89868,
  luccoTunic: 0xc4a090,
  luccoCloak: 0x8a5a52,
  juniaDress: 0xd4b070,
  juniaCloth: 0xe6d8b0,
  jug: 0xc4a060,
  enicaTunic: 0xa88898,
  wool: 0xe4dcc8,
  elenTunic: 0x8aa0ae,
  doll: 0xc4b0a0,
  bassaTunic: 0x6a7a58,
  hound: 0x8a7058,
} as const;

function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const col = new THREE.Color(hex);
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  if (rx || ry || rz) {
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  }
  g.translate(x, y, z);
  return g;
}

const cyl = (rt: number, rb: number, h: number, seg = 8): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(rt, rb, h, seg);
const ball = (r: number, w = 8, h = 6): THREE.BufferGeometry =>
  new THREE.SphereGeometry(r, w, h);
const box = (w: number, h: number, d: number): THREE.BufferGeometry =>
  new THREE.BoxGeometry(w, h, d);

function head(x = 0, y = 1.52, z = 0.03): THREE.BufferGeometry {
  return paint(place(ball(0.13), x, y, z), C.skin);
}

function limb(
  color: number,
  rt: number, rb: number, h: number,
  x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0, seg = 8,
): THREE.BufferGeometry {
  return paint(place(cyl(rt, rb, h, seg), x, y, z, rx, ry, rz), color);
}

function propBox(
  color: number,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0,
): THREE.BufferGeometry {
  return paint(place(box(w, h, d), x, y, z, rx, ry, rz), color);
}

/** Hanging arm: thin cylinder angled slightly out. `side` −1 left, +1 right. */
function hangingArm(side: -1 | 1, color: number, y = 1.15, out = 0.30, len = 0.55): THREE.BufferGeometry {
  return limb(color, 0.05, 0.045, len, side * out, y, 0, 0, 0, side * 0.12);
}

/**
 * Two-piece bent arm. Upper sits at the shoulder; forearm uses explicit
 * elbow coords so each costume can weld a prop into the crook or hand.
 */
function bentArm(
  side: -1 | 1,
  color: number,
  shoulderY: number,
  shoulderOut: number,
  upper: { len?: number; rx?: number; rz?: number; z?: number },
  lower: { x: number; y: number; z: number; len?: number; rx?: number; rz?: number },
): THREE.BufferGeometry[] {
  const uLen = upper.len ?? 0.28;
  const lLen = lower.len ?? 0.26;
  return [
    limb(color, 0.05, 0.045, uLen, side * shoulderOut, shoulderY, upper.z ?? 0.04, upper.rx ?? 0.35, 0, side * (upper.rz ?? 0.55)),
    limb(color, 0.048, 0.044, lLen, lower.x, lower.y, lower.z, lower.rx ?? 0.9, 0, lower.rz ?? 0),
  ];
}

function buildSoldier(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Tunic skirt + legs.
  parts.push(paint(place(cyl(0.22, 0.30, 0.5, 10), 0, 0.55, 0), C.soldierTunic));
  parts.push(limb(C.skin, 0.07, 0.06, 0.35, -0.11, 0.17, 0));
  parts.push(limb(C.skin, 0.07, 0.06, 0.35, 0.11, 0.17, 0));
  // Banded cuirass: torso + two iron bands + leather straps.
  parts.push(paint(place(cyl(0.24, 0.22, 0.5, 10), 0, 1.05, 0), C.iron));
  parts.push(paint(place(cyl(0.255, 0.255, 0.07, 10), 0, 1.0, 0), C.leather));
  parts.push(paint(place(cyl(0.25, 0.25, 0.07, 10), 0, 1.16, 0), C.leather));
  // Shoulder guards.
  parts.push(propBox(C.iron, 0.16, 0.05, 0.22, -0.28, 1.28, 0, 0, 0, 0.15));
  parts.push(propBox(C.iron, 0.16, 0.05, 0.22, 0.28, 1.28, 0, 0, 0, -0.15));
  parts.push(hangingArm(1, C.skin));
  // Left arm bent to the scutum.
  parts.push(...bentArm(-1, C.skin, 1.18, 0.32, { rx: 0.4, rz: 0.5, z: 0.06 }, {
    x: -0.40, y: 1.00, z: 0.14, rx: 1.05, rz: 0.15,
  }));
  // Rectangular scutum (slight yaw so the curve reads) + boss + gladius.
  parts.push(propBox(C.leather, 0.44, 0.88, 0.05, -0.42, 0.92, 0.16, 0, 0.18, 0));
  parts.push(paint(place(ball(0.045, 6, 4), -0.40, 0.95, 0.20), C.iron));
  parts.push(propBox(C.iron, 0.05, 0.34, 0.03, 0.24, 0.86, 0.06));
  parts.push(propBox(C.leather, 0.08, 0.04, 0.04, 0.24, 1.04, 0.06));
  // Head + galea (half-dome) + taller crest (fore-aft fin).
  parts.push(head());
  const helm = new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  parts.push(paint(place(helm, 0, 1.55, -0.01), C.iron));
  parts.push(propBox(C.crest, 0.045, 0.18, 0.36, 0, 1.78, -0.02));
  return mergeMixed(parts, 'ghost-soldier');
}

function buildMagistrate(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Ankle-length toga as a lathe (taller civic silhouette) + left-shoulder bulk.
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.10, 1.82),
    new THREE.Vector2(0.22, 1.68),
    new THREE.Vector2(0.32, 1.42),
    new THREE.Vector2(0.28, 1.16),
    new THREE.Vector2(0.36, 0.88),
    new THREE.Vector2(0.30, 0.55),
    new THREE.Vector2(0.36, 0.22),
    new THREE.Vector2(0.26, 0.0),
  ];
  const toga = new THREE.LatheGeometry(pts, 10);
  toga.translate(0, 0.04, 0);
  parts.push(paint(toga, C.togaWhite));
  const shoulder = new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  parts.push(paint(place(shoulder, -0.24, 1.36, 0.02), C.togaWhite));
  parts.push(propBox(C.togaWhite, 0.22, 0.18, 0.16, -0.08, 0.92, 0.16)); // umbo
  // Wider purple clavus along the chest drape.
  parts.push(propBox(C.stripe, 0.07, 0.72, 0.12, -0.02, 1.08, 0.22, 0, 0, 0.45));
  parts.push(hangingArm(-1, C.skin, 1.08, 0.32, 0.50));
  // Right arm across the chest, scroll in the hand.
  parts.push(...bentArm(1, C.skin, 1.20, 0.22, { len: 0.30, rx: 0.85, rz: -1.05, z: 0.10 }, {
    x: 0.06, y: 1.16, z: 0.20, len: 0.24, rx: 1.15, rz: -0.4,
  }));
  parts.push(limb(C.togaWhite, 0.03, 0.03, 0.22, 0.08, 1.18, 0.26, 0, 0, 1.2, 8));
  parts.push(head(0, 1.58, 0.03));
  return mergeMixed(parts, 'ghost-magistrate');
}

function buildMatron(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Stola: full-length flared dress, wider than the magistrate tube.
  parts.push(paint(place(cyl(0.24, 0.40, 1.38, 10), 0, 0.70, 0), C.stola));
  // Draped palla: shawl over the shoulders + two falling panels (not a cone).
  parts.push(propBox(C.veil, 0.70, 0.16, 0.40, 0, 1.40, -0.02));
  parts.push(propBox(C.veil, 0.16, 0.62, 0.12, -0.28, 1.08, 0.04, 0, 0, 0.18));
  parts.push(propBox(C.veil, 0.16, 0.48, 0.12, 0.26, 1.14, 0.06, 0, 0, -0.16));
  parts.push(head(0, 1.50, 0.10));
  parts.push(paint(place(ball(0.07, 6, 4), 0, 1.50, -0.12), C.hair));
  parts.push(hangingArm(1, C.stola, 1.05, 0.28));
  parts.push(hangingArm(-1, C.stola, 1.05, 0.28));
  // Market basket at the hip.
  parts.push(paint(place(cyl(0.09, 0.07, 0.14, 8), 0.28, 0.82, 0.10), C.wood));
  parts.push(propBox(C.labourTunic, 0.10, 0.04, 0.08, 0.28, 0.88, 0.10));
  return mergeMixed(parts, 'ghost-matron');
}

function buildLabourer(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Short working tunic + rope belt + stockier bare legs.
  parts.push(paint(place(cyl(0.24, 0.30, 0.62, 8), 0, 0.84, 0), C.labourTunic));
  parts.push(paint(place(cyl(0.255, 0.255, 0.06, 8), 0, 0.94, 0), C.belt));
  parts.push(limb(C.skin, 0.085, 0.075, 0.48, -0.12, 0.28, 0));
  parts.push(limb(C.skin, 0.085, 0.075, 0.48, 0.12, 0.28, 0));
  parts.push(hangingArm(1, C.skin, 1.08));
  // Left arm bent, carrying a hod of tiles.
  parts.push(...bentArm(-1, C.skin, 1.12, 0.30, { rx: 0.3, rz: 0.6, z: 0.05 }, {
    x: -0.36, y: 0.96, z: 0.12, rx: 0.85, rz: 0.12,
  }));
  parts.push(propBox(C.wood, 0.22, 0.06, 0.16, -0.38, 0.84, 0.14));
  parts.push(propBox(C.wood, 0.22, 0.14, 0.03, -0.38, 0.92, 0.06));
  parts.push(propBox(C.tile, 0.10, 0.03, 0.12, -0.38, 0.90, 0.14));
  parts.push(propBox(C.tile, 0.10, 0.03, 0.12, -0.36, 0.94, 0.13));
  parts.push(propBox(C.tile, 0.10, 0.03, 0.12, -0.40, 0.92, 0.12));
  parts.push(head());
  // Flattened pileus (felt cap, not a party hat).
  parts.push(paint(place(cyl(0.04, 0.13, 0.10, 8), 0, 1.64, 0), C.labourTunic));
  return mergeMixed(parts, 'ghost-labourer');
}

function buildTraveller(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Hooded paenula: tapered cloak + deep hood (strongest existing silhouette).
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.02, 1.75),
    new THREE.Vector2(0.16, 1.68),
    new THREE.Vector2(0.22, 1.50),
    new THREE.Vector2(0.30, 1.20),
    new THREE.Vector2(0.34, 0.90),
    new THREE.Vector2(0.30, 0.55),
    new THREE.Vector2(0.38, 0.25),
    new THREE.Vector2(0.30, 0.02),
  ];
  const cloak = new THREE.LatheGeometry(pts, 10);
  cloak.translate(0, 0.05, 0);
  parts.push(paint(cloak, C.cloakGrey));
  const hood = new THREE.ConeGeometry(0.20, 0.35, 8);
  parts.push(paint(place(hood, 0, 1.66, -0.02), C.cloakGrey));
  parts.push(head(0, 1.50, 0.07));
  // Merchant cues: satchel + amphora welded to the hip.
  parts.push(propBox(C.leather, 0.16, 0.18, 0.08, -0.22, 0.95, 0.10));
  parts.push(propBox(C.leather, 0.03, 0.20, 0.03, -0.14, 1.08, 0.10, 0, 0, 0.4));
  parts.push(paint(place(cyl(0.045, 0.08, 0.20, 8), 0.24, 0.82, 0.10), C.amphora));
  parts.push(paint(place(cyl(0.028, 0.04, 0.08, 6), 0.24, 0.96, 0.10), C.amphora));
  return mergeMixed(parts, 'ghost-traveller');
}

function buildBriton(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Iron Age Atrebates farmer: broader, slightly shorter; warm wool not clay.
  parts.push(paint(place(cyl(0.26, 0.34, 0.62, 8), 0, 0.80, 0), C.britonWool));
  // Bracae (trousers) instead of bare legs — the read vs Duro at a glance.
  parts.push(limb(C.britonWool, 0.10, 0.09, 0.52, -0.12, 0.28, 0));
  parts.push(limb(C.britonWool, 0.10, 0.09, 0.52, 0.12, 0.28, 0));
  // Larger cloak over the shoulders + round brooch.
  parts.push(propBox(C.britonCloak, 0.62, 0.52, 0.10, 0, 1.06, -0.18));
  parts.push(paint(place(ball(0.055, 6, 4), 0.20, 1.20, 0.04), C.bronze));
  // Bronze torc, scaled up.
  const torc = new THREE.TorusGeometry(0.13, 0.032, 6, 10);
  parts.push(paint(place(torc, 0, 1.32, 0.03, Math.PI / 2.4, 0, 0), C.bronze));
  parts.push(hangingArm(-1, C.skin, 1.04, 0.32, 0.50));
  // Right arm out to a short cattle staff.
  parts.push(...bentArm(1, C.skin, 1.08, 0.32, { rx: 0.15, rz: 0.35, z: 0.02 }, {
    x: 0.36, y: 0.90, z: 0.04, len: 0.28, rx: 0.2, rz: -0.1,
  }));
  parts.push(limb(C.wood, 0.022, 0.018, 1.15, 0.38, 0.68, 0.05, 0.08, 0, 0.05, 6));
  parts.push(head(0, 1.46, 0.03));
  return mergeMixed(parts, 'ghost-briton');
}

function buildSwineherd(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Post-Roman Saxon herdsman: muddy short tunic, thin leg-wraps (not bracae),
  // small hood, spear in the right hand, pig bell at the waist.
  parts.push(paint(place(cyl(0.24, 0.30, 0.62, 8), 0, 0.84, 0), C.swineherdTunic));
  parts.push(paint(place(cyl(0.255, 0.255, 0.06, 8), 0, 0.94, 0), C.belt));
  parts.push(limb(C.legwrap, 0.07, 0.065, 0.48, -0.12, 0.28, 0));
  parts.push(limb(C.legwrap, 0.07, 0.065, 0.48, 0.12, 0.28, 0));
  parts.push(hangingArm(-1, C.skin, 1.08, 0.30));
  // Right arm out to a long herding spear.
  parts.push(...bentArm(1, C.skin, 1.10, 0.30, { rx: 0.15, rz: 0.35, z: 0.02 }, {
    x: 0.36, y: 0.92, z: 0.05, len: 0.28, rx: 0.2, rz: -0.1,
  }));
  parts.push(limb(C.wood, 0.022, 0.018, 1.5, 0.40, 0.85, 0.05, 0.06, 0, 0.05, 6));
  // Small hood + pig bell at the waist.
  const hood = new THREE.ConeGeometry(0.17, 0.28, 8);
  parts.push(paint(place(hood, 0, 1.66, -0.02), C.hoodBrown));
  parts.push(head(0, 1.50, 0.07));
  parts.push(paint(place(ball(0.045, 6, 4), -0.22, 0.90, 0.12), C.bellBronze));
  return mergeMixed(parts, 'ghost-swineherd');
}

function buildFieldwife(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Medieval tenant's wife: dull-green ankle kirtle, white wimple, sickle + basket.
  parts.push(paint(place(cyl(0.24, 0.38, 1.36, 10), 0, 0.69, 0), C.kirtleGreen));
  parts.push(propBox(C.kirtleGreen, 0.60, 0.14, 0.36, 0, 1.36, -0.02)); // shoulder yoke
  parts.push(head(0, 1.50, 0.08));
  // White wimple framing the face + long back veil (reads vs matron's palla).
  parts.push(paint(place(ball(0.15, 8, 6), 0, 1.52, -0.03), C.wimple));
  parts.push(propBox(C.wimple, 0.22, 0.55, 0.08, 0, 1.18, -0.18));
  parts.push(hangingArm(1, C.kirtleGreen, 1.05, 0.28));
  // Left arm bent, holding a small sickle.
  parts.push(...bentArm(-1, C.skin, 1.10, 0.30, { rx: 0.3, rz: 0.6, z: 0.05 }, {
    x: -0.36, y: 0.96, z: 0.12, rx: 0.85, rz: 0.12,
  }));
  parts.push(propBox(C.wood, 0.03, 0.03, 0.18, -0.38, 0.98, 0.14));
  parts.push(propBox(C.sickleIron, 0.02, 0.10, 0.04, -0.38, 1.06, 0.20));
  // Harvest basket at the hip.
  parts.push(paint(place(cyl(0.09, 0.07, 0.14, 8), 0.28, 0.82, 0.10), C.wood));
  return mergeMixed(parts, 'ghost-fieldwife');
}

function buildChild(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Roman boy (~1.15m: genuinely short geometry, not just mesh scale).
  // Short warm tunic + bare legs + knucklebone satchel + play hoop.
  parts.push(paint(place(cyl(0.18, 0.23, 0.45, 8), 0, 0.62, 0), C.childTunic));
  parts.push(limb(C.skin, 0.06, 0.055, 0.34, -0.09, 0.21, 0));
  parts.push(limb(C.skin, 0.06, 0.055, 0.34, 0.09, 0.21, 0));
  parts.push(paint(place(cyl(0.19, 0.18, 0.32, 8), 0, 0.98, 0), C.childTunic));
  parts.push(hangingArm(-1, C.skin, 0.98, 0.24, 0.42));
  // Right arm holding a wooden play hoop.
  parts.push(...bentArm(1, C.skin, 1.00, 0.24, { rx: 0.2, rz: 0.4, z: 0.02 }, {
    x: 0.30, y: 0.84, z: 0.06, len: 0.24, rx: 0.3, rz: -0.1,
  }));
  const hoop = new THREE.TorusGeometry(0.16, 0.02, 6, 12);
  parts.push(paint(place(hoop, 0.32, 0.62, 0.10), C.wood));
  // Knucklebone satchel at the hip.
  parts.push(propBox(C.leather, 0.12, 0.14, 0.06, -0.20, 0.72, 0.08));
  parts.push(head(0, 1.16, 0.03));
  parts.push(paint(place(ball(0.06, 6, 4), 0, 1.16, -0.10), C.hair));
  return mergeMixed(parts, 'ghost-child');
}

function buildCoiner(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Iron Age mint worker: wool tunic, leather apron panel, hammer + coin die.
  parts.push(paint(place(cyl(0.25, 0.31, 0.62, 8), 0, 0.82, 0), C.britonWool));
  parts.push(propBox(C.apron, 0.34, 0.45, 0.06, 0, 0.88, 0.20)); // apron front
  parts.push(limb(C.skin, 0.08, 0.07, 0.46, -0.12, 0.28, 0));
  parts.push(limb(C.skin, 0.08, 0.07, 0.46, 0.12, 0.28, 0));
  // Right arm raised with hammer.
  parts.push(...bentArm(1, C.skin, 1.12, 0.30, { rx: -0.5, rz: 0.5, z: 0.04 }, {
    x: 0.34, y: 1.22, z: 0.10, rx: -0.4, rz: -0.2,
  }));
  parts.push(limb(C.wood, 0.02, 0.02, 0.26, 0.34, 1.34, 0.12, 0.4, 0, 0, 6));
  parts.push(propBox(C.iron, 0.10, 0.06, 0.06, 0.34, 1.46, 0.16));
  // Left arm forward holding the coin die.
  parts.push(...bentArm(-1, C.skin, 1.12, 0.30, { rx: 0.5, rz: 0.5, z: 0.06 }, {
    x: -0.30, y: 1.02, z: 0.18, rx: 1.0, rz: 0.1,
  }));
  parts.push(paint(place(cyl(0.035, 0.035, 0.10, 8), -0.28, 1.02, 0.24, 1.2, 0, 0), C.bronze));
  parts.push(head());
  // Simple headband (not a cap, not a torc).
  parts.push(paint(place(cyl(0.14, 0.14, 0.05, 8), 0, 1.58, 0), C.apron));
  parts.push(paint(place(ball(0.045, 6, 4), -0.20, 1.14, 0.04), C.bronze)); // arm-ring
  return mergeMixed(parts, 'ghost-coiner');
}

function buildPriestess(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Romano-British temple keeper: cream ankle robe, red sash, offering bowl.
  parts.push(paint(place(cyl(0.24, 0.38, 1.38, 10), 0, 0.70, 0), C.robeCream));
  parts.push(propBox(C.sashRed, 0.07, 0.72, 0.12, 0.02, 1.08, 0.22, 0, 0, -0.45)); // sash
  parts.push(propBox(C.robeCream, 0.62, 0.14, 0.36, 0, 1.38, -0.02)); // shoulder drape
  parts.push(head(0, 1.50, 0.08));
  // Head veil falling behind (distinct from wimple: no face ring).
  parts.push(propBox(C.robeCream, 0.30, 0.55, 0.08, 0, 1.22, -0.18));
  // Both arms forward, holding a shallow offering bowl.
  parts.push(...bentArm(-1, C.skin, 1.14, 0.26, { len: 0.28, rx: 0.9, rz: 0.5, z: 0.08 }, {
    x: -0.16, y: 1.02, z: 0.24, len: 0.24, rx: 1.1, rz: 0.2,
  }));
  parts.push(...bentArm(1, C.skin, 1.14, 0.26, { len: 0.28, rx: 0.9, rz: -0.5, z: 0.08 }, {
    x: 0.16, y: 1.02, z: 0.24, len: 0.24, rx: 1.1, rz: -0.2,
  }));
  parts.push(paint(place(cyl(0.13, 0.09, 0.07, 10), 0, 1.02, 0.28), C.bowlBronze));
  parts.push(propBox(C.kirtleGreen, 0.08, 0.04, 0.06, 0, 1.07, 0.28)); // herb offering
  return mergeMixed(parts, 'ghost-priestess');
}

function buildLucco(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Rider: short tunic, bracae, russet shoulder cloak, message bag, crop.
  // No torc (that is the farmer) and no hood (that is the traveller).
  parts.push(paint(place(cyl(0.22, 0.28, 0.58, 8), 0, 0.82, 0), C.luccoTunic));
  parts.push(limb(C.luccoTunic, 0.09, 0.08, 0.50, -0.11, 0.28, 0));
  parts.push(limb(C.luccoTunic, 0.09, 0.08, 0.50, 0.11, 0.28, 0));
  parts.push(propBox(C.luccoCloak, 0.34, 0.55, 0.08, -0.14, 1.10, -0.12));
  parts.push(hangingArm(-1, C.skin, 1.08, 0.30));
  parts.push(...bentArm(1, C.skin, 1.10, 0.30, { rx: 0.2, rz: 0.35, z: 0.02 }, {
    x: 0.34, y: 0.92, z: 0.08, len: 0.26, rx: 0.35, rz: -0.1,
  }));
  parts.push(limb(C.wood, 0.015, 0.012, 0.55, 0.36, 0.95, 0.10, 0.5, 0, 0.05, 5));
  parts.push(propBox(C.leather, 0.14, 0.16, 0.07, -0.26, 0.78, 0.10));
  parts.push(head());
  return mergeMixed(parts, 'ghost-lucco');
}

function buildJunia(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Oil seller: ochre ankle dress, pale headcloth, tally rods, small jug.
  parts.push(paint(place(cyl(0.22, 0.36, 1.32, 10), 0, 0.68, 0), C.juniaDress));
  parts.push(propBox(C.juniaCloth, 0.32, 0.16, 0.28, 0, 1.58, -0.02));
  parts.push(propBox(C.juniaCloth, 0.10, 0.36, 0.08, 0, 1.28, -0.16));
  parts.push(head(0, 1.48, 0.06));
  parts.push(hangingArm(1, C.juniaDress, 1.05, 0.28));
  parts.push(...bentArm(-1, C.skin, 1.12, 0.28, { rx: 0.4, rz: 0.45, z: 0.04 }, {
    x: -0.30, y: 1.00, z: 0.14, len: 0.24, rx: 0.7, rz: 0.1,
  }));
  parts.push(limb(C.wood, 0.012, 0.012, 0.28, -0.32, 1.08, 0.18, 0.25, 0, 0.1, 4));
  parts.push(limb(C.wood, 0.012, 0.012, 0.24, -0.36, 1.04, 0.16, 0.35, 0, 0.15, 4));
  parts.push(paint(place(cyl(0.05, 0.065, 0.14, 6), 0.26, 0.78, 0.12), C.jug));
  parts.push(paint(place(cyl(0.025, 0.03, 0.05, 5), 0.26, 0.88, 0.12), C.jug));
  return mergeMixed(parts, 'ghost-junia');
}

function buildEnica(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Weaver: knee-length plum tunic, distaff with a wool head, skein at the hip.
  parts.push(paint(place(cyl(0.22, 0.28, 0.70, 8), 0, 0.78, 0), C.enicaTunic));
  parts.push(paint(place(cyl(0.24, 0.24, 0.05, 8), 0, 0.96, 0), C.belt));
  parts.push(limb(C.skin, 0.07, 0.06, 0.40, -0.10, 0.24, 0));
  parts.push(limb(C.skin, 0.07, 0.06, 0.40, 0.10, 0.24, 0));
  parts.push(hangingArm(-1, C.skin, 1.06, 0.28));
  parts.push(...bentArm(1, C.skin, 1.10, 0.28, { rx: 0.15, rz: 0.3, z: 0.02 }, {
    x: 0.32, y: 0.96, z: 0.06, len: 0.26, rx: 0.2, rz: -0.1,
  }));
  parts.push(limb(C.wood, 0.014, 0.014, 0.72, 0.34, 1.20, 0.08, 0.12, 0, 0.04, 5));
  parts.push(paint(place(ball(0.055, 6, 4), 0.36, 1.52, 0.10), C.wool));
  parts.push(paint(place(ball(0.07, 6, 4), -0.24, 0.82, 0.10), C.wool));
  parts.push(head());
  parts.push(paint(place(ball(0.055, 6, 4), 0.04, 1.62, -0.02), C.hair));
  return mergeMixed(parts, 'ghost-enica');
}

function buildElen(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Girl of about eight: short geometry, longer tunic than the Roman boy, rag doll.
  parts.push(paint(place(cyl(0.16, 0.22, 0.58, 8), 0, 0.52, 0), C.elenTunic));
  parts.push(limb(C.skin, 0.05, 0.045, 0.20, -0.07, 0.14, 0));
  parts.push(limb(C.skin, 0.05, 0.045, 0.20, 0.07, 0.14, 0));
  parts.push(paint(place(cyl(0.16, 0.15, 0.26, 8), 0, 0.90, 0), C.elenTunic));
  parts.push(hangingArm(1, C.skin, 0.92, 0.20, 0.36));
  parts.push(...bentArm(-1, C.skin, 0.96, 0.20, { len: 0.20, rx: 0.5, rz: 0.4, z: 0.04 }, {
    x: -0.22, y: 0.78, z: 0.10, len: 0.18, rx: 0.8, rz: 0.15,
  }));
  parts.push(propBox(C.doll, 0.07, 0.12, 0.04, -0.24, 0.74, 0.12));
  parts.push(paint(place(ball(0.032, 5, 4), -0.24, 0.82, 0.12), C.skin));
  parts.push(head(0, 1.10, 0.03));
  parts.push(paint(place(ball(0.055, 6, 4), 0, 1.12, -0.08), C.hair));
  return mergeMixed(parts, 'ghost-elen');
}

function buildBassa(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Huntsman: woodland tunic, soft cap, leash, one hound at the heel.
  // No spear and no pig bell — those belong to the swineherd.
  parts.push(paint(place(cyl(0.22, 0.28, 0.58, 8), 0, 0.82, 0), C.bassaTunic));
  parts.push(paint(place(cyl(0.24, 0.24, 0.05, 8), 0, 0.92, 0), C.belt));
  parts.push(limb(C.legwrap, 0.07, 0.06, 0.46, -0.11, 0.28, 0));
  parts.push(limb(C.legwrap, 0.07, 0.06, 0.46, 0.11, 0.28, 0));
  parts.push(hangingArm(1, C.skin, 1.08, 0.28));
  parts.push(...bentArm(-1, C.skin, 1.10, 0.28, { rx: 0.55, rz: 0.4, z: 0.04 }, {
    x: -0.32, y: 0.90, z: 0.16, rx: 1.05, rz: 0.12,
  }));
  parts.push(limb(C.leather, 0.012, 0.012, 0.55, -0.38, 0.58, 0.24, 1.0, 0, 0.05, 4));
  parts.push(paint(place(cyl(0.06, 0.14, 0.08, 8), 0, 1.60, 0), C.hoodBrown));
  parts.push(head());
  parts.push(propBox(C.hound, 0.28, 0.12, 0.12, -0.46, 0.20, 0.30));
  parts.push(paint(place(ball(0.065, 6, 4), -0.62, 0.28, 0.30), C.hound));
  parts.push(limb(C.hound, 0.028, 0.022, 0.12, -0.54, 0.08, 0.26, 0, 0, 0, 4));
  parts.push(limb(C.hound, 0.028, 0.022, 0.12, -0.38, 0.08, 0.26, 0, 0, 0, 4));
  parts.push(limb(C.hound, 0.028, 0.022, 0.12, -0.54, 0.08, 0.34, 0, 0, 0, 4));
  parts.push(limb(C.hound, 0.028, 0.022, 0.12, -0.38, 0.08, 0.34, 0, 0, 0, 4));
  parts.push(propBox(C.hound, 0.10, 0.03, 0.03, -0.28, 0.24, 0.30));
  return mergeMixed(parts, 'ghost-bassa');
}

const BUILDERS: Record<GhostCostumeId, () => THREE.BufferGeometry> = {
  soldier: buildSoldier,
  magistrate: buildMagistrate,
  matron: buildMatron,
  labourer: buildLabourer,
  traveller: buildTraveller,
  briton: buildBriton,
  swineherd: buildSwineherd,
  fieldwife: buildFieldwife,
  child: buildChild,
  coiner: buildCoiner,
  priestess: buildPriestess,
  lucco: buildLucco,
  junia: buildJunia,
  enica: buildEnica,
  elen: buildElen,
  bassa: buildBassa,
};

export function getGhostCostumeGeometry(costume: GhostCostumeId): THREE.BufferGeometry {
  const cached = geometryCache.get(costume);
  if (cached) return cached;
  const g = BUILDERS[costume]();
  geometryCache.set(costume, g);
  return g;
}

export function getGhostCostumes(): GhostCostumeId[] {
  return [...COSTUME_ORDER];
}

/** Triangle count of a (possibly non-indexed) merged costume mesh. */
export function ghostCostumeTriCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.attributes.position.count / 3;
}

export function getGhostMaterial(): THREE.MeshBasicMaterial {
  if (sharedMaterial) return sharedMaterial;
  sharedMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, // vertex colors carry the costume hues
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    fog: true,
  });
  return sharedMaterial;
}

/** Per-ghost mesh: own costume geometry, shared translucent material. */
export function createGhostMesh(costume: GhostCostumeId): THREE.Mesh {
  const mesh = new THREE.Mesh(getGhostCostumeGeometry(costume), getGhostMaterial());
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 5; // after opaque town, among transparent decals
  mesh.frustumCulled = false; // positions update on CPU; avoid stale bounds pop
  return mesh;
}
