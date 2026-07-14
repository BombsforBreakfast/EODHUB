# Wrapper for Windows Task Scheduler — guarded LinkedIn import (4:30–8 AM, once/day).
#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $env:USERPROFILE ".eod-hub"
$LogFile = Join-Path $LogDir "linkedin-import.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Output $line
}

try {
    Write-Log "Starting LinkedIn import from $RepoRoot"
    Set-Location $RepoRoot

    $pathPrefixes = @(
        "$env:ProgramFiles\nodejs",
        "${env:ProgramFiles(x86)}\nodejs",
        "$env:APPDATA\npm",
        "$env:LOCALAPPDATA\Programs\node",
        "$env:USERPROFILE\scoop\shims"
    )
    foreach ($prefix in $pathPrefixes) {
        if (Test-Path $prefix) {
            $env:Path = "$prefix;$env:Path"
        }
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Log "ERROR: node not found on PATH. Install Node.js 20+ and re-run."
        exit 1
    }

    if (-not (Test-Path (Join-Path $RepoRoot ".env.local"))) {
        Write-Log "ERROR: Missing .env.local in repo root (needs CRON_SECRET)."
        exit 1
    }

    $output = & npx tsx scripts/linkedin-jobs-import.ts 2>&1
    foreach ($line in @($output)) {
        Write-Log "$line"
    }

    $code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
    Write-Log "Finished (exit $code)"
    exit $code
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
