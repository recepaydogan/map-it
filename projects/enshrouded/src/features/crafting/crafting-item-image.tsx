import { Package } from "lucide-react";
import { contentUrl } from "../../lib/content-url";
import { findCraftingItem } from "./enshrouded-crafting-catalog";

export default function CraftingItemImage({ name, size = 36 }: { name: string; size?: number }) {
  const path = findCraftingItem(name)?.imagePath;
  return path ? <img src={contentUrl(path)} alt="" width={size} height={size} loading="lazy"
    className="shrink-0 rounded-[var(--radius-sm)] object-contain" />
    : <span className="grid shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface text-zinc-500"
      style={{ width: size, height: size }}><Package size={Math.round(size * 0.45)} aria-hidden="true" /></span>;
}
