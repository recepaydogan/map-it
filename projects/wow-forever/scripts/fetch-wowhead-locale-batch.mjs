/** Fetch localized Forever spell tooltips in resumable batches through an explicit proxy. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { aura, description, fullAura, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (!match) throw new Error(`Invalid option: ${argument}`);
  return [match[1], match[2]];
}));
const allowed = new Set(["proxy", "field", "limit", "max-length", "min-locales",
  "concurrency", "id-concurrency", "status-only", "retry-mismatch", "ids", "refresh"]);
for (const key of Object.keys(options)) {
  if (!allowed.has(key)) throw new Error(`Unknown option: ${key}`);
}
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
const statusOnly = options["status-only"] === "true";
const retryMismatch = options["retry-mismatch"] === "true";
const refresh = options.refresh === "true";
const selectedIds = options.ids ? new Set(options.ids.split(",").map((id) => Number(id))) : null;
if (selectedIds && ([...selectedIds].some((id) => !Number.isSafeInteger(id) || id < 1) ||
  !selectedIds.size)) throw new Error("--ids must contain positive spell IDs");
if (options.refresh && !["true", "false"].includes(options.refresh)) {
  throw new Error("--refresh must be true or false");
}
if (options["status-only"] && !["true", "false"].includes(options["status-only"])) {
  throw new Error("--status-only must be true or false");
}
if (options["retry-mismatch"] && !["true", "false"].includes(options["retry-mismatch"])) {
  throw new Error("--retry-mismatch must be true or false");
}
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
const limit = numberOption("limit", 10, 1000);
const field = options.field ?? "d";
if (!["d", "a", "old"].includes(field)) throw new Error(`Invalid --field: ${field}`);
const edition = field === "old" ? "classic" : "forever";
const output = join(root, "data/site-research",
  field === "old" ? "wowhead-classic-locale-captures.jsonl" :
    "wowhead-locale-captures.jsonl");
const textFor = (capture, source) => field === "a"
  ? [aura(capture), fullAura(capture)].find((text) => text && sameWords(text, source)) ??
    aura(capture) : description(capture);
const capturedField = (record) => record &&
  (field !== "a" || Object.hasOwn(record, "buff"));
const maxLength = numberOption("max-length", 160, 100_000);
const minLocales = numberOption("min-locales", 8, 8);
const concurrency = numberOption("concurrency", 3, 8);
const idConcurrency = numberOption("id-concurrency", 1, 4);
const gameLocales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const details = (await Promise.all(Array.from({ length: 64 }, async (_, shard) =>
  JSON.parse(await readFile(join(root, `public/data/spells/foreverdb/${shard}.json`), "utf8")))))
  .flatMap(Object.values).sort((left, right) => left.id - right.id);
const packs = Object.fromEntries(await Promise.all(Object.entries(gameLocales).map(
  async ([locale, gameLocale]) => [locale, JSON.parse(await readFile(join(root,
    `public/data/locales/wow-forever/spell-tooltip-${gameLocale}.json`), "utf8"))])));
const captured = new Map();
let existingText = "";
try {
  existingText = await readFile(output, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const line of existingText.split(/\r?\n/).filter(Boolean)) {
  const record = JSON.parse(line);
  captured.set(`${record.kind}:${record.locale}:${record.id}`, record);
}
const queue = details.flatMap((detail) => {
  if ((selectedIds && !selectedIds.has(detail.id)) ||
    !detail[field] || detail[field].length > maxLength ||
    (field === "old" && detail.old === detail.d)) return [];
  const english = captured.get(`spell:en:${detail.id}`);
  const sourceMismatch = capturedField(english) && (english.name !== detail.n ||
    !textFor(english, detail[field]) ||
    !sameWords(textFor(english, detail[field]), detail[field]));
  if (sourceMismatch && !retryMismatch && !refresh) return [];
  const needed = Object.entries(packs)
    .filter(([, pack]) => !pack.entries[detail.id]?.[field])
    .map(([locale]) => locale);
  if (needed.length < minLocales) return [];
  const pendingLocales = needed.filter((locale) => refresh ||
    !capturedField(captured.get(`spell:${locale}:${detail.id}`)));
  const pending = [
    ...(refresh || !capturedField(english) ||
      (sourceMismatch && retryMismatch && pendingLocales.length)
      ? ["en"] : []),
    ...pendingLocales,
  ];
  return pending.length ? [{ detail, pending }] : [];
});
console.log(`${queue.length} spell IDs pending for ${field}; fetching at most ${limit}.`);
if (statusOnly) process.exit(0);

async function fetchTooltip(id, locale) {
  const localePath = locale === "en" ? "" : `${locale}/`;
  const url = `https://nether.wowhead.com/${edition}/${localePath}tooltip/spell/${id}`;
  const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail",
    "--compressed", "--proxy", proxy, "--retry", "2", "--retry-delay", "1",
    "--max-time", "30", url],
  { maxBuffer: 200_000, timeout: 100_000 });
  const page = JSON.parse(stdout);
  if (typeof page.name !== "string" || !page.name.trim() ||
    typeof page.tooltip !== "string" || !page.tooltip) {
    throw new Error(`Invalid tooltip response: ${id}/${locale}`);
  }
  return { kind: "spell", id, locale, url, name: page.name, tooltip: page.tooltip,
    ...(edition === "classic" ? { edition } : {}),
    buff: typeof page.buff === "string" ? page.buff : "",
    tooltip2: typeof page.tooltip2 === "string" ? page.tooltip2 : "" };
}

let saved = 0;
let mismatched = 0;
let failed = 0;
let writing = Promise.resolve();
async function save(records) {
  if (!records.length) return;
  const content = records.map((record) =>
    JSON.stringify({ ...record, capturedAt: new Date().toISOString() })).join("\n") + "\n";
  const operation = writing.then(() => appendFile(output, content));
  writing = operation.catch(() => {});
  await operation;
  for (const record of records) captured.set(`spell:${record.locale}:${record.id}`, record);
  saved += records.length;
}

async function fetchSpell({ detail, pending }) {
  try {
    const priorEnglish = captured.get(`spell:en:${detail.id}`);
    const english = capturedField(priorEnglish) && !pending.includes("en") ? priorEnglish :
      await fetchTooltip(detail.id, "en");
    if (pending.includes("en")) await save([english]);
    if (english.name !== detail.n || !textFor(english, detail[field]) ||
      !sameWords(textFor(english, detail[field]), detail[field])) {
      mismatched++;
      console.log(`${detail.id}: Wowhead English text differs from ForeverDB`);
      if (!retryMismatch) return;
    }
    const locales = pending.filter((value) => value !== "en");
    const results = new Array(locales.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, locales.length) }, async () => {
      while (next < locales.length) {
        const index = next++;
        const locale = locales[index];
        try {
          results[index] = await fetchTooltip(detail.id, locale);
        } catch (error) {
          failed++;
          console.warn(`${detail.id}/${locale}: ${error.message}`);
        }
      }
    }));
    const records = results.filter(Boolean);
    if (records.length) {
      await save(records);
      console.log(`${detail.id}: saved ${records.length} locale records`);
    }
  } catch (error) {
    failed++;
    console.warn(`${detail.id}: ${error.message}`);
  }
}
const tasks = queue.slice(0, limit);
let nextSpell = 0;
await Promise.all(Array.from({ length: Math.min(idConcurrency, tasks.length) }, async () => {
  while (nextSpell < tasks.length) await fetchSpell(tasks[nextSpell++]);
}));
console.log(`Saved ${saved} locale records; ${mismatched} source mismatches; ${failed} failed requests.`);
