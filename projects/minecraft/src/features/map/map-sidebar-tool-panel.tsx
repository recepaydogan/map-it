import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapSidebarToolPanelProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  onClose: () => void;
  scrollContent?: boolean;
}

const MapSidebarToolPanel = ({
  title,
  description,
  icon: Icon,
  children,
  onClose,
  scrollContent = true,
}: MapSidebarToolPanelProps) => {
  const { t } = useTranslation();
  const closeLabel = t("map.sidebar.closeTool", { tool: title });

  return <section
    id="map-sidebar-tool-panel"
    aria-labelledby="map-sidebar-tool-panel-title"
    className={cn(
      "pointer-events-auto flex max-h-full w-[21rem] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in",
      !scrollContent && "h-full",
    )}
  >
    <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent-soft text-accent">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <h2 id="map-sidebar-tool-panel-title" className="text-[13px] font-semibold text-white">
          {title}
        </h2>
        <p className="mt-0.5 text-[10px] leading-4 text-white/75">{description}</p>
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        title={closeLabel}
        className="-mr-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </header>
    <div className={cn(
      "min-h-0 flex-1 px-4 py-3",
      scrollContent ? "scroll-slim overflow-y-auto" : "flex overflow-hidden",
    )}>
      {children}
    </div>
  </section>;
};

export default MapSidebarToolPanel;
