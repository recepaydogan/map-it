/** Capture missing talent names from current Wowhead spell IDs. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const output = join(root, "data/site-research/wowhead-talent-name-gap-captures.jsonl");
const localeCodes = { de: "de", es: "es", "es-MX": "mx", fr: "fr", ko: "ko",
  "pt-BR": "pt", "zh-Hans": "cn", "zh-Hant": "tw" };
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Invalid option: ${arg}`);
  return [match[1], match[2]];
}));
if (Object.keys(options).some((key) => !["proxy", "status-only"].includes(key)) ||
  (options["status-only"] && !["true", "false"].includes(options["status-only"]))) {
  throw new Error("Use --proxy=http://host:port or --status-only=true");
}
const catalog = await read("public/data/classes/talent-calculator.json");
const packs = Object.fromEntries(await Promise.all(Object.keys(localeCodes).map(async (language) =>
  [language, await read(`public/data/classes/locales/talents-${language}.json`)])));
const talents = catalog.classes.flatMap((entry) => entry.trees.flatMap((tree) => tree.talents));
const captured = new Map();
try {
  for (const line of (await readFile(output, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    const key = `${record.talentId}:${record.locale}`;
    if (captured.has(key) || !talents.some((talent) => talent.id === record.talentId &&
      talent.ranks.includes(record.spellId) && talent.n === record.sourceName)) {
      throw new Error(`Invalid talent name capture: ${key}`);
    }
    captured.set(key, record);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const queue = talents.flatMap((talent) => {
  const missing = Object.keys(localeCodes).filter((language) =>
    !packs[language].entries[talent.id]?.name &&
    !captured.has(`${talent.id}:${localeCodes[language]}`));
  if (!missing.length) return [];
  const locales = ["en", ...missing.map((language) => localeCodes[language])]
    .filter((locale) => !captured.has(`${talent.id}:${locale}`));
  return locales.length ? [{ talent, locales }] : [];
});
console.log(`${queue.length} talent IDs pending; ${captured.size} name captures saved.`);
if (options["status-only"] === "true") process.exit(0);
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy)) {
  throw new Error("Pass --proxy=http://host:port");
}
async function fetchName(talent, locale) {
  const spellId = talent.ranks[0];
  const url = `https://nether.wowhead.com/forever/${locale === "en" ?
    "" : `${locale}/`}tooltip/spell/${spellId}`;
  const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail",
    "--compressed", "--proxy", proxy, "--retry", "2", "--retry-delay", "1",
    "--max-time", "20", url], { maxBuffer: 200_000, timeout: 75_000 });
  const page = JSON.parse(stdout);
  if (typeof page.name !== "string" || !page.name.trim() || !page.tooltip) {
    throw new Error(`${spellId}/${locale}: invalid Wowhead tooltip`);
  }
  return { talentId: talent.id, spellId, sourceName: talent.n, locale, url,
    name: page.name.trim(), capturedAt: new Date().toISOString() };
}
for (const { talent, locales } of queue) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < locales.length) results.push(await fetchName(talent, locales[cursor++]));
  }
  await Promise.all(Array.from({ length: Math.min(4, locales.length) }, worker));
  const english = results.find((record) => record.locale === "en") ??
    captured.get(`${talent.id}:en`);
  await appendFile(output, `${results.map((record) => JSON.stringify(record)).join("\n")}\n`);
  for (const record of results) captured.set(`${talent.id}:${record.locale}`, record);
  console.log(`${talent.n} (${talent.id}): ${english?.name === talent.n ?
    "identity matched" : "English name differs"}; ${results.length} captures saved.`);
}
