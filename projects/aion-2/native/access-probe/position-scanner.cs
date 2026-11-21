using System;
using System.IO;

namespace OverwolfAccessProbe
{
    internal sealed class PositionScanner : IDisposable
    {
        private readonly ProcessMemory memory;
        private readonly LocalPlayerResolver resolver;
        public int Error { get { return memory.Error; } }
        public PositionScanner(int processId, double[] mapBounds)
            : this(new WindowsProcessMemory(processId), mapBounds) { }
        internal PositionScanner(ProcessMemory source, double[] mapBounds)
        {
            memory = source;
            if (source.Error == 0) resolver = new LocalPlayerResolver(source, mapBounds,
                String.IsNullOrEmpty(source.ImageKey) ? null : new FileDiscoveryCache(source.ImageKey,
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GameMapTracker", "cache")));
        }
        public void Dispose() { memory.Dispose(); }
        internal object Tick(int processId, int map)
        {
            resolver.Tick(DateTime.UtcNow); OwnedPosition owned = resolver.Selected;
            return new {
                state = owned == null ? "identity-unverified" : "tracking",
                processId, nativeMapId = map,
                position = owned == null ? null : new { x = owned.Position[0], y = owned.Position[1], z = owned.Position[2] },
                address = owned == null ? null : owned.Address.ToString("X"),
                precision = owned == null ? null : owned.Wide ? "float64" : "float32",
                resolver = "local-player-reflection-v1", ownershipVerified = owned != null, ownership = resolver.Summary()
            };
        }
    }
}
