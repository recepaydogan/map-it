import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import ItemGrade from "./item-grade";

const ItemMetadata = ({ category, slot, className }: {
  category: string;
  slot?: string;
  className?: string;
}) => {
  return <p className={cn("mt-1 text-[12px] font-medium text-zinc-300", className)}>
    {category}{slot && <span className="whitespace-nowrap"><span className="text-zinc-500"> · </span>{slot}</span>}
  </p>;
};

export const ItemMetadataPills = ({ grade, binding, variant, extendable, forever }: {
  grade: string;
  binding?: string;
  variant?: string;
  extendable?: boolean;
  forever?: boolean;
}) => {
  const { t } = useTranslation();
  const parts: { key: string; content: ReactNode }[] = [{ key: "grade", content: <ItemGrade grade={grade} /> }];
  if (binding) parts.push({ key: "binding", content: binding });
  if (variant) parts.push({ key: "variant", content: variant });
  if (extendable) parts.push({ key: "extendable", content: <span className="font-semibold text-accent">{t("database.specialItems.extendable")}</span> });
  if (forever) parts.push({ key: "forever", content: <span className="font-semibold text-accent">{t("database.clientItem.forever")}</span> });

  return <div className="flex flex-wrap gap-1.5">
    {parts.map((part) => <span key={part.key} className="rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1 text-[11px] leading-4 text-zinc-300">
      {part.content}
    </span>)}
  </div>;
};

export default ItemMetadata;
