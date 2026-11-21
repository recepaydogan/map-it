import { cn } from "../../lib/cn";
import { useTranslation } from "react-i18next";

const DatabaseSectionTitle = ({ children, className, count }: { children: React.ReactNode; className?: string; count?: number }) => {
  const { i18n } = useTranslation();
  return (
  <h3 className={cn("mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400", className)}>
    <span className="h-px w-3 bg-accent/60" aria-hidden="true" />{children}
    {count !== undefined && <span className="font-normal tabular-nums tracking-normal text-subtle">{count.toLocaleString(i18n.language)}</span>}
  </h3>
);
};

export default DatabaseSectionTitle;
