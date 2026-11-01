using System;
using System.Text.Json;
using Xunit;
using QuickLook.Plugin.StepViewer;

namespace QuickLook.Plugin.StepViewer.Tests
{
    public class IpcContractsTests
    {
        [Fact]
        public void Parse_ViewportReady_ReturnsCorrectType()
        {
            string json = "{\"type\":\"VIEWPORT_READY\"}";
            var msg = IpcMessageParser.Parse(json);
            Assert.NotNull(msg);
            Assert.IsType<ViewportReadyMessage>(msg);
            Assert.Equal("VIEWPORT_READY", msg.Type);
        }

        [Fact]
        public void Parse_ModelLoaded_ReturnsCorrectType()
        {
            string json = "{\"type\":\"MODEL_LOADED\"}";
            var msg = IpcMessageParser.Parse(json);
            Assert.NotNull(msg);
            Assert.IsType<ModelLoadedMessage>(msg);
        }

        [Fact]
        public void Parse_ModelError_ReturnsMessageWithDetails()
        {
            string json = "{\"type\":\"MODEL_ERROR\",\"message\":\"Tessellation failed: memory limit\"}";
            var msg = IpcMessageParser.Parse(json) as ModelErrorMessage;
            Assert.NotNull(msg);
            Assert.Equal("Tessellation failed: memory limit", msg.Message);
        }

        [Fact]
        public void Parse_SaveSnapshot_ExtractsFields()
        {
            string json = "{\"type\":\"SAVE_SNAPSHOT\",\"data\":\"data:image/png;base64,iVBORw0KGgo=\",\"defaultName\":\"snap.png\",\"targetPath\":\"C:\\\\out\\\\img.png\"}";
            var msg = IpcMessageParser.Parse(json) as SaveSnapshotMessage;
            Assert.NotNull(msg);
            Assert.Equal("snap.png", msg.DefaultName);
            Assert.Equal(@"C:\out\img.png", msg.TargetPath);
        }

        [Fact]
        public void Parse_StartUpdateDownload_ExtractsUrlAndVersion()
        {
            string json = "{\"type\":\"START_UPDATE_DOWNLOAD\",\"downloadUrl\":\"https://github.com/Mostafa214/QuickLook.Plugin.StepViewer/releases/download/v1.1.0/package.qlplugin\",\"version\":\"v1.1.0\"}";
            var msg = IpcMessageParser.Parse(json) as StartUpdateDownloadMessage;
            Assert.NotNull(msg);
            Assert.Equal("v1.1.0", msg.Version);
            Assert.Contains("v1.1.0/package.qlplugin", msg.DownloadUrl);
        }

        [Theory]
        [InlineData("[1, 2, 3]")]
        [InlineData("\"scalar string\"")]
        [InlineData("12345")]
        [InlineData("true")]
        [InlineData("false")]
        [InlineData("null")]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData(null)]
        public void Parse_NonObjectJson_ReturnsNullOrUnknownWithoutThrowing(string payload)
        {
            var result = IpcMessageParser.Parse(payload);
            Assert.True(result == null || result is UnknownInboundMessage);
        }

        [Fact]
        public void Parse_UnknownType_ReturnsUnknownInboundMessage()
        {
            string json = "{\"type\":\"SOME_FUTURE_TYPE\",\"custom\":123}";
            var result = IpcMessageParser.Parse(json);
            Assert.NotNull(result);
            Assert.IsType<UnknownInboundMessage>(result);
        }

        [Fact]
        public void IpcScriptBuilder_ToastScript_EscapesQuotesAndNewlinesProperly()
        {
            string message = "Saved \"file's name\"\nNewline\r\nDone!";
            string script = IpcScriptBuilder.BuildShowToastScript(message);
            Assert.Contains("showToast", script);
            // Verify script has no raw unescaped newlines that would cause JS syntax errors
            Assert.DoesNotContain("\r", script);
            Assert.DoesNotContain("\n", script);
        }

        [Fact]
        public void CommandSerialization_LoadModelCommand_ProducesValidJson()
        {
            var cmd = new LoadModelCommand
            {
                Action = "LOAD_URL",
                Url = "https://cad-stream.local/cad-file",
                FileName = "test.step"
            };
            string json = JsonSerializer.Serialize(cmd, IpcJsonOptions.Default);
            Assert.Contains("\"action\":\"LOAD_URL\"", json);
            Assert.Contains("\"fileName\":\"test.step\"", json);
        }
    }
}
