import { Game } from './application/Game.js';

const app = document.getElementById('app')!;
const stats = document.getElementById('stats')!;
const minimap = document.getElementById('minimap') as HTMLCanvasElement;

// Runtime errors go to the console always; they are surfaced in the HUD only
// with ?debug (or #debug) so production visitors never see internals
// (library versions, paths) that aid fingerprinting. Without it the HUD keeps
// its last healthy readout instead of an error oracle.
const debugErrors = /[?#&]debug\b/.test(window.location.search + window.location.hash);
function reportError(text: string): void {
  console.error(`[silchester] ${text}`);
  if (debugErrors) stats.textContent = text;
}
window.addEventListener('error', e => {
  reportError(`error: ${e.message}`);
});
window.addEventListener('unhandledrejection', e => {
  reportError(`error: ${String(e.reason)}`);
});

const game = new Game();
void game.init(app, stats, minimap).catch(err => {
  reportError(`init failed: ${err instanceof Error ? err.message : String(err)}`);
});
