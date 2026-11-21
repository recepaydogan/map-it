/** Capture missing player-spell descriptions by spell ID from Wowhead Forever. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { description, nestedDescription } from "./lib/wowhead-tooltip-text.mjs";
import { sameClassDescriptionText } from "./lib/wowhead-class-description-captures.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (name) => JSON.parse(await readFile(join(root, name), "utf8"));
const output = join(root, "data/site-research/wowhead-player-spell-description-gaps.jsonl");
const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (!match) throw new Error(`Invalid option: ${argument}`);
  return [match[1], match[2]];
}));
if (Object.keys(options).some((key) => !["proxy", "reader", "limit", "status-only"].includes(key))) {
  throw new Error("Use --proxy, --reader, --limit, or --status-only=true");
}
const limit = Number(options.limit ?? 20);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid limit");
const readLines = async (name) => {
  try { return (await readFile(name, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
};
const index = await read("public/data/spells/foreverdb/index.json");
const playerIds = new Set(index.filter((row) => row[4]).map((row) => String(row[0])));
const spells = Object.assign({}, ...await Promise.all(Array.from({ length: 64 },
  (_, shard) => read(`public/data/spells/foreverdb/${shard}.json`))));
const languagePaths = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const packs = Object.fromEntries(await Promise.all(Object.entries(languagePaths).map(
  async ([code, locale]) => [code, await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`)])));
const prior = await readLines(join(root, "data/site-research/wowhead-class-description-gaps.jsonl"));
const captured = new Map([...prior, ...await readLines(output)].map((record) =>
  [`${record.id}:${record.locale}`, record]));
const queue = Object.entries(spells).filter(([id, spell]) => playerIds.has(id) && spell.d &&
  Object.values(packs).some((pack) => !pack.entries[id]?.d) &&
  ["en", ...Object.keys(languagePaths)].some((code) => !captured.has(`${id}:${code}`)));
console.log(`${queue.length} player spell IDs pending; ${captured.size} captures available.`);
if (options["status-only"] === "true") process.exit(0);
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
const reader = options.reader === "true";
if (options.reader && !["true", "false"].includes(options.reader)) throw new Error("Invalid --reader");
if (!reader && (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy))) {
  throw new Error("Pass --proxy=http://host:port or --reader=true");
}
let nextReaderRequestAt = Date.now();
const fetchTooltip = async (id, code) => {
  const url = `https://nether.wowhead.com/forever/${code === "en" ? "" : `${code}/`}tooltip/spell/${id}`;
  let body;
  if (reader) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const wait = Math.max(0, nextReaderRequestAt - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      nextReaderRequestAt = Date.now() + 10_000;
      const response = await fetch(`https://r.jina.ai/${url}`, {
        signal: AbortSignal.timeout(30_000),
        headers: { "X-Return-Format": "markdown" },
      });
      if (response.status === 429) {
        if (attempt === 4) throw new Error(`${id}/${code}: reader rate limit persisted`);
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        continue;
      }
      if (!response.ok) throw new Error(`${id}/${code}: reader HTTP ${response.status}`);
      const page = await response.text();
      if (!page.includes(`URL Source: ${url}`) || !page.includes("Markdown Content:\n")) {
        throw new Error(`${id}/${code}: reader source identity missing`);
      }
      body = page.slice(page.indexOf("Markdown Content:\n") + "Markdown Content:\n".length).trim();
      break;
    }
  } else {
    const result = await exec("curl.exe", ["--silent", "--show-error", "--fail",
      "--compressed", "--proxy", proxy, "--retry", "2", "--retry-delay", "1",
      "--max-time", "20", url], { maxBuffer: 200_000, timeout: 75_000 });
    body = result.stdout;
  }
  const tooltip = JSON.parse(body);
  if (typeof tooltip.name !== "string" || !tooltip.name.trim() ||
    !tooltip.tooltip) throw new Error(`${id}/${code}: invalid Wowhead tooltip`);
  return { id: Number(id), locale: code, url, name: tooltip.name.trim(),
    text: description(tooltip) ?? (id === "1238122" ? nestedDescription(tooltip) : null),
    capturedAt: new Date().toISOString() };
};
let saved = 0;
for (const [id] of queue.slice(0, limit)) {
  const needed = ["en", ...Object.keys(languagePaths)].filter((code) =>
    !captured.has(`${id}:${code}`));
  const records = new Array(needed.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(reader ? 1 : 4, needed.length) }, async () => {
    while (next < needed.length) {
      const position = next++;
      records[position] = await fetchTooltip(id, needed[position]);
    }
  }));
  const english = records.find((record) => record.locale === "en") ?? captured.get(`${id}:en`);
  if (!english?.text) throw new Error(`${id}: English description unavailable`);
  if (id === "1238122" &&
    (!sameClassDescriptionText(english.text, spells[id].d) || english.name !== spells[id].n)) {
    throw new Error(`${id}: nested Wowhead description differs from source`);
  }
  await appendFile(output, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  for (const record of records) captured.set(`${id}:${record.locale}`, record);
  saved += records.length;
  console.log(`${id} ${spells[id].n}: ${english.name === spells[id].n ?
    "name matched" : "name changed"}; ${records.length} locales captured`);
}
console.log(`${saved} Wowhead locale captures saved.`);
