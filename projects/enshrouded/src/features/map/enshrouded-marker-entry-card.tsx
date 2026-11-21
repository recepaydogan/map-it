import { useGameText } from "../../i18n/game-text";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import EnshroudedItemImage from "../knowledge/enshrouded-item-image";
import { contentUrl } from "../../lib/content-url";
import { cn } from "../../lib/cn";
import { ENSHROUDED_QUEST_ICON, getEnshroudedProgressionImage, isEnshroudedQuest, resolveEnshroudedEntry,
  sameEnshroudedEntryTarget, type EnshroudedEntryTarget } from "./enshrouded-entry-data";

export default function EnshroudedMarkerEntryCard({ target, activeEntry, onOpen }: {
  target: EnshroudedEntryTarget;
  activeEntry?: EnshroudedEntryTarget;
  onOpen: (target: EnshroudedEntryTarget) => void;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const entry = resolveEnshroudedEntry(target);
  if (!entry) return null;
  const quest = entry.kind === "progression" && isEnshroudedQuest(entry.value);
  const name = entry.kind === "crafting" ? entry.name : entry.value.name;
  const subtitle = quest ? t("map.categories.quest")
    : entry.kind === "progression" ? contentText(entry.value.role ?? entry.value.group)
    : entry.kind === "bestiary" ? `${contentText(entry.value.faction)} · ${t(`map.enshrouded.bestiary.${entry.value.role}`)}`
    : entry.kind === "wiki" ? contentText(entry.value.type ?? entry.value.catalog)
      : entry.kind === "building" ? (entry.value.type ? contentText(entry.value.type) : t("map.enshrouded.buildingMaterial"))
        : entry.value?.type ? contentText(entry.value.type) : t("map.enshrouded.craftingRecipe");
  const image = quest ? ENSHROUDED_QUEST_ICON
    : entry.kind === "progression" ? getEnshroudedProgressionImage(entry.value)
    : entry.kind === "bestiary" ? entry.value.image : null;
  const active = sameEnshroudedEntryTarget(activeEntry, target);

  return <button type="button" onClick={() => onOpen(target)} aria-expanded={active}
    className={cn("flex w-full min-w-0 items-center gap-2.5 rounded-md border bg-white/[0.025] px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent",
      active ? "border-accent" : "border-border/70 hover:border-accent/50 hover:bg-accent-soft")}>
    {image ? <img src={contentUrl(image)} alt="" className="h-9 w-9 shrink-0 object-contain" />
      : <EnshroudedItemImage name={name} size={36} />}
    <span className="min-w-0 flex-1">
      <span className="block truncate text-xs font-medium text-zinc-100">{contentText(name)}</span>
      <span className="block truncate text-[11px] text-zinc-400">{subtitle}</span>
    </span>
    <ChevronRight size={14} className="shrink-0 text-accent/60" aria-hidden="true" />
  </button>;
}
