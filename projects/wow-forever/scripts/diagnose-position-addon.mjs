import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadPositionAddonRuntime } from "./position-addon-release.mjs";

const readOptional = async file => {
  try { return await readFile(file, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
};

/** Read-only inspection: never install, repair, write cache or execute downloaded Lua. */
export async function diagnosePositionAddon(directories, { offline = false, download } = {}) {
  const runtime = await loadPositionAddonRuntime();
  const { config, normalizeAddonText, verifyPositionAddonPackage } = runtime;
  let verified = null;
  const cdn = { event: "addon-cdn", url: `${config.cdnBaseUrl}/current.json`, state: "offline", latestVersion: null };
  if (!offline) {
    try {
      const candidate = await (download ?? runtime.downloadPositionAddon)();
      verified = await verifyPositionAddonPackage(candidate.serialized, candidate.sha256);
      Object.assign(cdn, { state: "verified", latestVersion: verified.addon.version,
        interfaceVersion: verified.addon.interfaceVersion, protocolVersion: verified.addon.protocolVersion,
        sha256: verified.sha256 });
    } catch (error) { Object.assign(cdn, { state: "unavailable", error: error.message }); }
  }
  const records = [cdn];
  const escapedName = config.addonDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const allowedLua = new RegExp(`^${escapedName}(?:-([a-f0-9]{64}))?\\.lua$`);
  for (const directory of [...new Set(directories)]) {
    const record = { event: "installation", directory, state: "error", latestVerified: Boolean(verified) };
    try {
      if (!path.isAbsolute(directory) || path.basename(directory).toLowerCase() !== config.clientDirectory) {
        throw new Error(`Client directory must be absolute and end in ${config.clientDirectory}`);
      }
      const image = path.join(directory, config.executable);
      record.executableExists = await stat(image).then(info => info.isFile(), error => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
      const addon = path.join(directory, "Interface", "AddOns", config.addonDirectory);
      const toc = await readOptional(path.join(addon, `${config.addonDirectory}.toc`));
      record.tocExists = toc !== null;
      if (toc === null) { record.state = "missing-toc"; records.push(record); continue; }
      const normalizedToc = normalizeAddonText(toc);
      record.tocVersion = /^## Version:\s*([^\r\n]+)/m.exec(normalizedToc)?.[1]?.trim() ?? null;
      record.tocInterface = /^## Interface:\s*([^\r\n]+)/m.exec(normalizedToc)?.[1]?.trim() ?? null;
      record.characterSnapshotPersistence = /^## SavedVariables:\s*([^\r\n]+)/m.exec(normalizedToc)?.[1]
        .split(",").map(name => name.trim()).includes(config.savedVariables) ? "enabled" : "not-configured";
      const entries = normalizedToc.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#"));
      if (entries.length !== 1 || !allowedLua.test(entries[0])) {
        throw new Error("TOC must reference exactly one recognized addon Lua filename (no paths)");
      }
      record.luaFile = entries[0];
      record.installedReleaseHash = allowedLua.exec(record.luaFile)[1] ?? null;
      record.legacyLayout = record.installedReleaseHash === null;
      const lua = await readOptional(path.join(addon, record.luaFile));
      record.luaExists = lua !== null;
      record.luaMatchesLatest = verified && lua !== null ? normalizeAddonText(lua) === verified.addon.lua : null;
      record.latestVersion = verified?.addon.version ?? null;
      record.latestInterface = verified?.addon.interfaceVersion ?? null;
      if (lua === null) record.state = "missing-lua";
      else if (!verified) record.state = "unverified";
      else if (record.installedReleaseHash !== verified.sha256) record.state = "different-release";
      else if (!record.luaMatchesLatest || record.tocVersion !== verified.addon.version ||
        record.tocInterface !== String(verified.addon.interfaceVersion)) record.state = "content-mismatch";
      else record.state = "current";
    } catch (error) { record.error = error.message; }
    records.push(record);
  }
  return records;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const records = await diagnosePositionAddon(args.filter(arg => arg !== "--offline"), { offline: args.includes("--offline") });
  for (const record of records) console.log(JSON.stringify(record));
}
