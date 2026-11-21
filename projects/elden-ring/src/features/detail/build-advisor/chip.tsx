import type { ReactNode } from "react";

/** One fact, sized to its own content — optionally colour-keyed to its combat
 *  type. Shared by the weapon card's details drawer and the stance-break line so
 *  a tag never renders two ways on the same card. */
const Chip = ({ dot, children }: { dot?: string; children: ReactNode }) => (
  <span className="flex items-center gap-1.5 rounded-[var(--radius-full)] border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-300">
    {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />}
    {children}
  </span>
);

export default Chip;
