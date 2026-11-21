import { cn } from "../../../lib/cn";
import type { StaggerPlan } from "./types";
import { useStaggerLabels } from "./use-stagger-labels";

/**
 * Every move this weapon can open with, and what each costs in swings.
 *
 * The recommended move is marked by its frame, not by a second accent number:
 * the same figure is already on the line above in plain white, and colouring it
 * differently down here would read as a different measurement.
 */
const StaggerMoveGrid = ({ plan }: { plan: StaggerPlan }) => {
  const { moveName, attackUnit, damage } = useStaggerLabels();

  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {plan.moves.map((move) => {
        const recommended = move.key === plan.bestMove.key;
        return (
          <div
            key={move.key}
            className={cn(
              "min-w-0 rounded-[var(--radius-sm)] border px-2 py-1.5",
              recommended
                ? "border-accent/30 bg-accent/[0.07]"
                : "border-white/[0.06] bg-black/20",
            )}
          >
            {/* Fixed two-line box: move names wrap at different lengths and the
                grid must not jitter as the reader scans down it. */}
            <p
              className={cn(
                "min-h-[2.4em] break-words text-[10.5px] font-medium leading-[1.2]",
                recommended ? "text-zinc-100" : "text-zinc-300",
              )}
            >
              {moveName(move)}
            </p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="font-display text-[15px] font-bold leading-none tabular-nums text-zinc-100">
                {move.attacksToBreak}
              </span>
              <span className="text-[10px] text-zinc-400">{attackUnit(move)}</span>
            </p>
            <p className="mt-1 break-words text-[10px] leading-[1.25] tabular-nums text-zinc-500">
              {damage(move)}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default StaggerMoveGrid;
