export type SeedInput =
  | { kind: "numeric"; input: string; value: string }
  | { kind: "text"; input: string }
  | { kind: "empty"; input: string }
  | { kind: "out-of-range"; input: string };

const MIN_SEED = -(1n << 63n);
const MAX_SEED = (1n << 63n) - 1n;

/** Text resolution belongs to a verified edition/version adapter, not this parser. */
export const parseSeedInput = (input: string): SeedInput => {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty", input };
  if (!/^[+-]?\d+$/.test(trimmed)) return { kind: "text", input };
  // A small bound prevents unbounded BigInt parsing without rejecting leading zeroes.
  const digits = trimmed.replace(/^[+-]?0*/, "");
  if (digits.length > 19) return { kind: "out-of-range", input };
  const value = BigInt(`${trimmed.startsWith("-") ? "-" : ""}${digits || "0"}`);
  if (value < MIN_SEED || value > MAX_SEED) return { kind: "out-of-range", input };
  return { kind: "numeric", input, value: value.toString() };
};

export const requireNumericSeed = (input: string): string => {
  const result = parseSeedInput(input);
  if (result.kind !== "numeric") throw new Error(`Unresolved seed: ${result.kind}`);
  return result.value;
};

/** Draw every bit without a floating-point conversion or Math.random bias. */
export const randomSeed = (fill: (values: Uint32Array) => Uint32Array = values =>
  crypto.getRandomValues(values)): string => {
  const words = fill(new Uint32Array(2));
  return BigInt.asIntN(64, (BigInt(words[0]) << 32n) | BigInt(words[1])).toString();
};
