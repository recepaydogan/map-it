import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

// Packs an already-built dist/ into an installable Overwolf .opk. An .opk is a
// plain zip with manifest.json at its root, so the archive is written from
// dist/'s contents rather than the dist folder itself.
//
// The zip is hand-rolled (like the .ico container in build-icons.mjs) instead
// of shelling out to Compress-Archive: Windows PowerShell 5.1 writes backslash
// entry names, which non-Windows unzippers — including store-side tooling —
// can misread as literal file names.

const distDir = resolve("dist");
const manifestPath = join(distDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("dist/manifest.json not found — run `npm run build:overwolf` first.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

// Strip dev-only settings from the packaged copy. public/ itself stays
// untouched so `dev` keeps its auto-refresh.
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.meta.version = version;
delete manifest.data.developer;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });

// Minimal zip writer: one local header + deflated payload per file, then the
// central directory. Sizes stay far under the zip64 thresholds.
const DOS_TIME_MIN = (() => {
  const now = new Date();
  return {
    time: (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
    date: (((now.getFullYear() - 1980) & 0x7f) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
  };
})();

const localParts = [];
const centralParts = [];
let offset = 0;

for (const path of listFiles(distDir).sort()) {
  const name = Buffer.from(relative(distDir, path).replaceAll("\\", "/"), "utf8");
  const data = readFileSync(path);
  const compressed = deflateRawSync(data, { level: 9 });
  const checksum = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed: 2.0 (deflate)
  local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
  local.writeUInt16LE(8, 8); // method: deflate
  local.writeUInt16LE(DOS_TIME_MIN.time, 10);
  local.writeUInt16LE(DOS_TIME_MIN.date, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  localParts.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central directory signature
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0x0800, 8); // flags: UTF-8 names
  central.writeUInt16LE(8, 10); // method: deflate
  central.writeUInt16LE(DOS_TIME_MIN.time, 12);
  central.writeUInt16LE(DOS_TIME_MIN.date, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42); // local header offset
  centralParts.push(central, name);

  offset += local.length + name.length + compressed.length;
}

const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
const fileCount = centralParts.length / 2;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
end.writeUInt16LE(fileCount, 8);
end.writeUInt16LE(fileCount, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync("releases", { recursive: true });
const target = join("releases", `peak-map-${version}.opk`);
writeFileSync(target, Buffer.concat([...localParts, ...centralParts, end]));

const sizeMb = statSync(target).size / (1024 * 1024);
console.log(`Packed ${fileCount} files into ${target} (${sizeMb.toFixed(1)} MB).`);
