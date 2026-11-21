import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface MapFilterSectionProps {
  id: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  action?: ReactNode;
}

/** Shared accordion row for every non-category map filter. */
const MapFilterSection = ({
  id,
  title,
  summary,
  icon: Icon,
  open,
  onToggle,
  children,
  action,
}: MapFilterSectionProps) => {
  const panelId = `${id}-panel`;
  const headingId = `${id}-heading`;

  return (
    <section className="border-b border-border/60 last:border-b-0" aria-labelledby={headingId}>
      <div className="group/hdr flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
        >
          <Icon size={15} className="shrink-0 text-accent" aria-hidden="true" />
          <span id={headingId} className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">
            {title}
          </span>
        </button>
        {action}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={title}
          className="flex cursor-pointer items-center gap-1.5 py-2"
        >
          <span className="rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-300">
            {summary}
          </span>
          <ChevronDown
            size={15}
            className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>
      {open && <div id={panelId} className="pb-2 pl-1">{children}</div>}
    </section>
  );
};

export default MapFilterSection;
