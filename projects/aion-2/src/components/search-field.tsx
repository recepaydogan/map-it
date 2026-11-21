import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";

const SearchField = ({ value, onChange, label, id, autoFocus = false, className }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  return <div className={cn("flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-3 focus-within:border-accent/50", className)}>
    <Search size={14} className="shrink-0 text-subtle" aria-hidden="true" />
    <input id={id} autoFocus={autoFocus} autoComplete="off" spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)}
      aria-label={label} placeholder={label}
      className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-100 outline-none placeholder:text-subtle" />
    {value && <button type="button" onClick={() => onChange("")} aria-label={t("database.clearSearch")}
      className="cursor-pointer text-subtle hover:text-zinc-100"><X size={14} aria-hidden="true" /></button>}
  </div>;
};

export default SearchField;
