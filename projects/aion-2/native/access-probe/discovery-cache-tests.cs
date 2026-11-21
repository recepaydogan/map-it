using System;
using System.IO;
using System.Web.Script.Serialization;

namespace OverwolfAccessProbe
{
    internal static class DiscoveryCacheTests
    {
        private static readonly double[] Bounds = { -204000, -204000, 204000, 204000 };
        private static DateTime now = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        private static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
        private static int Acquire(LocalPlayerResolver reader, EngineMemoryFixture memory)
        {
            for (int tick = 1; tick <= 1000; tick++) {
                now = now.AddMilliseconds(100); reader.Tick(now);
                Assert(memory.ReadCalls <= 768 && memory.ReadBytes <= 512 * 1024, "Startup exceeded unchanged read budget");
                if (reader.Selected != null) return tick;
            }
            throw new Exception("Acquisition failed: " + new JavaScriptSerializer().Serialize(reader.Summary()));
        }
        public static void Run()
        {
            string folder = Path.Combine(Path.GetTempPath(), "game-map-cache-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            try {
                var coldMemory = new EngineMemoryFixture(true, true, false);
                coldMemory.AddDistractors(20000);
                var coldCache = new FileDiscoveryCache(coldMemory.ImageKey, folder);
                var cold = new LocalPlayerResolver(coldMemory, Bounds, coldCache);
                int coldTicks = Acquire(cold, coldMemory); long coldBytes = coldMemory.TotalBytes;
                Assert(cold.ObjectsVisited >= 20000 && coldCache.Status == "saved", "Cold discovery did not seed cache");
                string file = Path.Combine(folder, coldMemory.ImageKey + ".json");
                string saved = File.ReadAllText(file);
                Assert(new FileInfo(file).Length < 8192 && !saved.Contains("Position") && !saved.Contains("PawnSerial"), "Cache persisted tracking data");

                // New reader, different virtual addresses, and altered member offsets.
                // Hints cannot rely on old pointers or reuse cached reflection offsets.
                var warmMemory = new EngineMemoryFixture(true, false, true, 0x100000000L);
                warmMemory.AddDistractors(20000);
                var warmCache = new FileDiscoveryCache(warmMemory.ImageKey, folder);
                var warm = new LocalPlayerResolver(warmMemory, Bounds, warmCache);
                int warmTicks = Acquire(warm, warmMemory);
                Assert(warm.ObjectsVisited == 0 && warm.StartupMode == "cache-hit", "Warm startup enumerated unrelated objects");
                Assert(warm.Selected.Pawn == warmMemory.Pawn && warm.Selected.Position[0] == 1200, "Cache reused stale pawn/offsets");
                Assert(warmMemory.TotalBytes < coldBytes / 4 && warmTicks < coldTicks, "Cache did not reduce work");
                long warmBytes = warmMemory.TotalBytes;
                for (int i = 0; i < 30; i++) { now = now.AddMilliseconds(100); warm.Tick(now); }
                Assert(File.ReadAllText(file) == saved, "Steady tracking rewrote cache contents");
                warmMemory.Set(warmMemory.Pawn, "Pawn.Controller", 0); now = now.AddMilliseconds(100); warm.Tick(now);
                Assert(warm.Selected == null, "Cached identity bypassed reciprocal ownership");

                // Reused engine index now points at an ordinary object: fall back.
                var stale = new JavaScriptSerializer().Deserialize<DiscoveryHints>(saved);
                stale.EngineIndices = new[] { coldMemory.ObjectIndex(coldMemory.OtherPawn) };
                File.WriteAllText(file, new JavaScriptSerializer().Serialize(stale));
                var fallbackMemory = new EngineMemoryFixture(true, true, false);
                var fallback = new LocalPlayerResolver(fallbackMemory, Bounds, new FileDiscoveryCache(fallbackMemory.ImageKey, folder));
                Acquire(fallback, fallbackMemory);
                Assert(fallback.ObjectsVisited > 0 && fallback.Selected.Pawn == fallbackMemory.Pawn, "Stale engine hint was trusted");

                File.WriteAllText(file, "{broken-json");
                var malformedMemory = new EngineMemoryFixture(false, true, false);
                var malformed = new LocalPlayerResolver(malformedMemory, Bounds, new FileDiscoveryCache(malformedMemory.ImageKey, folder));
                Acquire(malformed, malformedMemory); Assert(malformed.ObjectsVisited > 0, "Malformed cache was trusted");
                File.WriteAllText(file, new string('x', 9000));
                var tooLarge = new FileDiscoveryCache(coldMemory.ImageKey, folder);
                Assert(tooLarge.Load() == null && tooLarge.Status == "invalid-size", "Oversized cache accepted");

                // An executable update gets a different partition and discovers afresh.
                var updatedMemory = new EngineMemoryFixture(true, true, false); updatedMemory.ImageKey = new string('b', 64);
                var updated = new LocalPlayerResolver(updatedMemory, Bounds, new FileDiscoveryCache(updatedMemory.ImageKey, folder));
                Acquire(updated, updatedMemory); Assert(updated.ObjectsVisited > 0, "Changed build reused old hints");

                // Cache storage failures must not prevent normal tracking.
                string occupied = Path.Combine(folder, "occupied"); File.WriteAllText(occupied, "fixture");
                var noDiskMemory = new EngineMemoryFixture(true, true, false);
                var noDisk = new FileDiscoveryCache(noDiskMemory.ImageKey, occupied);
                var noDiskReader = new LocalPlayerResolver(noDiskMemory, Bounds, noDisk);
                Acquire(noDiskReader, noDiskMemory); Assert(noDisk.Status == "write-io-error", "Cache I/O failure not diagnosed");

                Console.WriteLine("PASS cache: cold=" + coldTicks + " polls/" + coldBytes + " bytes; warm=" + warmTicks + " polls/" + warmBytes + " bytes; warm enumeration=0; cache=" + saved.Length + " characters");
                Console.WriteLine("PASS cache recovery: relocated addresses, changed field layouts, stale object index, malformed/oversized cache, changed executable, unavailable disk, ownership rejection");
            } finally {
                // Only files created in this unique, non-recursive test directory.
                foreach (string file in Directory.GetFiles(folder)) File.Delete(file);
                Directory.Delete(folder);
            }
        }
    }
}
