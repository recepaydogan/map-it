import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { CatalogBackButton, CatalogToolbar } from "./catalog-toolbar";
import LevelRangeFilter, { type LevelRangeInput } from "./level-range-filter";
import "./catalog-workspace.css";
import "./layout/reference-panels.css";

export function CatalogWorkspace({ label, search, filters, listBack, categories, categoryLabel, children, detail, onCloseDetail, backLabel, tour }: {
  label: string;
  search: ReactNode;
  filters?: ReactNode;
  listBack?: ReactNode;
  categories?: ReactNode;
  categoryLabel?: string;
  children: ReactNode;
  detail?: ReactNode;
  onCloseDetail?: () => void;
  backLabel?: string;
  tour?: string;
}) {
  const { t } = useTranslation();
  const results = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const browsingDetail = Boolean(detail);
  useEffect(() => {
    if (browsingDetail && returnFocus.current) backButton.current?.focus();
  }, [browsingDetail]);
  const close = () => {
    onCloseDetail?.();
    requestAnimationFrame(() => (returnFocus.current?.isConnected ? returnFocus.current : results.current?.querySelector("button"))?.focus());
  };
  return <div className="catalog-workspace">
    <section className="catalog-frame" aria-label={label}>
      <div className={cn("catalog-body reference-panels", browsingDetail && "catalog-body-detail", !categories && "catalog-body-full-width")}>
        {categories && <aside className="catalog-categories reference-categories" aria-label={categoryLabel}>{categories}</aside>}
        <div className="catalog-content reference-content">
          <CatalogToolbar className="catalog-toolbar reference-toolbar" tour={tour} search={search} filters={filters}
            back={browsingDetail ? <CatalogBackButton ref={backButton} label={backLabel ?? t("reference.backToList")} onClose={close} />
              : listBack} />
          <div ref={results} className="catalog-scroll" hidden={browsingDetail} onFocusCapture={(event) => {
            if (event.target instanceof HTMLButtonElement) returnFocus.current = event.target;
          }}>{children}</div>
          {browsingDetail && <div className="catalog-detail" onKeyDown={(event) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            event.stopPropagation(); close();
          }}>
            {detail}
          </div>}
        </div>
      </div>
    </section>
  </div>;
}

export function CatalogSearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return <div className="catalog-search">
    <Search size={15} aria-hidden="true" />
    <input value={value} onChange={event => onChange(event.target.value)} placeholder={label} aria-label={label} />
    {value && <button type="button" onClick={() => onChange("")} aria-label={t("database.clearSearch")}><X size={14} aria-hidden="true" /></button>}
  </div>;
}

export function CatalogCategory({ active, onClick, children, nested, expanded }: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  nested?: boolean;
  expanded?: boolean;
}) {
  return <button type="button" className={cn("catalog-category", nested && "catalog-category-nested")}
    aria-pressed={active} aria-expanded={expanded} onClick={onClick}>{children}</button>;
}

export function CatalogLevelFilter({ value, onChange }: { value: LevelRangeInput; onChange: (value: LevelRangeInput) => void }) {
  const { t } = useTranslation();
  const [min, max] = value;
  return <details className="catalog-range" onBlur={(event) => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={(event) => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.stopPropagation(); event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }}>
    <summary aria-label={t("spells.levelRange")}>
      {min || max ? `${min || 1}–${max || 60}` : t("spells.levelRange")} <ChevronDown size={14} aria-hidden="true" />
    </summary>
    <div className="catalog-range-popover"><LevelRangeFilter value={value} onChange={onChange} /></div>
  </details>;
}

export type CatalogColumn = { label: string; width?: string; align?: "end"; compact?: boolean };

export function CatalogTable({ label, columns, children }: { label: string; columns: CatalogColumn[]; children: ReactNode }) {
  return <table className="catalog-table" aria-label={label}>
    <thead><tr>{columns.map(({ label: name, width, align, compact }) => <th key={name} scope="col" style={{ width }}
      className={cn(align === "end" && "catalog-number", compact && "catalog-wide-column")}>{name}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table>;
}

export function CatalogRow({ title, icon, description, badge, selected, onOpen, children }: {
  title: string;
  icon?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  selected?: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return <tr data-selected={selected || undefined} onClick={onOpen}>
    <td><button type="button" className="catalog-row-open" onClick={event => {
      event.stopPropagation(); onOpen();
    }}>
      {icon}<span className="min-w-0"><span className="catalog-row-title">{title} {badge}</span>
        {description && <span className="catalog-row-description">{description}</span>}
      </span>
    </button></td>
    {children}
  </tr>;
}
