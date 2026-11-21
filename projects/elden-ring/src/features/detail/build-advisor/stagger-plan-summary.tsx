import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../../components/tooltip";
import { cn } from "../../../lib/cn";
import StaggerMoveGrid from "./stagger-move-grid";
import type { StaggerPlan } from "./types";
import { useStaggerLabels } from "./use-stagger-labels";

/** Only used when a weapon somehow has no plain swing and the headline falls
 *  back to another move; the move name is swapped in as a coloured element so
 *  the sentence stays one translatable string. */
const MOVE_MARK = "[[move]]";
const MOVE_SPLIT = /(\[\[move\]\])/;

/**
 * How many swings it takes to break this boss's stance.
 *
 * The row is laid out like the damage row above it — value on the left, control
 * on the right — so the band reads as one system instead of two stacked ideas.
 *
 * The phrase is "10 light attacks", not "10 attacks with Light attack": the
 * headline always quotes the plain swing, so naming it as a separate fact
 * printed the word "attack" twice and highlighted something that never changes.
 * The only variable here is the count, so the count is the only thing emphasised.
 */
const StaggerPlanSummary = ({ plan }: { plan: StaggerPlan }) => {
  const { t } = useTranslation();
  const { moveName, attacksWith, lightAttacks } = useStaggerLabels();
  const [expanded, setExpanded] = useState(false);
  const gridId = useId();
  const move = plan.headlineMove;

  const phrase =
    move.key === "light"
      ? lightAttacks(move)
      : attacksWith(move, MOVE_MARK)
          .split(MOVE_SPLIT)
          .map((chunk, index) =>
            chunk === MOVE_MARK ? (
              <span key={index} className="text-zinc-300">
                {moveName(move)}
              </span>
            ) : (
              chunk
            ),
          );

  return (
    <div className="mt-2.5 border-t border-white/[0.06] pt-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
        {t("detail.buildAdvisor.stagger.title")}
      </p>

      <div className="mt-1 flex items-center justify-between gap-3">
        <Tooltip
          label={t("detail.buildAdvisor.stagger.idealSequence")}
          side="bottom"
          align="start"
          wrap
          float
          className="min-w-0"
        >
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            {/* Numeral only in the display face. Cinzel is engraved Roman caps:
                it makes a figure look struck, and any word beside it shouted. */}
            <span className="font-display text-[20px] font-bold leading-none tabular-nums text-zinc-100">
              {move.attacksToBreak}
            </span>
            <span className="text-[11px] leading-snug text-zinc-400">{phrase}</span>
          </p>
        </Tooltip>

        {/* Right of the value, where the damage row keeps its own adjustment
            chip. Sentence case, not a second uppercase heading: this is an
            action, and it has to say what opening it gives you. */}
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={gridId}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] text-[10px] font-medium text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
        >
          {expanded
            ? t("detail.buildAdvisor.stagger.hideMoves")
            : t("detail.buildAdvisor.stagger.compareMoves")}
          <ChevronDown
            size={12}
            className={cn("shrink-0 transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      <div id={gridId}>{expanded && <StaggerMoveGrid plan={plan} />}</div>
    </div>
  );
};

export default StaggerPlanSummary;
