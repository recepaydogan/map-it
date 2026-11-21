import { LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import CategoryDropdown, { type CategoryOption } from "../../components/category-dropdown";
import { iconFor } from "../../data/icon-map";
import { ER_ITEM_CATEGORIES } from "../../data/er-items-data";

/** Sentinel category value meaning "every category" — the default Archive view. */
export const ALL_CATEGORY = "all";

interface CategorySelectProps {
  value: string;
  counts: Record<string, number>;
  onChange: (key: string) => void;
}

/**
 * The Elden Ring Archive's category picker — a thin adapter over the shared CategoryDropdown,
 * so the ER and Nightreign Archives use the exact same dropdown chrome. Leads with an "All"
 * row (every category at once — the default), then the individual categories with their counts.
 */
const CategorySelect = ({ value, counts, onChange }: CategorySelectProps) => {
  const { t } = useTranslation();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const options: CategoryOption[] = [
    { key: ALL_CATEGORY, label: t("codex.allItems"), icon: LayoutGrid, count: total },
    ...ER_ITEM_CATEGORIES.map((c) => ({
      key: c.key,
      label: t(`term.${c.label}`, { defaultValue: c.label }),
      icon: iconFor(c.icon),
      count: counts[c.key] ?? 0,
    })),
  ];
  return (
    <CategoryDropdown value={value} options={options} onChange={onChange} dividerAfter={ALL_CATEGORY} />
  );
};

export default CategorySelect;
