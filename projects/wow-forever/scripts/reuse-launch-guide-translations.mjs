/** Reuse exact reviewed sentences and current native talent descriptions. */
import { readFile, writeFile } from "node:fs/promises";
const dir = "data/site-research/wowhead-check-2026-11-04/localization";
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const inventory = await read(`${dir}/inventory.json`);
inventory.entries = inventory.entries.filter((e) => e.text.trim());
const segment = (text, language) => [...new Intl.Segmenter(language, { granularity: "sentence" }).segment(text)].map((e) => e.segment.trim()).filter(Boolean);
const canonical = (s) => s.replace(/[.!?。！？]+$/, "").replace(/\s+/g, " ").trim();
const numbers = (s) => (s.replace(/\d{1,2}(?=\s*(?:월|月))/g, "").match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", "."))).sort((a, b) => a - b).join("|");
const summaries = {};
for (const language of Object.keys(inventory.languages)) {
  const sentences = new Map();
  const addPair = (en, text) => {
    if (!text || !en || en === text) return;
    sentences.set(canonical(en), text);
    const a = segment(en, "en"), b = segment(text, language);
    if (a.length === b.length) a.forEach((s, i) => {
      if (numbers(s) === numbers(b[i])) sentences.set(canonical(s), b[i]);
    });
  };
  for (const e of inventory.entries) addPair(e.text, e.translations[language]);
  for (const cls of ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"]) {
    const pack = await read(`public/data/classes/guides/locales/${language}/${cls}.json`);
    for (const e of pack.edits) addPair(e.source, e.text);
  }
  const writeupSource = await read("public/data/spells/writeups/locales/source.json");
  const writeup = await read(`public/data/spells/writeups/locales/${language}.json`);
  writeupSource.strings.forEach((s, i) => addPair(s, writeup.values[i]));
  const connectors = { de: "Außerdem: ", es: "Además: ", "es-MX": "Además: ", fr: "De plus : ", ko: "추가 효과: ", "pt-BR": "Além disso: ", "zh-Hans": "此外：", "zh-Hant": "此外：" };
  function resolve(s, depth = 0) {
    if (depth > 3) return undefined;
    if (sentences.has(canonical(s))) return sentences.get(canonical(s));
    const prefixed = /^([^:]+):\s*(.+)$/.exec(s);
    if (prefixed && inventory.terms[language][prefixed[1]]) {
      const description = resolve(prefixed[2], depth + 1);
      if (description) return `${inventory.terms[language][prefixed[1]]}: ${description}`;
    }
    if (s.startsWith("Additionally, ")) {
      const next = resolve(s.slice(14), depth + 1); if (next) return connectors[language] + next;
    }
    const parts = segment(s, "en");
    if (parts.length > 1) {
      const translated = parts.map((p) => resolve(p, depth + 1));
      if (translated.every(Boolean)) return translated.join(/^zh/.test(language) ? "" : " ");
    }
    return undefined;
  }
  let reused = 0;
  for (const e of inventory.entries) if (!e.translations[language]) {
    const value = resolve(e.text);
    if (value) { e.translations[language] = value; e.origins[language] = "existing-exact-sentences-or-native-composition"; reused++; }
  }
  summaries[language] = { reused, pending: inventory.entries.filter((e) => !e.translations[language]).length };
}
await writeFile(`${dir}/inventory.json`, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(JSON.stringify(summaries));
