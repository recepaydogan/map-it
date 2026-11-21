import { useEffect } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import { erFragmentsForLayer, fragmentLabel } from "../../data/er-map-extras";
import { NOMINAL_SIZE } from "../../data/maps";
import { useMapStore } from "../../store/map-store";
import { useUiStore } from "../../store/ui-store";
import { useMapExperience } from "../map-experience/map-experience";

/**
 * Map-fragment reveal rectangles — the exact stretch of the world each "Map: <Region>"
 * item uncovers, straight from `WorldMapPieceParam.openTravelArea{Left,Right,Top,Bottom}`.
 *
 * The rects are authored in the game's own map-pixel space, which turns out to be the SAME
 * space our marker pixels live in (see data/src/build-er-map-extras.mjs for the per-layer
 * offset and how each one was verified) — so they land on the map without any fudging.
 *
 * Off by default: this answers a specific question ("which fragment do I still need, and
 * what does it open?"), it isn't permanent furniture. Clicking a rect opens that fragment's
 * codex page, whose "Where to find" pins the actual pickup.
 */
const FragmentLayer = ({
  imageWidth,
  imageHeight,
}: {
  imageWidth: number;
  imageHeight: number;
}) => {
  const map = useMap();
  const { game, layer } = useMapExperience();
  const showFragments = useMapStore((s) => s.showFragments);
  const openCodexItem = useUiStore((s) => s.openCodexItem);

  const on = showFragments && game === "elden-ring";

  useEffect(() => {
    if (!on) return;
    const fragments = erFragmentsForLayer(layer);
    if (!fragments.length) return;

    const sx = imageWidth / NOMINAL_SIZE;
    const sy = imageHeight / NOMINAL_SIZE;
    const group = L.layerGroup().addTo(map);

    for (const f of fragments) {
      const { x, y, w, h } = f.rect;
      const rect = L.rectangle(
        L.latLngBounds(
          [imageHeight - (y + h) * sy, x * sx],
          [imageHeight - y * sy, (x + w) * sx],
        ),
        {
          color: "#c9b88f",
          weight: 1.5,
          opacity: 0.65,
          fillColor: "#c9b88f",
          // Fragments overlap heavily (Liurnia's three share one lake between them), so the
          // fill must stay faint or the stack reads as a solid wash over the whole map.
          fillOpacity: 0.06,
        },
      );
      rect.bindTooltip(fragmentLabel(f), {
        direction: "center",
        permanent: true,
        className: "er-fragment-label",
      });
      rect.on("mouseover", () => rect.setStyle({ fillOpacity: 0.16, opacity: 1 }));
      rect.on("mouseout", () => rect.setStyle({ fillOpacity: 0.06, opacity: 0.65 }));
      rect.on("click", (e) => {
        L.DomEvent.stop(e); // don't let the map's own click deselect the open marker
        openCodexItem(f.itemKey);
      });
      group.addLayer(rect);
    }

    return () => {
      map.removeLayer(group);
    };
  }, [on, map, layer, imageWidth, imageHeight, openCodexItem]);

  return null;
};

export default FragmentLayer;
