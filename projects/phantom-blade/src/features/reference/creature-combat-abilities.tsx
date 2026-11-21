import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import DatabaseSectionTitle from "../database/database-section-title";
import type { CombatAbility, CombatCondition } from "./reference-types";

const CreatureCombatAbilities = ({ abilities }: { abilities: CombatAbility[] }) => {
  const { t } = useTranslation();
  if (!abilities.length) return null;
  const effects = (keys: string[]) => keys.map((key) => t(`reference.guide.effects.${key}`)).join(" ");
  const conditions = (items: CombatCondition[]) => items.map(({ key, name }) =>
    t(`reference.guide.conditions.${key}`, { name: name ?? "" })).join(" ");
  return <section className="space-y-3">
    <DatabaseSectionTitle count={abilities.length}>{t("reference.guide.combatAbilities")}</DatabaseSectionTitle>
    <ProgressiveList initialCount={4} className="space-y-2">{abilities.map((ability, index) => <div key={`${ability.name}-${index}`}
      className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5">
      <h4 className="text-[13px] font-semibold text-zinc-100">{ability.name}</h4>
      {ability.description && <p className="mt-1 text-xs leading-relaxed text-subtle">{ability.description}</p>}
      {!!ability.effects.length && <p className="mt-1 text-xs leading-relaxed text-subtle">{effects(ability.effects)}</p>}
      {ability.conditional?.map((branch, branchIndex) => <p key={branchIndex} className="mt-1 text-xs leading-relaxed text-subtle">
        <span className="font-medium text-zinc-200">{conditions(branch.conditions)}</span> {effects(branch.effects)}
      </p>)}
    </div>)}</ProgressiveList>
  </section>;
};

export default CreatureCombatAbilities;
