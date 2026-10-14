# Mansio: research brief

Status: **in game** (2026-10-13). Target period: **late 3rd century AD (c. 270–280)**.
Ring refs (`rNNN`) are Great Plan rings in `tmp/audit-buildings/raw.geojson`; review them with
`node scripts/key-review.mjs mansio`.

Claim tags: **✔** read in the document itself (or the project data), **◐** from a search summary only, **✎** given by the
user from a book not read here, or recollection. Evidence levels for the model: **S** Silchester, **C** comparison,
**X** conjecture. **The Great Plan rings are the truth for geometry**; plans and texts decide which rings belong, what
the openings are and what stood above ground.

## Sources

- ✔ **Hilton Price 1887**, "Further notes upon excavations at Silchester", *Archaeologia* 50, 263–80: "Block VIII" (the
  mansio, pp. 271–2: Joyce's "cavalry barracks", Langshaw's measurements of the south wing) and "Block IX" (the baths,
  pp. 272–80, rooms 1–16, wall coursing; plans by Hodge 1881, Pls. XVII–XIX, bird's-eye view Pl. XVIII). Internet Archive scan:
  <https://archive.org/details/sim_archaeologia-tracts-relating-to-antiquity_1887_50>.
- ✔ **Fox & St John Hope 1894**, "Excavations on the site of the Roman city at Silchester, Hants, in 1893", *Archaeologia* 54,
  199–238; Insula VIII pp. 210–32, the "hospitium" pp. 222–7, the baths' drainage pp. 227–32. **Plate XVII** (plan of Insula VIII:
  OS survey of Joyce's excavation, lighter; 1893 work, black). Internet Archive scan:
  <https://archive.org/details/sim_archaeologia-tracts-relating-to-antiquity_1894_54>.
- ✔ **Creighton with Fry 2016**, *Silchester: Changing Visions of a Roman Town* (Britannia Monograph 28), pp. 147–52 (Interior 16,
  Insula VIII: excavation history, description, interpretation) and figs 5.50–5.52. <https://centaur.reading.ac.uk/62521/>
- ✎ **Fulford 2002**, *A Guide to Silchester*: the mansio passage and plan, supplied by the user (2026-10-12): three wings, heated
  rooms only in the west wing, suites either side of small divided rooms, outer court with baths in the SE, duplicated rooms for
  both sexes, **a latrine a later addition on the southern side**, Wanborough as the nearest parallel. The user's note says
  "Insula 7": the building is in **Insula VIII** (✔ 1894, C&F 2016).
- ✎ **Boon 1957**, *Silchester: the Roman Town of Calleva*, supplied by the user: 200 × 210 ft overall; **probably a granary,
  60 × 30 ft, with stoutly buttressed west wall and several smaller chambers**; date unknown, "hardly ... before the middle of the
  second century ... and may well be much later" (from its alignment with the streets); a **massive spring-fed reservoir, 6 ft
  square internally, paved with heavy tiles**.
- ◐ Leads not read: Boon 1974, *Silchester: the Roman Town of Calleva* (138–44, the baths for both sexes); Drury 1988 (Chelmsford
  mansio, CBA RR 66); Phillips & Walters 1977, "A mansio at Lower Wanborough", *Britannia* 8, 223–7; Black 1995 (mansiones and
  the cursus publicus).

## Georeferencing

- The Great Plan rings carry the whole building: r1674 (north and south wings, 20 holes), r1673 (west wing), r864 (outer walls,
  west additions, baths), r855 (granary and yard), r9 (angled outer-court wall) and small bath fragments. "Only 4 rings" in
  `other-buildings.md` was misleading: the rings are few because each is a large wall network.
- ✔ **Pl. XVII fitted by chamfer matching** (affine; plate wall pixels to the in-rings): west half (scan p. 261) 88% of wall pixels
  within 0.3 m of a ring wall, east half with the baths (p. 258) 87%; 0.052 m/px. So the Great Plan here is this plate,
  digitised. Control points in `assets/key-plans/mansio.review.json` are generated from the fit; images
  `tmp/research/mansio-1893-{west,east}.jpg`.
- ✔ Outline: min-area rectangle of the modelled rings **130.0 × 65.1 m, turned 3.9°** (walls run at 3.7–3.9°). The user's pin
  `mansio-courtyard` (45.8 × 34.1 m) was the courtyard only: it matches Fox's "148 feet long by 115 feet wide" (45.1 × 35.1 m)
  within a metre. Anchor renamed `mansio` (Decision 4).

## Development (summary)

| Date | What happened | Source | c. 270–280 |
|---|---|---|---|
| mid-2nd c. or later | Built, aligned with the street grid; no dating evidence | ✎ Boon 1957 | standing |
| undated ("at some time") | West side altered: apsidal room and two rooms added on the west, the outer corridor absorbed at both ends and returned round the new rooms | ✔ 1894 | **shown** (Decision 2) |
| undated | Latrine added on the south side (dashed "latrine?" on Fulford's plan; not in the Great Plan) | ✎ Fulford 2002 | not modelled |
| 4th c.? | Coin hoard (200+ coins in the lead pipe of the "natatio") and a skeleton in the baths | ✔ C&F 2016 (Kempe 1833) | later |
| 1833 / 1875–81 / 1892–3 | Coles; Joyce, Langshaw and Monro (OS survey); the Antiquaries re-dug the west side and the baths' drains | ✔ C&F 2016, 1887, 1894 | |

**Phase rule (agreed):** the building as excavated, with the undated west-wing alterations.

## Layout in the late 3rd century

Plan frame: origin at the anchor's SW corner, `u` east-ish, `v` north-ish (metres).

- **Courtyard** 45 × 35 m (✔ 1894), closed on the east "by a wall only" (✔ 1894; thick wall d162, 1.1 m).
- **Three wings**, each a row of chambers between an **inner corridor** on the court and an **outer corridor** (✔ 1894). North and
  south wings of equal width, the west wider (✔ 1894). Chambers about 4–7 × 5.8 m; several divided by a cross wall (✔ Great
  Plan; ✎ Fulford's "suites either side of small divided rooms").
- **Main entrance** near the west end of the north wing, "in amplitude and arrangement very much resembled the main entrance to the
  forum" (✔ 1894): a gap 5.8 m wide in the north outer wall ("GATE" on Pl. XVII ✔) leading through the outer corridor into an
  **entrance hall** 6.6 m wide that crosses the range (✔ Great Plan).
- **West wing**: three rooms heated by hypocausts (one "of considerable proportions"), "the stairway to an upper floor", and at the
  NW corner "probably the kitchen and its dependencies" (✔ 1894). Joyce found part of the building "paved with very rough, and great
  heavy flints, such as might have been required for stables" (✔ 1887).
- **South wing**: Langshaw's "Building B", 128 ft long, 14 chambers (✔ 1887); outer east wall of flints 3 ft 3 in (✔ 1887). Two
  hypocausts at the west end (✔ Pl. XVII "HYP."). A **passage** crosses the range near its east end (gap in the survey). **Latrines**
  at the east end of the inner corridor (✔ 1894).
- **West additions** (1893, black): apsidal room in the line of the outer corridor, two rooms to its south, the return corridor;
  a **solid block** in the north wing is modelled as a low platform (Decision 6).
- **Granary** in a walled yard joined to the west wing (✎ Boon 1957; ✔ Pl. XVII, black): buttressed west wall, chambers at its south
  end; the east wall is dotted on the plate; the yard wall has two piers.
- **Outer court** east of the courtyard, "a garden, or open court-yard, as nothing was found there" (✔ 1887), bounded by an angled
  wall on the north-east (✔ r9, Pl. XVII).
- **Baths** (Block IX) in the SE corner of the outer court, 114 × 94 ft (✔ 1887), rooms numbered as Hilton Price: 1–2 hypocausts with
  apses, 3, **4 the reservoir** (walls 3 ft 4 in, brick-lined, 6 × 5 ft inside ✔ 1887; ✎ Boon "spring-fed"), **5 apodyterium**
  52 ft 2 in × 17 ft 8 in (✔ 1887), 6–14, 15 a corridor, **16 latrine** (✎ Fulford's plan; drain under its floor ✔ 1887). Duplicated
  suites, perhaps for both sexes (✔ C&F 2016 citing Boon 1974). Water from springs in rooms 3 and 4; drained through the town wall
  (✔ C&F 2016; ✔ 1894 drainage).
- **Corridor to the baths**: the south outer corridor continues east along the south wall to No. 5 ("an ambulatory, which appears to
  connect these baths with the buildings of Block VIII" ✔ 1887; "the external corridor of the southern wing communicated with the
  baths" ✔ 1894).

## Construction and finishes: materials and what they rest on

Wall thickness from the rings: 0.4–0.9 m; courtyard east wall 1.1 m; apse mass 1.3 m. **S**.

| Part | Shown | Evidence | Level |
|---|---|---|---|
| Walls of the main block | flint in rough courses (`facing: 'flint'`, the forum's style) | Block VIII's east wall "composed of flints", 3 ft 3 in; south corridor wall "three courses of flints on both sides" (✔ Hilton Price 1887); a house in the same insula of "flint rubble 2 feet thick with tile quoins" (✔ 1894) | **S** |
| Tile bonding courses in those walls | two tile courses every 0.6 m | **not recorded at the mansio**; carried over from the forum's style, which follows the late-3rd-century town wall (4–5 flint courses, then a double course) | **C** (shown green because wall colours follow the wall plan) |
| Quoins and openings | brick | baths: "the quoins and angles are generally of brick" (✔ 1887); house in Insula VIII: tile quoins (✔ 1894) | **S** |
| Baths walls | same flint style as the main block | **simplified.** The record is "four courses of flint and stone and two courses of bricks, then five courses of flint and stone and one course of bricks (or occasionally two), then three ... and two"; the stones "hammer-dressed and roughly squared ... grey grits, oolites, and now and then marble and even blocks of chalk"; flint predominating only in the west and north-west; many division walls of brick (✔ Hilton Price 1887). A mixed flint-and-stone style with irregular brick courses would need a materials-lab round (offered 2026-10-13, not done) | **S** (flint) / simplified |
| Roofs | tegulae and imbrices (R2/R3, the roof session's style) | none reported from the mansio (C&F 2016: "notable finds: none reported"); tiles found at the public baths | **C** |
| Corridor floors (24 rooms) | red tile | "loose red brick tesserae" in baths room 5 (✔ 1887); C&F 2016's "some red tesserae were found" is in a sentence about the baths; **nothing recorded for the wings' corridors** | **X** (S for room 5) |
| Heated rooms (10) | opus signinum over a hypocaust | hypocausts recorded in the west wing (Pl. XVII "HYP.", ✔ 1894) and the baths (pilae, flue tiles ✔ 1887) | **S** (heating) / X (surface) |
| Chambers and other rooms (48) | plain opus signinum | **nothing recorded.** Fox read floorless rooms in this insula as perished mortar floors: "No trace of mosaic or other floor was discovered here. Possibly it was of cement, which has perished" (✔ 1894, House 1). Set 2026-10-13 (decision 12); before that they fell back to the generator's gravel | **X** |
| Mosaics | none | "no substantive remains of mosaics" (✔ C&F 2016) | **S** |
| Rough flint paving | not shown | Joyce found "part of the building ... paved with very rough, and great heavy flints, such as might have been required for stables" (✔ 1887); where is not recorded | — |
| Granary floor | tile | **no reasoning or evidence**; Roman granaries often had raised timber floors on sleeper walls (✎, not checked); a candidate for change | **X** |
| Courts and yards | gravel | outer court "a garden, or open court-yard, as nothing was found there" (✔ 1887); the courtyard's surface is not recorded | **S** (outer court, as open ground) / X |
| Windows | glazed | glass at the public baths (Hope & Fox 1905, `baths.md`); none recorded here | **C** |
| Interior finish | plaster (pink in the vaults) | generator default from the baths; no plaster recorded at the mansio | **X** |

## Not known (to be conjectured and flagged)

Heights, roofs, windows, almost all doorways, the court-side treatment of the inner corridors, the extent of the upper floor, the
reservoir's superstructure, the gate's form. No standing mansio survives in Britain; the comparanda (Chelmsford, Caerwent, Wall,
Godmanchester) are known in plan only (◐).

## Decisions

1. **Scope** (2026-10-12, user): main block, baths + outer court, granary + west yard; **not** the oblique "dependency" SW of the
   building.
2. **Phase** (2026-10-12, user): as excavated, with the undated west-wing alterations.
3. **LOD budget** (2026-10-12, user): LOD0 cap **16k**, normal distance LOD.
4. **Anchor** (2026-10-12, user): `mansio`, 130.0 × 65.1 m at 3.9°, replacing the courtyard pin `mansio-courtyard`.
5. **Walls the rings lack** (2026-10-12, user): taken from the fitted 1893 plate (corridor to the baths, room 14 S, room 10 E;
   the granary's dotted north wall as conjecture).
6. **Solid block** in the north wing (2026-10-12, user): a low platform (0.45 m).
7. **Granary yard's north arm** (2026-10-12, user): kept as a yard wall.
8. **Wall plan** (2026-10-12, user): approved, with the inner corridors walled on the court side (the survey shows walls), one
   conjectural door per chamber onto its inner corridor.
9. **Outer court openings** (2026-10-13, user asked for a way in): a door from the courtyard, a gateway from the street, a doorway
   from the south outer corridor to the corridor to the baths; all conjectural.
10. **Walls must not show through roofs** (2026-10-13, user): walls split where the roofs beside them change height; walls under
   corridor roofs stop at the slope's low point; corridor ends closed. Check: `tmp/key-plans/mansio-scripts/roofcheck.py`.
11. **Elevations** (2026-10-13, user): approved with the reasoning above (two storeys in the west wing only; 5.8 m one-storey
   ranges); in the game.
12. **Materials** (2026-10-13, user): the materials table above written out; rooms with no recorded floor get plain opus signinum
   (X) instead of the generator's gravel default. The baths' mixed flint-and-stone walls stay simplified to flint for now.

## Wall plan

`assets/key-plans/mansio.plan.json`, written by `tmp/key-plans/mansio-scripts/mkplan.py` (gitignored scratch, Python): raster
extraction of the in-rings in the building frame (`rasterwalls.py`), collinear runs merged across breaks ≤ 1.25 m, ends run to the
perpendicular wall's centreline, then hand additions, rooms, doors, roofs and windows. Readings worth knowing: the lead pipe and
drain of the baths' latrine (d39, d170) are not walls; the court's west wall and the passage wall north of it are one ring line,
split so each takes its own height; a small projection from the court's west wall (d142) is shown low, purpose unknown. Plan
sheets: `tmp/key-plans/mansio-step6.png`; reading sheets over the plate `tmp/key-plans/mansio/read-*.png`.

## Elevations: evidence and rules

### What the Silchester evidence gives us (S)
| Element | Evidence | Source |
|---|---|---|
| Upper floor | "the stairway to an upper floor" in the west division | ✔ 1894 |
| Walls | flint; the baths flint and stone with 1–2 brick courses; brick quoins | ✔ 1887 |
| Hot rooms | hypocausts with pilae and box-flue tiles (No. 1: 27 pilae; No. 8 horizontal box-tile flues) | ✔ 1887 |
| Reservoir | massive walls, brick-lined: "a superstructure of great weight, or one requiring extra protection" | ✔ 1887 |
| Doorways | No. 5's four exits; No. 7's doorway 3 ft 5 in; No. 3's opening to No. 5 | ✔ 1887 |

### Comparisons (C)
The baths' and forum's rules: roofs at 22°, tile roofs (R2/R3), glazed windows (Hope & Fox 1905), hollow-voussoir vaults over hot
rooms (`baths.md` "Elevations"). The forum's ranges were given 9.5 m eaves for a public building; the mansio's thinner walls
(0.5–0.7 m) suit one storey of about 5–6 m, except where the stair is.

### Why two storeys in the west wing, and why these heights

Nothing at Silchester survives above the foundations, so every height is conjecture (**X**). Each figure below is derived from a
stated reason so that it can be checked and changed.

**Two storeys: the west wing only.**
- The one piece of evidence for an upper floor is Fox's list of what the west division held: "three chambers ... heated by
  hypocausts; **the stairway to an upper floor**; and, at the north-west corner, probably the kitchen" (✔ 1894, p. 223). He records
  no stair in the north or south wings.
- The same report reads a narrow compartment in House 1 of Insula VIII as a stair "to an upper story", because the house "was not
  made up of many rooms, and its possessor would require more accommodation than was furnished by the ground floor only" (✔ 1894,
  p. 213). So the excavators expected upper floors where a stair is found, not everywhere.
- The west wing is the wider range (✔ 1894: "the western one was somewhat wider") and holds the heated rooms and the kitchen: the
  part of the building best able to carry an upper floor and most in need of the extra rooms.
- The north and south wings have thin walls (0.4–0.6 m in the rings) and rows of small rooms between two corridors; nothing suggests
  an upper floor there, so they are shown one storey.
- **How much** of the west wing had an upper floor is not known. The whole range is shown two storeys (one roof line); the stair
  itself is not identified on the plan (the narrow passage north of the large heated hall, 1.8 × 10.8 m, is the likeliest place).

**One-storey wings: eaves 5.8 m.**
- Each chamber lies between two corridors, so it has no outside wall: its light must come from above the corridor roofs
  (a clerestory), as in the forum's ranges.
- Corridor roofs: a lean-to at 22° over a corridor 3.2–3.6 m wide rises about 1.3–1.45 m; with the corridor's outer (or court) wall at
  **3.2 m** (a 2.4 m doorway plus lintel and wall plate), the roof meets the range wall at **4.4 m**.
- Above that, a small window (0.8 m) with sill and lintel brings the range wall to **5.8 m**.
- Check against Vitruvius: the height of an oblong room is half the sum of its length and width (✔ *De architectura* VI.3.8, Morgan
  translation, <https://lexundria.com/vitr/6.3/mg>). The chambers are about 5.8 m deep and 4–7 m wide, giving **5.0–6.4 m**. **C**.
- Lower than the forum's ranges (9.5 m), which were a public building with walls up to 1.5 m thick.

**West wing: eaves 8.0 m.** Ground floor to the corridor roof line (4.4 m), floor zone, and an upper storey of about 3.6 m with its
windows above the corridor roofs (sill 5.6 m).

**Other parts.** Granary 6.0 m: a wider span (8.7 m) with buttressed walls, as tall as the chamber ranges. Baths 5.5 m (apodyterium
6.0 m): smaller rooms than the public baths (6.5–8 m there), vaults inside the heated rooms. Yard walls 2.4 m; outer-court walls
3.2 m; courtyard east wall 4.0 m (it is the thickest wall, 1.1 m). The entrance is **not** raised above the range: the plan gives its
width, nothing gives its height.

**Openings onto the outer court** (none recorded; added 2026-10-13 at the user's question): a door in the courtyard's east wall (the
way from the inn to the outer court and the baths), a gateway 3.2 m wide in the outer court's east wall to the street, and a doorway
where the south outer corridor meets the corridor to the baths ("the external corridor of the southern wing communicated with the
baths" ✔ 1894). Hilton Price describes only the boundary wall "running from the north end of the Baths, and turning with a rounded
corner away to the west" (✔ 1887); the one gap in the survey (1.7 m, beside the baths' furnace) is kept as it is.

### Rules for the model
| Part | Rule | Level |
|---|---|---|
| Ground | One level (the levelled platform) | X |
| North and south wings | chambers one storey, walls and eaves **5.8 m**, gable roofs at 22° | X |
| West wing | **two storeys** (the stair), eaves **8.0 m**, gable roofs; extent of the upper floor conjectural | S (stair) / X |
| Corridors | lean-to roofs from **4.4 m** on the range wall to **3.2 m** on the outer or court wall | X |
| Court walls | 3.2 m, windows 0.9 × 1.0 m every 4 m, one door per wing | X |
| Outer walls | 3.2 m, small windows 0.6 × 0.8 m every 4 m (south and north) | X |
| Chamber windows | one clerestory light 0.8 × 0.8 m per chamber above the corridor roof (sill 4.65 m); west wing upper floor 0.9 × 1.3 m, both sides | X |
| Entrance | the gate a 5.8 m gap under the corridor roof; the entrance hall at the range height (not raised: no evidence) | S (plan) / X |
| Apsidal room | half-dome under the range roof | S (plan) / X |
| Granary | eaves 6.0 m, gable; buttresses 4.6 m | S (plan) / X |
| Baths | rooms 5.5 m (apodyterium 6.0 m), gable roofs; barrel vaults over the heated rooms (1, 2, 8, 8 recess, 10, 11 west); corridor 15 and the latrine 3.6 m | S (hypocausts) / C / X |
| Reservoir | a low walled cistern 1.6 m | X |
| Yard walls | 2.4 m; outer-court walls 3.2 m; courtyard east wall 4.0 m | X |
| Outer court | door from the courtyard (2.4 m), gateway from the street (3.2 m), doorway from the south outer corridor | X |
| Wall tops | a wall beside a gabled range rises to its eaves; a wall under corridor roofs only stops at the slope's low point, the lean-to's closed ends filling the triangle; walls split where the roofs beside them change height | — |

### Elevation sources
As `baths.md` and `forum-basilica.md`.

## Generated model and drawings

Drawings: `npm run dev`, then <http://localhost:5173/tools/elevations.html?id=mansio> (north front, section through the wings,
cross-section through the west range, south front, east side, 3D, plan). Review pictures: `tmp/key-plans/mansio-step9-drawings.png`,
`tmp/key-plans/mansio-3d-before-after.png`.

In the game (2026-10-13): placed from the plan by `WorldBuilder` (`KEY_PLANS`); the old kit `kit/mansio.ts` is deleted; the townPlan
entry `mansio` takes the anchor's size and rotation. Smoke: **LOD0 11,520 / LOD1 4,958 / LOD2 1,498** with footings, 468 wall
colliders, cap 16k; whole town **34 draws (unchanged), 206,077 tris** (196,286 before). Walls reuse the forum's flint style
(`facing: 'flint'`), so no new material and no new shader cost. Dev spawns: `?at=1.7,281.8,180` (outside the north gate, facing
in); `?at=15.8,322,0` (in the courtyard, facing the north wing).

Not modelled: the upper floor's interior and the stair; the hypocaust pilae (floors only); the reservoir's superstructure; the
apses of baths rooms 1 and 2; the later latrine on the south side; Fulford's "latrine?" outside the baths; the oblique dependency.
