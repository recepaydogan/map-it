/** Save browser-observed public quest requirement evidence on localhost only. */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = "data/site-research/quest-requirements-2026-10-22";
await mkdir(root, { recursive: true });
const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/targets") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(await readFile(`${root}/legacy-candidates.json`, "utf8"));
    return;
  }
  if (request.method === "GET" && request.url === "/capture") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end('<!doctype html><title>Quest requirement evidence</title><h1>Save public quest evidence locally</h1><form method="post"><label>Evidence JSON<textarea name="evidence"></textarea></label><button>Save evidence</button></form>');
    return;
  }
  if (request.method === "POST" && request.url === "/capture") {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      let evidence = JSON.parse(form.get("evidence"));
      if (!Array.isArray(evidence.lists) || !Array.isArray(evidence.details)
        || !evidence.lists.every((page) => page.url?.startsWith("https://www.wowhead.com/forever/") && Array.isArray(page.rows))
        || !evidence.details.every((page) => page.url?.startsWith("https://www.wowhead.com/forever/quest="))) {
        throw new Error("Unexpected public evidence format");
      }
      if (evidence.append === true) {
        const previous = JSON.parse(await readFile(`${root}/browser-evidence.json`, "utf8"));
        const details = new Map([...previous.details, ...evidence.details].map((detail) => [detail.url, detail]));
        evidence = { ...previous, ...evidence, lists: evidence.lists.length ? evidence.lists : previous.lists,
          details: [...details.values()] };
        delete evidence.append;
      }
      await writeFile(`${root}/browser-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Saved ${evidence.lists.length} list pages and ${evidence.details.length} quest details`);
    } catch (error) {
      response.writeHead(400).end(error.message);
    }
    return;
  }
  response.writeHead(404).end();
});
server.listen(8766, "127.0.0.1", () => console.log("Quest evidence receiver: http://127.0.0.1:8766/capture"));
