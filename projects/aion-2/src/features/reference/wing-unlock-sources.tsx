import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { getItemDisplayName } from "../../lib/item-display-name";
import ItemAcquisitionSection from "../database/item-acquisition";
import { isAcquisitionSection } from "../database/item-detail-sections";
import ItemRecipes from "../database/item-recipes";
import { getItemSourceSections } from "../database/item-source-sections";
import { useItemAcquisition } from "../database/use-item-acquisition";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import type { ReferenceLink } from "./reference-types";
import { useItemReference, useItemReferences } from "./use-reference-data";
import ReferenceSections from "./reference-sections";

const WingUnlockItem = ({ item, onOpenMap }: {
  item: ReferenceLink;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const displayName = getItemDisplayName(item.name, gameText(item.name, item.id));
  const reference = useItemReference(item.id);
  const acquisition = useItemAcquisition(item.id);
  const rawSources = reference.status === "ready" ? reference.data.filter(isAcquisitionSection) : [];
  const containers = useItemReferences(rawSources
    .filter((section) => section.title === "reference.labels.available-from-boxes")
    .flatMap((section) => section.links ?? [])
    .filter((link) => link.category === "items").map((link) => link.id));
  const sourceSections = getItemSourceSections(rawSources, containers.status === "ready" ? containers.data : {})
    .map((section) => ({ ...section, links: section.links?.filter((link) => link.category !== "recipes") }))
    .filter((section) => section.text || section.facts?.length || section.rows?.length || section.links?.length);
  const recipes = reference.status === "ready"
    ? [...new Map(reference.data.flatMap((section) => section.links ?? [])
      .filter((link) => link.category === "recipes")
      .map((link) => [link.id, link])).values()]
    : [];
  const hasAcquisition = acquisition.status === "ready" && acquisition.acquisition !== null
    && Object.values(acquisition.acquisition).some((sources) => sources.length > 0);
  const loading = reference.status === "loading" || acquisition.status === "loading" || containers.status === "loading";
  const error = reference.status === "error" || acquisition.status === "error" || containers.status === "error";

  return <div className="space-y-3">
    <div className="flex items-center gap-2.5">
      <span className="text-xs text-subtle">{t("reference.labels.you-need")}</span>
      <ItemIcon icon={item.icon} name={displayName} size={32} />
      <span className="text-[13px] font-medium text-zinc-100">{displayName}</span>
    </div>
    {hasAcquisition && <ItemAcquisitionSection acquisition={acquisition.acquisition} onOpenMap={onOpenMap} hideTitle />}
    {sourceSections.length > 0 && <ReferenceSections sections={sourceSections} compactLinks />}
    {recipes.length > 0 && <ItemRecipes links={recipes} itemId={item.id} hideTitle />}
    {loading && <p role="status" className="text-xs text-subtle">{t("reference.loading")}</p>}
    {error && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
    {!loading && !error && !hasAcquisition && !sourceSections.length && !recipes.length
      && <p className="text-xs text-subtle">{t("database.acquisition.none")}</p>}
  </div>;
};

const WingUnlockSources = ({ items, onOpenMap }: {
  items: ReferenceLink[];
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  return <section className="max-w-[760px] space-y-3">
    <DatabaseSectionTitle>{t("reference.labels.unlock-items")}</DatabaseSectionTitle>
    <div className="divide-y divide-border/60">
      {items.map((item) => <div key={`${item.category}:${item.id}`} className="py-4 first:pt-0 last:pb-0">
        <WingUnlockItem item={item} onOpenMap={onOpenMap} />
      </div>)}
    </div>
  </section>;
};

export default WingUnlockSources;
