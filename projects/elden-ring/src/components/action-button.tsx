import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type ActionButtonVariant = "ghost" | "primary" | "danger";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
}

/**
 * The app's quiet form button — the one that sits under a textarea, in a confirm
 * row, or beside a status chip. Shared rather than restyled per surface so a
 * "Send" in support and a "Post tip" on a marker cannot drift apart on padding
 * or hover state.
 *
 * Not to be confused with the map's round icon controls (map-action-button):
 * this one is for form chrome, that one is for the map itself.
 */
const ActionButton = ({
  variant = "ghost",
  className,
  type = "button",
  ...rest
}: ActionButtonProps) => (
  <button
    type={type}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-[12.5px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
      variant === "primary" && "bg-accent text-on-accent hover:bg-accent/90",
      variant === "ghost" &&
        "border border-border bg-white/[0.03] text-zinc-200 hover:border-accent/30 hover:text-white",
      variant === "danger" &&
        "border border-border bg-white/[0.03] text-rose-300 hover:border-rose-400/40 hover:text-rose-200",
      className,
    )}
    {...rest}
  />
);

export default ActionButton;
