import { contentUrl } from "../../lib/content-url";
import { useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";
import { useEventEntrance } from "./use-event-entrances";

const MapEventEntranceArtwork = ({ npcId, markerId, fallbackIconPath }: {
  npcId?: string; markerId?: string; fallbackIconPath?: string;
}) => {
  const entrance = useEventEntrance(npcId, markerId);
  const index = useReferenceIndex();
  const eventId = entrance.status === "ready" ? entrance.data?.eventId : undefined;
  const summary = index.status === "ready" ? index.data.entries.find((entry) => entry.id === eventId) : undefined;
  const event = useReferenceEntry(summary);

  if (event.status !== "ready") return null;
  const artwork = event.data.icon ?? fallbackIconPath;
  if (!artwork) return null;

  return <div className="mb-4 aspect-video overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
    <img src={contentUrl(`${artwork}`)} alt="" decoding="async"
      className={event.data.icon ? "h-full w-full object-cover object-top" : "h-full w-full object-contain object-top"} />
  </div>;
};

export default MapEventEntranceArtwork;
