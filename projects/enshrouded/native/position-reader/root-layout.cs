using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Threading;

namespace EnshroudedCompanion
{
    // An executable fingerprint is a cache key only, never an allowlist.
    // RIP-relative operands relocate the root when the linker moves code/data.
    internal sealed class RootLayout
    {
        internal long RootRva, RootSize, SignatureRva;
        internal string Fingerprint, Source;
        private const int SignatureLength = 32;
        private static readonly int[] Positions = { 0, 1, 2, 3, 8, 9, 10, 15, 20, 21, 22, 27 };
        private static readonly byte[] Expected = { 0x33, 0xd2, 0x41, 0xb8, 0x48, 0x8d, 0x0d, 0xe8, 0x48, 0x8d, 0x0d, 0xe8 };
        private sealed class Section
        {
            internal long Rva, Size, Raw, RawSize;
            internal uint Flags;
            internal bool Contains(long rva, long length)
            { return rva >= Rva && length > 0 && length <= Size && rva - Rva <= Size - length; }
        }

        internal static RootLayout Resolve(string file, string cacheDirectory, Func<bool> cancelled)
        {
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 65536))
            using (var input = new BinaryReader(stream))
            {
                string fingerprint;
                using (var hash = SHA256.Create())
                    fingerprint = BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                if (cancelled()) return null;
                stream.Position = 0;
                if (stream.Length < 256 || input.ReadUInt16() != 0x5a4d) return null;
                stream.Position = 0x3c;
                long pe = input.ReadUInt32();
                if (pe < 64 || pe > stream.Length - 264) return null;
                stream.Position = pe;
                if (input.ReadUInt32() != 0x4550 || input.ReadUInt16() != 0x8664) return null;
                int count = input.ReadUInt16();
                stream.Position = pe + 20;
                int optionalSize = input.ReadUInt16();
                if (count < 1 || count > 96 || optionalSize < 112 || pe + 24 + optionalSize + count * 40L > stream.Length) return null;
                stream.Position = pe + 24;
                if (input.ReadUInt16() != 0x20b) return null;
                stream.Position = pe + 24 + 56;
                long imageSize = input.ReadUInt32();
                if (imageSize < 4096 || imageSize > 0x40000000) return null;
                var sections = new List<Section>();
                for (int i = 0; i < count; i++)
                {
                    stream.Position = pe + 24 + optionalSize + i * 40 + 8;
                    var section = new Section { Size = input.ReadUInt32(), Rva = input.ReadUInt32(), RawSize = input.ReadUInt32(), Raw = input.ReadUInt32() };
                    stream.Position += 12;
                    section.Flags = input.ReadUInt32();
                    if (section.Rva > imageSize || section.Size > imageSize - section.Rva
                        || section.Raw > stream.Length || section.RawSize > stream.Length - section.Raw) return null;
                    sections.Add(section);
                }
                string cache = cacheDirectory == null ? null : Path.Combine(cacheDirectory, "root-v1-" + fingerprint + ".txt");
                long cached;
                if (TryReadOffset(cache, out cached))
                {
                    byte[] bytes = ReadCode(input, sections, cached, SignatureLength);
                    RootLayout saved = bytes == null ? null : Match(bytes, 0, cached, sections);
                    if (saved != null)
                    {
                        saved.Fingerprint = fingerprint; saved.Source = "signature-cache";
                        return saved;
                    }
                }
                RootLayout selected = null;
                var buffer = new byte[65536 + SignatureLength - 1];
                foreach (Section section in sections)
                {
                    if ((section.Flags & 0x20000000) == 0) continue;
                    long codeSize = Math.Min(section.RawSize, section.Size);
                    for (long cursor = 0; cursor < codeSize; cursor += 65536)
                    {
                        if (cancelled()) return null;
                        stream.Position = section.Raw + cursor;
                        int length = (int)Math.Min(buffer.Length, codeSize - cursor);
                        if (input.Read(buffer, 0, length) != length) return null;
                        for (int at = 0; at < Math.Min(65536, length - SignatureLength + 1); at++)
                        {
                            if (buffer[at] != 0x33) continue;
                            RootLayout match = Match(buffer, at, section.Rva + cursor + at, sections);
                            if (match == null) continue;
                            // Refuse competing roots instead of selecting the first plausible one.
                            if (selected != null && (selected.RootRva != match.RootRva || selected.RootSize != match.RootSize)) return null;
                            selected = match;
                        }
                        // File scanning is a one-time background operation, not a game-RAM sweep.
                        Thread.Sleep(1);
                    }
                }
                if (selected == null) return null;
                selected.Fingerprint = fingerprint; selected.Source = "signature-scan";
                WriteOffset(cache, selected.SignatureRva);
                return selected;
            }
        }

        private static RootLayout Match(byte[] bytes, int at, long rva, List<Section> sections)
        {
            // xor edx,edx; mov r8d,size; lea rcx,[rip+root]; call zero;
            // lea rcx,[rip+same-root]; call constructor. Only displacements vary.
            if (at < 0 || at > bytes.Length - SignatureLength) return null;
            for (int i = 0; i < Positions.Length; i++) if (bytes[at + Positions[i]] != Expected[i]) return null;
            long size = BitConverter.ToUInt32(bytes, at + 4);
            long root = rva + 15 + BitConverter.ToInt32(bytes, at + 11);
            long repeated = rva + 27 + BitConverter.ToInt32(bytes, at + 23);
            long constructor = rva + 32 + BitConverter.ToInt32(bytes, at + 28);
            if (root != repeated || (root & 7) != 0 || size < 4096 || size > 1024 * 1024) return null;
            bool writableRoot = false, executableConstructor = false;
            foreach (Section section in sections)
            {
                if ((section.Flags & 0xa0000000) == 0x80000000 && section.Contains(root, size)) writableRoot = true;
                if ((section.Flags & 0x20000000) != 0 && section.Contains(constructor, 1)) executableConstructor = true;
            }
            return writableRoot && executableConstructor ? new RootLayout { RootRva = root, RootSize = size, SignatureRva = rva } : null;
        }

        private static byte[] ReadCode(BinaryReader input, List<Section> sections, long rva, int size)
        {
            foreach (Section section in sections)
            {
                if ((section.Flags & 0x20000000) == 0 || !section.Contains(rva, size) || rva - section.Rva + size > section.RawSize) continue;
                input.BaseStream.Position = section.Raw + rva - section.Rva;
                byte[] bytes = input.ReadBytes(size);
                return bytes.Length == size ? bytes : null;
            }
            return null;
        }

        internal static bool TryReadOffset(string file, out long value)
        {
            value = -1;
            try
            {
                long parsed;
                if (file == null || !File.Exists(file) || new FileInfo(file).Length >= 32
                    || !Int64.TryParse(File.ReadAllText(file), out parsed) || parsed < 0) return false;
                value = parsed;
                return true;
            }
            catch (IOException) { return false; }
            catch (UnauthorizedAccessException) { return false; }
        }
        internal static void WriteOffset(string file, long value)
        {
            if (file == null) return;
            try { Directory.CreateDirectory(Path.GetDirectoryName(file)); File.WriteAllText(file, value.ToString(System.Globalization.CultureInfo.InvariantCulture)); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }
}
