import type { ReactNode } from "react";

interface DetailSectionProps {
  title: string;
  children: ReactNode;
}

/** Titled block in the detail panel. Keeps section chrome consistent. */
const DetailSection = ({ title, children }: DetailSectionProps) => (
  <section className="border-t border-border px-4 py-3.5">
    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      {title}
    </h3>
    {children}
  </section>
);

export default DetailSection;
