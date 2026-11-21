import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { nativeEntryName } from "./native-wiki-presentation";
import { nativeFieldLabel } from "./native-wiki-labels";
import { useReferenceNavigation } from "./reference-navigation-context";
import type { NativeAcquisition, NativeWikiLocation } from "./use-native-wiki";
import { getMapDefinition } from "../map/map-registry";
import NativeWikiValues from "./native-wiki-values";
import { acquisitionPayload, acquisitionVariants } from "./native-wiki-acquisition-model";

const kinds = ["native-container-loot", "native-combat-group-reward", "native-flow-reward", "native-shop-entry", "native-loot-entry"];
const kindsLabels: Record<string, string> = {
  "native-container-loot": "containers", "native-combat-group-reward": "combatRewards",
  "native-flow-reward": "flowRewards",
  "native-shop-entry": "shops", "native-loot-entry": "lootDefinitions",
};
const columnFields = ["Probability", "EnemyLevel", "ItemLevel", "ConsumeDust"];
const summaryFields = new Set(["ItemID", "SellItemID", "MinAmount", "MaxAmount", ...columnFields]);

const NativeWikiAcquisition = ({ rows, entryId, itemPage, locations, onOpenMap }: { rows: NativeAcquisition[]; entryId: string; itemPage: boolean; locations: NativeWikiLocation[]; onOpenMap: (mapId: string, markerId: string) => void }) => {
  const { t, i18n } = useTranslation();
  const open = useReferenceNavigation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const number = (value: unknown) => typeof value === "number" ? value.toLocaleString(i18n.language) : "—";
  const groupedKinds = [...new Set([...kinds, ...rows.map(row => row.kind)])];
  return <div className="space-y-7">{groupedKinds.map(kind => {
    const originals = rows.filter(row => row.kind === kind);
    if (!originals.length) return null;
    const variants = acquisitionVariants(originals);
    const payloads = variants.map(({ row }) => acquisitionPayload(row));
    const availableFields = columnFields.filter(field => payloads.some(payload => payload[field] !== undefined));
    const commonFields = availableFields.filter(field => payloads.every(payload => payload[field] === payloads[0][field]));
    const fields = availableFields.filter(field => !commonFields.includes(field));
    const showAmount = payloads.some(payload => payload.MinAmount !== undefined || payload.MaxAmount !== undefined);
    const showSource = variants.some(({ row }) => row.actor || row.actors?.length);
    const showItem = !itemPage || variants.some(({ row }) => row.items?.some(item => item.id !== entryId));
    const linkedLocations = new Map(locations.map(location => [location.markerId, location]));
    const showRegion = variants.some(({ row }) => row.containerId && linkedLocations.has(row.containerId));
    return <section key={kind} className="min-w-0">
      <DatabaseSectionTitle>{t(`wiki.acquisitionView.${kindsLabels[kind] ?? "lootDefinitions"}`)}</DatabaseSectionTitle>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
        <p>{t("wiki.acquisitionView.summary", { count: originals.length, variants: variants.length })}</p>
        {!showSource && <p>{t(kind === "native-shop-entry" ? "wiki.acquisitionView.sellerUnlinked" : "wiki.acquisitionView.sourceUnlinked")}</p>}
      </div>
      {commonFields.length > 0 && <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">{commonFields.map(field => <div key={field} className="flex items-baseline gap-2"><dt className="text-subtle">{field === "Probability" ? t("wiki.acquisitionView.probability") : nativeFieldLabel(field)}</dt><dd className="text-zinc-200"><NativeWikiValues value={payloads[0][field]} field={field} /></dd></div>)}</dl>}


      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border">
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-border bg-surface text-xs text-subtle"><tr>
              {showSource && <th scope="col" className="px-4 py-3 font-medium">{t(kind === "native-flow-reward" ? "wiki.acquisitionView.sceneOwner" : "wiki.acquisitionView.obtainedFrom")}</th>}
              {showRegion && <th scope="col" className="px-4 py-3 font-medium">{t("wiki.acquisitionView.region")}</th>}
              {showItem && <th scope="col" className="px-4 py-3 font-medium">{t("wiki.fields.ItemID")}</th>}
              {showAmount && <th scope="col" className="px-4 py-3 font-medium">{t("wiki.acquisitionView.amount")}</th>}
              {fields.map(field => <th scope="col" key={field} className="px-4 py-3 font-medium">{field === "Probability" ? t("wiki.acquisitionView.probability") : nativeFieldLabel(field)}</th>)}
              <th scope="col" className="px-4 py-3 font-medium">{t("wiki.acquisitionView.records")}</th>
              <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">{t("wiki.details")}</span></th>
            </tr></thead>
            <tbody className="divide-y divide-border">{(showAll.has(kind) ? variants : variants.slice(0, 5)).map(({ row, records }, index) => {
              const payload = payloads[index];
              const targets = row.actor ? [row.actor, ...(row.actors ?? [])] : row.actors ?? [];
              const additional = Object.fromEntries(Object.entries(payload).filter(([key]) => !summaryFields.has(key)));
              const minimum = payload.MinAmount ?? payload.MaxAmount;
              const maximum = payload.MaxAmount ?? minimum;
              const isExpanded = expanded.has(row.id);
              const location = row.containerId ? linkedLocations.get(row.containerId) : undefined;
              return <Fragment key={row.id}><tr className="align-top text-zinc-200">
                {showSource && <td className="max-w-64 px-4 py-3"><div className="flex flex-wrap gap-x-3 gap-y-1">{targets.length ? targets.map(target => <button type="button" key={target.id} onClick={() => open(target)} className="cursor-pointer text-left text-accent hover:underline">{nativeEntryName(target)}</button>) : <span className="text-subtle">{t("wiki.acquisitionView.unlinked")}</span>}</div></td>}
                {showRegion && <td className="px-4 py-3">{location ? <button type="button" onClick={() => onOpenMap(location.mapId, location.markerId)} className="cursor-pointer text-left text-accent hover:underline" title={t("wiki.acquisitionView.openMap")}>{getMapDefinition(location.mapId).name}</button> : "—"}</td>}
                {showItem && <td className="min-w-40 px-4 py-3"><NativeWikiValues value={payload.ItemID ?? payload.SellItemID ?? row.native_item_id} field="ItemID" /></td>}
                {showAmount && <td className="whitespace-nowrap px-4 py-3 tabular-nums">{minimum === maximum ? number(minimum) : `${number(minimum)}–${number(maximum)}`}</td>}
                {fields.map(field => <td key={field} className="px-4 py-3 tabular-nums"><NativeWikiValues value={payload[field]} field={field} /></td>)}
                <td className="px-4 py-3 tabular-nums text-subtle">{records.length}</td>
                <td className="px-4 py-3"><button type="button" aria-expanded={isExpanded} aria-controls={`acquisition-${row.id}`} onClick={() => setExpanded(current => {
                  const next = new Set(current);
                  if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                  return next;
                })} className="cursor-pointer whitespace-nowrap text-xs text-subtle hover:text-white">{t(isExpanded ? "wiki.acquisitionView.hideDetails" : "wiki.details")}</button></td>
              </tr>{isExpanded && <tr id={`acquisition-${row.id}`}><td colSpan={Number(showSource) + Number(showRegion) + Number(showItem) + Number(showAmount) + fields.length + 2} className="px-4 py-4">
                  <div className="space-y-3">
                    {Object.keys(additional).length > 0 && <NativeWikiValues value={additional} />}
                    <p className="text-subtle">{t("wiki.acquisitionView.recordDetails")}</p>
                    {records.map((record, recordIndex) => <details key={`${record.id}:${recordIndex}`} className="rounded border border-border p-3 text-xs">
                      <summary className="cursor-pointer text-subtle">{t("wiki.acquisitionView.record", { index: recordIndex + 1 })}</summary>
                      <p className="mt-2 break-all text-[11px] text-muted">{record.source}{record.source_pointer}</p>
                      <pre className="scroll-slim mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-zinc-300">{JSON.stringify(record, null, 2)}</pre>
                    </details>)}
                  </div>
                </td></tr>}</Fragment>;
            })}</tbody>
          </table>
        </div>
        {variants.length > 5 && <button type="button" aria-expanded={showAll.has(kind)} onClick={() => setShowAll(current => {
          const next = new Set(current);
          if (next.has(kind)) next.delete(kind); else next.add(kind);
          return next;
        })} className="w-full cursor-pointer border-t border-border px-4 py-3 text-left text-xs text-subtle hover:text-white">{t(showAll.has(kind) ? "wiki.acquisitionView.showLess" : "wiki.acquisitionView.showAll", { count: variants.length })}</button>}
      </div>
    </section>;
  })}</div>;
};
export default NativeWikiAcquisition;
