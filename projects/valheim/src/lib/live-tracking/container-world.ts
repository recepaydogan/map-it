/** Unknown world identity must never fall back to another world's chest memory. */
export function selectContainerWorld<T>(
  worlds: Record<string, T>,
  worldUid: string | null,
  liveWorldUid: string | null,
) {
  const uid = worldUid && worldUid !== '0' ? worldUid : null
  return {
    worldUid: uid,
    world: uid ? worlds[uid] : undefined,
    matchesLiveWorld: Boolean(uid && uid === liveWorldUid),
  }
}
