/** Snapshot rare NPC identities evidenced by a player's Forever beta client cache. */
import { mkdir, writeFile } from "node:fs/promises";

const site = "https://wowforever.ninja";
const indexUrl = `${site}/npcs/`;
const response = await fetch(indexUrl);
if (!response.ok) throw new Error(`NPC index: HTTP ${response.status}`);
const index = await response.text();
const rareStart = index.indexOf("Rares (360)");
const newStart = index.indexOf("New in Forever (397)", rareStart);
if (rareStart < 0 || newStart < 0) throw new Error("Review the changed NPC index before importing.");
const linksIn = (html) => [...html.matchAll(/href="(\/npcs\/\d+-[^\"]+\/?)"/g)]
  .map((match) => match[1]);
const classicLinks = linksIn(index.slice(rareStart, newStart));
const newListStart = index.indexOf("<ul", newStart);
const newListEnd = index.indexOf("</ul>", newListStart);
const newLinks = linksIn(index.slice(newListStart, newListEnd));
if (classicLinks.length !== 360 || newLinks.length !== 397) {
  throw new Error(`Review changed source counts: ${classicLinks.length} classic, ${newLinks.length} new.`);
}

const decode = (text) => text.replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const entries = [];
let next = 0;
const links = [...classicLinks, ...newLinks];
async function worker() {
  while (next < links.length) {
    const link = links[next++];
    let html;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const page = await fetch(`${site}${link}`);
        if (!page.ok) throw new Error(`HTTP ${page.status}`);
        html = await page.text();
        break;
      } catch (error) {
        if (attempt === 2) throw new Error(`Cannot read ${link}`, { cause: error });
      }
    }
    if (!html.includes("Seen in the beta")) continue;
    const id = Number(link.match(/^\/npcs\/(\d+)-/)?.[1]);
    const name = decode(html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1] ?? "");
    const summary = decode(html.match(/<h1[^>]*>.*?<\/h1>\s*<p[^>]*>(.*?)<\/p>/)?.[1] ?? "");
    const rank = summary.match(/\bRare elite\b/) ? "rare-elite" : summary.match(/\bRare\b/) ? "rare" : null;
    if (!rank) continue;
    const cacheEvidence = /Read from a player(?:&#39;|')s client cache|What our beta client was shown:/.test(html);
    if (!Number.isInteger(id) || !name || !rank || !cacheEvidence) {
      throw new Error(`Source page lacks rare rank or player-cache evidence: ${link}`);
    }
    entries.push({ id, name, rank, sourceUrl: `${site}${link}` });
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
entries.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
if (entries.length !== 447 || new Set(entries.map(({ id }) => id)).size !== entries.length) {
  throw new Error(`Review changed rare evidence: ${entries.length} entries.`);
}
const output = {
  version: 1,
  source: { kind: "player-client-cache", url: indexUrl,
    methodologyUrl: `${site}/about/data/`, capturedAt: new Date().toISOString().slice(0, 10),
    scope: "NPC name, id and rare rank shown to a Forever beta player client; no spawn claim" },
  entries,
};
await mkdir("public/data/rares", { recursive: true });
await writeFile("public/data/rares/observed.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(`Imported ${entries.length} Forever client-observed rare NPC identities.`);
