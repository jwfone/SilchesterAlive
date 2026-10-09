# Baths — research brief

Status: **draft for review** (pilot building for the key-building remodel).
Target period: **late 3rd century AD** (agreed). Ring refs (`r687` etc.) are Great Plan wall rings in
`tmp/audit-buildings/raw.geojson`; review them with `node scripts/key-review.mjs baths`.

## Sources

- **Hope & Fox 1905**, "Excavations on the site of the Roman City at Silchester, Hants, in 1903 and 1904",
  *Archaeologia* 59, 333–70. The multiphase plan with room names and an "order of work" key
  (6 relative phases, no absolute dates). Reproduced as fig. 14 of Fulford et al. 2019.
- **Fulford et al. 2019**, *Silchester Roman Town: The Baths 2018* (University of Reading interim).
  [PDF](https://research.reading.ac.uk/silchester/wp-content/uploads/sites/33/2019/11/Silchester-Baths-Interim-Report-2018.pdf)
- **Fulford et al. 2020**, *Silchester Roman Town: The Baths 2019* (University of Reading interim).
  [PDF](https://research.reading.ac.uk/silchester/wp-content/uploads/sites/33/Unorganized/Baths-final_compressed.pdf)
- **Silchester Mapping Project** (Creighton with Fry 2016): Great Plan wall rings in our GIS import.

The full excavation monograph is not yet published, so the phasing below may change.

## Georeferencing

The 1905 plan has been fitted to the Great Plan rings with a 6-point affine fit. Residuals are **0.06–0.18 m**,
so the Great Plan rings for the baths are a faithful digitisation of the 1905 plan. Control points are in
`assets/key-plans/baths.review.json`. The image itself stays in `tmp/research/` (not committed).

**Footprint:** the building occupies about **E 464169.8–464196.5** (main block, ~26 m wide) plus the
latrine to **E 464199.2**, and **N 162272.8–162339.1** (~66 m with the furnace annex). The pinned strip in
`assets/key-buildings.geojson` (E 464172.5–464185.5) covered only the west half; it has been widened (see
Decisions).

## Development (summary)

| Date | What happened | Source |
|---|---|---|
| Claudian? | Small brick building, 9 × 6.4 m, east of the later tepidarium. Latrine or water-lifting house beside the Iron Age ditch. **Survives as part of the baths until the 4th c.** | 2019 |
| c. AD 55–65 | First civic baths (Neronian), skewed to the Iron Age ditch, not the later street grid. Greensand-and-brick façade with a colonnade, flint latrine block at the E end. Probably completed, then largely demolished. | 2018, 2019 |
| c. AD 85 | **Flavian rebuild** on a footprint 27% larger, same orientation. The façade, latrine and part of the palaestra wall are kept. Floors raised ~0.5 m. Plan ≈ the 1905 plan without later changes. | 2019 |
| Flavian | Hypocausts either side of the apodyterium filled in and tiled over. Latrine extended west to the entrance (trapezoidal, follows the new E–W street). Entrance piers rebuilt higher (ground up ~0.7 m). | 2018, 2019 |
| later | Masonry base 3.4 × 2 m inserted in the west tepidarium (pool or statue base?). | 2019 |
| **later 3rd or 4th c.** | ⚠ Latrine rebuilt as a rectangle (cuts into the street). | 2018 ("likely") |
| **late 3rd or 4th c.** | ⚠ West tepidarium replaced by a smaller one with a 5.8 × 3.4 m west extension and a new furnace fired from the east. | 2019 |
| late 3rd or 4th c. | Long stretch of the east wall rebuilt (tile courses of Minety tegulae). Same line, so no plan change. | 2019 |
| **after AD 388** | ✗ Claudian building demolished; replaced by the composite-hypocaust room (9.75 × 7.45 m) on the east side. | 2018, 2019 |
| to c. AD 400 | Baths in use to the end of the Roman period. | 2019 |

**1905 phase rule.** Two features the 2019 report dates late (the east composite hypocaust after AD 388 and
the west tepidarium extension) are both **phase 6 (green)** on the 1905 plan. Proposed rule: model the
building as it stood at the end of 1905 phases 1–5, and leave out phase-6 work. That also removes the
**green east apse of the caldarium**, which has no independent date.

## Layout in the late 3rd century (north → south)

Approximate dimensions are taken from the Great Plan rings.

1. **Street front.** The E–W street runs past slightly askew. Façade wall of Greensand blocks with brick
   string courses, fronted by a colonnade of small Painswick limestone columns on a brick stereobate.
   **Central entrance between brick piers ~3.2 m apart.** West half of the colonnade still standing (bases
   buried by the risen ground). East of the entrance the colonnade was demolished for the latrine
   extension. (`r1141` is the long askew band on the 1905 plan along the street: probably the street
   edge, not part of the baths — confirmed.)
2. **Latrine** (NE corner, `r2010`/`r2013`/`r2018` area, rings around E 464184–199, N 162330–339). Flint
   with brick coursing. Water channel 1.05 m deep round three sides, fed from the west by a channel in
   front of the façade through a brick arch. **Trapezoidal** (Flavian extension; the late rectangular rebuild is omitted).
3. **Palaestra / peristyle** (~25 × 18 m). Open court with a colonnaded ambulatory. The inner wall
   (`r684`/`r685`/`r686`) is flint with brick quoins and has a central gap on the N–S axis. Ambulatory
   floor: white chalk tesserae with some black Kimmeridge stone and hexagonal ceramic tiles.
4. **Apodyterium** (changing hall, ~26 × 8 m). Full width. The side hypocausts were filled in and tiled
   over, so it is one tiled hall (red patches on the 1905 plan).
5. **Frigidarium row** (~6 m deep). Frigidarium in the centre, with a labrum (basin) marked by a circle.
   **Cold bath** (plunge) to the west. A heated room to the east. Frigidarium floor: polished, marbled
   opus signinum, later a coarser signinum.
6. **Tepidarium row.** West tepidarium (hypocaust; furnace at its west end, narrowed there), with the
   later 3.4 × 2 m masonry base. Central tepidaria. On the east: **the Claudian brick building
   (9 × 6.4 m)** in place of the post-388 hypocaust room. *Its appearance is unknown; model as a
   plain roofed annex.*
7. **Caldarium.** Hypocaust, **west apse** (phase 1, black on the 1905 plan). East apse omitted under
   the phase-6 rule.
8. **Second caldarium** ("Destroyed Caldarium" on the 1905 plan, phase 3), with an **east apse and
   annex** (phase 5) — `r1999`, `r2000`, `r680`.
9. **Furnace annex** (praefurnium, phase 5, `r675`), projecting south, ~5.5 m wide.

The Iron Age "Inner Earthwork" ditch runs immediately east of the building (open/boggy ground down to the
stream). The ground west of the baths in the same insula was largely open.

## Construction and finishes (for modelling)

- **Main walls:** courses of Greensand blocks alternating with red brick bonding courses. Walls ~1 m thick.
- **Palaestra inner wall:** flint with brick quoins.
- **Latrine:** flint with brick courses (late rebuild: cemented gravel, flint and brick).
- **Columns:** small limestone columns (Painswick on the façade; one Bibury drum 0.25 m diameter from the
  peristyle). Short, domestic scale, not monumental.
- **Floors:** chalk-white tesserae with black, hexagonal tiles (palaestra); polished opus signinum
  (frigidarium); tiled (apodyterium); suspended floors on bessalis pilae (heated rooms).
- **Walls inside:** fine plaster (pink found in the Neronian phase), painted fragments and mouldings.
- **Roofs and vaults:** tegulae and imbrices. Voussoirs (solid and hollow) and box-flue tiles found,
  so the hot rooms probably had **vaults** with heated walls.

## Not known (to be conjectured and flagged)

- Wall heights and roof forms. Use comparanda (Wroxeter, Caerwent, Bath; Romano-British bath blocks).
  Proposed: vaulted hot rooms under tiled pitched roofs; timber roofs over the apodyterium and palaestra
  porticos; clerestory windows on the hot rooms.
- The 1905 phase colours for every wall. The Great Plan "shade" layers are **not** the 1905 phases:
  shade 1 contains both the phase-1 west apse (in `r687`) and the phase-6 east apse (`r682`). So phase
  has to be read wall by wall from the underlay, not from the shade.
- Whether the north frontage colonnade was raised when the ground rose (2018 suggests it probably was).

## Decisions (agreed 2026-10-08)

1. **Footprint widened.** The anchor in `assets/key-buildings.geojson` is now the min-area rectangle
   around the baths rings: 66.2 × 29.8 m, turned 1.6° off grid north (it follows the Iron Age ditch,
   not the street grid). Regenerate with `node scripts/import-gis.mjs --keys-only`.
2. **Phase-6 rule adopted.** Omit all 1905 phase-6 (green) work, including the caldarium's east apse
   and the post-388 east hypocaust.
3. **On-the-line features: earlier state of both.** The latrine is shown **trapezoidal** (Flavian
   extension, not the late rectangular rebuild). The west tepidarium is shown **original, with the
   3.4 × 2 m masonry base**, without the late extension. Reason: both changes are dated "late 3rd or
   4th c.", and the latrine rebuild belongs with the street having risen almost to modern ground level.
   For a snapshot just after the stone town wall (c. AD 270–280), the earlier states are the safer
   reading.
4. **Ring review done.** All rings classified as in `baths.review.json`. `r1141` (street-side band) is
   **not** part of the baths.

## Wall plan

Curated plan: `assets/key-plans/baths.plan.json` (rooms, walls with openings, apses, columns, roofs) in the
building frame. Draft wall runs come from `node scripts/key-walls.mjs baths`; the plan sheet for checking it
against the 1905 plan is `node scripts/key-plan-sheet.mjs baths --no-draft` → `tmp/key-plans/baths.sheet.html`.

Readings worth knowing:
- The palaestra has **two parallel walls** on the west (u 0.45 / 2.5) and east (u 23.2 / 26.3). The inner
  ones are the Neronian outer walls, demolished when the Flavian baths expanded 2 m west and 3 m east
  (2018, 2019). Only the outer walls are modelled. Likewise the inner pair of court walls (u 6.1 / 19.9)
  is the Neronian peristyle; the outer pair (u 4.0 / 22.6) gives an even ~3.6 m ambulatory and is used.
- Everything lines up on a central axis at **u ≈ 13**: street entrance, gaps in the court walls, the two
  symmetric doors into the apodyterium (u 8.4 / 17.9), the labrum.
- Most doorways inside the bath block are **conjectural** (the 1905 plan shows floors, not thresholds), as
  are all heights and roofs; they are flagged `conjecture: true` in the plan.

## Elevations: evidence and rules

Evidence levels: **S** = Silchester (2018/2019 interim reports, 1905 report), **C** = comparison (standing
Roman buildings, Vitruvius), **X** = conjecture. Everything above ~1 m is a reconstruction.

### What the Silchester reports give us (S)

| Element | Evidence | Source |
|---|---|---|
| Wall build | Courses of squared Greensand blocks with **bands of red brick courses** (2–4 courses per band; photos 2018 figs 7, 10, 11; 2019 fig 15). Flavian bricks are red London Clay fabric. Walls ~1 m thick. | 2018, 2019 |
| Palaestra inner wall | Flint with brick quoins (corners); carried a colonnade round the court. | 2018 phase 2, 2019 |
| Latrine | Flint with brick coursing; water channel 1.05 m deep; brick arch for the inflow. | 2018 |
| Façade colonnade | Small **Painswick limestone columns on a brick stereobate** (low plinth). Stumps survive 0.33–0.4 m. A peristyle column drum is **0.25 m** in diameter (Bibury stone). | 2018, 2019 |
| Entrance | Between **brick piers c. 3.2 m apart**, rebuilt higher when ground rose ~0.7 m; the colonnade probably raised too. | 2018 |
| Hot-room vaults | **Hollow and solid voussoirs** (arch bricks) and **box-flue tiles** found: masonry vaults, heated walls. | 2018 finds |
| Roofs | Tegulae and imbrices (flat and curved roof tiles). | 2018 finds |
| Windows | **Glazed**: "portions of several large panes of window glass" found west of the cold bath in 1903–4. | Hope & Fox 1905 |
| Interior | Fine wall plaster (pink), painted fragments, mouldings; opus signinum and polished marbled floors; white chalk tesserae with black, hexagonal tiles. | 2019, 2018 |
| Levels | Floors raised ~0.5 m in the Flavian rebuild; ground and street rose ~0.7 m later. | 2019, 2018 |

### Comparisons (C)

- **Wroxeter, Old Work:** standing frigidarium / basilica wall, **~7 m** high, with a large central doorway.
  Wroxeter is a bigger, later (2nd c.) complex, so Silchester's halls were probably a little lower.
- **Leicester, Jewry Wall:** baths / palaestra wall, **~9 m** high, two large arched openings at floor level
  and arched niches.
- **Ravenglass:** small military bath-house surviving to near full height in places (**~4 m**): coursed
  stone, doorways, windows, niches, arches, pink render inside.
- **Great Chesters:** glazed caldarium window in an apse, about **1.5 m high × 1.2 m wide**, sill ~0.3 m
  above the inside floor, splayed (1.2 m inside narrowing to 0.9 m outside). Most Roman window panes
  were small (30–40 cm), set in frames.
- **Hollow-voussoir vaults** were a bath-house technique: light, moisture-proof barrel vaults (Wroxeter,
  Canterbury, Bath; Lancaster 2015).
- **Vitruvius V.10:** hot rooms lit from the **south-west** (or south), the basin (labrum) set **under a
  window**, masonry vaults preferred and doubled in hot rooms, rendered underneath with tile-and-lime
  then stucco; room breadth about a third (or two-thirds) of length. **Vitruvius IV.7:** Tuscan column
  height ≈ 7 × lower diameter.
- **Roof pitch:** Roman tile roofs were low-pitched (tiles held by weight). Commonly quoted ~22°; no good
  British measurement found.

### Rules for the model (proposed)

| Part | Rule | Level |
|---|---|---|
| Ground and floors | One walking level (late street level); pools sunk below it; hypocaust floors shown as raised floor with pilae visible at the stoke holes. | S/X |
| Exterior walls | Exposed Greensand with red brick bands every ~1 m; brick quoins at corners and openings. Exterior render unproven either way, so we show the masonry. | S/X |
| Interior walls | Plastered: pink/white with a painted dado in the bath rooms. | S |
| Palaestra outer walls and façade | 4.5 m high enclosure wall. | X |
| Ambulatory | Lean-to tile roof, high side 4.3 m on the outer wall, low side ~2.9 m on the colonnade. | C/X |
| Peristyle colonnade | 0.25 m columns, ~1.9 m tall on a 0.6 m dwarf wall, timber beam over. | S/C |
| Street portico | 0.3 m columns ~2.3 m tall on the brick stereobate, lean-to roof against the façade (low side ~2.8 m). | S/C |
| Entrance | Brick piers 3.2 m apart, brick arch to ~4.2 m. | S/X |
| Apodyterium | Eaves 6.5 m, timber roof; **clerestory windows** in the north wall above the ambulatory roof. | X |
| Frigidarium and cold bath | Tallest range: eaves 8 m (cf. Wroxeter 7 m+). Vaulted. High windows; one over the labrum. | C/X |
| Tepidaria, caldaria | Barrel vaults along the room's long axis, springing ~4.5 m, crown ~7.5 m; walls to 7 m; tile roof over. Windows ~1.2 × 1.5 m, glazed, on south/west/east faces (Vitruvius), including in the apses. | S/C |
| Apses | Half-domes under conical half-roofs. | C |
| Roofs | Red tegula-and-imbrex roofs at ~22°, ridge tiles, small eaves overhang. | S/C |
| Latrine | Eaves 4.5 m, gable roof, small high windows. | X |
| Early brick building | Brick walls, eaves 4.5 m, gable roof. | X |
| Furnace (praefurnium) | Low (3.5 m) roofed shed with an opening at the stoke end; boiler base. | C/X |

### Elevation sources

- English Heritage, Wroxeter Roman City: description (Old Work ~7 m).
  <https://www.english-heritage.org.uk/visit/places/wroxeter-roman-city/history/description/>
- English Heritage, Jewry Wall: description (9 m, arched openings).
  <https://english-heritage.org.uk/visit/places/jewry-wall/history/description>
- Historic England list entry 1009352, Ravenglass bath-house (Walls Castle).
  <https://historicengland.org.uk/listing/the-list/list-entry/1009352>
- Great Chesters caldarium window (vici.org). <https://vici.org/vici/12672/?lang=en>
- Hope & Fox 1905, window glass west of the cold bath (Archaeologia 59).
  <https://www.cambridge.org/core/journals/archaeologia/article/xvii-excavations-on-the-site-of-the-roman-city-at-silchester-hants-in-1903-and-1904/497DF6A7BF664B1EFDF27647938BFF54>
- Vitruvius, *De architectura* V.10 (Morgan translation). <https://lexundria.com/vitr/5.10/mg>
- L. C. Lancaster, *Innovative Vaulting in the Architecture of the Roman Empire* (CUP 2015), hollow voussoirs.
- Imbrex and tegula (roof system). <https://en.wikipedia.org/wiki/Imbrex_and_tegula>

## Generated model and drawings

The model is generated from `assets/key-plans/baths.plan.json` by
`src/presentation/kit/planBuilding.ts` (one merged mesh, one material: `atlasTiled.ts`).
Drawings: `npm run dev`, then <http://localhost:5173/tools/elevations.html?id=baths>. That page has
the street front, a section through the hot rooms, a long section on the central axis, the west elevation
and a 3D view. Each is shown coloured by evidence level (green Silchester, amber comparison, red
conjecture) or by material.

Size at each level of detail (whole building): **LOD0 ~4,100 triangles, LOD1 ~1,600, LOD2 ~560**,
against ~148,000 for the whole town today.

Modelling choices to review:
- **Frigidarium** has a timber roof rather than a vault, so a clerestory window can light the labrum
  (Vitruvius V.10). The cold bath, heated room, tepidaria and both caldaria are barrel-vaulted
  (voussoirs found) under tiled roofs.
- **Clerestory windows** light the apodyterium (above the ambulatory roof) and the frigidarium (above the
  apodyterium and tepidarium roofs).
- **Pools** are shown as raised basins with a rim. The game's ground cannot be cut away for sunk pools.
- **Entrance**: brick piers with a brick arch rising to ~5.3 m, above the 4.5 m façade wall.
- Hypocaust pilae, the latrine channel and the furnace boiler base are not modelled yet.

## Wall facing: coursing and bonding (from the excavation photos)

Estimated against the scale bars in Fulford et al. 2018 (figs 7, 10, 14) and 2019 (figs 8, 12, 15). These
are estimates from low-resolution report photos, not measured drawings.

- **Greensand facing:** small squared blocks in level courses (*petit appareil*). Course heights about
  **0.10–0.15 m**; block lengths about **1.3–2 × the course height (≈0.15–0.30 m)**, varying block by
  block. **Joints are always broken:** each block sits across a joint in the course below. Mortar joints
  about 1.5–2 cm.
- **Brick bonding courses:** long thin bricks (lydion type, about **0.40–0.45 m** on the face, 4–4.5 cm
  thick) in thick mortar (about 2 cm), each course **half-overlapping** the one below, with the occasional
  broken half-brick reused. Bands of 2–4 courses occur at Silchester; the model uses **3 throughout**,
  since there is no evidence for varying the count within one wall.
- **Model rules (F style):** bands every 0.8 m; 0.6 m of Greensand in **5 courses** (0.12 m ± 1.5 cm), then
  3 brick courses of 0.067 m. Joints are jittered around a half-bond grid (stone: mean 0.22 m, ±12%;
  brick: mean 0.44 m, ±5%), so neighbouring courses' joints are always at least about a quarter-block
  apart. Cost at 1080p × 1.25 on an Intel HD 620: about +6 ms over the old texture with a wall filling the
  screen, and within noise at street level.

## Roof tiles: tegulae and imbrices

Evidence levels as above: **S** Silchester, **C** comparison, **X** conjecture. Nothing survives of the
baths' roofs in place, so the laying is reconstructed from the tiles themselves and from Romano-British norms.

### What Silchester gives us (S)

| Point | Evidence | Source |
|---|---|---|
| Roof covering at the baths | "Tegulae, imbrices, brick and tile" in the ceramic building material from the 2018 trenches (mostly from the backfill of the 1903–4 trenches); a tegula stamped "FR"; a Nero-stamped tile from the cess pit by the latrine. | Fulford et al. 2019 (2018 season) |
| Tegulae reused in the late baths | A drain along the south wall of the peristyle **covered by a continuous row of complete tegulae**; the late 3rd/4th-c. rebuild of the east wall used (or reused) **Minety (Wilts.) tegulae** in its tile courses. | Fulford et al. 2020 (2019 season) |
| Tegula sizes in the town | Insula IX: 16 complete tegulae **0.386–0.492 m long**. Upper breadths **0.351–0.364 m** (0.351 × 0.408 m Group D; 0.361 × 0.472 and 0.364 × 0.492 m Group C). Later (Group D) tiles are the shortest. | Clarke, Fulford, Rains & Tootell (Internet Archaeology 21) |
| Imbrex sizes in the town | Insula IX complete imbrices **0.403 and 0.405 m**; Victorian-excavation imbrices **0.365–0.417 m**. | same |
| Fabric and colour | Red fabric, probably from the Reading clay beds, **colour varying with firing**; one tile in a white "Eccles" fabric; a dark red slip on one tegula, white slip on two imbrices. | same |
| Repairs | A roof of mixed Group A–C tiles is read as an early roof **repaired with newer tiles**. Large Group C tegulae are often **longitudinally convex**, made for vaulted bath-house roofs. | same; Warry 2006 |

### Comparisons (C)

- **Typology and date (Warry 2006):** tegulae shrink over time (Group A to c. AD 120, B 100–180, C 160–260,
  D from 240). Hartlip villa summary: about 0.48 m early, falling to about 0.41 m by AD 240. A 3rd-century
  roof needed ~40% more tegulae than a 1st-century one. Early roofs were laid on mortar or daub without nails;
  later ones on battens with the bottom row nailed. From the mid-3rd century, every other tegula was nailed or
  dowelled, and **pitch may have increased**.
- **Range across Britain (Brodribb survey, via Warry):** tegulae 0.305–0.59 m long, flange height at the lower
  end 28–82 mm. Imbrices 0.315–0.54 m long and tapered (wide end 0.225 m at most, narrow end 0.095 m at least),
  section from a full half-round to an angular arch. Dorchester (Durnovaria) examples: 0.285 m long, 0.16 / 0.12 m
  wide, 75 / 45 mm high; and 0.37 m long, 0.15 / 0.10 m wide, 70 / 55 mm high.
- **Laying:** tegulae lie in files down the slope, flanges up. Each tile's lower end laps over the upper end of
  the tile below, and the cutaways let the flanges nest. An imbrex covers each pair of touching flanges. Each
  imbrex is tapered, narrow end up the slope, and the wide end of the next one up laps over it. Rain runs off the
  imbrices into the tegula pans and down to the eaves.
- **Pitch:** tiles held by weight (and later the odd nail) imply **low pitches**. No British measurement has
  been found; 22° (the model's existing value) stays.

### Rules for the model

| Element | Rule | Level |
|---|---|---|
| Tegula | **0.45 m long, 0.36 m wide**, laid in files 0.36 m apart; **0.37 m of each course shows** (~0.08 m lap). Courses start at the eaves line; every course is the same, with no staggering, because files run straight down the slope. | S (size), C/X (lap) |
| Imbrex | Over every joint between files. **0.17 m wide at the lower end, tapering** up the slope, rising ~0.07 m; **0.33 m shows** per imbrex (~0.40 m long, ~0.07 m lap). Imbrex courses are independent of the tegula courses. | S (length), C (shape) |
| Ridge and hips | A row of imbrices along the ridge (and the ambulatory's hips), ~0.33 m showing each. | C/X |
| Eaves and verges | The tile edge (~3 cm) shown as a thin strip; no antefixes (none recorded at the baths). | X |
| Colour | Red Reading-clay fabric, **tone varying tile by tile with firing** (a few over-fired purplish-brown, a few under-fired pale orange, a very rare pale white-firing tile). | S |
| Weathering | Surface only: lichen patches, grime towards the eaves, broad colour drift, and **patches of newer, brighter replacement tiles** (repairs, as at Insula IX). Tile sizes and laying do not vary. | S (repairs), X (pattern) |
| Pitch | 22°, unchanged. | C/X |

**Not modelled:** convex tegulae on curved vault roofs (the model's hot-room roofs are pitched over the vaults),
nails, mortar bedding under the ridge, and slips.

### Roof tile sources

- Fulford et al. 2019, Baths 2018 interim, "Finds: ceramic building material" (see Sources above).
- Fulford et al. 2020, Baths 2019 interim: tegula-capped drain, Minety tegulae in the east wall rebuild.
- Clarke, Fulford, Rains & Tootell, *Silchester Roman Town Insula IX*, Internet Archaeology 21, "The Tile".
  <https://intarch.ac.uk/journal/issue21/4/finds_tile.htm>
- P. Warry, *Tegulae: Manufacture, Typology and Use in Roman Britain* (BAR British Series 417, 2006), via its
  chapter summaries <http://bleatings.blogspot.com/2006/08/tegulae-manufacturetypology-and-use-in.html>
  and secondary citations. Not read in full; the lap and pitch figures there should be checked.
- A Roman roof tile from Hartlip villa (Kent Archaeological Society, citing Warry 2006).
  <https://www.kentarchaeology.org.uk/magazine/119/12-a-roman-roof-tile-from-hartlip-villa>
- Wessex Archaeology, Dorchester County Hospital, "Ceramic building material" (imbrex dimensions).
  <https://www.wessexarch.co.uk/sites/default/files/projects/dorchester_county_hospital/13_Ceramic_build_mat.pdf>
- Imbrex and tegula (general laying). <https://en.wikipedia.org/wiki/Imbrex_and_tegula>

### Roof style (chosen 2026-10-09)

Compared in `tools/materials.html?id=baths&set=roof` (camera presets Roof detail, Roof close-up, From the
court, Roofscape; `snap(view)` in the console saves a labelled grid). The user chose:
- **High = R2**: generated tiles (`roofF` in `atlasTiled.ts`, style `hybrid`) plus ridge / hip cap rows and
  tile edges at eaves and verges (`buildFromPlan` `roofTrim`, on by default at LOD 0/1; about 300 triangles).
- **Standard = R3**: the same without fine grain, lichen or repair patches (`hybridLite`, one texture read).
- **Low**: plain, unchanged.

Lab baselines `paintedRoof` / `paintedRoofLite` keep the old painted roof for comparison. Measured cost of R1
at 2400 × 1350 against the painted roof: about +5–6 ms with a roof filling the screen, about +1.5 ms from the
court and from the air.
