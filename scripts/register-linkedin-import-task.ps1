# Register or remove the Windows Task Scheduler job for LinkedIn import.
# Multiple morning triggers + restart-on-failure so a sleep/kill doesn't lose the day.
#Requires -Version 5.1
param(
    [switch]$Unregister
)

$TaskName = "EOD-HUB LinkedIn Import Daily"
$StartupLinkName = "EOD-HUB LinkedIn Import.lnk"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Wrapper = Join-Path $RepoRoot "scripts\linkedin-jobs-import.ps1"
$StartupFolder = [Environment]::GetFolderPath("Startup")
$StartupLink = Join-Path $StartupFolder $StartupLinkName

function Remove-StartupLink {
    if (Test-Path $StartupLink) {
        Remove-Item $StartupLink -Force
    }
}

function Install-StartupLink {
    Remove-StartupLink
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($StartupLink)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Wrapper`""
    $shortcut.WorkingDirectory = $RepoRoot
    $shortcut.Description = "EOD-HUB LinkedIn job import (guarded: 4:30-8 AM, once/day)"
    $shortcut.Save()
}

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-StartupLink
    Write-Host "Removed daily task and startup shortcut."
    exit 0
}

if (-not (Test-Path $Wrapper)) {
    Write-Error "Missing wrapper script: $Wrapper"
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Wrapper`"" `
    -WorkingDirectory $RepoRoot

# Redundant triggers inside the 4:30–8:00 window. Script no-ops after a successful day.
$Triggers = @(
    (New-ScheduledTaskTrigger -Daily -At "05:30"),
    (New-ScheduledTaskTrigger -Daily -At "06:15"),
    (New-ScheduledTaskTrigger -Daily -At "07:00")
)

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -WakeToRun `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew

# Interactive: required so the task can use your user profile (LinkedIn session under ~/.eod-hub).
# Stay logged in overnight (lock screen is fine). Wake timers must be allowed in Windows power settings.
$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Triggers `
    -Settings $Settings `
    -Principal $Principal `
    -Force | Out-Null

Install-StartupLink

# Best-effort: enable wake timers on the current power scheme (AC + DC).
try {
    powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
    powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
    powercfg /SETACTIVE SCHEME_CURRENT | Out-Null
} catch {}

Write-Host ""
Write-Host "Installed:"
Write-Host "  - Scheduled task: $TaskName"
Write-Host "      triggers: 5:30 AM, 6:15 AM, 7:00 AM (script runs at most once/day)"
Write-Host "      restart: up to 3 times, 10 min apart on failure"
Write-Host "      wake + run on battery: enabled"
Write-Host "  - Startup shortcut: $StartupLink (backup if you log in during 4:30-8 AM)"
Write-Host ""
Write-Host "Repo:  $RepoRoot"
Write-Host "Log:   $env:USERPROFILE\.eod-hub\linkedin-import.log"
Write-Host ""
Write-Host "Requirements for hands-off mornings:"
Write-Host "  1. Stay signed in to Windows overnight (lock OK; full sign-out will skip Interactive tasks)"
Write-Host "  2. Leave the laptop plugged in when possible"
Write-Host "  3. LinkedIn session valid: npm run linkedin:login  (if scrapes start failing)"
Write-Host ""
Write-Host "Test:   powershell -ExecutionPolicy Bypass -File `"$Wrapper`""
Write-Host "Remove: npm run linkedin:uninstall-task"
