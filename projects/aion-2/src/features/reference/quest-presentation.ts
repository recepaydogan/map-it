import type { TFunction } from "i18next";
import { QUEST_OBJECTIVE_ACTIONS } from "../../game-config";
import type { ReferenceLink, ReferenceRow, ReferenceSummary } from "./reference-types";

export const isUnavailableQuestText = (text?: string): boolean =>
  !text?.trim() || /^[\s?？.…]+$/u.test(text);

export const isInactiveQuestObjectiveText = (text?: string): boolean =>
  /(?:no longer valid|has ended)\.\s*Check the Journal\./iu.test(text ?? "");

export function translatedQuestTitle(id: string, t: TFunction): string {
  const questId = /^Quest:(\d+)$/.exec(id)?.[1];
  return questId ? t(`reference.adventure.questTitles.${questId}`, { defaultValue: "" }).trim() : "";
}

export function questDisplayName(entry: Pick<ReferenceSummary, "id" | "name" | "adventure">, t: TFunction, gameText: (text: string) => string = (text) => text): string {
  if (!isUnavailableQuestText(entry.name)) return entry.name;
  const translatedTitle = translatedQuestTitle(entry.id, t);
  if (translatedTitle) return translatedTitle;
  const kind = t(`reference.adventure.unnamedQuestKinds.${entry.adventure?.kind ?? "other"}`, { defaultValue: t("reference.adventure.unnamedQuest") });
  const region = entry.adventure?.region;
  return region ? t("reference.adventure.unnamedQuestInRegion", { kind, region: gameText(region) }) : kind;
}

export function questLinkName(link: ReferenceLink, t: TFunction, summary?: ReferenceSummary, gameText?: (text: string) => string): string {
  return link.category === "quests" && isUnavailableQuestText(link.name)
    ? questDisplayName({ id: link.id, name: link.name, adventure: summary?.adventure }, t, gameText)
    : link.name;
}

export function questObjectiveText(row: ReferenceRow, t: TFunction, gameText: (text: string) => string): string {
  const description = gameText(row.description ?? "");
  const truncated = /\s*(?:…|\.{3})\s*$/u.test(row.description ?? "");
  if (!isUnavailableQuestText(row.description) && !truncated) return description;
  const action = row.name.split(" · ")[1];
  const targets = row.links?.filter((link) => !isUnavailableQuestText(link.name)).map((link) => gameText(link.name)) ?? [];
  const name = [...new Set(targets)].join(", ");
  if (truncated && name) return description.replace(/\s*(?:…|\.{3})\s*$/u, ` ${name}`);
  const keys = QUEST_OBJECTIVE_ACTIONS[action];
  const key = name && keys?.targetKey ? keys.targetKey : keys?.defaultKey ?? "unavailable";
  return t(`reference.adventure.objectiveActions.${key}`, { name });
}

export function questDisplayObjectives(rows: ReferenceRow[]): ReferenceRow[] {
  return rows.filter((row, index) => {
    if (!row.name.endsWith(" · Clear Map Event") || isUnavailableQuestText(row.description)) return true;
    const step = row.name.split(" · ")[0];
    return !rows.slice(index + 1).some((candidate) =>
      candidate.name === `${step} · Use Env Obj`
      && candidate.description === row.description
      && candidate.facts?.some((fact) => fact.label === "reference.labels.required-count" && fact.value === 0));
  });
}
