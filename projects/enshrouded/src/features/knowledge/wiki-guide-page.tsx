import { useGameText } from "../../i18n/game-text";
import EnshroudedWikiProse from "../map/enshrouded-wiki-prose";
import { ArrowLeft, ChevronRight, Package } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import rawCatalog from "../../../public/data/enshrouded/wiki-catalog.json";
import rawMapLinks from "../../../public/data/enshrouded/wiki-map-links.json";
import rawObtainingMapLinks from "../../../public/data/enshrouded/wiki-obtaining-map-links.json";
import { contentUrl } from "../../lib/content-url";
import { DEFAULT_MAP_ID } from "../map/map-registry";
import { requestMapPointInMain } from "../map/map-window-bridge";
import { BUILDING_NAVIGATION_EVENT, hasBuildingPage } from "./building-navigation";
import { CRAFTING_NAVIGATION_EVENT, hasCraftingPage } from "../crafting/crafting-navigation";
import { findProgressionPage, PROGRESSION_NAVIGATION_EVENT } from "./progression-navigation";
import { WIKI_NAVIGATION_EVENT, type WikiCatalog } from "./wiki-navigation";
import EnshroudedItemRow from "./enshrouded-item-row";
import { ENSHROUDED_MARKER_NAMES } from "../map/enshrouded-marker-ids";

interface WikiPart { name: string; quantity: string | null }
interface WikiRecord {
  id: string; name: string; catalog: WikiCatalog; groups: string[]; section: string;
  icon: string | null; description: string | null; type: string | null; rarity: string | null;
  level: string | null; stackSize: string | null; comfort: string | null; obtaining: string | null;
  attributes: { name: string; value: string }[];
  stats: { name: string; value: string }[];
  recipes: { ingredients: WikiPart[]; workstations: string[]; craftTime: string | null; productQuantity: string | null }[];
  related: string[];
}

const records = (rawCatalog as { records: WikiRecord[] }).records;
const byPage = new Map(records.map((record) => [record.id.toLocaleLowerCase("en"), record]));
const findPage = (name: string | null | undefined) => name
  ? byPage.get(name.replace(/_/g, " ").toLocaleLowerCase("en")) : undefined;
const itemGroup = (record: WikiRecord) => record.catalog === "collectibles" ? record.section : record.groups[0]!;
const statLabel = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2")
  .replace(/^./, (letter) => letter.toUpperCase());
const WikiIcon = ({ record, size = 40 }: { record: WikiRecord; size?: number }) => record.icon
  ? <img src={contentUrl(record.icon)} alt="" width={size} height={size} loading="lazy"
      className="shrink-0 rounded-[var(--radius-sm)] object-contain" />
  : <span className="grid shrink-0 place-items-center text-zinc-500" style={{ width: size, height: size }}>
      <Package size={Math.round(size * 0.42)} aria-hidden="true" /></span>;

const SectionHeading = ({ children }: { children: ReactNode }) =>
  {
  return (<h3 className="mb-3 flex items-center gap-3 text-base font-semibold leading-6 text-white">
    <span className="h-4 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />{children}
  </h3>);
};

export default function WikiGuidePage({ catalog, initialPage }: {
  catalog: WikiCatalog;
  initialPage: string;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const groupLabel = (name: string) => t(`wikiGuide.groups.${name.toLowerCase().replaceAll("/", "-")}`,
    { defaultValue: contentText(name.includes("/") ? name.split("/").at(-1)! : name) });
  const requestedRecord = findPage(initialPage);
  const initialRecord = requestedRecord?.catalog === catalog ? requestedRecord : records.find((record) => record.catalog === catalog)!;
  const [history, setHistory] = useState<string[]>([initialRecord.id]);
  const detailRef = useRef<HTMLElement>(null);
  const selected = findPage(history.at(-1)) ?? initialRecord;
  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); }, [selected.id]);
  const usedIn = useMemo(() => records.filter((record) => record.id !== selected.id
    && record.recipes.some((recipe) => recipe.ingredients.some((part) =>
      part.name.toLocaleLowerCase("en") === selected.id.toLocaleLowerCase("en")))), [selected.id]);

  const navigate = (name: string) => {
    const target = findPage(name);
    if (target) {
      if (target.catalog !== catalog) {
        window.dispatchEvent(new CustomEvent(WIKI_NAVIGATION_EVENT, { detail: target.id }));
        return;
      }
      setHistory((current) => {
        const visited = current.indexOf(target.id);
        return visited >= 0 ? current.slice(0, visited + 1) : [...current, target.id].slice(-32);
      });
    } else if (hasBuildingPage(name)) {
      window.dispatchEvent(new CustomEvent(BUILDING_NAVIGATION_EVENT, { detail: name }));
    } else if (findProgressionPage(name)) {
      window.dispatchEvent(new CustomEvent(PROGRESSION_NAVIGATION_EVENT, { detail: findProgressionPage(name) }));
    } else if (hasCraftingPage(name)) {
      window.dispatchEvent(new CustomEvent(CRAFTING_NAVIGATION_EVENT, { detail: name }));
    }
  };
  const Link = ({ name, quantity }: { name: string; quantity?: string | null }) => {
    const target = findPage(name);
    const linked = Boolean(target || hasBuildingPage(name) || findProgressionPage(name) || hasCraftingPage(name));
    return <EnshroudedItemRow name={name} label={target?.name} quantity={quantity}
      onClick={linked ? () => navigate(name) : undefined} />;
  };
  const craftTimes = [...new Set(selected.recipes.map((recipe) => recipe.craftTime).filter(Boolean))].join(" · ");
  const craftedQuantities = [...new Set(selected.recipes.map((recipe) => recipe.productQuantity).filter(Boolean))]
    .map((quantity) => `×${quantity}`).join(" · ");
  const facts = [
    [t("wikiGuide.facts.type"), selected.type], [t("wikiGuide.facts.rarity"), selected.rarity],
    [t("wikiGuide.facts.stackSize"), selected.stackSize],
    [t("wikiGuide.facts.level"), selected.level],
    [t("wikiGuide.facts.comfort"), selected.comfort],
    [t("wikiGuide.craftTime"), craftTimes], [t("wikiGuide.craftedQuantity"), craftedQuantities],
    ...selected.attributes.map((attribute) => [contentText(attribute.name), attribute.value]),
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const mapLocationIds = rawMapLinks[selected.id as keyof typeof rawMapLinks];
  const sourceLocationIds = [...new Set([...(mapLocationIds ?? []),
    ...(rawObtainingMapLinks[selected.id as keyof typeof rawObtainingMapLinks] ?? [])])];
  const relatedMapMarkers = selected.related.filter((name) => ENSHROUDED_MARKER_NAMES.has(name));

  return <article ref={detailRef} className="@container scroll-slim h-full overflow-y-auto text-zinc-100">
      <div className="max-w-[800px] px-5 py-5 @min-[760px]:px-6 @min-[760px]:py-6">
        {history.length > 1 && <div className="mb-5">
          <button type="button" onClick={() => setHistory((trail) => trail.slice(0, -1))}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white">
            <ArrowLeft size={15} aria-hidden="true" />{t("wikiGuide.backTo", {
              name: contentText(findPage(history.at(-2))?.name ?? t("wikiGuide.back")),
            })}
          </button>
        </div>}
        <div className="flex flex-wrap items-start gap-4 border-b border-border pb-6">
          <div className="grid h-20 w-20 shrink-0 place-items-center"><WikiIcon record={selected} size={64} /></div>
          <div className="min-w-[200px] flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">{t(`wikiGuide.catalogs.${selected.catalog}`)} · {contentText(groupLabel(itemGroup(selected)))}</p>
            <h2 className="mt-1 text-[25px] font-semibold leading-[1.15] text-white" tabIndex={-1}>{contentText(selected.name)}</h2>
          </div>
        </div>
        <div className="max-w-[760px] space-y-7 py-6">
          {facts.length > 0 && <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border/70 py-4 @min-[660px]:grid-cols-3">
            {facts.map(([label, value], index) => {
              const markerIds = label === "Location" ? mapLocationIds : undefined;
              const region = markerIds ? String(value).replace(/\s*\([^)]*\)\s*$/, "").trim() : "";
              return <div key={`${label}:${index}`} className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
                <dd className="mt-1 text-[13px] text-zinc-100">{contentText(markerIds
                  ? markerIds.length === 1
                    ? <button type="button" onClick={() => requestMapPointInMain(markerIds[0], DEFAULT_MAP_ID)}
                        aria-label={t("wikiGuide.openMapLocation", { name: contentText(selected.name), number: 1 })}
                        className="inline-flex cursor-pointer items-center gap-1 text-accent underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                        {contentText(region)}
                      </button>
                    : <>{contentText(region)} ({markerIds.map((markerId, markerIndex) => <span key={markerId}>
                        {contentText(markerIndex > 0 && ", ")}
                        <button type="button" onClick={() => requestMapPointInMain(markerId, DEFAULT_MAP_ID)}
                          aria-label={t("wikiGuide.openMapLocation", { name: contentText(selected.name), number: markerIndex + 1 })}
                          className="cursor-pointer text-accent underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                          {markerIndex + 1}
                        </button>
                      </span>)})</>
                  : value)}</dd>
              </div>;
            })}</dl>}
          {sourceLocationIds.length > 0 && !selected.attributes.some((attribute) => attribute.name === "Location") &&
            <section><SectionHeading>{t("wikiGuide.mapLocations")}</SectionHeading>
              <div className="grid gap-1.5 @min-[660px]:grid-cols-2">{sourceLocationIds.map((markerId) =>
                <button key={markerId} type="button" onClick={() => requestMapPointInMain(markerId, DEFAULT_MAP_ID)}
                  className="flex items-center justify-between gap-2 py-1.5 text-left text-xs text-accent hover:text-white">
                  <span className="min-w-0 truncate">{contentText(ENSHROUDED_MARKER_NAMES.get(markerId) ?? markerId)}</span>
                  <ChevronRight size={13} className="shrink-0" aria-hidden="true" />
                </button>)}</div></section>}
          {contentText(selected.description && <section><SectionHeading>{t("wikiGuide.description")}</SectionHeading>
            <p className="text-[13px] leading-relaxed text-zinc-300">{contentText(selected.description)}</p></section>)}
          {contentText(selected.obtaining && <section><SectionHeading>{t("wikiGuide.obtainedBy")}</SectionHeading>
            <p className="text-[13px] leading-relaxed text-zinc-300"><EnshroudedWikiProse text={selected.obtaining} name={selected.name}
              onOpenEntry={target => navigate(target.page)} onOpenMap={id => requestMapPointInMain(id, DEFAULT_MAP_ID)} /></p></section>)}
          {selected.stats.length > 0 && <section><SectionHeading>{t("wikiGuide.stats")}</SectionHeading>
            <dl className="grid gap-x-6 gap-y-2 @min-[660px]:grid-cols-2">{selected.stats.map((stat) =>
              <div key={stat.name} className="flex min-w-0 justify-between gap-3 border-b border-border/60 py-1.5 text-xs">
                <dt className="text-zinc-400">{contentText(statLabel(stat.name))}</dt><dd className="text-right text-zinc-100">{contentText(stat.value)}</dd>
              </div>)}</dl></section>}
          {selected.recipes.length > 0 && <section><SectionHeading>{t("wikiGuide.crafting", { name: contentText(selected.name) })}</SectionHeading>
            {selected.recipes.map((recipe, index) => <div key={index}
              className="mb-4 grid gap-5">
              <div><h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{t("wikiGuide.ingredients")}</h4>
                <div className="grid gap-x-5 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))" }}>
                  {recipe.ingredients.map((part, partIndex) =>
                  <Link key={`${part.name}:${partIndex}`} name={part.name} quantity={part.quantity} />)}</div></div>
              <div><h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{t("wikiGuide.workstation")}</h4>
                <div className="grid w-full max-w-[380px] gap-1.5">{recipe.workstations.map((name) => <Link key={name} name={name} />)}</div></div>
            </div>)}
          </section>}
          {usedIn.length > 0 && <section><SectionHeading>{t("wikiGuide.usedIn", { count: usedIn.length })}</SectionHeading>
            <div className="grid gap-1.5 @min-[660px]:grid-cols-2">{usedIn.map((record) => <Link key={record.id} name={record.id} />)}</div></section>}
          {relatedMapMarkers.length > 0 && <section><SectionHeading>{t("wikiGuide.relatedMapAreas")}</SectionHeading>
            <div className="grid gap-1.5 @min-[660px]:grid-cols-2">{relatedMapMarkers.map((markerId) =>
              <button key={markerId} type="button" onClick={() => requestMapPointInMain(markerId, DEFAULT_MAP_ID)}
                className="flex items-center justify-between gap-2 py-1.5 text-left text-xs text-accent hover:text-white">
                <span className="min-w-0 truncate">{contentText(ENSHROUDED_MARKER_NAMES.get(markerId))}</span><ChevronRight size={13} className="shrink-0" aria-hidden="true" />
              </button>)}</div></section>}
        </div>
      </div>
    </article>;
}
