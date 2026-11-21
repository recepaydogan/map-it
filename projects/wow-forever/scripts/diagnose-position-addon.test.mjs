import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { diagnosePositionAddon } from "./diagnose-position-addon.mjs";
import { preparePositionAddonRelease } from "./position-addon-release.mjs";

test("read-only addon diagnosis covers current, broken, legacy and offline installations", async () => {
  const stage = await mkdtemp(path.join(os.tmpdir(), "wfm-addon-diagnose-"));
  const client = path.join(stage, "_forever_");
  const folder = path.join(client, "Interface", "AddOns", "wfm-position-bridge");
  const tocPath = path.join(folder, "wfm-position-bridge.toc");
  const release = await preparePositionAddonRelease("-- diagnostic fixture", "0.1.1", 16001);
  const luaName = `wfm-position-bridge-${release.sha256}.lua`;
  const toc = `## Interface: 16001\n## Version: 0.1.1\n\n${luaName}\n`;
  const download = async () => release;
  const inspect = options => diagnosePositionAddon([client], { download, ...options });
  const snapshot = async () => Object.fromEntries(await Promise.all((await readdir(folder)).map(async name =>
    [name, (await readFile(path.join(folder, name))).toString("base64")])));
  try {
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(client, "Wow.exe"), "");
    assert.equal((await inspect())[1].state, "missing-toc");
    await writeFile(tocPath, toc);
    assert.equal((await inspect())[1].state, "missing-lua");
    await writeFile(path.join(folder, luaName), release.addon.lua);
    const before = await snapshot();
    const current = await inspect();
    assert.equal(current[0].state, "verified");
    assert.equal(current[1].state, "current");
    assert.equal(current[1].luaMatchesLatest, true);
    assert.equal(current[1].characterSnapshotPersistence, "not-configured");
    assert.deepEqual(await snapshot(), before, "diagnosis must not modify installed files");

    const offline = await inspect({ offline: true, download: () => { throw new Error("must not download"); } });
    assert.equal(offline[0].state, "offline");
    assert.equal(offline[1].state, "unverified");
    assert.equal(offline[1].luaMatchesLatest, null);
    const unavailable = await inspect({ download: () => { throw new Error("network unavailable"); } });
    assert.equal(unavailable[0].state, "unavailable");
    assert.equal(unavailable[1].luaExists, true);
    assert.equal(unavailable[1].state, "unverified");
    const corruptRemote = await inspect({ download: async () => ({ ...release, serialized: "tampered" }) });
    assert.equal(corruptRemote[0].state, "unavailable");
    assert.equal(corruptRemote[1].state, "unverified");

    await writeFile(path.join(folder, luaName), "broken Lua");
    assert.equal((await inspect())[1].state, "content-mismatch");
    await writeFile(path.join(folder, luaName), release.addon.lua);
    await writeFile(tocPath, toc.replace("Version: 0.1.1", "Version: 0.0.1"));
    assert.equal((await inspect())[1].state, "content-mismatch");
    await writeFile(tocPath, toc.replace("Interface: 16001", "Interface: 1"));
    assert.equal((await inspect())[1].state, "content-mismatch");
    await writeFile(tocPath, toc.replace(luaName, "wfm-position-bridge.lua"));
    await writeFile(path.join(folder, "wfm-position-bridge.lua"), "legacy Lua");
    const legacy = (await inspect())[1];
    assert.equal(legacy.legacyLayout, true);
    assert.equal(legacy.state, "different-release");

    const oldName = `wfm-position-bridge-${"a".repeat(64)}.lua`;
    await writeFile(tocPath, toc.replace(luaName, oldName));
    await writeFile(path.join(folder, oldName), "old Lua");
    assert.equal((await inspect())[1].state, "different-release");
    for (const entry of ["../secret.lua", `${luaName}\nextra.lua`, "C:\\secret.lua", ""]) {
      await writeFile(tocPath, toc.replace(luaName, entry));
      assert.equal((await inspect())[1].state, "error");
    }
    await writeFile(tocPath, `\uFEFF## SavedVariables: WFM_CharacterDB\r\n${toc.replaceAll("\n", "\r\n")}`);
    await writeFile(path.join(folder, luaName), `\uFEFF${release.addon.lua.replaceAll("\n", "\r\n")}`);
    assert.equal((await inspect())[1].state, "current");
    assert.equal((await inspect())[1].characterSnapshotPersistence, "enabled");
    assert.equal((await diagnosePositionAddon([path.join(stage, "_retail_")], { offline: true }))[1].state, "error");
  } finally {
    if (path.dirname(stage) !== path.resolve(os.tmpdir()) || !path.basename(stage).startsWith("wfm-addon-diagnose-")) {
      throw new Error("Unsafe diagnostic-test cleanup path");
    }
    await rm(stage, { recursive: true, force: true });
  }
});
