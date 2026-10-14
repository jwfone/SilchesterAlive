# Amphitheatre: research brief

Status: **in game** (2026-10-14). Target period: **late 3rd century AD (c. 270–280)**.
Plan: `assets/key-plans/amphitheatre.plan.json` (written by `tmp/key-plans/amphitheatre-scripts/mkplan.py`); review record
`assets/key-plans/amphitheatre.review.json`; notes `assets/key-plans/amphitheatre.about.md`.

Claim tags: **✔** read in the document itself (or measured here from the project data or a figure), **◐** from a search summary
only, **✎** given by the user from a book not read here, or recollection. Evidence levels for the model: **S** Silchester,
**C** comparison, **X** conjecture. **The GIS is the truth for geometry**; plans and texts decide what the parts are and what
stood above ground.

## Sources

- ✔ **GIS layer `04_Background_Town_Wall_and_Amphitheatre`** (Silchester Mapping Project; zip supplied by the user): its metadata
  reads "a digitisation of the Roman Town Wall, and **the stone phase of the Amphitheatre**". Records 14 and 15 are the two halves of
  the arena wall with the passage walls and the recesses. There are **no Great Plan rings** here.
- ✔ **Creighton with Fry 2016**, *Silchester: Changing Visions of a Roman Town*, pp. 216–21 (Exterior 14) and figs 6.41–6.43
  (<https://centaur.reading.ac.uk/62521/>): Fulford's phasing; "created by digging out about 2 m below the ground surface to create
  the banks"; the Antiquaries were refused permission to dig north and east of the town (so **no Victorian report exists**); a ditch
  on the east side read as part of the North-East Annex, not the amphitheatre.
- ✔ **Kovacsovics 1993**, review of Fulford 1989, *Bonner Jahrbücher* 192, 739–43
  (<https://journals.ub.uni-heidelberg.de/index.php/bjb/article/view/57844>; read in full, German). The fullest summary available of
  **Fulford 1989** (*The Silchester Amphitheatre: Excavations of 1979–85*, Britannia Monograph 10), including Sunter's
  reconstruction chapter (pp. 160–77). Details in the tables below.
- ✔ **Fulford 2018**, "The Silchester 'Nymphaeum'", *Britannia* 49, 309–13 (accepted version, CentAUR 81092
  <https://centaur.reading.ac.uk/81092/>): the arena wall "measures 0.8 to 0.9m in width" (citing Fulford 1989, 37);
  "subsequent excavation of the amphitheatre showed there was **no outer wall**" (note 2).
- ✔ **English Heritage**, site description (<https://www.english-heritage.org.uk/visit/places/silchester-roman-city-walls-and-amphitheatre/history/description>):
  built AD 55–75; a timber arena wall; banks and terraces from the excavated soil; 3,500–7,250 spectators; "in the 3rd century the
  arena wall was rebuilt in stone and two new entrances were made".
- ✎ **Fulford 2002**, *A Guide to Silchester*: passage, contour plan and the "reconstruction of seating arrangements of
  amphitheatre in the stone phase" (photographs supplied by the user, 2026-10-13). Text: arena about 45 × 39 m, its surface "some two
  metres below the original ground level"; the stone wall "of flint and brown ironstone ... originally about three metres high", which
  "also served to support seating arrangements which continued to be of wood"; semicircular niches "probably once vaulted"; 4,500–9,000
  spectators. ✔ The two figures were measured here (below).
- ✔ **GIS layer `01_Background_Topography_Contours_1m`** (supplied by the user): a smoothed regional surface that runs straight
  through the arena; it gives the natural slope (about 91 m OD on the west to 89 m on the east, falling north-east) but **not the
  earthwork**.
- ◐ Leads not read: Fulford 1989 itself; the interim reports (*Antiquaries Journal* 1982–5; *Britannia* "Roman Britain in 1979–85");
  a *Britannia* note giving Fulford's reconstructed wall height as 2.75 m, or 3.75 m with a parapet (search summary only); the Gatehouse
  gazetteer; Wilmott 2008 (amphitheatres in Britain).

## Georeferencing and footprint

- ✔ Arena wall from GIS 04. An ellipse fitted to its centreline: centre E 464472.2, N 162606.3 (game 452.2, −156.3); **inner face
  45.9 × 39.6 m**, against Fulford's 45.5 × 39.2 m for the stone arena (✔ Kovacsovics); wall **0.85 m** thick (median; Fulford
  0.8–0.9 m ✔); long axis **20° east of north**. The wall is not a perfect ellipse (rms 0.4 m), so the plan keeps the GIS line as polar
  samples every 2°.
- ✔ **Fulford 2002 contour plan fitted** to the GIS wall by chamfer matching (affine, 0.072 m/px; 58% of dark pixels within 0.3 m of
  the wall, the rest being contours and labels). It shows the bank crests (closed 94–95 m contours) about 8–11 m out from the wall and
  the outer toe about 15–17 m out, further on the west where the ground is naturally higher.
- ✔ **C&F 2016 fig. 6.43** (LiDAR with hachures) fitted the same way (0.118 m/px): the same crest and toe.
- ✔ Anchor `amphitheatre`: minimum-area rectangle of the wall and the bank toe, **74.5 × 80.8 m** (game 74.8 × 81.1 after import),
  turned to the 20° axis. Plan frame: origin at its SW corner, angle −20.10°.
- ✔ The old kit had the entrances on the **short** (east–west) axis, an outer wall that did not exist, and an arena of about 25 × 37 m:
  the GIS strips' ellipse had been used as the building's outer edge, so the banks were missing.

## Development

| Date | What happened | Source | c. 270–280 |
|---|---|---|---|
| mid 1st c. | Pottery and tile making on the site; a V-shaped ditch under the west bank | ✔ C&F 2016 | gone |
| c. AD 55–77 | Timber Phase 1: a **round** arena about 43 × 42.2 m, banks of the dug-out soil, timber arena wall, two niches on the east–west axis, external stairs, rear palisade, turf stacked at the outer edge | ✔ C&F 2016; ✔ Kovacsovics | rebuilt |
| mid 2nd c. | Timber Phase 2: the arena made **oval**, 44.4 × 37.5 m, new arena wall of close-set posts | ✔ C&F 2016; ✔ Kovacsovics | rebuilt |
| early 3rd c.? | **Stone Phase 1**: arena wall, niches (now apsidal) and entrances rebuilt in stone; arena 45.5 × 39.2 m; entrances of different widths as open corridors; seating rebuilt on fill behind the wall, 11–12 rows on radial timbers | ✔ C&F 2016 ("perhaps early third century"); ✔ Kovacsovics | **shown** |
| mid 3rd c. (c. 250s?) | **Stone Phase 2**: arena, niche and entrance floors raised with sand and gravel; no structural change | ✔ C&F 2016; ✔ Kovacsovics | **shown** (floors) |
| 4th–5th c. | Dereliction; collapse of the north entrance; abandonment | ✔ C&F 2016; ✔ Kovacsovics | later |
| 11th–13th c. | Stone robbed; an aisled hall built in the arena | ✔ C&F 2016 | later |
| 1979–85 | Excavated by Fulford (Britannia Monograph 10, 1989) | ✔ C&F 2016 | |

**Phase rule (agreed 2026-10-13):** the stone phase, with the Stone Phase 2 floor raising.

## Layout in the late 3rd century

- **Arena** about 45.9 × 39.6 m inside the wall, floor of sand and gravel some 2 m below the old ground (✔ GIS; ✔ C&F; ✎ Fulford 2002).
- **Arena wall** of flint and brown ironstone, 0.85 m thick (✔ GIS; ✎ Fulford 2002).
- **Entrances** on the long axis: **north** clear width about **5.3 m**, **south** about **3.8 m**, each walled in stone for about
  11–12 m out through the bank (✔ GIS). The excavators found the entrances of different widths (✔ Kovacsovics). Open corridors: no
  seating carried over them in the stone phase (✔ Kovacsovics, Sunter).
- **Recesses** on the short axis: small rooms about 2 m across inside, centred about 22 m from the centre, opening off the arena (✔ GIS;
  ✎ Fulford 2002 "semicircular niches"); apsidal and probably vaulted in the stone phase (✔ Kovacsovics; ✎ Fulford 2002). Their use is
  unknown (✎ Fulford 2002: altars to Nemesis elsewhere, or refuges).
- **Seating banks** of the dug-out soil (✔ C&F; ✔ EH), crest about 10–11 m out, toe about 17 m out (✔ contour plan, LiDAR).
- **No outer wall** (✔ Fulford 2018).

## Construction and finishes: materials and what they rest on

| Part | Shown | Evidence | Level |
|---|---|---|---|
| Arena wall | rough flint courses with **single courses of flat brown ironstone slabs at uneven heights** (`facing: 'flint-ironstone'`, style `flintIronF`; see "Wall facing") | "a wall of **flint and brown ironstone**, the lower courses of which remain" (✎ Fulford 2002); the courses and their uneven spacing from the user's photographs of the standing recess walls (✎, 2026-10-14) | **S** |
| Passage walls | as the arena wall | stone (✔ GIS stone phase; ✔ Kovacsovics); facing not recorded separately: taken as the arena wall's | S / X (facing) |
| Wall tops | stone coping (generator default) | nothing recorded | X |
| Reveals, wall ends, arch heads | the wall's own flint and ironstone | the photographs show no brick quoins at the recess mouths | S (photos) / X (arch heads) |
| Arena, recess and passage floors | sand (`arena`) and gravel (`street`) | "a sand and gravel spread raising the arena, niche and entrance floors" (Stone Phase 2, ✔ Kovacsovics) | **S** |
| Recess walls | flint with ironstone courses, as the arena wall | plan ✔ GIS; the standing recess walls in the user's photographs | **S** |
| Recess vaults | stone half-dome and short barrel | "probably once vaulted" (✎ Fulford 2002); "were vaulted" assumed by Fulford 1989 (✔ Kovacsovics) | **C** |
| Seating | timber rows (`wood`) | seating "continued to be of wood" (✎ Fulford 2002); radial timber substructure (✔ Kovacsovics, Sunter); 12 rows on Fulford's section | **C** (form) / S (timber) |
| Rail on the arena wall | timber boarding 0.75 m | drawn on Fulford's reconstruction section | **X** |
| Fence behind the seating | timber, 1.0 m | a post on Fulford's section; a rear palisade in Timber Phase 1 (✔ Kovacsovics) | **C** |
| Outside stairs | timber steps | Timber Phase 1 seating reached by stairs from outside (✔ Kovacsovics); positions unknown | **X** |
| Banks, crest walk, ground round | grass (`grass`) | earth banks (✔ C&F; ✔ EH); "a still high-standing layering of turves" at the outer edge of the cavea in Timber Phase 1 (✔ Kovacsovics) | **S** (earth) / C (turf face) |

## Wall facing

✎ Two photographs of the consolidated recesses supplied by the user (2026-10-14; `tmp/research/amphi/amphi-recess-photo*.png`), with the
user's reading: "it is the brown ironstone that is the courses, not the tiles. a single row per course ... not evenly spaced". Measured
here against the flint nodules (about 8–15 cm; no scale bar in the photographs):

- **Flint**: rough courses of grey and white nodules about 0.1 m high, set in plenty of pale lime mortar (as the forum's flint style,
  whose flint code is shared).
- **Ironstone**: **single** courses of flat slabs, about 0.25–0.45 m long and 5–8 cm thick, brown to buff-grey, with weathered edges.
- **Spacing**: the courses are 0.3–0.6 m apart and visibly **uneven**, so the style sets course k at k × 0.5 m ± 0.12 m (0.26–0.74 m
  apart), each level along its wall. This is the one place a course spacing varies: here the evidence shows it (compare the baths'
  bands, which stay even).
- **No tile courses and no brick quoins** are visible.
- Style `flintIronF` in `atlasTiled.ts` (pseudo-cell `flintIron`), with a Standard-tier variant. Lab:
  `tools/materials.html?id=amphitheatre&set=arena` (K2 the forum facing as before; FI High; FIs Standard). Cost at 2400 × 1350, best of
  three: K2 22.1 ms, FI 23.2 ms, FIs 23.9 ms (desktop GPU, noisy): about +1 ms over the flint style it replaces.

## Not known (conjectured and flagged)

The stone-phase heights (only Fulford's reconstruction), the seat rows' number and pitch beyond Sunter's reconstruction, the gates (new
gates were set in Timber Phase 2; none recorded for the stone phase), any tribunal over the recesses (Sunter: possible, as at
Caerleon), the stairs' positions, and whether the rail and fence existed.

## Elevations: evidence and rules

### What the Silchester evidence gives us (S)
| Element | Evidence | Source |
|---|---|---|
| Arena floor | about 2 m below the original ground | ✔ C&F 2016; ✎ Fulford 2002 |
| Arena wall | about 3 m high; 0.8–0.9 m thick | ✎ Fulford 2002; ✔ Fulford 2018; ✔ Kovacsovics ("fast 1 m dick ... bis zu 3 m hoch") |
| Seating | timber; 11–12 rows on fill behind the wall, raised on radial timbers | ✔ Kovacsovics (Sunter); ✎ Fulford 2002 |
| Banks | crest about 4–5 m above the ground round them today (contours 94–95 m against 90–91 m) | ✔ contour plan |

### Why these heights

Nothing stands above the lowest courses, so every height is a reconstruction. Each figure is taken from a stated source so that it can
be checked and changed.

- **Ground 2.0 m above the arena floor** (S): Fulford's "some two metres below the original ground level" and C&F's "about 2 m". On
  Fulford's section the bank stands on old ground 2.0–2.7 m above the arena; the smaller figure is the one in the text.
- **Arena wall 2.9 m** (S/C): Fulford 2002 "originally about three metres high"; measured on his section against its 10 m scale bar,
  2.9 m. Sunter: "possibly up to 3 m". (A search summary gives 2.75 m, or 3.75 m with a parapet; not read.)
- **Rail 0.75 m** (X): the timber rail on top of the wall on Fulford's section, measured.
- **12 rows, each 0.78 m deep and 0.36 m high, from 2.9 to 7.2 m** (C): Fulford's section shows twelve benches over 9.3 m rising 4.3 m
  from the wall top (measured, 84 px/m at 2×); Sunter reconstructs 11 or 12 rows (✔ Kovacsovics). The first row starts at the wall
  top, as on the section. A 0.36 m rise and 0.78 m depth is a usual bench (a seat and a foot space).
- **Crest walk 1 m, fence 1.0 m** (C): the section has a level top behind the last row with a post; the first phase had a palisade there.
- **Outer slope to the toe at 17 m** (S plan / X slope): the toe is where the surviving earthwork ends on the contour plan and the
  LiDAR; between the crest (7.2 m) and the toe the slope is a straight line (about 40°), steeper than the section's 32° because the
  survey puts the toe closer. Today's crest stands 4–5 m above the ground round it, so the reconstruction's 5.2 m is close.
- **Passage floors** (S/X): from the arena floor to the old ground over the length of the passage walls (11–12 m, about 10°).
- **Passage wall tops** (X): they retain the bank, so they follow the seat-row nosings and then the crest; they end at the GIS ends.
- **Recess mouths** (X): arched, springing at 1.7 m with a semicircular head (crown 2.7 m), under the arena wall's top.
- **Recess vaults** (C): a half-dome over the semicircle and a short barrel back to the arena wall, springing at 1.7 m; the crown
  (2.7 m) stays under the seating (smoke-tested).
- **Banks beside the entrances**: retained by the passage walls along their length; beyond the walls' outer ends the earth falls away
  to the ground, so the entrances stay open (a cap on the bank height in `domain/arenaPlan.ts`).
- **No outer wall** (S, Fulford 2018); **no raised entrances**: nothing records anything over the passages in the stone phase.

### Rules for the model
| Part | Rule | Level |
|---|---|---|
| Ground | the levelled platform; the arena floor 2.0 m below it, in a hole the bowl's own surfaces fill (an apron out to the hole's edge) | S |
| Arena wall | GIS line, 0.85 m, 2.9 m high, timber rail 0.75 m | S / X |
| Seating | 12 timber rows, 0.78 × 0.36 m, from the wall top to 7.2 m | C |
| Crest | 1 m walk at 7.2 m, fence 1.0 m (gaps at the stairs) | C |
| Outer slope | straight to the surveyed toe, 17 m from the wall line | S / X |
| Passages | GIS walls retaining the bank, floor ramping 0 → 2 m over their length, then level | S / X |
| Recesses | GIS plan, arched mouths (springing 1.7 m), half-dome and barrel vault | S / C |
| Stairs | four, on the diagonals, 1.6 m wide, up the outer slope | X |
| Walking | one height function for the bowl (`arenaHeightAt`): arena, passages, recesses, rows, crest, slope | — |

## Generator

New plan element `arena` (`src/domain/keyPlan.ts`, geometry in `src/domain/arenaPlan.ts`, mesh in `src/presentation/kit/planArena.ts`):
the wall ring as polar samples, openings (passages, recesses) by angle, seating and bank profile, passages as wall pairs, recesses,
stairs. Every triangle is tagged (`arena-wall`, `passage-wall`, `seating`, `bank`, `rail`, `palisade`, `stair`, `recess`, floors,
vaults) with an evidence colour; three LODs (rows at LOD0, a single seating slope at LOD1/2; 3°/6°/12° sweeps, finer near the passages);
colliders for the arena wall, passage walls and recess walls. The ground mesh leaves a hole under the bowl (`GroundHole` in
`terrainSurface.ts`); the building's floor overrides the ground there (`floorOverrides`). The old kit `kit/amphitheatre.ts`, its
`EllipseBand` seating collider and its separate meshes are gone; the maps draw the arena wall and the bank's toe from the plan.

## Decisions

1. **Phase** (2026-10-13, user): Stone phase 2 (the stone arena with the 3rd-century floor raising).
2. **Approach** (2026-10-13, user): extend `planBuilding` with an elliptical element rather than keep the kit.
3. **LOD budget** (2026-10-13, user): LOD0 cap **12k**, normal distance LOD.
4. **Anchor** (2026-10-13, user): `amphitheatre`, 74.5 × 80.8 m at the 20° axis.
5. **Footprint** (2026-10-13, user): arena, passages and recesses from GIS 04; banks concentric with the arena, crest at the back of the
   seating, toe 17 m (contour plan, LiDAR).
6. **Sunken arena** (2026-10-13, user): option A, the floor 2 m below the ground, in a hole in the ground mesh.
7. **Plan** (2026-10-14, user "carry on" after the step-6 sheet): as drawn, with the four conjectural outside stairs.
8. **Drawings** (2026-10-14): two sections only; outside elevations dropped (the drawings have no earth in front, so the sunken arena
   would show below the ground line).
9. **Wall facing** (2026-10-14, user, with photographs): flint with single courses of brown ironstone at uneven heights, not tile
   courses; no brick quoins. New style `flintIronF`.

## Generated model

Drawings: `npm run dev`, then <http://localhost:5173/tools/elevations.html?id=amphitheatre> (section along the long axis, section across
through the recesses, 3D, plan). Review pictures: `tmp/key-plans/amphitheatre-step6.png`, `tmp/key-plans/amphitheatre-step9.png`.
Dev spawns: `?at=467,-197.4,200` (outside the north entrance, facing in); `?at=452,-150,200` (in the arena).

Smoke (2026-10-14): **LOD0 9,494 / LOD1 1,228 / LOD2 710** tris, 135 wall colliders, cap 12k; whole town **22 draws** (34 before: the
old kit was 13 meshes), **215,662 tris** (206,077 before). The earth (banks, crest walk) is smooth-shaded: each vertex averages the face normals meeting it within 50°, so the vertical step behind the top row stays crisp.

Not modelled: gates; a tribunal over the recesses; the eastern ditch (North-East Annex); the medieval hall.
