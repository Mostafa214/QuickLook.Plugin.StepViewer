using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Xunit;
using QuickLook.Plugin.StepViewer;

namespace QuickLook.Plugin.StepViewer.Tests
{
    /// <summary>
    /// Empirical Adversarial Stress Harness for SEC-03 (Content Security Policy) 
    /// and SEC-05 (Navigation Perimeter Lockdown & URL Parser Bypass Fuzzing).
    /// </summary>
    public class NavigationAndCspAdversarialStressTests
    {
        #region Path Helper

        private static string LocateRepositoryFile(string relativePath)
        {
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

        #region Attack Vector 1: URL Parser Bypass Fuzzing Matrix

        [Theory]
        // === Credential & Userinfo Spoofing Attacks ===
        [InlineData("https://step-viewer.local@evil.com/", false)]
        [InlineData("https://step-viewer.local@attacker.com/viewer.html", false)]
        [InlineData("https://step-viewer.local:password@evil.com/", false)]
        [InlineData("https://admin:secret@step-viewer.local/", false)]
        [InlineData("https://step-viewer.local@step-viewer.local/", false)]
        [InlineData("https://step-viewer.local%40evil.com/", false)]

        // === Subdomain & Host Suffix Attacks ===
        [InlineData("https://step-viewer.local.evil.com/", false)]
        [InlineData("https://step-viewer.local.evil.com/viewer.html", false)]
        [InlineData("https://step-viewer.localevil.com/", false)]
        [InlineData("https://step-viewer.localevil.com/path", false)]
        [InlineData("https://evil-step-viewer.local/", false)]
        [InlineData("https://not-step-viewer.local/", false)]
        [InlineData("https://subdomain.step-viewer.local/", false)]
        [InlineData("https://step-viewer.local.org/", false)]
        [InlineData("https://step-viewer.local.net/", false)]
        [InlineData("https://step-viewer.local.com/", false)]

        // === Port Confusion Attacks ===
        [InlineData("https://step-viewer.local:8080/", false)]
        [InlineData("https://step-viewer.local:8080/viewer.html", false)]
        [InlineData("https://step-viewer.local:443/", false)]
        [InlineData("https://step-viewer.local:80/", false)]
        [InlineData("https://step-viewer.local:3000/", false)]
        [InlineData("https://step-viewer.local:8443/cad-stream", false)]

        // === Path, Query & Anchor Confusion Attacks ===
        [InlineData("https://step-viewer.local#anchor", false)]
        [InlineData("https://step-viewer.local#", false)]
        [InlineData("https://step-viewer.local?evil=1", false)]
        [InlineData("https://step-viewer.local?redirect=https://evil.com", false)]
        [InlineData("https://step-viewer.local;param=value", false)]
        [InlineData("https://step-viewer.local\\evil.com", false)]
        [InlineData("https://step-viewer.local\\path", false)]

        // === Scheme Confusion & Downgrade Attacks ===
        [InlineData("http://step-viewer.local/", false)]
        [InlineData("http://step-viewer.local/viewer.html", false)]
        [InlineData("http://step-viewer.local", false)]
        [InlineData("ftp://step-viewer.local/", false)]
        [InlineData("ws://step-viewer.local/", false)]
        [InlineData("wss://step-viewer.local/", false)]
        [InlineData("file:///C:/Windows/win.ini", false)]
        [InlineData("file:///C:/secret.txt", false)]
        [InlineData("file://step-viewer.local/viewer.html", false)]
        [InlineData("javascript:alert(1)", false)]
        [InlineData("javascript:void(0)", false)]
        [InlineData("JAVASCRIPT:alert(document.cookie)", false)]
        [InlineData("data:text/html,<h1>XSS</h1>", false)]
        [InlineData("data:text/html;<script>alert(1)</script>", false)]
        [InlineData("data:application/xhtml+xml,<script>alert(1)</script>", false)]
        [InlineData("blob:https://step-viewer.local/7a1f5926-2581-49b0-bb55-46aa9f9a2e1d", false)]
        [InlineData("blob:null/7a1f5926-2581-49b0-bb55-46aa9f9a2e1d", false)]
        [InlineData("vbscript:msgbox(1)", false)]
        [InlineData("chrome://settings", false)]
        [InlineData("ms-appx:///Assets/viewer.html", false)]

        // === Pseudo-scheme & about: Variations ===
        [InlineData("about:blank?payload=1", false)]
        [InlineData("about:blank#anchor", false)]
        [InlineData("about:srcdoc", false)]
        [InlineData("about:config", false)]
        [InlineData("about:", false)]

        // === Encoded Characters, Null Bytes & Whitespace Manipulation ===
        [InlineData("https://step-viewer.local%00/", false)]
        [InlineData("https://step-viewer.local%2f", false)]
        [InlineData("https://step-viewer.local%20/", false)]
        [InlineData("https://step-viewer.local\0/", false)]
        [InlineData("https://step-viewer.local\r\n/", false)]
        [InlineData("https://step-viewer.local\t/", false)]
        [InlineData("https://step-viewer.local:443%00/", false)]
        [InlineData("", false)]
        [InlineData("   ", false)]
        [InlineData("\t\r\n", false)]
        [InlineData(null, false)]

        // === Host Boundary: Disallowed Sister Virtual Endpoints ===
        [InlineData("https://cad-stream.local/", false)]
        [InlineData("https://cad-stream.local/cad-file", false)]
        [InlineData("https://cad-stream.local", false)]
        [InlineData("https://api.github.com/", false)]
        [InlineData("https://api.github.com/repos/owner/repo/releases", false)]

        // === Legitimate Allowed Viewer Navigation Endpoints ===
        [InlineData("https://step-viewer.local/", true)]
        [InlineData("https://step-viewer.local/viewer.html", true)]
        [InlineData("https://step-viewer.local/index.html", true)]
        [InlineData("https://step-viewer.local/subpath/page.html", true)]
        [InlineData("https://step-viewer.local/css/viewer.css", true)]
        [InlineData("https://step-viewer.local/js/three.min.js", true)]
        [InlineData("https://step-viewer.local/viewer.html?theme=light", true)]
        [InlineData("https://step-viewer.local/viewer.html#viewport", true)]
        [InlineData("https://step-viewer.local/#anchor", true)]
        [InlineData("https://step-viewer.local/?query=1", true)]
        [InlineData("https://step-viewer.local", true)]
        [InlineData("HTTPS://STEP-VIEWER.LOCAL/", true)]
        [InlineData("HTTPS://STEP-VIEWER.LOCAL/VIEWER.HTML", true)]
        [InlineData("about:blank", true)]
        [InlineData("ABOUT:BLANK", true)]
        [InlineData("About:Blank", true)]
        [InlineData("  https://step-viewer.local/  ", true)]
        [InlineData("  about:blank  ", true)]
        [InlineData("  https://step-viewer.local/viewer.html?tab=1  ", true)]
        public void IsValidViewerNavigationUrl_EmpiricalAdversarialMatrix(string uri, bool expectedValid)
        {
            bool actual = WebViewEnvironmentManager.IsValidViewerNavigationUrl(uri);
            Assert.Equal(expectedValid, actual);
        }

        [Fact]
        public void IsValidViewerNavigationUrl_UnderConcurrentStress_ReturnsDeterministicResults()
        {
            var testCases = new (string Uri, bool Expected)[]
            {
                ("https://step-viewer.local/", true),
                ("https://step-viewer.local/viewer.html", true),
                ("about:blank", true),
                ("https://step-viewer.local", true),
                ("https://step-viewer.local@evil.com/", false),
                ("https://step-viewer.local.evil.com/", false),
                ("https://step-viewer.local:8080/", false),
                ("http://step-viewer.local/", false),
                ("file:///C:/Windows/win.ini", false),
                ("javascript:alert(1)", false),
                ("data:text/html,...", false),
                ("https://step-viewer.local%00/", false),
                ("https://cad-stream.local/cad-file", false),
                (null, false),
                ("", false)
            };

            var failures = new ConcurrentBag<string>();

            Parallel.For(0, 20000, i =>
            {
                var tc = testCases[i % testCases.Length];
                bool actual = WebViewEnvironmentManager.IsValidViewerNavigationUrl(tc.Uri);
                if (actual != tc.Expected)
                {
                    failures.Add($"Iteration {i}: URI '{tc.Uri}' expected {tc.Expected} but got {actual}");
                }
            });

            Assert.Empty(failures);
        }

        #endregion

        #region Attack Vector 2: CSP Parsing, Grammar & Domain Isolation

        [Fact]
        public void ContentSecurityPolicy_ConformsToW3cGrammarAndEnforcesDomainIsolation()
        {
            string htmlPath = LocateRepositoryFile(@"Assets\viewer.html");
            Assert.True(File.Exists(htmlPath), $"viewer.html missing at {htmlPath}");

            string html = File.ReadAllText(htmlPath);

            // 1. Meta tag extraction
            var match = Regex.Match(
                html,
                @"<meta\s+[^>]*http-equiv\s*=\s*[""']Content-Security-Policy[""'][^>]*>",
                RegexOptions.IgnoreCase);
            Assert.True(match.Success, "Content-Security-Policy meta tag must exist in viewer.html.");

            var contentMatch = Regex.Match(match.Value, @"content\s*=\s*([""'])(.*?)\1", RegexOptions.IgnoreCase);
            Assert.True(contentMatch.Success, "content attribute must be present and quoted.");

            string csp = contentMatch.Groups[2].Value;

            // 2. W3C Grammar Validation: Directives must be tokenized by ';'
            var rawDirectives = csp.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries)
                                   .Select(d => d.Trim())
                                   .Where(d => !string.IsNullOrEmpty(d))
                                   .ToList();

            Assert.True(rawDirectives.Count >= 4, "CSP must contain at least default-src, script-src, style-src, connect-src.");

            var parsedDirectives = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

            var validDirectiveNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "default-src", "script-src", "style-src", "connect-src", "img-src",
                "font-src", "worker-src", "frame-src", "object-src", "media-src",
                "child-src", "form-action", "base-uri"
            };

            foreach (var dir in rawDirectives)
            {
                var parts = dir.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                Assert.True(parts.Length > 0, "Directive must have a name token.");
                string name = parts[0];

                Assert.True(validDirectiveNames.Contains(name), $"Directive '{name}' is not recognized in W3C CSP Level 3 grammar.");

                var values = parts.Skip(1).ToList();
                parsedDirectives[name] = values;

                // Grammar check: All keyword sources must be single-quoted ('self', 'unsafe-inline', 'none')
                foreach (var val in values)
                {
                    if (val.Equals("self", StringComparison.OrdinalIgnoreCase) ||
                        val.Equals("unsafe-inline", StringComparison.OrdinalIgnoreCase) ||
                        val.Equals("unsafe-eval", StringComparison.OrdinalIgnoreCase) ||
                        val.Equals("none", StringComparison.OrdinalIgnoreCase))
                    {
                        Assert.False(true, $"CSP keyword {val} must be single-quoted (e.g. '{val}'). Found unquoted: '{val}'");
                    }
                }
            }

            // 3. Domain Isolation: script-src
            Assert.True(parsedDirectives.ContainsKey("script-src"), "script-src directive required.");
            var scriptSources = parsedDirectives["script-src"];
            Assert.Contains("'self'", scriptSources);
            Assert.Contains("https://step-viewer.local", scriptSources);

            // Assert script-src cannot reach arbitrary third parties or unauthorized local virtual domains
            var disallowedScriptDomains = new[]
            {
                "*", "http:", "https:", "https://evil.com", "https://cdn.jsdelivr.net",
                "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://api.github.com",
                "https://cad-stream.local", "cad-stream.local"
            };
            foreach (var disallowed in disallowedScriptDomains)
            {
                Assert.False(scriptSources.Contains(disallowed), $"script-src must NOT permit: {disallowed}");
            }

            // 4. Domain Isolation: style-src
            Assert.True(parsedDirectives.ContainsKey("style-src"), "style-src directive required.");
            var styleSources = parsedDirectives["style-src"];
            Assert.Contains("'self'", styleSources);
            Assert.Contains("https://step-viewer.local", styleSources);

            var disallowedStyleDomains = new[]
            {
                "*", "http:", "https://evil.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"
            };
            foreach (var disallowed in disallowedStyleDomains)
            {
                Assert.False(styleSources.Contains(disallowed), $"style-src must NOT permit: {disallowed}");
            }

            // 5. Domain Isolation: connect-src
            Assert.True(parsedDirectives.ContainsKey("connect-src"), "connect-src directive required.");
            var connectSources = parsedDirectives["connect-src"];
            Assert.Contains("'self'", connectSources);
            Assert.Contains("https://step-viewer.local", connectSources);
            Assert.Contains("https://cad-stream.local", connectSources);
            Assert.Contains("https://api.github.com", connectSources);

            var disallowedConnectDomains = new[]
            {
                "*", "http:", "https://evil.com", "https://attacker.com",
                "https://cdn.jsdelivr.net", "https://raw.githubusercontent.com",
                "ws:", "wss:"
            };
            foreach (var disallowed in disallowedConnectDomains)
            {
                Assert.False(connectSources.Contains(disallowed), $"connect-src must NOT permit: {disallowed}");
            }

            // 6. Global Hygiene: No wildcard '*' in any directive
            foreach (var kvp in parsedDirectives)
            {
                Assert.False(kvp.Value.Contains("*"), $"Directive '{kvp.Key}' must not contain wildcard '*'.");
                Assert.False(kvp.Value.Any(v => v.StartsWith("http:", StringComparison.OrdinalIgnoreCase)),
                    $"Directive '{kvp.Key}' must not contain insecure 'http:' sources.");
            }
        }

        #endregion
    }
}
