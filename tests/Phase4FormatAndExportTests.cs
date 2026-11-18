using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using Xunit;

namespace QuickLook.Plugin.StepViewer.Tests
{
    public class Phase4FormatAndExportTests : IDisposable
    {
        private readonly string _tempDir;

        public Phase4FormatAndExportTests()
        {
            _tempDir = Path.Combine(Path.GetTempPath(), "StepViewer_Phase4Tests_" + Guid.NewGuid().ToString("N"));
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

        [Fact]
        public void ThreeMfValidator_AcceptsValid3mf_AndRejectsPlainZip()
        {
            string valid3mf = Path.Combine(_tempDir, "part.3mf");
            using (var fs = File.Create(valid3mf))
            using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
            {
                var entry = zip.CreateEntry("3D/3dmodel.model");
                using (var sw = new StreamWriter(entry.Open(), Encoding.UTF8))
                    sw.Write("<model unit=\"millimeter\"><resources/></model>");
            }

            string fake3mf = Path.Combine(_tempDir, "not_a_model.3mf");
            using (var fs = File.Create(fake3mf))
            using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
            {
                var entry = zip.CreateEntry("readme.txt");
                using (var sw = new StreamWriter(entry.Open(), Encoding.UTF8))
                    sw.Write("hello");
            }

            Assert.True(StepMetadataParser.Is3mfFile(valid3mf));
            Assert.True(StepMetadataParser.IsValidCadFile(valid3mf));
            Assert.Equal("3MF", StepMetadataParser.ExtractMetadata(valid3mf).Format);

            Assert.False(StepMetadataParser.Is3mfFile(fake3mf));
            Assert.False(new Plugin().CanHandle(fake3mf));
        }

        [Fact]
        public void GlbAndGltfValidators_ValidateHeadersAccurately()
        {
            string validGlb = Path.Combine(_tempDir, "box.glb");
            byte[] glb = new byte[12];
            glb[0] = 0x67; glb[1] = 0x6C; glb[2] = 0x54; glb[3] = 0x46; // glTF
            glb[4] = 2; // version 2
            glb[8] = 12; // totalLength 12
            File.WriteAllBytes(validGlb, glb);

            string badGlb = Path.Combine(_tempDir, "bad.glb");
            byte[] glbV1 = new byte[12];
            glbV1[0] = 0x67; glbV1[1] = 0x6C; glbV1[2] = 0x54; glbV1[3] = 0x46;
            glbV1[4] = 1; // unsupported version 1
            glbV1[8] = 12;
            File.WriteAllBytes(badGlb, glbV1);

            string validGltf = Path.Combine(_tempDir, "scene.gltf");
            File.WriteAllText(validGltf, "{\"asset\":{\"version\":\"2.0\"},\"scenes\":[]}", Encoding.UTF8);

            Assert.True(StepMetadataParser.IsGlbFile(validGlb));
            Assert.Equal("GLB", StepMetadataParser.ExtractMetadata(validGlb).Format);
            Assert.False(StepMetadataParser.IsGlbFile(badGlb));

            Assert.True(StepMetadataParser.IsGltfFile(validGltf));
            Assert.Equal("GLTF", StepMetadataParser.ExtractMetadata(validGltf).Format);
        }

        [Fact]
        public void PlyAndObjValidators_ValidateTextAndRejectBinaryGarbage()
        {
            string validPly = Path.Combine(_tempDir, "mesh.ply");
            File.WriteAllText(validPly, "ply\nformat ascii 1.0\nelement vertex 3\nend_header\n", Encoding.ASCII);

            string validObj = Path.Combine(_tempDir, "cube.obj");
            File.WriteAllText(validObj, "# Wavefront OBJ\no Cube\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n", Encoding.UTF8);

            string shellObj = Path.Combine(_tempDir, "script.obj");
            File.WriteAllText(shellObj, "#!/bin/bash\necho hello\n", Encoding.UTF8);

            string binObj = Path.Combine(_tempDir, "binary.obj");
            File.WriteAllBytes(binObj, new byte[] { (byte)'v', (byte)' ', 0, 1, 2, 3 });

            Assert.True(StepMetadataParser.IsPlyFile(validPly));
            Assert.Equal("PLY", StepMetadataParser.ExtractMetadata(validPly).Format);

            Assert.True(StepMetadataParser.IsObjFile(validObj));
            Assert.Equal("OBJ", StepMetadataParser.ExtractMetadata(validObj).Format);

            Assert.False(StepMetadataParser.IsObjFile(shellObj));
            Assert.False(StepMetadataParser.IsObjFile(binObj));
        }

        [Fact]
        public void PluginCanHandle_RecognizesAllPhase4Extensions()
        {
            var plugin = new Plugin();

            string obj = Path.Combine(_tempDir, "part.obj");
            File.WriteAllText(obj, "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
            Assert.True(plugin.CanHandle(obj));

            string ply = Path.Combine(_tempDir, "part.ply");
            File.WriteAllText(ply, "ply\nformat binary_little_endian 1.0\nend_header\n");
            Assert.True(plugin.CanHandle(ply));

            string gltf = Path.Combine(_tempDir, "part.gltf");
            File.WriteAllText(gltf, "{\"asset\":{\"version\":\"2.0\"}}");
            Assert.True(plugin.CanHandle(gltf));
        }

        [Fact]
        public void ExportModelMessage_AndSecurityValidation_WorkAsExpected()
        {
            string json = "{\"type\":\"EXPORT_MODEL\",\"format\":\"stl\",\"defaultName\":\"gear.stl\",\"data\":\"ZGF0YQ==\"}";
            var parsed = IpcMessageParser.Parse(json) as ExportModelMessage;
            Assert.NotNull(parsed);
            Assert.Equal("stl", parsed.Format);
            Assert.Equal("gear.stl", parsed.DefaultName);

            Assert.True(SnapshotExportService.TryValidateModelExportTargetPath(@"C:\Exports\gear.stl", out _));
            Assert.True(SnapshotExportService.TryValidateModelExportTargetPath(@"C:\Exports\gear.obj", out _));
            Assert.True(SnapshotExportService.TryValidateModelExportTargetPath(@"C:\Exports\gear.glb", out _));
            Assert.False(SnapshotExportService.TryValidateModelExportTargetPath(@"C:\Exports\..\evil.stl", out _));
            Assert.False(SnapshotExportService.TryValidateModelExportTargetPath(@"C:\Exports\payload.exe.glb", out _));
            Assert.False(SnapshotExportService.TryValidateModelExportTargetPath(@"C:\Exports\payload.exe", out _));

            // Binary STL header + 1 triangle (84 + 50 = 134 bytes)
            byte[] binStl = new byte[134];
            binStl[80] = 1;
            Assert.True(SnapshotExportService.IsValidModelExportPayload("stl", binStl));
            Assert.False(SnapshotExportService.IsValidModelExportPayload("stl", new byte[100]));

            // Export write + SEC-02 no-overwrite check
            string outPath = Path.Combine(_tempDir, "exported.stl");
            var msg = new ExportModelMessage
            {
                Format = "stl",
                Data = Convert.ToBase64String(binStl),
                TargetPath = outPath
            };
            Assert.True(SnapshotExportService.HandleExportModel(msg));
            Assert.True(File.Exists(outPath));
            Assert.False(SnapshotExportService.HandleExportModel(msg)); // SEC-02: must not overwrite
        }
    }
}
