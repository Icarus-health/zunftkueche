using Kitchen.Release;
using Kitchen.Inventory;
using PackageActivationPreparation;
static class ActivationIntegrationTests
{
    static readonly byte[] Old=[1,2,3],New=[4,5,6];static readonly string H=Check.Hash(new byte[]{7});
    static readonly Checkpoint C=new(FixedTarget.Tenant,FixedTarget.Environment,FixedTarget.Organization,FixedTarget.Origin,FixedTarget.App,FixedTarget.Workspace,"11111111-1111-4111-8111-111111111111","systemuser",3,"42",H,0,H,0,H,0,H,0,H,H,H,H);
    static readonly PackageMetadata M=new(FixedTarget.Organization,FixedTarget.Origin,FixedTarget.Package,FixedTarget.Assembly,FixedTarget.Name,FixedTarget.Name,FixedTarget.Version,"W/\"42\"",H);
    static ActivationPlan Plan(byte[] old,byte[] next)=>new(WriteMode.StrictETagCas,M.ETag,H,Check.Hash(next),next.Length,H,H,C,Check.Hash(old),old.Length);
    static void Assert(bool b){if(!b)throw new Exception("activation integration assertion");}
    public static async Task Run(Func<string,Func<Task>,Task> test) {
        await test("explicit diagnostic to final prior bytes accepted only by that plan",async()=>{var f=new Fake();var r=await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,f);Assert(r.Status==ActivationStatus.ObservedNewAfterAttempt&&f.Writes==1);var wrong=new Fake{Content=[9]};var stopped=await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,wrong);Assert(stopped.Status==ActivationStatus.StoppedBeforeWrite&&wrong.Writes==0);});
        await test("late completion after deadline never authorizes retry",async()=>{var f=new Fake{Late=true};var r=await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,f);Assert(r.Status==ActivationStatus.PriorObservedAfterAttempt&&f.Writes==1);f.CompleteLate();Assert(Check.Hash(f.Content)==Check.Hash(New));var retry=new Fake{Journal=f.Journal};await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,retry);Assert(retry.Writes==0);});
        await test("crash after durable intent before transport blocks restarted write",async()=>{var f=new Fake{CrashAfterIntent=true};await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,f);var restart=new Fake{Journal=f.Journal};await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,restart);Assert(f.Writes==0&&restart.Writes==0);});
        await test("crash after transport retains single attempt despite absent acknowledgment",async()=>{var f=new Fake{CrashAfterWrite=true};var r=await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,f);Assert(r.Status==ActivationStatus.ObservedNewAfterAttempt&&f.Writes==1);var restart=new Fake{Journal=f.Journal};await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,restart);Assert(restart.Writes==0);});
        await test("durable strict 412 never falls back across fresh instances",async()=>{var f=new Fake{Refuse=true};var r=await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,f);Assert(r.Status==ActivationStatus.PriorObservedAfterAttempt&&f.Condition!.IfMatch==M.ETag);var restart=new Fake{Journal=f.Journal};await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,restart);Assert(f.Writes==1&&restart.Writes==0);});
        await test("unreviewed transition record cannot reach boundary",async()=>{var f=new Fake();var evidence=new EvidenceFile("missing",1,H);var transition=new ReviewedTransition(TransitionKind.RefusalDiagnosticToFinal,H,1,evidence,evidence,evidence,WriteMode.StrictETagCas,evidence);try{await PackageActivation.Run(transition,".",C,M.ETag,H,f,f.Journal);throw new Exception();}catch(Stop){}Assert(f.Reads==0&&f.Writes==0);});
    }
    public static async Task RunPrerequisites(Func<string,Func<Task>,Task> test) {
        foreach(var final in new[]{false,true})await test("typed package prerequisites permit only matching "+(final?"witnessed final":"unproved refusal preparation"),async()=>{
            var fixture=new Round1Tests.PreparationFixture(ReleaseMode.ActivatePackage,final);var checks=0;
            var f=new Fake{Prerequisites=async()=>{checks++;await PhaseRoutePrerequisites.Validate(fixture.Phase,fixture.Root,fixture.Boundary,_=>throw new Exception("activation must verify prior package via activation core"),default);}};
            var result=await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,f);
            Assert(result.Status==ActivationStatus.ObservedNewAfterAttempt&&f.Writes==1&&checks>=1);
        });
        foreach(var defect in new[]{"no-preparation-contract","ordinary-use-enabled","missing-route","native-inventory-drift","fake-witness","unproved-as-final"})await test("package preparation "+defect+" stops before package write",async()=>{
            var fixture=new Round1Tests.PreparationFixture(ReleaseMode.ActivatePackage);fixture.Defect(defect);
            var f=new Fake{Prerequisites=()=>PhaseRoutePrerequisites.Validate(fixture.Phase,fixture.Root,fixture.Boundary,_=>Task.CompletedTask,default)};
            var result=await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,f);Assert(result.Status==ActivationStatus.StoppedBeforeWrite&&f.Writes==0);
        });
        await test("final transition cannot consume unproved preparation routes",async()=>{
            var fixture=new Round1Tests.PreparationFixture(ReleaseMode.ActivatePackage);fixture.Phase=fixture.Phase with{Transition=fixture.Phase.Transition! with{Kind=TransitionKind.RefusalDiagnosticToFinal},Preparation=null};
            var f=new Fake{Prerequisites=()=>PhaseRoutePrerequisites.Validate(fixture.Phase,fixture.Root,fixture.Boundary,_=>Task.CompletedTask,default)};
            var result=await new ActivationCore(ActivationTiming.Fake).ActivateAsync(Plan(Old,New),New,f);Assert(result.Status==ActivationStatus.StoppedBeforeWrite&&f.Writes==0);
        });
    }
    sealed class Fake:IFixedPackageBoundary {
        public byte[] Content=Old.ToArray();public bool Late,CrashAfterIntent,CrashAfterWrite,Refuse;public int Writes,Reads;public WriteCondition? Condition;
        public Func<Task>? Prerequisites;
        public IAttemptJournal Journal=new DurableAttemptJournal("/private/tmp/activation-journal-"+Guid.NewGuid(),"fixed-package");readonly TaskCompletionSource<WriteOutcome> late=new();
        public void CompleteLate(){Content=New.ToArray();late.TrySetResult(WriteOutcome.Success204);}
        public Task<PackageMetadata> ReadCanonicalMetadataAsync(CancellationToken t){Reads++;return Task.FromResult(M);}
        public Task<byte[]> ReadCanonicalContentAsync(CancellationToken t){Reads++;return Task.FromResult(Content.ToArray());}
        public async Task<Checkpoint> ReadCompleteCheckpointAsync(CancellationToken t){Reads++;if(Prerequisites!=null)await Prerequisites();return C;}
        public Task<WriteOutcome> UpdateExistingPackageContentOnceAsync(ReadOnlyMemory<byte> c,WriteCondition w,CancellationToken t){Journal.Begin("fixed");if(CrashAfterIntent)throw new IOException();Writes++;Condition=w;if(Late)return late.Task;if(!Refuse)Content=c.ToArray();if(CrashAfterWrite)throw new IOException();return Task.FromResult(Refuse?WriteOutcome.Refusal412:WriteOutcome.Success204);}
    }
}
