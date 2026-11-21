# Peak Map

An Overwolf desktop and in-game map companion for PEAK. It includes:

- A full-screen daily island map
- Pan, zoom, smooth marker focus, and low-zoom clustering
- Category filters and location search
- Location details, loot information, related-location navigation, and ordered Escape handling
- Matching settings and in-game overlay surfaces
- Local preferences, Overwolf window lifecycle, verified PEAK game events, tray actions, and ad lifecycle
- A generated 14-level catalog sourced from the locally installed PEAK Unity scenes

## Start

```bash
npm install
npm run build:icons
npm run dev
```

`build:icons` regenerates the packaged icons in `public/` from `assets/`, plus the
Overwolf developers-console upload set in `store/` (55x55 icon, 258x198 tile,
1920x560 hero). `build:screenshots` turns the app captures in
`assets/screenshots/` into the 1200x675 listing screenshots in
`store/screenshots/` (JPG, each under 100 KB).

Use `npm run build:overwolf` for the package-ready output in `dist`.
Use `npm run watch` while the unpacked `dist/` extension is loaded in Overwolf;
Vite rebuilds that folder whenever a source file changes.

Before a release, update every tracked app version together with
`npm run bump-version -- patch` (or `minor`, `major`, or an explicit `x.y.z`).
Add `--dry-run` to preview the next version without changing files.

## Uninstall survey

Paste `scripts/create-uninstall-survey.gs` into a new Google Apps Script project
and run `createUninstallSurvey`. This creates a five-question Peak Map survey.
Verify that the PUBLIC URL works while signed out, then set `SURVEY_URL` in
`src/windows/uninstall/uninstall-entry.ts` and rebuild with `npm run build:overwolf`
(or `npm run build:opk` for a distributable package). Until that URL is set, the
handler deliberately skips opening a browser.

The invisible `uninstall.html` entry is declared in the manifest and Vite inputs.
It opens the survey in the default browser and reports `app_uninstalled` only
when the existing PostHog configuration and a stored identity are available.
Analytics failures cannot block the survey; no identity, route, or lobby data
is appended to its URL. Overwolf retains responsibility for app-data cleanup.

Survey wording lives in `uninstallSurvey` in `src/i18n/locales/en.json`.
After editing it, run `npm run build:uninstall-survey` to regenerate the standalone
Apps Script. `npm run test:uninstall` checks the survey and uninstall flow with
mock host APIs; it does not create a live form, send events, or uninstall the app.

## PEAK data

The app loads its catalog, maps, tiles, and marker sprites from
`VITE_PEAK_CDN_BASE_URL`. Developer copies live in the gitignored
`artifacts/peak-data/` directory, never in `public/` or the application package.
To extract updated metadata after a PEAK update:

```bash
npm run setup:peak-data
npm run extract:peak-data
```

The scanner reads the installation without modifying it. Pass a custom
installation with `py -3 scripts/scan-peak-game-data.py --game-root "D:\\SteamLibrary\\steamapps\\common\\PEAK"`.
Follow [the capture and staged publication workflow](tools/map-capture/README.md)
to generate images, validate the complete release, and publish assets before
the catalog. End users never perform extraction or CDN uploads.

Daily selection uses PEAK's own `VersionCheck` response when available. If that
request is unavailable, it follows the game's offline fallback exactly: a
24-hour rotation anchored at `2025-06-14 17:00 UTC`, modulo the published catalog's level count.
Luggage positions are deterministic, but their contents are selected by the
host at runtime and are therefore intentionally shown as a weighted pool rather
than a guaranteed item list.

## Live game data

The background window registers the official PEAK features early, retries failed
registration, restores current state with `getInfo`, and keeps only normalized
session data. It also checks Overwolf's official PEAK feature-health endpoint
every 15 minutes. Supported live fields are scene, game mode, party size, match
start and end, local deaths, teammate deaths, and campfire checkpoints. PEAK
currently publishes no documented `location` keys, so the app does not infer
player coordinates from that feature.

PEAK is configured with Overwolf Game ID `26092`, app name `Peak Map`, and author `Peak Map`.
