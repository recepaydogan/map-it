import type { ReferenceSection } from "../reference/reference-types";

const HIDDEN_FACTS = new Set([
  "reference.labels.classes",
  "reference.labels.faction",
  "reference.labels.use-cooldown-table-units",
  "reference.labels.maximum-uses",
  "reference.labels.account-storage",
  "reference.labels.character-storage",
  "reference.labels.guild-storage",
  "reference.labels.sale-currency",
]);

export function formatItemUsageRules(section: ReferenceSection, language: string): ReferenceSection {
  if (section.title !== "reference.labels.usage-and-restrictions") return section;
  const currency = section.facts?.find((fact) => fact.label === "reference.labels.sale-currency")?.value;
  return {
    ...section,
    facts: section.facts?.filter((fact) => !HIDDEN_FACTS.has(fact.label)).map((fact) => {
      if (fact.label !== "reference.labels.vendor-sale-price" || typeof currency !== "string" || !currency.trim()) return fact;
      const amount = typeof fact.value === "number" ? fact.value.toLocaleString(language) : fact.value;
      return { ...fact, value: `${amount} ${currency.trim()}` };
    }),
  };
}
