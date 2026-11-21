/** Replace visible English guide area names with unambiguous client AreaTable names. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await read("public/data/locales/wow-forever/source.json");
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const visibleText = (html) => html.replace(/<[^>]*>/g, " ");
const placeGuides = new Set(["getting-started", "leveling", "making-money", "professions"]);
// Some client AreaTable entries retain English while another client record has
// the game's localized place name. Prefer that reviewed record in guide prose.
const alternateClientAreaKeys = {
  de: { "Thunder Bluff": "WMOAreaTable:89812:0" },
  fr: {
    "Thunder Bluff": "WMOAreaTable:89812:0",
    Darkshore: "GameObjects:13348:0",
    "Silverpine Forest": "GameObjects:1774:0",
  },
};
const check = process.argv.includes("--check");
const dryRun = process.argv.includes("--dry-run");

for (const [language, gameLocale] of Object.entries(languages)) {
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  if (pack.values.length !== source.keys.length) throw new Error(`${language}: client pack length mismatch`);
  const candidates = new Map();
  for (let index = 0; index < source.keys.length; index += 1) {
    if (!/^AreaTable:\d+:1$/.test(source.keys[index])) continue;
    const english = source.values[index];
    let localized = pack.values[index];
    if (!english || !localized || english.length < 6 || english === "Prison") continue;
    if (localized.endsWith(` (${english})`)) localized = localized.slice(0, -english.length - 3);
    const values = candidates.get(english) ?? new Set();
    values.add(localized);
    candidates.set(english, values);
  }
  const names = [...candidates].filter(([english, values]) =>
    values.size === 1 && !values.has(english))
    .map(([english, values]) => [english, [...values][0]])
    .sort(([left], [right]) => right.length - left.length);
  const alternateNames = Object.entries(alternateClientAreaKeys[language] ?? {}).map(([english, key]) => {
    const index = source.keys.indexOf(key);
    if (index < 0 || source.values[index] !== english || !pack.values[index] ||
      pack.values[index] === english) throw new Error(`${language}: missing alternate client area ${key}`);
    return [english, pack.values[index]];
  });
  let replacements = 0;
  let changedFiles = 0;
  const directory = `public/data/guides/locales/${language}`;
  for (const file of await readdir(join(root, directory))) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    const path = join(root, directory, file);
    const raw = await readFile(path, "utf8");
    const guide = JSON.parse(raw);
    if (typeof guide.html !== "string") continue;
    const original = await read(`public/data/guides/${file}`);
    if (original.id !== guide.id || typeof original.html !== "string") {
      throw new Error(`${language}/${file}: guide source mismatch`);
    }
    let html = guide.html;
    const sourceText = visibleText(original.html);
    for (const [english, localized] of [
      ...(placeGuides.has(guide.id) ? names : []), ...alternateNames,
    ]) {
      if (!sourceText.includes(english) || !visibleText(html).includes(english)) continue;
      const term = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(english)}(?![\\p{L}\\p{N}])`, "gu");
      html = html.split(/(<[^>]*>)/g).map((part, index) => {
        if (index % 2) return part;
        const bilingual = `${localized} (${english})`;
        const withoutGloss = part.replaceAll(bilingual, () => {
          replacements += 1;
          return escapeHtml(localized);
        });
        return withoutGloss.replace(term, () => { replacements += 1; return escapeHtml(localized); });
      }).join("");
    }
    if (html === guide.html) continue;
    guide.html = html;
    const output = JSON.stringify(guide) + (raw.endsWith("\n") ? "\n" : "");
    if (check) throw new Error(`${language}/${file}: client area names are stale`);
    if (!dryRun) await writeFile(path, output);
    changedFiles += 1;
  }
  console.log(`${language}: ${replacements} visible game area names in ${changedFiles} guides${dryRun ? " (dry run)" : ""}`);
}
