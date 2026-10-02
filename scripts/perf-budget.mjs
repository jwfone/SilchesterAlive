// Perf budget gate: fails `npm run perf` after build if dist too large.
import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const assets = join(process.cwd(), 'dist');
let total = 0;
try {
  const files = readdirSync(assets, { recursive: true });
  for (const f of files) {
    try {
      const s = statSync(join(assets, f));
      if (s.isFile()) total += s.size;
    } catch { /* ignore */ }
  }
} catch {
  console.warn('[perf] dist/ not found - run `npm run build` first.');
  process.exit(0);
}
const mb = total / 1024 / 1024;
console.log(`[perf] dist total: ${mb.toFixed(2)} MB`);
if (mb > 8) {
  console.error('[perf] FAIL: dist exceeds 8 MB budget for greybox.');
  process.exit(1);
}
console.log('[perf] OK');
