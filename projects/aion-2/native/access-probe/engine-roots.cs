using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;

namespace OverwolfAccessProbe
{
    // Discovers ordinary, unpacked UE name/object tables. Unsupported or protected
    // layouts are reported, never guessed or decrypted. All addresses are per-process.
    internal sealed class EngineRoots
    {
        private readonly ProcessMemory memory;
        private long cursor, blockAddress;
        private byte[] block;
        private int blockOffset;
        private bool readOnlyPass;
        private DateTime retryAt;
        private readonly Dictionary<uint, string> names = new Dictionary<uint, string>();
        public long NameBlocks { get; private set; }
        public long Objects { get; private set; }
        public int ItemSize { get; private set; }
        public int NameShift { get; private set; }
        public int ObjectCount { get; private set; }
        public long ScannedBytes { get; private set; }
        public int Passes { get; private set; }
        public string Reason { get; private set; }
        public bool Ready { get { return NameBlocks != 0 && Objects != 0; } }
        public EngineRoots(ProcessMemory source) { memory = source; cursor = source.ModuleBase; Reason = "finding-engine-tables"; }

        public bool Restore(long nameRva, long objectsRva)
        {
            long length = memory.ModuleEnd - memory.ModuleBase;
            if (nameRva < 8 || nameRva > length - 32 || (nameRva & 7) != 0
                || objectsRva < 0 || objectsRva > length - 32 || (objectsRva & 7) != 0) return false;
            // Use the same structural validators as discovery, including index checks.
            long namesAddress = memory.ModuleBase + nameRva - 8, objectsAddress = memory.ModuleBase + objectsRva;
            byte[] nameData = memory.Read(namesAddress, 32), objectData = memory.Read(objectsAddress, 32);
            if (nameData != null && objectData != null) {
                TryNames(namesAddress, nameData, 0); TryObjects(objectsAddress, objectData, 0);
                if (Ready) { Reason = "cached-tables-validated"; return true; }
            }
            NameBlocks = 0; Objects = 0; ItemSize = 0; ObjectCount = 0; names.Clear(); return false;
        }

        public void Step(DateTime now)
        {
            if (Ready || now < retryAt) return;
            var clock = Stopwatch.StartNew(); int blocks = 0, queries = 0;
            while (clock.ElapsedMilliseconds < 6 && blocks < 8 && queries++ < 128) {
                if (block == null) {
                    if (cursor >= memory.ModuleEnd) {
                        cursor = memory.ModuleBase;
                        if (readOnlyPass) { Passes++; retryAt = now.AddSeconds(15); Reason = "engine-layout-not-found"; readOnlyPass = false; return; }
                        readOnlyPass = true;
                    }
                    MemoryRegion region;
                    if (!memory.Query(cursor, out region) || region.End <= cursor) { Reason = "module-query-failed"; retryAt = now.AddSeconds(5); return; }
                    long end = Math.Min(region.End, memory.ModuleEnd);
                    if (!region.Readable || region.Writable == readOnlyPass) { cursor = end; continue; }
                    blockAddress = cursor;
                    block = memory.Read(cursor, (int)Math.Min(32768 + 32, end - cursor));
                    if (block == null) { cursor += Math.Min(32768, end - cursor); continue; }
                    blockOffset = 0; blocks++;
                }
                for (; blockOffset + 32 <= block.Length; blockOffset += 8) {
                    // Retain the offset when the read budget interrupts candidate validation.
                    if (NameBlocks == 0) TryNames(blockAddress + blockOffset, block, blockOffset);
                    if (Objects == 0) TryObjects(blockAddress + blockOffset, block, blockOffset);
                    if (Ready) { block = null; Reason = "engine-tables-found"; return; }
                    if ((blockOffset & 1023) == 0 && clock.ElapsedMilliseconds >= 6) return;
                }
                long advance = Math.Min(32768, block.Length);
                cursor = blockAddress + advance; ScannedBytes += advance; block = null;
            }
        }

        private void TryNames(long address, byte[] data, int offset)
        {
            // FNameEntryAllocator's lock precedes CurrentBlock/CurrentByteCursor.
            // Search the counters rather than depending on the lock's size.
            int current = BitConverter.ToInt32(data, offset), used = BitConverter.ToInt32(data, offset + 4);
            long first = BitConverter.ToInt64(data, offset + 8);
            if (current < 0 || current >= 8192 || used < 8 || used > 131072 || !ProcessMemory.Pointer(first)) return;
            byte[] entries = memory.Read(first, 1024);
            if (entries == null) return;
            foreach (int shift in new[] { 6, 1 }) {
                int pos = 0; var known = new HashSet<string>();
                for (int i = 0; i < 32 && pos + 2 < entries.Length; i++) {
                    ushort header = BitConverter.ToUInt16(entries, pos); int length = header >> shift;
                    bool wide = (header & 1) != 0; int bytes = length * (wide ? 2 : 1);
                    if (length < 1 || length > 128 || pos + 2 + bytes > entries.Length) break;
                    string name = wide ? Encoding.Unicode.GetString(entries, pos + 2, bytes) : Encoding.ASCII.GetString(entries, pos + 2, bytes);
                    if (i == 0 && name != "None") break;
                    known.Add(name); pos = (pos + 2 + bytes + 1) & ~1;
                }
                if (known.Contains("None") && known.Contains("ByteProperty") && known.Contains("IntProperty") && known.Contains("ObjectProperty")) {
                    NameBlocks = address + 8; NameShift = shift; return;
                }
            }
        }

        private void TryObjects(long address, byte[] data, int offset)
        {
            long chunks = BitConverter.ToInt64(data, offset);
            int max = BitConverter.ToInt32(data, offset + 16), count = BitConverter.ToInt32(data, offset + 20);
            int maxChunks = BitConverter.ToInt32(data, offset + 24), numChunks = BitConverter.ToInt32(data, offset + 28);
            if (!ProcessMemory.Pointer(chunks) || count < 32 || count > 8388608 || max < count || max > 8388608
                || maxChunks < 1 || maxChunks > 128 || numChunks < 1 || numChunks > maxChunks
                || max != maxChunks * 65536 || count > numChunks * 65536) return;
            long first = memory.PointerAt(chunks);
            if (!ProcessMemory.Pointer(first)) return;
            byte[] items = memory.Read(first, 32 * 32);
            if (items == null) return;
            foreach (int stride in new[] { 24, 32 }) {
                int valid = 0;
                for (int i = 0; i < 16; i++) {
                    long pointer = BitConverter.ToInt64(items, i * stride);
                    if (pointer == 0) continue;
                    byte[] header = memory.Read(pointer, 40);
                    if (!Header(header) || BitConverter.ToInt32(header, 12) != i) { valid = 0; break; }
                    byte[] cls = memory.Read(BitConverter.ToInt64(header, 16), 40);
                    if (!Header(cls)) { valid = 0; break; }
                    valid++;
                }
                if (valid >= 4) { Objects = address; ItemSize = stride; ObjectCount = count; return; }
            }
        }

        public bool Header(byte[] data)
        {
            if (data == null || data.Length < 40) return false;
            long vtable = BitConverter.ToInt64(data, 0);
            return vtable >= memory.ModuleBase && vtable < memory.ModuleEnd && (vtable & 7) == 0
                && ProcessMemory.Pointer(BitConverter.ToInt64(data, 16)) && BitConverter.ToInt32(data, 12) >= 0;
        }
        public bool RefreshCount()
        {
            byte[] data = memory.Read(Objects, 32);
            if (data == null) return false;
            int count = BitConverter.ToInt32(data, 20), max = BitConverter.ToInt32(data, 16);
            if (count < 32 || count > max || max > 8388608) return false;
            ObjectCount = count; return true;
        }
        public long ItemAddress(int index)
        {
            if (index < 0 || index >= ObjectCount) return 0;
            long chunks = memory.PointerAt(Objects), chunk = memory.PointerAt(chunks + (index / 65536) * 8L);
            return ProcessMemory.Pointer(chunk) ? chunk + (index % 65536) * (long)ItemSize : 0;
        }
        public long ObjectAt(int index) { long item = ItemAddress(index); return item == 0 ? 0 : memory.PointerAt(item); }
        public string Name(uint index)
        {
            string cached; if (names.TryGetValue(index, out cached)) return cached;
            int blockIndex = (int)(index >> 16);
            if (NameBlocks == 0 || blockIndex >= 8192) return null;
            byte[] counters = memory.Read(NameBlocks - 8, 8);
            if (counters == null || blockIndex > BitConverter.ToInt32(counters, 0)) return null;
            long first = memory.PointerAt(NameBlocks + blockIndex * 8L);
            if (!ProcessMemory.Pointer(first)) return null;
            long entry = first + (index & 65535) * 2L;
            byte[] prefix = memory.Read(entry, 2); if (prefix == null) return null;
            ushort header = BitConverter.ToUInt16(prefix, 0); int length = header >> NameShift;
            if (length < 1 || length > 128) return null;
            bool wide = (header & 1) != 0;
            byte[] value = memory.Read(entry + 2, length * (wide ? 2 : 1)); if (value == null) return null;
            string name = wide ? Encoding.Unicode.GetString(value) : Encoding.ASCII.GetString(value);
            foreach (char character in name) if (character < 32 || character > 126) return null;
            if (names.Count < 4096) names[index] = name;
            return name;
        }
        public string ObjectName(long pointer)
        {
            byte[] data = memory.Read(pointer, 40);
            return Header(data) && BitConverter.ToUInt32(data, 28) == 0 ? Name(BitConverter.ToUInt32(data, 24)) : null;
        }
    }
}
