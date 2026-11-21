import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReferenceDetail from "./reference-detail";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useReferenceIndex } from "./use-reference-data";
import { questDisplayName } from "./quest-presentation";
import { useGameText } from "../../i18n/game-text";

const QuestReferenceTarget = ({ target, onOpenMap, onCurrentChange, ...navigation }: ReferenceNavigationProps & {
  target: ReferenceTarget;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const state = useReferenceIndex();
  const summary = state.status === "ready"
    ? state.data.entries.find((entry) => entry.category === "quests" && entry.id === target.id)
    : undefined;

  useEffect(() => {
    if (summary) onCurrentChange?.({ category: summary.category, id: summary.id, name: questDisplayName(summary, t, gameText) });
  }, [summary, onCurrentChange, t, gameText]);

  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="p-6 text-sm text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  if (!summary) return <p role="alert" className="p-6 text-sm text-subtle">{t("reference.error")}</p>;

  return <ReferenceDetail summary={summary} onOpenMap={onOpenMap} {...navigation} />;
};

export default QuestReferenceTarget;
