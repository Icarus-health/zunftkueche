using Kitchen.Deploy;
namespace Kitchen.PackageUpdate;
public static class Profiles {
 public const string PriorPath="server/artifacts/guard-wrapper-v2/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string CurrentPath="server/artifacts/guard-request-binding-v3/Zunftkueche.Dataverse.1.0.0.nupkg";
 public const string PriorHash="20ebc01203f0eb5f16064ae35c535467f978353bd2ef2ce4bcc45ec164912660";
 public const int PriorLength=296102;
 public const string SourceManifest="server/artifacts/guard-request-binding-v3/source-manifest.sha256";
 public const string SourceHash="eb1a71e727adb189248959372c4e2ad5b4ee5e666a12bed1500bddd0d27a994b";
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
