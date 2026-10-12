# Forum-basilica: research brief

Status: **in game** (2026-10-11). Target period: **late 3rd century AD (c. 270–280)**.
Ring refs (`rNNN`) are Great Plan rings in `tmp/audit-buildings/raw.geojson`; review them with
`node scripts/key-review.mjs forum-basilica`.

Claim tags (user's rule for this building): **✔** read in the document itself (or the project data), **◐** from a
search summary only, **✎** recollection, unchecked. Evidence levels for the model: **S** Silchester, **C** comparison,
**X** conjecture. **The Great Plan rings are the fundamental truth for geometry** (user, 2026-10-11): plans, texts and
paintings only decide which rings belong, what the openings are and what stood above ground.

## Sources

- ✔ **Fox & St John Hope 1893**, "Excavations on the site of the Roman city at Silchester, Hants, in 1892",
  *Archaeologia* 53, 539–73; the forum and basilica, pp. 541–57 ("The architectural history of the forum and basilica").
  Read in the Internet Archive scan (OCR checked against the page images for the key numbers):
  <https://archive.org/details/sim_archaeologia-tracts-relating-to-antiquity_1892_53>. Plate XLI (the plan of Insula IV)
  is missing from the scan; the plate of the Corinthian capitals (XXXVIII) and the mouldings (XXXIX) are there.
- ✔ **Fulford 1985**, "Excavations on the sites of the amphitheatre and forum-basilica at Silchester, Hampshire: an interim
  report", *Antiquaries Journal* 65, 39–81. **Only the published extract read** (full text paywalled):
  <https://resolve.cambridge.org/core/journals/antiquaries-journal/article/abs/excavations-on-the-sites-of-the-amphitheatre-and-forumbasilica-at-silchester-hampshire-an-interim-report/A3710B0ACD88B2B617FA6699B05C2B50>.
- ◐ **Fulford & Timby 2000**, *Late Iron Age and Roman Silchester: Excavations on the Site of the Forum-Basilica
  1977, 1980–86* (Britannia Monograph 15). Not read; known through C&F 2016's summary (✔ that summary).
- ✔ **Fulford 2002**, *A Guide to Silchester*: the forum passage, the plan of the forum-basilica and the drawing of the
  Corinthian capitals, supplied by the user (photo in `tmp/research/fulford2002-plan.jpg`, `fulford2002-capitals.jpg`).
- ✔ **Creighton with Fry 2016**, *Silchester: Changing Visions of a Roman Town* (Britannia Monograph 28, Society for the Promotion of Roman Studies), pp. 38, 49
  (the Great Plan shades), 101–8 (Insula IV and the forum-basilica), fig. 5.31 (Fulford's phase plans).
  <https://centaur.reading.ac.uk/62521/>
- ✔ **Vitruvius**, *De architectura* V.1 (basilicas), Morgan translation: <https://lexundria.com/vitr/5.1/mg>.
- Reconstruction art (looked at, not evidence, not reproduced): Ivan Lapper's painting of the forum and basilica
  (Historic England archive, IC090; a copy was shown by the user), and a modern digital aerial view supplied by the user.
  Both show a tall clerestoried basilica, forum ranges standing above their porticos, and a monumental east gate.

## Georeferencing

- The **Great Plan rings** are the geometry. The main ring r1657 (shade 2, 1878 m², 23 holes) is the whole wall network;
  r732 (shade 1) is the west range; the court colonnade survives as ~40 small fragments.
- ✔ **Fulford 2002 plan** fitted with 6 control points (outer corners, court corners): residuals **0.4–1.1 m**. Above the
  playbook's 0.3 m target because the source is a photo of a schematic book plan; used only as a reading aid, never for
  geometry. Control points in `assets/key-plans/forum-basilica.review.json`.
- ✔ Outline: min-area rectangle of the modelled rings **95.6 × 85.9 m, turned 2.5°** (8,216 m²; Fulford 2002 "about
  0.8 ha" ✔). C&F 2016 note the "slight misorientation" of the whole complex ✔. The user's pin (97.3 × 81.6 m at 0.7°)
  has been replaced (Decision 4).

## Development (summary)

| Date | What happened | Source | c. 270–280 |
|---|---|---|---|
| c. 25 BC – AD 50/60 | Late Iron Age roads, roundhouses, palisade (Periods 1–3) | ✔ C&F 2016 | buried |
| AD 40s? | Period 4 timber ranges ("proto-forum"?) | ✔ C&F 2016 | gone |
| AD 80–90 | Period 5 Flavian timber forum-basilica: aisled hall with a cross-passage | ✔ C&F 2016; ✔ Fulford 2002 | gone |
| Hadrianic to c. AD 150 | **Period 6 masonry forum-basilica** (the building modelled) | ✔ C&F 2016; ✔ Fulford 2002 ("towards the middle of the 2nd c."); ✔ Fulford 1985 extract ("early second century") | **standing** |
| undated | Victorian reading: hall burnt and rebuilt late, one colonnade, apses squared | ✔ 1893 | **superseded**: the single colonnade is Period 6 (✔ C&F fig. 5.31; ✔ Fulford 2002) |
| mid-3rd – later 4th c. | **Metalworking in the basilica** (iron-smithing, some bronze-working) | ✔ Fulford 1985 extract; ✔ Fulford 2002; ✔ C&F 2016 (Period 7 pits) | **in progress** |
| to 5th c.? | Occupation of the basilica continues | ✔ C&F 2016 ("perhaps") | later |

**Phase rule (agreed):** show the Period 6 building as surveyed in the Great Plan, with the basilica in use as a
metalworking hall. Left out: r1855 (a second hall colonnade the Antiquaries drew by symmetry; Fulford found none) and the
strips across the north apse's mouth (r2049, r2050, r1856, r1857, r1860), so both tribunals open on the hall.

## Layout in the late 3rd century

Building frame: u east-ish, v north-ish, metres from the SW corner of the anchor (origin E 463885.0, N 162359.6, 2.52°).

- **Outer ambulatory** round all four sides (✔ 1893: "another ambulatory, which surrounds not only the forum but the
  basilica"), on a sleeper wall that carried columns (✔ 1893: Attic base and Doric capital found). 12 ft 6 in wide,
  15 ft on the west street front (✔ 1893); the rings give 4.4–5.6 m.
- **Basilica** (west side): hall 17.7 m wide inside, 72.9 m between end walls (✔ rings; ✔ 1893: 233 ft 6 in × 58 ft);
  **one colonnade** 4.65 m from the east wall (✔ rings r1858; ✔ 1893: sleeper wall 4 ft 6 in wide, 15 ft 2 in from the
  east wall), dividing a 13.2 m nave from a 4.65 m east aisle (✔ 1893: nave to aisle "roughly that given by Vitruvius";
  ✔ Vitruvius V.1: aisle a third of the nave). **Tribunal apses** at both ends, ~8 m wide (✔ rings; ✔ 1893: 27 ft 9 in
  wide × 18 ft 2 in deep, floors raised 2 ft 5 in). Doors from the inner ambulatories into the east aisle near both ends
  (✔ 1893; thresholds on ✔ Fulford 2002 plan). East wall 5 ft thick, the thickest on the site (✔ 1893).
- **West range**: hall (north), rooms, and in the centre the **apsidal "curia" or shrine** (✔ rings; ✔ 1893: segmental,
  38 ft wide, raised 2 ft 7 in, three steps, open on the hall over its full width; ✔ Fulford 2002: "apsidal marble-lined
  council chamber or shrine"). The southern room is one long room as surveyed (Decision 6), though 1893 and Fulford 2002
  show it divided.
- **Forum court**: open, about 40 × 45 m between the colonnade lines (✔ rings; ✔ 1893: "about 142 ft N–S by 130 ft E–W").
  Gravel over a mortar bed, 10–12 in below the ambulatory floors; a great drain out through the east gate (✔ 1893).
- **Inner ambulatory** on three sides (N, E, S); the basilica's east wall bounds the court on the west (✔ 1893). 16 ft
  wide, 19 ft from wall to curb (✔ 1893); rings 5.7–6.4 m.
- **Ranges**: north and east mostly shops opening on both ambulatories (✔ 1893, probably); the north range has an
  **exedra** 23 ft wide opening on the inner ambulatory (✔ 1893); the south range alternates **two apsidal chambers**
  (25–26 ft wide, 27 ft deep) with square rooms: offices or courts (✔ 1893). Range depths 31 ft, 29 ft 6 in, 42 ft 6 in
  N/E/S (✔ 1893). **Passages** at the basilica ends of the north and south ranges, the south one with a door in its
  south wall (✔ 1893; ✔ gap in the rings).
- **Main entrance** (east): an outer and an inner gateway on concrete foundations 49 ft and 41 ft long, 5 ft wide, about
  5 ft south of the centre to face the street from the east gate (✔ 1893; ✔ C&F 2016 "c. 1.5 m"; ✔ the gaps in the
  ring lines, 14.3 and 12.7 m, centred on the drain); "a structure of the description of a triumphal arch" (✔ 1893);
  an inscription in letters 28 cm high (✔ Fulford 2002). A vestibule between them interrupts the east range (✔ 1893).

## Construction and finishes (for modelling)

- **Walls**: **flint rubble with bonding and lacing courses of tile** (✔ 1893, for the basilica and all three forum
  ranges); range walls 2 ft 3 in – 3 ft 7 in thick (✔ 1893). Concrete foundations (✔ 1893). The west range rebuilt in
  poorer masonry (✔ 1893). **Needs a flint wall style** (Decision 5; materials lab, step 10).
- **Columns**: basilica Corinthian, about 8.6 m (✔ Fulford 2002) / 27 ft (✔ 1893), lower drum 2 ft 10 in (✔ 1893);
  capitals linked with Rhenish masons (✔ C&F 2016, citing Liversidge 1968 and Boon 1974); court colonnade shafts 1 ft 10–11 in, 14 ft 5 in apart, at least
  15 ft 6 in high, with a timber entablature (✔ 1893); outer colonnade: Attic base, Doric capital (✔ 1893, sizes not read).
- **Floors**: ambulatories probably brick or opus signinum (✔ 1893); hall: Joyce saw a concrete floor and red tiles at the
  north end (✔ 1893), but Fulford found no flooring and wondered if it was ever finished (✔ Fulford 2002), while Fulford &
  Timby read the gap in features as a robbed solid floor (✔ C&F 2016). For c. 270–280: **earth** (smithy). North tribunal
  and curia: red tile tesserae; south tribunal: fine white mosaic (✔ 1893).
- **Finishes**: Purbeck marble on the tribunal fronts; white marble dado in the curia; painted plaster, red and yellow ochre
  and white round the north apse, salmon, pale blue and green in the curia (✔ 1893).
- **Roofs**: tegulae and imbrices (assumed as at the baths; ✔ 1893 suggests "large Roman tiles or hexagonal stone slabs").

## Not known (to be conjectured and flagged)

Heights above the column tops, roof forms, windows (form and glazing), the column spacing in the hall, the gateways'
superstructure, most doorways, the number and places of the smithing hearths, the outer columns' size, and whether the
ranges had an upper storey (✔ 1893 thought it possible). 1893 proposed a flat terraced roof on the inner ambulatory to
light the rooms; the model uses pitched lean-tos with windows above them instead (as the reconstruction paintings do).

## Decisions

1. **Ring classes** (2026-10-11, user): r1855 left out (one colonnade, Fulford 2002 plan); tribunals **open** to the hall.
2. **Phase rule** (2026-10-11): Period 6 as surveyed; basilica in use as a **metalworking hall** with an earth floor and a
   few hearths; tribunals and curia keep their floors and linings.
3. **GIS is the truth** (2026-10-11, user): geometry from the rings; sources only interpret them.
4. **Anchor refitted** (2026-10-11): `assets/key-buildings.geojson`, `user-approved-outline`, 95.6 × 85.9 m at 2.5°.
5. **Flint walls** (2026-10-11): a new flint-and-tile wall style via the materials lab (step 10).
6. **West range south room** (2026-10-11, user): follow the GIS (one long room).
7. **Vestibule** (2026-10-11, user): the ring line across it is treated as a foundation and opened.
8. **LOD budget** (2026-10-10, user): per-building LOD0 cap (forum 20k), distance LOD unchanged.
9. **Gateways** (2026-10-11, user): sized from the evidence, not for prominence: outer ~9 m with one arch and engaged columns scaled from the 1893 base; inner 7.5 m, one plain arch. (An earlier draft at 12.5 / 10.5 m with triple arches was conjecture chosen to look monumental, and was dropped.)
10. **Flint bonding courses** (2026-10-11, user): **K2**, two tile courses per band (`FLINT_TILE_COURSES` in `atlasTiled.ts`).
11. **Overlay** (2026-10-11): Great Plan rings lying wholly inside a plan-built building get no flat ground overlay (`WorldBuilder`), so left-out rings such as r1855 do not show on the floor; the 2D map is unchanged.

## Wall plan

`assets/key-plans/forum-basilica.plan.json`. Walls traced from the rings by a raster extraction (fill the "in" rings in the
building frame at 0.1 m, find straight bands, merge collinear runs; gaps become openings): `tmp/key-plans/forum-basilica.raster.json`
and `.raster.png`. Apse centres from the straight side walls, radii checked by circle fits. Readings worth knowing:
- The hall colonnade is 4.65 m from the east wall centre to centre: the 1893 "15 ft 2 in" is centre to centre.
- The gateway foundations are the gaps in the outer (14.3 m) and court (12.7 m) colonnade lines; both are centred on the
  drain, v ≈ 41.7, 1.8 m south of the court's centre.
- The court's south colonnade is not surveyed west of u 44; it is restored to the basilica wall.
- The basilica east wall runs on across both outer ambulatories to the outer sleeper walls (rings).

## Elevations: evidence and rules

### What the Silchester evidence gives us (S)

| Element | Evidence | Source |
|---|---|---|
| Hall colonnade | Corinthian, ~8.6 m (27 ft); lower drum 0.86 m; one row | ✔ Fulford 2002; ✔ 1893 |
| Court colonnade | 0.57 m shafts, 4.39 m apart, ≥ 4.72 m high, timber entablature, curb 9–12 in | ✔ 1893 |
| Tribunals | floors raised 0.74 m; Purbeck marble fronts; tile and mosaic floors | ✔ 1893 |
| Curia | floor raised 0.79 m, three steps, open on the hall | ✔ 1893 |
| Walls | flint with tile courses; east wall 5 ft | ✔ 1893 |
| Gateways | foundations 41 and 49 ft × 5 ft; triumphal-arch type; inscription letters 28 cm | ✔ 1893; ✔ Fulford 2002 |
| Hall use c. 270–280 | iron-smithing, bronze-working | ✔ Fulford 1985; ✔ Fulford 2002 |

### Comparisons (C)

- ✔ Vitruvius V.1: aisle a third of the nave (Silchester's ratio matches); columns "as high as the side-aisles are broad"
  (Silchester's are much taller); upper features a quarter smaller; the aisle roof lower than the nave roof; galleries
  in his own basilica at Fano. ✔ 1893 argued against galleries at Silchester (no stairs).
- ✔ 1893's own reconstruction: entablature to ~10.3 m, nave to the tie beams ~17 m for a wider nave, clerestory lighting.
- Baths comparanda for walls and windows (Wroxeter 7 m+, Great Chesters windows): `baths.md`.

### Rules for the model

| Part | Rule | Level |
|---|---|---|
| Ground | One level; the court's 0.3 m step shown by the curb | S/X |
| Hall colonnade | 17 columns 0.86 × 8.6 m on the sleeper wall (+0.3), ~4 m apart; timber beam over | S (size) / X (spacing) |
| Clerestory | wall on the colonnade from 9.15 m to the nave eaves at **15 m**; 16 windows 1.5 × 2.8 m (sill 10.6) | X |
| Nave roof | gable over the west wall and the clerestory, 22°, ridge ~17.9 m | X |
| East aisle | lean-to from 10.0 m (clerestory) to 8.3 m (east wall); east wall windows 1.4 × 2 m | X |
| West wall | to 15 m; 16 clerestory windows above the west range roof (sill 11.6) | X |
| Tribunals | apses 11 m high with half-domes and half-cone roofs; floors +0.74 m; an arch (springing 7 m) in the hall end wall | S (floor) / X |
| West range | lean-to from 11.0 m on the basilica to 8.2 m; curia apse under it, floor +0.79 m | S (floor) / X |
| Forum ranges | walls and eaves **9.5 m**, gable roofs at 22° (ridge ~11.2 m) | X |
| Inner ambulatory | columns as 1893 on the curb (+0.3); lean-to 5.3 → 7.4 m | S/C |
| Outer ambulatory | columns 0.5 × 4.0 m on the sleeper wall (+0.45), 4.39 m apart; lean-to 4.75 → 6.4 m | C/X |
| Windows | one per room above each portico roof (~1 × 1.1 m); glazed like the baths (1893 thought unglazed lattices) | X |
| Outer gateway | on the 49 ft foundation (14.3 m); **about 9 m** overall, scaled from the engaged column: one arch 4.5 m wide springing at 4 m, framed by four engaged columns 0.81 × 7 m (the 1893 attached Attic base with a 2 ft 8 in shaft "might have" come from it) | S (footprint) / C (columns) / X (form) |
| Inner gateway | on the 41 ft foundation (12.7 m); a plain single arch 4 m wide, **7.5 m** high, just above the portico roof (1893: guessing its superstructure "would be idle") | S (footprint) / X |
| Exedra, apsidal offices | half-domes inside, under the range roof | S (plan) / X |
| Smithy | five hearths 1.3 × 1.3 × 0.7 m in the nave, earth floor | S (activity) / X (form) |

### Elevation sources

- Fox & St John Hope 1893 (above); Vitruvius V.1 (above); `baths.md` "Elevations" for the shared comparanda.

## Wall facing and roof tiles

Roof: the baths' tile style (R2/R3) applies. Walls: **flint with tile bonding courses** (Decision 5), new style `flintF`
in `atlasTiled.ts`, chosen per building by `facing: 'flint'` in the plan.

### Evidence

| Point | Evidence | Source |
|---|---|---|
| Forum and basilica walls | "flint rubble with bonding and lacing courses of tiles" | ✔ Fox & St John Hope 1893, p. 552 |
| Silchester buildings generally | "mainly flint rubble with brick quoins" | ✔ C&F 2016 (summarising the Antiquaries) |
| Temple precinct wall | "well built of flint with continuous bonding courses of tiles" | ✔ C&F 2016 |
| **Town wall (late 3rd c.)** | "4–5 mortar and flint courses, then a double horizontal course of limestone throughout the entire thickness" | ✔ C&F 2016 (after Collis 1983) |
| Flint as built at Silchester | latrine walls, flint in rough courses with brick coursing and quoins: grey-white nodules, irregular to rounded, about a third to half a brick long, much pale mortar | ✔ Fulford et al. 2019 (baths 2018), figs 14–15 (no scale bar; scaled from the bricks) |
| Bricks / tiles | lydion-type bricks ~0.40–0.45 m × 4–4.5 cm | `baths.md` "Wall facing" ✔ |
| Other towns | St Albans wall: mortared flint rubble with brick bonding layers, faced with dressed flints | ✔ English Heritage (no band spacing given) |

Not found: the spacing of the tile courses or the number of tiles per band in the forum's walls. The town wall's rhythm
(4–5 flint courses, then a double bonding course) is the nearest Silchester evidence, and is contemporary with our date.

### Rules for the model (proposed; the lab compares 2 and 3 tile courses)

- **Flint**: 0.6 m in 5 rough courses (~0.12 m, bed lines ±1.5 cm); nodules ~0.12–0.22 m long (mean 0.17 m, broken
  joints), rounded to knobbly, set a little off the course line, packed with thin to moderate pale lime mortar between.
  Colour: mostly grey to white cortex, ~12% a broken dark blue-grey face, ~10% iron-stained. **S** (forms, sizes from
  photos), **C** (course count from the town wall).
- **Tile bonding courses**: the baths' bricks and joints (half-bond, the odd half brick), **2** courses per band (K2,
  like the town wall's double course) or **3** (K3, like the baths' bands). **S/C**.
- **Quoins and reveals**: brick (Antiquaries: flint rubble with brick quoins). **S**.
- Surface variety only from weathering, tone and mottling, as for the baths; Standard tier without fine grain or lumpy
  outlines.

Lab: <http://localhost:5173/tools/materials.html?id=forum-basilica&set=flint> (panes G Greensand baseline, K2, K3,
K2s Standard; views Flint detail / close-up / From the court / West front / Forum aerial; `snap(view)` saves a grid).
Cost (2026-10-11, 2400 × 1350, best of 3, on the Intel HD 620 test machine): flint vs Greensand F,
wall filling the screen +2.7 ms (41.0 vs 38.3), wall close-up +0.4 ms (27.6 vs 27.2), west front +2.3 ms (22.3 vs 20.0),
aerial within noise. Standard tier ~1 ms cheaper than High.

## Generated model and drawings

Drawings: `npm run dev`, then <http://localhost:5173/tools/elevations.html?id=forum-basilica> (east front, cross-section on
the entrance axis, long section through the nave, west and north fronts, 3D, plan). Triangles (2026-10-11): **LOD0 12,908 ·
LOD1 ~6,500 · LOD2 ~1,600**. Generator additions for this building: arched openings (`arch` on a wall opening) and raised
apse floors (`floorH`).

In the game (2026-10-11): placed from the plan by `WorldBuilder` (`KEY_PLANS`); the townPlan entries `forum` and `basilica` follow the plan (map labels, reserves); a plan id without a building entry uses its anchor in `reachesPlanBuilt`. Smoke: LOD0 14,832 / LOD1 6,446 / LOD2 1,630 with footings, 463 wall colliders, cap 20k; whole town 34 draws (unchanged), 196,286 tris (184,218 before). Dev spawn: `?at=-30,47,90` (east gate, facing west); `?at=-111.6,75.4,0` (in the nave, facing north); `?at=-70.8,47.5,90` (court, facing the basilica).

Not modelled yet: the inscription, the curia's steps (shown as the base's face), the curb stones, the drain, shop counters.
