import { Bookmark, PackageSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export type MapSidebarMode = "explore" | "saved" | "runs" | "craft";

interface MapSidebarModeTabsProps {
  mode: MapSidebarMode;
  onChange: (mode: MapSidebarMode) => void;
}

const MapSidebarModeTabs = ({ mode, onChange }: MapSidebarModeTabsProps) => {
  const { t } = useTranslation();
  const tabs = [
    { id: "saved" as const, label: t("map.filters.saved"), icon: Bookmark },
    { id: "runs" as const, label: t("map.filters.runs"), icon: PackageSearch },
  ];

  return (
    <div
      data-tour="tabs"
      className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] border border-border bg-black/25 p-1"
      role="toolbar"
      aria-label={t("map.filters.mode")}
    >
      {tabs.map(({ id, label, icon: Icon }, index) => (
        <button
          key={id}
          id={`map-sidebar-tab-${id}`}
          type="button"
          aria-pressed={mode === id}
          aria-controls="map-sidebar-tool-panel"
          tabIndex={mode === id || (mode !== "saved" && mode !== "runs" && index === 0) ? 0 : -1}
          onClick={() => onChange(mode === id ? "explore" : id)}
          onKeyDown={(event) => {
            const targetIndex = event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)
                  ? (index + 1) % tabs.length
                  : -1;
            if (targetIndex < 0) return;
            event.preventDefault();
            const target = tabs[targetIndex]!;
            onChange(target.id);
            window.requestAnimationFrame(() => {
              document.querySelector<HTMLButtonElement>(`#map-sidebar-tab-${target.id}`)?.focus();
            });
          }}
          className={cn(
            "flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-2.5 text-[11px] font-semibold transition-colors",
            mode === id
              ? "bg-accent-soft text-white shadow-sm shadow-black/30"
              : "text-zinc-300 hover:bg-white/5 hover:text-white",
          )}
        >
          <Icon size={14} className="shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">{label}</span>
        </button>
      ))}
    </div>
  );
};

export default MapSidebarModeTabs;
