using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace PackageActivationPreparation;

public static class FixedTarget
{
    public const string Tenant = "1dcbc0d3-e9b9-4622-bbd7-811ff1c1f7e9";
    public const string Environment = "5684204c-3254-ec15-93f4-276ec50cc65b";
    public const string Organization = "5ded2106-01c8-f111-be88-002248db2d69";
    public const string Origin = "https://org1d76e28a.crm17.dynamics.com";
    public const string App = "bfec495e-c223-4176-89a8-3e4d631337ae";
    public const string Workspace = "45deaf94-5661-4110-8f16-3d2678c09f04";
    public const string Package = "70a54daa-73c8-f111-a05c-7ced8d5f6e0d";
    public const string Assembly = "72a54daa-73c8-f111-a05c-7ced8d5f6e0d";
    public const string Name = "zk_Zunftkueche.Dataverse";
    public const string Version = "1.0.0";
    public const string PriorSha256 = "6d74048606fd199b06a20c2856752eb56e87e7bd6bb9d634bdef80387c596247";
    public const int PriorLength = 297290;
    public static string Hash(ReadOnlySpan<byte> bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    internal static bool HashValid(string? s) => s is not null && Regex.IsMatch(s, "\\A[0-9a-f]{64}\\z", RegexOptions.CultureInvariant);
    internal static bool GuidValid(string? s) => Guid.TryParseExact(s, "D", out var id) && id != Guid.Empty;
    // Dataverse weak row-version form only; no wildcard, whitespace, header injection or arbitrary validators.
    internal static bool ETagValid(string? s) => s is not null && Regex.IsMatch(s, "\\AW/\"[0-9]{1,30}\"\\z", RegexOptions.CultureInvariant);
}

public enum WriteMode { StrictETagCas = 1, ExclusiveWriterNoAtomicCas = 2 }
public enum WriteOutcome { Success204, Refusal412, TransportTimeout, Cancelled, Unknown }
public enum ActivationStatus { StoppedBeforeWrite, AlreadyNew, ObservedNewAfterAttempt, PriorObservedAfterAttempt, AmbiguousStop, InstanceAlreadyUsed }

// Caller supplies complete accepted checkpoint FACTS, not "backupVerified" flags.
// Hashes bind complete canonical collections, including zero-row collections; no private financial bodies here.
public sealed record Checkpoint(
    string Tenant, string Environment, string Organization, string Origin, string App, string Workspace,
    string OwnerId, string OwnerType, long Revision, string WorkspaceRowVersion, string RawStateSha256,
    long ReceiptCount, string ReceiptCollectionSha256,
    long DocumentCount, string DocumentCollectionSha256,
    long DraftCount, string DraftCollectionSha256,
    long OriginalVersionCount, string OriginalVersionsAndBytesManifestSha256,
    string BackupManifestSha256, string ValidatorEvidenceSha256, string InventoryManifestSha256)
{
    internal bool Valid() => Tenant == FixedTarget.Tenant && Environment == FixedTarget.Environment &&
        Organization == FixedTarget.Organization && Origin == FixedTarget.Origin && App == FixedTarget.App &&
        Workspace == FixedTarget.Workspace && FixedTarget.GuidValid(OwnerId) &&
        OwnerType is "systemuser" or "team" && Revision >= 0 &&
        WorkspaceRowVersion is not null && Regex.IsMatch(WorkspaceRowVersion, "\\A[0-9]{1,30}\\z") &&
        ReceiptCount >= 0 && DocumentCount >= 0 && DraftCount >= 0 && OriginalVersionCount >= 0 &&
        new[] { RawStateSha256, ReceiptCollectionSha256, DocumentCollectionSha256, DraftCollectionSha256,
            OriginalVersionsAndBytesManifestSha256, BackupManifestSha256, ValidatorEvidenceSha256,
            InventoryManifestSha256 }.All(FixedTarget.HashValid);
}

public sealed record PackageMetadata(string Organization, string Origin, string Package, string Assembly,
    string Name, string UniqueName, string Version, string ETag, string StableMetadataSha256)
{
    internal bool Valid() => Organization == FixedTarget.Organization && Origin == FixedTarget.Origin &&
        Package == FixedTarget.Package && Assembly == FixedTarget.Assembly && Name == FixedTarget.Name &&
        UniqueName == FixedTarget.Name && Version == FixedTarget.Version && FixedTarget.ETagValid(ETag) &&
        FixedTarget.HashValid(StableMetadataSha256);
    internal bool SameStable(PackageMetadata other) => this with { ETag = other.ETag } == other;
}

// Trusted caller validates referenced source/build/review/backup facts before constructing this immutable plan.
// This class validates completeness/binding only; hash-shaped references are NOT proof of external facts.
public sealed class ActivationPlan
{
    public WriteMode Mode { get; }
    public string ExpectedETag { get; }
    public string ExpectedStableMetadataSha256 { get; }
    public string PriorSha256 { get; }
    public int PriorLength { get; }
    public string NewSha256 { get; }
    public int NewLength { get; }
    public string SourceBuildManifestSha256 { get; }
    public string IndependentReviewEvidenceSha256 { get; }
    public Checkpoint AcceptedCheckpoint { get; }
    public ActivationPlan(WriteMode mode, string expectedETag, string stableMetadataSha256,
        string newSha256, int newLength, string sourceBuildManifestSha256,
        string independentReviewEvidenceSha256, Checkpoint acceptedCheckpoint, string priorSha256 = FixedTarget.PriorSha256, int priorLength = FixedTarget.PriorLength)
    {
        if (mode is not (WriteMode.StrictETagCas or WriteMode.ExclusiveWriterNoAtomicCas) ||
            !FixedTarget.ETagValid(expectedETag) || !FixedTarget.HashValid(stableMetadataSha256) ||
            !FixedTarget.HashValid(priorSha256) || priorLength <= 0 ||
            !FixedTarget.HashValid(newSha256) || newSha256 == priorSha256 || newLength <= 0 ||
            !FixedTarget.HashValid(sourceBuildManifestSha256) || !FixedTarget.HashValid(independentReviewEvidenceSha256) ||
            acceptedCheckpoint is null || !acceptedCheckpoint.Valid())
            throw new ArgumentException("Incomplete or malformed activation plan.");
        PriorSha256 = priorSha256; PriorLength = priorLength;
        Mode = mode; ExpectedETag = expectedETag; ExpectedStableMetadataSha256 = stableMetadataSha256;
        NewSha256 = newSha256; NewLength = newLength; SourceBuildManifestSha256 = sourceBuildManifestSha256;
        IndependentReviewEvidenceSha256 = independentReviewEvidenceSha256; AcceptedCheckpoint = acceptedCheckpoint;
    }
}

// No resource ID, origin, URL, HTTP method, upsert, metadata mutation or generic write escape.
// A FUTURE reviewed adapter must implement canonical fixed-target reads and ONLY existing package Content update.
public interface IFixedPackageBoundary
{
    Task<PackageMetadata> ReadCanonicalMetadataAsync(CancellationToken cancellation);
    Task<byte[]> ReadCanonicalContentAsync(CancellationToken cancellation);
    Task<Checkpoint> ReadCompleteCheckpointAsync(CancellationToken cancellation);
    Task<WriteOutcome> UpdateExistingPackageContentOnceAsync(ReadOnlyMemory<byte> content, WriteCondition condition,
        CancellationToken cancellation);
}

public sealed class WriteCondition
{
    public WriteMode Mode { get; }
    public string IfMatch { get; }
    internal WriteCondition(WriteMode mode, string etag)
    {
        Mode = mode; IfMatch = mode == WriteMode.StrictETagCas ? etag : "*";
    }
    public string Guarantee => Mode == WriteMode.StrictETagCas ? "strict_etag_cas" : "exclusive_writer_no_atomic_cas";
}

// Structured evidence is returned to the trusted caller; public Status/Guarantee contain no provider error/body.
public sealed record ReadbackEvidence(PackageMetadata? Before, PackageMetadata? After, string? ContentSha256, int? ContentLength);
public sealed record ActivationResult(ActivationStatus Status, string Guarantee, bool WriteAttempted,
    WriteOutcome? Outcome, ReadbackEvidence? Readback);
