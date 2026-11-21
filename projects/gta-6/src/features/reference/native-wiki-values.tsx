import { useTranslation } from "react-i18next";
import { useReferenceNavigation } from "./reference-navigation-context";
import { useNativeWikiIndex } from "./use-native-wiki";
import { humanizeNativeLabel, nativeFieldLabel } from "./native-wiki-labels";
import NativeRichText from "./native-rich-text";
import { hasPlayerFacingValue, isNativeItemReferenceField, isNativeMapReferenceField, isPlayerFacingField, isTechnicalNativeValue, nativeEntryName } from "./native-wiki-presentation";
import { formatGameName } from "../../lib/game-display-text";
import { TRACKING_REGION_MAPS } from "../map/map-registry";
import { getMapDisplayName } from "../map/map-display-name";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import NativeWikiContent from "./native-wiki-content";
import { nativeDisplayContent } from "./native-wiki-content-model";

/** Resolve meaningful references to names; never display raw identifiers or asset paths. */
const NativeWikiValues = ({ value, field = "", columns = true }: { value: unknown; field?: string; columns?: boolean }) => {
  const { t, i18n } = useTranslation();
  const index = useNativeWikiIndex();
  const open = useReferenceNavigation();
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  if (typeof value === "boolean") return <span>{t(value ? "wiki.yes" : "wiki.no")}</span>;
  if (typeof value === "number") return <span className="tabular-nums">{value.toLocaleString(i18n.language, { maximumSignificantDigits: 15 })}</span>;
  if (typeof value === "string") {
    if (isNativeItemReferenceField(field) && index.status !== "ready") return <span className="text-subtle" role={index.status === "error" ? "alert" : "status"}>{t(index.status === "error" ? "reference.error" : "reference.loading")}</span>;
    const items = isNativeItemReferenceField(field)
      && index.status === "ready" ? index.data.itemsByNativeId[value] ?? index.data.itemsByNativeId[value.toLowerCase()] : undefined;
    if (items?.length) return <span className="inline-flex flex-wrap gap-2">{items.map(item => <button type="button" key={item.id} onClick={() => open(item)} className="inline-flex cursor-pointer items-center gap-2 text-left text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">{item.icon && <img src={contentUrl(item.icon)} alt="" className="h-7 w-7 shrink-0 object-contain" />}{nativeEntryName(item)}</button>)}</span>;
    if (isNativeItemReferenceField(field)) return <span className="text-subtle">{t("wiki.unnamedEntries.items")}</span>;
    const map = isNativeMapReferenceField(field) ? TRACKING_REGION_MAPS[value.toLowerCase()] : undefined;
    if (map) return <span>{getMapDisplayName(map.id)}</span>;
    if (isNativeMapReferenceField(field) || isTechnicalNativeValue(value)) return null;
    const enumValue = /^E\w+::/.test(value) ? value.split("::").at(-1)! : undefined;
    const displayValue = enumValue ? t(`wiki.nativeValues.${enumValue}`, { defaultValue: humanizeNativeLabel(enumValue) })
      : t(`wiki.nativeValues.${value}`, { defaultValue: formatGameName(value) });
    return <span className="whitespace-pre-wrap break-words">{/<[A-Za-z]/.test(displayValue) ? <NativeRichText value={displayValue} /> : displayValue}</span>;
  }
  const content = nativeDisplayContent(value);
  if (content) return <NativeWikiContent content={content} />;
  if (Array.isArray(value)) {
    const children = value.filter(child => hasPlayerFacingValue(child, field));
    const materials = /(?:Items|Materials|Costs)/i.test(field) && children.every(child => child && typeof child === "object"
      && typeof (child as Record<string, unknown>).Key === "string" && typeof (child as Record<string, unknown>).Value === "number");
    return <div className={materials ? "native-wiki-materials" : "space-y-3"}>{children.map((child, i) => <div key={i} className={cn((materials || children.length > 1) && "rounded-[var(--radius-md)] border border-border p-3")}><NativeWikiValues value={child} field={field} /></div>)}</div>;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.Key === "string" && typeof record.Value === "number" && /(?:Items|Materials|Costs)/i.test(field)) {
    return <div className="flex min-w-0 items-start gap-3"><NativeWikiValues value={record.Key} field="ItemID" /><span className="shrink-0 tabular-nums">×{record.Value.toLocaleString(i18n.language)}</span></div>;
  }
  const pairs = Object.entries(record).filter(([key, child]) => isPlayerFacingField(key) && hasPlayerFacingValue(child, key));
  if (!pairs.length) return null;
  return <dl className={cn("native-wiki-values min-w-0", columns && "native-wiki-values-columns")}>{pairs.map(([key, child]) => {
    const group = child !== null && typeof child === "object";
    const description = typeof child === "string" && /(?:FlowLocText|Desc(?:ription)?|Introduction|Signature|PageText)/i.test(key);
    return <div key={key} className={cn("native-wiki-value-row min-w-0 border-b border-border/60 py-2 text-[13px] leading-relaxed", group && "native-wiki-value-group", description && "native-wiki-value-description")}>
      <dt className="min-w-0 break-words text-zinc-400">{nativeFieldLabel(key)}</dt>
      <dd className="min-w-0 text-left text-zinc-100"><NativeWikiValues value={child} field={key} /></dd>
    </div>;
  })}</dl>;
};
export default NativeWikiValues;
