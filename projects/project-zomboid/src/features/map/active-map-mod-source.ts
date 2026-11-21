interface DefaultMapModSource {
  modIds: string[];
}

interface BridgeMapModSource {
  modIds: string[];
  mapFolders: string[];
}

export const resolveActiveMapModSource = (
  defaultSource: DefaultMapModSource,
  bridgeSource: BridgeMapModSource | null,
) => ({
  modIds: bridgeSource?.modIds ?? defaultSource.modIds,
  mapFolders: bridgeSource?.mapFolders ?? [],
  fromLiveSession: bridgeSource !== null,
});
