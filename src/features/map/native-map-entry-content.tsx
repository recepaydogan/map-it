import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import DatabaseSectionTitle from "../database/database-section-title";
import NativeRichText from "../reference/native-rich-text";
import NativeWikiValues from "../reference/native-wiki-values";
import NativeWikiWeapon from "../reference/native-wiki-weapon";
import { NativeWikiRelatedCards } from "../reference/native-wiki-overview-links";
import { distinctNativeSections } from "../reference/native-wiki-overview-model";
import { isNativeUpgradeSection } from "../reference/native-wiki-upgrade-fields";
import { nativeFieldLabel } from "../reference/native-wiki-labels";
import { hasPlayerFacingValue, isPlayerFacingField } from "../reference/native-wiki-presentation";
import type { NativeWikiEntry } from "../reference/use-native-wiki";
import { nativeMarkerContentPolicy } from "./native-marker-content-policy";
import NativeMarkerDetailActions from "./native-marker-detail-actions";
import NativeMarkerProperties from "./native-marker-properties";
import { nativeMarkerDescriptions } from "./native-marker-detail-model";

/** The marker uses the wiki's actual content renderers inside its existing scroll area. */
export default function NativeMapEntryContent({ entry, rewardIds, markerCategory, children }: {
  entry: NativeWikiEntry; rewardIds: Set<string>; markerCategory?:string; children?: ReactNode;
}) {
  const { t } = useTranslation();
  const policy = nativeMarkerContentPolicy(entry,markerCategory);
  const weapon = ["weapons","phantom-edges"].includes(entry.group);
  const descriptions = nativeMarkerDescriptions(entry);
  const sections = entry.sections.filter(section => isPlayerFacingField(section.label) && hasPlayerFacingValue(section.value));
  const shown = distinctNativeSections(sections.filter(section => !isNativeUpgradeSection(section)
    && !["ReincarnationUIAttributeDatas", "SnapSoulUIAttributeDatas"].includes(section.label)
    && !(weapon && ["WeaponAbilityDesc","UIAttributeDatas"].includes(section.label))
    && !(weapon && ["DefaultGEData","DefaultSnapSoulGEData"].includes(section.label)
      && !hasPlayerFacingValue((section.value as Record<string,unknown>)?.FlowLocText))),descriptions);
  const related = entry.links.filter(link => !rewardIds.has(link.id));
  return <div className="native-map-entry-content space-y-5 [&_.native-wiki-upgrades]:grid-cols-1">
    {policy.showDescription && descriptions.length > 0 && <section><DatabaseSectionTitle>{t("wiki.marker.description")}</DatabaseSectionTitle><div className="space-y-3">
      {descriptions.map((row,index) => <p key={index} className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-200"><NativeRichText value={row.text} /></p>)}
    </div></section>}
    {policy.inlineProperties && <NativeMarkerProperties entry={entry} markerCategory={markerCategory} />}
    {children}
    <NativeMarkerDetailActions entry={entry} markerCategory={markerCategory} />
    {weapon && <NativeWikiWeapon entry={entry} />}
    {shown.map((section,index) => <section key={index}><DatabaseSectionTitle>{nativeFieldLabel(section.label)}</DatabaseSectionTitle><NativeWikiValues value={section.value} field={section.label} columns={false} /></section>)}
    {related.length > 0 && <section><DatabaseSectionTitle>{t("wiki.related")}</DatabaseSectionTitle><NativeWikiRelatedCards links={related} /></section>}
    {entry.noticeKey && <p className="text-xs leading-relaxed text-subtle">{t(entry.noticeKey)}</p>}
  </div>;
}
