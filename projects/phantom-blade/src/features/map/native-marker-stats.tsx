import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import NativeWikiAttributes from "../reference/native-wiki-attribute-cards";
import { nativeFieldLabel } from "../reference/native-wiki-labels";
import type { NativeWikiEntry } from "../reference/use-native-wiki";

export default function NativeMarkerStats({ attributes }: { attributes: NativeWikiEntry["attributes"] }) {
  const { t, i18n } = useTranslation();
  if (!attributes || !Object.keys(attributes).length) return null;
  const primary = ["MaxHealth", "MaxShachi", "Attack", "ShachiAttack"].flatMap(key => {
    const attribute = attributes[key];
    const value = attribute?.fields?.Base ?? attribute?.native_value;
    return typeof value === "number" && Number.isFinite(value) ? [{ key, value }] : [];
  });
  return <section className="native-marker-stats">
    <DatabaseSectionTitle>{t("wiki.weapon.baseStats")}</DatabaseSectionTitle>
    {primary.length > 0 && <dl className="grid grid-cols-2 gap-x-5 gap-y-3">{primary.map(({ key,value }) => <div key={key} className="min-w-0">
      <dt className="text-[11px] leading-4 text-subtle">{nativeFieldLabel(key)}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums text-zinc-100">{value.toLocaleString(i18n.language)}</dd>
    </div>)}</dl>}
    <details className="mt-3"><summary className="cursor-pointer text-xs text-subtle hover:text-zinc-100">{t("wiki.marker.allAttributes")}</summary>
      <div className="mt-3"><NativeWikiAttributes attributes={attributes} /></div>
    </details>
  </section>;
}
