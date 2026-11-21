import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeGeneratedFile, withTransientFileRetry } from "./lib/write-generated-file.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "generated-file-test-"));
const filename = path.join(directory, "output.json");
try {
  assert.equal(writeGeneratedFile(filename, "first\n"), true);
  fs.utimesSync(filename, 100, 100);
  assert.equal(writeGeneratedFile(filename, "first\n"), false);
  assert.equal(fs.statSync(filename).mtimeMs, 100_000, "Unchanged output must not be reopened for writing");
  assert.equal(writeGeneratedFile(filename, Buffer.from("second\n")), true);
  assert.equal(fs.readFileSync(filename, "utf8"), "second\n");
  assert.deepEqual(fs.readdirSync(directory), ["output.json"], "Replacement cannot leave temporary files");
  assert.throws(() => writeGeneratedFile(path.join(directory, "missing", "output.json"), "value"), { code: "ENOENT" });
  assert.equal(fs.readFileSync(filename, "utf8"), "second\n");
} finally {
  fs.unlinkSync(filename);
  fs.rmdirSync(directory);
}
console.log("Generated-file replacement passed: unchanged outputs retained, complete replacements and explicit failures.");

let attempts = 0;
const retries = [];
const temporaryLock = Object.assign(new Error("fixture lock"), { code: "EPERM" });
assert.equal(await withTransientFileRetry(() => {
  if (++attempts < 3) throw temporaryLock;
  return "complete";
}, { wait: async () => {}, onRetry: (error, attempt) => retries.push([error.code, attempt]) }), "complete");
assert.deepEqual(retries, [["EPERM", 1], ["EPERM", 2]]);
attempts = 0;
await assert.rejects(withTransientFileRetry(() => { attempts += 1; throw temporaryLock; },
  { attempts: 2, wait: async () => {} }), (error) => error === temporaryLock);
assert.equal(attempts, 2, "A persistent lock must still fail after bounded retries");
attempts = 0;
await assert.rejects(withTransientFileRetry(() => {
  attempts += 1;
  throw Object.assign(new Error("fixture corruption"), { code: "EIO" });
}, { wait: async () => {} }), { code: "EIO" });
assert.equal(attempts, 1, "Unexpected I/O errors must not be hidden by retrying");
