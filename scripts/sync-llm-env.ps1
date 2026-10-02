# Sync LLM keys from .env.local into the Convex deployment env store.
#
# WHY: backend actions read process.env from the DEPLOYMENT env store, not
# from .env.local and not from the backend process environment. .env.local
# only auto-provides NEXT_PUBLIC_* vars to the Next.js client.
# Values are never printed; only variable names appear in output.
#
# Usage:
#   .\scripts\sync-llm-env.ps1         # local dev deployment
#   .\scripts\sync-llm-env.ps1 -Prod   # production deployment
param([switch]$Prod)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"
$wanted = @("LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL")
$found = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match "^\s*#" -or $line -match "^\s*$") { continue }
  $idx = $line.IndexOf("=")
  if ($idx -gt 0) {
    $k = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim().Trim([char]34)
    if (($wanted -contains $k) -and ($val -ne "")) { $found[$k] = $val }
  }
}
if ($found.Count -eq 0) {
  Write-Output "No LLM_* values found in .env.local, nothing to sync."
  exit 1
}
$target = @()
if ($Prod) { $target += "--prod" }
foreach ($k in $found.Keys) {
  & npx convex env set $k $found[$k] @target
  if ($LASTEXITCODE -ne 0) { exit 1 }
  Write-Output ("synced: " + $k)
}
Write-Output "done."
