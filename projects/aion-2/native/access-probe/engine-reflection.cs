using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

namespace OverwolfAccessProbe
{
    internal sealed class ReflectedField
    {
        public string Owner, Name, Type;
        public int Offset, Size;
        public long Address;
    }

    internal sealed class EngineReflection
    {
        private readonly ProcessMemory memory;
        private readonly IDiscoveryCache cache;
        private DiscoveryHints hints;
        private bool cacheTried, engineHintsTried, cacheSaved;
        public string StartupMode { get; private set; }
        public long ObjectsVisited { get; private set; }
        public readonly EngineRoots Roots;
        private readonly Dictionary<string, long> classes = new Dictionary<string, long>();
        private readonly Dictionary<long, bool> instanceClasses = new Dictionary<long, bool>();
        private readonly Dictionary<string, ReflectedField> fields = new Dictionary<string, ReflectedField>();
        private readonly List<long> engines = new List<long>();
        private readonly string[] requiredClasses = { "Actor", "ActorComponent", "SceneComponent", "Pawn", "Controller", "PlayerController", "Player", "LocalPlayer", "GameInstance", "World", "GameViewportClient", "Engine", "GameEngine" };
        private readonly string[][] requests = {
            new[] { "Engine", "GameViewport", "ObjectProperty" },
            new[] { "GameInstance", "LocalPlayers", "ArrayProperty" },
            new[] { "Player", "PlayerController", "ObjectProperty" },
            new[] { "LocalPlayer", "ViewportClient", "ObjectProperty" },
            new[] { "GameViewportClient", "World", "ObjectProperty" },
            new[] { "World", "OwningGameInstance", "ObjectProperty" },
            new[] { "PlayerController", "Player", "ObjectProperty" },
            new[] { "PlayerController", "AcknowledgedPawn", "ObjectProperty" },
            new[] { "Controller", "Pawn", "ObjectProperty" },
            new[] { "Pawn", "Controller", "ObjectProperty" },
            new[] { "Actor", "RootComponent", "ObjectProperty" },
            new[] { "SceneComponent", "RelativeLocation", "StructProperty" },
            new[] { "SceneComponent", "AttachParent", "ObjectProperty" }
        };
        private int objectIndex, itemStart = -1, superOffset, childOffset, fieldNameOffset, requestIndex;
        private byte[] items;
        private bool classesReady, layoutReady, instancesReady;
        private long fieldOwner, fieldCursor;
        private readonly HashSet<long> visited = new HashSet<long>();
        private DateTime retryAt;
        public string Reason { get; private set; }
        public bool Ready { get { return fields.Count == requests.Length && instancesReady; } }
        public long[] Engines { get { return engines.ToArray(); } }
        public EngineReflection(ProcessMemory source, IDiscoveryCache discoveryCache)
        {
            memory = source; cache = discoveryCache; Roots = new EngineRoots(source);
            Reason = "finding-engine-tables"; StartupMode = "cold-discovery";
        }

        public void Step(DateTime now)
        {
            if (Ready || now < retryAt) return;
            if (!cacheTried) {
                hints = cache == null ? null : cache.Load();
                if (hints != null && hints.Version == 1 && hints.ImageKey == memory.ImageKey) {
                    if (Roots.Restore(hints.NameBlocksRva, hints.ObjectsRva)) {
                        StartupMode = "cached-tables-validated";
                        if (RestoreClasses(hints.ClassIndices)) { classesReady = true; StartupMode = "cached-classes-validated"; }
                    } else StartupMode = "cached-tables-rejected";
                } else hints = null;
                cacheTried = true;
                // Cache validation has its own tick; the normal budget is unchanged.
                if (Roots.Ready) { Reason = StartupMode; return; }
            }
            if (!Roots.Ready) { Roots.Step(now); Reason = Roots.Reason; return; }
            if (!Roots.RefreshCount()) { Reason = "object-table-unreadable"; retryAt = now.AddSeconds(2); return; }
            var clock = Stopwatch.StartNew();
            if (!classesReady) {
                Reason = "finding-engine-classes";
                while (objectIndex < Roots.ObjectCount && clock.ElapsedMilliseconds < 6) {
                    long obj = EnumeratedObject(objectIndex); byte[] header = memory.Read(obj, 40);
                    if (Roots.Header(header) && BitConverter.ToInt32(header, 12) == objectIndex) {
                        long cls = BitConverter.ToInt64(header, 16);
                        string className = Roots.ObjectName(cls);
                        if (className == "Class") {
                            string name = Roots.Name(BitConverter.ToUInt32(header, 24));
                            if (requiredClasses.Contains(name) && Roots.ObjectName(BitConverter.ToInt64(header, 32)) == "/Script/Engine") {
                                long existing;
                                if (classes.TryGetValue(name, out existing) && existing != obj) { Reason = "duplicate-engine-class"; retryAt = now.AddSeconds(15); return; }
                                classes[name] = obj;
                            }
                        }
                    }
                    objectIndex++; ObjectsVisited++;
                    if (classes.Count == requiredClasses.Length) { classesReady = true; objectIndex = 0; items = null; break; }
                }
                if (!classesReady && objectIndex >= Roots.ObjectCount) { Reason = "engine-classes-not-found"; objectIndex = 0; items = null; retryAt = now.AddSeconds(15); }
                return;
            }
            if (!layoutReady) {
                Reason = "validating-reflection-layout";
                if (!LearnLayout()) { Reason = "unsupported-reflection-layout"; retryAt = now.AddSeconds(15); }
                return;
            }
            if (requestIndex < requests.Length) { ReadFields(clock, now); return; }
            if (!engineHintsTried) {
                bool restored = RestoreEngines(hints == null ? null : hints.EngineIndices);
                engineHintsTried = true;
                if (restored) { instancesReady = true; StartupMode = "cache-hit"; Reason = "reflection-ready"; return; }
                if (hints != null) StartupMode = "engine-hint-rejected";
            }
            Reason = "finding-game-engine";
            while (objectIndex < Roots.ObjectCount && clock.ElapsedMilliseconds < 6) {
                long obj = EnumeratedObject(objectIndex); byte[] header = memory.Read(obj, 40);
                if (Roots.Header(header) && BitConverter.ToInt32(header, 12) == objectIndex && LiveFlags(header)) {
                    long cls = BitConverter.ToInt64(header, 16); bool match;
                    if (!instanceClasses.TryGetValue(cls, out match)) {
                        match = ClassIsA(cls, classes["GameEngine"]);
                        if (instanceClasses.Count < 8192) instanceClasses[cls] = match;
                    }
                    if (match && !engines.Contains(obj)) {
                        if (engines.Count >= 4) { Reason = "too-many-game-engines"; retryAt = now.AddSeconds(15); return; }
                        engines.Add(obj);
                    }
                }
                objectIndex++; ObjectsVisited++;
            }
            if (objectIndex >= Roots.ObjectCount) {
                instancesReady = true; Reason = "reflection-ready"; items = null;
            }
        }

        private bool RestoreClasses(Dictionary<string, int> indices)
        {
            if (indices == null || indices.Count != requiredClasses.Length) return false;
            var restored = new Dictionary<string, long>();
            foreach (string name in requiredClasses) {
                int index; if (!indices.TryGetValue(name, out index) || index < 0 || index >= Roots.ObjectCount) return false;
                long obj = Roots.ObjectAt(index); byte[] header = memory.Read(obj, 40);
                if (!Roots.Header(header) || BitConverter.ToInt32(header, 12) != index || Roots.ObjectName(obj) != name
                    || Roots.ObjectName(BitConverter.ToInt64(header, 16)) != "Class"
                    || Roots.ObjectName(BitConverter.ToInt64(header, 32)) != "/Script/Engine") return false;
                restored.Add(name, obj);
            }
            foreach (var entry in restored) classes[entry.Key] = entry.Value;
            return true;
        }
        private bool RestoreEngines(int[] indices)
        {
            if (indices == null || indices.Length < 1 || indices.Length > 4 || indices.Distinct().Count() != indices.Length) return false;
            var restored = new List<long>();
            foreach (int index in indices) {
                if (index < 0 || index >= Roots.ObjectCount) return false;
                long obj = Roots.ObjectAt(index), outer; int serial;
                if (!IsObject(obj, "GameEngine", out outer, out serial)) return false;
                restored.Add(obj);
            }
            engines.Clear(); engines.AddRange(restored);
            return true;
        }
        public void SaveVerifiedDiscovery()
        {
            if (cache == null || cacheSaved || !Ready) return;
            var indices = new Dictionary<string, int>();
            foreach (string name in requiredClasses) {
                byte[] header = memory.Read(classes[name], 40); if (!Roots.Header(header)) return;
                indices[name] = BitConverter.ToInt32(header, 12);
            }
            var engineIndices = new List<int>();
            foreach (long engine in engines) {
                byte[] header = memory.Read(engine, 40); if (!Roots.Header(header)) return;
                engineIndices.Add(BitConverter.ToInt32(header, 12));
            }
            cache.Save(new DiscoveryHints { Version = 1, ImageKey = memory.ImageKey, NameBlocksRva = Roots.NameBlocks - memory.ModuleBase,
                ObjectsRva = Roots.Objects - memory.ModuleBase, ClassIndices = indices, EngineIndices = engineIndices.ToArray() });
            cacheSaved = true;
        }

        private long EnumeratedObject(int index)
        {
            if (items == null || index < itemStart || index >= itemStart + items.Length / Roots.ItemSize) {
                long start = Roots.ItemAddress(index); int count = Math.Min(256, Math.Min(Roots.ObjectCount - index, 65536 - index % 65536));
                items = memory.Read(start, count * Roots.ItemSize); itemStart = index;
            }
            return items == null ? 0 : BitConverter.ToInt64(items, (index - itemStart) * Roots.ItemSize);
        }
        private bool LearnLayout()
        {
            var supers = new List<int>();
            string[][] pairs = { new[] { "LocalPlayer", "Player" }, new[] { "PlayerController", "Controller" }, new[] { "Pawn", "Actor" }, new[] { "SceneComponent", "ActorComponent" } };
            var headers = pairs.Select(pair => memory.Read(classes[pair[0]], 160)).ToArray();
            if (headers.Any(header => header == null)) return false;
            for (int offset = 40; offset <= 128; offset += 8)
                if (pairs.Select((pair, i) => BitConverter.ToInt64(headers[i], offset) == classes[pair[1]]).All(value => value)) supers.Add(offset);
            if (supers.Count != 1) return false;
            superOffset = supers[0];
            var matches = new List<int[]>();
            foreach (int nameOffset in new[] { 32, 40 }) {
                for (int offset = superOffset + 8; offset <= superOffset + 40; offset += 8) {
                    bool valid = true;
                    foreach (string name in new[] { "Player", "GameInstance", "SceneComponent" }) {
                        long owner = classes[name], pointer = memory.PointerAt(owner + offset);
                        ReflectedField field; long next;
                        if (!ReadField(pointer, owner, nameOffset, offset, out field, out next)) { valid = false; break; }
                    }
                    if (valid) matches.Add(new[] { offset, nameOffset });
                }
            }
            if (matches.Count != 1) return false;
            childOffset = matches[0][0]; fieldNameOffset = matches[0][1]; layoutReady = true; return true;
        }
        private bool ReadField(long pointer, long owner, int nameOffset, int childrenOffset, out ReflectedField field, out long next)
        {
            field = null; next = 0;
            if (!ProcessMemory.Pointer(pointer)) return false;
            byte[] data = memory.Read(pointer, 96); if (data == null) return false;
            long vtable = BitConverter.ToInt64(data, 0);
            if (vtable < memory.ModuleBase || vtable >= memory.ModuleEnd || (BitConverter.ToInt64(data, 16) & ~1L) != owner) return false;
            string name = Roots.Name(BitConverter.ToUInt32(data, nameOffset));
            byte[] kind = memory.Read(BitConverter.ToInt64(data, 8), 8);
            string type = kind == null ? null : Roots.Name(BitConverter.ToUInt32(kind, 0));
            int dim = BitConverter.ToInt32(data, nameOffset + 16), size = BitConverter.ToInt32(data, nameOffset + 20);
            int memberOffset = BitConverter.ToInt32(data, nameOffset + 36);
            byte[] classSize = memory.Read(owner + childrenOffset + 8, 4);
            if (name == null || type == null || !type.EndsWith("Property", StringComparison.Ordinal) || dim < 1 || dim > 4096
                || size < 1 || size > 65536 || memberOffset < 0 || classSize == null
                || (long)memberOffset + (long)size * dim > BitConverter.ToInt32(classSize, 0)) return false;
            next = BitConverter.ToInt64(data, nameOffset - 8);
            field = new ReflectedField { Name = name, Type = type, Offset = memberOffset, Size = size, Address = pointer };
            return true;
        }
        private void ReadFields(Stopwatch clock, DateTime now)
        {
            while (requestIndex < requests.Length && clock.ElapsedMilliseconds < 6) {
                string[] wanted = requests[requestIndex]; Reason = "resolving-field:" + wanted[0] + "." + wanted[1];
                if (fieldOwner == 0) {
                    long owner = classes[wanted[0]], first = memory.PointerAt(owner + childOffset);
                    fieldOwner = owner; fieldCursor = first; visited.Clear();
                }
                if (fieldCursor == 0) {
                    long parent = memory.PointerAt(fieldOwner + superOffset);
                    if (!ProcessMemory.Pointer(parent)) { Reason = "missing-field:" + wanted[0] + "." + wanted[1]; retryAt = now.AddSeconds(15); fieldOwner = 0; return; }
                    long first = memory.PointerAt(parent + childOffset);
                    fieldOwner = parent; fieldCursor = first;
                    if (!visited.Add(parent) || visited.Count > 1024) { Reason = "invalid-field-chain"; retryAt = now.AddSeconds(15); fieldOwner = 0; return; }
                    continue;
                }
                ReflectedField field; long next;
                if (visited.Contains(fieldCursor) || visited.Count > 1024 || !ReadField(fieldCursor, fieldOwner, fieldNameOffset, childOffset, out field, out next)) {
                    Reason = "invalid-field-layout:" + wanted[0]; retryAt = now.AddSeconds(15); fieldOwner = 0; return;
                }
                visited.Add(fieldCursor);
                if (field.Name == wanted[1]) {
                    int size = wanted[2] == "ObjectProperty" ? 8 : wanted[2] == "ArrayProperty" ? 16 : field.Size;
                    if (field.Type != wanted[2] || field.Size != size || (wanted[2] == "StructProperty" && size != 12 && size != 24) || field.Offset < 40) {
                        Reason = "field-type-mismatch:" + wanted[0] + "." + wanted[1]; retryAt = now.AddSeconds(15); fieldOwner = 0; return;
                    }
                    field.Owner = wanted[0]; fields[wanted[0] + "." + wanted[1]] = field;
                    requestIndex++; fieldOwner = 0; fieldCursor = 0;
                } else fieldCursor = next;
            }
        }

        public ReflectedField Field(string key) { return fields[key]; }
        public long Member(long obj, string key) { return memory.PointerAt(obj + Field(key).Offset); }
        private static bool LiveFlags(byte[] header) { return (BitConverter.ToUInt32(header, 8) & (0x10U | 0x20U | 0x8000U | 0x10000U)) == 0; }
        public bool IsObject(long obj, string className, out long outer, out int serial)
        {
            outer = 0; serial = 0;
            if (!ProcessMemory.Pointer(obj)) return false;
            byte[] header = memory.Read(obj, 40);
            if (!Roots.Header(header) || !LiveFlags(header)) return false;
            int index = BitConverter.ToInt32(header, 12); long itemAddress = Roots.ItemAddress(index);
            byte[] item = memory.Read(itemAddress, Roots.ItemSize);
            if (item == null || BitConverter.ToInt64(item, 0) != obj) return false;
            if (!ClassIsA(BitConverter.ToInt64(header, 16), classes[className])) return false;
            serial = BitConverter.ToInt32(item, 16); outer = BitConverter.ToInt64(header, 32); return true;
        }
        private bool ClassIsA(long cls, long expected)
        {
            for (int depth = 0; depth < 32 && ProcessMemory.Pointer(cls); depth++) {
                if (cls == expected) return true;
                byte[] header = memory.Read(cls, Math.Max(40, superOffset + 8));
                if (!Roots.Header(header)) return false;
                long next = BitConverter.ToInt64(header, superOffset); if (next == cls) return false; cls = next;
            }
            return false;
        }
        public bool InWorld(long obj, long world)
        {
            for (int depth = 0; depth < 8 && ProcessMemory.Pointer(obj); depth++) {
                if (obj == world) return true;
                byte[] header = memory.Read(obj, 40); if (!Roots.Header(header)) return false;
                long next = BitConverter.ToInt64(header, 32); if (next == obj) return false; obj = next;
            }
            return false;
        }
        public void RescanInstances()
        {
            instancesReady = false; engines.Clear(); instanceClasses.Clear(); objectIndex = 0; items = null;
            cacheSaved = false; engineHintsTried = true; StartupMode = "engine-reacquisition";
        }
        public object Summary()
        {
            return new { phase = Reason, startupMode = StartupMode, cacheStatus = cache == null ? "disabled" : cache.Status,
                objectsVisited = ObjectsVisited, nameBlocks = Roots.NameBlocks.ToString("X"), objectArray = Roots.Objects.ToString("X"),
                objectCount = Roots.ObjectCount, objectIndex, itemSize = Roots.ItemSize, scannedBytes = Roots.ScannedBytes,
                passes = Roots.Passes, classesFound = classes.Count, superOffset, childOffset, fieldNameOffset,
                fields = fields.Select(pair => new { name = pair.Key, offset = pair.Value.Offset, size = pair.Value.Size }).ToArray(),
                engineCount = engines.Count };
        }
    }
}
