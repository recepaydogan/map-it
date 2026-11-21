import { Package } from "lucide-react";
import wikiCatalog from "../../../public/data/enshrouded/wiki-catalog.json";
import gameplayCatalog from "../../../public/data/enshrouded/gameplay-catalog.json";
import progressionCatalog from "../../../public/data/enshrouded/progression-catalog.json";
import craftingIconSupplements from "../../../public/data/enshrouded/crafting-icon-supplements.json";
import { contentUrl } from "../../lib/content-url";
import { BUILDING_RECORDS } from "./building-catalog";
import { CRAFTING_CATALOG } from "../crafting/enshrouded-crafting-catalog";
import { getEnshroudedProgressionImage } from "../map/enshrouded-entry-data";

const key = (name: string) => name.replaceAll("_", " ").trim().toLocaleLowerCase("en");
const images = new Map<string, string>();
const add = (name: string | null | undefined, path: string | null | undefined) => {
  if (name && path && !images.has(key(name))) images.set(key(name), path);
};

for (const record of wikiCatalog.records) {
  add(record.id, record.icon);
  add(record.name, record.icon);
}
for (const item of CRAFTING_CATALOG.items) {
  add(item.name, item.imagePath);
  add(item.page, item.imagePath);
}
for (const record of BUILDING_RECORDS) {
  add(record.name, record.icon?.path);
  add(record.sourcePage, record.icon?.path);
}
for (const entry of [...gameplayCatalog.seedlings, ...gameplayCatalog.animals,
  ...gameplayCatalog.fishing.rods, ...gameplayCatalog.fishing.loot]) {
  add(entry.name, entry.icon);
}
for (const npc of progressionCatalog.npcs) {
  add(npc.name, npc.image);
  add(npc.id, npc.image);
  add(npc.role, npc.image);
}
for (const set of progressionCatalog.sets) {
  add(set.name, getEnshroudedProgressionImage(set));
  for (const item of set.items) {
    add(item.name, item.image);
    add(item.page, item.image);
  }
}
for (const item of progressionCatalog.setItems) {
  add(item.name, item.image);
  add(item.id, item.image);
}
for (const [name, path] of Object.entries(progressionCatalog.rewardIcons)) add(name, path);
for (const [name, path] of Object.entries(progressionCatalog.craftingIcons as Record<string, string>)) add(name, path);
for (const [name, path] of Object.entries(craftingIconSupplements as Record<string, string>)) add(name, path);

export default function EnshroudedItemImage({ name, size = 28 }: { name: string; size?: number }) {
  const path = images.get(key(name));
  return path ? <img src={contentUrl(path)} alt="" width={size} height={size} loading="lazy"
    className="shrink-0 rounded-[var(--radius-sm)] object-contain" />
    : <span className="grid shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface text-zinc-500"
      style={{ width: size, height: size }}><Package size={Math.round(size * 0.45)} aria-hidden="true" /></span>;
}
