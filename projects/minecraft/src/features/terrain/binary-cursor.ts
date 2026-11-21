/** A cursor never reads beyond the supplied view, even when its backing buffer is larger. */
export class BinaryCursor {
  readonly bytes: Uint8Array;
  readonly littleEndian: boolean;
  private readonly view: DataView;
  offset = 0;

  constructor(bytes: Uint8Array, littleEndian: boolean) {
    this.bytes = bytes;
    this.littleEndian = littleEndian;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  take(length: number): number {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.bytes.length - this.offset)
      throw new Error("Truncated binary payload");
    const start = this.offset;
    this.offset += length;
    return start;
  }

  byte(): number { return this.view.getUint8(this.take(1)); }
  signedByte(): number { return this.view.getInt8(this.take(1)); }
  short(): number { return this.view.getInt16(this.take(2), this.littleEndian); }
  unsignedShort(): number { return this.view.getUint16(this.take(2), this.littleEndian); }
  int(): number { return this.view.getInt32(this.take(4), this.littleEndian); }
  long(): bigint { return this.view.getBigInt64(this.take(8), this.littleEndian); }
  float(): number { return this.view.getFloat32(this.take(4), this.littleEndian); }
  double(): number { return this.view.getFloat64(this.take(8), this.littleEndian); }
  slice(length: number): Uint8Array {
    const start = this.take(length);
    return this.bytes.subarray(start, start + length);
  }
}
