import { writeFileSync } from "node:fs";
import { CLASS_TIER_LIST_ARTWORK, CLASS_TIER_LIST_SOURCE } from "../src/game-config.ts";

const tierPattern = /<h2>\s*([SABCDEF]) tier\b[^<]*<\/h2>\s*<ul>([\s\S]*?)<\/ul>/gi;
const classPattern = /<li>\s*<strong>([^<]+)<\/strong>\s*-\s*([\s\S]*?)<\/li>/gi;

function textContent(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|apos|#39|#\d+);/g, (entity) => {
    const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };
    return named[entity] ?? String.fromCodePoint(Number(entity.slice(2, -1)));
  }).trim();
}

function parseRanking(html, mode) {
  const heading = mode === "solo" ? "Solo farm" : mode.toUpperCase() === "PVE" ? "PvE" : "PvP";
  if (!html.includes(`${heading} (Global)`)) throw new Error(`Expected a Global ${heading} tier list.`);
  const updatedAt = html.match(/\bUpdated (\d{4}-\d{2}-\d{2})\./)?.[1];
  if (!updatedAt) throw new Error(`Missing source update date for ${mode}.`);

  const tiers = [...html.matchAll(tierPattern)].map(([, rank, list]) => ({
    rank: rank.toUpperCase(),
    classes: [...list.matchAll(classPattern)].map(([, name, description]) => ({
      name: textContent(name),
      description: textContent(description),
    })),
  }));
  const classes = tiers.flatMap((tier) => tier.classes);
  const names = classes.map((entry) => entry.name);
  if (!tiers.length || classes.length !== Object.keys(CLASS_TIER_LIST_ARTWORK).length
    || new Set(names).size !== names.length
    || classes.some((entry) => !entry.description)
    || names.some((name) => !(name in CLASS_TIER_LIST_ARTWORK))
    || new Set(tiers.map((tier) => tier.rank)).size !== tiers.length) {
    throw new Error(`Incomplete or duplicate ${mode} tier list.`);
  }
  return { mode, updatedAt, tiers };
}

const modes = [];
for (const [mode, url] of Object.entries(CLASS_TIER_LIST_SOURCE.pages)) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${mode} tier list: HTTP ${response.status}`);
  modes.push(parseRanking(await response.text(), mode));
}
const classSets = modes.map(({ tiers }) => tiers.flatMap((tier) => tier.classes.map((entry) => entry.name)).sort().join("\0"));
if (new Set(classSets).size !== 1) throw new Error("Global tier lists disagree on the available classes.");

writeFileSync(new URL("../public/class-tier-lists.json", import.meta.url),
  JSON.stringify({ version: 1, modes }, null, 2) + "\n");
console.log(`Updated ${modes.length} Global tier lists.`);
