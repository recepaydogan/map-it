using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace OverwolfAccessProbe
{
    internal sealed class ReadLimitException : Exception { }

    internal struct MemoryRegion
    {
        public long Start, End;
        public bool Readable, Writable;
    }

    // Shared by the operating-system reader and the deterministic memory fixtures.
    // No write or remote execution operation is exposed.
    internal abstract class ProcessMemory : IDisposable
    {
        public long ModuleBase, ModuleEnd;
        public string ImageKey;
        public int Error { get; protected set; }
        public int ReadCalls { get; private set; }
        public int ReadBytes { get; private set; }
        public int FailedReads { get; private set; }
        public long TotalBytes { get; private set; }
        public void BeginTick() { ReadCalls = 0; ReadBytes = 0; FailedReads = 0; }
        public static bool Pointer(long address) { return address >= 65536 && address < 0x00007FFFFFFF0000L && (address & 7) == 0; }
        public byte[] Read(long address, int size)
        {
            if (size < 1 || size > 65536 || address < 65536 || address > 0x00007FFFFFFF0000L - size) return null;
            if (ReadCalls >= 768 || ReadBytes + size > 512 * 1024) throw new ReadLimitException();
            ReadCalls++; ReadBytes += size; TotalBytes += size;
            byte[] data = new byte[size];
            if (ReadCore(address, data)) return data;
            FailedReads++; return null;
        }
        public long PointerAt(long address) { byte[] data = Read(address, 8); return data == null ? 0 : BitConverter.ToInt64(data, 0); }
        public abstract bool Query(long address, out MemoryRegion region);
        protected abstract bool ReadCore(long address, byte[] data);
        public abstract void Dispose();
    }

    internal sealed class WindowsProcessMemory : ProcessMemory
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct NativeRegion {
            public IntPtr BaseAddress, AllocationBase;
            public uint AllocationProtect, Padding;
            public UIntPtr RegionSize;
            public uint State, Protect, Type;
        }
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")]
        private static extern bool ReadProcessMemory(IntPtr handle, IntPtr address, [Out] byte[] buffer, UIntPtr count, out UIntPtr read);
        [DllImport("kernel32.dll")]
        private static extern UIntPtr VirtualQueryEx(IntPtr handle, IntPtr address, out NativeRegion info, UIntPtr size);
        private IntPtr handle;
        public WindowsProcessMemory(int pid)
        {
            handle = OpenProcess(0x0410, false, pid);
            Error = handle == IntPtr.Zero ? Marshal.GetLastWin32Error() : 0;
            if (Error != 0) return;
            try {
                using (Process target = Process.GetProcessById(pid)) {
                    ProcessModule module = target.MainModule;
                    ModuleBase = module.BaseAddress.ToInt64();
                    ModuleEnd = ModuleBase + module.ModuleMemorySize;
                    // Cheap cache partition, not a trust decision. Live validation is
                    // still required even if a replacement file preserves its metadata.
                    var info = new FileInfo(module.FileName);
                    string identity = info.FullName.ToUpperInvariant() + "|" + info.Length + "|" + info.LastWriteTimeUtc.Ticks + "|" + module.ModuleMemorySize;
                    using (SHA256 hash = SHA256.Create()) ImageKey = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(identity))).Replace("-", "").ToLowerInvariant();
                }
            } catch { Dispose(); throw; }
        }
        protected override bool ReadCore(long address, byte[] data)
        {
            UIntPtr read;
            return ReadProcessMemory(handle, new IntPtr(address), data, new UIntPtr((uint)data.Length), out read)
                && read.ToUInt64() == (ulong)data.Length;
        }
        public override bool Query(long address, out MemoryRegion region)
        {
            NativeRegion info; region = new MemoryRegion();
            if (VirtualQueryEx(handle, new IntPtr(address), out info, new UIntPtr((uint)Marshal.SizeOf(typeof(NativeRegion)))) == UIntPtr.Zero) return false;
            long start = info.BaseAddress.ToInt64(); ulong size = info.RegionSize.ToUInt64();
            if (start < 0 || size == 0 || size > (ulong)(Int64.MaxValue - start)) return false;
            uint protection = info.Protect & 255;
            region.Start = start; region.End = start + (long)size;
            region.Readable = info.State == 0x1000 && protection != 0 && protection != 1 && (info.Protect & 0x100) == 0;
            region.Writable = protection == 4 || protection == 8 || protection == 64 || protection == 128;
            return true;
        }
        public override void Dispose() { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }
    }
}
