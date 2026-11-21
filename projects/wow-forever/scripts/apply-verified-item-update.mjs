/** Import the seven reviewed item tooltips without inventing drop rates or sources. */
import { readFile, writeFile, access } from "node:fs/promises";
const folder = process.argv[2];
if (!folder) throw new Error("Pass the saved tooltip directory.");
const ids = ["286983", "284587", "286991", "286990", "274484", "281676", "282550"];
const path = "public/data/items/foreverdb-enrichment.json";
const enrichment = JSON.parse(await readFile(path, "utf8"));
const catalog = JSON.parse(await readFile("public/data/items/catalog.json", "utf8"));
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  .replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();
const items = [];
for (const id of ids) {
  const data = JSON.parse(await readFile(`${folder}/item-${id}.json`, "utf8"));
  const html = data.tooltip;
  if (!data.name || ![2, 3, 4].includes(data.quality) || !/^[a-z0-9_]+$/.test(data.icon)) throw new Error(`Incomplete item ${id}`);
  const icon = `data/items/site-icons/${data.icon}.jpg`;
  await access(`public/${icon}`);
  const lines = html.replace(/<br\s*\/?>/g, "\n").split("\n").map(text).filter(Boolean);
  const armor = html.match(/(?:<!--amr-->)?(\d+) Armor/);
  const damage = html.match(/<!--dmg-->([\d.]+) - ([\d.]+) Damage/);
  const speed = html.match(/<!--spd-->([\d.]+)/);
  const itemLevel = Number(html.match(/<!--ilvl-->(\d+)/)?.[1]);
  const usageLevel = Number(html.match(/<!--rlvl-->(\d+)/)?.[1]);
  const slot = text(html.match(/<table width="100%"><tr><td>(.*?)<\/td>/s)?.[1] ?? "");
  const subtype = text(html.match(/<!--scstart\d+:\d+-->(.*?)<!--scend-->/s)?.[1] ?? "");
  if (!itemLevel || !usageLevel || !slot || !subtype) throw new Error(`Missing item fields ${id}`);
  const stats = [
    ...(damage ? [{ key: "damage", label: "database.clientItem.damage", value: `${damage[1]}–${damage[2]}` }] : []),
    ...(armor ? [{ key: "armor", label: "database.clientItem.stat.armor", value: armor[1] }] : []),
    ...[...html.matchAll(/<!--stat(\d+)-->([+-]\d+)\s+([^<]+)/g)].map((match) => ({
      key: `observed-stat-${match[1]}`, label: text(match[3]), value: match[2],
    })),
    ...(damage && speed ? [{ key: "dps", label: "database.clientItem.dps",
      value: ((Number(damage[1]) + Number(damage[2])) / 2 / Number(speed[1])).toFixed(2) }] : []),
  ];
  const siteEffects = lines.filter((line) => /^(Equip:|Use:|Chance on hit:)/.test(line)).map((line) => {
    const match = /^(Equip:|Use:|Chance on hit:)\s*(.*)$/.exec(line);
    return { kind: match[1] === "Equip:" ? "equip" : match[1] === "Use:" ? "use" : "proc",
      text: match[2].split(/Sell Price:|Dropped by:/)[0].trim() };
  });
  const sell = (kind) => Number(html.match(new RegExp(`class="money${kind}">(\\d+)<`))?.[1] ?? 0);
  const flavor = lines.find((line) => line.startsWith('"'))?.match(/^"(.+?)"/)?.[1];
  items.push({ id, name: data.name, category: `${armor ? "Armor" : "Weapon"} · ${subtype}`,
    grade: { 2: "Uncommon", 3: "Rare", 4: "Epic" }[data.quality], nameVerified: true,
    itemLevel, usageLevel, slot, forever: true, icon,
    ...(flavor ? { description: flavor } : {}), siteEffects,
    clientDetails: { bonding: html.includes("Binds when picked up") ? 1 : 2,
      sellPriceCopper: sell("gold") * 10000 + sell("silver") * 100 + sell("copper"),
      ...(speed ? { itemDelayMs: Math.round(Number(speed[1]) * 1000) } : {}) },
    sections: stats.length ? [{ key: "base", stats }] : [], enhancements: [], hasReference: false,
  });
}
const existing = new Set([...catalog.items, ...enrichment.newItems].map((item) => item.id));
const added = items.filter((item) => !existing.has(item.id));
enrichment.newItems.push(...added);
if (process.argv.includes("--apply")) await writeFile(path, `${JSON.stringify(enrichment)}\n`);
console.log(JSON.stringify({ applied: process.argv.includes("--apply"), added: added.map((item) => ({ id: item.id, name: item.name })), items }, null, 2));
