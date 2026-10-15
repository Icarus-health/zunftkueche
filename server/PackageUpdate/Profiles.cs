using Kitchen.Deploy;
namespace Kitchen.PackageUpdate;
public static class Profiles {
 public const string PriorPath="server/artifacts/guard-target-diagnostic-v4/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string CurrentPath="server/artifacts/guard-target-normalization-v5/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string PriorHash="54534e6c1053e1e41fbd4eab6741183f53996e18995b0924c7f695f619ed865b";
 public const int PriorLength=297112;
 public const string SourceManifest="server/artifacts/guard-target-normalization-v5/source-manifest.sha256";
 public const string SourceHash="5152cb2bc9f323d309870725f33c50e9d9cd430c2a67352f1db6626ee7a27263";
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
