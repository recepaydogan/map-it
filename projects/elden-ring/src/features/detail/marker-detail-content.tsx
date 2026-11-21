import { ArrowRight, ChevronRight, DoorOpen, Skull } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CategoryDef, Marker } from "../../data/types";
import BossCombat from "./boss-combat";
import BossPortrait from "./boss-portrait";
import DetailHeader, { MarkerMeta } from "./detail-header";
import DetailSection from "./detail-section";
import DetailStats from "./detail-stats";
import { hasBuildAdvisor } from "./has-build-advisor";
import ItemMiniCard from "./item-mini-card";

interface MarkerDetailContentProps {
  marker: Marker;
  category: CategoryDef | undefined;
  layerLabel: string;
  bossImage: string | null;
  actions: ReactNode;
  footerContent?: ReactNode;
  onClose: () => void;
  onDrillItem: (itemKey: string) => void;
  onOpenCombat: () => void;
  onSelectMarker?: (markerId: string) => void;
  /** Makes highlighted description locations clickable (navigate-to-place). */
  onHighlightClick?: (term: string) => void;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Description text with the marker's key location names emphasised (e.g. a
 * connection's destination), so where-it-leads reads at a glance. With an
 * onClick the names become buttons that navigate to that place on the map. */
const highlightedDescription = (
  text: string,
  highlights?: string[],
  onClick?: (term: string) => void,
) => {
  if (!highlights?.length) return text;
  const pattern = new RegExp(`(${highlights.map(escapeRegExp).join("|")})`, "g");
  return text.split(pattern).map((part, index) => {
    if (!highlights.includes(part)) return part;
    if (!onClick) return <span key={index} className="font-semibold text-accent">{part}</span>;
    return (
      <button
        key={index}
        type="button"
        onClick={() => onClick(part)}
        className="cursor-pointer font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
      >
        {part}
      </button>
    );
  });
};

const MarkerDetailContent = ({
  marker,
  category,
  layerLabel,
  bossImage,
  actions,
  footerContent,
  onClose,
  onDrillItem,
  onOpenCombat,
  onSelectMarker,
  onHighlightClick,
}: MarkerDetailContentProps) => {
  const { t } = useTranslation();
  // Branch on the ENGLISH name (enName survives localization on map-marker copies)
  // — the localized name never ends with the literal "Scarab".
  const dropsTitle =
    ["boss", "great-boss", "legendary-boss", "evergaol-boss", "invasion", "elite-enemy", "miniboss", "npc", "merchant"].includes(marker.category) ||
    ((marker as { enName?: string }).enName ?? marker.name).endsWith("Scarab")
      ? t("detail.drops")
      : t("detail.notableLoot");
  // A dungeon can hold more than one boss. Sources that can name the whole set
  // give dungeonBosses; the single dungeonBoss is the one-boss shape of it.
  const dungeonBosses = marker.dungeonBosses?.length
    ? marker.dungeonBosses
    : marker.dungeonBoss
      ? [{ name: marker.dungeonBoss, id: marker.dungeonBossId }]
      : [];

  return (
    <>
      <DetailHeader marker={marker} def={category} layerLabel={layerLabel} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {/* Content pinned to the panel's no-scrollbar inner width (w-90 desktop /
            inset-x-2 mobile, − 2px borders) — the container's % shrinks when the
            8px bar appears, this constant doesn't, so nothing ever shifts; the
            bar overlays the sections' right padding instead of reserving a gap. */}
        <div className="w-[calc(min(22.5rem,100vw_-_1rem)_-_2px)]">
        <BossPortrait src={bossImage} alt={marker.name} />
        <MarkerMeta marker={marker} />
        {actions}

        {marker.description && (
          <div className="px-4 pb-3.5">
            <p className="text-[13px] leading-relaxed text-zinc-300">
              {highlightedDescription(marker.description, marker.descriptionHighlights, onHighlightClick)}
            </p>
          </div>
        )}

        {marker.connectionOptions?.length ? (
          <div className="flex flex-col gap-1.5 px-4 pb-4 pt-1">
            {marker.connectionOptions.map((destination) =>
              destination.id && onSelectMarker ? (
                <button
                  key={`${destination.name}-${destination.id}`}
                  type="button"
                  onClick={() => onSelectMarker(destination.id!)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-sky-500/25 bg-sky-500/8 px-3 py-2 text-left transition-colors hover:border-sky-400/50 hover:bg-sky-500/15"
                >
                  <ArrowRight size={16} className="shrink-0 text-sky-300" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">
                      {t("detail.destinationViewDetails")}
                    </p>
                    <p className="truncate text-[13px] font-medium text-zinc-100">{destination.name}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-sky-300/70" aria-hidden="true" />
                </button>
              ) : (
                <div
                  key={destination.name}
                  className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-sky-500/25 bg-sky-500/8 px-3 py-2"
                >
                  <ArrowRight size={16} className="shrink-0 text-sky-300" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">
                      {t("detail.destination")}
                    </p>
                    <p className="truncate text-[13px] font-medium text-zinc-100">{destination.name}</p>
                  </div>
                </div>
              ),
            )}
          </div>
        ) : null}

        {marker.stats?.length ? (
          <DetailSection title={t("detail.stats")}>
            <DetailStats stats={marker.stats} />
          </DetailSection>
        ) : null}

        {marker.bossMeta?.combat ? (
          <DetailSection title={t("detail.combatIntel")}>
            <BossCombat
              combat={marker.bossMeta.combat}
              hasBuild={hasBuildAdvisor(marker)}
              onExpand={onOpenCombat}
            />
          </DetailSection>
        ) : null}

        {dungeonBosses.length > 0 && (
          <div className="flex flex-col gap-1.5 px-4 pb-1 pt-1 last:pb-4">
            {dungeonBosses.map((boss) =>
              boss.id && onSelectMarker ? (
                <button
                  key={boss.id}
                  type="button"
                  onClick={() => onSelectMarker(boss.id!)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-left transition-colors hover:border-rose-400/50 hover:bg-rose-500/15"
                >
                  <Skull size={16} className="shrink-0 text-rose-300" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300/80">
                      {t("detail.bossViewDetails")}
                    </p>
                    <p className="truncate text-[13px] font-medium text-zinc-100">{boss.name}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-rose-300/70" aria-hidden="true" />
                </button>
              ) : (
                <div
                  key={boss.name}
                  className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-rose-500/25 bg-rose-500/8 px-3 py-2"
                >
                  <Skull size={16} className="shrink-0 text-rose-300" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300/80">
                      {t("detail.boss")}
                    </p>
                    <p className="truncate text-[13px] font-medium text-zinc-100">{boss.name}</p>
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {marker.dungeonEntrances?.length ? (
          <div className="flex flex-col gap-1.5 px-4 pb-1 pt-1 last:pb-4">
            {marker.dungeonEntrances.map((entrance) =>
              entrance.id && onSelectMarker ? (
                <button
                  key={entrance.id}
                  type="button"
                  onClick={() => onSelectMarker(entrance.id!)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-left transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
                >
                  <DoorOpen size={16} className="shrink-0 text-amber-300" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
                      {t("detail.entranceViewDetails")}
                    </p>
                    <p className="truncate text-[13px] font-medium text-zinc-100">{entrance.name}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-amber-300/70" aria-hidden="true" />
                </button>
              ) : (
                <div
                  key={entrance.name}
                  className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-amber-500/25 bg-amber-500/8 px-3 py-2"
                >
                  <DoorOpen size={16} className="shrink-0 text-amber-300" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
                      {t("detail.entrance")}
                    </p>
                    <p className="truncate text-[13px] font-medium text-zinc-100">{entrance.name}</p>
                  </div>
                </div>
              ),
            )}
          </div>
        ) : null}

        {marker.drops?.length ? (
          <DetailSection title={dropsTitle}>
            <div className="flex flex-col gap-1.5">
              {marker.drops.map((item) => (
                <ItemMiniCard
                  key={item.itemKey ?? item.id}
                  item={item}
                  game={marker.game}
                  onSelect={onDrillItem}
                />
              ))}
            </div>
          </DetailSection>
        ) : null}

        {marker.shopItems?.length ? (
          <DetailSection title={t("detail.sells")}>
            <div className="flex flex-col gap-1.5">
              {/* Index-qualified key: a catalog shop (Twin Maiden Husks) can
                  legitimately list the same item from several sellers' stocks. */}
              {marker.shopItems.map((item, index) => (
                <ItemMiniCard
                  key={`${item.itemKey ?? item.id}-${index}`}
                  item={item}
                  game={marker.game}
                  onSelect={onDrillItem}
                />
              ))}
            </div>
          </DetailSection>
        ) : null}

        {footerContent}
        </div>
      </div>
    </>
  );
};

export default MarkerDetailContent;
