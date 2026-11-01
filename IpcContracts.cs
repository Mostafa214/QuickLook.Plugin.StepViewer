using System;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace QuickLook.Plugin.StepViewer
{
    /// <summary>
    /// Centralized JSON serialization options and policies for WebView2 IPC communications.
    /// Configured for RFC 8259 compliance, case-insensitivity, and secure character escaping.
    /// </summary>
    public static class IpcJsonOptions
    {
        public static readonly JsonSerializerOptions Default = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Encoder = JavaScriptEncoder.Default,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            NumberHandling = JsonNumberHandling.AllowReadingFromString,
            WriteIndented = false
        };
    }

    #region Inbound IPC DTOs (JavaScript -> C# Host)

    /// <summary>
    /// Base class for all messages received from the WebView2 JavaScript environment.
    /// Supports both 'type' and 'action' discriminator fields sent by viewer.html.
    /// </summary>
    public class InboundMessageBase
    {
        [JsonPropertyName("type")]
        public string Type { get; set; }

        [JsonPropertyName("action")]
        public string Action { get; set; }

        [JsonIgnore]
        public string MessageType => !string.IsNullOrEmpty(Type) ? Type : Action;
    }

    /// <summary>
    /// Sent by viewer.html:2792 when Three.js scene, controls, and worker are ready.
    /// Payload: { type: 'VIEWPORT_READY' }
    /// </summary>
    public sealed class ViewportReadyMessage : InboundMessageBase
    {
    }

    /// <summary>
    /// Sent by viewer.html:3389-3394 when CAD model tessellation and rendering complete.
    /// Payload: { type: 'LOADED', meshCount, triangles, elapsedMs }
    /// </summary>
    public sealed class ModelLoadedMessage : InboundMessageBase
    {
        [JsonPropertyName("meshCount")]
        public int MeshCount { get; set; }

        [JsonPropertyName("triangles")]
        public long Triangles { get; set; }

        [JsonPropertyName("elapsedMs")]
        public double ElapsedMs { get; set; }
    }

    /// <summary>
    /// Sent by viewer.html:8403 when an error occurs during model loading or parsing.
    /// Payload: { type: 'ERROR', message: string }
    /// </summary>
    public sealed class ModelErrorMessage : InboundMessageBase
    {
        [JsonPropertyName("message")]
        public string Message { get; set; }
    }

    /// <summary>
    /// Sent by viewer.html:6130-6136 when requesting the host to save a snapshot image.
    /// Payload: { type: 'SAVE_SNAPSHOT', action: 'SAVE_SNAPSHOT', data, defaultName, targetPath }
    /// </summary>
    public sealed class SaveSnapshotMessage : InboundMessageBase
    {
        [JsonPropertyName("data")]
        public string Data { get; set; }

        [JsonPropertyName("defaultName")]
        public string DefaultName { get; set; }

        [JsonPropertyName("targetPath")]
        public string TargetPath { get; set; }
    }

    /// <summary>
    /// Sent by viewer.html:6106-6110 when requesting native Windows Clipboard copy.
    /// Payload: { type: 'COPY_SNAPSHOT_CLIPBOARD', action: 'COPY_SNAPSHOT_CLIPBOARD', data }
    /// </summary>
    public sealed class CopySnapshotMessage : InboundMessageBase
    {
        [JsonPropertyName("data")]
        public string Data { get; set; }
    }

    /// <summary>
    /// Sent by viewer.html:2526-2530 when requesting the host to download an auto-update package.
    /// Payload: { action: 'START_UPDATE_DOWNLOAD', downloadUrl, version }
    /// </summary>
    public class StartUpdateDownloadMessage : InboundMessageBase
    {
        [JsonPropertyName("downloadUrl")]
        public string DownloadUrl { get; set; }

        [JsonPropertyName("version")]
        public string Version { get; set; }
    }

    /// <summary>
    /// Alias for updater download request.
    /// </summary>
    public sealed class UpdateDownloadRequest : StartUpdateDownloadMessage
    {
    }

    /// <summary>
    /// Sent by viewer.html:2546-2548 when requesting the host to restart and apply updates.
    /// Payload: { action: 'APPLY_UPDATE_AND_RESTART' }
    /// </summary>
    public class ApplyUpdateRestartMessage : InboundMessageBase
    {
    }

    /// <summary>
    /// Alias for updater restart request.
    /// </summary>
    public sealed class UpdateRestartRequest : ApplyUpdateRestartMessage
    {
    }

    /// <summary>
    /// Updater error notification DTO.
    /// </summary>
    public sealed class UpdateErrorMessage
    {
        [JsonPropertyName("action")]
        public string Action { get; set; } = "UPDATE_ERROR";

        [JsonPropertyName("error")]
        public string Error { get; set; }
    }

    /// <summary>
    /// Catch-all DTO for unknown or unhandled messages.
    /// </summary>
    public sealed class UnknownInboundMessage : InboundMessageBase
    {
        public string RawJson { get; set; }
    }

    #endregion

    #region Outbound IPC DTOs (C# Host -> JavaScript)

    /// <summary>
    /// Dispatched via PostWebMessageAsJson to instruct Three.js to fetch and tessellate a CAD file.
    /// Handled by viewer.html:8422 (msg.action === 'LOAD_URL').
    /// </summary>
    public sealed class LoadModelCommand
    {
        [JsonPropertyName("action")]
        public string Action { get; set; } = "LOAD_URL";

        [JsonPropertyName("url")]
        public string Url { get; set; }

        [JsonPropertyName("fileName")]
        public string FileName { get; set; }
    }

    /// <summary>
    /// Dispatched via PostWebMessageAsJson for parameterless viewport lifecycle actions.
    /// Handled by viewer.html:8435, 8449, 8451 ('CANCEL', 'DISPOSE', 'RESET_VIEW', 'TOGGLE_WIREFRAME').
    /// </summary>
    public sealed class ViewportActionCommand
    {
        [JsonPropertyName("action")]
        public string Action { get; set; }

        public static ViewportActionCommand Cancel => new ViewportActionCommand { Action = "CANCEL" };
        public static ViewportActionCommand Dispose => new ViewportActionCommand { Action = "DISPOSE" };
        public static ViewportActionCommand ResetView => new ViewportActionCommand { Action = "RESET_VIEW" };
        public static ViewportActionCommand ToggleWireframe => new ViewportActionCommand { Action = "TOGGLE_WIREFRAME" };
    }

    #endregion

    #region IPC Message Parser & Safe Script Helpers

    /// <summary>
    /// Robust, non-regex JSON message parser for incoming WebView2 payloads.
    /// </summary>
    public static class IpcMessageParser
    {
        public static InboundMessageBase Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return null;

            try
            {
                using (var doc = JsonDocument.Parse(json))
                {
                    var root = doc.RootElement;
                    if (root.ValueKind != JsonValueKind.Object)
                        return null;

                    string discriminator = null;

                    if (root.TryGetProperty("type", out var typeProp) && typeProp.ValueKind == JsonValueKind.String)
                    {
                        discriminator = typeProp.GetString();
                    }
                    if (string.IsNullOrEmpty(discriminator) && root.TryGetProperty("action", out var actionProp) && actionProp.ValueKind == JsonValueKind.String)
                    {
                        discriminator = actionProp.GetString();
                    }

                    if (string.IsNullOrEmpty(discriminator))
                        return null;

                    switch (discriminator.ToUpperInvariant())
                    {
                        case "VIEWPORT_READY":
                            return JsonSerializer.Deserialize<ViewportReadyMessage>(json, IpcJsonOptions.Default);

                        case "LOADED":
                        case "MODEL_LOADED":
                            return JsonSerializer.Deserialize<ModelLoadedMessage>(json, IpcJsonOptions.Default);

                        case "ERROR":
                        case "MODEL_ERROR":
                            return JsonSerializer.Deserialize<ModelErrorMessage>(json, IpcJsonOptions.Default);

                        case "SAVE_SNAPSHOT":
                            return JsonSerializer.Deserialize<SaveSnapshotMessage>(json, IpcJsonOptions.Default);

                        case "COPY_SNAPSHOT_CLIPBOARD":
                            return JsonSerializer.Deserialize<CopySnapshotMessage>(json, IpcJsonOptions.Default);

                        case "START_UPDATE_DOWNLOAD":
                        case "PERFORM_AUTO_UPDATE":
                            return JsonSerializer.Deserialize<StartUpdateDownloadMessage>(json, IpcJsonOptions.Default);

                        case "APPLY_UPDATE_AND_RESTART":
                            return JsonSerializer.Deserialize<ApplyUpdateRestartMessage>(json, IpcJsonOptions.Default);

                        default:
                            return new UnknownInboundMessage { RawJson = json, Type = discriminator };
                    }
                }
            }
            catch (Exception ex) when (ex is JsonException || ex is InvalidOperationException)
            {
                return null;
            }
        }
    }

    /// <summary>
    /// Constructs injection-proof JavaScript calls for functions defined in viewer.html.
    /// All dynamic string arguments are serialized via System.Text.Json, completely preventing XSS/injection.
    /// </summary>
    public static class IpcScriptBuilder
    {
        public static string BuildShowToastScript(string message)
        {
            string safeJson = JsonSerializer.Serialize(message ?? string.Empty, IpcJsonOptions.Default);
            return $"if (typeof showToast === 'function') showToast({safeJson});";
        }

        public static string BuildUpdateProgressScript(int percent, long receivedBytes, long totalBytes)
        {
            return $"if (typeof window.onUpdateDownloadProgress === 'function') window.onUpdateDownloadProgress({percent}, {receivedBytes}, {totalBytes});";
        }

        public const string UpdateCompletedScript = "if (typeof window.onUpdateDownloadCompleted === 'function') window.onUpdateDownloadCompleted();";

        public static string BuildUpdateErrorScript(string errorMsg)
        {
            string safeJson = JsonSerializer.Serialize(errorMsg ?? "Unknown update error", IpcJsonOptions.Default);
            return $"if (typeof window.onUpdateError === 'function') window.onUpdateError({safeJson});";
        }
    }

    #endregion
}
