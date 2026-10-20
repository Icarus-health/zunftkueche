import hashlib
import json
from pathlib import Path
import subprocess

base = "0d2e79a77d14e37fbf7a5998e256439b0545b02d"
paths = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", base], text=True).splitlines()
protected = [
    path for path in paths
    if path.startswith(("server/", "tools/", "src/data/", "src/domain/", "src/hooks/", "src/generated/"))
    or path in [
        "src/ui/receipt-acceptance.ts", "src/ui/draft-guard.ts", "package.json",
        "package-lock.json", "power.config.json", "tsconfig.json", "vite.config.ts",
    ]
]
mismatches = [
    path for path in protected
    if Path(path).read_bytes() != subprocess.check_output(["git", "show", f"{base}:{path}"])
]
root_hash = hashlib.sha256(Path(".local-state/state.json").read_bytes()).hexdigest()
result = {
    "task6Base": base,
    "correctionBase": "15de237dd86a5a6e375910cf1cc32bba4c48d360",
    "sourceCommit": "e6e3f45ddd0a48c458942c06c1a84253c0b854c3",
    "protectedTrackedFilesCompared": len(protected),
    "protectedPaths": protected,
    "mismatches": mismatches,
    "rootStateSha256": root_hash,
    "rootMatchesTask6Proof": root_hash == "09ac7edb02e899618bb6a802c33056d0460c5c428258e96739e4d4a26734d300",
}
Path(__file__).with_suffix(".json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({key: value for key, value in result.items() if key != "protectedPaths"}, indent=2))
assert not mismatches and result["rootMatchesTask6Proof"]
