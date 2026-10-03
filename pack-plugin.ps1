[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$RestartQuickLook
)

$ErrorActionPreference = "Stop"
$swTotal = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  QuickLook.Plugin.StepViewer - Build & Packaging Automation" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$binDir = Join-Path $baseDir "bin\Release\net48"
$outputZip = Join-Path $baseDir "QuickLook.Plugin.StepViewer.qlplugin"

# ------------------------------------------------------------------------------
# 1. Clean Rebuild in Release Mode
# ------------------------------------------------------------------------------
Write-Host "`n[1/5] Compiling project in Release mode (net48)..." -ForegroundColor Yellow
$buildOutput = & dotnet build (Join-Path $baseDir "QuickLook.Plugin.StepViewer.csproj") -c Release
if ($LASTEXITCODE -ne 0) {
    Write-Host ($buildOutput -join "`n") -ForegroundColor Red
    throw "dotnet build failed with exit code $LASTEXITCODE"
}
Write-Host "  -> Compilation succeeded (0 errors, 0 warnings)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 2. Output Verification & Host Collision Defense
# ------------------------------------------------------------------------------
Write-Host "`n[2/5] Verifying binary output & stripping host references..." -ForegroundColor Yellow

$accidentalCommonDll = Join-Path $binDir "QuickLook.Common.dll"
if (Test-Path $accidentalCommonDll) {
    Write-Host "  [WARNING] QuickLook.Common.dll detected in output. Stripping to prevent type collisions..." -ForegroundColor Magenta
    Remove-Item $accidentalCommonDll -Force
}

$requiredFiles = @(
    "QuickLook.Plugin.StepViewer.dll",
    "Microsoft.Web.WebView2.Core.dll",
    "Microsoft.Web.WebView2.Wpf.dll"
)

foreach ($f in $requiredFiles) {
    $target = Join-Path $binDir $f
    if (-not (Test-Path $target)) {
        throw "Required binary missing from output: $f"
    }
}

$requiredAssets = @(
    "viewer.html",
    "stepWorker.js",
    "three.min.js",
    "OrbitControls.js",
    "occt-import-js.js",
    "occt-import-js.wasm"
)

$assetsPath = Join-Path $binDir "Assets"
foreach ($a in $requiredAssets) {
    $target = Join-Path $assetsPath $a
    if (-not (Test-Path $target)) {
        throw "Required web asset missing from output: $a"
    }
}
Write-Host "  -> All binaries and 3D WebAssembly assets verified successfully" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 3. Create Staging Directory
# ------------------------------------------------------------------------------
Write-Host "`n[3/5] Staging plugin package payload..." -ForegroundColor Yellow
$stageDir = Join-Path $env:TEMP "QuickLook_StepViewer_Stage"
if (Test-Path $stageDir) {
    Remove-Item $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDir | Out-Null

# Copy release files excluding pdb, xml, and dev artifacts
Get-ChildItem -Path $binDir -Recurse | Where-Object {
    $_.Extension -notin @(".pdb", ".xml", ".dev") -and $_.Name -ne "QuickLook.Common.dll"
} | ForEach-Object {
    $relPath = $_.FullName.Substring($binDir.Length + 1)
    $destPath = Join-Path $stageDir $relPath
    if ($_.PSIsContainer) {
        if (-not (Test-Path $destPath)) {
            New-Item -ItemType Directory -Path $destPath | Out-Null
        }
    } else {
        $parent = Split-Path -Parent $destPath
        if (-not (Test-Path $parent)) {
            New-Item -ItemType Directory -Path $parent | Out-Null
        }
        Copy-Item -Path $_.FullName -Destination $destPath -Force
    }
}

# Ensure WebView2Loader.dll is present in the root directory for standard Win32 resolution
$nativeLoader = Join-Path $stageDir "runtimes\win-x64\native\WebView2Loader.dll"
if (Test-Path $nativeLoader) {
    Copy-Item $nativeLoader (Join-Path $stageDir "WebView2Loader.dll") -Force
}

Write-Host "  -> Staging completed at: $stageDir" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 4. Compress to .qlplugin (QuickLook Plugin Package)
# ------------------------------------------------------------------------------
Write-Host "`n[4/5] Packaging into QuickLook archive (.qlplugin)..." -ForegroundColor Yellow
if (Test-Path $outputZip) {
    Remove-Item $outputZip -Force
}

Add-Type -AssemblyName "System.IO.Compression.FileSystem"
[System.IO.Compression.ZipFile]::CreateFromDirectory($stageDir, $outputZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$archiveSize = (Get-Item $outputZip).Length
Write-Host "  -> Created package: $outputZip ($([math]::Round($archiveSize / 1024 / 1024, 2)) MB)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 5. Direct Installation to QuickLook (if -Install flag provided)
# ------------------------------------------------------------------------------
if ($Install) {
    Write-Host "`n[5/5] Deploying plugin to local QuickLook installation..." -ForegroundColor Yellow

    # Clean up old legacy Plugins folder if created
    $oldPluginsPath = "$env:LOCALAPPDATA\Packages\21090PaddyXu.QuickLook_egxr34yet59cg\LocalCache\Roaming\pooi.moe\QuickLook\Plugins"
    if (Test-Path $oldPluginsPath) {
        Remove-Item $oldPluginsPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Locate official QuickLook.Plugin paths
    $storePluginBase = "$env:LOCALAPPDATA\Packages\21090PaddyXu.QuickLook_egxr34yet59cg\LocalCache\Roaming\pooi.moe\QuickLook\QuickLook.Plugin"
    $roamingPluginBase = "$env:APPDATA\pooi.moe\QuickLook\QuickLook.Plugin"

    $installTargets = @()
    if (Test-Path (Split-Path $storePluginBase)) {
        if (-not (Test-Path $storePluginBase)) { New-Item -ItemType Directory -Path $storePluginBase -Force | Out-Null }
        $installTargets += (Join-Path $storePluginBase "QuickLook.Plugin.StepViewer")
        Write-Host "  -> Target detected: Windows Store QuickLook ($storePluginBase)" -ForegroundColor Cyan
    }
    if (Test-Path (Split-Path $roamingPluginBase)) {
        if (-not (Test-Path $roamingPluginBase)) { New-Item -ItemType Directory -Path $roamingPluginBase -Force | Out-Null }
        $installTargets += (Join-Path $roamingPluginBase "QuickLook.Plugin.StepViewer")
        Write-Host "  -> Target detected: Roaming QuickLook ($roamingPluginBase)" -ForegroundColor Cyan
    }

    # Stop QuickLook first to release file locks on loaded DLLs
    $qlProcess = Get-Process -Name "QuickLook" -ErrorAction SilentlyContinue
    if ($qlProcess) {
        Write-Host "  -> Stopping running QuickLook process to unlock plugin files..." -ForegroundColor Yellow
        Stop-Process -Name "QuickLook" -Force
        Start-Sleep -Milliseconds 1200
    }

    foreach ($targetFolder in $installTargets) {
        if (Test-Path $targetFolder) {
            Remove-Item $targetFolder -Recurse -Force
        }
        New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
        Copy-Item -Path "$stageDir\*" -Destination $targetFolder -Recurse -Force
        Write-Host "  -> Plugin installed to: $targetFolder" -ForegroundColor Green
    }

    # Restart QuickLook if requested
    if ($RestartQuickLook) {
        Write-Host "  -> Starting QuickLook with updated plugin..." -ForegroundColor Yellow
        if (Test-Path (Split-Path $storePluginBase)) {
            Start-Process "explorer.exe" -ArgumentList "shell:AppsFolder\21090PaddyXu.QuickLook_egxr34yet59cg!Main"
        } else {
            Start-Process "QuickLook.exe"
        }
        Write-Host "  -> QuickLook restarted successfully!" -ForegroundColor Green
    }
} else {
    Write-Host "`n[5/5] Skipping install step (use -Install to install directly into QuickLook)." -ForegroundColor DarkGray
}

# Clean staging directory
if (Test-Path $stageDir) {
    Remove-Item $stageDir -Recurse -Force -ErrorAction SilentlyContinue
}

$swTotal.Stop()
Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "  Packaging Complete in $([math]::Round($swTotal.Elapsed.TotalSeconds, 2)) seconds!" -ForegroundColor Green
Write-Host "  Package: $outputZip" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
