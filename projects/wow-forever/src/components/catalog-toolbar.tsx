import { ArrowLeft } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { cn } from "../lib/cn";
import "./catalog-toolbar.css";

export function CatalogToolbar({ back, filters, search, className, tour }: {
  back?: ReactNode;
  filters?: ReactNode;
  search: ReactNode;
  className?: string;
  tour?: string;
}) {
  return <div className={cn("catalog-header", className)} data-tour={tour}>
    {back && <div className="catalog-header-back">{back}</div>}
    <div className="catalog-header-controls">
      {filters && <div className="catalog-header-filters">{filters}</div>}
      <div className="catalog-header-search">{search}</div>
    </div>
  </div>;
}

export function CatalogBackButton({ label, onClose, ref }: {
  label: string;
  onClose: () => void;
  ref: Ref<HTMLButtonElement>;
}) {
  return <button ref={ref} type="button" className="catalog-back-button" onClick={onClose} onKeyDown={event => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.stopPropagation();
    onClose();
  }}>
    <ArrowLeft size={14} aria-hidden="true" />
    {label}
  </button>;
}
