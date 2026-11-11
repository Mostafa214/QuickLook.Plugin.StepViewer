param([string]$FilePath)
try {
    $xml = New-Object System.Xml.XmlDocument
    $xml.Load($FilePath)
    Write-Output "OK"
} catch {
    Write-Error $_
    exit 1
}
