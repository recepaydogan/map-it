import { Crosshair, LocateFixed } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GAME_BIOMES } from "../../game-config";
import { cn } from "../../lib/cn";
import type { BiomeCanvasCursor } from "../generation/biome-canvas";
import type { WorldMapPlayer } from "./world-map-player";
import { useWorldMapFrameCursor } from "./world-map-frame-context";

const biomeById = new Map<number, (typeof GAME_BIOMES)[number]>(GAME_BIOMES.map(biome => [biome.id, biome]));

const WorldMapLocationStatus = ({ cursor: fallbackCursor, player, dimension, compact = false, suppressWaiting = false }: {
  cursor: Readonly<BiomeCanvasCursor> | null;
  player: WorldMapPlayer | null;
  dimension: string;
  compact?: boolean;
  suppressWaiting?: boolean;
}) => {
  const { t } = useTranslation();
  const cursor = useWorldMapFrameCursor(fallbackCursor);
  const mapPlayer = player?.dimension === dimension ? player : null;
  if (!cursor && !mapPlayer && (suppressWaiting || !compact || player)) return null;
  const waitingForPlayer = !cursor && !player;

  const biome = cursor?.biomeId == null ? null : biomeById.get(cursor.biomeId);
  const biomeLabel = cursor
    ? cursor.biomeId === null
      ? t("biomeMap.biomeLoading")
      : biome
        ? t(biome.labelKey)
        : t("biomeMap.unknownBiome", { id: cursor.biomeId })
    : null;
  const playerPositionLabel = mapPlayer ? t("mapPlayer.position", {
    x: Math.round(mapPlayer.x), y: Math.round(mapPlayer.y), z: Math.round(mapPlayer.z),
  }) : "";

  return <div data-world-map-location-status data-location-source={cursor ? "cursor" : mapPlayer ? "player" : "waiting"}
    role={waitingForPlayer ? "status" : undefined} aria-live={waitingForPlayer ? "polite" : undefined}
    className={cn("pointer-events-none absolute bottom-3 z-10 flex items-center gap-2 overflow-hidden rounded-[var(--radius-md)] border border-border bg-[var(--panel-bg)] px-3 py-2 text-zinc-100 shadow-[var(--panel-shadow)]",
      compact ? "left-3 max-w-[calc(100%-5rem)] text-[10px]" : "left-[4.5rem] max-w-[calc(100%-8.5rem)] text-[11px]")}>
    {cursor
      ? <>
          <Crosshair size={compact ? 12 : 13} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="shrink-0 font-mono tabular-nums"
            aria-label={t("biomeMap.sampleCoordinates", { x: cursor.x, y: cursor.y, z: cursor.z })}>
            X {cursor.x} · Z {cursor.z}
          </span>
          <span className="h-3 w-px shrink-0 bg-white/20" aria-hidden="true" />
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[var(--radius-sm)] border border-white/30"
              style={{ backgroundColor: biome?.color ?? "#777777" }} aria-hidden="true" />
            <span className="truncate">{biomeLabel}</span>
          </span>
        </>
      : mapPlayer ? <>
          <LocateFixed size={compact ? 12 : 13} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate font-mono tabular-nums" aria-label={playerPositionLabel}>
            X {Math.round(mapPlayer!.x)} · Y {Math.round(mapPlayer!.y)} · Z {Math.round(mapPlayer!.z)}
          </span>
        </> : <span className="leading-4">{t("mapPlayer.awaitingFirstPosition")}</span>}
  </div>;
};

export default WorldMapLocationStatus;
