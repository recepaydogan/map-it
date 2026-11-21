/** Capture source-matched item effects directly from localized Wowhead tooltips. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeHtml, numbers, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const proxy = process.argv.find((arg) => arg.startsWith("--proxy="))?.slice(8);
if (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy)) {
  throw new Error("Pass --proxy=http://host:port");
}
const locales = { deDE: "de", esES: "es", esMX: "mx", frFR: "fr",
  koKR: "ko", ptBR: "pt", zhCN: "cn", zhTW: "tw" };
const ids = [3383, 19971, 269716];
const catalog = (await read("public/data/items/catalog.json")).items;
const items = ids.map((id) => catalog.find((item) => String(item.id) === String(id)));
if (items.some((item) => !item?.siteEffects?.length)) throw new Error("Item effect source missing");
const capturePath = join(root, "data/site-research/wowhead-item-effect-gap-captures.jsonl");
const captured = new Map();
try {
  for (const line of (await readFile(capturePath, "utf8")).split(/\r?\n/)) {
    if (!line) continue;
    const record = JSON.parse(line);
    captured.set(`${record.id}:${record.locale}`, record);
  }
} catch (error) { if (error.code !== "ENOENT") throw error; }
const plain = (html) => decodeHtml(html.replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<[^>]+>/g, "")).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const extract = (tooltip) => {
  const use = [...tooltip.matchAll(/<a href="[^"]*\/spell=\d+[^"]*" class="q2">([\s\S]*?)<\/a>/g)]
    .map((match) => plain(match[1]));
  const equipSection = tooltip.split("<!--rr-->")[1] ?? "";
  const equip = [...equipSection.matchAll(/<span class="q2">([\s\S]*?)(?=<\/span>(?:<br>|<!--itemEffects:1-->))/g)]
    .map((match) => plain(match[1]).replace(/^[^:：]+[:：]\s*/, ""));
  return { use, equip };
};
async function fetchTooltip(id, locale) {
  const url = `https://nether.wowhead.com/forever/${locale === "en" ? "" : `${locales[locale]}/`}tooltip/item/${id}`;
  const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail", "--compressed",
    "--proxy", proxy, "--retry", "1", "--max-time", "20", url],
  { maxBuffer: 200_000, timeout: 30_000 });
  const page = JSON.parse(stdout);
  if (typeof page.name !== "string" || typeof page.tooltip !== "string") {
    throw new Error(`Invalid tooltip: ${id}/${locale}`);
  }
  return { id, locale, name: page.name, effects: extract(page.tooltip), url,
    capturedAt: new Date().toISOString() };
}
let writing = Promise.resolve();
async function save(record) {
  const pending = writing.then(() => appendFile(capturePath, `${JSON.stringify(record)}\n`));
  writing = pending.catch(() => {});
  await pending;
  captured.set(`${record.id}:${record.locale}`, record);
}
for (const item of items) {
  if (!captured.has(`${item.id}:en`)) await save(await fetchTooltip(item.id, "en"));
  const english = captured.get(`${item.id}:en`);
  if (english.name !== item.name) throw new Error(`${item.id}: English item name differs`);
  const positions = { use: 0, equip: 0 };
  for (const effect of item.siteEffects) {
    const source = english.effects[effect.kind]?.[positions[effect.kind]++];
    if (!source || !sameWords(source, effect.text)) {
      throw new Error(`${item.id}: English effect differs: ${effect.text}`);
    }
  }
}
const queue = items.flatMap((item) => Object.keys(locales)
  .filter((locale) => !captured.has(`${item.id}:${locale}`))
  .map((locale) => ({ id: item.id, locale })));
let next = 0;
const failures = [];
await Promise.all(Array.from({ length: Math.min(8, queue.length) }, async () => {
  while (next < queue.length) {
    const { id, locale } = queue[next++];
    try { await save(await fetchTooltip(id, locale)); }
    catch (error) { failures.push(`${id}/${locale}: ${error.message}`); }
  }
}));
for (const locale of Object.keys(locales)) {
  const translations = {};
  for (const item of items) {
    const record = captured.get(`${item.id}:${locale}`);
    if (!record) continue;
    const positions = { use: 0, equip: 0 };
    for (const effect of item.siteEffects) {
      const value = record.effects[effect.kind]?.[positions[effect.kind]++];
      if (!value || sameWords(value, effect.text) || numbers(value) !== numbers(effect.text) ||
        /\$[A-Za-z0-9{]/.test(value)) continue;
      translations[effect.text] = value;
    }
  }
  await writeFile(join(root,
    `public/data/locales/wow-forever/item-effects-wowhead-${locale}.json`),
  `${JSON.stringify({ version: 1, translations })}\n`);
  console.log(`${locale}: ${Object.keys(translations).length}/${items.flatMap((item) => item.siteEffects).length} effects`);
}
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
