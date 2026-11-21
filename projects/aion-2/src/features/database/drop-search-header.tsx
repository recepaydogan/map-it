import { Search, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import SearchField from "../../components/search-field";
import DatabaseSectionTitle from "./database-section-title";

const DropSearchHeader = ({ title, count, titleCount, query, onQueryChange, searchLabel }: {
  title: ReactNode;
  count: number;
  titleCount?: number;
  query: string;
  onQueryChange: (query: string) => void;
  searchLabel?: string;
}) => {
  const { t } = useTranslation();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const searchable = count > 30;
  const label = searchLabel ?? t("database.acquisition.searchDrops");
  return <>
    <div className="mb-3 flex items-center justify-between gap-2">
      <DatabaseSectionTitle count={titleCount} className="mb-0 min-w-0">{title}</DatabaseSectionTitle>
      {searchable && <button type="button" aria-label={open ? t("database.clearSearch") : label}
        aria-expanded={open} aria-controls={open ? inputId : undefined}
        onClick={() => { setOpen((value) => !value); onQueryChange(""); }}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-border text-subtle transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-accent">
        {open ? <X size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
      </button>}
    </div>
    {searchable && open && <SearchField id={inputId} autoFocus value={query} onChange={onQueryChange} label={label} className="mb-3" />}
  </>;
};

export default DropSearchHeader;
