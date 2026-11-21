import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceBoard from "./reference-board";
import ReferenceLocations from "./reference-locations";
import { ReferenceFacts } from "./reference-sections";
import type { ReferenceEntry } from "./reference-types";
import { MapPinned } from "lucide-react";
import { hasMapDefinition } from "../map/map-registry";

const ReferenceOverview = ({ entry, onOpenMap }: {
  entry: ReferenceEntry;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const facts = entry.category === "collections" && entry.id.startsWith("PeriodItemCollectionList:") && entry.sections.some(section => section.title === "reference.labels.required-items" && section.links?.length)
    ? entry.facts.filter(fact => fact.label !== "reference.labels.required-count")
    : entry.facts;
  return <>
    {entry.description && <blockquote className="whitespace-pre-line border-l-2 border-accent/30 pl-4 text-[13px] leading-relaxed text-zinc-300">{entry.description}</blockquote>}
    {entry.description?.includes("…") && <p className="text-[11px] text-muted">{t("reference.dynamicValues")}</p>}
    {entry.mapOverviewId && hasMapDefinition(entry.mapOverviewId) && <button type="button" onClick={() => onOpenMap(entry.mapOverviewId!, "")}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft px-4 py-3 text-[13px] font-medium text-accent transition-colors hover:border-accent hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-accent">
      <MapPinned size={16} aria-hidden="true" />{t("reference.battlegrounds.openMap")}
    </button>}
    {facts.length > 0 && <section><DatabaseSectionTitle>{t("reference.detailsTab")}</DatabaseSectionTitle><ReferenceFacts facts={facts} /></section>}
    {entry.board && <ReferenceBoard nodes={entry.board} />}
    {entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}
  </>;
};

export default ReferenceOverview;
