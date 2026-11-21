import { cn } from "../../lib/cn";
import { ITEM_GRADE_COLORS } from "../../game-config";
import { useTranslation } from "react-i18next";

const ItemGrade = ({ grade, className }: { grade: string; className?: string }) => {
  const { t } = useTranslation();
  return <span className={cn("font-semibold", ITEM_GRADE_COLORS[grade] ?? "text-zinc-300", className)}>
    {t(`database.clientItem.quality.${grade.toLowerCase()}`, { defaultValue: grade })}
  </span>;
};

export default ItemGrade;
