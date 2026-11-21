import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDismissable } from "../../hooks/use-dismissable";
import { cn } from "../../lib/cn";
import { ITEM_CATEGORIES } from "./item-category-config";

export const ALL_ITEM_CATEGORIES = "all";

interface ItemCategorySelectProps {
  value: string;
  counts: Record<string, number>;
  onChange: (category: string) => void;
}

const ItemCategorySelect = ({ value, counts, onChange }: ItemCategorySelectProps) => {
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, rootRef, close);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const options = [
    { id: ALL_ITEM_CATEGORIES, label: t("items.allItems"), icon: LayoutGrid, count: total },
    ...ITEM_CATEGORIES.map((category) => ({
      id: category.id,
      label: t(category.labelKey),
      icon: category.icon,
      count: counts[category.id] ?? 0,
    })),
  ];
  const active = options.find((option) => option.id === value) ?? options[0];
  const ActiveIcon = active.icon;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={t("items.categoryLabel")}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/80 px-3 py-2 text-left text-[13px] text-zinc-100 outline-none transition-colors hover:bg-surface-hover focus-visible:border-accent",
          open && "border-accent/60",
        )}
      >
        <ActiveIcon size={15} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium">{active.label}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
          {active.count.toLocaleString(i18n.language)}
        </span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-zinc-500 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("items.categoryLabel")}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[60vh] overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/50 animate-fade-in"
        >
          {options.map((option, index) => {
            const Icon = option.icon;
            const selected = option.id === value;
            return (
              <div key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.id);
                    close();
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] outline-none transition-colors hover:bg-surface-hover",
                    selected ? "text-white" : "text-zinc-300",
                  )}
                >
                  <Icon size={15} className={cn("shrink-0", selected ? "text-accent" : "text-zinc-500")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                    {option.count.toLocaleString(i18n.language)}
                  </span>
                  {selected && <Check size={13} className="shrink-0 text-accent" aria-hidden="true" />}
                </button>
                {index === 0 && <div className="my-1 h-px bg-border" aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ItemCategorySelect;
