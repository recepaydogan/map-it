import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { useSavedMapState } from "../map/use-saved-map-state";
import { useIntelligenceData } from "./use-reference-data";
import CollectibleLocations from "./collectible-locations";
import CollectibleRewards from "./collectible-rewards";
import { isCollectibleCompleted } from "./collectible-progress";
import { ReferenceLinks } from "./reference-sections";
import type { CollectiblePoint, CollectibleProgression, CollectibleProgressionData } from "./collectible-progression-types";

const Content = ({ collection, referenceId, onOpenMap, summaryOnly, showLocations }: {
  collection: CollectibleProgression;
  referenceId?: string;
  onOpenMap?: (mapId: string, markerId: string) => void;
  summaryOnly: boolean;
  showLocations: boolean;
}) => {
  const { t } = useTranslation();
  const saved = useSavedMapState();
  const togglePoint = (point: CollectiblePoint) => {
    const completed = new Set(saved.completedIds);
    if (isCollectibleCompleted(point, completed)) {
      [point.id, ...point.aliases].filter((id) => completed.has(id)).forEach(saved.toggleCompleted);
    } else saved.toggleCompleted(point.id);
  };
  return <div className="min-w-0 space-y-7">
    <CollectibleLocations regions={collection.regions} completedIds={saved.completedIds} onToggle={togglePoint} onOpenMap={onOpenMap} summaryOnly={summaryOnly} />
    <CollectibleRewards tracks={collection.tracks} initialTrackId={referenceId} onOpenMap={onOpenMap} showLocations={showLocations} />
    {collection.exchanges.length > 0 && <section className="space-y-3">
      <DatabaseSectionTitle>{t("reference.collectible.exchange")}</DatabaseSectionTitle>
      {collection.exchanges.map((exchange) => <div key={exchange.id} className="space-y-2">
        <p className="text-[13px] text-zinc-200">{t("reference.collectible.exchangeCost", { count: exchange.cost, level: exchange.level })}</p>
        <ReferenceLinks links={[exchange.result]} />
        <p className="text-xs text-subtle">{t("reference.collectible.exchangeLimit", { count: exchange.characterLimit })}</p>
      </div>)}
    </section>}
  </div>;
};

const CollectibleProgressionPanel = ({ itemId, referenceId, onOpenMap, summaryOnly = false }: {
  itemId?: string;
  referenceId?: string;
  onOpenMap?: (mapId: string, markerId: string) => void;
  summaryOnly?: boolean;
}) => {
  const { t } = useTranslation();
  const state = useIntelligenceData<CollectibleProgressionData>("collectible-progression");
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="text-xs text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const id = itemId ?? state.data.references[referenceId ?? ""];
  const collection = id ? state.data.items[id] : undefined;
  if (!collection) return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  return <Content key={`${id}-${referenceId ?? ""}`} collection={collection} referenceId={referenceId} onOpenMap={onOpenMap} summaryOnly={summaryOnly} showLocations={!itemId} />;
};

export default CollectibleProgressionPanel;
