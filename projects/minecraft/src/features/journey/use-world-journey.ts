import { useCallback, useEffect, useState } from "react";
import { getBrowserJourneyStorage, type JourneyRead } from "./journey-storage.ts";

export const useWorldJourney = (worldId: string) => {
  const storage = getBrowserJourneyStorage();
  const [read, setRead] = useState<JourneyRead>(() => storage.read(worldId));
  useEffect(() => {
    const refresh = () => setRead(storage.read(worldId));
    refresh(); return storage.subscribe(worldId, refresh);
  }, [storage, worldId]);
  const command = useCallback((run: () => unknown) => {
    run(); setRead(storage.read(worldId));
  }, [storage, worldId]);
  return {
    ...read,
    setEnabled: useCallback((enabled: boolean) => command(() => storage.setEnabled(worldId, enabled)), [command, storage, worldId]),
    setVisible: useCallback((visible: boolean) => command(() => storage.setVisible(worldId, visible)), [command, storage, worldId]),
    clear: useCallback(() => command(() => read.error ? storage.remove(worldId) : storage.clear(worldId)),
      [command, read.error, storage, worldId]),
  };
};
