import { useTranslation } from "react-i18next";
import { erRegions } from "../../data/er-regions";
import { useMapStore } from "../../store/map-store";
import { useMapExperience } from "../map-experience/map-experience";

/**
 * The key to the region wash — answers "what does this green mean?". Shown only while the
 * region overlay is on (same overworld-only, Elden-Ring-only gate as RegionOverlay), it lists
 * each colour the overlay paints against its region name, plus an honest note that the wash is
 * a broad guide from the game's own coarse region masks, not exact borders. Names come straight
 * from er-regions.json (the same nine the overlay can separate).
 *
 * Rendered inside the Leaflet container as a plain DOM card (like MapControls); it captures the
 * pointer over itself only, so map drag/zoom keeps working around it. Anchored bottom-right,
 * just left of the zoom/toggle control stack (the toggle that reveals it) — the left side is
 * owned by the filter rail + detail panel, so a legend there would collide with them.
 */
const RegionLegend = () => {
  const { t } = useTranslation();
  const { game, layer } = useMapExperience();
  const showRegions = useMapStore((s) => s.showRegions);

  if (!showRegions || game !== "elden-ring" || layer !== "overworld") return null;

  return (
    <div className="pointer-events-auto absolute bottom-[calc(1.25rem+var(--anchor-ad-height))] right-20 z-[900] w-[208px] max-w-[calc(100%-6rem)] rounded-[var(--radius-md)] border border-border bg-surface/90 p-3 shadow-lg shadow-black/30 backdrop-blur-md">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-100">
        {t("regions.legendTitle")}
      </h3>
      <p className="mt-1 text-[10.5px] leading-snug text-muted">{t("regions.legendNote")}</p>
      <ul className="mt-2.5 space-y-1">
        {erRegions.map((r) => (
          <li key={r.name} className="flex items-center gap-2 text-[11.5px] leading-tight text-zinc-300">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-[3px] border border-white/15"
              style={{ backgroundColor: `rgb(${r.color[0]}, ${r.color[1]}, ${r.color[2]})` }}
            />
            <span className="truncate">{r.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RegionLegend;
