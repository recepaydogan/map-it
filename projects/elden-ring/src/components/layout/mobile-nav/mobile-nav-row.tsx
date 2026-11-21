import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../lib/cn";

interface MobileNavRowProps {
  icon: LucideIcon;
  label: string;
  /** Renders the accent treatment — the surface this row leads to is the open one. */
  active?: boolean;
  /** Small accent dot on the icon: something is waiting on the user in there. */
  dot?: boolean;
  /** Optional right-hand element (a value, a chevron, a flag). */
  trailing?: ReactNode;
  onClick: () => void;
}

/**
 * One row in the phone navigation drawer. Deliberately taller than the desktop
 * tab strip it replaces: 48px of hit area is the floor for a thumb, where the
 * title bar's 40px icon buttons were built for a mouse.
 */
const MobileNavRow = ({ icon: Icon, label, active = false, dot = false, trailing, onClick }: MobileNavRowProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-left text-[14.5px] font-medium transition-colors cursor-pointer",
      active
        ? "bg-accent-soft text-white"
        : "text-zinc-300 hover:bg-white/[0.06] active:bg-white/[0.06] hover:text-white",
    )}
  >
    <span className="relative grid shrink-0 place-items-center">
      <Icon size={18} className={active ? "text-accent" : "text-zinc-500"} aria-hidden="true" />
      {dot && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-accent"
        />
      )}
    </span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {trailing}
  </button>
);

export default MobileNavRow;
