# Project Rules

- This repository is a BASE: every feature must stay game-agnostic. Anything
  that names a specific game belongs in `src/game-config.ts`, `public/manifest.json`,
  `src/features/map/map-registry.ts` or `src/features/map/map-config.ts`.
- Keep the implementation simple, reusable and free of duplicated logic.
- Write code, comments, documentation and commit messages in English.
- Never modify any file under `src/i18n/locales/` unless the user explicitly
  authorizes locale-file changes. This rule applies to every agent and takes
  precedence over localization consistency or locale-test requirements. If a
  task needs a new or changed user-facing string, leave the locale files
  untouched and ask the user for permission before editing them.
- Use kebab-case for files and directories.
- Use `twMerge` through `src/lib/cn.ts` for composed Tailwind classes.
- Keep components, hooks and utilities in focused files.
- Never render overlays, popovers or dialogs over the 440px Overwolf ad rail.
- Never commit, push or rewrite Git history without explicit user approval.
- Fix root causes and do not swallow unexpected errors silently.
