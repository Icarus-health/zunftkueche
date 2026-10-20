using System.Text;

namespace PackageActivationPreparation;
internal static class OfflineTests
{
    private static readonly byte[] NewBytes = Encoding.UTF8.GetBytes("synthetic reviewed new package -- NOT A RELEASE PACKAGE");
    private static readonly string H = FixedTarget.Hash(Encoding.UTF8.GetBytes("synthetic complete manifest"));
    private static readonly Checkpoint C = new(FixedTarget.Tenant, FixedTarget.Environment, FixedTarget.Organization,
        FixedTarget.Origin, FixedTarget.App, FixedTarget.Workspace, "11111111-1111-4111-8111-111111111111", "team", 3, "123",
        H, 2, H, 0, H, 0, H, 0, H, H, H, H);
    private static readonly PackageMetadata M = new(FixedTarget.Organization, FixedTarget.Origin, FixedTarget.Package,
        FixedTarget.Assembly, FixedTarget.Name, FixedTarget.Name, FixedTarget.Version, "W/\"77\"", H);
    private static ActivationPlan Plan(WriteMode mode = WriteMode.StrictETagCas) =>
        new(mode, M.ETag, H, FixedTarget.Hash(NewBytes), NewBytes.Length, H, H, C);
    private static void Require(bool value, string message) { if (!value) throw new Exception(message); }
    private static void Invalid(Action action)
    {
        try { action(); } catch (ArgumentException) { return; }
        throw new Exception("Malformed plan was admitted.");
    }
    public static async Task<int> Run()
    {
        var tests = new List<(string, Func<Task>)>();
        void Add(string name, Func<Task> test) => tests.Add((name, test));
        void Sync(string name, Action test) => Add(name, () => { test(); return Task.CompletedTask; });
        Add("cancelled write that ignores cancellation still reconciles", async () => {
            using var source = new CancellationTokenSource();
            var f = new Fake { HangWrite = true, WriteHook = source.Cancel };
            var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f, source.Token);
            Require(r.Status == ActivationStatus.ObservedNewAfterAttempt && r.Outcome == WriteOutcome.Cancelled && f.ContentReads == 2, "uncooperative write blocked readback");
        });
        Sync("canonical hashes and ETags reject trailing newline", () => {
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, M.ETag + "\n", H, H, 1, H, H, C));
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, M.ETag, H + "\n", H, 1, H, H, C));
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, M.ETag, H, H, 1, H, H, C with { WorkspaceRowVersion = "1\n" }));
        });
        Add("valid prior to new: one content update and independent readback", async () => {
            var f = new Fake(); var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
            Require(r.Status == ActivationStatus.ObservedNewAfterAttempt && f.Writes == 1, "new bytes not observed");
            Require(f.Calls.SequenceEqual(new[] { "metadata", "content", "metadata", "checkpoint", "write", "metadata", "content", "metadata" }), "ordering");
            Require(r.Readback?.ContentSha256 == FixedTarget.Hash(NewBytes), "missing readback evidence");
            Require(f.Condition?.IfMatch == M.ETag && f.Condition.Mode == WriteMode.StrictETagCas, "strict precondition");
        });
        Add("already new: zero updates", async () => {
            var f = new Fake { Content = NewBytes.ToArray(), Meta = M with { ETag = "W/\"99\"" } };
            var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
            Require(r.Status == ActivationStatus.AlreadyNew && f.Writes == 0, "already-new wrote");
        });
        foreach (var name in new[] { "wrong organization", "wrong origin", "wrong package", "wrong assembly", "wrong name", "wrong unique name", "wrong version", "metadata fingerprint", "ETag drift", "unknown prior bytes", "metadata bracket drift", "content drift", "checkpoint drift", "checkpoint wrong target" })
        {
            Add(name + ": stop before mutation", async () => {
                var f = new Fake();
                f.Meta = name switch {
                    "wrong organization" => M with { Organization = Guid.NewGuid().ToString() },
                    "wrong origin" => M with { Origin = "https://wrong.invalid" },
                    "wrong package" => M with { Package = Guid.NewGuid().ToString() },
                    "wrong assembly" => M with { Assembly = Guid.NewGuid().ToString() },
                    "wrong name" => M with { Name = "other" },
                    "wrong unique name" => M with { UniqueName = "other" },
                    "wrong version" => M with { Version = "2.0.0" },
                    "metadata fingerprint" => M with { StableMetadataSha256 = new string('a', 64) },
                    "ETag drift" => M with { ETag = "W/\"78\"" }, _ => M };
                if (name == "unknown prior bytes") f.Content = new byte[] { 1, 2 };
                if (name == "metadata bracket drift") f.MetadataHook = n => n == 2 ? M with { ETag = "W/\"78\"" } : f.Meta;
                if (name == "content drift") f.ContentHook = () => { f.Meta = M with { StableMetadataSha256 = new string('b', 64) }; return f.Content; };
                if (name == "checkpoint drift") f.Checkpoint = C with { ReceiptCount = 3 };
                if (name == "checkpoint wrong target") f.Checkpoint = C with { Workspace = Guid.NewGuid().ToString() };
                var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
                Require(r.Status == ActivationStatus.StoppedBeforeWrite && f.Writes == 0, name);
            });
        }
        foreach (var changed in new[] { C with { OwnerId = "22222222-2222-4222-8222-222222222222" },
            C with { OwnerType = "systemuser" }, C with { Revision = 4 }, C with { WorkspaceRowVersion = "124" },
            C with { RawStateSha256 = new string('a', 64) }, C with { ReceiptCollectionSha256 = new string('a', 64) },
            C with { DocumentCount = 1 }, C with { DocumentCollectionSha256 = new string('a', 64) },
            C with { DraftCount = 1 }, C with { DraftCollectionSha256 = new string('a', 64) },
            C with { OriginalVersionCount = 1 }, C with { OriginalVersionsAndBytesManifestSha256 = new string('a', 64) },
            C with { BackupManifestSha256 = new string('a', 64) }, C with { ValidatorEvidenceSha256 = new string('a', 64) },
            C with { InventoryManifestSha256 = new string('a', 64) } })
            Add("complete checkpoint fingerprint drift variant " + tests.Count, async () => {
                var f = new Fake { Checkpoint = changed };
                var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
                Require(r.Status == ActivationStatus.StoppedBeforeWrite && f.Writes == 0, "incomplete checkpoint comparison");
            });
        Add("caller mutation cannot change frozen new bytes", async () => {
            var bytes = NewBytes.ToArray(); var f = new Fake();
            f.MetadataHook = n => { bytes[0] ^= 1; return f.Meta; };
            var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), bytes, f);
            Require(r.Status == ActivationStatus.ObservedNewAfterAttempt && FixedTarget.Hash(f.Content) == Plan().NewSha256, "caller changed write bytes");
        });
        Add("new hash mismatch: zero interface actions", async () => {
            var f = new Fake(); var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), new byte[] { 9 }, f);
            Require(r.Status == ActivationStatus.StoppedBeforeWrite && f.Calls.Count == 0, "hash verified too late");
        });
        Add("empty plan: zero interface actions", async () => {
            var f = new Fake(); var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(null, NewBytes, f);
            Require(r.Status == ActivationStatus.StoppedBeforeWrite && f.Calls.Count == 0, "empty plan admitted");
        });
        Sync("malformed plans and checkpoint fields rejected", () => {
            Invalid(() => new ActivationPlan((WriteMode)99, M.ETag, H, H, 1, H, H, C));
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, "*", H, H, 1, H, H, C));
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, "W/\"1\"\r\nx:y", H, H, 1, H, H, C));
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, M.ETag, "", H, 1, H, H, C));
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, M.ETag, H, "", 1, H, H, C));
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, M.ETag, H, H, 0, H, H, C));
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, M.ETag, H, H, 1, "", H, C));
            Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, M.ETag, H, H, 1, H, "", C));
            foreach (var c in new[] { C with { RawStateSha256 = "" }, C with { ReceiptCollectionSha256 = "" },
                C with { DocumentCollectionSha256 = "" }, C with { DraftCollectionSha256 = "" },
                C with { OriginalVersionsAndBytesManifestSha256 = "" }, C with { BackupManifestSha256 = "" },
                C with { ValidatorEvidenceSha256 = "" }, C with { InventoryManifestSha256 = "" },
                C with { OwnerId = "" }, C with { OwnerType = "account" }, C with { WorkspaceRowVersion = "" },
                C with { Revision = -1 }, C with { ReceiptCount = -1 }, C with { DocumentCount = -1 },
                C with { DraftCount = -1 }, C with { OriginalVersionCount = -1 }, C with { Origin = "https://wrong.invalid" } })
                Invalid(() => new ActivationPlan(WriteMode.StrictETagCas, M.ETag, H, H, 1, H, H, c));
        });
        foreach (var outcome in Enum.GetValues<WriteOutcome>())
        {
            Add(outcome + ": exact new bytes decide success", async () => {
                var f = new Fake { Outcome = outcome }; var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
                Require(r.Status == ActivationStatus.ObservedNewAfterAttempt && f.Writes == 1 && f.ContentReads == 2, "outcome replaced evidence");
            });
        }
        Add("strict 412: no fallback and old observed", async () => {
            var f = new Fake { Outcome = WriteOutcome.Refusal412, Apply = false };
            var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
            Require(r.Status == ActivationStatus.PriorObservedAfterAttempt && f.Writes == 1 && f.Condition?.IfMatch == M.ETag, "fallback/retry");
        });
        foreach (var apply in new[] { true, false })
            Add("transport exception reconcile " + (apply ? "applied" : "prior"), async () => {
                var f = new Fake { ThrowOnWrite = true, Apply = apply };
                var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
                Require(r.Status == (apply ? ActivationStatus.ObservedNewAfterAttempt : ActivationStatus.PriorObservedAfterAttempt), "exception skipped readback");
                Require(f.Writes == 1 && f.ContentReads == 2 && r.Outcome == WriteOutcome.Unknown && !r.ToString().Contains("MUST NOT escape"), "retry/leaked error");
            });
        Add("unreadable readback: ambiguous with all independent reads attempted", async () => {
            var f = new Fake { FailPostMetadata = true, FailPostContent = true };
            var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
            Require(r.Status == ActivationStatus.AmbiguousStop && f.MetadataReads == 4 && f.ContentReads == 2 && f.Writes == 1, "readback skipped");
        });
        Add("unexpected readback bytes: ambiguous", async () => {
            var f = new Fake { WriteBytes = new byte[] { 99 } }; var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
            Require(r.Status == ActivationStatus.AmbiguousStop && r.Readback?.ContentSha256 == FixedTarget.Hash(new byte[] { 99 }), "unknown considered successful");
        });
        foreach (var drift in new[] { "identity", "stable", "etag bracket" })
            Add("post-write " + drift + ": ambiguous", async () => {
                var f = new Fake(); f.MetadataHook = n => n <= 2 ? M : drift switch {
                    "identity" => M with { Package = Guid.NewGuid().ToString() },
                    "stable" => M with { StableMetadataSha256 = new string('d', 64) },
                    _ => M with { ETag = n == 3 ? "W/\"80\"" : "W/\"81\"" } };
                var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
                Require(r.Status == ActivationStatus.AmbiguousStop && f.Writes == 1, "post drift ignored");
            });
        Add("cancellation during attempted write still reconciles independently", async () => {
            using var source = new CancellationTokenSource();
            var f = new Fake { WriteHook = () => { source.Cancel(); throw new OperationCanceledException(source.Token); } };
            var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f, source.Token);
            Require(r.Status == ActivationStatus.ObservedNewAfterAttempt && r.Outcome == WriteOutcome.Cancelled && f.PostReadTokens.All(t => !t.IsCancellationRequested), "caller suppressed reconciliation");
        });
        Add("pre-cancelled caller: no mutation", async () => {
            var f = new Fake(); var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f, new CancellationToken(true));
            Require(r.Status == ActivationStatus.StoppedBeforeWrite && f.Writes == 0, "pre-cancelled wrote");
        });
        Add("single-use instance: no second write", async () => {
            var core = new ActivationCore(ActivationTiming.Fake); var f = new Fake(); await core.ActivateAsync(Plan(), NewBytes, f);
            f.Content = Fake.Prior.ToArray(); var r = await core.ActivateAsync(Plan(), NewBytes, f);
            Require(r.Status == ActivationStatus.InstanceAlreadyUsed && f.Writes == 1, "instance retried");
        });
        Add("explicit wildcard accurately labelled", async () => {
            var f = new Fake(); var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(WriteMode.ExclusiveWriterNoAtomicCas), NewBytes, f);
            Require(f.Condition?.IfMatch == "*" && r.Guarantee == "exclusive_writer_no_atomic_cas" && f.Writes == 1, "wildcard mislabeled");
        });
        Sync("boundary exposes only one fixed content mutation; no arbitrary method or target", () => {
            var methods = typeof(IFixedPackageBoundary).GetMethods();
            Require(methods.Length == 4 && methods.Count(m => m.Name.StartsWith("Update")) == 1, "extra method escape");
            var write = methods.Single(m => m.Name.StartsWith("Update"));
            Require(write.GetParameters().All(p => p.ParameterType != typeof(string) && p.ParameterType != typeof(Uri)), "arbitrary method/URL");
            Require(typeof(WriteCondition).GetConstructors().Length == 0, "caller can construct arbitrary If-Match");
        });
        Add("bounded readback even if boundary ignores cancellation", async () => {
            var f = new Fake { HangPostContent = true }; var time = System.Diagnostics.Stopwatch.StartNew();
            var r = await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(), NewBytes, f);
            Require(r.Status == ActivationStatus.AmbiguousStop && time.Elapsed < TimeSpan.FromSeconds(5) && f.Writes == 1, "unbounded reconciliation");
        });
        var failures = 0;
        foreach (var (name, test) in tests) { try { await test().WaitAsync(TimeSpan.FromSeconds(4)); Console.WriteLine("PASS " + name); } catch (Exception e) { failures++; Console.WriteLine("FAIL " + name + ": " + e.Message); } }
        Console.WriteLine($"{tests.Count - failures} passed, {failures} failed (offline fake boundary only).");
        return failures == 0 ? 0 : 1;
    }

    private sealed class Fake : IFixedPackageBoundary
    {
        public static readonly byte[] Prior = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory,"fixtures/prior-v5.nupkg"));
        public byte[] Content = Prior.ToArray(); public PackageMetadata Meta = M; public Checkpoint Checkpoint = C;
        public bool Apply = true, HangWrite, ThrowOnWrite, FailPostMetadata, FailPostContent, HangPostContent;
        public byte[]? WriteBytes; public WriteOutcome Outcome = WriteOutcome.Success204;
        public Func<int, PackageMetadata>? MetadataHook; public Func<byte[]>? ContentHook; public Action? WriteHook;
        public int Writes, MetadataReads, ContentReads; public WriteCondition? Condition;
        public readonly List<string> Calls = new(); public readonly List<CancellationToken> PostReadTokens = new();
        public Task<PackageMetadata> ReadCanonicalMetadataAsync(CancellationToken cancellation)
        {
            Calls.Add("metadata"); MetadataReads++; if (Writes > 0) PostReadTokens.Add(cancellation);
            cancellation.ThrowIfCancellationRequested();
            if (Writes > 0 && FailPostMetadata) throw new IOException("synthetic provider secret MUST NOT escape");
            return Task.FromResult(MetadataHook?.Invoke(MetadataReads) ?? Meta);
        }
        public Task<byte[]> ReadCanonicalContentAsync(CancellationToken cancellation)
        {
            Calls.Add("content"); ContentReads++; if (Writes > 0) PostReadTokens.Add(cancellation);
            cancellation.ThrowIfCancellationRequested();
            if (Writes > 0 && HangPostContent) return new TaskCompletionSource<byte[]>().Task;
            if (Writes > 0 && FailPostContent) throw new IOException("synthetic provider secret MUST NOT escape");
            return Task.FromResult((ContentHook?.Invoke() ?? Content).ToArray());
        }
        public Task<Checkpoint> ReadCompleteCheckpointAsync(CancellationToken cancellation)
        { Calls.Add("checkpoint"); cancellation.ThrowIfCancellationRequested(); return Task.FromResult(Checkpoint); }
        public Task<WriteOutcome> UpdateExistingPackageContentOnceAsync(ReadOnlyMemory<byte> content, WriteCondition condition, CancellationToken cancellation)
        {
            Calls.Add("write"); Writes++; Condition = condition;
            if (Apply) { Content = WriteBytes ?? content.ToArray(); Meta = Meta with { ETag = "W/\"79\"" }; }
            WriteHook?.Invoke(); if (HangWrite) return new TaskCompletionSource<WriteOutcome>().Task; if (ThrowOnWrite) throw new IOException("synthetic provider secret MUST NOT escape");
            return Task.FromResult(Outcome);
        }
    }
}
