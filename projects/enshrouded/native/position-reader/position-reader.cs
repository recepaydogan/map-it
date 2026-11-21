using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace EnshroudedCompanion
{
    // Loaded into Overwolf's plugin host, never into the game.
    public sealed class PositionReader : IDisposable
    {
        private readonly object gate = new object();
        private Worker worker;

        public void start(int processId, Action<object> callback)
        {
            lock (gate)
            {
                if (worker != null) worker.Cancel();
                worker = new Worker(processId);
                worker.Start();
            }
            callback(new { success = true });
        }

        // Pull a single latest value: slow JavaScript cannot accumulate an event queue.
        public void getSnapshot(Action<object> callback)
        {
            string value;
            lock (gate) value = worker == null ? "{\"state\":\"stopped\"}" : worker.Snapshot;
            callback(value);
        }

        public void stop(Action<object> callback)
        {
            Dispose();
            callback(new { success = true });
        }

        public void getDiagnostics(Action<object> callback)
        {
            string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EnshroudedCompanion");
            long offset;
            bool cached = RootLayout.TryReadOffset(Path.Combine(directory, "player-offset-v2.txt"), out offset);
            string cacheRead;
            try { cacheRead = File.ReadAllText(Path.Combine(directory, "player-offset-v2.txt")); }
            catch (Exception error) { cacheRead = error.GetType().Name + ": " + error.Message; }
            callback(new { cacheDirectory = directory, cachedPlayer = cached, playerOffset = offset,
                cacheRead = cacheRead, hostProcess = Process.GetCurrentProcess().Id,
                logExists = File.Exists(Path.Combine(directory, "position-reader.log")) });
        }

        public void Dispose()
        {
            lock (gate)
            {
                if (worker != null) worker.Cancel();
                worker = null;
            }
        }
    }

    internal sealed class Worker
    {
        private readonly int pid;
        private volatile bool cancelled;
        private volatile string snapshot = "{\"state\":\"searching\"}";
        private long sequence;
        private string loggedState;
        private DateTime nextLog;
        internal string Snapshot { get { return snapshot; } }
        internal Worker(int processId) { pid = processId; }
        internal void Start()
        {
            var thread = new Thread(Run);
            thread.IsBackground = true;
            thread.Priority = ThreadPriority.BelowNormal;
            thread.Name = "Enshrouded position reader";
            thread.Start();
        }
        internal void Cancel() { cancelled = true; }
        private void Publish(string value)
        {
            snapshot = value;
            int end = value.IndexOf('"', 10);
            string state = end > 0 ? value.Substring(0, end) : value;
            if (state == loggedState && DateTime.UtcNow < nextLog) return;
            loggedState = state; nextLog = DateTime.UtcNow.AddSeconds(15);
            try
            {
                string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EnshroudedCompanion");
                Directory.CreateDirectory(directory);
                string file = Path.Combine(directory, "position-reader.log");
                if (File.Exists(file) && new FileInfo(file).Length > 1024 * 1024)
                {
                    string previous = file + ".1";
                    if (File.Exists(previous)) File.Delete(previous);
                    File.Move(file, previous);
                }
                File.AppendAllText(file, DateTime.UtcNow.ToString("O") + " pid=" + pid + " " + value + Environment.NewLine);
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        private void Run()
        {
            try
            {
                using (var process = Process.GetProcessById(pid))
                using (var reader = new MemoryReader(pid))
                {
                    if (!String.Equals(process.ProcessName, "enshrouded", StringComparison.OrdinalIgnoreCase))
                    { Publish("{\"state\":\"wrong-process\"}"); return; }
                    var module = process.MainModule;
                    Publish("{\"state\":\"resolving-layout\"}");
                    string cacheDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EnshroudedCompanion");
                    RootLayout profile = RootLayout.Resolve(module.FileName, cacheDirectory, delegate { return cancelled; });
                    if (profile == null)
                    { Publish("{\"state\":\"layout-not-found\"}"); return; }
                    if (cancelled) return;
                    long image = module.BaseAddress.ToInt64();
                    var discovery = new Discovery(reader, image, profile);
                    long player = 0;
                    long nextSearch = 0;
                    long lastChanged = 0;
                    long lastPublished = 0;
                    var previous = new byte[40];
                    bool hadSample = false;
                    long pendingPlayer = 0, nextArenaCheck = 0;
                    int confirmations = 0;
                    var clock = Stopwatch.StartNew();
                    while (!cancelled)
                    {
                        long began = clock.ElapsedMilliseconds;
                        uint exitCode;
                        if (!Native.GetExitCodeProcess(reader.Handle, out exitCode) || exitCode != 259) break;
                        if (player == 0)
                        {
                            // Keep checking the validated known offset while a full
                            // scan is paused or in progress. The player component may
                            // appear only after loading into a world.
                            player = discovery.Step(began, began >= nextSearch);
                            if (player == 0 && discovery.Finished && began >= nextSearch)
                            {
                                nextSearch = began + 5000;
                                discovery.Reset();
                                Publish(discovery.Status("not-found"));
                            }
                            else if (began >= nextSearch && player == 0)
                                Publish(discovery.Status("searching"));
                        }
                        if (player != 0)
                        {
                            Position position;
                            bool arenaValid = began < nextArenaCheck || discovery.ValidateArena();
                            nextArenaCheck = began < nextArenaCheck ? nextArenaCheck : began + 500;
                            if (!arenaValid || !reader.ReadPlayerPair(player, out position))
                            {
                                player = 0;
                                hadSample = false;
                                pendingPlayer = 0; confirmations = 0;
                                discovery.Reset();
                                nextSearch = began;
                                Publish("{\"state\":\"unavailable\"}");
                            }
                            else
                            {
                                if (pendingPlayer != player) { pendingPlayer = player; confirmations = 0; }
                                if (++confirmations < 2)
                                {
                                    Publish(discovery.Status("confirming-player"));
                                    Thread.Sleep(50);
                                    continue;
                                }
                                if (!hadSample) discovery.Confirm(player);
                                bool changed = !hadSample;
                                for (int i = 0; i < 40; i++)
                                    if (reader.PairBuffer[i] != previous[i]) { changed = true; break; }
                                if (changed) lastChanged = began;
                                if (changed || began - lastPublished >= 1000)
                                {
                                    Buffer.BlockCopy(reader.PairBuffer, 0, previous, 0, 40);
                                    hadSample = true;
                                    lastPublished = began;
                                    Publish(position.Json(++sequence, reader.ReadBytes, discovery.ReadBytes,
                                        began, began - lastChanged, player, profile.Source));
                                }
                                // A dead character can leave behind a structurally
                                // valid, frozen player/camera pair. Follow a nearby
                                // pair only after observing it actually move.
                                if (began - lastChanged >= 1000)
                                {
                                    long movingPlayer = discovery.FindMovingNeighbor(player, began);
                                    if (movingPlayer != 0)
                                    {
                                        player = movingPlayer;
                                        hadSample = false;
                                    }
                                }
                            }
                        }
                        // Work consumes part of the period; no catch-up bursts after a stall.
                        int wait = (int)Math.Max(1, 50 - (clock.ElapsedMilliseconds - began));
                        Thread.Sleep(wait);
                    }
                }
                Publish("{\"state\":\"stopped\"}");
            }
            catch (Exception error)
            {
                var windowsError = error as System.ComponentModel.Win32Exception;
                Publish("{\"state\":\"unavailable\",\"error\":\"" + error.GetType().Name + "\",\"errorCode\":" + (windowsError == null ? 0 : windowsError.NativeErrorCode) + "}");
            }
        }
    }

    internal struct Position
    {
        internal double X, Y, Z, Dx, Dz;
        internal string Json(long sequence, long bytes, long searchBytes, long elapsed, long unchanged, long address, string layoutSource)
        {
            return String.Format(CultureInfo.InvariantCulture,
                "{{\"state\":\"live\",\"sequence\":{0},\"x\":{1:R},\"y\":{2:R},\"z\":{3:R},\"dx\":{4:R},\"dz\":{5:R},\"readBytes\":{6},\"searchBytes\":{7},\"elapsedMs\":{8},\"unchangedMs\":{9},\"address\":\"{10:x}\",\"layoutSource\":\"{11}\"}}",
                sequence, X, Y, Z, Dx, Dz, bytes, searchBytes, elapsed, unchanged, address, layoutSource);
        }
    }

    internal class MemoryReader : IDisposable
    {
        internal readonly IntPtr Handle;
        internal readonly byte[] PairBuffer = new byte[284];
        internal readonly byte[] ScanBuffer = new byte[65536];
        private readonly Native.Page[] pages = new Native.Page[17];
        private readonly byte[] pointer = new byte[8];
        private static readonly int[] CameraPointers = { 168, 184, 192, 216, 224, 232, 240 };
        internal long ReadBytes;
        protected MemoryReader() { }

        internal MemoryReader(int pid)
        {
            Handle = Native.OpenProcess(0x0410, false, pid);
            if (Handle == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        public void Dispose() { if (Handle != IntPtr.Zero) Native.CloseHandle(Handle); }

        internal virtual bool Read(long address, byte[] buffer, int count)
        {
            UIntPtr received;
            bool ok = Native.ReadProcessMemory(Handle, new IntPtr(address), buffer, new UIntPtr((uint)count), out received);
            ReadBytes += (long)received.ToUInt64();
            return ok && received.ToUInt64() == (ulong)count;
        }
        internal virtual bool Resident(long address, int count)
        {
            long first = address & ~4095L;
            int length = (int)(((address + count - 1) & ~4095L) - first) / 4096 + 1;
            if (length < 1 || length > pages.Length) return false;
            for (int i = 0; i < length; i++) { pages[i].Address = new IntPtr(first + i * 4096); pages[i].Flags = UIntPtr.Zero; }
            if (!Native.QueryWorkingSetEx(Handle, pages, length * 16)) return false;
            for (int i = 0; i < length; i++) if ((pages[i].Flags.ToUInt64() & 1) == 0) return false;
            return true;
        }
        internal long Pointer(long address)
        {
            return Resident(address, 8) && Read(address, pointer, 8) ? BitConverter.ToInt64(pointer, 0) : 0;
        }
        internal virtual bool PrivateArena(long address, long size)
        {
            if (address < 65536 || (address & 65535) != 0 || size < 16 * 1024 * 1024 || size > 0x100000000L
                || (size & 4095) != 0 || address > 0x7fffffff0000L - size) return false;
            Native.MemoryInfo first, last;
            return Native.VirtualQueryEx(Handle, new IntPtr(address), out first, new UIntPtr(48)) != UIntPtr.Zero
                && Native.VirtualQueryEx(Handle, new IntPtr(address + size - 1), out last, new UIntPtr(48)) != UIntPtr.Zero
                && first.AllocationBase.ToInt64() == address && last.AllocationBase.ToInt64() == address
                && first.Type == 0x20000 && (first.Protect & 0x100) == 0;
        }
        internal virtual int ResidentMask(long block)
        {
            for (int i = 0; i < 16; i++) { pages[i].Address = new IntPtr(block + i * 4096); pages[i].Flags = UIntPtr.Zero; }
            if (!Native.QueryWorkingSetEx(Handle, pages, 16 * 16)) return 0;
            int mask = 0;
            for (int i = 0; i < 16; i++) if ((pages[i].Flags.ToUInt64() & 1) != 0) mask |= 1 << i;
            return mask;
        }
        internal bool ReadPlayerPair(long address, out Position position)
        {
            position = new Position();
            if (!Resident(address, PairBuffer.Length) || !Read(address, PairBuffer, PairBuffer.Length)) return false;
            return DecodePair(PairBuffer, out position) || DecodeCameraTarget(PairBuffer, out position);
        }
        internal static bool DecodeCameraTarget(byte[] data, out Position position)
        {
            position = new Position();
            if (data.Length < 284) return false;
            double cx, cy, cz;
            if (!Transform(data, 0, out cx, out cy, out cz)) return false;
            for (int i = 40; i < 52; i += 4) if (BitConverter.ToSingle(data, i) != 1f) return false;
            if (BitConverter.ToInt64(data, 128) != 1 || BitConverter.ToInt64(data, 160) != 1
                || BitConverter.ToInt64(data, 176) != 1) return false;
            foreach (int at in CameraPointers)
            {
                long pointer = BitConverter.ToInt64(data, at);
                if (pointer < 65536 || pointer > 0x7fffffff0000L || (pointer & 7) != 0) return false;
            }
            float aspect = BitConverter.ToSingle(data, 60), near = BitConverter.ToSingle(data, 64);
            float far = BitConverter.ToSingle(data, 68), fov = BitConverter.ToSingle(data, 72);
            if (!(aspect > .35 && aspect < 5 && near >= .001 && near <= 1 && far >= 100 && far < 10000000 && fov > .1 && fov < 3.2)) return false;
            for (int i = 60; i <= 72; i += 4)
                if (BitConverter.ToInt32(data, i) != BitConverter.ToInt32(data, i + 200)) return false;
            double x = BitConverter.ToInt64(data, 136) / 4294967296.0;
            double y = BitConverter.ToInt64(data, 144) / 4294967296.0;
            double z = BitConverter.ToInt64(data, 152) / 4294967296.0;
            if (!(x > 1 && x < 11000 && y > -2000 && y < 5000 && z > 1 && z < 11000)
                || (x-cx)*(x-cx)+(y-cy)*(y-cy)+(z-cz)*(z-cz) > 4096) return false;
            // The camera's tracked target is the character position; camera
            // translation itself must never be published as the player marker.
            // Facing represents the player's camera view, while translation
            // remains the tracked character target.
            double qx = BitConverter.ToSingle(data, 24), qy = BitConverter.ToSingle(data, 28);
            double qz = BitConverter.ToSingle(data, 32), qw = BitConverter.ToSingle(data, 36);
            double dx = 2 * (qx*qz + qw*qy), dz = 1 - 2*(qx*qx + qy*qy);
            double length = Math.Sqrt(dx*dx+dz*dz);
            position = new Position { X = x, Y = y, Z = z, Dx = length > .001 ? dx / length : 0, Dz = length > .001 ? dz / length : 0 };
            return true;
        }
        internal static bool DecodePair(byte[] data, out Position position)
        {
            position = new Position();
            if (data.Length < 284) return false;
            double x, y, z, cx, cy, cz;
            if (!Transform(data, 0, out x, out y, out z) || !Transform(data, 224, out cx, out cy, out cz)) return false;
            if ((x-cx)*(x-cx)+(y-cy)*(y-cy)+(z-cz)*(z-cz) > 4096) return false;
            // Structural local-player/camera pair signature; reject changed layouts.
            for (int i = 40; i < 52; i += 4) if (BitConverter.ToSingle(data, i) != 1f) return false;
            for (int i = 56; i < 224; i++) if (data[i] != 0) return false;
            float distance = BitConverter.ToSingle(data, 264), fov = BitConverter.ToSingle(data, 268);
            float aspect = BitConverter.ToSingle(data, 272), near = BitConverter.ToSingle(data, 276);
            float far = BitConverter.ToSingle(data, 280);
            if (!(distance >= 0 && distance < 512 && fov > .1 && fov < 3.2 && aspect > .35 && aspect < 5
                && near >= .001 && near <= 1 && far >= 100 && far < 10000000)) return false;
            double qx = BitConverter.ToSingle(data, 24), qy = BitConverter.ToSingle(data, 28);
            double qz = BitConverter.ToSingle(data, 32), qw = BitConverter.ToSingle(data, 36);
            double dx = 2 * (qx*qz + qw*qy), dz = 1 - 2*(qx*qx + qy*qy);
            double length = Math.Sqrt(dx*dx+dz*dz);
            position = new Position { X=x, Y=y, Z=z, Dx=length>.001 ? dx/length : 0, Dz=length>.001 ? dz/length : 0 };
            return true;
        }
        private static bool Transform(byte[] data, int offset, out double x, out double y, out double z)
        {
            x = BitConverter.ToInt64(data, offset) / 4294967296.0;
            y = BitConverter.ToInt64(data, offset+8) / 4294967296.0;
            z = BitConverter.ToInt64(data, offset+16) / 4294967296.0;
            double norm = 0;
            for (int i = 24; i < 40; i += 4) { double q = BitConverter.ToSingle(data, offset+i); norm += q*q; }
            return x > 1 && x < 11000 && y > -2000 && y < 5000 && z > 1 && z < 11000 && norm > .95 && norm < 1.05;
        }
    }

    internal sealed class Discovery
    {
        private readonly MemoryReader reader;
        private readonly RootLayout profile;
        private readonly ArenaLocator locator;
        private readonly string cacheFile;
        private long cachedOffset;
        private long cursor, upper, arena, nearbyCursor, nearbyUpper;
        private bool nearbyFinished;
        private long neighborCursor, neighborUpper, nextNeighborScan;
        private readonly List<Neighbor> neighbors = new List<Neighbor>();
        private long lastPreferredProbe = -500;
        internal long ReadBytes;
        internal bool Finished;
        internal Discovery(MemoryReader memory, long moduleBase, RootLayout buildProfile)
        {
            reader=memory; profile=buildProfile;
            string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EnshroudedCompanion");
            locator = new ArenaLocator(memory, moduleBase, profile, directory);
            cacheFile = Path.Combine(directory, "player-offset-v2.txt");
            RootLayout.TryReadOffset(cacheFile, out cachedOffset);
            // One-time migration of the previous reader's hint. It is never trusted
            // until the new root, arena and complete player/camera pair validate.
            try
            {
                if (cachedOffset < 0 && Directory.Exists(directory))
                {
                    string[] previous = Directory.GetFiles(directory, "position-*.txt");
                    Array.Sort(previous, delegate(string a, string b) { return File.GetLastWriteTimeUtc(b).CompareTo(File.GetLastWriteTimeUtc(a)); });
                    foreach (string file in previous) if (RootLayout.TryReadOffset(file, out cachedOffset)) break;
                }
            }
            catch (IOException) { cachedOffset = -1; }
            catch (UnauthorizedAccessException) { cachedOffset = -1; }
        }
        internal void Reset()
        {
            cursor=0; nearbyFinished=false; Finished=false;
            neighborCursor=0; neighbors.Clear(); nextNeighborScan=0;
            locator.Reset();
        }
        internal bool ValidateArena() { return locator.Validate(); }
        internal string Status(string state)
        {
            return String.Format(CultureInfo.InvariantCulture,
                "{{\"state\":\"{0}\",\"layoutSource\":\"{1}\",\"reason\":\"{2}\",\"rootRva\":{3},\"arenaField\":{4},\"arenaCandidates\":{5},\"searchBytes\":{6}}}",
                state, profile.Source, locator.Reason, profile.RootRva, locator.Field, locator.CandidateCount, ReadBytes + locator.ScanBytes);
        }
        internal void Confirm(long player)
        {
            if (player < arena || player > upper - 284 || !locator.Validate()) return;
            locator.Confirm(); Remember(player - arena);
        }

        internal long Step(long elapsed, bool allowScan)
        {
            if (cursor == 0 && !allowScan && elapsed - lastPreferredProbe < 500) return 0;
            if (cursor == 0)
            {
                if (!locator.Step(elapsed, cachedOffset)) return 0;
                arena = locator.Address;
                long size = locator.Size;
                cursor = arena;
                upper = arena + size;
                if (locator.PlayerOffset >= 0) cachedOffset = locator.PlayerOffset;
                // Respawning can move the player component within the same arena.
                // Search around its last validated offset before traversing the
                // whole arena. The nearby pass is still paged and time-budgeted.
                long preferred = cachedOffset;
                long center = preferred & ~65535L;
                nearbyCursor = arena + Math.Max(0, center - 8L * 1024 * 1024);
                nearbyUpper = arena + Math.Min(size, center + 8L * 1024 * 1024 + 65536);
                nearbyFinished = preferred < 0 || preferred >= size;
                Finished = false;
            }
            // A prior process's offset may initially be empty while the world
            // loads. Probe it every 500 ms, including during the scan cooldown.
            if (elapsed - lastPreferredProbe >= 500)
            {
                lastPreferredProbe = elapsed;
                long cached = Probe(cachedOffset);
                if (cached != 0) return cached;
            }
            if (!allowScan) return 0;
            long start = Stopwatch.GetTimestamp();
            int blocks = 0;
            while ((!nearbyFinished || cursor < upper) && blocks++ < 32)
            {
                long block;
                if (!nearbyFinished)
                {
                    block = nearbyCursor;
                    nearbyCursor += 65536;
                    if (nearbyCursor >= nearbyUpper) nearbyFinished = true;
                }
                else
                {
                    block = cursor;
                    cursor += 65536;
                }
                long found = ScanBlock(block, 0, null);
                if (found != 0) return found;
                // At most roughly 1 ms work per 50 ms tick, plus the final 64 KiB block.
                if ((Stopwatch.GetTimestamp()-start)*1000.0/Stopwatch.Frequency >= 1) break;
            }
            Finished = nearbyFinished && cursor >= upper;
            return 0;
        }

        // Called only while the selected pair is frozen. Scanning is bounded
        // to the nearby arena and each tick gets the same 1 ms work budget as
        // initial discovery. Known candidates are cheap to sample at 20 Hz.
        internal long FindMovingNeighbor(long selected, long elapsed)
        {
            for (int i=neighbors.Count-1; i>=0; i--)
            {
                Neighbor neighbor = neighbors[i];
                Position position;
                if (!reader.ReadPlayerPair(neighbor.Address, out position))
                { neighbors.RemoveAt(i); continue; }
                double movement = (position.X-neighbor.Position.X)*(position.X-neighbor.Position.X)
                    + (position.Y-neighbor.Position.Y)*(position.Y-neighbor.Position.Y)
                    + (position.Z-neighbor.Position.Z)*(position.Z-neighbor.Position.Z);
                double turning = (position.Dx-neighbor.Position.Dx)*(position.Dx-neighbor.Position.Dx)
                    + (position.Dz-neighbor.Position.Dz)*(position.Dz-neighbor.Position.Dz);
                neighbor.Position = position;
                if (movement > .01 || turning > .01)
                {
                    long address = neighbor.Address;
                    neighborCursor=0; neighbors.Clear(); nextNeighborScan=0;
                    return address;
                }
            }
            if (neighborCursor == 0)
            {
                if (elapsed < nextNeighborScan) return 0;
                long center = (selected-arena) & ~65535L;
                neighborCursor = arena + Math.Max(0, center - 8L * 1024 * 1024);
                neighborUpper = arena + Math.Min(upper-arena, center + 8L * 1024 * 1024 + 65536);
            }
            long start = Stopwatch.GetTimestamp();
            int blocks = 0;
            while (neighborCursor < neighborUpper && blocks++ < 32)
            {
                long block = neighborCursor;
                neighborCursor += 65536;
                ScanBlock(block, selected, neighbors);
                if ((Stopwatch.GetTimestamp()-start)*1000.0/Stopwatch.Frequency >= 1) break;
            }
            if (neighborCursor >= neighborUpper)
            { neighborCursor=0; nextNeighborScan=elapsed+5000; }
            return 0;
        }

        private sealed class Neighbor
        {
            internal long Address;
            internal Position Position;
        }

        private long ScanBlock(long block, long excluded, List<Neighbor> found)
        {
            int mask = reader.ResidentMask(block);
            if (mask == 0) return 0;
            int page=0;
            while (page<16)
            {
                if ((mask & (1 << page))==0 || block + page * 4096 >= upper) { page++; continue; }
                int first=page++;
                while (page<16 && (mask & (1 << page))!=0 && block + page * 4096 < upper) page++;
                int size=(page-first)*4096;
                long at=block+first*4096;
                if (!reader.Read(at, reader.ScanBuffer, size)) continue;
                ReadBytes += size;
                for (int offset=0; offset<size; offset+=4)
                {
                    // The camera near/far planes are an inexpensive structural anchor.
                    if (reader.ScanBuffer[offset] != 0x0a || BitConverter.ToInt32(reader.ScanBuffer, offset)!=0x3c23d70a
                        || (offset+4<size && BitConverter.ToInt32(reader.ScanBuffer, offset+4)!=0x461c4000)) continue;
                    long address = at+offset-((offset & 7) == 0 ? 64 : 276);
                    if (address == excluded || address < arena || address > upper - 284) continue;
                    Position position;
                    if (!reader.ReadPlayerPair(address, out position)) continue;
                    if (found == null) return address;
                    bool known = false;
                    foreach (Neighbor neighbor in found)
                        if (neighbor.Address == address) { known=true; break; }
                    if (!known && found.Count < 32)
                        found.Add(new Neighbor { Address=address, Position=position });
                }
            }
            return 0;
        }

        private long Probe(long offset)
        {
            Position position;
            long size = upper - arena;
            if (offset < 0 || size < 284 || offset > size - 284
                || !reader.ReadPlayerPair(arena + offset, out position)) return 0;
            return arena + offset;
        }

        private void Remember(long offset)
        {
            cachedOffset = offset;
            RootLayout.WriteOffset(cacheFile, offset);
        }
    }

    internal static class Native
    {
        [StructLayout(LayoutKind.Sequential)] internal struct MemoryInfo
        {
            internal IntPtr BaseAddress, AllocationBase;
            internal uint AllocationProtect;
            internal UIntPtr RegionSize;
            internal uint State, Protect, Type;
        }
        [StructLayout(LayoutKind.Sequential)] internal struct Page { internal IntPtr Address; internal UIntPtr Flags; }
        [DllImport("kernel32.dll", SetLastError=true)] internal static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool ReadProcessMemory(IntPtr process, IntPtr address, [Out] byte[] buffer, UIntPtr size, out UIntPtr read);
        [DllImport("kernel32.dll")] internal static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")] internal static extern bool GetExitCodeProcess(IntPtr process, out uint code);
        [DllImport("kernel32.dll")] internal static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out MemoryInfo info, UIntPtr size);
        [DllImport("psapi.dll", SetLastError=true)] internal static extern bool QueryWorkingSetEx(IntPtr process, [In, Out] Page[] pages, int bytes);
    }
}
