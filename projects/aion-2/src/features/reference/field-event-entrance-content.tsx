import MapEventEntrance from "../map/map-event-entrance";

const FieldEventEntranceContent = ({ npcId, activityId, onOpenMap }: {
  npcId: string; activityId: string; onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  return <MapEventEntrance npcId={npcId} expectedEventId={activityId} withDivider={false} onOpenMap={onOpenMap} />;
};

export default FieldEventEntranceContent;
