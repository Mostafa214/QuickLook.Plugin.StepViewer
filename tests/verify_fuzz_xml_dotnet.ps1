# PowerShell .NET XmlDocument Strict Validation Harness
# Validates all generated fuzz and CAD fixture SVGs using System.Xml.XmlDocument

$ErrorActionPreference = "Stop"

$artifactsDir = Join-Path $PSScriptRoot "..\test_artifacts\fuzz"
if (-not (Test-Path $artifactsDir)) {
    Write-Error "Artifacts directory not found: $artifactsDir"
    exit 1
}

$svgFiles = Get-ChildItem -Path $artifactsDir -Filter "*.svg"
if ($svgFiles.Count -eq 0) {
    Write-Error "No SVG fixtures found in $artifactsDir"
    exit 1
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  .NET System.Xml.XmlDocument STRICT SVG VALIDATION HARNESS      " -ForegroundColor Cyan
Write-Host "================================================================`n" -ForegroundColor Cyan

$passed = 0
$failed = 0
$forbiddenTags = @("script", "circle", "foreignObject", "animate", "use")

foreach ($file in $svgFiles) {
    $filePath = $file.FullName
    try {
        $xmlDoc = New-Object System.Xml.XmlDocument
        $xmlDoc.XmlResolver = $null  # Disable external DTD resolution for security
        $xmlDoc.Load($filePath)

        # Root element check
        if ($xmlDoc.DocumentElement.LocalName -ne "svg") {
            throw "Root element is '$($xmlDoc.DocumentElement.LocalName)', expected 'svg'"
        }

        # Check for forbidden injected elements
        foreach ($tag in $forbiddenTags) {
            $injectedNodes = $xmlDoc.GetElementsByTagName($tag)
            if ($injectedNodes.Count -gt 0) {
                throw "Forbidden injected element <$tag> found in $($file.Name)!"
            }
        }

        # Check title block PART TITLE
        $textNodes = $xmlDoc.GetElementsByTagName("text")
        $foundTitleBlock = $false
        for ($i = 0; $i -lt $textNodes.Count - 1; $i++) {
            if ($textNodes[$i].InnerText.Trim() -eq "PART TITLE:") {
                $titleVal = $textNodes[$i + 1].InnerText
                $foundTitleBlock = $true
                break
            }
        }

        if (-not $foundTitleBlock) {
            throw "PART TITLE text node not found in $($file.Name)"
        }

        $passed++
        Write-Host "  [PASS] $($file.Name) -> Strict XML Valid. InnerText: '$($titleVal.Substring(0, [Math]::Min(40, $titleVal.Length)))'" -ForegroundColor Green
    }
    catch {
        $failed++
        Write-Host "  [FAIL] $($file.Name) -> $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host "  TOTAL VALIDATED: $($svgFiles.Count) | PASSED: $passed | FAILED: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "================================================================`n" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
} else {
    exit 0
}
