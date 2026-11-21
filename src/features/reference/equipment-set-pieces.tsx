import { ArrowUpRight } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { ITEM_GRADE_ORDER } from "../../game-config";
import DatabaseSectionTitle from "../database/database-section-title";
import type { DatabaseItem } from "../database/item-database-types";
import ItemIcon from "../database/item-icon";
import { useItemCatalog } from "../database/use-item-catalog";
import { groupEquipmentSetPieces } from "./group-equipment-set-pieces";
import { useReferenceNavigation } from "./reference-navigation-context";
import type { ReferenceLink } from "./reference-types";

const Piece = ({ category, variants }: { category: string; variants: DatabaseItem[] }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const id = useId();
  const [selectedId, setSelectedId] = useState(variants[0]!.id);
  const selected = variants.find((item) => item.id === selectedId) ?? variants[0]!;
  return <li className="space-y-3 border-b border-border py-4 last:border-0">
    <div className="flex flex-wrap items-center gap-3">
      <ItemIcon icon={selected.icon} name={category} size={44} />
      <div className="min-w-0 flex-1"><h4 className="text-[14px] font-semibold text-zinc-100">{category}</h4>
        {selected.usageLevel !== undefined && <p className="mt-1 text-[12px] text-subtle">{t("database.usageLevel", { level: selected.usageLevel })}</p>}
      </div>
      <div className="flex w-full flex-wrap items-end gap-3 @min-[600px]:w-auto">
        <div className="w-48 max-w-full"><label htmlFor={id} className="mb-1 block text-[11px] text-subtle">{t("reference.sets.quality")}</label>
          <CategoryDropdown id={id} ariaLabel={t("reference.sets.pieceQuality", { piece: category })} value={selected.id} onChange={setSelectedId} triggerClassName="h-9 text-[12px]"
            options={variants.map((item) => ({ key: item.id, label: `${item.grade}${item.itemLevel !== undefined ? ` · ${t("database.itemLevel", { level: item.itemLevel })}` : ""}` }))} />
        </div>
        <button type="button" onClick={() => openReference({ category: "items", id: selected.id, name: selected.name })} aria-label={t("reference.sets.openPiece", { piece: category, quality: selected.grade })} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[12px] font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">{t("reference.sets.viewItem")}<ArrowUpRight size={14} aria-hidden="true" /></button>
      </div>
    </div>
    <dl className="space-y-1 pl-[56px]">{selected.sections.filter((section) => section.key === "base").flatMap((section) => section.stats).map((stat) => <div key={stat.key} className="flex flex-wrap gap-x-3 text-[12px]"><dt className="text-subtle">{stat.label}</dt><dd className="font-medium tabular-nums text-zinc-100">{stat.value}</dd></div>)}</dl>
  </li>;
};

const EquipmentSetPieces = ({ links }: { links: ReferenceLink[] }) => {
  const { t } = useTranslation();
  const state = useItemCatalog();
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="text-[13px] text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const groups = groupEquipmentSetPieces(links, state.catalog.items, ITEM_GRADE_ORDER);
  return <section className="@container">
    <DatabaseSectionTitle>{t("reference.labels.set-pieces")}</DatabaseSectionTitle>
    <p className="text-[13px] leading-relaxed text-subtle">{t("reference.sets.piecesHint")}</p>
    <ul className="mt-1">{groups.map((group) => <Piece key={group.category} {...group} />)}</ul>
  </section>;
};

export default EquipmentSetPieces;
