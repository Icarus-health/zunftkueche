using System.Text.Json.Nodes;
using Kitchen.Release;
static class PhaseTests
{
    public static async Task Run(Func<string,Func<Task>,Task> test) {
        await test("schema typed table dispatch performs one durable additive attempt",async()=>{var b=new Boundary();var j=new Journal();var r=await SchemaPhase.Run(new(TableKind.Document,SchemaAction.Table),b,_=>Task.FromResult(true),j);if(r!=AdditiveResult.CreatedObservedExact||b.Writes!=1||b.Reads!=4||!j.AttemptPersisted)throw new Exception();});
        await test("schema checkpoint drift prevents typed mutation",async()=>{var b=new Boundary();var r=await SchemaPhase.Run(new(TableKind.Document,SchemaAction.Table),b,_=>Task.FromResult(false),new Journal());if(r!=AdditiveResult.StoppedBeforeAttempt||b.Writes!=0)throw new Exception();});
        await test("column dispatch requires independently existing parent table",async()=>{var b=new Boundary();var r=await SchemaPhase.Run(new(TableKind.Document,SchemaAction.ScalarColumn,ColumnKind.Payload),b,_=>Task.FromResult(true),new Journal());if(r!=AdditiveResult.StoppedBeforeAttempt||b.Writes!=0)throw new Exception();});
        await test("relationship dispatch cannot turn unknown eligibility into allowed",async()=>{var b=new Boundary{Installed=true};var r=await SchemaPhase.Run(new(TableKind.Document,SchemaAction.Relationship),b,_=>Task.FromResult(true),new Journal());if(r!=AdditiveResult.StoppedBeforeAttempt||b.Writes!=0)throw new Exception();});
        await test("solution component identity derives only from fixed canonical metadata",()=>{var b=new Boundary{Installed=true};var s=b.Schema();var id=SchemaPhase.Component(s,TableKind.Document,FixedComponent.Table);if(id.Type!=1||id.Id!="11111111-1111-4111-8111-111111111111")throw new Exception();return Task.CompletedTask;});
    }
    sealed class Journal:IAttemptJournal{public bool AttemptPersisted{get;private set;}public void Begin(string s){AttemptPersisted=true;}public void Observe(string s){}}
    sealed class Boundary:IDocumentSchemaBoundary {
        public int Reads,Writes;public bool Installed;
        public CanonicalSchema Schema(){var e=DocumentSchema.Table(TableKind.Document);e.Remove("Attributes");e["LogicalName"]="zk_kitchendocument";e["PrimaryIdAttribute"]="zk_kitchendocumentid";e["PrimaryNameAttribute"]="zk_eventid";e["IsManaged"]=false;e["MetadataId"]="11111111-1111-4111-8111-111111111111";var primary=DocumentSchema.Column(ColumnKind.Event);primary["LogicalName"]="zk_eventid";return new(true,Installed?[e]:[],Installed?[primary]:[],[],[],[],[]);}
        public Task<CanonicalSchema> ReadCanonicalSchema(TableKind t,CancellationToken c){Reads++;return Task.FromResult(Schema());}
        public Task<RelationshipEligibility> CheckFixedRelationshipEligibility(TableKind t,CancellationToken c)=>Task.FromResult(new RelationshipEligibility(false,false,false,false,false,false));
        public Task CreateFixedTableOnce(TableKind t,CancellationToken c){Writes++;Installed=true;return Task.CompletedTask;}
        public Task CreateFixedColumnOnce(TableKind t,ColumnKind k,CancellationToken c){Writes++;return Task.CompletedTask;}
        public Task CreateFixedRelationshipOnce(TableKind t,CancellationToken c){Writes++;return Task.CompletedTask;}
        public Task AddFixedSolutionMembershipOnce(TableKind t,FixedComponent f,CancellationToken c){Writes++;return Task.CompletedTask;}
    }
}
