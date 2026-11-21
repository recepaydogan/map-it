import assert from "node:assert/strict";
import { createOptionalService } from "../src/lib/optional-service.ts";

const failure = new Error("net::ERR_BLOCKED_BY_CLIENT");
const errors = [];
let requests = 0;
let calls = 0;
const blocked = createOptionalService(async () => { requests++; throw failure; }, error => errors.push(error));
blocked.call(() => calls++);
await blocked.start(() => calls++);
blocked.call(() => calls++);
await blocked.start(() => calls++);
assert.equal(requests, 1, "Blocked integrations must not retry on every interaction");
assert.equal(calls, 0, "No queued tracking is sent after a blocked import");
assert.deepEqual(errors, [failure], "Failures must be reported without rejecting app startup");

const order = [];
const available = createOptionalService(async () => order, error => { throw error; });
available.call(value => value.push("before"));
const first = available.start(value => value.push("initialized"));
await available.start(value => value.push("duplicate"));
await first;
available.call(value => value.push("after"));
assert.deepEqual(order, ["initialized", "before", "after"], "StrictMode and early pageviews preserve initialization order");

const disabled = createOptionalService(async () => { throw new Error("Must not load"); }, error => { throw error; });
disabled.call(() => calls++);
disabled.disable();
await disabled.start(() => calls++);
assert.equal(calls, 0, "Unconfigured integrations never request tracking modules");
console.log("Optional integrations tolerate blocked imports, preserve call order and skip unconfigured requests.");
