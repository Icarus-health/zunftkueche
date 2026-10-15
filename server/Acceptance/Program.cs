using System.Text.Json;
using Kitchen.Acceptance;
using Kitchen.Deploy;
Session? session=null;
try {
 var options=AcceptanceOptions.Parse(args);
 Target.ValidateUrl(options.Url);
 var contract=Provisioner.LoadContract(options.ContractPath);
 var seed=Seed.Normalize(File.ReadAllBytes(options.SeedPath));
 var package=Seed.Package(options.PackagePath);
 if(!options.Execute) {
  Console.WriteLine(JsonSerializer.Serialize(new{phase=options.Phase,offline=true,providerCalls=0,writes=0,canaryWorkspaces=2,canaryReceipts=2,supportedDenialRoutes=24,unexecutedAvailabilityClassifications=2,rootReleaseAllowed=false}));return 0;
 }
 var auth=new InteractiveAuthentication();await auth.SignInAsync();
 using var transport=new AcceptanceTransport(options.Url,auth.TokenAsync);
 session=new(transport,auth.ObjectId,contract,seed,package);
 await session.RunAsync(options.Phase);
 Console.WriteLine(JsonSerializer.Serialize(new{phase=options.Phase,offline=false,checks=session.Evidence.Checks,availability=session.Evidence.Availability,supportedDenialsComplete=session.Evidence.SupportedDenialsComplete,historicalCommitEvidence=options.Phase=="denials-only"?"root_run_25963_not_reexecuted":null,rootReleaseAllowed=session.Evidence.RootReleaseAllowed,ordinaryUserAcceptance=false,teamAcceptance=false,rollbackFaultInjectionAcceptance=false}));return 0;
}catch(Exception error){
 Console.WriteLine(JsonSerializer.Serialize(new{stopped=true,error=Diagnosis.SafeError(error),checks=session?.Evidence.Checks,availability=session?.Evidence.Availability,supportedDenialsComplete=false,rootReleaseAllowed=false}));return 1;
}
