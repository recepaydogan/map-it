import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import DetailTabs from "../../components/detail-tabs";
import { cn } from "../../lib/cn";
import type { ActivityFamily } from "./activity-families";
import ActivityEntrances from "./activity-entrances";
import ActivityRewards from "./activity-rewards";
import ActivityOverview from "./activity-overview";
import ActivityStats from "./activity-stats";
import ReferenceBackLink from "./reference-back-link";
import ReferenceLocations from "./reference-locations";
import ReferenceSections from "./reference-sections";
import type { ReferenceNavigationProps, ReferenceSection, ReferenceSummary } from "./reference-types";
import { useReferenceEntry } from "./use-reference-data";

const TABS = [{ key: "details", label: "reference.detailsTab" }, { key: "rewards", label: "reference.dungeon.rewards" }] as const;
const SUMMARY_LABELS = new Set(["reference.labels.recommended-combat-power", "reference.labels.required-participants", "reference.labels.minimum-level", "reference.labels.maximum-party-size"]);
const isActivityReward = (section: ReferenceSection) => [
  "reference.labels.possible-rewards", "reference.labels.guaranteed-rewards",
  "reference.labels.first-clear-rewards", "reference.labels.repeat-rewards",
].includes(section.title);

const ActivityDetail = ({ family, current, onSelect, onOpenMap, backLabel, onBack }: ReferenceNavigationProps & {
  family: ActivityFamily;
  current: ReferenceSummary;
  onSelect: (id: string) => void;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const id = useId();
  const [tab, setTab] = useState<"details" | "rewards">("details");
  const state = useReferenceEntry(current);
  const entry = state.status === "ready" ? state.data : null;
  const summary = [...(entry?.facts ?? []), ...(entry?.sections.filter((section) => section.title === "reference.labels.entry-requirements").flatMap((section) => section.facts ?? []) ?? [])]
    .filter((fact) => SUMMARY_LABELS.has(fact.label) && typeof fact.value === "number" && fact.value > 0);
  const overview = entry?.sections.filter((section) => !isActivityReward(section) && section.title !== "reference.labels.entry-requirements") ?? [];
  const variantLabel = (variant: ReferenceSummary, index: number) => {
    const faction = variant.activity?.faction;
    const parts = [variant.activity?.region && variant.activity.region !== family.name ? gameText(variant.activity.region) : "",
      faction && ["light", "dark"].includes(faction) ? t(`reference.activity.factions.${faction}`) : "",
      variant.activity?.listed === false ? t("reference.boxes.technical") : t("reference.activity.variant", { number: index + 1 })];
    return parts.filter(Boolean).join(" · ");
  };
  return <>
    <header className="shrink-0 border-b border-border bg-surface px-5 py-5">
      <ReferenceBackLink label={backLabel} onBack={onBack} />
      <p className="mb-2 text-xs font-medium text-accent">{t(`reference.activity.${family.kind}`)}</p>
      <h2 className="font-display text-2xl font-semibold leading-tight text-white">{gameText(family.name)}</h2>
      {current.activity?.listed === false && <p className="mt-2 text-xs text-subtle">{t("reference.boxes.technical")}</p>}
      {current.activity?.region && current.activity.region !== family.name && <p className="mt-2 text-sm text-subtle">{gameText(current.activity.region)}</p>}
      {current.activity?.tier && <p className="mt-2 text-xs text-accent">{t("reference.activity.layerNumber", { number: current.activity.tier })}</p>}
      {family.kind === "challenge" ? <fieldset className="mt-5"><legend className="mb-2 text-xs text-subtle">{t("reference.activity.selectLevel")}</legend><div className="flex flex-wrap gap-1.5">{family.variants.map((variant) => <button type="button" key={variant.id} aria-pressed={variant.id === current.id} aria-label={t("reference.activity.level", { level: variant.activity?.level })} onClick={() => onSelect(variant.id)} className={cn("h-10 min-w-10 cursor-pointer rounded-[var(--radius-sm)] border px-2 text-sm tabular-nums", variant.id === current.id ? "border-accent bg-surface-hover text-accent font-semibold" : "border-border bg-surface text-subtle hover:text-white")}>{variant.activity?.level}</button>)}</div></fieldset>
        : family.variants.length > 1 && <label className="mt-5 flex max-w-md flex-col gap-2 text-xs text-subtle">{t("reference.activity.selectVariant")}
          <CategoryDropdown ariaLabel={t("reference.activity.selectVariant")} value={current.id} onChange={onSelect}
            options={family.variants.map((variant, index) => ({ key: variant.id, label: variantLabel(variant, index) }))} />
        </label>}
    </header>
    <DetailTabs id={id} label="reference.activity.sections" tabs={TABS} value={tab} onChange={setTab} />
    <div key={`${tab}-${current.id}`} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
      <div className="@container max-w-[820px] space-y-6 p-5">
        {!entry ? <p role={state.status === "error" ? "alert" : "status"} className="text-sm text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>
          : tab === "rewards" ? <ActivityRewards key={entry.id} sections={entry.sections.filter(isActivityReward)} graded={family.kind === "challenge"} /> : <>
            <ActivityStats bossLevel={current.activity?.bossLevel} facts={summary} />
            {family.kind !== "event" && entry.description && <p className="whitespace-pre-line text-sm leading-6 text-zinc-200">{gameText(entry.description)}</p>}
            {entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}
            {family.kind === "event" && <ActivityEntrances familyId={family.id} faction={current.activity?.faction} onOpenMap={onOpenMap} />}
            {family.kind === "event" ? <ActivityOverview sections={overview} description={entry.description} /> : <ReferenceSections sections={overview} />}
            {!entry.description && !current.activity?.bossLevel && !summary.length && !overview.length && <p className="text-sm text-subtle">{t("reference.activity.noDetails")}</p>}
          </>}
      </div>
    </div>
  </>;
};

export default ActivityDetail;
