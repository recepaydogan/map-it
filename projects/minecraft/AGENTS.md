# Project Rules

- This repository is a BASE: every feature must stay game-agnostic. Anything
  that names a specific game belongs in `src/game-config.ts`, `public/manifest.json`,
  `src/features/map/map-registry.ts` or `src/features/map/map-config.ts`.
- Keep the implementation simple, reusable and free of duplicated logic.
- Write code, comments, documentation and commit messages in English.
- Put every user-facing string in `src/i18n/locales/en.json`; keep the other
  locales in step (`npm run test:locales` fails otherwise).
- Use kebab-case for files and directories.
- Use `twMerge` through `src/lib/cn.ts` for composed Tailwind classes.
- Keep components, hooks and utilities in focused files.
- Never render overlays, popovers or dialogs over the 440px Overwolf ad rail.
- Never commit, push or rewrite Git history without explicit user approval.
- Fix root causes and do not swallow unexpected errors silently.
- Treat the product as a combined interactive map and comprehensive connected
  game wiki, never as a map-only utility. Follow `docs/product-positioning.md`
  for store listing copy and visual direction.
