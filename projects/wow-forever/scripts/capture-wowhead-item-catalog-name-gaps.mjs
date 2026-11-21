/** Capture current Wowhead names for catalog items whose client English name changed. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const output = join(root, "data/site-research/wowhead-item-catalog-name-captures.jsonl");
const locales = ["en", "de", "es", "mx", "fr", "ko", "pt", "cn", "tw"];
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Invalid option: ${arg}`);
  return [match[1], match[2]];
}));
for (const key of Object.keys(options)) {
  if (!["proxy", "limit", "status-only", "ids"].includes(key)) throw new Error(`Unknown option: ${key}`);
}
const statusOnly = options["status-only"] === "true";
const limit = Number(options.limit ?? 16);
if (options["status-only"] && !["true", "false"].includes(options["status-only"])) {
  throw new Error("Invalid --status-only");
}
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16) throw new Error("Invalid --limit");
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (!statusOnly && (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy))) {
  throw new Error("Pass --proxy=http://host:port");
}
const reviewed = await read("data/item-name-localization/wowhead-catalog-name-gap-ids.json");
const catalog = await read("public/data/items/catalog.json");
const source = await read("public/data/locales/wow-forever/source.json");
if (reviewed.version !== 1 || !Array.isArray(reviewed.ids) ||
  new Set(reviewed.ids).size !== reviewed.ids.length) throw new Error("Invalid reviewed item IDs");
const byId = new Map(catalog.items.map((item) => [Number(item.id), item]));
const sourceIndex = new Map(source.keys.map((key, index) => [key, index]));
const selected = options.ids ? new Set(options.ids.split(",").map(Number)) : null;
if (selected && [...selected].some((id) => !reviewed.ids.includes(id))) throw new Error("Unknown --ids");
for (const id of reviewed.ids) {
  const item = byId.get(id);
  const index = sourceIndex.get(`ItemSparse:${id}:4`);
  if (!item || index === undefined || source.values[index] === item.name) {
    throw new Error(`${id}: catalog/client name gap changed`);
  }
}
const captures = new Map();
try {
  for (const line of (await readFile(output, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    captures.set(`${record.id}:${record.locale}`, record);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const queue = reviewed.ids.filter((id) => (!selected || selected.has(id)) &&
  locales.some((locale) => !captures.has(`${id}:${locale}`)));
console.log(`${queue.length} catalog-name gap item IDs pending; ${captures.size} captures saved.`);
if (statusOnly) process.exit(0);

const fetchName = async (id, locale) => {
  const url = `https://nether.wowhead.com/forever/${locale === "en" ? "" : `${locale}/`}tooltip/item/${id}`;
  const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail", "--compressed",
    "--proxy", proxy, "--retry", "2", "--retry-delay", "1", "--max-time", "20", url],
  { maxBuffer: 200_000, timeout: 75_000 });
  const page = JSON.parse(stdout);
  if (typeof page.name !== "string" || !page.name.trim() ||
    typeof page.tooltip !== "string" || !page.tooltip) throw new Error(`${id}/${locale}: invalid tooltip`);
  return { id, locale, url, name: page.name.trim(), capturedAt: new Date().toISOString() };
};
let saved = 0;
for (const id of queue.slice(0, limit)) {
  const item = byId.get(id);
  let english = captures.get(`${id}:en`);
  if (!english) {
    english = await fetchName(id, "en");
    if (english.name !== item.name) throw new Error(`${id}: Wowhead English name differs from catalog`);
    await appendFile(output, `${JSON.stringify(english)}\n`);
    captures.set(`${id}:en`, english);
    saved++;
  }
  if (english.name !== item.name) throw new Error(`${id}: captured English name differs from catalog`);
  for (const locale of locales.slice(1)) {
    if (captures.has(`${id}:${locale}`)) continue;
    const record = await fetchName(id, locale);
    if (record.name === english.name) throw new Error(`${id}/${locale}: English carryover`);
    await appendFile(output, `${JSON.stringify(record)}\n`);
    captures.set(`${id}:${locale}`, record);
    saved++;
  }
  console.log(`${id}: all eight localized names captured.`);
}
console.log(`${saved} new Wowhead capture records saved.`);
