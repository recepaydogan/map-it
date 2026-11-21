using System;
using System.Diagnostics;

namespace OverwolfAccessProbe
{
    internal sealed class OwnedPosition
    {
        public long GameInstance, LocalPlayer, Controller, Pawn, Root, World, Address;
        public int LocalSerial, PawnSerial, RootSerial;
        public bool Wide;
        public double[] Position;
        public string Identity { get { return GameInstance + ":" + LocalPlayer + ":" + LocalSerial + ":" + Controller + ":" + Pawn + ":" + PawnSerial + ":" + Root + ":" + RootSerial + ":" + World; } }
    }

    internal sealed class LocalPlayerResolver
    {
        private readonly ProcessMemory memory;
        private readonly double[] bounds;
        private readonly EngineReflection reflection;
        private string previousIdentity;
        private int consecutive;
        private DateTime lastSample, nextInstanceSearch;
        private DateTime started;
        private double? startupMilliseconds;
        public OwnedPosition Selected { get; private set; }
        public string Reason { get; private set; }
        public int Epoch { get; private set; }
        public long TickMilliseconds { get; private set; }
        public long ObjectsVisited { get { return reflection.ObjectsVisited; } }
        public string StartupMode { get { return reflection.StartupMode; } }
        public LocalPlayerResolver(ProcessMemory source, double[] mapBounds) : this(source, mapBounds, null) { }
        public LocalPlayerResolver(ProcessMemory source, double[] mapBounds, IDiscoveryCache cache)
        { memory = source; bounds = mapBounds; reflection = new EngineReflection(source, cache); Reason = "finding-engine-tables"; }

        public void Tick(DateTime now)
        {
            memory.BeginTick(); Selected = null; var clock = Stopwatch.StartNew();
            if (started == DateTime.MinValue) started = now;
            try {
                reflection.Step(now);
                if (!reflection.Ready) { Reason = reflection.Reason; ClearIdentity(); return; }
                if (!reflection.Roots.RefreshCount()) { Reason = "object-table-unreadable"; ClearIdentity(); return; }
                long activeEngine = 0, activeViewport = 0;
                bool hasLiveEngine = false;
                foreach (long engine in reflection.Engines) {
                    long outer; int serial;
                    if (!reflection.IsObject(engine, "GameEngine", out outer, out serial)) continue;
                    hasLiveEngine = true;
                    long viewport = reflection.Member(engine, "Engine.GameViewport");
                    if (viewport == 0) continue;
                    if (activeEngine != 0) { Reason = "multiple-active-engines"; ClearIdentity(); return; }
                    activeEngine = engine; activeViewport = viewport;
                }
                if (activeViewport == 0) {
                    Reason = "waiting-for-active-viewport"; ClearIdentity();
                    if (!hasLiveEngine && now >= nextInstanceSearch) { nextInstanceSearch = now.AddSeconds(2); reflection.RescanInstances(); }
                    return;
                }
                // Resolve the current game instance directly through the active viewport.
                // This follows world changes without enumerating unrelated objects.
                long ignoredOuter; int ignoredSerial;
                if (!reflection.IsObject(activeViewport, "GameViewportClient", out ignoredOuter, out ignoredSerial)) { Reason = "waiting-for-viewport"; ClearIdentity(); return; }
                long activeWorld = reflection.Member(activeViewport, "GameViewportClient.World");
                if (!reflection.IsObject(activeWorld, "World", out ignoredOuter, out ignoredSerial)) { Reason = "waiting-for-world"; ClearIdentity(); return; }
                long instance = reflection.Member(activeWorld, "World.OwningGameInstance");
                if (!reflection.IsObject(instance, "GameInstance", out ignoredOuter, out ignoredSerial)) { Reason = "waiting-for-game-instance"; ClearIdentity(); return; }
                OwnedPosition unique = ReadChain(instance, activeEngine, activeViewport);
                if (unique == null) { ClearIdentity(); return; }
                // Re-read the graph after coordinates. Travel/respawn must never mix graphs.
                OwnedPosition confirm = ReadChain(unique.GameInstance, activeEngine, activeViewport);
                if (confirm == null || confirm.Identity != unique.Identity || reflection.Member(activeEngine, "Engine.GameViewport") != activeViewport) { Reason = "ownership-changed-during-read"; ClearIdentity(); return; }
                if (previousIdentity != confirm.Identity || (now - lastSample).TotalSeconds > 1) {
                    previousIdentity = confirm.Identity; consecutive = 1; Epoch++;
                } else if (now > lastSample) consecutive++;
                lastSample = now;
                if (consecutive < 2) { Reason = "confirming-local-player"; return; }
                Selected = confirm; Reason = "local-player-chain-verified";
                if (!startupMilliseconds.HasValue) startupMilliseconds = Math.Round((now - started).TotalMilliseconds);
                reflection.SaveVerifiedDiscovery();
            } catch (ReadLimitException) {
                Reason = "read-budget-yield"; ClearIdentity();
            } finally { TickMilliseconds = clock.ElapsedMilliseconds; }
        }
        private void ClearIdentity() { previousIdentity = null; consecutive = 0; }

        private OwnedPosition ReadChain(long instance, long activeEngine, long activeViewport)
        {
            ReflectedField players = reflection.Field("GameInstance.LocalPlayers");
            byte[] array = memory.Read(instance + players.Offset, 16);
            if (array == null) { Reason = "local-player-array-unreadable"; return null; }
            long data = BitConverter.ToInt64(array, 0); int count = BitConverter.ToInt32(array, 8), capacity = BitConverter.ToInt32(array, 12);
            // Never guess the primary player when more than one local player exists.
            if (count != 1 || capacity < count || capacity > 16 || !ProcessMemory.Pointer(data)) { Reason = count > 1 ? "multiple-local-players" : "waiting-for-local-player"; return null; }
            long local = memory.PointerAt(data), outer; int localSerial, unused;
            if (!reflection.IsObject(local, "LocalPlayer", out outer, out localSerial)) { Reason = "invalid-local-player-object"; return null; }
            // ULocalPlayer is declared Within=Engine. GameInstance owns membership
            // in LocalPlayers, not the UObject Outer relationship.
            if (outer != activeEngine) { Reason = "local-player-engine-mismatch"; return null; }
            long viewport = reflection.Member(local, "LocalPlayer.ViewportClient");
            if (viewport != activeViewport) { Reason = "inactive-viewport"; return null; }
            if (!reflection.IsObject(viewport, "GameViewportClient", out outer, out unused)) { Reason = "waiting-for-viewport"; return null; }
            long world = reflection.Member(viewport, "GameViewportClient.World");
            if (!reflection.IsObject(world, "World", out outer, out unused) || reflection.Member(world, "World.OwningGameInstance") != instance) { Reason = "world-owner-mismatch"; return null; }
            long controller = reflection.Member(local, "Player.PlayerController");
            if (!reflection.IsObject(controller, "PlayerController", out outer, out unused)
                || reflection.Member(controller, "PlayerController.Player") != local || !reflection.InWorld(controller, world)) { Reason = "controller-owner-mismatch"; return null; }
            long pawn = reflection.Member(controller, "Controller.Pawn"); int pawnSerial;
            if (pawn == 0 || reflection.Member(controller, "PlayerController.AcknowledgedPawn") != pawn) { Reason = "waiting-for-possession"; return null; }
            if (!reflection.IsObject(pawn, "Pawn", out outer, out pawnSerial)
                || reflection.Member(pawn, "Pawn.Controller") != controller || !reflection.InWorld(pawn, world)) { Reason = "pawn-owner-mismatch"; return null; }
            long root = reflection.Member(pawn, "Actor.RootComponent"); int rootSerial;
            if (!reflection.IsObject(root, "SceneComponent", out outer, out rootSerial) || outer != pawn) { Reason = "root-owner-mismatch"; return null; }
            // Unattached roots have world-relative coordinates; socket transforms need
            // a different supported source and cannot be treated as world positions.
            byte[] parent = memory.Read(root + reflection.Field("SceneComponent.AttachParent").Offset, 8);
            if (parent == null) { Reason = "parent-unreadable"; return null; }
            if (BitConverter.ToInt64(parent, 0) != 0) { Reason = "attached-root-unsupported"; return null; }
            ReflectedField location = reflection.Field("SceneComponent.RelativeLocation");
            byte[] vector = memory.Read(root + location.Offset, location.Size);
            if (vector == null) { Reason = "position-unreadable"; return null; }
            bool wide = location.Size == 24; int step = wide ? 8 : 4;
            double[] point = new double[3];
            for (int i = 0; i < 3; i++) point[i] = wide ? BitConverter.ToDouble(vector, i * step) : BitConverter.ToSingle(vector, i * step);
            if (!Finite(point[0]) || !Finite(point[1]) || !Finite(point[2]) || point[0] < bounds[0] || point[0] > bounds[2]
                || point[1] < bounds[1] || point[1] > bounds[3] || Math.Abs(point[2]) > 200000) { Reason = "position-out-of-map-bounds"; return null; }
            byte[] currentArray = memory.Read(instance + players.Offset, 16);
            if (currentArray == null || BitConverter.ToInt64(currentArray, 0) != data || BitConverter.ToInt32(currentArray, 8) != 1
                || memory.PointerAt(data) != local || reflection.Member(local, "Player.PlayerController") != controller
                || reflection.Member(controller, "Controller.Pawn") != pawn || reflection.Member(pawn, "Actor.RootComponent") != root) {
                Reason = "ownership-changed-during-read"; return null;
            }
            return new OwnedPosition { GameInstance = instance, LocalPlayer = local, Controller = controller, Pawn = pawn, Root = root, World = world,
                LocalSerial = localSerial, PawnSerial = pawnSerial, RootSerial = rootSerial, Address = root + location.Offset, Wide = wide, Position = point };
        }
        private static bool Finite(double number) { return !Double.IsNaN(number) && !Double.IsInfinity(number); }
        public object Summary()
        {
            OwnedPosition selected = Selected;
            return new { reason = Reason, reflection = reflection.Summary(), epoch = Epoch, confirmationSamples = consecutive,
                startupMs = startupMilliseconds,
                reads = memory.ReadCalls, bytes = memory.ReadBytes, failedReads = memory.FailedReads, totalReadBytes = memory.TotalBytes, elapsedMs = TickMilliseconds,
                chain = selected == null ? null : new { gameInstance = selected.GameInstance.ToString("X"), localPlayer = selected.LocalPlayer.ToString("X"),
                    controller = selected.Controller.ToString("X"), pawn = selected.Pawn.ToString("X"), root = selected.Root.ToString("X"), world = selected.World.ToString("X") } };
        }
    }
}
