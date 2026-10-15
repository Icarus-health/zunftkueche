using Kitchen.Deploy;
namespace Kitchen.PackageUpdate;
public static class Profiles {
 public const string PriorPath="server/artifacts/guard-request-binding-v3/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string CurrentPath="server/artifacts/guard-target-diagnostic-v4/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string PriorHash="02449a6b7ff2a073d40a833fd64360b964a9d31386d099b6b432f6e05a1ee89e";
 public const int PriorLength=296571;
 public const string SourceManifest="server/artifacts/guard-target-diagnostic-v4/source-manifest.sha256";
 public const string SourceHash="384eeebf242d6280cc5e4ba78031aa0ff74a768de2c9c451bbfc5a0f81e80182";
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
