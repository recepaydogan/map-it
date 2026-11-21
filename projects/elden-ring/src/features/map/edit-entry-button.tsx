import { Move } from "lucide-react";
import Tooltip from "../../components/tooltip";
import { cn } from "../../lib/cn";
import { useIsMobile } from "../../utils/platform";

interface EditEntryButtonProps {
  label: string;
  hint: string;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * The way IN to marker-edit mode, on both map surfaces.
 *
 * Hidden on phones. Edit mode is a precision authoring tool — drag a pin a few
 * world-units, undo, review a changes list — that needs a pointer and screen room
 * it can't get at 390px; the only thing it does there is float a pill over the
 * middle of the map. Gating the ENTRY (rather than each control) keeps the whole
 * mode unreachable at that width, so nothing downstream needs its own guard.
 */
const EditEntryButton = ({ label, hint, onClick, disabled = false }: EditEntryButtonProps) => {
  const isMobile = useIsMobile();
  if (isMobile) return null;

  return (
    <div className="pointer-events-auto absolute right-3 top-1/2 z-[1300] -translate-y-1/2">
      <Tooltip label={hint} align="end">
        <button
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface/90 px-3 py-1.5 text-[12px] font-medium text-zinc-300 backdrop-blur-xl transition-colors hover:border-accent/50 hover:text-white cursor-pointer",
            disabled && "cursor-not-allowed opacity-70 hover:border-border hover:text-zinc-300",
          )}
        >
          <Move size={14} aria-hidden="true" /> {label}
        </button>
      </Tooltip>
    </div>
  );
};

export default EditEntryButton;
