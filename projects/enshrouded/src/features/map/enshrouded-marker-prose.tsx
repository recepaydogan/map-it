import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";

/** Article text uses the same typography and divider as the existing marker sections. */
export default function EnshroudedMarkerProse({ paragraphs }: {
  paragraphs: { text: string; kind: "lore" | "overview"; textKey?: string }[];
}) {
  const { t } = useTranslation();
  const contentText = useGameText();
  if (!paragraphs.length) return null;
  return <section className="mt-4 border-t border-border/60 pt-3">
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
      {paragraphs[0].kind === "lore" ? t("map.enshrouded.loreEntry") : t("gameplayGuide.overview")}
    </h3>
    <div className="space-y-3">
      {paragraphs.map((paragraph, index) => <p key={index}
        className="whitespace-pre-line text-xs leading-relaxed text-zinc-300">{contentText(paragraph.text, paragraph.textKey)}</p>)}
    </div>
  </section>;
}
