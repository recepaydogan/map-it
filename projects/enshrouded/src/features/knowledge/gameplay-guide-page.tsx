import { useGameText } from "../../i18n/game-text";
import { matchesContentSearch } from "../../i18n/content-search";
import { Package } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ItemCatalogCategory } from "../../components/layout/item-catalog";
import EnshroudedCatalog from "./enshrouded-catalog";
import catalog from "../../../public/data/enshrouded/gameplay-catalog.json";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import { BUILDING_NAVIGATION_EVENT, hasBuildingPage } from "./building-navigation";
import { WIKI_NAVIGATION_EVENT, hasWikiPage } from "./wiki-navigation";
import { CRAFTING_NAVIGATION_EVENT, hasCraftingPage } from "../crafting/crafting-navigation";
import { findProgressionPage, PROGRESSION_NAVIGATION_EVENT } from "./progression-navigation";
import EnshroudedItemRow from "./enshrouded-item-row";
import EnshroudedItemImage from "./enshrouded-item-image";
import InlineLinkedText from "./inline-linked-text";

type Section = "farming" | "fishing";
type GuideCategory = "plants" | "animals" | "rods" | "spots" | "loot";
type Seedling = (typeof catalog.seedlings)[number];
type Animal = (typeof catalog.animals)[number];
type Rod = (typeof catalog.fishing.rods)[number];
type Spot = (typeof catalog.fishing.spots)[number];
type Loot = (typeof catalog.fishing.loot)[number];
type Entry = Seedling | Animal | Rod | Spot | Loot;

const guideSections = {
  farming: [
    { id: "plants", entries: catalog.seedlings },
    { id: "animals", entries: catalog.animals },
  ],
  fishing: [
    { id: "rods", entries: catalog.fishing.rods },
    { id: "spots", entries: catalog.fishing.spots },
    { id: "loot", entries: catalog.fishing.loot },
  ],
} satisfies Record<Section, readonly { id: GuideCategory; entries: Entry[] }[]>;
const nameOf = (entry: Entry) => "biome" in entry ? entry.biome : entry.name;
const imageOf = (entry: Entry) => "icon" in entry ? entry.icon : null;
const keyOf = (entry: Entry) => "biome" in entry
  ? `spot:${catalog.fishing.spots.indexOf(entry)}` : nameOf(entry);

function Icon({ path, size = 36 }: { path: string | null; size?: number }) {
  return path ? <img src={contentUrl(path)} alt="" width={size} height={size} loading="lazy"
    className="shrink-0 rounded-[var(--radius-sm)] object-contain" />
    : <span className="grid shrink-0 place-items-center text-zinc-500" style={{ width: size, height: size }}>
      <Package size={Math.round(size * 0.42)} aria-hidden="true" />
    </span>;
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 flex items-center gap-3 text-base font-semibold text-white">
    <span className="h-4 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />{children}
  </h3>;
}

function OpenItem({ name, quantity }: { name: string; quantity?: number }) {
  const knownBuilding = hasBuildingPage(name);
  const knownWiki = hasWikiPage(name);
  const open = () => window.dispatchEvent(new CustomEvent(knownBuilding ? BUILDING_NAVIGATION_EVENT : WIKI_NAVIGATION_EVENT,
    { detail: name }));
  return <EnshroudedItemRow name={name} quantity={quantity}
    onClick={knownBuilding || knownWiki ? open : undefined} />;
}

function ObtainingText({ value, names }: { value: string; names: string[] }) {
  return <InlineLinkedText value={value} links={names.map((name) => {
    const progression = findProgressionPage(name);
    const event = hasBuildingPage(name) ? BUILDING_NAVIGATION_EVENT
      : hasWikiPage(name) ? WIKI_NAVIGATION_EVENT
        : progression ? PROGRESSION_NAVIGATION_EVENT
          : hasCraftingPage(name) ? CRAFTING_NAVIGATION_EVENT : null;
    return { label: name.replace(/^Quests\//, ""),
      onClick: event ? () => window.dispatchEvent(new CustomEvent(event,
        { detail: event === PROGRESSION_NAVIGATION_EVENT ? progression : name })) : undefined };
  })} />;
}

export default function GameplayGuidePage({ section }: { section: Section }) {
  const contentText = useGameText();
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useState<GuideCategory | "all">("all");
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<{ id: GuideCategory; entry: Entry } | null>(null);
  const sections = guideSections[section];
  const categoryLabel = (id: GuideCategory) => t("gameplayGuide." + id);
  const selectCategory = (id: GuideCategory | "all") => {
    setCategory(id);
    setGroup("");
    setSelection(null);
  };
  const plantingGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of catalog.seedlings) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
    return [...counts];
  }, []);
  const matching = useMemo(() => sections.flatMap(({ id, entries }: { id: GuideCategory; entries: Entry[] }) => {
    if (category !== "all" && category !== id) return [];
    const biomes = new Set<string>();
    return entries.flatMap((entry) => {
      if (id === "plants" && group && "group" in entry && entry.group !== group) return [];
      if (!matchesContentSearch(query, [nameOf(entry), "yields" in entry ? entry.yields : null,
        "description" in entry ? entry.description : null], contentText)) return [];
      if ("biome" in entry) {
        if (biomes.has(entry.biome)) return [];
        biomes.add(entry.biome);
      }
      return [{ key: id + ":" + keyOf(entry), id, entry }];
    });
  }), [category, contentText, group, query, sections]);
  const selected = selection?.entry;
  const selectedCategory = selection?.id;

  return <div className="h-full min-h-0" data-enshrouded-guide={section}>
    <EnshroudedCatalog
      label={t("gameplayGuide." + section)}
      search={{ query, label: t("gameplayGuide.search"), clearLabel: t("gameplayGuide.clearSearch"),
        onChange: (value) => { setQuery(value); setSelection(null); } }}
      categories={<>
        <ItemCatalogCategory label={t("itemCatalog.viewAll")} active={category === "all"}
          onSelect={() => selectCategory("all")} />
        {sections.map(({ id, entries }) => <div key={id}>
          <ItemCatalogCategory label={categoryLabel(id)} active={category === id && !group}
            count={(id === "spots" ? new Set(catalog.fishing.spots.map((spot) => spot.biome)).size : entries.length)
              .toLocaleString(i18n.language)}
            onSelect={() => selectCategory(id)} />
          {id === "plants" && category === "plants" && <div className="item-catalog-subcategories">
            {plantingGroups.map(([name, count]) => <ItemCatalogCategory key={name} label={contentText(name)}
              count={count.toLocaleString(i18n.language)} active={group === name}
              onSelect={() => { setGroup(group === name ? "" : name); setSelection(null); }} />)}
          </div>}
        </div>)}
      </>}
      columns={[{ label: t("itemCatalog.categories") }]}
      rows={matching.map(({ key, id, entry }) => {
        const type = "group" in entry ? contentText(entry.group) : categoryLabel(id);
        return { id: key, label: contentText(nameOf(entry)), subtitle: type, cells: [type],
          icon: <Icon path={imageOf(entry)} size={30} /> };
      })}
      onOpen={(key) => {
        const record = matching.find((entry) => entry.key === key);
        if (record) setSelection({ id: record.id, entry: record.entry });
      }}
      onBack={() => setSelection(null)}
      backLabel={t("reference.backToList")}
      emptyMessage={t("gameplayGuide.noResults")}
      detail={selected && <article key={keyOf(selected)} className="@container h-full overflow-y-auto px-5 py-6 sm:px-6">
        <header className="flex items-start gap-4 border-b border-border pb-6">
          {!("biome" in selected) && <span className="grid h-20 w-20 shrink-0 place-items-center"><Icon path={imageOf(selected)} size={64} /></span>}
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            {t("gameplayGuide." + selectedCategory)}</p>
            <h2 className="mt-1 text-[25px] font-semibold leading-[1.15] text-white">{contentText(nameOf(selected))}</h2>
            {"biome" in selected && <p className="mt-2 text-sm text-zinc-400">
              {t("gameplayGuide.spotTypes", { count: catalog.fishing.spots.filter((spot) => spot.biome === selected.biome).length })}</p>}
            {"group" in selected && <p className="mt-2 text-xs text-zinc-400">{contentText(selected.group)}</p>}
          </div>
        </header>
        <div className="max-w-[760px] space-y-7 py-6">
          {selectedCategory === "plants" && "growthTime" in selected
            && <FarmingDetail entry={selected} t={t} />}
          {selectedCategory === "animals" && "kind" in selected
            && <AnimalDetail entry={selected} t={t} />}
          {selectedCategory === "rods" && "strength" in selected && <RodDetail entry={selected} t={t} />}
          {selectedCategory === "spots" && "rates" in selected && "biome" in selected
            && <SpotDetail entry={selected} variants={catalog.fishing.spots.filter((spot) => spot.biome === selected.biome)}
              onSelect={(spot) => setSelection({ id: "spots", entry: spot })} t={t} />}
          {selectedCategory === "loot" && "rates" in selected && "name" in selected
            && !('strength' in selected) && <LootDetail entry={selected} t={t} />}
        </div>
      </article>}
    />
  </div>;
}

type Translate = ReturnType<typeof useTranslation>["t"];

function FarmingDetail({ entry, t }: { entry: Seedling; t: Translate }) {
  const contentText = useGameText();
  const growTime = /^x/i.test(entry.growthTime) ? t("gameplayGuide.unknown") : entry.growthTime;
  return <>
    <dl className="grid grid-cols-2 gap-4 border-y border-border/70 py-4 @min-[660px]:grid-cols-3">
      {[[t("gameplayGuide.growthTime"), growTime], [t("gameplayGuide.waterRequirement"), entry.waterRequirement],
        [t("gameplayGuide.yields"), entry.yields],
        ...(entry.recipe ? [[t("gameplayGuide.craftTime"), entry.recipe.craftTime ?? t("gameplayGuide.unknown")]] : [])]
        .map(([label, value]) => <div key={label}>
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
        <dd className="mt-1 text-[13px] text-zinc-100">{contentText(value)}</dd></div>)}
    </dl>
    <section><Heading>{t("gameplayGuide.overview")}</Heading>
      <p className="text-[13px] leading-relaxed text-zinc-300">{t("gameplayGuide.farmingIntro")}</p></section>
    <section><Heading>{t("gameplayGuide.unlockedBy")}</Heading>
      <p className="text-[13px] text-zinc-300"><ObtainingText value={entry.obtainedBy} names={entry.obtainedLinks} /></p>
    </section>
    {entry.recipe && <section><Heading>{t("gameplayGuide.crafting", { name: contentText(entry.name) })}</Heading>
      <div className="grid gap-5">
        <div><h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{t("gameplayGuide.ingredients")}</h4>
          <div className="grid gap-x-5 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))" }}>
            {entry.recipe.ingredients.map((part) => <OpenItem key={part.name} name={part.name} quantity={part.quantity} />)}</div></div>
        <div className="w-full max-w-[380px]"><h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{t("gameplayGuide.workstation")}</h4>
          {entry.recipe.workstations.map((name) => <OpenItem key={name} name={name} />)}</div>
      </div>
    </section>}
    {entry.yieldLinks.length > 0 && <section><Heading>{t("gameplayGuide.harvest")}</Heading>
      <div className="grid gap-1 @min-[660px]:grid-cols-2">{entry.yieldLinks.map((name) => <OpenItem key={name} name={name} />)}</div>
    </section>}
  </>;
}

function AnimalDetail({ entry, t }: { entry: Animal; t: Translate }) {
  const contentText = useGameText();
  const pet = entry.kind !== "wildlife";
  return <>
    <p className="text-[13px] leading-relaxed text-zinc-300">{t(pet
      ? "gameplayGuide.petIntro" : "gameplayGuide.animalIntro")}</p>
    <section><Heading>{t("gameplayGuide.taming")}</Heading>
      <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-300">
        {["tameBait", "tameApproach", "tamePet"].map((key) => <li key={key}>{t(`gameplayGuide.${key}`)}</li>)}
      </ol>
      <div className="mt-3 grid gap-1 @min-[660px]:grid-cols-2"><OpenItem name={entry.bait} /></div>
    </section>
    <dl className="grid grid-cols-2 gap-4 border-y border-border/70 py-4 @min-[660px]:grid-cols-3">
      {[[t("gameplayGuide.regions"), entry.regions], [t("gameplayGuide.animalType"), t(`gameplayGuide.${entry.kind}`)]]
        .map(([label, value]) => <div key={label}>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
          <dd className="mt-1 text-[13px] text-zinc-100">{contentText(value)}</dd></div>)}
    </dl>
    <section><Heading>{t("gameplayGuide.animalCare")}</Heading>
      <div className="grid gap-4 @min-[660px]:grid-cols-2">
        {[[t("gameplayGuide.bed"), entry.bed], [t("gameplayGuide.feeder"), entry.feeder],
          [t("gameplayGuide.food"), entry.food]].map(([label, value]) => <div key={label}>
          <h4 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</h4>
          <OpenItem name={value} /></div>)}
      </div>
    </section>
    {contentText(entry.resource && <section><Heading>{t("gameplayGuide.producedResource")}</Heading>
      <OpenItem name={entry.resource} />
    </section>)}
    <p className="text-xs leading-5 text-zinc-400">{t(pet ? "gameplayGuide.petNote" : "gameplayGuide.breedingNote")}</p>
  </>;
}

function RodDetail({ entry, t }: { entry: Rod; t: Translate }) {
  const contentText = useGameText();
  return <>
    <p className="text-[13px] leading-relaxed text-zinc-300">{t("gameplayGuide.fishingIntro")}</p>
    <section><Heading>{t("gameplayGuide.howToFish")}</Heading>
      <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-300">
        {["stepBait", "stepCast", "stepReel"].map((key) => <li key={key}>{t(`gameplayGuide.${key}`)}</li>)}
      </ol></section>
    <dl className="grid grid-cols-2 gap-4 border-y border-border/70 py-4 @min-[660px]:grid-cols-3">
      {[[t("gameplayGuide.displayStrength"), entry.strength],
        [t("gameplayGuide.actualStrength"), entry.actualStrength],
        [t("gameplayGuide.endurance"), entry.endurance],
        [t("gameplayGuide.bootWeight"), entry.bootWeight],
        [t("gameplayGuide.otherWeight"), entry.otherWeight]].map(([label, value]) => <div key={label}>
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
        <dd className="mt-1 text-[13px] text-zinc-100">{contentText(value)}</dd></div>)}
    </dl>
    <section><Heading>{t("gameplayGuide.obtainedBy")}</Heading><p className="text-[13px] text-zinc-300">
      <ObtainingText value={entry.obtainedBy} names={entry.obtainedLinks} /></p>
    </section>
  </>;
}

function SpotDetail({ entry, variants, onSelect, t }: {
  entry: Spot; variants: Spot[]; onSelect: (spot: Spot) => void; t: Translate;
}) {
  const contentText = useGameText();
  const rates = [...entry.rates].sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));
  return <>
    {variants.length > 1 && <section><Heading>{t("gameplayGuide.spotType")}</Heading>
      <div className="grid gap-2 @min-[660px]:grid-cols-2" role="group" aria-label={t("gameplayGuide.spotType")}>
        {variants.map((spot) => <button key={keyOf(spot)} type="button" onClick={() => onSelect(spot)}
          aria-pressed={spot === entry}
          className={cn("min-w-0 rounded-[var(--radius-md)] border px-3 py-3 text-left text-[13px] leading-5",
            spot === entry ? "border-accent text-white" : "border-border text-zinc-300 hover:border-accent/50 hover:text-white")}>
          {contentText(spot.description)}
        </button>)}
      </div>
    </section>}
    {variants.length === 1 && <p className="text-[13px] leading-relaxed text-zinc-300">{contentText(entry.description)}</p>}
    <p className="rounded-[var(--radius-sm)] border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-100/80">
      {t("gameplayGuide.rateNotice")}</p>
    <section><Heading>{t("gameplayGuide.catchRates")}</Heading>
      <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/50">
        {rates.map((rate) => <div key={rate.name} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
          {rate.name !== "Other / Trash Loot Items" && <EnshroudedItemImage name={rate.name} size={28} />}
          <span className="min-w-0 flex-1 truncate text-zinc-200">{contentText(rate.name)}</span>
          <span className="font-semibold tabular-nums text-accent">{contentText(rate.rate)}</span>
        </div>)}
      </div>
    </section>
  </>;
}

function LootDetail({ entry, t }: { entry: Loot; t: Translate }) {
  const contentText = useGameText();
  const availableRates = catalog.fishing.baitGroups.flatMap((bait, index) => entry.rates[index]
    ? [{ bait, rate: entry.rates[index] }] : []);
  return <>
    <section><Heading>{t("gameplayGuide.baitRates", { item: contentText(entry.name) })}</Heading>
      <p className="mb-3 text-[13px] leading-relaxed text-zinc-300">{t("gameplayGuide.lootIntro")}</p>
      <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/50">
        {availableRates.map(({ bait, rate }) => <div key={bait} className="flex items-start gap-3 px-3 py-3 text-[13px]">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {bait.split(" / ").map((name) => <span key={name}
              className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] border border-border px-2 py-1 text-zinc-200">
              <EnshroudedItemImage name={name} size={24} />
              <span className="min-w-0">{contentText(name)}</span>
            </span>)}
          </div>
          <span className="shrink-0 pt-1 font-semibold tabular-nums text-accent">{contentText(rate)}</span>
        </div>)}
      </div>
    </section>
  </>;
}
