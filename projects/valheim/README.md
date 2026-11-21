# Valheim Map

An Overwolf map companion backed by data extracted from the installed Valheim build.

## Current capabilities

- Targets Valheim game ID `21668`.
- Reads both SoftRef manifests and records source hashes.
- Extracts world-placement rules, active location prefabs, prefab hierarchies, all 99,763 location MonoBehaviour records, characters, bosses, items, recipes, status effects, build pieces, traders, events, vegetation, and all 36 localization columns.
- Resolves recipe ingredients, trader inventories, creature spawners, boss altars, linked prefabs, and item Sprite references.
- Exports 1,299 original game icons to web-ready PNG files.
- Generates biome terrain, waterways, and location coordinates from any entered seed in a worker.
- Estimates 33 outdoor resource materials from 52 extracted vegetation rules, including berries, mushrooms, seeds and ore deposits. Generated regions in a readable local save always use saved resource state, including collected or destroyed nodes; seed estimates only fill regions absent from that save. Server worlds without a readable save use estimates.
- Provides a searchable world map with 11,369 generated markers for the bundled `Valheim` seed cache.
- Lazy-loads a separate full-detail record for the selected marker, including every placement field, component payload, hierarchy object-name count, asset reference, and linked-prefab candidate.
- Extracts smelter, kiln, cooking-station, fermenter, and spinning-wheel conversions so ores, bars, coal, thread, and Eitr resolve to a real production chain.
- Ships a Crafting Planner that expands recipes recursively, applies Valheim's per-quality upgrade costs, merges shared ingredients, allocates owned materials by target priority, and explains where every missing material comes from.
- Reads the character inventory through the tracking mod under a separate, revocable permission, and stays fully usable with manual amounts when the mod is absent, outdated, or switched off.
- Keeps every dialog and detail panel outside the reserved 440 px Overwolf ad rail.

The pipeline does not require Valheim to be running and does not read world saves. Static records come from the installed SoftRef bundles and managed assemblies. The seed generator ports the current `WorldGenerator` and `ZoneSystem` flow, including Unity RNG, Perlin/FastNoise terrain, lakes, rivers, streams, placement ordering, terrain checks, vegetation checks, and occupied-zone rules.

## Setup and extraction

```bash
npm install
npm run setup:data-tools
npm run setup:decompiler
npm run extract:game-code
npm run extract:all-static-data
npm run generate:seed -- Valheim public/game-data/seeds/Valheim.json
```

Set `VALHEIM_INSTALL_DIR` when Valheim is installed outside the default Steam directory.

Resource extraction resolves vegetation references to GameObject prefab names with
`tools/extract-vegetation-prefabs.py`. `build:map-data` builds the shipped
`seed-resource-rules.json`; after refreshing only the prefab mapping, it can also
be rebuilt with `node scripts/build-seed-resource-rules.mjs`. Predictions run in
a worker, cache up to three seed/profile results, and transfer packed coordinates.
They approximate unmodified terrain and do not simulate Unity colliders, location
clear areas, player changes or dungeon contents. Their accuracy has not been
measured against live resource placements; the filter marks their counts with ≈.

## Validation and packaging

```bash
npm run validate:game-data
npm run validate:world-generator
npm run test:planner
npm run lint
npm run validate
npm run build
npm run build:opk
```

Before a release, update every tracked app version together with
`npm run bump-version -- patch` (or `minor`, `major`, or an explicit `x.y.z`).
Add `--dry-run` to preview the next version without changing files.

## Uninstall survey

Run `scripts/create-uninstall-survey.gs` in Google Apps Script to create the
Valheim Map feedback form. Verify the published respondent URL works while signed
out, then paste it into `SURVEY_URL` in `src/windows/uninstall/uninstall-entry.ts`.
Rebuild the app and OPK after setting the URL. An empty URL skips the survey.

The existing manifest `data.uninstall_window` loads `uninstall.html` in the
background. Like ER, the handler opens the survey in the default system browser
so it remains available after the app is removed. Analytics stays opt-in and
preference cleanup runs even if analytics or opening the browser fails.
No user identity or world data is appended to the survey URL.

Run `npm run test:uninstall` for isolated tests; these do not uninstall the app,
send analytics, or open a real browser.

## Tracking mod

The BepInEx plugin in `tracking-mod/` writes the player position and, only after
the separate inventory permission is accepted, an inventory snapshot. Building it
needs the .NET SDK and a local Valheim install:

```bash
npm run build:tracking-mod
```

That compiles the plugin and copies it into `public/tracking-mod/payload/`, which
the installer writes into the Valheim folder. Until the payload contains a build
of the current source, the app reports `Tracker outdated` for inventory sharing
and keeps the planner in manual mode.

Generated extraction files live under `data/generated/`. Runtime data and icons are written to `public/game-data/` and copied into the production build.


## Game image CDN

Game icons and location artwork are served exclusively from the verified Cloudflare R2 release recorded in `public/game-data/asset-cdn.json`. PZ and Valheim use separate object prefixes on the existing CDN. Image contents determine the release path; files are cached immutably for one year.

After extracting or editing game PNGs, run `npm run upload:assets`, then `npm run prepare:cdn`. Upload credentials live only in the ignored `.env` (see `.env.example`), never in Vite variables. The uploader verifies every public object, its content, cache headers and wildcard CORS before publishing the local release manifest. It never deletes existing objects or changes the PZ prefix.

`npm run build` prepares catalog URLs and rejects changed, unpublished PNGs. The build excludes the game icons folder from `dist`; `npm run build:opk` also enforces this. All eight minimap textures (2,671,424 bytes) stay local in `public/game-data/map-textures` and are required in the OPK. Their content is checked against `map-texture-manifest.json`; the uploader never uploads this folder. Overwolf's manifest icons remain local because the platform requires them. Local icon PNGs are removed after publishing. Ordinary builds use the CDN manifest for icons and the eight local map textures. Publishing a replacement release requires a complete staging set (re-extract game images and restore custom artwork from the current CDN); partial staging is rejected to prevent losing published images. `npm run test:cdn` checks every catalog image reference against the published release.
