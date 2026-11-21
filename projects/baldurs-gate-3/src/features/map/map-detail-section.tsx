import type { ReactNode } from "react";

interface MapDetailSectionProps {
  id?: string;
  title: string;
  children: ReactNode;
}

/** Shared section chrome copied from the Elden Ring detail panel. */
const MapDetailSection = ({ id, title, children }: MapDetailSectionProps) => (
  <section className="border-t border-border px-4 py-3.5" aria-labelledby={id}>
    <h3 id={id} className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      {title}
    </h3>
    {children}
  </section>
);

export default MapDetailSection;
