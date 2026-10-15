using Kitchen.Deploy;
namespace Kitchen.PackageUpdate;
public static class Profiles {
 public const string PriorPath="server/artifacts/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string CurrentPath="server/artifacts/guard-diagnostic-v1/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string PriorHash="215fb97e2a374a4e621719c3c04cc9b21fc55686ca94fe67cc0d2a221c5bdf73";
 public const int PriorLength=290280;
 public const string SourceManifest="server/artifacts/guard-diagnostic-v1/source-manifest.sha256";
 public const string SourceHash="5bffc2cf14f08132e77f903305a5863cafa45e39aaa2b4a14fd1a17e8f0a29b3";
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
