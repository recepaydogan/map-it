import {
  NbtByte, NbtShort, NbtInt, NbtLong, NbtFloat, NbtDouble, NbtByteArray, NbtString,
  NbtList, NbtCompound, NbtIntArray, NbtLongArray,
} from "deepslate/nbt";
import type { NbtTag } from "deepslate/nbt";
import { BinaryCursor } from "./binary-cursor.ts";
import { decodeBinaryString } from "./decode-binary-string.ts";
import type { BinaryStringEncoding } from "./decode-binary-string.ts";

export interface NbtReadOptions {
  littleEndian: boolean;
  stringEncoding: BinaryStringEncoding;
  maxBytes?: number;
  maxDepth?: number;
  maxElements?: number;
  maxStringBytes?: number;
  /** Only embedded documents may leave a suffix for the caller to parse. */
  allowTrailing?: boolean;
  signal?: AbortSignal;
}

export const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Operation aborted", "AbortError");
};

/**
 * Parse bounded tag data into library value types without invoking its unbounded reader.
 * Compression, file headers and version validation belong to the source adapter.
 */
export const readBoundedNbt = (bytes: Uint8Array, options: NbtReadOptions): {
  name: string; root: NbtCompound; bytesRead: number;
} => {
  assertNotAborted(options.signal);
  const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
  const maxDepth = options.maxDepth ?? 64;
  const maxElements = options.maxElements ?? 262144;
  const maxStringBytes = options.maxStringBytes ?? 2 * 1024 * 1024;
  if (![maxBytes, maxDepth, maxElements, maxStringBytes].every(value => Number.isSafeInteger(value) && value > 0) ||
    maxDepth > 128 || typeof options.littleEndian !== "boolean" ||
    !["utf-8", "modified-utf-8"].includes(options.stringEncoding)) throw new Error("Invalid tag read limits or encoding");
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes) throw new Error("Tag payload exceeds byte limit");
  const cursor = new BinaryCursor(bytes, options.littleEndian);
  let elements = 0, stringBytes = 0;
  const charge = (count: number) => {
    assertNotAborted(options.signal);
    if (!Number.isSafeInteger(count) || count < 0 || count > maxElements - elements)
      throw new Error("Tag payload exceeds element limit");
    elements += count;
  };
  const text = (): string => {
    const length = cursor.unsignedShort();
    if (length > maxStringBytes - stringBytes) throw new Error("Tag payload exceeds string limit");
    stringBytes += length;
    return decodeBinaryString(cursor.slice(length), options.stringEncoding);
  };
  const arrayLength = (width: number): number => {
    const length = cursor.int();
    charge(length);
    // Validate storage before allocating an array or looping over its claimed length.
    if (length > Math.floor((bytes.length - cursor.offset) / width)) throw new Error("Truncated tag array");
    return length;
  };
  const payload = (type: number, depth: number): NbtTag => {
    charge(1);
    if (depth > maxDepth) throw new Error("Tag payload exceeds nesting limit");
    switch (type) {
      case 1: return new NbtByte(cursor.signedByte());
      case 2: return new NbtShort(cursor.short());
      case 3: return new NbtInt(cursor.int());
      case 4: return new NbtLong(cursor.long());
      case 5: return new NbtFloat(cursor.float());
      case 6: return new NbtDouble(cursor.double());
      case 7: {
        const data = cursor.slice(arrayLength(1));
        return new NbtByteArray(new Int8Array(data.buffer, data.byteOffset, data.byteLength));
      }
      case 8: return new NbtString(text());
      case 9: {
        const childType = cursor.byte(), length = cursor.int();
        if (childType > 12 || childType === 0 && length !== 0 || length < 0 || length > maxElements - elements)
          throw new Error("Invalid tag list type or length");
        const items: NbtTag[] = [];
        for (let index = 0; index < length; index++) items.push(payload(childType, depth + 1));
        return new NbtList(items, childType);
      }
      case 10: {
        const entries = new Map<string, NbtTag>();
        for (;;) {
          const childType = cursor.byte();
          if (childType === 0) break;
          if (childType > 12) throw new Error("Invalid compound tag type");
          const key = text();
          if (entries.has(key)) throw new Error("Duplicate compound key");
          entries.set(key, payload(childType, depth + 1));
        }
        return new NbtCompound(entries);
      }
      case 11: {
        const length = arrayLength(4);
        const values = new Int32Array(length);
        for (let index = 0; index < length; index++) values[index] = cursor.int();
        return new NbtIntArray(values);
      }
      case 12: {
        const length = arrayLength(8);
        const values: bigint[] = [];
        for (let index = 0; index < length; index++) values.push(cursor.long());
        return new NbtLongArray(values);
      }
      default: throw new Error("Unsupported tag type");
    }
  };
  if (cursor.byte() !== 10) throw new Error("Expected a named compound root");
  const name = text();
  const root = payload(10, 0) as NbtCompound;
  if (!options.allowTrailing && cursor.offset !== bytes.length) throw new Error("Trailing bytes after tag document");
  return { name, root, bytesRead: cursor.offset };
};
