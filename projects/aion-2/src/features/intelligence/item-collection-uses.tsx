import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import ProgressiveList from "../../components/progressive-list";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceLinks } from "../reference/reference-sections";
import type { DatabaseItem } from "../database/item-database-types";
import type { ReferenceLink } from "../reference/reference-types";
import type { CollectionData } from "./intelligence-types";

export default function ItemCollectionUses({ matches, itemsById }: { matches: CollectionData["objectives"]; itemsById: Map<string, DatabaseItem> }) {
  const { t } = useTranslation();
  const [faction, setFaction] = useState("");
  if (!matches.length) return null;
  const factions = [...new Set(matches.map(o => o.faction))].sort();
  const current = factions.includes(faction) ? faction : factions[0];
  const signature = (objective: CollectionData["objectives"][number]) => JSON.stringify({
    count: objective.count, items: objective.items, rewards: objective.rewards,
  });
  const firstFaction = matches.filter(o => o.faction === factions[0]).map(signature).sort();
  const showFactionSelect = factions.length > 1 && factions.some(f => {
    const entries = matches.filter(o => o.faction === f).map(signature).sort();
    return entries.length !== firstFaction.length || entries.some((entry, index) => entry !== firstFaction[index]);
  });
  return <section className="max-w-[760px] space-y-3">
    <DatabaseSectionTitle>{t("intel.collections.title")}</DatabaseSectionTitle>
    {showFactionSelect
      ? <CategoryDropdown value={current ?? ""} ariaLabel={t("intel.titles.faction")} options={factions.map(f => ({ key: f, label: t(`intel.factions.${f}`, { defaultValue: f }) }))} onChange={setFaction} />
      : <p className="text-xs text-subtle">{factions.map(f => t(`intel.factions.${f}`, { defaultValue: f })).join(" · ")}</p>}
    <ProgressiveList initialCount={3} className="space-y-3">{matches.filter(o => o.faction === current).map(o => {
      const required: ReferenceLink[] = o.items.map(id => {
        const item = itemsById.get(id);
        if (!item) throw new Error(`Collection objective ${o.target.id} refers to missing item ${id}`);
        return { id, category: "items", name: item.name, icon: item.icon };
      });
      return <div key={o.target.id} className="space-y-5 rounded-[var(--radius-md)] border border-border p-3">
        <p className="text-[12px] font-medium text-zinc-300">{t("intel.collections.required", { count: o.count })}</p>
        <div className="space-y-2"><DatabaseSectionTitle>{t("intel.collections.eligible")}</DatabaseSectionTitle><ReferenceLinks links={required} initialCount={6} /></div>
        {o.rewards.length > 0 && <div className="space-y-2"><DatabaseSectionTitle>{t("reference.labels.rewards")}</DatabaseSectionTitle><ReferenceLinks links={o.rewards} /></div>}
      </div>;
    })}</ProgressiveList>
  </section>;
}
