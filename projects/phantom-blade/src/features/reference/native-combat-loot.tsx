import { useTranslation } from "react-i18next";
import { useNativeJson } from "./use-native-wiki";
import NativeCurrencyReward from "./native-currency-reward";
import { combatCurrencySummary, type NativeCombatLootData } from "./native-combat-loot-model";

export default function NativeCombatLoot({ file }: { file: string }) {
  const { t } = useTranslation();
  const state = useNativeJson<NativeCombatLootData>(`data/game-files/build-26266538/scenes/${file}`);
  if (state.status !== "ready") return <p className="text-xs text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const summary = combatCurrencySummary(state.data);
  if (!summary) return null;
  return <NativeCurrencyReward amount={summary.varies ? undefined : summary} />;
}
