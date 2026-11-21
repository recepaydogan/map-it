using System;
using System.IO;
using System.Collections.Generic;
using EnshroudedCompanion;

internal static class PositionReaderTests
{
    private static void Put(byte[] data, int at, byte[] value) { Buffer.BlockCopy(value, 0, data, at, value.Length); }
    private static byte[] Pair()
    {
        var data = new byte[284];
        foreach (int offset in new int[] { 0, 224 })
        {
            Put(data, offset, BitConverter.GetBytes((long)(3694.25 * 4294967296.0)));
            Put(data, offset+8, BitConverter.GetBytes((long)(893.5 * 4294967296.0)));
            Put(data, offset+16, BitConverter.GetBytes((long)(1280.75 * 4294967296.0)));
            Put(data, offset+36, BitConverter.GetBytes(1f));
        }
        for (int i=40; i<52; i+=4) Put(data, i, BitConverter.GetBytes(1f));
        Put(data, 264, BitConverter.GetBytes(1.5f));
        Put(data, 268, BitConverter.GetBytes(1.1f));
        Put(data, 272, BitConverter.GetBytes(1.6f));
        Put(data, 276, BitConverter.GetBytes(.01f));
        Put(data, 280, BitConverter.GetBytes(10000f));
        return data;
    }
    private static void Assert(bool ok, string message) { if (!ok) throw new Exception(message); }
    private static void Main()
    {
        TestRelocation();
        TestArena();
        TestCameraTarget();
        Position value;
        Assert(MemoryReader.DecodePair(Pair(), out value), "Valid pair rejected");
        Assert(value.X==3694.25 && value.Y==893.5 && value.Z==1280.75 && value.Dx==0 && value.Dz==1,
            "Fixed-point coordinates or quaternion heading decoded incorrectly");
        var data=Pair(); Put(data, 24, BitConverter.GetBytes(Single.NaN));
        Assert(!MemoryReader.DecodePair(data, out value), "NaN quaternion accepted");
        data=Pair(); data[100]=1;
        Assert(!MemoryReader.DecodePair(data, out value), "Unrelated component layout accepted");
        data=Pair(); Put(data, 268, BitConverter.GetBytes(Single.NaN));
        Assert(!MemoryReader.DecodePair(data, out value), "NaN camera lens accepted");
        data=Pair(); Put(data, 224, BitConverter.GetBytes((long)(4000 * 4294967296.0)));
        Assert(!MemoryReader.DecodePair(data, out value), "Distant camera accepted as player pair");
        Assert(!MemoryReader.DecodePair(new byte[20], out value), "Truncated pair accepted");
        Console.WriteLine("Passed: fixed-point/heading decoding, NaN quaternion, layout, NaN lens, distant camera, truncated read.");
    }

    private static void TestCameraTarget()
    {
        var data = new byte[284];
        Buffer.BlockCopy(Pair(), 0, data, 0, 52);
        Buffer.BlockCopy(data, 0, data, 136, 24);
        foreach (int at in new int[] { 128, 160, 176 }) Put(data, at, BitConverter.GetBytes(1L));
        foreach (int at in new int[] { 168, 184, 192, 216, 224, 232, 240 }) Put(data, at, BitConverter.GetBytes(0x30000010000L));
        Put(data, 60, BitConverter.GetBytes(1.6f)); Put(data, 64, BitConverter.GetBytes(.01f));
        Put(data, 68, BitConverter.GetBytes(10000f)); Put(data, 72, BitConverter.GetBytes(1.1f));
        Buffer.BlockCopy(data, 60, data, 260, 16);
        Position value;
        Assert(MemoryReader.DecodeCameraTarget(data, out value) && value.X == 3694.25, "Camera target rejected");
        Put(data, 0, BitConverter.GetBytes((long)(3697.25 * 4294967296.0)));
        Assert(MemoryReader.DecodeCameraTarget(data, out value) && value.X == 3694.25 && value.Dx == 0 && value.Dz == 1,
            "Camera movement leaked into target coordinates");
        Put(data, 28, BitConverter.GetBytes((float)Math.Sqrt(.5)));
        Put(data, 36, BitConverter.GetBytes((float)Math.Sqrt(.5)));
        Assert(MemoryReader.DecodeCameraTarget(data, out value) && value.X == 3694.25 && Math.Abs(value.Dx - 1) < .00001 && Math.Abs(value.Dz) < .00001,
            "Camera-only rotation failed to change facing independently of the target position");
        Put(data, 128, BitConverter.GetBytes(0L));
        Assert(!MemoryReader.DecodeCameraTarget(data, out value), "Inactive camera target accepted");
        Put(data, 128, BitConverter.GetBytes(1L)); Put(data, 260, BitConverter.GetBytes(2f));
        Assert(!MemoryReader.DecodeCameraTarget(data, out value), "Inconsistent camera lens accepted");
        Console.WriteLine("Passed: camera target position, independent camera translation/rotation, inactive target and lens rejection.");
    }

    private static void Signature(byte[] bytes, int at, int root)
    {
        byte[] code = { 0x33,0xd2,0x41,0xb8,0,0x50,0,0,0x48,0x8d,0x0d,0,0,0,0,0xe8,0,0,0,0,0x48,0x8d,0x0d,0,0,0,0,0xe8,0,0,0,0 };
        int rva = 0x1000 + at - 0x400;
        Put(code, 11, BitConverter.GetBytes(root - (rva + 15)));
        Put(code, 23, BitConverter.GetBytes(root - (rva + 27)));
        Put(code, 28, BitConverter.GetBytes(0x1100 - (rva + 32)));
        Put(bytes, at, code);
    }
    private static byte[] Image(int codeOffset, int root)
    {
        var bytes = new byte[0x20400];
        Put(bytes, 0, BitConverter.GetBytes((ushort)0x5a4d));
        Put(bytes, 0x3c, BitConverter.GetBytes(0x80));
        Put(bytes, 0x80, BitConverter.GetBytes(0x4550));
        Put(bytes, 0x84, BitConverter.GetBytes((ushort)0x8664));
        Put(bytes, 0x86, BitConverter.GetBytes((ushort)2));
        Put(bytes, 0x94, BitConverter.GetBytes((ushort)0xf0));
        Put(bytes, 0x98, BitConverter.GetBytes((ushort)0x20b));
        Put(bytes, 0x98 + 56, BitConverter.GetBytes(0x80000));
        int section = 0x188;
        Put(bytes, section + 8, BitConverter.GetBytes(0x20000));
        Put(bytes, section + 12, BitConverter.GetBytes(0x1000));
        Put(bytes, section + 16, BitConverter.GetBytes(0x20000));
        Put(bytes, section + 20, BitConverter.GetBytes(0x400));
        Put(bytes, section + 36, BitConverter.GetBytes(0x60000020));
        section += 40;
        Put(bytes, section + 8, BitConverter.GetBytes(0x40000));
        Put(bytes, section + 12, BitConverter.GetBytes(0x40000));
        Put(bytes, section + 36, BitConverter.GetBytes(0xc0000040));
        Signature(bytes, codeOffset, root);
        return bytes;
    }
    private static void TestRelocation()
    {
        string directory = Path.Combine(Path.GetTempPath(), "enshrouded-layout-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        string file = Path.Combine(directory, "fixture.exe");
        Func<bool> running = delegate { return false; };
        try
        {
            string offsetFile = Path.Combine(directory, "offset.txt");
            long offset;
            File.WriteAllText(offsetFile, "invalid");
            Assert(!RootLayout.TryReadOffset(offsetFile, out offset) && offset == -1, "Malformed offset must retain missing sentinel");
            File.WriteAllText(offsetFile, "-10");
            Assert(!RootLayout.TryReadOffset(offsetFile, out offset) && offset == -1, "Negative offset must retain missing sentinel");
            File.WriteAllBytes(file, Image(0x500, 0x41000));
            RootLayout first = RootLayout.Resolve(file, directory, running);
            Assert(first != null && first.RootRva == 0x41000 && first.Source == "signature-scan", "Unknown executable must be discovered without a hash allowlist");
            RootLayout warm = RootLayout.Resolve(file, directory, running);
            Assert(warm != null && warm.Source == "signature-cache", "Validated signature cache not used");
            // Both code and data moved; signature crosses a 64 KiB read boundary.
            File.WriteAllBytes(file, Image(0x400 + 65530, 0x51000));
            RootLayout moved = RootLayout.Resolve(file, directory, running);
            Assert(moved != null && moved.RootRva == 0x51000 && moved.Fingerprint != first.Fingerprint, "Relocated unknown build not discovered");
            string cache = Path.Combine(directory, "root-v1-" + moved.Fingerprint + ".txt");
            File.WriteAllText(cache, "4096");
            Assert(RootLayout.Resolve(file, directory, running).Source == "signature-scan", "Stale cache trusted");
            File.WriteAllText(cache, new string('9', 64));
            Assert(RootLayout.Resolve(file, directory, running) != null, "Oversized cache prevents recovery");
            byte[] ambiguous = Image(0x500, 0x41000); Signature(ambiguous, 0x600, 0x51000);
            File.WriteAllBytes(file, ambiguous);
            Assert(RootLayout.Resolve(file, directory, running) == null, "Ambiguous roots accepted");
            byte[] mismatch = Image(0x500, 0x41000); mismatch[0x500 + 23] ^= 1;
            File.WriteAllBytes(file, mismatch);
            Assert(RootLayout.Resolve(file, directory, running) == null, "Different constructor root accepted");
            File.WriteAllBytes(file, Image(0x500, 0x1100));
            Assert(RootLayout.Resolve(file, directory, running) == null, "Executable section used as writable root");
            File.WriteAllBytes(file, new byte[16]);
            Assert(RootLayout.Resolve(file, directory, running) == null, "Truncated image accepted");
            File.WriteAllBytes(file, Image(0x500, 0x41000));
            Assert(RootLayout.Resolve(file, directory, delegate { return true; }) == null, "Cancelled discovery ran");
        }
        finally
        {
            // Only the files created in this unique, flat fixture directory are removed.
            foreach (string item in Directory.GetFiles(directory)) File.Delete(item);
            Directory.Delete(directory);
        }
        Console.WriteLine("Passed: unknown builds, code/data relocation, signature block boundary, warm/stale/malformed caches, competing roots, malformed PE, cancellation.");
    }

    private sealed class FakeMemory : MemoryReader
    {
        internal readonly byte[] Root = new byte[16384];
        internal const long ImageBase = 0x140000000, RootRva = 0x40000, Arena = 0x300000000, ArenaSize = 0x2000000;
        internal readonly Dictionary<long, byte[]> Pairs = new Dictionary<long, byte[]>();
        internal override bool Resident(long address, int count) { return true; }
        internal override bool PrivateArena(long address, long size) { return (address == Arena || address == Arena + ArenaSize) && size == ArenaSize; }
        internal override int ResidentMask(long block)
        {
            foreach (long pair in Pairs.Keys) if (pair >= block && pair < block + 65536) return 65535;
            return 0;
        }
        internal override bool Read(long address, byte[] output, int count)
        {
            long offset = address - ImageBase - RootRva;
            if (offset >= 0 && offset + count <= Root.Length) { Buffer.BlockCopy(Root, (int)offset, output, 0, count); return true; }
            byte[] pair;
            if (Pairs.TryGetValue(address, out pair) && count <= pair.Length) { Buffer.BlockCopy(pair, 0, output, 0, count); return true; }
            if (count >= 4096 && address >= Arena && address + count <= Arena + 2 * ArenaSize)
            {
                Array.Clear(output, 0, count);
                foreach (var entry in Pairs)
                    if (entry.Key >= address && entry.Key + entry.Value.Length <= address + count)
                        Buffer.BlockCopy(entry.Value, 0, output, (int)(entry.Key - address), entry.Value.Length);
                return true;
            }
            return false;
        }
        internal void Descriptor(int field, long address)
        { Put(Root, field, BitConverter.GetBytes(address)); Put(Root, field + 8, BitConverter.GetBytes(ArenaSize)); }
    }
    private static void TestArena()
    {
        var memory = new FakeMemory();
        var layout = new RootLayout { RootRva = FakeMemory.RootRva, RootSize = memory.Root.Length, Source = "fixture" };
        // The descriptor itself is allowed to move and straddle a page boundary.
        memory.Descriptor(4088, FakeMemory.Arena);
        var locator = new ArenaLocator(memory, FakeMemory.ImageBase, layout, null);
        for (int i = 0; i < 100 && locator.Address == 0; i++) locator.Step(i * 50, -1);
        Assert(locator.Address == FakeMemory.Arena && locator.Field == 4088 && locator.Validate(), "Dynamic arena field not found");
        memory.Descriptor(4088, FakeMemory.Arena + FakeMemory.ArenaSize);
        Assert(!locator.Validate(), "Changed arena root accepted as old live identity");
        memory.Descriptor(512, FakeMemory.Arena);
        locator.Reset();
        for (int i = 0; i < 20; i++) locator.Step(i * 50, -1);
        Assert(locator.Address == 0, "Private arena selected without player evidence");
        memory.Pairs[FakeMemory.Arena + 1024] = Pair(); locator.Reset();
        for (int i = 0; i < 100 && locator.Address == 0; i++) locator.Step(i * 50, 1024);
        Assert(locator.Address == FakeMemory.Arena, "Validated player pair did not disambiguate arena");
        memory.Pairs[FakeMemory.Arena + FakeMemory.ArenaSize + 1024] = Pair(); locator.Reset();
        for (int i = 0; i < 20; i++) locator.Step(i * 50, 1024);
        Assert(locator.Address == 0, "Competing valid arena/player roots accepted");
        memory.Pairs.Remove(FakeMemory.Arena + FakeMemory.ArenaSize + 1024);
        locator.Reset();
        for (int i = 0; i < 500 && locator.Address == 0; i++) locator.Step(i * 50, -1);
        Assert(locator.Address == FakeMemory.Arena && locator.PlayerOffset == 1024 && locator.Reason == "validated-arena-scan",
            "Cold discovery with multiple arenas failed without a cached offset");
        memory.Pairs[FakeMemory.Arena + FakeMemory.ArenaSize + 2048] = Pair();
        locator.Reset();
        for (int i = 0; i < 500; i++) locator.Step(i * 50, -1);
        Assert(locator.Address == 0 && locator.CandidateCount == 2, "Cold scan accepted competing player arenas");
        Console.WriteLine("Passed: arena field relocation, descriptor page boundary, root replacement, ambiguous arena rejection, player pair validation.");
    }
}
