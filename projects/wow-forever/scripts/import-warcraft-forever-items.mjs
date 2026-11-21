import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const origin = "https://warcraftforever.games";
const sourceDir = "data/site-research/warcraft-forever-items";
const indexPath = `${sourceDir}/index.json`;
const detailsPath = `${sourceDir}/details.ndjson`;
const iconDir = "public/data/items/site-icons";
const concurrency = 6;

const request = async (url, { json = false, allowNotFound = false } = {}) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: json ? "application/json" : "text/html" } });
      if (response.ok) return json ? response.json() : response.text();
      if (response.status === 404 && allowNotFound) return null;
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`${url}: HTTP ${response.status}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt));
    } catch (error) {
      if (attempt === 4 || /HTTP 4\d\d/.test(String(error)) && !/HTTP 429/.test(String(error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw new Error(`Could not fetch ${url}.`);
};

const pageItem = (html, id) => {
  const scripts = [...html.matchAll(/<script>self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)];
  for (const script of scripts) {
    const payload = JSON.parse(script[1])[1];
    if (typeof payload !== "string") continue;
    const marker = `"item":{"id":${id},`;
    const markerAt = payload.indexOf(marker);
    if (markerAt < 0) continue;
    const start = markerAt + '"item":'.length;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < payload.length; index += 1) {
      const character = payload[index];
      if (escaped) { escaped = false; continue; }
      if (character === "\\" && quoted) { escaped = true; continue; }
      if (character === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (character === "{") depth += 1;
      if (character === "}" && --depth === 0) return JSON.parse(payload.slice(start, index + 1));
    }
  }
  throw new Error(`Could not read item ${id} from its rendered page.`);
};

const inParallel = async (jobs, limit, task) => {
  let cursor = 0;
  const results = new Array(jobs.length);
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      results[index] = await task(jobs[index], index);
    }
  }));
  return results;
};

const index = async () => {
  const html = await request(`${origin}/items`);
  const letters = [...html.matchAll(/href="\/items\/browse\/([^"/]+)\/1"[^>]*>[\s\S]{0,160}?<span[^>]*>(\d+)<\/span>/g)]
    .map((match) => ({ letter: match[1], count: Number(match[2]) }));
  if (letters.length !== 27 || letters.reduce((sum, entry) => sum + entry.count, 0) !== 21767) {
    throw new Error("The site's published item index changed. Review it before importing.");
  }
  const pages = letters.flatMap(({ letter, count }) => Array.from({ length: Math.ceil(count / 250) }, (_, index) => ({
    letter, page: index + 1, expected: Math.min(250, count - index * 250),
  })));
  const results = await inParallel(pages, 4, async ({ letter, page, expected }) => {
    const url = `${origin}/items/browse/${letter}/${page}`;
    const body = await request(url);
    const ids = [...new Set([...body.matchAll(/href="\/items\/(\d+)"/g)].map((match) => Number(match[1])))];
    if (ids.length !== expected) throw new Error(`${url}: expected ${expected} items; found ${ids.length}.`);
    return { url, ids };
  });
  const ids = results.flatMap((result) => result.ids);
  if (new Set(ids).size !== 21767) throw new Error("Duplicate or missing item IDs in site index.");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(indexPath, `${JSON.stringify({ origin, indexedAt: new Date().toISOString(),
    count: ids.length, letters, pages: results.map(({ url, ids: pageIds }) => ({ url, count: pageIds.length })), ids }, null, 2)}\n`);
  console.log(`Indexed ${ids.length} site items across ${pages.length} pages.`);
};

const details = async () => {
  const source = JSON.parse(await readFile(indexPath, "utf8"));
  if (source.count !== 21767 || new Set(source.ids).size !== source.count) {
    throw new Error("Invalid item index snapshot.");
  }
  await mkdir(sourceDir, { recursive: true });
  const existing = await readFile(detailsPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const completed = new Set(existing.trim() ? existing.trim().split("\n").map((line) => JSON.parse(line).id) : []);
  const pending = source.ids.filter((id) => !completed.has(id));
  console.log(`Fetching ${pending.length} item details (${completed.size} already saved).`);
  for (let offset = 0; offset < pending.length; offset += 100) {
    const batch = pending.slice(offset, offset + 100);
    const records = await inParallel(batch, concurrency, async (id) => {
      let detail = await request(`${origin}/api/items/${id}?v=2`, { json: true, allowNotFound: true });
      if (!detail) detail = pageItem(await request(`${origin}/items/${id}`), id);
      if (detail.id !== id || !detail.name || !detail.quality) {
        throw new Error(`Incomplete item detail for ${id}.`);
      }
      return detail;
    });
    await appendFile(detailsPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
    console.log(`Saved ${Math.min(offset + batch.length, pending.length)}/${pending.length} new details; total ${completed.size + Math.min(offset + batch.length, pending.length)}/${source.count}.`);
  }
};

const icons = async () => {
  const records = (await readFile(detailsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const iconNames = [...new Set(records.map((record) => record.icon))];
  if (records.length !== 21767 || iconNames.some((name) => !/^[a-z0-9_-]+$/i.test(name))) {
    throw new Error("The complete item details are required before importing icons.");
  }
  await mkdir(iconDir, { recursive: true });
  const pending = iconNames.filter((name) => !existsSync(`${iconDir}/${name}.jpg`));
  console.log(`Fetching ${pending.length} icons (${iconNames.length - pending.length} already saved).`);
  const missing = await inParallel(pending, concurrency, async (name, index) => {
    for (const size of ["large", "small"]) {
      const url = `https://wowforever-media.fly.storage.tigris.dev/icons/${size}/${name}.jpg`;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(url);
        if (response.ok) {
          if (!response.headers.get("content-type")?.startsWith("image/")) {
            throw new Error(`Unexpected icon content at ${url}.`);
          }
          await writeFile(`${iconDir}/${name}.jpg`, Buffer.from(await response.arrayBuffer()));
          if ((index + 1) % 250 === 0) console.log(`Saved ${index + 1}/${pending.length} icons.`);
          return null;
        }
        if (response.status === 404) break;
        if (response.status < 500 && ![408, 429].includes(response.status)) throw new Error(`${url}: HTTP ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
    return name;
  });
  const unavailable = missing.filter(Boolean);
  await writeFile(`${sourceDir}/missing-icons.json`, `${JSON.stringify({ unavailable }, null, 2)}\n`);
  console.log(`Saved ${iconNames.length - unavailable.length} site icons; ${unavailable.length} unavailable at the site's icon URLs.`);
};

if (process.argv.includes("--index")) await index();
else if (process.argv.includes("--details")) await details();
else if (process.argv.includes("--icons")) await icons();
else throw new Error("Run with --index, --details or --icons. Publication follows source validation.");
