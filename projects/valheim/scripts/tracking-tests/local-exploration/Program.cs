using System.Collections;
using System.IO.Compression;
using System.Reflection;
using System.Text.Json;

// Compile the actual production plugin against a minimal game host. This checks
// its remote-session guard and wire format without loading or changing a game.
static class Program
{
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static void Call(LocalExploration plugin, string method) => typeof(LocalExploration).GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(plugin, null);
    static JsonDocument Read(string path) => JsonDocument.Parse(File.ReadAllText(path));
    static byte[] Unpack(JsonElement record)
    {
        using var input = new MemoryStream(Convert.FromBase64String(record.GetProperty("personalGzip").GetString()!));
        using var gzip = new GZipStream(input, CompressionMode.Decompress);
        using var result = new MemoryStream();
        gzip.CopyTo(result);
        return result.ToArray();
    }

    public static void Main()
    {
        var root = Path.Combine(Path.GetTempPath(), "valheim-local-exploration-" + Guid.NewGuid());
        Directory.CreateDirectory(root);
        try
        {
            BepInEx.Paths.PluginPath = root;
            var plugin = new LocalExploration();
            Call(plugin, "Awake");
            var output = Path.Combine(root, "ValheimCompanion", "local-exploration.json");
            ZNet.instance = new ZNet { Local = false };
            Player.m_localPlayer = new Player();
            Minimap.ForbidAccess = true;
            Call(plugin, "Update");
            Check(!File.Exists(output), "A remote session produced exploration output");

            UnityEngine.Time.unscaledTime = 2;
            ZNet.instance.Local = true;
            Minimap.ForbidAccess = false;
            var own = new BitArray(256);
            own[169] = true;
            Minimap.Active = new Minimap(own);
            Call(plugin, "Update");
            using (var data = Read(output))
            {
                var record = data.RootElement;
                var packed = Unpack(record);
                Check(record.GetProperty("isLocal").GetBoolean(), "Missing local identity");
                Check(record.GetProperty("worldUid").GetString() == "123", "Wrong world UID");
                Check(record.GetProperty("characterId").GetString() == "42", "Wrong character identity");
                Check(packed.Length == 32 && packed[21] == 2 && packed.Count(b => b != 0) == 1, "Personal/shared cells were mixed");
            }
            UnityEngine.Time.unscaledTime = 4;
            own[170] = true; // Live exploration, without saving the character.
            Call(plugin, "Update");
            using (var data = Read(output)) Check(Unpack(data.RootElement)[21] == 6, "Live discoveries were not refreshed");

            UnityEngine.Time.unscaledTime = 6;
            Player.m_localPlayer.Id = 43;
            var older = new bool[256];
            older[4] = true;
            Minimap.Active = new Minimap(older);
            Call(plugin, "Update");
            using (var data = Read(output))
            {
                Check(data.RootElement.GetProperty("characterId").GetString() == "43", "Character change retained old identity");
                var packed = Unpack(data.RootElement);
                Check(packed[0] == 16 && packed[21] == 0, "Character change retained the old map");
            }
            UnityEngine.Time.unscaledTime = 8;
            ZNet.instance.Local = false;
            Minimap.ForbidAccess = true;
            Call(plugin, "Update");
            using (var data = Read(output)) Check(!data.RootElement.GetProperty("isLocal").GetBoolean(), "Remote transition retained a live local map");
            var timestamp = File.GetLastWriteTimeUtc(output);
            UnityEngine.Time.unscaledTime = 10;
            Call(plugin, "Update");
            Check(File.GetLastWriteTimeUtc(output) == timestamp, "Remote session continued writing exploration");
            Console.WriteLine("PASS: remote guard before Minimap access; personal-only gzip format; live updates without saves; current/legacy map arrays; character reset; remote transition.");
        }
        finally
        {
            var resolved = Path.GetFullPath(root);
            if (!resolved.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase)
                || !Path.GetFileName(resolved).StartsWith("valheim-local-exploration-")) throw new Exception("Unsafe test cleanup path");
            Directory.Delete(resolved, true);
        }
    }
}

namespace BepInEx
{
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class BepInPlugin : Attribute { public BepInPlugin(string id, string name, string version) { } }
    public class BaseUnityPlugin { protected Log Logger { get; } = new(); }
    public class Log { public void LogWarning(string value) => Console.WriteLine(value); }
    public static class Paths { public static string PluginPath = ""; }
}
namespace UnityEngine { public static class Time { public static float unscaledTime; } }
public class World { public string m_seedName = "Seed"; }
public class ZNet
{
    public static ZNet? instance;
    public static World? World = new();
    public bool Local;
    public bool IsServer() => Local;
    public long GetWorldUID() => 123;
    public string GetWorldName() => "World";
}
public class Player
{
    public static Player? m_localPlayer;
    public long Id = 42;
    public long GetPlayerID() => Id;
    public string GetPlayerName() => "A";
}
public class Minimap
{
    public static bool ForbidAccess;
    public static Minimap? Active;
    public static Minimap? instance => ForbidAccess ? throw new Exception("Remote Minimap access") : Active;
    public int m_textureSize = 16;
    public float m_pixelSize = 12;
    private object m_explored;
    // If the production code ever merges this, the wire-format assertions fail.
    private BitArray m_exploredOthers = new(256, true);
    public Minimap(object personal) { m_explored = personal; }
}
