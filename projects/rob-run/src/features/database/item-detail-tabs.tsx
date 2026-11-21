import DetailTabs from "../../components/detail-tabs";

export const ITEM_DETAIL_TABS = ["statistics", "collection", "upgrades", "dismantling"] as const;
export type ItemDetailTab = typeof ITEM_DETAIL_TABS[number];

const LABELS = {
  collection: "intel.collections.tab",
  statistics: "database.statistics",
  upgrades: "database.upgrades",
  dismantling: "reference.labels.dismantling",
} as const;

const ItemDetailTabs = ({ id, value, onChange, tabs, hasStatistics, compact = false }: {
  id: string;
  value: ItemDetailTab;
  onChange: (value: ItemDetailTab) => void;
  tabs: readonly ItemDetailTab[];
  hasStatistics: boolean;
  compact?: boolean;
}) => <DetailTabs id={id} label="database.detailSections" value={value} onChange={onChange} compact={compact}
  tabs={tabs.map((key) => ({ key, label: key === "statistics" && !hasStatistics ? "reference.detailsTab" : LABELS[key] }))} />;

export default ItemDetailTabs;
