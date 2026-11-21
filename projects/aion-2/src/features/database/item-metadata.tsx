import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import ItemGrade from "./item-grade";

const ItemMetadata = ({ category, grade, binding, variant, extendable, className }: {
  category: string;
  grade: string;
  binding?: string;
  variant?: string;
  extendable?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  const parts: { key: string; content: ReactNode }[] = [
    { key: "category", content: category },
    { key: "grade", content: <ItemGrade grade={grade} /> },
  ];
  if (binding) parts.push({ key: "binding", content: binding });
  if (variant) parts.push({ key: "variant", content: variant });
  if (extendable) parts.push({ key: "extendable", content: <span className="font-semibold text-accent">{t("database.specialItems.extendable")}</span> });

  return <p className={cn("mt-1 text-[12px] font-medium text-zinc-300", className)}>
    {parts.map((part, index) => <span key={part.key} className="inline-block whitespace-nowrap">
      {index > 0 && <span className="text-zinc-500"> · </span>}{part.content}
    </span>)}
  </p>;
};

export default ItemMetadata;
