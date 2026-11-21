interface SelectedWorld { uid: string; name: string; seedName: string }
interface LiveWorld { worldUid: string; worldName: string; seedName: string }
interface TrackedWorld { worldName?: string; seedName?: string }

/** Use a live UID only for the selected, currently tracked world. Never invent a save DB. */
export function resolveSelectedWorldUid(
  selected: SelectedWorld | null,
  live: LiveWorld | null,
  tracked: TrackedWorld | null,
): string | null {
  if (!selected) return null
  if (selected.uid) return selected.uid
  if (!live || !tracked || !/^-?\d+$/.test(live.worldUid) || live.worldUid === '0') return null
  if (!selected.name.trim() || !selected.seedName.trim()) return null
  return selected.name === live.worldName && selected.seedName === live.seedName
    && selected.name === tracked.worldName && selected.seedName === tracked.seedName
    ? live.worldUid : null
}
