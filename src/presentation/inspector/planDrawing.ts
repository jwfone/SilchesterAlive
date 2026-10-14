// The reconstruction viewer's Plan tab: a labelled room plan drawn from the plan
// file (our own drawing; the 1905 plan image is not ours to ship). North is up;
// walls coloured by evidence in Evidence mode, doorways as gaps, windows as thin
// lines; hover / tap a room for its name and notes. Rooms whose names do not
// fit at the current size are numbered, with a key list beside the drawing.
import type { BuildingPlan, Ev, UV } from '../../domain/keyPlan.js';
import { describeArenaAt, describeRoom, EV_COLOR, roomAt } from './elementInfo.js';
import { arenaProfile, openingAt, planExtentUV, ringPoint } from '../../domain/arenaPlan.js';
import { Tooltip } from './tooltip.js';
import type { InspectorMode } from './BuildingInspector.js';

const FILL = { room: '#f4efe4', heated: '#f3dfd8', outside: '#eef0e6', open: '#e2ead8', pool: '#cfe2ea', base: '#d8cfbf', line: '#3b342b' };

export class PlanDrawing {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ro: ResizeObserver;
  private readonly tip: Tooltip;
  private mode: InspectorMode = 'ev';
  /** Plan -> device px, for hit tests. */
  private k = 1; private ox = 0; private oy = 0; private dpr = 1;
  private readonly b: { u0: number; u1: number; v0: number; v1: number };

  constructor(private readonly plan: BuildingPlan, host: HTMLElement, private readonly keyHost?: HTMLElement,
    tooltipHost?: HTMLElement, private readonly onPick?: (text: string | null) => void) {
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:manipulation';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `Plan of the ${plan.name ?? plan.id} with room names; north is up.`);
    host.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.tip = new Tooltip(tooltipHost);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    const add = (u: number, v: number, pad: number): void => { u0 = Math.min(u0, u - pad); u1 = Math.max(u1, u + pad); v0 = Math.min(v0, v - pad); v1 = Math.max(v1, v + pad); };
    for (const w of plan.walls) { add(w.a[0], w.a[1], w.t / 2); add(w.b[0], w.b[1], w.t / 2); }
    for (const ap of plan.apses ?? []) add(ap.c[0], ap.c[1], ap.r + ap.t / 2);
    if (plan.arena) { const e = planExtentUV(plan); add(e.u0, e.v0, 0.5); add(e.u1, e.v1, 0.5); }
    this.b = { u0, u1, v0, v1 };
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.canvas);
    const pick = (e: PointerEvent): void => {
      const r = this.canvas.getBoundingClientRect();
      const px = (e.clientX - r.left) * (this.canvas.width / r.width), py = (e.clientY - r.top) * (this.canvas.height / r.height);
      const pu = (px - this.ox) / this.k, pv = (this.oy - py) / this.k;
      const room = roomAt(plan, pu, pv);
      const info = room ? describeRoom(room) : plan.arena ? describeArenaAt(plan, pu, pv) : undefined;
      if (!info) { this.tip.hide(); this.onPick?.(null); return; }
      this.tip.show(info, e.clientX, e.clientY);
      this.onPick?.([info.title, ...info.lines].join('. '));
    };
    this.canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pick(e); });
    this.canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pick(e); });
    this.canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.tip.hide(); });
  }

  /** Amphitheatre: bank, seating and arena as rings (passages cut through), the arena wall with its openings,
   * passage walls and recesses, and labels. */
  private drawArena(ctx: CanvasRenderingContext2D, X: (u: number) => number, Y: (v: number) => number, k: number, dpr: number,
    wallColor: (ev: Ev | undefined) => string): void {
    const ar = this.plan.arena!, P = arenaProfile(ar);
    const ring = (d: number): void => {
      ctx.beginPath();
      for (let a = 0; a <= 360; a += 2) { const [u, v] = ringPoint(ar, a, d); if (a) ctx.lineTo(X(u), Y(v)); else ctx.moveTo(X(u), Y(v)); }
      ctx.closePath();
    };
    ring(ar.bank.toe); ctx.fillStyle = FILL.open; ctx.fill();
    ring(P.crestEnd); ctx.fillStyle = '#e9dcc0'; ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,50,.35)'; ctx.lineWidth = dpr;
    for (let r = 1; r <= ar.seating.rows; r++) { ring(ar.t / 2 + r * ar.seating.tread); ctx.stroke(); }
    ring(-ar.t / 2); ctx.fillStyle = '#f1e6cf'; ctx.fill();
    // passages: corridors cut through the banks
    for (const ps of ar.passages) {
      const [w0, w1] = ps.walls;
      ctx.beginPath(); ctx.moveTo(X(w0.a[0]), Y(w0.a[1])); ctx.lineTo(X(w0.b[0]), Y(w0.b[1])); ctx.lineTo(X(w1.b[0]), Y(w1.b[1])); ctx.lineTo(X(w1.a[0]), Y(w1.a[1])); ctx.closePath();
      ctx.fillStyle = '#f1e6cf'; ctx.fill();
    }
    for (const rc of ar.recesses) { ctx.beginPath(); ctx.arc(X(rc.c[0]), Y(rc.c[1]), (rc.r - rc.t / 2) * k, 0, Math.PI * 2); ctx.fillStyle = '#f1e6cf'; ctx.fill(); }
    // arena wall, gaps at the openings
    ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(1.5 * dpr, ar.t * k); ctx.strokeStyle = wallColor(ar.ev);
    let open = true;
    for (let a = 0; a <= 360; a += 0.5) {
      const gap = !!openingAt(ar, a % 360);
      const [u, v] = ringPoint(ar, a);
      if (gap) { if (!open) ctx.stroke(); open = true; continue; }
      if (open) { ctx.beginPath(); ctx.moveTo(X(u), Y(v)); open = false; } else ctx.lineTo(X(u), Y(v));
    }
    if (!open) ctx.stroke();
    for (const ps of ar.passages) for (const w of ps.walls) {
      ctx.beginPath(); ctx.moveTo(X(w.a[0]), Y(w.a[1])); ctx.lineTo(X(w.b[0]), Y(w.b[1]));
      ctx.lineWidth = Math.max(1.5 * dpr, w.t * k); ctx.strokeStyle = wallColor(ps.ev); ctx.stroke();
    }
    for (const rc of ar.recesses) {
      const am = Math.atan2(rc.c[1] - ar.c[1], rc.c[0] - ar.c[0]);
      ctx.beginPath(); ctx.arc(X(rc.c[0]), Y(rc.c[1]), rc.r * k, -am - Math.PI / 2, -am + Math.PI / 2);
      ctx.lineWidth = Math.max(1.5 * dpr, rc.t * k); ctx.strokeStyle = wallColor(rc.ev); ctx.stroke();
    }
    for (const st of ar.stairs ?? []) {
      const [u0, v0] = ringPoint(ar, st.angle, P.crestEnd), [u1, v1] = ringPoint(ar, st.angle, ar.bank.toe);
      ctx.beginPath(); ctx.moveTo(X(u0), Y(v0)); ctx.lineTo(X(u1), Y(v1));
      ctx.lineWidth = Math.max(2 * dpr, st.w * k); ctx.strokeStyle = this.mode === 'ev' ? EV_COLOR[st.ev ?? 'X'] : '#8a6a44'; ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = (t: string, u: number, v: number): void => {
      ctx.font = `600 ${Math.max(10 * dpr, Math.min(14 * dpr, k * 1.4))}px system-ui, sans-serif`;
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(t, X(u), Y(v));
      ctx.fillStyle = '#23201b'; ctx.fillText(t, X(u), Y(v));
    };
    label('Arena', ar.c[0], ar.c[1]);
    for (const ps of ar.passages) {
      const m = [(ps.walls[0].b[0] + ps.walls[1].b[0]) / 2, (ps.walls[0].b[1] + ps.walls[1].b[1]) / 2];
      label(ps.id.startsWith('north') ? 'North entrance' : 'South entrance', m[0], m[1] + (m[1] > ar.c[1] ? 3 : -3));
    }
    const [su, sv] = ringPoint(ar, 225, P.rowsEnd / 2);
    label('Seating', su, sv);
    const [bu, bv] = ringPoint(ar, 315, (P.crestEnd + ar.bank.toe) / 2);
    label('Bank', bu, bv);
  }

  setMode(mode: InspectorMode): void { this.mode = mode; this.draw(); }
  hideTip(): void { this.tip.hide(); }

  dispose(): void { this.ro.disconnect(); this.tip.dispose(); this.canvas.remove(); }

  draw(): void {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (cw < 2 || ch < 2) return;
    const dpr = (this.dpr = Math.min(2, devicePixelRatio || 1));
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    const ctx = this.ctx, b = this.b, plan = this.plan;
    const pad = 28 * dpr;
    const k = (this.k = Math.min((W - 2 * pad) / (b.u1 - b.u0), (H - 2 * pad - 20 * dpr) / (b.v1 - b.v0)));
    this.ox = (W - (b.u1 - b.u0) * k) / 2 - b.u0 * k;
    this.oy = pad + b.v1 * k;
    const X = (u: number): number => this.ox + u * k, Y = (v: number): number => this.oy - v * k;
    const polyPath = (poly: UV[]): void => { ctx.beginPath(); poly.forEach(([u, v], i) => (i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v)))); ctx.closePath(); };
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Rooms: outer ones first so the court sits over the walk round it.
    const area = (p: UV[]): number => Math.abs(p.reduce((s, [u, v], i) => { const [u2, v2] = p[(i + 1) % p.length]; return s + u * v2 - u2 * v; }, 0)) / 2;
    const rooms = [...plan.rooms].sort((a, c) => area(c.poly) - area(a.poly));
    for (const r of rooms) {
      polyPath(r.poly);
      ctx.fillStyle = r.floor === 'hypocaust' ? FILL.heated : r.finish === 'exterior' ? (r.floor === 'gravel' && area(r.poly) > 100 ? FILL.open : FILL.outside) : FILL.room;
      ctx.fill();
      if (r.pool) { polyPath(r.pool.poly); ctx.fillStyle = FILL.pool; ctx.fill(); ctx.strokeStyle = '#7c9aa6'; ctx.lineWidth = dpr; ctx.stroke(); }
      if (r.base) { polyPath(r.base.poly); ctx.fillStyle = FILL.base; ctx.fill(); }
      if (r.labrum) { ctx.beginPath(); ctx.arc(X(r.labrum.c[0]), Y(r.labrum.c[1]), r.labrum.r * k, 0, Math.PI * 2); ctx.fillStyle = FILL.pool; ctx.fill(); ctx.strokeStyle = '#7c9aa6'; ctx.stroke(); }
    }
    for (const ap of plan.apses ?? []) {
      ctx.beginPath(); ctx.moveTo(X(ap.c[0]), Y(ap.c[1]));
      ctx.arc(X(ap.c[0]), Y(ap.c[1]), (ap.r - ap.t / 2) * k, (-ap.start * Math.PI) / 180, (-ap.end * Math.PI) / 180, true);
      ctx.fillStyle = FILL.heated; ctx.fill();
    }

    const wallColor = (ev: Ev | undefined): string => (this.mode === 'ev' ? EV_COLOR[ev ?? 'C'] : FILL.line);
    if (plan.arena) this.drawArena(ctx, X, Y, k, dpr, wallColor);
    // Walls: solid between doorways; windows drawn as a thin line across the opening.
    ctx.lineCap = 'butt';
    for (const w of plan.walls) {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < 1e-6) continue;
      const du = (w.b[0] - w.a[0]) / L, dv = (w.b[1] - w.a[1]) / L;
      const at = (s: number): [number, number] => [X(w.a[0] + du * s), Y(w.a[1] + dv * s)];
      const doors = (w.openings ?? []).map((o) => [o.at - o.w / 2, o.at + o.w / 2] as [number, number]).sort((p, q) => p[0] - q[0]);
      const wins = (w.windows ?? []).map((o) => [o.at - o.w / 2, o.at + o.w / 2] as [number, number]);
      const cuts = [-w.t / 2, ...doors.flat(), L + w.t / 2];
      const seg = (s0: number, s1: number, width: number, color: string): void => {
        if (s1 - s0 < 1e-3) return;
        ctx.beginPath(); ctx.moveTo(...at(s0)); ctx.lineTo(...at(s1)); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
      };
      const color = wallColor(w.ev), wpx = Math.max(1.5 * dpr, w.t * k);
      for (let i = 0; i < cuts.length; i += 2) {
        // split this solid run at windows: wall, then a thin glazing line
        let s = cuts[i];
        for (const [a, c] of wins.filter(([a]) => a >= cuts[i] && a < cuts[i + 1]).sort((p, q) => p[0] - q[0])) {
          seg(s, a, wpx, color);
          seg(a, c, wpx, '#ffffff');
          ctx.globalAlpha = 0.35; seg(a, c, wpx, color); ctx.globalAlpha = 1;
          seg(a, c, Math.max(dpr, wpx * 0.22), color);
          s = c;
        }
        seg(s, cuts[i + 1], wpx, color);
      }
    }
    for (const ap of plan.apses ?? []) {
      ctx.beginPath();
      ctx.arc(X(ap.c[0]), Y(ap.c[1]), ap.r * k, (-ap.start * Math.PI) / 180, (-ap.end * Math.PI) / 180, true);
      ctx.lineWidth = Math.max(1.5 * dpr, ap.t * k); ctx.strokeStyle = wallColor(ap.ev); ctx.stroke();
    }
    // Columns (round) and piers (square), including those spaced along walls.
    for (const cg of plan.columns ?? []) {
      const pts: UV[] = [...(cg.at ?? [])];
      if (cg.on && cg.spacing) {
        for (const wid of cg.on) {
          const w = plan.walls.find((x) => x.id === wid); if (!w) continue;
          const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), n = Math.max(1, Math.round(L / cg.spacing));
          for (let i = 0; i <= n; i++) {
            const s = (i / n) * L;
            if ((w.openings ?? []).some((o) => Math.abs(s - o.at) < o.w / 2 + 0.25)) continue;
            pts.push([w.a[0] + ((w.b[0] - w.a[0]) * s) / L, w.a[1] + ((w.b[1] - w.a[1]) * s) / L]);
          }
        }
      }
      ctx.fillStyle = this.mode === 'ev' ? EV_COLOR[cg.ev ?? 'C'] : FILL.line;
      ctx.strokeStyle = FILL.line; ctx.lineWidth = dpr;
      for (const [u, v] of pts) {
        const r = Math.max(2 * dpr, (cg.d / 2) * k);
        ctx.beginPath();
        if (cg.kind === 'pier') ctx.rect(X(u) - r, Y(v) - r, 2 * r, 2 * r); else ctx.arc(X(u), Y(v), r, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    }

    // Room names (white halo), wrapped to two lines if needed; numbered (with a key) if they still don't fit.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const key: string[] = [];
    for (const r of plan.rooms) {
      const us = r.poly.map((p) => p[0]), vs = r.poly.map((p) => p[1]);
      const [lu, lv] = r.labelAt ?? [(Math.min(...us) + Math.max(...us)) / 2, (Math.min(...vs) + Math.max(...vs)) / 2];
      const roomW = (Math.max(...us) - Math.min(...us) - 0.8) * k, roomH = (Math.max(...vs) - Math.min(...vs) - 0.8) * k;
      const size = Math.max(10 * dpr, Math.min(14 * dpr, k * 0.8 * (r.labelSize ?? 1)));
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      let lines = [r.name];
      if (ctx.measureText(r.name).width > roomW && r.name.includes(' ')) {
        const words = r.name.split(' '), cut = Math.ceil(words.length / 2);
        lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
      }
      const fits = Math.max(...lines.map((t) => ctx.measureText(t).width)) <= roomW && lines.length * size * 1.1 <= roomH * (r.labelAt ? 2 : 1);
      if (!fits) { key.push(r.name); lines = [String(key.length)]; }
      lines.forEach((t, i) => {
        const y = Y(lv) + (i - (lines.length - 1) / 2) * size * 1.1;
        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(t, X(lu), y);
        ctx.fillStyle = '#23201b'; ctx.fillText(t, X(lu), y);
      });
    }

    // North arrow (true north from the plan frame) and 10 m scale bar.
    const a = (plan.frame.angleDeg * Math.PI) / 180, nx = Math.sin(a), ny = Math.cos(a);
    const ax = W - pad, ay = pad + 22 * dpr, len = 18 * dpr;
    ctx.strokeStyle = '#23201b'; ctx.fillStyle = '#23201b'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(ax - nx * len, ay + ny * len); ctx.lineTo(ax + nx * len, ay - ny * len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax + nx * len, ay - ny * len); ctx.lineTo(ax + nx * len - 5 * dpr, ay - ny * len + 9 * dpr); ctx.lineTo(ax + nx * len + 5 * dpr, ay - ny * len + 9 * dpr); ctx.fill();
    ctx.font = `600 ${12 * dpr}px system-ui, sans-serif`; ctx.textBaseline = 'bottom';
    ctx.fillText('N', ax + nx * len, ay - ny * len - 10 * dpr);
    const bx = pad, by = H - pad / 2 - 6 * dpr;
    for (let i = 0; i < 10; i += 2) ctx.fillRect(bx + i * k, by, k, 5 * dpr);
    ctx.lineWidth = dpr; ctx.strokeRect(bx, by, 10 * k, 5 * dpr);
    ctx.textAlign = 'left'; ctx.font = `${11 * dpr}px system-ui, sans-serif`;
    ctx.fillText('10 m', bx + 10 * k + 6 * dpr, by + 7 * dpr);
    if (this.keyHost) {
      const ol = document.createElement('ol');
      for (const name of key) { const li = document.createElement('li'); li.textContent = name; ol.append(li); }
      this.keyHost.replaceChildren(...(key.length ? [ol] : []));
    }
  }
}
