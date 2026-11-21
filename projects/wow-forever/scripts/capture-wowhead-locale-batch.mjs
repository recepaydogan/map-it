/** Receive verified browser captures from Wowhead's localized tooltip pages. */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { description, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "data/site-research/wowhead-locale-captures.jsonl");
const token = randomBytes(16).toString("hex");
const locales = new Set(["en", "de", "es", "mx", "fr", "ko", "pt", "cn", "tw"]);
const gameLocales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const spellDetails = (await Promise.all(Array.from({ length: 64 }, async (_, shard) =>
  JSON.parse(await readFile(join(root, `public/data/spells/foreverdb/${shard}.json`), "utf8")))))
  .flatMap(Object.values).sort((left, right) => left.id - right.id);
const spellPacks = Object.fromEntries(await Promise.all(Object.entries(gameLocales).map(
  async ([locale, gameLocale]) => [locale, JSON.parse(await readFile(join(root,
    `public/data/locales/wow-forever/spell-tooltip-${gameLocale}.json`), "utf8"))])));
const existing = new Set();
const captured = new Map();
try {
  for (const line of (await readFile(output, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    const key = `${record.kind}:${record.locale}:${record.id}`;
    existing.add(key);
    captured.set(key, record);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

function valid(record) {
  if (!record || !["spell", "item", "npc", "quest"].includes(record.kind) ||
    !Number.isSafeInteger(record.id) || record.id < 1 || !locales.has(record.locale) ||
    typeof record.name !== "string" || !record.name.trim() || record.name.length > 500 ||
    typeof record.tooltip !== "string" || record.tooltip.length > 100_000) return false;
  const localePath = record.locale === "en" ? "" : `${record.locale}/`;
  return record.url ===
    `https://nether.wowhead.com/forever/${localePath}tooltip/${record.kind}/${record.id}`;
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url?.startsWith("/queue?") &&
    request.headers["x-capture-token"] === token) {
    const query = new URL(request.url, "http://127.0.0.1").searchParams;
    const limit = Number(query.get("limit") ?? 5);
    const maxLength = Number(query.get("maxLength") ?? 100_000);
    const minLocales = Number(query.get("minLocales") ?? 1);
    if (query.get("kind") !== "spell" || query.get("field") !== "d" ||
      !Number.isInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isInteger(maxLength) || maxLength < 1 ||
      !Number.isInteger(minLocales) || minLocales < 1 || minLocales > 8) {
      response.writeHead(400).end();
      return;
    }
    const queue = spellDetails.flatMap((detail) => {
      if (!detail.d || detail.d.length > maxLength) return [];
      const english = captured.get(`spell:en:${detail.id}`);
      if (english && (english.name !== detail.n ||
        !description(english) || !sameWords(description(english), detail.d))) return [];
      const needed = Object.entries(spellPacks)
        .filter(([, pack]) => !pack.entries[detail.id]?.d)
        .map(([locale]) => locale);
      if (needed.length < minLocales) return [];
      const pending = ["en", ...needed].filter((locale) =>
        !existing.has(`spell:${locale}:${detail.id}`));
      return pending.length ? [{ id: detail.id, locales: pending,
        sourceName: detail.n, sourceDescription: detail.d }] : [];
    });
    response.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ pendingIds: queue.length, batch: queue.slice(0, limit) }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/batch" ||
    request.headers["x-capture-token"] !== token) {
    response.writeHead(404).end();
    return;
  }
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 2_000_000) throw new Error("Batch is too large");
      chunks.push(chunk);
    }
    const records = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(records) || records.length < 1 || records.length > 50 ||
      records.some((record) => !valid(record))) throw new Error("Invalid capture batch");
    const fresh = records.filter((record) =>
      !existing.has(`${record.kind}:${record.locale}:${record.id}`));
    if (fresh.length) {
      await mkdir(dirname(output), { recursive: true });
      await appendFile(output, fresh.map((record) =>
        JSON.stringify({ ...record, capturedAt: new Date().toISOString() })).join("\n") + "\n");
      for (const record of fresh) {
        const key = `${record.kind}:${record.locale}:${record.id}`;
        existing.add(key);
        captured.set(key, record);
      }
    }
    response.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ accepted: fresh.length, skipped: records.length - fresh.length }));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" })
      .end(JSON.stringify({ error: error.message }));
  }
});
server.listen(0, "127.0.0.1", () => {
  console.log(JSON.stringify({ port: server.address().port, token, output }));
});
server.requestTimeout = 30_000;
setTimeout(() => server.close(), 30 * 60_000).unref();
