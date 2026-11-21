/** Join client world-map overlay tiles to their registered texture paths. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const seeds = JSON.parse(await readFile(join(root, "docs/marker-research-examples.json"), "utf8"));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const targets = [...seeds.examples.map(({ name }) => name),
  "Feathermoon", "Warsong Gulch", "Battered", "Peons"];
const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const record = byName.get(name);
  if (!record) throw new Error(`Missing local ${name} table.`);
  const bytes = storage.readFile(fileName(record.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} layout changed since the local inventory.`);
  }
  return { reader, source: { name, fileDataId: record.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } };
};
try {
  const paths = readTable("ManifestInterfaceData");
  const overlays = readTable("WorldMapOverlay");
  const tiles = readTable("WorldMapOverlayTile");
  const artLinks = readTable("UiMapXMapArt");
  const linkedUiMapsByArtId = new Map();
  for (const id of artLinks.reader.getAllIDs()) {
    const row = artLinks.reader.getRowData(id);
    if (!Array.isArray(row)) continue;
    const artId = row[1]?.data;
    const links = linkedUiMapsByArtId.get(artId) ?? [];
    links.push({ linkId: id, uiMapId: artLinks.reader.getRowRelationship(id) });
    linkedUiMapsByArtId.set(artId, links);
  }
  const pathByFileId = new Map(paths.reader.getAllIDs().map((id) => {
    const row = paths.reader.getRowData(id);
    return [id, `${row?.[0]?.string ?? ""}${row?.[1]?.string ?? ""}`];
  }));
  const sourcePathMatches = targets.map((seedName) => ({ seedName,
    assets: [...pathByFileId].filter(([, path]) => normalize(path).includes(normalize(seedName)))
      .map(([fileDataId, path]) => ({ fileDataId, path })) }));
  const tileRows = tiles.reader.getAllIDs().map((id) => {
    const row = tiles.reader.getRowData(id);
    const overlayId = tiles.reader.getRowRelationship(id);
    const overlay = overlays.reader.getRowData(overlayId);
    if (!Array.isArray(row) || !Array.isArray(overlay)) {
      throw new Error(`Invalid WorldMapOverlayTile ${id}.`);
    }
    const textureFileDataId = row[3].data;
    return { id, overlayId, textureFileDataId,
      path: pathByFileId.get(textureFileDataId) ?? null,
      overlayMapField: overlay[1].data,
      activeUiMapLinks: linkedUiMapsByArtId.get(overlay[1].data) ?? [],
      overlayFields: overlay.slice(2, 10).map(({ data }) => data) };
  });
  const links = sourcePathMatches.map(({ seedName, assets }) => ({ seedName, assets,
    positionedOverlayTiles: tileRows.filter(({ path }) =>
      path && normalize(path).includes(normalize(seedName))) }));
  const output = join(root, "data/client-research/overlay-seed-links.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [paths.source, overlays.source, tiles.source, artLinks.source],
  }, summary: { overlayTiles: tileRows.length,
    tilesWithRegisteredPaths: tileRows.filter(({ path }) => path).length },
  note: "An asset path alone does not establish the texture's map placement.",
  links }, null, 2)}\n`);
  console.log(`Joined ${tileRows.length} overlay tiles; ${links.map((link) => `${link.seedName}: ${link.assets.length} named assets, ${link.positionedOverlayTiles.length} positioned tiles`).join("; ")}.`);
} finally {
  storage.close();
}
