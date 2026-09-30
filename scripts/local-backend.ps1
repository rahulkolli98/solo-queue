# Local Convex backend launcher (Windows).
#
# WHY THIS EXISTS: `npx convex dev` bootstraps its own backend, but that
# bootstrap breaks in some environments (it fails fetching/spawning while the
# backend itself is healthy). Workaround: start the backend with this script
# first, then run `npx convex dev --once` / `codegen` / `run` normally — the
# CLI skips its broken bootstrap when a backend is already listening.
#
# Everything is read from .convex/local/default/config.json — no secrets are
# hardcoded here. Reads the newest cached backend binary; `npx convex dev`
# keeps that cache warm on machines where its bootstrap works.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $root ".convex\local\default\config.json"
if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Output "No local deployment config at $configPath."
  Write-Output "Run `npx convex dev` once (or `npx convex init`) to create it."
  exit 1
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$binRoot = Join-Path $env:LOCALAPPDATA "convex\binaries"
$exe = Get-ChildItem -LiteralPath $binRoot -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName "convex-local-backend.exe" } |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1
if (-not $exe) {
  Write-Output "No cached backend binary under $binRoot."
  Write-Output "Run `npx convex dev` once on a machine where its bootstrap works."
  exit 1
}
$dbDir = Join-Path $root ".convex\local\default"
$db = Join-Path $dbDir "convex_local_backend.sqlite3"
$storage = Join-Path $dbDir "convex_local_storage"
$port = $config.ports.cloud
Write-Output "Backend: $exe"
Write-Output "Port $port (site $($config.ports.site)), deployment $($config.deploymentName)"
Start-Process -FilePath $exe -ArgumentList "`"$db`"", "--port", "$port",
  "--instance-secret", $config.instanceSecret,
  "--instance-name", $config.deploymentName,
  "--local-storage", "`"$storage`"" -WindowStyle Hidden
Start-Sleep -Seconds 6
$up = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($up) {
  Write-Output "Backend listening on $port. Run your convex commands now."
  Write-Output "Stop it afterwards: Stop-Process -Name convex-local-backend"
} else {
  Write-Output "Backend did not come up. Check the sqlite file and try again."
  exit 1
}
