import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * The app's multi-line input: same frame as the single-line inputs, sized by
 * `rows`. Every surface that takes prose from the player — a support report, a
 * tip on a marker — uses this one, so they read as the same control.
 */
const FormTextarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    className={cn(
      "w-full resize-y rounded-[var(--radius-md)] border border-support-border bg-black/25 px-3 py-2.5 text-[13px] leading-relaxed text-support-zinc-100 outline-none transition-colors placeholder:text-support-zinc-600 focus:border-support-accent/60 focus:bg-black/40",
      props.className,
    )}
  />
);

export default FormTextarea;


