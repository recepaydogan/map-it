/** Capture matching Forever quest prose from localized Wowhead pages in resumable batches. */
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractWowheadQuestObjective, isEnglishQuestProseFallback,
  stripWowheadQuestChrome } from "./lib/wowhead-quest-prose-page.mjs";
import { hasConflictingQuestObjectiveNumbers } from "./lib/quest-objective-numbers.mjs";
import { jinaReaderConcurrency, jinaReaderHeaders,
  jinaReaderPaceMs } from "./lib/jina-reader-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => {
  const generated = /^public\/data\/locales\/wow-forever\/quest-prose-wowhead-[A-Za-z]+\.json$/.test(path);
  for (let attempt = 0; ; attempt++) {
    try { return JSON.parse(await readFile(join(root, path), "utf8")); }
    catch (error) {
      if (!generated || !(error instanceof SyntaxError) || attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
};
const output = join(root, "data/site-research/wowhead-quest-prose-captures.jsonl");
const catalog = (await read("public/data/quests/quest-details.json")).quests;
const reviewedVariants = await read(
  "data/quest-text-localization/reviewed-wowhead-source-variants.json");
if (reviewedVariants.version !== 1 || !reviewedVariants.entries ||
  Array.isArray(reviewedVariants.entries)) throw new Error("Invalid reviewed source variants");
for (const [key, variant] of Object.entries(reviewedVariants.entries)) {
  const match = /^(\d+):(description|progressText|completionText)$/.exec(key);
  const source = match && catalog[match[1]]?.[match[2]];
  const numbers = (value) => (value.match(/\d+/g) ?? []).sort().join("|");
  const variables = (value) => (value.match(/<[^>]+>/g) ?? []).sort().join("|");
  if (!source || variant.catalogEnglish !== source ||
    variant.sourceUrl !== `https://www.wowhead.com/forever/quest=${match[1]}` ||
    typeof variant.wowheadEnglish !== "string" || !variant.wowheadEnglish.trim() ||
    variant.wowheadEnglish === source ||
    numbers(variant.wowheadEnglish) !== numbers(source) ||
    variables(variant.wowheadEnglish) !== variables(source) ||
    typeof variant.reason !== "string" || !variant.reason.trim()) {
    throw new Error(`Invalid reviewed source variant: ${key}`);
  }
}
const existingPack = await read("public/data/locales/wow-forever/quest-prose-wowhead.json");
const fields = ["description", "progressText", "completionText"];
const locales = {
  deDE: { path: "de", headings: ["Beschreibung", "Fortschritt", "Vervollständigung"] },
  esES: { path: "es", headings: ["Descripción", "Progreso", "Terminación"] },
  esMX: { path: "mx", headings: ["Descripción", "Progreso", "Terminación"] },
  frFR: { path: "fr", headings: ["Description", "Progrès", "Achèvement"] },
  koKR: { path: "ko", headings: ["서술", "진행 상황", "완료"] },
  ptBR: { path: "pt", headings: ["Descrição", "Progresso", "Completo"] },
  zhCN: { path: "cn", headings: ["描述", "进度", "达成"] },
  zhTW: { path: "tw", headings: ["描述", "進度", "達成"] },
};
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Invalid option: ${arg}`);
  return [match[1], match[2]];
}));
for (const key of Object.keys(options)) {
  if (!["limit", "concurrency", "status-only", "language", "retry-source-unmatched", "ids"].includes(key)) {
    throw new Error(`Unknown option: ${key}`);
  }
}
const integer = (key, fallback, maximum) => {
  const value = Number(options[key] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid --${key}`);
  }
  return value;
};
const limit = integer("limit", 100, 10_000);
const concurrency = Math.min(integer("concurrency", 8, 16), jinaReaderConcurrency);
const selected = options.language;
if (selected && !locales[selected]) throw new Error(`Invalid --language: ${selected}`);
const retrySourceUnmatched = options["retry-source-unmatched"] === "true";
if (options["retry-source-unmatched"] && !["true", "false"].includes(options["retry-source-unmatched"])) {
  throw new Error("Invalid --retry-source-unmatched");
}
const selectedIds = options.ids ? new Set(options.ids.split(",")) : null;
if (selectedIds && [...selectedIds].some((id) => !/^\d+$/.test(id) || !catalog[id])) {
  throw new Error("Invalid --ids");
}
const localeEntries = Object.entries(locales).filter(([locale]) => !selected || locale === selected);
const generatedPacks = Object.fromEntries(await Promise.all(localeEntries.map(
  async ([locale]) => [locale, await read(
    `public/data/locales/wow-forever/quest-prose-wowhead-${locale}.json`)])));
const questTextSource = await read("public/data/locales/wow-forever/quest-text-source.json");
const questTextIndexes = new Map(questTextSource.keys.map((key, index) => [key, index]));
const questTextFallbacks = (await read(
  "public/data/locales/wow-forever/quest-text-app-fallbacks.json")).locales;
const clientPacks = Object.fromEntries(await Promise.all(localeEntries.map(
  async ([locale]) => [locale, await read(
    `public/data/locales/wow-forever/quest-text-${locale}.json`)])));
const objectivePacks = Object.fromEntries(await Promise.all(localeEntries.map(
  async ([locale]) => [locale, await read(
    `public/data/locales/wow-forever/quest-objective-wowhead-${locale}.json`)])));
const hasTranslation = (id, locale, field) => {
  const english = catalog[id]?.[field];
  if (!english) return false;
  for (const pack of [existingPack, generatedPacks[locale], objectivePacks[locale]]) {
    if (!pack.quests[id]?.regionalFallbackFields?.[field] &&
      pack.quests[id]?.english?.[field] === english &&
      pack.quests[id]?.locales?.[locale]?.[field] &&
      !isEnglishQuestProseFallback(pack.quests[id].locales[locale][field], english)) return true;
  }
  const index = questTextIndexes.get(`${id}:${field}`);
  if (index === undefined || questTextSource.values[index] !== english) return false;
  const localized = clientPacks[locale].values[index] ||
    questTextFallbacks[locale]?.[`${id}:${field}`];
  return Boolean(localized && !isEnglishQuestProseFallback(localized, english) &&
    localized !== english &&
    (field !== "objective" || !hasConflictingQuestObjectiveNumbers(english, localized)));
};
const done = new Set();
const latestRecords = new Map();
const reviewedVariantAttempts = new Set();
// Earlier mismatch records omitted the observed English sections, so they may
// represent a transient reader challenge. Retest and retain section evidence.
const legacySourceMismatchRetries = new Set([
  "280", "644", "771", "6128", "91899", "91900", "91904", "97916",
]);
let captureRecordCount = 0;
try {
  for (const line of (await readFile(output, "utf8")).split(/\r?\n/).filter(Boolean)) {
    captureRecordCount++;
    const record = JSON.parse(line);
    latestRecords.set(`${record.id}:${record.locale}`, record);
    for (const field of record.reviewedVariantAttemptedFields ?? []) {
      reviewedVariantAttempts.add(`${record.id}:${record.locale}:${field}`);
    }
    if (record.status === "source-mismatch" && !record.observedEnglish &&
      legacySourceMismatchRetries.has(String(record.id))) continue;
    if (record.status === "source-mismatch" &&
      record.observedEnglish?.progressText?.includes("\n| [](")) continue;
    done.add(`${record.id}:${record.locale}`);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const clean = (value) => value.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
  .replace(/\[([^\]]+)\]\(javascript:\)/g, "$1")
  .replace(/\*\*([^*]+)\*\*/g, "$1")
  .replace(/ {2,}\n/g, "\n").replace(/\r/g, "")
  .replace(/\n{3,}/g, "\n\n").trim();
const comparable = (value) => clean(value).replace(/&nbsp;|\u00a0/g, " ")
  .replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
// Some catalog prose loses only paragraph whitespace. All non-whitespace
// characters must still match the English Wowhead page in source-retry mode.
const compactComparable = (value) => comparable(value).replace(/\s+/g, "");
const matchesSource = (quest, field, source) => {
  if (compactComparable(source) === compactComparable(quest[field])) return true;
  const variant = reviewedVariants.entries[`${quest.id}:${field}`];
  return Boolean(variant && variant.catalogEnglish === quest[field] &&
    compactComparable(source) === compactComparable(variant.wowheadEnglish));
};
const section = (page, heading) => {
  const lines = page.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}` ||
    line === `## [${heading}](javascript:)`);
  if (start < 0) return undefined;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
  const value = clean(stripWowheadQuestChrome(body));
  return value || undefined;
};
const pageObjective = (page) => {
  const value = extractWowheadQuestObjective(page);
  return value ? clean(value) : undefined;
};
const numericValues = (value) => new Set((value.normalize("NFKC")
  .match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(",", ".")));
const wowheadUrl = (id, path = "") =>
  `https://www.wowhead.com/forever/${path ? `${path}/` : ""}quest=${id}`;
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
        signal: AbortSignal.timeout(45_000),
        headers: jinaReaderHeaders,
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
      const wait = response.status === 429 ? 60_000 : 5_000 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, wait));
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
const repeatCounts = new Map();
for (const quest of Object.values(catalog)) {
  for (const field of fields) {
    if (!quest[field]) continue;
    const signature = `${field}\0${quest.title}\0${quest[field]}`;
    repeatCounts.set(signature, (repeatCounts.get(signature) ?? 0) + 1);
  }
}
const needsField = (quest, locale, field) => {
  if (!quest[field]?.trim() || hasTranslation(quest.id, locale, field)) return false;
  const key = `${quest.id}:${locale}`;
  if (!retrySourceUnmatched) return !done.has(key);
  if (reviewedVariants.entries[`${quest.id}:${field}`] &&
    !reviewedVariantAttempts.has(`${quest.id}:${locale}:${field}`)) return true;
  const record = latestRecords.get(key);
  if (record?.status === "source-mismatch" && record.sourceParserVersion !== 2) {
    const observed = record.observedEnglish?.[field];
    if (observed && compactComparable(stripWowheadQuestChrome(observed)) ===
      compactComparable(quest[field])) return true;
  }
  return Boolean(record?.status === "captured" && !record.sourceRetryAttempted &&
    !record.english?.[field]);
};
const recoverableMismatchIds = new Set();
if (retrySourceUnmatched) {
  for (const quest of Object.values(catalog)) {
    if (localeEntries.some(([locale]) => {
      const record = latestRecords.get(`${quest.id}:${locale}`);
      return fields.some((field) => needsField(quest, locale, field) &&
        (reviewedVariants.entries[`${quest.id}:${field}`] ||
          (record?.status === "source-mismatch" &&
            record.sourceParserVersion !== 2)));
    })) recoverableMismatchIds.add(String(quest.id));
  }
}
const queue = Object.values(catalog).filter((quest) =>
  (!selectedIds || selectedIds.has(String(quest.id))) &&
  fields.some((field) => quest[field]?.trim()) &&
  localeEntries.some(([locale]) => fields.some((field) => needsField(quest, locale, field))))
  .sort((left, right) => {
    const mismatchPriority = Number(recoverableMismatchIds.has(String(right.id))) -
      Number(recoverableMismatchIds.has(String(left.id)));
    if (mismatchPriority) return mismatchPriority;
    const score = (quest) => fields.reduce((sum, field) => sum +
      (quest[field] ? repeatCounts.get(`${field}\0${quest.title}\0${quest[field]}`) ?? 1 : 0), 0);
    return score(right) - score(left) || Number(left.id) - Number(right.id);
  });
const seenProse = new Set();
const uniqueQueue = queue.filter((quest) => {
  const signature = `${quest.title}\0${fields.map((field) => quest[field] ?? "").join("\0")}`;
  if (seenProse.has(signature)) return false;
  seenProse.add(signature);
  return true;
});
console.log(`${uniqueQueue.length} unique quest prose sets pending; ` +
  `${captureRecordCount} locale capture records saved.`);
if (options["status-only"] === "true") process.exit(0);

let next = 0;
let saved = 0;
let matched = 0;
let failures = 0;
let finished = 0;
let writing = Promise.resolve();
const save = async (records) => {
  if (!records.length) return;
  const content = records.map((record) => JSON.stringify({ ...record,
    sourceParserVersion: 2 })).join("\n") + "\n";
  const operation = writing.then(() => appendFile(output, content));
  writing = operation.catch(() => {});
  await operation;
  saved += records.length;
  for (const record of records) done.add(`${record.id}:${record.locale}`);
};
async function capture(quest) {
  const wanted = localeEntries.filter(([locale]) =>
    fields.some((field) => needsField(quest, locale, field)));
  if (!wanted.length) return;
  const saveCapture = (records) => save(records.map((record) => ({ ...record,
    reviewedVariantAttemptedFields: fields.filter((field) =>
      reviewedVariants.entries[`${quest.id}:${field}`] &&
      needsField(quest, record.locale, field)),
  })));
  try {
    const sourceUrl = wowheadUrl(quest.id);
    const englishPage = await fetchPage(sourceUrl);
    const sourceSections = ["Description", "Progress", "Completion"].map((heading) =>
      section(englishPage, heading));
    if (sourceSections.every((source) => !source)) {
      throw new Error("English quest prose sections missing from reader page");
    }
    const english = Object.fromEntries(fields.flatMap((field, index) => {
      const source = sourceSections[index];
      return source && quest[field]?.trim() &&
        (retrySourceUnmatched ? matchesSource(quest, field, source) :
          comparable(source) === comparable(quest[field]))
        ? [[field, quest[field]]] : [];
    }));
    const englishObjective = pageObjective(englishPage);
    if (englishObjective && quest.objective?.trim() &&
      comparable(englishObjective) === comparable(quest.objective)) {
      english.objective = quest.objective;
    }
    if (!Object.keys(english).length) {
      await saveCapture(wanted.map(([locale]) => ({ id: quest.id, locale, sourceUrl,
        observedEnglish: Object.fromEntries(fields.flatMap((field, index) =>
          sourceSections[index] ? [[field, sourceSections[index]]] : [])),
        status: "source-mismatch", sourceRetryAttempted: retrySourceUnmatched,
        capturedAt: new Date().toISOString() })));
      return;
    }
    const records = await Promise.all(wanted.map(async ([locale, config]) => {
      const localeUrl = wowheadUrl(quest.id, config.path);
      try {
        const requestedEnglish = retrySourceUnmatched ?
          Object.fromEntries(Object.entries(english).filter(([field]) =>
            needsField(quest, locale, field))) : english;
        if (!Object.keys(requestedEnglish).length) {
          return { id: quest.id, locale, sourceUrl, localeUrl,
            observedEnglish: Object.fromEntries(fields.flatMap((field, index) =>
              sourceSections[index] ? [[field, sourceSections[index]]] : [])),
            status: "source-mismatch", sourceRetryAttempted: retrySourceUnmatched,
            capturedAt: new Date().toISOString() };
        }
        const page = await fetchPage(localeUrl);
        const translated = Object.fromEntries(fields.flatMap((field, index) => {
          if (!requestedEnglish[field]) return [];
          const value = section(page, config.headings[index]);
          return value && !isEnglishQuestProseFallback(value, requestedEnglish[field]) &&
            compactComparable(value) !==
            compactComparable(requestedEnglish[field]) &&
            !/\$[A-Za-z]/.test(value) ? [[field, value]] : [];
        }));
        const objective = requestedEnglish.objective && pageObjective(page);
        if (objective && comparable(objective) !== comparable(requestedEnglish.objective) &&
          !/\$[A-Za-z]/.test(objective) &&
          [...numericValues(requestedEnglish.objective)].every((number) =>
            numericValues(objective).has(number))) {
          translated.objective = objective;
        }
        matched += Object.keys(translated).length;
        return { id: quest.id, locale, sourceUrl, localeUrl, english: requestedEnglish,
          observedEnglish: Object.fromEntries(fields.flatMap((field, index) =>
            sourceSections[index] ? [[field, sourceSections[index]]] : [])),
          translated, status: "captured", sourceRetryAttempted: retrySourceUnmatched,
          capturedAt: new Date().toISOString() };
      } catch (error) {
        failures++;
        console.warn(`${quest.id}/${locale}: ${error.message}`);
        return undefined;
      }
    }));
    await saveCapture(records.filter(Boolean));
  } catch (error) {
    failures++;
    console.warn(`${quest.id}: ${error.message}`);
  }
}
const tasks = uniqueQueue.slice(0, limit);
await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
  while (next < tasks.length) {
    await capture(tasks[next++]);
    finished++;
    if (finished % 10 === 0) {
      console.log(`${finished}/${tasks.length} quest IDs, ${saved} pages, ${matched} fields`);
    }
  }
}));
console.log(`Saved ${saved} locale pages, ${matched} translated fields, ${failures} failures.`);
