import { ChevronRight, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { useReferenceIndex } from "../reference/use-reference-data";
import DatabaseSectionTitle from "./database-section-title";
import type { ForeverGatheringItemSources } from "./use-forever-gathering-sources";

const ForeverGatheringSources = ({ sources, onOpenMap }: {
  sources: ForeverGatheringItemSources;
  onOpenMap?: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const [query, setQuery] = useState("");
  const index = useReferenceIndex(sources.creatures.length > 0);
  const creaturesById = useMemo(() => new Map(index.status === "ready"
    ? index.data.entries.filter((entry) => entry.category === "creatures").map((entry) => [entry.id, entry]) : []), [index]);
  const matchingCreatures = sources.creatures.filter((creature) =>
    creature.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <section className="max-w-[760px] space-y-4">
    <div>
      <DatabaseSectionTitle>{t(sources.group === "fish" ? "database.foreverGathering.fishingLocations" : "database.foreverGathering.farmingAreas")}</DatabaseSectionTitle>
      <ProgressiveList initialCount={6} pageSize={24} className="grid gap-1.5 @min-[600px]:grid-cols-2">
        {sources.regions.map((region) => {
          const content = <><span className="min-w-0 flex-1 truncate">{region.name}</span><span className="shrink-0 text-[11px] text-subtle">{t("database.foreverGathering.locations", { count: region.count })}</span>{onOpenMap && <MapPin size={14} className="shrink-0 text-accent" aria-hidden="true" />}</>;
          const className = "flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-3 py-2 text-left text-[12px] text-zinc-200";
          return onOpenMap
            ? <button key={region.name} type="button" onClick={() => onOpenMap("azeroth", region.markerId)} className={`${className} cursor-pointer hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent`}>{content}</button>
            : <div key={region.name} className={className}>{content}</div>;
        })}
      </ProgressiveList>
    </div>
    {sources.creatures.length > 0 && <div>
      <DatabaseSectionTitle>{t(sources.group === "leather" ? "database.foreverGathering.skinnedFrom" : "database.foreverGathering.droppedBy", { count: sources.creatures.length })}</DatabaseSectionTitle>
      {sources.creatures.length > 20 && <label className="mb-2 flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-2 text-subtle focus-within:border-accent">
        <Search size={14} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("database.foreverGathering.searchCreatures")} aria-label={t("database.foreverGathering.searchCreatures")} className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-muted" />
      </label>}
      <ProgressiveList key={query} initialCount={8} pageSize={24} className="space-y-1.5">
        {matchingCreatures.map((creature) => {
          const reference = creaturesById.get(creature.id);
          const content = <><span className="min-w-0 flex-1"><span className="block text-[12px] font-medium text-zinc-100">{creature.name}</span><span className="block truncate text-[11px] text-subtle">{creature.regions.join(", ")}</span></span>{reference && <ChevronRight size={14} className="shrink-0 text-accent" aria-hidden="true" />}</>;
          const className = "flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-3 py-2 text-left";
          return reference
            ? <button key={creature.id} type="button" onClick={() => openReference(reference)} className={`${className} cursor-pointer hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent`}>{content}</button>
            : <div key={creature.id} className={className}>{content}</div>;
        })}
      </ProgressiveList>
      {matchingCreatures.length === 0 && <p className="text-[12px] text-subtle">{t("database.foreverGathering.noCreatures")}</p>}
    </div>}
  </section>;
};

export default ForeverGatheringSources;
