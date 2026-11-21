import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export interface StructureSearchResult {
  id: string;
  name: string;
  count: number;
  available: boolean;
}

const WorldStructureSearchControl = ({ query, onQueryChange, results, loading, onSelect, openRevision }: {
  query: string;
  onQueryChange: (query: string) => void;
  results: readonly StructureSearchResult[];
  loading: boolean;
  onSelect: (typeId: string) => void;
  openRevision?: number;
}) => {
  const { t } = useTranslation();
  const [manualOpen, setManualOpen] = useState(false);
  const [closedRevision, setClosedRevision] = useState<number | undefined>();
  const input = useRef<HTMLInputElement>(null);
  const searching = query.trim().length > 0;
  const open = manualOpen || openRevision !== undefined && openRevision !== closedRevision;
  const close = () => { setManualOpen(false); setClosedRevision(openRevision); };
  useEffect(() => {
    if (openRevision === undefined || openRevision === closedRevision) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [openRevision, closedRevision]);

  return <div data-tour="search" className="pointer-events-auto absolute right-3 top-14 z-[60] w-52 max-w-[calc(100%-1.5rem)] @[720px]:top-3">
    {!open ? <button type="button" onClick={() => { setManualOpen(true); requestAnimationFrame(() => input.current?.focus()); }}
      aria-label={t("structureMap.search.label")}
      className={cn("flex h-9 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border bg-surface/95 px-3 text-left text-xs text-zinc-100 shadow-[var(--panel-shadow)] backdrop-blur-xl transition-colors hover:bg-surface-hover",
        searching ? "border-accent/80" : "border-border")}>
      <Search size={15} className={searching ? "text-accent" : undefined} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{query || t("structureMap.search.label")}</span>
    </button> : <div onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
      className={cn("relative h-9 w-full rounded-[var(--radius-md)] border bg-surface/95 shadow-[var(--panel-shadow)] backdrop-blur-xl transition-colors",
        searching ? "rounded-b-none border-accent/80" : "border-border")}>
      <div className="flex h-full min-w-0 items-center gap-2 px-3">
        <Search size={15} className={cn("shrink-0", searching && "text-accent")} aria-hidden="true" />
        <input ref={input} type="text" role="searchbox" value={query} maxLength={128} aria-label={t("structureMap.search.label")}
          placeholder={t("structureMap.search.placeholder")} onChange={event => onQueryChange(event.target.value)}
          onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); if (query) onQueryChange(""); else close(); } }}
          className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-zinc-400" />
        <button type="button" onClick={() => { onQueryChange(""); close(); }} aria-label={t("structureMap.search.close")}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-zinc-400 hover:bg-white/10 hover:text-white">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {searching && <div className="absolute -inset-x-px top-full max-h-64 overflow-y-auto rounded-b-[var(--radius-md)] border border-t-0 border-accent/80 bg-surface/95 p-1.5 shadow-[var(--panel-shadow)] backdrop-blur-xl">
        {results.length ? results.map(result => <button key={result.id} type="button" disabled={!result.available}
          onClick={() => {
            onQueryChange(result.name);
            close();
            onSelect(result.id);
          }}
          className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-xs text-zinc-100 hover:bg-white/10 disabled:cursor-default">
          <span className="min-w-0 flex-1 truncate">{result.name}</span>
          <span className="tabular-nums text-zinc-400">{result.count}{loading ? "+" : ""}</span>
        </button>) : <p className="px-2.5 py-3 text-xs text-zinc-400">{t(loading ? "structureMap.search.loading" : "structureMap.search.noResults")}</p>}
      </div>}
    </div>}
  </div>;
};

export default WorldStructureSearchControl;
