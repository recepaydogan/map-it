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
      "map-it-button",
      variant === "primary" && "map-it-button-primary",
      variant === "danger" && "map-it-button-danger",
      variant === "primary" && "border border-support-accent/50 bg-support-surface text-support-accent hover:bg-white/5",
      variant === "ghost" &&
        "border border-support-border bg-white/[0.03] text-support-zinc-200 hover:border-support-accent/30 hover:text-white",
      variant === "danger" &&
        "border border-support-border bg-white/[0.03] text-rose-300 hover:border-rose-400/40 hover:text-rose-200",
      className,
    )}
    {...rest}
  />
);

export default ActionButton;


