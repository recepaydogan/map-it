import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { unzipSync } from "fflate";
import { GAME_SEED_ENGINE_SOURCES, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";

// Build-only portable toolchain, no PATH/registry/system installation or game-file access.
const sdk = resolve("node_modules/.cache/seed-engine-toolchain/wasi-sdk-34.0-x86_64-windows");
const compiler = resolve(sdk, "bin/clang.exe");
const out = resolve("node_modules/.cache/seed-engines"); await mkdir(out, { recursive: true });
const exports = ["engine_profile_count", "engine_seed", "engine_biome", "engine_generate", "engine_release", "engine_output_pointer", "engine_output_length",
  "engine_generate_heights", "engine_height_output_pointer", "engine_height_output_length",
  "engine_structure_count", "engine_region_size", "engine_structure", "engine_structure_x", "engine_structure_z"];
const sha = data => createHash("sha256").update(data).digest("hex");
for (const source of GAME_SEED_ENGINE_SOURCES) {
  const archive = await readFile(resolve(`node_modules/.cache/seed-engine-sources/${source.edition}.zip`));
  if (sha(archive) !== source.archiveSha256) throw new Error(`Source hash mismatch: ${source.edition}`);
  const directory = resolve(`node_modules/.cache/seed-engine-sources/${source.edition}/${source.directory}`);
  for (const [name, data] of Object.entries(unzipSync(archive))) {
    if (name.endsWith("/")) continue;
    if (!name.startsWith(`${source.directory}/`) || name.split("/").some(part => part === "..")) throw new Error("Unexpected source archive path");
    const relative = name.slice(source.directory.length + 1);
    if (sha(await readFile(resolve(directory, relative))) !== sha(data)) throw new Error(`Extracted source differs from the pinned archive: ${relative}`);
  }
  const build = resolve(out, source.edition); await mkdir(build, { recursive: true });
  const structureSymbols = GAME_STRUCTURE_TYPES.map(type => source.edition === "java" && "javaSymbol" in type ? type.javaSymbol : type.symbol);
  await writeFile(resolve(build, "engine-build-config.h"), `#define ENGINE_PROFILE_CODES { ${source.profiles.map(profile => profile.symbol).join(", ")} }\n#define ENGINE_PROFILE_FLAGS { ${source.profiles.map(profile => profile.flags ?? 0).join(", ")} }\n#define ENGINE_STRUCTURE_TYPES { ${structureSymbols.join(", ")} }\n${source.edition === "java" ? "#define ENGINE_JAVA 1\n" : ""}`);
  const target = resolve(out, `${source.edition}.wasm`);
  const args = ["--target=wasm32-wasip1", `--sysroot=${resolve(sdk, "share/wasi-sysroot")}`, "-mexec-model=reactor", "-O2", "-fwrapv", "-fno-fast-math",
    "-I", directory, "-I", build, resolve("scripts/seed-engine-bridge.c"), ...source.files.map(file => resolve(directory, file)), "-lm",
    "-Wl,--initial-memory=4194304", "-Wl,--max-memory=67108864", "-Wl,-z,stack-size=1048576", "-Wl,--strip-all",
    ...exports.map(name => `-Wl,--export=${name}`), "-o", target];
  const result = spawnSync(compiler, args, { encoding: "utf8", windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Engine compilation failed: ${source.edition}`);
  const wasm = await readFile(target), module = await WebAssembly.compile(wasm);
  const license = await readFile(resolve(directory, "LICENSE"), "utf8");
  await writeFile(resolve(out, `${source.edition}-license.txt`), license);
  const manifest = { schemaVersion: 1, edition: source.edition, repository: source.repository, revision: source.revision,
    archiveSha256: source.archiveSha256, wasmSha256: sha(wasm), bytes: wasm.length, profiles: source.profiles.map(item => item.id),
    compiler: "wasi-sdk-34", bridgeSha256: sha(await readFile(resolve("scripts/seed-engine-bridge.c"))),
    imports: WebAssembly.Module.imports(module), exports: WebAssembly.Module.exports(module),
    inGameVerified: false, blockTerrain: false, approximateSurfaceHeight: "overworld",
    structures: "biome-tested-candidates",
    structureTypes: GAME_STRUCTURE_TYPES.map(type => type.id), structureTerrainVerified: false };
  await writeFile(resolve(out, `${source.edition}.json`), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest));
}
