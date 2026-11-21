# Map It

Map It brings twelve map applications together behind a game library and switcher. Each game retains its own interface, map/database navigation, catalogs, CDN settings and separate saved data. Accounts use the shared Map It account page and session.

The imported apps are AION 2, Baldur's Gate 3, Elden Ring / Nightreign, Enshrouded, GTA 6, Minecraft, PEAK, Phantom Blade Zero, Project Zomboid, ROB RUN, Valheim and WoW Forever.

## Start

Use Node.js 22 or newer and Python 3.12 or newer.

```powershell
npm install
npm run import:apps
npm run dev
npm run build
npm run validate:manifest
npm run test:hub
npm run verify:apps
```

`projects/<game>/` contains source snapshots and per-file checksums. `public/apps/<game>/` contains the corresponding locally available runnable release, including its bundled data and native payloads. The original sibling project directories are read-only inputs and are never built or changed by Map It. Dependencies, extraction outputs and research artifacts are excluded from snapshots. Each project's private `.env` file is copied separately into its matching `projects/<game>/` directory for local development and publishing; these files are Git-ignored and are excluded from runtime builds and OPKs.

For a fresh checkout, place the sibling game projects listed in `config/map-apps.json` next to Map It with their matching local builds or OPKs. The import command recreates `public/apps/` and the checksum receipts.

On first use, a supported running game opens its matching map automatically. When no supported game is running and no game has been selected, Map It shows the cover-card home page. Choosing a card saves the selection; later launches reopen the saved game unless a supported running game takes priority. Subsequent switches use the top-left game picker, without returning to the home page. Startup resolves game detection before mounting a saved game's UI, so an outdated selection does not flash first. Only the selected game UI is mounted. Its saved state is isolated from every other game, including when original apps used identical storage keys. Browser workers and local assets resolve inside their game's directory; CDN URLs retain their original release versions.

Overwolf uses one Map It background owner and the selected game's original background module. Native reader plugins and auxiliary windows are registered under the aggregate manifest. Window aliases, messages, hotkeys, IndexedDB, BroadcastChannel and storage are adapted at the import boundary. The host game picker and its menus stay outside the 440px ad rail. Additional per-game native windows retain their original dimensions and UI.

`npm run build` and `npm run build:opk` use the same automatic pipeline: check sibling projects, import their latest complete matching releases, prepare the lean content, publish and verify changed data in immutable Map It CDN namespaces, run integration checks, and build the output. The source projects are read-only inputs and are never rebuilt or modified by this pipeline. Run the changed solo app's build first when it has unbuilt changes. `npm run check:apps` performs the source/import checks without changing anything; `npm run import:apps` runs only the guarded import step.

Use `npm run build -- --app=rob-run` to refresh ROB RUN while reusing the other verified imports. A scoped refresh requires the same library entry, manifest, and hotkey routing. Use the full build when those change.

Release selection compares matching OPKs and complete local builds by build time and validates their manifest versions. Input hashes include source code, configuration, native source, public assets and local build environment; additions, deletions and same-version edits are detected. Inputs newer than the selected build stop the pipeline. After the first import, changed inputs with identical release bytes also stop it, even when timestamps have been restored. Legacy releases do not carry a source-provenance receipt: the first import necessarily relies on their existing build timestamps, not a claim of reproducible-build provenance.

Imports are staged before switching active files. Local edits to imported snapshots or tracked runtime files stop the update rather than being overwritten. Previous imports are retained under `.sync-cache/backup-*`; an interrupted switch leaves a transaction journal and blocks further builds until recovered. Builds share an exclusive lock and check the source inputs again before replacing `dist` or the final OPK. A failed OPK validation preserves the previous OPK. Keep source development in the sibling projects, and keep Map It adapters/optimization rules here.

`npm run verify:apps -- --check-sources` is a legacy diagnostic for previously recorded source files. The automatic pipeline and `check:apps` additionally check newly added and deleted build inputs and the selected release bytes.

## Structure and configuration

- `src/game-config.ts`: app identity, supported languages, game targeting and feature flags.
- `public/manifest.json`: merged Overwolf windows, unique hotkeys, native plugins and supported game IDs.
- `src/features/map/map-registry.ts` and `map-config.ts`: map registrations and marker categories.
- `public/maps/` and `public/data/`: future maps and catalogs, following the existing contracts.
- `src/i18n/locales/en.json`: shared English UI fallback. Add game translations and additional locales when their data is ready.
- `public/map-it-runtime.js`: module isolation and native API compatibility boundary.
- `brand/`: neutral placeholder artwork.
- `.env.example`: settings template for this app's own Supabase, PostHog and R2 integrations. Connection code and database migrations are retained.

The lean package keeps JavaScript, native tracking, Minecraft generation engines, English UI and shared WOFF2 fonts locally. Heavy catalogs, images, navigation regions and additional game languages use separate immutable CDN releases under `map-it/v1/<game>/releases/<fingerprint>/`. This namespace does not replace the original apps' releases. Elden Ring uses its own configured bucket. Native Java executables and DLLs remain bundled for Project Zomboid.

```powershell
npm run prepare:app-content
npm run publish:app-content
npm run test:content
npm run build
npm run build:opk
```

Preparation retains all raw imported content in `public/apps/` and stages build-only replacements in the ignored `.content-cache/`. Publication reads credentials from the corresponding `projects/<game>/.env`, checks upload checksums and public CDN responses, then pins the verified release. The automatic build prepares/publishes again when imported inputs or preparation rules change; unchanged builds reuse the lean plan and recheck its public release manifests. Network access is required. Changed CDN data requires the existing publishing credentials and public read CORS; automatic builds do not change bucket CORS settings. Missing credentials or failed checks stop the build without falling back to a larger local package. The explicit preparation/publication commands remain available for maintenance.

ROB RUN keeps its map metadata, wiki catalogs and page artwork bundled. Map tiles and item images use the existing Project Zomboid publishing profile and their own immutable `map-it/v1/rob-run/` namespace. Map progress remains device-local.

`config/build-size-limits.json` caps each bundled game, the total unpacked output (170 MB), and the compressed OPK (50 MB). These limits retain headroom over the previous approximately 40 MB OPK; review any new large files before adjusting a limit. Output verification also rejects offloaded files, duplicated fonts, private environment files and missing host adapters. The source app's package size does not determine the Map It package size. Run `npm run test:build-pipeline` for stale-source, same-version, rollback, local-edit, lock and CDN failure regressions.

Fetched data is verified against the pinned SHA-256 and stored in the browser's persistent cache when available. Already cached data can be opened offline; content never downloaded still requires a connection. Requests are shared between simultaneous consumers, and one cancelled consumer does not cancel the others. Cache quota errors allow online use. Original CDN locale URLs resolve to the pinned snapshot to avoid mixing versions. Elden Ring's local language modules load JSON data; executable JavaScript stays in the OPK. Valheim keeps English locally, loads its three other supported language dictionaries through the verified cache, and uses only texture conversions that passed an exact RGBA comparison.

`npm run build:opk` creates the combined local OPK using Python's standard-library ZIP writer (DEFLATE level 9, followed by CRC verification). Python is also required for importing apps. Source snapshots and private environment files are not packaged. `npm run dev` serves the complete unoptimized imports; use the production `dist` for lean-package verification.

Browser checks can verify UI, switching, map loads and data navigation. Native Overwolf game detection, overlays, advertising, plugin execution and in-game tracking require a separate Overwolf runtime test; browser success is not proof of native compatibility. Account operations in Map It use its own Supabase project. Original solo apps and their authentication backends remain unchanged.

## Shared Map It account

Map It owns one account page and one email/password session across the library and all imported games. Each game's account button opens the host page; game frames and the host ad rail remain mounted. Sign-in, registration, display-name updates, recovery codes and sign-out use the root `.env` public settings (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Use the Map It project's publishable/anon key. No service-role key belongs in a browser build.

The build adapter changes only emitted copies: imported auth clients share `map-it-auth` storage and its cross-window auth channel. Only known solo API origins are routed to the Map It backend. Missing Map It configuration returns an unavailable response instead of falling back to a solo backend. Ordinary game storage and IndexedDB remain separated by game. Shared account sign-out waits for available original save-flush functions before ending the session.

The Map It Supabase project has `supabase/migrations/202611040001-map-it-game-saves.sql` applied. Tables and revision-checked RPCs have a `map_it_<game>_` prefix and row-level ownership policies. Valheim and Project Zomboid retain their existing device-local progress behavior; this work does not add cloud progress to those games. Solo account import and the proposed “Bring my data from” flow were cancelled and are not implemented.

Recovery is configured in the Map It project's dashboard: email OTP length is 8 and Reset Password uses `supabase/templates/recovery.html`. It includes the actual `{{ .Token }}` code instead of requiring a browser redirect. The UI expects eight digits, including leading zeros. Regenerate the template from English copy with `node scripts/build-account-email.mjs` when changing email text.

Help & Feedback is one host-owned surface across the library and all games. Every new report requires an explicit game selection with its icon and name; the game remains attached to the conversation in both the user view and admin inbox. `supabase/migrations/202611040002-shared-support.sql` is applied to the Map It project and validates the same game allowlist server-side. Support staff use `recepaydogan209@gmail.com`. Guest reports can be claimed at sign-in; account-owned reports require that account or support staff, even if a previous device token is supplied after sign-out. Pending requests from an old account cannot repopulate the new account's UI. Imported solo support pollers and forms are retired only in the emitted Map It builds.

The `202611190001-map-it-rob-run.sql` migration is applied to the Map It Supabase project. It enables shared feedback for ROB RUN and GTA 6. Map It verifies new game IDs through the table constraint and the shared feedback RPC.

Run `npm run test:account` and `npm run test:support` for session, recovery, game-save and support isolation checks. `scripts/verify-map-it-backend.sql` provides live transactional checks that roll back every test row and send no email.

`npm run test:account` covers backend routing, shared SDK sessions, credential persistence, original save flushing, and an in-memory PostgreSQL migration/RLS test. No production account is created by these checks.
