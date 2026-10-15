using Kitchen.Deploy;
namespace Kitchen.PackageUpdate;
public enum ExecutionMode { Offline, Strict, ExclusivePackageOnly }
public static class Invocation {
 public static ExecutionMode Parse(string[] args)=>args.Length switch {
  0=>ExecutionMode.Offline,
  1 when args[0]=="--execute"=>ExecutionMode.Strict,
  1 when args[0]=="--execute-exclusive-package-content"=>ExecutionMode.ExclusivePackageOnly,
  _=>throw new DeploymentException("unknown_argument")
 };
}
