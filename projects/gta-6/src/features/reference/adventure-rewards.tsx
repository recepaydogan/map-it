import ProgressiveList from "../../components/progressive-list";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getItemDisplayName } from "../../lib/item-display-name";
import DatabaseSectionTitle from "../database/database-section-title";
import DropSearchHeader from "../database/drop-search-header";
import AdventureLinkList from "./adventure-link-list";
import { ReferenceFacts } from "./reference-sections";
import type { ReferenceLink, ReferenceSection } from "./reference-types";

const REWARDS = new Set([
  "guaranteed-rewards", "possible-rewards", "reward-ticket", "faction-rewards-light",
  "faction-rewards-dark", "first-clear-rewards", "repeat-rewards", "possible-drops", "guaranteed-drops",
].map((key) => `reference.labels.${key}`));

const rewardOrder = (title: string) => title.includes("guaranteed-") ? 0 : title.includes("possible-") ? 1 : 2;

const RewardSection = ({ section, excludeItems, guaranteed }: {
  section: ReferenceSection; excludeItems?: Set<string>; guaranteed: Set<string>;
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const keep = (id: string) => !excludeItems?.has(id) && !(section.title === "reference.labels.possible-rewards" && guaranteed.has(id));
  const links = section.links?.filter((link) => keep(link.id)) ?? [];
  const rows = section.rows?.map((row) => ({ ...row, links: row.links?.filter((link) => keep(link.id)) }))
    .filter((row) => row.links?.length) ?? [];
  if (!links.length && !rows.length) return null;
  const count = links.length + rows.reduce((total, row) => total + (row.links?.length ?? 0), 0);
  const searchingDrops = section.title.endsWith("-drops") && count > 30;
  const search = searchingDrops ? query.trim().toLocaleLowerCase() : "";
  const matches = (link: ReferenceLink) => getItemDisplayName(link.name).toLocaleLowerCase().includes(search);
  const visibleLinks = search ? links.filter(matches) : links;
  const visibleRows = search ? rows.map((row) => ({ ...row, links: row.links?.filter(matches) }))
    .filter((row) => row.links?.length) : rows;
  const showRates = Boolean(section.showRewardRates || section.title.includes("possible-"));
  return <section className="space-y-3">
    {section.title.endsWith("-drops")
      ? <DropSearchHeader title={t(section.title)} count={count} titleCount={count} query={query} onQueryChange={setQuery} />
      : <DatabaseSectionTitle count={count}>{t(section.title)}</DatabaseSectionTitle>}
    {!!visibleLinks.length && <AdventureLinkList links={visibleLinks} showRates={showRates} initialCount={search ? visibleLinks.length : undefined} />}
    <ProgressiveList initialCount={search ? visibleRows.length : undefined} className="space-y-3">{visibleRows.map((row, rowIndex) => <div key={rowIndex} className="space-y-2">
      {row.name && !/^\d+$/.test(row.name) && <h4 className="text-xs font-medium text-subtle">{row.name}</h4>}
      {row.description && <p className="text-xs text-subtle">{row.description}</p>}
      {!!row.facts?.some((fact) => fact.value !== 0) && <ReferenceFacts facts={(row.facts ?? []).filter((fact) => fact.value !== 0)} />}
      <AdventureLinkList links={row.links ?? []} showRates={showRates} initialCount={search ? row.links?.length : undefined} />
    </div>)}</ProgressiveList>
    {search && !visibleLinks.length && !visibleRows.length && <p className="text-xs text-subtle">{t("database.acquisition.noMatchingDrops")}</p>}
  </section>;
};

const AdventureRewards = ({ sections, excludeItems }: { sections: ReferenceSection[]; excludeItems?: Set<string> }) => {
  const guaranteed = new Set(sections.filter((section) => section.title === "reference.labels.guaranteed-rewards")
    .flatMap((section) => [...(section.links ?? []), ...(section.rows ?? []).flatMap((row) => row.links ?? [])]).map((link) => link.id));
  const ordered = sections.filter((section) => REWARDS.has(section.title)).sort((a, b) =>
    rewardOrder(a.title) - rewardOrder(b.title));
  return <>{ordered.map((section, index) => <RewardSection key={`${section.title}-${index}`}
    section={section} excludeItems={excludeItems} guaranteed={guaranteed} />)}</>;
};
export default AdventureRewards;
