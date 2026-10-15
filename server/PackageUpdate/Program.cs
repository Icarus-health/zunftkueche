using Kitchen.PackageUpdate;
using Kitchen.Deploy;
using System.Text.Json;
try {
 var mode=Invocation.Parse(args);
 Profiles.ValidateLocal();
 if(mode==ExecutionMode.Offline) { Console.WriteLine("{\"mode\":\"offline_no_authentication_or_provider_calls\"}"); return 0; }
 var auth=new InteractiveAuthentication();await auth.SignInAsync();
 using var updater=new FixedPackageUpdater(auth.TokenAsync,auth.ObjectId);
 var result=mode==ExecutionMode.Strict?await updater.ExecuteAsync():await updater.ExecuteExclusivePackageContentAsync();
 Console.WriteLine(JsonSerializer.Serialize(new { result, concurrencyMode=updater.ConcurrencyMode, patchDiagnostic=updater.PatchDiagnostic, runtimeReady=false }));return result is "updated_exact" or "already_current"?0:2;
} catch(Exception) { Console.WriteLine("{\"error\":\"package_update_stopped_details_suppressed\",\"runtimeReady\":false}");return 1; }
