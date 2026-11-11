using System;
using System.IO;
using System.Text;
using Xunit;
using QuickLook.Plugin.StepViewer;

namespace QuickLook.Plugin.StepViewer.Tests
{
    public class StlMetadataParserTests
    {
        #region Test Fixture Helpers

        /// <summary>
        /// Disposable wrapper for temporary test files. Ensures guaranteed cleanup.
        /// </summary>
        private sealed class DisposableStlTestFile : IDisposable
        {
            public string Path { get; }

            public DisposableStlTestFile(string extension, byte[] bytes)
            {
                Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"stl_test_{Guid.NewGuid():N}{extension}");
                File.WriteAllBytes(Path, bytes);
            }

            public DisposableStlTestFile(string extension, string text, Encoding encoding = null)
            {
                Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"stl_test_{Guid.NewGuid():N}{extension}");
                File.WriteAllText(Path, text, encoding ?? Encoding.UTF8);
            }

            public void Dispose()
            {
                try
                {
                    if (File.Exists(Path))
                        File.Delete(Path);
                }
                catch
                {
                    // Suppress cleanup exceptions in tests
                }
            }
        }

        /// <summary>
        /// Synthesizes valid binary STL bytes conforming to 84 + 50 * triangleCount.
        /// </summary>
        private static byte[] CreateBinaryStlBytes(string headerText, uint triangleCount, bool writeFacets = true)
        {
            long totalLength = 84L + (writeFacets ? ((long)triangleCount * 50L) : 0L);
            byte[] bytes = new byte[(int)totalLength];

            // 80-byte header
            if (!string.IsNullOrEmpty(headerText))
            {
                byte[] textBytes = Encoding.ASCII.GetBytes(headerText);
                int copyLen = Math.Min(textBytes.Length, 80);
                Array.Copy(textBytes, 0, bytes, 0, copyLen);
            }

            // Triangle count at offset 80 (little endian)
            byte[] countBytes = BitConverter.GetBytes(triangleCount);
            Array.Copy(countBytes, 0, bytes, 80, 4);

            // Facet data (50 bytes each)
            if (writeFacets && triangleCount > 0)
            {
                for (int i = 0; i < triangleCount; i++)
                {
                    int offset = 84 + (i * 50);
                    // Normal (0, 0, 1)
                    Array.Copy(BitConverter.GetBytes(0.0f), 0, bytes, offset, 4);
                    Array.Copy(BitConverter.GetBytes(0.0f), 0, bytes, offset + 4, 4);
                    Array.Copy(BitConverter.GetBytes(1.0f), 0, bytes, offset + 8, 4);
                    // V1 (0, 0, 0)
                    Array.Copy(BitConverter.GetBytes(0.0f), 0, bytes, offset + 12, 4);
                    Array.Copy(BitConverter.GetBytes(0.0f), 0, bytes, offset + 16, 4);
                    Array.Copy(BitConverter.GetBytes(0.0f), 0, bytes, offset + 20, 4);
                    // V2 (1, 0, 0)
                    Array.Copy(BitConverter.GetBytes(1.0f), 0, bytes, offset + 24, 4);
                    Array.Copy(BitConverter.GetBytes(0.0f), 0, bytes, offset + 28, 4);
                    Array.Copy(BitConverter.GetBytes(0.0f), 0, bytes, offset + 32, 4);
                    // V3 (0, 1, 0)
                    Array.Copy(BitConverter.GetBytes(0.0f), 0, bytes, offset + 36, 4);
                    Array.Copy(BitConverter.GetBytes(1.0f), 0, bytes, offset + 40, 4);
                    Array.Copy(BitConverter.GetBytes(0.0f), 0, bytes, offset + 44, 4);
                    // Attribute byte count (0)
                    bytes[offset + 48] = 0;
                    bytes[offset + 49] = 0;
                }
            }

            return bytes;
        }

        /// <summary>
        /// Synthesizes valid ASCII STL text string.
        /// </summary>
        private static string CreateAsciiStlString(string solidName, int facetCount = 1)
        {
            var sb = new StringBuilder();
            sb.AppendLine(string.IsNullOrEmpty(solidName) ? "solid" : $"solid {solidName}");
            for (int i = 0; i < facetCount; i++)
            {
                sb.AppendLine("  facet normal 0.000000e+00 0.000000e+00 1.000000e+00");
                sb.AppendLine("    outer loop");
                sb.AppendLine($"      vertex {i}.0 0.0 0.0");
                sb.AppendLine($"      vertex {i + 1}.0 0.0 0.0");
                sb.AppendLine($"      vertex {i}.0 1.0 0.0");
                sb.AppendLine("    endloop");
                sb.AppendLine("  endfacet");
            }
            sb.AppendLine(string.IsNullOrEmpty(solidName) ? "endsolid" : $"endsolid {solidName}");
            return sb.ToString();
        }

        #endregion

        #region Fixture 1: Valid Binary STL (0 triangles, 84 bytes; 1 triangle, 134 bytes)

        [Fact]
        public void IsStlFile_Fixture1_ValidBinaryStl_ReturnsTrue()
        {
            // Case 1a: 0 triangles (84 bytes)
            byte[] bytes0 = CreateBinaryStlBytes("Empty Binary STL", 0);
            Assert.Equal(84, bytes0.Length);
            using (var file0 = new DisposableStlTestFile(".stl", bytes0))
            {
                Assert.True(StepMetadataParser.IsBinaryStlFile(file0.Path, out uint count0, out string header0));
                Assert.Equal(0u, count0);
                Assert.Equal("Empty Binary STL", header0);
                Assert.True(StepMetadataParser.IsStlFile(file0.Path));
                Assert.True(StepMetadataParser.IsValidCadFile(file0.Path));
            }

            // Case 1b: 1 triangle (134 bytes)
            byte[] bytes1 = CreateBinaryStlBytes("Single Triangle Binary STL", 1);
            Assert.Equal(134, bytes1.Length);
            using (var file1 = new DisposableStlTestFile(".stl", bytes1))
            {
                Assert.True(StepMetadataParser.IsBinaryStlFile(file1.Path, out uint count1, out string header1));
                Assert.Equal(1u, count1);
                Assert.Equal("Single Triangle Binary STL", header1);
                Assert.True(StepMetadataParser.IsStlFile(file1.Path));
                Assert.True(StepMetadataParser.IsValidCadFile(file1.Path));
            }
        }

        #endregion

        #region Fixture 2: Binary STL with 'solid' in 80-byte header

        [Fact]
        public void IsStlFile_Fixture2_BinaryStlWithSolidHeader_CorrectlyClassifiedAsBinary()
        {
            // Many CAD tools (SolidWorks, Magics, Blender) write "solid ..." in the 80-byte binary header
            byte[] bytes = CreateBinaryStlBytes("solid /models/part.stl exported by SolidWorks CAD", 1);
            Assert.Equal(134, bytes.Length);

            using (var file = new DisposableStlTestFile(".stl", bytes))
            {
                Assert.True(StepMetadataParser.IsBinaryStlFile(file.Path, out uint count, out string header));
                Assert.Equal(1u, count);
                Assert.StartsWith("solid /models/part.stl", header);

                Assert.True(StepMetadataParser.IsStlFile(file.Path));
                Assert.True(StepMetadataParser.IsValidCadFile(file.Path));

                var meta = StepMetadataParser.ExtractMetadata(file.Path);
                Assert.Equal("STL", meta.Format);
                Assert.Contains("Binary STL", meta.Schema);
                Assert.DoesNotContain("ASCII", meta.Schema);
                Assert.StartsWith("solid /models/part.stl", meta.OriginatingSystem);
            }
        }

        #endregion

        #region Fixture 3: Truncated binary STL

        [Fact]
        public void IsStlFile_Fixture3_TruncatedBinaryStl_ReturnsFalse()
        {
            // Header says 10 triangles (expected 84 + 10 * 50 = 584 bytes), but file is only 100 bytes
            byte[] bytes = new byte[100];
            byte[] header = Encoding.ASCII.GetBytes("Truncated STL Model");
            Array.Copy(header, 0, bytes, 0, header.Length);
            Array.Copy(BitConverter.GetBytes(10u), 0, bytes, 80, 4); // count = 10

            using (var file = new DisposableStlTestFile(".stl", bytes))
            {
                Assert.False(StepMetadataParser.IsBinaryStlFile(file.Path, out _, out _));
                Assert.False(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                Assert.False(StepMetadataParser.IsStlFile(file.Path));
                Assert.False(StepMetadataParser.IsValidCadFile(file.Path));
            }
        }

        #endregion

        #region Fixture 4: uint.MaxValue triangle count (64-bit overflow check)

        [Fact]
        public void IsStlFile_Fixture4_UIntMaxValueTriangleCount_EvaluatesIn64BitWithoutOverflow()
        {
            // 84-byte file with triangle count = uint.MaxValue (4,294,967,295)
            // In 64-bit space, expected = 84L + (4294967295L * 50L) = 214,748,364,834 bytes (~214 GB)
            byte[] bytes = new byte[84];
            Array.Copy(BitConverter.GetBytes(uint.MaxValue), 0, bytes, 80, 4);

            using (var file = new DisposableStlTestFile(".stl", bytes))
            {
                // Must evaluate cleanly without OverflowException
                bool isBinary = StepMetadataParser.IsBinaryStlFile(file.Path, out _, out _);
                Assert.False(isBinary);
                Assert.False(StepMetadataParser.IsStlFile(file.Path));
                Assert.False(StepMetadataParser.IsValidCadFile(file.Path));
            }
        }

        #endregion

        #region Fixture 5: Valid ASCII STL with solid and facet

        [Fact]
        public void IsStlFile_Fixture5_ValidAsciiStl_ReturnsTrue()
        {
            string ascii = CreateAsciiStlString("bracket_mount", 2);
            using (var file = new DisposableStlTestFile(".stl", ascii, Encoding.ASCII))
            {
                Assert.True(StepMetadataParser.IsAsciiStlFile(file.Path, out string solidName));
                Assert.Equal("bracket_mount", solidName);
                Assert.False(StepMetadataParser.IsBinaryStlFile(file.Path, out _, out _));
                Assert.True(StepMetadataParser.IsStlFile(file.Path));
                Assert.True(StepMetadataParser.IsValidCadFile(file.Path));

                var meta = StepMetadataParser.ExtractMetadata(file.Path);
                Assert.Equal("STL", meta.Format);
                Assert.Equal("MILLIMETRE", meta.LengthUnit);
                Assert.Equal("ASCII STL", meta.Schema);
                Assert.Equal("bracket_mount", meta.OriginatingSystem);
            }
        }

        #endregion

        #region Fixture 6: ASCII STL with UTF-8 BOM (\uFEFF)

        [Fact]
        public void IsStlFile_Fixture6_AsciiStlWithUtf8Bom_ReturnsTrue()
        {
            string ascii = CreateAsciiStlString("bom_housing", 1);
            // Write with UTF-8 BOM (0xEF, 0xBB, 0xBF)
            using (var file = new DisposableStlTestFile(".stl", ascii, new UTF8Encoding(true)))
            {
                Assert.True(StepMetadataParser.IsAsciiStlFile(file.Path, out string solidName));
                Assert.Equal("bom_housing", solidName);
                Assert.True(StepMetadataParser.IsStlFile(file.Path));
                Assert.True(StepMetadataParser.IsValidCadFile(file.Path));
            }
        }

        #endregion

        #region Fixture 7: Text file starting with 'solid' without facet/endsolid

        [Fact]
        public void IsStlFile_Fixture7_TextFileStartingWithSolidWithoutFacet_ReturnsFalse()
        {
            string nonStlText = "solid state physics research manuscript draft.\r\nThis document describes semiconductors and lattice vibrations.";
            using (var file = new DisposableStlTestFile(".stl", nonStlText, Encoding.ASCII))
            {
                Assert.False(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                Assert.False(StepMetadataParser.IsBinaryStlFile(file.Path, out _, out _));
                Assert.False(StepMetadataParser.IsStlFile(file.Path));
                Assert.False(StepMetadataParser.IsValidCadFile(file.Path));
            }
        }

        #endregion

        #region Fixture 8: File starting with 'solid' containing binary null bytes

        [Fact]
        public void IsStlFile_Fixture8_FileStartingWithSolidContainingBinaryNulls_ReturnsFalse()
        {
            byte[] bytes = new byte[120];
            byte[] solidPrefix = Encoding.ASCII.GetBytes("solid");
            Array.Copy(solidPrefix, 0, bytes, 0, solidPrefix.Length);
            // Bytes 5..119 contain nulls and arbitrary binary data, not matching 84 + 50*N
            bytes[10] = 0x01;
            bytes[20] = 0xFF;

            using (var file = new DisposableStlTestFile(".stl", bytes))
            {
                Assert.False(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                Assert.False(StepMetadataParser.IsBinaryStlFile(file.Path, out _, out _));
                Assert.False(StepMetadataParser.IsStlFile(file.Path));
                Assert.False(StepMetadataParser.IsValidCadFile(file.Path));
            }
        }

        #endregion

        #region Fixture 9: ExtractMetadata output verification (Format, Schema, LengthUnit, title)

        [Fact]
        public void ExtractMetadata_Fixture9_BinaryAndAsciiStl_ReturnsAccurateMetadata()
        {
            // 9a. Binary STL with 12 facets
            byte[] binBytes = CreateBinaryStlBytes("Robotic Gripper Arm", 12);
            using (var binFile = new DisposableStlTestFile(".stl", binBytes))
            {
                var meta = StepMetadataParser.ExtractMetadata(binFile.Path);
                Assert.NotNull(meta);
                Assert.Equal("STL", meta.Format);
                Assert.Equal("MILLIMETRE", meta.LengthUnit);
                Assert.Equal(84 + (12 * 50), meta.FileSizeBytes);
                Assert.Equal("Binary STL (12 facets)", meta.Schema);
                Assert.Equal("Robotic Gripper Arm", meta.OriginatingSystem);

                string fileName = Path.GetFileName(binFile.Path);
                string title = meta.GetFormattedTitle(fileName);
                Assert.Equal($"{fileName} — [Binary STL (12 facets)] (Robotic Gripper Arm)", title);

                meta.FileName = string.Empty;
                Assert.Equal("gripper.stl — [Binary STL (12 facets)] (Robotic Gripper Arm)", meta.GetFormattedTitle("gripper.stl"));
            }

            // 9b. Binary STL with 0 facets
            byte[] emptyBinBytes = CreateBinaryStlBytes("", 0);
            using (var emptyBinFile = new DisposableStlTestFile(".stl", emptyBinBytes))
            {
                var meta = StepMetadataParser.ExtractMetadata(emptyBinFile.Path);
                Assert.NotNull(meta);
                Assert.Equal("STL", meta.Format);
                Assert.Equal("Binary STL", meta.Schema);
                Assert.Equal("3D Mesh Model", meta.OriginatingSystem);

                string emptyFileName = Path.GetFileName(emptyBinFile.Path);
                string title = meta.GetFormattedTitle(emptyFileName);
                Assert.Equal($"{emptyFileName} — [Binary STL] (3D Mesh Model)", title);

                meta.FileName = string.Empty;
                Assert.Equal("empty.stl — [Binary STL] (3D Mesh Model)", meta.GetFormattedTitle("empty.stl"));
            }

            // 9c. ASCII STL with named solid
            string asciiNamed = CreateAsciiStlString("heat_sink_fin", 1);
            using (var asciiFile = new DisposableStlTestFile(".stl", asciiNamed))
            {
                var meta = StepMetadataParser.ExtractMetadata(asciiFile.Path);
                Assert.NotNull(meta);
                Assert.Equal("STL", meta.Format);
                Assert.Equal("MILLIMETRE", meta.LengthUnit);
                Assert.Equal("ASCII STL", meta.Schema);
                Assert.Equal("heat_sink_fin", meta.OriginatingSystem);

                string asciiFileName = Path.GetFileName(asciiFile.Path);
                string title = meta.GetFormattedTitle(asciiFileName);
                Assert.Equal($"{asciiFileName} — [ASCII STL] (heat_sink_fin)", title);

                meta.FileName = string.Empty;
                Assert.Equal("heatsink.stl — [ASCII STL] (heat_sink_fin)", meta.GetFormattedTitle("heatsink.stl"));
            }

            // 9d. ASCII STL without solid name
            string asciiUnnamed = CreateAsciiStlString("", 1);
            using (var unnamedFile = new DisposableStlTestFile(".stl", asciiUnnamed))
            {
                var meta = StepMetadataParser.ExtractMetadata(unnamedFile.Path);
                Assert.NotNull(meta);
                Assert.Equal("STL", meta.Format);
                Assert.Equal("ASCII STL", meta.Schema);
                Assert.Equal("3D Mesh Model", meta.OriginatingSystem);
            }
        }

        #endregion

        #region Fixture 10: Plugin.CanHandle accepts .stl / .STL, case insensitivity, rejects corrupt files

        [Fact]
        public void PluginCanHandle_Fixture10_StlExtensions_AcceptsCaseInsensitiveAndRejectsCorrupt()
        {
            var plugin = new Plugin();

            byte[] binBytes = CreateBinaryStlBytes("CanHandle Binary Test", 1);
            string asciiText = CreateAsciiStlString("CanHandleAsciiTest", 1);
            byte[] corruptBytes = new byte[50]; // too short for binary, not ASCII

            using (var binFile = new DisposableStlTestFile(".stl", binBytes))
            using (var asciiUpperFile = new DisposableStlTestFile(".STL", asciiText))
            using (var asciiMixedFile = new DisposableStlTestFile(".StL", asciiText))
            using (var corruptFile = new DisposableStlTestFile(".stl", corruptBytes))
            using (var txtFile = new DisposableStlTestFile(".txt", binBytes)) // valid STL content, wrong extension
            {
                // Lowercase .stl accepts valid binary
                Assert.True(plugin.CanHandle(binFile.Path), "Plugin.CanHandle must accept valid .stl file");

                // Uppercase .STL accepts valid ASCII
                Assert.True(plugin.CanHandle(asciiUpperFile.Path), "Plugin.CanHandle must accept uppercase .STL file");

                // Mixed case .StL accepts valid STL
                Assert.True(plugin.CanHandle(asciiMixedFile.Path), "Plugin.CanHandle must accept mixed case .StL file");

                // Corrupted file with .stl extension is rejected
                Assert.False(plugin.CanHandle(corruptFile.Path), "Plugin.CanHandle must reject corrupted file even with .stl extension");

                // Valid STL content with unsupported extension (.txt) is rejected
                Assert.False(plugin.CanHandle(txtFile.Path), "Plugin.CanHandle must reject unsupported extension .txt");

                // Non-existent path returns false
                Assert.False(plugin.CanHandle(@"C:\non_existent_folder_xyz_12345\part.stl"));

                // Null, empty, and whitespace return false
                Assert.False(plugin.CanHandle(null));
                Assert.False(plugin.CanHandle(""));
                Assert.False(plugin.CanHandle("   "));

                // Directory ending in .stl returns false
                string tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"dir_{Guid.NewGuid():N}.stl");
                Directory.CreateDirectory(tempDir);
                try
                {
                    Assert.False(plugin.CanHandle(tempDir), "Plugin.CanHandle must return false for directories ending in .stl");
                }
                finally
                {
                    if (Directory.Exists(tempDir))
                        Directory.Delete(tempDir, true);
                }
            }
        }

        #endregion
    }
}
