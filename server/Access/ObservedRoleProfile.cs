using Kitchen.Deploy;
using System.Text.Json.Nodes;
namespace Kitchen.Access;

// Only the measured retained four privileges; not a general platform baseline.
internal static class ObservedRoleProfile {
    internal const string User="4ee486b9-9fc8-f111-a05c-7ced8d5f6c91",Aad="fe2f887e-cec7-4417-863e-dfd52ed174e4",BusinessUnit="eacc1a23-86c7-f111-a05a-002248da9a3e",Role="660a97b9-a8c8-f111-a05c-7ced8d5f6c91";
    internal static readonly (string Id,string Name)[] Retained=[
        ("fecbd29c-df64-4ede-a611-47226b402c22","prvReadSharePointData"),
        ("cfdd12cf-090b-4599-8302-771962d2350a","prvWriteSharePointData"),
        ("5eb85025-363b-46ea-a77e-ce24159cd231","prvCreateSharePointData"),
        ("d71fc8d0-99bc-430e-abd7-d95c64f11e9c","prvReadSharePointDocument")
    ];
    private static readonly string[] AbsenceQueries=[
        "sharepointmanagedidentities?$select=sharepointmanagedidentityid&$top=1",
        "sharepointsites?$select=sharepointsiteid&$top=1",
        "sharepointdocumentlocations?$select=sharepointdocumentlocationid&$top=1"
    ];
    internal static async Task VerifyNames(ResourceEngine engine){
        var rows=await engine.Rows("privileges?$select=privilegeid,name&$filter="+string.Join(" or ",Retained.Select(p=>"privilegeid eq "+p.Id)));
        var ids=new HashSet<string>();
        if(rows.Length!=4||rows.Any(r=>!ids.Add(ResourceEngine.Id(r,"privilegeid"))||!Retained.Any(p=>p.Id==ResourceEngine.Id(r,"privilegeid")&&p.Name==r["name"]?.GetValue<string>())))throw new DeploymentException("observed_privilege_names_drift");
    }
    internal static async Task RequireNoConfiguration(ResourceEngine engine){
        foreach(string path in AbsenceQueries){
            JsonArray rows;
            try{
                var response=await engine.Get(path);
                if(response==null||response.ContainsKey("error")||response["@odata.nextLink"]!=null||response["value"] is not JsonArray values)throw new DeploymentException("sharepoint_configuration_unavailable");
                rows=values;
            }catch(Exception){throw new DeploymentException("sharepoint_configuration_unavailable");}
            if(rows.Count!=0)throw new DeploymentException("sharepoint_configuration_present");
        }
    }
}
