using System.Text.Json;
using System.Text.Json.Nodes;
using Kitchen.Deploy;

// All local validation precedes authentication. No tokens or provider payloads are written to disk.
try {
    var options = Options.Parse(args);
    Target.ValidateUrl(options.Url);
    var contract = Provisioner.LoadContract(options.ContractPath);
    var original = File.ReadAllBytes(options.SeedPath);
    var seed = Seed.Normalize(original);
    var package = Seed.Package(options.PackagePath);
    if (options.DryRun) {
        Console.WriteLine(JsonSerializer.Serialize(new {
            phase = options.Phase, mode = "offline_plan_no_authentication_or_provider_calls",
            target = Target.Url, tenant = Target.Tenant, organization = Target.Organization,
            account = Target.User, workspaceId = Seed.WorkspaceId,
            sourceSha256 = Seed.Hash(original), normalizedSha256 = Seed.Hash(System.Text.Encoding.UTF8.GetBytes(seed.ToJsonString())),
            packageSha256 = Seed.Hash(package), tables = 2, actions = 2, requiredDedicatedGuardPairs = contract["guardSteps"]!.AsArray().Count, coverageRecords = contract["guardCoverage"]!.AsArray().Count,
            readiness = "not_live_verified"
        }));
        return 0;
    }
    var auth = new InteractiveAuthentication();
    await auth.SignInAsync();
    using var transport = new WebApiTransport(options.Url, auth.TokenAsync);
    var engine = new ResourceEngine(transport, auth.ObjectId);
    var user = await engine.AuthenticateTargetAsync();
    var provisioner = new Provisioner(engine, transport, contract);
    try {
        if (options.Phase == "inspect") await provisioner.Inventory();
        await provisioner.Tables(options.Phase == "tables");
        if (options.Phase == "seed") await provisioner.SeedWorkspace(seed, user, true);
        if (options.Phase == "backend") {
            // Compare the initial seed, including owner and full normalized content, before activation.
            await provisioner.SeedWorkspace(seed, user, false);
            await provisioner.Backend(package, true);
        }
        if (options.Phase is "inspect" or "verify") {
            await provisioner.VerifyWorkspace(seed, user);
            await provisioner.Backend(package, false);
        }
        Console.WriteLine(JsonSerializer.Serialize(new {
            phase = options.Phase, workspaceId = Seed.WorkspaceId, resources = engine.Resources,
            gaps = provisioner.Gaps, packageCreateDiagnostics = transport.PackageCreateDiagnostics, metadataReady = options.Phase == "verify" && provisioner.Gaps.Count == 0,
            liveRuntimeAcceptance = "pending_root_tests", ordinaryUserAcceptance = "not_authorized_or_tested"
        }));
        return options.Phase != "inspect" && provisioner.Gaps.Count > 0 ? 2 : 0;
    } catch (Exception e) {
        Console.WriteLine(JsonSerializer.Serialize(new { phase = options.Phase, resources = engine.Resources, gaps = provisioner.Gaps, packageCreateDiagnostics = transport.PackageCreateDiagnostics, error = SafeOutput.Error(e), metadataReady = false }));
        return 1;
    }
} catch (Exception e) {
    Console.WriteLine(JsonSerializer.Serialize(new { error = SafeOutput.Error(e), metadataReady = false }));
    return 1;
}

namespace Kitchen.Deploy {
    public sealed record Options(string Phase, bool DryRun, string Url, string ContractPath, string SeedPath, string PackagePath) {
        public static Options Parse(string[] args) {
            string phase = "inspect", url = Target.Url, contract = "server/deployment/registration.json", seed = "import/2026.json", package = "server/artifacts/guard-target-normalization-v5/Zunftkueche.Dataverse.1.0.0.nupkg";
            bool dry = false; var seen = new HashSet<string>();
            for (int i = 0; i < args.Length; i++) {
                string flag = args[i]; if (!seen.Add(flag)) throw new DeploymentException("duplicate_argument");
                if (flag == "--dry-run") { dry = true; continue; }
                if (i + 1 == args.Length) throw new DeploymentException("missing_argument_value");
                string value = args[++i];
                switch (flag) {
                    case "--phase": phase = value; break;
                    case "--url": url = value; break;
                    case "--contract": contract = value; break;
                    case "--seed": seed = value; break;
                    case "--package": package = value; break;
                    default: throw new DeploymentException("unknown_argument");
                }
            }
            if (!new[] { "inspect", "tables", "seed", "backend", "verify" }.Contains(phase)) throw new DeploymentException("unknown_phase");
            if (Path.GetFullPath(seed).Split(Path.DirectorySeparatorChar).Contains(".local-state")) throw new DeploymentException("local_working_state_not_a_seed");
            return new(phase, dry, url, contract, seed, package);
        }
    }
}
