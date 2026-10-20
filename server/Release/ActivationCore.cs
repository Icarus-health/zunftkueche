namespace PackageActivationPreparation;

// Pure orchestration over a fakeable, fixed-purpose boundary. No concrete provider adapter exists here.
public sealed class ActivationCore
{
    private int used;
    private readonly ActivationTiming timing;
    public ActivationCore() : this(ActivationTiming.Production) { }
    internal ActivationCore(ActivationTiming timing) { this.timing = timing; }

    public async Task<ActivationResult> ActivateAsync(ActivationPlan? plan, byte[]? newBytes,
        IFixedPackageBoundary boundary, CancellationToken cancellation = default)
    {
        if (Interlocked.Exchange(ref used, 1) != 0)
            return new(ActivationStatus.InstanceAlreadyUsed, "none", false, null, null);
        var guarantee = plan?.Mode == WriteMode.StrictETagCas ? "strict_etag_cas" :
            plan?.Mode == WriteMode.ExclusiveWriterNoAtomicCas ? "exclusive_writer_no_atomic_cas" : "none";
        ActivationResult Stop() => new(ActivationStatus.StoppedBeforeWrite, guarantee, false, null, null);
        if (plan is null || newBytes is null || boundary is null) return Stop();

        // Freeze and hash exact supplied bytes BEFORE any boundary action; caller changes cannot alter the write.
        var frozenNew = newBytes.ToArray();
        if (frozenNew.Length != plan.NewLength || FixedTarget.Hash(frozenNew) != plan.NewSha256) return Stop();

        PackageMetadata before;
        try
        {
            cancellation.ThrowIfCancellationRequested();
            before = await boundary.ReadCanonicalMetadataAsync(cancellation);
            if (!before.Valid() || before.StableMetadataSha256 != plan.ExpectedStableMetadataSha256) return Stop();
            var content = await boundary.ReadCanonicalContentAsync(cancellation);
            // Hash immediately: never retain a boundary-owned mutable buffer across awaits.
            var contentHash = FixedTarget.Hash(content);
            var contentLength = content.Length;
            var after = await boundary.ReadCanonicalMetadataAsync(cancellation);
            if (!after.Valid() || before != after) return Stop();
            if (contentLength == plan.NewLength && contentHash == plan.NewSha256)
                return new(ActivationStatus.AlreadyNew, guarantee, false, null, new(before, after, contentHash, contentLength));
            if (contentLength != plan.PriorLength || contentHash != plan.PriorSha256 ||
                before.ETag != plan.ExpectedETag) return Stop();

            // Last boundary action before the one possible Content update. No global lock is established.
            var checkpoint = await boundary.ReadCompleteCheckpointAsync(cancellation);
            if (checkpoint is null || !checkpoint.Valid() || checkpoint != plan.AcceptedCheckpoint) return Stop();
            cancellation.ThrowIfCancellationRequested();
        }
        catch (Exception) { return Stop(); }

        WriteOutcome outcome;
        try
        {
            // Only mutation entry point; never retry or fall back. A call counts as attempted even if it throws.
            using var writeDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            writeDeadline.CancelAfter(timing.Write);
            outcome = await boundary.UpdateExistingPackageContentOnceAsync(frozenNew,
                new WriteCondition(plan.Mode, before.ETag), writeDeadline.Token).WaitAsync(writeDeadline.Token);
            if (!Enum.IsDefined(outcome)) outcome = WriteOutcome.Unknown;
        }
        catch (OperationCanceledException) { outcome = WriteOutcome.Cancelled; }
        catch (Exception) { outcome = WriteOutcome.Unknown; }

        // A fresh, bounded token is deliberately NOT linked to caller cancellation.
        // Each independent canonical read is attempted even if another read failed. No second mutation exists.
        using var readbackBudget = new CancellationTokenSource(timing.TotalReadback);
        var independent = readbackBudget.Token;
        PackageMetadata? readBefore = null, readAfter = null;
        string? hash = null;
        int? length = null;
        try { readBefore = await BoundedRead(boundary.ReadCanonicalMetadataAsync, independent); }
        catch (Exception) { /* Evidence records the missing canonical read, never the raw exception. */ }
        try
        {
            var bytes = await BoundedRead(boundary.ReadCanonicalContentAsync, independent);
            hash = FixedTarget.Hash(bytes); length = bytes.Length;
        }
        catch (Exception) { }
        try { readAfter = await BoundedRead(boundary.ReadCanonicalMetadataAsync, independent); }
        catch (Exception) { }

        var evidence = new ReadbackEvidence(readBefore, readAfter, hash, length);
        var status = ActivationStatus.AmbiguousStop;
        if (readBefore is not null && readAfter is not null && readBefore.Valid() && readAfter.Valid() &&
            readBefore == readAfter && before.SameStable(readBefore))
        {
            if (hash == plan.NewSha256 && length == plan.NewLength) status = ActivationStatus.ObservedNewAfterAttempt;
            else if (hash == plan.PriorSha256 && length == plan.PriorLength)
                status = ActivationStatus.PriorObservedAfterAttempt;
        }
        return new(status, guarantee, true, outcome, evidence);
    }
    async Task<T> BoundedRead<T>(Func<CancellationToken,Task<T>> read,CancellationToken total) {
        using var deadline=CancellationTokenSource.CreateLinkedTokenSource(total);deadline.CancelAfter(timing.EachRead);
        return await read(deadline.Token).WaitAsync(deadline.Token);
    }
}
internal sealed record ActivationTiming(TimeSpan Write,TimeSpan TotalReadback,TimeSpan EachRead) {
    public static readonly ActivationTiming Production = new(TimeSpan.FromSeconds(90),TimeSpan.FromSeconds(180),TimeSpan.FromSeconds(60));
    public static readonly ActivationTiming Fake = new(TimeSpan.FromMilliseconds(250),TimeSpan.FromMilliseconds(500),TimeSpan.FromMilliseconds(150));
}
