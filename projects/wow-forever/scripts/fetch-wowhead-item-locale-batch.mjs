/** Capture missing item names from Wowhead Forever in resumable batches. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "data/site-research/wowhead-item-locale-captures.jsonl");
const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (!match) throw new Error(`Invalid option: ${argument}`);
  return [match[1], match[2]];
}));
const allowed = new Set(["proxy", "limit", "concurrency", "id-concurrency",
  "status-only", "retry-unavailable"]);
for (const key of Object.keys(options)) {
  if (!allowed.has(key)) throw new Error(`Unknown option: ${key}`);
}
const statusOnly = options["status-only"] === "true";
if (options["status-only"] && !["true", "false"].includes(options["status-only"])) {
  throw new Error("--status-only must be true or false");
}
const retryUnavailable = options["retry-unavailable"] === "true";
if (options["retry-unavailable"] &&
  !["true", "false"].includes(options["retry-unavailable"])) {
  throw new Error("--retry-unavailable must be true or false");
}
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (!statusOnly && (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy))) {
  throw new Error("Pass --proxy=http://host:port or set HTTPS_PROXY");
}
const numberOption = (key, fallback, maximum) => {
  const value = Number(options[key] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid --${key}: ${options[key]}`);
  }
  return value;
};
const limit = numberOption("limit", 25, 1000);
const concurrency = numberOption("concurrency", 4, 8);
const idConcurrency = numberOption("id-concurrency", 2, 4);
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const catalog = JSON.parse(await readFile(join(root, "public/data/items/catalog.json"), "utf8"));
const source = JSON.parse(await readFile(join(root,
  "public/data/locales/wow-forever/source.json"), "utf8"));
const sourceIndex = new Map(source.keys.map((key, index) => [key, index]));
const aliases = JSON.parse(await readFile(join(root,
  "data/item-name-localization/reviewed-wowhead-source-aliases.json"), "utf8"));
if (aliases.version !== 1 || !aliases.items) throw new Error("Invalid item source aliases");
const sameName = (left, right) =>
  left.normalize("NFKC").toLocaleLowerCase("en-US") ===
  right.normalize("NFKC").toLocaleLowerCase("en-US");
const matchesSource = (item, name) => sameName(name, item.name) ||
  (aliases.items[item.id]?.catalogName === item.name &&
    aliases.items[item.id]?.wowheadName === name);
const packs = Object.fromEntries(await Promise.all(Object.entries(locales).map(
  async ([locale, gameLocale]) => [locale, JSON.parse(await readFile(join(root,
    `public/data/locales/wow-forever/${gameLocale}.json`), "utf8"))])));
const captured = new Map();
const unavailable = JSON.parse(await readFile(join(root,
  "data/site-research/wowhead-item-unavailable.json"), "utf8"));
if (unavailable.version !== 1 || !unavailable.entries) {
  throw new Error("Invalid unavailable item catalog");
}
try {
  for (const line of (await readFile(output, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    captured.set(`${record.locale}:${record.id}`, record);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const queue = catalog.items.flatMap((item) => {
  const index = sourceIndex.get(`ItemSparse:${item.id}:4`);
  const needed = Object.entries(packs).filter(([, pack]) =>
    index === undefined || !pack.values[index] || pack.values[index] === source.values[index])
    .map(([locale]) => locale);
  if (!needed.length) return [];
  const english = captured.get(`en:${item.id}`);
  if (english && !matchesSource(item, english.name)) return [];
  const pending = ["en", ...needed].filter((locale) =>
    !captured.has(`${locale}:${item.id}`) &&
    (retryUnavailable || !unavailable.entries[`${item.id}:${locale}`]));
  return pending.length ? [{ item, pending }] : [];
});
console.log(`${queue.length} item IDs pending; fetching at most ${limit}.`);
if (statusOnly) process.exit(0);

async function fetchTooltip(id, locale, edition = "forever") {
  const localePath = locale === "en" ? "" : `${locale}/`;
  const url = `https://nether.wowhead.com/${edition}/${localePath}tooltip/item/${id}`;
  const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail",
    "--compressed", "--proxy", proxy, "--retry", "2", "--retry-delay", "1",
    "--max-time", "30", url], { maxBuffer: 200_000, timeout: 100_000 });
  const page = JSON.parse(stdout);
  if (typeof page.name !== "string" || !page.name.trim() ||
    typeof page.tooltip !== "string" || !page.tooltip) {
    throw new Error(`Invalid tooltip response: ${id}/${locale}`);
  }
  return { kind: "item", id: Number(id), locale, url, name: page.name,
    tooltip: page.tooltip, capturedAt: new Date().toISOString() };
}

let saved = 0;
let mismatched = 0;
let failed = 0;
let classicFallback = 0;
const classicEnglish = new Map();
async function fetchWithFallback(item, locale) {
  try {
    return await fetchTooltip(item.id, locale);
  } catch (foreverError) {
    try {
      let english = classicEnglish.get(item.id);
      if (!english) {
        english = await fetchTooltip(item.id, "en", "classic");
        classicEnglish.set(item.id, english);
      }
      if (!sameName(english.name, item.name)) {
        throw new Error("Classic English name differs from item catalog");
      }
      const record = locale === "en" ? english :
        await fetchTooltip(item.id, locale, "classic");
      classicFallback++;
      return record;
    } catch (classicError) {
      throw new Error(`Forever: ${foreverError.message}; Classic: ${classicError.message}`);
    }
  }
}
let writing = Promise.resolve();
async function save(records) {
  if (!records.length) return;
  const operation = writing.then(() => appendFile(output,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n"));
  writing = operation.catch(() => {});
  await operation;
  for (const record of records) captured.set(`${record.locale}:${record.id}`, record);
  saved += records.length;
}
async function fetchItem({ item, pending }) {
  try {
    const english = captured.get(`en:${item.id}`) ??
      await fetchWithFallback(item, "en");
    if (pending.includes("en")) await save([english]);
    if (!matchesSource(item, english.name)) {
      mismatched++;
      console.log(`${item.id}: Wowhead English name differs from item catalog`);
      return;
    }
    const missingLocales = pending.filter((locale) => locale !== "en");
    const records = new Array(missingLocales.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, missingLocales.length) },
      async () => {
        while (next < missingLocales.length) {
          const index = next++;
          const locale = missingLocales[index];
          try {
            records[index] = await fetchWithFallback(item, locale);
          } catch (error) {
            failed++;
            console.warn(`${item.id}/${locale}: ${error.message}`);
          }
        }
      }));
    await save(records.filter(Boolean));
  } catch (error) {
    failed++;
    console.warn(`${item.id}: ${error.message}`);
  }
}
const tasks = queue.slice(0, limit);
let nextItem = 0;
await Promise.all(Array.from({ length: Math.min(idConcurrency, tasks.length) }, async () => {
  while (nextItem < tasks.length) await fetchItem(tasks[nextItem++]);
}));
console.log(`Saved ${saved} records; ${classicFallback} Classic fallbacks; ` +
  `${mismatched} English name mismatches; ${failed} failed requests.`);
