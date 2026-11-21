import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { useGameText } from "../../i18n/game-text";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { getItemDisplayName } from "../../lib/item-display-name";
import { factionDisplayName } from "../../lib/faction-display-name";
import ItemIcon from "../database/item-icon";
import type { MapReferenceSearch } from "../map/map-focus-request";
import ReferenceDetail from "./reference-detail";
import type { ReferenceEntry, ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useReferenceEntries, useReferenceIndex } from "./use-reference-data";

const wingValue = (entry: ReferenceEntry, label: string) => String(entry.facts.find((fact) => fact.label === `reference.labels.${label}`)?.value ?? "");
const wingIcon = (entry: ReferenceEntry) => entry.sections.find((section) => section.title === "reference.labels.unlock-items")?.links?.[0]?.icon;

const WingPage = ({ target, onOpenMap, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & {
  target: ReferenceTarget;
  onOpenMap: (mapId: string, markerId: string, search?: MapReferenceSearch) => void;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const index = useReferenceIndex();
  const summaries = useMemo(() => index.status === "ready" ? index.data.entries.filter((entry) => entry.category === "wings") : [], [index]);
  const wingData = useReferenceEntries(summaries);
  const [query, setQuery] = useState("");
  const [faction, setFaction] = useState("");
  const [grade, setGrade] = useState("");
  const [selected, setSelected] = useState(target.id);

  const entries = useMemo(() => wingData.status === "ready" ? [...wingData.data].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) : [], [wingData]);
  const factions = useMemo(() => [...new Set(entries.map((entry) => wingValue(entry, "faction")))].filter(Boolean), [entries]);
  const grades = useMemo(() => [...new Set(entries.map((entry) => wingValue(entry, "grade")))].filter(Boolean), [entries]);
  const filtered = useMemo(() => entries.filter((entry) => (!faction || wingValue(entry, "faction") === faction)
    && (!grade || wingValue(entry, "grade") === grade)
    && (!query || getItemDisplayName(entry.name, gameText(entry.name)).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [entries, faction, grade, query, gameText]);
  const current = entries.find((entry) => entry.id === selected);

  useEffect(() => {
    if (current) onCurrentChange?.({ category: "wings", id: current.id, name: current.name });
  }, [current, onCurrentChange]);

  const state = index.status === "error" || wingData.status === "error" ? "error" : index.status !== "ready" || wingData.status !== "ready" ? "loading" : "ready";

  if (state !== "ready") return <p role={state === "error" ? "alert" : "status"} className="p-6 text-sm text-muted">{t(state === "error" ? "reference.error" : "reference.loading")}</p>;
  const summary = summaries.find((entry) => entry.id === current?.id);
  return <ItemCatalog
    label={t("reference.categories.wings")}
    search={{ query, label: t("reference.search"), clearLabel: t("database.clearSearch"), onChange: (value) => { setQuery(value); setSelected(""); } }}
    categoryLabel={t("reference.labels.grade")}
    categories={grades.length > 0 && <>
      <ItemCatalogCategory label={t("wings.allGrades")} active={!grade} onSelect={() => { setGrade(""); setSelected(""); }} />
      {grades.map((value) => <ItemCatalogCategory key={value} label={gameText(value)} active={grade === value}
        onSelect={() => { setGrade(value); setSelected(""); }} />)}
    </>}
    toolbar={<>
      <CategoryDropdown ariaLabel={t("reference.labels.faction")} value={faction}
      onChange={(value) => { setFaction(value); setSelected(""); }}
      options={[{ key: "", label: t("wings.allFactions") }, ...factions.map((value) => ({ key: value, label: factionDisplayName(value, t, gameText) }))]} />
      <span role="status" className="catalog-result-count">{t("reference.entryCount", { count: filtered.length.toLocaleString(i18n.language) })}</span>
    </>}
    columns={[{ label: t("reference.labels.faction") }, { label: t("reference.labels.grade") }]}
    rows={filtered.map((entry) => {
      const label = getItemDisplayName(entry.name, gameText(entry.name));
      const faction = factionDisplayName(wingValue(entry, "faction"), t, gameText);
      const grade = gameText(wingValue(entry, "grade"));
      return { id: entry.id, label, icon: <ItemIcon icon={wingIcon(entry)} name={label} size={30} />,
        subtitle: [faction, grade].filter(Boolean).join(" · "), cells: [faction, grade] };
    })}
    onOpen={setSelected}
    onBack={() => setSelected("")}
    backLabel={t("reference.backToList")}
    detail={summary && <ReferenceDetail key={summary.id} summary={summary} onOpenMap={onOpenMap} backLabel={backLabel} onBack={onBack} />}
    emptyMessage={t("database.noMatches")}
  />;
};

export default WingPage;
