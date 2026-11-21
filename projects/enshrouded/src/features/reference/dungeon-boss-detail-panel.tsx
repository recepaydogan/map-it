import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import ItemIcon from "../database/item-icon";
import { cachedBossData, loadBossData, type BossData } from "./dungeon-boss-data";
import { dungeonBossIndex } from "./dungeon-boss-target";
import { useReferenceNavigation } from "./reference-navigation-context";
import type { ReferenceTarget } from "./reference-types";

const DungeonBossDetailPanel = ({ target }: { target: ReferenceTarget }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const [data, setData] = useState<BossData | null>(cachedBossData);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadBossData().then((value) => { if (active) setData(value); }).catch((cause: unknown) => {
      console.error("Failed to load dungeon boss detail", cause);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);

  if (error) return <p className="p-4 text-sm text-subtle" role="alert">{t("reference.error")}</p>;
  if (!data) return <p className="p-4 text-sm text-subtle" role="status">{t("reference.loading")}</p>;
  const boss = data.guides[target.id]?.bosses[dungeonBossIndex(target)];
  if (!boss) return <p className="p-4 text-sm text-subtle" role="alert">{t("reference.error")}</p>;

  return <article className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
    <h2 className="font-display text-xl font-semibold text-white">{boss.name}</h2>
    {boss.rare && <p className="mt-1 text-xs font-medium text-accent">{t("bossGuide.rare")}</p>}
    <p className="mt-3 select-text text-[13px] leading-relaxed text-zinc-200">{t(boss.tipKey)}</p>
    {!!boss.abilities.length && <section className="mt-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("bossGuide.watchFor")}</h3>
      <div className="flex flex-wrap gap-2">{boss.abilities.map((ability) => <Tooltip key={ability.name} wrap align="start" side="top"
        label={<span className="block max-w-[16rem] text-left"><span className="block font-semibold text-accent">{ability.name}</span><span className="mt-1 block font-normal leading-relaxed text-zinc-200">{t(ability.descriptionKey)}</span></span>}>
        <span tabIndex={0} className="inline-flex cursor-help rounded-[var(--radius-sm)] border border-accent/30 bg-accent-soft px-2.5 py-1.5 text-[12px] font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">{ability.name}</span>
      </Tooltip>)}</div>
    </section>}
    {!!boss.loot.length && <section className="mt-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("bossGuide.loot")}</h3>
      <div className="space-y-1.5">{boss.loot.map((id) => {
        const item = data.loot[id];
        if (!item) return null;
        return <div key={id}><Tooltip wrap align="start" side="top" className="w-full"
          label={<span className="block max-w-[16rem] text-left"><span className="block font-semibold text-accent">{item.name}</span><span className="block font-normal text-subtle">{item.grade}{item.itemLevel ? ` · ${t("database.itemLevel", { level: item.itemLevel })}` : ""}</span>{item.stats.map((stat) => <span key={stat.label} className="mt-0.5 block font-normal text-zinc-200">{stat.value} {t(stat.label, { defaultValue: stat.label })}</span>)}</span>}>
          <button type="button" onClick={() => openReference({ category: "items", id, name: item.name })}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-2.5 py-2 text-left text-[12px] font-medium text-zinc-100 hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
            <ItemIcon icon={item.icon} name={item.name} size={32} /><span className="min-w-0 flex-1 truncate">{item.name}</span><ArrowRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
          </button>
        </Tooltip></div>;
      })}</div>
    </section>}
  </article>;
};

export default DungeonBossDetailPanel;
