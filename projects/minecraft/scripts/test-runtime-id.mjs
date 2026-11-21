import assert from "node:assert/strict";
import { createRuntimeId } from "../src/lib/runtime-id.ts";

const checks = [];
const check = (name, work) => { work(); checks.push(name); console.log(`PASS ${name}`); };

check("runtime identities use RFC 4122 version and variant bits without randomUUID", () => {
  const id = createRuntimeId(bytes => bytes.forEach((_, index) => { bytes[index] = index; }));
  assert.equal(id, "00010203-0405-4607-8809-0a0b0c0d0e0f");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

check("runtime identity generation owns fresh storage and remains unique", () => {
  let invocation = 0;
  const fill = bytes => { bytes.fill(invocation++); };
  const first = createRuntimeId(fill), second = createRuntimeId(fill);
  assert.notEqual(first, second);
  assert.equal(invocation, 2);
});

console.log(`${checks.length} runtime identity checks passed.`);
