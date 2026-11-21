import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { cn } from "../../lib/cn";
import { openRobRunPreviewAsPage, useRobRunPreview, type RobRunPreviewTarget } from "./rob-run-catalog-navigation";
import { getAlternateShipment, getShipmentCashCost, type CatalogItem, type Economy } from "./rob-run-data";
import { itemRarityClass, RobRunItemIcon } from "./rob-run-rarity";
import "./rob-run-detail.css";

export function DetailSection({ title, children, as = "h2" }: {
  title: string; children: ReactNode; as?: "h2" | "h3";
}) {
  return <section className="rob-run-detail-section">
    <DatabaseSectionTitle as={as}>{title}</DatabaseSectionTitle>
    {children}
  </section>;
}

export function DetailFacts({ rows }: { rows: readonly [string, ReactNode][] }) {
  return <dl className="rob-run-detail-facts">{rows.map(([key, value]) =>
    <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

export function AlternateShipment({ economy, itemId, itemName, format }: {
  economy?: Economy; itemId: string; itemName: (id: string) => string; format: Intl.NumberFormat;
}) {
  const { t } = useTranslation();
  const alternate = getAlternateShipment(economy, itemId);
  if (!alternate) return null;
  return <DetailSection title={t("robRun.wiki.alternateResearch", { version: alternate.version })}>
    <DetailFacts rows={[...alternate.path.map((node): [string, string] =>
      [itemName(node.item), format.format(getShipmentCashCost(node))]),
      [t("robRun.wiki.totalResearch"), format.format(alternate.cost)]]} />
  </DetailSection>;
}

export function DetailItemLink({ item, meta, subtitle, onSelect }: {
  item: Pick<CatalogItem, "id" | "name" | "icon" | "rarity" | "reference">; meta?: ReactNode; subtitle?: string; onSelect?: (id: string) => void;
}) {
  const preview = useRobRunPreview();
  const target = { page: "items", id: item.id, name: item.name } as const;
  const active = preview ? preview.target?.page === "items" && preview.target.id === item.id : undefined;
  return <button type="button" className="rob-run-detail-link" aria-pressed={active}
    onClick={() => onSelect ? onSelect(item.id) : (preview?.open ?? openRobRunPreviewAsPage)(target)}>
    <RobRunItemIcon item={item} loading="lazy" />
    <span className="min-w-0 flex-1">
      <span className={cn("block break-words", itemRarityClass(item))}>{item.name}</span>
      {subtitle && <span className="mt-0.5 block text-[11px] text-muted">{subtitle}</span>}
    </span>
    {meta !== undefined && <small>{meta}</small>}
    <ChevronRight size={14} aria-hidden="true" />
  </button>;
}

export function DetailRecordLink({ target, label, meta, icon, ariaLabel }: {
  target: RobRunPreviewTarget; label?: string; meta?: ReactNode; icon?: ReactNode; ariaLabel?: string;
}) {
  const preview = useRobRunPreview();
  const active = preview ? preview.target?.page === target.page && preview.target.id === target.id
    && preview.target.vendorItemId === target.vendorItemId && preview.target.realmVersion === target.realmVersion : undefined;
  return <button type="button" className="rob-run-detail-action" aria-pressed={active} aria-label={ariaLabel}
    onClick={() => (preview?.open ?? openRobRunPreviewAsPage)(target)}>
    {icon}<span className="rob-run-detail-action-label">{label ?? target.name}</span>
    {meta !== undefined && <small>{meta}</small>}
    <ChevronRight size={14} aria-hidden="true" />
  </button>;
}
