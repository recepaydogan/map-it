import { WORLD_LIBRARY_CONFIG } from "../../game-config";
import { createTerrainDirectoryHandleRepository } from "../terrain/terrain-directory-handle-repository";

export const terrainDirectoryHandleRepository = createTerrainDirectoryHandleRepository({
  factory: indexedDB,
  name: WORLD_LIBRARY_CONFIG.terrainHandleDatabaseName,
});
