import { useTranslation } from "react-i18next";
import MarkerRewardItem from "../database/marker-reward-item";
import DatabaseSectionTitle from "../database/database-section-title";
import NativeCombatLoot from "../reference/native-combat-loot";
import NativeCurrencyReward from "../reference/native-currency-reward";
import { nativeEntryName } from "../reference/native-wiki-presentation";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { acquisitionPayload } from "../reference/native-wiki-acquisition-model";
import type { NativeAcquisition, NativeWikiTarget } from "../reference/use-native-wiki";

export default function NativeMarkerRewards({ rows, currencySources = [] }: { rows: NativeAcquisition[]; currencySources?: { file: string; record: string }[] }) {
  const { t } = useTranslation();
  const open = useReferenceNavigation();
  const items = new Map<string, { item: NativeWikiTarget; amounts: Set<string>; kinds:Set<string> }>();
  for (const row of rows) for (const item of row.items ?? []) {
    const payload = acquisitionPayload(row);
    const minimum = payload.MinAmount; const maximum = payload.MaxAmount ?? minimum;
    const amount = typeof minimum === "number" && typeof maximum === "number" ? minimum === maximum ? String(minimum) : `${minimum}–${maximum}` : "";
    const existing = items.get(item.id) ?? { item, amounts: new Set<string>(), kinds:new Set<string>() };
    existing.amounts.add(amount); existing.kinds.add(row.kind); items.set(item.id, existing);
  }
  const dusts = rows.filter(row => !row.native_item_id).map(acquisitionPayload)
    .filter((payload): payload is Record<string, unknown> & { MinDust: number; MaxDust: number } => typeof payload.MinDust === "number" && typeof payload.MaxDust === "number" && payload.MaxDust > 0);
  if (!items.size && !currencySources.length && !dusts.length) return null;
  return <section className="native-marker-rewards">
    <DatabaseSectionTitle>{t("wiki.marker.possibleRewards")}</DatabaseSectionTitle>
    <div className="space-y-2">{[...items.values()].map(({ item, amounts, kinds }) => <MarkerRewardItem key={item.id}
      item={{ ...item, name: nativeEntryName(item) }}
      quantity={amounts.size === 1 ? [...amounts][0] || undefined : undefined}
      chance={amounts.size > 1 ? t("wiki.marker.varies") : undefined}
      detail={kinds.has("native-combat-group-reward") || kinds.has("native-flow-reward") ? <span className="mt-1 block text-[11px] font-normal leading-snug text-subtle">{t(kinds.has("native-combat-group-reward") ? "wiki.creatureLoot.encounter" : "wiki.marker.sceneReward")}</span> : undefined}
      className="min-h-14 rounded-[var(--radius-md)] border border-border px-3 py-2.5"
      onOpenItem={() => open(item)} />)}
      {currencySources.map(source => <NativeCombatLoot key={source.record} file={source.file} />)}
      {dusts.length > 0 && <NativeCurrencyReward amount={{ min:Math.min(...dusts.map(row => row.MinDust)),max:Math.max(...dusts.map(row => row.MaxDust)) }} />}
    </div>
  </section>;
}
