import { Search, X } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "./database-section-title";

const DropSearchHeader = ({ title, count, titleCount, query, onQueryChange, searchThreshold = 30 }: {
  title: ReactNode;
  count: number;
  titleCount?: number;
  query: string;
  onQueryChange: (query: string) => void;
  searchThreshold?: number;
}) => {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const searchable = count > searchThreshold;
  return <>
    <div className="mb-3 flex items-center justify-between gap-2">
      <DatabaseSectionTitle count={titleCount} className="mb-0 min-w-0">{title}</DatabaseSectionTitle>
      {searchable && <button ref={toggleRef} type="button"
        aria-label={t(open ? "database.acquisition.closeDropSearch" : "database.acquisition.searchDrops")}
        aria-expanded={open} aria-controls={open ? inputId : undefined}
        onClick={() => { setOpen((value) => !value); onQueryChange(""); }}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-border text-subtle transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-accent">
        {open ? <X size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
      </button>}
    </div>
    {searchable && open && <div className="mb-3 flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-3 focus-within:border-accent/50">
      <Search size={14} className="shrink-0 text-subtle" aria-hidden="true" />
      <input ref={inputRef} id={inputId} name="drop-search" autoFocus autoComplete="off" spellCheck={false} value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          setOpen(false);
          onQueryChange("");
          toggleRef.current?.focus();
        }}
        aria-label={t("database.acquisition.searchDrops")} placeholder={t("database.acquisition.searchDropsPlaceholder")}
        className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-100 outline-none placeholder:text-subtle" />
      {query && <button type="button" onClick={() => { onQueryChange(""); inputRef.current?.focus(); }}
        aria-label={t("database.clearSearch")}
        className="cursor-pointer rounded text-subtle hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-accent">
        <X size={14} aria-hidden="true" />
      </button>}
    </div>}
  </>;
};

export default DropSearchHeader;
