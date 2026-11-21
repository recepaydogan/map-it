import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function CraftingMaterialGuideButton({ itemName, onClick }: { itemName: string; onClick: () => void }) {
  const { t } = useTranslation();

  return <button type="button" onClick={onClick} aria-label={`${t("inspector.openGuide")} · ${itemName}`}
    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-white">
    {t("inspector.guide")}
    <ArrowRight size={14} className="text-accent" aria-hidden="true" />
  </button>;
}
