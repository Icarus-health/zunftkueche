using System.Text.Json.Nodes;
using Kitchen.Inventory;
namespace Kitchen.Release;

public static class DocumentSchema
{
    public static string Logical(TableKind t)=>t switch{TableKind.Document=>"zk_kitchendocument",TableKind.Draft=>"zk_kitchendraft",_=>throw new Stop()};
    public static string Schema(TableKind t)=>t switch{TableKind.Document=>"zk_KitchenDocument",TableKind.Draft=>"zk_KitchenDraft",_=>throw new Stop()};
    public static string Set(TableKind t)=>t switch{TableKind.Document=>"zk_kitchendocuments",TableKind.Draft=>"zk_kitchendrafts",_=>throw new Stop()};
    public static string Relation(TableKind t)=>t switch{TableKind.Document=>"zk_workspace_documents",TableKind.Draft=>"zk_workspace_drafts",_=>throw new Stop()};
    static JsonObject Label(string label)=>new(){["LocalizedLabels"]=new JsonArray(new JsonObject{["Label"]=label,["LanguageCode"]=1031})};
    public static string Field(ColumnKind c)=>c switch{ColumnKind.Event=>"zk_eventid",ColumnKind.Payload=>"zk_payload",ColumnKind.Actor=>"zk_actor",ColumnKind.RecordedAt=>"zk_recordedat",ColumnKind.Workspace=>"zk_workspace",_=>throw new Stop()};
    public static JsonObject Column(ColumnKind c) {
        var types=new Dictionary<ColumnKind,string>{{ColumnKind.Event,"String"},{ColumnKind.Payload,"Memo"},{ColumnKind.Actor,"String"},{ColumnKind.RecordedAt,"DateTime"},{ColumnKind.Workspace,"Lookup"}};
        var labels=new Dictionary<ColumnKind,string>{{ColumnKind.Event,"Veranstaltung"},{ColumnKind.Payload,"Dokumentdaten"},{ColumnKind.Actor,"Bearbeiter"},{ColumnKind.RecordedAt,"Erfasst am"},{ColumnKind.Workspace,"Küchenbestand"}};
        Check.Require(types.ContainsKey(c));
        var a=new JsonObject{["@odata.type"]="Microsoft.Dynamics.CRM."+types[c]+"AttributeMetadata",["SchemaName"]=Field(c),["DisplayName"]=Label(labels[c]),["RequiredLevel"]=new JsonObject{["Value"]="ApplicationRequired",["CanBeChanged"]=true}};
        if(c is ColumnKind.Event or ColumnKind.Actor){a["MaxLength"]=c==ColumnKind.Event?500:36;a["FormatName"]=new JsonObject{["Value"]="Text"};}
        if(c==ColumnKind.Event)a["IsPrimaryName"]=true;
        if(c==ColumnKind.Payload){a["MaxLength"]=131072;a["Format"]="Text";}
        if(c==ColumnKind.RecordedAt){a["Format"]="DateAndTime";a["DateTimeBehavior"]=new JsonObject{["Value"]="UserLocal"};}
        return a;
    }
    public static JsonObject Table(TableKind t)=>new(){["@odata.type"]="Microsoft.Dynamics.CRM.EntityMetadata",["SchemaName"]=Schema(t),["EntitySetName"]=Set(t),["DisplayName"]=Label(t==TableKind.Document?"Küchendokument":"Küchenentwurf"),["DisplayCollectionName"]=Label(t==TableKind.Document?"Küchendokumente":"Küchenentwürfe"),["TableType"]="Standard",["OwnershipType"]="UserOwned",["IsActivity"]=false,["HasNotes"]=false,["HasActivities"]=false,["IsOptimisticConcurrencyEnabled"]=true,["Attributes"]=new JsonArray(Column(ColumnKind.Event))};
    public static JsonObject Relationship(TableKind t)=>new(){["@odata.type"]="Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",["SchemaName"]=Relation(t),["ReferencedEntity"]="zk_kitchenworkspace",["ReferencedAttribute"]="zk_kitchenworkspaceid",["ReferencingEntity"]=Logical(t),["ReferencingAttribute"]="zk_workspace",["ReferencingEntityNavigationPropertyName"]="zk_workspace",["ReferencedEntityNavigationPropertyName"]=Relation(t),["AssociatedMenuConfiguration"]=new JsonObject{["Behavior"]="DoNotDisplay",["Group"]="Details",["Order"]=10000},["CascadeConfiguration"]=new JsonObject{["Delete"]="Restrict",["Assign"]="NoCascade",["Merge"]="NoCascade",["RollupView"]="NoCascade",["Reparent"]="Cascade",["Share"]="Cascade",["Unshare"]="Cascade"},["Lookup"]=Column(ColumnKind.Workspace)};
    public static void MatchMetadata(JsonNode actual,JsonObject expected) {
        var normalized=(JsonObject)actual.DeepClone();
        if(normalized["@odata.type"] is JsonValue v&&v.TryGetValue<string>(out var type)&&type.StartsWith("#",StringComparison.Ordinal))normalized["@odata.type"]=type[1..];
        Check.Match(normalized,expected);
    }
    // Provider fields are inspected, never posted back wholesale. Unknown/missing metadata is not absence.
    public static Presence Compare(TableKind t, CanonicalSchema read) {
        if(!read.Complete)return Presence.Unknown;
        var collisions=read.Entities.Where(x=>(string?)x["LogicalName"]==Logical(t)||(string?)x["SchemaName"]==Schema(t)).ToArray();
        if(collisions.Length==0)return Presence.Missing;
        if(collisions.Length!=1)return Presence.DriftOrDuplicate;
        try {
            var e=collisions[0];Check.Id(e,"MetadataId");
            Check.Match(e,new JsonObject{["LogicalName"]=Logical(t),["SchemaName"]=Schema(t),["EntitySetName"]=Set(t),["PrimaryIdAttribute"]=Logical(t)+"id",["PrimaryNameAttribute"]="zk_eventid",["TableType"]="Standard",["OwnershipType"]="UserOwned",["IsActivity"]=false,["HasNotes"]=false,["HasActivities"]=false,["IsOptimisticConcurrencyEnabled"]=true,["IsManaged"]=false});
            Check.Require(read.Attributes.Select(a=>Check.Text(a,"LogicalName")).Distinct().Count()==read.Attributes.Length && read.Keys.Length==0);
            foreach(var kind in Enum.GetValues<ColumnKind>()) {
                var a=read.Attributes.Single(x=>(string?)x["LogicalName"]==Field(kind));
                var expected=Column(kind);expected.Remove("DisplayName");
                MatchMetadata(a,expected);Check.Id(a,"MetadataId");
                Check.Match(a,new JsonObject{["IsValidForCreate"]=true,["IsValidForRead"]=true,["IsValidForUpdate"]=true,["IsSecured"]=false});
                if(kind==ColumnKind.Workspace)Check.Match(a,new JsonObject{["Targets"]=new JsonArray("zk_kitchenworkspace")});
            }
            var relations=read.ManyToOne.Where(r=>(string?)r["SchemaName"]==Relation(t)||(string?)r["ReferencingAttribute"]=="zk_workspace").ToArray();Check.Require(relations.Length==1);
            var relation=Relationship(t);relation.Remove("Lookup");MatchMetadata(relations[0],relation);Check.Id(relations[0],"MetadataId");
            // All other parental relationships must be reviewed; no silent competing cascade parent.
            Check.Require(read.ManyToOne.All(r=>ReferenceEquals(r,relations[0]) || r["IsHierarchical"]?.GetValue<bool>()==false && r["CascadeConfiguration"] is JsonObject c && new[]{"Reparent","Share","Unshare","Assign","Delete"}.All(k=>(string?)c[k] is "NoCascade" or "Restrict" or "RemoveLink")));
            var ids=new[]{(Check.Id(e,"MetadataId"),1)}.Concat(read.Attributes.Where(a=>Enum.GetValues<ColumnKind>().Select(Field).Contains((string?)a["LogicalName"])).Select(a=>(Check.Id(a,"MetadataId"),2))).Append((Check.Id(relations[0],"MetadataId"),10));
            foreach(var (id,type) in ids)Check.Require(read.Components.Count(x=>(string?)x["objectid"]==id&&(int?)x["componenttype"]==type&&(string?)x["_solutionid_value"]==Target.Solution)==1);
            return Presence.ExistingExact;
        }catch{return Presence.DriftOrDuplicate;}
    }
}
public sealed record CanonicalSchema(bool Complete,JsonObject[] Entities,JsonObject[] Attributes,JsonObject[] Keys,JsonObject[] ManyToOne,JsonObject[] OneToMany,JsonObject[] Components);
public sealed record RelationshipEligibility(bool CanBeReferenced,bool CanBeReferencing,bool ValidReferencedPair,bool ValidReferencingPair,bool AllParentsRead,bool NoCompetingParent) {
    public bool CompleteEligible=>CanBeReferenced&&CanBeReferencing&&ValidReferencedPair&&ValidReferencingPair&&AllParentsRead&&NoCompetingParent;
}
public interface IDocumentSchemaBoundary {
    Task<TargetObservation> ReadExactTarget(SchemaStep step,CancellationToken token);
    Task<CanonicalSchema> ReadCanonicalSchema(TableKind table,CancellationToken token);
    Task<RelationshipEligibility> CheckFixedRelationshipEligibility(TableKind table,CancellationToken token);
    Task CreateFixedTableOnce(TableKind table,CancellationToken token);
    Task CreateFixedColumnOnce(TableKind table,ColumnKind column,CancellationToken token);
    Task CreateFixedRelationshipOnce(TableKind table,CancellationToken token);
    Task AddFixedSolutionMembershipOnce(TableKind table,FixedComponent component,CancellationToken token);
}
public sealed record ObjectReadback(Presence Object,Presence EnclosingCollection);
public sealed record TargetObservation(Presence State,JsonObject? Row=null,JsonObject? Companion=null);
public static class AdditiveAttempt
{
    // Compare complete returned objects on copies. Only the transport context and optional
    // metadata type prefix differ by URL; no source field or unknown attribute is removed.
    internal static bool SameRow(JsonObject a,JsonObject b) {
        JsonObject Copy(JsonObject row) {var copy=(JsonObject)row.DeepClone();copy.Remove("@odata.context");if(copy["@odata.type"] is JsonValue v&&v.TryGetValue<string>(out var type)&&type.StartsWith("#",StringComparison.Ordinal))copy["@odata.type"]=type[1..];return copy;}
        return Check.Fingerprint(Copy(a))==Check.Fingerprint(Copy(b));
    }
    public static async Task<ObjectReadback> ReadTargets(Func<CancellationToken,Task<TargetObservation>> exactObject,Func<CancellationToken,Task<TargetObservation>> collection,CancellationToken total) {
        async Task<TargetObservation> One(Func<CancellationToken,Task<TargetObservation>> read) {
            using var deadline=CancellationTokenSource.CreateLinkedTokenSource(total);deadline.CancelAfter(TimeSpan.FromSeconds(60));
            try{return await read(deadline.Token).WaitAsync(deadline.Token);}catch{return new(Presence.Unknown);}
        }
        // Accept a value only from the bounded await. A late ignored-cancellation completion
        // cannot mutate an earlier Unknown observation while the other read is running.
        var a=await One(exactObject);var b=await One(collection);
        if(a.State==Presence.ExistingExact&&b.State==Presence.ExistingExact) {
            if(a.Row==null||b.Row==null)return new(Presence.Unknown,Presence.Unknown);
            if(!SameRow(a.Row,b.Row))return new(Presence.DriftOrDuplicate,Presence.DriftOrDuplicate);
            if((a.Companion==null)!=(b.Companion==null) || a.Companion!=null&&!SameRow(a.Companion,b.Companion!))return new(Presence.DriftOrDuplicate,Presence.DriftOrDuplicate);
        }
        return new(a.State,b.State);
    }
    public static async Task<ObjectReadback> ReadBoth(Func<CancellationToken,Task<Presence>> exactObject,Func<CancellationToken,Task<Presence>> enclosingCollection,CancellationToken total) {
        Presence a=Presence.Unknown,b=Presence.Unknown;
        using(var perRead=CancellationTokenSource.CreateLinkedTokenSource(total)){perRead.CancelAfter(TimeSpan.FromSeconds(60));try{a=await exactObject(perRead.Token).WaitAsync(perRead.Token);}catch{}}
        using(var perRead=CancellationTokenSource.CreateLinkedTokenSource(total)){perRead.CancelAfter(TimeSpan.FromSeconds(60));try{b=await enclosingCollection(perRead.Token).WaitAsync(perRead.Token);}catch{}}
        return new(a,b);
    }

    public static async Task<AdditiveResult> Run(Func<CancellationToken,Task<ObjectReadback>> read,Func<CancellationToken,Task> create,
        Func<CancellationToken,Task<bool>> freshPrerequisites,IAttemptJournal journal,CancellationToken token=default) {
        ObjectReadback before;
        try {before=await read(token);if(before.Object==Presence.ExistingExact&&before.EnclosingCollection==Presence.ExistingExact)return AdditiveResult.ExistingExact;
            if(before.Object==Presence.DriftOrDuplicate||before.EnclosingCollection==Presence.DriftOrDuplicate)return AdditiveResult.DriftStop;
            if(before.Object!=Presence.Missing||before.EnclosingCollection!=Presence.Missing||!await freshPrerequisites(token))return AdditiveResult.StoppedBeforeAttempt;
            token.ThrowIfCancellationRequested();journal.Begin("fixed-additive-object");
        }catch{return AdditiveResult.StoppedBeforeAttempt;}
        using var deadline=CancellationTokenSource.CreateLinkedTokenSource(token);deadline.CancelAfter(TimeSpan.FromSeconds(90));
        try{await create(deadline.Token).WaitAsync(deadline.Token);}catch{/* Any attempted result still needs independent observation. */}
        var result=AdditiveResult.AmbiguousStop;
        using var independent=new CancellationTokenSource(TimeSpan.FromSeconds(180));
        try {
            var after=await read(independent.Token).WaitAsync(independent.Token);
            result=after.Object==Presence.ExistingExact&&after.EnclosingCollection==Presence.ExistingExact?AdditiveResult.CreatedObservedExact:
                after.Object==Presence.Missing&&after.EnclosingCollection==Presence.Missing?AdditiveResult.PriorAbsentAfterAttempt:
                after.Object==Presence.DriftOrDuplicate||after.EnclosingCollection==Presence.DriftOrDuplicate?AdditiveResult.DriftStop:AdditiveResult.AmbiguousStop;
        }catch{}
        try{journal.Observe(result.ToString());}catch{return AdditiveResult.AmbiguousStop;}
        return result; // No label grants retry. Preserve journal and partial resources.
    }
}

// Fixed provider adapter. Native eligibility is intentionally unresolved until exact action responses
// are reviewed; no relationship call is attempted on the strength of table names or a proposal.
internal sealed class FixedDocumentSchemaBoundary : IDocumentSchemaBoundary, IDisposable
{
    readonly Reader reader;readonly Func<Task<string>> token;readonly IAttemptJournal journal;readonly HttpClient client;int attempted;
    internal FixedDocumentSchemaBoundary(Reader reader,Func<Task<string>> token,IAttemptJournal journal,HttpMessageHandler? handler=null){this.reader=reader;this.token=token;this.journal=journal;client=new(handler??new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromSeconds(90)};}
    public async Task<TargetObservation> ReadExactTarget(SchemaStep step,CancellationToken cancellation) {
        try {
            JsonObject? row;
            if(step.Action==SchemaAction.SolutionMembership) {
                // AddSolutionComponent assigns its row ID. A fixed target lookup locates it;
                // a separately issued GUID GET then reads the actual object, never a guessed ID.
                var schema=await ReadCanonicalSchema(step.Table,cancellation);
                var (id,type)=SchemaPhase.Component(schema,step.Table,step.Component);
                var candidates=await reader.ExactMembershipCandidates(id,type).WaitAsync(cancellation);
                if(candidates.Length==0)return new(Presence.Missing);
                if(candidates.Length!=1)return new(Presence.DriftOrDuplicate);
                row=await reader.ExactObservedRow(candidates[0],false,cancellation);
                Check.Require(AdditiveAttempt.SameRow(row,candidates[0]));
                Check.Match(row,new JsonObject{["objectid"]=id,["componenttype"]=type,["_solutionid_value"]=Target.Solution});
                Check.Id(row,"solutioncomponentid");return new(Presence.ExistingExact,row);
            }
            row=await reader.ExactMetadata(step,cancellation);
            if(row==null)return new(Presence.Missing);
            SchemaPhase.ValidateRow(step,row);
            JsonObject? child=null;
            if(step.Action is SchemaAction.Table or SchemaAction.Relationship) {
                var column=step.Action==SchemaAction.Table?ColumnKind.Event:ColumnKind.Workspace;
                child=await reader.ExactMetadata(new(step.Table,SchemaAction.ScalarColumn,column),cancellation);
                Check.Require(child!=null);SchemaPhase.ValidateColumn(column,child!);
            }
            return new(Presence.ExistingExact,row,child);
        }catch{return new(Presence.Unknown);}
    }
    public async Task<CanonicalSchema> ReadCanonicalSchema(TableKind table,CancellationToken token) {
        try {
            reader.ReleaseQueries(ReleaseQueries.All);var entities=await reader.Rows(ReleaseQueries.Entities(table),"MetadataId",2).WaitAsync(token);
            if(entities.Length==0)return new(true,entities,[],[],[],[],[]);
            var exactEntity=await reader.Object(Queries.Table(DocumentSchema.Logical(table))).WaitAsync(token);
            var collectionEntity=(JsonObject)entities.Single().DeepClone();collectionEntity.Remove("@odata.context");Check.Match(exactEntity,collectionEntity);
            var attributes=await reader.Rows(Queries.Table(DocumentSchema.Logical(table))+"/Attributes","MetadataId",500).WaitAsync(token);
            foreach(var suffix in new[]{"String","Memo","DateTime","Lookup"}) {
                var typed=await reader.Rows(Queries.Table(DocumentSchema.Logical(table))+"/Attributes/Microsoft.Dynamics.CRM."+suffix+"AttributeMetadata","MetadataId",500).WaitAsync(token);
                foreach(var a in typed){var i=Array.FindIndex(attributes,b=>Check.Id(b,"MetadataId")==Check.Id(a,"MetadataId"));Check.Require(i>=0);attributes[i]=a;}
            }
            return new(true,entities,attributes,await reader.Rows(Queries.Table(DocumentSchema.Logical(table))+"/Keys","MetadataId",500).WaitAsync(token),await reader.Rows(Queries.Table(DocumentSchema.Logical(table))+"/ManyToOneRelationships","MetadataId",500).WaitAsync(token),await reader.Rows(Queries.Table(DocumentSchema.Logical(table))+"/OneToManyRelationships","MetadataId",500).WaitAsync(token),await reader.Rows(Queries.Components,"solutioncomponentid",10000).WaitAsync(token));
        }catch{return new(false,[],[],[],[],[],[]);}
    }
    public async Task<RelationshipEligibility> CheckFixedRelationshipEligibility(TableKind table,CancellationToken cancellation) {
        try {
            reader.ReleaseQueries(ReleaseQueries.All);
            var parent=await EligibilityAction(true,table,cancellation);var child=await EligibilityAction(false,table,cancellation);
            var parents=await reader.Object(ReleaseQueries.ValidParents(table)).WaitAsync(cancellation);var children=await reader.Object(ReleaseQueries.ValidChildren).WaitAsync(cancellation);
            Check.Require(parents["EntityNames"] is JsonArray&&children["EntityNames"] is JsonArray);
            var schema=await ReadCanonicalSchema(table,cancellation);
            var workspaceParents=await reader.Rows(Queries.Table("zk_kitchenworkspace")+"/OneToManyRelationships","MetadataId",500).WaitAsync(cancellation);
            var competing=schema.ManyToOne.Concat(workspaceParents).Where(r=>(string?)r["ReferencingEntity"]==DocumentSchema.Logical(table)&&(string?)r["SchemaName"]!=DocumentSchema.Relation(table));
            bool noCompeting=competing.All(r=>r["CascadeConfiguration"] is JsonObject c&&new[]{"Reparent","Share","Unshare","Assign","Delete"}.All(k=>(string?)c[k] is "NoCascade" or "Restrict" or "RemoveLink"));
            return new(parent,child,parents["EntityNames"]!.AsArray().Any(n=>(string?)n=="zk_kitchenworkspace"),children["EntityNames"]!.AsArray().Any(n=>(string?)n==DocumentSchema.Logical(table)),schema.Complete,noCompeting);
        }catch{return new(false,false,false,false,false,false);}
    }
    async Task<bool> EligibilityAction(bool referenced,TableKind table,CancellationToken cancellation) {
        string action=referenced?"CanBeReferenced":"CanBeReferencing";
        using var request=new HttpRequestMessage(HttpMethod.Post,Target.Api+action);
        request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",await token());
        request.Content=new StringContent(new JsonObject{["EntityName"]=referenced?"zk_kitchenworkspace":DocumentSchema.Logical(table)}.ToJsonString(),System.Text.Encoding.UTF8,"application/json");
        using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,cancellation);Check.Require(response.IsSuccessStatusCode);
        using var stream=await response.Content.ReadAsStreamAsync(cancellation);using var data=new MemoryStream();var buffer=new byte[8192];int n;
        while((n=await stream.ReadAsync(buffer,cancellation))>0){Check.Require(data.Length+n<=65536);data.Write(buffer,0,n);}
        var bytes=data.ToArray();reader.CaptureSemanticResponse(action,bytes);var value=Check.Parse(bytes);Check.NoNestedContinuation(value);
        Check.Require(value.All(p=>p.Key==action||p.Key=="@odata.context"));return value[action]?.GetValue<bool>()??throw new Stop();
    }
    public Task CreateFixedTableOnce(TableKind table,CancellationToken cancellation)=>PostOnce("table-"+table,"EntityDefinitions",DocumentSchema.Table(table),cancellation);
    public Task CreateFixedColumnOnce(TableKind table,ColumnKind column,CancellationToken cancellation) {
        Check.Require(column is ColumnKind.Payload or ColumnKind.Actor or ColumnKind.RecordedAt);
        return PostOnce("column-"+table+"-"+column,Queries.Table(DocumentSchema.Logical(table))+"/Attributes",DocumentSchema.Column(column),cancellation);
    }
    public async Task CreateFixedRelationshipOnce(TableKind table,CancellationToken cancellation) {
        Check.Require((await CheckFixedRelationshipEligibility(table,cancellation)).CompleteEligible);
        await PostOnce("relationship-"+table,"RelationshipDefinitions",DocumentSchema.Relationship(table),cancellation);
    }
    public async Task AddFixedSolutionMembershipOnce(TableKind table,FixedComponent component,CancellationToken cancellation) {
        var schema=await ReadCanonicalSchema(table,cancellation);var (id,type)=SchemaPhase.Component(schema,table,component);
        Check.Require(schema.Components.Count(c=>(string?)c["objectid"]==id&&(int?)c["componenttype"]==type&&(string?)c["_solutionid_value"]==Target.Solution)==0);
        await PostOnce("membership-"+table+"-"+component,"AddSolutionComponent",new JsonObject{["ComponentId"]=id,["ComponentType"]=type,["SolutionUniqueName"]="zk_Zunftkueche",["AddRequiredComponents"]=false,["DoNotIncludeSubcomponents"]=true},cancellation);
    }
    async Task PostOnce(string operation,string fixedPath,JsonObject payload,CancellationToken cancellation) {
        Check.Require(ReviewedRelease.CanExecute(ReleaseMode.ProvisionDocumentSchema)&&Interlocked.Exchange(ref attempted,1)==0);
        Check.Require(journal.AttemptPersisted);
        using var request=new HttpRequestMessage(HttpMethod.Post,Target.Api+fixedPath);
        request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",await token());request.Headers.Add("MSCRM.SolutionUniqueName","zk_Zunftkueche");
        request.Content=new StringContent(payload.ToJsonString(),System.Text.Encoding.UTF8,"application/json");
        using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,cancellation);
        Check.Require(response.IsSuccessStatusCode); // Enclosing AdditiveAttempt still requires independent readback on every outcome.
    }
    public void Dispose()=>client.Dispose();
}

public enum SchemaAction { Table, ScalarColumn, Relationship, SolutionMembership }
public enum FixedComponent { Table, Event, Payload, Actor, RecordedAt, Workspace, Relationship }
public sealed record SchemaStep(TableKind Table,SchemaAction Action,ColumnKind Column=ColumnKind.Event,FixedComponent Component=FixedComponent.Table);
public static class SchemaPhase
{
    internal static string ExactPath(SchemaStep step)=>step.Action switch {
        SchemaAction.Table=>Queries.Table(DocumentSchema.Logical(step.Table)),
        SchemaAction.ScalarColumn=>Queries.Table(DocumentSchema.Logical(step.Table))+$"/Attributes(LogicalName='{DocumentSchema.Field(step.Column)}')/"+(string)DocumentSchema.Column(step.Column)["@odata.type"]!,
        SchemaAction.Relationship=>$"RelationshipDefinitions(SchemaName='{DocumentSchema.Relation(step.Table)}')/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        _=>throw new Stop()
    };
    internal static void ValidateColumn(ColumnKind column,JsonObject row) {
        var expected=DocumentSchema.Column(column);expected.Remove("DisplayName");expected["LogicalName"]=DocumentSchema.Field(column);
        DocumentSchema.MatchMetadata(row,expected);Check.Id(row,"MetadataId");
        if(column==ColumnKind.Workspace)Check.Match(row,new JsonObject{["Targets"]=new JsonArray("zk_kitchenworkspace")});
    }
    internal static void ValidateRow(SchemaStep step,JsonObject row) {
        Check.Id(row,"MetadataId");JsonObject expected;
        if(step.Action==SchemaAction.Table) {
            expected=DocumentSchema.Table(step.Table);expected.Remove("Attributes");expected.Remove("DisplayName");expected.Remove("DisplayCollectionName");
            expected["LogicalName"]=DocumentSchema.Logical(step.Table);expected["PrimaryIdAttribute"]=DocumentSchema.Logical(step.Table)+"id";expected["PrimaryNameAttribute"]="zk_eventid";expected["IsManaged"]=false;
        } else if(step.Action==SchemaAction.Relationship){expected=DocumentSchema.Relationship(step.Table);expected.Remove("Lookup");}
        else if(step.Action==SchemaAction.ScalarColumn){ValidateColumn(step.Column,row);return;}
        else throw new Stop();
        DocumentSchema.MatchMetadata(row,expected);
    }
    internal static TargetObservation FromCollection(SchemaStep step,CanonicalSchema schema) {
        var state=Observe(step,schema);if(state!=Presence.ExistingExact)return new(state);
        try {
            var row=step.Action switch {
                SchemaAction.Table=>schema.Entities.Single(e=>(string?)e["LogicalName"]==DocumentSchema.Logical(step.Table)),
                SchemaAction.ScalarColumn=>schema.Attributes.Single(a=>(string?)a["LogicalName"]==DocumentSchema.Field(step.Column)),
                SchemaAction.Relationship=>schema.ManyToOne.Single(r=>(string?)r["SchemaName"]==DocumentSchema.Relation(step.Table)),
                SchemaAction.SolutionMembership=>Membership(),
                _=>throw new Stop()
            };
            JsonObject Membership(){var(id,type)=Component(schema,step.Table,step.Component);return schema.Components.Single(c=>(string?)c["objectid"]==id&&(int?)c["componenttype"]==type&&(string?)c["_solutionid_value"]==Target.Solution);}
            JsonObject? companion=step.Action is SchemaAction.Table or SchemaAction.Relationship?schema.Attributes.Single(a=>(string?)a["LogicalName"]==DocumentSchema.Field(step.Action==SchemaAction.Table?ColumnKind.Event:ColumnKind.Workspace)):null;
            return new(state,row,companion);
        }catch{return new(Presence.Unknown);}
    }
    public static (string Id,int Type) Component(CanonicalSchema s,TableKind t,FixedComponent component) {
        Check.Require(s.Complete);
        Check.Require(Observe(new SchemaStep(t,SchemaAction.Table),s)==Presence.ExistingExact);
        if(component==FixedComponent.Table)return(Check.Id(s.Entities.Single(e=>(string?)e["LogicalName"]==DocumentSchema.Logical(t)),"MetadataId"),1);
        if(component==FixedComponent.Relationship){var row=s.ManyToOne.Single(e=>(string?)e["SchemaName"]==DocumentSchema.Relation(t));var expected=DocumentSchema.Relationship(t);expected.Remove("Lookup");DocumentSchema.MatchMetadata(row,expected);return(Check.Id(row,"MetadataId"),10);}
        var c=component switch{FixedComponent.Event=>ColumnKind.Event,FixedComponent.Payload=>ColumnKind.Payload,FixedComponent.Actor=>ColumnKind.Actor,FixedComponent.RecordedAt=>ColumnKind.RecordedAt,FixedComponent.Workspace=>ColumnKind.Workspace,_=>throw new Stop()};
        var column=s.Attributes.Single(e=>(string?)e["LogicalName"]==DocumentSchema.Field(c));var expectedColumn=DocumentSchema.Column(c);expectedColumn.Remove("DisplayName");DocumentSchema.MatchMetadata(column,expectedColumn);return(Check.Id(column,"MetadataId"),2);
    }
    public static Presence Observe(SchemaStep step,CanonicalSchema s) {
        if(!s.Complete)return Presence.Unknown;
        try {
            JsonObject[] rows;JsonObject expected;
            switch(step.Action) {
                case SchemaAction.Table:
                    rows=s.Entities.Where(e=>(string?)e["LogicalName"]==DocumentSchema.Logical(step.Table)||(string?)e["SchemaName"]==DocumentSchema.Schema(step.Table)).ToArray();expected=DocumentSchema.Table(step.Table);expected.Remove("Attributes");expected.Remove("DisplayName");expected.Remove("DisplayCollectionName");expected["LogicalName"]=DocumentSchema.Logical(step.Table);expected["PrimaryIdAttribute"]=DocumentSchema.Logical(step.Table)+"id";expected["PrimaryNameAttribute"]="zk_eventid";expected["IsManaged"]=false;break;
                case SchemaAction.ScalarColumn:
                    Check.Require(step.Column is ColumnKind.Payload or ColumnKind.Actor or ColumnKind.RecordedAt);rows=s.Attributes.Where(a=>(string?)a["LogicalName"]==DocumentSchema.Field(step.Column)||(string?)a["SchemaName"]==DocumentSchema.Field(step.Column)).ToArray();expected=DocumentSchema.Column(step.Column);expected.Remove("DisplayName");break;
                case SchemaAction.Relationship:
                    rows=s.ManyToOne.Where(r=>(string?)r["SchemaName"]==DocumentSchema.Relation(step.Table)||(string?)r["ReferencingAttribute"]=="zk_workspace").ToArray();expected=DocumentSchema.Relationship(step.Table);expected.Remove("Lookup");break;
                case SchemaAction.SolutionMembership:
                    var (id,type)=Component(s,step.Table,step.Component);var members=s.Components.Where(c=>(string?)c["objectid"]==id&&(int?)c["componenttype"]==type&&(string?)c["_solutionid_value"]==Target.Solution).ToArray();return members.Length==0?Presence.Missing:members.Length==1?Presence.ExistingExact:Presence.DriftOrDuplicate;
                default:return Presence.Unknown;
            }
            if(rows.Length==0) {
                // A pre-existing workspace lookup without its exact relationship is partial/drift,
                // not permission to deep-insert another lookup through a relationship.
                if(step.Action==SchemaAction.Relationship&&s.Attributes.Any(a=>(string?)a["LogicalName"]=="zk_workspace"||(string?)a["SchemaName"]=="zk_workspace"))return Presence.DriftOrDuplicate;
                return Presence.Missing;
            }
            if(rows.Length!=1)return Presence.DriftOrDuplicate;
            Check.Id(rows[0],"MetadataId");DocumentSchema.MatchMetadata(rows[0],expected);
            if(step.Action is SchemaAction.Table or SchemaAction.Relationship){var c=step.Action==SchemaAction.Table?ColumnKind.Event:ColumnKind.Workspace;ValidateColumn(c,s.Attributes.Single(a=>(string?)a["LogicalName"]==DocumentSchema.Field(c)));}
            return Presence.ExistingExact;
        }catch{return Presence.DriftOrDuplicate;}
    }
    public static async Task<AdditiveResult> Run(SchemaStep step,IDocumentSchemaBoundary boundary,Func<CancellationToken,Task<bool>> checkpoint,IAttemptJournal journal,CancellationToken token=default) {
        Check.Require(Enum.IsDefined(step.Action)&&Enum.IsDefined(step.Table));
        Task<ObjectReadback> Read(CancellationToken t)=>AdditiveAttempt.ReadTargets(c=>boundary.ReadExactTarget(step,c),async c=>FromCollection(step,await boundary.ReadCanonicalSchema(step.Table,c)),t);
        async Task<bool> Prerequisites(CancellationToken t) {
            if(step.Action!=SchemaAction.Table && Observe(new SchemaStep(step.Table,SchemaAction.Table),await boundary.ReadCanonicalSchema(step.Table,t))!=Presence.ExistingExact)return false;
            return await checkpoint(t)&&(step.Action!=SchemaAction.Relationship||(await boundary.CheckFixedRelationshipEligibility(step.Table,t)).CompleteEligible);
        }
        Task Create(CancellationToken t)=>step.Action switch{SchemaAction.Table=>boundary.CreateFixedTableOnce(step.Table,t),SchemaAction.ScalarColumn=>boundary.CreateFixedColumnOnce(step.Table,step.Column,t),SchemaAction.Relationship=>boundary.CreateFixedRelationshipOnce(step.Table,t),SchemaAction.SolutionMembership=>boundary.AddFixedSolutionMembershipOnce(step.Table,step.Component,t),_=>throw new Stop()};
        return await AdditiveAttempt.Run(Read,Create,Prerequisites,journal,token);
    }
}
