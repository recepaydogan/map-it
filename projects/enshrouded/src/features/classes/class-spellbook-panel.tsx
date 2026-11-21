import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SPELL_CLASS_IDS, useSpellIndex } from "../spells/spell-data";
import SpellCard from "../spells/spell-card";
import type { GameClass } from "./class-types";

const ClassSpellbookPanel = ({ entry }: { entry: GameClass }) => {
  const { t } = useTranslation();
  const { rows, error } = useSpellIndex();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(24);
  const spells = useMemo(() => {
    if (!rows) return [];
    const phrase = query.trim().toLocaleLowerCase();
    const seen = new Set<string>();
    return rows.filter((row) => row[4] === SPELL_CLASS_IDS[entry.id] && (!phrase || `${row[1]} ${row[2]} ${row[0]}`.toLocaleLowerCase().includes(phrase)))
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0])
      .filter((row) => { if (seen.has(row[1])) return false; seen.add(row[1]); return true; });
  }, [rows, entry.id, query]);
  return <div className="space-y-3">
    <label className="flex max-w-sm items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 focus-within:border-accent"><Search size={14} className="text-subtle" aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(24); }} placeholder={t("spells.search")} aria-label={t("spells.search")} className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-muted" /></label>
    {!rows && <p className="py-3 text-[12px] text-subtle" role={error ? "alert" : "status"}>{t(error ? "spells.loadError" : "reference.loading")}</p>}
    {rows && <p className="text-[11px] tabular-nums text-subtle">{t("spells.results", { count: spells.length })}</p>}
    {rows && <div className="grid gap-1.5 @min-[680px]:grid-cols-2">{spells.slice(0, limit).map((row) => <SpellCard key={row[0]} id={row[0]} name={row[1]} iconId={row[3]} badge={row[5] ? t("spells.new") : undefined} />)}</div>}
    {rows && spells.length === 0 && <p className="py-4 text-[12px] text-subtle">{t("database.noMatches")}</p>}
    {limit < spells.length && <button type="button" onClick={() => setLimit((value) => value + 24)} className="w-full cursor-pointer rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold text-accent hover:bg-accent-soft">{t("spells.showMore", { count: Math.min(24, spells.length - limit) })}</button>}
  </div>;
};

export default ClassSpellbookPanel;
