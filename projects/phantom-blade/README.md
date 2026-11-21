# Phantom Blade Interactive Map

Local copy of the WoW Forever Map application shell for Phantom Blade Zero.

## Run

```sh
npm install
npm run dev
```

`npm run build` checks TypeScript and builds the desktop, in-game, minimap and
background entry points. `npm run build:opk` creates a local Overwolf package.

## Preserved shell

- Desktop/in-game/minimap windows, placement, resizing, tray and hotkeys.
- Map camera, filters, search, personal marker creation/editing/deletion,
  favorites, completion, marker panels and return navigation.
- Reusable reference panels and their navigation history.
- Account, settings, support, onboarding and optional analytics services.
- The separate 440px ad rail and content-scoped overlay/portal root.
- Generic live-position store, marker and follow-camera interface.

## Content reset

WoW maps, catalogs, client extraction/research files, store artwork, native
position DLL/addon, combat-log reader and release notes are excluded. The blank
`workspace` map is an empty canvas for exercising the shell; it is not game data.
Game-specific reference/character/faction UI stays disabled until populated.
Reusable feature components remain available for future content integration.

No `node_modules`, Git history, `.env`, release archives or previous build output
were copied. Dependencies are declared in `package.json` and `package-lock.json`.

## Add verified content later

1. Set app/game identity and optional capabilities in `src/game-config.ts`.
2. Add catalogs under `public/data/` and maps under `public/maps/`.
3. Register maps in `src/features/map/map-registry.ts` and categories in
   `src/features/map/map-config.ts`. Put UI strings in `src/i18n/locales/en.json`.
4. Configure this app's own optional services using `.env.example`.
5. Add a verified Overwolf game class ID to both game config and manifest,
   change targeting from `none` to `dedicated`, and add a GameLaunch event.
   No game ID is guessed; desktop development works before this is configured.
6. Implement the game's own position source before enabling live position.
   Publish samples through the preserved generic live-position store.

The placeholder icon is neutral and is not official game artwork.

## Live position

The companion reads the local Steam game's player and map subsystem with
`OpenProcess(0x0410)` and `ReadProcessMemory`. It never writes game memory,
injects code, or automates gameplay. The reader finds the name pool and game
engine in the installed executable by instruction signature. It checks the
loaded PE timestamp and image size, rejects competing addresses, and validates
the live player and map structures before publishing coordinates.

The reader follows the local player/controller/pawn/root ownership chain and
resolves property offsets from the running game's reflection metadata. Region,
layer and projection triangles/UVs come from the game's map subsystem. The
native mesh ray/height selection maps the player onto the original texture.
Unsupported layers, attached character roots, missing triangles and invalid
ownership clear the marker instead of publishing an estimated position.

`npm run build:position` compiles the Overwolf DLL and a local diagnostic host.
Normal `dev` and `build` commands include that step. Overwolf runs one reader
in the background window, with native process discovery independent of game
class IDs. Local Vite development uses the same reader through a loopback-only
endpoint; this endpoint is absent from production builds. Both publish to the
shared live-position store at a target interval of 50 ms. Game exit or a stale
source clears the marker. `npm run test:position` requires the supported game
to be running in a loaded world and checks live profile changes and packet rejection.

When local discovery fails after a Steam patch, add a fallback profile to
`native/position-reader/profiles-v1.json` and verify it in a loaded world with
`node scripts/test-position-reader.mjs --profiles-only`. The profile specifies the executable identity, the
global name pool and game engine addresses as RVAs, and the fixed map fields
as offsets. Publish the verified catalog with:

```sh
npm run publish:position-profiles
node --experimental-strip-types scripts/publish-position-profiles.mjs --upload
```

The first command validates the catalog locally. The second updates the single
mutable `live-position/profiles-v1.json` CDN object and verifies the public
response. The reader tries local discovery first, then checks cached and bundled
profiles against the executable's SHA-256 and PE timestamp. If tracking still
reports an unsupported build, the background window requests the CDN catalog
once per game session and keeps the last accepted catalog on fetch failure.
To roll back a fallback profile, restore or remove its entry and publish again.
This works with the app version that introduced profile updates and later
versions. Changes to the reader algorithm or its schema require a new OPK.

Verification includes a live player in Weeping Creek Valley, the visible Me
marker and center/follow controls in the local app. The 12 regions' projection
meshes were checked against 7,364 source anchor vertices; this does not mean
every region has been visited in-game. Overwolf overlay activation still needs
a verified game class ID; none is fabricated for this integration.

## Client-file mining

The Steam build `26266538` discovery dataset is under
`public/data/game-files/build-26266538/`. It is generated from the installed
Phantom Blade Zero client only. Verified records drive the map markers and wiki entries.
No fabricated names, coordinates, stats, drops, or placeholder game records are
added when the client leaves a field empty or a reference cannot be resolved.

NPC display names are linked to native speaker keys through owned dialogue,
explicit same-region actor handles, authored subtitle lists, and exact native
NPC-description/name matches. Subtitle list/random modes override copied scalar
defaults. Shared player/NPC chorus labels are not individual NPC identities.
Ambiguous identities remain unresolved. The per-pin investigation is recorded in
`artifacts/npc-name-gap-resolution.json`.
Actor-owned dialogue and subtitle presets also override shared prefab examples.
Sequence identities require an exact actor handle, a matching local binding GUID,
a same-region authored flow reference, and a complete native localized name.
The deeper pass and its remaining gaps are recorded in
`artifacts/npc-name-deeper-resolution.json`.

- `catalog.json`: table inventory, decode failures, source hashes, and remaining coverage.
- `database/catalog.json`: item, creature, boss, acquisition, and stat-link coverage.
- `database/items.json`: all discovered ItemDataBase records, with definition and
  supporting-record roles kept separate; blank native names stay unresolved.
- `database/creatures.json` and `database/bosses.json`: native codex rows, exact
  class-to-loot joins, actor configs, inherited defaults, and level-curve definitions.
- `database/npc-classes.json`: the broader set of native NPC blueprint classes,
  including classes outside the codex; these are not counted as proven encounters.
- `database/assets/`: shared source-linked native asset exports.
- `database/media.json` and `database/icons/`: original native item and creature
  textures decoded to lossless PNGs with source/payload hashes and field links.
- `database/acquisition-links.json`: client loot entries and shop offers, retaining
  level, probability, cost, and other native fields without claiming observed rates.
- `map-records.json`: native collection records; source-declared test-region
  records are retained separately and zero coordinates are flagged.
- `verification.json`: source SHA-256, localization, field-preservation, and join checks.

The raw archive inventory, decoded packages, executable schema evidence, and
local decryption key are in
`C:/Users/recep/.codex/research/phantom-blade-zero-2026-10-29/`.
Game-file records do not by themselves prove that an asset is reachable in a
playable route. Scene placement, encounter overrides, and unresolved references
remain visible gaps. Quests are the last priority for subsequent mining.

Mining tools are in `scripts/mining/`. The extractor reuses the locally available
CUE4Parse and texture/Oodle tooling; AION 2 game data is never an input to this
dataset. The C# project accepts `-p:ParserDirectory=<local-parser-directory>`.
Native schema recovery is bounded to the verified executable hash and must be
re-derived for a different client build.

To rebuild the derived catalogs after extraction:

```powershell
$researchRoot = 'C:/Users/recep/.codex/research/phantom-blade-zero-2026-10-29'
$catalogRoot = 'public/data/game-files/build-26266538'
python scripts/mining/build-evidence-catalog.py --research $researchRoot --output $catalogRoot --build 26266538
python scripts/mining/build-combat-database.py --research $researchRoot --catalog $catalogRoot
python scripts/mining/finalize-database-media.py --catalog $catalogRoot
python scripts/mining/verify-evidence-catalog.py --research $researchRoot --catalog $catalogRoot
```

The scripts reject stale schemas and remove failed decoded outputs. Every
catalog row and linked native asset keeps its source identity. Extraction uses
read-only access to the installed game and does not modify or run its code.


## R2 content delivery

Production packages contain the app shell, native plugin, English UI text and
English game language/source packs. Map tiles, markers, wiki/database content,
item artwork and the 14 other UI/game languages are loaded from an immutable R2
release. Development uses the same CDN release, without uploading anything.
English stays local in both modes; direct development content URLs redirect to CDN.
Code-only builds can reuse the verified published release with
`npx vite build --mode cdn`; unpublished local data/translations are excluded.

Keep credentials in `.env` only: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, and `R2_PUBLIC_ORIGIN`.
`R2_PUBLIC_ORIGIN` accepts an HTTPS origin or a hostname. The optional
`R2_UPLOAD_CONCURRENCY` defaults to 24 workers (maximum 48).

```sh
npm run publish:content -- --dry-run
npm run publish:content -- --upload
npm run build
npm run build:opk -- --local-only
```

Publishing hashes every CDN file and derives a content fingerprint. Uploads are
resumable; unchanged files in the previous release are copied inside R2 instead
of being sent again. Existing immutable files must match their stored checksum.
Every release inventories all object sizes and checks representative public
files, all language packs and map entry files for SHA-256, size, MIME, CORS and
immutable caching. The release manifest is written last. `content-release.json`
switches only after verification and a final source fingerprint check.

The publisher enables public GET/HEAD CORS when the key permits bucket management.
Object-only keys work with an existing CORS policy; publication stops if public
CORS validation fails. No credentials are copied into public content or the app.

Production builds require the published fingerprint to match current sources;
they cannot silently ship a package whose CDN content is missing. Non-English UI
translations are fetched on demand and fall back to bundled English if unavailable.
The shared rules in `src/content-delivery.json` keep English files local in both
the build and URL resolver. Keep `content-release.json` with the source tree.

`npm run build:opk` publishes/verifies content first. `--local-only` reuses the
already published release and fails when content has changed. Neither mode bundles
CDN content. Generated OPKs are separate from CDN publication.
