export type RandomByteFiller = (bytes: Uint8Array) => void;

const fillRuntimeRandom: RandomByteFiller = bytes => {
  const runtimeCrypto = globalThis.crypto;
  if (!runtimeCrypto?.getRandomValues) throw new Error("Secure runtime randomness is unavailable");
  runtimeCrypto.getRandomValues(bytes);
};

/** RFC 4122 version-4 identity without the secure-context-only crypto.randomUUID API. */
export const createRuntimeId = (fill: RandomByteFiller = fillRuntimeRandom): string => {
  const bytes = new Uint8Array(16);
  fill(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
};
