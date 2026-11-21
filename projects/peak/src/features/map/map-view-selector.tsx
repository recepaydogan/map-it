import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";

interface MapViewSelectorProps {
  view: "daily" | "final";
  hasFinalLevel: boolean;
  onChange: (view: "daily" | "final") => void;
}

export default function MapViewSelector({ view, hasFinalLevel, onChange }: MapViewSelectorProps) {
  const { t } = useTranslation();
  const displayedView = view === "final" && hasFinalLevel ? "final" : "daily";

  return (
    <div className="pointer-events-auto flex min-w-0 flex-1 border border-border-strong bg-background/92 shadow-[0_12px_40px_rgba(0,0,0,.45)] backdrop-blur-md">
      {(["daily", "final"] as const).map((option, index) => {
        const active = displayedView === option;
        const disabled = option === "final" && !hasFinalLevel;
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={twMerge(
              "group relative min-w-0 flex-1 cursor-pointer px-2 py-3 font-display text-[10px] font-semibold uppercase leading-none tracking-[0.16em] transition-colors disabled:cursor-not-allowed",
              index === 0 && "border-r border-border",
              active ? "text-accent-bright" : "text-muted enabled:hover:text-primary",
            )}
          >
            {t(`map.view.${option}`)}
            <span
              className={twMerge(
                "ornament-line pointer-events-none absolute inset-x-2 bottom-1.5 h-px transition-opacity",
                active ? "opacity-100" : "opacity-0 group-enabled:group-hover:opacity-40",
              )}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
