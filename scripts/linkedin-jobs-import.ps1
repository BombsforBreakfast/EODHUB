# Wrapper for Windows Task Scheduler - guarded LinkedIn import (4:30-8 AM, once/day).
# Resilient: local binaries, sleep lock, chromium self-heal, no stderr-as-fatal.
#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $env:USERPROFILE ".eod-hub"
$LogFile = Join-Path $LogDir "linkedin-import.log"
$TsxCmd = Join-Path $RepoRoot "node_modules\.bin\tsx.cmd"
$PlaywrightCmd = Join-Path $RepoRoot "node_modules\.bin\playwright.cmd"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    try {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    } catch {}
    # Use Host so log lines do not pollute function return values.
    Write-Host $line
}

# Keep the machine awake for the duration of this process (AC/DC).
$sleepLockType = @'
using System;
using System.Runtime.InteropServices;
public static class EodSleepLock {
  public const uint ES_CONTINUOUS = 0x80000000;
  public const uint ES_SYSTEM_REQUIRED = 0x00000001;
  public const uint ES_AWAYMODE_REQUIRED = 0x00000040;
  [DllImport("kernel32.dll")]
  public static extern uint SetThreadExecutionState(uint esFlags);
}
'@
Add-Type -TypeDefinition $sleepLockType -ErrorAction SilentlyContinue

function Enable-SleepLock {
    if (-not ("EodSleepLock" -as [type])) { return }
    [void][EodSleepLock]::SetThreadExecutionState(
        [EodSleepLock]::ES_CONTINUOUS -bor
        [EodSleepLock]::ES_SYSTEM_REQUIRED -bor
        [EodSleepLock]::ES_AWAYMODE_REQUIRED
    )
}

function Disable-SleepLock {
    if (-not ("EodSleepLock" -as [type])) { return }
    [void][EodSleepLock]::SetThreadExecutionState([EodSleepLock]::ES_CONTINUOUS)
}

function Invoke-LoggedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $false)][string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $false)][string]$Label = "cmd"
    )
    Write-Log ("{0}: {1} {2}" -f $Label, $FilePath, ($ArgumentList -join " "))
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $FilePath @ArgumentList 2>&1
        $code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
    } finally {
        $ErrorActionPreference = $prevEap
    }
    foreach ($line in @($output)) {
        $text = "$line".TrimEnd()
        if ($text) { Write-Log $text }
    }
    # Write-Output (not return) so callers get a single int even if logs ran.
    Write-Output -InputObject ([int]$code)
}

function Test-ChromiumInstalled {
    $root = Join-Path $env:LOCALAPPDATA "ms-playwright"
    if (-not (Test-Path $root)) { return $false }
    $shell = Get-ChildItem -Path $root -Recurse -Filter "chrome-headless-shell.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $chrome = Get-ChildItem -Path $root -Recurse -Filter "chrome.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    return [bool]($shell -or $chrome)
}

try {
    Enable-SleepLock
    Write-Log "Starting LinkedIn import from $RepoRoot (pid=$PID)"
    Set-Location $RepoRoot

    $pathPrefixes = @(
        "$env:ProgramFiles\nodejs",
        "${env:ProgramFiles(x86)}\nodejs",
        "$env:APPDATA\npm",
        "$env:LOCALAPPDATA\Programs\node",
        "$env:USERPROFILE\scoop\shims",
        (Join-Path $RepoRoot "node_modules\.bin")
    )
    foreach ($prefix in $pathPrefixes) {
        if ($prefix -and (Test-Path $prefix)) {
            $env:Path = "$prefix;$env:Path"
        }
    }

    # Task Scheduler sessions often inherit a broken PLAYWRIGHT_BROWSERS_PATH.
    Remove-Item Env:PLAYWRIGHT_BROWSERS_PATH -ErrorAction SilentlyContinue

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Log "ERROR: node not found on PATH. Install Node.js 20+ and re-run."
        exit 1
    }
    Write-Log ("node " + (& node -v 2>$null))

    if (-not (Test-Path (Join-Path $RepoRoot ".env.local"))) {
        Write-Log "ERROR: Missing .env.local in repo root (needs CRON_SECRET)."
        exit 1
    }

    if (-not (Test-Path $TsxCmd)) {
        Write-Log "ERROR: Missing $TsxCmd - run npm install in the repo."
        exit 1
    }

    if (-not (Test-ChromiumInstalled)) {
        Write-Log "Chromium missing - installing via Playwright..."
        if (-not (Test-Path $PlaywrightCmd)) {
            Write-Log "ERROR: Missing $PlaywrightCmd - run npm install in the repo."
            exit 1
        }
        $installCode = Invoke-LoggedCommand -FilePath $PlaywrightCmd -ArgumentList @("install", "chromium") -Label "playwright-install"
        if ($installCode -ne 0 -or -not (Test-ChromiumInstalled)) {
            Write-Log "ERROR: Playwright chromium install failed (exit $installCode)."
            exit 1
        }
        Write-Log "Chromium install OK"
    } else {
        Write-Log "Chromium present"
    }

    $code = Invoke-LoggedCommand -FilePath $TsxCmd -ArgumentList @("scripts\linkedin-jobs-import.ts") -Label "import"
    Write-Log "Finished (exit $code)"
    exit $code
} catch {
    Write-Log ("ERROR: " + $_.Exception.Message)
    exit 1
} finally {
    Disable-SleepLock
}
