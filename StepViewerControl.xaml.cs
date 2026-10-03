using System;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;

namespace QuickLook.Plugin.StepViewer
{
    /// <summary>
    /// Interaction logic for StepViewerControl.xaml.
    /// Hosts Microsoft Edge WebView2, intercepts CAD file streaming via WebResourceRequested,
    /// coordinates bidirectional IPC, and enforces file size guardrails.
    /// </summary>
    public partial class StepViewerControl : UserControl, IDisposable
    {
        public event EventHandler OnModelLoaded;
        public event EventHandler<string> OnModelError;
        public event EventHandler OnReady;

        private const long ThresholdBytes = 35 * 1024 * 1024; // 35 MB guardrail
        private string _currentFilePath;
        private string _pendingFilePath;
        private bool _isInitialized;
        private bool _isViewportReady;
        private bool _isDisposed;
        private bool _isInitializing;
        private string _assetsDir;

        public static void Log(string msg)
        {
#if DEBUG
            try
            {
                string line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {msg}{Environment.NewLine}";
                string logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"pooi.moe\QuickLook");
                if (!Directory.Exists(logDir))
                    Directory.CreateDirectory(logDir);
                string p1 = Path.Combine(logDir, "step_debug.log");
                File.AppendAllText(p1, line);
            }
            catch { }
#endif
        }

        public StepViewerControl()
        {
            InitializeComponent();
            Log($"StepViewerControl created. IsLoaded={IsLoaded}");
            if (IsLoaded)
            {
                _ = Dispatcher.BeginInvoke(new Action(InitializeWebViewAsync));
            }
            else
            {
                Loaded += StepViewerControl_Loaded;
            }
        }

        private void StepViewerControl_Loaded(object sender, RoutedEventArgs e)
        {
            Log("StepViewerControl_Loaded event fired.");
            Loaded -= StepViewerControl_Loaded;
            InitializeWebViewAsync();
        }

        public bool IsWebViewInitialized => _isInitialized;
        public bool IsViewportReady => _isViewportReady;
        public Microsoft.Web.WebView2.Wpf.WebView2 WebView => WebViewControl;

        /// <summary>
        /// Captures the live rendered WebView2 view directly to a PNG file.
        /// </summary>
        public async System.Threading.Tasks.Task<bool> CapturePreviewToFileAsync(string filePath)
        {
            if (WebViewControl?.CoreWebView2 == null)
                return false;

            try
            {
                var dir = Path.GetDirectoryName(filePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    Directory.CreateDirectory(dir);

                using (var fs = File.Create(filePath))
                {
                    await WebViewControl.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, fs);
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static CoreWebView2Environment s_sharedEnvironment;
        private static System.Threading.Tasks.Task<CoreWebView2Environment> s_initEnvTask;

        private static async System.Threading.Tasks.Task<CoreWebView2Environment> GetSharedEnvironmentAsync()
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

        private static async System.Threading.Tasks.Task<CoreWebView2Environment> CreateEnvironmentAsync()
        {
            try
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                int pid = System.Diagnostics.Process.GetCurrentProcess().Id;
                string profilesDir = Path.Combine(localAppData, "pooi.moe", "QuickLook", "WebView2_Profiles");

                // Clean up orphaned profile directories from old closed processes to keep system completely clean
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
                                    System.Diagnostics.Process.GetProcessById(oldPid);
                                }
                                catch (ArgumentException)
                                {
                                    try
                                    {
                                        Directory.Delete(dir, true);
                                        Log($"Cleaned up old profile: {dir}");
                                    }
                                    catch { }
                                }
                            }
                        }
                    }
                }

                string userDataFolder = Path.Combine(profilesDir, $"pid_{pid}");
                Directory.CreateDirectory(userDataFolder);
                Log($"Creating shared environment on STA thread at: {userDataFolder}");
                return await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            }
            catch (Exception ex)
            {
                Log($"Custom environment creation failed: {ex.Message}. Falling back to default...");
                return await CoreWebView2Environment.CreateAsync(null, null);
            }
        }

        /// <summary>
        /// Asynchronously initializes CoreWebView2 environment, sets virtual host mapping,
        /// and attaches the WebResourceRequested streaming interceptor.
        /// </summary>
        private async void InitializeWebViewAsync()
        {
            if (_isInitializing || _isInitialized || _isDisposed)
                return;

            _isInitializing = true;
            Log("InitializeWebViewAsync: Starting...");

            try
            {
                var env = await GetSharedEnvironmentAsync();
                await WebViewControl.EnsureCoreWebView2Async(env);

                Log("InitializeWebViewAsync: EnsureCoreWebView2Async succeeded!");

                // Disable unwanted browser UI elements
                WebViewControl.CoreWebView2.Settings.IsStatusBarEnabled = false;
                WebViewControl.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                WebViewControl.CoreWebView2.Settings.IsZoomControlEnabled = false;
                WebViewControl.CoreWebView2.Settings.AreDevToolsEnabled = false;

                // Robust discovery of Assets directory across deployment modes
                string assetsDir = null;
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
                        assetsDir = candidate;
                        break;
                    }
                }

                if (string.IsNullOrEmpty(assetsDir))
                {
                    throw new DirectoryNotFoundException("Could not locate Web CAD Assets directory.");
                }

                _assetsDir = assetsDir;
                Log($"InitializeWebViewAsync: Assets directory located at {_assetsDir}");

                // Intercept both web assets and CAD binary stream via WebResourceRequested.
                // This completely bypasses AppContainer filesystem restrictions (preventing ERR_ACCESS_DENIED).
                WebViewControl.CoreWebView2.AddWebResourceRequestedFilter(
                    "https://step-viewer.local/*",
                    CoreWebView2WebResourceContext.All
                );

                WebViewControl.CoreWebView2.AddWebResourceRequestedFilter(
                    "https://cad-stream.local/*",
                    CoreWebView2WebResourceContext.All
                );

                WebViewControl.CoreWebView2.WebResourceRequested += CoreWebView2_WebResourceRequested;
                WebViewControl.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

                _isInitialized = true;
                Log("InitializeWebViewAsync: Navigating to https://step-viewer.local/viewer.html");
                WebViewControl.CoreWebView2.Navigate("https://step-viewer.local/viewer.html");
            }
            catch (Exception ex)
            {
                _isInitializing = false;
                Log($"InitializeWebViewAsync ERROR: {ex}");
                LoadingOverlay.Visibility = Visibility.Collapsed;

                bool isRuntimeMissing = ex.GetType().Name.Contains("WebView2") ||
                                        ex is DllNotFoundException ||
                                        ex.Message.IndexOf("WebView2", StringComparison.OrdinalIgnoreCase) >= 0;

                if (isRuntimeMissing)
                {
                    TxtErrorMessage.Text = "Microsoft Edge WebView2 Runtime is required to view 3D CAD files. Please download and install the free Evergreen WebView2 Runtime from Microsoft.";
                    BtnDownloadWebView2.Visibility = Visibility.Visible;
                }
                else
                {
                    TxtErrorMessage.Text = $"Failed to initialize 3D CAD engine:\n{ex.Message}";
                    BtnDownloadWebView2.Visibility = Visibility.Collapsed;
                }

                ErrorOverlay.Visibility = Visibility.Visible;
                _ = Dispatcher.BeginInvoke(new Action(() =>
                {
                    OnModelError?.Invoke(this, $"Failed to initialize 3D CAD engine: {ex.Message}");
                }));
            }
        }

        /// <summary>
        /// Intercepts requests to https://step-viewer.local/ (assets) and https://cad-stream.local/cad-file (STEP file)
        /// and streams them directly from disk in the host C# process, bypassing AppContainer sandbox limits.
        /// </summary>
        private void CoreWebView2_WebResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            var uri = e.Request.Uri;
            if (string.IsNullOrEmpty(uri)) return;

            // 1. Intercept Web Assets (HTML, JS, WASM, CSS)
            if (uri.StartsWith("https://step-viewer.local/", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    var uriObj = new Uri(uri);
                    var rawPath = uriObj.AbsolutePath.TrimStart('/');
                    if (string.IsNullOrEmpty(rawPath)) rawPath = "viewer.html";

                    var safeFile = Path.GetFileName(rawPath);
                    var localFilePath = Path.Combine(_assetsDir ?? string.Empty, safeFile);

                    if (File.Exists(localFilePath))
                    {
                        string ext = Path.GetExtension(localFilePath).ToLowerInvariant();
                        string contentType = "application/octet-stream";
                        switch (ext)
                        {
                            case ".html": contentType = "text/html; charset=utf-8"; break;
                            case ".js": contentType = "application/javascript; charset=utf-8"; break;
                            case ".wasm": contentType = "application/wasm"; break;
                            case ".css": contentType = "text/css; charset=utf-8"; break;
                            case ".png": contentType = "image/png"; break;
                            case ".svg": contentType = "image/svg+xml"; break;
                        }

                        var fs = new FileStream(localFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                        string headers = $"Content-Type: {contentType}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\n";
                        e.Response = WebViewControl.CoreWebView2.Environment.CreateWebResourceResponse(fs, 200, "OK", headers);
                        return;
                    }
                }
                catch (Exception ex)
                {
                    Log($"Asset streaming error: {ex.Message}");
                }

                var nfBytes = Encoding.UTF8.GetBytes("Asset Not Found");
                var nfMs = new MemoryStream(nfBytes);
                e.Response = WebViewControl.CoreWebView2.Environment.CreateWebResourceResponse(nfMs, 404, "Not Found", "Content-Type: text/plain\r\n");
                return;
            }

            // 2. Intercept CAD file binary streaming
            if (uri.StartsWith("https://cad-stream.local/cad-file", StringComparison.OrdinalIgnoreCase))
            {
                // Handle CORS preflight
                if (string.Equals(e.Request.Method, "OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    var emptyMs = new MemoryStream(new byte[0]);
                    e.Response = WebViewControl.CoreWebView2.Environment.CreateWebResourceResponse(
                        emptyMs,
                        200,
                        "OK",
                        "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\n"
                    );
                    return;
                }

                string targetPath = _currentFilePath;
                if (!string.IsNullOrEmpty(targetPath) && File.Exists(targetPath))
                {
                    try
                    {
                        // Open with FileShare.ReadWrite | FileShare.Delete to avoid file locking
                        var fs = new FileStream(targetPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                        var response = WebViewControl.CoreWebView2.Environment.CreateWebResourceResponse(
                            fs,
                            200,
                            "OK",
                            "Content-Type: application/octet-stream\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nCache-Control: no-cache, no-store\r\n"
                        );
                        e.Response = response;
                        return;
                    }
                    catch (Exception ex)
                    {
                        var errBytes = Encoding.UTF8.GetBytes($"File stream error: {ex.Message}");
                        var ms = new MemoryStream(errBytes);
                        e.Response = WebViewControl.CoreWebView2.Environment.CreateWebResourceResponse(
                            ms,
                            500,
                            "Internal Error",
                            "Content-Type: text/plain\r\nAccess-Control-Allow-Origin: *\r\n"
                        );
                        return;
                    }
                }

                // File not found response
                var notFoundBytes = Encoding.UTF8.GetBytes("CAD File Not Found");
                var notFoundStream = new MemoryStream(notFoundBytes);
                e.Response = WebViewControl.CoreWebView2.Environment.CreateWebResourceResponse(
                    notFoundStream,
                    404,
                    "Not Found",
                    "Content-Type: text/plain\r\nAccess-Control-Allow-Origin: *\r\n"
                );
            }
        }

        /// <summary>
        /// Handles incoming JSON messages from the Three.js viewport script.
        /// </summary>
        private void CoreWebView2_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string json = e.WebMessageAsJson;
                if (string.IsNullOrEmpty(json)) return;

                Log($"WebMessageReceived: {json}");

                string msgType = ExtractJsonProp(json, "type");
                if (string.IsNullOrEmpty(msgType))
                {
                    msgType = ExtractJsonProp(json, "action");
                }
                if (string.Equals(msgType, "VIEWPORT_READY", StringComparison.OrdinalIgnoreCase))
                {
                    _isViewportReady = true;
                    OnReady?.Invoke(this, EventArgs.Empty);

                    if (!string.IsNullOrEmpty(_pendingFilePath))
                    {
                        string path = _pendingFilePath;
                        _pendingFilePath = null;
                        StartLoading(path);
                    }
                }
                else if (string.Equals(msgType, "LOADED", StringComparison.OrdinalIgnoreCase))
                {
                    LoadingOverlay.Visibility = Visibility.Collapsed;
                    ErrorOverlay.Visibility = Visibility.Collapsed;
                    OnModelLoaded?.Invoke(this, EventArgs.Empty);
                }
                else if (string.Equals(msgType, "ERROR", StringComparison.OrdinalIgnoreCase))
                {
                    LoadingOverlay.Visibility = Visibility.Collapsed;
                    string errMsg = ExtractJsonProp(json, "message") ?? "Unknown CAD rendering error";
                    TxtErrorMessage.Text = errMsg;
                    ErrorOverlay.Visibility = Visibility.Visible;
                    OnModelError?.Invoke(this, errMsg);
                }
                else if (string.Equals(msgType, "SAVE_SNAPSHOT", StringComparison.OrdinalIgnoreCase))
                {
                    string dataUrl = ExtractLargeJsonProp(json, "data");
                    string defaultName = ExtractJsonProp(json, "defaultName");
                    if (string.IsNullOrEmpty(defaultName)) defaultName = "CAD_Snapshot.png";

                    if (!string.IsNullOrEmpty(dataUrl))
                    {
                        Dispatcher.Invoke(() =>
                        {
                            var sfd = new Microsoft.Win32.SaveFileDialog
                            {
                                Title = "Save CAD Viewport Snapshot",
                                Filter = "PNG Image (*.png)|*.png|JPEG Image (*.jpg)|*.jpg|All Files (*.*)|*.*",
                                FileName = defaultName,
                                DefaultExt = ".png",
                                AddExtension = true
                            };

                            var owner = Window.GetWindow(this);
                            bool? dialogResult = owner != null ? sfd.ShowDialog(owner) : sfd.ShowDialog();
                            if (dialogResult == true)
                            {
                                try
                                {
                                    string base64Data = Regex.Replace(dataUrl, @"^data:image\/[a-zA-Z]+;base64,", "");
                                    byte[] imageBytes = Convert.FromBase64String(base64Data);
                                    File.WriteAllBytes(sfd.FileName, imageBytes);

                                    _ = WebViewControl.CoreWebView2.ExecuteScriptAsync(
                                        $"if (typeof showToast === 'function') showToast('Saved: {EscapeJsonString(Path.GetFileName(sfd.FileName))}');"
                                    );
                                }
                                catch (Exception ex)
                                {
                                    MessageBox.Show($"Failed to save snapshot file:\n{ex.Message}", "QuickLook STEP Viewer", MessageBoxButton.OK, MessageBoxImage.Error);
                                }
                            }
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"Error handling web message: {ex}");
                OnModelError?.Invoke(this, $"Error handling web message: {ex.Message}");
            }
        }

        /// <summary>
        /// Initiates loading of a STEP file. Enforces the 35 MB threshold guardrail.
        /// </summary>
        public void LoadStepFile(string filePath)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            {
                OnModelError?.Invoke(this, "Specified CAD file does not exist.");
                return;
            }

            _currentFilePath = filePath;
            var fi = new FileInfo(filePath);
            long sizeBytes = fi.Length;

            Log($"LoadStepFile: {filePath} ({sizeBytes} bytes)");

            if (sizeBytes > ThresholdBytes)
            {
                ShowGuardrail(filePath, sizeBytes);
            }
            else
            {
                GuardrailOverlay.Visibility = Visibility.Collapsed;
                StartLoading(filePath);
            }
        }

        /// <summary>
        /// Shows the defensive guardrail card with metadata for large files.
        /// </summary>
        private void ShowGuardrail(string filePath, long sizeBytes)
        {
            var meta = StepMetadataParser.ExtractMetadata(filePath);

            TxtMetaFileName.Text = Path.GetFileName(filePath);
            TxtMetaFileSize.Text = $"{sizeBytes / (1024.0 * 1024.0):F1} MB ({sizeBytes:N0} bytes)";
            TxtMetaSchema.Text = string.IsNullOrEmpty(meta.Schema) ? "Unknown Schema" : meta.Schema;
            TxtMetaSoftware.Text = string.IsNullOrEmpty(meta.OriginatingSystem) ? "Unknown Authoring System" : meta.OriginatingSystem;

            GuardrailOverlay.Visibility = Visibility.Visible;
            LoadingOverlay.Visibility = Visibility.Collapsed;
            OnModelLoaded?.Invoke(this, EventArgs.Empty);
        }

        private void BtnRenderLargeModel_Click(object sender, RoutedEventArgs e)
        {
            GuardrailOverlay.Visibility = Visibility.Collapsed;
            if (!string.IsNullOrEmpty(_currentFilePath))
            {
                LoadingOverlay.Visibility = Visibility.Visible;
                StartLoading(_currentFilePath);
            }
        }

        /// <summary>
        /// Dispatches the LOAD_URL command to Three.js in WebView2.
        /// </summary>
        private void StartLoading(string filePath)
        {
            if (!_isViewportReady)
            {
                _pendingFilePath = filePath;
                TxtLoadingStatus.Text = "Initializing 3D CAD Engine...";
                LoadingOverlay.Visibility = Visibility.Visible;
                return;
            }

            var fi = new FileInfo(filePath);
            TxtLoadingStatus.Text = $"Tessellating {Path.GetFileName(filePath)} ({fi.Length / (1024.0 * 1024.0):F1} MB)...";
            LoadingOverlay.Visibility = Visibility.Visible;

            string encodedFileName = EscapeJsonString(Path.GetFileName(filePath));
            string url = $"https://cad-stream.local/cad-file?t={DateTime.UtcNow.Ticks}";
            string json = $"{{\"action\":\"LOAD_URL\",\"url\":\"{url}\",\"fileName\":\"{encodedFileName}\"}}";

            Log($"StartLoading: Posting LOAD_URL to WebView2: {json}");
            WebViewControl.CoreWebView2.PostWebMessageAsJson(json);
        }

        /// <summary>
        /// Rapid navigation defense: terminates active Open CASCADE worker to free thread immediately.
        /// </summary>
        public void CancelCurrentOperation()
        {
            try
            {
                if (_isInitialized && WebViewControl != null && WebViewControl.CoreWebView2 != null)
                {
                    WebViewControl.CoreWebView2.PostWebMessageAsJson("{\"action\":\"CANCEL\"}");
                }
            }
            catch
            {
                // Ignore errors during cancel
            }
        }

        /// <summary>
        /// Safely disposes WebView2 resources, event handlers, and active operations.
        /// </summary>
        public void Dispose()
        {
            if (_isDisposed) return;
            _isDisposed = true;

            try
            {
                if (_isInitialized && WebViewControl != null && WebViewControl.CoreWebView2 != null)
                {
                    try { WebViewControl.CoreWebView2.PostWebMessageAsJson("{\"action\":\"DISPOSE\"}"); } catch { }
                }

                CancelCurrentOperation();

                if (WebViewControl != null)
                {
                    if (WebViewControl.CoreWebView2 != null)
                    {
                        WebViewControl.CoreWebView2.WebResourceRequested -= CoreWebView2_WebResourceRequested;
                        WebViewControl.CoreWebView2.WebMessageReceived -= CoreWebView2_WebMessageReceived;
                        WebViewControl.CoreWebView2.Stop();
                    }

                    WebViewControl.Dispose();
                }
            }
            catch
            {
                // Suppress disposal errors
            }
        }

        private void BtnDownloadWebView2_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "https://go.microsoft.com/fwlink/p/?LinkId=2124703",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                Log($"Failed to launch browser for WebView2 download: {ex.Message}");
            }
        }

        private static string EscapeJsonString(string s)
        {
            if (string.IsNullOrEmpty(s)) return string.Empty;
            return s.Replace("\\", "\\\\")
                    .Replace("\"", "\\\"")
                    .Replace("\r", "\\r")
                    .Replace("\n", "\\n")
                    .Replace("\t", "\\t");
        }

        private static string ExtractLargeJsonProp(string json, string propName)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(propName)) return null;
            int keyIdx = json.IndexOf($"\"{propName}\"", StringComparison.OrdinalIgnoreCase);
            if (keyIdx >= 0)
            {
                int colonIdx = json.IndexOf(':', keyIdx + propName.Length + 2);
                if (colonIdx >= 0)
                {
                    int quoteStart = json.IndexOf('"', colonIdx);
                    if (quoteStart >= 0)
                    {
                        int quoteEnd = json.IndexOf('"', quoteStart + 1);
                        if (quoteEnd > quoteStart)
                        {
                            return json.Substring(quoteStart + 1, quoteEnd - quoteStart - 1);
                        }
                    }
                }
            }
            return ExtractJsonProp(json, propName);
        }

        private static string ExtractJsonProp(string json, string propName)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(propName)) return null;

            var strPattern = $"\"{propName}\"\\s*:\\s*\"([^\"]*)\"";
            var match = Regex.Match(json, strPattern);
            if (match.Success) return match.Groups[1].Value;

            var valPattern = $"\"{propName}\"\\s*:\\s*([^,}}\\s]+)";
            var valMatch = Regex.Match(json, valPattern);
            if (valMatch.Success) return valMatch.Groups[1].Value;

            return null;
        }
    }
}
