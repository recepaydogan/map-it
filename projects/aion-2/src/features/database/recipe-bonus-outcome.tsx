import { getItemDisplayName } from "../../lib/item-display-name";
import { useGameText } from "../../i18n/game-text";
import { Trans, useTranslation } from "react-i18next";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ReferenceEntry } from "../reference/reference-types";

const RecipeBonusOutcome = ({ entry, allEntries }: { entry: ReferenceEntry; allEntries: Map<string, ReferenceEntry> }) => {
  const { i18n } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const combo = entry.sections.find((section) => section.title === "reference.labels.combo-recipe");
  const chance = combo?.facts?.find((fact) => fact.label === "reference.labels.combo-chance")?.value;
  const outputs = [...new Map((combo?.links ?? []).flatMap((link) =>
    allEntries.get(link.id)?.sections.find((section) => section.title === "reference.labels.produces")
      ?.links?.filter((output) => output.category === "items") ?? [])
    .map((output) => [`${output.id}:${output.quantity ?? 1}`, output])).values()];
  if (typeof chance !== "number" || chance <= 0 || outputs.length === 0) return null;
  return <div className="space-y-1 text-[12px] leading-relaxed text-zinc-400">
    {outputs.map((output) => <p key={`${output.id}:${output.quantity ?? 1}`}>
      <Trans i18nKey="database.bonusOutcome" values={{
        chance: chance.toLocaleString(i18n.language),
        item: `${getItemDisplayName(output.name, gameText(output.name, output.id))}${output.quantity !== undefined && output.quantity > 1 ? ` ×${output.quantity.toLocaleString(i18n.language)}` : ""}`,
      }} components={{ item: <button type="button" onClick={() => openReference(output)}
        className="cursor-pointer text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent focus-visible:outline-2 focus-visible:outline-accent" /> }} />
    </p>)}
  </div>;
};

export default RecipeBonusOutcome;
