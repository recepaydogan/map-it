# Project Rules

- This repository is a BASE: every feature must stay game-agnostic. Anything
  that names a specific game belongs in `src/game-config.ts`, `public/manifest.json`,
  `src/features/map/map-registry.ts` or `src/features/map/map-config.ts`.
- Keep the implementation simple, reusable and free of duplicated logic.
- Write code, comments, documentation and commit messages in English.
- Put every user-facing string only in `src/i18n/locales/en.json`.
  Translation work is currently paused. Never create, edit, or synchronize any
  other locale file, including Turkish. Missing translations must use the existing
  English fallback; do not add translation keys merely to satisfy a test.
- Use kebab-case for files and directories.
- Use `twMerge` through `src/lib/cn.ts` for composed Tailwind classes.
- Keep components, hooks and utilities in focused files.
- Never add yellow or gold component backgrounds, including `bg-accent-soft`,
  yellow/gold accent fills, translucent tints, gradients, or background glows.
  Use transparent or existing neutral surfaces instead. This persistent user
  preference applies to every agent; do not reintroduce these backgrounds unless
  the user explicitly requests them.
- Never render overlays, popovers or dialogs over the 440px Overwolf ad rail.
- Never commit, push or rewrite Git history without explicit user approval.
- Fix root causes and do not swallow unexpected errors silently.
- Item names must preserve the parenthesized `(Bound)` annotation in the UI.
  Use `src/lib/item-display-name.ts` at presentation boundaries, including item
  links, headings, dropdown labels, tooltips and accessible names. Preserve raw
  names, item IDs, binding/trade metadata, source files and generated catalogs.
  Bound and unbound variants remain distinct records even when their displayed
  names match: never use the display name for identity, deduplication, grouping,
  navigation or data joins. Preserve words such as `Hardbound` and `Pact-Bound`.
