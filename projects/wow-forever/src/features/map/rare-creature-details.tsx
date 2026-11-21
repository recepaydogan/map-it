import { ChevronRight, PawPrint, Skull } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { contentUrl } from "../../lib/content-url";
import DropSearchHeader from "../database/drop-search-header";
import ItemIcon from "../database/item-icon";
import ProgressiveList from "../../components/progressive-list";
import type { SearchSourceContext } from "./map-global-search";
import MapSearchSourceDetails from "./map-search-source-details";

interface RareDrop {
  id: string;
  name: string;
  icon: string;
  inItemCatalog: boolean;
  percent?: number;
  observed?: number;
  sampleSize?: number;
}
interface RareEntry {
  id: number;
  partial?: boolean;
  classification?: "rare" | "rare-elite";
  type?: string;
  level?: number;
  levelRange?: string;
  health?: string;
  mana?: string;
  tameable?: boolean;
  drops?: RareDrop[];
}
interface RareDetails { entries: RareEntry[]; }

const DROP_SEARCH_THRESHOLD = 15;

let detailsRequest: Promise<RareDetails> | undefined;
const loadDetails = () => {
  detailsRequest ??= fetch(contentUrl("data/rares/details.json"))
    .then((response) => {
      if (!response.ok) throw new Error(`Rare details HTTP ${response.status}`);
      return response.json() as Promise<RareDetails>;
    }).catch((error: unknown) => {
      detailsRequest = undefined;
      throw error;
    });
  return detailsRequest;
};

const RareCreatureDetails = ({ npcId, onOpenItem, sourceContext, allowMissing = false }: {
  npcId?: string;
  onOpenItem?: (itemId: string) => void;
  sourceContext?: SearchSourceContext;
  allowMissing?: boolean;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const [catalog, setCatalog] = useState<RareDetails | null>(null);
  const [error, setError] = useState(false);
  const [dropQuery, setDropQuery] = useState("");
  useEffect(() => {
    let active = true;
    void loadDetails().then((data) => { if (active) setCatalog(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const sourceDetails = sourceContext ? <MapSearchSourceDetails context={sourceContext} /> : null;
  if (!npcId) return sourceDetails;
  if (!error && !catalog) return <p role="status" className="mt-3 text-xs text-subtle">{t("reference.loading")}</p>;
  const entry = catalog?.entries.find(({ id }) => String(id) === npcId);
  if (!entry) return allowMissing ? sourceDetails : <>
    <p role="alert" className="mt-3 text-xs text-danger-text">{t("map.rares.detailsError")}</p>
    {sourceDetails}
  </>;

  const source = sourceContext?.source;
  const listedDirectDrop = sourceContext && source?.kind === "loot" && !source.originKind
    && !source.via?.length && entry.drops?.some((drop) => drop.id === sourceContext.item.id);

  const searchable = (entry.drops?.length ?? 0) > DROP_SEARCH_THRESHOLD;
  const search = searchable ? dropQuery.trim().toLocaleLowerCase() : "";
  const drops = (entry.drops ?? []).map((drop) => ({ drop, itemName: gameText(drop.name, `ItemSparse:${drop.id}:4`) }));
  const visibleDrops = search ? drops.filter(({ drop, itemName }) =>
    itemName.toLocaleLowerCase().includes(search) || drop.name.toLocaleLowerCase().includes(search)) : drops;
  const stats = [
    { key: "type", label: t("map.rares.creatureType"), value: entry.type && t(`map.rares.types.${entry.type}`) },
    { key: "level", label: t("reference.labels.level"), value: entry.levelRange ?? entry.level },
    { key: "health", label: t("map.rares.healthLabel"), value: entry.health },
    { key: "mana", label: t("map.rares.manaLabel"), value: entry.mana },
  ].filter(({ value }) => value !== undefined && value !== "");

  return <><section className="mt-4 space-y-3 border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 className="map-micro-label">{t("map.rares.detailsTitle")}</h3>
      {entry.classification && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
        <Skull size={14} className="shrink-0 text-subtle" aria-hidden="true" />
        {t(`map.rares.classification.${entry.classification}`)}
      </span>}
    </div>
    {(stats.length > 0 || entry.tameable !== undefined) && <div className="rounded-[var(--radius-sm)] border border-border">
      {stats.length > 0 && <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,5rem),1fr))] gap-x-3 gap-y-2 px-3 py-2.5">
        {stats.map(({ key, label, value }) => <div key={key} className="min-w-0">
          <dt className="text-[11px] leading-4 text-subtle">{label}</dt>
          <dd className="mt-0.5 text-sm font-semibold leading-5 wrap-break-word tabular-nums text-zinc-100">{value}</dd>
        </div>)}
      </dl>}
      {entry.tameable !== undefined && <p className={`flex items-center gap-2 px-3 py-2 text-xs text-zinc-200 ${stats.length > 0 ? "border-t border-border" : ""}`}>
        <PawPrint size={14} className="shrink-0 text-subtle" aria-hidden="true" />
        {t(entry.tameable ? "map.rares.tameable" : "map.rares.notTameable")}
      </p>}
    </div>}
    {entry.partial && <p className="text-xs leading-5 text-subtle">{t("map.rares.partialDetails")}</p>}
    {!entry.type && !entry.level && !entry.levelRange && !entry.drops &&
      <p className="text-[13px] text-zinc-400">{t("map.rares.detailsUnavailable")}</p>}
    {entry.drops && <div>
      {searchable ? <DropSearchHeader title={t("map.rares.drops")} count={entry.drops.length}
        searchThreshold={DROP_SEARCH_THRESHOLD} query={dropQuery} onQueryChange={setDropQuery} />
        : <h4 className="map-micro-label mb-2">{t("map.rares.drops")}</h4>}
      {!entry.drops.length && <p className="text-[13px] text-zinc-400">{t("map.rares.noDropsListed")}</p>}
      {search && !visibleDrops.length && <p className="text-xs text-subtle">{t("database.acquisition.noMatchingDrops")}</p>}
      <ProgressiveList initialCount={search ? visibleDrops.length : 10} pageSize={10} className="space-y-1.5">
        {visibleDrops.map(({ drop, itemName }) => {
          const contents = <><ItemIcon icon={drop.icon} name={itemName} size={32} />
            <span className="min-w-0 flex-1 text-[13px] text-zinc-100">{itemName}</span>
            {drop.percent !== undefined && <span className="shrink-0 text-xs tabular-nums text-zinc-300"
              title={drop.observed !== undefined && drop.sampleSize !== undefined
                ? t("map.rares.dropSample", { observed: drop.observed, sampleSize: drop.sampleSize })
                : undefined}>{drop.percent}%</span>}</>;
          return drop.inItemCatalog && onOpenItem
            ? <button key={drop.id} type="button" onClick={() => onOpenItem(drop.id)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border bg-white/[0.03] px-2 py-1.5 text-left hover:border-accent/50 hover:bg-accent-soft">
              {contents}
              <ChevronRight size={15} className="shrink-0 text-subtle" aria-hidden="true" />
            </button>
            : <div key={drop.id}
              className="flex items-center gap-2 rounded-md border border-border bg-white/[0.03] px-2 py-1.5">
              {contents}
            </div>;
        })}
      </ProgressiveList>
    </div>}
  </section>{!listedDirectDrop && sourceDetails}</>;
};

export default RareCreatureDetails;
