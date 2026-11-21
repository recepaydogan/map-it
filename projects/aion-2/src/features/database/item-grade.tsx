import { cn } from "../../lib/cn";
import { ITEM_GRADE_COLORS, ITEM_GRADE_TEXT_KEYS } from "../../game-config";
import { useGameText } from "../../i18n/game-text";

const ItemGrade = ({ grade, className }: { grade: string; className?: string }) => {
  const gameText = useGameText();
  return <span className={cn("font-semibold", ITEM_GRADE_COLORS[grade] ?? "text-zinc-300", className)}>{gameText(grade, ITEM_GRADE_TEXT_KEYS[grade])}</span>;
};

export default ItemGrade;
