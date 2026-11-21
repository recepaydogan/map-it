import { ChevronDown, type LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";

interface MapDropdownTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: ReactNode;
  open: boolean;
  iconClassName?: string;
  labelClassName?: string;
}

/** Shared map-toolbar trigger so every dropdown communicates the same states. */
const MapDropdownTrigger = forwardRef<HTMLButtonElement, MapDropdownTriggerProps>(({
  icon: Icon,
  label,
  open,
  className,
  iconClassName,
  labelClassName,
  ...props
}, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "group flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-3 text-[12px] font-semibold outline-none shadow-lg backdrop-blur-xl transition-[background-color,border-color,box-shadow,color]",
      className,
      open
        ? "border-accent bg-accent text-on-accent shadow-[0_10px_30px_rgba(var(--gold-rgb),0.38)] hover:bg-accent"
        : "border-border bg-surface/90 text-zinc-100 hover:border-accent/40 hover:bg-surface-hover",
    )}
    {...props}
  >
    <Icon size={15} className={cn("shrink-0 text-accent", iconClassName, open && "text-on-accent")} aria-hidden="true" />
    <span className={cn("min-w-0 flex-1 truncate text-left", labelClassName)}>{label}</span>
    <ChevronDown
      size={13}
      className={cn("shrink-0 transition-[color,transform]", open ? "rotate-180 text-on-accent" : "text-zinc-400")}
      aria-hidden="true"
    />
  </button>
));

MapDropdownTrigger.displayName = "MapDropdownTrigger";

export default MapDropdownTrigger;
