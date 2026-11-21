/** Translate app-authored launch prose, retaining official native names and exact numbers. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEnv } from "vite";
const directory = "data/site-research/wowhead-check-2026-11-04/localization";
const file = `${directory}/inventory.json`;
const inventory = JSON.parse(await readFile(file, "utf8"));
const naturalNumbers = process.argv.includes("--natural-numbers");
if (naturalNumbers) for (const e of inventory.entries) for (const language of ["ko", "zh-Hans", "zh-Hant"]) {
  if (e.origins[language] === "DeepL-app-prose-with-native-terms" && !e.kinds.includes("name")) {
    delete e.translations[language]; delete e.origins[language];
  }
}
const env = loadEnv("production", process.cwd(), "");
const key = process.env.DEEPL_API_KEY || env.DEEPL_API_KEY;
if (!key) throw new Error("DeepL credential is unavailable");
const targets = { de: "DE", es: "ES-ES", "es-MX": "ES-419", fr: "FR", ko: "KO", "pt-BR": "PT-BR", "zh-Hans": "ZH-HANS", "zh-Hant": "ZH-HANT" };
const escapeXml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const decodeXml = (text) => text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const numeric = (text) => (text.replace(/<[^>]*>/g, "").replace(/\d{1,2}(?=\s*(?:월|月))/g, "").match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", "."))).sort((a, b) => a - b).join("|");
const prepare = (entry, language) => {
  const terms = Object.entries(inventory.terms[language]).filter(([en, text]) => en.length >= 4 && text && text !== en).sort((a, b) => b[0].length - a[0].length);
  const pattern = new RegExp(`(?<![A-Za-z])(?:${terms.map(([en]) => escapeRegex(en)).join("|")})(?![A-Za-z])${naturalNumbers ? "" : "|\\d+(?:[.,]\\d+)?"}|\\{\\{[^{}]+\\}\\}`, "g");
  const replacements = new Map(terms);
  const tokens = [];
  const mark = (text) => {
    let result = "", start = 0;
    for (const match of text.matchAll(pattern)) {
      result += escapeXml(text.slice(start, match.index));
      const i = tokens.length; tokens.push(replacements.get(match[0]) ?? match[0]);
      result += `<g id="${i}">${escapeXml(match[0])}</g>`; start = match.index + match[0].length;
    }
    return result + escapeXml(text.slice(start));
  };
  const isHtml = entry.kinds.includes("guide-html");
  const text = isHtml ? entry.text.split(/(<[^>]+>)/g).map((part) => part.startsWith("<") ? part : mark(decodeXml(part))).join("") : `<text>${mark(entry.text)}</text>`;
  return { text, tokens, isHtml };
};
const restore = (text, prepared) => {
  const seen = new Set();
  const result = text.replace(/<g id="(\d+)">[\s\S]*?<\/g>/g, (_, raw) => {
    const i = Number(raw);
    if (prepared.tokens[i] === undefined) throw new Error(`Changed protected token ${raw}`);
    seen.add(i); return prepared.isHtml ? escapeXml(prepared.tokens[i]) : prepared.tokens[i];
  });
  if (prepared.tokens.some((value) => ![...seen].some((i) => prepared.tokens[i] === value)) || /<\/?g\b/.test(result)) throw new Error("Lost protected token");
  return prepared.isHtml ? result : decodeXml(result.replace(/^\s*<text>/, "").replace(/<\/text>\s*$/, "")).trim();
};
const save = () => writeFile(file, `${JSON.stringify(inventory, null, 2)}\n`);
const cached = new Map();
const prefix = naturalNumbers ? "deepl-natural-" : "deepl-";
for (const filename of (await readdir(directory)).filter((f) => f.startsWith(prefix) && (naturalNumbers || !f.startsWith("deepl-natural-")) && f.endsWith(".json"))) {
  const raw = JSON.parse(await readFile(`${directory}/${filename}`, "utf8"));
  const language = Object.keys(targets).sort((a, b) => b.length - a.length).find((l) => filename.startsWith(`${prefix}${l}-`));
  if (language) raw.keys.forEach((key, i) => cached.set(`${language}:${key}`, raw.response.translations[i].text));
}
const review = [];
for (const [language, target_lang] of Object.entries(targets)) {
  for (const namesOnly of [true, false]) {
    const pending = inventory.entries.filter((e) => !e.translations[language] && e.kinds.includes("name") === namesOnly);
    for (let start = 0; start < pending.length; start += 35) {
      const batch = pending.slice(start, start + 35);
      const prepared = batch.map((e) => namesOnly ? { text: `<text>${escapeXml(e.text)}</text>`, tokens: [], isHtml: false } : prepare(e, language));
      let result;
      if (batch.every((e) => cached.has(`${language}:${e.key}`))) result = { translations: batch.map((e) => ({ text: cached.get(`${language}:${e.key}`) })) };
      else {
      const response = await fetch("https://api-free.deepl.com/v2/translate", {
        method: "POST", headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: prepared.map((p) => p.text), source_lang: "EN", target_lang,
          tag_handling: "xml", tag_handling_version: "v2", ignore_tags: ["g"],
          context: "World of Warcraft Forever class talents, ability tooltips and practical class guides. Use precise game terminology. Preserve mechanics and negations. Energy, Rage, Focus and Mana are resources. Tier means a row in a talent tree. Words and numbers in g tags are protected native game terms. Translate prose naturally for a player; do not add advice or change numbers.",
        }),
      });
      if (!response.ok) throw new Error(`${language}: translation HTTP ${response.status}`);
      result = await response.json();
      }
      if (result.translations?.length !== batch.length) throw new Error("Translation count changed");
      const batchKey = createHash("sha256").update(batch.map((e) => e.key).join("|")).digest("hex").slice(0, 12);
      await writeFile(`${directory}/${prefix}${language}-${namesOnly ? "names" : "prose"}-${batchKey}.json`, JSON.stringify({ keys: batch.map((e) => e.key), response: result }, null, 2));
      for (let i = 0; i < batch.length; i++) {
        try {
        const text = restore(result.translations[i].text, prepared[i]);
        if (!text || numeric(text) !== numeric(batch[i].text) || /\$[A-Za-z?{]/.test(text)) throw new Error(`${language}: unsafe translation ${batch[i].key}`);
        batch[i].translations[language] = text; batch[i].origins[language] = naturalNumbers ? "DeepL-prose-native-terms-reviewed-numbers" : "DeepL-app-prose-with-native-terms";
        if (namesOnly) inventory.terms[language][batch[i].text] = text;
        } catch (error) { review.push({ language, key: batch[i].key, english: batch[i].text, raw: result.translations[i].text, error: error.message }); }
      }
      await save(); console.log(`${language}: ${namesOnly ? "names" : "prose"} ${Math.min(start + batch.length, pending.length)}/${pending.length}`);
    }
  }
}
await writeFile(`${directory}/prose-review-needed.json`, `${JSON.stringify(review, null, 2)}\n`);
console.log(`Segments requiring explicit review: ${review.length}`);
