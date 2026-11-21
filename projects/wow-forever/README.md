# WoW Forever Map

This is a working copy of the map application shell. The dashboard, panels, overlays, account and settings components remain. The original game records have been removed.

The tile pyramids in `public/maps/` are retained as visual placeholders. Their `metadata.json` files contain only rendering geometry, with empty `regions` and `locations`. Replace these tiles and metadata when WoW maps are ready.

Empty JSON contracts in `public/data/` keep catalog and panel loaders functional while WoW data is added. Set the verified Overwolf game class ID in `src/game-config.ts` and `public/manifest.json` before packaging. Add this app's own service credentials in a local `.env`; none were copied from the source project.

Run `npm install`, then `npm run watch` to build into `dist/` and rebuild on source changes. Load `dist/` as an unpacked app in Overwolf; the manifest enables automatic refresh during development. Use `npm run dev` for browser-only development, or `npm run build` for a one-time build.
