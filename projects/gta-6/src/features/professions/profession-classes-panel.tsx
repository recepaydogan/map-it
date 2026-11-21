import { ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useGameNames } from "../../i18n/use-game-names";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ProfessionEntry } from "./profession-types";

const CLASS_NAMES = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];

const ProfessionClassesPanel = ({ entry, selectedClass, onSelectClass }: {
  entry: ProfessionEntry;
  selectedClass: string | null;
  onSelectClass: (name: string | null) => void;
}) => {
  const { t } = useTranslation();
  const { className: gameClassName } = useGameNames();
  const openReference = useReferenceNavigation();
  const linked = useMemo(() => entry.recipes.filter((recipe) => recipe.classes?.length), [entry.recipes]);
  const classes = CLASS_NAMES.map((name) => ({ name, count: linked.filter((recipe) => recipe.classes?.includes(name)).length }))
    .filter((group) => group.count);
  const visible = selectedClass ? linked.filter((recipe) => recipe.classes?.includes(selectedClass)) : linked;

  return <div className="space-y-4">
    <p className="text-[12px] leading-5 text-subtle">{t("professions.classLinkExplanation")}</p>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={() => onSelectClass(null)} className={cn("cursor-pointer rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[11px] font-medium",
        selectedClass === null ? "border-accent text-accent" : "border-border text-zinc-300 hover:text-white")}>{t("professions.allClasses")} {linked.length}</button>
      {classes.map((group) => <button key={group.name} type="button" onClick={() => onSelectClass(group.name)} className={cn("cursor-pointer rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[11px] font-medium",
        selectedClass === group.name ? "border-accent text-accent" : "border-border text-zinc-300 hover:text-white")}>{gameClassName(group.name.toLowerCase(), group.name)} {group.count}</button>)}
    </div>
    <div className="flex items-center justify-between gap-3"><DatabaseSectionTitle count={visible.length}>{t("professions.classLinkedRecipes")}</DatabaseSectionTitle>
      {selectedClass && <button type="button" onClick={() => openReference({ category: "classes", id: selectedClass.toLowerCase(), name: gameClassName(selectedClass.toLowerCase(), selectedClass) })}
        className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-accent hover:underline">{t("professions.openClass", { name: gameClassName(selectedClass.toLowerCase(), selectedClass) })}<ArrowUpRight size={12} aria-hidden="true" /></button>}
    </div>
    <div className="grid gap-2 @min-[760px]:grid-cols-2">{visible.map((recipe) => <button key={recipe.id} type="button" onClick={() => openReference({ category: "items", id: recipe.itemId!, name: recipe.name })}
      className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-left hover:border-accent/50">
      {recipe.icon && <ItemIcon icon={recipe.icon} name={recipe.name} size={30} />}
      <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium text-white">{recipe.name}</span><span className="block text-[11px] text-subtle">{t("professions.skill", { value: recipe.skill })} · {recipe.classes?.map((name) => gameClassName(name.toLowerCase(), name)).join(", ")}</span></span>
      <ArrowUpRight size={13} className="shrink-0 text-accent" aria-hidden="true" />
    </button>)}</div>
  </div>;
};

export default ProfessionClassesPanel;
