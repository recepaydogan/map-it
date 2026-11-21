/** Capture localized Wowhead names for map entities missing raw locale values. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const output = join(root, "data/site-research/wowhead-map-entity-locale-captures.jsonl");
const errorOutput = join(root, "data/site-research/wowhead-map-entity-locale-errors.jsonl");
const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (!match) throw new Error(`Invalid option: ${argument}`);
  return [match[1], match[2]];
}));
for (const key of Object.keys(options)) {
  if (!["proxy", "limit", "concurrency", "status-only"].includes(key)) {
    throw new Error(`Unknown option: ${key}`);
  }
}
const limit = Number(options.limit ?? 3000);
const concurrency = Number(options.concurrency ?? 12);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000 ||
  !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 24) {
  throw new Error("Invalid limit or concurrency");
}
const statusOnly = options["status-only"] === "true";
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (!statusOnly && (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy))) {
  throw new Error("Pass --proxy=http://host:port or set HTTPS_PROXY");
}
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const source = await read("public/data/locales/wow-forever/map-entity-source.json");
const packs = Object.fromEntries(await Promise.all(Object.entries(locales).map(
  async ([short, locale]) => [short,
    await read(`public/data/locales/wow-forever/map-entity-${locale}.json`)])));
const captured = new Set();
try {
  for (const line of (await readFile(output, "utf8")).split(/\r?\n/)) {
    if (!line) continue;
    const record = JSON.parse(line);
    captured.add(`${record.kind}:${record.id}:${record.locale}`);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const byEntity = new Map();
for (let index = 0; index < source.keys.length; index++) {
  const match = /^(Creature|Quest):(\d+):0$/.exec(source.keys[index]);
  if (!match) continue;
  const kind = match[1] === "Creature" ? "npc" : "quest";
  const id = Number(match[2]);
  const key = `${kind}:${id}`;
  const entry = byEntity.get(key) ?? { kind, id, source: source.values[index],
    locales: [], targeted: false };
  for (const [short, pack] of Object.entries(packs)) {
    if (!pack.values[index]) {
      entry.targeted = true;
      if (!captured.has(`${kind}:${id}:${short}`)) entry.locales.push(short);
    }
  }
  byEntity.set(key, entry);
}
const queue = [...byEntity.values()].flatMap((entry) => {
  if (!entry.targeted) return [];
  return [
    ...(!captured.has(`${entry.kind}:${entry.id}:en`) ? [{ ...entry, locale: "en" }] : []),
    ...entry.locales.map((locale) => ({ ...entry, locale })),
  ];
}).slice(0, limit);
console.log(`${queue.length} localized tooltip requests pending in this batch`);
if (statusOnly) process.exit(0);

let cursor = 0;
let saved = 0;
let failed = 0;
let writing = Promise.resolve();
const append = (path, value) => {
  const operation = writing.then(() => appendFile(path, `${JSON.stringify(value)}\n`));
  writing = operation.catch(() => {});
  return operation;
};
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (cursor < queue.length) {
    const entry = queue[cursor++];
    const localePath = entry.locale === "en" ? "" : `${entry.locale}/`;
    const url = `https://nether.wowhead.com/forever/${localePath}tooltip/${entry.kind}/${entry.id}`;
    try {
      const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail",
        "--compressed", "--proxy", proxy, "--retry", "1", "--max-time", "20", url],
      { maxBuffer: 200_000, timeout: 30_000 });
      const page = JSON.parse(stdout);
      if (typeof page.name !== "string" || !page.name.trim() ||
        typeof page.tooltip !== "string") throw new Error("Invalid tooltip");
      await append(output, { kind: entry.kind, id: entry.id, locale: entry.locale,
        source: entry.source, name: page.name, tooltip: page.tooltip, url,
        capturedAt: new Date().toISOString() });
      saved++;
    } catch (error) {
      failed++;
      await append(errorOutput, { kind: entry.kind, id: entry.id,
        locale: entry.locale, message: error.stderr?.trim()?.slice(0, 200) ??
          String(error.code ?? error.name), url });
    }
    if ((saved + failed) % 500 === 0) {
      console.log(`Processed ${saved + failed}/${queue.length}: ${saved} saved, ${failed} failed`);
    }
  }
}));
console.log(`Processed ${queue.length}: ${saved} saved, ${failed} failed`);
