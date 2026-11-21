import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { ReferenceFact } from "./reference-types";

const ReferenceFactBadges = ({ facts, layout = "badges" }: { facts: ReferenceFact[]; layout?: "badges" | "grid" }) => {
  const { t, i18n } = useTranslation();
  const unique = [...new Map(facts.map((fact) => [JSON.stringify([fact.label, fact.value]), fact])).values()];
  if (!unique.length) return null;
  const formatValue = (value: ReferenceFact["value"]) => typeof value === "boolean" ? t(value ? "reference.yes" : "reference.no")
    : typeof value === "number" ? value.toLocaleString(i18n.language) : value;
  if (layout === "grid") {
    const take = (label: string) => unique.find((fact) => fact.label === `reference.labels.${label}`);
    const pairedLabels = new Set(["minimum-party-size", "maximum-party-size", "minimum-level", "maximum-level"]
      .map((label) => `reference.labels.${label}`));
    const range = (label: string, minimum?: ReferenceFact, maximum?: ReferenceFact) => {
      if (!minimum && !maximum) return null;
      const min = minimum ? formatValue(minimum.value) : undefined;
      const max = maximum ? formatValue(maximum.value) : undefined;
      return { label, value: min && max && min !== max ? `${min}–${max}` : min ?? max! };
    };
    const compact = [
      take("difficulty"),
      take("equipment-level"),
      range("reference.labels.party-size", take("minimum-party-size"), take("maximum-party-size")),
      range("reference.labels.level", take("minimum-level"), take("maximum-level")),
      ...unique.filter((fact) => !pairedLabels.has(fact.label)
        && !["reference.labels.difficulty", "reference.labels.equipment-level"].includes(fact.label)),
    ].filter((fact): fact is ReferenceFact => Boolean(fact));
    return <dl className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-black/10">{compact.map((fact, index) => <div
      key={JSON.stringify([fact.label, fact.value])}
      className={cn("flex min-w-0 items-baseline justify-between gap-2 px-3 py-2",
        index % 2 === 0 && !(compact.length % 2 === 1 && index === compact.length - 1) && "border-r border-border",
        index >= 2 && "border-t border-border",
        compact.length % 2 === 1 && index === compact.length - 1 && "col-span-2")}>
      <dt className="min-w-0 text-[10px] leading-4 text-subtle">{t(fact.label)}</dt>
      <dd className="shrink-0 text-[13px] font-semibold leading-4 tabular-nums text-zinc-100">{formatValue(fact.value)}</dd>
    </div>)}</dl>;
  }
  return <dl className="flex flex-wrap gap-1.5">{unique.map((fact) => {
    const value = typeof fact.value === "boolean" ? t(fact.value ? "reference.yes" : "reference.no")
      : typeof fact.value === "number" ? fact.value.toLocaleString(i18n.language) : fact.value;
    return <div key={JSON.stringify([fact.label, fact.value])}
      className="flex items-center gap-1 rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-200">
      <dt>{t(fact.label)}</dt><dd className="tabular-nums">{value}</dd>
    </div>;
  })}</dl>;
};

export default ReferenceFactBadges;
