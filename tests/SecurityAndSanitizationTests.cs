using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text.RegularExpressions;
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
        [InlineData(@"F:\blueprints\drawing.svg", true)]
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
        public void IsValidImageHeader_WithValidSvg_ReturnsTrue()
        {
            byte[] svgHeader = System.Text.Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
            Assert.True(SnapshotExportService.IsValidImageHeader(svgHeader));
            byte[] xmlSvg = System.Text.Encoding.UTF8.GetBytes("<?xml version=\"1.0\"?><svg></svg>");
            Assert.True(SnapshotExportService.IsValidImageHeader(xmlSvg));
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

        #region SEC-02: Snapshot File Overwrite Protection

        [Fact]
        public void HandleSaveSnapshot_WhenTargetFileAlreadyExists_RejectsAndPreservesFile()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "STP_Security_Tests_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string canaryFile = Path.Combine(tempDir, "existing_canary.png");
            byte[] canaryBytes = System.Text.Encoding.UTF8.GetBytes("CANARY_DATA_DO_NOT_OVERWRITE_OR_TRUNCATE");

            try
            {
                File.WriteAllBytes(canaryFile, canaryBytes);

                // Valid PNG payload (magic signature: 89 50 4E 47 0D 0A 1A 0A)
                byte[] incomingSnapshotBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52 };
                string base64Png = "data:image/png;base64," + Convert.ToBase64String(incomingSnapshotBytes);

                var snap = new SaveSnapshotMessage
                {
                    Data = base64Png,
                    DefaultName = "existing_canary.png",
                    TargetPath = canaryFile
                };

                bool saved = SnapshotExportService.HandleSaveSnapshot(null, null, snap);

                // SEC-02 Assertion: Must return false and leave existing file unmodified
                Assert.False(saved, "HandleSaveSnapshot must reject execution and return false when direct targetPath points to an existing file.");
                Assert.True(File.Exists(canaryFile), "Canary file must still exist.");
                byte[] actualBytes = File.ReadAllBytes(canaryFile);
                Assert.Equal(canaryBytes, actualBytes);
            }
            finally
            {
                if (File.Exists(canaryFile))
                    File.Delete(canaryFile);
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, true);
            }
        }

        [Fact]
        public void HandleSaveSnapshot_WhenTargetFileDoesNotExist_WritesCleanly()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "STP_Security_Tests_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string newFile = Path.Combine(tempDir, "new_snapshot_export.png");

            try
            {
                // Valid PNG payload (magic signature: 89 50 4E 47 0D 0A 1A 0A)
                byte[] expectedImageBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08 };
                string base64Png = "data:image/png;base64," + Convert.ToBase64String(expectedImageBytes);

                var snap = new SaveSnapshotMessage
                {
                    Data = base64Png,
                    DefaultName = "new_snapshot_export.png",
                    TargetPath = newFile
                };

                bool saved = SnapshotExportService.HandleSaveSnapshot(null, null, snap);

                Assert.True(saved, "HandleSaveSnapshot should succeed and return true when direct targetPath does not exist.");
                Assert.True(File.Exists(newFile), "Snapshot file must be written to disk.");
                byte[] writtenBytes = File.ReadAllBytes(newFile);
                Assert.Equal(expectedImageBytes, writtenBytes);
            }
            finally
            {
                if (File.Exists(newFile))
                    File.Delete(newFile);
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, true);
            }
        }

        [Fact]
        public void HandleSaveSnapshot_WhenDirectTargetPathInvalid_RejectsWithoutInteractiveFallback()
        {
            // Adversarial path containing directory traversal
            var snap = new SaveSnapshotMessage
            {
                Data = "data:image/png;base64," + Convert.ToBase64String(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00 }),
                DefaultName = "test.png",
                TargetPath = @"C:\exports\..\..\windows\system32\calc.png"
            };

            bool saved = SnapshotExportService.HandleSaveSnapshot(null, null, snap);
            Assert.False(saved, "HandleSaveSnapshot must immediately reject invalid direct targetPath without interactive fallback.");
        }

        [Fact]
        public void HandleSaveSnapshot_WhenImageHeaderInvalid_ReturnsFalseWithoutWriting()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "STP_Security_Tests_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string destination = Path.Combine(tempDir, "destination.png");

            try
            {
                // Malicious payload with PE header (MZ) disguised as PNG
                var snap = new SaveSnapshotMessage
                {
                    Data = "data:image/png;base64," + Convert.ToBase64String(new byte[] { 0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00 }),
                    DefaultName = "destination.png",
                    TargetPath = destination
                };

                bool saved = SnapshotExportService.HandleSaveSnapshot(null, null, snap);
                Assert.False(saved, "HandleSaveSnapshot must reject payload with invalid image header.");
                Assert.False(File.Exists(destination), "File must not be written when header is invalid.");
            }
            finally
            {
                if (File.Exists(destination))
                    File.Delete(destination);
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, true);
            }
        }

        #endregion

        #region SEC-06: Transport Layer Security Protocols

        [Fact]
        public void ConfigureSecurityProtocols_ExplicitlyConfiguresTls12AndTls13()
        {
            var previousProtocols = ServicePointManager.SecurityProtocol;
            try
            {
                // Reset to baseline/insecure default
                ServicePointManager.SecurityProtocol = SecurityProtocolType.SystemDefault;

                PluginUpdateService.ConfigureSecurityProtocols();

                // SEC-06 Assertions
                Assert.True((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls12) != 0,
                    "ServicePointManager.SecurityProtocol must explicitly include TLS 1.2.");
                Assert.True((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls13) != 0,
                    "ServicePointManager.SecurityProtocol must explicitly include TLS 1.3.");
                Assert.False((ServicePointManager.SecurityProtocol & SecurityProtocolType.Ssl3) != 0,
                    "ServicePointManager.SecurityProtocol must NOT include deprecated SSL 3.0.");
                Assert.False((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls) != 0,
                    "ServicePointManager.SecurityProtocol must NOT include deprecated TLS 1.0.");
                Assert.False((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls11) != 0,
                    "ServicePointManager.SecurityProtocol must NOT include deprecated TLS 1.1.");
                Assert.Equal(SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13, ServicePointManager.SecurityProtocol);
            }
            finally
            {
                ServicePointManager.SecurityProtocol = previousProtocols;
            }
        }

        [Fact]
        public void ConfigureSecurityProtocols_IsIdempotentAcrossMultipleInvocations()
        {
            var previousProtocols = ServicePointManager.SecurityProtocol;
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.SystemDefault;

                PluginUpdateService.ConfigureSecurityProtocols();
                PluginUpdateService.ConfigureSecurityProtocols();

                Assert.Equal(SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13, ServicePointManager.SecurityProtocol);
            }
            finally
            {
                ServicePointManager.SecurityProtocol = previousProtocols;
            }
        }

        #endregion

        #region Reusable Path Resolution Helper

        /// <summary>
        /// Locates a file within the repository across various test runner execution directories
        /// (repository root, tests project directory, or bin/Debug/net48 output directory).
        /// </summary>
        private static string LocateRepositoryFile(string relativePath)
        {
            // 1. Search upwards from CurrentDirectory (repository root during 'dotnet test')
            string current = Directory.GetCurrentDirectory();
            for (int i = 0; i < 6; i++)
            {
                string candidate = Path.Combine(current, relativePath);
                if (File.Exists(candidate))
                    return Path.GetFullPath(candidate);
                var parent = Directory.GetParent(current);
                if (parent == null) break;
                current = parent.FullName;
            }

            // 2. Search upwards from AppDomain.CurrentDomain.BaseDirectory (bin/Debug/net48)
            current = AppDomain.CurrentDomain.BaseDirectory;
            for (int i = 0; i < 6; i++)
            {
                string candidate = Path.Combine(current, relativePath);
                if (File.Exists(candidate))
                    return Path.GetFullPath(candidate);
                var parent = Directory.GetParent(current);
                if (parent == null) break;
                current = parent.FullName;
            }

            return null;
        }

        #endregion

        #region SEC-03: Content Security Policy Enforcement

        [Fact]
        public void ViewerHtml_EnforcesStrictContentSecurityPolicy()
        {
            string htmlPath = LocateRepositoryFile(@"Assets\viewer.html");
            Assert.True(File.Exists(htmlPath), $"viewer.html must exist at: {htmlPath}");

            string content = File.ReadAllText(htmlPath);

            // 1. Validate <head> element boundary
            int headStart = content.IndexOf("<head>", StringComparison.OrdinalIgnoreCase);
            int headEnd = content.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
            Assert.True(headStart >= 0 && headEnd > headStart, "viewer.html must contain a valid <head> element.");
            string head = content.Substring(headStart, headEnd - headStart);

            // 2. Validate <meta http-equiv="Content-Security-Policy" ...> tag in <head>
            var cspMetaMatch = Regex.Match(
                head,
                @"<meta\s+[^>]*http-equiv\s*=\s*[""']Content-Security-Policy[""'][^>]*>",
                RegexOptions.IgnoreCase);
            Assert.True(cspMetaMatch.Success, "A <meta http-equiv=\"Content-Security-Policy\"> tag must be present within <head> in viewer.html.");

            string metaTag = cspMetaMatch.Value;
            var contentAttrMatch = Regex.Match(metaTag, @"content\s*=\s*([""'])(.*?)\1", RegexOptions.IgnoreCase);
            Assert.True(contentAttrMatch.Success, "The Content-Security-Policy <meta> tag must contain a non-empty content attribute.");

            string cspPolicy = contentAttrMatch.Groups[2].Value;

            // 3. Parse CSP directives into key-value pairs
            var directives = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var part in cspPolicy.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var trimmed = part.Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;
                int firstSpace = trimmed.IndexOf(' ');
                if (firstSpace > 0)
                {
                    string name = trimmed.Substring(0, firstSpace).Trim();
                    string val = trimmed.Substring(firstSpace + 1).Trim();
                    directives[name] = val;
                }
                else
                {
                    directives[trimmed] = string.Empty;
                }
            }

            // 4. Assert script-src directive restrictions
            Assert.True(directives.ContainsKey("script-src"), "CSP must define a 'script-src' directive.");
            string scriptSrc = directives["script-src"];
            Assert.Contains("'self'", scriptSrc);
            Assert.Contains("https://step-viewer.local", scriptSrc);
            Assert.DoesNotContain("*", scriptSrc);
            Assert.DoesNotContain("http:", scriptSrc);
            Assert.DoesNotContain("cad-stream.local", scriptSrc);
            Assert.DoesNotContain("api.github.com", scriptSrc);

            // 5. Assert style-src directive restrictions
            Assert.True(directives.ContainsKey("style-src"), "CSP must define a 'style-src' directive.");
            string styleSrc = directives["style-src"];
            Assert.Contains("'self'", styleSrc);
            Assert.Contains("https://step-viewer.local", styleSrc);
            Assert.DoesNotContain("*", styleSrc);
            Assert.DoesNotContain("http:", styleSrc);

            // 6. Assert connect-src directive restrictions
            Assert.True(directives.ContainsKey("connect-src"), "CSP must define a 'connect-src' directive.");
            string connectSrc = directives["connect-src"];
            Assert.Contains("'self'", connectSrc);
            Assert.Contains("https://step-viewer.local", connectSrc);
            Assert.Contains("https://cad-stream.local", connectSrc);
            Assert.Contains("https://api.github.com", connectSrc);
            Assert.DoesNotContain("*", connectSrc);
            Assert.DoesNotContain("http:", connectSrc);

            // 7. Defense-in-depth: Ensure no wildcard origins across any directive
            Assert.DoesNotContain("connect-src *", cspPolicy);
            Assert.DoesNotContain("script-src *", cspPolicy);
            Assert.DoesNotContain("style-src *", cspPolicy);
            Assert.DoesNotContain("default-src *", cspPolicy);
        }

        #endregion

        #region SEC-05: WebView2 Host Objects and Navigation Security Policy

        [Theory]
        // Whitelisted viewer navigation URLs
        [InlineData("https://step-viewer.local/", true)]
        [InlineData("https://step-viewer.local/viewer.html", true)]
        [InlineData("about:blank", true)]
        [InlineData("ABOUT:BLANK", true)]
        [InlineData("https://step-viewer.local", true)]
        [InlineData("https://step-viewer.local/index.html", true)]
        [InlineData("https://step-viewer.local/subpath/page.html", true)]
        // Forbidden external or malicious URLs
        [InlineData("https://google.com", false)]
        [InlineData("http://step-viewer.local/", false)]
        [InlineData("file:///C:/secret.txt", false)]
        [InlineData("javascript:alert(1)", false)]
        [InlineData("https://attacker.com/evil.html", false)]
        [InlineData("https://step-viewer.local.evil.com/viewer.html", false)]
        [InlineData("https://step-viewer.local@evil.com/viewer.html", false)]
        [InlineData("https://step-viewer.local:8080/viewer.html", false)]
        [InlineData("https://cad-stream.local/cad-file", false)]
        [InlineData("https://api.github.com/", false)]
        [InlineData("data:text/html,<script>alert(1)</script>", false)]
        [InlineData("", false)]
        [InlineData("   ", false)]
        [InlineData(null, false)]
        public void IsValidViewerNavigationUrl_AllowedAndDisallowedUrls(string uri, bool expectedValid)
        {
            bool actual = WebViewEnvironmentManager.IsValidViewerNavigationUrl(uri);
            Assert.Equal(expectedValid, actual);
        }

        [Fact]
        public void ConfigureWebView_EnforcesSecurityPolicies()
        {
            // 1. Verify API contract and null-safety
            var configMethod = typeof(WebViewEnvironmentManager).GetMethod(
                "ConfigureWebView",
                BindingFlags.Public | BindingFlags.Static);
            Assert.NotNull(configMethod);

            Action act = () => WebViewEnvironmentManager.ConfigureWebView(null);
            var ex = Record.Exception(act);
            Assert.Null(ex);

            // 2. Verify static configuration in WebViewEnvironmentManager.cs
            string csPath = LocateRepositoryFile(@"WebViewEnvironmentManager.cs");
            Assert.True(File.Exists(csPath), $"WebViewEnvironmentManager.cs must exist at: {csPath}");

            string code = File.ReadAllText(csPath);

            // Extract ConfigureWebView method body using brace counting
            int methodIndex = code.IndexOf("ConfigureWebView", StringComparison.Ordinal);
            Assert.True(methodIndex >= 0, "WebViewEnvironmentManager.cs must contain ConfigureWebView method.");

            int openBrace = code.IndexOf('{', methodIndex);
            Assert.True(openBrace >= 0, "ConfigureWebView must have an opening brace.");

            int depth = 1;
            int idx = openBrace + 1;
            while (depth > 0 && idx < code.Length)
            {
                if (code[idx] == '{') depth++;
                else if (code[idx] == '}') depth--;
                idx++;
            }
            string methodBody = code.Substring(openBrace, idx - openBrace);

            // Verify AreHostObjectsAllowed = false is set
            Assert.True(
                methodBody.Contains("AreHostObjectsAllowed = false") || methodBody.Contains("AreHostObjectsAllowed=false"),
                "ConfigureWebView must set webView.Settings.AreHostObjectsAllowed = false;");

            // Verify NavigationStarting handler is wired with IsValidViewerNavigationUrl check and e.Cancel = true
            Assert.Contains("NavigationStarting", methodBody);
            Assert.Contains("IsValidViewerNavigationUrl", methodBody);
            Assert.True(
                methodBody.Contains("Cancel = true") || methodBody.Contains("Cancel=true"),
                "NavigationStarting handler must set e.Cancel = true; for unauthorized URLs.");

            // Verify NewWindowRequested handler suppresses popups with e.Handled = true
            Assert.Contains("NewWindowRequested", methodBody);
            Assert.True(
                methodBody.Contains("Handled = true") || methodBody.Contains("Handled=true"),
                "NewWindowRequested handler must set e.Handled = true; to cancel popup windows.");
        }

        #endregion

        #region SEC-01: Assembly Tree Body Name Sanitization

        [Fact]
        public void AssemblyTreeJs_ImplementsHtmlEscapingAndDualDefenseSanitization()
        {
            string jsPath = LocateRepositoryFile(@"Assets\js\assemblyTree.js");
            Assert.True(File.Exists(jsPath), $"assemblyTree.js must exist at: {jsPath}");

            string content = File.ReadAllText(jsPath);

            // 1. Verify escapeHtml helper is defined and escapes all 5 standard HTML entities
            Assert.True(content.Contains("function escapeHtml"), "assemblyTree.js must define escapeHtml helper function.");
            Assert.True(content.Contains(".replace(/&/g, '&amp;')"), "escapeHtml must escape '&' to '&amp;'.");
            Assert.True(content.Contains(".replace(/</g, '&lt;')"), "escapeHtml must escape '<' to '&lt;'.");
            Assert.True(content.Contains(".replace(/>/g, '&gt;')"), "escapeHtml must escape '>' to '&gt;'.");
            Assert.True(content.Contains(".replace(/\"/g, '&quot;')"), "escapeHtml must escape '\"' to '&quot;'.");
            Assert.True(content.Contains(".replace(/'/g, '&#39;')"), "escapeHtml must escape ''' to '&#39;'.");

            // 2. Verify window and global security utils export
            Assert.True(content.Contains("window.escapeHtml = escapeHtml;"), "assemblyTree.js must export escapeHtml on window object.");

            // 3. Verify markup interpolation uses safeName and forbids raw ${b.name} inside innerHTML
            Assert.False(content.Contains("<span class=\"tree-node-name\">${b.name}</span>"),
                "assemblyTree.js must NOT directly interpolate unescaped ${b.name} into markup.");
            Assert.True(content.Contains("const safeName = escapeHtml(b.name);"),
                "assemblyTree.js must sanitize b.name using escapeHtml prior to markup generation.");

            // 4. Verify dual-defense programmatic textContent assignment
            Assert.True(content.Contains("nameSpan.textContent = b.name"),
                "assemblyTree.js must enforce dual-defense by programmatically assigning nameSpan.textContent = b.name.");
        }

        [Fact]
        public void AppearancePopoverJs_SanitizesModelBodyNamesInOptionDropdown()
        {
            string popoverPath = LocateRepositoryFile(@"Assets\js\appearancePopover.js");
            Assert.True(File.Exists(popoverPath), $"appearancePopover.js must exist at: {popoverPath}");

            string content = File.ReadAllText(popoverPath);

            // Verify safeName escaping before creating <option> elements in dropdown
            Assert.False(content.Contains("html += `<option value=\"${b.id}\">${b.name} ("),
                "appearancePopover.js must NOT interpolate raw unescaped b.name into option elements.");
            Assert.True(content.Contains("const safeName = escapeHtml(b.name);"),
                "appearancePopover.js must sanitize body name via escapeHtml before option markup insertion.");
        }

        #endregion

        #region SEC-04: SVG Blueprint XML Sanitization

        [Fact]
        public void BlueprintSvgEngineJs_ImplementsXmlEscapingAndSafeFilenameSanitization()
        {
            string svgJsPath = LocateRepositoryFile(@"Assets\js\blueprintSvgEngine.js");
            Assert.True(File.Exists(svgJsPath), $"blueprintSvgEngine.js must exist at: {svgJsPath}");

            string content = File.ReadAllText(svgJsPath);

            // 1. Verify escapeXml helper is defined and escapes all 5 standard XML character entities
            Assert.True(content.Contains("function escapeXml"), "blueprintSvgEngine.js must define escapeXml helper function.");
            Assert.True(content.Contains(".replace(/&/g, '&amp;')"), "escapeXml must escape '&' to '&amp;'.");
            Assert.True(content.Contains(".replace(/</g, '&lt;')"), "escapeXml must escape '<' to '&lt;'.");
            Assert.True(content.Contains(".replace(/>/g, '&gt;')"), "escapeXml must escape '>' to '&gt;'.");
            Assert.True(content.Contains(".replace(/\"/g, '&quot;')"), "escapeXml must escape '\"' to '&quot;'.");
            Assert.True(content.Contains(".replace(/'/g, '&apos;')"), "escapeXml must escape ''' to '&apos;'.");

            // 2. Verify partName and metadata text interpolations are escaped
            Assert.True(content.Contains("const partName = escapeXml(rawPartName);"),
                "blueprintSvgEngine.js must sanitize partName via escapeXml.");
            Assert.True(content.Contains("const totalMassText = escapeXml(rawMassText);"),
                "blueprintSvgEngine.js must sanitize totalMassText via escapeXml.");

            // 3. Verify safe export filename sanitization against path traversal and forbidden characters
            Assert.True(content.Contains("replace(/[<>:\"/\\\\|?*\\x00-\\x1F]/g, '_')"),
                "blueprintSvgEngine.js must sanitize export filename against invalid filesystem characters.");
        }

        #endregion
    }
}
