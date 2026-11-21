import { ChevronLeft, ChevronRight, LayoutGrid, Search, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./item-catalog.css";

type CategoryButtonProps = {
  label: string;
  count?: string;
  active: boolean;
  expanded?: boolean;
  onSelect: () => void;
};

export function ItemCatalogCategory({ label, count, active, expanded, onSelect }: CategoryButtonProps) {
  return (
    <button type="button" className="item-catalog-category" aria-pressed={active}
      aria-expanded={expanded} onClick={onSelect}>
      <span>{label}</span>
      {(count !== undefined || expanded !== undefined) && <span className="item-catalog-category-meta">
        {count !== undefined && <span className="item-catalog-count">{count}</span>}
        {expanded !== undefined && <ChevronRight className="item-catalog-category-chevron" size={13} aria-hidden="true" />}
      </span>}
    </button>
  );
}

type SearchProps = {
  query: string;
  label: string;
  clearLabel: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

export function ItemCatalogSearch({ query, label, placeholder = label, clearLabel, onChange }: SearchProps) {
  return (
    <div className="item-catalog-search">
      <Search size={15} aria-hidden="true" />
      <input type="search" value={query} placeholder={placeholder} aria-label={label}
        onChange={(event) => onChange(event.target.value)} />
      {query && <button type="button" onClick={() => onChange("")} aria-label={clearLabel}><X size={14} aria-hidden="true" /></button>}
    </div>
  );
}

export type ItemCatalogRow = {
  id: string;
  label: string;
  href?: string;
  icon?: ReactNode;
  nameClassName?: string;
  subtitle?: string;
  cells: readonly ReactNode[];
};

type ItemCatalogProps = {
  label: string;
  search: SearchProps;
  toolbar?: ReactNode;
  categories?: ReactNode;
  categoryLabel?: string;
  landingCategories?: readonly (Pick<CategoryButtonProps, "label" | "count" | "onSelect"> & { id: string; icon?: ReactNode })[];
  artwork?: string;
  wordmark?: string;
  gameName?: string;
  columns: readonly { label: string; numeric?: boolean }[];
  rows: readonly ItemCatalogRow[];
  onOpen: (id: string) => void;
  onBack: () => void;
  backLabel: string;
  backInToolbar?: boolean;
  detail?: ReactNode;
  emptyMessage: ReactNode;
  afterRows?: ReactNode;
};

export default function ItemCatalog({
  label, search, toolbar, categories, categoryLabel, landingCategories, artwork, wordmark, gameName, columns, rows,
  onOpen, onBack, backLabel, backInToolbar, detail, emptyMessage, afterRows,
}: ItemCatalogProps) {
  const { t } = useTranslation();
  const categoriesHeading = t("itemCatalog.categories");
  const hasRowIcons = rows.some((row) => Boolean(row.icon));
  const [browsing, setBrowsing] = useState(Boolean(detail || search.query.trim()));
  const backButton = useRef<HTMLButtonElement>(null);
  const lastRow = useRef<HTMLElement | null>(null);
  const tablePanel = useRef<HTMLDivElement>(null);

  const closeDetail = () => {
    setBrowsing(true);
    onBack();
    requestAnimationFrame(() => {
      (lastRow.current?.isConnected ? lastRow.current : tablePanel.current)?.focus();
    });
  };
  const handleDetailEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      closeDetail();
    }
  };
  const backControl = <button type="button" className="item-catalog-back" ref={backButton} onClick={closeDetail}
    onKeyDown={backInToolbar ? handleDetailEscape : undefined}>
    <ChevronLeft size={15} aria-hidden="true" />{backLabel}
  </button>;

  const landing = Boolean(landingCategories?.length && !browsing && !detail);
  const [allItems, ...featuredCategories] = landingCategories ?? [];
  const browse = (onSelect: () => void) => {
    onSelect();
    setBrowsing(true);
    requestAnimationFrame(() => tablePanel.current?.focus());
  };

  return (
    <section className="item-catalog" aria-label={label} data-landing={landing}>
      <div className="item-catalog-frame">
        {landing && artwork && <img className="item-catalog-artwork" src={artwork} alt="" />}
        {landing && <div className="item-catalog-heading">
          <h1>{wordmark ? <img className="item-catalog-wordmark" src={wordmark} alt={gameName || label} />
            : gameName || label}</h1>
          {gameName && <p className="item-catalog-heading-label">{label}</p>}
        </div>}
        <div className="item-catalog-body" data-categories={Boolean(categories) && !landing} data-detail={Boolean(detail)}>
          {!landing && categories && <aside className="item-catalog-categories" aria-label={categoryLabel ?? categoriesHeading}>
            <h2>{categoriesHeading}</h2>
            <div className="item-catalog-category-list">{categories}</div>
          </aside>}
          <div className="item-catalog-results">
            <div className="item-catalog-toolbar">
              <ItemCatalogSearch {...search} onChange={(value) => {
                if (value.trim()) setBrowsing(true);
                search.onChange(value);
              }} />
              {toolbar && <div className="item-catalog-filters" hidden={landing}>{toolbar}</div>}
              {detail && backInToolbar && backControl}
            </div>
            {!landing && <div className="item-catalog-table-panel" hidden={Boolean(detail)} ref={tablePanel} tabIndex={-1}>
              <table className="item-catalog-table" aria-label={label}>
                <thead><tr>
                  <th scope="col">{label}</th>
                  {columns.map(({ label, numeric }) => <th key={label} scope="col" data-numeric={numeric}>{label}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const name = <>
                      {hasRowIcons && <span className="item-catalog-row-icon" aria-hidden="true">{row.icon}</span>}
                      <span className="item-catalog-row-text">
                        <span className={row.nameClassName} title={row.label}>{row.label}</span>
                        {row.subtitle && <small>{row.subtitle}</small>}
                      </span>
                    </>;
                    return <tr key={row.id} onClick={(event) => {
                      if (row.href && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
                      event.preventDefault();
                      lastRow.current = event.currentTarget.querySelector(".item-catalog-row");
                      onOpen(row.id);
                      requestAnimationFrame(() => backButton.current?.focus());
                    }}>
                      <td>
                        {row.href ? <a className="item-catalog-row" href={row.href}>{name}</a>
                          : <button type="button" className="item-catalog-row">{name}</button>}
                      </td>
                      {row.cells.map((cell, index) => <td key={index} data-numeric={columns[index]?.numeric}>{cell}</td>)}
                    </tr>;
                  })}
                  {rows.length === 0 && <tr className="item-catalog-message"><td colSpan={columns.length + 1}>{emptyMessage}</td></tr>}
                  {afterRows && <tr className="item-catalog-message"><td colSpan={columns.length + 1}>{afterRows}</td></tr>}
                </tbody>
              </table>
            </div>}
            {detail && <section className="item-catalog-detail" onKeyDown={handleDetailEscape}>
              {!backInToolbar && <div className="item-catalog-detail-toolbar">{backControl}</div>}
              <div className="item-catalog-detail-body">{detail}</div>
            </section>}
          </div>
        </div>
        {landing && <section className="item-catalog-landing">
          <div className="item-catalog-landing-heading">
            <h2><LayoutGrid size={17} aria-hidden="true" />{t("itemCatalog.browseByCategory")}</h2>
            {allItems && <button type="button" onClick={() => browse(allItems.onSelect)}>
              {t("itemCatalog.viewAll")}
            </button>}
          </div>
          <div className="item-catalog-tiles">
            {featuredCategories.map(({ id, label: category, icon, onSelect }) =>
              <button type="button" key={id} className="item-catalog-tile" onClick={() => browse(onSelect)}>
                {icon && <span className="item-catalog-tile-icon" aria-hidden="true">{icon}</span>}
                <span>{category}</span>
              </button>)}
          </div>
        </section>}
      </div>
    </section>
  );
}
