import { getItemDisplayName } from "../../lib/item-display-name";
import { Package } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemAcquisitionSection from "../database/item-acquisition";
import ItemIcon from "../database/item-icon";
import ReferenceBackLink from "./reference-back-link";
import { ReferenceFacts, ReferenceLinks } from "./reference-sections";
import RewardBoxContents from "./reward-box-contents";
import type { RewardBoxFamily, RewardBoxSummary, RewardBoxVariant } from "./reward-box-types";
import { useRewardBoxFamily } from "./use-reference-data";
import { boxCondition, groupBoxVariants } from "./reward-box-variants";
import type { ReferenceNavigationProps } from "./reference-types";

const RewardBoxDetail = ({ family, editions, selectedId, onSelectVariant, onOpenMap, backLabel, onBack }: ReferenceNavigationProps & {
  family: RewardBoxFamily;
  editions: RewardBoxSummary[];
  selectedId: string;
  onSelectVariant: (id: string) => void;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const groups = groupBoxVariants(family.variants);
  const selectedGroup = groups.find((group) => group.some((variant) => variant.id === selectedId)) ?? groups[0];
  const variant = selectedGroup.find((entry) => entry.id === selectedId) ?? selectedGroup[0];
  const label = (group: RewardBoxVariant[], index: number) => {
    const conditions = [...new Set(group.map((entry) => ["faction", "class"].map((field) => boxCondition(entry, field))
      .filter((value) => value && value !== "All" && value !== "None").join(" / ")).filter(Boolean))];
    const min = boxCondition(group[0], "minimum-level");
    const max = boxCondition(group[0], "maximum-level");
    const levels = min !== undefined && max !== undefined ? t("reference.boxes.levelRange", { min, max }) : "";
    return [conditions.join(", ") || t("reference.boxes.allCharacters"), levels,
      t("reference.boxes.variantNumber", { number: index + 1 })].filter(Boolean).join(" · ");
  };
  const sources = family.sources.filter((source) => source.category !== "boxes" || source.id !== family.id);
  const hasAcquisition = Object.values(family.acquisition).some((values) => values.length > 0);
  const levelFacts = variant.facts.filter((fact) => !["reference.labels.faction", "reference.labels.class"].includes(fact.label));
  const restrictions = [...new Set(selectedGroup.flatMap((entry) => ["faction", "class"].map((field) => boxCondition(entry, field)))
    .filter((value) => value && value !== "All" && value !== "None"))];

  return <article className="scroll-slim min-h-0 flex-1 overflow-y-auto text-left">
    <header className="border-b border-border bg-surface/40 px-5 py-5">
      <ReferenceBackLink label={backLabel} onBack={onBack} />
      <div className="flex max-w-[760px] items-center gap-4">
        <div className="grid h-[64px] w-[64px] shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/20 bg-background">
          {family.icon ? <ItemIcon icon={family.icon} name={getItemDisplayName(family.name)} size={52} /> : <Package size={28} className="text-accent" aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <p className="mb-1.5 text-[11px] font-medium text-accent">{t(`reference.boxes.${family.technical ? "technical" : family.kind}`)}</p>
          <h2 className="break-words font-display text-[22px] font-semibold leading-tight text-zinc-100">{getItemDisplayName(family.name)}</h2>
        </div>
      </div>
    </header>
    <div className="max-w-[808px] space-y-7 px-5 py-5">
      {family.technical && <p className="rounded-[var(--radius-sm)] border border-border bg-surface p-3 text-[12px] leading-relaxed text-subtle">{t("reference.boxes.technicalNotice")}</p>}
      {editions.length > 1 && <section className="space-y-2">
        <p className="text-[12px] font-medium text-zinc-200">{t("reference.boxes.edition")}</p>
        <CategoryDropdown ariaLabel={t("reference.boxes.edition")} value={family.id}
          options={editions.map((edition, index) => ({ key: edition.id, label: [t("reference.boxes.editionNumber", { number: index + 1 }),
            ...edition.preview.map((item) => `${getItemDisplayName(item.name)} ×${item.quantity}`)].join(" · ") }))}
          onChange={(id) => onSelectVariant(editions.find((edition) => edition.id === id)!.variantIds[0])} />
        <p className="text-[12px] leading-relaxed text-subtle">{t("reference.boxes.editionNotice")}</p>
      </section>}
      {groups.length > 1 ? <section className="space-y-2">
        <p className="text-[12px] font-medium text-zinc-200">{t("reference.boxes.variant")}</p>
        <CategoryDropdown ariaLabel={t("reference.boxes.variant")} value={selectedGroup[0].id}
          options={groups.map((group, index) => ({ key: group[0].id, label: label(group, index) }))} onChange={onSelectVariant} />
        <p className="text-[12px] leading-relaxed text-subtle">{t("reference.boxes.variantNotice")}</p>
      </section> : <p className="text-[12px] text-subtle">{restrictions.length ? restrictions.join(" · ") : t("reference.boxes.allCharacters")}{family.variants.length > 1 && ` · ${t("reference.boxes.sameContents")}`}</p>}
      <RewardBoxContents key={variant.id} sections={variant.sections} technical={family.technical} />
      {variant.flattened && <p className="text-[12px] leading-relaxed text-subtle">{t("reference.boxes.expandedNotice")}</p>}
      <section className="space-y-3">
        {(sources.length > 0 || !hasAcquisition) && <DatabaseSectionTitle>{t("reference.boxes.sources")}</DatabaseSectionTitle>}
        {sources.length > 0 && <ReferenceLinks links={sources.map((source) => ({ ...source, note: t(`reference.categories.${source.category}`) }))} />}
        {!sources.length && !hasAcquisition && <p className="text-[13px] text-subtle">{t(family.kind === "store" ? "reference.boxes.storeSourceNotice" : "reference.boxes.sourceUnknown")}</p>}
        {hasAcquisition && <ItemAcquisitionSection acquisition={family.acquisition} onOpenMap={onOpenMap} hideTitle />}
      </section>
      <details className="rounded-[var(--radius-sm)] border border-border px-3 py-3">
        <summary className="cursor-pointer text-[12px] font-medium text-subtle">{t("reference.boxes.itemDetails")}</summary>
        <div className="mt-3 space-y-4">
          <ReferenceFacts facts={levelFacts} />
          <ReferenceLinks links={family.items} />
          <p className="break-all text-[11px] text-subtle">{t("reference.boxes.sourceRecords", { ids: family.variants.map((entry) => entry.id).join(", ") })}</p>
        </div>
      </details>
    </div>
  </article>;
};

const RewardBoxFamilyView = ({ summary, ...props }: Omit<ComponentProps<typeof RewardBoxDetail>, "family"> & { summary: RewardBoxSummary }) => {
  const { t } = useTranslation();
  const state = useRewardBoxFamily(summary);
  if (state.status !== "ready") return <p className="p-6 text-sm text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <RewardBoxDetail family={state.data} {...props} />;
};

export default RewardBoxFamilyView;
