import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { copyBuildPublic } from "./copy-build-public.ts";

const tempRoot = path.resolve(os.tmpdir());
const directory = fs.mkdtempSync(path.join(tempRoot, "build-public-test-"));
const source = path.join(directory, "source");
const target = path.join(directory, "output");
let lock;
let lockExit;
try {
  fs.mkdirSync(path.join(source, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(source, "plugins", "old.dll"), "unchanged native bytes");
  fs.writeFileSync(path.join(source, "manifest.json"), "old manifest");
  assert.deepEqual(copyBuildPublic(source, target), { copied: 2, unchanged: 0 });
  const loadedFile = path.join(target, "plugins", "old.dll");
  const modifiedAt = fs.statSync(loadedFile).mtimeMs;
  if (process.platform === "win32") {
    const quoted = loadedFile.replaceAll("'", "''");
    const command = `$ErrorActionPreference='Stop'; $stream=[IO.File]::Open('${quoted}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read); try { [Console]::WriteLine('LOCKED'); [Console]::Out.Flush(); [Console]::ReadLine() | Out-Null } finally { $stream.Dispose() }`;
    lock = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    lockExit = new Promise(resolve => lock.once("exit", resolve));
    await new Promise((resolve, reject) => {
      let output = "";
      lock.on("error", reject);
      lock.stderr.on("data", data => { output += data; });
      lock.stdout.on("data", data => { output += data; if (output.includes("LOCKED")) resolve(); });
      lock.once("exit", code => reject(new Error(`Lock helper exited ${code}: ${output}`)));
    });
  }
  assert.deepEqual(copyBuildPublic(source, target), { copied: 0, unchanged: 2 });
  assert.equal(fs.statSync(loadedFile).mtimeMs, modifiedAt, "Identical native file was never rewritten");
  if (lock) {
    fs.writeFileSync(path.join(source, "plugins", "old.dll"), "different bytes");
    fs.writeFileSync(path.join(source, "manifest.json"), "new manifest");
    assert.throws(() => copyBuildPublic(source, target), error => ["EBUSY", "EPERM", "EACCES"].includes(error.code), "Changed locked binaries fail visibly");
    assert.equal(fs.readFileSync(path.join(target, "manifest.json"), "utf8"), "old manifest", "Manifest is not published before its binary");
  }
  fs.unlinkSync(path.join(source, "plugins", "old.dll"));
  fs.writeFileSync(path.join(source, "plugins", "new.dll"), "updated native bytes");
  fs.writeFileSync(path.join(source, "manifest.json"), "new manifest");
  assert.deepEqual(copyBuildPublic(source, target), { copied: 2, unchanged: 0 });
  assert.equal(fs.readFileSync(loadedFile, "utf8"), "unchanged native bytes", "Loaded old DLL is left alone");
  assert.equal(fs.readFileSync(path.join(target, "plugins", "new.dll"), "utf8"), "updated native bytes");
  const clean = path.join(directory, "clean-release");
  assert.deepEqual(copyBuildPublic(source, clean), { copied: 2, unchanged: 0 }, "Custom/clean output receives all assets");
  assert.equal(fs.existsSync(path.join(clean, "plugins", "old.dll")), false);
  console.log(`PASS: unchanged assets, ${lock ? "real Windows file lock, " : ""}new native filename, manifest ordering and clean output.`);
} finally {
  if (lock) { lock.stdin.end("\n"); await lockExit; }
  if (path.dirname(directory) !== tempRoot || !path.basename(directory).startsWith("build-public-test-")) throw new Error("Unsafe test cleanup directory");
  fs.rmSync(directory, { recursive: true, force: true });
}
