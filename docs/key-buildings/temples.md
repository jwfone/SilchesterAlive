# Temples (Insula XXX): research brief

Status: **in game** (2026-10-16). Target period: **late 3rd century AD (c. 270–280)**.
Ring refs (`rNNN`) are Great Plan rings in `tmp/audit-buildings/raw.geojson`; the classification is in
`assets/key-plans/temples.review.json`.

Claim tags: **✔** read in the document itself (or the project data), **◐** from a search summary only, **✎** given by the
user from a book not read here, or recollection. Evidence levels for the model: **S** Silchester, **C** comparison,
**X** conjecture. **The Great Plan rings are the truth for geometry**; plans and texts decide which rings belong, what
the openings are and what stood above ground.

## Sources

- ✔ **Fox & St John Hope 1890**, "Excavations on the site of the Roman city at Silchester, Hants, in 1890", *Archaeologia* 52,
  733–58; the temples pp. 744–9 and **Plate XXX** "Silchester. Temples near East Gate" (W. H. St John Hope *mens. et del.*). Internet
  Archive scan <https://archive.org/details/sim_archaeologia-tracts-relating-to-antiquity_1890_52> (pages read as images, scan pp. 840–7:
  the OCR loses the dimensions).
- ✔ **Fox & St John Hope 1894**, *Archaeologia* 54, 237: one line on "the angle of a building, with walls 2 feet thick, in the
  farmyard ... a little to the north of the two square temples" (the north temple's first find).
- ✔ **St John Hope 1903**, "Excavations ... in 1902", *Archaeologia* 58, 413–15 and Pl. XXVIII: the precinct wall traced through the barn
  and round its north end; Blocks XXX.I–III. <https://archive.org/details/sim_archaeologia-tracts-relating-to-antiquity_1902_58> (OCR text).
- ✔ **Fulford, Clarke, Lambert-Gates, Eaton & Durham 2017**, *Silchester Insula XXX: Temple Excavation 2017* (University of Reading):
  the north temple. <https://research.reading.ac.uk/silchester/wp-content/uploads/sites/33/PDFs/2017-Silchester-Temple-report-small.pdf>
- ✔ **Creighton with Fry 2016**, *Silchester: Changing Visions of a Roman Town* (Britannia Monograph 28), Interior 11, Insula XXX
  (pp. 117–23 of the PDF text), figs 5.35–5.37. <https://centaur.reading.ac.uk/62521/>
- ✎ **Fulford 2002**, *A Guide to Silchester*, supplied by the user (2026-10-16): the passage on temples ("a small central square shrine
  ... surrounded by an enclosed ambulatory"; the polygonal temple; Celtic deities twinned with Roman ones; Serapis, perhaps Mithras),
  and a photograph of its drawing "Reconstruction of Romano-Celtic temple": a cella tower with a pyramid roof and small arched windows,
  an open colonnade on a low podium under a hipped ring roof, steps under a gabled porch.
- ✔ **Vitruvius** IV.7 (Tuscan temples: column thickness one seventh of the height; timber main beams), Morgan translation
  <https://lexundria.com/vitr/4.7/mg>.
- ◐ Leads not read: Lewis 1966, *Temples in Roman Britain* (Silchester 1 and 2, pp. 3, 12–29); Smith 2001; Boon 1974, 155–7;
  Muckelroy 1976; Fox 1948, 174; Neal & Cosh 2009 (mosaic 321.101); Fulford 1984 (the 1980 excavation in Insula XXXVII);
  Historic England GPR report 9-2001; Fry & Thornley's GPR survey (2015–16).

## Georeferencing

- ✔ Rings: large temple r284, r1273, r279, r1258 (outer), r272, r1270, r273, r267, r1264, r1245 (cella); small temple r239, r1189
  (outer), r232, r1183 (cella); precinct wall r351 (west side and SW curve), r1163 (south), r1355, r381 (north end). Left out: the north
  temple (r1345, r349, r1344, r341, r1333, r348, r1323), Blocks XXX.I–II in the north curve, and houses outside the wall.
- ✔ **Pl. XXX fitted by chamfer matching** (affine, plate wall pixels to the in-rings): **84%** of wall pixels within 0.3 m of a ring wall,
  89% within 0.6 m, 0.035 m/px at 300 dpi. A similarity from the two temples alone cannot do better: the plate puts their centres 33.9 m
  apart, the GIS 33.0 m. Image `tmp/research/temples-1890-plxxx.jpg`, points in `temples.review.json`.
- ✔ **The shade-2 rings here are St John Hope's completion.** On Pl. XXX the parts dug in 1890 are solid black and the parts under the
  churchyard are hatched, "completed on plan" "from analogy" (p. 746); the Great Plan carries both, the hatched parts mostly as shade 2.
  The large temple's NE angle was found (a sawpit and a cross-trench, p. 746); of the small temple's cella only the SW angle.
- ✔ Outline: min-area rectangle of the in-rings **123.6 × 29.9 m at 1.9°**, anchor `temples` (Decision 3), replacing the centre pins
  `temple-1` (the large temple) and `temple-2` (the small one).
- ✔ The two temples are turned ~4.3° and ~2.5° clockwise from grid north and not parallel to each other (C&F 2016: "neither perfectly
  aligned with the grid nor with each other"); the plan frame is square to the large temple (−4.3°); the small temple's roofs take its own
  angle (+1.85° in the frame).

## Development (summary)

| Date | What happened | Source | c. 270–280 |
|---|---|---|---|
| Claudio-Neronian | a small timber structure with a hearth, possibly a predecessor, under the north temple | ✔ 2017 | gone |
| Neronian, completed perhaps early 70s | **north temple** built ("the earliest masonry building so far attested at Silchester"); Nero-stamped tiles | ✔ 2017 | — |
| undated | large and small temples and the precinct wall; "if all three temples were constructed at the same time, as the symmetry ... might suggest" | ✔ 2017 (a suggestion) | **standing** |
| undated | the large temple's upper walls partly rebuilt "of poor rubbly material", without tile courses | ✔ 1890 | **standing** (same look under the plaster) |
| c. AD 200 or after | north temple "abandoned and demolished ... perhaps the whole temple precinct" (pits of domestic rubbish, a roughed-out altar reused as a threshold) | ✔ 2017 (tentative) | north temple **left out** |
| late 3rd–4th c. | a coin of Valens and an imitation of Tetricus among the 1890 finds | ✔ 1890 | (activity) |
| 12th c. | St Mary's church built over the precinct's east side, its axis "exactly parallel with that of the southern temple" | ✔ 1890 | later |

**Phase rule (agreed 2026-10-16):** both temples standing as the 1890 plan has them, with St John Hope's completion of their east halves,
and the precinct wall as surveyed; the north temple left out.

## Layout in the late 3rd century

Plan frame: `u` east-ish, `v` north-ish, metres; origin at the in-rings' SW corner (E 464281.99, N 162352.95), turned −4.3°.

- **Precinct (temenos)**: "very irregularly shaped" (C&F 2016). The west side runs straight for about 110 m; at the south "it curved round to
  the east and passed under the churchyard" (✔ 1890); at the north it curves "more sharply" and "points directly for the southern side of the
  east gate" (✔ 1903). Flint "with continuous bonding courses of tiles", 0.6 m thick, "confirmed in an evaluation within the barn in 1995";
  "no signs of entrance ways along its entire length" (✔ C&F 2016). The GIS wall is 0.7 m. Its **east side was never found** (under the
  churchyard): left open (Decision 5).
- **Large (central) temple**: the 1890 "northern building". ✔ "a platform 73 feet square and 7½ feet high, on which stood, centrally placed, a
  chamber or *cella* about 42 feet square without and 36 feet square within" (1890 p. 746); in metric 22.3 m square, 2.3 m high, cella 12.8 m (11.0
  m inside), outer walls 0.9 m "on strong foundations of flint and concrete" (C&F 2016). "the largest Romano-Celtic temple in Britain when Lewis
  conducted his survey" (C&F 2016); "still the largest of its kind in Roman Britain" (✔ 2017). GIS: outer 22.5 × 22.8 m, walls 0.95–1.1 m; cella
  12.6 × 13.2 m, walls 1.0–1.15 m; ambulatory 3.8–4.0 m clear on every side (C&F: "almost 4.0 m wide").
- **Small (south) temple**: ✔ "a platform 50 feet square, with a *cella* 24 feet square outside and 18 feet square within" (completed on plan);
  walls 2 ft (outer) and 3 ft (cella); survived to about 3 ft; "the space between the inner and outer walls was about 10 feet wide, filled in
  with a thick layer of clay and sand" (1890). GIS: outer 15.1 × 15.6 m, walls 0.65–0.75 m; cella 7.3 × 7.5 m, walls ~1.0 m; ambulatory 2.7 m
  clear on the west, **3.6 m on the east** (Hope's completion).
- **North temple** (Block XXX.III; left out): ✔ cella 8 m square, ambulatory 17.5 × 15 m; its east foundation 1.2 m against 0.7 m elsewhere,
  and a deeper east ambulatory, "suggesting the possibility that it supported the entrance-façade, perhaps colonnaded ... The temple would then
  have faced on to the main road entering Calleva from London" (2017).
- **Blocks XXX.I–II** in the precinct's north curve (left out): an apsidal chamber 21½ × 12 ft and parts of another building (✔ 1903).

## Construction and finishes: materials and what they rest on

| Part | Shown | Evidence | Level |
|---|---|---|---|
| Temple walls, outside | lime render painted red (`material: 'plasterRed'`, new style `plasterRedF`) | small temple: "a coating of white plaster ¼ inch thick laid on the flintwork; over this ... a second coating of white plaster 1¼ inch thick, and painted a bright red"; large temple: "considerable portions of its external plastering, painted a bright red" (✔ 1890; C&F 2016) | **S** |
| Temple walls, core (not seen) | — | flint; the small temple's NW angle of tiles; the large temple's lower walls with tile bonding courses, its upper south wall rebuilt in rubble (✔ 1890) | (S) |
| Precinct wall | flint with tile bonding courses (`facing: 'flint'`, the forum's style, 2 tile courses every 0.6 m) | "well built of flint with continuous bonding courses of tiles" (✔ C&F 2016); the spacing of the courses is not recorded (carried over from the forum, which follows the town wall) | **S** (C for the spacing) |
| Ambulatory floor, large temple | opus signinum, at 2.3 m | "a pavement of common *opus signinum* 2 inches thick ... at a height of 7½ feet above the original ground level" on sandy clay and loam (✔ 1890) | **S** |
| Cella floor, large temple | polished opus signinum (shown as signinum) | "at the same level ... (1) a hard concrete of lime with lumps of brick ... (2) a finer layer ... the most conspicuous being a streaked limestone of a dark colour, seemingly from the Purbeck beds ... smoothed and polished" (✔ 1890) | **S** |
| Small temple floors | plain opus signinum at 1.2 m | none survived; red and drab tesserae north of it "may have paved the temple's ambulatory" (✔ C&F 2016, citing Neal & Cosh) | **X** |
| Podium fill | not drawn (wall faces below the floors are buried) | clay and sand / sandy clay and loam between the walls (✔ 1890) | **S** |
| Columns (large temple) | smooth cream ('plaster' cell, the generator's column default) | none found; Fox thought the outer wall could carry a peristyle (✔ 1890); fragments of "plaster panels covered with a fine white stucco" were found round the buildings (✔ 1890) | **X** |
| Beams over the columns | timber | Vitruvius's Tuscan main beams (✔ IV.7) | **C** |
| Roofs | tegulae and imbrices (R2 High / R3 Standard) | "the roofs of the buildings were unquestionably of wood, the walls being too thin to have supported vaulting" (✔ 1890); tegulae, some Nero-stamped, in a pit in the north temple, perhaps a ritual "to commemorate the building and roofing of the temple" (✔ 2017) | **S** (tiles, from the north temple) / X (form) |
| Steps, wall tops, sills | stone (generator defaults: 'stone' cell; lintel undersides 'brick') | no steps found (✔ 1890); a roughed-out greensand block reused as a threshold near the north temple (✔ 2017) | **X** |
| Inside the cellae and the small ambulatory | painted dado and pink plaster (generator defaults; generated styles `dadoF` and `plasterPinkF` since 2026-10-16, used inside every plan-built building) | Purbeck marble fragments "from their thinness ... evidently wall-linings" and one paving slab, near both buildings; "the brilliant colouring of the sides of the platforms" (✔ 1890). Marble linings are not modelled | **X** (S that the inside was finely finished) |
| Large ambulatory, inside face of the cella | red plaster (it is an open portico: `finish: 'exterior'`) | as the outer walls | **S**/X |
| Windows | glazed (generator default) | none recorded; glass at the public baths (Hope & Fox 1905, `baths.md`) | **C** |

**Surface look, revised twice on 2026-10-16 at the user's request.** First: "the red plaster ... does not have the same natural look" as the other
walls, and the interior plaster should be "a more natural version". Then: "these are clearly repeating small tiles ... the bath walls ... are much
more natural". The cause: the stonework's variety comes from a live block layout (one integer hash per block, no period), the baked 512² grain tile
only adding texture at unrelated scales; plaster has no blocks, and the first versions took every feature from a single read of the grain tile, so
the relief repeated every 0.6 m and the brush marks every 2.9 m. Now (weathering only, nothing constructional):
- wall-scale tone is live value noise on the stonework's hash (`lnoise`), so no big patch repeats;
- everything finer is the grain tile read **twice** at unrelated scales and a 37° turn and summed (`grain2`, the stonework's method for its drift),
  which has no visible period;
- the low relief is that sum's slope from screen derivatives (`slopeOf`, no extra reads), bent into the lighting (`gBump`, beside the roof relief).

`plasterRedF`: red ochre drifting warmer and cooler across a wall, an uneven wash, paint worn paler mostly low on the wall, run-off streaks; up close
lime grain, brush marks, hairline cracks in places and the relief. Standard keeps tone, wash, wear and run-off. The interior defaults, before painted
atlas tiles, are generated the same way: `plasterPinkF` (pink lime plaster, wash, trowel sweeps, the odd crack, relief) and `dadoF` (dark red ground
with flecks in drifts, one fleck at most per hashed cell, in imitation of marble; a cream band and dark line at its top; scuffed at the foot). The
dado's texture now counts from the room's floor (and runs on unbroken along the wall), so its band sits 1 m above a raised floor. Roofs checked: all
four temple roofs use the generated tegulae and imbrices (R2 High / R3 Standard). Auto picks **Standard** on the HD 620
(`silchester-auto-tier-v1`: extra 10.9 ms).

Cost (materials lab, HD 620, 2400 × 1350, best runs; the timing is noisy): the podium wall filling the screen, red plaster High about **+12 ms**
over plain, Standard about **+10 ms**, the forum's flint about +11 ms in the same run; inside the cella, High +8 ms, Standard +6 ms. A version built
wholly on hash noise looked as good but cost +50 ms (High): too dear. Review sheet: `tmp/key-plans/temples-step10-surfaces.png`. Lab:
`tools/materials.html?id=temples&set=temple` (views: plaster detail, from the steps, east front, aerial, roofs, inside the cella).

## Not known (to be conjectured and flagged)

Every height above the floors; the form of the ambulatories (open colonnade or walled); the small temple's floor level; doorways and steps
("No doorways or other openings were found in any of the walls of these two buildings that could be uncovered"; "Of steps ascending to the
*cella* of either temple there were no traces", ✔ 1890); windows; the precinct's east side and its entrance; the deity ("no evidence to
suggest to which deity or deities the temple was dedicated", ✔ 2017, for the north temple). No Romano-Celtic temple stands to its roof in
Britain; Autun's "Temple of Janus" stands in France (C&F 2016 compare its 2.1 m cella walls with the Silchester 0.9 m: "it is doubtful that it
significantly towered above the town").

## Decisions

1. **Scope** (2026-10-16, user): the large and small temples and the surveyed precinct wall; **not** the north temple (demolished c. AD 200),
   not Blocks XXX.I–II.
2. **One plan** `temples` (2026-10-16, user), replacing the pins `temple-1` and `temple-2`.
3. **Anchor** (2026-10-16, user, step 2): 123.6 × 29.9 m at 1.9°, the min-area rectangle of the in-rings.
4. **LOD budget** (2026-10-16, user): LOD0 cap **12k**, normal distance LOD.
5. **Precinct east side** (2026-10-16, user): left open (no wall where none was found); so the precinct is entered from the east.
6. **Left-out rings inside the anchor** (2026-10-16, user): nothing drawn where the north temple and Blocks XXX.I–II were.
7. **Phase rule** (2026-10-16, user, step 5): both temples as the 1890 plan has them, east halves as completed on plan.
8. **Forms** (2026-10-16, user, on the step-9 drawings): the large temple an **open
   colonnade** on its 2.3 m podium (Fox's peristyle); the small temple an **enclosed ambulatory** with small windows (Fox: its wall too thin for
   columns; Fulford's "enclosed ambulatory"); both with a cella tower under a pyramid roof and steps on the east.
9. **Small temple floor** (2026-10-16, user): **1.2 m** (X).
10. **Wall facing** (2026-10-16, user, on the step-10 sheet): red-painted plaster on both temples (S), flint on the precinct wall.
11. **Surface look** (2026-10-16, user): the rebuilt plaster (no repeat: live hash noise for wall-scale tone, paired grain reads for the rest)
    approved, outside and in; the generated interior plaster and dado apply to every plan-built building.
12. **Cella fittings** (2026-10-16, user): the interiors as built approved and kept: a statue on an inscribed pedestal, an offering table with lamps and a dish, Purbeck plaques, a Purbeck dado and white stucco panels with a thin red line (X), statues 2.2 m (large) and 1.7 m (small), pale lettering; an altar before each temple ("Inside the cellae").

## Wall plan

`assets/key-plans/temples.plan.json`, written by `tmp/key-plans/temples-scripts/mkplan.py` (+ `elev.py`; gitignored scratch, Python). The four
squares are fitted wall by wall (`fitwalls.py`: each side's pixels by total least squares in the middle 80% of the side, thickness from the 1st–99th
percentile across it, corners where adjacent sides meet), so the slight skew of the digitised squares is kept. The precinct centreline is the
skeleton of its rings: straight west, south and north runs with the two curves smoothed through the GIS points. Plan sheets:
`tmp/key-plans/temples-step6.png`; step-2 and step-5 pictures in `tmp/key-review/temples-step{2,5}.png`.

Readings worth knowing: the GIS walls are ~0.1 m thicker than the 1890 text (outer 1.0 m against 3 ft, small temple 0.7 m against 2 ft); the rings
are used. The rooms are four ambulatory strips and a cella per temple (rectangular floors).

## Elevations: evidence and rules

### What the Silchester evidence gives us (S)
| Element | Evidence | Source |
|---|---|---|
| Large temple floor level | ambulatory and cella paved 7½ ft (2.3 m) above the old ground, on fill | ✔ 1890 |
| Large temple outer wall | 3 ft, "sufficiently broad to have carried columns forming a peristyle all round the *cella*, which in this instance had apparently no vestibule" | ✔ 1890 |
| Small temple outer wall | 2 ft: "the thinness of the retaining wall of the platform of the southern building precludes the idea that it supported columns" | ✔ 1890 |
| Walls survive | small temple to about 3 ft; large temple's outer walls about 5 ft, higher under the churchyard | ✔ 1890 |
| Roofs | of timber, "the walls being too thin to have supported vaulting"; tegulae at the north temple | ✔ 1890; ✔ 2017 |
| Entrance side | not found at either temple; Fox: "possibly on the eastern side"; the north temple's front on the east, to the London road | ✔ 1890; ✔ 2017 |

### Comparisons (C)
- **Romano-Celtic type**: "a small central square shrine ... surrounded by an enclosed ambulatory" (✎ Fulford 2002); Fulford's drawing shows a cella
  tower with small high windows and a pyramid roof over an open colonnade (✎, photograph supplied by the user; proportions not measured).
- **Gaul**: Fox compares Izernore (cella on a podium with a peristyle, steps on the east), Saintes, Champlieu (podium 1.80 m, entrance east) and two
  temples at Poitiers (✔ 1890, pp. 747–8).
- **Vitruvius** IV.7: Tuscan columns 7 diameters high, timber main beams (✔).
- The forum colonnade's shafts, 1 ft 10–11 in (0.57 m), are the nearest columns measured at Silchester (✔ `forum-basilica.plan.json`, from Fox &
  St John Hope 1893).

### Why these heights, storeys and openings
Nothing stands above the foundations, so every height is conjecture (**X**) unless marked. Each is derived from a stated reason.

**Large temple.**
- **Floor 2.3 m (S).** The 1890 report gives it.
- **A colonnade, not a wall (X, following Fox).** The outer wall is 3 ft thick: Fox read it as the base of a peristyle; Fulford's drawing has the same
  type. The wall is shown only up to the floor, as the podium's retaining wall, plastered red.
- **Columns 0.6 m, 4.2 m high, 8 bays a side (X/C).** No column was found. The diameter is taken from the town's one measured colonnade (the forum,
  0.57 m) rather than made larger to suit the temple's size (the forum lesson); the height from Vitruvius's Tuscan rule (7 diameters); 8 bays of
  2.7 m on the 21.5 m sides, 4.5 diameters apart, close to his intercolumniations. The middle column on the east is left out to give a 5.4 m bay
  in front of the steps and the cella door.
- **Ring roof from 6.75 m to 8.55 m.** The beam on the columns sits at 2.3 + 4.2 + 0.25 = 6.75 m; at 22° over the 4.5 m from the column line to the
  cella wall the roof rises 1.8 m, meeting the cella at 8.55 m.
- **Cella walls to 10.8 m, two windows a side, pyramid roof (X).** The cella has no outside wall below the ambulatory roof, so its light must come
  from above it (as Fulford's drawing): windows 0.8 × 1.2 m, sill 9.15 m (0.6 m above the roof), head 10.35 m, eaves 10.8 m. That is 8.5 m above
  the floor for a room 11 m square inside, a little under Vitruvius's rule for room heights (half the sum of length and width, VI.3.8, read for
  `mansio.md`), which suits walls only 0.9 m thick: C&F 2016 doubt it "significantly towered above the town". Pyramid roof at 22°: apex 13.5 m.
- **Cella door 2.4 × 3.6 m on the east, sill at the floor (X).** None found; east as the 2017 temple and Fox's suggestion.
- **Steps (X).** Nine steps, 4.4 m wide, rising 2.3 m over 3.2 m, in front of the door between the middle columns; none were found.

**Small temple.**
- **Floor 1.2 m (X).** The walls survive to about 3 ft with fill between them and no floor was found on it, so the floor was higher than 0.9 m;
  half the large temple's height for a building two-thirds its size. The steps (5, 1.6 m) follow from it.
- **Enclosed ambulatory, walls 3 m above the floor (eaves 4.2 m) (X).** Fox ruled out columns on a 2 ft wall; Fulford describes the type as an
  enclosed ambulatory. Three metres takes a 2.3 m door with its lintel and a small window (0.6 × 0.8 m, sill 2.9 m) two a side, flanking the door
  on the east.
- **Ring roof from 4.2 m to 5.65 m**: 22° over the 3.6 m average from the outer wall's line to the cella.
- **Cella walls to 7.4 m**, one window a side 0.6 × 0.9 m above the ambulatory roof (sill 6.1 m), pyramid roof (apex 9.0 m). 6.2 m above the floor
  for a room 5.3 m square inside.
- **Doors on the east (X)**: the ambulatory door 1.6 × 2.3 m above the floor, its top steps in the doorway, and the cella door 1.4 × 2.4 m, its sill at the floor; east because the ambulatory is
  widest there (3.6 m against 2.7 m), as on the 2017 temple.

**Precinct wall 2.4 m (X)**: high enough to close the sacred area from the street, as the mansio's yard walls; no coping modelled.

### Rules for the model
| Part | Rule | Level |
|---|---|---|
| Ground | one level (the levelled platform) | X |
| Large temple | podium and floor 2.3 m; colonnade 0.6 × 4.2 m, 8 bays a side, timber beam; ring roof 6.75 → 8.55 m; cella eaves 10.8 m, pyramid roof | S (floor) / C / X |
| Small temple | podium 1.2 m; enclosed ambulatory, eaves 4.2 m; ring roof 4.2 → 5.65 m; cella eaves 7.4 m, pyramid roof | X |
| Windows | cella: above the ambulatory roof (large 0.8 × 1.2 m two a side; small 0.6 × 0.9 m one a side); small ambulatory 0.6 × 0.8 m two a side | X |
| Doors and steps | on the east, sills at the floors; steps 9 (large) and 5 (small) | X |
| Roof pitch | 22° throughout | C |
| Wall tops | each wall stops at the roof over it: the outer walls at the ring roof's eaves, the cellae at their pyramid's eaves (checked, `roofcheck.py`: 0 of 28 walls above a roof) | — |

## Generated model and drawings

Generator additions (`planBuilding.ts`, `planWorld.ts`, `keyPlan.ts`; all with evidence tags, picking, LOD 0/1/2 and colliders):
- **Raised floors** (`floorY` on a room): the floor drawn at that height (also at LOD1, seen between the columns), walked as a deck reached by stairs
  (`deckHeights`), and wall faces below it not drawn (buried in the fill). A door with a raised sill (`y0`) is walkable through the wall's thickness.
- **Roofs** `ambulatory` (a hipped ring sloping outward from a central block) and `hip` (a pyramid for a square), each with an optional own
  `angleDeg` for a building turned in the plan frame; ridge and hip caps and eaves edges as the other roofs.
- **Per-wall material** `plasterRed` (`material` on a wall), a new atlas cell sharing the pink plaster painting (nudged) and the style `plasterRedF`
  in `atlasTiled.ts` with a Standard-tier variant and a plain colour.

Smoke (2026-10-16): **LOD0 3,194 / LOD1 1,718 / LOD2 544** tris, 100 wall colliders, cap 12k. Whole town **26 draws (was 28), 269,952 tris (was
265,686)**: the old temple boxes and the column `InstancedMesh` (its only use; `kit/columns.ts` deleted) are gone. The smoke test climbs both stairs and walks on into the
rooms at the player's own radius (0.5 m), stands on every raised floor (and not on it from below), passes every door at its sill, and checks the facings.

Walked in the game (2026-10-16, browser pane): up the large temple's steps, through the cella door into the cella; up the small temple's steps,
through both its doors into the cella; every Look setting (Detailed, Standard, Plain, Evidence) on both temples. Two fixes came out of it: the small
temple's front door had a raised sill the player (radius 0.5 m) bumped before reaching it, so its top steps now run through the doorway as at the large
temple; and the painted dado sat 1 m above the plan's ground, buried under the raised floors, so it now sits 1 m above each room's floor.

Drawings: <http://localhost:5173/tools/elevations.html?id=temples> (east front, sections through each temple looking north, west side, 3D, plan). Review
pictures: `tmp/key-plans/temples-step9-drawings.png`, `tmp/key-plans/temples-step10-plaster.png`. Dev spawn: `?at=313.3,54.2,90` (east of the large
temple, facing its steps).

Not modelled: the north temple and Blocks XXX.I–II; the precinct's east side and any gate; votive objects (see "Inside the cellae").

## Inside the cellae: fittings (built and approved 2026-10-16)

User request: "What would the inside of these temples have looked like? ... including objects, icons, images, furniture etc." Researched,
planned (below), built as planned and **approved by the user** (decision 12) from the pictures (lab `tools/materials.html?id=temples&set=temple`,
views Statue, Table, Plaque, Small cella, Altar).

### Evidence read

- ✔ **Nothing cultic was found inside either temple** (Fox & St John Hope 1890, pp. 746–7): no statue base, no altar. The large cella's
  floor survived (polished signinum with Purbeck chips). Found near both buildings:
  - worked Purbeck marble, "from their thinness ... evidently wall-linings", and one piece of a paving slab;
  - "mouldings of plaster panels covered with a fine white stucco";
  - pins of bone and bronze, an iron stylus, pseudo-Arretine ware, a bone comb, coins (Valens, an imitation of Tetricus);
  - "two small lamps of terra-cotta".

  **S**
- ✔ **North temple, 2017** (Fulford et al.): no internal surfaces except a tiled patch 1.23 × 0.45 m in the ambulatory, "a platform for an
  altar" or a fragment of floor. A **greensand block 0.82 × 0.35 × 0.27 m**, perhaps "a roughout for an altar", was buried in the precinct.
  There was "no evidence" for the deity. **S** (this precinct)
- ✔ **Insula XXXV temple** (RIB 69–71, romaninscriptionsofbritain.org): thin (19 mm) **Purbeck marble inscribed slabs** "in the shrine",
  gifts of the guild of *peregrini* of Calleva; one names Mars. So Silchester cellae had marble dedication panels. **S** (another
  Silchester temple)
- ✔ **Uley** (British Museum 1978,0102.1, curator's comments): the cult statue of Mercury was "a little larger than life-size (approximately
  2m./6'10" tall), and stood on a base", of Cotswold limestone, from the later 2nd century. **C**
- ✔ **Vitruvius** IV.5: the statue in the cella faces the way the temple does. IV.9: "Altars should face the east, and should always be
  placed on a lower level than are the statues in the temples" (lexundria, Morgan). **C**
- ✔ **Historic England 2018**, *Shrines (Roman and Post-Roman)* IHA: the cella is "the religious focus"; most of the evidence is portable
  (altars, statuettes, votives). **C**
- ✔ Town finds, not from the temples (C&F 2016 ch. 7): bronze statuettes (Venus, Hercules, Bacchus, a Lar) and pipeclay Venus figurines.
- Leads not read: Woodward & Leach 1993 (Uley); Lewis 1966; Haverfield 1908, *Archaeologia* 61 (the Insula XXXV shrine).

### What is shown

| Item | Where | Size | Material | Why | Ev |
|---|---|---|---|---|---|
| Cult statue on a pedestal | each cella, against the west wall on the axis, facing the east door | large: pedestal 2.0 × 1.4 × 1.2 m, figure 2.2 m; small: 1.2 × 0.9 × 1.0 m, figure 1.7 m | figure limestone; pedestal die Purbeck with an inscribed panel, mouldings limestone | the cella housed the god's image; Uley's statue was ~2 m on a base. The deity is unknown: a plain draped figure holding an offering dish, no attributes | C/X |
| Offering table | in front of each statue | 1.2 × 0.6 × 0.9 m (small 0.9 × 0.5) | Purbeck top, limestone pier | a place for lamps and gifts | X |
| Two terracotta lamps and a dish | on each table | ~0.1 m | terracotta | the two lamps found in 1890 | S (finds) / X (place) |
| Dedication plaques | cella side walls near the statue, 1.5 m above the floor: two a side (large), one a side (small) | 0.4 × 0.35 × 0.02 m | Purbeck, illegible procedural lettering | RIB 69–71 | S / X (place) |
| Purbeck dado | cella walls to 1 m, replacing the painted dado there | slabs, skirting, top moulding | Purbeck | the 1890 "wall-linings" | S (material) / X (place) |
| White stucco panels | cella walls above the dado | ~1.6 m panels from 1.1 to 4.5 m, moulded frames, cornice band, plain above | white stucco (maybe a thin red line inside each panel, X) | the 1890 stucco panel mouldings | S (material) / X (layout) |
| Altar | precinct, on each temple's axis just east of the steps (large u ≈ 41.2, v 46.7; small u ≈ 38.5, v 14.1), facing east | large 0.8 × 0.6 × 1.1 m (X); small 0.35 × 0.27 × 0.82 m (the 2017 roughout) | greensand | worship and sacrifice happened outside, at an altar lower than the statue (Vitruvius IV.9); the greensand roughout from this precinct | S (material, size) / C (place) |

Not shown, and why: the deity's attributes (unknown); figurines, coins and brooches (too small, and their place is unknown); hanging
lamps and other furniture (no evidence); altars inside the cella (the main altar stood outside).

### How (engine), as built

- **Emitter:** a new `src/presentation/kit/planFittings.ts` with `emitFittings(acc, plan, lod, tag, footprints)`, called in `buildFromPlan`
  beside the labrum and base code.
  - Each fitting has a local frame: forward = `facing`, right = (sin a, −cos a).
  - Primitives: box, lathe (elliptical rings, with a cos 7θ fold ripple below the waist), tubes for the arms, a disc for the patera.
  - About 900 tris per statue and roughly 2.5k for everything (LOD0 is 3,194 now; the cap is 12k).
  - Interior items draw at LOD0, altars at LOD0 and 1. Add new `PlanElementKind`s.
- **Colliders:** a box footprint for each pedestal, table and altar, with h = y0 + height. Check the route from the door to the cella stays
  open at radius 0.5.
- **Linings:** `interiorFace` takes the room on its side (a `sideRoom` like `sideFloor`).
  - `lining.dado = 'purbeck'` → the `purbeckLining` cell.
  - `lining.upper = 'stucco'` → the `stucco` cell.
  - Both take their UV origin at the floor.
- **Shaders** (`atlasTiled.ts`, cache key v13). Each gets uniforms, a branch and a plain colour:
  - `freestoneF` (limestone and greensand): no courses; lnoise tone + grain2; low relief.
  - `purbeckF`: dark grey-green with pale-rimmed *Viviparus* shell rings from the hash `fleck` (a disc minus an inner disc); joints for
    the lining.
  - `inscriptionF`: fit UVs; a moulded border; rows of 3×5 hash glyphs, cut paler.
  - `stuccoF`: an analytic panel height field, with relief via `slopeOf`.
  - `terracottaF`.
- **Plan:** add the fittings and the cella `lining` in `tmp/key-plans/temples-scripts/mkplan.py`, then run `npm run import:keyplans`.
- **Then:**
  - smoke: count the fittings, check the colliders, check the cella route, check the tri cap;
  - an in-game picture for the user to approve;
  - update `temples.about.md`, the decisions here, and `other-buildings.md`'s "Not modelled".

### Results

- Plan: `fittings` (12: per temple a statue, a table, plaques, an altar) and the cella `lining`, written by
  `tmp/key-plans/temples-scripts/fittings.py` (exec'd by `mkplan.py`); the rest of the plan is unchanged (checked against the previous JSON).
- Smoke (2026-10-16): temples **LOD0 5,690** (was 3,194), LOD1 1,958 (was 1,718: the altars), LOD2 544; cap 12k. Town 26 draws, 272,448 tris.
  New checks: every kind present; the pedestals, tables and altars have colliders; the way from each cella door to its table is open at the
  player's radius (0.5 m). `check`, `smoke`, `build`, `perf` pass. The shader cost of the new surfaces was not benchmarked (they cover
  a small part of the screen, inside the cellae only).
- Revisions in the lab: smooth vertex normals for the statue, lamps, arms and bolsters (`Acc.polyN`; flat facets read as a polygon
  model); a nose so the head reads as facing the door; the mantle fold moved in against the body; the lettering redrawn as stroked capitals
  (at first 3×5 blocks read as pixel art), the right way up, S as two arcs.
- Approved as shown (decision 12), including the thin red panel line (X), the statue sizes and the pale lettering.
