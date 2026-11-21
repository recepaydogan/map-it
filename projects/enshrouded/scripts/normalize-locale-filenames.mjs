import { existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const languages = JSON.parse(readFileSync(resolve(root, "scripts/enshrouded-languages.json"), "utf8"));
const names = new Map();
for (const [code, gameCode] of Object.entries(languages)) {
  for (const suffix of [".json", "-report.json", "-errors.json"]) names.set(code + suffix, code.toLowerCase() + suffix);
  names.set(`${gameCode}.json`, `${gameCode.replaceAll("_", "-").toLowerCase()}.json`);
}
let renamed = 0;
for (const directory of ["src/i18n/locales", "public/data/enshrouded/locales", "public/data/enshrouded/content-locales",
  "research/localization/app-drafts", "research/localization/content-drafts", "research/localization/ui-game-terms"]) {
  const absolute = resolve(root, directory);
  if (!absolute.startsWith(root + sep)) throw new Error("Locale rename is outside the workspace");
  if (!existsSync(absolute)) continue;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const name = names.get(entry.name);
    if (!entry.isFile() || !name || name === entry.name) continue;
    const source = resolve(absolute, entry.name);
    const target = resolve(absolute, name);
    if (existsSync(target) && statSync(source).ino !== statSync(target).ino) {
      if (!readFileSync(source).equals(readFileSync(target))) throw new Error(`Conflicting locale files: ${source} and ${target}`);
      unlinkSync(source);
    } else {
      // Windows requires an intermediate name to reliably change only case.
      const temporary = resolve(absolute, `.locale-rename-${process.pid}-${renamed}.tmp`);
      renameSync(source, temporary);
      try { renameSync(temporary, target); }
      catch (error) { renameSync(temporary, source); throw error; }
    }
    renamed++;
  }
}
console.log(`Normalized ${renamed} generated locale filenames`);
