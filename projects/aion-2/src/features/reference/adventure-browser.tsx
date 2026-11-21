import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import ItemIcon from "../database/item-icon";
import { adventureFamilies, adventureKind, adventureVariant } from "./adventure-presentation";
import ReferenceDetail from "./reference-detail";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useReferenceIndex } from "./use-reference-data";
import { questDisplayName, translatedQuestTitle } from "./quest-presentation";
import { CURRENT_DUNGEON_RULES } from "../../game-config";

const AdventureBrowser = ({ target, onOpenMap, onCurrentChange, ...navigation }: ReferenceNavigationProps & {
  target: ReferenceTarget; onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const state = useReferenceIndex();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [faction, setFaction] = useState("");
  const [region, setRegion] = useState("");
  const [selected, setSelected] = useState(target.id);
  const [limit, setLimit] = useState(80);
  const resetResults = () => { setSelected(""); setLimit(80); };
  const entries = useMemo(() => state.status === "ready" ? state.data.entries.filter((entry) =>
    entry.category === target.category && (entry.adventure?.listed || (target.category === "quests" && translatedQuestTitle(entry.id, t)) || entry.id === target.id)) : [], [state, target.category, target.id, t]);
  const families = useMemo(() => adventureFamilies(entries.filter((entry) => {
    const data = entry.adventure;
    return (!kind || data?.kind === kind) && (!faction || data?.faction === faction || data?.faction === "All")
      && (!region || data?.region === region)
      && query.trim().toLocaleLowerCase().split(/\s+/).every((word) =>
        `${entry.name} ${gameText(target.category === "quests" ? questDisplayName(entry, t, gameText) : entry.name)} ${data?.region ?? ""} ${gameText(data?.region ?? "")}`.toLocaleLowerCase().includes(word));
  })), [entries, kind, faction, region, query, gameText, t, target.category]);
  const family = families.find((item) => item.variants.some((entry) => entry.id === selected));
  const current = family?.variants.find((entry) => entry.id === selected);
  const kinds = [...new Set(entries.map((entry) => entry.adventure?.kind).filter((key): key is string => Boolean(key)))];
  const regions = [...new Set(entries.map((entry) => entry.adventure?.region).filter((key): key is string => Boolean(key)))].sort();
  const quests = target.category === "quests";
  useEffect(() => {
    if (current) onCurrentChange?.({ category: current.category, id: current.id, name: quests ? questDisplayName(current, t, gameText) : current.name });
  }, [current, onCurrentChange, t, quests, gameText]);

  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="p-6 text-sm text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <ItemCatalog
    label={t(`reference.categories.${target.category}`)}
    search={{ query, label: t("reference.search"), clearLabel: t("database.clearSearch"), onChange: (value) => { setQuery(value); resetResults(); } }}
    categoryLabel={t("reference.adventure.type")}
    categories={kinds.length > 0 && <>
      <ItemCatalogCategory label={t("reference.adventure.allTypes")} active={!kind} onSelect={() => { setKind(""); resetResults(); }} />
      {kinds.map((key) => <ItemCatalogCategory key={key} label={t(`reference.adventure.kinds.${key}`)}
        active={kind === key} onSelect={() => { setKind(key); resetResults(); }} />)}
    </>}
    toolbar={<>
      <CategoryDropdown ariaLabel={t("reference.labels.faction")} value={faction} onChange={(value) => { setFaction(value); resetResults(); }}
        options={[{ key: "", label: t("reference.adventure.allFactions") }, ...["Light", "Dark"].map((key) => ({ key, label: t(`reference.adventure.factions.${key}`) }))]} />
      {regions.length > 1 && <CategoryDropdown ariaLabel={t("reference.adventure.region")} value={region} onChange={(value) => { setRegion(value); resetResults(); }}
        options={[{ key: "", label: t("reference.adventure.allRegions") }, ...regions.map((key) => ({ key, label: gameText(key) }))]} />}
      <span role="status" className="catalog-result-count">{t("reference.adventure.results", { count: families.length.toLocaleString(i18n.language) })}</span>
    </>}
    columns={[{ label: t("reference.adventure.type") }, { label: t("reference.adventure.region") }]}
    rows={families.slice(0, limit).map((item) => {
      const entry = item.variants[0]!;
      const label = gameText(quests ? questDisplayName(entry, t, gameText) : item.name);
      const data = entry.adventure;
      const type = [adventureKind(entry, t),
        data?.level && !CURRENT_DUNGEON_RULES[entry.id] ? t("reference.adventure.level", { number: data.level }) : "",
        item.variants.length > 1 ? t("reference.adventure.variants", { count: item.variants.length }) : ""].filter(Boolean).join(" · ");
      const location = [data?.region && gameText(data.region),
        data?.faction && data.faction !== "All" ? t(`reference.adventure.factions.${data.faction}`) : ""].filter(Boolean).join(" · ");
      return { id: entry.id, label, icon: entry.icon && <ItemIcon icon={entry.icon} name={label} size={30} />,
        subtitle: [type, location].filter(Boolean).join(" · "), cells: [type, location] };
    })}
    onOpen={setSelected}
    onBack={() => setSelected("")}
    backLabel={t("reference.backToList")}
    detail={current && family && <div className="flex h-full min-h-0 flex-col">
      {family.variants.length > 1 && <div className="shrink-0 border-b border-border px-5 py-3">
        <CategoryDropdown ariaLabel={t("reference.adventure.selectVariant")} value={current.id} onChange={setSelected}
          triggerClassName="max-w-sm" options={family.variants.map((entry, index) => {
            const label = adventureVariant(entry, t);
            const duplicate = family.variants.some((other) => other.id !== entry.id && adventureVariant(other, t) === label);
            return { key: entry.id, label: duplicate ? t("reference.adventure.numberedVariant", { label, number: index + 1 }) : label };
          })} />
      </div>}
      <div className="min-h-0 flex-1"><ReferenceDetail key={current.id} summary={current} onOpenMap={onOpenMap} {...navigation} /></div>
    </div>}
    emptyMessage={t("database.noMatches")}
    afterRows={families.length > limit && <button type="button" onClick={() => setLimit((value) => value + 80)}>
      {t("reference.showMore", { count: families.length - limit })}
    </button>}
  />;
};

export default AdventureBrowser;
