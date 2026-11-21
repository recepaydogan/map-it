import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceLocations from "./reference-locations";
import { ReferenceLinks } from "./reference-sections";
import { collectibleRewards } from "./collectible-progress";
import type { CollectibleTrack } from "./collectible-progression-types";

const CollectibleRewards = ({ tracks, initialTrackId, onOpenMap, showLocations = true }: {
  tracks: CollectibleTrack[];
  initialTrackId?: string;
  onOpenMap?: (mapId: string, markerId: string) => void;
  showLocations?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [trackId, setTrackId] = useState(initialTrackId ?? tracks[0]!.id);
  const [level, setLevel] = useState(2);
  const track = tracks.find((track) => track.id === trackId) ?? tracks[0]!;
  const rewards = collectibleRewards(track.levels, level);
  return <section className="space-y-4">
    {tracks.length > 1 && <label className="block text-xs text-subtle" htmlFor={`${id}-faction`}>{t("reference.labels.faction")}
      <CategoryDropdown id={`${id}-faction`} ariaLabel={t("reference.labels.faction")} value={track.id} onChange={(value) => { setTrackId(value); setLevel(2); }} triggerClassName="mt-1.5" options={tracks.map((track) => ({ key: track.id, label: t(`intel.factions.${track.faction}`) }))} />
    </label>}
    {showLocations && onOpenMap && track.locations.length > 0 && <ReferenceLocations locations={track.locations} onOpenMap={onOpenMap} />}
    <div className="space-y-5">
      <section className="space-y-3">
        <DatabaseSectionTitle>{t("reference.collectible.rewards")}</DatabaseSectionTitle>
        <CategoryDropdown ariaLabel={t("reference.collectible.selectLevel")} value={String(level)} onChange={(value) => setLevel(Number(value))} options={track.levels.map((row) => ({ key: String(row.level), label: t("reference.collectible.level", { level: row.level }) }))} />
      </section>
      <div className="space-y-5" aria-live="polite">
        {rewards.stats.length > 0 && <section className="space-y-3"><DatabaseSectionTitle>{t("reference.collectible.statBonuses")}</DatabaseSectionTitle><dl className="divide-y divide-border/50">{rewards.stats.map((stat) => <div key={stat.id} className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
          <dt className="text-zinc-300">{stat.name}</dt><dd className="text-right tabular-nums text-zinc-100">{stat.value === null ? t("reference.collectible.amountUnconfirmed") : t("reference.collectible.statBonus", { value: stat.value.toLocaleString(i18n.language) })}</dd>
        </div>)}</dl></section>}
        {rewards.items.length > 0 && <section className="space-y-3"><DatabaseSectionTitle>{t("reference.collectible.itemRewards")}</DatabaseSectionTitle><ReferenceLinks links={rewards.items} initialCount={8} /></section>}
        {!rewards.items.length && !rewards.stats.length && <p className="py-2 text-xs text-subtle">{t("reference.collectible.noRewards")}</p>}
      </div>
    </div>
  </section>;
};

export default CollectibleRewards;
