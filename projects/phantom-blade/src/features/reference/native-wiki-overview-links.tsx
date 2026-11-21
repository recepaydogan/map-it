import { ChevronRight, MapPin, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { contentUrl } from "../../lib/content-url";
import { formatGameName } from "../../lib/game-display-text";
import { getMapDisplayName } from "../map/map-display-name";
import { isTechnicalNativeValue, nativeEntryName } from "./native-wiki-presentation";
import { useReferenceNavigation } from "./reference-navigation-context";
import type { NativeWikiLocation, NativeWikiTarget } from "./use-native-wiki";

const grid = "grid gap-2 @min-[540px]:grid-cols-2 @min-[1050px]:grid-cols-3";
const card = "flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent";

export const NativeWikiRelatedCards = ({ links }: { links: NativeWikiTarget[] }) => {
  const open = useReferenceNavigation();
  const unique = links.filter((link, index) => links.findIndex(other => other.id === link.id && other.category === link.category) === index);
  return <div className="native-wiki-related-cards @container"><ProgressiveList className={grid} initialCount={6}>
    {unique.map(link => <button type="button" key={`${link.category}:${link.id}`} onClick={() => open(link)} className={card}>
      {link.icon ? <img src={contentUrl(link.icon)} alt="" loading="lazy" className="h-10 w-10 shrink-0 object-contain" />
        : <Package size={24} aria-hidden="true" className="m-2 shrink-0 text-subtle" />}
      <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-zinc-100">{nativeEntryName(link)}</span>
      <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-subtle" />
    </button>)}
  </ProgressiveList></div>;
};

export const NativeWikiLocationCards = ({ locations, onOpenMap }: { locations: NativeWikiLocation[]; onOpenMap: (mapId: string, markerId: string) => void }) => {
  const { t } = useTranslation();
  const unique = locations.filter((location, index) => locations.findIndex(other => other.mapId === location.mapId && other.markerId === location.markerId) === index);
  return <div className="native-wiki-location-cards @container"><ProgressiveList className={grid} initialCount={6}>
    {unique.map((location, index) => {
      const region = getMapDisplayName(location.mapId);
      const label = location.kind === "authored-spawn-anchor" ? t("wiki.spawnPoint", { index: index + 1 })
        : isTechnicalNativeValue(location.name) ? "" : formatGameName(location.name);
      return <button type="button" key={`${location.mapId}:${location.markerId}`} onClick={() => onOpenMap(location.mapId, location.markerId)} className={card}>
        <MapPin size={22} aria-hidden="true" className="mx-2 shrink-0 text-subtle" />
        <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium leading-snug text-zinc-100">{region}</span>
          {label && label !== region && <span className="mt-1 block text-xs leading-snug text-subtle">{label}</span>}</span>
        <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-subtle" />
      </button>;
    })}
  </ProgressiveList></div>;
};
