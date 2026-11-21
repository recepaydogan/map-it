import { useTranslation } from "react-i18next";
import { iconFor } from "../../data/icon-map";
import { isBulkPreset } from "../../data/presets";
import { cn } from "../../lib/cn";
import type { FilterPreset } from "../../data/types";
import { useMapExperience } from "../map-experience/map-experience";

/**
 * Intent presets — the primary filter control, so they own the top of the rail.
 * Goal pills (Bosses / Loot / …) are the hero; the bulk All / None toggles are
 * demoted to a light utility cluster on the right so they never compete with an
 * actual intent.
 */
const PresetBar = () => {
  const { t } = useTranslation();
  const { presets, applyPreset, activeCategories, categories } = useMapExperience();

  // A preset is "active" when the live selection exactly matches the set it
  // would apply — so the user sees at a glance which intent is on.
  const isActive = (preset: FilterPreset): boolean => {
    if (preset.categories === "none") return activeCategories.size === 0;
    const keys =
      preset.categories === "all" ? categories.map((c) => c.key) : preset.categories;
    return keys.length === activeCategories.size && keys.every((k) => activeCategories.has(k));
  };

  const intents = presets.filter((p) => !isBulkPreset(p));
  const bulk = presets.filter(isBulkPreset);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {intents.map((preset) => {
          const Icon = iconFor(preset.icon);
          const active = isActive(preset);
          // Re-clicking an active intent clears it, so one button both sets and
          // unsets a goal.
          const handleClick = () =>
            active ? applyPreset({ ...preset, categories: "none" }) : applyPreset(preset);
          return (
            <button
              key={preset.key}
              onClick={handleClick}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 rounded-[var(--radius-full)] border px-3 py-1.5 text-[13px] font-semibold transition-colors cursor-pointer",
                active
                  ? "border-accent bg-accent text-on-accent shadow-sm shadow-accent/30"
                  : "border-border bg-white/[0.03] text-zinc-200 hover:border-white/20 hover:bg-white/[0.07] hover:text-white",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-auto text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {t("filters.quickSelect")}
        </span>
        {bulk.map((preset) => {
          const active = isActive(preset);
          return (
            <button
              key={preset.key}
              onClick={() => applyPreset(preset)}
              aria-pressed={active}
              className={cn(
                "rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-semibold transition-colors cursor-pointer",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PresetBar;
