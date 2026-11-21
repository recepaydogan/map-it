using System;
using System.Collections.Generic;
using System.IO;
using System.Security;
using System.Web.Script.Serialization;

namespace OverwolfAccessProbe
{
    internal sealed class DiscoveryHints
    {
        public int Version { get; set; }
        public string ImageKey { get; set; }
        public long NameBlocksRva { get; set; }
        public long ObjectsRva { get; set; }
        public Dictionary<string, int> ClassIndices { get; set; }
        public int[] EngineIndices { get; set; }
    }

    internal interface IDiscoveryCache
    {
        DiscoveryHints Load();
        void Save(DiscoveryHints hints);
        string Status { get; }
    }

    // Hints only: no pawn addresses, coordinates, trusted identity flags, or
    // reflection offsets are persisted. Every hint is revalidated in live memory.
    internal sealed class FileDiscoveryCache : IDiscoveryCache
    {
        private readonly string imageKey, file;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8192, RecursionLimit = 8 };
        private string lastContent;
        public string Status { get; private set; }
        public FileDiscoveryCache(string key, string directory)
        {
            imageKey = key;
            if (String.IsNullOrEmpty(key) || key.Length != 64) { Status = "disabled-no-image-key"; return; }
            foreach (char c in key) if (!Uri.IsHexDigit(c)) { Status = "disabled-invalid-image-key"; return; }
            file = Path.Combine(directory, key + ".json"); Status = "not-loaded";
        }
        public DiscoveryHints Load()
        {
            if (file == null) return null;
            try {
                if (!File.Exists(file)) { Status = "miss"; return null; }
                using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) {
                    if (stream.Length < 1 || stream.Length > 8192) { Status = "invalid-size"; return null; }
                    using (var reader = new StreamReader(stream)) lastContent = reader.ReadToEnd();
                }
                DiscoveryHints value = json.Deserialize<DiscoveryHints>(lastContent);
                if (value == null || value.Version != 1 || value.ImageKey != imageKey) { Status = "incompatible"; return null; }
                Status = "loaded"; return value;
            } catch (IOException) { Status = "read-io-error"; }
            catch (UnauthorizedAccessException) { Status = "read-access-denied"; }
            catch (SecurityException) { Status = "read-access-denied"; }
            catch (ArgumentException) { Status = "invalid-json"; }
            catch (InvalidOperationException) { Status = "invalid-json"; }
            return null;
        }
        public void Save(DiscoveryHints hints)
        {
            if (file == null) return;
            string content = json.Serialize(hints);
            if (content == lastContent) { Status = "unchanged"; return; }
            string temporary = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try {
                Directory.CreateDirectory(Path.GetDirectoryName(file));
                File.WriteAllText(temporary, content);
                if (File.Exists(file)) File.Replace(temporary, file, null);
                else File.Move(temporary, file);
                lastContent = content; Status = "saved";
            } catch (IOException) { Status = "write-io-error"; }
            catch (UnauthorizedAccessException) { Status = "write-access-denied"; }
            catch (SecurityException) { Status = "write-access-denied"; }
            finally {
                try { if (File.Exists(temporary)) File.Delete(temporary); }
                catch (IOException) { Status += ":temp-cleanup-failed"; }
                catch (UnauthorizedAccessException) { Status += ":temp-cleanup-denied"; }
                catch (SecurityException) { Status += ":temp-cleanup-denied"; }
            }
        }
    }
}
