param(
    [string]$DownloadUrl = "",
    [string]$BaseUrl = $(if ($env:JARVIS_BASE_URL) { $env:JARVIS_BASE_URL } else { "http://127.0.0.1:3000/jarvis" }),
    [string]$InstallDir = "$env:ProgramFiles\Jarvis",
    [string]$SetupFileName = "JarvisSetup.exe",
    [string]$AppName = "Jarvis.exe",
    [switch]$ApplyPowerTweaks,
    [switch]$SkipAutostart
)

# Auto-detect CPU architecture and pick the right installer when no explicit URL is given
if ([string]::IsNullOrWhiteSpace($DownloadUrl)) {
    $arch = $env:PROCESSOR_ARCHITECTURE   # AMD64 or ARM64
    if ($arch -eq "ARM64") {
        $DownloadUrl = "$BaseUrl/JarvisSetup-arm64.exe"
    } else {
        $DownloadUrl = "$BaseUrl/JarvisSetup-x64.exe"
    }
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"

$setupPath = Join-Path $InstallDir $SetupFileName

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Stage {
    param([string]$Message)
    Write-Host "`n$Message" -ForegroundColor Yellow
}

if (-not (Test-IsAdministrator)) {
    Write-Host "ERROR: Run this script as Administrator." -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($DownloadUrl)) {
    Write-Host "ERROR: Could not determine download URL. Set -DownloadUrl or JARVIS_BASE_URL before running." -ForegroundColor Red
    exit 1
}

Clear-Host
Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "     JARVIS SYSTEM SETUP - AUTOMATED FLOW     " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "Detected architecture : $($env:PROCESSOR_ARCHITECTURE)" -ForegroundColor DarkCyan
Write-Host "Installer URL         : $DownloadUrl" -ForegroundColor DarkCyan

if (-not (Test-Path $InstallDir)) {
    New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
    Write-Host "Created install directory: $InstallDir" -ForegroundColor Green
}

Write-Stage "[1/4] Downloading Jarvis installer"
try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $setupPath -ErrorAction Stop
    if (-not (Test-Path $setupPath) -or (Get-Item $setupPath).Length -eq 0) {
        Write-Host "ERROR: Installer file is empty or missing after download." -ForegroundColor Red
        Write-Host "Make sure the server is running and the installer has been built and published." -ForegroundColor White
        Write-Host "Expected file at: $DownloadUrl" -ForegroundColor White
        exit 1
    }
    Write-Host "Download completed: $setupPath" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Could not download the installer." -ForegroundColor Red
    Write-Host "URL: $DownloadUrl" -ForegroundColor White
    Write-Host "Details: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor White
    Write-Host "Possible causes:" -ForegroundColor White
    Write-Host "  - The server at the base URL is not running." -ForegroundColor White
    Write-Host "  - The installer has not been built yet. Run: cd jarvis/desktop && npm install && npm run dist:win:all && npm run publish:download" -ForegroundColor White
    Write-Host "  - Set the correct URL via -DownloadUrl or the JARVIS_BASE_URL environment variable." -ForegroundColor White
    exit 1
}

if ($ApplyPowerTweaks) {
    Write-Stage "[2/4] Applying optional power tweaks"
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power" -Name "HiberbootEnabled" -Value 0
    powercfg /h off
    Write-Host "Fast startup and hibernation disabled." -ForegroundColor Green
} else {
    Write-Stage "[2/4] Skipping optional power tweaks"
    Write-Host "Run with -ApplyPowerTweaks if you want to disable fast startup and hibernation." -ForegroundColor DarkYellow
}

Write-Stage "[3/4] Running silent NSIS installation"
$arguments = "/S /D=$InstallDir"
$process = Start-Process -FilePath $setupPath -ArgumentList $arguments -Wait -PassThru -NoNewWindow

if ($process.ExitCode -ne 0) {
    Write-Host "Installer exited with code $($process.ExitCode)." -ForegroundColor Yellow
}

Write-Stage "[4/4] Verifying installation"
$finalAppPath = Join-Path $InstallDir $AppName

if (-not (Test-Path $finalAppPath)) {
    Write-Host "ERROR: Verification failed — installed application not found." -ForegroundColor Red
    Write-Host "Expected: $finalAppPath" -ForegroundColor White
    Write-Host "Installer exit code was: $($process.ExitCode)" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor White
    Write-Host "Possible causes:" -ForegroundColor White
    Write-Host "  - The installer exited before completing (check exit code above)." -ForegroundColor White
    Write-Host "  - The installer placed the application in a different directory." -ForegroundColor White
    Write-Host "  - Run the installer manually with: $setupPath" -ForegroundColor White
    exit 1
}

Write-Host "Verified application path: $finalAppPath" -ForegroundColor Green

if (-not $SkipAutostart) {
    $shortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Jarvis.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $finalAppPath
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Save()
    Write-Host "Autostart shortcut created: $shortcutPath" -ForegroundColor Green
} else {
    Write-Host "Autostart shortcut skipped." -ForegroundColor DarkYellow
}

if (Test-Path $setupPath) {
    Remove-Item $setupPath -Force
}

Write-Host "`n----------------------------------------------" -ForegroundColor Cyan
Write-Host "        JARVIS SETUP COMPLETED SUCCESSFULLY     " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan
Pause