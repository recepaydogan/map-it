import { Fragment } from "react";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import Tooltip from "../../components/tooltip";
import { findQuestLocationName, type QuestLocationTarget } from "./quest-location-targets";
import type { MapReferenceSearch } from "../map/map-focus-request";
import { useReferenceNavigation } from "./reference-navigation-context";
import type { ReferenceLink } from "./reference-types";

export default function QuestLocationText({ text, targets, referenceTargets = [], onOpenMap }: {
  text: string;
  targets: QuestLocationTarget[];
  referenceTargets?: ReferenceLink[];
  onOpenMap: (mapId: string, markerId: string, search?: MapReferenceSearch) => void;
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const onOpenReference = useReferenceNavigation();
  const parts: React.ReactNode[] = [];
  let rest = text;
  while (rest) {
    const matches = [
      ...targets.map((target) => ({ kind: "map" as const, target,
        name: gameText(target.name), index: findQuestLocationName(rest, gameText(target.name)) })),
      ...referenceTargets.map((target) => ({ kind: "reference" as const, target,
        name: gameText(target.name), index: findQuestLocationName(rest, gameText(target.name)) })),
    ].filter((match) => match.index >= 0)
      .sort((a, b) => a.index - b.index || b.name.length - a.name.length
        || (a.kind === b.kind ? 0 : a.kind === "reference" ? -1 : 1));
    const match = matches[0];
    if (!match) { parts.push(rest); break; }
    if (match.index) parts.push(rest.slice(0, match.index));
    const label = t(match.kind === "reference" ? "reference.adventure.navigateToQuest"
      : "reference.adventure.navigateToLocation", { name: match.name });
    parts.push(<Tooltip key={`${match.kind}-${match.kind === "reference" ? match.target.id : match.target.markerId}-${parts.length}`} tone="light"
      label={label}>
      <button type="button"
      aria-label={label}
      onClick={() => match.kind === "reference" ? onOpenReference(match.target)
        : onOpenMap(match.target.mapId, match.target.markerId, match.target.search)}
      className="inline-flex cursor-pointer items-center gap-0.5 font-medium text-zinc-50 hover:text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
      <span className="underline decoration-accent decoration-[1.5px] underline-offset-[3px]">{rest.slice(match.index, match.index + match.name.length)}</span>
      <ArrowUpRight size={13} className="shrink-0 text-accent" aria-hidden="true" />
      </button>
    </Tooltip>);
    rest = rest.slice(match.index + match.name.length);
  }
  return <Fragment>{parts}</Fragment>;
}
