interface ConnectionEndpoints {
  evidence: string;
  direction?: "forward";
  endpoints: readonly [
    { mapId: string; locationId: string },
    { mapId: string; locationId: string },
  ];
}

/** Arrival anchors describe where a passage ends, not another usable exit. */
export const getOutgoingConnectionKeys = (
  connections: readonly ConnectionEndpoints[],
  currentKey: string,
): Set<string> => {
  const destinations = new Set<string>();
  for (const connection of connections) {
    const keys = connection.endpoints.map(({ mapId, locationId }) => `${mapId}:${locationId}`);
    if (!keys.includes(currentKey)) continue;
    if ((connection.evidence === "navigation-portal-target" || connection.direction === "forward") && keys[0] !== currentKey) continue;
    for (const key of keys) if (key !== currentKey) destinations.add(key);
  }
  return destinations;
};
