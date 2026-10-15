using Kitchen.Deploy;
namespace Kitchen.Acceptance;
public sealed record AcceptanceOptions(string Phase,bool Execute,string Url,string ContractPath,string SeedPath,string PackagePath) {
 public static AcceptanceOptions Parse(string[] args) {
  string phase="inspect",url=Target.Url,contract="server/deployment/registration.json",seed="import/2026.json",package="server/artifacts/guard-target-normalization-v5/Zunftkueche.Dataverse.1.0.0.nupkg";
  bool execute=false;var seen=new HashSet<string>();
  for(int i=0;i<args.Length;i++) {
   string flag=args[i];if(!seen.Add(flag))throw new AcceptanceFault("duplicate_argument");
   if(flag=="--execute"){execute=true;continue;}
   if(i+1==args.Length)throw new AcceptanceFault("missing_argument");string value=args[++i];
   switch(flag){case "--phase":phase=value;break;case "--url":url=value;break;case "--contract":contract=value;break;case "--seed":seed=value;break;case "--package":package=value;break;default:throw new AcceptanceFault("unknown_argument");}
  }
  if(phase is not ("inspect" or "prepare-canaries" or "runtime" or "denials-only"))throw new AcceptanceFault("invalid_phase");
  Target.ValidateUrl(url);
  if(Path.GetFullPath(seed).Split(Path.DirectorySeparatorChar).Contains(".local-state"))throw new AcceptanceFault("local_state_not_a_seed");
  return new(phase,execute,url,contract,seed,package);
 }
}
