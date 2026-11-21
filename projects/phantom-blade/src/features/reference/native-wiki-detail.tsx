import { ArrowLeft, BookOpen, MapPin } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import type { ReferenceNavigationProps } from "./reference-types";
import NativeWikiValues from "./native-wiki-values";
import { distinctNativeSections } from "./native-wiki-overview-model";
import { nativeFieldLabel } from "./native-wiki-labels";
import { useNativeJson, type NativeWikiEntry } from "./use-native-wiki";
import NativeWikiAcquisition from "./native-wiki-acquisition-cards";
import NativeWikiCreatureLoot from "./native-wiki-creature-loot";
import NativeCombatLoot from "./native-combat-loot";
import { NativeWikiLocationCards, NativeWikiRelatedCards } from "./native-wiki-overview-links";
import NativeWikiUpgrades from "./native-wiki-upgrades";
import { isNativeUpgradeSection } from "./native-wiki-upgrade-fields";
import NativeWikiAttributes from "./native-wiki-attribute-cards";
import NativeRichText from "./native-rich-text";
import NativeWikiWeapon, { NativeWeaponStats, NativeWeaponType } from "./native-wiki-weapon";
import DatabaseSectionTitle from "../database/database-section-title";
import { formatGameName } from "../../lib/game-display-text";
import { hasPlayerFacingValue, isPlayerFacingField, nativeEntryName, visibleNativeFacts } from "./native-wiki-presentation";
import { nativeMarkerContentPolicy } from "../map/native-marker-content-policy";
import NativeBellGuide from "../map/native-bell-guide";
import NativeMarkerDetailActions from "../map/native-marker-detail-actions";
import NativeMarkerProperties from "../map/native-marker-properties";
import { nativeMarkerDescriptions } from "../map/native-marker-detail-model";
import { nativeMarkerExternalRewards } from "../map/native-marker-reward-model";
import NativeQuestObjectives from "./native-quest-objectives";

type Props = ReferenceNavigationProps & { id: string; onOpenMap: (mapId: string, markerId: string) => void; compact?: boolean };
const NativeWikiDetail = ({ id, onOpenMap, backLabel, onBack, compact = false }: Props) => {
  const { t } = useTranslation();
  const state = useNativeJson<NativeWikiEntry>(`data/wiki/entries/${id}.json`);
  const [tab, setTab] = useState("overview");
  if (state.status !== "ready") return <p className="p-6 text-sm text-muted" role={state.status === "error" ? "alert" : "status"}>{t(`reference.${state.status === "error" ? "error" : "loading"}`)}</p>;
  const entry = state.data;
  if (entry.canonicalTarget) return <NativeWikiDetail id={entry.canonicalTarget.id} onOpenMap={onOpenMap} backLabel={backLabel} onBack={onBack} compact={compact} />;
  const markerPolicy = nativeMarkerContentPolicy(entry);
  const sources = nativeMarkerExternalRewards(entry, [...(entry.acquisition ?? entry.drops ?? []), ...(entry.combatRewards ?? []), ...(entry.sceneAcquisition ?? []), ...(entry.flowRewards ?? [])]);
  const creature = entry.category === "creatures" || Boolean(entry.boss);
  const hasAcquisition = sources.length > 0 || (creature && Boolean(entry.combatLoot?.length));
  const activeTab = tab === "acquisition" && !hasAcquisition ? "overview" : tab;
  const weapon = ["weapons", "phantom-edges"].includes(entry.group);
  const categoryLabel = t(`reference.categories.${entry.boss ? "world-bosses" : entry.category}`);
  const groupLabel = t(`wiki.groups.${entry.group}`, { defaultValue: nativeFieldLabel(entry.group) });
  const facts = Object.fromEntries(Object.entries(visibleNativeFacts(entry.facts))
    .filter(([field]) => (!compact || markerPolicy.showProperties) && (!weapon || !["WeaponType", "ShaChiWeaponType"].includes(field))));
  const sections = entry.sections.filter(section => isPlayerFacingField(section.label) && hasPlayerFacingValue(section.value));
  const upgradeSections = sections.filter(isNativeUpgradeSection);
  const descriptions = markerPolicy.inlineProperties || (compact && !markerPolicy.showDescription) ? [] : nativeMarkerDescriptions(entry);
  const displaySections = distinctNativeSections(sections.filter(section => !isNativeUpgradeSection(section)
    && !(compact && ["ReincarnationUIAttributeDatas", "SnapSoulUIAttributeDatas"].includes(section.label))
    && !(weapon && ["WeaponAbilityDesc", "UIAttributeDatas"].includes(section.label))
    && !(weapon && ["DefaultGEData", "DefaultSnapSoulGEData"].includes(section.label)
      && !hasPlayerFacingValue((section.value as Record<string, unknown>)?.FlowLocText))), descriptions);
  return <div className={cn("native-wiki-detail scroll-slim h-full min-h-0 overflow-y-auto text-left", compact && "native-wiki-detail-compact")}>
    <div className="mr-auto w-full max-w-6xl space-y-6 p-5 md:p-6">
      {onBack && <button type="button" onClick={onBack} className="flex cursor-pointer items-center gap-1 text-xs text-subtle hover:text-white"><ArrowLeft size={14} />{t("reference.backTo", { label: backLabel })}</button>}
      <header className="flex items-start gap-4">
        {entry.icon ? <img src={contentUrl(entry.icon)} alt="" className="h-16 w-16 shrink-0 rounded-[var(--radius-md)] border border-border bg-surface object-contain p-1" /> : <BookOpen size={32} className="mt-1 shrink-0 text-muted" aria-hidden="true" />}
        <div className="min-w-0 flex-1"><h1 className="break-words text-2xl font-semibold leading-tight tracking-tight text-white">{nativeEntryName(entry)}</h1><p className="mt-1 text-xs text-subtle">{weapon ? <NativeWeaponType entry={entry} /> : <>{categoryLabel}{groupLabel !== categoryLabel && <> · {groupLabel}</>}</>}</p></div>
      </header>
      {hasAcquisition && <nav role="tablist" aria-label={t("wiki.detailTabs")} className="native-wiki-tabs flex border-b border-border">{["overview", "acquisition"].map(key => <button type="button" role="tab" aria-selected={activeTab === key} key={key} onClick={() => setTab(key)} className={cn("cursor-pointer border-b-2 px-4 py-2.5 text-[13px] transition-colors", activeTab === key ? "border-accent text-white" : "border-transparent text-subtle hover:text-white")}>{t(creature && key === "acquisition" ? "wiki.creatureLoot.tab" : `wiki.${key}`)}</button>)}</nav>}
      {activeTab === "overview" && <>
        <div className="space-y-3">
        {entry.noticeKey && <p className="text-xs leading-relaxed text-subtle">{t(entry.noticeKey)}</p>}
        {descriptions.map((description, i) => <p key={i} className={cn("whitespace-pre-wrap text-[14px] leading-7 text-zinc-200", weapon && "max-w-[900px]")}><NativeRichText value={description.text} /></p>)}
        </div>
        {markerPolicy.showBellGuide && <NativeBellGuide bellId={entry.nativeId} />}
        {entry.quest && <NativeQuestObjectives entry={entry} />}
        {compact && markerPolicy.inlineProperties && <NativeMarkerProperties entry={entry} />}
        {compact && <NativeMarkerDetailActions entry={entry} />}
        {!compact && weapon && <NativeWeaponStats entry={entry} />}
        {weapon && <NativeWikiWeapon entry={entry} />}
        {!compact && Object.keys(facts).length > 0 && <section><DatabaseSectionTitle>{t("wiki.properties")}</DatabaseSectionTitle><div className="rounded-[var(--radius-md)] border border-border p-4"><NativeWikiValues value={facts} columns /></div></section>}
        {!compact && entry.attributes && Object.keys(entry.attributes).length > 0 && <section><DatabaseSectionTitle>{t("wiki.attributes")}</DatabaseSectionTitle><NativeWikiAttributes attributes={entry.attributes} /></section>}
        {!compact && upgradeSections.length > 0 && <NativeWikiUpgrades key={entry.id} sections={upgradeSections} />}
        {displaySections.map((section, i) => <section key={i}><DatabaseSectionTitle>{nativeFieldLabel(section.label)}</DatabaseSectionTitle><div className="rounded-[var(--radius-md)] border border-border p-4"><NativeWikiValues value={section.value} field={section.label} /></div></section>)}
        {(!compact || markerPolicy.showLocations) && entry.locations.length > 0 && <section><DatabaseSectionTitle>{t("wiki.locations")}</DatabaseSectionTitle><NativeWikiLocationCards locations={entry.locations} onOpenMap={onOpenMap} /></section>}
        {(!compact || markerPolicy.showLocations) && Boolean(entry.regionMaps?.length) && <section><DatabaseSectionTitle>{t(entry.regionMapsTitleKey ?? "wiki.regions")}</DatabaseSectionTitle>{entry.regionMaps?.map(region => <button type="button" key={region.mapId} onClick={() => onOpenMap(region.mapId, "")} className="flex w-full cursor-pointer items-center gap-2 border-b border-border py-3 text-left text-[13px] text-accent hover:text-white"><MapPin size={16} aria-hidden="true" />{t("wiki.viewRegion", { name: formatGameName(region.name) })}</button>)}</section>}
        {entry.links.length > 0 && <section><DatabaseSectionTitle>{t("wiki.related")}</DatabaseSectionTitle><NativeWikiRelatedCards links={entry.links} /></section>}
      </>}
      {activeTab === "acquisition" && (creature ? <div className="space-y-6">{sources.length > 0 && <NativeWikiCreatureLoot rows={sources} />}{Boolean(entry.combatLoot?.length) && <section><DatabaseSectionTitle>{t("wiki.marker.combatLoot")}</DatabaseSectionTitle>{entry.combatLoot?.map(source => <NativeCombatLoot key={source.record} file={source.file} />)}</section>}</div> : <section>{sources.length > 0 ? <NativeWikiAcquisition rows={sources} entryId={entry.id} itemPage={entry.category === "items"} locations={entry.locations} onOpenMap={onOpenMap} /> : <p className="text-sm text-muted">{t("wiki.noAcquisition")}</p>}</section>)}

    </div>
  </div>;
};
export default NativeWikiDetail;
