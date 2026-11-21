import { BookOpen, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import DungeonObjectives from "./dungeon-objectives";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "./reference-navigation-context";
import type { ReferenceEntry, ReferenceSummary } from "./reference-types";
import { useReferenceEntry } from "./use-reference-data";

export const ChestDungeonGuideContent = ({ dungeon, objectId }: { dungeon: ReferenceEntry; objectId: string }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  if (!dungeon.chestGuide) return null;
  return <div className="@container mt-5 space-y-4 border-t border-border pt-4">
    {dungeon.chestGuide.completionObjectIds.includes(objectId) && <p className="text-xs leading-relaxed text-accent">{t("reference.worldObject.completesDungeon")}</p>}
    <DungeonObjectives guide={dungeon.chestGuide} />
    <button type="button" onClick={() => openReference(dungeon)}
      aria-pressed={selectedReference !== undefined ? sameReferenceTarget(selectedReference, dungeon) : undefined}
      className={cn("flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-left hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent @min-[540px]:w-[calc(50%-3px)]",
        sameReferenceTarget(selectedReference, dungeon) ? "border-accent/60 bg-accent-soft" : "border-border")}>
      <BookOpen size={16} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-xs font-medium text-zinc-100">{t("reference.worldObject.completionRewards")}</span><span className="mt-0.5 block text-xs text-subtle">{gameText(dungeon.name)}</span></span>
      <ChevronRight size={15} className="shrink-0 text-subtle" aria-hidden="true" />
    </button>
  </div>;
};

const ChestDungeonGuide = ({ summary, objectId }: { summary: ReferenceSummary; objectId: string }) => {
  const { t } = useTranslation();
  const state = useReferenceEntry(summary);
  if (state.status !== "ready") return <p className="mt-4 text-xs text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <ChestDungeonGuideContent dungeon={state.data} objectId={objectId} />;
};

export default ChestDungeonGuide;
