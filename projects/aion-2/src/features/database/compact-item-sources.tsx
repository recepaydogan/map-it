import { getItemDisplayName } from "../../lib/item-display-name";
import { useGameText } from "../../i18n/game-text";
import ProgressiveList from "../../components/progressive-list";
import { ChevronRight, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ReferenceEntry } from "../reference/reference-types";

const CompactItemSources = ({ sources, onOpenMap }: {
  sources: ReferenceEntry[];
  onOpenMap?: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const locations = sources.flatMap((source) => source.locations.map((location) => ({ source, location })));
  return <section className="@container max-w-[760px]">
    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("database.compact.locations", { count: locations.length })}</h3>
    <ProgressiveList initialCount={3} className="grid gap-2 @min-[540px]:grid-cols-2">{locations.map(({ source, location }) => <button key={`${source.id}:${location.mapId}:${location.markerId}`} type="button"
      onClick={() => onOpenMap ? onOpenMap(location.mapId, location.markerId) : openReference(source)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-black/10 px-3 py-3 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-accent/5 text-accent"><MapPin size={15} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-zinc-100">{getItemDisplayName(source.name, gameText(source.name))}</span>
        <span className="mt-0.5 block text-[10px] text-subtle">{getItemDisplayName(location.name, gameText(location.name))}</span></span>
      <ChevronRight size={15} className="shrink-0 text-subtle" aria-hidden="true" />
    </button>)}</ProgressiveList>
  </section>;
};

export default CompactItemSources;
