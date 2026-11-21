# Project Zomboid Map

An Overwolf survival atlas for Project Zomboid Build 42. The app imports the
Knox Country tile pyramid and searchable building metadata from a local game
installation, then uses the same data in its desktop and in-game overlay
windows.

## Current features

- Full Knox Country map with five detail levels.
- Searchable towns, facilities and game coordinates.
- Category layers for medical, police, fuel, supplies and other useful sites.
- Build-specific likely-loot summaries generated from the local game data.
- Toggleable foraging-zone overlay with live biome and base-density readout.
- Named vehicle-spawn overlays with real vehicle pools, weights and zone traits.
- Saved locations, personal markers and survival notes.
- Marker colors, icons, groups, backups and distance measurement.
- Keyboard-navigable search results and persisted map preferences.
- Shared desktop and expanded-overlay state.
- Optional local-player position through a minimal Lua bridge.
- Overlay opacity, scale and click-through controls.
- Settings page for map display, game launch behaviour and hotkey rebinding.
- Overwolf-compliant desktop and overlay ad placements.
- Multi-monitor window management, tray controls and hotkeys.

## Import local Build 42 map data

The default importer expects the game at the sibling directory
`../project-zomboid`.

```bash
npm install
npm run import:game-map
```

After the first full import, metadata-only features can be refreshed without
reprocessing every tile:

```bash
npm run import:game-map:metadata
```

For another installation directory:

```powershell
$env:PZ_GAME_DIR = "D:\Games\Project Zomboid"
npm run import:game-map
```

Imported assets are written to `public/map-data/knox-country/` and ignored by
source control. They must not be redistributed without the required rights.
The importer also reads the game's ground-level foraging rectangles, vehicle
spawn areas, current zone-density definitions and vehicle distributions.

## Render the full isometric map

Use a large external volume for the resumable renderer. In-place publishing
keeps the generated DZI tree as the CDN source and avoids a second full-size
local copy.

```powershell
$env:PZ_ISOMETRIC_OUTPUT_DIR = "D:\PZ-isometric"
$env:PZ_RENDER_WORKERS = "4"
npm run render:isometric:global:plan
npm run render:isometric:global
```

The finished CDN root is
`D:\PZ-isometric\html\map_data\base`. It contains `catalog.json`,
`manifest.json` and every floor's DZI pyramid. Running the same command again
resumes interrupted work and reuses the renderer cache. Set
`VITE_ISOMETRIC_ASSET_BASE_URL` to the deployed URL of that directory.

For the compact self-hosted world used by this project, render all 4,065 map
cells at Ground level and omit the two largest image-pyramid levels:

```powershell
node scripts/render-isometric-world.mjs --all --workers=12 --layers=0,1 --omit-levels=2
```

The world renderer publishes each 2x2-cell pack independently, updates
`.runtime-data/map-data/knox-country/isometric-optimized/catalog.json` after every
pack, and skips matching completed packs when the command is run again. The
current background run writes progress to
`.render-cache/isometric-world-render.log` and errors to
`.render-cache/isometric-world-render.error.log`.

## Mirror the hosted isometric map

Rendering the full world locally takes days. When only Ground-level coverage is
needed, mirroring the hosted pyramid is the faster path:

```powershell
npm run mirror:isometric:plan
node scripts/fetch-isometric-tiles.mjs --out=C:\PZ-tiles\global --concurrency=32
```

Ground level to zoom 20 is roughly 83,800 tiles and 18 GB, a little over 20
minutes at concurrency 32. The transfer is latency-bound rather than
bandwidth-bound, so throughput scales close to linearly with `--concurrency`:
about 7 tiles/s at 8, and a sustained 60-64 tiles/s at 32. The default output is
the `global` pack slot under
`.runtime-data/`; keep it off a synced folder, and use `--out` for a different
volume or for a tree that will be uploaded to a CDN.

Empty regions are pruned instead of probed. A DZI parent tile covers exactly its
four children, so a missing parent guarantees four missing children — that skips
roughly 105,000 of the 188,000 requests a blind level-20 sweep would make. The
run is resumable: `.mirror-state.json` plus the tiles already on disk let the
same command continue after Ctrl+C, and `--max-level` or `--floor` change the
scope. `--force` restarts from scratch.

The generated `manifest.json` sets `tileSourceKind: "direct"` and lists only the
mirrored levels, which is what caps OpenSeadragon at the mirrored depth. The
`.dzi` descriptor still advertises the source's full pyramid, so a viewer that
reads it instead would request levels the mirror does not hold.

Generated isometric tiles stay outside `public/` so Vite never copies the full
runtime dataset during a code build. `npm run build` and `npm run watch` create
development links under `dist/map-data/knox-country/` while keeping the existing
browser asset URLs unchanged.

The app uses the Build 42.20.2 community DZI source by default and falls back
to the locally generated preview if the remote source fails. Override the
remote source with `VITE_ISOMETRIC_EXTERNAL_BASE_URL`, or set
`VITE_ISOMETRIC_EXTERNAL_ENABLED=false` to test the local fallback only.

## Optional live position

Install the packaged client mod:

```bash
npm run install:bridge
```

Enable **Project Zomboid Map Bridge** in the game's Mods menu, then
start or reload a save. The app automatically returns to manual reference mode
when live coordinates stop updating.

## Live Overwolf development

```bash
npm run watch
```

In Overwolf, open **Settings → About → Development Options**, choose
**Load unpacked extension**, then select the project's `dist` directory.
The manifest enables automatic refresh after successful rebuilds.

## Browser preview

```bash
npm run dev
```

- Main: `http://localhost:5173/`
- In-game minimap: `http://localhost:5173/?window=overlay_map`

Project Zomboid uses Overwolf game ID `10598`. The app does not declare a GEP
feed because Project Zomboid does not expose one through Overwolf.

## Release package

```bash
npm run build:opk
```

Privacy, rights, support and release documentation is available in `docs/`.
Generated game imagery remains a release blocker until its distribution rights
are resolved.
