using System.Text.Json.Nodes;
using Kitchen.Inventory;
using PackageActivationPreparation;

[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("Tests")]
namespace Kitchen.Release;

public enum ReleaseMode { Plan, Inspect, Backup, ProvisionDocumentSchema, ActivatePackage, RegisterDocumentGuards, VerifyRelease }
public static class ModeParser
{
    public static ReleaseMode Parse(string[] args) => args.Length == 0 ? ReleaseMode.Plan : args.Length != 1 ? throw new Stop() : args[0] switch {
        "plan" => ReleaseMode.Plan, "inspect" => ReleaseMode.Inspect, "backup" => ReleaseMode.Backup,
        "provision-document-schema" => ReleaseMode.ProvisionDocumentSchema, "activate-package" => ReleaseMode.ActivatePackage,
        "register-document-guards" => ReleaseMode.RegisterDocumentGuards, "verify-release" => ReleaseMode.VerifyRelease, _ => throw new Stop() };
}
public enum TableKind { Document, Draft }
public enum ColumnKind { Event, Payload, Actor, RecordedAt, Workspace }
public enum Presence { Unknown, Missing, ExistingExact, DriftOrDuplicate }
public enum AdditiveResult { ExistingExact, CreatedObservedExact, StoppedBeforeAttempt, PriorAbsentAfterAttempt, AmbiguousStop, DriftStop }
public enum TransitionKind { V5ToRefusalDiagnostic, RefusalDiagnosticToFinal }
public sealed record EvidenceFile(string RelativePath, long Length, string Sha256)
{
    public byte[] Verify(string root) {
        Check.Require(!Path.IsPathRooted(RelativePath) && !RelativePath.Split('/').Any(p => p is "" or "." or "..") && !RelativePath.Contains('\\'));
        var path=Path.Combine(root,RelativePath);
        for(var info=new FileInfo(path) as FileSystemInfo;info!=null;info=Directory.GetParent(info.FullName)) Check.Require(info.LinkTarget==null);
        var raw=File.ReadAllBytes(path);Check.Require(raw.LongLength==Length && Check.Hash(raw)==Sha256);return raw;
    }
}
// Only independently reviewed literal records may be added here in a later source review.
// There is no CLI/file/environment route to mint a permit, package hash or binding.
public static class ReviewedRelease
{
    internal static readonly ReviewedTransition[] Transitions = [];
    internal static readonly ReviewedBinding[] Bindings = [];
    internal static readonly ReviewedPhase[] Phases = [];
    internal static readonly EvidenceFile? FinalVerificationPackage = null;
    internal static readonly EvidenceFile? CurrentSourceCompletenessReview = null;
    public static bool CanExecute(ReleaseMode mode) => Phases.Any(p=>p.Mode==mode);
    public static string Pending => "native schema/access/route completeness, current originals, fresh checkpoint, diagnostic/final packages and independent reviews pending";
}
public sealed record ReviewedTransition(TransitionKind Kind, string PriorHash, int PriorLength, EvidenceFile Package,
    EvidenceFile SourceBuild, EvidenceFile IndependentReview, WriteMode Mode, EvidenceFile WriterExclusion);
public sealed record ReviewedPhase(ReleaseMode Mode, EvidenceFile Plan, EvidenceFile Review, EvidenceFile Checkpoint, SchemaStep? Schema=null, ReviewedBinding? Guard=null, ReviewedTransition? Transition=null,EvidenceFile? Routes=null,PreparationContract? Preparation=null);
public sealed record PreparationContract(EvidenceFile DiagnosticPackage,EvidenceFile SourceBuild,EvidenceFile IndependentRefusalReview,EvidenceFile OrdinaryUseAndWriterExclusion)
{
    internal void Verify(string root,ReviewedPhase phase) {
        _=DiagnosticPackage.Verify(root);_=SourceBuild.Verify(root);
        Check.Match(Check.Parse(IndependentRefusalReview.Verify(root)),new JsonObject{["schema"]="kitchen-refusal-diagnostic-review-v1",["organization"]=Target.Organization,["packageId"]=Target.Package,["diagnosticSha256"]=DiagnosticPackage.Sha256,["diagnosticBytes"]=DiagnosticPackage.Length,["sourceBuildSha256"]=SourceBuild.Sha256,["ordinaryKitchenCommit"]="refused-before-write",["acceptingDocumentOperations"]=false,["independentlyReviewed"]=true});
        Check.Match(Check.Parse(OrdinaryUseAndWriterExclusion.Verify(root)),new JsonObject{["schema"]="kitchen-preparation-exclusion-v1",["organization"]=Target.Organization,["workspace"]=Target.Workspace,["app"]=Target.App,["ordinaryUseDisabled"]=true,["sourceWritersExcluded"]=true,["packageWritersExcluded"]=true,["checkpointSha256"]=phase.Checkpoint.Sha256,["reviewSha256"]=phase.Review.Sha256});
        if(phase.Mode==ReleaseMode.ActivatePackage) {
            var transition=phase.Transition??throw new Stop();
            Check.Require(transition.Kind==TransitionKind.V5ToRefusalDiagnostic&&transition.Package==DiagnosticPackage&&transition.SourceBuild==SourceBuild);
        } else Check.Require(phase.Mode==ReleaseMode.RegisterDocumentGuards&&phase.Guard!=null);
    }
}

public static class ReleaseClosure
{
    public static void RequirePrelaunch(string root) {
        // Secondary recheck only. Python plus the external literal launcher pin is the pre-load authority.
        foreach(var name in new[]{"source","build","host","client"}) {
            var pin=Environment.GetEnvironmentVariable("KITCHEN_REVIEW_"+name.ToUpperInvariant()+"_SHA256");
            Check.Require(pin!=null && pin.Length==64 && Check.Hash(File.ReadAllBytes(Path.Combine(root,name+"-manifest.json")))==pin);
        }
    }
}
// Typed fixed operations. A write attempt is journalled before calling any provider method.
public interface IAttemptJournal { bool AttemptPersisted { get; } void Begin(string fixedOperation); void Observe(string result); }
public sealed class DurableAttemptJournal : IAttemptJournal
{
    readonly string directory; readonly string scope; bool begun;
    public bool AttemptPersisted=>begun;
    public DurableAttemptJournal(string directory,string scope) {
        Check.Require(scope.Length is >0 and <100 && scope.All(c=>char.IsAsciiLetterOrDigit(c)||c=='-'));
        this.directory=Path.GetFullPath(directory);this.scope=scope;
    }
    public void Begin(string fixedOperation) {
        if(OperatingSystem.IsWindows())throw new Stop();
        Check.Require(!begun);
        for(var d=new DirectoryInfo(directory);d!=null;d=d.Parent)Check.Require(d.LinkTarget==null);
        Directory.CreateDirectory(directory,UnixFileMode.UserRead|UnixFileMode.UserWrite|UnixFileMode.UserExecute);
        // CreateNew is the cross-process exclusion. Every earlier attempt blocks, including old-looking outcomes.
        var path=Path.Combine(directory,scope+".attempt.json");
        using var f=new FileStream(path,new FileStreamOptions{Mode=FileMode.CreateNew,Access=FileAccess.Write,UnixCreateMode=UnixFileMode.UserRead|UnixFileMode.UserWrite});
        var bytes=System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new{format=1,operation=fixedOperation,state="attempt_may_start",recordedUtc=DateTime.UtcNow});
        f.Write(bytes);f.Flush(true);FlushDirectory(directory);begun=true;
    }
    static void FlushDirectory(string path) {
        var fd=OpenDirectory(path,0);Check.Require(fd>=0);
        try{Check.Require(SyncDirectory(fd)==0);}finally{CloseDirectory(fd);}
    }
    [System.Runtime.InteropServices.DllImport("libc",EntryPoint="open",SetLastError=true)]static extern int OpenDirectory(string path,int flags);
    [System.Runtime.InteropServices.DllImport("libc",EntryPoint="fsync",SetLastError=true)]static extern int SyncDirectory(int fd);
    [System.Runtime.InteropServices.DllImport("libc",EntryPoint="close")]static extern int CloseDirectory(int fd);
    public void Observe(string result) {
        if(OperatingSystem.IsWindows())throw new Stop();
        Check.Require(begun);
        using var f=new FileStream(Path.Combine(directory,scope+".observation.json"),new FileStreamOptions{Mode=FileMode.CreateNew,Access=FileAccess.Write,UnixCreateMode=UnixFileMode.UserRead|UnixFileMode.UserWrite});
        f.Write(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new{result,retryAllowed=false,recordedUtc=DateTime.UtcNow}));f.Flush(true);
    }
}
