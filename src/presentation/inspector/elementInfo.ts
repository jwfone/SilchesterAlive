// Plain-language descriptions of plan elements for the reconstruction viewer's
// hover / tap notes: what the part is, how sure we are (evidence level) and why.
// Wording follows assets/key-plans/<id>.about.md; plan notes are appended.
import type { BuildingPlan, Ev, PlanRoom, UV } from '../../domain/keyPlan.js';
import type { PlanElement } from '../kit/planBuilding.js';

export interface ElementInfo { title: string; ev?: Ev; lines: string[] }

/** Evidence levels as worded in the HUD legend. */
export const EV_LABEL: Record<Ev, string> = { S: 'Found at Silchester', C: 'From comparable sites', X: 'Conjecture' };
/** Evidence colours (match planBuilding's EV_RGB). */
export const EV_COLOR: Record<Ev, string> = { S: '#54a85c', C: '#eba333', X: '#d9544d' };

function inPoly(u: number, v: number, poly: UV[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i], [uj, vj] = poly[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}
const centre = (poly: UV[]): UV => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

/** Innermost room at a plan point (the smallest containing polygon: the court before the walk round it). */
export function roomAt(plan: BuildingPlan, u: number, v: number): PlanRoom | undefined {
  let best: PlanRoom | undefined, bestA = Infinity;
  for (const r of plan.rooms) {
    if (!inPoly(u, v, r.poly)) continue;
    let a = 0;
    for (let i = 0, j = r.poly.length - 1; i < r.poly.length; j = i++) a += r.poly[j][0] * r.poly[i][1] - r.poly[i][0] * r.poly[j][1];
    if (Math.abs(a) < bestA) { bestA = Math.abs(a); best = r; }
  }
  return best;
}

/** "the cold bath", "the Frigidarium", "the W room". */
const the = (r: PlanRoom): string => (/^[A-Z][a-z]+ [a-z]/.test(r.name) ? `the ${r.name.toLowerCase()}` : `the ${r.name}`);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const compass = (du: number, dv: number): string => (Math.abs(du) > Math.abs(dv) ? (du > 0 ? 'east' : 'west') : (dv > 0 ? 'north' : 'south'));

/** "wall between the frigidarium and the cold bath" / "west wall of the frigidarium". */
function wallPlace(plan: BuildingPlan, wallId: string, at?: UV): string {
  const w = plan.walls.find((x) => x.id === wallId);
  if (!w) return 'wall';
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, du = (w.b[0] - w.a[0]) / L, dv = (w.b[1] - w.a[1]) / L;
  // nearest point on the wall line to the picked point (or the wall's middle)
  const s = at ? Math.max(0.05, Math.min(L - 0.05, (at[0] - w.a[0]) * du + (at[1] - w.a[1]) * dv)) : L / 2;
  const pu = w.a[0] + du * s, pv = w.a[1] + dv * s, off = w.t / 2 + 0.3;
  const left = roomAt(plan, pu - dv * off, pv + du * off), right = roomAt(plan, pu + dv * off, pv - du * off);
  if (left && right && left !== right) return `wall between ${the(left)} and ${the(right)}`;
  const room = left ?? right;
  if (!room) return 'wall';
  const [cu, cv] = centre(room.poly);
  return `${compass(pu - cu, pv - cv)} wall of ${the(room)}`;
}

const FLOOR_TEXT: Record<string, [string, Ev | undefined]> = {
  'tesserae-white': ['White chalk mosaic with black Kimmeridge stone and hexagonal tiles.', 'S'],
  signinum: ['Pink mortar floor (opus signinum).', 'S'],
  'signinum-polished': ['Polished pink mortar floor (opus signinum).', 'S'],
  hypocaust: ['Floor raised on a hypocaust: hot air from the furnace ran underneath.', 'S'],
  tile: ['Tiled floor.', undefined],
  gravel: ['Gravel.', undefined],
  earth: ['Earth floor.', undefined],
};

const WALL_HEIGHT: Record<Ev, string> = {
  S: 'Height: Silchester evidence.',
  C: 'Height follows standing Roman bath walls in Britain (Wroxeter about 7 m, Leicester about 9 m, Ravenglass about 4 m).',
  X: 'Height: conjecture.',
};

/** Describe an element; `at` is the picked plan point (u, v), when known. */
export function describeElement(plan: BuildingPlan, el: PlanElement, at?: UV): ElementInfo {
  const room = (id: string): PlanRoom | undefined => plan.rooms.find((r) => r.id === id);
  const lines: string[] = [];
  let title = '';
  let ev: Ev | undefined = el.ev;
  switch (el.kind) {
    case 'wall':
      title = cap(wallPlace(plan, el.ref, at));
      lines.push('Wall line: surveyed and excavated (1903–4 plan, matched to the town survey).');
      if (el.ev) lines.push(WALL_HEIGHT[el.ev]);
      break;
    case 'stylobate':
      title = 'Low wall carrying columns';
      lines.push(el.ev === 'S' ? 'Found in the excavations.' : '');
      break;
    case 'window':
      title = `Window: ${wallPlace(plan, el.ref, at)}`;
      if (plan.apses?.some((a) => a.id === el.ref)) title = 'Window in the apse';
      if (el.ev === 'C') lines.push('Size follows a glazed bath-house window found at Great Chesters on Hadrian’s Wall; its exact position is a reconstruction.');
      if (el.ev === 'X') lines.push('Conjecture.');
      break;
    case 'door':
      title = `Doorway: ${wallPlace(plan, el.ref, at)}`;
      if (el.conjecture) { ev = 'X'; lines.push('Where this doorway was is conjecture: the 1905 plan records floors, not thresholds.'); }
      else { ev = 'S'; lines.push('The opening is on the excavated plan; its height is a reconstruction.'); }
      break;
    case 'apse': {
      const ap = plan.apses?.find((a) => a.id === el.ref);
      const am = ap ? ((ap.start + ap.end) / 2) * (Math.PI / 180) : 0, back = (ap?.neck ?? 0) + 1; // into the room
      const r = ap ? roomAt(plan, ap.c[0] - Math.cos(am) * back, ap.c[1] - Math.sin(am) * back) : undefined;
      title = r ? `Apse of ${the(r)}` : 'Apse';
      lines.push('Curved end of a heated room: its plan was excavated.');
      if (el.ev) lines.push(WALL_HEIGHT[el.ev]);
      break;
    }
    case 'floor': {
      const r = room(el.ref);
      title = r ? `${r.name}: floor` : 'Floor';
      const [text, fev] = FLOOR_TEXT[r?.floor ?? ''] ?? ['Floor.', undefined];
      ev = fev;
      lines.push(fev === 'S' ? `${text} Found in the excavations.` : text);
      break;
    }
    case 'pool': {
      const r = room(el.ref);
      title = r ? `${r.name}: plunge bath` : 'Plunge bath';
      lines.push('The bath’s size is excavated. It is shown as a basin with a raised rim rather than sunk into the floor.');
      break;
    }
    case 'labrum':
      title = 'Labrum (stone washing basin)';
      lines.push('Stands where the excavated plan shows it; a high window lights it, as Vitruvius advises.');
      break;
    case 'base':
      title = 'Masonry base';
      break;
    case 'roof': {
      const r = room(el.ref);
      const ap = plan.apses?.find((a) => a.id === el.ref);
      title = ap ? 'Roof over the apse' : r ? `Roof over ${the(r)}` : 'Roof';
      lines.push('Roof tiles were found at Silchester; the roof’s form and pitch are a reconstruction.');
      break;
    }
    case 'vault': {
      const r = room(el.ref);
      title = r ? `Vaulted ceiling of ${the(r)}` : 'Vaulted ceiling';
      lines.push('Wedge-shaped and hollow arch bricks and wall-heating tiles found at Silchester show the hot rooms were vaulted.');
      break;
    }
    case 'column':
      title = 'Column';
      lines.push('Height uses the classical rule of about seven times the column’s width.');
      break;
    case 'pier':
      title = 'Brick pier';
      break;
    case 'arch':
      title = 'Brick arch';
      ev = 'X';
      lines.push('Only the piers survive; the arch over them is conjecture.');
      break;
    case 'beam':
      title = 'Timber beam';
      lines.push('A timber beam over the columns; its form is a reconstruction.');
      break;
  }
  if (el.note) lines.push(`${cap(el.note)}${/[.)]$/.test(el.note) ? '' : '.'}`);
  return { title, ev, lines: lines.filter(Boolean) };
}

/** Description of a room, for the plan drawing. */
export function describeRoom(r: PlanRoom): ElementInfo {
  const [text, ev] = FLOOR_TEXT[r.floor ?? ''] ?? [undefined, undefined];
  const lines: string[] = [];
  if (text) lines.push(ev === 'S' ? `${text} Found in the excavations.` : text);
  if (r.note) lines.push(`${cap(r.note)}${/[.)]$/.test(r.note) ? '' : '.'}`);
  return { title: r.name, lines };
}
