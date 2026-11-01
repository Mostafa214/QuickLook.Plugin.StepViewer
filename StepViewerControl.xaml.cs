using System;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;

namespace QuickLook.Plugin.StepViewer
{
    /// <summary>
    /// Lightweight WPF adapter hosting Microsoft Edge WebView2, coordinating
    /// lifecycle events, guardrail UI, and delegating modular services.
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

        private readonly PluginUpdateService _updateService = new PluginUpdateService();

        public static void Log(string msg)
        {
#if DEBUG
            try
            {
                string line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {msg}{Environment.NewLine}";
                string logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"pooi.moe\QuickLook");
                if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
                File.AppendAllText(Path.Combine(logDir, "step_debug.log"), line);
            }
            catch { }
#endif
        }

        public StepViewerControl()
        {
            InitializeComponent();
            if (IsLoaded) Dispatcher.BeginInvoke(new Action(InitializeWebViewAsync));
            else Loaded += (s, e) => InitializeWebViewAsync();
        }

        public bool IsWebViewInitialized => _isInitialized;
        public bool IsViewportReady => _isViewportReady;
        public Microsoft.Web.WebView2.Wpf.WebView2 WebView => WebViewControl;

        public async System.Threading.Tasks.Task<bool> CapturePreviewToFileAsync(string filePath)
        {
            if (WebViewControl?.CoreWebView2 == null) return false;
            try
            {
                var dir = Path.GetDirectoryName(filePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                using (var fs = File.Create(filePath))
                    await WebViewControl.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, fs);
                return true;
            }
            catch (Exception ex) { Log($"CapturePreview error: {ex.Message}"); return false; }
        }

        private async void InitializeWebViewAsync()
        {
            if (_isInitializing || _isInitialized || _isDisposed) return;
            _isInitializing = true;
            try
            {
                var env = await WebViewEnvironmentManager.GetSharedEnvironmentAsync();
                await WebViewControl.EnsureCoreWebView2Async(env);

                WebViewEnvironmentManager.ConfigureWebView(WebViewControl.CoreWebView2);
                _assetsDir = WebViewEnvironmentManager.LocateAssetsDirectory();

                WebViewControl.CoreWebView2.WebResourceRequested += (s, e) =>
                    WebViewEnvironmentManager.HandleWebResourceRequested(WebViewControl.CoreWebView2, e, _assetsDir, _currentFilePath);
                WebViewControl.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

                _isInitialized = true;
                WebViewControl.CoreWebView2.Navigate("https://step-viewer.local/viewer.html");
            }
            catch (Exception ex)
            {
                _isInitializing = false;
                LoadingOverlay.Visibility = Visibility.Collapsed;
                bool isMissing = ex.GetType().Name.Contains("WebView2") || ex is DllNotFoundException || ex.Message.IndexOf("WebView2", StringComparison.OrdinalIgnoreCase) >= 0;
                TxtErrorMessage.Text = isMissing
                    ? "Microsoft Edge WebView2 Runtime is required to view 3D CAD files. Please download and install the free Evergreen WebView2 Runtime from Microsoft."
                    : $"Failed to initialize 3D CAD engine:\n{ex.Message}";
                BtnDownloadWebView2.Visibility = isMissing ? Visibility.Visible : Visibility.Collapsed;
                ErrorOverlay.Visibility = Visibility.Visible;
                _ = Dispatcher.BeginInvoke(new Action(() => OnModelError?.Invoke(this, $"Failed to initialize 3D CAD engine: {ex.Message}")));
            }
        }

        private void CoreWebView2_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string json = e.WebMessageAsJson;
                if (string.IsNullOrEmpty(json)) return;

                var msg = IpcMessageParser.Parse(json);
                if (msg == null) return;

                switch (msg)
                {
                    case ViewportReadyMessage _:
                        _isViewportReady = true;
                        OnReady?.Invoke(this, EventArgs.Empty);
                        if (!string.IsNullOrEmpty(_pendingFilePath))
                        {
                            string path = _pendingFilePath;
                            _pendingFilePath = null;
                            StartLoading(path);
                        }
                        break;

                    case ModelLoadedMessage _:
                        LoadingOverlay.Visibility = Visibility.Collapsed;
                        ErrorOverlay.Visibility = Visibility.Collapsed;
                        OnModelLoaded?.Invoke(this, EventArgs.Empty);
                        break;

                    case ModelErrorMessage errMsg:
                        LoadingOverlay.Visibility = Visibility.Collapsed;
                        string message = !string.IsNullOrEmpty(errMsg.Message) ? errMsg.Message : "Unknown CAD rendering error";
                        TxtErrorMessage.Text = message;
                        ErrorOverlay.Visibility = Visibility.Visible;
                        OnModelError?.Invoke(this, message);
                        break;

                    case SaveSnapshotMessage snap:
                        Dispatcher.Invoke(() => SnapshotExportService.HandleSaveSnapshot(Window.GetWindow(this), WebViewControl?.CoreWebView2, snap));
                        break;

                    case CopySnapshotMessage copySnap:
                        Dispatcher.Invoke(() => SnapshotExportService.HandleCopySnapshot(copySnap));
                        break;

                    case StartUpdateDownloadMessage updateMsg:
                        _ = _updateService.ExecuteAutoUpdateDownloadAsync(updateMsg.DownloadUrl, updateMsg.Version, WebViewControl?.CoreWebView2, Dispatcher.Invoke);
                        break;

                    case ApplyUpdateRestartMessage _:
                        _updateService.ApplyUpdateAndRestart(WebViewControl?.CoreWebView2, Dispatcher.Invoke);
                        break;
                }
            }
            catch (Exception ex)
            {
                Log($"Error handling web message: {ex}");
                OnModelError?.Invoke(this, $"Error handling web message: {ex.Message}");
            }
        }

        public void LoadStepFile(string filePath)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            {
                OnModelError?.Invoke(this, "Specified CAD file does not exist.");
                return;
            }

            _currentFilePath = filePath;
            var fi = new FileInfo(filePath);
            if (fi.Length > ThresholdBytes) ShowGuardrail(filePath, fi.Length);
            else
            {
                GuardrailOverlay.Visibility = Visibility.Collapsed;
                StartLoading(filePath);
            }
        }

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

            var cmd = new LoadModelCommand
            {
                Action = "LOAD_URL",
                Url = $"https://cad-stream.local/cad-file?t={DateTime.UtcNow.Ticks}",
                FileName = Path.GetFileName(filePath)
            };

            WebViewControl.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(cmd, IpcJsonOptions.Default));
        }

        public void CancelCurrentOperation()
        {
            try
            {
                if (_isInitialized && WebViewControl?.CoreWebView2 != null)
                    WebViewControl.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(ViewportActionCommand.Cancel, IpcJsonOptions.Default));
            }
            catch (Exception ex) { Log($"CancelCurrentOperation error: {ex.Message}"); }
        }

        public void Dispose()
        {
            if (_isDisposed) return;
            _isDisposed = true;

            try
            {
                if (_isInitialized && WebViewControl?.CoreWebView2 != null)
                {
                    try { WebViewControl.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(ViewportActionCommand.Dispose, IpcJsonOptions.Default)); }
                    catch (Exception ex) { Log($"Dispose post message error: {ex.Message}"); }
                }

                CancelCurrentOperation();

                if (WebViewControl != null)
                {
                    if (WebViewControl.CoreWebView2 != null) WebViewControl.CoreWebView2.Stop();
                    WebViewControl.Dispose();
                }
            }
            catch (Exception ex) { Log($"Dispose error: {ex.Message}"); }
        }

        private void BtnDownloadWebView2_Click(object sender, RoutedEventArgs e)
        {
            try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo { FileName = "https://go.microsoft.com/fwlink/p/?LinkId=2124703", UseShellExecute = true }); }
            catch (Exception ex) { Log($"Failed to launch browser: {ex.Message}"); }
        }

        #region Backward Compatibility Static Forwarders (For Tests & External Callers)
        public static string ComputeFileSha256(string filePath) => PluginUpdateService.ComputeFileSha256(filePath);
        public static bool FixedTimeEquals(string hashA, string hashB) => PluginUpdateService.FixedTimeEquals(hashA, hashB);
        internal static bool IsTrustedGitHubUpdateUrl(string url, out Uri validatedUri) => PluginUpdateService.IsTrustedGitHubUpdateUrl(url, out validatedUri);
        internal static void ValidateZipArchiveEntries(string zipFilePath) => PluginUpdateService.ValidateZipArchiveEntries(zipFilePath);
        public static bool IsValidSnapshotTargetPath(string path) => SnapshotExportService.IsValidSnapshotTargetPath(path);
        public static bool TryValidateSnapshotTargetPath(string rawPath, out string validatedPath) => SnapshotExportService.TryValidateSnapshotTargetPath(rawPath, out validatedPath);
        public static bool IsValidImageHeader(byte[] bytes) => SnapshotExportService.IsValidImageHeader(bytes);
        #endregion
    }
}
