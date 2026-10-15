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
- **One ground level** (`src/domain/terrainSurface.ts`): the drawn ground mesh and every height query (`gy`,
  `groundY`, `world.terrainY`) are the same surface. Key buildings (baths, forum complex, mansio, temples,
  amphitheatre) stand on levelled platforms (flat 2 m beyond the footprint, 6 m ramp), added in `WorldBuilder`;
  a new key building needs a platform there too. Place things with `gy`, not `sampleTerrain`. Ground decals (roads,
  footprints, water, shadows) lie 6-8 cm up, cut to the terrain's triangles (`drapeOnGround` in `kit/decal.ts`) and
  layered by a per-layer depth bias (`DECAL_BIAS` in `WorldBuilder`), not by height, so they do not flicker at distance. The smoke test checks mesh = `terrainY`
  and that plan buildings stand on level ground.
- Wall shaders: below floor level (`m.y < 0`) the coursing is plain Greensand, so no brick band shows at the foot.
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

## Done: forum-basilica (2026-10-11)

Plan-built from the Great Plan rings, in flint with tile bonding courses (new style `flintF`, `facing: 'flint'` in the
plan; Greensand stays the default). Brief, decisions and evidence: [`forum-basilica.md`](forum-basilica.md). The old kit
`kit/forum.ts` is gone; the smoke test now checks every plan building from one table (`checks` in `src/smoke.ts`, per-building
LOD0 caps: baths 12k, forum 20k). New generator features: arched openings (`arch` on a wall opening) and raised apse floors
(`floorH`). Lab: `tools/materials.html?id=forum-basilica&set=flint`. Scratch scripts that drafted the plan (raster wall
extraction, apse fits, the plan writer and the review pictures; Python, scratch venv) are kept in gitignored
`tmp/key-plans/forum-scripts/`.

## Done: mansio (2026-10-13)

Plan-built from the Great Plan rings (main block, west additions, granary and yard, outer court, baths), flint walls, as excavated
(with the undated west-wing alteration). Brief, sources (Hilton Price 1887 and Fox & St John Hope 1894, *Archaeologia* 50 and 54 on
the Internet Archive), decisions and the reasoning for every height: [`mansio.md`](mansio.md). The old kit `kit/mansio.ts` is gone; the
anchor is now `mansio` (130 × 65.1 m, 3.9°), replacing the courtyard pin `mansio-courtyard`. Smoke LOD0 11,520, cap 16k; whole town
34 draws. Scratch scripts (raster walls, plate fit, plan writer, roof check, review pictures; Python) are in gitignored
`tmp/key-plans/mansio-scripts/`; the fitted plate images in `tmp/research/mansio-1893-*.jpg`.

## Done: amphitheatre (2026-10-14)

Plan-built from GIS layer 04 (the stone-phase arena wall, entrance passages and recesses; there are no Great Plan rings here) and the
surviving earthwork (Fulford 2002 contour plan and C&F 2016 LiDAR, fitted to that wall), as in the stone phase. A new plan element
`arena` (`src/domain/arenaPlan.ts` for the shared geometry and walking heights, `src/presentation/kit/planArena.ts` for the mesh) builds
the sunken arena, wall, passages, vaulted recesses, 12 timber seat rows, the banks and outside stairs. The arena floor is 2 m below the
ground: the ground mesh leaves a rectangular hole (`GroundHole`, `terrainSurface.ts`) that the building fills, out to an apron, and its
floor overrides the ground (`floorOverrides`). Brief, sources and the reasoning for every height: [`amphitheatre.md`](amphitheatre.md).
The old kit `kit/amphitheatre.ts` and its `EllipseBand` are gone; the maps draw the arena from the plan. Walls in a new style
`flintIronF` (`facing: 'flint-ironstone'`: flint with single brown ironstone courses at uneven heights, from the user's photographs;
lab `tools/materials.html?id=amphitheatre&set=arena`). Smoke LOD0 9,494, cap 12k;
whole town 22 draws (the old kit was 13 meshes). Scratch scripts (GIS reader, plate fit, ellipse fit, plan writer, review pictures;
Python) are in gitignored `tmp/key-plans/amphitheatre-scripts/`; the fitted figures in `tmp/research/amphi-*.jpg`; the GIS layers the
user supplied in `tmp/gis04/`, `tmp/gis01/`.

## Done: town wall and gates (2026-10-14)

The stone wall of c. 260–280 between seven plan-built gates (north, south, east, west, Lesser West, amphitheatre, SE footway), with the
earlier rampart behind and the U-shaped ditch in front. Brief, sources (Fox & St John Hope 1890, *Archaeologia* 52; Collis 1983; C&F 2016
ch. 8; Fulford 2002 and the user's photographs), 13 decisions and the reasoning for every height: [`town-walls.md`](town-walls.md).
The north gate moved ~120 m west to where the GIS (and the 1890 plan) put it. The wall line and counterforts are re-derived from the GIS 04
strips (`assets/key-plans/town-wall.json`); the old kit `kit/walls.ts` is gone.

New engine pieces, reusable elsewhere:
- **Two-level walking**: `groundY(x, z, feet)`; raised decks (platforms, stairs, the wall-walk, bridges) count when they are no more
  than 0.6 m above the feet (`DECK_STEP`); `PolyCollider.top` lets you walk on a wall top you have reached. Plan JSON: `platforms`,
  `stairs`, opening `y0`, walls `crenel` and `kind: 'curtain'`.
- **Ground changes without terrain grid lines**: the ditch lowers the ground and an earthworks mesh (2.5 m grid) draws it, with the coarse
  ground hidden there by a mask on its material; the gates are levelled the same way (a platform per gate added grid lines across the
  whole map and ~40k triangles of cut decals).
- **Facing** `flintLimeF` (`facing: 'flint-limestone'`): flint with double courses of mixed limestone and ironstone slabs.

Smoke: town wall section 21,034 tris (cap 24k), earthworks 23,666; gates 590–1,742; whole town **28 draws (was 22), 263k tris (was 216k)** (roads re-draped on a 2.5 m grid over the gates' levelled ground,
`splitByRects`, 2026-10-15). Facing cost on the HD 620: FL +5.6 ms over plain at 2400 × 1350 (`town-walls.md` "Checks").
Lab: `tools/materials.html?id=south-gate&set=town`. Scratch scripts (GIS gate frames, wall line, counterforts, plan writer, notes writer,
review pictures, `shots.ts` for rendering fixed game views through Vite) in gitignored `tmp/key-plans/walls-scripts/`; the user's photos
and Fulford 2002 notes in `tmp/research/walls/`; the 1890 volume in `tmp/research/arch52/`.

Possible follow-ups: the gates' order in the HUD list (alphabetical by id, so they interleave with the other buildings); the outer
earthworks (GIS 03 banks) are untouched; Joyce 1881, St John Hope 1897/1909 and Fulford 1984 not read (east, Lesser West gates).

## Next: the other key buildings

One session per building, in any order. The repeatable procedure is [`playbook.md`](playbook.md) (steps,
deliverables, the code touch-points for replacing an old kit, pitfalls, a kickoff prompt); what is known about each
building, open questions for the user and research leads are in [`other-buildings.md`](other-buildings.md). Suggested
order there: temples, church (forum-basilica, mansio and amphitheatre done). The church is blocked on a user decision (the
pin is probably on the medieval St Mary's; the Roman church may postdate the c. 270–280 snapshot).

## Done: in-game reconstruction viewer (was Next 2)

Built 2026-10-09; see "As built" in `inspector-plan.md`. Open it at the baths with `I` / the prompt, from
the map (click the building) or the HUD. Possible follow-ups: keyboard access to the hover notes (they
are pointer-only, with an aria-live echo), and a per-building camera start if later buildings need one.
