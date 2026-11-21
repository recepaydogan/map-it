/** Inspect native AreaPOI state rows for a battleground objective glyph join. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const registration = catalog.identified.find(({ name }) => name === "AreaPOIState");
const poiRegistration = catalog.identified.find(({ name }) => name === "AreaPOI");
if (!registration || !poiRegistration) throw new Error("AreaPOIState or AreaPOI is not registered in the local client.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (storage.getProductInfo().buildNumber !== catalog.source.build) {
    throw new Error("AreaPOIState registration belongs to another client build.");
  }
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error("AreaPOIState layout changed in the local client.");
  }
  const poiBytes = storage.readFile(`FILE${poiRegistration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader: poiReader, omittedSections: poiOmissions } = readLocalWdc5(poiBytes);
  if (poiReader.layoutHash.toString(16).padStart(8, "0") !== poiRegistration.layoutHash) {
    throw new Error("AreaPOI layout changed in the local client.");
  }
  const rows = reader.getAllIDs().map((id) => ({ id,
    relationshipId: reader.getRowRelationship(id) ?? null,
    parentPoi: (() => {
      const parentId = reader.getRowRelationship(id);
      const poi = poiReader.getRowData(parentId);
      return Array.isArray(poi) ? { poiId: parentId,
        name: poi[0]?.string ?? "", mapId: poiReader.getRowRelationship(parentId) ?? null } : null;
    })(),
    fields: (reader.getRowData(id) ?? []).map((field, index) => ({ index,
      ...(typeof field.string === "string" ? { string: field.string } : {}),
      ...(field.data !== undefined ? { data: typeof field.data === "bigint"
        ? field.data.toString() : field.data } : {}),
    })) }));
  await writeFile(join(root, "data/client-research/area-poi-state-icon-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: catalog.source.build, table: registration.name,
      fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      omittedSections,
      parentAreaPoi: { fileDataId: poiRegistration.fileDataId,
        sha256: createHash("sha256").update(poiBytes).digest("hex"),
        omittedSections: poiOmissions } },
    rule: "State rows are raw client fields; numeric matches to AreaPOI icon 132 require a verified key relationship before icon assignment.",
    rows }, null, 2)}\n`);
  console.log(`Read ${rows.length} native AreaPOI state rows.`);
} finally {
  storage.close();
}
