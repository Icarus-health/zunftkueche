using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace Kitchen.Inventory;

public interface IBackupStorage
{
    void WriteNewAndFlush(string path, byte[] bytes);
    byte[] Read(string path);
    void Promote(string stagingPath, string finalPath);
}
public sealed class PhysicalBackupStorage : IBackupStorage
{
    public void WriteNewAndFlush(string path, byte[] bytes)
    {
        if (OperatingSystem.IsWindows())
            throw new Stop();
        using var stream = new FileStream(path, new FileStreamOptions
        {
            Mode = FileMode.CreateNew,
            Access = FileAccess.Write,
            UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite
        });
        stream.Write(bytes);
        stream.Flush(true);
    }
    public byte[] Read(string path) => File.ReadAllBytes(path);
    // Same directory and filesystem; no overwrite, no cleanup/repair and no fallible action after rename.
    public void Promote(string stagingPath, string finalPath) => File.Move(stagingPath, finalPath, false);
}
public sealed class Backup
{
    public string DirectoryPath
    {
        get;
    }
    sealed record FileEntry(string name, long bytes, string sha256);
    readonly List<FileEntry> files = [];
    readonly IBackupStorage storage;
    bool finished;
    public Backup(string parent, IBackupStorage? storage = null)
    {
        this.storage = storage ?? new PhysicalBackupStorage();
        if (OperatingSystem.IsWindows())
            throw new Stop();
        var full = Path.GetFullPath(parent);
        for (var d = new DirectoryInfo(full); d != null; d = d.Parent)
            Check.Require(d.LinkTarget == null);
        Directory.CreateDirectory(full, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        File.SetUnixFileMode(full, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        DirectoryPath = Path.Combine(full, DateTime.UtcNow.ToString("yyyyMMddTHHmmssZ") + "-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(DirectoryPath, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        Write("status-incomplete.json", Encoding.UTF8.GetBytes("{\"complete\":false,\"status\":\"staging_is_never_completion_use_verified_final_reader\"}"));
    }
    FileEntry WriteVerified(string name, byte[] bytes)
    {
        Check.Require(!finished && Path.GetFileName(name) == name && !name.Contains('/') && !name.Contains('\\'));
        var path = Path.Combine(DirectoryPath, name);
        storage.WriteNewAndFlush(path, bytes);
        var entry = new FileEntry(name, bytes.LongLength, Check.Hash(bytes));
        VerifyFile(entry);
        return entry;
    }
    void VerifyFile(FileEntry entry)
    {
        byte[] raw = storage.Read(Path.Combine(DirectoryPath, entry.name));
        Check.Require(raw.LongLength == entry.bytes && Check.Hash(raw) == entry.sha256);
    }
    public void Write(string name, byte[] bytes) => files.Add(WriteVerified(name, bytes));
    public void Json(string name, JsonNode node) => Write(name, Encoding.UTF8.GetBytes(node.ToJsonString(new JsonSerializerOptions { WriteIndented = true })));
    public void Finish(object facts, bool completeCurrentNativeSource = false)
    {
        Check.Require(!finished);
        foreach (var entry in files)
            VerifyFile(entry);
        // The payload itself NEVER claims success. The reader requires the final filename AND
        // verifies the exact data closure. Staging alone is always incomplete, even if parseable.
        byte[] manifest = JsonSerializer.SerializeToUtf8Bytes(new
        {
            formatVersion = 2,
            completionRule = "verified_final_name_and_exact_file_hashes",
            captureState = "prepared",
            createdUtc = DateTime.UtcNow,
            fullFinalBackup = false,
            fullCurrentNativeBackup = completeCurrentNativeSource,
            restoreProven = false,
            atomicSnapshot = false,
            originalBytesPreserved = completeCurrentNativeSource,
            newDocumentDraftTablesInventoried = false,
            clientPublishedVersionVerified = false,
            tenant = Target.Tenant,
            organization = Target.Organization,
            environmentExpectedOnly = Target.Environment,
            appExpectedOnly = Target.App,
            workspace = Target.Workspace,
            package = Target.Package,
            validatorCheckpoint = "current-explicit-policy-source-closure",
            facts,
            files
        });
        WriteVerified("manifest.staging.json", manifest);
        foreach (var entry in files)
            VerifyFile(entry);
        storage.Promote(Path.Combine(DirectoryPath, "manifest.staging.json"), Path.Combine(DirectoryPath, "manifest.json"));
        finished = true;
    }
    public void RecordFailure(FailureStage stage, FailureReason reason)
    {
        // Best effort if the storage itself has failed. No raw exception/provider values are written.
        if (finished)
            return;
        WriteVerified("failure-status.json", JsonSerializer.SerializeToUtf8Bytes(new
        {
            complete = false,
            stage = stage.ToString(),
            reason = reason.ToString(),
            recordedUtc = DateTime.UtcNow
        }));
    }
    public static bool IsComplete(string folder)
    {
        try
        {
            if (File.Exists(Path.Combine(folder, "manifest.staging.json")) || File.Exists(Path.Combine(folder, "failure-status.json")))
                return false;
            var manifest = Check.Parse(File.ReadAllBytes(Path.Combine(folder, "manifest.json")));
            Check.Require(manifest["formatVersion"]?.GetValue<int>() == 2 && Check.Text(manifest, "completionRule") == "verified_final_name_and_exact_file_hashes");
            var names = new HashSet<string>(StringComparer.Ordinal) { "manifest.json" };
            foreach (var row in manifest["files"]!.AsArray())
            {
                string name = Check.Text(row, "name");
                Check.Require(Path.GetFileName(name) == name && !name.Contains('\\') && names.Add(name));
                byte[] bytes = File.ReadAllBytes(Path.Combine(folder, name));
                Check.Require(bytes.LongLength == row!["bytes"]!.GetValue<long>() && Check.Hash(bytes) == Check.Text(row, "sha256"));
            }
            Check.Require(names.Count > 1 && Directory.EnumerateFileSystemEntries(folder).All(p => File.Exists(p) && !File.GetAttributes(p).HasFlag(FileAttributes.ReparsePoint)));
            return names.SetEquals(Directory.EnumerateFiles(folder).Select(Path.GetFileName)!);
        }
        catch { return false; }
    }
}
