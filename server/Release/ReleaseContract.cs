using System.Text.Json.Nodes;
using Kitchen.Inventory;
using PackageActivationPreparation;
using Zunftkueche;

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
public enum TransitionKind { V5ToRefusalDiagnostic, RefusalDiagnosticToFinal, V5ToCore }
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
    // Read-only query-shape review is staged separately from runtime backup/mutation authority.
    internal static readonly BackupScopeBinding? InspectionScope = null;
    internal static readonly FinalVerificationBinding? FinalVerification = null;
    internal static readonly EvidenceFile? CurrentSourceCompletenessReview = null;
    public static bool CanExecute(ReleaseMode mode) => Phases.Any(p=>p.Mode==mode);
    public static string Pending => "native schema/access/route completeness, current originals, fresh checkpoint, diagnostic/final packages and independent reviews pending";
}
public sealed record ReviewedTransition(TransitionKind Kind, string PriorHash, int PriorLength, EvidenceFile Package,
    EvidenceFile SourceBuild, EvidenceFile IndependentReview, WriteMode Mode, EvidenceFile WriterExclusion, BackupScopeBinding? ExpectedScope=null);
public sealed record ReviewedPhase(ReleaseMode Mode, EvidenceFile Plan, EvidenceFile Review, EvidenceFile Checkpoint, SchemaStep? Schema=null, ReviewedBinding? Guard=null, ReviewedTransition? Transition=null,EvidenceFile? Routes=null,PreparationContract? Preparation=null,BackupScopeBinding? ExpectedScope=null);
// External pairing avoids embedding the package's own hash in its source/binary.
public sealed record FinalVerificationBinding(EvidenceFile Package,BackupScopeBinding ExpectedScope,EvidenceFile IndependentReview,EvidenceFile Checkpoint)
{
    internal CheckpointInput Verify(string root) {
        ReleaseScope.Require(ExpectedScope);Check.Require(Package.Length>0&&DocumentGuards.Hash(Package.Sha256));_=Package.Verify(root);
        Check.Match(Check.Parse(IndependentReview.Verify(root)),new JsonObject{["schema"]="kitchen-final-scope-review-v1",["packageSha256"]=Package.Sha256,["packageBytes"]=Package.Length,["scopeFingerprint"]=ReleaseScope.Fingerprint(ExpectedScope),["checkpointSha256"]=Checkpoint.Sha256,["independentlyReviewed"]=true});
        var input=System.Text.Json.JsonSerializer.Deserialize<CheckpointInput>(Checkpoint.Verify(root))??throw new Stop();
        Check.Require(input.Accepted.Valid()&&input.CallerId==Check.Id(input.CallerId)&&DocumentGuards.Hash(input.MetadataAccessClientSha256));return input;
    }
}
internal static class ReleaseScope
{
    internal static BackupScopeBinding Require(BackupScopeBinding? binding) {
        Check.Require(binding!=null);var b=binding!;
        Check.Require(b.OrganizationId.ToString("D")==Target.Organization&&b.WorkspaceId.ToString("D")==Target.Workspace&&b.DeploymentId!=Guid.Empty&&DocumentGuards.Hash(b.RetainedStateSha256)&&DocumentGuards.Hash(b.ReviewEvidenceSha256));
        Check.Require(b.Scope==BackupScope.Core&&b.History==BackupHistory.CoreOnly||b.Scope==BackupScope.Documents&&b.History==BackupHistory.Documents);return b;
    }
    internal static string Fingerprint(BackupScopeBinding binding) {
        var b=Require(binding);return Check.Fingerprint(new JsonObject{["scope"]=b.Scope.ToString(),["history"]=b.History.ToString(),["organization"]=b.OrganizationId.ToString("D"),["workspace"]=b.WorkspaceId.ToString("D"),["deployment"]=b.DeploymentId.ToString("D"),["retainedStateSha256"]=b.RetainedStateSha256,["reviewEvidenceSha256"]=b.ReviewEvidenceSha256});
    }
    internal static void RequireProduction(BackupScopeBinding? binding) {Require(binding);Check.Require(ReferenceEquals(binding,ReviewedBackupScope.Binding));}
    internal static void ValidateStore(BackupScopeBinding binding,DocumentSchemaProgress progress) {
        var b=Require(binding);Check.Require(progress==(b.Scope==BackupScope.Core?DocumentSchemaProgress.NotInstalled:DocumentSchemaProgress.Exact));
    }
    internal static void ValidateState(BackupScopeBinding binding,byte[] raw,int revision,JsonObject[] receipts) {
        Require(binding);CompleteInventory.ValidateCurrentPolicy(raw,revision,receipts);
        if(binding.Scope==BackupScope.Core)BackupProtocol.RequireCoreHistory(Protocol.Parse(new System.Text.UTF8Encoding(false,true).GetString(raw)));
    }
    // Null is a named legacy preparation boundary, never a missing backup/activation scope.
    internal static BackupScopeBinding? Phase(ReviewedPhase phase) {
        if(phase.ExpectedScope!=null) {
            var scope=Require(phase.ExpectedScope);
            Check.Require(phase.Preparation==null&&phase.Mode is ReleaseMode.ActivatePackage or ReleaseMode.RegisterDocumentGuards);
            if(phase.Mode==ReleaseMode.ActivatePackage) {
                var transition=phase.Transition??throw new Stop();Check.Require(transition.ExpectedScope!=null&&Fingerprint(scope)==Fingerprint(transition.ExpectedScope));
                Check.Require(transition.Kind==(scope.Scope==BackupScope.Core?TransitionKind.V5ToCore:TransitionKind.RefusalDiagnosticToFinal));
            } else Check.Require(scope.Scope==BackupScope.Documents&&phase.Guard!=null);
            return scope;
        }
        Check.Require(phase.Mode==ReleaseMode.ProvisionDocumentSchema&&phase.Schema!=null&&phase.Transition==null&&phase.Guard==null
            ||phase.Preparation!=null&&(phase.Mode==ReleaseMode.RegisterDocumentGuards&&phase.Guard!=null
                ||phase.Mode==ReleaseMode.ActivatePackage&&phase.Transition?.Kind==TransitionKind.V5ToRefusalDiagnostic&&phase.Transition.ExpectedScope==null));
        return null;
    }
}
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
