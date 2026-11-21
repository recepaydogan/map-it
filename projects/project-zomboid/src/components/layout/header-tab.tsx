import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface HeaderTabProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
  dataTour?: string;
  attention?: boolean;
  badge?: boolean;
  className?: string;
}

/** Shared header navigation shape: icon + visible name, with one compact active state. */
const HeaderTab = ({
  icon,
  label,
  active,
  onClick,
  title = label,
  dataTour,
  attention = false,
  badge = false,
  className,
}: HeaderTabProps) => (
  <button
    type="button"
    data-ow-no-drag
    data-tour={dataTour}
    onClick={onClick}
    aria-label={title}
    aria-current={active ? "page" : undefined}
    title={title}
    className={cn(
      "relative flex h-10 max-w-32 shrink-0 cursor-pointer items-center gap-1.5 px-2.5 text-[11.5px] font-medium transition-colors",
      active
        ? "bg-accent-soft text-accent"
        : "text-white/75 hover:bg-white/8 hover:text-white",
      attention && !active && "faq-discovery-pulse text-accent",
      className,
    )}
  >
    <span className="shrink-0" aria-hidden="true">{icon}</span>
    <span className="min-w-0 truncate">{label}</span>
    {badge && (
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-[var(--radius-full)] bg-accent"
      />
    )}
  </button>
);

export default HeaderTab;
