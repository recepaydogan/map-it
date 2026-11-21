import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

test("real auth clients share a Map It session without persisting passwords or reading solo sessions", async () => {
  const values = new Map([["valheim-companion-auth", JSON.stringify({ user: { id: "solo-user" } })]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const id = "00000000-0000-0000-0000-000000000001";
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", exp: expires })).toString("base64url"), Buffer.from("local-test-signature").toString("base64url")].join(".");
  const requests = [];
  const fetch = async (url, init) => {
    requests.push(String(url));
    if (String(url).includes("/token?")) return new Response(JSON.stringify({ access_token: jwt, refresh_token: "local-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: expires, user: { id, aud: "authenticated", role: "authenticated", email: "test@example.invalid", user_metadata: {} } }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const options = { auth: { storage, storageKey: "map-it-auth", autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch } };
  const host = createClient("https://mapit.supabase.co", "local-public-key", options);
  const module = createClient("https://mapit.supabase.co", "local-public-key", options);
  assert.equal((await module.auth.getSession()).data.session, null);
  const login = await host.auth.signInWithPassword({ email: "test@example.invalid", password: "never-store-this-password" });
  assert.equal(login.error, null);
  assert.equal((await module.auth.getSession()).data.session.user.id, id);
  assert(![...values.values()].some(value => value.includes("never-store-this-password")));
  assert.equal((await host.auth.signOut()).error, null);
  assert.equal((await module.auth.getSession()).data.session, null);
  assert(values.has("valheim-companion-auth"));
  assert(requests.every(url => url.startsWith("https://mapit.supabase.co/")));
});
