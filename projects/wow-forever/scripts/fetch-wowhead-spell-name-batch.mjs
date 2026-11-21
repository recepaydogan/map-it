/** Capture Wowhead names for spell IDs still displayed in English. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const output = join(root, "data/site-research/wowhead-locale-captures.jsonl");
const errorOutput = join(root, "data/site-research/wowhead-spell-name-errors.jsonl");
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
const limit = Number(options.limit ?? 30_000);
const concurrency = Number(options.concurrency ?? 16);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50_000 ||
  !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) {
  throw new Error("Invalid limit or concurrency");
}
const statusOnly = options["status-only"] === "true";
const proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (!statusOnly && (!proxy || !/^https?:\/\/[^\s]+$/.test(proxy))) {
  throw new Error("Pass --proxy=http://host:port or set HTTPS_PROXY");
}
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const source = await read("public/data/locales/wow-forever/source.json");
const packs = Object.fromEntries(await Promise.all(Object.entries(locales).map(
  async ([short, locale]) => [short,
    await read(`public/data/locales/wow-forever/${locale}.json`)])));
const captured = new Set();
for (const line of (await readFile(output, "utf8")).split(/\r?\n/)) {
  if (!line) continue;
  const record = JSON.parse(line);
  if (record.kind === "spell") captured.add(`${record.id}:${record.locale}`);
}
const queue = [];
for (let index = 0; index < source.keys.length; index++) {
  const match = /^SpellName:(\d+):0$/.exec(source.keys[index]);
  if (!match) continue;
  const id = Number(match[1]);
  const targetLocales = Object.entries(packs).flatMap(([short, pack]) =>
    !pack.values[index] || pack.values[index] === source.values[index]
      ? [short] : []);
  if (!targetLocales.length) continue;
  const needed = targetLocales.filter((short) => !captured.has(`${id}:${short}`));
  if (!captured.has(`${id}:en`)) queue.push({ id, locale: "en" });
  for (const locale of needed) queue.push({ id, locale });
}
console.log(`${queue.length} spell tooltip requests pending; fetching at most ${limit}`);
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
const tasks = queue.slice(0, limit);
await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
  while (cursor < tasks.length) {
    const { id, locale } = tasks[cursor++];
    const localePath = locale === "en" ? "" : `${locale}/`;
    const url = `https://nether.wowhead.com/forever/${localePath}tooltip/spell/${id}`;
    try {
      const { stdout } = await exec("curl.exe", ["--silent", "--show-error", "--fail",
        "--compressed", "--proxy", proxy, "--retry", "1", "--max-time", "20", url],
      { maxBuffer: 200_000, timeout: 30_000 });
      const page = JSON.parse(stdout);
      if (typeof page.name !== "string" || !page.name.trim() ||
        typeof page.tooltip !== "string") throw new Error("Invalid tooltip");
      await append(output, { kind: "spell", id, locale, url,
        name: page.name, tooltip: page.tooltip,
        buff: typeof page.buff === "string" ? page.buff : "",
        tooltip2: typeof page.tooltip2 === "string" ? page.tooltip2 : "",
        capturedAt: new Date().toISOString() });
      saved++;
    } catch (error) {
      failed++;
      await append(errorOutput, { id, locale,
        message: error.stderr?.trim()?.slice(0, 200) ??
          String(error.code ?? error.name), url });
    }
    if ((saved + failed) % 1000 === 0) {
      console.log(`Processed ${saved + failed}/${tasks.length}: ${saved} saved, ${failed} failed`);
    }
  }
}));
console.log(`Processed ${tasks.length}: ${saved} saved, ${failed} failed`);
