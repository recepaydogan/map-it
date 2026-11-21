import { useEffect } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { NOMINAL_SIZE } from "../../data/maps";
import { REGION_LABELS, type RegionLabel } from "../../data/region-labels";
import { localizeErMapText } from "../../data/er-map-text";
import type { Game, MapLayer } from "../../data/types";

/**
 * Major-region names, drawn in the map art's own voice. The tiles ship with the
 * game's EMPTY parchment ribbons baked in (the engine writes the region name on
 * them at runtime, so the raw texture shows only pseudo-text smudges); this
 * layer completes them — engraved Cinzel capitals on each ribbon, plus plain
 * terrain labels for major regions without one (see region-labels.ts).
 *
 * One L.svgOverlay per view, spanning the whole image: SVG user units are image
 * pixels, so the text scales in perfect lockstep with the tiles at every zoom —
 * exactly like the baked art it completes — with zero per-zoom JS. It lives in
 * its own pane above the tiles but below overlays/markers, and is fully
 * non-interactive (labels never block a map click or a pin).
 *
 * Shared by the live Map and the Test Map: both draw the same tile pyramids in
 * the same CRS.Simple image-pixel space, so `game`/`layer` come in as props
 * rather than from the map-experience context (which the Test Map has none of).
 */

const PANE = "region-labels";

/** SVG namespace helper. */
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
  document.createElementNS("http://www.w3.org/2000/svg", tag);

/** The two inks (see RegionLabel.tone): dark umber on light art, pale on dark.
 * Kept deliberately strong — near-opaque fill over a firmer opposite-tone halo —
 * so the engraved caps read clearly against the busy map art at any zoom. */
const TONES = {
  ink: { fill: "#2f2614", fillOpacity: "0.8", halo: "#efe6cd", haloOpacity: "0.44" },
  chalk: { fill: "#e4dabb", fillOpacity: "0.78", halo: "#0f0c06", haloOpacity: "0.56" },
} as const;

/** Resolve official game text first, then the app catalog for the one layer name
 * without a standalone FMG entry, and finally the harvested legacy fallback. */
const nameFor = (label: RegionLabel, lang: string, t: TFunction): string => {
  const gameName = localizeErMapText(label.names.en);
  if (gameName !== label.names.en) return gameName;
  if (label.translationKey) return t(label.translationKey);

  const short = lang.split("-")[0];
  return (
    label.names[lang as keyof typeof label.names] ??
    label.names[short as keyof typeof label.names] ??
    label.names.en
  );
};

/**
 * Below this Leaflet zoom the caps stop shrinking with the tiles and hold a
 * constant on-screen size, so region names stay legible in a zoomed-out overview
 * instead of dwindling to a few pixels. The map opens at 21% and floors at 9%
 * (scale = 2^zoom), so a ~32% threshold covers the whole zoomed-out range; above
 * it, f = 1 and the caps scale in perfect lockstep with the art (the engraved
 * look you read up close). Tune this one number to taste. */
const LABEL_FLOOR_ZOOM = Math.log2(32 / 100); // ≈ -1.64 → 32%

/**
 * Hold every label at a constant on-screen size once zoomed out past the floor by
 * counter-scaling each one about its own center (stored as data-cx/cy) by
 * 2^(floor − zoom). Above the floor the exponent is clamped to 0, so f = 1 and
 * the group renders at its natural, art-locked size. A uniform factor keeps the
 * labels' relative size hierarchy intact.
 */
const applyLabelScale = (svg: SVGSVGElement, zoom: number) => {
  const f = Math.pow(2, Math.max(0, LABEL_FLOOR_ZOOM - zoom));
  svg.querySelectorAll<SVGGElement>(".er-region-label-cell").forEach((cell) => {
    const cx = Number(cell.dataset.cx);
    const cy = Number(cell.dataset.cy);
    cell.setAttribute("transform", `translate(${cx} ${cy}) scale(${f}) translate(${-cx} ${-cy})`);
  });
};

const buildSvg = (
  labels: RegionLabel[],
  lang: string,
  t: TFunction,
  imageWidth: number,
  imageHeight: number,
): SVGSVGElement => {
  const sx = imageWidth / NOMINAL_SIZE;
  const sy = imageHeight / NOMINAL_SIZE;
  const svg = svgEl("svg");
  svg.setAttribute("viewBox", `0 0 ${imageWidth} ${imageHeight}`);
  svg.setAttribute("width", String(imageWidth));
  svg.setAttribute("height", String(imageHeight));

  labels.forEach((label, i) => {
    const cx = label.x * sx;
    const cy = label.y * sy;
    const size = label.size * sx;
    const caption = nameFor(label, lang, t).toLocaleUpperCase(lang);
    // Baseline the text follows: a shallow quadratic matching the ribbon's drawn
    // slope (tilt) and bow (arc). Plain labels get a generous straight baseline.
    //
    // Crucially the baseline must be at least as long as the engraved text: SVG
    // silently DROPS any glyph that overhangs a textPath's ends, which is what
    // clipped "ALTUS PLATEAU" down to "LTUS PLATEA". Cinzel caps advance ~0.68em;
    // add the 0.18em letter-spacing and a little headroom, then floor at the
    // ribbon's own band width `w`. Widening the path leaves the tilt and arc
    // untouched (neither the slope nor the center-bow depends on its length) —
    // it only gives the overhanging caps room to render.
    const textLen = caption.length * size * (0.68 + 0.18) * 1.08;
    const half = Math.max(((label.w ?? 500) / 2) * sx, textLen / 2);
    const dy = Math.tan(((label.tilt ?? 0) * Math.PI) / 180) * half;
    const bow = (label.arc ?? 0) * 2 * sy; // control-point offset = 2× sagitta

    // One group per label, scaled about its center by applyLabelScale on zoom.
    const cell = svgEl("g");
    cell.setAttribute("class", "er-region-label-cell");
    cell.dataset.cx = String(cx);
    cell.dataset.cy = String(cy);

    const path = svgEl("path");
    const id = `er-region-label-${i}`;
    path.setAttribute("id", id);
    path.setAttribute(
      "d",
      `M ${cx - half} ${cy + dy} Q ${cx} ${cy - bow} ${cx + half} ${cy - dy}`,
    );
    path.setAttribute("fill", "none");
    cell.appendChild(path);

    const tone = TONES[label.tone ?? "ink"];
    const text = svgEl("text");
    text.setAttribute("font-family", "'Cinzel', serif");
    text.setAttribute("font-weight", "700");
    text.setAttribute("font-size", String(size));
    text.setAttribute("letter-spacing", String(size * 0.18));
    text.setAttribute("fill", tone.fill);
    text.setAttribute("fill-opacity", tone.fillOpacity);
    // An opposite-tone halo lifts the caps off the busy art without reading as an
    // outline (paint-order puts it behind the fill).
    text.setAttribute("stroke", tone.halo);
    text.setAttribute("stroke-opacity", tone.haloOpacity);
    text.setAttribute("stroke-width", String(size * 0.16));
    text.setAttribute("paint-order", "stroke");
    text.setAttribute("dominant-baseline", "middle");

    const textPath = svgEl("textPath");
    textPath.setAttribute("href", `#${id}`);
    // Legacy alias for engines that predate SVG2's plain href on <textPath>.
    textPath.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${id}`);
    textPath.setAttribute("startOffset", "50%");
    textPath.setAttribute("text-anchor", "middle");
    textPath.textContent = caption;
    text.appendChild(textPath);
    cell.appendChild(text);
    svg.appendChild(cell);
  });

  return svg;
};

const RegionLabelsLayer = ({
  game,
  layer,
  imageWidth,
  imageHeight,
}: {
  game: Game;
  layer: MapLayer;
  imageWidth: number;
  imageHeight: number;
}) => {
  const map = useMap();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  useEffect(() => {
    if (game !== "elden-ring") return; // Nightreign's map has no region ribbons
    const labels = REGION_LABELS.filter((l) => l.layer === layer);
    if (labels.length === 0) return;

    // Above the tiles (200), below overlayPane (400) and every marker — and
    // transparent to the pointer, so a label can never eat a map interaction.
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE);
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }

    const svg = buildSvg(labels, lang, t, imageWidth, imageHeight);
    const overlay = L.svgOverlay(
      svg,
      [
        [0, 0],
        [imageHeight, imageWidth],
      ],
      { interactive: false, pane: PANE },
    ).addTo(map);

    // Freeze the caps at a readable on-screen size once zoomed out past the floor
    // (see applyLabelScale). Settle on zoomend/viewreset — during an animated zoom
    // the whole overlay scales, then the labels re-clamp to size when it lands.
    const rescale = () => applyLabelScale(svg, map.getZoom());
    rescale();
    map.on("zoomend viewreset", rescale);

    return () => {
      map.off("zoomend viewreset", rescale);
      overlay.remove();
    };
  }, [map, game, layer, lang, t, imageWidth, imageHeight]);

  return null;
};

export default RegionLabelsLayer;
