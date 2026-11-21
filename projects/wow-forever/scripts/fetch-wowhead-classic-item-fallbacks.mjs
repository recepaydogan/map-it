/** Try Classic item names where Forever returned English or a conflicting source name. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => readFile(join(root, path), "utf8");
const output = join(root, "data/site-research/wowhead-classic-item-fallbacks.jsonl");
const errorOutput = join(root, "data/site-research/wowhead-classic-item-errors.jsonl");
const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (!match) throw new Error(`Invalid option: ${argument}`);
  return [match[1], match[2]];
}));
const allowed = new Set(["proxy", "limit", "concurrency", "status-only", "retry-failed"]);
for (const key of Object.keys(options)) {
  if (!allowed.has(key)) throw new Error(`Unknown option: ${key}`);
}
const statusOnly = options["status-only"] === "true";
if (options["status-only"] && !["true", "false"].includes(options["status-only"])) {
  throw new Error("--status-only must be true or false");
}
const retryFailed = options["retry-failed"] === "true";
if (options["retry-failed"] && !["true", "false"].includes(options["retry-failed"])) {
  throw new Error("--retry-failed must be true or false");
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
const concurrency = numberOption("concurrency", 6, 12);
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const catalog = JSON.parse(await read("public/data/items/catalog.json"));
const source = JSON.parse(await read("public/data/locales/wow-forever/source.json"));
const sourceIndex = new Map(source.keys.map((key, index) => [key, index]));
const packs = Object.fromEntries(await Promise.all(Object.entries(locales).map(
  async ([locale, gameLocale]) => [locale, JSON.parse(await read(
    `public/data/locales/wow-forever/${gameLocale}.json`))])));
const parseJsonl = (text) => text.split(/\r?\n/).filter(Boolean)
  .map((line) => JSON.parse(line));
const forever = new Map(parseJsonl(await read(
  "data/site-research/wowhead-item-locale-captures.jsonl"))
  .map((record) => [`${record.id}:${record.locale}`, record]));
const classic = new Map();
try {
  for (const record of parseJsonl(await read(
    "data/site-research/wowhead-classic-item-fallbacks.jsonl"))) {
    classic.set(`${record.id}:${record.locale}`, record);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const errors = new Map();
try {
  for (const record of parseJsonl(await read(
    "data/site-research/wowhead-classic-item-errors.jsonl"))) {
    errors.set(`${record.id}:${record.locale}`, record);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const sameName = (left, right) =>
  left.normalize("NFKC").toLocaleLowerCase("en-US") ===
  right.normalize("NFKC").toLocaleLowerCase("en-US");
const queue = catalog.items.flatMap((item) => {
  const index = sourceIndex.get(`ItemSparse:${item.id}:4`);
  const needed = Object.entries(packs).filter(([, pack]) =>
    index === undefined || !pack.values[index] || pack.values[index] === source.values[index])
    .map(([locale]) => locale);
  if (!needed.length) return [];
  const english = forever.get(`${item.id}:en`);
  if (!english) return [];
  const sourceMismatch = !sameName(english.name, item.name);
  const fallbackLocales = needed.filter((locale) => {
    const record = forever.get(`${item.id}:${locale}`);
    return sourceMismatch || (record && sameName(record.name, english.name));
  });
  const classicEnglish = classic.get(`${item.id}:en`);
  if (classicEnglish && !sameName(classicEnglish.name, item.name)) return [];
  if (!retryFailed && errors.has(`${item.id}:en`)) return [];
  const pending = ["en", ...fallbackLocales].filter((locale) =>
    !classic.has(`${item.id}:${locale}`) &&
    (retryFailed || !errors.has(`${item.id}:${locale}`)));
  return fallbackLocales.length && pending.length ? [{ item, pending }] : [];
});
console.log(`${queue.length} item IDs pending for Classic fallback; fetching at most ${limit}.`);
if (statusOnly) process.exit(0);

async function fetchTooltip(id, locale) {
  const localePath = locale === "en" ? "" : `${locale}/`;
  const url = `https://nether.wowhead.com/classic/${localePath}tooltip/item/${id}`;
  const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail",
    "--compressed", "--proxy", proxy, "--retry", "2", "--retry-delay", "1",
    "--max-time", "30", url], { maxBuffer: 200_000, timeout: 100_000 });
  const page = JSON.parse(stdout);
  if (typeof page.name !== "string" || !page.name.trim() ||
    typeof page.tooltip !== "string" || !page.tooltip) {
    throw new Error(`Invalid tooltip response: ${id}/${locale}`);
  }
  return { kind: "item", edition: "classic", id: Number(id), locale, url,
    name: page.name, tooltip: page.tooltip, capturedAt: new Date().toISOString() };
}
let saved = 0;
let sourceMismatch = 0;
let failed = 0;
let writing = Promise.resolve();
let writingErrors = Promise.resolve();
async function saveError(id, locale, error) {
  const record = { id: Number(id), locale,
    status: Number(/returned error: (\d+)/.exec(error.message)?.[1]) || null,
    attemptedAt: new Date().toISOString() };
  const operation = writingErrors.then(() => appendFile(errorOutput,
    `${JSON.stringify(record)}\n`));
  writingErrors = operation.catch(() => {});
  await operation;
  errors.set(`${id}:${locale}`, record);
  console.warn(`${id}/${locale}: HTTP ${record.status ?? "request failed"}`);
}
async function save(records) {
  if (!records.length) return;
  const operation = writing.then(() => appendFile(output,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n"));
  writing = operation.catch(() => {});
  await operation;
  for (const record of records) classic.set(`${record.id}:${record.locale}`, record);
  saved += records.length;
}
async function fetchItem({ item, pending }) {
  try {
    const english = classic.get(`${item.id}:en`) ??
      await fetchTooltip(item.id, "en");
    if (pending.includes("en")) await save([english]);
    if (!sameName(english.name, item.name)) {
      sourceMismatch++;
      return;
    }
    const needed = pending.filter((locale) => locale !== "en");
    const records = new Array(needed.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, needed.length) },
      async () => {
        while (next < needed.length) {
          const index = next++;
          try {
            records[index] = await fetchTooltip(item.id, needed[index]);
          } catch (error) {
            failed++;
            await saveError(item.id, needed[index], error);
          }
        }
      }));
    await save(records.filter(Boolean));
  } catch (error) {
    failed++;
    await saveError(item.id, "en", error);
  }
}
const tasks = queue.slice(0, limit);
let nextItem = 0;
await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
  while (nextItem < tasks.length) await fetchItem(tasks[nextItem++]);
}));
console.log(`Saved ${saved} Classic records; ${sourceMismatch} source mismatches; ` +
  `${failed} failed requests.`);
