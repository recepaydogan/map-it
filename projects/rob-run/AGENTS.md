# Project rules

- Keep the dashboard, panel, overlay, map and account components reusable.
- Put game identity in `src/game-config.ts`, `public/manifest.json`, `src/features/map/map-registry.ts` and `src/features/map/map-config.ts`.
- Store new game catalogs under `public/data/` and map content under `public/maps/`.
- Use kebab-case for files and directories and English for code and documentation.
- Put user-facing strings in `src/i18n/locales/en.json`.
- Never render overlays, popovers or dialogs over the 440px Overwolf ad rail.
- Never commit, push or rewrite Git history without explicit user approval.
