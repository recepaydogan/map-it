# Localization

The language selector exposes the 15 languages with actual localized text in the installed game build. The `he` folder contains Chinese text rather than Hebrew and is excluded.

Game names, descriptions and effects come from decoded `Game.locres` entries under `public/data/game-files/build-26266538/localization/`. The packed runtime files retain exact native values and source hashes. Namespace/key references take priority over English text matching; missing native translations fall back to the source English. Identifiers, coordinates and source evidence remain unchanged.

App UI strings live in `src/i18n/locales/en.json` and the corresponding language files. Context overrides are in `data/localization/ui-context-overrides.json`. The UI translation helper reuses exact sibling-app UI translations and translates remaining app-authored copy; it must never generate missing game content. The finalizer applies official region names and game terminology from exact native keys.

The minimap header's `interactShort` means controlling the map through interaction mode; `toggleShort` means showing or hiding the minimap. Keep these distinct from interacting with a game object or enabling a feature. NPC names use verified speaker keys; promoted reading-page titles use their authored title keys. Both require contextual aliases, even when English text matching happens to return a translation. Unresolved NPC labels use the localized NPC type rather than a personal-name placeholder.

Quest aliases use the exact name, description and stage references in `database/quests.json`. Native flow references without a namespace resolve to `Default`, as they do in the quest extractor. The audit verifies every populated quest display field has its matching native alias; tests cover all quests in every supported language. Blank publisher translations stay blank in the packs and use the source English at runtime. The audit reports those unavailable native translations separately from missing app UI keys.

Regenerate after an English UI or decoded game catalog change:

```powershell
node scripts/localization/build-game-locales.mjs
node scripts/localization/translate-app-ui.mjs
node scripts/localization/translate-app-ui.mjs --repair-identical
node scripts/localization/finalize-ui-locales.mjs
node scripts/localization/native-game-locales.test.mjs
node scripts/localization/audit-locales.mjs
```

After publishing content, run `node scripts/localization/verify-published-locales.mjs`.
This checks every supported remote UI and native language pack against the selected
CDN manifest and current local files, including interpolation placeholders. Its
report is `artifacts/localization-2026-10-29/published-audit.json`. Empty English
strings are intentionally empty; they are not missing translations.

The audit checks all current English UI keys, interpolation placeholders, unchanged native translation values and referenced native translation gaps. Its output is `artifacts/localization-2026-10-29/audit.json`. A passing UI audit does not imply that the game publisher filled every native translation field. Verify language switching, map labels and a game entry in the running app after runtime changes.
