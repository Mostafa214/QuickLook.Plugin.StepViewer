using System;
using System.IO;
using Xunit;

namespace QuickLook.Plugin.StepViewer.Tests
{
    public class Phase6SolidWorksTests : IDisposable
    {
        private readonly string _tempDir;

        public Phase6SolidWorksTests()
        {
            _tempDir = Path.Combine(Path.GetTempPath(), "StepViewer_Phase6Tests_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_tempDir);
        }

        public void Dispose()
        {
            try
            {
                if (Directory.Exists(_tempDir))
                    Directory.Delete(_tempDir, true);
            }
            catch { }
        }

        private static byte[] CreateSyntheticGen2Bytes(int totalLength = 128, int markerOffset = 32, bool includeMarker = true, byte versionByte = 0x04)
        {
            byte[] data = new byte[totalLength];
            if (totalLength >= 8)
            {
                data[4] = 0x00;
                data[5] = 0x00;
                data[6] = 0x00;
                data[7] = versionByte;
            }
            if (includeMarker && markerOffset >= 0 && markerOffset + 6 <= totalLength)
            {
                data[markerOffset + 0] = 0x14;
                data[markerOffset + 1] = 0x00;
                data[markerOffset + 2] = 0x06;
                data[markerOffset + 3] = 0x00;
                data[markerOffset + 4] = 0x08;
                data[markerOffset + 5] = 0x00;
            }
            return data;
        }

        private static byte[] CreateSyntheticOle2Bytes(int totalLength = 64)
        {
            byte[] data = new byte[totalLength];
            byte[] magic = { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 };
            Array.Copy(magic, data, magic.Length);
            return data;
        }

        [Fact]
        public void IsSolidWorksFile_AcceptsSyntheticGen2_AndRejectsMalformed()
        {
            string gen2Part = Path.Combine(_tempDir, "housing.sldprt");
            File.WriteAllBytes(gen2Part, CreateSyntheticGen2Bytes());

            string gen2Asm = Path.Combine(_tempDir, "assembly.sldasm");
            File.WriteAllBytes(gen2Asm, CreateSyntheticGen2Bytes(totalLength: 4096, markerOffset: 2048));

            string tooShort = Path.Combine(_tempDir, "short.sldprt");
            File.WriteAllBytes(tooShort, CreateSyntheticGen2Bytes(totalLength: 48, markerOffset: 16));

            string noMarker = Path.Combine(_tempDir, "nomarker.sldprt");
            File.WriteAllBytes(noMarker, CreateSyntheticGen2Bytes(includeMarker: false));

            string badVersion = Path.Combine(_tempDir, "badver.sldprt");
            File.WriteAllBytes(badVersion, CreateSyntheticGen2Bytes(versionByte: 0x03));

            Assert.True(StepMetadataParser.IsSolidWorksFile(gen2Part));
            Assert.True(StepMetadataParser.IsValidCadFile(gen2Part));
            Assert.True(StepMetadataParser.IsSolidWorksFile(gen2Asm));
            Assert.False(StepMetadataParser.IsSolidWorksFile(tooShort));
            Assert.False(StepMetadataParser.IsSolidWorksFile(noMarker));
            Assert.False(StepMetadataParser.IsSolidWorksFile(badVersion));
        }

        [Fact]
        public void IsSolidWorksFile_AcceptsSyntheticOle2_OnlyForSolidWorksExtensions()
        {
            string olePart = Path.Combine(_tempDir, "legacy.SLDPRT");
            File.WriteAllBytes(olePart, CreateSyntheticOle2Bytes());

            string oleAsm = Path.Combine(_tempDir, "legacy_asm.SLDASM");
            File.WriteAllBytes(oleAsm, CreateSyntheticOle2Bytes());

            string oleDoc = Path.Combine(_tempDir, "document.doc");
            File.WriteAllBytes(oleDoc, CreateSyntheticOle2Bytes());

            Assert.True(StepMetadataParser.IsSolidWorksFile(olePart));
            Assert.True(StepMetadataParser.IsSolidWorksFile(oleAsm));
            Assert.False(StepMetadataParser.IsSolidWorksFile(oleDoc));
        }

        [Fact]
        public void IsSolidWorksFile_ValidatesRealSamplesIfPresent()
        {
            string samplesDir = Path.Combine(Path.GetTempPath(), "sw_real_samples");
            if (!Directory.Exists(samplesDir))
                return;

            var swFiles = Directory.GetFiles(samplesDir, "*.sld*", SearchOption.AllDirectories);
            foreach (string file in swFiles)
            {
                string ext = Path.GetExtension(file);
                if (string.Equals(ext, ".sldprt", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(ext, ".sldasm", StringComparison.OrdinalIgnoreCase))
                {
                    Assert.True(StepMetadataParser.IsSolidWorksFile(file), $"Expected real sample to be valid SolidWorks file: {file}");
                    Assert.True(new Plugin().CanHandle(file), $"Expected Plugin.CanHandle to accept real sample: {file}");
                }
            }
        }

        [Fact]
        public void ExtractMetadata_PopulatesSolidWorksPartAndAssemblyFields()
        {
            string partPath = Path.Combine(_tempDir, "bracket.sldprt");
            File.WriteAllBytes(partPath, CreateSyntheticGen2Bytes());

            string asmPath = Path.Combine(_tempDir, "gearbox.sldasm");
            File.WriteAllBytes(asmPath, CreateSyntheticOle2Bytes());

            var partMeta = StepMetadataParser.ExtractMetadata(partPath);
            Assert.Equal("SLDPRT", partMeta.Format);
            Assert.Equal("SolidWorks Part", partMeta.Schema);
            Assert.Equal("Dassault Systèmes SolidWorks", partMeta.OriginatingSystem);
            Assert.Equal("METRE", partMeta.LengthUnit);

            var asmMeta = StepMetadataParser.ExtractMetadata(asmPath);
            Assert.Equal("SLDASM", asmMeta.Format);
            Assert.Equal("SolidWorks Assembly", asmMeta.Schema);
            Assert.Equal("Dassault Systèmes SolidWorks", asmMeta.OriginatingSystem);
            Assert.Equal("METRE", asmMeta.LengthUnit);
        }

        [Fact]
        public void PluginCanHandle_RecognizesSolidWorksAndRejectsInvalidHeaders()
        {
            var plugin = new Plugin();

            string validPart = Path.Combine(_tempDir, "part.sldprt");
            File.WriteAllBytes(validPart, CreateSyntheticGen2Bytes());

            string validAsm = Path.Combine(_tempDir, "asm.sldasm");
            File.WriteAllBytes(validAsm, CreateSyntheticOle2Bytes());

            string invalidPart = Path.Combine(_tempDir, "fake.sldprt");
            File.WriteAllText(invalidPart, "not a solidworks file");

            Assert.True(plugin.CanHandle(validPart));
            Assert.True(plugin.CanHandle(validAsm));
            Assert.False(plugin.CanHandle(invalidPart));
        }

        [Fact]
        public void TryResolveSiblingCadPath_EnforcesDirectoryConfinementAndExtensionWhitelist()
        {
            string baseAsm = Path.Combine(_tempDir, "MainAssembly.sldasm");

            // Valid direct sibling
            Assert.True(WebViewEnvironmentManager.TryResolveSiblingCadPath(baseAsm, "Bracket.sldprt", out string resolvedSibling));
            Assert.Equal(Path.GetFullPath(Path.Combine(_tempDir, "Bracket.sldprt")), resolvedSibling);

            // Valid subdirectory sibling
            Assert.True(WebViewEnvironmentManager.TryResolveSiblingCadPath(baseAsm, "SW/SubPart.SLDASM", out string resolvedSub));
            Assert.Equal(Path.GetFullPath(Path.Combine(_tempDir, "SW", "SubPart.SLDASM")), resolvedSub);

            // Path traversal rejected
            Assert.False(WebViewEnvironmentManager.TryResolveSiblingCadPath(baseAsm, "../outside.sldprt", out _));
            Assert.False(WebViewEnvironmentManager.TryResolveSiblingCadPath(baseAsm, "SW/../../outside.sldprt", out _));

            // Drive letter and UNC paths rejected
            Assert.False(WebViewEnvironmentManager.TryResolveSiblingCadPath(baseAsm, @"C:\temp\part.sldprt", out _));
            Assert.False(WebViewEnvironmentManager.TryResolveSiblingCadPath(baseAsm, @"\\server\share\part.sldprt", out _));

            // Disallowed extensions rejected
            Assert.False(WebViewEnvironmentManager.TryResolveSiblingCadPath(baseAsm, "payload.exe", out _));
            Assert.False(WebViewEnvironmentManager.TryResolveSiblingCadPath(baseAsm, "model.step", out _));
            Assert.False(WebViewEnvironmentManager.TryResolveSiblingCadPath(baseAsm, "", out _));
        }
    }
}
