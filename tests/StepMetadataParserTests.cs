using System;
using System.IO;
using Xunit;
using QuickLook.Plugin.StepViewer;

namespace QuickLook.Plugin.StepViewer.Tests
{
    public class StepMetadataParserTests
    {
        private readonly string _sampleBoxPath;

        public StepMetadataParserTests()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            // Traverse up to find sample_box.step
            string current = baseDir;
            string found = null;
            for (int i = 0; i < 6; i++)
            {
                string candidate = Path.Combine(current, "sample_box.step");
                if (File.Exists(candidate))
                {
                    found = candidate;
                    break;
                }
                string parent = Path.GetDirectoryName(current);
                if (string.IsNullOrEmpty(parent)) break;
                current = parent;
            }
            _sampleBoxPath = found;
        }

        [Fact]
        public void IsValidCadFile_WithSampleBoxStep_ReturnsTrue()
        {
            if (string.IsNullOrEmpty(_sampleBoxPath)) return; // Skip if run in isolated output without sample file
            bool valid = StepMetadataParser.IsValidCadFile(_sampleBoxPath);
            Assert.True(valid);
        }

        [Fact]
        public void IsValidCadFile_WithNonExistentPath_ReturnsFalse()
        {
            bool valid = StepMetadataParser.IsValidCadFile(@"C:\non_existent_folder_xyz\file.step");
            Assert.False(valid);
        }

        [Fact]
        public void IsValidCadFile_WithNullOrEmpty_ReturnsFalse()
        {
            Assert.False(StepMetadataParser.IsValidCadFile(null));
            Assert.False(StepMetadataParser.IsValidCadFile(""));
            Assert.False(StepMetadataParser.IsValidCadFile("   "));
        }

        [Fact]
        public void ExtractMetadata_WithSampleBox_ReturnsValidHeaderInfo()
        {
            if (string.IsNullOrEmpty(_sampleBoxPath)) return;
            var meta = StepMetadataParser.ExtractMetadata(_sampleBoxPath);
            Assert.NotNull(meta);
            Assert.False(string.IsNullOrWhiteSpace(meta.Schema));
            string title = meta.GetFormattedTitle("sample_box.step");
            Assert.Contains("box", title);
            Assert.Contains("[AP203]", title);
        }

        [Fact]
        public void ExtractMetadata_WithMissingFile_ReturnsEmptyMetadata()
        {
            var meta = StepMetadataParser.ExtractMetadata(@"C:\dummy_missing_path.step");
            Assert.NotNull(meta);
            Assert.Equal(0, meta.FileSizeBytes);
            Assert.Equal("STEP CAD", meta.Schema);
        }
    }
}
