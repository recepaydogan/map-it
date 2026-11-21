import type { ReactNode } from "react";

interface MobileNavSectionProps {
  label: string;
  children: ReactNode;
}

/**
 * A labelled run of rows in the drawer. The heading uses the same engraved
 * uppercase caption the Settings and Archive surfaces use for their section
 * rules, so the drawer reads as part of the app rather than as browser chrome.
 */
const MobileNavSection = ({ label, children }: MobileNavSectionProps) => (
  <section className="px-2 py-2">
    <h2 className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
      {label}
    </h2>
    <div className="flex flex-col gap-0.5">{children}</div>
  </section>
);

export default MobileNavSection;
