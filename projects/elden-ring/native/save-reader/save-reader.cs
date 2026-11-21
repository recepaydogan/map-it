using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;

namespace EldenRingAtlas
{
    public sealed class SaveReader
    {
        private readonly object gate = new object();
        private readonly Dictionary<string, SavePosition[]> cache = new Dictionary<string, SavePosition[]>();
        private readonly Dictionary<string, long> stamps = new Dictionary<string, long>();
        private string activeId;
        private int polls;
        private const int SlotSize = 0x280000;

        public void Read(Action<object> callback)
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                string json;
                lock (gate) json = ReadJson();
                callback(json);
            });
        }

        // Also used by the local read-only validation script.
        public string ReadJson()
        {
            lock (gate)
            {
                try
                {
                    string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "EldenRing");
                    var files = Directory.Exists(root)
                        ? Directory.GetDirectories(root).Select(dir => Path.Combine(dir, "ER0000.sl2")).Where(File.Exists).OrderBy(path => path).ToArray()
                        : new string[0];
                    foreach (string stale in cache.Keys.Except(files).ToArray()) { cache.Remove(stale); stamps.Remove(stale); }
                    var changed = new List<string>();
                    bool force = (++polls % 5) == 0;
                    foreach (string file in files)
                    {
                        long stamp = File.GetLastWriteTimeUtc(file).Ticks;
                        if (!force && stamps.ContainsKey(file) && stamps[file] == stamp) continue;
                        SavePosition[] previous;
                        cache.TryGetValue(file, out previous);
                        var current = ReadFile(file, stamp);
                        if (previous != null)
                        {
                            foreach (var sample in current)
                            {
                                var old = previous.FirstOrDefault(value => value.id == sample.id);
                                if (old == null || old.checksum != sample.checksum) changed.Add(sample.id);
                            }
                        }
                        cache[file] = current;
                        stamps[file] = stamp;
                    }
                    var characters = cache.Values.SelectMany(value => value).ToArray();
                    if (changed.Count == 1) activeId = changed[0];
                    if (!characters.Any(value => value.id == activeId)) activeId = characters.Length == 1 ? characters[0].id : null;
                    return Json(new { state = characters.Length == 0 ? "no-save" : "ready", characters, activeId });
                }
                catch (IOException error) { return Json(new { state = "retry", error = error.Message }); }
                catch (UnauthorizedAccessException error) { return Json(new { state = "error", error = error.Message }); }
                catch (Exception error) { return Json(new { state = "error", error = error.Message }); }
            }
        }

        private static string Json(object value) { return new JavaScriptSerializer().Serialize(value); }

        private static SavePosition[] ReadFile(string path, long stamp)
        {
            var positions = new List<SavePosition>();
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var reader = new BinaryReader(stream))
            using (var md5 = MD5.Create())
            {
                if (stream.Length < 0x300 + 10L * (SlotSize + 16) || stream.Length > 40000000)
                    throw new InvalidDataException("Unsupported save size.");
                if (reader.ReadUInt32() != 0x34444E42) throw new InvalidDataException("Unsupported save signature.");
                for (int slot = 0; slot < 10; slot++)
                {
                    stream.Position = 0x300 + slot * (SlotSize + 16L);
                    byte[] checksum = reader.ReadBytes(16);
                    byte[] bytes = reader.ReadBytes(SlotSize);
                    if (bytes.Length != SlotSize) throw new EndOfStreamException("Save is being replaced.");
                    if (BitConverter.ToUInt32(bytes, 0) == 0) continue;
                    if (!md5.ComputeHash(bytes).SequenceEqual(checksum)) throw new IOException("Save is being updated; retrying.");
                    var sample = SlotParser.Read(bytes);
                    if (sample == null) continue;
                    sample.slot = slot + 1;
                    // Do not expose a filesystem path or Steam ID to the UI.
                    using (var sha = SHA256.Create())
                        sample.id = BitConverter.ToString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(path))).Replace("-", "").Substring(0, 16) + ":" + sample.slot;
                    sample.checksum = BitConverter.ToString(checksum);
                    sample.savedAt = (new DateTime(stamp, DateTimeKind.Utc) - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                    positions.Add(sample);
                }
            }
            if (File.GetLastWriteTimeUtc(path).Ticks != stamp) throw new IOException("Save changed during read; retrying.");
            return positions.ToArray();
        }
    }
}
