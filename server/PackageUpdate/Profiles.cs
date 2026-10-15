using Kitchen.Deploy;
namespace Kitchen.PackageUpdate;
public static class Profiles {
 public const string PriorPath="server/artifacts/guard-diagnostic-v1/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string CurrentPath="server/artifacts/guard-wrapper-v2/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string PriorHash="1c6ea57c3c56922911d201fde6a7c2a862efa0619ac7f81e5fe42fcf2ede7d92";
 public const int PriorLength=290994;
 public const string SourceManifest="server/artifacts/guard-wrapper-v2/source-manifest.sha256";
 public const string SourceHash="0b55bc2e593a00e56bc5eaa37653122e45934f7f3a942d59b38bddbdbd818041";
 public static byte[] ReadPinned(string path,string hash,int length) {
  if(new FileInfo(path).Length!=length)throw new DeploymentException("local_artifact_length_mismatch");
  var bytes=File.ReadAllBytes(path);
  if(bytes.Length!=length||Seed.Hash(bytes)!=hash)throw new DeploymentException("local_artifact_hash_mismatch");
  return bytes;
 }
 public static void ValidateLocal() {
  ReadPinned(PriorPath,PriorHash,PriorLength);
  ReadPinned(CurrentPath,Seed.PackageHash,PackageFileDownload.ExpectedLength);
  var manifest=File.ReadAllBytes(SourceManifest);
  if(Seed.Hash(manifest)!=SourceHash)throw new DeploymentException("plugin_source_manifest_mismatch");
  // Paths and hashes are trusted only after the exact reviewed manifest hash matches.
  foreach(var line in System.Text.Encoding.UTF8.GetString(manifest).Split('\n',StringSplitOptions.RemoveEmptyEntries))
   if(Seed.Hash(File.ReadAllBytes(line[66..]))!=line[..64])throw new DeploymentException("plugin_source_mismatch");
 }
}
