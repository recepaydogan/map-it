import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { CommentSort } from "../../services/comments/comments-service";

interface CommentSortTabsProps {
  sort: CommentSort;
  onChange: (sort: CommentSort) => void;
}

const OPTIONS: Array<{ key: CommentSort; label: string }> = [
  { key: "top", label: "comments.sortTop" },
  { key: "new", label: "comments.sortNew" },
];

/**
 * Top or newest. Rendered only once a marker has enough notes for the order to
 * mean anything — a sort control above two comments is chrome pretending to be
 * a feature.
 */
const CommentSortTabs = ({ sort, onChange }: CommentSortTabsProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label={t("comments.sortLabel")}>
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={sort === option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "cursor-pointer rounded-[var(--radius-full)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide transition-colors",
            sort === option.key
              ? "bg-white/[0.08] text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          {t(option.label)}
        </button>
      ))}
    </div>
  );
};

export default CommentSortTabs;
