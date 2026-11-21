using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace PhantomBladeCompanion
{
    // Runs in the companion host. The game is opened with query/read access only.
    public sealed class PositionReader : IDisposable
    {
        private readonly object gate = new object();
        private volatile Worker worker;
        private Dictionary<string, ReaderProfile> profiles = new Dictionary<string, ReaderProfile>();
        private readonly bool discoverLayout;
        public PositionReader() : this(true) { }
        internal PositionReader(bool discoverLayout) { this.discoverLayout = discoverLayout; }
        public void setProfiles(string json, Action<object> callback)
        {
            var updated = ProfileCatalog.Parse(json);
            if (updated != null)
            {
                lock (gate)
                {
                    profiles = updated;
                    if (worker != null) worker.SetProfiles(updated);
                }
            }
            callback(new { success = updated != null });
        }
        public void start(int processId, Action<object> callback)
        {
            lock (gate)
            {
                Dispose();
                worker = new Worker(processId, profiles, discoverLayout);
                worker.Start();
            }
            callback(new { success = true });
        }
        public void getSnapshot(Action<object> callback)
        {
            var active = worker;
            callback(active == null ? "{\"state\":\"stopped\"}" : active.Snapshot);
        }
        public void stop(Action<object> callback) { Dispose(); callback(new { success = true }); }
        public void Dispose()
        {
            lock (gate)
            {
                if (worker != null) worker.Cancel();
                worker = null;
            }
        }
    }

    internal sealed class ReaderProfile
    {
        public string Sha256 { get; set; }
        public uint PeTimestamp { get; set; }
        public int NamePoolRva { get; set; }
        public int GameEngineRva { get; set; }
        public int WorldSubsystemsOffset { get; set; }
        public int MapEntriesOffset { get; set; }
        public int MapIdOffset { get; set; }
        public int MapLayerOffset { get; set; }

        private static bool ValidOffset(int value, int alignment, int upperBound)
        {
            return value > 0 && value <= upperBound && value % alignment == 0;
        }
        internal bool IsValid()
        {
            if (Sha256 == null || Sha256.Length != 64 || PeTimestamp == 0) return false;
            foreach (char c in Sha256)
                if (!(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f')) return false;
            return ValidOffset(NamePoolRva, 8, 0x20000000) && ValidOffset(GameEngineRva, 8, 0x20000000)
                && ValidOffset(WorldSubsystemsOffset, 8, 0x100000) && ValidOffset(MapEntriesOffset, 8, 0x100000)
                && ValidOffset(MapIdOffset, 8, 0x100000) && ValidOffset(MapLayerOffset, 4, 0x100000);
        }
        internal bool SameLayout(ReaderProfile other)
        {
            return other != null && PeTimestamp == other.PeTimestamp && NamePoolRva == other.NamePoolRva
                && GameEngineRva == other.GameEngineRva && WorldSubsystemsOffset == other.WorldSubsystemsOffset
                && MapEntriesOffset == other.MapEntriesOffset && MapIdOffset == other.MapIdOffset
                && MapLayerOffset == other.MapLayerOffset;
        }
    }

    internal sealed class ProfileCatalog
    {
        public int SchemaVersion { get; set; }
        public ReaderProfile[] Profiles { get; set; }

        internal static Dictionary<string, ReaderProfile> Parse(string json)
        {
            if (string.IsNullOrEmpty(json) || json.Length > 32768) return null;
            try
            {
                var catalog = new JavaScriptSerializer { MaxJsonLength = 32768, RecursionLimit = 8 }.Deserialize<ProfileCatalog>(json);
                if (catalog == null || catalog.SchemaVersion != 1 || catalog.Profiles == null || catalog.Profiles.Length > 64) return null;
                var result = new Dictionary<string, ReaderProfile>(StringComparer.Ordinal);
                foreach (var profile in catalog.Profiles)
                {
                    if (profile == null || !profile.IsValid() || result.ContainsKey(profile.Sha256)) return null;
                    result.Add(profile.Sha256, profile);
                }
                return result;
            }
            catch (ArgumentException) { return null; }
            catch (InvalidOperationException) { return null; }
            catch (OverflowException) { return null; }
            catch (FormatException) { return null; }
        }
    }

    internal sealed class Worker
    {
        private readonly int requestedPid;
        private readonly bool discoverLayout;
        private volatile bool cancelled;
        private volatile string snapshot = "{\"state\":\"waiting-game\"}";
        private volatile Dictionary<string, ReaderProfile> profiles;
        private long sequence;
        internal string Snapshot { get { return snapshot; } }
        internal Worker(int pid, Dictionary<string, ReaderProfile> profiles, bool discoverLayout)
        {
            requestedPid = pid;
            this.profiles = profiles;
            this.discoverLayout = discoverLayout;
        }
        internal void SetProfiles(Dictionary<string, ReaderProfile> updated) { profiles = updated; }
        internal void Start() { var t = new Thread(Run); t.IsBackground = true; t.Priority = ThreadPriority.BelowNormal; t.Start(); }
        internal void Cancel() { cancelled = true; }
        private void State(string state) { snapshot = "{\"state\":\"" + state + "\",\"sampledAt\":" + Clock.Now + "}"; }
        private static Process FindProcess(int pid)
        {
            var candidates = pid > 0 ? new[] { Process.GetProcessById(pid) } : Process.GetProcessesByName("PBZ");
            Process found = null;
            foreach (var p in candidates)
            {
                try
                {
                    if (p.MainModule.FileName.Replace('/', '\\').EndsWith("\\platform\\steam\\PBZ.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        if (found != null) { found.Dispose(); p.Dispose(); throw new InvalidDataException("Ambiguous game processes"); }
                        found = p; continue;
                    }
                }
                catch (System.ComponentModel.Win32Exception) { }
                catch (InvalidOperationException) { }
                p.Dispose();
            }
            return found;
        }
        private void Run()
        {
            while (!cancelled)
            {
                try
                {
                    using (var process = FindProcess(requestedPid))
                    {
                        if (process == null) State("waiting-game");
                        else
                        {
                            State("connecting");
                            using (var memory = new Memory(process)) SampleProcess(process, memory);
                            State("waiting-game");
                        }
                    }
                }
                catch (System.ComponentModel.Win32Exception) { State("access-denied"); }
                catch (InvalidOperationException) { State("waiting-game"); }
                catch (ArgumentException) { State("waiting-game"); }
                catch (InvalidDataException) { State("unavailable"); }
                catch (IOException) { State("unavailable"); }
                catch (UnauthorizedAccessException) { State("access-denied"); }
                for (int i = 0; i < 20 && !cancelled; i++) Thread.Sleep(100);
            }
        }
        private void SampleProcess(Process process, Memory memory)
        {
            ReaderProfile local = discoverLayout ? memory.Discover(() => cancelled || process.HasExited) : null;
            Dictionary<string, ReaderProfile> activeCatalog = null;
            ReaderProfile activeProfile = local;
            GameReader reader = local == null ? null : new GameReader(memory, local);
            long failedSince = 0;
            bool tryFallback = local == null;
            while (!cancelled && !process.HasExited)
            {
                var catalog = profiles;
                if (tryFallback && catalog != activeCatalog)
                {
                    activeCatalog = catalog;
                    ReaderProfile profile;
                    if (catalog.Count == 0 || !catalog.TryGetValue(memory.Sha256, out profile) || !memory.Matches(profile))
                    {
                        if (local == null)
                        {
                            activeProfile = null;
                            reader = null;
                            State("unsupported-build");
                        }
                    }
                    else if (!profile.SameLayout(activeProfile))
                    {
                        local = null;
                        activeProfile = profile;
                        reader = new GameReader(memory, profile);
                        failedSince = 0;
                        State("connecting");
                    }
                }
                if (reader == null) { Thread.Sleep(250); continue; }
                var clock = Stopwatch.StartNew();
                bool failed = false;
                try
                {
                    snapshot = reader.Sample(++sequence);
                    failedSince = 0;
                    if (local != null)
                    {
                        tryFallback = false;
                        activeCatalog = null;
                    }
                }
                catch (InvalidDataException) { failed = true; }
                catch (OverflowException) { failed = true; }
                if (failed)
                {
                    reader.Reset();
                    if (failedSince == 0) failedSince = Clock.Now;
                    bool layoutFailed = Clock.Now - failedSince >= 3000;
                    if (layoutFailed) tryFallback = true;
                    State(layoutFailed ? "unsupported-build" : "unavailable");
                }
                Thread.Sleep((int)Math.Max(1, 50 - clock.ElapsedMilliseconds));
            }
        }
    }

    internal static class Clock
    {
        internal static long Now { get { return (DateTime.UtcNow.Ticks - 621355968000000000L) / 10000; } }
    }

    internal sealed class Memory : IDisposable
    {
        internal readonly long Base;
        internal readonly int Pid;
        private readonly string fileName;
        private string sha256;
        internal string Sha256
        {
            get
            {
                if (sha256 == null)
                    using (var stream = File.OpenRead(fileName))
                    using (var hash = SHA256.Create())
                        sha256 = BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                return sha256;
            }
        }
        private readonly uint peTimestamp;
        private readonly int imageSize;
        private IntPtr handle;
        internal Memory(Process process)
        {
            Pid = process.Id;
            var module = process.MainModule;
            fileName = module.FileName;
            Base = module.BaseAddress.ToInt64();
            imageSize = module.ModuleMemorySize;
            handle = OpenProcess(0x0410, false, Pid);
            if (handle == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            try
            {
                int pe = I32(Base + 60);
                if (pe < 64 || pe > 4096 || (I32(Base) & 0xffff) != 0x5a4d || I32(Base + pe) != 0x4550)
                    throw new InvalidDataException("Invalid executable header");
                peTimestamp = (uint)I32(Base + pe + 8);
            }
            catch { Dispose(); throw; }
        }
        internal ReaderProfile Discover(Func<bool> cancelled)
        {
            try { return PositionLayout.Resolve(fileName, peTimestamp, imageSize, cancelled); }
            catch (IOException) { return null; }
            catch (UnauthorizedAccessException) { return null; }
        }
        internal bool Matches(ReaderProfile profile)
        {
            return peTimestamp == profile.PeTimestamp && profile.GameEngineRva <= imageSize - 8
                && profile.NamePoolRva <= imageSize - 16 - 8192 * 8;
        }
        internal byte[] Read(long address, int size)
        {
            if (address < 0x10000 || address > 0x7fffffff0000 || size < 0 || size > 1024 * 1024) throw new InvalidDataException("Invalid read bounds");
            var data = new byte[size]; IntPtr read;
            if (!ReadProcessMemory(handle, new IntPtr(address), data, new IntPtr(size), out read) || read.ToInt64() != size) throw new InvalidDataException("Unreadable memory");
            return data;
        }
        internal long Q(long address) { return BitConverter.ToInt64(Read(address, 8), 0); }
        internal int I32(long address) { return BitConverter.ToInt32(Read(address, 4), 0); }
        internal double[] Triple(long address) { var d = Read(address, 24); return new[] { BitConverter.ToDouble(d, 0), BitConverter.ToDouble(d, 8), BitConverter.ToDouble(d, 16) }; }
        public void Dispose() { if (handle != IntPtr.Zero) CloseHandle(handle); handle = IntPtr.Zero; }
        [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool ReadProcessMemory(IntPtr process, IntPtr address, [Out] byte[] data, IntPtr size, out IntPtr read);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    }

    internal sealed class GameReader
    {
        private readonly Memory m;
        private readonly ReaderProfile profile;
        private readonly Dictionary<uint, string> names = new Dictionary<uint, string>();
        private readonly Dictionary<long, Dictionary<string, int>> offsets = new Dictionary<long, Dictionary<string, int>>();
        private long world, subsystem;
        private long nextMeshRefresh;
        private readonly Dictionary<long, List<Mesh>> projectionCache = new Dictionary<long, List<Mesh>>();
        internal GameReader(Memory memory, ReaderProfile profile) { m = memory; this.profile = profile; }
        internal void Reset() { world = subsystem = 0; projectionCache.Clear(); offsets.Clear(); }
        internal string Name(uint id)
        {
            string value; if (names.TryGetValue(id, out value)) return value;
            long pool = m.Base + profile.NamePoolRva;
            int block = (int)(id >> 16), count = m.I32(pool + 8);
            if (count < 0 || count >= 8192 || block > count) throw new InvalidDataException("Invalid name index");
            long entry = m.Q(pool + 16 + block * 8) + (id & 65535) * 2;
            ushort header = BitConverter.ToUInt16(m.Read(entry, 2), 0); int length = header >> 6;
            if (length < 1 || length > 1024) throw new InvalidDataException("Invalid name length");
            value = ((header & 1) == 1 ? Encoding.Unicode : Encoding.UTF8).GetString(m.Read(entry + 2, length * ((header & 1) == 1 ? 2 : 1)));
            foreach (char c in value) if (c < 32) throw new InvalidDataException("Invalid name characters");
            names[id] = value; return value;
        }
        private string ObjectName(long ptr) { return Name((uint)m.I32(ptr + 24)); }
        private long Class(long ptr)
        {
            var b = m.Read(ptr, 40); long vtable = BitConverter.ToInt64(b, 0), cls = BitConverter.ToInt64(b, 16);
            int index = BitConverter.ToInt32(b, 12);
            if (vtable < m.Base || vtable > m.Base + 0x20000000 || index < 0 || index > 10000000 || cls == 0) throw new InvalidDataException("Invalid object");
            return cls;
        }
        private bool IsA(long ptr, string expected)
        {
            long cls = Class(ptr);
            for (int i = 0; i < 64 && cls != 0; i++, cls = m.Q(cls + 0x40)) if (ObjectName(cls) == expected) return true;
            return false;
        }
        private long Field(long ptr, string name)
        {
            long cls = Class(ptr); Dictionary<string, int> fields;
            if (!offsets.TryGetValue(cls, out fields))
            {
                fields = new Dictionary<string, int>(); long parent = cls;
                var classes = new HashSet<long>();
                while (parent != 0 && classes.Add(parent) && classes.Count <= 64)
                {
                    long p = m.Q(parent + 0x50); var seen = new HashSet<long>();
                    while (p != 0 && seen.Add(p) && seen.Count <= 4096)
                    {
                        var d = m.Read(p, 0x48); string key = Name(BitConverter.ToUInt32(d, 0x20)); int offset = BitConverter.ToInt32(d, 0x44);
                        if (offset < 0 || offset > 1048576) throw new InvalidDataException("Invalid field");
                        if (!fields.ContainsKey(key)) fields.Add(key, offset);
                        p = BitConverter.ToInt64(d, 0x10);
                    }
                    parent = m.Q(parent + 0x40);
                }
                offsets[cls] = fields;
            }
            int result; if (!fields.TryGetValue(name, out result)) throw new InvalidDataException("Missing field: " + name);
            return ptr + result;
        }
        private List<long> Entries(long address, int stride)
        {
            var d = m.Read(address, 0x38); long data = BitConverter.ToInt64(d, 0); int count = BitConverter.ToInt32(d, 8), cap = BitConverter.ToInt32(d, 12);
            if (count < 0 || count > cap || cap > 10000) throw new InvalidDataException("Invalid collection");
            long bitsAddress = BitConverter.ToInt64(d, 0x20); if (bitsAddress == 0) bitsAddress = address + 0x10;
            byte[] bits = m.Read(bitsAddress, (count + 7) / 8); var result = new List<long>();
            for (int i = 0; i < count; i++) if ((bits[i >> 3] & (1 << (i & 7))) != 0) result.Add(data + i * stride);
            return result;
        }
        private long FindSubsystem(long activeWorld)
        {
            long found = 0;
            foreach (long entry in Entries(activeWorld + profile.WorldSubsystemsOffset, 24))
            {
                long value = m.Q(entry + 8);
                if (value == 0) continue;
                if (ObjectName(Class(value)) == "MapSubsystem" && m.Q(value + 32) == activeWorld)
                {
                    if (found != 0) throw new InvalidDataException("Ambiguous map subsystem"); found = value;
                }
            }
            if (found == 0) throw new InvalidDataException("Map subsystem unavailable");
            return found;
        }
        private byte[] Vector(long native, int field, int index, int size)
        {
            long blocks = m.Q(native + field), block = m.Q(blocks + (index >> 9) * 8);
            return m.Read(block + (index & 511) * size, size);
        }
        private List<Mesh> ReadMeshes(long entry)
        {
            var result = new List<Mesh>();
            foreach (long group in Entries(entry + 8, 88))
            {
                long mesh = m.Q(group + 0x18); if (mesh == 0) continue;
                long native = m.Q(mesh + 0x98); int vc = m.I32(native + 0xc), tc = m.I32(native + 0x12c);
                if (vc < 0 || vc > 10000 || tc < 0 || tc > 20000) throw new InvalidDataException("Invalid projection mesh");
                if (vc < 3 || tc == 0) continue;
                if (m.Read(native + 0xb0, 1)[0] != 1) throw new InvalidDataException("Missing map UVs");
                var vs = new double[vc][];
                for (int i = 0; i < vc; i++)
                {
                    var xyz = Vector(native, 0x10, i, 24); var uv = Vector(native, 0xa0, i, 8);
                    vs[i] = new[] { BitConverter.ToDouble(xyz, 0), BitConverter.ToDouble(xyz, 8), BitConverter.ToDouble(xyz, 16), (double)BitConverter.ToSingle(uv, 0), (double)BitConverter.ToSingle(uv, 4) };
                    foreach (double v in vs[i]) if (double.IsNaN(v) || double.IsInfinity(v)) throw new InvalidDataException("Invalid vertex");
                    if (vs[i][3] < 0 || vs[i][3] > 1 || vs[i][4] < 0 || vs[i][4] > 1) throw new InvalidDataException("Invalid UV");
                }
                var triangles = new List<int[]>();
                for (int i = 0; i < tc; i++)
                {
                    var t = Vector(native, 0x130, i, 12); int a = BitConverter.ToInt32(t, 0), b = BitConverter.ToInt32(t, 4), c = BitConverter.ToInt32(t, 8);
                    if (a >= 0 && b >= 0 && c >= 0 && a < vc && b < vc && c < vc) triangles.Add(new[] { a, b, c });
                }
                result.Add(new Mesh(vs, triangles));
            }
            return result;
        }
        private List<Mesh> CachedMeshes(long entry)
        {
            List<Mesh> found;
            if (!projectionCache.TryGetValue(entry, out found)) { found = ReadMeshes(entry); projectionCache.Add(entry, found); }
            return found;
        }
        internal string Sample(long sequence)
        {
            // The local engine owns the actual player. GWorld can be null outside
            // particular engine callbacks, even while a playable world is active.
            long engine = m.Q(m.Base + profile.GameEngineRva);
            if (engine == 0) return Unavailable();
            if (Name(0) != "None") throw new InvalidDataException("Invalid name pool");
            if (!IsA(engine, "GameEngine")) throw new InvalidDataException("Invalid game engine");
            long instance = m.Q(Field(engine, "GameInstance"));
            if (instance == 0) return Unavailable();
            long players = Field(instance, "LocalPlayers");
            int count = m.I32(players + 8);
            if (count == 0) return Unavailable();
            if (count != 1) throw new InvalidDataException("Ambiguous local player");
            long playerArray = m.Q(players);
            if (playerArray == 0) return Unavailable();
            long local = m.Q(playerArray);
            if (local == 0) return Unavailable();
            long controller = m.Q(Field(local, "PlayerController"));
            if (controller == 0) return Unavailable();
            long pawn = m.Q(Field(controller, "AcknowledgedPawn"));
            if (pawn == 0) return Unavailable();
            if (!IsA(controller, "PBZPlayerController")) throw new InvalidDataException("Invalid local controller");
            if (pawn != m.Q(Field(controller, "Pawn")) || controller != m.Q(Field(pawn, "Controller")) || !IsA(pawn, "PBZCharacter")) throw new InvalidDataException("Unconfirmed player");
            long level = m.Q(pawn + 32), activeWorld = m.Q(level + 32);
            if (!IsA(level, "Level") || !IsA(activeWorld, "World") || m.Q(Field(activeWorld, "OwningGameInstance")) != instance) throw new InvalidDataException("Invalid player world");
            if (activeWorld != world) { Reset(); world = activeWorld; subsystem = FindSubsystem(world); }
            long root = m.Q(Field(pawn, "RootComponent"));
            if (m.Q(root + 32) != pawn || m.Q(Field(root, "AttachParent")) != 0) throw new InvalidDataException("Unsupported root transform");
            double[] position = m.Triple(Field(root, "RelativeLocation")), rotation = m.Triple(Field(root, "RelativeRotation"));
            foreach (double v in position) if (double.IsNaN(v) || double.IsInfinity(v) || Math.Abs(v) > 1e9) throw new InvalidDataException("Invalid player coordinate");
            long mapKey = m.Q(subsystem + profile.MapIdOffset); string region = Name((uint)mapKey); int layer = m.I32(subsystem + profile.MapLayerOffset);
            if (layer != 0) return "{\"state\":\"unavailable-map\",\"sampledAt\":" + Clock.Now + "}";
            if (Clock.Now >= nextMeshRefresh) { projectionCache.Clear(); nextMeshRefresh = Clock.Now + 10000; }
            var entries = Entries(subsystem + profile.MapEntriesOffset, 96);
            Hit hit = null;
            foreach (long candidate in entries)
                if (m.Q(candidate) == mapKey) { hit = Projection.Project(CachedMeshes(candidate), position[0], position[1], position[2], rotation[1]); break; }
            // CurrentMapID is initialized by the game's map UI. Before it opens,
            // accept only a unique actual ray intersection across the authored
            // region meshes. Never choose a nearest coordinate or first match.
            if (hit == null)
            {
                foreach (long candidate in entries)
                {
                    Hit candidateHit = Projection.Project(CachedMeshes(candidate), position[0], position[1], position[2], rotation[1]);
                    if (candidateHit == null) continue;
                    if (hit != null) return "{\"state\":\"unavailable-map\",\"sampledAt\":" + Clock.Now + "}";
                    hit = candidateHit; region = Name((uint)m.Q(candidate));
                }
            }
            if (hit == null) return "{\"state\":\"unavailable-map\",\"sampledAt\":" + Clock.Now + "}";
            if (engine != m.Q(m.Base + profile.GameEngineRva) || pawn != m.Q(Field(controller, "AcknowledgedPawn")) || level != m.Q(pawn + 32) || world != m.Q(level + 32) || mapKey != m.Q(subsystem + profile.MapIdOffset)) throw new InvalidDataException("Session changed during read");
            return string.Format(CultureInfo.InvariantCulture,
                "{{\"state\":\"live\",\"sequence\":{0},\"sampledAt\":{1},\"pid\":{2},\"region\":\"{3}\",\"level\":\"{4}\",\"layer\":{5},\"x\":{6:R},\"y\":{7:R},\"z\":{8:R},\"u\":{9:R},\"v\":{10:R},\"dx\":{11:R},\"dy\":{12:R}",
                sequence, Clock.Now, m.Pid, Escape(region), Escape(ObjectName(world)), layer, position[0], position[1], position[2], hit.U, hit.V, hit.Dx, hit.Dy) + "}";
        }
        private static string Unavailable() { return "{\"state\":\"unavailable\",\"sampledAt\":" + Clock.Now + "}"; }
        private static string Escape(string value) { return value.Replace("\\", "\\\\").Replace("\"", "\\\""); }
    }

    internal sealed class Mesh
    {
        internal readonly double[][] Vertices;
        internal readonly List<int[]> Triangles;
        internal Mesh(double[][] vertices, List<int[]> triangles) { Vertices = vertices; Triangles = triangles; }
    }
    internal sealed class Hit { internal double Height, U, V, Dx, Dy; }
    internal static class Projection
    {
        // Mirrors the game's downward ray origin (+1000), hit ordering, +200
        // height selection and triangle UV interpolation. These are native constants.
        internal static Hit Project(List<Mesh> meshes, double x, double y, double z, double yaw)
        {
            var hits = new List<Hit>(); double fx = Math.Cos(yaw * Math.PI / 180), fy = Math.Sin(yaw * Math.PI / 180);
            foreach (var mesh in meshes)
            {
                Hit nearest = null;
                foreach (var t in mesh.Triangles)
                {
                    var a = mesh.Vertices[t[0]]; var b = mesh.Vertices[t[1]]; var c = mesh.Vertices[t[2]];
                    double den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
                    if (Math.Abs(den) < 1e-10) continue;
                    double wa = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den;
                    double wb = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den, wc = 1 - wa - wb;
                    if (Math.Min(wa, Math.Min(wb, wc)) < -1e-7) continue;
                    double height = wa * a[2] + wb * b[2] + wc * c[2];
                    if (height > z + 1000 || (nearest != null && height <= nearest.Height)) continue;
                    double da = ((b[1] - c[1]) * fx + (c[0] - b[0]) * fy) / den;
                    double db = ((c[1] - a[1]) * fx + (a[0] - c[0]) * fy) / den, dc = -da - db;
                    double dx = da * a[3] + db * b[3] + dc * c[3], dy = da * a[4] + db * b[4] + dc * c[4];
                    double length = Math.Sqrt(dx * dx + dy * dy);
                    nearest = new Hit { Height = height, U = wa * a[3] + wb * b[3] + wc * c[3], V = wa * a[4] + wb * b[4] + wc * c[4], Dx = length > 1e-12 ? dx / length : 0, Dy = length > 1e-12 ? dy / length : 0 };
                }
                if (nearest != null) hits.Add(nearest);
            }
            hits.Sort(delegate(Hit a, Hit b) { return b.Height.CompareTo(a.Height); });
            foreach (var hit in hits) if (hit.Height < z + 200) return hit;
            return hits.Count == 0 ? null : hits[hits.Count - 1];
        }
    }

#if CONSOLE
    internal static class ConsoleHost
    {
        private static void Main(string[] args)
        {
            using (var reader = new PositionReader(args.Length < 4 || args[3] != "--profiles-only"))
            {
                int pid = args.Length > 0 ? int.Parse(args[0], CultureInfo.InvariantCulture) : 0;
                if (args.Length > 2 && args[2] != "-")
                {
                    string json = File.ReadAllText(args[2]);
                    if (ProfileCatalog.Parse(json) == null) throw new InvalidDataException("Invalid position profile catalog");
                    reader.setProfiles(json, delegate(object value) { });
                }
                reader.start(pid, delegate(object value) { });
                if (args.Length > 2 && args[2] == "-")
                {
                    var input = new Thread(delegate()
                    {
                        string line;
                        while ((line = Console.ReadLine()) != null)
                            reader.setProfiles(line, delegate(object value) { });
                    });
                    input.IsBackground = true;
                    input.Start();
                }
                var watch = Stopwatch.StartNew();
                double seconds = args.Length > 1 ? double.Parse(args[1], CultureInfo.InvariantCulture) : double.PositiveInfinity;
                while (watch.Elapsed.TotalSeconds < seconds) { reader.getSnapshot(delegate(object value) { Console.WriteLine(value); }); Thread.Sleep(50); }
            }
        }
    }
#endif
}
