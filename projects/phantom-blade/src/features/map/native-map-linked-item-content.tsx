import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { useNativeJson, useNativeWikiIndex, type NativeWikiEntry } from "../reference/use-native-wiki";
import NativeMapEntryContent from "./native-map-entry-content";
import { nativeMarkerContentPolicy, nativeMarkerItemReference } from "./native-marker-content-policy";
import { nativeEntryName } from "../reference/native-wiki-presentation";
import DatabaseSectionTitle from "../database/database-section-title";

type Props = { entry: NativeWikiEntry; rewardIds: Set<string>; markerCategory?:string; children?:ReactNode };
const LinkedItem = ({ id, entry, rewardIds, markerCategory, children }: Props & {id:string}) => {
  const { t } = useTranslation();
  const reference = nativeMarkerItemReference(entry);
  const state = useNativeJson<NativeWikiEntry>(`data/wiki/entries/${id}.json`);
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="text-xs text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const item = state.data;
  if (!reference || item.category !== "items" || item.nativeId.toLowerCase() !== reference.nativeId.toLowerCase() || item.group !== reference.group) return <p role="alert">{t("reference.error")}</p>;
  const links = [...new Map([...entry.links, ...item.links].filter(link => link.id !== item.id && link.id !== entry.id)
    .map(link => [`${link.category}:${link.id}`, link])).values()];
  const descriptions = [...item.descriptions, ...entry.descriptions.filter(description => !item.descriptions.some(other => other.text === description.text))];
  const content = { ...item, descriptions, links, facts: { ...entry.facts, ...item.facts } };
  return <NativeMapEntryContent entry={content} rewardIds={rewardIds} markerCategory={markerCategory}>{children}</NativeMapEntryContent>;
};

/** Match the serialized item ID and inventory type. Distinct native versions stay explicit. */
export default function NativeMapLinkedItemContent(props: Props) {
  const { entry, markerCategory } = props;
  const { t } = useTranslation();
  const index = useNativeWikiIndex();
  const reference = nativeMarkerContentPolicy(entry,markerCategory).showLinkedItemDetails ? nativeMarkerItemReference(entry) : undefined;
  if (reference && index.status !== "ready") return <p role={index.status === "error" ? "alert" : "status"} className="text-xs text-subtle">{t(index.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const items = reference && index.status === "ready" ? index.data.entries.filter(item => item.category === "items"
    && item.nativeId.toLowerCase() === reference.nativeId.toLowerCase() && item.group === reference.group) : [];
  if (items.length === 1) return <LinkedItem {...props} id={items[0]!.id} />;
  if (items.length > 1) return <section className="space-y-3"><DatabaseSectionTitle>{t("wiki.marker.itemVersions")}</DatabaseSectionTitle>
    {items.map(item => <details key={item.id} className="rounded-[var(--radius-md)] border border-border p-3"><summary className="cursor-pointer text-[13px] font-medium text-zinc-100">{nativeEntryName(item)}</summary>
      <div className="mt-4"><LinkedItem {...props} id={item.id} /></div></details>)}
  </section>;
  return <NativeMapEntryContent {...props} />;
}
