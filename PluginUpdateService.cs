using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Security;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;

namespace QuickLook.Plugin.StepViewer
{
    /// <summary>
    /// Coordinates autonomous plugin auto-update downloads, cryptographic SHA-256 verification,
    /// Zip Slip defense, and detached PowerShell deployment and restart.
    /// </summary>
    public class PluginUpdateService
    {
        private string _preparedUpdatePackagePath;
        private string _preparedUpdaterScriptPath;
        private string _currentPluginDir;

        public bool HasPreparedUpdate =>
            !string.IsNullOrEmpty(_preparedUpdatePackagePath) && File.Exists(_preparedUpdatePackagePath) &&
            !string.IsNullOrEmpty(_preparedUpdaterScriptPath) && File.Exists(_preparedUpdaterScriptPath);

        public async Task ExecuteAutoUpdateDownloadAsync(
            string downloadUrl,
            string version,
            CoreWebView2 webView,
            Action<Action> dispatchAction)
        {
            if (string.IsNullOrEmpty(downloadUrl))
            {
                NotifyUpdateError(webView, dispatchAction, "No download URL provided for update.");
                return;
            }

            if (!IsTrustedGitHubUpdateUrl(downloadUrl, out Uri validatedUri))
            {
                NotifyUpdateError(webView, dispatchAction, "Untrusted or invalid update URL specified. Update packages must originate from official GitHub repository releases.");
                return;
            }

            string downloadPath = null;
            string scriptPath = null;

            try
            {
                string tempDir = Path.GetTempPath();
                string safeVersion = Regex.Replace(version ?? "latest", @"[^\w\.\-]", "_");
                downloadPath = Path.Combine(tempDir, $"QuickLook_StepViewer_Update_{safeVersion}_{Guid.NewGuid():N}.qlplugin");
                _currentPluginDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

                StepViewerControl.Log($"AutoUpdate: Starting download from {validatedUri} to {downloadPath}");

                using (var client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.UserAgent] = "QuickLook-StepViewer-AutoUpdater";

                    client.DownloadProgressChanged += (s, e) =>
                    {
                        int percent = e.ProgressPercentage;
                        long received = e.BytesReceived;
                        long total = e.TotalBytesToReceive;
                        dispatchAction?.Invoke(() =>
                        {
                            _ = webView?.ExecuteScriptAsync(
                                IpcScriptBuilder.BuildUpdateProgressScript(percent, received, total)
                            );
                        });
                    };

                    await client.DownloadFileTaskAsync(validatedUri, downloadPath);
                }

                if (!File.Exists(downloadPath) || new FileInfo(downloadPath).Length < 1000)
                {
                    throw new IOException("Downloaded update package is invalid or empty.");
                }

                // 1. Resolve expected SHA-256 out-of-band from official repository release
                string expectedSha256 = await ResolveExpectedSha256Async(validatedUri, version);
                if (string.IsNullOrEmpty(expectedSha256))
                {
                    throw new SecurityException("Update verification aborted: Could not obtain trusted out-of-band SHA-256 checksum from official repository.");
                }

                // 2. Compute actual SHA-256
                string actualSha256 = ComputeFileSha256(downloadPath);
                if (!FixedTimeEquals(actualSha256, expectedSha256))
                {
                    throw new SecurityException($"SHA-256 integrity verification failed! Expected {expectedSha256}, actual {actualSha256}.");
                }
                StepViewerControl.Log($"AutoUpdate: Cryptographic SHA-256 hash verified successfully ({actualSha256}).");

                // 3. Validate zip contents against Zip Slip
                ValidateZipArchiveEntries(downloadPath);

                // 4. Stage updater script only AFTER complete verification
                scriptPath = Path.Combine(tempDir, $"apply_ql_update_{Guid.NewGuid():N}.ps1");
                string scriptContent = GenerateUpdaterScript();
                File.WriteAllText(scriptPath, scriptContent, Encoding.UTF8);

                _preparedUpdatePackagePath = downloadPath;
                _preparedUpdaterScriptPath = scriptPath;

                StepViewerControl.Log($"AutoUpdate: Package downloaded, verified, and staged at {downloadPath}");

                dispatchAction?.Invoke(() =>
                {
                    _ = webView?.ExecuteScriptAsync(
                        IpcScriptBuilder.UpdateCompletedScript
                    );
                });
            }
            catch (Exception ex)
            {
                StepViewerControl.Log($"AutoUpdate Download Error: {ex}");

                // Fail-safe cleanup of untrusted or corrupted files
                try
                {
                    if (!string.IsNullOrEmpty(downloadPath) && File.Exists(downloadPath))
                    {
                        File.Delete(downloadPath);
                        StepViewerControl.Log($"Cleaned up untrusted update package: {downloadPath}");
                    }
                    if (!string.IsNullOrEmpty(scriptPath) && File.Exists(scriptPath))
                    {
                        File.Delete(scriptPath);
                    }
                }
                catch (Exception cleanupEx)
                {
                    StepViewerControl.Log($"Update cleanup error: {cleanupEx.Message}");
                }

                _preparedUpdatePackagePath = null;
                _preparedUpdaterScriptPath = null;

                NotifyUpdateError(webView, dispatchAction, ex.Message);
            }
        }

        public void ApplyUpdateAndRestart(CoreWebView2 webView, Action<Action> dispatchAction)
        {
            try
            {
                if (!HasPreparedUpdate)
                {
                    NotifyUpdateError(webView, dispatchAction, "Prepared update package was not found. Please try downloading again.");
                    return;
                }

                StepViewerControl.Log($"AutoUpdate: Launching detached updater script {_preparedUpdaterScriptPath}");

                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-WindowStyle Hidden -ExecutionPolicy Bypass -File \"{_preparedUpdaterScriptPath}\" -qlPluginPath \"{_preparedUpdatePackagePath}\" -currentPluginDir \"{_currentPluginDir}\"",
                    UseShellExecute = true,
                    CreateNoWindow = true
                };

                Process.Start(psi);
            }
            catch (Exception ex)
            {
                StepViewerControl.Log($"AutoUpdate Restart Error: {ex}");
                NotifyUpdateError(webView, dispatchAction, ex.Message);
            }
        }

        public void NotifyUpdateError(CoreWebView2 webView, Action<Action> dispatchAction, string errorMsg)
        {
            dispatchAction?.Invoke(() =>
            {
                try
                {
                    _ = webView?.ExecuteScriptAsync(
                        IpcScriptBuilder.BuildUpdateErrorScript(errorMsg)
                    );
                }
                catch (Exception ex)
                {
                    StepViewerControl.Log($"Failed to dispatch NotifyUpdateError: {ex.Message}");
                }
            });
        }

        public static string GenerateUpdaterScript()
        {
            return @"
param([string]$qlPluginPath, [string]$currentPluginDir)

# Allow UI time to present completion status
Start-Sleep -Milliseconds 900

# 1. Stop QuickLook to release file locks on loaded DLLs
$qlProc = Get-Process -Name ""QuickLook"" -ErrorAction SilentlyContinue
if ($qlProc) {
    Stop-Process -Name ""QuickLook"" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1200
}

# 2. Locate QuickLook.Plugin target directories (Store and Roaming)
$storePluginBase = ""$env:LOCALAPPDATA\Packages\21090PaddyXu.QuickLook_egxr34yet59cg\LocalCache\Roaming\pooi.moe\QuickLook\QuickLook.Plugin""
$roamingPluginBase = ""$env:APPDATA\pooi.moe\QuickLook\QuickLook.Plugin""

$targets = @()
if (Test-Path (Split-Path $storePluginBase)) {
    if (-not (Test-Path $storePluginBase)) { New-Item -ItemType Directory -Path $storePluginBase -Force | Out-Null }
    $targets += (Join-Path $storePluginBase ""QuickLook.Plugin.StepViewer"")
}
if (Test-Path (Split-Path $roamingPluginBase)) {
    if (-not (Test-Path $roamingPluginBase)) { New-Item -ItemType Directory -Path $roamingPluginBase -Force | Out-Null }
    $targets += (Join-Path $roamingPluginBase ""QuickLook.Plugin.StepViewer"")
}

# Include currently executing plugin directory if not already covered
if ($currentPluginDir -and (Test-Path $currentPluginDir)) {
    $normalizedCurrent = (Resolve-Path $currentPluginDir).Path
    $exists = $false
    foreach ($t in $targets) {
        if ((Test-Path $t) -and ((Resolve-Path $t).Path -eq $normalizedCurrent)) {
            $exists = $true
            break
        }
    }
    if (-not $exists) {
        $targets += $currentPluginDir
    }
}

# 3. Extract to clean staging folder
$stage = Join-Path $env:TEMP (""ql_stage_"" + [Guid]::NewGuid().ToString(""N""))
New-Item -ItemType Directory -Path $stage -Force | Out-Null

try {
    Add-Type -AssemblyName ""System.IO.Compression.FileSystem""
    [System.IO.Compression.ZipFile]::ExtractToDirectory($qlPluginPath, $stage)

    # 4. Overwrite in all target installations
    foreach ($tgt in $targets) {
        if (-not (Test-Path $tgt)) {
            New-Item -ItemType Directory -Path $tgt -Force | Out-Null
        }
        Copy-Item -Path ""$stage\*"" -Destination $tgt -Recurse -Force
    }
} finally {
    Remove-Item -Path $stage -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $qlPluginPath -Force -ErrorAction SilentlyContinue
}

# 5. Restart QuickLook cleanly
if (Test-Path (Split-Path $storePluginBase)) {
    Start-Process ""explorer.exe"" -ArgumentList ""shell:AppsFolder\21090PaddyXu.QuickLook_egxr34yet59cg!Main""
} else {
    Start-Process ""QuickLook.exe"" -ErrorAction SilentlyContinue
}

# 6. Self-delete updater script
Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
";
        }

        public static bool IsTrustedGitHubUpdateUrl(string url, out Uri validatedUri)
        {
            validatedUri = null;
            if (string.IsNullOrWhiteSpace(url)) return false;

            if (!Uri.TryCreate(url, UriKind.Absolute, out validatedUri))
                return false;

            if (validatedUri.Scheme != Uri.UriSchemeHttps)
                return false;

            // Restrict host strictly to github.com
            if (!string.Equals(validatedUri.Host, "github.com", StringComparison.OrdinalIgnoreCase))
                return false;

            // Restrict path strictly to official repository release downloads
            const string requiredPrefix = "/Mostafa214/QuickLook.Plugin.StepViewer/releases/download/";
            if (!validatedUri.AbsolutePath.StartsWith(requiredPrefix, StringComparison.OrdinalIgnoreCase))
                return false;

            // Ensure target package is a .qlplugin file
            if (!validatedUri.AbsolutePath.EndsWith(".qlplugin", StringComparison.OrdinalIgnoreCase))
                return false;

            return true;
        }

        public static string ComputeFileSha256(string filePath)
        {
            using (var sha256 = SHA256.Create())
            using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.SequentialScan))
            {
                byte[] hash = sha256.ComputeHash(fs);
                var sb = new StringBuilder(64);
                for (int i = 0; i < hash.Length; i++)
                {
                    sb.Append(hash[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }

        public static bool FixedTimeEquals(string hashA, string hashB)
        {
            if (string.IsNullOrEmpty(hashA) || string.IsNullOrEmpty(hashB))
                return false;
            if (hashA.Length != 64 || hashB.Length != 64)
                return false;

            int diff = 0;
            for (int i = 0; i < 64; i++)
            {
                diff |= char.ToLowerInvariant(hashA[i]) ^ char.ToLowerInvariant(hashB[i]);
            }
            return diff == 0;
        }

        public static async Task<string> ResolveExpectedSha256Async(Uri downloadUri, string version)
        {
            // Tier 1 (Out-of-band): Companion asset ({downloadUrl}.sha256) on official GitHub release
            try
            {
                string checksumUrl = downloadUri.AbsoluteUri + ".sha256";
                using (var client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.UserAgent] = "QuickLook-StepViewer-AutoUpdater";
                    string raw = await client.DownloadStringTaskAsync(new Uri(checksumUrl));
                    var m = Regex.Match(raw, @"\b([a-fA-F0-9]{64})\b");
                    if (m.Success)
                        return m.Groups[1].Value.ToLowerInvariant();
                }
            }
            catch (Exception ex)
            {
                StepViewerControl.Log($"Companion .sha256 fetch skipped: {ex.Message}");
            }

            // Tier 2 (Out-of-band): GitHub Release Notes API for official repository
            try
            {
                string safeVersion = Regex.Replace(version ?? "latest", @"[^\w\.\-]", "");
                string tag = string.IsNullOrWhiteSpace(safeVersion) || safeVersion.Equals("latest", StringComparison.OrdinalIgnoreCase)
                    ? "latest"
                    : $"tags/{safeVersion}";
                string apiUrl = $"https://api.github.com/repos/Mostafa214/QuickLook.Plugin.StepViewer/releases/{tag}";

                using (var client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.UserAgent] = "QuickLook-StepViewer-AutoUpdater";
                    client.Headers[HttpRequestHeader.Accept] = "application/vnd.github.v3+json";
                    string releaseJson = await client.DownloadStringTaskAsync(new Uri(apiUrl));
                    var m = Regex.Match(releaseJson, @"(?i)(?:sha[-_]?256|checksum)[\s:=*`]+([a-f0-9]{64})");
                    if (m.Success)
                        return m.Groups[1].Value.ToLowerInvariant();
                }
            }
            catch (Exception ex)
            {
                StepViewerControl.Log($"GitHub API release metadata fetch skipped: {ex.Message}");
            }

            return null;
        }

        public static void ValidateZipArchiveEntries(string zipFilePath)
        {
            using (var zip = ZipFile.OpenRead(zipFilePath))
            {
                if (zip.Entries.Count == 0)
                    throw new InvalidDataException("Downloaded package archive contains no files.");

                foreach (var entry in zip.Entries)
                {
                    string normalized = entry.FullName.Replace('\\', '/');
                    if (normalized.Contains("../") || normalized.Contains("/..") || normalized == "..")
                    {
                        throw new SecurityException($"Zip Slip directory traversal detected: {entry.FullName}");
                    }
                    if (Path.IsPathRooted(entry.FullName))
                    {
                        throw new SecurityException($"Absolute path entry detected in zip archive: {entry.FullName}");
                    }
                }
            }
        }
    }
}
