import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import { useResurrectionServices } from "./use-reference-data";

const ResurrectionService = ({ npcId }: { npcId: string }) => {
  const { t, i18n } = useTranslation();
  const state = useResurrectionServices();
  const [selectedLevel, setSelectedLevel] = useState(1);
  if (state.status === "loading") return null;
  if (state.status === "error") return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  if (!state.data.npcs.includes(npcId)) return null;

  const costs = state.data.costs;
  const selected = costs.find((cost) => cost.level === selectedLevel) ?? costs[0];
  if (!selected) return null;

  return <section className="border-t border-border pt-4">
    <DatabaseSectionTitle>{t("map.resurrection.recoveryCost")}</DatabaseSectionTitle>
    <p className="mb-3 text-[12px] leading-relaxed text-subtle">{t("map.resurrection.levelHint")}</p>
    <div className="mb-3">
      <CategoryDropdown
        ariaLabel={t("map.resurrection.characterLevel")}
        value={String(selected.level)}
        onChange={(level) => setSelectedLevel(Number(level))}
        options={costs.map((cost) => ({
          key: String(cost.level),
          label: t("map.resurrection.levelOption", { level: cost.level }),
        }))}
      />
    </div>
    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-3 text-[13px]">
      <div className="min-w-0 flex-1">
        <span className="block text-[11px] text-subtle">{t("map.resurrection.kinah")}</span>
        <span className="font-semibold tabular-nums text-amber-300">{selected.kinah.toLocaleString(i18n.language)}</span>
      </div>
      <span className="text-[12px] text-subtle">{t("map.resurrection.or")}</span>
      <div className="min-w-0 flex-1 text-right">
        <span className="block text-[11px] text-subtle">{t("map.resurrection.dia")}</span>
        <span className="font-semibold tabular-nums text-zinc-100">{selected.dia.toLocaleString(i18n.language)}</span>
      </div>
    </div>
  </section>;
};

export default ResurrectionService;
