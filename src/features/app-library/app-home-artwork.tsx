import type { MapGame } from "./app-selection";

export type LibraryScene = { app: MapGame; src: string };
export type LibraryArtwork = { current: LibraryScene; previous?: LibraryScene };

export function artworkFor(app: MapGame): LibraryScene {
  return { app, src: `/game-cards/worlds/${app.id}.webp` };
}

export default function AppHomeArtwork({ current, previous }: LibraryArtwork) {
  const scenes = previous ? [previous, current] : [current];

  return (
    <div className="map-it-showcase-art" aria-hidden="true">
      {scenes.map(scene => (
        <img
          key={scene.src}
          src={scene.src}
          data-game={scene.app.id}
          data-fallback={scene.src === scene.app.icon ? "true" : undefined}
          data-entering={previous && current === scene ? "" : undefined}
          data-leaving={previous === scene ? "" : undefined}
          alt=""
          draggable={false}
          onError={event => {
            const image = event.currentTarget;
            if (image.dataset.fallback) { image.hidden = true; return; }
            image.dataset.fallback = "true";
            image.src = scene.app.icon;
          }}
        />
      ))}
    </div>
  );
}
