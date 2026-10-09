// Small floating note for the reconstruction viewer: what a hovered / tapped part
// is and how it is known. Styled from JS (no stylesheet needed, CSP-safe) so the
// dev drawings page and the in-game overlay share it.
import { EV_COLOR, EV_LABEL, type ElementInfo } from './elementInfo.js';

export class Tooltip {
  readonly el = document.createElement('div');

  constructor(host: HTMLElement = document.body) {
    const s = this.el.style;
    s.cssText = 'position:fixed;z-index:100;max-width:min(320px,calc(100vw - 24px));pointer-events:none;'
      + 'background:#fffdf7;color:#23201b;border:1px solid #cfc6b5;border-radius:8px;padding:8px 10px;'
      + 'font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25)';
    this.el.hidden = true;
    this.el.setAttribute('role', 'tooltip');
    host.append(this.el);
  }

  show(info: ElementInfo, clientX: number, clientY: number): void {
    const el = this.el;
    el.replaceChildren();
    const t = document.createElement('div');
    t.style.fontWeight = '650';
    t.textContent = info.title;
    el.append(t);
    if (info.ev) {
      const ev = document.createElement('div');
      ev.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:2px;font-size:12px;color:#5b5246';
      const sw = document.createElement('i');
      sw.style.cssText = `width:10px;height:10px;border-radius:2px;flex:none;background:${EV_COLOR[info.ev]}`;
      ev.append(sw, EV_LABEL[info.ev]);
      el.append(ev);
    }
    for (const line of info.lines) {
      const p = document.createElement('div');
      p.style.marginTop = '4px';
      p.textContent = line;
      el.append(p);
    }
    el.hidden = false;
    // Beside the pointer, kept on screen.
    const r = el.getBoundingClientRect();
    let x = clientX + 14, y = clientY + 16;
    if (x + r.width > innerWidth - 8) x = Math.max(8, clientX - r.width - 14);
    if (y + r.height > innerHeight - 8) y = Math.max(8, clientY - r.height - 12);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  hide(): void { this.el.hidden = true; }
  dispose(): void { this.el.remove(); }
}
