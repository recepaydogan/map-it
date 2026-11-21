import { useTranslation } from "react-i18next";
import SpellLink from "../spells/spell-link";
import DatabaseSectionTitle from "./database-section-title";
import type { DatabaseItem } from "./item-database-types";

const ItemClassicChanges = ({ changes }: { changes: NonNullable<DatabaseItem["classicChanges"]> }) => {
  const { t } = useTranslation();
  const fields = (["name", "itemLevel", "quality", "stats"] as const)
    .filter((key) => changes[key]).map((key) => ({ key, value: changes[key]! }));
  return <section className="@min-[640px]:w-1/2">
    <DatabaseSectionTitle>{t("database.clientItem.classicChanges")}</DatabaseSectionTitle>
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
      <div className="grid grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-border bg-elevated px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-subtle"><span /><span>{t("database.clientItem.classicEra")}</span><span>{t("database.clientItem.foreverBeta")}</span></div>
      {fields.map(({ key, value }) => <div key={key} className="grid grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-border/70 px-3 py-2 text-[11px] leading-5 last:border-b-0"><span className="font-medium text-subtle">{t(`database.clientItem.changeFields.${key}`)}</span><span className="break-words text-zinc-400">{value.before}</span><span className="break-words text-zinc-100">{value.after}</span></div>)}
      {changes.spells && <div className="grid grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-border/70 px-3 py-2 text-[11px] leading-5 last:border-b-0"><span className="font-medium text-subtle">{t("database.clientItem.changeFields.spells")}</span>{([changes.spells.before, changes.spells.after] as const).map((spells, index) => <span key={index} className="flex flex-col items-start gap-1">{spells.length ? spells.map((spell) => <SpellLink key={spell.id} id={Number(spell.id)} name={spell.name} showIcon />) : <span className="text-subtle">—</span>}</span>)}</div>}
    </div>
  </section>;
};

export default ItemClassicChanges;
