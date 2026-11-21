import { Package, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_STRUCTURE_DISCOVERIES } from "../../game-config";
import { cn } from "../../lib/cn";
import type { StructurePoint } from "../generation/structure-viewport-stream";
import { gameKnowledgeSubjectDisplay } from "../knowledge/game-knowledge-subject-display";
import MapPointIcon from "../map/map-point-icon";
import { createStructureDiscoverySections } from "./world-structure-discovery-sections";
import { PointActions, PointNote, type SaveWorldPersonal } from "./world-structure-layer";
import type { WorldMapPlayer } from "./world-map-player";
import type { WorldPersonalState, WorldRecord } from "./world-types";

const WorldStructureMinimapPanel = ({ world, dimension, point, player, savePersonal, onCenter, onClose,
  standalone = false }: {
  world: WorldRecord; dimension: string; point: StructurePoint; player: WorldMapPlayer | null;
  savePersonal: SaveWorldPersonal; onCenter: () => void; onClose: () => void; standalone?: boolean;
}) => {
  const { t } = useTranslation();
  const [personalOverride, setPersonalOverride] = useState<WorldPersonalState | null>(null);
  const personal = personalOverride ?? world.personal;
  const discoveries = GAME_STRUCTURE_DISCOVERIES[point.type as keyof typeof GAME_STRUCTURE_DISCOVERIES];
  const sections = discoveries ? createStructureDiscoverySections(discoveries, gameKnowledgeSubjectDisplay, {
    mobs: t("inspector.subjectKinds.entity"), loot: t("inspector.subjectKinds.loot"),
  }, { edition: world.edition, version: world.generation.version }) : [];
  const distance = player?.dimension === dimension
    ? Math.round(Math.hypot(point.x - player.x, point.z - player.z)) : null;
  const changePersonal = async (change: (personal: WorldPersonalState) => WorldPersonalState) => {
    const updated = await savePersonal(world.id, change);
    setPersonalOverride(updated);
  };

  return <aside className={cn("flex min-h-0 shrink-0 flex-col border-border bg-surface",
    standalone ? "h-full rounded-[var(--radius-lg)] border" : "h-[clamp(132px,38vh,280px)] border-t")}
    aria-label={t(`structureMap.types.${point.type}`)} data-world-minimap-details>
    <header data-overlay-details-drag={standalone || undefined}
      className={cn("flex shrink-0 items-start gap-2 border-b border-border px-3 py-2.5", standalone && "cursor-move")}>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[13px] font-semibold text-white">{t(`structureMap.types.${point.type}`)}</h2>
        <p className="mt-0.5 truncate text-[10px] text-white/70">
          {[t("structureMap.candidate"), world.name, distance === null ? null : t("structureMap.destinations.distance", { count: distance })]
            .filter(Boolean).join(" · ")}
        </p>
      </div>
      <button type="button" onClick={onClose} className="overlay-point-card-action -mr-1"
        aria-label={t("chrome.close")} title={t("chrome.close")}>
        <X size={13} aria-hidden="true" />
      </button>
    </header>
    <div className="scroll-slim min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
      <div className="space-y-3">
        <PointActions point={point} dimension={dimension} personal={personal} onCenter={onCenter} onChange={changePersonal} />
        {sections.map(section => <section key={section.key}>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {section.title} · {section.links.length}
          </h3>
          <ul className="space-y-1.5">
            {section.links.map(link => <li key={link.key}
              className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2 text-zinc-100">
              <span className="grid h-8 w-8 shrink-0 place-items-center text-accent" aria-hidden="true">
                <MapPointIcon source={link.image} fallback={Package} size={28} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium">
                  {link.name}{link.quantity !== undefined && <span className="ml-1 text-zinc-400">×{link.quantity}</span>}
                </span>
                {link.note && <span className="mt-0.5 block truncate text-[10px] font-normal text-zinc-400">{link.note}</span>}
              </span>
            </li>)}
          </ul>
        </section>)}
        <PointNote point={point} dimension={dimension} personal={personal} onChange={changePersonal} />
      </div>
    </div>
  </aside>;
};

export default WorldStructureMinimapPanel;
