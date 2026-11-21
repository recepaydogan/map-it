/** Parse only Lua data literals. Never execute SavedVariables as code. */
export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
export function parseCharacterSavedVariables(source: string): unknown {
  if (new TextEncoder().encode(source).length > MAX_SNAPSHOT_BYTES) throw new Error("snapshot-too-large");
  let at = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let nodes = 0;
  const fail = (): never => { throw new Error("invalid-snapshot"); };
  const skip = () => {
    for (;;) {
      while (/\s/.test(source[at] ?? "") && at < source.length) at++;
      if (!source.startsWith("--", at)) return;
      if (source.startsWith("--[[", at)) {
        const end = source.indexOf("]]", at + 4);
        if (end < 0) fail();
        at = end + 2;
      } else { const end = source.indexOf("\n", at); at = end < 0 ? source.length : end + 1; }
    }
  };
  const take = (token: string) => { skip(); if (!source.startsWith(token, at)) fail(); at += token.length; };
  const string = (): string => {
    const quote = source[at++];
    const bytes: number[] = [];
    const encoder = new TextEncoder();
    while (at < source.length) {
      const char = source[at++];
      if (char === quote) return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
      if (char === "\\") {
        const escaped = source[at++];
        if (escaped && /\d/.test(escaped)) {
          let digits = escaped;
          while (digits.length < 3 && /\d/.test(source[at] ?? "")) digits += source[at++];
          const value = Number(digits);
          if (value > 255) fail();
          bytes.push(value);
        } else {
          const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", a: "\x07", "\\": "\\", '"': '"', "'": "'", "\n": "\n" };
          if (!escaped || !(escaped in escapes)) fail();
          bytes.push(...encoder.encode(escapes[escaped]!));
        }
      } else {
        if (char === "\n" || char === "\r") fail();
        const code = char!.charCodeAt(0);
        const value = code >= 0xd800 && code <= 0xdbff ? char + source[at++]! : char!;
        bytes.push(...encoder.encode(value));
      }
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (++nodes > 200_000 || depth > 32) fail();
    skip();
    const char = source[at];
    if (char === '"' || char === "'") return string();
    if (char === "{") {
      at++;
      const table: Record<string, unknown> = Object.create(null);
      let next = 1;
      for (;;) {
        skip();
        if (source[at] === "}") { at++; return table; }
        let key: unknown;
        if (source[at] === "[") { at++; key = value(depth + 1); take("]"); take("="); }
        else {
          const field = /^([a-zA-Z_][a-zA-Z_0-9]*)\s*=/.exec(source.slice(at));
          if (field) { key = field[1]; at += field[0].length; } else key = next++;
        }
        if ((typeof key !== "string" && typeof key !== "number") || ["__proto__", "prototype", "constructor"].includes(String(key))) fail();
        if (Object.hasOwn(table, String(key))) fail();
        table[String(key)] = value(depth + 1);
        skip();
        if (source[at] === "," || source[at] === ";") at++;
        else if (source[at] !== "}") fail();
      }
    }
    for (const [token, literal] of [["true", true], ["false", false], ["nil", null]] as const) {
      if (source.startsWith(token, at) && !/[a-zA-Z_0-9]/.test(source[at + token.length] ?? "")) { at += token.length; return literal; }
    }
    const numeric = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(at));
    if (!numeric || !Number.isFinite(Number(numeric[0]))) return fail();
    at += numeric[0].length;
    return Number(numeric[0]);
  };
  take("WFM_CharacterDB"); take("=");
  const parsed = value(0);
  skip();
  if (source[at] === ";") { at++; skip(); }
  if (at !== source.length) fail();
  return parsed;
}
