import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import NativeWikiAttributes from "../reference/native-wiki-attribute-cards";
import NativeWikiValues from "../reference/native-wiki-values";
import { NativeWeaponStats } from "../reference/native-wiki-weapon";
import { nativeFieldLabel } from "../reference/native-wiki-labels";
import type { NativeWikiEntry } from "../reference/use-native-wiki";
import { nativeMarkerDetailModel } from "./native-marker-detail-model";

/** The same native property content can appear inline or in the inspector. */
export default function NativeMarkerProperties({ entry, markerCategory }: { entry: NativeWikiEntry; markerCategory?: string }) {
  const { t } = useTranslation();
  const model = nativeMarkerDetailModel(entry, markerCategory);
  return <div className="native-marker-properties space-y-5">
    {model.weapon && <NativeWeaponStats entry={entry} />}
    {Object.keys(model.facts).length > 0 && <NativeWikiValues value={model.facts} columns={false} />}
    {entry.attributes && Object.keys(entry.attributes).length > 0 && <section><DatabaseSectionTitle>{t("wiki.attributes")}</DatabaseSectionTitle><NativeWikiAttributes attributes={entry.attributes} /></section>}
    {model.statSections.map(stat => <section key={stat.label}><DatabaseSectionTitle>{nativeFieldLabel(stat.label)}</DatabaseSectionTitle><NativeWikiValues value={stat.value} field={stat.label} /></section>)}
  </div>;
}
