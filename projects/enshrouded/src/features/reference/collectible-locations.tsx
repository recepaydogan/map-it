import { Check, MapPin } from "lucide-react";
import { useContext, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import { collectibleProgress, isCollectibleCompleted } from "./collectible-progress";
import type { CollectiblePoint, CollectibleRegion } from "./collectible-progression-types";
import { ReferenceLocationContext } from "./reference-location-context";
import { hasMapDefinition } from "../map/map-registry";

const CollectibleLocations = ({ regions, completedIds, onToggle, onOpenMap, summaryOnly = false }: {
  regions: CollectibleRegion[];
  completedIds: string[];
  onToggle: (point: CollectiblePoint) => void;
  onOpenMap?: (mapId: string, markerId: string) => void;
  summaryOnly?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const id = useId();
  const current = useContext(ReferenceLocationContext);
  const [regionId, setRegionId] = useState(() => regions.find((region) => region.points.some((point) => point.id === current?.markerId))?.id
    ?? regions.find((region) => region.mapId === current?.mapId)?.id ?? regions[0]!.id);
  const [terrain, setTerrain] = useState("all");
  const [status, setStatus] = useState("remaining");
  const region = regions.find((region) => region.id === regionId) ?? regions[0]!;
  const completed = new Set(completedIds);
  const progress = collectibleProgress(regions, completedIds);
  const points = region.points.map((point, index) => ({ point, number: index + 1 }))
    .filter(({ point }) => (terrain === "all" || point.terrain === terrain)
      && (status === "all" || isCollectibleCompleted(point, completed) === (status === "collected")));
  const firstRemaining = region.points.find((point) => !isCollectibleCompleted(point, completed)) ?? region.points[0]!;
  return <section className="space-y-3">
    <DatabaseSectionTitle>{t("reference.collectible.progress")}</DatabaseSectionTitle>
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
      <span className="font-medium tabular-nums text-zinc-100" aria-live="polite">{t("reference.collectible.completedCount", { count: progress.found, total: progress.total })}</span>
      <span className="text-xs tabular-nums text-subtle">{t("reference.collectible.remainingCount", { count: progress.total - progress.found })}</span>
    </div>
    <div role="progressbar" aria-label={t("reference.collectible.progress")} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.found} className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
      <div className="h-full rounded-full bg-accent" style={{ width: `${progress.found / progress.total * 100}%` }} />
    </div>
    {!summaryOnly && <>
    <p className="text-xs leading-relaxed text-subtle">{t("reference.collectible.manualProgress")}</p>
    {regions.length > 1 && <label className="block text-xs text-subtle" htmlFor={`${id}-region`}>{t("reference.collectible.region")}
      <CategoryDropdown id={`${id}-region`} ariaLabel={t("reference.collectible.region")} value={region.id} onChange={setRegionId} triggerClassName="mt-1.5" options={regions.map((region) => ({ key: region.id, label: region.name }))} />
    </label>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-3">
      <p className="min-w-0 text-[13px] font-medium text-zinc-100">{region.name}</p>
      {onOpenMap && hasMapDefinition(region.mapId) && <button type="button" onClick={() => onOpenMap(region.mapId, firstRemaining.id)} className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent-soft px-3 py-2 text-xs font-medium text-accent hover:bg-surface-hover"><MapPin size={14} aria-hidden="true" />{t("reference.collectible.openMap")}</button>}
    </div>
    <details className="group rounded-[var(--radius-md)] border border-border px-3 py-3">
      <summary className="cursor-pointer text-[13px] font-medium text-zinc-200">{t("reference.collectible.browsePoints")}</summary>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="min-w-0 text-xs text-subtle" htmlFor={`${id}-terrain`}>{t("reference.collectible.terrain")}
          <CategoryDropdown id={`${id}-terrain`} ariaLabel={t("reference.collectible.terrain")} value={terrain} onChange={setTerrain} triggerClassName="mt-1.5" options={["all", "ground", "air", "water"].map((key) => ({ key, label: t(`reference.collectible.terrains.${key}`) }))} />
        </label>
        <label className="min-w-0 text-xs text-subtle" htmlFor={`${id}-status`}>{t("reference.collectible.status")}
          <CategoryDropdown id={`${id}-status`} ariaLabel={t("reference.collectible.status")} value={status} onChange={setStatus} triggerClassName="mt-1.5" options={["remaining", "collected", "all"].map((key) => ({ key, label: t(`reference.collectible.statuses.${key}`) }))} />
        </label>
      </div>
      <div className="mt-3" aria-live="polite">
        {points.length === 0 && <p className="py-3 text-xs text-subtle">{t("reference.collectible.noPoints")}</p>}
        <ProgressiveList initialCount={6} className="divide-y divide-border">{points.map(({ point, number }) => {
          const found = isCollectibleCompleted(point, completed);
          const name = t("reference.collectible.pointName", { number, name: point.name });
          return <div key={point.id} className="flex min-w-0 items-center gap-2 py-2.5">
            <button type="button" aria-label={t(found ? "reference.collectible.markRemaining" : "reference.collectible.markCollected", { name })} aria-pressed={found} onClick={() => onToggle(point)} className={cn("grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-border transition-colors hover:border-accent", found ? "bg-success-soft text-success-text" : "text-subtle hover:text-accent")}><Check size={15} aria-hidden="true" /></button>
            <div className="min-w-0 flex-1"><p className="text-xs text-zinc-100">{name}</p><p className="mt-1 text-[11px] tabular-nums text-subtle">{t(`reference.collectible.terrains.${point.terrain}`)} · {t("reference.collectible.coordinates", { x: Math.round(point.x).toLocaleString(i18n.language), y: Math.round(point.y).toLocaleString(i18n.language) })}</p></div>
            {onOpenMap && hasMapDefinition(region.mapId) && <button type="button" aria-label={t("reference.collectible.showPoint", { name })} onClick={() => onOpenMap(region.mapId, point.id)} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-accent hover:bg-accent-soft"><MapPin size={15} aria-hidden="true" /></button>}
          </div>;
        })}</ProgressiveList>
      </div>
    </details>
    </>}
  </section>;
};

export default CollectibleLocations;
