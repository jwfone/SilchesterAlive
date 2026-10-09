# Plan: the reconstruction viewer in the game

Status: **step 2 done** (2026-10-09): the baths are in the game with the Display setting and Auto tiers; the viewer (steps 3–6) is next. The dev pages `tools/elevations.html` (drawings + 3D + notes) and
`tools/materials.html` (wall-style lab) stay as they are; this plan turns the first into an in-game
feature without losing anything it shows today.

## What players get

A **reconstruction viewer** for each plan-built key building (the baths first):

| Tab | Content (as on the drawings page today) |
|---|---|
| **3D model** | Spinnable model (drag / pinch, zoom). |
| **Drawings** | Street front, sections and side elevations with height ruler, 1 m grid, 10 m scale bar, captions; cut walls drawn solid. |
| **Plan** | The labelled room plan drawn from the plan file (our own drawing; the 1905 plan image is not ours to ship). |
| **How it was made** | The notes from `assets/key-plans/<id>.about.md`: date shown, how the plan was made, evidence vs reconstruction, choices, sources with links. |

A toolbar on every tab: **Evidence / Materials / Plain**, with the evidence legend. Level of detail
moves to a small "Technical" toggle (triangle counts) rather than being a main control.

**New markup:** hovering or tapping part of the model or a drawing shows what it is and why, e.g.
"Window: glass from large panes found here in 1903–4 (Silchester evidence)". The plan file already carries
these notes on walls, windows, columns and rooms.

### Ways in

- Near or inside a key building, a prompt: **"I: explore the reconstruction"** (and a HUD button for touch).
- On the map (**M**), clicking a key building offers "Explore reconstruction".
- A "Reconstructions" list in the HUD menu.

Opening the viewer pauses the game (simulation and rendering) and releases the mouse; **Esc** or Close
resumes where the player was.

## Building style setting (game-wide)

A HUD **Display** setting, saved like the layer toggles: **Buildings: Materials / Plain / Evidence**.

- Materials and Plain are a uniform switch on the shared building material: no rebuild, no extra draw calls.
- Evidence uses the evidence colours already generated per element (vertex colours on key buildings only).
- Applies to plan-built buildings; old kit buildings follow as they are replaced.
- The Materials wall style is chosen in the materials lab (generated stonework, with or without weathering).

## How it fits the code

- **One generator, two uses.** `planBuilding.ts` builds both the game's world meshes (LOD 0/1/2) and the
  viewer's model, so the viewer always shows exactly what is in the world.
- **Viewer module:** move the view logic out of `src/tools/elevations.ts` into
  `src/presentation/inspector/BuildingInspector.ts` (views, ruler / grid overlay, section caps, picking).
  The dev page becomes a thin wrapper around it, so both stay in sync.
- **Code-split:** the viewer is loaded with `import()` the first time it is opened, so it adds nothing to
  start-up. The notes Markdown is fetched lazily too.
- **One WebGL context.** The dev page uses one renderer per view; in the game the viewer reuses the game's
  renderer and draws all views into one overlay canvas with viewports and scissor (as the materials lab
  already does). This avoids browser context limits on phones.
- **Plan data:** each plan JSON (~20 KB) is bundled with the world build, since LOD 1/2 meshes are made
  at start-up; the full walkable LOD 0 is built when the player comes within ~120 m and dropped beyond ~300 m.
- **Picking:** the generator records the triangle range of each plan element (id, evidence, note); a
  raycast hit's face index looks up the element for the tooltip.
- **Adding buildings:** a building with a `plan.json` and `about.md` appears in the viewer automatically.

## Order of work

1. Choose the wall style in the materials lab (user).
2. Put the baths into the world: replace the old kit, place by the plan frame, LOD 0/1/2 with lazy LOD 0,
   colliders from the generator footprints, Display setting.
3. Extract the viewer module from the dev page (single renderer), keeping the dev page working.
4. In-game overlay: entry points, pause/resume, tabs, toolbar, Esc / focus handling, mobile layout.
5. Plan tab and notes tab.
6. Element picking and tooltips.
7. Checks: smoke test, bundle size (`npm run perf`), frame time with the viewer closed unchanged, phone layout.

## Wall style and quality tiers (decided 2026-10-09)

The user prefers the weathered generated stonework (lab style C). The baked version (E) repeats visibly on
long walls, so it was dropped. **F (hybrid)** keeps C's look: live block layout with an integer hash, plus
fine grain and weathering sampled from a small baked noise tile (512², 1.3 MB, ~20–40 ms to bake at load)
at unrelated scales, so nothing repeats visibly.

Measured on an Intel HD 620 at 1080p × 1.25 (2400 × 1350, 4× MSAA), extra ms per frame against the old
painted texture (`tools/materials.html`, `await bench(30, view, [2400, 1350])`):

| View | C live | F hybrid | Plain |
|---|---|---|---|
| Against the wall | +20.1 | +6.9 | 0 |
| Along the 66 m west wall | +7.0 | +2.1 | −1.2 |
| Street front | +7.4 | +3.7 | −0.5 |

As more buildings use it, a **quality fallback** is needed:

| Tier | Walls | Notes |
|---|---|---|
| High | F | default where the GPU allows |
| Standard | F without fine grain and streaks (block layout, colour drift, damp base) | about half of F's extra cost (to measure) |
| Low | Plain | same cost as today's texture or less |

- **Auto (default):** pick the starting tier with a short start-up micro-benchmark (render a test wall
  off-screen for ~10 frames, reusing the lab's bench code), then step down a tier if frame time stays over
  budget (~30 ms for 3 s) while these walls are on screen. Never step up mid-session (avoids flicker).
- **Manual override** in the HUD Display settings: Auto / High / Standard / Plain (plus Evidence colours).
- The tier is one uniform on the shared material: switching costs nothing and needs no rebuild.
- The plain-colour baseline in this test was already ~25 ms at this resolution on this GPU, so a
  game-wide dynamic-resolution fallback is worth considering separately.

**F revised (same day).** Seen from a distance F went flat and stripy, because sub-pixel grain was simply
dropped. Now the grain fades out gradually, and its contrast is handed to features that stay visible far
away: stronger block-to-block tone and 0.4–1.7 m mottling. (Varying the number of brick courses per band
was tried and rejected: no evidence for it within a single wall; bands stay at 3 courses.) Re-measured at 2400 × 1350: right against a wall about +3 ms over the old texture
(C about +14 ms); street and aerial views within measurement noise of the old texture.
