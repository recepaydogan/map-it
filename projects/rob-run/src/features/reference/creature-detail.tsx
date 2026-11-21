import { useState } from "react";
import { ChevronRight, DoorOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import CreatureIcon from "./creature-icon";
import CreatureContent from "./creature-content";
import FieldEventEntranceContent from "./field-event-entrance-content";
import ReferenceLocations from "./reference-locations";
import { useReferenceNavigation } from "./reference-navigation-context";
import { useReferenceEntry, useReferenceIndex } from "./use-reference-data";
import type { ReferenceTarget } from "./reference-types";
import { creatureCategoryKey, getCreatureLevel } from "./creature-heading";

const CreatureDetail = ({ target, onOpenMap }: { target: ReferenceTarget; onOpenMap: (mapId: string, markerId: string) => void }) => {
  const { t } = useTranslation();
  const open = useReferenceNavigation();
  const [selected, setSelected] = useState(target.id);
  const index = useReferenceIndex();
  const summary = index.status === "ready" ? index.data.entries.find((entry) => entry.id === selected) : undefined;
  const dungeonSummary = index.status === "ready" ? index.data.entries.find((entry) => entry.id === target.dungeonId) : undefined;
  const state = useReferenceEntry(summary);
  const dungeon = useReferenceEntry(dungeonSummary);
  const error = index.status === "error" || (index.status === "ready" && !summary) || state.status === "error";
  if (error || state.status !== "ready") return <p className="p-4 text-sm text-subtle" role={error ? "alert" : "status"}>{t(error ? "reference.error" : "reference.loading")}</p>;
  const entry = state.data;
  const level = getCreatureLevel(entry);
  return <article className="scroll-slim min-h-0 flex-1 overflow-y-auto">
    <header className="flex items-center gap-3 border-b border-border px-4 py-4">
      <CreatureIcon icon={entry.icon} name={entry.name} size={48} />
      <div className="min-w-0"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">{t(creatureCategoryKey(entry))}{level !== undefined && ` · ${t("reference.adventure.level", { number: level })}`}</p>
        <h2 className="text-base font-semibold leading-tight text-zinc-100">{entry.name}</h2>
        {dungeonSummary && <p className="mt-1 text-xs text-subtle">{dungeonSummary.name}</p>}
      </div>
    </header>
    <div className="space-y-5 px-4 py-5">
      {!!target.creatureVariants?.length && <CategoryDropdown value={selected} onChange={setSelected}
        ariaLabel={target.creatureVariants.every((variant) => variant.challengeLevel !== undefined) ? t("reference.guide.challengeDifficulty") : t("reference.adventure.creatureVariant")}
        options={target.creatureVariants.map((variant, index) => ({ key: variant.id, image: variant.icon,
          label: variant.challengeLevel !== undefined
            ? t("reference.adventure.challengeLevel", { number: variant.challengeLevel })
            : t("reference.skills.variant", { name: variant.name, number: index + 1 }),
        }))} />}
      {entry.fieldEvent ? <><FieldEventEntranceContent npcId={entry.id.slice("NpcData:".length)} activityId={entry.fieldEvent.activityId} onOpenMap={onOpenMap} />
        {!dungeonSummary && entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}</>
        : <CreatureContent entry={entry} showLocations={!dungeonSummary} onOpenMap={onOpenMap} currentDungeonId={target.dungeonId}
          mechanics={dungeon.status === "ready" ? dungeon.data.dungeonBossMechanics?.filter((mechanic) => mechanic.creatureId === selected) : []} />}
      {dungeonSummary && <button type="button" onClick={() => open({ category: "dungeons", id: dungeonSummary.id, name: dungeonSummary.name })}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-accent/35 bg-accent-soft p-3 text-left hover:border-accent focus-visible:outline-2 focus-visible:outline-accent">
        <DoorOpen size={19} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-wide text-accent">{t("reference.guide.entranceDetails")}</span><span className="text-[13px] font-medium text-zinc-100">{dungeonSummary.name}</span></span>
        <ChevronRight size={16} className="shrink-0 text-accent" aria-hidden="true" />
      </button>}
      {target.dungeonId && (dungeon.status === "error" || (index.status === "ready" && !dungeonSummary)) && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
    </div>
  </article>;
};
export default CreatureDetail;
