# GTA 6 Interactive Map

An Overwolf map companion with locally bundled Leonida map content. The existing map, account, saved-location, panel and window components remain reusable.

## Development

```powershell
npm ci
npm run dev
npm run build
npm run validate:manifest
```

The build creates the distributable app in `dist/`. OPK packaging is a separate, explicit release step (`npm run build:opk`).

## Map content

- GTADB supplies the map's location records and coordinates. Locations awaiting GTADB coordinates remain accessible as unplaced records.
- 8,830 tiles from the current default map, covering six zoom levels.
- GTABase provides in-game photographs and descriptions for matched GTADB locations, plus the Weapons, Vehicles and Characters catalogs.
- Place categories grouped into buildings/homes, shops/leisure, services/transport and landmarks/outdoors.
- Name, position, real-world identification, photo and classification filters, persisted locally.
- Search by location name, address, identifier and tags; detail panels show available coordinates, addresses, status, photographs and copyable coordinates. Internal IDs and edit timestamps are not rendered.
- Favorites and found markers retain the existing local/account persistence behavior. Records without map coordinates remain accessible in the filter panel.

Map assets are in `public/maps/leonida/`; catalogs and search data are in `public/data/`. Required content attribution and license terms are preserved in `public/licenses/gta6-map-data.txt`; printed legend and scale decorations are hidden in the map view while original tile files remain intact.

```powershell
npm run import:media
npm run import:map
npm run verify:map
node scripts/verify-gta6-map.mjs dist
```

The importer pins a repository revision, resumes verified downloads, and validates every asset against its original Git blob hash. The media importer uses the reviewed snapshots in `artifacts/gtabase-import/`, assigns photographs only after name/alias and distance checks, and records unmatched locations instead of guessing. Its source snapshots and report are stored in `artifacts/gta6-import/`. The verifier checks record completeness, coordinate projection, category/filter behavior, image validity, dimensions and asset hashes. A new data revision requires deliberately updating the importer pin and reviewing the resulting content.

## App configuration

Game identity and feature flags are in `src/game-config.ts`, `public/manifest.json`, `src/features/map/map-registry.ts` and `src/features/map/map-config.ts`. User-facing text is in `src/i18n/locales/en.json`. Saved-state namespaces use `gta6-app`.

Overwolf game targeting and live position remain disabled until a supported game ID and position provider are verified. Desktop browser checks do not establish in-game Overwolf behavior.

Copy `.env.example` to `.env` for this app's Supabase and analytics configuration. Content is bundled locally; publishing scripts require separately configured credentials. No upload or publication is part of the normal build.

## Verification

`artifacts/gta6-qa/browser-check.mjs` exercises the actual browser UI: category counts, combined filters and persistence, search and focus, game-only photographs, tag ordering, status cards and coordinate copying, coordinates, favorites/found persistence, unplaced records, compact layout and wheel zoom. It also rejects failed requests, page errors and runtime requests to the content source hosts. This local QA helper uses Playwright installed under `%TEMP%/gta6-map-qa`; it is not an app dependency. Its report and screenshots are in the same artifacts directory.

The inherited full test suite contains legacy game fixtures and is not the release gate for this conversion. Focused marker priority, picking, clustering, sprites, overlay preferences and saved-data checks are used alongside the content verifier, TypeScript production build, manifest validation and browser interaction checks.
