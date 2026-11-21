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
      "map-it-field resize-y",
      props.className,
    )}
  />
);

export default FormTextarea;


