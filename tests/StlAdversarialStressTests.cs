using System;
using System.IO;
using System.Text;
using Xunit;
using QuickLook.Plugin.StepViewer;

namespace QuickLook.Plugin.StepViewer.Tests
{
    /// <summary>
    /// Empirical Adversarial Stress Test Suite for Milestone 1 STL Header Validation.
    /// Probes UTF-8 BOM, varied line endings (\r\n, \n, \r), whitespace variations,
    /// non-CAD rejection, null byte boundaries, minimal ASCII STLs, and Plugin.CanHandle.
    /// </summary>
    public class StlAdversarialStressTests
    {
        private sealed class TempStlFile : IDisposable
        {
            public string Path { get; }

            public TempStlFile(string extension, byte[] bytes)
            {
                Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"adv_stl_{Guid.NewGuid():N}{extension}");
                File.WriteAllBytes(Path, bytes);
            }

            public TempStlFile(string extension, string text, Encoding encoding = null)
            {
                Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"adv_stl_{Guid.NewGuid():N}{extension}");
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
                    // Suppress cleanup errors
                }
            }
        }

        #region Probe 1: BOM, Line Endings (\r\n, \n, \r), and Leading Whitespace

        [Fact]
        public void Probe1_1_AsciiStl_WithUtf8Bom_AndCrLf_ReturnsTrue()
        {
            string content = "solid bom_crlf\r\n  facet normal 0 0 1\r\n    outer loop\r\n      vertex 0 0 0\r\n      vertex 1 0 0\r\n      vertex 0 1 0\r\n    endloop\r\n  endfacet\r\nendsolid bom_crlf\r\n";
            using (var file = new TempStlFile(".stl", content, new UTF8Encoding(true)))
            {
                Assert.True(StepMetadataParser.IsAsciiStlFile(file.Path, out string solidName));
                Assert.Equal("bom_crlf", solidName);
                Assert.True(StepMetadataParser.IsStlFile(file.Path));
            }
        }

        [Fact]
        public void Probe1_2_AsciiStl_WithUtf8Bom_AndLfOnly_ReturnsTrue()
        {
            string content = "solid bom_lf\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 1 0 0\n      vertex 0 1 0\n    endloop\n  endfacet\nendsolid bom_lf\n";
            using (var file = new TempStlFile(".stl", content, new UTF8Encoding(true)))
            {
                Assert.True(StepMetadataParser.IsAsciiStlFile(file.Path, out string solidName));
                Assert.Equal("bom_lf", solidName);
                Assert.True(StepMetadataParser.IsStlFile(file.Path));
            }
        }

        [Fact]
        public void Probe1_3_AsciiStl_WithUtf8Bom_AndCrOnly_ReturnsTrue()
        {
            string content = "solid bom_cr\r  facet normal 0 0 1\r    outer loop\r      vertex 0 0 0\r      vertex 1 0 0\r      vertex 0 1 0\r    endloop\r  endfacet\rendsolid bom_cr\r";
            using (var file = new TempStlFile(".stl", content, new UTF8Encoding(true)))
            {
                Assert.True(StepMetadataParser.IsAsciiStlFile(file.Path, out string solidName));
                Assert.Equal("bom_cr", solidName);
                Assert.True(StepMetadataParser.IsStlFile(file.Path));
            }
        }

        [Fact]
        public void Probe1_4_AsciiStl_MixedLeadingWhitespace_BeforeSolid_ReturnsTrue()
        {
            string content = "\t\t   \r\n \t  solid ws_model\r\n  facet normal 0 0 1\r\n  endfacet\r\nendsolid ws_model\r\n";
            using (var file = new TempStlFile(".stl", content, Encoding.UTF8))
            {
                Assert.True(StepMetadataParser.IsAsciiStlFile(file.Path, out string solidName));
                Assert.Equal("ws_model", solidName);
                Assert.True(StepMetadataParser.IsStlFile(file.Path));
            }
        }

        [Fact]
        public void Probe1_5_AsciiStl_CaseInsensitivity_SolidVariants()
        {
            string[] headers = new[] { "SOLID upper\r\nendsolid upper\r\n", "SoLiD mixed\nendsolid mixed\n", "solid lower\rendsolid lower\r" };
            foreach (var h in headers)
            {
                using (var file = new TempStlFile(".stl", h, Encoding.UTF8))
                {
                    Assert.True(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                }
            }
        }

        #endregion

        #region Probe 2: Non-CAD Text Files Starting with "solid"

        [Theory]
        [InlineData("solidarity forever\r\nfor the union makes us strong.\r\nIn our hands is placed a power greater than their hoarded gold.")]
        [InlineData("solid state storage devices have revolutionized computing systems.")]
        [InlineData("solidity contract TokenVault {\r\n  mapping(address => uint256) public balances;\r\n}")]
        [InlineData("solidworks assembly project file notes and metadata logs.")]
        [InlineData("solidly built wooden table with six mahogany chairs.")]
        [InlineData("solid-state drive (SSD) technical specifications and datasheets.")]
        [InlineData("solid as a mountain, unyielding to the stormy winds of winter.")]
        public void Probe2_NonCadTextFiles_StartingWithSolid_AreRejected(string nonCadText)
        {
            using (var file = new TempStlFile(".stl", nonCadText, Encoding.UTF8))
            {
                Assert.False(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                Assert.False(StepMetadataParser.IsBinaryStlFile(file.Path, out _, out _));
                Assert.False(StepMetadataParser.IsStlFile(file.Path));
                Assert.False(StepMetadataParser.IsValidCadFile(file.Path));

                var plugin = new Plugin();
                Assert.False(plugin.CanHandle(file.Path));
            }
        }

        #endregion

        #region Probe 3: Null Bytes (0x00) Rejection within 4096-Byte Preamble

        [Fact]
        public void Probe3_1_NullByte_AtByte0_InstantRejection()
        {
            byte[] bytes = new byte[] { 0x00, (byte)'s', (byte)'o', (byte)'l', (byte)'i', (byte)'d', (byte)'\n', (byte)'e', (byte)'n', (byte)'d', (byte)'s', (byte)'o', (byte)'l', (byte)'i', (byte)'d', (byte)'\n' };
            using (var file = new TempStlFile(".stl", bytes))
            {
                Assert.False(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                Assert.False(StepMetadataParser.IsStlFile(file.Path));
            }
        }

        [Fact]
        public void Probe3_2_NullByte_AtByte5_ImmediatelyAfterSolid_InstantRejection()
        {
            byte[] prefix = Encoding.ASCII.GetBytes("solid");
            byte[] suffix = Encoding.ASCII.GetBytes(" test\r\n  facet normal 0 0 1\r\n  endfacet\r\nendsolid test\r\n");
            byte[] bytes = new byte[prefix.Length + 1 + suffix.Length];
            Array.Copy(prefix, 0, bytes, 0, prefix.Length);
            bytes[prefix.Length] = 0x00; // Null byte right after "solid"
            Array.Copy(suffix, 0, bytes, prefix.Length + 1, suffix.Length);

            using (var file = new TempStlFile(".stl", bytes))
            {
                Assert.False(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                Assert.False(StepMetadataParser.IsStlFile(file.Path));
            }
        }

        [Fact]
        public void Probe3_3_NullByte_InsideFacetStream_InstantRejection()
        {
            string ascii = "solid test_mesh\r\n  facet normal 0 0 1\r\n    outer loop\r\n      vertex 0 0 0\r\n      vertex 1 0 0\r\n      vertex 0 1 0\r\n    endloop\r\n  endfacet\r\nendsolid test_mesh\r\n";
            byte[] bytes = Encoding.UTF8.GetBytes(ascii);
            bytes[100] = 0x00; // Inject null byte at offset 100

            using (var file = new TempStlFile(".stl", bytes))
            {
                Assert.False(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                Assert.False(StepMetadataParser.IsStlFile(file.Path));
            }
        }

        [Fact]
        public void Probe3_4_NullByte_AtPreambleBoundary4095_InstantRejection()
        {
            var sb = new StringBuilder();
            sb.Append("solid big_preamble\r\n");
            while (sb.Length < 4050)
            {
                sb.Append("  facet normal 0 0 1\r\n  endfacet\r\n");
            }
            sb.Append("endsolid big_preamble\r\n");

            byte[] bytes = Encoding.UTF8.GetBytes(sb.ToString());
            if (bytes.Length < 4096)
            {
                byte[] padded = new byte[4096];
                Array.Copy(bytes, 0, padded, 0, bytes.Length);
                for (int i = bytes.Length; i < 4096; i++) padded[i] = (byte)' ';
                bytes = padded;
            }
            bytes[4095] = 0x00; // null at last byte of 4096 preamble

            using (var file = new TempStlFile(".stl", bytes))
            {
                Assert.False(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                Assert.False(StepMetadataParser.IsStlFile(file.Path));
            }
        }

        #endregion

        #region Probe 4: Minimal Valid ASCII STLs & Length Boundaries

        [Fact]
        public void Probe4_1_MinimalValidAsciiStl_WithFacets_ReturnsTrue()
        {
            string minimalFacet = "solid\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid";
            using (var file = new TempStlFile(".stl", minimalFacet, Encoding.UTF8))
            {
                Assert.True(StepMetadataParser.IsAsciiStlFile(file.Path, out string solidName));
                Assert.True(StepMetadataParser.IsStlFile(file.Path));
                Assert.True(StepMetadataParser.IsValidCadFile(file.Path));

                var meta = StepMetadataParser.ExtractMetadata(file.Path);
                Assert.Equal("STL", meta.Format);
                Assert.Equal("ASCII STL", meta.Schema);
                Assert.Equal("3D Mesh Model", meta.OriginatingSystem);
            }
        }

        [Fact]
        public void Probe4_2_MinimalValidAsciiStl_SolidEndsolid_15BytesOrMore()
        {
            // Case A: 15 bytes ("solid\r\nendsolid")
            using (var fileA = new TempStlFile(".stl", "solid\r\nendsolid", Encoding.ASCII))
            {
                Assert.Equal(15, new FileInfo(fileA.Path).Length);
                Assert.True(StepMetadataParser.IsAsciiStlFile(fileA.Path, out _));
                Assert.True(StepMetadataParser.IsStlFile(fileA.Path));
            }

            // Case B: 15 bytes ("solid\nendsolid\n")
            using (var fileB = new TempStlFile(".stl", "solid\nendsolid\n", Encoding.ASCII))
            {
                Assert.Equal(15, new FileInfo(fileB.Path).Length);
                Assert.True(StepMetadataParser.IsAsciiStlFile(fileB.Path, out _));
                Assert.True(StepMetadataParser.IsStlFile(fileB.Path));
            }

            // Case C: 17 bytes ("solid\r\nendsolid\r\n")
            using (var fileC = new TempStlFile(".stl", "solid\r\nendsolid\r\n", Encoding.ASCII))
            {
                Assert.Equal(17, new FileInfo(fileC.Path).Length);
                Assert.True(StepMetadataParser.IsAsciiStlFile(fileC.Path, out _));
                Assert.True(StepMetadataParser.IsStlFile(fileC.Path));
            }
        }

        [Fact]
        public void Probe4_3_SubMinimalFiles_LessThan14Bytes_AreRejected()
        {
            string[] tooShort = new[] { "solid", "solid\n", "solid\r\n", "solid end", "solid\nendsoli" };
            foreach (var s in tooShort)
            {
                using (var file = new TempStlFile(".stl", s, Encoding.UTF8))
                {
                    Assert.False(StepMetadataParser.IsAsciiStlFile(file.Path, out _));
                    Assert.False(StepMetadataParser.IsStlFile(file.Path));
                }
            }
        }

        [Fact]
        public void Probe4_4_Exact14Bytes_Observation()
        {
            // In UTF-8 / ASCII: "solid\nendsolid" is exactly 14 bytes (5 + 1 + 8).
            // StepMetadataParser.cs specifies fi.Length < 15, matching SCOPE.md line 35 ("File length >= 15 bytes").
            // We verify that exact 14 bytes returns false in compliance with the >= 15 bytes contract.
            using (var file14 = new TempStlFile(".stl", "solid\nendsolid", Encoding.ASCII))
            {
                Assert.Equal(14, new FileInfo(file14.Path).Length);
                bool result = StepMetadataParser.IsAsciiStlFile(file14.Path, out _);
                Assert.False(result); // Confirmed: < 15 bytes contract strictly enforced
            }
        }

        #endregion
    }
}
