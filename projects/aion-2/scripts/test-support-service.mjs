import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const responses = new Map();
const warnings = [];
const client = { rpc: async (name) => responses.get(name) };
const source = await readFile(new URL("../src/services/support/support-service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  require: (name) => {
    if (name === "i18next") return { default: { t: (key) => key } };
    if (name === "../../data/supabase-client") return { getSupabaseClient: () => client };
    throw new Error(`Unexpected import: ${name}`);
  },
  console: { warn: (...args) => warnings.push(args.join(" ")) },
  window: { localStorage: { getItem: () => "00000000-0000-4000-8000-000000000000" } },
});

for (const name of ["support_list_threads", "support_inbox_threads"]) {
  responses.set(name, { data: null, error: null });
}
assert.equal((await exports.fetchMyThreads()).length, 0);
assert.equal((await exports.fetchAllThreads()).length, 0);
assert.equal(warnings.filter((warning) => warning.includes("returned no data")).length, 2);

const row = {
  id: "thread-1", display_name: "Player", user_email: null, status: "open",
  created_at: "2026-08-31T10:00:00Z", last_message_at: "2026-08-31T10:00:00Z",
  last_sender: "user", user_last_read_at: null, admin_last_read_at: null,
  has_account: false,
};
responses.set("support_list_threads", { data: [row], error: null });
assert.equal((await exports.fetchMyThreads())[0].displayName, "Player");

responses.set("support_thread_messages", { data: null, error: null });
assert.equal(await exports.fetchMessages("thread-1"), null);

for (const [name, call] of [
  ["support_start_thread", () => exports.createThread("Player", "Report")],
  ["support_post_message", () => exports.sendMessage("thread-1", "Reply", false)],
  ["support_edit_message", () => exports.editMessage("message-1", "Edit")],
]) {
  responses.set(name, { data: null, error: null });
  assert.equal((await call()).ok, false, `${name} must report a missing result`);
}

console.log("Support service tests passed: null RPC payloads, normal rows, and missing write results.");
