using System;
using System.IO;
using System.Web.Script.Serialization;

namespace OverwolfAccessProbe
{
    internal static class TrackerTests
    {
        private static readonly double[] Bounds = { -204000, -204000, 204000, 204000 };
        private static DateTime time = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        private static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
        private static void Tick(LocalPlayerResolver reader, EngineMemoryFixture memory)
        {
            time = time.AddMilliseconds(100); reader.Tick(time);
            Assert(memory.ReadCalls <= 768 && memory.ReadBytes <= 512 * 1024, "Read budget exceeded");
        }
        private static void Acquire(LocalPlayerResolver reader, EngineMemoryFixture memory)
        {
            for (int i = 0; i < 200 && reader.Selected == null; i++) Tick(reader, memory);
            Assert(reader.Selected != null, "Owner not acquired: " + new JavaScriptSerializer().Serialize(reader.Summary()));
        }
        private static void Check(bool wide, bool compact, bool varied)
        {
            var memory = new EngineMemoryFixture(wide, compact, varied);
            var reader = new LocalPlayerResolver(memory, Bounds);
            Acquire(reader, memory);
            Assert(reader.Selected.Pawn == memory.Pawn && reader.Selected.Root == memory.Root, "Selected unrelated actor");
            Assert(reader.Selected.Wide == wide && reader.Selected.Position[0] == 1200, "Wrong reflected vector width/value");
            memory.Long(memory.Local + 32, memory.Instance); Tick(reader, memory);
            Assert(reader.Selected == null && reader.Reason == "local-player-engine-mismatch", "GameInstance incorrectly accepted as LocalPlayer Outer");
            memory.Long(memory.Local + 32, memory.Engine); Acquire(reader, memory);
            memory.Set(memory.Engine, "Engine.GameViewport", 0); Tick(reader, memory);
            Assert(reader.Selected == null, "Inactive viewport retained player"); memory.Set(memory.Engine, "Engine.GameViewport", memory.Viewport); Acquire(reader, memory);
            for (int i = 0; i < 20; i++) {
                memory.Position(memory.OtherRoot, 9000 + i * 500, 8888, 77); Tick(reader, memory);
                Assert(reader.Selected != null && reader.Selected.Pawn == memory.Pawn && reader.Selected.Position[0] == 1200, "Moving actor stole stationary player");
            }
            memory.Position(memory.Root, 0, 0, 0); Tick(reader, memory);
            Assert(reader.Selected != null && reader.Selected.Position[0] == 0, "Zero coordinates rejected");
            memory.Position(memory.Root, 90000, -80000, 450); Tick(reader, memory);
            Assert(reader.Selected != null && reader.Selected.Position[0] == 90000, "Teleport retained old position");
            memory.Possess(0, 0); Tick(reader, memory);
            Assert(reader.Selected == null, "Death retained stale pawn");
            long newPawn = memory.InstanceOf("TestCharacter", memory.Level), newRoot = memory.InstanceOf("SceneComponent", newPawn);
            memory.Position(newRoot, 3200, -4300, 650); memory.Possess(newPawn, newRoot);
            Tick(reader, memory); Assert(reader.Selected == null, "New identity skipped confirmation"); Tick(reader, memory);
            Assert(reader.Selected != null && reader.Selected.Pawn == newPawn, "Respawn did not reconnect");
            memory.Position(newRoot, 3400, -4400, 650); Tick(reader, memory);
            Assert(reader.Selected.Position[0] == 3400, "Respawn position froze");
            memory.Set(newPawn, "Pawn.Controller", 0); Tick(reader, memory);
            Assert(reader.Selected == null, "Reciprocal ownership ignored"); memory.Set(newPawn, "Pawn.Controller", memory.Controller); Acquire(reader, memory);
            memory.Set(newRoot, "SceneComponent.AttachParent", memory.OtherRoot); Tick(reader, memory);
            Assert(reader.Selected == null && reader.Reason == "attached-root-unsupported", "Relative coordinates published as world position");
            memory.Set(newRoot, "SceneComponent.AttachParent", 0); Acquire(reader, memory);
            memory.BlockedAddress = newRoot + memory.Offsets["SceneComponent.AttachParent"]; Tick(reader, memory);
            Assert(reader.Selected == null, "Unreadable parent interpreted as null"); memory.BlockedAddress = 0; Acquire(reader, memory);
            memory.Int(memory.Instance + memory.Offsets["GameInstance.LocalPlayers"] + 8, 2); Tick(reader, memory);
            Assert(reader.Selected == null, "Split-screen identity guessed"); memory.Int(memory.Instance + memory.Offsets["GameInstance.LocalPlayers"] + 8, 1); Acquire(reader, memory);
            memory.RecycleSerial(newPawn); Tick(reader, memory);
            Assert(reader.Selected == null, "Reused address retained old identity"); Acquire(reader, memory);
            memory.Int(newPawn + 8, 0x10); Tick(reader, memory); Assert(reader.Selected == null, "Default object accepted as player");
            memory.Int(newPawn + 8, 0); Acquire(reader, memory);
            memory.FailReads = true; Tick(reader, memory); Assert(reader.Selected == null, "Read failure retained marker"); memory.FailReads = false; Acquire(reader, memory);
            long otherWorld = memory.InstanceOf("World", 0); memory.Set(otherWorld, "World.OwningGameInstance", memory.Instance);
            memory.Set(memory.Viewport, "GameViewportClient.World", otherWorld); Tick(reader, memory);
            Assert(reader.Selected == null, "Pawn from previous world accepted");
            memory.Long(memory.Level + 32, otherWorld); Acquire(reader, memory);
            Assert(reader.Selected.World == otherWorld, "World transition did not reconnect");
            bool changed = false;
            memory.OnRead = address => { if (!changed && address == newRoot + memory.Offsets["SceneComponent.RelativeLocation"]) { changed = true; memory.Possess(0, 0); } };
            Tick(reader, memory); Assert(reader.Selected == null, "Mixed graph published during possession change"); memory.OnRead = null;
            Console.WriteLine("PASS ownership: width=" + (wide ? 64 : 32) + " field-name=" + (compact ? 32 : 40) + " shifted-offsets=" + varied);
        }
        public static int Main()
        {
            string file = Path.GetTempFileName();
            try {
                File.WriteAllText(file, "Flow.SelectCharacterInLobby.LoadComplete.Map(1000)\n"); Assert(AccessProbe.ReadMap(file) == 1000, "Map event missing");
                File.AppendAllText(file, "Flow.Transfer.LoadComplete.Map(1010)\n"); Assert(AccessProbe.ReadMap(file) == 1010, "Map transition missing");
                File.AppendAllText(file, "Flow.Disconnect\n"); Assert(AccessProbe.ReadMap(file) == 0, "Disconnect retained map");
                Check(false, false, false); Check(true, true, true); Check(true, false, true); Check(false, true, false);
                DiscoveryCacheTests.Run();
                var broken = new EngineMemoryFixture(true, true, false); broken.BreakField("PlayerController.AcknowledgedPawn");
                var resolver = new LocalPlayerResolver(broken, Bounds);
                for (int i = 0; i < 100; i++) { Tick(resolver, broken); Assert(resolver.Selected == null, "Missing reflection accepted"); }
                Assert(resolver.Reason.Contains("missing-field"), "Missing field not diagnosed: " + resolver.Reason);
                Console.WriteLine("PASS: automatic discovery, stationary player, distractor rejection, reciprocal identity, respawn, teleport, world change, serial reuse, ambiguous local players, read failures, missing fields, bounded reads");
                return 0;
            } catch (Exception error) { Console.Error.WriteLine(error); return 1; }
            finally { File.Delete(file); }
        }
    }
}
