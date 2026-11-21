/** Capture ID and English-text-verified quest objectives from Wowhead tooltips. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasConflictingQuestObjectiveNumbers } from "./lib/quest-objective-numbers.mjs";
import { isEnglishQuestProseFallback } from "./lib/wowhead-quest-prose-page.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const localeDir = "public/data/locales/wow-forever";
const captureFile = join(root, "data/site-research/wowhead-quest-objective-captures.jsonl");
const errorFile = join(root, "data/site-research/wowhead-quest-objective-errors.jsonl");
const locales = { deDE: "de", esES: "es", esMX: "mx", frFR: "fr",
  koKR: "ko", ptBR: "pt", zhCN: "cn", zhTW: "tw" };
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Invalid option: ${arg}`);
  return [match[1], match[2]];
}));
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
const reader = options.reader === "true";
const rebuildOnly = options["rebuild-only"] === "true";
const concurrency = Number(options.concurrency ?? 16);
if (options.reader && !["true", "false"].includes(options.reader)) {
  throw new Error("--reader must be true or false");
}
if (options["rebuild-only"] && !["true", "false"].includes(options["rebuild-only"])) {
  throw new Error("--rebuild-only must be true or false");
}
if ((!rebuildOnly && !reader && (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy))) ||
  !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 24) {
  throw new Error("Pass --proxy=http://host:port or --reader=true and --concurrency=1..24");
}
const catalog = (await read("public/data/quests/quest-details.json")).quests;
const source = await read(`${localeDir}/quest-text-source.json`);
const sourceIndexes = new Map(source.keys.map((key, index) => [key, index]));
const fallbacks = (await read(`${localeDir}/quest-text-app-fallbacks.json`)).locales;
const manual = await read(`${localeDir}/quest-prose-wowhead.json`);
const packs = Object.fromEntries(await Promise.all(Object.keys(locales).map(async (locale) =>
  [locale, { client: await read(`${localeDir}/quest-text-${locale}.json`),
    prose: await read(`${localeDir}/quest-prose-wowhead-${locale}.json`) }])));
const needs = new Map();
for (const [id, quest] of Object.entries(catalog)) {
  const english = quest.objective;
  if (!english?.trim()) continue;
  const key = `${id}:objective`;
  const index = sourceIndexes.get(key);
  const missing = Object.keys(locales).filter((locale) => {
    const clientValue = index !== undefined && source.values[index] === english &&
      (packs[locale].client.values[index] || fallbacks[locale][key]);
    const client = clientValue && !isEnglishQuestProseFallback(clientValue, english) &&
      !hasConflictingQuestObjectiveNumbers(english, clientValue);
    const prose = (pack) => pack.quests[id]?.english?.objective === english &&
      pack.quests[id]?.locales?.[locale]?.objective &&
      !isEnglishQuestProseFallback(pack.quests[id].locales[locale].objective, english);
    return !client && !prose(manual) && !prose(packs[locale].prose);
  });
  if (missing.length) needs.set(id, { english, title: quest.title, missing });
}
const captured = new Map();
try {
  for (const line of (await readFile(captureFile, "utf8")).split(/\r?\n/)) {
    if (!line) continue;
    const record = JSON.parse(line);
    captured.set(`${record.id}:${record.locale}`, record);
  }
} catch (error) { if (error.code !== "ENOENT") throw error; }
const decode = (value) => value.replace(/&(?:nbsp|amp|quot|apos|lt|gt);|&#(?:x[0-9a-f]+|\d+);/gi,
  (entity) => {
    const named = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&apos;": "'",
      "&lt;": "<", "&gt;": ">" };
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    const number = lower.startsWith("&#x") ? parseInt(lower.slice(3, -1), 16)
      : parseInt(lower.slice(2, -1), 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
const normalize = (value) => value.replace(/\u00a0/g, " ").replace(/[’]/g, "'")
  .replace(/\s+/g, " ").trim();
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let nextReaderRequestAt = Date.now();
let readerRequestSequence = Promise.resolve();
const paceReader = () => {
  const operation = readerRequestSequence.then(async () => {
    const delay = Math.max(0, nextReaderRequestAt - Date.now());
    if (delay) await pause(delay);
    nextReaderRequestAt = Date.now() + 3_300;
  });
  readerRequestSequence = operation.catch(() => {});
  return operation;
};
const englishLetters = (value) => normalize(value).toLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, "");
const numbers = (value) => new Set((value.match(/\d+(?:[.,]\d+)?/g) ?? [])
  .map((number) => number.replace(",", ".")));
// Reviewed same-ID Wowhead objectives retain the same targets and order, but
// these localized pages still contain quantities from an older quest revision.
const reviewedNumberCorrections = {
  429: { locales: ["ptBR", "zhTW"], from: ["6"], to: ["3"] },
  484: { locales: ["esMX", "ptBR", "zhTW"], from: ["4"], to: ["6"] },
  490: { locales: ["zhTW"], from: ["20"], to: ["15"] },
  545: { locales: Object.keys(locales), from: ["6", "12"], to: ["6", "8"] },
  1057: { locales: ["esMX", "zhCN", "zhTW"], from: ["7", "7", "7", "7"],
    to: ["6", "6", "6", "6"] },
  92947: { locales: ["esES", "koKR", "ptBR", "zhCN"], from: ["8", "6", "6"],
    to: ["7", "7", "7"] },
  98069: { locales: ["deDE", "zhTW"], from: ["10"], to: ["8"] },
  98072: { locales: ["deDE", "esES", "frFR", "koKR", "zhTW"],
    from: ["10"], to: ["8"] },
};
const numberSequence = (value) => value.match(/\d+(?:[.,]\d+)?/g) ?? [];
const reviewedObjective = (id, locale, english, localized) => {
  const rule = reviewedNumberCorrections[id];
  if (!rule?.locales.includes(locale) ||
    numberSequence(english).join("|") !== rule.to.join("|") ||
    numberSequence(localized).join("|") !== rule.from.join("|")) return undefined;
  let index = 0;
  return localized.replace(/\d+(?:[.,]\d+)?/g, () => rule.to[index++]);
};
export function parseObjective(tooltip) {
  const table = /<\/table>\s*<table[^>]*>\s*<tr>\s*<td>\s*<br\s*\/?>([\s\S]*?)<\/td>/i.exec(tooltip)?.[1];
  if (!table) return undefined;
  const beforeRequirements = table.split(/<br\s*\/?>\s*<br\s*\/?>\s*<span[^>]*>/i)[0];
  const cleaned = decode(beforeRequirements.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?!name\b|class\b|race\b|gender\b)[a-z][^>]*>/gi, "")
    .replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim());
  return cleaned || undefined;
}
async function tooltip(id, locale) {
  const path = locale === "en" ? "" : `${locales[locale]}/`;
  const url = `https://nether.wowhead.com/forever/${path}tooltip/quest/${id}`;
  let page;
  if (reader) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await paceReader();
      const response = await fetch(`https://r.jina.ai/${url}`, {
        signal: AbortSignal.timeout(35_000), headers: { "X-Return-Format": "markdown" },
      });
      if (response.status === 429 || response.status >= 500) {
        await pause(response.status === 429 ? 60_000 : 5_000 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`Reader HTTP ${response.status}`);
      const text = await response.text();
      if (!text.includes(`URL Source: ${url}`)) throw new Error("Reader URL identity differs");
      const content = text.split(/Markdown Content:\r?\n/)[1]?.trim();
      if (!content) throw new Error("Reader tooltip missing");
      page = JSON.parse(content);
      break;
    }
    if (!page) throw new Error("Reader unavailable after retries");
  } else {
    const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail", "--compressed",
      "--proxy", proxy, "--retry", "1", "--max-time", "20", url],
    { maxBuffer: 250_000, timeout: 30_000 });
    page = JSON.parse(stdout);
  }
  if (typeof page.name !== "string" || typeof page.tooltip !== "string") throw new Error("Invalid tooltip");
  const objective = parseObjective(page.tooltip);
  if (!objective) throw new Error("Objective missing from tooltip");
  return { name: page.name.trim(), objective, url };
}
let writing = Promise.resolve();
const append = (path, value) => {
  const pending = writing.then(() => appendFile(path, `${JSON.stringify(value)}\n`));
  writing = pending.catch(() => {});
  return pending;
};
async function capture(queue) {
  let cursor = 0;
  let saved = 0;
  let failed = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (cursor < queue.length) {
      const { id, locale } = queue[cursor++];
      try {
        const record = { id, locale, ...await tooltip(id, locale), capturedAt: new Date().toISOString() };
        captured.set(`${id}:${locale}`, record);
        await append(captureFile, record);
        saved++;
      } catch (error) {
        failed++;
        await append(errorFile, { id, locale,
          error: error.stderr?.trim()?.slice(0, 180) ?? String(error) });
      }
      if ((saved + failed) % 500 === 0) console.log(`${saved + failed}/${queue.length}: ${saved} saved, ${failed} failed`);
    }
  }));
  console.log(`${saved}/${queue.length} captured, ${failed} failed`);
}
const englishQueue = [...needs.keys()].filter((id) => !captured.has(`${id}:en`))
  .map((id) => ({ id, locale: "en" }));
console.log(`${needs.size} quest objectives, ${englishQueue.length} English tooltip requests pending`);
if (!rebuildOnly) await capture(englishQueue);
const verified = [...needs].filter(([id, quest]) => {
  const record = captured.get(`${id}:en`);
  const titleMatches = record?.name === quest.title ||
    quest.title.startsWith(`${record?.name} (`);
  return titleMatches && record?.objective &&
    (normalize(record.objective) === normalize(quest.english) ||
      englishLetters(record.objective) === englishLetters(quest.english));
});
const verifiedIds = new Set(verified.map(([id]) => id));
const unverified = [...needs].filter(([id]) => !verifiedIds.has(id));
if (unverified.length) console.log(`Unverified English quest IDs: ${unverified.map(([id]) => id).join(", ")}`);
const localeQueue = verified.flatMap(([id, quest]) => quest.missing
  .filter((locale) => !captured.has(`${id}:${locale}`))
  .map((locale) => ({ id, locale })));
console.log(`${verified.length}/${needs.size} English identities verified, ${localeQueue.length} locale requests pending`);
if (!rebuildOnly) await capture(localeQueue);
for (const locale of Object.keys(locales)) {
  const quests = {};
  let numericMismatches = 0;
  let numericCorrections = 0;
  for (const [id, quest] of verified) {
    if (!quest.missing.includes(locale)) continue;
    const record = captured.get(`${id}:${locale}`);
    if (!record?.objective || isEnglishQuestProseFallback(record.objective, quest.english) ||
      normalize(record.objective) === normalize(quest.english) ||
      /\$[A-Za-z]/.test(record.objective)) continue;
    let localized = record.objective;
    const localizedNumbers = numbers(localized);
    if ([...numbers(quest.english)].some((number) => !localizedNumbers.has(number))) {
      localized = reviewedObjective(id, locale, quest.english, localized);
    }
    if (!localized) {
      numericMismatches++;
      continue;
    }
    if (localized !== record.objective) numericCorrections++;
    quests[id] = {
      sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
      localeUrls: { [locale]: `https://www.wowhead.com/forever/${locales[locale]}/quest=${id}` },
      tooltipUrls: { en: captured.get(`${id}:en`).url, [locale]: record.url },
      english: { objective: quest.english }, locales: { [locale]: { objective: localized } },
      ...(localized !== record.objective ? { numericCorrection: {
        wowhead: numberSequence(record.objective), current: numberSequence(quest.english),
      } } : {}),
    };
  }
  await writeFile(join(root, `${localeDir}/quest-objective-wowhead-${locale}.json`),
    JSON.stringify({ version: 1, quests }));
  console.log(`${locale}: ${Object.keys(quests).length} objectives; ` +
    `${numericCorrections} reviewed numeric corrections; ` +
    `${numericMismatches} outdated numeric values skipped`);
}
await import("./apply-reviewed-wowhead-objective-pages.mjs");
await import("./remove-reviewed-wowhead-objective-mismatches.mjs");
await import("./apply-wowhead-quest-objective-reuse.mjs");
