import { TreePine } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../../components/tooltip";
import { cn } from "../../../lib/cn";

interface BuildControlsProps {
  level: number;
  twoHanded: boolean;
  onLevelChange: (level: number) => void;
  onTwoHandedChange: (twoHanded: boolean) => void;
  scadutreeLevel?: number;
  onScadutreeLevelChange?: (level: number) => void;
  highlightLevel?: boolean;
  onLevelHighlightEnd?: () => void;
}

const BuildControls = ({
  level,
  twoHanded,
  onLevelChange,
  onTwoHandedChange,
  scadutreeLevel,
  onScadutreeLevelChange,
  highlightLevel = false,
  onLevelHighlightEnd,
}: BuildControlsProps) => {
  const { t } = useTranslation();
  return (
    <section
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onLevelHighlightEnd?.();
      }}
      className={cn(
        "rounded-[var(--radius-lg)] border border-accent/20 from-accent/[0.10] to-white/[0.02] p-2.5",
        highlightLevel && "animate-build-level-cue motion-reduce:animate-none",
      )}
    >
      <div className="flex items-center gap-2">
        <Tooltip label={t("detail.buildAdvisor.levelHint")} side="bottom" align="start" wrap className="shrink-0">
          {/* appearance:textfield kills the native spinners — they only appear on
              hover/focus and, being drawn INSIDE the box, they clipped the last digit
              of a 3-digit level. Arrow keys still step the value. */}
          <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-accent/25 bg-black/25 pl-2 pr-1.5 transition-colors focus-within:border-accent/60 focus-within:bg-black/40">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("detail.buildAdvisor.runeLevelShort")}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={300}
              value={level}
              aria-label={t("detail.buildAdvisor.runeLevel")}
              onChange={(event) => onLevelChange(Math.min(300, Math.max(1, Number(event.target.value) || 1)))}
              className="w-[3.25ch] bg-transparent text-right text-[13px] font-bold tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
            />
          </label>
        </Tooltip>

        {/* Flexes instead of a fixed 7rem: with all three items `shrink-0` the row
            had a hard 310px floor and burst out of the detail panel on a phone
            (the Two-handed toggle was clipped off the right edge). The slider is
            the one element with no natural size, so it absorbs the slack — same
            rule the Scadutree row below already follows. */}
        <input
          type="range"
          min={1}
          max={300}
          value={level}
          aria-label={t("detail.buildAdvisor.runeLevel")}
          onChange={(event) => onLevelChange(Number(event.target.value))}
          className="h-8 min-w-0 flex-1 cursor-pointer accent-accent"
        />

        <Tooltip label={t("detail.buildAdvisor.twoHanded")} side="bottom" align="end" wrap className="shrink-0">
          <button
            type="button"
            onClick={() => onTwoHandedChange(!twoHanded)}
            role="switch"
            aria-checked={twoHanded}
            aria-label={t("detail.buildAdvisor.twoHanded")}
            className={cn(
              "flex h-7 shrink-0 items-center gap-2 rounded-[var(--radius-md)] border px-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent cursor-pointer",
              twoHanded
                ? "border-accent/45 bg-accent/[0.12] text-accent"
                : "border-border bg-black/25 text-zinc-400 hover:border-white/20 hover:text-zinc-300",
            )}
          >
            <span className="text-[10px] font-semibold leading-none">
              {t("detail.buildAdvisor.twoHandedShort")}
            </span>
            <span
              className={cn(
                "relative h-4 w-7 rounded-[var(--radius-full)] transition-colors",
                twoHanded ? "bg-accent/35" : "bg-white/[0.10]",
              )}
            >
              <span
                className={cn(
                  "absolute left-0.5 top-0.5 h-3 w-3 rounded-[var(--radius-full)] transition-[transform,background-color]",
                  twoHanded ? "translate-x-3 bg-accent" : "translate-x-0 bg-zinc-400",
                )}
              />
            </span>
          </button>
        </Tooltip>
      </div>

      {scadutreeLevel != null && onScadutreeLevelChange && (
        <div className="mt-2 flex items-center gap-2">
          <Tooltip label={t("detail.buildAdvisor.scadutree")} side="bottom" align="start" wrap className="shrink-0">
            <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-white/[0.07] bg-black/20 px-2 text-[11px] font-bold tabular-nums text-accent">
              <TreePine size={12} aria-hidden="true" />+{scadutreeLevel}
            </span>
          </Tooltip>
          <input
            type="range"
            min={0}
            max={20}
            value={scadutreeLevel}
            aria-label={t("detail.buildAdvisor.scadutree")}
            onChange={(event) => onScadutreeLevelChange(Number(event.target.value))}
            className="h-7 min-w-0 flex-1 cursor-pointer accent-accent"
          />
        </div>
      )}
    </section>
  );
};

export default BuildControls;
