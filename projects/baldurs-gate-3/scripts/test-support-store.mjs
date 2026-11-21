import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const thread = {
  id: "report-1", displayName: "Player", userEmail: null, status: "open",
  createdAt: "2026-08-31T10:00:00Z", lastMessageAt: "2026-08-31T10:00:00Z",
  lastSender: "user", userLastReadAt: null, adminLastReadAt: null, hasAccount: false,
};
const firstMessage = {
  id: "message-1", threadId: thread.id, sender: "user", body: "Original report",
  createdAt: thread.createdAt, editedAt: null,
};
let mine = [];
let inbox = [];
let admin = false;
let fetchedMessages = [firstMessage];
let createFailure = false;
let deleteFailure = false;
let refreshBarrier = Promise.resolve();
let claimCalls = 0;
let readThreadId;
const failure = { ok: false, error: "Temporary failure" };
const success = (value = null) => ({ ok: true, value });
const service = {
  claimDeviceThreads: async () => { claimCalls++; await refreshBarrier; },
  isSupportAdmin: async () => admin,
  fetchMyThreads: async () => mine,
  fetchAllThreads: async () => inbox,
  fetchMessages: async () => fetchedMessages,
  createThread: async () => {
    if (createFailure) return failure;
    mine = [thread];
    return success(thread);
  },
  sendMessage: async (threadId, body, asAdmin) => success({
    ...firstMessage, id: "message-2", threadId, body, sender: asAdmin ? "admin" : "user",
  }),
  editMessage: async (id, body) => success({ ...firstMessage, id, body, editedAt: "2026-08-31T10:05:00Z" }),
  deleteThread: async () => deleteFailure ? failure : success(),
  setThreadStatus: async (_id, status) => { mine = [{ ...thread, status }]; return success(); },
  markThreadRead: async (id) => { readThreadId = id; },
};
const source = await readFile(new URL("../src/store/support-store.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  require: (name) => name === "../services/support/support-service" ? service : require(name),
});
const store = exports.useSupportStore;

// Refreshing history must never erase an in-progress form or flicker back to a first load.
store.getState().setDraft({ name: "Player", body: "Unsent draft" });
let releaseRefresh;
refreshBarrier = new Promise((resolve) => { releaseRefresh = resolve; });
const firstRefresh = store.getState().refresh();
const duplicateRefresh = store.getState().refresh();
assert.equal(claimCalls, 1, "Concurrent refreshes must share the same request.");
assert.equal(store.getState().loading, true);
releaseRefresh();
await Promise.all([firstRefresh, duplicateRefresh]);
assert.equal(store.getState().draft.body, "Unsent draft");
assert.equal(store.getState().hasLoaded, true);
assert.equal(store.getState().loading, false);

// A failed send retains the draft; success clears it and loads the new conversation.
createFailure = true;
assert.equal((await store.getState().createReport("Player", "Unsent draft")).ok, false);
assert.equal(store.getState().draft.body, "Unsent draft");
createFailure = false;
assert.equal((await store.getState().createReport("Player", "Unsent draft")).ok, true);
assert.equal(store.getState().draft.name, null);
assert.equal(store.getState().draft.body, "");
assert.equal(store.getState().myThreads[0].id, thread.id);
assert.equal(store.getState().messages[thread.id][0].body, firstMessage.body);

await store.getState().post(thread.id, "User follow-up", false);
assert.equal(store.getState().messages[thread.id].at(-1).sender, "user");
await store.getState().post(thread.id, "Support reply", true);
assert.equal(store.getState().messages[thread.id].at(-1).sender, "admin");
assert.equal(store.getState().messages[thread.id].at(-1).body, "Support reply");
await store.getState().edit(thread.id, firstMessage.id, "Corrected report");
assert.equal(store.getState().messages[thread.id][0].body, "Corrected report");
assert.ok(store.getState().messages[thread.id][0].editedAt);

// A failed read is distinct from an empty conversation, and retry can recover.
fetchedMessages = null;
await store.getState().loadMessages(thread.id);
assert.equal(store.getState().messages[thread.id], null);
assert.equal(store.getState().loadingThreadId, null);
fetchedMessages = [firstMessage];
await store.getState().loadMessages(thread.id);
assert.equal(store.getState().messages[thread.id].length, 1);

admin = true;
inbox = [thread];
await store.getState().refresh();
assert.equal(store.getState().inboxThreads.length, 1);
await store.getState().markRead(thread.id);
assert.equal(readThreadId, thread.id);
assert.ok(store.getState().myThreads[0].userLastReadAt);
await store.getState().changeStatus(thread.id, "closed");
assert.equal(store.getState().myThreads[0].status, "closed");
await store.getState().changeStatus(thread.id, "open");
assert.equal(store.getState().myThreads[0].status, "open");
admin = false;
await store.getState().refresh();
assert.equal(store.getState().isAdmin, false);
assert.equal(store.getState().inboxThreads.length, 0, "Signing out must clear the staff inbox.");

deleteFailure = true;
assert.equal((await store.getState().remove(thread.id)).ok, false);
assert.equal(store.getState().myThreads.length, 1);
assert.ok(store.getState().messages[thread.id]);
deleteFailure = false;
assert.equal((await store.getState().remove(thread.id)).ok, true);
assert.equal(store.getState().myThreads.length, 0);
assert.equal(store.getState().messages[thread.id], undefined);

// Old account requests must not repopulate a reset session or block its refresh.
store.getState().setDraft({name:'Previous account',body:'Private draft'});
let releaseOld;
refreshBarrier = new Promise(resolve => { releaseOld = resolve; });
const oldRefresh = store.getState().refresh();
store.getState().resetSession();
assert.equal(store.getState().draft.body,'');
assert.equal(Object.keys(store.getState().messages).length,0);
assert.equal(store.getState().hasLoaded,false);
refreshBarrier = Promise.resolve();
mine = [];
await store.getState().refresh();
releaseOld();
await oldRefresh;
assert.equal(store.getState().myThreads.length,0);
assert.equal(store.getState().loading,false);

let releaseMessages;
service.fetchMessages = () => new Promise(resolve => { releaseMessages = resolve; });
const oldMessages = store.getState().loadMessages(thread.id);
store.getState().resetSession();
releaseMessages([firstMessage]);
await oldMessages;
assert.equal(Object.keys(store.getState().messages).length,0,'Late messages must not leak across accounts');

let releaseCreate;
service.createThread = () => new Promise(resolve => { releaseCreate = resolve; });
const oldCreate = store.getState().createReport('Previous account','Previous report');
store.getState().resetSession();
store.getState().setDraft({body:'New account draft'});
releaseCreate(success(thread));
await oldCreate;
assert.equal(store.getState().draft.body,'New account draft','Late sends must not clear the new account draft');
console.log("Support store tests passed: concurrent refresh, drafts, send failures, replies, edits, retry, read markers, status, staff sign-out, and deletion.");
