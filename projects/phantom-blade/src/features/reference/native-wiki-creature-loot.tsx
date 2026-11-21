import { ChevronRight, Coins, Package, PackageOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import DropSearchHeader from "../database/drop-search-header";
import { contentUrl } from "../../lib/content-url";
import { nativeEntryName } from "./native-wiki-presentation";
import { useReferenceNavigation } from "./reference-navigation-context";
import { useNativeWikiIndex, type NativeAcquisition } from "./use-native-wiki";
import { buildCreatureLoot, type CreatureLootGroup, type CreatureLootItem } from "./native-wiki-creature-loot-model";

const LootGroup = ({ group }: { group: CreatureLootGroup }) => {
  const { t, i18n } = useTranslation();
  const open = useReferenceNavigation();
  const [query, setQuery] = useState("");
  const name = (item: CreatureLootItem) => item.currency ? t("wiki.creatureLoot.dust")
    : item.target ? nativeEntryName(item.target).replace(/\s+/g, " ").trim() : t("wiki.unnamedEntries.items");
  const items = [...group.items].sort((a, b) => Number(a.currency) - Number(b.currency) || name(a).localeCompare(name(b), i18n.language));
  const filtered = items.filter(item => name(item).toLocaleLowerCase(i18n.language).includes(query.trim().toLocaleLowerCase(i18n.language)));
  const format = (number: number) => number.toLocaleString(i18n.language);
  return <section className="native-creature-loot-group space-y-3">
    <DropSearchHeader title={t(`wiki.creatureLoot.${group.kind}`)} count={items.length} titleCount={items.length} query={query} onQueryChange={setQuery} />

    <div className="@container"><ProgressiveList initialCount={query ? filtered.length : 12} pageSize={12} className="grid gap-2 @min-[540px]:grid-cols-2 @min-[1050px]:grid-cols-3">
      {filtered.map(item => {
        const label = name(item);
        const amount = item.quantity && (item.quantity.min === item.quantity.max
          ? format(item.quantity.min) : `${format(item.quantity.min)}–${format(item.quantity.max)}`);
        const content = <>
          {item.target?.icon ? <img src={contentUrl(item.target.icon)} alt="" loading="lazy" className="h-10 w-10 shrink-0 object-contain" />
            : item.currency ? <Coins size={24} className="m-2 shrink-0 text-subtle" aria-hidden="true" /> : <Package size={24} className="m-2 shrink-0 text-subtle" aria-hidden="true" />}
          <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-zinc-100">{label}
            {amount !== undefined && <span className="ml-2 inline-block whitespace-nowrap text-xs font-normal tabular-nums text-subtle">×{amount}</span>}
          </span>
          {item.target && <ChevronRight size={15} className="shrink-0 text-subtle" aria-hidden="true" />}
        </>;
        const classes = "flex w-full min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-left";
        return item.target ? <button type="button" key={item.id} onClick={() => open(item.target!)} className={`${classes} cursor-pointer transition-colors hover:border-accent/40 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent`}>{content}</button>
          : <div key={item.id} className={classes}>{content}</div>;
      })}
    </ProgressiveList></div>
    {query && !filtered.length && <p className="py-3 text-xs text-subtle">{t("database.acquisition.noMatchingDrops")}</p>}
  </section>;
};

const NativeWikiCreatureLoot = ({ rows }: { rows: NativeAcquisition[] }) => {
  const { t } = useTranslation();
  const index = useNativeWikiIndex();
  if (index.status !== "ready") return <p role={index.status === "error" ? "alert" : "status"} className="text-sm text-subtle">{t(index.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const groups = buildCreatureLoot(rows, index.data.itemsByNativeId);
  if (!groups.length) return <div className="flex max-w-[760px] items-center gap-4 rounded-[var(--radius-md)] border border-border p-5">
    <PackageOpen size={28} className="shrink-0 text-subtle" aria-hidden="true" />
    <div><h3 className="text-sm font-medium text-zinc-100">{t("wiki.creatureLoot.emptyTitle")}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-subtle">{t("wiki.creatureLoot.empty")}</p></div>
  </div>;
  return <div className="native-creature-loot space-y-6">{groups.map(group => <LootGroup key={group.kind} group={group} />)}</div>;
};
export default NativeWikiCreatureLoot;
