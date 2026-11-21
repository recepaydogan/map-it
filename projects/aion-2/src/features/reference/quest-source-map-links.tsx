import { useState } from "react";
import { ArrowUpRight, ChevronDown, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import type { MapReferenceSearch } from "../map/map-focus-request";
import type { QuestLocationTarget } from "./quest-location-targets";

export default function QuestSourceMapLinks({ targets, onOpenMap }: {
  targets: QuestLocationTarget[];
  onOpenMap: (mapId: string, markerId: string, search?: MapReferenceSearch) => void;
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const [expanded, setExpanded] = useState(false);
  if (!targets.length) return null;
  const counts = new Map<string, number>();
  for (const target of targets) counts.set(target.name, (counts.get(target.name) ?? 0) + 1);
  const ordinals = new Map<string, number>();
  return <>
    <button type="button" aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}
      className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-accent hover:border-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
      <MapPin size={13} aria-hidden="true" />
      <span>{t("reference.locations")}</span>
      <ChevronDown size={12} className={expanded ? "rotate-180" : ""} aria-hidden="true" />
    </button>
    {expanded && <div className="col-span-full flex flex-wrap gap-2 text-xs text-subtle">
      {targets.map((target) => {
        const ordinal = (ordinals.get(target.name) ?? 0) + 1;
        ordinals.set(target.name, ordinal);
        const translatedName = gameText(target.name);
        const name = counts.get(target.name)! > 1
          ? t("reference.adventure.numberedVariant", { label: translatedName, number: ordinal })
          : translatedName;
        return <button key={`${target.mapId}-${target.markerId}-${target.referenceId}`} type="button"
          aria-label={t("reference.adventure.navigateToLocation", { name })}
          onClick={() => onOpenMap(target.mapId, target.markerId, target.search)}
          className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-left text-zinc-200 hover:border-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
          <span className="truncate">{name}</span><ArrowUpRight size={12} className="shrink-0 text-accent" aria-hidden="true" />
        </button>;
      })}
    </div>}
  </>;
}
