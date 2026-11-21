/** Capture current Wowhead descriptions for the 22 class catalog gaps. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { description } from "./lib/wowhead-tooltip-text.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "data/site-research/wowhead-class-description-gaps.jsonl");
const ids = [1310904, 1328548, 1328550, 1310911, 1224697, 1310994, 1328546,
  1328544, 1328370, 1311084, 1310735, 1293241, 431622, 1328569, 401859,
  400588, 29438, 1293695, 1328617, 1328613, 17069, 1328621];
const locales = ["en", "de", "es", "mx", "fr", "ko", "pt", "cn", "tw"];
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Invalid option: ${arg}`);
  return [match[1], match[2]];
}));
if (Object.keys(options).some((key) => !["proxy", "status-only"].includes(key)) ||
  (options["status-only"] && !["true", "false"].includes(options["status-only"]))) {
  throw new Error("Use --proxy=http://host:port or --status-only=true");
}
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const shards = await Promise.all(Array.from({ length: 64 }, (_, index) =>
  read(`public/data/spells/foreverdb/${index}.json`)));
const catalog = await read("public/data/classes/catalog.json");
const catalogDescriptions = new Set(catalog.classes.flatMap((entry) => [
  ...entry.trees.flatMap((tree) => tree.new.map((talent) => talent.description)),
  ...entry.abilities.new.map((ability) => ability.description),
]));
for (const id of ids) {
  const detail = shards[id % 64][id];
  if (!detail?.n || !detail.d || !catalogDescriptions.has(detail.d)) {
    throw new Error(`${id}: class catalog source changed`);
  }
}
const captured = new Map();
try {
  for (const line of (await readFile(output, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    const key = `${record.id}:${record.locale}`;
    if (!ids.includes(record.id) || !locales.includes(record.locale) ||
      captured.has(key)) throw new Error(`Invalid duplicate capture: ${key}`);
    captured.set(key, record);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const pending = ids.filter((id) => locales.some((locale) =>
  !captured.has(`${id}:${locale}`)));
console.log(`${pending.length} class description IDs pending; ${captured.size} captures saved.`);
if (options["status-only"] === "true") process.exit(0);
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy)) {
  throw new Error("Pass --proxy=http://host:port");
}
async function fetchTooltip(id, locale) {
  const url = `https://nether.wowhead.com/forever/${locale === "en" ? "" : `${locale}/`}tooltip/spell/${id}`;
  const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail",
    "--compressed", "--proxy", proxy, "--retry", "2", "--retry-delay", "1",
    "--max-time", "20", url], { maxBuffer: 200_000, timeout: 75_000 });
  const tooltip = JSON.parse(stdout);
  if (!tooltip.name || !tooltip.tooltip) throw new Error(`${id}/${locale}: invalid tooltip`);
  return { id, locale, url, name: tooltip.name, text: description(tooltip),
    capturedAt: new Date().toISOString() };
}
for (const id of pending) {
  const needed = locales.filter((locale) => !captured.has(`${id}:${locale}`));
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < needed.length) results.push(await fetchTooltip(id, needed[cursor++]));
  }
  await Promise.all(Array.from({ length: Math.min(4, needed.length) }, worker));
  const english = results.find((result) => result.locale === "en") ?? captured.get(`${id}:en`);
  if (english.name !== shards[id % 64][id].n || !english.text) {
    throw new Error(`${id}: Wowhead English spell identity differs from class catalog`);
  }
  await appendFile(output, `${results.map((record) => JSON.stringify(record)).join("\n")}\n`);
  for (const record of results) captured.set(`${id}:${record.locale}`, record);
  console.log(`${id}: ${locales.filter((locale) => captured.get(`${id}:${locale}`)?.text).length}/9 descriptions captured.`);
}
