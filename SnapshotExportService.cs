using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Media.Imaging;
using Microsoft.Web.WebView2.Core;

namespace QuickLook.Plugin.StepViewer
{
    /// <summary>
    /// Encapsulates snapshot export security, path traversal guards,
    /// format validation, file writing, and clipboard copying.
    /// </summary>
    public static class SnapshotExportService
    {
        public static readonly HashSet<string> AllowedSnapshotExtensions =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".png",
                ".jpg",
                ".jpeg",
                ".svg",
                ".pdf"
            };

        public static readonly HashSet<string> AllowedModelExportExtensions =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".stl",
                ".obj",
                ".glb"
            };

        public static readonly HashSet<string> DangerousFileExtensions =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".wsh",
                ".hta", ".com", ".scr", ".msi", ".msp", ".pif", ".cpl", ".jar", ".reg", ".sys"
            };

        public static readonly HashSet<string> DosDeviceNames =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "CON", "PRN", "AUX", "NUL",
                "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
                "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
            };

        public static bool IsValidSnapshotTargetPath(string path)
        {
            return TryValidateSnapshotTargetPath(path, out _);
        }

        public static bool TryValidateSnapshotTargetPath(string rawPath, out string validatedPath)
        {
            return TryValidateTargetPath(rawPath, AllowedSnapshotExtensions, out validatedPath);
        }

        public static bool TryValidateModelExportTargetPath(string rawPath, out string validatedPath)
        {
            return TryValidateTargetPath(rawPath, AllowedModelExportExtensions, out validatedPath);
        }

        private static bool TryValidateTargetPath(string rawPath, HashSet<string> allowedExtensions, out string validatedPath)
        {
            validatedPath = null;
            if (string.IsNullOrWhiteSpace(rawPath))
                return false;

            if (rawPath.EndsWith(".") || rawPath.EndsWith(" "))
                return false;

            string trimmed = rawPath.Trim();

            // 1. Check for illegal characters and control characters
            if (trimmed.IndexOfAny(Path.GetInvalidPathChars()) >= 0)
                return false;

            foreach (char c in trimmed)
            {
                if (char.IsControl(c))
                    return false;
            }

            // 2. Reject directory traversal tokens
            if (trimmed.Contains(".."))
                return false;

            // 3. Reject UNC / network shares / device paths
            if (trimmed.StartsWith(@"\\") || trimmed.StartsWith("//"))
                return false;

            // 4. Must be a rooted drive path: e.g. C:\...
            if (trimmed.Length < 4 || !char.IsLetter(trimmed[0]) || trimmed[1] != ':' || (trimmed[2] != '\\' && trimmed[2] != '/'))
                return false;

            // 5. Reject alternate data streams (colons beyond drive letter)
            if (trimmed.IndexOf(':', 2) >= 0)
                return false;

            // 6. Reject trailing dots or spaces
            if (trimmed.EndsWith(".") || trimmed.EndsWith(" "))
                return false;

            // 7. Canonicalize full path
            string fullPath;
            try
            {
                fullPath = Path.GetFullPath(trimmed);
            }
            catch
            {
                return false;
            }

            if (fullPath.Contains(".."))
                return false;

            // 8. Validate file name and extension
            string fileName = Path.GetFileName(fullPath);
            if (string.IsNullOrWhiteSpace(fileName))
                return false;

            string ext = Path.GetExtension(fullPath);
            if (string.IsNullOrEmpty(ext) || !allowedExtensions.Contains(ext))
                return false;

            if (DangerousFileExtensions.Contains(ext))
                return false;

            // 9. Check for dangerous double extensions (e.g. payload.exe.png or payload.bat.jpg)
            string nameWithoutExt = Path.GetFileNameWithoutExtension(fullPath);
            string secondExt = Path.GetExtension(nameWithoutExt);
            if (!string.IsNullOrEmpty(secondExt) && DangerousFileExtensions.Contains(secondExt))
                return false;

            // 10. Check for DOS device names
            if (DosDeviceNames.Contains(nameWithoutExt))
                return false;

            validatedPath = fullPath;
            return true;
        }

        public static string SanitizeSnapshotDefaultName(string rawName)
        {
            return SanitizeDefaultFileName(rawName, "CAD_Snapshot.png", AllowedSnapshotExtensions, ".png");
        }

        public static string SanitizeModelExportDefaultName(string rawName, string fallbackExtension = ".stl")
        {
            string ext = AllowedModelExportExtensions.Contains(fallbackExtension) ? fallbackExtension : ".stl";
            return SanitizeDefaultFileName(rawName, $"CAD_Model{ext}", AllowedModelExportExtensions, ext);
        }

        private static string SanitizeDefaultFileName(string rawName, string fallbackName, HashSet<string> allowedExtensions, string fallbackExtension)
        {
            if (string.IsNullOrWhiteSpace(rawName))
                return fallbackName;

            string fileName = Path.GetFileName(rawName.Trim());
            if (string.IsNullOrWhiteSpace(fileName))
                return fallbackName;

            char[] invalidChars = Path.GetInvalidFileNameChars();
            if (fileName.IndexOfAny(invalidChars) >= 0)
            {
                foreach (char c in invalidChars)
                    fileName = fileName.Replace(c, '_');
            }

            string ext = Path.GetExtension(fileName);
            if (!allowedExtensions.Contains(ext))
            {
                fileName = Path.ChangeExtension(fileName, fallbackExtension);
            }

            string nameOnly = Path.GetFileNameWithoutExtension(fileName);
            if (DosDeviceNames.Contains(nameOnly))
            {
                fileName = "CAD_" + fileName;
            }

            return fileName;
        }

        public static bool IsValidImageHeader(byte[] bytes)
        {
            if (bytes == null || bytes.Length < 3)
                return false;

            // PNG signature: 89 50 4E 47 0D 0A 1A 0A
            if (bytes.Length >= 8 &&
                bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 &&
                bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A)
            {
                return true;
            }

            // JPEG signature: FF D8 FF
            if (bytes.Length >= 3 &&
                bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
            {
                return true;
            }

            // PDF signature: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
            if (bytes.Length >= 5 &&
                bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46 && bytes[4] == 0x2D)
            {
                return true;
            }

            // SVG signature: <?xml, <svg, or <!DOCTYPE
            if (bytes.Length >= 4)
            {
                try
                {
                    string prefix = System.Text.Encoding.UTF8.GetString(bytes, 0, Math.Min(bytes.Length, 128)).TrimStart();
                    if (prefix.StartsWith("<svg", StringComparison.OrdinalIgnoreCase) ||
                        prefix.StartsWith("<?xml", StringComparison.OrdinalIgnoreCase) ||
                        prefix.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
                catch { }
            }

            return false;
        }

        public static bool HandleSaveSnapshot(SaveSnapshotMessage snap)
        {
            return HandleSaveSnapshot(null, null, snap);
        }

        public static bool HandleSaveSnapshot(Window ownerWindow, CoreWebView2 webView, SaveSnapshotMessage snap)
        {
            if (snap == null || string.IsNullOrEmpty(snap.Data)) return false;

            string dataUrl = snap.Data;
            string defaultName = snap.DefaultName;
            string directTargetPath = snap.TargetPath;

            try
            {
                string base64Data = Regex.Replace(dataUrl, @"^data:(image\/[a-zA-Z0-9\+\-]+|application\/pdf|application\/octet-stream);base64,", "");
                byte[] imageBytes = Convert.FromBase64String(base64Data);

                if (!IsValidImageHeader(imageBytes))
                {
                    StepViewerControl.Log("[Security] Snapshot data rejected: invalid image header signature.");
                    _ = webView?.ExecuteScriptAsync(
                        IpcScriptBuilder.BuildShowToastScript("Error: Invalid image header signature.")
                    );
                    return false;
                }

                // Direct write path (for automation/tests): strictly validated
                if (!string.IsNullOrEmpty(directTargetPath))
                {
                    if (TryValidateSnapshotTargetPath(directTargetPath, out string safeTargetPath))
                    {
                        // SEC-02: Prevent silent file overwrite
                        if (File.Exists(safeTargetPath))
                        {
                            StepViewerControl.Log($"[Security] Snapshot direct target path rejected: file already exists at {safeTargetPath}");
                            _ = webView?.ExecuteScriptAsync(
                                IpcScriptBuilder.BuildShowToastScript($"Error: File already exists: {Path.GetFileName(safeTargetPath)}")
                            );
                            return false;
                        }

                        var parent = Path.GetDirectoryName(safeTargetPath);
                        if (!string.IsNullOrEmpty(parent) && !Directory.Exists(parent))
                            Directory.CreateDirectory(parent);

                        File.WriteAllBytes(safeTargetPath, imageBytes);
                        _ = webView?.ExecuteScriptAsync(
                            IpcScriptBuilder.BuildShowToastScript($"Saved: {Path.GetFileName(safeTargetPath)}")
                        );
                        return true;
                    }
                    else
                    {
                        StepViewerControl.Log($"[Security] Snapshot direct target path rejected due to security policy: {directTargetPath}");
                        string directFileName;
                        try
                        {
                            directFileName = Path.GetFileName(directTargetPath);
                        }
                        catch
                        {
                            directFileName = directTargetPath;
                        }
                        _ = webView?.ExecuteScriptAsync(
                            IpcScriptBuilder.BuildShowToastScript($"Error: Invalid snapshot target path: {directFileName}")
                        );
                        return false;
                    }
                }

                // Safe Fallback: interactive SaveFileDialog
                string safeDefaultName = SanitizeSnapshotDefaultName(defaultName);
                bool isSvg = safeDefaultName.EndsWith(".svg", StringComparison.OrdinalIgnoreCase);
                bool isPdf = safeDefaultName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase);
                var sfd = new Microsoft.Win32.SaveFileDialog
                {
                    Title = isPdf ? "Save CAD Engineering Drawing (PDF)" : (isSvg ? "Save CAD Engineering Blueprint (SVG)" : "Save CAD Engineering Image (PNG)"),
                    Filter = "PNG Image (*.png)|*.png|PDF Document (*.pdf)|*.pdf|Scalable Vector Graphics (*.svg)|*.svg|JPEG Image (*.jpg)|*.jpg|All Supported Formats (*.png;*.pdf;*.svg;*.jpg)|*.png;*.pdf;*.svg;*.jpg",
                    FilterIndex = isPdf ? 2 : (isSvg ? 3 : 1),
                    FileName = safeDefaultName,
                    DefaultExt = isPdf ? ".pdf" : (isSvg ? ".svg" : ".png"),
                    AddExtension = true
                };

                bool? dialogResult = ownerWindow != null ? sfd.ShowDialog(ownerWindow) : sfd.ShowDialog();
                if (dialogResult == true)
                {
                    string savePath = sfd.FileName;
                    string ext = Path.GetExtension(savePath);
                    if (!AllowedSnapshotExtensions.Contains(ext))
                    {
                        savePath = Path.ChangeExtension(savePath, isPdf ? ".pdf" : (isSvg ? ".svg" : ".png"));
                    }

                    File.WriteAllBytes(savePath, imageBytes);
                    _ = webView?.ExecuteScriptAsync(
                        IpcScriptBuilder.BuildShowToastScript($"Saved: {Path.GetFileName(savePath)}")
                    );
                    return true;
                }

                return false;
            }
            catch (Exception ex)
            {
                StepViewerControl.Log($"Failed to save snapshot file: {ex.Message}");
                if (ownerWindow != null)
                {
                    MessageBox.Show($"Failed to save snapshot file:\n{ex.Message}", "QuickLook STEP Viewer", MessageBoxButton.OK, MessageBoxImage.Error);
                }
                return false;
            }
        }

        public static void HandleCopySnapshot(CopySnapshotMessage copySnap)
        {
            if (copySnap == null || string.IsNullOrEmpty(copySnap.Data)) return;

            try
            {
                string base64Data = Regex.Replace(copySnap.Data, @"^data:image\/[a-zA-Z]+;base64,", "");
                byte[] imageBytes = Convert.FromBase64String(base64Data);
                var bitmap = new BitmapImage();
                using (var ms = new MemoryStream(imageBytes))
                {
                    bitmap.BeginInit();
                    bitmap.CacheOption = BitmapCacheOption.OnLoad;
                    bitmap.StreamSource = ms;
                    bitmap.EndInit();
                }
                bitmap.Freeze();

                for (int i = 0; i < 3; i++)
                {
                    try
                    {
                        Clipboard.SetImage(bitmap);
                        StepViewerControl.Log("Copied high-res CAD export image directly to Windows Clipboard.");
                        break;
                    }
                    catch (System.Runtime.InteropServices.COMException)
                    {
                        System.Threading.Thread.Sleep(60);
                    }
                }
            }
            catch (Exception ex)
            {
                StepViewerControl.Log($"Clipboard copy error: {ex.Message}");
            }
        }

        public static bool IsValidModelExportPayload(string formatOrExt, byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0 || string.IsNullOrWhiteSpace(formatOrExt))
                return false;

            string fmt = formatOrExt.Trim().TrimStart('.').ToLowerInvariant();
            if (fmt == "stl")
            {
                if (bytes.Length >= 84)
                {
                    uint count = (uint)(bytes[80] | (bytes[81] << 8) | (bytes[82] << 16) | (bytes[83] << 24));
                    long expectedSize = 84L + 50L * count;
                    if (expectedSize == bytes.Length)
                        return true;
                }

                string head = System.Text.Encoding.ASCII.GetString(bytes, 0, Math.Min(bytes.Length, 64)).TrimStart();
                return head.StartsWith("solid", StringComparison.OrdinalIgnoreCase);
            }

            if (fmt == "glb")
            {
                if (bytes.Length < 12)
                    return false;

                bool magicOk = bytes[0] == 0x67 && bytes[1] == 0x6C && bytes[2] == 0x54 && bytes[3] == 0x46;
                uint version = (uint)(bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24));
                return magicOk && version == 2;
            }

            if (fmt == "obj")
            {
                for (int i = 0; i < Math.Min(bytes.Length, 4096); i++)
                {
                    if (bytes[i] == 0)
                        return false;
                }
                return true;
            }

            return false;
        }

        public static bool HandleExportModel(ExportModelMessage msg)
        {
            return HandleExportModel(null, null, msg);
        }

        public static bool HandleExportModel(Window ownerWindow, CoreWebView2 webView, ExportModelMessage msg)
        {
            if (msg == null || string.IsNullOrEmpty(msg.Data))
                return false;

            string format = (msg.Format ?? "stl").Trim().TrimStart('.').ToLowerInvariant();
            string ext = "." + format;
            if (!AllowedModelExportExtensions.Contains(ext))
                return false;

            try
            {
                string base64Data = Regex.Replace(msg.Data, @"^data:[^;]+;base64,", "");
                byte[] modelBytes = Convert.FromBase64String(base64Data);

                if (!IsValidModelExportPayload(format, modelBytes))
                {
                    StepViewerControl.Log($"[Security] Model export rejected: invalid {format.ToUpperInvariant()} payload signature.");
                    _ = webView?.ExecuteScriptAsync(
                        IpcScriptBuilder.BuildShowToastScript($"Error: Invalid {format.ToUpperInvariant()} export payload.")
                    );
                    return false;
                }

                if (!string.IsNullOrEmpty(msg.TargetPath))
                {
                    if (!TryValidateModelExportTargetPath(msg.TargetPath, out string safeTargetPath))
                    {
                        StepViewerControl.Log($"[Security] Model export target path rejected: {msg.TargetPath}");
                        return false;
                    }

                    if (File.Exists(safeTargetPath))
                    {
                        StepViewerControl.Log($"[Security] Model export target path rejected: file already exists at {safeTargetPath}");
                        _ = webView?.ExecuteScriptAsync(
                            IpcScriptBuilder.BuildShowToastScript($"Error: File already exists: {Path.GetFileName(safeTargetPath)}")
                        );
                        return false;
                    }

                    var parent = Path.GetDirectoryName(safeTargetPath);
                    if (!string.IsNullOrEmpty(parent) && !Directory.Exists(parent))
                        Directory.CreateDirectory(parent);

                    File.WriteAllBytes(safeTargetPath, modelBytes);
                    _ = webView?.ExecuteScriptAsync(
                        IpcScriptBuilder.BuildShowToastScript($"Exported: {Path.GetFileName(safeTargetPath)}")
                    );
                    return true;
                }

                string safeDefaultName = SanitizeModelExportDefaultName(msg.DefaultName, ext);
                string title = format == "glb" ? "Export 3D Model as glTF Binary (GLB)" : (format == "obj" ? "Export 3D Model as Wavefront OBJ" : "Export 3D Model as Binary STL");
                var sfd = new Microsoft.Win32.SaveFileDialog
                {
                    Title = title,
                    Filter = "Binary STL (*.stl)|*.stl|Wavefront OBJ (*.obj)|*.obj|glTF 2.0 Binary (*.glb)|*.glb",
                    FilterIndex = format == "obj" ? 2 : (format == "glb" ? 3 : 1),
                    FileName = safeDefaultName,
                    DefaultExt = ext,
                    AddExtension = true
                };

                bool? dialogResult = ownerWindow != null ? sfd.ShowDialog(ownerWindow) : sfd.ShowDialog();
                if (dialogResult == true)
                {
                    string savePath = sfd.FileName;
                    string chosenExt = Path.GetExtension(savePath);
                    if (!AllowedModelExportExtensions.Contains(chosenExt))
                    {
                        savePath = Path.ChangeExtension(savePath, ext);
                    }

                    File.WriteAllBytes(savePath, modelBytes);
                    _ = webView?.ExecuteScriptAsync(
                        IpcScriptBuilder.BuildShowToastScript($"Exported: {Path.GetFileName(savePath)}")
                    );
                    return true;
                }

                return false;
            }
            catch (Exception ex)
            {
                StepViewerControl.Log($"Failed to export 3D model: {ex.Message}");
                if (ownerWindow != null)
                {
                    MessageBox.Show($"Failed to export 3D model:\n{ex.Message}", "QuickLook STEP Viewer", MessageBoxButton.OK, MessageBoxImage.Error);
                }
                return false;
            }
        }
    }
}
