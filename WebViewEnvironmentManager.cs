using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;

namespace QuickLook.Plugin.StepViewer
{
    /// <summary>
    /// Manages CoreWebView2 environment initialization, profile cleanup,
    /// asset directory resolution, and web resource streaming interceptors.
    /// </summary>
    public static class WebViewEnvironmentManager
    {
        private static CoreWebView2Environment s_sharedEnvironment;
        private static Task<CoreWebView2Environment> s_initEnvTask;

        /// <summary>
        /// Returns the shared CoreWebView2Environment singleton, initializing it if needed.
        /// </summary>
        public static async Task<CoreWebView2Environment> GetSharedEnvironmentAsync()
        {
            if (s_sharedEnvironment != null)
                return s_sharedEnvironment;

            if (s_initEnvTask == null)
            {
                s_initEnvTask = CreateEnvironmentAsync();
            }

            s_sharedEnvironment = await s_initEnvTask;
            return s_sharedEnvironment;
        }

        private static async Task<CoreWebView2Environment> CreateEnvironmentAsync()
        {
            try
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                int pid = Process.GetCurrentProcess().Id;
                string profilesDir = Path.Combine(localAppData, "pooi.moe", "QuickLook", "WebView2_Profiles");

                // Clean up orphaned profile directories from old closed processes
                if (Directory.Exists(profilesDir))
                {
                    foreach (var dir in Directory.GetDirectories(profilesDir, "pid_*"))
                    {
                        var dirName = Path.GetFileName(dir);
                        if (dirName.StartsWith("pid_") && int.TryParse(dirName.Substring(4), out int oldPid))
                        {
                            if (oldPid != pid)
                            {
                                try
                                {
                                    Process.GetProcessById(oldPid);
                                }
                                catch (ArgumentException)
                                {
                                    try
                                    {
                                        Directory.Delete(dir, true);
                                        StepViewerControl.Log($"Cleaned up old profile: {dir}");
                                    }
                                    catch (Exception deleteEx)
                                    {
                                        StepViewerControl.Log($"Profile directory delete error: {deleteEx.Message}");
                                    }
                                }
                            }
                        }
                    }
                }

                string userDataFolder = Path.Combine(profilesDir, $"pid_{pid}");
                Directory.CreateDirectory(userDataFolder);
                StepViewerControl.Log($"Creating shared environment on STA thread at: {userDataFolder}");
                return await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            }
            catch (Exception ex)
            {
                StepViewerControl.Log($"Custom environment creation failed: {ex.Message}. Falling back to default...");
                return await CoreWebView2Environment.CreateAsync(null, null);
            }
        }

        /// <summary>
        /// Robust discovery of Assets directory across various QuickLook deployment configurations.
        /// </summary>
        public static string LocateAssetsDirectory()
        {
            var candidates = new[]
            {
                Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? string.Empty, "Assets"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory ?? string.Empty, "Assets"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"pooi.moe\QuickLook\QuickLook.Plugin\QuickLook.Plugin.StepViewer\Assets"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Packages\21090PaddyXu.QuickLook_egxr34yet59cg\LocalCache\Roaming\pooi.moe\QuickLook\QuickLook.Plugin\QuickLook.Plugin.StepViewer\Assets")
            };

            foreach (var candidate in candidates)
            {
                if (!string.IsNullOrEmpty(candidate) && Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "viewer.html")))
                {
                    return candidate;
                }
            }

            throw new DirectoryNotFoundException("Could not locate Web CAD Assets directory.");
        }

        /// <summary>
        /// Disables unnecessary browser chrome and registers domain filters for virtual host mapping.
        /// </summary>
        public static void ConfigureWebView(CoreWebView2 webView)
        {
            if (webView == null) return;
            webView.Settings.IsStatusBarEnabled = false;
            webView.Settings.AreDefaultContextMenusEnabled = false;
            webView.Settings.IsZoomControlEnabled = false;
            webView.Settings.AreDevToolsEnabled = false;

            webView.AddWebResourceRequestedFilter("https://step-viewer.local/*", CoreWebView2WebResourceContext.All);
            webView.AddWebResourceRequestedFilter("https://cad-stream.local/*", CoreWebView2WebResourceContext.All);
        }

        /// <summary>
        /// Intercepts requests to https://step-viewer.local/ (assets) and https://cad-stream.local/cad-file (STEP file)
        /// and streams them directly from disk in the host C# process, bypassing AppContainer sandbox limits.
        /// </summary>
        public static void HandleWebResourceRequested(
            CoreWebView2 webView,
            CoreWebView2WebResourceRequestedEventArgs e,
            string assetsDir,
            string currentFilePath)
        {
            var uri = e.Request.Uri;
            if (string.IsNullOrEmpty(uri) || webView?.Environment == null) return;

            // 1. Intercept Web Assets (HTML, JS, WASM, CSS, Images)
            if (uri.StartsWith("https://step-viewer.local/", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    var uriObj = new Uri(uri);
                    var rawPath = uriObj.AbsolutePath.TrimStart('/');
                    if (string.IsNullOrEmpty(rawPath)) rawPath = "viewer.html";

                    string decodedPath = Uri.UnescapeDataString(rawPath);
                    string relPath = decodedPath.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);

                    string fullAssetsDir = Path.GetFullPath(assetsDir ?? string.Empty);
                    string fullLocalPath = Path.GetFullPath(Path.Combine(fullAssetsDir, relPath));
                    string baseDirWithSep = fullAssetsDir.EndsWith(Path.DirectorySeparatorChar.ToString())
                        ? fullAssetsDir
                        : fullAssetsDir + Path.DirectorySeparatorChar;

                    string resolvedPath = null;
                    if (fullLocalPath.StartsWith(baseDirWithSep, StringComparison.OrdinalIgnoreCase) && File.Exists(fullLocalPath))
                    {
                        resolvedPath = fullLocalPath;
                    }
                    else
                    {
                        // Fallback: check flat in assetsDir using filename only
                        string fallbackPath = Path.Combine(fullAssetsDir, Path.GetFileName(decodedPath));
                        if (File.Exists(fallbackPath))
                        {
                            resolvedPath = fallbackPath;
                        }
                    }

                    if (resolvedPath != null)
                    {
                        string ext = Path.GetExtension(resolvedPath).ToLowerInvariant();
                        string contentType = "application/octet-stream";
                        switch (ext)
                        {
                            case ".html": contentType = "text/html; charset=utf-8"; break;
                            case ".js": contentType = "application/javascript; charset=utf-8"; break;
                            case ".wasm": contentType = "application/wasm"; break;
                            case ".css": contentType = "text/css; charset=utf-8"; break;
                            case ".png": contentType = "image/png"; break;
                            case ".svg": contentType = "image/svg+xml"; break;
                            case ".json": contentType = "application/json; charset=utf-8"; break;
                            case ".woff2": contentType = "font/woff2"; break;
                        }

                        var fs = new FileStream(resolvedPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                        string headers = $"Content-Type: {contentType}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\n";
                        e.Response = webView.Environment.CreateWebResourceResponse(fs, 200, "OK", headers);
                        return;
                    }
                }
                catch (Exception ex)
                {
                    StepViewerControl.Log($"Asset streaming error: {ex.Message}");
                }

                var nfBytes = Encoding.UTF8.GetBytes("Asset Not Found");
                var nfMs = new MemoryStream(nfBytes);
                e.Response = webView.Environment.CreateWebResourceResponse(nfMs, 404, "Not Found", "Content-Type: text/plain\r\n");
                return;
            }

            // 2. Intercept CAD file binary streaming
            if (uri.StartsWith("https://cad-stream.local/cad-file", StringComparison.OrdinalIgnoreCase))
            {
                // Handle CORS preflight
                if (string.Equals(e.Request.Method, "OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    var emptyMs = new MemoryStream(new byte[0]);
                    e.Response = webView.Environment.CreateWebResourceResponse(
                        emptyMs,
                        200,
                        "OK",
                        "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\n"
                    );
                    return;
                }

                string targetPath = currentFilePath;
                if (!string.IsNullOrEmpty(targetPath) && File.Exists(targetPath))
                {
                    try
                    {
                        var fs = new FileStream(targetPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                        e.Response = webView.Environment.CreateWebResourceResponse(
                            fs,
                            200,
                            "OK",
                            "Content-Type: application/octet-stream\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nCache-Control: no-cache, no-store\r\n"
                        );
                        return;
                    }
                    catch (Exception ex)
                    {
                        var errBytes = Encoding.UTF8.GetBytes($"File stream error: {ex.Message}");
                        var ms = new MemoryStream(errBytes);
                        e.Response = webView.Environment.CreateWebResourceResponse(
                            ms,
                            500,
                            "Internal Error",
                            "Content-Type: text/plain\r\nAccess-Control-Allow-Origin: *\r\n"
                        );
                        return;
                    }
                }

                var notFoundBytes = Encoding.UTF8.GetBytes("CAD File Not Found");
                var notFoundStream = new MemoryStream(notFoundBytes);
                e.Response = webView.Environment.CreateWebResourceResponse(
                    notFoundStream,
                    404,
                    "Not Found",
                    "Content-Type: text/plain\r\nAccess-Control-Allow-Origin: *\r\n"
                );
            }
        }
    }
}
