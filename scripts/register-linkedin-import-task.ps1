# Register or remove the Windows Task Scheduler job for LinkedIn import.
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
    schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
    Remove-StartupLink
    Write-Host "Removed daily task and startup shortcut."
    exit 0
}

if (-not (Test-Path $Wrapper)) {
    Write-Error "Missing wrapper script: $Wrapper"
}

$Command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Wrapper`""

schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

$daily = schtasks /Create /TN $TaskName /TR $Command /SC DAILY /ST 05:30 /RL LIMITED /F 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create daily task: $daily"
}

Install-StartupLink

Write-Host ""
Write-Host "Installed:"
Write-Host "  - Scheduled task: $TaskName (daily at 5:30 AM)"
Write-Host "  - Startup shortcut: $StartupLink (runs at log on; script guards skip wrong times)"
Write-Host ""
Write-Host "Repo:  $RepoRoot"
Write-Host "Log:   $env:USERPROFILE\.eod-hub\linkedin-import.log"
Write-Host ""
Write-Host "Guards: 4:30-8:00 AM only, once per day."
Write-Host "Test:   powershell -ExecutionPolicy Bypass -File `"$Wrapper`""
Write-Host "Remove: npm run linkedin:uninstall-task"
