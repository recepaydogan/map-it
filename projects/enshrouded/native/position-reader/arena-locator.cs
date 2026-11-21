using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;

namespace EnshroudedCompanion
{
    internal sealed class ArenaLocator
    {
        private readonly MemoryReader reader;
        private readonly RootLayout layout;
        private readonly long root;
        private readonly string cacheFile;
        private readonly byte[] buffer = new byte[4096];
        private readonly List<Candidate> candidates = new List<Candidate>();
        private long cursor, retryAt, cachedField = -1;
        private int scanIndex, lastCandidateCount;
        private bool scanInitialized, nearbyPhase;
        private Candidate scanMatch;
        private long scanMatchOffset = -1;
        // Legacy reader hint, validated against every discovered allocation.
        // It only avoids a cold scan; it never admits an executable or a pair.
        private const long BootstrapPlayerOffset = 1046736576;
        internal long PlayerOffset = -1, ScanBytes;
        internal long Address, Size, Field = -1;
        internal string Reason = "finding-arena";
        internal int CandidateCount { get { return Math.Max(candidates.Count, lastCandidateCount); } }
        private sealed class Candidate { internal long Field, Address, Size, Scanned, ScanEnd; }

        internal ArenaLocator(MemoryReader memory, long image, RootLayout profile, string directory)
        {
            reader = memory; layout = profile; root = image + profile.RootRva;
            cacheFile = directory == null ? null : Path.Combine(directory, "arena-field-v1.txt");
            RootLayout.TryReadOffset(cacheFile, out cachedField);
        }
        internal bool Step(long elapsed, long playerOffset)
        {
            if (Address != 0) return true;
            if (elapsed < retryAt) return false;
            if (cursor == 0 && cachedField >= 0 && cachedField <= layout.RootSize - 16)
            {
                Candidate saved = ReadCandidate(cachedField);
                if (saved != null && PairAt(saved, playerOffset)) { Select(saved); Reason = "validated-arena-cache"; return true; }
            }
            long start = Stopwatch.GetTimestamp();
            int blocks = 0;
            while (cursor < layout.RootSize && blocks++ < 16)
            {
                int count = (int)Math.Min(4096, layout.RootSize - cursor);
                if (reader.Resident(root + cursor, count) && reader.Read(root + cursor, buffer, count))
                {
                    for (int at = 0; at <= count - 16; at += 8)
                    {
                        long address = BitConverter.ToInt64(buffer, at), size = BitConverter.ToInt64(buffer, at + 8);
                        if (!reader.PrivateArena(address, size)) continue;
                        AddCandidate(new Candidate { Field = cursor + at, Address = address, Size = size });
                        if (candidates.Count > 64) { Reason = "ambiguous-arena"; Restart(elapsed); return false; }
                    }
                }
                // Overlap the last pointer-sized word so a descriptor on a page boundary is included.
                if (count == 4096 && cursor + count < layout.RootSize)
                {
                    Candidate boundary = ReadCandidate(cursor + count - 8);
                    if (boundary != null) AddCandidate(boundary);
                }
                cursor += count;
                if ((Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency >= 1) break;
            }
            if (cursor < layout.RootSize) return false;
            Candidate selected = null;
            foreach (Candidate candidate in candidates)
            {
                if (!PairAt(candidate, playerOffset)) continue;
                if (selected != null && selected.Address != candidate.Address) { Reason = "ambiguous-arena"; Restart(elapsed); return false; }
                selected = candidate;
            }
            if (selected == null && playerOffset != BootstrapPlayerOffset)
            {
                foreach (Candidate candidate in candidates)
                {
                    if (!PairAt(candidate, BootstrapPlayerOffset)) continue;
                    if (selected != null && selected.Address != candidate.Address)
                    { Reason = "ambiguous-arena"; Restart(elapsed); return false; }
                    selected = candidate;
                }
                if (selected != null) PlayerOffset = BootstrapPlayerOffset;
            }
            if (selected == null && candidates.Count == 1) selected = candidates[0];
            if (selected != null) { Select(selected); Reason = "arena-structure"; return true; }
            if (candidates.Count > 1) return SearchPlayer(elapsed, playerOffset);
            Reason = "waiting-for-arena";
            Restart(elapsed); return false;
        }
        private void AddCandidate(Candidate candidate)
        {
            foreach (Candidate known in candidates)
                if (known.Address == candidate.Address && known.Size == candidate.Size) return;
            candidates.Add(candidate);
        }
        // A first install has no player hint. Search each validated allocation
        // with the same bounded resident-page reads used by normal discovery.
        private bool SearchPlayer(long elapsed, long playerOffset)
        {
            if (!scanInitialized)
            {
                scanInitialized = true; nearbyPhase = true;
                long hint = playerOffset >= 0 && playerOffset < 0x100000000L ? playerOffset : BootstrapPlayerOffset;
                long center = hint & ~65535L;
                foreach (Candidate candidate in candidates)
                {
                    candidate.Scanned = Math.Max(0, center - 8L * 1024 * 1024);
                    candidate.ScanEnd = Math.Min(candidate.Size, center + 8L * 1024 * 1024 + 65536);
                }
            }
            Reason = nearbyPhase ? "searching-nearby-arenas" : "searching-player-arenas";
            long start = Stopwatch.GetTimestamp();
            int blocks = 0;
            while (scanIndex < candidates.Count && blocks++ < 512)
            {
                Candidate candidate = candidates[scanIndex];
                if (candidate.Scanned >= candidate.ScanEnd) { scanIndex++; continue; }
                long block = candidate.Address + candidate.Scanned;
                candidate.Scanned += 65536;
                int mask = reader.ResidentMask(block);
                for (int page = 0; page < 16;)
                {
                    long upper = candidate.Address + candidate.Size;
                    if ((mask & (1 << page)) == 0 || block + page * 4096 >= upper) { page++; continue; }
                    int first = page++;
                    while (page < 16 && (mask & (1 << page)) != 0 && block + page * 4096 < upper) page++;
                    int size = (page - first) * 4096;
                    long address = block + first * 4096;
                    if (!reader.Read(address, reader.ScanBuffer, size)) continue;
                    ScanBytes += size;
                    for (int at = 0; at < size; at += 4)
                    {
                        if (reader.ScanBuffer[at] != 0x0a || BitConverter.ToInt32(reader.ScanBuffer, at) != 0x3c23d70a
                            || (at + 4 < size && BitConverter.ToInt32(reader.ScanBuffer, at + 4) != 0x461c4000)) continue;
                        long offset = address + at - ((at & 7) == 0 ? 64 : 276) - candidate.Address;
                        if (!PairAt(candidate, offset)) continue;
                        if (scanMatch != null && scanMatch.Address != candidate.Address)
                        { Reason = "ambiguous-arena"; Restart(elapsed); return false; }
                        scanMatch = candidate; scanMatchOffset = offset;
                    }
                }
                if ((Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency >= 1) break;
            }
            if (scanIndex < candidates.Count) return false;
            if (scanMatch != null && PairAt(scanMatch, scanMatchOffset))
            {
                Select(scanMatch);
                if (Validate()) { PlayerOffset = scanMatchOffset; Reason = "validated-arena-scan"; return true; }
                Address = 0; Size = 0; Field = -1;
            }
            if (nearbyPhase)
            {
                nearbyPhase = false; scanIndex = 0; scanMatch = null; scanMatchOffset = -1;
                foreach (Candidate candidate in candidates) { candidate.Scanned = 0; candidate.ScanEnd = candidate.Size; }
                return false;
            }
            Reason = "waiting-for-player"; Restart(elapsed); return false;
        }
        private void Restart(long elapsed)
        {
            lastCandidateCount = candidates.Count;
            cursor = 0; candidates.Clear(); retryAt = elapsed + 2000;
            scanIndex = 0; scanMatch = null; scanMatchOffset = -1;
            scanInitialized = false; nearbyPhase = false;
        }
        internal void Reset()
        {
            Address = 0; Size = 0; Field = -1; PlayerOffset = -1;
            Restart(-2000); lastCandidateCount = 0; Reason = "finding-arena";
        }
        private Candidate ReadCandidate(long field)
        {
            if (field < 0 || field > layout.RootSize - 16 || !reader.Resident(root + field, 16) || !reader.Read(root + field, buffer, 16)) return null;
            long address = BitConverter.ToInt64(buffer, 0), size = BitConverter.ToInt64(buffer, 8);
            return reader.PrivateArena(address, size) ? new Candidate { Field = field, Address = address, Size = size } : null;
        }
        private bool PairAt(Candidate candidate, long offset)
        {
            Position position;
            return offset >= 0 && offset <= candidate.Size - 284 && reader.ReadPlayerPair(candidate.Address + offset, out position);
        }
        private void Select(Candidate candidate) { Field = candidate.Field; Address = candidate.Address; Size = candidate.Size; }
        internal bool Validate()
        {
            Candidate current = ReadCandidate(Field);
            return current != null && current.Address == Address && current.Size == Size;
        }
        internal void Confirm()
        {
            if (Field < 0 || !Validate()) return;
            RootLayout.WriteOffset(cacheFile, Field); cachedField = Field;
        }
    }
}
