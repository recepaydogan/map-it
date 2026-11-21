import type { TFunction } from "i18next";
import type { GAME_GUIDE_BOSS_COMBAT } from "../../game-config.ts";

type BossGuide = (typeof GAME_GUIDE_BOSS_COMBAT)[number];

const BossCombatGuide = ({ guide, t }: { guide: BossGuide; t: TFunction }) => {
  const difficulties = ["easy", "normal", "hard"] as const;
  const value = (amount: number | string, unit: "hit" | "second") => t(unit === "hit"
    ? "inspector.bossCombat.damageHit" : "inspector.bossCombat.damageSecond", { value: amount });
  return <div className="space-y-7 text-zinc-300">
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">{t("inspector.bossCombat.damageTitle")}</h4>
        <span className="text-[11px] text-muted">{t("inspector.bossCombat.rawDamageNote")}</span>
      </div>
      <div className="overflow-x-auto border-y border-border">
        <table className="w-full min-w-[470px] border-collapse text-left text-[12px]">
          <thead><tr className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            <th scope="col" className="py-2.5 pr-3">{t("inspector.bossCombat.attack")}</th>
            {difficulties.map(difficulty => <th key={difficulty} scope="col" className="px-2 py-2.5 text-right">
              {t(`inspector.bossCombat.difficulties.${difficulty}`)}</th>)}
          </tr></thead>
          <tbody>
            <tr className="border-t border-border/70">
              <th scope="row" className="py-2.5 pr-3 font-medium text-zinc-200">{t("inspector.mobDetails.health")}</th>
              {guide.health.map((amount, index) => <td key={index} className="px-2 py-2.5 text-right tabular-nums text-white">
                {t("inspector.mobDetails.healthValue", { value: amount })}</td>)}
            </tr>
            {guide.attacks.map(attack => <tr key={attack.key} className="border-t border-border/70">
              <th scope="row" className="py-2.5 pr-3 font-medium text-zinc-200">{t(`inspector.bossCombat.attacks.${attack.key}`)}</th>
              {attack.damage.map((amount, index) => <td key={index} className="px-2 py-2.5 text-right tabular-nums text-white">
                {value(amount, attack.unit)}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    <section>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">{t("inspector.bossCombat.preparation")}</h4>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {guide.preparation.map(item => <span key={item}>• {t(`inspector.bossCombat.items.${item}`)}</span>)}
      </div>
    </section>
    <section>
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">{t("inspector.bossCombat.plan")}</h4>
      <ol className="space-y-3">
        {Array.from({ length: guide.steps }, (_, index) => <li key={index} className="flex gap-3 text-[12px] leading-5">
          <span className="w-5 shrink-0 font-semibold tabular-nums text-accent">{String(index + 1).padStart(2, "0")}</span>
          <span>{t(`inspector.bossCombat.bosses.${guide.key}.${guide.edition}.${index + 1}`)}</span>
        </li>)}
      </ol>
    </section>
  </div>;
};

export default BossCombatGuide;
