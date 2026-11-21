import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const parseArguments = (arguments_) => {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    values.set(key.slice(2), value);
  }
  for (const required of ["texconv", "source", "raster-cache", "output", "display-name"]) {
    if (!values.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return values;
};

const run = (command, arguments_) => {
  const result = spawnSync(command, arguments_, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with code ${result.status ?? "unknown"}.`);
  }
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const texconvPath = path.resolve(arguments_.get("texconv"));
  const sourcePath = path.resolve(arguments_.get("source"));
  const rasterCacheDirectory = path.resolve(arguments_.get("raster-cache"));
  const outputDirectory = path.resolve(arguments_.get("output"));
  if (!fs.existsSync(texconvPath)) throw new Error(`Texture converter does not exist: ${texconvPath}`);
  if (!fs.existsSync(sourcePath)) throw new Error(`Source texture does not exist: ${sourcePath}`);
  fs.mkdirSync(rasterCacheDirectory, { recursive: true });

  const rasterPath = path.join(rasterCacheDirectory, `${path.basename(sourcePath, path.extname(sourcePath))}.png`);
  if (!fs.existsSync(rasterPath)) {
    run(texconvPath, ["-y", "-ft", "png", "-o", rasterCacheDirectory, sourcePath]);
  } else {
    console.log(`Using cached raster: ${rasterPath}`);
  }
  if (!fs.existsSync(rasterPath)) throw new Error(`Texture conversion did not create ${rasterPath}.`);

  const forwardedNames = [
    "description",
    "source-build",
    "generated-at",
    "attribution",
    "tile-size",
    "logical-width",
    "logical-height",
    "coordinate-frame",
    "world-x",
    "world-y",
    "world-width",
    "world-height",
    "world-origin",
    "flip-y",
    "location-sources",
    "content-source",
  ];
  const tilerArguments = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), "build-raster-map.mjs"),
    "--source", rasterPath,
    "--output", outputDirectory,
    "--display-name", arguments_.get("display-name"),
  ];
  for (const name of forwardedNames) {
    if (arguments_.has(name)) tilerArguments.push(`--${name}`, arguments_.get(name));
  }
  run(process.execPath, tilerArguments);
};

try {
  main();
} catch (error) {
  console.error("Virtual raster map build failed:", error);
  process.exitCode = 1;
}
