export type PayloadCompression = "none" | "gzip" | "deflate";

export interface DecompressionOptions {
  maxInputBytes?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
}

/** Output limits are enforced while streaming, before concatenating expanded data. */
export const decompressBounded = async (
  input: Uint8Array, compression: PayloadCompression, options: DecompressionOptions = {},
): Promise<Uint8Array> => {
  const checkAbort = () => {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("Operation aborted", "AbortError");
  };
  checkAbort();
  const maxInput = options.maxInputBytes ?? 8 * 1024 * 1024;
  const maxOutput = options.maxOutputBytes ?? 16 * 1024 * 1024;
  if (![maxInput, maxOutput].every(value => Number.isSafeInteger(value) && value > 0) ||
    !(input instanceof Uint8Array) || input.length > maxInput) throw new Error("Invalid or oversized compressed payload");
  if (compression === "none") {
    if (input.length > maxOutput) throw new Error("Payload exceeds output byte limit");
    return new Uint8Array(input);
  }
  if (compression !== "gzip" && compression !== "deflate") throw new Error("Unsupported payload compression");
  if (typeof DecompressionStream === "undefined") throw new Error("Streaming decompression is unavailable in this runtime");
  // Own the input for the asynchronous operation; caller mutation cannot change its contents.
  const data = new Uint8Array(input);
  let offset = 0;
  const source = new ReadableStream<BufferSource>({
    pull(controller) {
      if (offset === data.length) { controller.close(); return; }
      const end = Math.min(data.length, offset + 32768);
      controller.enqueue(data.subarray(offset, end));
      offset = end;
    },
  });
  const reader = source.pipeThrough(new DecompressionStream(compression), { signal: options.signal }).getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      checkAbort();
      const next = await reader.read();
      checkAbort();
      if (next.done) break;
      if (next.value.length > maxOutput - length) throw new Error("Decompressed payload exceeds output byte limit");
      length += next.value.length;
      parts.push(next.value);
    }
  } catch (error) {
    try { await reader.cancel(error); }
    catch (cleanupError) {
      // An errored stream rejects cancel with its existing error; preserve distinct failures.
      if (cleanupError !== error) throw new AggregateError([error, cleanupError], "Decompression and cancellation failed");
    }
    throw error;
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(length);
  let position = 0;
  for (const part of parts) { output.set(part, position); position += part.length; }
  return output;
};
