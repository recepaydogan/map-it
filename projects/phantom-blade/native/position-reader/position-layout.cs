using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace PhantomBladeCompanion
{
    internal static class PositionLayout
    {
        // The initialization path references the same name pool twice. The engine
        // path looks up two adjacent fields through the same global pointer.
        private static readonly Signature NamePool = new Signature(
            "48 8D 05 ? ? ? ? EB 13 48 8D 0D ? ? ? ? E8 ? ? ? ? C6 05 ? ? ? ? 01", 0, 9);
        private static readonly Signature GameEngine = new Signature(
            "48 8B 05 ? ? ? ? 48 8B 88 ? ? ? ? 48 85 C9 74 ? E8 ? ? ? ? 48 85 C0 74 ? " +
            "48 8B 05 ? ? ? ? 48 8B 88 ? ? ? ? 48 85 C9 74 ? E8 ? ? ? ? 48 85 C0 74 ? " +
            "48 8B 0D ? ? ? ? 48 8B 89 ? ? ? ? E8", 0, 29, 58);

        private sealed class Section
        {
            internal long Rva, Size, Raw, RawSize;
            internal uint Flags;
        }

        private sealed class Signature
        {
            private readonly int[] bytes, references;
            internal int Length { get { return bytes.Length; } }

            internal Signature(string pattern, params int[] references)
            {
                this.references = references;
                bytes = Array.ConvertAll(pattern.Split(' '), value =>
                    value == "?" ? -1 : int.Parse(value, NumberStyles.HexNumber, CultureInfo.InvariantCulture));
            }

            internal bool Collect(byte[] buffer, int length, int blockSize, long rva,
                List<Section> sections, int targetSize, ref int target)
            {
                int limit = Math.Min(blockSize, length - Length + 1);
                for (int at = 0; at < limit; at++)
                {
                    at = Array.IndexOf(buffer, (byte)bytes[0], at, limit - at);
                    if (at < 0) break;
                    int i = 1;
                    for (; i < bytes.Length; i++)
                        if (bytes[i] >= 0 && buffer[at + i] != bytes[i]) break;
                    if (i != bytes.Length) continue;
                    long address = rva + at + 7 + BitConverter.ToInt32(buffer, at + 3);
                    if (address <= 0 || address > int.MaxValue || address % 8 != 0
                        || !Array.TrueForAll(references, offset =>
                            rva + at + offset + 7 + BitConverter.ToInt32(buffer, at + offset + 3) == address))
                        continue;
                    if (!sections.Exists(section => (section.Flags & 0xa0000000) == 0x80000000 &&
                        address >= section.Rva && address - section.Rva <= section.Size - targetSize)) continue;
                    if (target != 0 && target != address) return false;
                    target = (int)address;
                }
                return true;
            }
        }

        internal static ReaderProfile Resolve(string file, uint expectedTimestamp, int expectedImageSize, Func<bool> cancelled)
        {
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (var input = new BinaryReader(stream))
            {
                if (stream.Length < 256 || input.ReadUInt16() != 0x5a4d) return null;
                stream.Position = 60;
                long pe = input.ReadUInt32();
                if (pe < 64 || pe > stream.Length - 136) return null;
                stream.Position = pe;
                if (input.ReadUInt32() != 0x4550 || input.ReadUInt16() != 0x8664) return null;
                int count = input.ReadUInt16();
                uint timestamp = input.ReadUInt32();
                stream.Position = pe + 20;
                int optionalSize = input.ReadUInt16();
                long optional = pe + 24;
                if (timestamp != expectedTimestamp || count < 1 || count > 96 || optionalSize < 112 ||
                    optional + optionalSize + count * 40L > stream.Length) return null;
                stream.Position = optional;
                if (input.ReadUInt16() != 0x20b) return null;
                stream.Position = optional + 56;
                long imageSize = input.ReadUInt32();
                if (imageSize != expectedImageSize || imageSize < 4096 || imageSize > 0x40000000) return null;
                var sections = new List<Section>();
                for (int i = 0; i < count; i++)
                {
                    stream.Position = optional + optionalSize + i * 40 + 8;
                    var section = new Section { Size = input.ReadUInt32(), Rva = input.ReadUInt32(),
                        RawSize = input.ReadUInt32(), Raw = input.ReadUInt32() };
                    stream.Position += 12;
                    section.Flags = input.ReadUInt32();
                    if (section.Rva > imageSize || section.Size > imageSize - section.Rva ||
                        section.Raw > stream.Length || section.RawSize > stream.Length - section.Raw) return null;
                    sections.Add(section);
                }

                const int blockSize = 65536;
                var buffer = new byte[blockSize + Math.Max(NamePool.Length, GameEngine.Length) - 1];
                int pool = 0, engine = 0;
                foreach (var section in sections)
                {
                    if ((section.Flags & 0x20000000) == 0) continue;
                    long size = Math.Min(section.Size, section.RawSize);
                    for (long cursor = 0; cursor < size; cursor += blockSize)
                    {
                        if (cancelled()) return null;
                        stream.Position = section.Raw + cursor;
                        int length = (int)Math.Min(buffer.Length, size - cursor);
                        int read = 0;
                        while (read < length)
                        {
                            int received = input.Read(buffer, read, length - read);
                            if (received == 0) return null;
                            read += received;
                        }
                        long rva = section.Rva + cursor;
                        if (!NamePool.Collect(buffer, length, blockSize, rva, sections, 16 + 8192 * 8, ref pool) ||
                            !GameEngine.Collect(buffer, length, blockSize, rva, sections, 8, ref engine)) return null;
                    }
                }
                if (pool == 0 || engine == 0 || pool == engine) return null;
                // These fields use the existing PBZ layout. The runtime reader
                // still validates world ownership, map collections and projection.
                return new ReaderProfile { PeTimestamp = timestamp, NamePoolRva = pool, GameEngineRva = engine,
                    WorldSubsystemsOffset = 0x9e0, MapEntriesOffset = 0x1b8, MapIdOffset = 0x2a8, MapLayerOffset = 0x2b0 };
            }
        }
    }
}
