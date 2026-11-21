/** Bound structured data before queueing it; never transfer the caller's buffers or unused view bytes. */
export const copyTerrainWorkData = <T>(input: T, limit: number): { value: T; bytes: number; transfer: ArrayBuffer[] } => {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid terrain message byte budget");
  let bytes = 0, nodes = 0;
  const transfer: ArrayBuffer[] = [], ancestors = new Set<object>();
  const charge = (size: number) => { bytes += size; if (bytes > limit) throw new Error("Terrain message exceeds byte budget"); };
  const copy = (value: unknown, depth: number): unknown => {
    if (++nodes > 100000 || depth > 24) throw new Error("Terrain message exceeds structural budget");
    charge(16);
    if (value === undefined || value === null || typeof value === "boolean") return value;
    if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Nonfinite terrain message value"); return value; }
    if (typeof value === "string") { charge(value.length * 2); return value; }
    if (typeof value !== "object" || ancestors.has(value)) throw new Error("Unsupported or cyclic terrain message");
    if (ArrayBuffer.isView(value)) {
      if (!(value.buffer instanceof ArrayBuffer)) throw new Error("Shared terrain buffers are unsupported");
      charge(value.byteLength);
      const buffer = new ArrayBuffer(value.byteLength);
      new Uint8Array(buffer).set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      transfer.push(buffer);
      if (value instanceof Uint8Array) return new Uint8Array(buffer);
      if (value instanceof Uint16Array) return new Uint16Array(buffer);
      if (value instanceof Uint32Array) return new Uint32Array(buffer);
      if (value instanceof Int8Array) return new Int8Array(buffer);
      if (value instanceof Float32Array) return new Float32Array(buffer);
      throw new Error("Unsupported terrain buffer type");
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (value.length > 65536) throw new Error("Terrain message array exceeds limit");
        return Array.from(value, item => copy(item, depth + 1));
      }
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Terrain messages require plain records");
      const keys = Object.keys(value);
      if (keys.length > 256) throw new Error("Terrain message record exceeds limit");
      const record: Record<string, unknown> = Object.create(null);
      for (const key of keys) {
        charge(key.length * 2);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) throw new Error("Terrain message accessors are unsupported");
        record[key] = copy(descriptor.value, depth + 1);
      }
      return record;
    } finally { ancestors.delete(value); }
  };
  return { value: copy(input, 0) as T, bytes, transfer };
};
