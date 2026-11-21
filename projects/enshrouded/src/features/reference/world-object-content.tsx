import ProgressiveList from "../../components/progressive-list";
import { useRewardOrder } from "../database/use-reward-order";
import { ArrowRight } from "lucide-react";
import DatabaseSectionTitle from "../database/database-section-title";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getItemDisplayName } from "../../lib/item-display-name";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "./reference-navigation-context";
import ItemIcon from "../database/item-icon";
import { ReferenceLinks } from "./reference-sections";
import type { ReferenceEntry, ReferenceLink } from "./reference-types";
import WorldObjectRewardRates from "./world-object-reward-rates";
import { groupWorldObjectOutcomes, singleWorldObjectOutcome, visibleOutcomeFactions, worldObjectRewardOutcomes } from "./world-object-reward-outcomes";
import { formatDropChance } from "../../lib/format-drop-chance";
import { getSourceCategory } from "../map/map-config";

const Reward = ({ item }: { item: ReferenceLink }) => {
  const openReference = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  const { t, i18n } = useTranslation();
  const groups = groupWorldObjectOutcomes(worldObjectRewardOutcomes(item.rewardRates ?? []));
  const single = singleWorldObjectOutcome(groups);
  const factions = single ? visibleOutcomeFactions(groups[0].factions) : [];
  return <div className="py-2">
    <button type="button" onClick={() => openReference(item)}
      aria-pressed={selectedReference !== undefined ? sameReferenceTarget(selectedReference, item) : undefined}
      className={cn("group flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1 text-left text-[13px] text-zinc-100 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent",
        sameReferenceTarget(selectedReference, item) && "bg-accent-soft ring-1 ring-inset ring-accent/60")}>
      {item.icon && <ItemIcon icon={item.icon} name={getItemDisplayName(item.name)} size={28} />}
      <span className="min-w-0 flex-1">{getItemDisplayName(item.name)}{single && <span className="ml-1.5 inline-block text-xs tabular-nums text-subtle">×{single.quantityMin.toLocaleString(i18n.language)}</span>}</span>
      {single && <span className="shrink-0 text-xs tabular-nums text-accent">{formatDropChance(single.percent, i18n.language)}</span>}
      <ArrowRight size={14} className="shrink-0 text-subtle group-hover:text-accent" aria-hidden="true" />
    </button>
    {single ? (factions.length > 0 || groups[0].contextKey) && <p className="mt-1 text-[10px] text-subtle">
      {[factions.map((faction) => t(`reference.worldObject.factions.${faction}`)).join(" / "),
        groups[0].contextKey ? t(groups[0].contextKey) : ""].filter(Boolean).join(" · ")}
    </p> : <WorldObjectRewardRates rates={item.rewardRates ?? []} />}
  </div>;
};

const WorldObjectContent = ({ entry, variants = [] }: { entry: ReferenceEntry; variants?: ReferenceEntry[] }) => {
  const { t, i18n } = useTranslation();
  const orderRewards = useRewardOrder();
  const [selected, setSelected] = useState(entry.id);
  const [mode, setMode] = useState<"normal" | "key">("key");
  const options = variants.length ? variants : [entry];
  const current = options.find((candidate) => candidate.id === selected) ?? options[0]!;
  const object = current.rewardObject;
  if (!object) return null;
  const hideAccessDetails = getSourceCategory(current.id)?.hideObjectAccessDetails === true;
  const mixed = new Set(options.map((candidate) => candidate.rewardObject?.keyOnly)).size > 1;
  const freeOpening = object.access?.requirement === "none";
  const selectedMode = freeOpening ? "normal" : object.keyOnly ? "key" : mode;
  const rewards = orderRewards(object.modes.filter((candidate) => candidate.kind === selectedMode).flatMap((candidate) => candidate.items));
  return <div className="space-y-4">
    {mixed && <p className="text-xs leading-relaxed text-amber-200">{t("reference.worldObject.mixedNotice")}</p>}
    {mixed && <div className="flex flex-wrap gap-2">{options.map((candidate) => <button key={candidate.id} type="button"
      aria-pressed={current.id === candidate.id} onClick={() => setSelected(candidate.id)}
      className={cn("rounded border border-border px-3 py-2 text-xs", current.id === candidate.id && "border-accent text-accent")}>
      {t(candidate.rewardObject?.keyOnly ? "reference.worldObject.locked" : "reference.worldObject.standard")}
    </button>)}</div>}
    {!hideAccessDetails && <p className="text-sm font-medium text-zinc-100">{t(freeOpening ? "reference.worldObject.noKey" : object.keyOnly ? "reference.worldObject.required" : "reference.worldObject.optional")}</p>}
    {object.access && (!hideAccessDetails || object.terrain === "Water" || object.access.eventLinked) && <div className="space-y-2">
      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {!hideAccessDetails && <div><dt className="text-subtle">{t("reference.worldObject.interaction")}</dt><dd className="mt-1 text-zinc-100">{t("reference.worldObject.seconds", { value: object.access.interactionSeconds.toLocaleString(i18n.language) })}</dd></div>}
        {object.terrain === "Water" && <div><dt className="text-subtle">{t("reference.collectible.terrain")}</dt><dd className="mt-1 text-zinc-100">{t("reference.collectible.terrains.water")}</dd></div>}
      </dl>
      {object.access.eventLinked && <p className="text-xs leading-relaxed text-subtle">{t("reference.worldObject.eventLinked")}</p>}
      {!hideAccessDetails && object.access.rewardOnce && <p className="text-xs leading-relaxed text-subtle">{t("reference.worldObject.repeatRestriction")}</p>}
    </div>}
    {!freeOpening && <section className="space-y-2">
      <DatabaseSectionTitle>{t("reference.worldObject.keys")}</DatabaseSectionTitle>
      <ReferenceLinks links={object.keys} />
    </section>}
    {!freeOpening && !object.keyOnly && <div className="flex gap-2">{(["normal", "key"] as const).map((kind) => <button type="button" key={kind}
      aria-pressed={selectedMode === kind} onClick={() => setMode(kind)}
      className={cn("rounded border border-border px-3 py-2 text-xs", selectedMode === kind && "border-accent text-accent")}>
      {t(`reference.worldObject.${kind}`)}
    </button>)}</div>}
    <section className="space-y-2">
      <DatabaseSectionTitle count={rewards.length}>{t("map.search.sourceKinds.loot")}</DatabaseSectionTitle>
      {rewards.length ? <>
        <ProgressiveList initialCount={8} className="divide-y divide-border">{rewards.map((item, index) => <Reward key={`${item.id}-${index}`} item={item} />)}</ProgressiveList>
      </> : <p className="text-xs leading-relaxed text-subtle">{t(freeOpening ? object.access?.eventLinked ? "reference.worldObject.eventRewardsUnknown" : "reference.worldObject.contentsUnknown" : "reference.worldObject.missingRewards")}</p>}
    </section>
    {!!object.achievements.length && <section className="space-y-2">
      <ReferenceLinks links={object.achievements} />
    </section>}
  </div>;
};

export default WorldObjectContent;
