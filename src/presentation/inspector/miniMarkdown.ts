// Minimal Markdown -> HTML for the reconstruction notes (assets/key-plans/*.about.md):
// # / ## headings, paragraphs, - and 1. lists (with wrapped continuation lines),
// **bold**, *italic*, [text](https://...). Input is escaped first; only http(s) links pass.

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One line: escaped, with **bold**, *italic* and http(s) links. */
export function miniInline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function miniMarkdown(md: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = (): void => { if (para.length) { out.push(`<p>${miniInline(para.join(' '))}</p>`); para = []; } };
  const flushList = (): void => {
    if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${miniInline(i)}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ul = /^\s*-\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (h) { flushPara(); flushList(); out.push(`<h${h[1].length + 1}>${miniInline(h[2])}</h${h[1].length + 1}>`); continue; }
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    if (list && /^\s+/.test(raw)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('\n');
}
