using System;
using System.IO;
using Xunit;
using QuickLook.Plugin.StepViewer;

namespace QuickLook.Plugin.StepViewer.Tests
{
    public class SecurityAndSanitizationTests
    {
        [Theory]
        [InlineData(@"C:\exports\cad_view.png", true)]
        [InlineData(@"D:\drawings\part.jpg", true)]
        [InlineData(@"E:\models\render.jpeg", true)]
        [InlineData(@"C:\exports\..\..\windows\system32\cmd.exe", false)]
        [InlineData(@"C:\exports\payload.exe", false)]
        [InlineData(@"C:\exports\payload.bat", false)]
        [InlineData(@"C:\exports\payload.ps1", false)]
        [InlineData(@"C:\exports\payload.dll", false)]
        [InlineData(@"C:\exports\payload.exe.png", false)]
        [InlineData(@"C:\exports\payload.bat.jpg", false)]
        [InlineData(@"C:\exports\CON.png", false)]
        [InlineData(@"C:\exports\PRN.jpg", false)]
        [InlineData(@"C:\exports\AUX.png", false)]
        [InlineData(@"C:\exports\COM1.png", false)]
        [InlineData(@"\\network_share\folder\img.png", false)]
        [InlineData(@"//network_share/folder/img.png", false)]
        [InlineData(@"relative\path\img.png", false)]
        [InlineData(@"", false)]
        [InlineData(null, false)]
        public void SnapshotTargetValidation_EnforcesStrictSecurityPolicy(string path, bool expectedValid)
        {
            bool actual = SnapshotExportService.IsValidSnapshotTargetPath(path);
            Assert.Equal(expectedValid, actual);
        }

        [Fact]
        public void IsValidImageHeader_WithValidPng_ReturnsTrue()
        {
            byte[] pngHeader = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00 };
            Assert.True(SnapshotExportService.IsValidImageHeader(pngHeader));
        }

        [Fact]
        public void IsValidImageHeader_WithValidJpg_ReturnsTrue()
        {
            byte[] jpgHeader = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10 };
            Assert.True(SnapshotExportService.IsValidImageHeader(jpgHeader));
        }

        [Fact]
        public void IsValidImageHeader_WithMaliciousExe_ReturnsFalse()
        {
            byte[] mzHeader = new byte[] { 0x4D, 0x5A, 0x90, 0x00, 0x03 }; // MZ header for DOS/PE executable
            Assert.False(SnapshotExportService.IsValidImageHeader(mzHeader));
        }

        [Fact]
        public void IsValidImageHeader_WithGarbageOrNull_ReturnsFalse()
        {
            Assert.False(SnapshotExportService.IsValidImageHeader(null));
            Assert.False(SnapshotExportService.IsValidImageHeader(new byte[0]));
            Assert.False(SnapshotExportService.IsValidImageHeader(new byte[] { 0x01, 0x02 }));
        }

        [Fact]
        public void FixedTimeEquals_ValidatesConstantTimeEquality()
        {
            string hashA = "471fc6f6438a9a084854a4ea071beb90de2a4ba005ebc853e33e9cda2a1f3f5a";
            string hashB = "471FC6F6438A9A084854A4EA071BEB90DE2A4BA005EBC853E33E9CDA2A1F3F5A"; // Uppercase variant
            string hashC = "071fc6f6438a9a084854a4ea071beb90de2a4ba005ebc853e33e9cda2a1f3f5a"; // 1 char diff

            Assert.True(PluginUpdateService.FixedTimeEquals(hashA, hashB));
            Assert.False(PluginUpdateService.FixedTimeEquals(hashA, hashC));
            Assert.False(PluginUpdateService.FixedTimeEquals(hashA, "short"));
            Assert.False(PluginUpdateService.FixedTimeEquals(hashA, null));
            Assert.False(PluginUpdateService.FixedTimeEquals(null, null));
        }

        [Theory]
        [InlineData("https://github.com/Mostafa214/QuickLook.Plugin.StepViewer/releases/download/v1.1.0/QuickLook.Plugin.StepViewer.qlplugin", true)]
        [InlineData("http://github.com/Mostafa214/QuickLook.Plugin.StepViewer/releases/download/v1.1.0/package.qlplugin", false)] // Insecure HTTP
        [InlineData("https://attacker.com/Mostafa214/QuickLook.Plugin.StepViewer/releases/download/v1.1.0/package.qlplugin", false)] // Host spoof
        [InlineData("https://github.com/OtherUser/QuickLook.Plugin.StepViewer/releases/download/v1.1.0/package.qlplugin", false)] // Org spoof
        [InlineData("https://github.com/Mostafa214/QuickLook.Plugin.StepViewer/releases/download/v1.1.0/package.exe", false)] // Non-qlplugin
        [InlineData("", false)]
        [InlineData(null, false)]
        public void IsTrustedGitHubUpdateUrl_EnforcesRepositoryScoping(string url, bool expectedValid)
        {
            bool valid = PluginUpdateService.IsTrustedGitHubUpdateUrl(url, out _);
            Assert.Equal(expectedValid, valid);
        }
    }
}
