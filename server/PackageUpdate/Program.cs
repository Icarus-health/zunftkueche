using Kitchen.PackageUpdate;
using Kitchen.Deploy;
using System.Text.Json;
try {
 if(args.Length>1 || (args.Length==1 && args[0]!="--execute")) throw new DeploymentException("unknown_argument");
 Profiles.ValidateLocal();
 if(args.Length==0) { Console.WriteLine("{\"mode\":\"offline_no_authentication_or_provider_calls\"}"); return 0; }
 var auth=new InteractiveAuthentication();await auth.SignInAsync();
 using var updater=new FixedPackageUpdater(auth.TokenAsync,auth.ObjectId);
 var result=await updater.ExecuteAsync();
 Console.WriteLine(JsonSerializer.Serialize(new { result, runtimeReady=false }));return result is "updated_exact" or "already_current"?0:2;
} catch(Exception) { Console.WriteLine("{\"error\":\"package_update_stopped_details_suppressed\",\"runtimeReady\":false}");return 1; }
