#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
work_dir="$(dirname "$repo_dir")"
compiler="${KITCHEN_DOTNET:-$work_dir/dotnet/dotnet}"
export DOTNET_CLI_HOME="$work_dir/dotnet-home"
export NUGET_PACKAGES="$work_dir/nuget"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
export DOTNET_GENERATE_ASPNET_CERTIFICATE=false
cd "$repo_dir"
"$compiler" restore server/Kitchen.Dataverse.csproj --locked-mode
"$compiler" restore server/Tests/Kitchen.Policy.Tests.csproj --locked-mode
node --experimental-strip-types tests/microsoft-corpus.mjs
"$compiler" run --project server/Tests/Kitchen.Policy.Tests.csproj --no-restore -- import/2026.json server/Tests/obj/reducer-corpus.json
"$compiler" build server/Kitchen.Dataverse.csproj -c Release --no-restore
"$compiler" pack server/Kitchen.Dataverse.csproj -c Release --no-build --no-restore -o server/artifacts
python3 server/verify-package.py
