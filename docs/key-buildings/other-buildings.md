# The other key buildings: what we know

Compiled 2026-10-10 for the sessions that follow the baths pilot. Procedure: [`playbook.md`](playbook.md).

**How much is verified.** Beyond the baths, research is thin: a from-memory outline at the start of the pilot,
the pinned anchors and ring data on disk, one passage in the 2018 baths report, and a first round of web searches
on 2026-10-10. Nothing here has been read at source except where marked. Every claim carries a tag:

- ✔ read in a primary document or in the project data during the pilot
- ◐ from a web-search summary (a link is given, the document itself has **not** been read)
- ✎ recollection, unchecked

Treat ◐ and ✎ as leads. Re-verify before they go into a brief, and correct this file when you do.

## Overview

| Building | In game today | Pinned anchor | Evidence outlook | Main generator work |
|---|---|---|---|---|
| **Forum-basilica** | **Done 2026-10-11**: plan-built (`forum-basilica.plan.json`), flint walls | Full outline, 97 × 82 m | Best: 1977–86 excavation monograph, Victorian plan, 47 Great Plan rings | Basilica nave, aisles, clerestory, big roof; courtyard ranges |
| **Temples** (Insula XXX) | Solid boxes + classical column rows | Centres only, sizes are placeholders | Good: 2017 Reading excavation, GPR, Victorian plan | Cella with ambulatory (two-tier roof), temenos wall |
| **Church** | Solid box | On the **medieval** St Mary's (probably), no Roman walls | Contested identity and date | Small apsidal hall (if built) |
| **Mansio** | Hand kit `kit/mansio.ts`, an invented courtyard inn | Courtyard only, 46 × 34 m | **Thin**: 4 rings; identification seen only in a secondary source | Courtyard ranges; maybe timber walls |
| **Amphitheatre** | Dedicated LOD kit `kit/amphitheatre.ts` | GIS ellipse | Excellent excavation record (1979–85) | Elliptical bowl, not a wall plan |

**Suggested order** (my judgement, for the user to change): forum-basilica (largest and best evidenced; most
visible), temples (small, report online, tests the two-tier roof), amphitheatre, mansio (research first; may end up
mostly conjecture), church (blocked on a decision). Any building can go in any order; they are independent.

## Pinned anchors (game coordinates, from `GENERATED_KEYS`)

| Id | Centre x, z | w × d (m) | rotY | Pinned from |
|---|---|---|---|---|
| forum-basilica | −89.2, 45.0 | 97.3 × 81.6 | 0.012 | lat/lon NW 51.357496, −1.083949, SE 51.356762, −1.082551 |
| mansio-courtyard | 15.4, 316.3 | 45.8 × 34.1 | 0.015 | NW 51.354831, −1.082125, SE 51.354525, −1.081468 |
| temple-1 | 289.7, 52.5 | 18 × 18 (placeholder) | 0 | centre 51.357019, −1.07781 |
| temple-2 | 288.8, 84.9 | 14 × 14 (placeholder) | 0 | centre 51.356728, −1.077829 |
| church-st-mary | 319.9, 84.9 | 20.1 × 10.1 (placeholder) | 0.103 | centre 51.356724, −1.077382 |

The game's origin is the forum point E 464020, N 162450; +x east, +z south. For comparison the baths pin as first
supplied covered about 40% of the building, so check each of these (playbook step 2). ✔ ring overlap, measured
2026-10-10 (rings overlapping each anchor, areas 0.2–1500 m², not chained):

| Anchor | Rings | By shade 1 / 2 / 3 | Reading |
|---|---|---|---|
| forum-basilica | 47 | 16 / 12 / 19 | ~~Rings span 73 m … ~20 m short of the east edge~~: **wrong**, that count left out rings over 1500 m². ✔ (forum session) The main ring r1657 (1878 m², 23 holes) spans E 463881.3–463980.5, the anchor's full width. Min-area rectangle of the outline: 95.6 × 85.9 m turned 2.5° (the pin is 97.3 × 81.6 m at 0.7°), so the outline pokes ~3 m past the pin at the NE and SW corners. |
| mansio-courtyard | 4 | 2 / 2 / 0 | Little surveyed; the rings that touch it belong to larger buildings (union 117 × 66 m). |
| temple-1 | 10 | 5 / 5 / 0 | Long north–south runs (union 104 m long): the temenos wall. |
| temple-2 | 5 | 3 / 2 / 0 | Same. |
| church-st-mary | 0 | | No Great Plan walls: the pin is on a building that is not in the Antiquaries' plan. |

---

## Forum-basilica

**Status (2026-10-11): done, plan-built and in the game.** Brief `forum-basilica.md`, plan `assets/key-plans/forum-basilica.plan.json` (flint facing), notes `forum-basilica.about.md`. The old kit `kit/forum.ts` is deleted. The section below is the pre-session record, kept for its corrections.

**In game (before).** `plan.buildings` entries `forum` and `basilica` (hand placeholders) plus the kit
`src/presentation/kit/forum.ts` ✔ (read in the pilot): a basilica hall 72 × 18 m (north wall solid, south wall with
three doors, east wall solid, west wall split for an apse of radius 7), 2 × 8 nave columns 8 m apart, one gable roof;
a forum courtyard slab 56 × 38 m with column porticos on three sides and lean-to strips, open to the south. Authored
north–south, then yawed 90° about (8, −8) so the basilica is west and the forum east, and **translated** onto the pin
(never fitted). It uses the old collapsing textures. Columns draw from a shared `InstancedMesh` (`forumColSpots`).

**Evidence.**
- ✔ 47 Great Plan rings (shade mix 16 / 12 / 19) within the anchor; see table above.
- ◐ Fulford & Timby (2000), *Late Iron Age and Roman Silchester: Excavations on the Site of the Forum-Basilica
  1977, 1980–86*, Britannia Monograph 15. Contents summary: periods 1–3 pre-Roman; **4** pre-Flavian
  courtyard building; **5** Flavian timber basilica; **6** masonry forum-basilica; then late Roman occupation of the
  basilica, robbing, Victorian excavations, ploughsoil. (<https://www.stellabooks.com/index.php/books/michael-fulford/late-iron-age-and-roman-silchester-excavations-on-the-site-of-the-forum-basilica-1977-1980-86>;
  interim report in *Antiquaries Journal*: <https://resolve.cambridge.org/core/journals/antiquaries-journal/article/abs/excavations-on-the-sites-of-the-amphitheatre-and-forumbasilica-at-silchester-hampshire-an-interim-report/A3710B0ACD88B2B617FA6699B05C2B50>).
- ◐ The Society of Antiquaries excavated the forum-basilica in 1893 (<https://www.cambridge.org/core/journals/antiquaries-journal/article/victorian-excavation-methodology-the-society-of-antiquaries-at-silchester-in-1893/371CB04847168E2EAE317D423467052E>).
  ~~The report is probably *Archaeologia* 54 (1894)~~ ✔ corrected: Joyce opened the whole forum-basilica from 1866
  (Joyce 1881b); the Antiquaries re-planned it in 1892 and published it as **Fox & St John Hope 1893a, "Excavations on
  the site of the Roman city at Silchester, Hants, in 1892", *Archaeologia* 53, 539–73** (forum pp. 540–59, pl. XXXIX)
  (C&F 2016, pp. 104–8 and bibliography). Filled in 1908.
- ✔ **Verified in Creighton & Fry 2016, pp. 104–8** (forum session, 2026-10-10): Period 5 Flavian timber basilica
  (built c. AD 80–90); **Period 6 masonry forum-basilica, Hadrianic with revisions to the early Antonine period (c. AD 150)**;
  columns **about 9 m high with Corinthian capitals**; **raised apses at either end** of the hall; an apsidal room in the
  middle of the west range ("curia", perhaps a shrine: too small for an ordo of 100); the forum **approximately square with
  internal and external porticoes**; the **east entrance had a major arch**, about 1.5 m south of the centre line to meet
  the street. Period 7: late Roman occupation of the basilica, pits with **metalworking** traces, perhaps into the
  5th century. Fulford & Timby read the lack of later 2nd–3rd-c. features as a solid floor (Purbeck marble?) robbed later.
  Forum square: 0.6 m of gravel on a mortar base, a drain 0.38–0.44 m wide and 1.04 m deep out through the east entrance.
  Fig. 5.31 (Fulford's Period 6 plan) shows **one** colonnade foundation in the hall, about 4 m inside the east wall.
- ✔ **Fulford 2002**, *A Guide to Silchester* (passage supplied by the user): about 0.8 ha; porticos, shops and offices on
  three sides of the square; an elaborate main entrance with an inscription in letters 28 cm high; hall **about 82 × 17.5 m**
  on **one row of Corinthian columns about 8.6 m high**; raised end rooms, **originally apsidal**; west suite of offices round
  an apsidal marble-lined council chamber or shrine; built towards the middle of the 2nd century over a late-1st-century timber
  forum-basilica of similar size and plan; **no traces of flooring, so perhaps never finished**; **iron-smithing (and some
  bronze-working) in the basilica from the mid-3rd century to the end of the Roman period**.
- ◐ **Existing reconstruction art** the user may not know: Historic England's archive holds Ivan Lapper paintings of
  Silchester (volume IC090), including the forum "as it may have appeared in the third or fourth century AD" and an aerial
  view (<https://historicengland.org.uk/images-books/photos/volume/IC090>). Reference for what specialists imagined;
  it is copyright artwork, so look and cite, do not reproduce.
- ✔ (was ✎) A masonry forum with ranges of rooms on three sides of the courtyard, the main entrance on the east and the
  basilica on the west, with apses at both ends (not one): C&F 2016, Fulford 2002, and the Great Plan rings.
  ✔ (was ✎) Industrial reuse of the basilica from the mid-3rd century (Fulford 2002; C&F 2016 Period 7).
- ✔ Dates of the masonry forum-basilica: Hadrianic to early Antonine, c. AD 150 (C&F 2016); "towards the middle of
  the 2nd century" (Fulford 2002).

**Open questions.** What state to show in c. 270–280 (masonry forum-basilica with which late alterations; is the
basilica still a civic hall)? Whether the east side of the anchor (≈20 m without rings) is an open street/portico.

**Likely generator work** (assessment, to confirm). Nave and aisle colonnades or arcades with a clerestory, aisle
lean-to roofs under a high central roof, steps/podium, courtyard porticos and surrounding rooms with doorways,
apse/tribunal (apses exist). At ~97 × 82 m it is several times the baths: LOD 0 will exceed the smoke test's 12k
triangle cap (raise it deliberately) and building LOD 0 only on approach, as `inspector-plan.md` anticipated,
becomes worth doing.

**Code touchpoints.** `kit/forum.ts` (delete), `WorldBuilder` forum block, `forumColSpots` and the shared column
mesh, the slab-top ground code, `addPlatform(forum.meshes)`; `townPlan`: `forumComplexCentre`, `FORUM_COMPLEX_DESIGN`,
`anchorReserve('forum-basilica', …)`, the forum/basilica snap (translates only: have it take `w`, `d`, `rotY`),
`keyFootprints`; `reachesPlanBuilt` finds buildings **by plan id**: there is no `buildings` entry called
`forum-basilica` (entries are `forum` and `basilica`), so extend the lookup or add one.

---

## Temples (Insula XXX, beside the churchyard)

**In game.** `temple-1` and `temple-2` as solid boxes (18 × 18 × 10 m and 14 × 14 × 8 m, `rotY` 0.2 placeholders,
'plaster' cell) with a row of classical columns on the front face ✔ (read in the pilot). Sizes and rotation are placeholders;
only the centres are pinned, 32 m apart on one north–south line (consistent with a row inside one precinct). They
share one platform.

**Evidence.**
- ✔ 2018 baths report (Fulford et al.), "Temple Area": a GPR survey (62 × 40 m) west of the graveyard found "the course of
  the temenos wall surrounding **three** Romano-Celtic Temples now known to exist here"; "the two southern temples
  appear prominently within the data, indicating they are relatively well preserved"; the temenos wall runs
  north–south and "curves 90 degrees at its southern extent", and "fits almost exactly to the Antiquaries plan,
  validating it". (Report PDF linked in `baths.md`.)
- ✔ Great Plan rings: 10 overlap temple-1, 5 overlap temple-2, forming long north–south runs (the temenos wall).
- ◐ Insula XXX, at the eastern edge of the town, next to the present churchyard. Two temples found by the Victorians
  (1890); the third was located 1902 and excavated by Reading in **2017**, which found the typical Romano-Celtic
  **"double-square" plan** (central cella inside an ambulatory); GPR showed it similar in size to the southernmost.
  Some sources call the group the earliest masonry in Silchester; Reading's press release links the third temple with Nero.
  Leads: the 2017 Reading report <https://research.reading.ac.uk/silchester/wp-content/uploads/sites/33/PDFs/2017-Silchester-Temple-report-small.pdf>,
  the release <https://reading.ac.uk/news-and-events/releases/PR749147.aspx>, Historic England's GPR report
  <https://historicengland.org.uk/research/results/reports/9-2001>.
- ◐ A **different** Romano-Celtic temple stood in Insula XXXV (found 1907, axis about 13° off the street): not part of
  this group.

**Open questions.** Which of our two pins is which excavated temple, and where is the third (it is not pinned)?
Corners and rotation of each. Is the temenos wall and its entrance
part of this building's plan? Which materials (the 2017 report will say)?

**Likely generator work.** A cella tower with a higher roof over a lower ambulatory (a two-tier roof; the generator
has gable, lean-to and a hipped peristyle ring, no free-standing hip or pyramid), clerestory windows, an entrance
or porch (✎ Romano-Celtic temples usually face east; check), a temenos wall with a gateway. The classical
column row in the current game is wrong for this building type.

**Code touchpoints.** `WorldBuilder`: `publicBs` (temples and church), the solid-box loop, the temple column rows
(`t1`/`t2` in the column `InstancedMesh`), `boxes.key.push` for temple/church in `physicsForPlanByLayer`, the shared
platform; `townPlan`: `templeReserve`, the centre-only snap, `keyFootprints`. Plan ids will be `temple-1`, … and
match `buildings` entries.

---

## The church (and the Roman "church")

**In game.** `church-st-mary`: a solid box 20.1 × 10.1 × 8 m, `rotY` 0.103 (placeholder). ✔ No Great Plan walls overlap the pin.
By its name and position (31 m east of temple-2, at the churchyard) it is almost certainly the **present parish
church of St Mary the Virgin**, which is medieval and not a Roman building ◐ (confirm on a map).

**The Roman church** is a different building:
- ◐ In **Insula XXXV**, south-east quarter, axis about 13° off the east–west street; re-excavated by Sir Ian Richmond in
  1961 (*Archaeologia*, 1976: <https://www.cambridge.org/core/journals/archaeologia/article/vthe-silchester-church-the-excavation-by-sir-ian-richmond-in-1961/A88965A17B574CB6AF0683AF34B5DD21>).
- ◐ Built late 3rd or early 4th century, abandoned about the second third of the 4th (A. King, 1983); its identity is
  contested ("The Roman church at Silchester reconsidered": <https://research.winchester.ac.uk/en/publications/the-roman-church-at-silchester-reconsidered/>;
  Frere & Fulford, "The collegium peregrinorum at Silchester", *Britannia* 2002: <https://resolve.cambridge.org/core/journals/britannia/article/collegium-peregrinorum-at-silchester/9122B58B66448A0EC4433A0A1357E313>).
- The search summaries mix up a 1907 find in Insula XXXV (church? temple? inscription?). Do not rely on them.
- Dimensions: not found. A figure of 36.5 × 28 ft appeared in a snippet without clear meaning; do not use it.

**Decisions the user must make first (blocking).**
1. Should the pinned `church-st-mary` stay (a medieval landmark, outside the late-3rd-century model, so probably remove
   it from the reconstructed layer) or be replaced by the Roman church (needs a new pin in Insula XXXV)?
   *The user has not answered this since the first plan on 2026-10-08.*
2. The Roman church is probably **later than the c. 270–280 snapshot**: omit, show anyway with a note, or treat as
   a "just after" building?

**Likely generator work** if built: a small apsidal hall (apses exist). Small.

**Code touchpoints.** Same as the temples, plus `reachesPlanBuilt` and the `church-st-mary` entry.

---

## Mansio

**In game.** `kit/mansio.ts` ✔ (read in the pilot): an invented coaching inn. A north range of four rooms, east and west
wings of 8 × 18 m (the east with a stable and mangers), a gravel courtyard 36 × 18 m, timber porticos, south gate
posts, a wellhead; designed around (40, 245) then **translated** onto the pin. **No source for this layout has been
found.** The pin `mansio-courtyard` marks the **courtyard** only (46 × 34 m); `townPlan` re-centres the whole inn
on it.

**Position.** ✔ The GIS south gate is at (−116, 396). The pin (15, 316) is about 130 m east and 80 m north of it, well
inside the town, so "near the south gate" is loose.

**Evidence.**
- ✔ Only 4 Great Plan rings overlap the pin (2 shade 1, 2 shade 2): the survey shows little here.
- ◐ One heritage-tourism summary (secondary, not scholarly) says there was "a large mansio in Insula VIII near the south
  gate" with three wings around a central courtyard (<https://www.ancient-history-sites.com/?p=7574>). **I could not find
  a primary source for a mansio at Silchester.** Candidates to check: Boon, *Roman Silchester* (1957/1974);
  Creighton & Fry 2016; the Antiquaries' reports of the 1890s on Insula VIII.

**First task in that session: establish what is actually known.** If the evidence is a plan plus an interpretive
label, the model will be mostly conjecture (red in the viewer) and the notes must say so, or the user may choose a
lighter treatment. Determine which insula the pin lies in from the 1908 Antiquaries plan (the 2018 baths report's
fig. 1 shows insula numbers).

**Likely generator work.** Courtyard ranges with rooms and doorways, timber porticos (posts and beams exist),
possibly timber-framed or daub walls (a new wall material and a lab round) depending on evidence.

**Code touchpoints.** `kit/mansio.ts`, `mansioDx/Dz`, `addPlatform(mansio.mesh)`, the mansio block in `WorldBuilder`;
`townPlan`: `anchorReserve('mansio-courtyard', …)`, snap, `keyFootprints`; plan id `mansio` vs anchor id
`mansio-courtyard` (the lookup in `reachesPlanBuilt` uses the plan id).

---

## Amphitheatre

**In game.** The only key building with its own LOD ✔ (read in the pilot): `kit/amphitheatre.ts` builds a stepped cavea
(28 segments / 9 steps near, 12 / 4 far, switch at 260 m), a 2.2 m podium wall with entrance gaps, arena, outer wall
and entrances, plus an `EllipseBand` collider for the seating. Geometry from the GIS fit: centre (452, −157), radii
23 × 34 m, height 9 m (check whether the radii are the arena or the outer bank). It lies outside the town wall, north-east
of the east gate (✔ GIS; `townPlan.ts` header says "outside E wall").

**Evidence.**
- ◐ Excavated by Fulford 1979–85; Britannia Monograph 10 (1989).
- ◐ Phases (from a gazetteer and an interim report): built **c. AD 55–75** (capacity about 3,600–3,700) with **timber** seating,
  arena wall and entrance passages; a second timber phase in the 2nd century; the **arena wall and entrance passages
  rebuilt in stone in the early to mid 3rd century**. Stone-phase plan: two opposed entrances on the long axis and two
  apsidal recesses on the short axis; earthen seating banks well preserved. So c. 270–280 should be the **stone-phase
  arena with earth banks and timber seating**.
- Leads: English Heritage description <https://www.english-heritage.org.uk/visit/places/silchester-roman-city-walls-and-amphitheatre/history/description>;
  gazetteer <https://gatehouse-gazetteer.info/English%20sites/1292.html>; the *Antiquaries Journal* interim report
  (link under the forum). Arena dimensions were not in any summary.

**Open questions.** Generator or kit: this is an elliptical bowl, not a wall plan. Either add an elliptical element
(arena wall, bank, seating rows, entrance passages, recesses) to `planBuilding`, or keep the dedicated kit and add
what the playbook gives every building (evidence levels, notes, viewer drawings, tooltips). Decide at the start.

**Code touchpoints.** `kit/amphitheatre.ts`, `WorldBuilder` amphitheatre block and platform, `bands` (the
collider), `plan.amphitheatre`.

---

## Cross-cutting leads

- **Creighton & Fry (2016)**, *Silchester: Changing Visions of a Roman Town*, is available as a free PDF
  (<https://reading-clone.eprints-hosting.org/62521/1/Creighton%20with%20Fry%20-%20Silchester%20Changing%20Visions%20of%20a%20Roman%20Town%202016.pdf>,
  record <https://centaur.reading.ac.uk/62521/>) ◐. Likely the best single source for a building-by-building summary
  (forum, temples, church, mansio). ✔ Read (forum session): the PDF downloads from
  <https://centaur.reading.ac.uk/62521/1/Creighton%20with%20Fry%20-%20Silchester%20Changing%20Visions%20of%20a%20Roman%20Town%202016.pdf>
  (the reading-clone host failed). On the **Great Plan shades**: the published plans' greys come from colour washes with
  "no great consistency"; sometimes phase, sometimes robbed vs unrobbed walls; "no consistent interpretation can be
  drawn" (C&F 2016, pp. 38, 49). So read phase from the text and modern plans, never from the shade.
- ADS archive and its intro PDF: <https://archaeologydataservice.ac.uk/archives/view/silchester_ba_2016/downloads.cfm>.
- The Reading Silchester project pages: <https://research.reading.ac.uk/silchester/>.
- Insula numbers and the Antiquaries' 1908 town plan: figure 1 of the 2018 baths report.
- Comparanda already collected for the baths (Wroxeter, Leicester, Ravenglass, Great Chesters, Vitruvius, hollow
  voussoirs): `baths.md` "Elevations".

## Corrections to the pilot's opening analysis

The opening plan (2026-10-08) said some things from memory. Updated:

- "The church pin is on the medieval parish church, not the small 4th-century church next to the forum": the first half
  stands; the second is **wrong**: the Roman church is in Insula XXXV in the south-east quarter, not by the forum.
- The temples are Romano-Celtic with a cella and ambulatory: **supported** (◐ double-square plan); and there are **three**
  temples in the precinct, not two.
- "Mansio near the south gate": the pin is ~150 m from the GIS south gate; and no primary source for the mansio has been found yet.
- Forum description (ranges of rooms on three sides, east entrance): still ✎.
