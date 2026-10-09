# Key buildings: handoff and next steps

State on 2026-10-09, at the end of the baths pilot session.

## Where things stand

- **The baths are in the game**, generated from `assets/key-plans/baths.plan.json`. They're the pilot for
  rebuilding the key buildings (forum, mansio, temples to follow, one by one).
- Research, sources and every decision: [`baths.md`](baths.md). User-facing notes: `assets/key-plans/baths.about.md`.
- In-game reconstruction viewer: built; design and "as built" notes in [`inspector-plan.md`](inspector-plan.md).

### Decisions already made (don't re-open)

- Period: **late 3rd century AD** (c. 270–280) for the whole town; 1905 phase-6 work omitted; earlier
  forms of the latrine and west tepidarium.
- Wall look: style **F / `hybrid`** (live block layout, broken joints, Greensand in 5 courses + 3 brick
  courses per 0.8 m band, baked 512² grain tile). Brick bands stay at **3 courses** (no evidence for
  varying within one wall). Quality tiers: High = `hybrid`, Standard = `hybridLite`, Low = `plain`;
  Auto picks via a start-up GPU test (cached per GPU) and steps down on slow frames near the building.
- Evidence colours: green Silchester / amber comparison / red conjecture.
- The user prefers **plain labelled pictures** for review over interactive tools, and **evidence-bound
  construction details** (vary surface weathering, not coursing).

### Key files

| What | Where |
|---|---|
| Plan → geometry (LOD 0/1/2, evidence colours, footings) | `src/presentation/kit/planBuilding.ts` |
| Placement in the world, colliders, floors, display switch | `src/presentation/kit/planWorld.ts`, `WorldBuilder.ts` |
| Wall/brick shader styles, quality tiers | `src/presentation/kit/atlasTiled.ts` (`masonryF`, `brickF`) |
| Grain tile bake; start-up GPU test | `src/presentation/kit/wallBake.ts`, `wallBench.ts` |
| Plan types + frame maths (pure) | `src/domain/keyPlan.ts`; data via `npm run import:keyplans` → `keyPlans.generated.ts` |
| Display setting logic (pure, smoke-tested) | `src/domain/displaySettings.ts`; HUD in `index.html`, wiring in `Game.ts` |
| Reconstruction viewer (views, picking, overlay, plan, notes) | `src/presentation/inspector/` (`BuildingInspector.ts`, `ReconstructionViewer.ts`) |
| Drawings page (thin wrapper round the viewer) | `tools/elevations.html` + `src/tools/elevations.ts` |
| Materials lab (style comparison, `await bench(...)`) | `tools/materials.html` + `src/tools/materials.ts` |
| Plan review tooling (GIS rings, plan sheet) | `scripts/key-review.mjs`, `key-walls.mjs`, `key-plan-sheet.mjs` |

### Gotchas

- After editing a plan JSON run `npm run import:keyplans` (the game and smoke test read the generated TS).
- Dev spawn: `http://localhost:5173/?at=160,104,175` (baths street front). **Spawning onto a
  collectible marks it collected** in localStorage (`silchester-collectibles-v1`); undo after testing.
- The Read tool can't render PDFs here: use `pdftotext` (mingw64) and PyMuPDF in a scratch venv.
- Excavation report PDFs and the 1905 plan image live in gitignored `tmp/research/`; they are the
  University of Reading's and are not committed. Sources are linked in `baths.md`.

## Next 1: roof tiles (materials-lab treatment)

Same method as the walls: research the evidence, then compare styles side by side in the lab before
choosing. The current roof uses the old painted `tile` atlas cell, which repeats visibly.

1. Evidence: tegulae and imbrices were found at the baths (2018 finds); check the 2018/2019 interim
   reports and the 1905 report for sizes, plus Romano-British norms (tegula ~0.4–0.45 × 0.3–0.35 m with
   flanges, imbrex over the joints, courses overlapping; ridge imbrices). Write the evidence up in
   `baths.md` like the "Wall facing" section.
2. Add a generated tile style to `atlasTiled.ts` (live courses and joints, per-tile tone variation,
   overlap shading and flange edges, weathering/lichen that holds up at distance as `hybrid` does)
   with a Standard-tier variant.
3. Add roof panes to the materials lab (`?only=…`, an aerial and a roof close-up preset), benchmark at
   2400 × 1350, and let the user choose.
4. Consider modest geometry: ridge cap row and eaves edge (cheap), not modelled individual tiles.

**Done 2026-10-09:** the user chose R2 for High and R3 for Standard; both are in the game (styles `hybrid` /
`hybridLite`, `roofF` in `atlasTiled.ts`; ridge / hip caps and tile edges via `buildFromPlan` `roofTrim`, on
by default). Evidence and choice: `baths.md` "Roof tiles". Roof slopes take their UV origin from the eaves
line. Lab: `tools/materials.html?id=baths&set=roof`.

## Done: in-game reconstruction viewer (was Next 2)

Built 2026-10-09; see "As built" in `inspector-plan.md`. Open it at the baths with `I` / the prompt, from
the map (click the building) or the HUD. Possible follow-ups: keyboard access to the hover notes (they
are pointer-only, with an aria-live echo), and a per-building camera start if later buildings need one.
