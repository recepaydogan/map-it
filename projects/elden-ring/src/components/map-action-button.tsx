import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

interface MapActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const MapActionButton = forwardRef<HTMLButtonElement, MapActionButtonProps>(
  ({ active = false, className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        // 32px on touch — matched to the game-switcher pills and the layer
        // dropdown they share the row with, which are 32 tall (py-1.5 + a 13px
        // line). A taller square made the trio tower over its own toolbar.
        // Overwolf (≥1300px) always gets the 36px form.
        "relative grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border backdrop-blur-xl transition-colors cursor-pointer sm:h-9 sm:w-9",
        active
          ? "border-accent bg-accent text-on-accent"
          : "border-border bg-surface/85 text-zinc-300 hover:bg-surface-hover hover:text-white",
        props.disabled && "cursor-not-allowed text-white/70 hover:bg-surface/85 hover:text-white/70",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);

MapActionButton.displayName = "MapActionButton";

export default MapActionButton;
