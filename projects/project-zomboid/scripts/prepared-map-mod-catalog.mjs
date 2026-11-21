import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const writePreparedMapModCatalog = (root) => {
  const grouped = new Map();
  if (existsSync(root)) {
    for (const modEntry of readdirSync(root, { withFileTypes: true })) {
      if (!modEntry.isDirectory()) continue;
      const modRoot = join(root, modEntry.name);
      const dataPath = join(modRoot, "data.json");
      for (const mapEntry of readdirSync(modRoot, { withFileTypes: true })) {
        if (!mapEntry.isDirectory()) continue;
        const manifestPath = join(modRoot, mapEntry.name, "manifest.json");
        if (!existsSync(manifestPath)) continue;
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        // Navigation manifests share the mod directory but are not map overlays.
        if (!manifest.preparedMod && manifest.schemaVersion === 1
          && manifest.encoding === "gzip-cell-region-grid-v1") continue;
        const metadata = manifest.preparedMod;
        if (!metadata || typeof metadata !== "object") {
          throw new Error(`Prepared mod manifest has no metadata: ${manifestPath}.`);
        }
        const current = grouped.get(metadata.key) ?? {
          key: metadata.key,
          modId: metadata.modId,
          displayName: metadata.displayName,
          ...(metadata.workshopId ? { workshopId: metadata.workshopId } : {}),
          builds: metadata.builds,
          kind: metadata.kind,
          sourceFingerprint: manifest.sourceFingerprint,
          generatedAt: manifest.generatedAt,
          ...(existsSync(dataPath) ? { dataPath: `${modEntry.name}/data.json` } : {}),
          overlays: [],
        };
        const { preparedMod: _preparedMod, ...source } = manifest;
        current.overlays.push({
          mapFolder: metadata.mapFolder,
          cells: metadata.cells,
          source: {
            ...source,
            basePath: `${modEntry.name}/${mapEntry.name}`,
          },
        });
        if (new Date(manifest.generatedAt) > new Date(current.generatedAt)) current.generatedAt = manifest.generatedAt;
        grouped.set(metadata.key, current);
      }
    }
  }

  const mods = [...grouped.values()]
    .map((mod) => ({
      ...mod,
      overlays: mod.overlays.sort((left, right) => left.mapFolder.localeCompare(right.mapFolder)),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mods,
  };
  writeFileSync(join(root, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
};
