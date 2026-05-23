<#
.SYNOPSIS
Jarvis System Setup - Kompleksowy instalator konfiguracji sprzętowej.
Funkcje: Auto-BIOS (Dell/HP/Lenovo), Fast Boot Disable, Network Config, Autostart.
#>

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

function Test-CommandResult {
    param([object]$Result)

    if ($null -eq $Result) {
        return $false
    }
    if ($Result.PSObject.Properties.Match("Return").Count -gt 0) {
        return ($Result.Return -eq 0 -or $Result.Return -eq "Success")
    }
    if ($Result.PSObject.Properties.Match("Status").Count -gt 0) {
        return ($Result.Status -eq 0 -or $Result.Status -eq "Success")
    }

    return $true
}

function Get-JarvisExecutablePath {
    param(
        [string]$SearchRoot,
        [string]$PreferredName
    )

    $preferredPath = Join-Path $SearchRoot $PreferredName
    if (Test-Path $preferredPath) {
        return $preferredPath
    }

    $jarvisExe = Get-ChildItem -Path $SearchRoot -Filter "Jarvis*.exe" -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -notmatch "^(JarvisSetup.*|unins.*|uninstall.*)$"
        } |
        Select-Object -First 1

    if ($jarvisExe) {
        return $jarvisExe.FullName
    }

    $fallbackExe = Get-ChildItem -Path $SearchRoot -Filter "*.exe" -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -notmatch "^(JarvisSetup.*|unins.*|uninstall.*)$"
        } |
        Select-Object -First 1

    if ($fallbackExe) {
        return $fallbackExe.FullName
    }

    return $null
}

function Get-JarvisPowerGuardPath {
    param(
        [string]$SearchRoot
    )

    $guardExe = Get-ChildItem -Path $SearchRoot -Filter "jarvis-power-guard.exe" -File -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($guardExe) {
        return $guardExe.FullName
    }

    return $null
}

function Get-InstallerSearchRoots {
    param(
        [string]$PrimaryRoot
    )

    $roots = @($PrimaryRoot)
    $roots += Join-Path $env:LOCALAPPDATA "Programs\Jarvis"
    $roots += Join-Path $env:ProgramFiles "Jarvis"
    if (${env:ProgramFiles(x86)}) {
        $roots += Join-Path ${env:ProgramFiles(x86)} "Jarvis"
    }

    return $roots |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique
}

function Resolve-InstalledJarvis {
    param(
        [string[]]$SearchRoots,
        [string]$PreferredName
    )

    foreach ($root in $SearchRoots) {
        if (-not (Test-Path $root)) {
            continue
        }

        $candidate = Get-JarvisExecutablePath -SearchRoot $root -PreferredName $PreferredName
        if (-not [string]::IsNullOrWhiteSpace($candidate)) {
            return @{
                ExecutablePath = $candidate
                InstallRoot = $root
            }
        }
    }

    return $null
}

function Wait-ForInstalledJarvis {
    param(
        [string[]]$SearchRoots,
        [string]$PreferredName,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $resolved = Resolve-InstalledJarvis -SearchRoots $SearchRoots -PreferredName $PreferredName
        if ($resolved) {
            return $resolved
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    return $null
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

# Hardware identification
$brand = ""
$model = ""
$hasEthernet = $false
$setupState = "waiting_for_pairing"
$setupHint = "Sign into Jarvis Desktop, generate a pairing code, and confirm it in AssistantX on your phone."
$localMacAddress = ""
try {
    $computerSystem = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop
    $brand = [string]$computerSystem.Manufacturer
    $model = [string]$computerSystem.Model
} catch {
    Write-Host "Jarvis: Nie udało się odczytać producenta/modelu sprzętu." -ForegroundColor Yellow
}
try {
    $ethernetAdapters = Get-NetAdapter -ErrorAction Stop | Where-Object {
        $_.PhysicalMediaType -eq "802.3" -or $_.NdisPhysicalMedium -eq "802.3"
    }
    $hasEthernet = @($ethernetAdapters).Count -gt 0
    $primaryMac = @($ethernetAdapters | Select-Object -First 1 -ExpandProperty MacAddress)
    if ($primaryMac) {
        $localMacAddress = [string]$primaryMac
    }
} catch {
    $hasEthernet = $false
}
Write-Host "Jarvis: Wykryłem sprzęt: $brand $model" -ForegroundColor White

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
    $headerBytes = Get-Content -Path $setupPath -Encoding Byte -TotalCount 2
    if ($headerBytes.Count -lt 2 -or $headerBytes[0] -ne 0x4D -or $headerBytes[1] -ne 0x5A) {
        Write-Host "ERROR: Downloaded file is not a valid Windows executable (MZ header missing)." -ForegroundColor Red
        Write-Host "URL: $DownloadUrl" -ForegroundColor White
        Write-Host "The URL likely returned an HTML/JSON error instead of the installer binary." -ForegroundColor White
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

Write-Stage "[2/4] Preparing installer run"
if ($ApplyPowerTweaks) {
    Write-Host "Flag -ApplyPowerTweaks detected. Power optimization will run in the hardware setup phase." -ForegroundColor DarkYellow
}

Write-Stage "[3/4] Running silent NSIS installation"
$arguments = "/S /D=$InstallDir"
$process = Start-Process -FilePath $setupPath -ArgumentList $arguments -Wait -PassThru -NoNewWindow

if ($process.ExitCode -ne 0) {
    Write-Host "Installer exited with code $($process.ExitCode)." -ForegroundColor Yellow
}

Write-Stage "[4/4] Verifying installation"
$searchRoots = Get-InstallerSearchRoots -PrimaryRoot $InstallDir
$resolvedInstall = Wait-ForInstalledJarvis -SearchRoots $searchRoots -PreferredName $AppName -TimeoutSeconds 90
$finalAppPath = if ($resolvedInstall) { [string]$resolvedInstall.ExecutablePath } else { $null }
$resolvedInstallDir = if ($resolvedInstall) { [string]$resolvedInstall.InstallRoot } else { $InstallDir }

if ([string]::IsNullOrWhiteSpace($finalAppPath)) {
    Write-Host "ERROR: Verification failed — installed application not found." -ForegroundColor Red
    Write-Host "Searched install roots:" -ForegroundColor White
    foreach ($root in $searchRoots) {
        Write-Host "  - $root" -ForegroundColor White
    }
    Write-Host "Installer exit code was: $($process.ExitCode)" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor White
    Write-Host "Possible causes:" -ForegroundColor White
    Write-Host "  - The installer exited before completing (check exit code above)." -ForegroundColor White
    Write-Host "  - The installer placed the application in a different directory." -ForegroundColor White
    Write-Host "  - Run the installer manually with: $setupPath" -ForegroundColor White
    exit 1
}

Write-Host "Verified application path: $finalAppPath" -ForegroundColor Green
if ($resolvedInstallDir -ne $InstallDir) {
    Write-Host "Detected actual install directory: $resolvedInstallDir" -ForegroundColor DarkCyan
}

Write-Host ""
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host " JARVIS SETUP - INSTALATOR SYSTEMOWY " -ForegroundColor Cyan
Write-Host "--------------------------------------------------" -ForegroundColor Cyan

# [1/4] Network configuration (Wake on LAN)
Write-Host "`n[1/4] Konfiguracja sieci..." -ForegroundColor Yellow
if ($hasEthernet) {
    try {
        $adapters = Get-NetAdapter -ErrorAction Stop | Get-NetAdapterPowerManagement -ErrorAction Stop | Where-Object { $null -ne $_.WakeOnMagicPacket }
        $wolEnabledCount = 0
        foreach ($adapter in $adapters) {
            try {
                Enable-NetAdapterPowerManagement -InterfaceDescription $adapter.InterfaceDescription -WakeOnMagicPacket -ErrorAction Stop
                $wolEnabledCount++
            } catch {
                continue
            }
        }
        if ($wolEnabledCount -gt 0) {
            Write-Host "Jarvis: Funkcja budzenia przez telefon (WOL) została aktywowana." -ForegroundColor Green
            $setupState = "paired"
            $setupHint = "Wake-on-LAN is enabled in Windows. Pair Jarvis Desktop in AssistantX to finish remote wake."
        } else {
            Write-Host "Jarvis: Nie udało się aktywować WOL na wykrytych kartach." -ForegroundColor Yellow
            $setupState = "needs_bios_manual_step"
            $setupHint = "Wake-on-LAN could not be enabled automatically. Check BIOS power settings after pairing."
        }
    } catch {
        Write-Host "Jarvis: Nie udało się automatycznie skonfigurować karty, sprawdź sterowniki." -ForegroundColor Red
        $setupState = "needs_bios_manual_step"
        $setupHint = "Network wake configuration failed. Update network drivers and verify BIOS Wake on LAN."
    }
} else {
    Write-Host "Jarvis: Brak aktywnej karty Ethernet. Funkcja budzenia przez telefon będzie niedostępna." -ForegroundColor Gray
    $setupState = "needs_bios_manual_step"
    $setupHint = "No Ethernet adapter detected. Remote wake will stay unavailable until a compatible adapter is enabled."
}

# [2/4] Disable Fast Boot and hibernation
Write-Host "`n[2/4] Optymalizacja zasilania Windows..." -ForegroundColor Yellow
try {
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power" -Name "HiberbootEnabled" -Value 0 -ErrorAction Stop
} catch {
    Write-Host "Jarvis: Nie udało się wyłączyć Fast Boot." -ForegroundColor Yellow
}
$guardPath = Get-JarvisPowerGuardPath -SearchRoot $resolvedInstallDir
$guardEnabled = (-not [string]::IsNullOrWhiteSpace($guardPath)) -or ($env:JARVIS_POWER_GUARD_ENABLED -match '^(1|true|yes|on)$')
if ($guardEnabled) {
    try {
        powercfg /h on | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "powercfg exited with code $LASTEXITCODE"
        }
        Write-Host "Jarvis: Hibernacja została włączona dla Power Guarda." -ForegroundColor Green
    } catch {
        Write-Host "Jarvis: Nie udało się włączyć hibernacji dla Power Guarda. Szczegóły: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    try {
        powercfg /h off | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "powercfg exited with code $LASTEXITCODE"
        }
    } catch {
        Write-Host "Jarvis: Nie udało się wyłączyć hibernacji. Szczegóły: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}
Write-Host "Jarvis: Szybkie uruchamianie wyłączone. BIOS ma teraz pełną kontrolę." -ForegroundColor Green

# [3/4] BIOS automation
Write-Host "`n[3/4] Próba automatycznej konfiguracji BIOS..." -ForegroundColor Yellow
switch -wildcard ($brand) {
    "*Dell*" {
        Write-Host "Jarvis: Wykryto Dell. Instaluję sterownik DellBIOSProvider..." -ForegroundColor Blue
        Install-Module -Name DellBIOSProvider -Force -AllowClobber -Scope CurrentUser -ErrorAction SilentlyContinue
        Import-Module DellBIOSProvider -ErrorAction SilentlyContinue
        $dellSuccessCount = 0
        foreach ($operation in @(
                @{ Path = "DellSmbios:\PowerManagement\WakeOnLan"; Value = "LanOnly" },
                @{ Path = "DellSmbios:\PowerManagement\AcRecovery"; Value = "On" },
                @{ Path = "DellSmbios:\PowerManagement\DeepSleepCtrl"; Value = "Disabled" }
            )) {
            try {
                Set-Item -Path $operation.Path -Value $operation.Value -PassThru -ErrorAction Stop | Out-Null
                $dellSuccessCount++
            } catch {
                continue
            }
        }
        if ($dellSuccessCount -gt 0) {
            Write-Host "Jarvis: BIOS Dell został skonfigurowany automatycznie." -ForegroundColor Green
            $setupHint = "Dell BIOS Wake-on-LAN settings were applied automatically."
        } else {
            Write-Host "Jarvis: Nie udało się potwierdzić zmian BIOS Dell automatycznie." -ForegroundColor Yellow
            $setupState = "needs_bios_manual_step"
            $setupHint = "Open Dell BIOS (F2) and enable Wake on LAN manually."
        }
    }
    "*HP*" {
        Write-Host "Jarvis: Wykryto HP. Instaluję bibliotekę HP CMSL..." -ForegroundColor Blue
        Install-Module -Name HPCMSL -Force -Scope CurrentUser -ErrorAction SilentlyContinue
        if (Get-Command Set-HPBIOSSettingValue -ErrorAction SilentlyContinue) {
            $hpSuccessCount = 0
            foreach ($setting in @(
                    @{ Name = "Wake On LAN"; Value = "Enable" },
                    @{ Name = "After Power Loss"; Value = "Power On" }
                )) {
                try {
                    Set-HPBIOSSettingValue -Name $setting.Name -Value $setting.Value -ErrorAction Stop | Out-Null
                    $hpSuccessCount++
                } catch {
                    continue
                }
            }
            if ($hpSuccessCount -gt 0) {
                Write-Host "Jarvis: BIOS HP został skonfigurowany automatycznie." -ForegroundColor Green
                $setupHint = "HP BIOS Wake-on-LAN settings were applied automatically."
            } else {
                Write-Host "Jarvis: Nie udało się potwierdzić zmian BIOS HP automatycznie." -ForegroundColor Yellow
                $setupState = "needs_bios_manual_step"
                $setupHint = "Open HP BIOS and enable Wake on LAN manually."
            }
        } else {
            Write-Host "Jarvis: Cmdlet Set-HPBIOSSettingValue jest niedostępny po instalacji HPCMSL." -ForegroundColor Yellow
            $setupState = "needs_bios_manual_step"
            $setupHint = "HP BIOS tools were unavailable. Enable Wake on LAN manually after pairing."
        }
    }
    "*Lenovo*" {
        Write-Host "Jarvis: Wykryto Lenovo. Używam interfejsu WMI..." -ForegroundColor Blue
        $wmi = Get-WmiObject -Class Lenovo_SetBiosSetting -Namespace root\wmi -ErrorAction SilentlyContinue
        if ($wmi) {
            $setWakeOnLan = $wmi.SetBiosSetting("Wake on LAN,Primary")
            $setAfterPowerLoss = $wmi.SetBiosSetting("After Power Loss,Power On")
            $setPowerSaving = $wmi.SetBiosSetting("Enhanced Power Saving Mode,Disable")
            $saveSettings = Get-WmiObject -Class Lenovo_SaveBiosSettings -Namespace root\wmi -ErrorAction SilentlyContinue

            if ($saveSettings) {
                $saveResult = $saveSettings.SaveBiosSettings()
                $lenovoResults = @($setWakeOnLan, $setAfterPowerLoss, $setPowerSaving, $saveResult) | ForEach-Object {
                    Test-CommandResult -Result $_
                }
                if ($lenovoResults.Count -gt 0 -and ($lenovoResults -notcontains $false)) {
                    Write-Host "Jarvis: BIOS Lenovo został skonfigurowany automatycznie." -ForegroundColor Green
                    $setupHint = "Lenovo BIOS Wake-on-LAN settings were applied automatically."
                } else {
                    Write-Host "Jarvis: Część ustawień BIOS Lenovo nie została zapisana automatycznie." -ForegroundColor Yellow
                    $setupState = "needs_bios_manual_step"
                    $setupHint = "Open Lenovo BIOS power settings and verify Wake on LAN manually."
                }
            } else {
                Write-Host "Jarvis: Nie udało się zapisać ustawień BIOS Lenovo (brak klasy SaveBiosSettings)." -ForegroundColor Yellow
                $setupState = "needs_bios_manual_step"
                $setupHint = "Lenovo BIOS save interface was unavailable. Verify Wake on LAN manually."
            }
        } else {
            Write-Host "Jarvis: Interfejs WMI Lenovo niedostępny, pomijam auto-konfigurację BIOS." -ForegroundColor Yellow
            $setupState = "needs_bios_manual_step"
            $setupHint = "Lenovo BIOS WMI bridge was unavailable. Enable Wake on LAN manually."
        }
    }
    Default {
        Write-Host "Jarvis: Marka $brand nie wspiera auto-konfiguracji." -ForegroundColor Gray
        Write-Host "ZALECENIE: Wejdź do BIOS i włącz: 'Wake on LAN' oraz 'Restore on AC Power Loss'." -ForegroundColor Yellow
        $setupState = "needs_bios_manual_step"
        $setupHint = "Open BIOS manually and enable Wake on LAN plus Restore on AC Power Loss."
    }
}

# [4/4] Autostart
Write-Host "`n[4/4] Konfiguracja autostartu..." -ForegroundColor Yellow
if (-not $SkipAutostart -and (Test-Path $finalAppPath)) {
    $shortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Jarvis.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $finalAppPath
    $shortcut.WorkingDirectory = Split-Path -Path $finalAppPath -Parent
    $shortcut.Save()
    Write-Host "Jarvis: Dodano do autostartu. Będę gotowy przy każdym włączeniu!" -ForegroundColor Green

    if (-not [string]::IsNullOrWhiteSpace($guardPath)) {
        $guardShortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Jarvis Power Guard.lnk"
        $guardShortcut = $shell.CreateShortcut($guardShortcutPath)
        $guardShortcut.TargetPath = $guardPath
        $guardShortcut.WorkingDirectory = Split-Path -Path $guardPath -Parent
        $guardShortcut.Save()
        Write-Host "Jarvis: Power Guard także został dodany do autostartu." -ForegroundColor Green
    }
} elseif ($SkipAutostart) {
    Write-Host "Jarvis: Pominąłem autostart na życzenie (-SkipAutostart)." -ForegroundColor Gray
} else {
    Write-Host "Jarvis: Nie znalazłem pliku $finalAppPath. Pomińmy autostart na razie." -ForegroundColor Gray
}

if (Test-Path $setupPath) {
    Remove-Item $setupPath -Force
}

$setupContextPath = Join-Path $resolvedInstallDir "setup-context.json"
$setupContext = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    manufacturer = $brand
    model = $model
    hasEthernet = $hasEthernet
    macAddress = $localMacAddress
    setupState = $setupState
    setupHint = $setupHint
}
$setupContext | ConvertTo-Json -Depth 5 | Set-Content -Path $setupContextPath -Encoding UTF8
Write-Host "Jarvis: Zapisano lokalny kontekst instalacji do $setupContextPath" -ForegroundColor DarkCyan

Write-Host "`n----------------------------------------------" -ForegroundColor Cyan
Write-Host "        JARVIS SETUP COMPLETED SUCCESSFULLY     " -ForegroundColor Cyan
Write-Host "----------------------------------------------" -ForegroundColor Cyan
Write-Host "Jarvis: Zrestartuj komputer, aby wszystkie zmiany weszły w życie." -ForegroundColor White
Pause
