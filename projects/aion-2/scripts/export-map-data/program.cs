using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Security.Cryptography;
using System.Text;

if (args.Length != 6) {
    Console.Error.WriteLine("Usage: export-map-data <packages> <schema> <key-file> <output> <game-enum> <asset-path-filter>");
    return 1;
}
using var provider = new DefaultFileProvider(args[0], SearchOption.TopDirectoryOnly, true,
    new VersionContainer(Enum.Parse<EGame>(args[4]))) {
    MappingsContainer = new FileUsmapTypeMappingsProvider(args[1])
};
provider.Initialize();
provider.SubmitKey(new FGuid(), new FAesKey(File.ReadAllText(args[2]).Trim()));
provider.PostMount();
Directory.CreateDirectory(args[3]);
var decoder = typeof(DefaultFileProvider).Assembly.GetTypes().Single(type => type.Name.EndsWith("MapDataFile"));
var paths = provider.Files.Keys.Where(path => path.EndsWith(".dat", StringComparison.OrdinalIgnoreCase)
    && path.Contains(args[5], StringComparison.OrdinalIgnoreCase)).Order().ToList();
if (paths.Count == 0) throw new InvalidOperationException("No map data matched the asset path filter.");
var failures = 0;
foreach (var path in paths) {
    try {
        object? decoded;
        if (path.Contains("/Data/MapEvent/", StringComparison.OrdinalIgnoreCase)) {
            var bytes = provider.Files[path].SafeRead() ?? throw new IOException($"Cannot read {path}");
            var archiveType = decoder.Assembly.GetType(decoder.FullName!.Replace("MapDataFile", "DatFileArchive"))!;
            archiveType.GetMethod("DecryptData", [typeof(byte[])])!.Invoke(null, [bytes]);
            decoded = JObject.Parse(Encoding.UTF8.GetString(bytes));
        } else {
            decoded = Activator.CreateInstance(decoder, provider.Files[path], provider);
        }
        var filename = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path))).ToLowerInvariant() + ".json";
        File.WriteAllText(Path.Combine(args[3], filename), JsonConvert.SerializeObject(new { asset = path, data = decoded }));
    } catch (Exception error) {
        failures++;
        Console.Error.WriteLine($"Failed {path}: {error.GetBaseException().Message}");
    }
}
Console.WriteLine($"Decoded {paths.Count - failures} of {paths.Count} map data files.");
return failures == 0 ? 0 : 1;
