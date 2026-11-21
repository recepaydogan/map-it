import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { useGameText } from "../../i18n/game-text";
import { contentUrl } from "../../lib/content-url";
import DatabaseSectionTitle from "../database/database-section-title";
import type { CombatAbility } from "./reference-types";

const CreatureCombatAbilities = ({ abilities, icon }: { abilities: CombatAbility[]; icon?: string }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const seen = new Set<string>();
  const visible = abilities.filter((ability) => {
    if (!ability.effects.length && !ability.conditional?.some((branch) => branch.effects.length)) return false;
    const key = JSON.stringify([ability.name, ability.effects, ability.conditional]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!visible.length) return null;

  const effectText = (effects: string[]) => effects.map((effect) => t(`reference.guide.effects.${effect}`)).join(" ");
  return <section className="space-y-3">
    <div className="flex items-center gap-2">
      {icon && <img src={contentUrl(icon)} alt="" className="h-7 w-7 shrink-0 rounded-full border border-border object-cover" />}
      <DatabaseSectionTitle className="mb-0" count={visible.length}>{t("reference.guide.combatAbilities")}</DatabaseSectionTitle>
    </div>
    <ProgressiveList initialCount={4} className="space-y-3">{visible.map((ability, index) => <div key={`${ability.name}-${index}`} className="border-l border-accent/25 py-1 pl-3">
      <h4 className="text-[13px] font-semibold text-zinc-100">{gameText(ability.name)}</h4>
      {!!ability.effects.length && <p className="mt-1 text-xs leading-relaxed text-subtle">{effectText(ability.effects)}</p>}
      {ability.conditional?.map((branch, branchIndex) => <p key={branchIndex} className="mt-1 text-xs leading-relaxed text-subtle">
        <span className="font-medium text-zinc-300">{branch.conditions.map((condition) => t(`reference.guide.conditions.${condition.key}`, { name: gameText(condition.name ?? "") })).join(" ")}</span>
        {" "}{effectText(branch.effects)}
      </p>)}
    </div>)}</ProgressiveList>
  </section>;
};

export default CreatureCombatAbilities;
