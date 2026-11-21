import { cn } from "../../lib/cn";
import { ITEM_GRADE_COLORS } from "../../game-config";
import { useTranslation } from "react-i18next";

const ItemGrade = ({ grade, className }: { grade: string; className?: string }) => {
  const { t } = useTranslation();
  // EItemLevel is the client's record classification, separate from equipment rarity.
  if (/^EItemLevel::/.test(grade)) return null;
  const value = /^E\w+::/.test(grade) ? grade.split("::").at(-1)! : grade;
  return <span className={cn("font-semibold", ITEM_GRADE_COLORS[value] ?? "text-zinc-300", className)}>
    {t(`database.clientItem.quality.${value.toLowerCase()}`, { defaultValue: t(`wiki.nativeValues.${value}`, { defaultValue: value }) })}
  </span>;
};

export default ItemGrade;
