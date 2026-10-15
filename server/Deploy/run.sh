#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
work_dir="$(dirname "$repo_dir")"
export DOTNET_CLI_HOME="$work_dir/dotnet-home"
export NUGET_PACKAGES="$work_dir/nuget"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_GENERATE_ASPNET_CERTIFICATE=false
cd "$repo_dir"
exec "$work_dir/dotnet10/dotnet" run --project server/Deploy --no-restore -- "$@"
