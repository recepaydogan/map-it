import { useTranslation } from "react-i18next";
import { cn } from "../../../lib/cn";
import type { AdminNoteFilter } from "../../../services/comments/comments-service";

interface AdminNoteFiltersProps {
  filter: AdminNoteFilter;
  reported: number;
  unreviewed: number;
  onChange: (filter: AdminNoteFilter) => void;
}

/**
 * Which pile to work through. The default is "all" and it is genuinely usable
 * as the default, because the feed already sorts reported ahead of unread ahead
 * of newest — these narrow the view, they are not how you find the urgent thing.
 */
const AdminNoteFilters = ({ filter, reported, unreviewed, onChange }: AdminNoteFiltersProps) => {
  const { t } = useTranslation();

  const options: Array<{ key: AdminNoteFilter; label: string; count?: number; urgent?: boolean }> = [
    { key: "all", label: t("notesAdmin.filterAll") },
    { key: "reported", label: t("notesAdmin.filterReported"), count: reported, urgent: true },
    { key: "unreviewed", label: t("notesAdmin.filterUnreviewed"), count: unreviewed },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t("notesAdmin.filterLabel")}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={filter === option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
            filter === option.key
              ? "border-accent/40 bg-accent/[0.12] text-accent"
              : "border-border bg-white/[0.03] text-zinc-400 hover:text-white",
          )}
        >
          {option.label}
          {option.count !== undefined && option.count > 0 && (
            <span
              className={cn(
                "rounded-[var(--radius-full)] px-1.5 text-[10px] font-bold tabular-nums",
                // Reported is someone waiting on a decision; unread is only
                // reading to catch up. One merged tone would flatten both.
                option.urgent ? "bg-rose-500/25 text-rose-200" : "bg-white/10 text-zinc-200",
              )}
            >
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

export default AdminNoteFilters;
