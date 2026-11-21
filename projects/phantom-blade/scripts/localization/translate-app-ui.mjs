/** Translate app-authored UI only. Gameplay text always comes from the installed locres packs. */
import fs from "node:fs";
import path from "node:path";
import { flatten, setPath, validTranslation, canonicalText } from "./ui-locale-utils.mjs";

const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); };
const sourcePath = "src/i18n/locales/en.json";
const source = flatten(read(sourcePath));
const manifest = read("public/data/locales/phantom-blade-zero/manifest.json");
const overrides = read("data/localization/ui-context-overrides.json");
const requested = process.argv.find(arg => arg.startsWith("--language="))?.split("=")[1];
const skipped = new Set(process.argv.find(arg => arg.startsWith("--skip="))?.split("=")[1]?.split(",") ?? []);
const repairIdentical = process.argv.includes("--repair-identical");
const reuseRoots = ["../wow-forever-map", "../aion 2", "../PZ", "../baldurs-gate-map", "../ER", "../minecraft-map", "../Valheim"];
const englishGame = read("public/data/locales/phantom-blade-zero/source.json");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const protectedPattern = /{{[^}]+}}|Phantom Blade Interactive Map|Phantom Blade Zero Map|Phantom Blade Zero|Overwolf|Discord|Google|Sha-Chi/g;
const context = {
  "wiki.upgradeStep": "Upgrade step {{step}}",
  "wiki.nativeIdentifier": "Game file identifier",
  "wiki.fields.ShachiAttack": "Sha-Chi attack",
  "wiki.fields.ShachiRegen": "Sha-Chi regeneration",
  "wiki.marker.varies": "Variable quantity",
  "map.filters.found": "Found locations",
};
const unchanged = value => !/\p{L}/u.test(value.replace(/{{[^}]+}}/g, "")) || /^(?:Overwolf|Discord|Google|Phantom Blade Zero(?: Map)?|PBZ|HP|MP|XP|NPC|DPS|ID|UI|OK|Ctrl|Shift|Alt|Tab|Esc|F\d+|[A-Z]\d*|N\/A)$/u.test(value);
const sharedWords = new Set(["PvP", "PvE", "MPMax", "HPMax", "Ctrl K", "Ctrl+Shift+D", "Ctrl+Shift+A", "Sha-Chi", "Dia", "NPCs", "Asia (AS)"]);
const sameWords = {
  de: ["Talent", "Aura", "Alternative", "Details", "Server", "Horde", "Quests", "Paladin", "Neutral", "Sets", "Orange", "Finger", "Robe", "Name", "Normal", "Region", "Optional", "Regeneration", "Bots", "(Optional)", "Material", "Outfit", "Portal"],
  fr: ["Guides", "Faction", "Aura", "Alternative", "Alliance", "Horde", "Mage", "Paladin", "Potions", "Destination", "Danger", "Talents", "Source", "Orange", "Sources", "Tabard", "Bracelets", "Service", "Destinations", "Exploration", "Collections", "Bots", "Missions", "Ascension", "Raids", "Unique", "Terrain", "Configuration", "Introduction", "Technique", "Inscription", "Pages"],
  es: ["Bases", "Portal"], "es-419": ["Bases", "Portal"], it: ["Aura", "Dungeon", "Server", "Puzzle"], "pt-BR": ["Aura", "Bases", "Portal"], pt: ["Aura", "Bases", "Portal", "Chance", "Robe"], vi: ["Druid", "Email", "Tabard"],
};

async function translateBatch(language, entries, attempt = 0) {
  const parts = entries.map(([key, english], i) => {
    const original = context[key] ?? english;
    const fragments = original.match(protectedPattern) ?? [];
    let cursor = 0;
    return { key, english, fragments, text: `__PBZ_${String(i).padStart(4, "0")}__\n${original.replace(protectedPattern, () => `<x id="${String.fromCharCode(65 + cursor++)}"/>`)}` };
  });
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  const target = ({ "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", "es-419": "es", pt: "pt-PT" })[language] ?? language;
  const query = entries.length === 1 ? parts[0].text.replace(/^__PBZ_\d{4}__\n/, "") : parts.map(part => part.text).join("\n");
  for (const [key, value] of Object.entries({ client: "gtx", sl: "en", tl: target, dt: "t", q: query })) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (response.status === 429) {
      if (attempt >= 4) throw new Error("Translation service rate limit; retry later without changing endpoint.");
      const delay = Math.max(10, Number(response.headers.get("retry-after")) || 0) * 1000;
      await wait(Math.min(60000, delay * (attempt + 1)));
      return translateBatch(language, entries, attempt + 1);
    }
    if (!response.ok) throw new Error(`UI translation HTTP ${response.status}`);
    const data = await response.json();
    const output = data[0].map(row => row[0]).join("");
    const rows = entries.length === 1 ? new Map([[0, output.trim()]]) : new Map([...output.matchAll(/__PBZ_(\d{4})__\s*([\s\S]*?)(?=__PBZ_\d{4}__|$)/g)].map(match => [Number(match[1]), match[2].trim()]));
    if (rows.size !== entries.length) throw new Error("Translation batch markers changed");
    return parts.map((part, i) => {
      const value = rows.get(i).replace(/<x\s+id\s*=\s*["']([A-Z])["']\s*\/?\s*>/gi, (_, token) => part.fragments[token.toUpperCase().charCodeAt(0) - 65] ?? "");
      if (!validTranslation(part.english, value) || /<x\s|__PBZ_/i.test(value)) throw new Error(`Invalid UI placeholders: ${part.key}`);
      return [part.key, { source: part.english, value, method: "contextual-ui-translation" }];
    });
  } catch (error) {
    if (entries.length > 1 && attempt < 3) {
      const middle = Math.ceil(entries.length / 2);
      return [...await translateBatch(language, entries.slice(0, middle), attempt + 1), ...await translateBatch(language, entries.slice(middle), attempt + 1)];
    }
    if (attempt < 3) { await wait(1500 * (attempt + 1)); return translateBatch(language, entries, attempt + 1); }
    throw error;
  }
}

for (const { language, code } of manifest.locales) {
  if (language === "en" || skipped.has(language) || requested && requested !== language) continue;
  const cachePath = `artifacts/localization-2026-10-29/ui-cache/${language}.json`;
  const cache = fs.existsSync(cachePath) ? read(cachePath) : {};
  const byKey = new Map(), byEnglish = new Map();
  for (const root of reuseRoots) {
    const locale = language === "es-419" ? fs.existsSync(`${root}/src/i18n/locales/es-419.json`) ? "es-419" : "es-MX" : language;
    const enFile = `${root}/src/i18n/locales/en.json`, file = `${root}/src/i18n/locales/${locale}.json`;
    if (!fs.existsSync(enFile) || !fs.existsSync(file)) continue;
    const oldSource = flatten(read(enFile)), translated = flatten(read(file));
    for (const [key, english] of Object.entries(oldSource)) {
      const value = translated[key];
      if (!validTranslation(english, value) || value === english && !unchanged(english)) continue;
      if (source[key] === english) byKey.set(key, byKey.get(key) ?? value);
      byEnglish.set(english, byEnglish.get(english) ?? value);
    }
  }
  const gameValues = read(`public/data/locales/phantom-blade-zero/${code}.json`).values;
  const nativeTexts = new Map(), conflicts = new Set();
  englishGame.values.forEach((english, i) => {
    if (!english || !gameValues[i]) return;
    const key = canonicalText(english), prior = nativeTexts.get(key);
    if (prior && prior !== gameValues[i]) conflicts.add(key);
    else nativeTexts.set(key, gameValues[i]);
  });
  for (const key of conflicts) nativeTexts.delete(key);
  const values = {}, methods = {}, pending = [];
  for (const [key, english] of Object.entries(source)) {
    let value, method;
    if (overrides[key]?.[language]) { value = overrides[key][language]; method = "reviewed-context"; }
    else if (/^(?:map\.maps\.names\.|wiki\.nativeValues\.|wiki\.weapon\.resources\.)/.test(key) && nativeTexts.has(canonicalText(english))) { value = nativeTexts.get(canonicalText(english)); method = "game-locres"; }
    else if (byKey.has(key)) { value = byKey.get(key); method = "same-ui-key-and-source"; }
    else if (byEnglish.has(english)) { value = byEnglish.get(english); method = "same-ui-copy"; }
    else if (unchanged(english)) { value = english; method = "invariant"; }
    else if (cache[key]?.source === english && validTranslation(english, cache[key].value)) { value = cache[key].value; method = cache[key].method; }
    else { pending.push([key, english]); continue; }
    if (repairIdentical && value === english && !unchanged(english) && !sharedWords.has(english) && !(sameWords[language] ?? []).includes(english) && method !== "game-locres") { pending.push([key, english]); continue; }
    values[key] = value; methods[key] = method;
  }
  console.log(`${language}: ${Object.keys(values).length} reusable/reviewed, ${pending.length} UI strings to translate`);
  const batches = []; let batch = [], size = 0;
  for (const entry of pending) {
    if (batch.length && (batch.length >= (repairIdentical ? 1 : 30) || size + entry[1].length > 2800)) { batches.push(batch); batch = []; size = 0; }
    batch.push(entry); size += entry[1].length;
  }
  if (batch.length) batches.push(batch);
  for (let i = 0; i < batches.length; i++) {
    const translated = await translateBatch(language, batches[i]);
    for (const [key, record] of translated) { cache[key] = record; values[key] = record.value; methods[key] = record.method; }
    write(cachePath, cache);
    if (i % 5 === 0 || i === batches.length - 1) console.log(`${language}: batch ${i + 1}/${batches.length}`);
    await wait(250);
  }
  const locale = {};
  for (const [key, english] of Object.entries(source)) {
    if (!validTranslation(english, values[key])) throw new Error(`Missing/invalid app translation ${language}:${key}`);
    setPath(locale, key, values[key]);
  }
  write(`src/i18n/locales/${language}.json`, locale);
  write(`artifacts/localization-2026-10-29/ui-methods/${language}.json`, methods);
  console.log(`${language}: wrote ${Object.keys(values).length} UI translations`);
}
