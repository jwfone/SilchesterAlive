# Silchester — Calleva Atrebatum 3D

A walkable 3D reconstruction of the Roman town of Calleva Atrebatum (Silchester, Hampshire). You can walk the streets, explore key buildings, collect 3D scans of finds, and talk to ghosts of the town's inhabitants from different eras.

This was a quick project made with AI coding models, using freely available archaeological data. The model is mostly an interpretation, not a scholarly reconstruction.

## Run locally

Requires Node 22 and npm 10+.

```bash
npm install
npm run dev
```

On Windows you can also double-click `run.bat`.

Controls: arrow keys move, `W` `A` `S` `D` look, `Shift` run, `Space` jump, `M` map. A touch D-pad mode is available in the HUD.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run check` | Type-check only |
| `npm run smoke` | Run the smoke tests |
| `npm run import:gis` / `import:plan` | Regenerate town data from GIS files you download yourself into `GIS data/` (see below) |
| `npm run import:collectibles` | Regenerate collectibles from `assets/collectibles.csv` |
| `npm run bank:validate` | Validate the pre-written dialogue bank |

## Ghost dialogue

Ghost conversations are served from a pre-written dialogue bank in `public/dialogue-bank/` (drafts and review notes in `dialogue-bank/`). No API key is needed to play.

The bank is generated with Gemini. To regenerate it, or to run the optional live-dialogue Netlify function (`netlify/functions/dialogue.ts`), copy `.env.example` to `.env` and set `GEMINI_API_KEY`. Never commit `.env`; it is gitignored.

## Deployment

Deployed on Netlify; see `netlify.toml`. Production environment variables are set in the Netlify dashboard, not in the repo.

## Project layout

- `src/domain/` — town plan, personas, dialogue logic (no rendering)
- `src/application/` — game loop and controllers
- `src/presentation/` — three.js scene building and controls
- `scripts/` — data import and dialogue-bank tooling

## Data sources and attribution

Roads, town wall, water features, buildings, earthworks and terrain are largely derived from the GIS files of the Silchester Mapping Project 2005–10. Please cite as:

> Silchester Mapping Project 2005–10, John Creighton with Robert Fry (2016), University of Reading.

The generated town plan (`src/domain/townPlan.generated.ts`) is committed, so you don't need the source GIS files to run or build the game. The raw GIS zips are not included in this repository. To regenerate the plan, download the layers from the Archaeology Data Service (check their licence terms), put the zips in a `GIS data/` folder, and run `npm run import:gis`.

- [Silchester GIS downloads (Archaeology Data Service)](https://archaeologydataservice.ac.uk/archives/view/silchester_ba_2016/downloads.cfm)
- [English Heritage: history of Calleva](https://www.english-heritage.org.uk/visit/places/silchester-roman-city-walls-and-amphitheatre/history/)

3D scans in the collection link to their original hosts (Reading University / Reading Museum via Sketchfab) and remain the property of their respective owners.

## Licence

The code in this repository is released under the [MIT Licence](LICENSE). The MIT licence covers the code only. The GIS data, archaeological plans and linked 3D models belong to their original creators and are subject to their own licences and terms.
