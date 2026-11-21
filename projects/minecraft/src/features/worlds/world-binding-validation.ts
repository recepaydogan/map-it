import type { WorldSessionBinding } from "./world-session-binding.ts";

/** Bindings are app confirmations, never a world identity supplied by the game provider. */
export const parseWorldBinding = (input: unknown): WorldSessionBinding => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid world session binding.");
  const value = input as Record<string, unknown>;
  const string = (key: string, max: number) => {
    const text = value[key];
    if (typeof text !== "string" || !text.trim() || text.length > max) throw new Error("Invalid world session binding field.");
    return text;
  };
  const integer = (key: string) => {
    const number = value[key];
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) throw new Error("Invalid world session binding number.");
    return number;
  };
  return { worldId: string("worldId", 512), generationKey: string("generationKey", 1_048_576),
    sessionId: string("sessionId", 512), sessionIdentity: string("sessionIdentity", 4096),
    sessionGeneration: integer("sessionGeneration"), confirmedAt: integer("confirmedAt") };
};
