# Game Maps

The base every game-map companion app is branched from. It is a complete,
shippable Overwolf app with a placeholder world, so a new game's map app starts
from a working product rather than an empty repo.

## What the base already does

**Map**

- Tile-pyramid map with smooth pan, wheel/keyboard/button zoom, and a persisted
  view per map.
- Markers by category with semantic zoom (overview / regional / detail),
  same-category clustering, hover name plates and click-to-jump.
- Fuzzy search (spelling-blind, typo-tolerant) with keyboard navigation,
  coordinate search (`X, Y`) and a region jump dropdown.
- Menu panel with grouped layer toggles, tri-state group checkboxes, "Only"
  isolation and per-map persistence.
- Personal markers (place, rename, colour, icon, group, delete), favourites,
  completed locations and notes — all persisted and shared between windows.
- Saved panel listing everything the player kept.
- One-panel-at-a-time rule: Menu, Saved and a point's details replace each
  other; Escape closes innermost-first; Ctrl+K focuses search.
- Multiple maps through a registry; a map picker appears when there are two or
  more.
- Live-position plumbing: a store, a smoothed player marker, centre/follow
  controls and a follow camera. Only the game-specific reader is missing.

**Windows and Overwolf behaviour**

- Frameless desktop window with custom title bar, drag, maximize, first-launch
  centring and DPI-aware bounds correction.
- Launches with the game; moves itself to the other monitor when it shares one
  with the game; single-monitor players get the full in-game window auto-opened.
- In-game full-app window and a small draggable, resizable minimap overlay
  with input pass-through lock.
- Tray icon and menu, three rebindable hotkeys (rebinding inside the app).
- Overwolf ad rail that nothing ever covers.
- Uninstall window reporting to PostHog and opening an optional survey.

**Product shell**

- Accounts through Supabase: email/password and password reset by emailed code.
- Guided onboarding tour (auto-starts once, replayable from Settings).
- Settings: map display, game-launch behaviour, hotkeys, help, legal notice.
- 28 UI languages with a title-bar picker.
- PostHog analytics with a curated event set and per-window context.

## Getting started

```bash
npm install
npm run dev
```

- Main window: `http://localhost:5173/`
- In-game minimap: `http://localhost:5173/?window=overlay_map`

For Overwolf, run `npm run watch`, then in Overwolf open **Settings → About →
Development Options**, choose **Load unpacked extension** and select `dist/`.

`npm run validate` checks the manifest against `src/game-config.ts`, the
locale files against `en.json`, and runs the map unit tests. `npm run
build:opk` produces the release package.

## Making a map app for a new game

Follow [docs/branching-guide.md](docs/branching-guide.md). In short:

1. `src/game-config.ts` — app name, game ids, developer, URL scheme.
2. `public/manifest.json` — name, game ids, scheme (validated against 1).
3. `brand/icon-master.png` → `npm run build:icons`.
4. `src/features/map/map-registry.ts` and `public/maps/<id>/` — the real map.
5. `src/features/map/map-config.ts` + `public/icons/categories/` — categories.
6. `.env` — the new app's Supabase project and PostHog key.
7. `src/i18n/locales/en.json` — copy that mentions the game, then
   `npm run translate:locales -- --keys=...`.

## Map data layout

Each registered map is a folder:

```
public/maps/<map-id>/
  metadata.json                      bounds, tileSize, detailLevels, regions, locations
  tiles/<level>/tile<x>x<y>.webp     level 0 = full resolution, level N = tileSize·2^N units
```

`scripts/build-sample-map.mjs` is a working example of producing both from an
image; `src/features/map/use-map-data.ts` documents what `metadata.json` must
contain. Point `VITE_MAP_DATA_BASE_URL` at a CDN to keep map data out of the
`.opk`.

## Live position

The map already knows how to draw and follow a player. To feed it, write a
reader for your game (log file, mod output, memory bridge) in the background
window and call `publishLivePosition(...)` from
`src/features/live-position/live-position-store.ts`; call `clearLivePosition()`
when the game exits. See the notes in `src/background/background-controller.tsx`.
