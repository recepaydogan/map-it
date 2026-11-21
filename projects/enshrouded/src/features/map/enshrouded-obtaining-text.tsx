import { useGameText } from "../../i18n/game-text";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

const previewLimit = 170;

export default function EnshroudedObtainingText({ value, render }: {
  value: string;
  render: (text: string) => ReactNode;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  if (value.length <= previewLimit) return <p className="text-xs leading-relaxed text-zinc-300">{contentText(render(value))}</p>;

  const essenceRegion = value.match(/^Archaic (?:Essence|Essense) can be found by harvesting the yellow bulbs found in (.+?) Shroud Lairs\./i)?.[1];
  const preview = essenceRegion
    ? t("map.enshrouded.acquisition.archaicEssenceSummary", { region: contentText(essenceRegion) })
    : null;

  return <div className="space-y-2">
    <p className={`text-xs leading-relaxed text-zinc-300 ${preview ? "" : "line-clamp-3"}`}>
      {contentText(render(preview ?? value))}
    </p>
    <details className="group text-xs">
      <summary className="w-fit cursor-pointer text-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        {t("map.enshrouded.acquisition.fullDirections")}
      </summary>
      <p className="mt-2 leading-relaxed text-zinc-300">{contentText(render(value))}</p>
    </details>
  </div>;
}
