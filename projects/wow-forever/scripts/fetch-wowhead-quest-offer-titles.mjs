/** Capture ID-verified Wowhead titles used by quest-giver marker offers. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const packDir = "public/data/locales/wow-forever";
const output = join(root, "data/site-research/wowhead-quest-offer-title-captures.jsonl");
const errorOutput = join(root, "data/site-research/wowhead-quest-offer-title-errors.jsonl");
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (!match) throw new Error(`Invalid option: ${argument}`);
  return [match[1], match[2]];
}));
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy)) throw new Error("Pass --proxy=http://host:port");
const concurrency = Number(options.concurrency ?? 12);
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 24) throw new Error("Invalid concurrency");
const catalog = (await read("public/data/quests/quest-details.json")).quests;
const source = await read(`${packDir}/source.json`);
const entities = await read(`${packDir}/map-entity-source.json`);
const names = new Map();
for (const file of await readdir(join(root, "public/maps/world-atlas"))) {
  if (!file.endsWith(".json")) continue;
  const map = await read(`public/maps/world-atlas/${file}`);
  for (const point of map.locations ?? []) for (const offer of point.questOffers ?? []) {
    const title = catalog[offer.id]?.title ?? offer.name.replace(/ \([^()]*\)$/, "");
    if (names.has(offer.id) && names.get(offer.id) !== title) throw new Error(`Conflicting quest ${offer.id}`);
    names.set(offer.id, title);
  }
}
const sourceIndexes = new Map(source.keys.map((key, index) => [key, index]));
const entityIndexes = new Map(entities.keys.map((key, index) => [key, index]));
const fallbacks = await read(`${packDir}/map-entity-app-fallbacks.json`);
const existing = Object.fromEntries(await Promise.all(Object.values(locales).map(async (locale) =>
  [locale, { game: await read(`${packDir}/${locale}.json`),
    map: await read(`${packDir}/map-entity-${locale}.json`) }])));
for (const [id, title] of names) {
  const key = `Quest:${id}:0`;
  const needsWowhead = Object.values(locales).some((locale) => {
    const gameIndex = sourceIndexes.get(key);
    const mapIndex = entityIndexes.get(key);
    return !(gameIndex !== undefined && source.values[gameIndex] === title &&
      existing[locale].game.values[gameIndex]) &&
      !(mapIndex !== undefined && entities.values[mapIndex] === title &&
        (existing[locale].map.values[mapIndex] || fallbacks.locales[locale][key]));
  });
  if (!needsWowhead) names.delete(id);
}
const captures = new Map();
try {
  for (const line of (await readFile(output, "utf8")).split(/\r?\n/)) {
    if (!line) continue;
    const record = JSON.parse(line);
    captures.set(`${record.id}:${record.locale}`, record);
  }
} catch (error) { if (error.code !== "ENOENT") throw error; }
async function tooltip(id, locale) {
  const localePath = locale === "en" ? "" : `${locale}/`;
  const url = `https://nether.wowhead.com/forever/${localePath}tooltip/quest/${id}`;
  const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail", "--compressed",
    "--proxy", proxy, "--retry", "1", "--max-time", "20", url],
  { maxBuffer: 200_000, timeout: 30_000 });
  const value = JSON.parse(stdout);
  if (typeof value.name !== "string" || !value.name.trim() || typeof value.tooltip !== "string") {
    throw new Error("Invalid tooltip");
  }
  return { name: value.name.trim(), url };
}
const queue = [...names].flatMap(([id, english]) => ["en", ...Object.keys(locales)]
  .filter((locale) => !captures.has(`${id}:${locale}`))
  .map((locale) => ({ id, english, locale })));
console.log(`${names.size} missing quest IDs, ${queue.length} tooltip requests pending`);
let cursor = 0;
let saved = 0;
let failed = 0;
let writing = Promise.resolve();
const append = (path, value) => {
  const pending = writing.then(() => appendFile(path, `${JSON.stringify(value)}\n`));
  writing = pending.catch(() => {});
  return pending;
};
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (cursor < queue.length) {
    const entry = queue[cursor++];
    try {
      const result = await tooltip(entry.id, entry.locale);
      const record = { ...entry, ...result, capturedAt: new Date().toISOString() };
      captures.set(`${entry.id}:${entry.locale}`, record);
      await append(output, record);
      saved++;
    } catch (error) {
      failed++;
      await append(errorOutput, { ...entry, error: error.stderr?.trim()?.slice(0, 200) ?? String(error) });
    }
    if ((saved + failed) % 500 === 0) console.log(`${saved + failed}/${queue.length}: ${saved} saved, ${failed} failed`);
  }
}));
for (const [short, locale] of Object.entries(locales)) {
  const quests = {};
  let mismatched = 0;
  for (const [id, english] of names) {
    const sourceRecord = captures.get(`${id}:en`);
    const localized = captures.get(`${id}:${short}`);
    if (!sourceRecord || !localized || sourceRecord.name !== english) {
      if (sourceRecord?.name !== english) mismatched++;
      continue;
    }
    quests[id] = { english, name: localized.name, url: localized.url };
  }
  await writeFile(join(root, `${packDir}/quest-offer-${locale}.json`),
    `${JSON.stringify({ version: 1, locale, quests })}\n`);
  console.log(`${locale}: ${Object.keys(quests).length}/${names.size} verified titles, ${mismatched} source mismatches`);
}
console.log(`${saved} captured, ${failed} failed`);
