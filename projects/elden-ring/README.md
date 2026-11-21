# Elden Ring Atlas

An [Overwolf](https://overwolf.github.io/) companion app — interactive maps, bosses, items, and live tracking for **Elden Ring** and **Elden Ring Nightreign**. The Overwolf desktop plumbing is fully wired up and compliant:

- **Window management** — frameless `native_window` main window with a custom title bar (drag, minimize, maximize/restore, close), DPI-aware bounds correction, multi-monitor handling, and "move the app off the game's monitor" behavior on game launch.
- **Ads management** — an Overwolf-compliant ad rail (`OwAd` 400×60 banner + 400×600 large with high-impact), loaded from Overwolf's CDN, that follows the official rules: instances are reused, ads are `removeAd()`'d on minimize and `refreshAd()`'d on restore (never destroyed), and only the **main** window's state drives them (ALT+TAB keeps ads running).
- **Background controller** — the invisible long-lived "brain": tray menu, global hotkeys, app-launch routing (game auto-launch stays hidden; user launches reveal the window), game detection, and cross-window messaging.
- **OPK tooling** — manifest validation, icon generation within Overwolf's size limits, version bumping, and one-command `.opk` packaging.

The window sizing mirrors Overwolf's own recommendations: main window **1300×840** (also its `min_size`), overlay **320×450** with `min_size` **60×60**.

## Stack

React 19 · TypeScript · Vite 7 · Tailwind CSS v4 · `@overwolf/types`.

## Getting started

```bash
npm install
npm run dev        # runs in a browser (Overwolf APIs are guarded/no-op'd)
```

To run it as a real Overwolf app:

```bash
npm run build      # outputs dist/ with manifest.json at the root
```

Then in the Overwolf client: **Settings → About → Development Options → Load unpacked extension** and select the `dist/` folder.

## Project layout

```
public/
  manifest.json              # Overwolf manifest — windows, hotkeys, game targeting
  icon.png / icon_gray.png   # tray/dock icons (recompressed to spec at build)
  launcher_icon.ico
index.html                   # static website and SEO entry
app.html                     # interactive app entry for Overwolf and /map
background.html              # entry for the invisible background window
src/
  App.tsx                    # picks main vs overlay UI by Overwolf window name
  main.tsx                   # mounts app.html windows
  background-entry.tsx       # mounts the background window
  overwolf-utils/
    window-manager.ts        # all window lifecycle + bounds logic
    tray-manager.ts          # system tray menu
  background/
    background-controller.tsx# tray, hotkeys, launch routing, game detection
  components/
    ads/overwolf-ad-rail.tsx # the compliant OwAd rail
    layout/window-header.tsx # custom draggable title bar
  windows/
    dashboard/dashboard-window.tsx  # main window UI (replace with your app)
    overlay/overlay-window.tsx      # in-game overlay UI
  utils/                     # overwolf guards, asset-export blockers
scripts/                     # validate-manifest, build-icons, build-opk, bump-version
```

## NPM scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (browser; OW APIs guarded) |
| `npm run build` | Type-check + Vite build into `dist/` |
| `npm run lint` | ESLint |
| `npm run validate` | Validate `public/manifest.json` — project rules **and** Overwolf's official JSON schema |
| `npm run validate:schema` | Schema-only check against Overwolf's official manifest schema (via `ajv`) |
| `npm run build:icons` | Regenerate spec-compliant icons into `dist/` |
| `npm run build:opk` | Full build + package a submission-ready `.opk` |
| `npm run bump-version 1.0.0` | Sync version across `package.json` + manifest |

> `validate:schema` checks the manifest against [`schema/overwolf-manifest-schema.json`](schema/overwolf-manifest-schema.json) — Overwolf's official manifest schema, vendored from [overwolf/community-gists](https://github.com/overwolf/community-gists/blob/master/overwolf-manifest-schema.json). Re-download that file to pick up schema updates.

## Customizing for your app

1. **Identity** — set `meta.name`, `meta.author`, `meta.description` in `public/manifest.json`; replace the icons in `public/`; update the app name in `tray-manager.ts` and `window-header.tsx`.
2. **Game targeting** — the `game_ids` in `manifest.json` (`data.game_targeting` and `data.launch_events`) are locked to **Elden Ring (`21866`)** and **Elden Ring Nightreign (`25918`)**: the app auto-launches and shows its in-game overlay for these two titles only. `npm run validate` errors if any other id is added (or one of these is removed), and `background-controller.tsx` re-checks the game title as a runtime safety net.
3. **Hotkeys** — edit `data.hotkeys` in the manifest and the matching `event.name` checks in `background-controller.tsx`.
4. **Your UI** — replace the body of `dashboard-window.tsx` (keep `<WindowHeader/>` and the `<OverwolfAdRail/>` rail) and `overlay-window.tsx`.

## Overwolf ad-rule notes

The ad rail in `src/components/ads/overwolf-ad-rail.tsx` is the part most likely to fail store review if changed carelessly. It deliberately:

- loads `owads.min.js` from `content.overwolf.com` (never bundled),
- creates each `OwAd` once and reuses it,
- calls `removeAd()` on minimize/hide and `refreshAd()` on restore instead of destroying the instance,
- reacts only to the **main** window's `onStateChanged` (focus loss/ALT+TAB must not stop ads),
- reserves the exact 400×60 / 400×600 boxes the SDK expects.

Keep these invariants when you restyle the rail.
