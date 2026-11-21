import { useMapExperience } from "../map-experience/map-experience";
import NightlordPicker from "./nightlord-picker";
import PatternFinder from "./pattern-finder";

/**
 * Nightreign seed bar — two objects, nothing redundant:
 *
 *  1. RUN identity — the Nightlord portrait + name (opens the boss page).
 *  2. FIND PATTERN — the single action. Shifting Earth and pattern resolution both live in
 *     its panel; the special event (and the night bosses that disambiguate a run) are shown
 *     there too, so the resting bar stays just a portrait + one bright button.
 *
 * Saved runs (the star) sit by the search box on the right.
 */
const SeedBar = () => {
  const { nightlord, setSeed } = useMapExperience();

  return (
    <div data-tour="seed" className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {/* 1 — RUN identity. 32px on touch, matching every other control in the
          left stack (the game pills, the layer dropdown, the filter chip); 36px
          from `sm` up, alongside the Find-pattern pill. */}
      <div className="flex h-8 items-center overflow-hidden rounded-[var(--radius-full)] border border-border bg-surface/85 shadow-lg shadow-black/30 backdrop-blur-xl sm:h-9">
        <NightlordPicker value={nightlord} onChange={(v) => setSeed({ nightlord: v })} />
      </div>

      {/* 2 — FIND PATTERN. The protagonist. */}
      <PatternFinder />
    </div>
  );
};

export default SeedBar;
