/* eslint-disable react-refresh/only-export-components -- standalone diagnostic entry */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import { GAME_STRUCTURE_GROUPS, GAME_STRUCTURE_TYPES } from "../src/game-config";
import "../src/i18n";
import MapPointIcon from "../src/features/map/map-point-icon";
import { structureIcon, type StructureIconName } from "../src/features/worlds/world-structure-icons";
import "./structure-artwork-check.css";

const Diagnostic = () => {
  const { t } = useTranslation(), surface = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(GAME_STRUCTURE_TYPES[0].id), [report, setReport] = useState("RUNNING");
  const active = GAME_STRUCTURE_TYPES.find(type => type.id === selected) ?? GAME_STRUCTURE_TYPES[0];
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const deadline = Date.now() + 10_000;
      while (!cancelled) {
        const sprites = [...(surface.current?.querySelectorAll<HTMLElement>("[data-map-sprite]") ?? [])];
        const groupSprites = sprites.filter(sprite => sprite.dataset.mapSpriteSource?.endsWith("structure-groups-v1.png"));
        const typeSprites = sprites.filter(sprite => sprite.dataset.mapSpriteSource?.endsWith("structure-types-v1.png"));
        const groupsLoaded = groupSprites.every(sprite => {
          const image = sprite.querySelector("img"); return image?.complete && image.naturalWidth === 1536 && image.naturalHeight === 1024;
        });
        const typesLoaded = typeSprites.every(sprite => {
          const image = sprite.querySelector("img"); return image?.complete && image.naturalWidth === 1800 && image.naturalHeight === 900;
        });
        if (groupSprites.length >= 6 && typeSprites.length >= 37 && groupsLoaded && typesLoaded) {
          const groups = new Set(groupSprites.map(sprite => sprite.dataset.mapSprite));
          const types = new Set(typeSprites.map(sprite => sprite.dataset.mapSprite));
          const rail = surface.current!.querySelector<HTMLElement>("[data-artwork-rail]")!.getBoundingClientRect();
          const panels = surface.current!.querySelectorAll<HTMLElement>("[data-artwork-panel]");
          const clipped = sprites.every(sprite => getComputedStyle(sprite).overflow === "hidden" && sprite.getBoundingClientRect().width === sprite.getBoundingClientRect().height);
          const bounded = [...panels].every(panel => panel.getBoundingClientRect().right <= rail.left);
          const exactTypes = GAME_STRUCTURE_TYPES.every(type => {
            const expected = `${type.artwork.column}:${type.artwork.row}`;
            return surface.current!.querySelector<HTMLElement>(`[data-artwork-type-filter="${type.id}"] [data-map-sprite="${expected}"]`)
              && surface.current!.querySelector<HTMLElement>(`[data-artwork-type-marker="${type.id}"] [data-map-sprite="${expected}"]`);
          });
          if (groups.size !== 6 || types.size !== 18 || !exactTypes || !clipped || !bounded)
            throw new Error("Artwork identity, circular crop or advertising boundary failed");
          if (!cancelled) setReport("PASS: six illustrated groups and eighteen individual POIs load, crop, keep exact identities and remain outside the 440px rail.");
          return;
        }
        if (Date.now() >= deadline) throw new Error("Illustrated atlas did not load in time");
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
    void check().catch(error => { if (!cancelled) setReport(`FAIL: ${String(error)}`); });
    return () => { cancelled = true; };
  }, []);
  return <div ref={surface} className="artwork-shell">
    <main className="artwork-map">
      <section data-artwork-panel className="artwork-filter" aria-label={t("structureMap.filters.title")}>
        <h1>{t("structureMap.filters.title")}</h1>
        <div className="artwork-groups">{GAME_STRUCTURE_GROUPS.map(group => <div key={group.id}>
          <MapPointIcon source={group.artwork} fallback={structureIcon(group.icon as StructureIconName)} size={24} />
          <span>{t(`structureMap.groups.${group.id}`)}</span><span>12</span>
        </div>)}</div>
        <div className="artwork-types">{GAME_STRUCTURE_TYPES.map(type => <button type="button" key={type.id}
          data-artwork-type-filter={type.id} aria-pressed={selected === type.id} onClick={() => setSelected(type.id)}>
          <MapPointIcon source={type.artwork} fallback={structureIcon(type.icon)} size={24} />
          <span>{t(`structureMap.types.${type.id}`)}</span><span>1</span>
        </button>)}</div>
      </section>
      <section data-artwork-panel data-artwork-type-detail={active.id} className="artwork-detail" aria-label={t(`structureMap.types.${active.id}`)}>
        <header><MapPointIcon source={active.artwork} fallback={structureIcon(active.icon)} size={56} />
          <div><h2>{t(`structureMap.types.${active.id}`)}</h2><p>{t("structureMap.candidate")}</p></div>
        </header>
        <p>{t(`structureMap.descriptions.${active.id}`)}</p>
      </section>
      <div className="artwork-markers" aria-label={t("structureMap.markers")}>
        {GAME_STRUCTURE_TYPES.map((type, index) => <button type="button" key={type.id} data-artwork-type-marker={type.id}
          style={{ left: 62 + index % 6 * 142, top: 28 + Math.floor(index / 6) * 31 }} aria-label={t(`structureMap.types.${type.id}`)}>
          <MapPointIcon source={type.artwork} fallback={structureIcon(type.icon)} size={28} />
        </button>)}
      </div>
    </main>
    <aside data-artwork-rail className="artwork-rail"><p>{t("inspector.diagnosticNotice")}</p><pre role="status">{report}</pre></aside>
  </div>;
};

createRoot(document.getElementById("root")!).render(<Diagnostic />);
