import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const result = await build({
  stdin: { contents: `
    export { isValidRecoveryCode, RECOVERY_CODE_LENGTH, RECOVERY_CODE_PATTERN } from "./src/services/auth/recovery-code.ts";
    export { confirmPasswordReset } from "./src/services/auth/auth-service.ts";
    export { calls } from "recovery-test-client";
    import i18n from "i18next";
    import en from "./src/i18n/locales/en.json";
    await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  `, resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "offline-auth", setup(api) {
    api.onResolve({ filter: /supabase-client$|^recovery-test-client$/ }, () => ({ path: "client", namespace: "recovery-test" }));
    api.onResolve({ filter: /shared-account-config$/ }, () => ({ path: "saved-data", namespace: "recovery-test" }));
    api.onLoad({ filter: /.*/, namespace: "recovery-test" }, ({ path }) => ({ contents: path === "client"
      ? `export const calls = []; export const getSupabaseClient = () => ({ auth: {
          verifyOtp: async options => { calls.push({ method: "verifyOtp", options }); return { error: null }; },
          updateUser: async options => { calls.push({ method: "updateUser", options }); return { error: null }; }
        } });`
      : 'export const flushSharedAccountData = async () => true;' }));
  } }],
});
const { isValidRecoveryCode, RECOVERY_CODE_LENGTH, RECOVERY_CODE_PATTERN, confirmPasswordReset, calls } =
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);

test("recovery codes require exactly eight ASCII digits", () => {
  assert.equal(RECOVERY_CODE_LENGTH, 8);
  assert.equal(RECOVERY_CODE_PATTERN, "[0-9]{8}");
  assert(isValidRecoveryCode("01234567"));
  for (const code of ["", "123456", "1234567", "123456789", "1234567a", "1234 5678"]) assert(!isValidRecoveryCode(code), code);
});

test("invalid-length recovery codes never reach the authentication service", async () => {
  for (const code of ["123456", "1234567", "123456789", "1234567a"]) {
    const result = await confirmPasswordReset("offline@example.invalid", code, "test-only-password");
    assert.equal(result.ok, false);
    assert.match(result.error, /8-digit/);
  }
  assert.equal(calls.length, 0);
});

test("eight-digit tokens retain leading zeros and the recovery verification type", async () => {
  const result = await confirmPasswordReset("offline@example.invalid", " 01234567 ", "test-only-password");
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls[0], { method: "verifyOtp", options: { email: "offline@example.invalid", token: "01234567", type: "recovery" } });
  assert.equal(calls[1].method, "updateUser");
});
