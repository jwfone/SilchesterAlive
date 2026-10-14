# Key building playbook

How to rebuild one key building (forum-basilica, temples, church, mansio, amphitheatre) to the standard of the
baths. **One building per session.** Written 2026-10-10 from the baths pilot; the baths are the worked example
for every step ([`baths.md`](baths.md), `assets/key-plans/baths.*`).

Per-building facts, open questions and leads: [`other-buildings.md`](other-buildings.md).
Current state, key files and gotchas: [`next-steps.md`](next-steps.md).
Brief template: [`_brief-template.md`](_brief-template.md).

## Why we do it this way

The old kits were wrong in three ways: **historically** (invented layouts, undated), **geometrically** (drawn in
made-up coordinates and only translated onto the pin, so they never fitted the surveyed footprint), and
**visually** (crude boxes, and a texture bug that smeared every face). The fix is the same each time:
trace the building from the surveyed walls, drive the model from that plan, and make every height and
detail an explicit, sourced choice that the user can review before it is modelled.

## What a finished building consists of

| Deliverable | Where |
|---|---|
| Anchor widened to the building's full outline | `assets/key-buildings.geojson` (then `node scripts/import-gis.mjs --keys-only`) |
| Which Great Plan wall rings belong to it, what to omit, georeferenced historic plan | `assets/key-plans/<id>.review.json` |
| The wall plan: rooms, walls, doors, windows, apses, columns, roofs, drawings, name, date | `assets/key-plans/<id>.plan.json` → `npm run import:keyplans` |
| Player-facing notes (rationale, evidence, sources) | `assets/key-plans/<id>.about.md` |
| Research brief: sources, development, layout, decisions, elevation rules | `docs/key-buildings/<id>.md` |
| Old kit removed; building placed from the plan; a smoke-test block | `WorldBuilder.ts`, `townPlan.ts`, `src/smoke.ts` |
| Handoff updated | `other-buildings.md` status, `next-steps.md`, memory |

Source PDFs and historic plan images stay in gitignored `tmp/research/` (they are others' figures).
The user commits via GitHub Desktop; never commit.

## Decisions that apply to every building (do not re-open)

- **Period:** one snapshot for the whole town, **late 3rd century AD (c. 270–280)**, after the town wall.
  Leave out work known to be later; where a change could be late 3rd *or* 4th century, show the earlier form.
  If a building did not yet exist, or its existence at that date is doubtful, **ask the user** (see church).
- **Evidence levels** on every element: **S** found at Silchester, **C** by comparison (standing Roman
  buildings, Vitruvius), **X** conjecture. They drive the viewer's colours and tooltips.
- **Construction is evidence-bound; surface variety is not.** Coursing, dimensions, layout follow the evidence
  (derive them from excavation photos with scale bars). Visual variety comes only from weathering, tone and
  mottling. (Brick bands stay at 3 courses: no evidence for varying them within one wall.)
- **Walls:** shader style `hybrid` ("F") in `atlasTiled.ts` for Greensand + brick; quality tiers
  High `hybrid` / Standard `hybridLite` / Low `plain`; Auto tier by start-up GPU test. **Roofs:** the style chosen
  in the roof session (`baths.md` "Roof tiles"). One shared material, one draw per merged mesh.
  Reuse these; a new material (flint, timber and daub, limestone ashlar, thatch…) needs its own lab round (step 10).
- **LOD 0 / 1 / 2** for every plan-built building (walkable interior / shell / massing), evidence colours on
  every triangle, element picking, colliders from the same plan.
- **Review with plain labelled pictures** (plan sheet, elevations page, screenshots) and ask for feedback in
  words. The interactive ring-review page confused the user.
- **Performance:** record `npm run smoke` draws/tris before and after. On 2026-10-10 the whole town is 34 draws and
  ~184k tris (it was ~148k before the baths pilot; the new ground surface added some too), with the baths at
  LOD0 4.8k / LOD1 1.9k / LOD2 0.56k tris. Draw calls must not grow; the smoke test caps LOD0 per building (`checks` in `src/smoke.ts`: baths 12k, forum-basilica 20k, mansio 16k, amphitheatre 12k, main gates 6k, minor gates 3k; the town wall's section 24k for the whole circuit), agreed with the user before building.

## Before you start: confirm with the user

1. Which building, and the open decisions listed for it in `other-buildings.md`.
2. Any research material they hold (reports, images, plans); they supplied the baths reports as PDF links.
3. That you may widen the pinned anchor to the building's full outline (the baths pin covered about 40% of it:
   13 m of a 30 m width).
4. Gitignored inputs: a fresh worktree has no `tmp/`. Copy `tmp/audit-buildings/` (Great Plan rings,
   `raw.geojson`) and `tmp/research/` from the main checkout, or regenerate rings with
   `npm run import:gis -- --audit-buildings` (needs the GIS zips in `GIS data/`, which the user can supply).

## The steps

### 1. Orient and measure the baseline
Read `next-steps.md`, `baths.md`, the building's entry in `other-buildings.md`. `npm install`, `npm run dev`
(`.claude/launch.json` "dev"), `npm run check`, `npm run smoke`; note draws/tris. Look at the old kit in the
game (`?at=x,z,heading` dev spawn; **spawning onto a collectible marks it collected** in
`silchester-collectibles-v1`, so undo that after testing).

### 2. Footprint audit
- `node scripts/key-review.mjs <id> [--margin m]` → `tmp/key-review/<id>.html`: pinned anchor, Great Plan rings
  (by shade), streets, and the old kit's outline for comparison (add the old kit's rectangles to `KIT` in the
  script). Pre-classify rings in `<id>.review.json` (`cls` in/maybe/out, `why`). Rings are in OSGB; hover for ids.
- Check whether the anchor is the **whole** building: ring union vs anchor. Do not chain neighbouring rings
  into "clusters" (that merges through street walls); judge by rings that overlap the anchor.
- Great Plan shades (1–5) are **not** phases; read phase from the historic plan, wall by wall.
- Output: a picture and a short list of uncertain rings for the user. Ring r1141 on the baths was a street-side band the
  user ruled out; expect one or two of those.

### 3. Sources and the research brief
Copy `_brief-template.md` to `<id>.md`. Gather, in this order:
1. The **original excavation plan** (Society of Antiquaries, Archaeologia 1890–1909: phases, room names).
2. **Modern excavation reports** (University of Reading 2018–21 baths; Fulford forum-basilica and amphitheatre;
   Reading 2017 temple report).
3. **Creighton & Fry 2016** (free PDF, see `other-buildings.md`) and the GIS archive notes.
4. **Comparanda** for what nothing records (heights, roofs, windows): Wroxeter, Leicester, Ravenglass, Great Chesters;
   Vitruvius. Reuse `baths.md` "Elevations" where the building type matches.

Reading PDFs here: the Read tool cannot render PDFs. Use `pdftotext -layout` (mingw64) for text and PyMuPDF in
a scratch venv (`python -m venv`, `pip install pymupdf`, run with `python -I`) to render pages and pull figures;
`WebFetch` cannot read PDF bytes either, but it saves the file locally. Web search summaries are leads, not
sources: read the document before recording a claim as fact.

The brief needs: sources, georeferencing, development table (dates, what happened, source), layout,
construction and finishes, **not known**, and a dated **Decisions** list agreed with the user.

### 4. Georeference the historic plan
Fit an affine transform from the plan image to OSGB with ≥ 6 control points on wall corners matched to
Great Plan ring vertices (`underlays` in `<id>.review.json`; `key-review.mjs` prints residuals). **Target < 0.3 m**
(baths: 0.06–0.18 m). Save a JPEG (< ~150 KB) in `tmp/research/`; the review page embeds it. If residuals are
large, the plan is a different survey or the points are wrong; do not proceed on a poor fit.

### 5. Phase rule and anchor
Agree the **phase rule** with the user (baths: 1905 phases 1–5 shown, phase 6 omitted; plus the two "late 3rd or
4th c." choices). Put omitted rings in `omit` in `review.json`. Then widen the anchor: minimum-area rectangle
around the "in" rings, written to `assets/key-buildings.geojson` (`status: user-approved-outline`, `source`
explains how), `node scripts/import-gis.mjs --keys-only`. Check `townPlan.ts` copies the anchor's `w`, `d`, `rotY`
for that building (the baths do; temples/church/forum currently take position only).

### 6. Draft and curate the wall plan
`node scripts/key-walls.mjs <id>` → straight wall runs and apse circle fits in the building's local frame
(origin at the anchor's SW corner, `u` along its east-ish edge) → `tmp/key-plans/<id>.walls.draft.json`.
`node scripts/key-plan-sheet.mjs <id>` → `tmp/key-plans/<id>.sheet.html`: a 1 m grid in the local frame over the
georeferenced plan, rings, draft walls and (once it exists) the curated plan. Write `<id>.plan.json`
by hand from that picture: rooms, wall centrelines with thickness, doorways, apses, columns, roofs.
Doorways the survey cannot show are **conjecture**: tag `conjecture: true`. Iterate until the walls sit on the
underlay, then show the user the picture (baths: they checked it and approved).

### 7. Elevation rules
In the brief, a table of **rule → value → evidence level** for: ground and floors, exterior walls, interior
finish, each range's wall height and roof form, windows (size, position, glazing), colonnades (diameter from
the evidence, height ≈ 7 × diameter), entrance, vaults, roofs and pitch (≈ 22°). Add `h`, `windows`, `ev` and `roofs`
to the plan. Baths examples: `baths.md` "Rules for the model".

### 8. Generator: extend only what the building needs
`src/presentation/kit/planBuilding.ts` currently supports: walls with doors and windows (and a stylobate kind),
apses (with necks, half-domes, windows), room floors (pools, labrum, base), barrel vaults, columns / piers /
arches / beams, roofs `gable` / `lean-to` / `peristyle` with ridge and hip caps, footings, three LODs, evidence
colours, element picking. When a building needs a new element kind (see per-building notes), add it to
`src/domain/keyPlan.ts` types and the generator **with**: an evidence tag, picking ranges (the smoke test fails on
untagged triangles), LOD 0/1/2 behaviour, collider footprints, and a smoke assertion. Keep one material and
one merged mesh per LOD.

### 9. Review the drawings with the user
`http://localhost:5173/tools/elevations.html?id=<id>` shows the plan's `drawings` (elevations and sections with a
height ruler, solid cut walls), a 3D view, Evidence / Materials / Plain, the LOD toggle and the notes. Check
against the evidence table; list what is conjecture. Iterate on the user's words ("the window is wrong") rather
than adding tools.

### 10. Materials
Masonry and brick: reuse style F and the roof style. If the building needs a new surface, follow the
baths method in `materials.html` (`?only=a,b`, camera presets, `await bench(30, view, [2400, 1350])`):
research the construction from excavation photos (scale bars) first, generate it live with an integer
hash and the shared 512² grain tile, give it a distance fade that hands contrast to block-to-block tone and
mottling, add a Standard-tier variant, and compare panes with the user. Cost bar: High ≲ +10 ms with a wall
filling a 1080p × 1.25 screen on the Intel HD 620 test machine, near zero at street and aerial distance.

### 11. Put it in the game
For a building currently built by an old kit (all of the remaining ones), in this order:
1. `npm run import:keyplans`. The plan is picked up by `WorldBuilder` automatically through `KEY_PLANS`:
   placement with LOD, floors, footings, colliders, platform (`planFootprintBounds`), contact shadow, the
   reconstruction prompt, map click and HUD button.
2. **Remove the old kit's path:** its `build…` call, meshes, colliders and `addPlatform` entry in `WorldBuilder`
   (forum: `forum`, `forumColSpots`, the slab-top ground code and the shared column `InstancedMesh`; mansio;
   temples/church: `publicBs`, the solid-box loop and the temple column rows; amphitheatre: its own LOD kit).
   Delete the kit file (`kit/forum.ts`, `kit/mansio.ts`, …) once nothing imports it.
3. `townPlan.ts`: the building entry's size/rotation come from the anchor; its `anchorReserve` / `keyFootprints`
   stay correct; `reachesPlanBuilt` looks plan buildings up **by plan id in `buildings`** (a plan whose id has no
   matching entry, e.g. a joint forum-basilica plan, is not found: extend the lookup). Great Plan rings that reach the
   footprint become overlay-only (`underKey`), which is what stopped a 5.5 m wall running through the baths.
4. `WorldBuilder`'s ring-extrusion skip list (`KEY_SKIP`) and the collider skip for hollow kinds already cover the
   kinds; check the temple/church `boxes.key.push` path is gone.
5. Smoke test: add a block like the baths one (centre on the anchor, LOD tris decreasing and under 12k, entrance
   walkable, a solid wall blocks, element picking, the dev spawn near the building). Generalise it once there are
   two buildings.

### 12. Viewer content
`<id>.about.md` (what was found, what is reconstruction, the date shown, choices, sources with links;
copy the shape of `baths.about.md`), plus `name`, `dateShown`, `drawings`, and element `note`s in the plan JSON
(these are the tooltips). The "How it was made" tab loads the notes by id automatically.

### 13. Verify
`npm run check`, `npm run smoke`, `npm run build`, `npm run perf`. In the dev game walk: street front, through a
door, an interior, aerial, each Look setting (Auto/Detailed/Standard/Plain/Evidence), the viewer. Take the
screenshots the user will want to see. Record triangles and any measured cost.

### 14. Document and hand off
Update the brief's Decisions, the building's status line in `other-buildings.md`, `next-steps.md`, and memory.
Tell the user what is uncommitted. If a decision changed or a generic lesson emerged, fix this playbook.

## Lessons from the baths (pitfalls)

- **The pin was a strip.** About 40% of the building by area. Always compare the anchor with the ring envelope first.
- **The old models were never rotated or scaled,** only translated; the baths were turned 90° wrong. Expect
  the same of every old kit.
- **Great Plan ≈ historic plan within 20 cm,** so the rings are a faithful digitisation; the real work is
  reading the building's phases from the historic plan, not the GIS.
- **Every dated claim needs reading at source.** An early summary said the church was "next to the forum"; a
  search later put it in Insula XXXV. Treat memory and search summaries as leads (statuses in `other-buildings.md`).
- **The old textures collapse.** `remapUV` wraps per vertex, so faces spanning whole repeats show one smeared
  column. The new buildings use per-pixel tiling (`atlasTiled.ts`). Do not "fix" old kits; replace them.
- **Brick bonding must be evidence-bound.** Stacked joints look wrong; the photos show broken joints,
  half-bond bricks and small squared blocks. The user rejected varied course counts.
- **Cost depends on screen area, not building count.** Hence quality tiers and a distance fade; measure at
  2400 × 1350, not in a small pane, and take the best of several runs (GPU timing is noisy).
- **One ground level.** Key buildings stand on levelled platforms (`terrainSurface.ts`); place things with `gy`,
  not `sampleTerrain`. Plan buildings sit on the highest ground with footings, and walk on their floors.
- **Shell and tooling quirks (Windows, Git Bash):** template literals and backslashes get mangled in `node -e`
  one-liners (lost `\d` in a regex, ate backticks); write non-trivial patch scripts to the scratchpad and run
  them. Browser pane: screenshots time out when the page is busy (retry), viewport emulation must be reset,
  and `javascript_tool` has a ~45 s limit (start long work, then poll a `window.__x` flag).
- **Worktrees start empty of gitignored data** (see "Before you start" 4). A scratch venv can lose its
  `python.exe`: recreate it with `python -m venv` (installed packages survive).

## Lessons from the forum-basilica

- **The GIS rings are the truth for geometry** (user rule). Plans, texts and paintings decide which rings belong, what the
  openings are and what stood above; they never move a wall. A photographed book plan fits only to ~0.5–1 m: fine as a
  reading aid, never as geometry.
- **Large ring networks defeat `key-walls.mjs`** (one ring with 23 holes gave 61 broken runs). Rasterise the "in" rings in
  the building frame at 0.1 m and extract straight bands instead (`tmp/key-plans/forum-scripts/rasterwalls.py`); collinear
  runs merge across gaps, and gaps that line up with a perpendicular wall are junctions, not doors. Worth porting to
  `scripts/` if the next building is large. `key-plan-sheet.mjs` has the baths' size hard-coded (32 × 69 m).
- **Gaps in the survey can be foundations.** The forum's gateways show as gaps in the colonnade lines that match the
  recorded foundation lengths exactly. Read the gaps against the excavators' text.
- **Size conjecture from the evidence, not for prominence.** A first gateway was made taller to "read" as monumental;
  the user caught it. Scale unknown heights from the nearest real fragment (a column base) and say so.
- **Wall facing is per building** (`facing` in the plan). A new facing is a new pseudo-cell (`flint` shares the masonry
  slot, nudged so the shader can tell them apart) plus a style function with a distance fade and a Standard variant.
- **Joint plans need a lookup.** A plan whose id has no `buildings` entry (forum-basilica) uses its anchor for
  `reachesPlanBuilt`; give the old entries the plan's frame so map labels land on the right parts.
- **Flat GIS overlays show through open floors.** Rings wholly inside a plan-built building are now skipped in the 3D
  flat overlay (`WorldBuilder`), so left-out rings do not appear on its floor.
- **Tooling:** the scratch venv lost `python.exe` three times in one session (recreate with `python -m venv`, packages
  survive); heredocs with apostrophes in Python strings break in Git Bash (write scripts with the Write tool); the
  drawings and lab canvases follow the layout width, so emulate a wide viewport and post `toDataURL()` to a local
  receiver to save full-size PNGs; long `bench` loops stall when started in the background (run one view per call).

## Lessons from the mansio

- **Look for the Victorian reports on the Internet Archive first.** *Archaeologia* volumes are scanned with OCR text
  (`https://archive.org/advancedsearch.php?q=title:(archaeologia) AND year:1894&fl[]=identifier&output=json`, then
  `/metadata/<id>` for the `_djvu.txt` and PDF). Fold-out plates are scanned in overlapping pieces on consecutive pages.
- **Fit plates by chamfer matching, not by hand.** Threshold the plate's dark wall pixels, rasterise the in-rings at 0.1 m, and
  refine an affine so the pixels fall on the walls (truncated distance, shrinking cap). Report the share of wall pixels within
  0.3 m of a ring wall (mansio: 87–88%). Two hand points start it; a second piece of the same plate can reuse the first piece's
  scale. Script: `tmp/key-plans/mansio-scripts/chamfit.py`.
- **Few rings does not mean little surveyed.** The mansio's "4 rings" were whole wall networks. Count holes and area, and plot them.
- **Rooms do not come from ring holes.** Most rooms are open to a corridor somewhere, so they are not closed holes; define rooms by
  hand from the wall grid.
- **Walls must not show through roofs.** Derive each wall's height from the roofs beside it (gable eaves; a wall under corridor
  lean-tos only stops at the slope's low point; `closeEnds` fills the triangle), and **split walls where the roofs beside them
  change height** (a long south wall ran along a 3.2 m corridor and 6 m bath rooms). Check every wall top against the roof surface
  (`roofcheck.py`), ignoring the last 0.5 m at each end. The user spotted this in the 3D view.
- **A gap between two surveyed walls goes up to the eaves.** Where it is a doorway, add a short wall across it with an opening, so
  there is a lintel and wall above.
- **Write down why each conjectured height is what it is** (the user asked): storeys from the evidence for stairs, heights from
  what has to fit (door, corridor roof at 22°, clerestory) and checked against a rule (Vitruvius VI.3.8: oblong rooms half the sum
  of length and width).
- **Rename the anchor to the plan id** when widening it (`mansio-courtyard` → `mansio`): `reachesPlanBuilt` and `townPlan` then need
  no special lookup.
- **Smoke picks must be exterior.** LOD1 is a shell, so an interior door is not pickable there.
- **Tooling:** the drawings page's canvases are 300 × 150 until the page paints; take a screenshot first, then post `toDataURL()`
  to a local receiver. `cat > file` with no heredoc waits on stdin and hangs the shell.

## Lessons from the amphitheatre

- **The Great Plan is not the only geometry.** Where the Antiquaries never dug (outside the walls), look through the other GIS layers'
  metadata: layer 04 is "the stone phase of the Amphitheatre". A building may have **no Victorian report** at all; say so early.
- **A building that is not a wall plan gets its own plan element**, with its geometry in one pure module (`domain/arenaPlan.ts`) that
  the mesh, walking (`floorAt`), the ground hole and the smoke test all read, so they cannot disagree.
- **Things below the ground** need a hole in the ground mesh (`GroundHole`: grid lines on its edges, cells skipped) filled by the
  building out to an apron, a floor that **overrides** the terrain (`floorOverrides`), and no contact-shadow decal (it would float).
- **Measure reconstruction drawings against their scale bar** (a phone photo is fine for heights): Fulford's section gave the wall,
  row count, rise and crest height.
- **Section caps need closed solids**: a buried face left out of the mesh must still be emitted when `solidOnly`, or the drawings fill
  it dark. Outside elevations of a sunken building show what is below ground (no earth in front): use sections instead.
- **Old kits can cost many draw calls**: the amphitheatre kit was 13 meshes; the plan building is one.
- **Ask for site photographs of what survives.** The user's photos of the recess walls replaced a borrowed facing (tile courses) with
  the real one (single ironstone courses at uneven heights). Where the evidence shows irregular spacing, the style follows it.
- **GLSL needs functions declared before use**: a shared helper called from an earlier function needs a forward declaration, or every
  building's shader fails to compile (the materials lab shows only sky and ground; read the console).
- **Bot-protected journal sites** (Anubis): `WebFetch` is refused, but the browser pane passes the check by itself; read the PDF in
  the page with pdf.js from cdnjs (`getTextContent`). Don't copy its cookies to other tools.
- **Tooling:** check views in the browser by importing the generator through Vite in the page (`import('/src/...ts?t=' + Date.now())`)
  and rendering fixed cameras to an overlay canvas; post `toDataURL()` to the local receiver for full-size pictures.

## Lessons from the town wall and gates

- **Not every "building" is one plan.** A 2.4 km circuit got its own generator on a line, with the gates as ordinary plan buildings
  whose `curtainEnds` say where the generator stops. Share the section (`kit/curtain.ts`) so the two cannot differ.
- **The GIS can be wrong about what the game drew.** The old north gate sat 120 m from the one in the GIS: always plot the model's
  positions against the GIS before trusting either.
- **Check what the GIS drew against the report's numbers.** The gate plans matched the 1890 dimensions to centimetres, but the wall strip
  is the upper wall (2.4 m), not the base (2.97 m): it took the 1890 text and a counterfort in the GIS to read that.
- **A platform per building adds terrain grid lines across the whole map** and cuts every draped decal along them (+40k triangles for
  seven gates). For small buildings level the ground locally in a mesh of their own instead.
- **Two levels need feet.** A wall-walk over a passage cannot be a single floor height: pass the walker's foot height and let decks count
  only within a step of it; give colliders a top.
- **Masks must not shrink inside the drawn area**: a mask shrunk per quad left the ground poking up between neighbouring quads (a
  checkerboard). Mask whole quads aligned to the mask's pixels, and lift the replacement's edges a little so no crack opens.
- **Python on Windows writes files in cp1252 by default**: pass `encoding='utf-8'` or en dashes and ½ turn into "�" in the viewer.
- **Tooling:** the materials lab needs every new cell's uniform declared in the GLSL header as well as passed (only sky and ground show
  otherwise); `shots.ts` builds the world through Vite and renders fixed cameras to the receiver, the quickest way to see a whole circuit.

## Kickoff prompt (paste into a new session)

Replace `<BUILDING>` with the building's name as its heading in `other-buildings.md` (e.g. Temples, Church).

```
Rebuild the <BUILDING> as a plan-built key building, like the baths, forum-basilica, mansio and amphitheatre.

Read these first, in order:
1. docs/key-buildings/playbook.md: the method, the decisions not to reopen, and the "Lessons" sections (baths, forum-basilica, mansio, amphitheatre).
2. docs/key-buildings/next-steps.md: current state, key files, gotchas.
3. docs/key-buildings/other-buildings.md, the "<BUILDING>" section (what is known, open questions, code touchpoints) and "Cross-cutting leads".
4. The worked examples: docs/key-buildings/mansio.md (the most recent: sources, materials table, the reasoning for every height) and
   assets/key-plans/mansio.*; then baths.md and forum-basilica.md for anything the building shares with them.
5. The scratch scripts in tmp/key-plans/mansio-scripts/ to adapt (raster walls, plate fit, plan writer, roof check, review pictures;
   they have the mansio's ids and coordinates written in).

Rules for this session:
- Read every source at the document itself, not just search summaries. Tag every claim in the brief as read (✔), search summary (◐)
  or recollection (✎), and correct other-buildings.md as you verify things. Start with the Creighton & Fry 2016 PDF linked there,
  then the Victorian Archaeologia reports on the Internet Archive.
- Start by confirming the "Before you start" items with me, then audit the footprint. Show me plain pictures to approve at steps 2, 5,
  6 and 9.
- Tell me early what LOD0 triangle cap you expect to need (baths 12k, mansio 16k, forum-basilica 20k), or whether the detailed level
  should be built only on approach, and agree the approach with me.
- In the brief, write down why each conjectured height, storey and opening is what it is, and give materials their own table
  (what is shown, the source, the evidence level), including any defaults the generator supplies.
- Make sure every enclosed space can be entered, and that no wall shows through a roof (check every wall top against the roofs).
- Run the checks in playbook step 13 before finishing. Do not commit; I will commit in GitHub Desktop.
```
