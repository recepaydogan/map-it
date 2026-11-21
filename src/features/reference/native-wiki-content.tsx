import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import { formatGameName } from "../../lib/game-display-text";
import NativeRichText from "./native-rich-text";
import type { NativeTextData } from "./native-rich-text-model";
import type { NativeContent, NativeDisplayStat } from "./native-wiki-content-model";
import { useNativeJson } from "./use-native-wiki";

const DisplayStats = ({ stats }: { stats: NativeDisplayStat[] }) => {
  const { i18n } = useTranslation();
  const state = useNativeJson<NativeTextData>("data/wiki/weapon-presentation.json");
  return <div className="@container"><dl className="native-wiki-display-stats grid gap-x-6 gap-y-3 @min-[440px]:grid-cols-2 @min-[820px]:grid-cols-3">
    {stats.map((stat, index) => {
      const icon = state.status === "ready" ? state.data.stats[stat.iconPath?.toLowerCase() ?? ""] : undefined;
      return <div key={index} className="flex min-w-0 items-center gap-2.5 py-1">
        {icon && <img src={contentUrl(icon)} alt="" className="h-6 w-6 shrink-0 object-contain" />}
        <dt className="min-w-0 text-[13px] leading-snug text-zinc-200"><NativeRichText value={stat.label} /></dt>
        <dd className="shrink-0 text-base font-semibold tabular-nums text-forever-blue">{stat.value.toLocaleString(i18n.language, { maximumSignificantDigits: 15 })}</dd>
      </div>;
    })}
  </dl></div>;
};

const NativeWikiContent = ({ content }: { content: NativeContent }) => {
  const { t } = useTranslation();
  if (content.kind === "stats") return <DisplayStats stats={content.stats} />;
  return <div className="native-wiki-effect-text space-y-4">{content.effects.map((effect, index) => <div key={index} className="space-y-1.5">
    {effect.title && <h4 className="text-sm font-semibold text-zinc-100">{formatGameName(effect.title)}</h4>}
    <p className="whitespace-pre-wrap text-[13px] leading-6 text-zinc-100"><NativeRichText value={effect.text} /></p>
    {effect.equipped && <p className="text-xs text-subtle">{t("wiki.fields.bApplyOnCurrentEquipOnly")}</p>}
  </div>)}</div>;
};
export default NativeWikiContent;
