/** Local form receiver for browser-readable Forever detail pages. */
import { createServer } from "node:http";
import { appendFile, readFile } from "node:fs/promises";

const rareMap = JSON.parse(await readFile("public/maps/world-atlas/locations-forever-all-rares.json", "utf8"));
const questMap = JSON.parse(await readFile("public/maps/world-atlas/locations-forever-all-quests.json", "utf8"));
const ids = {
  rares: [...new Set(rareMap.locations.map((point) => point.entityId))],
  quests: [...new Set(questMap.locations.map((point) => point.questId))],
};
const target = "data/site-research/forever-all-detail-pages.jsonl";
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:8765");
  if (request.method === "GET" && url.pathname === "/ids") {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? ids.quests.length);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) {
      response.writeHead(400).end("Invalid range");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ rares: ids.rares, quests: ids.quests.slice(offset, offset + limit),
      totalQuests: ids.quests.length }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/pending") {
    const captured = new Set((await readFile(target, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line)).filter((record) => record.kind === "quest")
      .map((record) => String(record.id)));
    const pending = ids.quests.filter((id) => !captured.has(id));
    const limit = Number(url.searchParams.get("limit") ?? 500);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      response.writeHead(400).end("Invalid limit");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ captured: captured.size, remaining: pending.length,
      quests: pending.slice(0, limit) }));
    return;
  }
  if (request.method === "GET" && request.url === "/capture") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end('<!doctype html><title>Local detail capture</title><form method="post"><textarea name="records"></textarea><button type="submit">Save</button></form>');
    return;
  }
  if (request.method === "POST" && request.url === "/capture") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    const records = JSON.parse(input.get("records") ?? "null");
    if (!Array.isArray(records) || !records.every((record) =>
      ["rare", "quest", "quest-list", "faction", "currency"].includes(record.kind)
      && Number.isInteger(record.id))) {
      response.writeHead(400).end("Invalid records");
      return;
    }
    await appendFile(target, records.map((record) => `${JSON.stringify(record)}\n`).join(""));
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Saved ${records.length} records`);
    return;
  }
  response.writeHead(404).end();
});
server.listen(8765, "127.0.0.1", () => console.log("Local detail receiver: 127.0.0.1:8765"));
