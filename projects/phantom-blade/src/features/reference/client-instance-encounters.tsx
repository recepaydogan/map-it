import { useState } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { cn } from "../../lib/cn";

const ClientInstanceEncounters = ({ encounters, wide = false }: {
  encounters: { id: number; nameKey: string }[];
  wide?: boolean;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!encounters.length) return null;
  const visible = expanded ? encounters : encounters.slice(0, 6);
  return <section className="space-y-3">
    <DatabaseSectionTitle count={encounters.length}>{t("map.instanceEncounters.title")}</DatabaseSectionTitle>
    <ul className={cn("grid gap-1.5", wide && "grid-cols-2")}>
      {visible.map(({ id, nameKey }) => <li key={id}
        className="rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-3 py-2 text-[12px] font-medium leading-5 text-zinc-100">
        {t(nameKey)}
      </li>)}
    </ul>
    {!expanded && encounters.length > visible.length && <button type="button"
      onClick={() => setExpanded(true)}
      className="w-full cursor-pointer rounded-[var(--radius-sm)] px-3 py-2 text-center text-[12px] font-semibold text-accent transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
      {t("reference.showMore", { count: encounters.length - visible.length })}
    </button>}
  </section>;
};

export default ClientInstanceEncounters;
