# Town wall and gates: research brief

Status: **in game** (2026-10-14). Target period: **late 3rd century AD (c. 270–280)**.
Geometry is GIS layer 04 (`tmp/gis04/layer04.geojson`, "a digitisation of the Roman Town Wall", records 1–13);
Great Plan rings (`tmp/audit-buildings/raw.geojson`) only show the buildings next to the gates.

Claim tags: **✔** read in the document itself (or the project data), **◐** from a search summary only, **✎** given by the
user from a book not read here, or recollection. Evidence levels for the model: **S** Silchester, **C** comparison,
**X** conjecture.

## Sources

- ✔ **Fox & St John Hope 1890**, "Excavations on the site of the Roman city at Silchester, Hants, in 1890", *Archaeologia* 52,
  733–58: the north, south and west gates (pp. 750–8), Pl. XXXI (plans of the north, south and west gates), XXXII (south gate
  capital, arch tile), XXXIII (west gate impost, arch tile, door strap). Internet Archive:
  <https://archive.org/details/sim_archaeologia-tracts-relating-to-antiquity_1890_52> (scan pp. 848–64; OCR drops numbers, so the
  figures below are read off the page images).
- ✔ **Creighton with Fry 2016**, *Silchester: Changing Visions of a Roman Town*, ch. 8 "The Town Wall and Ditch", pp. 285–301
  (every gate's interventions and description; the wall sections; dating). <https://centaur.reading.ac.uk/62521/>
- ✔ **Collis 1983**, "Excavations at Silchester, Hants, 1968", *Proc. Hampshire Field Club* 39, 57–68 (wall construction by the
  south gate, gang junction, dating). <https://www.hantsfieldclub.org.uk/publications/hampshirestudies/digital/1980s/vol39/Collis.pdf>
- ✔ GIS layer 04 metadata: "a compromise between the various plans which exist. Its main shape and outline is based on the OS
  Landline location of the wall, though this has been adjusted in places marginally, particularly the north and south gates and
  lesser east gate ... The gate plans come from Joyce and the Antiquaries' excavation reports."
- ✎ **Fulford 2002**, *A Guide to Silchester*, the town-wall passage, supplied by the user (2026-10-14; notes in
  `tmp/research/walls/fulford2002-notes.md`).
- ✎ The user's photographs of the surviving wall (`tmp/research/walls/3–5.webp`) and two reconstruction paintings (`1.webp`,
  `2.png`; artist not given: a crenellated tower over an arched gate with tile bands and a curved flanking wall; reconstruction
  art, used only as a lead).
- Not read: Fulford 1984, *Silchester Defences 1974–80* (Britannia Monograph 5); Fulford et al. 1997, "Silchester: excavations at the
  North Gate, on the North Walls, and in the Northern Suburbs 1988 and 1991–3", *Britannia* 28, 87–168 (paywalled; via C&F only);
  Joyce 1881 (*Archaeologia* 46, east and south gates); St John Hope 1897 (*Archaeologia* 55, Lesser West gate); St John Hope
  1909 (*Archaeologia* 61, east gate); St John Hope & Stephenson 1910 (*Archaeologia* 62, ditches); Cotton 1947; Boon 1974; Allen 2013.

## Development (summary)

| Date | What happened | Source | c. 270–280 |
|---|---|---|---|
| c. 180–200 | Earth rampart and V-shaped inner ditch (about 6 m wide, 2 m deep, 2–8 m out from the later wall); gates already standing (timber, then stone at the north gate; the south gate predates the rampart) | ✔ C&F 2016 | rampart stands behind the wall; ditch filled |
| c. 260–280 | Stone wall built about 2 m in front of the cut-back rampart, the gap filled with clay; V-ditch filled; new U-shaped ditch about 12 m wide, 10–22 m out | ✔ C&F 2016; ✔ Collis 1983 ("about AD 250 or later, but before AD 300"); ✎ Fulford 2002 (260–80) | **shown, new** |
| undated, late | West gate's southern passage blocked with re-used stones; Lesser West gate narrowed to 2.13 m; SE footway blocked | ✔ 1890 ("probably a late one"); ✔ C&F 2016 | **not shown** (later) |
| 4th c. | North gate's inner ditch recut | ✔ C&F 2016 | later |

## Layout

### Curtain wall
- ✔ Circuit **2,446 m** along the game's centreline (C&F: 2.4 km; ✎ Fulford 2002: over 2.5 km).
- ✔ **Thickness 9 ft 9 in (2.97 m)** less the external footing (1890, p. 752); "around 2.9 m, with an additional external plinth
  projecting 0.23 m" (C&F). The GIS strips are drawn 1–3 m wide (mean 2.13 m), so the GIS gives the **line**, the sources give the
  **thickness**.
- ✔ **Inner set-off**: the inner face steps back 2 ft (0.6 m) "throughout its circuit, the lower part serving as a deep plinth"
  (1890); at about 2 m (7 ft) above the foundation, reducing the thickness by about half a metre (Collis 1983).
- ✔ **Counterforts**: "broad pilasters, 12 feet across, formed by carrying up the full thickness of the lower part of the wall";
  about 200 ft (61 m) apart, 100 ft by the north gate (1890); purpose unknown, perhaps stairs (Cotton, Boon via C&F).
- ✔ **Rampart** behind: the earlier bank, its front cut back for the wall (Collis 1983; C&F). Its size: Startin's bank cross-section
  about 29.2 m² (C&F), so roughly 2.5–3 m high over about 12–15 m (to be worked out).
- ✔ **Ditch**: U-shaped, about 12 m wide, 10–22 m out (C&F); ✎ "about 14 m wide" (Fulford 2002). No causeway found at the west,
  Lesser West or amphitheatre gates (bridges suspected); perhaps a causeway at the south (C&F).
- Surviving height up to 4.5 m by the south gate (✎ Fulford 2002); "now from 7 to 12 feet high" by the north gate in 1890 (✔).
  Boon's estimate: 6 m with a 1.8 m parapet (✔ via C&F; Boon not read).

### Gates (proposed positions in the game frame, from GIS 04)
| # | Gate | Where (x, z) | Plan | Source |
|---|---|---|---|---|
| 1 | North | (−170, −347) | single passage between two walls 18 ft long, 4 ft thick, 12½–13 ft apart; inner and outer arches about 11 ft wide, 2½ ft deep; doors behind the outer arch; timber threshold; **no guard chambers**; set back 24 ft between inward-curving flanking walls | ✔ 1890; ✔ GIS; C&F: arch 3.35 m |
| 2 | South | (−115, 393) | as the north gate; set back 28 ft; no guard chambers; a rough foundation by the west wall perhaps for steps to the gate platform; arch of tile voussoirs | ✔ 1890; C&F: 3.5 m |
| 3 | East | (366, 0) | double carriageway, arches 3.66 m, passages 4.88 m long, guardrooms; at an angle to the street grid | ✔ C&F (Joyce 1881, St John Hope 1909 not read); ✔ GIS |
| 4 | West | (−423, −6) | two passages 13 ft wide, arches 12 ft wide and 2 ft deep front and back, central wall 3 ft; guardhouses 12 × 24 ft projecting like towers, walls 4 ft (3 ft beside the gate), two rooms each (5 × 6 ft and 5 × 7½ ft); forecourt 29 × 12 ft | ✔ 1890; ✔ GIS |
| 5 | Lesser West | (−416, 152) | single arch 3.55 m wide, 0.99 m deep in the outer face; inner arch 3.62 m wide, 2.10 m deep; wall 2.93 m thick here | ✔ C&F (1897 not read) |
| 6 | Amphitheatre | (349, −100) | single carriageway 3.3 m; the wall's foundation runs across its base | ✔ C&F |
| 7 | South-east ("sluice") | (117, 336) | footway about 1.2 m with a drain beneath; brick piers and masonry passage walls | ✔ C&F (Fulford 1984 not read) |

The model today has four gates; the **north gate is 120 m east of the real one** (it was placed on a road crossing by
`import-gis.mjs`), and all four are the same invented kit (two square towers with pyramid roofs, a timber lintel).

### Other breaks in the GIS strips (not gates unless evidence turns up)
(−370, −99): a break in the wall "for no apparent reason", taken as access between fields, earlier than the 1890s plan (✔ C&F, Fulford
Trench 3); (−383, −83), (−224, 362), (281, 215): no evidence; (231, 253): possibly where the stream breached the wall (✔ C&F, 1902).

## Construction and finishes

| Part | What the evidence shows | Source | Level |
|---|---|---|---|
| Foundation | gravel and flints, a pad of mortar, then a course of ironstone slabs; oak piles in marshy places (SE) | ✔ Collis 1983; ✔ C&F | S |
| Wall face | flint in courses; **after every 4–5 flint layers a double course of limestone** through the whole thickness | ✔ Collis 1983; ✔ C&F; ✎ Fulford 2002 ("flattish slabs", limestone from the Bath region); ✎ user's photographs | S |
| Plinth | external plinth 0.23 m | ✔ C&F | S |
| Gate flanking walls (north) | "alternate bands of flints and large blocks of ironstone", chamfered ironstone plinths of 6 in projection | ✔ 1890 | S |
| West gate | flint rubble faced with narrow courses of ironstone alternating with tile bonding courses; inside, flint and tile in alternate double bands; door jambs of tile; quoins of stone blocks on tile footings; imposts of moulded ironstone; arches of tile voussoirs; guardrooms plastered, painted with broad pink lines on white; pink cement on the gate's face | ✔ 1890 | S |
| South gate | smaller material, much less ironstone than the north gate; tile voussoir arch | ✔ 1890 | S |
| Doors | double leaves 4 in thick, iron-shod pivots in timber thresholds | ✔ 1890 | S |
| Roadway | 12 in of flints, gravelled on top | ✔ 1890 | S |

## Not known

The wall's height, the wall walk and parapet (crenellated or not), what stood over the gates (towers? "the destroyed
superstructures of the gates were of the simplest possible character" ✔ 1890; "a large platform over the gate" ✔ 1890), whether the
passages were vaulted or roofed in timber (✔ 1890: cannot be said), the counterforts' purpose, the rampart's profile, bridges.

## Decisions

1. **Scope** (2026-10-14, user): the curtain wall, all seven gates, the rampart behind and the ditch in front.
2. **Approach and budget** (2026-10-14, user): gates as plan-built key buildings (about 6k LOD0 each, about 3k for the minor
   gates); the curtain wall from its own chunked generator on the GIS centreline (about 20k LOD0 for the whole circuit); the north
   gate moved to its GIS position.
3. **Gate positions** (2026-10-14, user): the seven gates as drawn in `tmp/key-plans/walls-step2.png`, from the GIS 04 gate
   plans; the other breaks in the GIS strips are closed as plain wall.

4. **Phase rule** (2026-10-14, user): as below.
5. **Anchors** (2026-10-14, user): the seven gate anchors below, written to `assets/key-buildings.geojson` (`user-approved-outline`).
6. **Ditch crossings** (2026-10-14, user): timber bridges at the west, Lesser West and amphitheatre gates (no causeway found: C&F 2016,
   St John Hope & Stephenson 1910 via C&F); earth causeways at the south gate (suggested by the sections flanking the road, C&F) and at the
   north, east and SE gates (not known: **X**).

7. **Wall plans** (2026-10-14, user): the seven gate plans as drawn in `tmp/key-plans/walls-step6.png`; the north gate's
   asymmetric flanks as recorded (✔ 1890: the western flank at an angle, perhaps a change of plan; the eastern square within).
8. **Wall height** (2026-10-14, user): Boon's "6 m high with a parapet of 1.8 m" read as 6 m overall: walk 4.2 m, parapet top 6.0 m.
9. **Parapet** (2026-10-14, user): crenellated (C).
10. **West and east gate towers** (2026-10-14, user): the guardhouses rise one storey above the walk with a crenellated top (X).
11. **Budget** (2026-10-14, user): curtain wall about 24k triangles for the whole circuit at full detail, built in chunks with distance
    LOD; gates about 6k (main) and 3k (minor) LOD0 each.
12. **Drawings and views** (2026-10-14, user): approved as in `tmp/key-plans/walls-step9-*.png`, with the lowered springings, the
    whole circuit as one mesh, and the gates levelled locally instead of terrain platforms.
13. **Facing** (2026-10-14, user): new style `flintLimeF` (`facing: "flint-limestone"`, cell `flintLime`): FL for High, FLs for Standard. Flint in 4–5 courses, then a double course of flat slabs, brown ironstone and grey to buff limestone mixed band by band (the user pointed to their photographs: "a mix of flat slab coursing including brown ironstone as well as limestone"). Lab: `tools/materials.html?id=south-gate&set=town`; comparison `tmp/key-plans/walls-step10-facing.png`.

## Phase rule (agreed, step 5)

The stone wall as newly built (c. 260–280): the wall on the GIS line, with its footing, plinth, inner set-off and counterforts; the
earlier rampart behind it, its front cut back; the V-shaped inner ditch filled; the new U-shaped ditch open. **All seven gates open:**
the blockings (west gate south passage, Lesser West narrowing, SE footway) are undated and read as late by the excavators, so they are
left out, as for the baths' phase 6.

## Anchors (agreed, step 5)

One anchor per gate in `assets/key-buildings.geojson`: the rectangle around the gate's GIS 04 parts within a radius of the gate
(north 17 m, south 14 m, east and west 13 m, minor gates 6 m), `u` along the wall, `v` towards the town; minor gates take the wall's
true thickness (2.97 m + plinth) rather than the GIS strip. Picture `tmp/key-plans/walls-step5.png`; numbers in
`tmp/key-plans/walls/anchors.json` (`tmp/key-plans/walls-scripts/anchors.py`).

| Anchor | w × d (m) | `u` bearing in the game frame |
|---|---|---|
| north-gate | 35.0 × 13.8 | 179.5° |
| south-gate | 28.6 × 14.8 | −2.9° |
| east-gate | 26.8 × 12.5 | −72.8° |
| west-gate | 26.2 × 10.0 | 87.1° |
| lesser-west-gate | 13.0 × 4.2 | 84.9° |
| amphitheatre-gate | 13.0 × 4.4 | −147.7° |
| se-gate | 9.5 × 8.6 | −37.6° (wall chord; its GIS parts are a fan) |

The curtain-wall generator stops at each anchor; the gate plan takes over inside it.

## Wall plans (step 6, agreed)

`assets/key-plans/<gate>.plan.json` (seven files), written by `tmp/key-plans/walls-scripts/mkgates.py` from the GIS 04 gate plans read
in each gate's frame (`gateraster.py`, `gatezoom.py`; `u` along the wall, `v` out to the field). Heights are placeholders until step 7.
Plan sheet: `tmp/key-plans/walls-step6.png` (`sheet6.py`). **Not yet imported** (`npm run import:keyplans` would put them in the game).

Readings worth knowing:
- ✔ **The GIS gate plans are the excavated plans.** West gate: guardhouses 3.8 m wide (12 ft), passages 3.97 m (13 ft), central wall
  0.95 m (3 ft), passage 3.65 m long (12 ft), forecourt 3.65 m deep (12 ft); north gate: passage walls 1.2 m (4 ft), 3.75 m apart
  (12½–13 ft); east gate central wall 4.75 m long (C&F: passages 4.88 m). The notches in the GIS outlines are the arch imposts and door
  rebates.
- ✔ **The curtain strips are the wall above the set-off.** By the north gate the strip is 2.4 m and a counterfort projects 0.6 m from its
  inner face for 3.7 m (12 ft): the 1890 description exactly (wall 2.97 m at the base, set back 2 ft inside, counterforts 12 ft wide
  carrying the full lower thickness up). Elsewhere the strip is drawn 1.9–2.5 m. So: the GIS strip is the upper wall's line; the
  set-off adds 0.6 m on the town side below about 2 m, the plinth 0.23 m outside; thickness from the evidence, not the strip.
- **Flanks and returns** (north and south gates' inward-curving flanks, the west gate's curtain returns) are stretches of the town
  wall's own section (`kind: "curtain"`), drawn as short straight segments along the GIS curve; the curtain generator stops at
  `curtainEnds`. The mound (rampart) backs them (✔ 1890, Pl. XXXI "MOUND"), drawn as `mound` areas.
- **Arches** are short walls across each passage carrying an arched opening, front and back: north 3.2 / 3.35 m (11 ft), 0.76 m deep
  (2½ ft); south 3.0 / 3.3 m; west and east 3.66 m (12 ft), 0.61–0.65 m deep (2 ft). Doors hung behind the outer arch (✔ 1890).
- **Guardhouses** (west ✔ 1890; east by comparison, **C**): the GIS draws one long chamber each; the 1890 description gives two rooms,
  6 ft and 7½ ft long, with 3 ft doors in the town end and in a cross wall, added from the text.
- **Minor gates.** Lesser West: two arch walls in the 2.93 m wall (outer 3.55 m wide, 0.99 m deep; inner 3.62 m, 2.10 m deep; ✔ C&F);
  the GIS gap is 5.35 m. Amphitheatre: the wall thickened on the town side either side; an arched passage 3.3 m wide through it
  (width ✔ C&F, the arch **X**). SE footway: passage walls with brick piers running 5.2 m in from the wall, an opening 1.2 m through
  the wall (the later blocking, drawn across its inner end in the GIS, left out).

## Elevations: evidence and rules (step 7, agreed 2026-10-14)

Nothing above the wall's surviving height (4.5 m by the south gate ✎ Fulford 2002; "7 to 12 feet" by the north gate in 1890 ✔) and
nothing of any gate above its foundations survives, so every figure above those is **X**, derived from a stated reason.

### What the Silchester evidence gives us (S)
| Element | Evidence | Source |
|---|---|---|
| Wall section | 2.97 m at the base; inner face set back 2 ft (0.6 m) at about 2 m (7 ft) up; external plinth 0.23 m; counterforts 12 ft wide, about 200 ft apart (100 ft by the north gate), carrying the lower thickness up | ✔ 1890; ✔ Collis 1983; ✔ C&F |
| Facing | flint in courses, a double course of limestone slabs every 4–5 flint courses; footing course of ironstone slabs | ✔ Collis 1983; ✔ C&F; ✎ Fulford 2002; ✎ photos |
| Surviving height | up to 4.5 m (south gate) | ✎ Fulford 2002 |
| Height estimate | "Boon estimated the Wall would originally have been 6 m high with a parapet of 1.8 m" (whether 6 m includes the parapet is not clear; Boon 1974 not read) | ✔ C&F (Boon 1974, 101) |
| Rampart | the earlier bank, its front cut back; the wall built 2 m in front, the gap filled with clay; bank section about 29 m² (Startin); sections drawn true to scale show it about 2.5–3 m high over about 7 m behind the wall | ✔ Collis 1983; ✔ C&F pp. 298–301, fig. 8.2 |
| Ditch | U-shaped ("shallow saucer"), about 12 m wide, 10–22 m out; about 2 m deep in fig. 8.2; ✎ "about 14 m wide" | ✔ C&F; ✎ Fulford 2002 |
| Gates' superstructure | "of the simplest possible character"; north gate: "the large platform over the gate itself would enable the defenders to pass from one side to the other"; "how the passage of the gate was covered, whether by a wooden roof or a barrel vault, unfortunately cannot be said"; passages "covered (originally)"; south gate: a foundation "perhaps for steps to platform" | ✔ 1890 |
| West gate | guardhouses "towards the field ... projected like two flanking towers, for which purpose, indeed, they were probably used"; walls 4 ft (strong enough to rise above the wall); arches sprang from "boldly-moulded imposts" of ironstone; arches of tile voussoirs | ✔ 1890 |
| Doors | double leaves 4 in thick, pivots in timber sills | ✔ 1890 |

### Comparisons (C)
- ✔ 1890: the west gate's plan is "strikingly" like the main gates of Chesters and Birdoswald on Hadrian's Wall (the projecting guard
  chambers being the difference). No standing gate of that type survives to its full height; reconstructions (and the user's two
  paintings) give their towers one storey above the wall-walk with a crenellated top (✎, not read).
- Crenellated parapets on Roman town and fort walls are shown on Trajan's Column (✔ 1890 cites Bartoli's plates of it for ballistae on
  gates) and in most reconstructions; no Silchester evidence either way.

### Why these heights (proposed; each is X unless marked)
- **Wall-walk 4.2 m, parapet top 6.0 m** (proposed reading of Boon's "6 m high with a parapet of 1.8 m" as 6 m overall). The other
  reading (walk at 6 m, top at 7.8 m) is possible; the lower one is chosen because it stays close to what survives (4.5 m) and to the
  rampart, and because unknown sizes are not to be raised for effect. Walk width: the upper wall (2.37 m) less a 0.6 m parapet = 1.77 m.
- **Parapet**: 0.6 m thick, crenellated (merlons 1.0 m wide and 0.8 m tall over a 1.0 m breastwork, gaps 1.0 m), **C**; or plain (see
  the questions). Coping of flat stone slabs (a piece of coping "possibly from the Town Wall" came from Insula XXIIa, ✔ C&F p. 66; its shape is not described).
- **Inner set-off at 2.0 m** (✔ Collis "about 2m (7 feet)"), **S**.
- **Counterforts**: the full lower thickness carried up to the walk; each carries a stair from the rampart crest to the walk (Cotton and
  Boon's reading ✔ via C&F; the stair itself **X**). This also makes the walk reachable.
- **Rampart**: crest 3.0 m, 4 m wide behind the wall, back slope to the ground over 7 m (✔ fig. 8.2 proportions; section 26 m²,
  close to Startin's 29 m²).
- **Ditch**: 12 m wide, its inner edge 10 m out, 2.0 m deep, saucer section (✔ C&F, fig. 8.2).
- **North and south gates**: no towers (✔ 1890: no guard chambers, "simplest possible character"). The passage carries a platform at
  the walk's level (4.2 m) with the parapet round its field side (✔ 1890 "large platform over the gate"); the passage roofed with timber
  under the platform (the 1890 report leaves timber or vault open; timber because nothing of a vault was found). Arches: springing at
  2.6 m, crown at 2.6 + w/2 (4.2–4.3 m for 3.2–3.35 m arches), the platform's beams over them: the lowest springing that gives a laden
  cart (about 3.5 m) room under the crown and keeps the crown below the walk.
- **West and east gates**: the guardhouses rise as **towers one storey above the walk**: the two chambers are the ground storey, up to the
  walk's level (4.2 m, which is also the platform over the passages); the tower room above, 4.2–7.4 m, entered by a door from the
  platform, with windows to the field; a flat deck on top at 7.4 m with a crenellated parapet to 8.2 m (one storey of 3.2 m above the
  walk, as the comparanda). The forecourt between the towers is open. Arches 3.66 m: springing 2.4 m, crown 4.23 m, just under the platform.
- **Lesser West, amphitheatre and SE gates**: openings through the wall with the walk carried over on the arch: arches springing 2.4 m
  (Lesser West 3.55–3.62 m wide; amphitheatre 3.3 m), the SE footway 1.2 m wide, 2.1 m to the springing. Their passage walls (SE) rise
  2.4 m, holding up the rampart either side (X).
- **Guardroom doors** 0.9 × 2.0 m (✔ width; height X).
- **Bridges** (west, Lesser West, amphitheatre): timber, 4 m wide, deck at the ground level, on trestles in the ditch (X).

### Triangle estimate (for the cap)
Curtain, about 400 GIS segments: section 18 tris each (plinth, outer face, inner lower face, set-off, inner upper face, walk, parapet) ≈
7.2k; 40 counterforts with stairs ≈ 1.6k; rampart 3–4 strips ≈ 3.2k; merlons, about 1,200 at 2 m pitch × 10 tris ≈ 12k. So **about 24k
for the whole circuit at full detail, 12k without merlons**. Built in chunks of about 150 m with distance LOD (merlons only within
about 150 m), the near chunks cost about 3–4k. Gates: north and south ≈ 2.5k, west and east with towers ≈ 4–5k, minor gates ≈ 0.6–1k.
The ditch is a change to the ground surface, not a mesh.

### Change while modelling (2026-10-14)
The arch springings came down from the draft (2.6 / 2.4 m) so that each crown, plus the platform's 0.3 m of beams, stays under the
walk's level (4.2 m): **2.2 m** at the north, south, Lesser West and amphitheatre gates (crowns 3.85–4.0 m), **2.0 m** at the west and east
gates (3.66 m arches, crowns 3.83 m), 2.1 m for the SE footway (crown 2.7 m). Still room for a laden cart (about 3.5 m). **X**.

### Rules for the model
| Part | Rule | Level |
|---|---|---|
| Line | the GIS 04 strip centre (the upper wall), 7 runs between the gates (`assets/key-plans/town-wall.json`, `wallline.py`) | S |
| Section | plinth 0.23 m to 0.35 m; outer face; walk at 4.2 m between a 0.6 m parapet and the inner face; parapet to 5.2 m, merlons 1 m wide with 1 m gaps to 6.0 m; inner face down to the set-off at 2.0 m, then the full 2.97 m to the foot | S (section) / X (heights) / C (merlons) |
| Counterforts | 39: 17 where the GIS strip's inner face stands proud (15 found by the script, the one east of the north gate by hand: "on each side of the north gate, and at equal distances"), the rest about 61 m apart ("about 200 feet"); each 3.66 m along, carried up to the walk, with 6 steps up from the rampart's crest | S / X (positions of 22; steps) |
| Rampart | crest 3.0 m from the inner face for 4.6 m (burying the set-off), back slope over 7 m; stops at the runs' ends; at the north, south, west and east gates the 1890 "MOUND" behind the flanks (`mound` areas); sloping down to the minor gates' passages | S / X (profile) |
| Ditch | 12 m wide from 10 m beyond the wall face, 2.0 m deep, saucer section; carried on across the west, Lesser West and amphitheatre gates under timber bridges; causeways at the others | S / X |
| North, south gates | passage walls to 4.2 m; platform (timber deck) at 4.25 m over the passage and the passage walls; outer arch carried up as a crenellated parapet to 6.0 m; flanks are the wall's own section; south gate steps from the town side to the platform | S (plan) / X |
| West, east gates | guardhouses: two chambers (doors 0.9 × 2.0 m) to 4.2 m, tower room 4.25–7.45 m (doors from the platform and the walk), flat deck at 7.45 m, merlons to 8.2 m, tower windows 0.6 × 1.1 m; platform over the passages; outer arches carried up as parapets; the east gate's walk reaches its towers over a landing on their field side | S (plan) / C (rooms of the east gate) / X (heights, doors, windows, landing) |
| Minor gates | the walk carried over each gateway on a deck at 4.25 m; outer arch ring carried up as the parapet | X |
| Gates' ground | levelled to the highest point under each gate, blending back over 4 m (drawn by the earthworks mesh) | — |

## Materials

| Part | Shown | Source | Level |
|---|---|---|---|
| Wall faces (curtain, flanks, gates) | flint in 4–5 rough courses (0.55 m), then a **double course of flat slabs** 5–9 cm thick (now and then a single one), bands every 0.68 m level along the wall; each band mostly brown ironstone (4 in 10) or grey to buff limestone, a third of its slabs of the other kinds (`facing: 'flint-limestone'`, style `flintLimeF`) | ✔ Collis 1983 ("after every 4-5 flint layers there were double horizontal courses of limestone"); ✔ C&F ("a variety of sedimentary deposits"); ✎ Fulford 2002 (limestone from the Bath region); ✎ the user's photographs (a double course of long brown ironstone slabs; thinner grey and grey-brown slabs) | S (pattern, materials) / X (the mix by band) |
| Footing course | not shown separately (below ground) | ironstone slabs on a mortar pad ✔ Collis | S |
| Plinth | 'stone' cell | chamfered ironstone plinth at the north gate's flanks ✔ 1890; 0.23 m ✔ C&F | S |
| Gate walls (west gate) | same flint style | "narrow courses of ironstone alternating with bonding courses of tile" outside, flint and tile in double bands inside ✔ 1890 | S (simplified) |
| Arches | brick soffits (generator default) | tile voussoirs ✔ 1890 (south, west gates) | S |
| Door jambs, quoins | brick (generator default) | jambs "entirely of tile", quoins of stone blocks on tile footings ✔ 1890 (west gate) | S / simplified |
| Wall-walk, set-off, merlon tops | 'stone' cell (generator default) | not recorded | X |
| Platforms, tower floors and decks | timber ('wood') | the 1890 report leaves timber or vault open | X |
| Passage and forecourt floors | gravel | "a layer of flints 12 inches thick ... gravelled" ✔ 1890 | S |
| Guard chambers' floors | opus signinum | not recorded | X |
| Guard chambers' walls | plaster (dado and pink, generator default) | "plastered internally ... painted ... broad pink lines on a white ground" ✔ 1890 (west gate) | S (west) / C (east) |
| Rampart, gate mounds, ditch | grass (tiled 'grass' cell) | earth bank and ditch ✔; turf not recorded | S / X (surface) |
| Bridges | timber deck, rails and trestles | a bridge suspected where no causeway was found ✔ C&F | X |
| Doors | not modelled (openings only) | double leaves 4 in thick on iron-shod pivots ✔ 1890 | — |

## Generated model

- **Circuit** (`kit/townWall.ts`, one mesh, one draw): section 21,034 triangles (cap 24k, decision 11), earthworks 23,666, bridges
  480. The whole circuit is one mesh at full detail: chunking it for distance LOD would add a draw per chunk, and 21k triangles is cheap.
- **Gates** (plan-built, walls layer): north 702, south 794, east 1,688, west 1,742, Lesser West 228, amphitheatre 338, SE 236 (LOD0).
- **Town**: 28 draws (was 22: seven gate meshes and the wall replace the old wall mesh and its instanced gates), 256k triangles (was
  216k).
- **Walking**: the wall-walk, gate platforms, tower floors, stairs and bridges are decks (a step of 0.6 m or less above your feet);
  wall colliders carry their tops, so you walk on the walk and are stopped by the parapet. The ground over the ditch is hidden
  under the earthworks mesh by a mask on the ground's material.
- Review pictures: `tmp/key-plans/walls-step9-drawings.png`, `tmp/key-plans/walls-step9-views.png`.
