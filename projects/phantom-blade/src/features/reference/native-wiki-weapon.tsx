import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import { formatGameName } from "../../lib/game-display-text";
import { nativeFieldLabel } from "./native-wiki-labels";
import NativeRichText from "./native-rich-text";
import type { NativeTextData } from "./native-rich-text-model";
import { useNativeJson, type NativeWikiEntry } from "./use-native-wiki";

export const NativeWeaponType = ({ entry }: { entry: NativeWikiEntry }) => {
  const state = useNativeJson<NativeTextData>("data/wiki/weapon-presentation.json");
  const type = String(entry.facts.WeaponType ?? entry.facts.ShaChiWeaponType ?? "").split("::").at(-1)!;
  return <>{state.status === "ready" && state.data.weaponTypes[type] || nativeFieldLabel(type)}</>;
};

export const NativeWeaponStats = ({ entry }: { entry: NativeWikiEntry }) => {
  const { t, i18n } = useTranslation();
  const state = useNativeJson<NativeTextData>("data/wiki/weapon-presentation.json");
  const value = entry.sections.find(section => section.label === "UIAttributeDatas")?.value;
  const stats = (Array.isArray(value) ? value : []).filter((row): row is { GEDescription: string; DefaultValue: number; GEIcon?: { AssetPathName?: string } } =>
    typeof row?.GEDescription === "string" && typeof row.DefaultValue === "number");
  if (!stats.length) return null;
  return <div className="native-weapon-stats mb-5 max-w-[900px] border-y border-border py-3">
    <p className="mb-2 text-[11px] text-subtle">{t("wiki.weapon.baseStats")}</p>
    <dl className="flex flex-wrap gap-x-10 gap-y-3">{stats.map((stat, index) => {
      const icon = state.status === "ready" ? state.data.stats[stat.GEIcon?.AssetPathName?.toLowerCase() ?? ""] : undefined;
      return <div key={index} className="flex items-center gap-2.5">{icon && <img src={contentUrl(icon)} alt="" className="h-6 w-6 object-contain" />}
        <dt className="text-sm text-zinc-200">{stat.GEDescription}</dt><dd className="text-lg font-semibold tabular-nums text-forever-blue">{stat.DefaultValue.toLocaleString(i18n.language, { maximumFractionDigits: 4 })}</dd></div>;
    })}</dl>
  </div>;
};

const NativeWikiWeapon = ({ entry }: { entry: NativeWikiEntry }) => {
  const { t } = useTranslation();
  const value = entry.sections.find(section => section.label === "WeaponAbilityDesc")?.value;
  const abilities = (Array.isArray(value) ? value : []).filter((row): row is { WeaponTitle?: unknown; WeaponDesc: string } => typeof row?.WeaponDesc === "string" && Boolean(row.WeaponDesc.trim()));
  if (!abilities.length) return null;
  return <section className="native-weapon-abilities max-w-[900px] space-y-6" aria-label={t("wiki.sections.WeaponAbilityDesc")}>
    <p className="text-[11px] text-subtle">{t("wiki.weapon.defaultControls")}</p>
    {abilities.map((ability, index) => <article key={index} className="space-y-2">
      {typeof ability.WeaponTitle === "string" && ability.WeaponTitle.trim() && <h3 className="text-base font-semibold leading-snug text-zinc-100">{formatGameName(ability.WeaponTitle)}</h3>}
      <p className="whitespace-pre-wrap text-[14px] leading-7 text-zinc-200"><NativeRichText value={ability.WeaponDesc} /></p>
    </article>)}
  </section>;
};
export default NativeWikiWeapon;
