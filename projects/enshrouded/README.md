# Enshrouded Companion

Enshrouded Companion is an Overwolf map and connected game guide for Enshrouded. The app includes map tiles and markers, linked guide entries, personal markers, an in-game overlay, settings, account UI, and release tooling.

The app targets Enshrouded in Overwolf and uses its own app name, URL scheme, and local storage namespace. All content loads locally. Accounts and analytics require this app's own `.env` configuration.

## Development

Run `npm install` once. Use `npm run watch` to build into `dist/` and rebuild on source changes. Load `dist/` as an unpacked app in Overwolf. Use `npm run dev` for browser development or `npm run build` for a one-time build.

Run `npm run validate:manifest` and `npm run test:launch` after changing game targeting or window behavior. `npm run bump-version -- 0.2.0` updates the package, lockfile, and manifest versions together. Update `src/features/updates/updates-release.ts` and the matching notes in `src/i18n/locales/en.json` for an actual release.

Store listing draft copy is in `brand/app-description.md`. Source artwork is under `brand/`, and store asset generation scripts are under `scripts/`.
