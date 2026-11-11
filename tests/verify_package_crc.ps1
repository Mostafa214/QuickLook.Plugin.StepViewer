$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$rootPkg = ".\QuickLook.Plugin.StepViewer.qlplugin"
$distPkg = ".\dist\QuickLook.Plugin.StepViewer.qlplugin"

Write-Host "=== 1. Package File Existence and Hashes ==="
if (-not (Test-Path $rootPkg)) { throw "Root package does not exist: $rootPkg" }
if (-not (Test-Path $distPkg)) { throw "Dist package does not exist: $distPkg" }

$rootItem = Get-Item $rootPkg
$distItem = Get-Item $distPkg

Write-Host "Root package size: $($rootItem.Length) bytes, modified: $($rootItem.LastWriteTime)"
Write-Host "Dist package size: $($distItem.Length) bytes, modified: $($distItem.LastWriteTime)"

$rootHash = (Get-FileHash $rootPkg -Algorithm SHA256).Hash
$distHash = (Get-FileHash $distPkg -Algorithm SHA256).Hash
Write-Host "Root SHA256: $rootHash"
Write-Host "Dist SHA256: $distHash"

if ($rootHash -ne $distHash) {
    throw "Hash mismatch between root package and dist package!"
}

Write-Host "`n=== 2. ZipArchive Entry CRC32 & Decompression Integrity ==="
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $rootPkg).Path)
Write-Host "Total entries in archive: $($zip.Entries.Count)"

$requiredAssets = @(
    "QuickLook.Plugin.Metadata.config",
    "QuickLook.Plugin.StepViewer.dll",
    "Microsoft.Web.WebView2.Core.dll",
    "Microsoft.Web.WebView2.Wpf.dll",
    "WebView2Loader.dll",
    "Assets/viewer.html",
    "Assets/stepWorker.js",
    "Assets/three.min.js",
    "Assets/OrbitControls.js",
    "Assets/occt-import-js.js",
    "Assets/occt-import-js.wasm",
    "Assets/css/viewer.css",
    "Assets/js/viewerApp.js",
    "Assets/js/stlLoader.js",
    "Assets/js/meshFeatureDetector.js",
    "Assets/js/materialsEngine.js",
    "Assets/js/measureEngine.js",
    "Assets/js/workbenchUiEngine.js"
)

$corrupted = 0
$foundAssets = @{}

foreach ($entry in $zip.Entries) {
    $name = $entry.FullName
    $len = $entry.Length
    $compLen = $entry.CompressedLength
    $crc = $entry.Crc32

    # Check for forbidden files
    if ($name -match "QuickLook\.Common\.dll") {
        Write-Host "[VIOLATION] Found forbidden QuickLook.Common.dll in archive!" -ForegroundColor Red
        $corrupted++
    }
    if ($name -match "\.cs$" -or $name -match "\.csproj$") {
        Write-Host "[VIOLATION] Found source file in archive: $name" -ForegroundColor Red
        $corrupted++
    }

    # Track required asset match
    foreach ($req in $requiredAssets) {
        if ($name -eq $req -or $name.Replace('\', '/') -eq $req) {
            $foundAssets[$req] = $true
        }
    }

    # Verify stream decompression and byte count
    try {
        $stream = $entry.Open()
        $buffer = New-Object byte[] 65536
        $totalBytes = 0
        while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $totalBytes += $read
        }
        $stream.Close()

        if ($totalBytes -ne $len) {
            Write-Host "[CORRUPT] $name : Read $totalBytes bytes, expected $len bytes" -ForegroundColor Red
            $corrupted++
        } else {
            Write-Host ("  [OK] {0,-35} | Length: {1,8} | Comp: {2,8} | CRC32: 0x{3:X8}" -f $name, $len, $compLen, $crc)
        }
    } catch {
        Write-Host "[DECOMPRESS ERROR] $name : $($_.Exception.Message)" -ForegroundColor Red
        $corrupted++
    }
}
$zip.Dispose()

Write-Host "`n=== 3. Required Assets Presence ==="
$missing = 0
foreach ($req in $requiredAssets) {
    if (-not $foundAssets.ContainsKey($req)) {
        Write-Host "[MISSING ASSET] $req" -ForegroundColor Red
        $missing++
    } else {
        Write-Host "  [FOUND] $req"
    }
}

Write-Host "`n=== 4. Live QuickLook Process ==="
$ql = Get-Process -Name QuickLook -ErrorAction SilentlyContinue
if ($null -eq $ql) {
    Write-Host "[PROCESS] QuickLook is NOT running!" -ForegroundColor Red
} else {
    Write-Host "QuickLook Process ID: $($ql.Id)"
    Write-Host "Process Name:        $($ql.ProcessName)"
    Write-Host "Responding:          $($ql.Responding)"
    Write-Host "Start Time:          $($ql.StartTime)"
    Write-Host "Main Window Title:   $($ql.MainWindowTitle)"
    Write-Host "Path:                $($ql.Path)"
}

Write-Host "`n=== 5. Deployed Plugin Files Hash Audit ==="
$deployedStore = "C:\Users\Lenovo\AppData\Local\Packages\21090PaddyXu.QuickLook_egxr34yet59cg\LocalCache\Roaming\pooi.moe\QuickLook\QuickLook.Plugin\QuickLook.Plugin.StepViewer"
$deployedRoaming = "$env:APPDATA\pooi.moe\QuickLook\QuickLook.Plugin\QuickLook.Plugin.StepViewer"

$auditFiles = @(
    "QuickLook.Plugin.StepViewer.dll",
    "QuickLook.Plugin.Metadata.config",
    "Assets\js\stlLoader.js",
    "Assets\js\meshFeatureDetector.js",
    "Assets\js\materialsEngine.js"
)

foreach ($af in $auditFiles) {
    $fStore = Join-Path $deployedStore $af
    $fRoam = Join-Path $deployedRoaming $af
    $storeExists = Test-Path $fStore
    $roamExists = Test-Path $fRoam

    Write-Host ("Deployed check: {0,-32} | Store: {1,-5} | Roaming: {2,-5}" -f $af, $storeExists, $roamExists)
    if ($storeExists) {
        $h1 = (Get-FileHash $fStore -Algorithm SHA256).Hash
        Write-Host ("   Store Hash:   $h1")
    }
    if ($roamExists) {
        $h2 = (Get-FileHash $fRoam -Algorithm SHA256).Hash
        Write-Host ("   Roaming Hash: $h2")
    }
}

if ($corrupted -gt 0 -or $missing -gt 0) {
    Write-Host "`nAUDIT FAILED: Corrupted entries: $corrupted, Missing assets: $missing" -ForegroundColor Red
    exit 1
} else {
    Write-Host "`nAUDIT PASSED: All $requiredAssets.Length assets intact, 0 corruptions, CRC32 verified!" -ForegroundColor Green
    exit 0
}
