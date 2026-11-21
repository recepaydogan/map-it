/** Fill Chinese map NPC names that lack a localized client entry. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const authored = await read("data/npc-name-localization/authored-chinese-map-fallbacks.json");
const locales = { "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
for (const [language, gameLocale] of Object.entries(locales)) {
  const game = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const app = JSON.parse(raw);
  const found = new Map(Object.entries(authored).filter(([, record]) => record[language])
    .map(([name]) => [name, 0]));
  for (const [name, record] of Object.entries(authored)) {
    const translated = record[language];
    if (!translated) continue;
    if (!/[\u3400-\u9fff]/u.test(translated) || /[A-Za-z]/u.test(translated)) {
      throw new Error(`${language}/${name}: invalid authored Chinese NPC name`);
    }
    const official = [...new Set(source.values.flatMap((value, index) =>
      value === name && game.values[index] && game.values[index] !== name
        ? [game.values[index]] : []))];
    if (official.length) throw new Error(`${language}/${name}: use the client Chinese name instead`);
  }
  let added = 0;
  let replacedEnglish = 0;
  function apply(sourceNode, targetNode, pathParts = []) {
    for (const [key, value] of Object.entries(sourceNode)) {
      const nextPath = [...pathParts, key];
      if (typeof value === "string") {
        const translated = authored[value]?.[language];
        if (!translated) continue;
        const keyPath = nextPath.join(".");
        if (!/^map\.(?:questMarkers|mapgenieCommunity|classTrainers|professionTrainers|repairVendors|questNpcs)\./.test(keyPath)) {
          throw new Error(`${language}/${value}: unexpected context ${keyPath}`);
        }
        found.set(value, found.get(value) + 1);
        if (targetNode[key] && targetNode[key] !== value && targetNode[key] !== translated) {
          throw new Error(`${language}/${value}: existing localized name conflicts at ${keyPath}`);
        }
        if (targetNode[key] === translated) continue;
        if (targetNode[key] === value) replacedEnglish += 1;
        else added += 1;
        targetNode[key] = translated;
      } else if (value && typeof value === "object") {
        targetNode[key] ??= Array.isArray(value) ? [] : {};
        apply(value, targetNode[key], nextPath);
      }
    }
  }
  apply(english, app);
  for (const [name, count] of found) if (!count) throw new Error(`${language}/${name}: no matching map field`);
  const output = JSON.stringify(app, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: Chinese map NPC fallbacks are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} missing fields and ${replacedEnglish} English names localized`);
}
