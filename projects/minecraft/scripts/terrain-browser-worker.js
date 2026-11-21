import { NbtFile, NbtCompound, NbtInt, NbtByte, NbtString, NbtList } from "deepslate/nbt";
import { readRegionColumn } from "../src/features/terrain/read-region-column.ts";
import { readLayeredSubchunk } from "../src/features/terrain/read-layered-subchunk.ts";
import { decompressBounded } from "../src/features/terrain/decompress-bounded.ts";
import { meshVoxelSection } from "../src/features/terrain/mesh-voxel-section.ts";
import { GAME_COLUMN_TAG_SCHEMA, GAME_NBT_FORMATS, GAME_REGION_COMPRESSION, GAME_SUBCHUNK_SCHEMA } from "../src/game-config.ts";

const compound = entries => new NbtCompound(new Map(Object.entries(entries)));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const compress = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

self.onmessage = async () => {
  try {
    const checks = [];
    const file = NbtFile.create();
    file.root = compound({ DataVersion: new NbtInt(100), xPos: new NbtInt(-1), zPos: new NbtInt(2),
      Status: new NbtString("full"), sections: new NbtList([compound({ Y: new NbtByte(-4),
        block_states: compound({ palette: new NbtList([compound({ Name: new NbtString("fixture:solid") })], 10) }),
      })], 10) });
    const payload = { chunkX: -1, chunkZ: 2, slot: 0, timestampSeconds: 123, compressionId: 1, external: false,
      data: await compress(file.write()) };
    const context = { schema: GAME_COLUMN_TAG_SCHEMA, dataVersion: 100, chunkX: -1, chunkZ: 2, minSectionY: -4, maxSectionY: 19 };
    const column = await readRegionColumn(payload, context, { tags: GAME_NBT_FORMATS.java, compressionModes: GAME_REGION_COMPRESSION });
    assert(column.sections[0].voxels.palette[0].id === "fixture:solid", "Column palette mismatch");
    assert(column.sections.slice(1).every(section => section.voxels === null), "Missing coverage became terrain");
    checks.push("PASS compressed column → bounded tags → normalized blocks in browser worker");
    const mesh = meshVoxelSection(column.sections[0].voxels, { origin: [-16, -64, 32], shapes: ["opaque-cube"], cutawayY: -62,
      neighbor: () => "opaque-cube" });
    assert(mesh.blockIndices.length === 256 && mesh.faceFlags.every(flag => flag === 2), "Cutaway geometry mismatch");
    checks.push("PASS Y cutaway produces 256 correctly flagged faces");
    const stateFile = NbtFile.create({ littleEndian: true });
    stateFile.root = compound({ name: new NbtString("fixture:solid"), states: compound({}), version: new NbtInt(100) });
    const state = stateFile.write();
    const input = new Uint8Array(4 + state.length); input.set([9, 1, 252, 0]); input.set(state, 4);
    const subchunk = readLayeredSubchunk(input, { schema: GAME_SUBCHUNK_SCHEMA, sectionY: -4, paletteVersions: [100] });
    assert(subchunk.layers[0].voxels.palette[0].id === "fixture:solid", "Persistent palette mismatch");
    checks.push("PASS little-endian persistent subchunk → same normalized block type");
    let rejected = false;
    try { await decompressBounded(await compress(new Uint8Array(1024 * 1024)), "gzip", { maxOutputBytes: 1024 }); }
    catch (error) { rejected = error instanceof Error && error.message.includes("output byte limit"); }
    assert(rejected, "Expanded output limit was not enforced");
    checks.push("PASS oversized expansion is rejected inside browser worker");
    self.postMessage(checks.join("\n") + "\nPASS: 4 browser-worker checks; synthetic fixtures only");
  } catch (error) { self.postMessage(`FAIL: ${error instanceof Error ? error.message : String(error)}`); }
};
