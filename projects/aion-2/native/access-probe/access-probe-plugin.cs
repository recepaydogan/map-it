using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Principal;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace OverwolfAccessProbe
{
    public sealed class AccessProbe
    {
        private readonly object gate = new object();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private PositionScanner scanner;
        private Dictionary<string, double[]> catalog;
        private int pid, map;
        private string sessionFile, lastState;
        private DateTime nextSessionCheck, nextProcessCheck, nextLog;
        private readonly string logDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GameMapTracker", "logs");

        public void poll(string processName, string sessionDirectory, string projections, Action<object> callback)
        {
            if (callback == null) return;
            ThreadPool.QueueUserWorkItem(_ => {
                lock (gate) {
                    object result;
                    try { result = Poll(processName, sessionDirectory, projections); }
                    catch (Exception error) { Reset(); result = new { state = "reader-error", error = error.ToString() }; }
                    string serialized = json.Serialize(result);
                    var fields = json.Deserialize<Dictionary<string, object>>(serialized);
                    string state = Convert.ToString(fields["state"]);
                    object address;
                    if (fields.TryGetValue("address", out address)) state += ":" + Convert.ToString(address);
                    if (state != lastState || DateTime.UtcNow >= nextLog) {
                        WriteLog(serialized); lastState = state; nextLog = DateTime.UtcNow.AddSeconds(5);
                    }
                    callback(result);
                }
            });
        }

        public void stop(Action<object> callback)
        {
            lock (gate) { Reset(); nextProcessCheck = DateTime.MinValue; }
            if (callback != null) callback(new { state = "stopped" });
        }

        private object Poll(string processName, string directory, string projections)
        {
            if (!Regex.IsMatch(processName ?? "", @"\A[\w.-]{1,80}\z")) return new { state = "invalid-process-name" };
            if (DateTime.UtcNow >= nextProcessCheck) {
                nextProcessCheck = DateTime.UtcNow.AddSeconds(2);
                int selected = 0; long largest = 0; DateTime started = DateTime.MinValue;
                foreach (Process process in Process.GetProcessesByName(processName)) {
                    using (process) {
                        if (process.WorkingSet64 <= largest) continue;
                        largest = process.WorkingSet64; selected = process.Id; started = process.StartTime.ToUniversalTime();
                    }
                }
                if (selected != pid) {
                    Reset(); pid = selected;
                    if (pid != 0) sessionFile = FindSession(directory, started);
                    WriteLog(json.Serialize(new { state = "process-changed", processId = pid, sessionFound = sessionFile != null }));
                }
                if (pid != 0 && sessionFile == null) sessionFile = FindSession(directory, started);
            }
            if (pid == 0) return new { state = "game-not-running" };
            if (DateTime.UtcNow >= nextSessionCheck) {
                nextSessionCheck = DateTime.UtcNow.AddSeconds(1);
                int current = ReadMap(sessionFile);
                if (current != map) {
                    if (scanner != null) scanner.Dispose();
                    scanner = null; map = current;
                    WriteLog(json.Serialize(new { state = "map-changed", processId = pid, nativeMapId = map }));
                }
            }
            if (map == 0) return new { state = "waiting-for-map", processId = pid };
            if (catalog == null) catalog = json.Deserialize<Dictionary<string, double[]>>(projections);
            double[] bounds;
            if (!catalog.TryGetValue(map.ToString(), out bounds) || bounds.Length != 4)
                return new { state = "unsupported-map", processId = pid, nativeMapId = map };
            if (scanner == null) scanner = new PositionScanner(pid, bounds);
            if (scanner.Error != 0) {
                int error = scanner.Error; scanner.Dispose(); scanner = null;
                using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
                    return new { state = "access-denied", processId = pid, nativeMapId = map, error,
                        elevated = new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator) };
            }
            return scanner.Tick(pid, map);
        }

        private static string FindSession(string relativeDirectory, DateTime started)
        {
            string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string directory = Path.GetFullPath(Path.Combine(root, relativeDirectory));
            if (!directory.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !Directory.Exists(directory)) return null;
            string match = null; double best = 600;
            foreach (string file in Directory.GetFiles(directory, "*.execution.json")) {
                var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(file));
                object value; DateTimeOffset time;
                if (!data.TryGetValue("appStartTime", out value) || !DateTimeOffset.TryParse(Convert.ToString(value), out time)) continue;
                double age = (time.UtcDateTime - started).TotalSeconds;
                // Reporter initialization can lag process creation. Never reuse an older session.
                if (age < -3 || time.UtcDateTime > DateTime.UtcNow.AddSeconds(5)) continue;
                double difference = Math.Abs(age);
                string breadcrumb = file.Replace(".execution.json", ".breadcrumb.log");
                if (difference < best && File.Exists(breadcrumb)) { best = difference; match = breadcrumb; }
            }
            return match;
        }

        internal static int ReadMap(string file)
        {
            if (file == null) return 0;
            // The directory entry can be stale while the game's writer is open.
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) {
                if (stream.Length > 65536) stream.Seek(-65536, SeekOrigin.End);
                using (var reader = new StreamReader(stream)) {
                    string text = reader.ReadToEnd();
                    MatchCollection hits = Regex.Matches(text, @"LoadComplete\.Map\((\d+)\)");
                    if (hits.Count == 0) return 0;
                    Match hit = hits[hits.Count - 1];
                    if (Regex.IsMatch(text.Substring(hit.Index + hit.Length), @"\b(?:Logout|Disconnect|LoadStart)\b")) return 0;
                    return Int32.Parse(hit.Groups[1].Value);
                }
            }
        }

        private void Reset()
        {
            if (scanner != null) scanner.Dispose();
            scanner = null; pid = 0; map = 0; sessionFile = null; nextSessionCheck = DateTime.MinValue;
        }

        private void WriteLog(string text)
        {
            try {
                Directory.CreateDirectory(logDirectory);
                string path = Path.Combine(logDirectory, "live-position.log");
                if (File.Exists(path) && new FileInfo(path).Length > 2 * 1024 * 1024) {
                    string previous = path + ".1";
                    if (File.Exists(previous)) File.Delete(previous);
                    File.Move(path, previous);
                }
                File.AppendAllText(path, DateTime.UtcNow.ToString("O") + " " + text + Environment.NewLine);
            } catch (Exception error) { Trace.TraceError("Live position log: " + error); }
        }
    }
}

