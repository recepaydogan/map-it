import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import NativeRichText from "./native-rich-text";
import type { NativeWikiEntry } from "./use-native-wiki";

/** Native objective text for this authored target; no inferred quest-giver or reward. */
export default function NativeQuestObjectives({ entry, markerId }: { entry: NativeWikiEntry; markerId?: string }) {
  const { t } = useTranslation();
  const stages = [...new Map((entry.quest?.stages ?? [])
    .filter(stage => (!markerId || stage.markers.some(marker => marker.id === markerId)) && (stage.title || stage.description))
    .map(stage => [`${stage.title ?? ""}:${stage.description ?? ""}`, stage])).values()];
  if (!stages.length) return null;
  return <section className="native-quest-objectives">
    <DatabaseSectionTitle>{t(markerId ? "wiki.quest.objectives" : "wiki.quest.stages")}</DatabaseSectionTitle>
    <div className="space-y-4">{stages.map(stage => <article key={stage.id} className="space-y-2 text-[13px] leading-relaxed">
      {stage.title && <p className="font-medium text-zinc-100"><NativeRichText value={stage.title} /></p>}
      {stage.description && stage.description !== stage.title && <p className="whitespace-pre-wrap text-zinc-300"><NativeRichText value={stage.description} /></p>}
    </article>)}</div>
  </section>;
}
