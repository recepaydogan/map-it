/** Retry a verified English quest field when the localized Wowhead heading was missed. */
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasConflictingQuestObjectiveNumbers } from "./lib/quest-objective-numbers.mjs";
import { extractWowheadQuestObjective, isEnglishQuestProseFallback,
  stripWowheadQuestChrome } from "./lib/wowhead-quest-prose-page.mjs";
import { jinaReaderConcurrency, jinaReaderHeaders,
  jinaReaderPaceMs } from "./lib/jina-reader-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const output = join(root, "data/site-research/wowhead-quest-prose-captures.jsonl");
const catalog = (await read("public/data/quests/quest-details.json")).quests;
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Invalid option: ${arg}`);
  return [match[1], match[2]];
}));
for (const key of Object.keys(options)) if (!["language", "field", "ids", "limit", "concurrency",
  "status-only", "dry-run"].includes(key)) throw new Error(`Unknown option: ${key}`);
const locales = { deDE: { path: "de", headings: { description: "Beschreibung",
  progressText: "Fortschritt", completionText: "Vervollständigung" } },
esES: { path: "es", headings: { description: "Descripción", progressText: "Progreso",
  completionText: "Terminación" } },
esMX: { path: "mx", headings: { description: "Descripción", progressText: "Progreso",
  completionText: "Terminación" } },
frFR: { path: "fr", headings: { description: "Description", progressText: "Progrès",
  completionText: "Achèvement" } },
koKR: { path: "ko", headings: { description: "서술", progressText: "진행 상황",
  completionText: "완료" } },
ptBR: { path: "pt", headings: { description: "Descrição", progressText: "Progresso",
  completionText: "Completo" } },
zhCN: { path: "cn", headings: { description: "描述", progressText: "进度",
  completionText: "达成" } },
zhTW: { path: "tw", headings: { description: "描述", progressText: "進度",
  completionText: "達成" } } };
const locale = options.language;
const field = options.field;
const questFields = ["description", "objective", "progressText", "completionText"];
if (!locales[locale] || ![...questFields, "all"].includes(field)) {
  throw new Error("Pass a supported --language and --field");
}
const selectedFields = field === "all" ? questFields : [field];
const limit = Number(options.limit ?? 10);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid --limit");
const requestedConcurrency = Number(options.concurrency ?? (field === "all" ? 6 : 1));
if (!Number.isSafeInteger(requestedConcurrency) || requestedConcurrency < 1 ||
  requestedConcurrency > 8) {
  throw new Error("Invalid --concurrency");
}
const concurrency = Math.min(requestedConcurrency, jinaReaderConcurrency);
const selectedIds = options.ids ? new Set(options.ids.split(",")) : null;
if (selectedIds && [...selectedIds].some((id) => !/^\d+$/.test(id) || !catalog[id])) {
  throw new Error("Invalid --ids");
}
const records = (await readFile(output, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const matchingSource = new Map();
const attempted = new Set();
for (const record of records) {
  if (record.locale !== locale || !catalog[record.id]) continue;
  const id = String(record.id);
  for (const selectedField of selectedFields) {
    const sourceEnglish = record.english?.[selectedField];
    if (record.status === "captured" && typeof sourceEnglish === "string" &&
      sourceEnglish.trim() && sourceEnglish === catalog[id][selectedField]) {
      const sourceByField = matchingSource.get(id) ?? {};
      sourceByField[selectedField] = record;
      matchingSource.set(id, sourceByField);
    }
    if (record.targetRetryAttempted && record.attemptedFields?.includes(selectedField)) {
      attempted.add(`${id}:${selectedField}`);
    }
    // Source retries already fetched the same localized page with this parser.
    // A matched English field without localized text needs a new source, not
    // another identical target request.
    if (record.status === "captured" && record.sourceRetryAttempted &&
      record.sourceParserVersion === 2 && typeof sourceEnglish === "string" &&
      sourceEnglish === catalog[id][selectedField] &&
      !record.translated?.[selectedField]) {
      attempted.add(`${id}:${selectedField}`);
    }
  }
}
const directory = "public/data/locales/wow-forever";
const packs = await Promise.all(["quest-prose-wowhead", `quest-prose-wowhead-${locale}`,
  `quest-objective-wowhead-${locale}`].map((name) => read(`${directory}/${name}.json`)));
const questTextSource = await read(`${directory}/quest-text-source.json`);
const questTextIndex = new Map(questTextSource.keys.map((key, index) => [key, index]));
const client = await read(`${directory}/quest-text-${locale}.json`);
const appFallbacks = (await read(`${directory}/quest-text-app-fallbacks.json`)).locales[locale];
const hasTranslation = (id, selectedField, english) => {
  if (packs.some((pack) => !pack.quests[id]?.regionalFallbackFields?.[selectedField] &&
    pack.quests[id]?.english?.[selectedField] === english &&
    pack.quests[id]?.locales?.[locale]?.[selectedField] &&
    !isEnglishQuestProseFallback(pack.quests[id].locales[locale][selectedField], english))) return true;
  const key = `${id}:${selectedField}`;
  const index = questTextIndex.get(key);
  const localized = index !== undefined && questTextSource.values[index] === english &&
    (client.values[index] || appFallbacks?.[key]);
  return Boolean(localized && !isEnglishQuestProseFallback(localized, english));
};
const pending = [...matchingSource].flatMap(([id, sourceByField]) => {
  if (selectedIds && !selectedIds.has(id)) return [];
  const fields = selectedFields.filter((selectedField) =>
    sourceByField[selectedField] && !attempted.has(`${id}:${selectedField}`) &&
    !hasTranslation(id, selectedField, catalog[id][selectedField]));
  return fields.length ? [[id, { fields, sourceUrl: sourceByField[fields[0]].sourceUrl }]] : [];
}).sort(([left], [right]) => Number(left) - Number(right));
console.log(`${pending.length} ${locale} ${field} locale fields pending; ${records.length} captures saved.`);
if (options["status-only"] === "true") process.exit(0);

const clean = (value) => value.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
  .replace(/\[([^\]]+)\]\(javascript:\)/g, "$1")
  .replace(/\*\*([^*]+)\*\*/g, "$1")
  .replace(/ {2,}\n/g, "\n").replace(/\r/g, "")
  .replace(/\n{3,}/g, "\n\n").trim();
const comparable = (value) => clean(value).replace(/&nbsp;|\u00a0/g, " ")
  .replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
const compactComparable = (value) => comparable(value).replace(/\s+/g, "");
const numericValues = (value) => new Set((value.normalize("NFKC")
  .match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(",", ".")));
const objectiveNumbersMatch = (english, localized) =>
  !hasConflictingQuestObjectiveNumbers(english, localized) &&
  [...numericValues(english)].every((number) => numericValues(localized).has(number));
const section = (page, heading) => {
  const lines = page.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}` ||
    line === `## [${heading}](javascript:)`);
  if (start < 0) return undefined;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
  return clean(stripWowheadQuestChrome(body)) || undefined;
};
let nextRequestAt = Date.now();
let requestSequence = Promise.resolve();
const paceRequest = () => {
  const operation = requestSequence.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + jinaReaderPaceMs;
  });
  requestSequence = operation.catch(() => {});
  return operation;
};
const fetchPage = async (url) => {
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    await paceRequest();
    let response;
    try {
      response = await fetch(`https://r.jina.ai/${url}`, {
        signal: AbortSignal.timeout(45_000), headers: jinaReaderHeaders,
      });
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5_000 * (attempt + 1)));
      continue;
    }
    if (response.status === 403) {
      const body = await response.text();
      let issue;
      try { issue = JSON.parse(body); } catch { /* Other 403 responses remain errors. */ }
      const blockedUntil = /blocked until ([^()]+GMT[+-]\d{4})/
        .exec(issue?.message ?? "")?.[1];
      const resumeAt = blockedUntil ? Date.parse(blockedUntil) : NaN;
      if (issue?.status === 40305 && Number.isFinite(resumeAt) &&
        resumeAt > Date.now() && resumeAt - startedAt < 90 * 60_000) {
        console.warn(`Reader temporarily blocked until ${new Date(resumeAt).toISOString()}`);
        await new Promise((resolve) => setTimeout(resolve,
          Math.max(0, resumeAt - Date.now() + 2_000)));
        continue;
      }
      throw new Error("HTTP 403");
    }
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, response.status === 429 ?
        60_000 : 5_000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const page = await response.text();
    if (!page.includes(`URL Source: ${url}`) || !page.includes("Markdown Content:")) {
      throw new Error("Wowhead page identity missing");
    }
    return page;
  }
  throw new Error("Reader unavailable after retries");
};
let saved = 0;
let translated = 0;
let failures = 0;
let nextIndex = 0;
let recordWrites = Promise.resolve();
const selected = pending.slice(0, limit);
const capture = async ([id, { fields, sourceUrl }]) => {
  const localeUrl = `https://www.wowhead.com/forever/${locales[locale].path}/quest=${id}`;
  try {
    const page = await fetchPage(localeUrl);
    const english = {};
    const localized = {};
    for (const selectedField of fields) {
      english[selectedField] = catalog[id][selectedField];
      const raw = selectedField === "objective" ?
        extractWowheadQuestObjective(page) :
        section(page, locales[locale].headings[selectedField]);
      const value = selectedField === "objective" && raw ? clean(raw) : raw;
      if (value && !isEnglishQuestProseFallback(value, english[selectedField]) &&
        compactComparable(value) !== compactComparable(english[selectedField]) &&
        !/\$[A-Za-z]/.test(value) && value.length <= 30_000 &&
        (selectedField !== "objective" ||
          objectiveNumbersMatch(english[selectedField], value))) {
        localized[selectedField] = value;
      }
    }
    const record = { id, locale, sourceUrl, localeUrl,
      english, translated: localized,
      status: "captured", targetRetryAttempted: true, attemptedFields: fields,
      capturedAt: new Date().toISOString() };
    if (options["dry-run"] === "true") console.log(JSON.stringify(record));
    else {
      const write = recordWrites.then(() => appendFile(output, `${JSON.stringify(record)}\n`));
      recordWrites = write.catch(() => {});
      await write;
    }
    saved++;
    translated += Object.keys(localized).length;
  } catch (error) {
    failures++;
    console.warn(`${id}/${locale}/${field}: ${error.message}`);
  }
};
await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, async () => {
  while (nextIndex < selected.length) await capture(selected[nextIndex++]);
}));
console.log(`Saved ${saved} locale pages, ${translated} translated fields, ${failures} failures.`);
