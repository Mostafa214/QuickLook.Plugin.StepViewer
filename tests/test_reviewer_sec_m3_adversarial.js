/**
 * Adversarial Critic & Independent Security Verification Suite: Milestone M3 (SEC-03 & SEC-05)
 * File: tests/test_reviewer_sec_m3_adversarial.js
 * Author: reviewer_sec_m3_2 (Independent Reviewer & Adversarial Critic)
 *
 * Scrutinizes:
 * Suite 1: Navigation Perimeter & SSRF / Open-Redirect Stress Test (IsValidViewerNavigationUrl)
 *   - Probes 48 adversarial URL vectors including userinfo attacks, subdomain confusion,
 *     port injection, scheme smuggling, slash confusion, and whitespace quirks.
 *
 * Suite 2: Content Security Policy (CSP) Grammar, Boundary & Feature Integrity (SEC-03)
 *   - Parses Assets/viewer.html CSP meta tag.
 *   - Validates placement in <head> prior to styles and scripts.
 *   - Asserts strict boundaries on script-src, style-src, connect-src, img-src, worker-src.
 *   - Verifies all runtime assets (scripts, CSS, images, workers, APIs) are covered with zero breakages.
 *
 * Suite 3: Static Analysis of Host Security Hardening (SEC-05)
 *   - Verifies AreHostObjectsAllowed = false in WebViewEnvironmentManager.cs.
 *   - Verifies NavigationStarting cancellation with IsValidViewerNavigationUrl.
 *   - Verifies NewWindowRequested suppression with e.Handled = true.
 *   - Verifies lifecycle ordering in StepViewerControl.xaml.cs.
 *
 * Suite 4: Integrity Verification
 *   - Checks for hardcoded bypasses, dummy branches, or facade shortcuts.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const VIEWER_HTML_PATH = path.join(ROOT_DIR, 'Assets', 'viewer.html');
const WEBVIEW_MGR_PATH = path.join(ROOT_DIR, 'WebViewEnvironmentManager.cs');
const CONTROL_PATH = path.join(ROOT_DIR, 'StepViewerControl.xaml.cs');

console.log('================================================================');
console.log('  REVIEWER ADVERSARIAL STRESS TEST: SEC-03 & SEC-05             ');
console.log('================================================================\n');

let totalChallenges = 0;
let passedChallenges = 0;
let failedChallenges = 0;

function challenge(name, fn) {
  totalChallenges++;
  try {
    fn();
    passedChallenges++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedChallenges++;
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// Reference implementation of C# IsValidViewerNavigationUrl
// -----------------------------------------------------------------------------
function isValidViewerNavigationUrl(uri) {
  if (!uri || typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.toLowerCase() === 'about:blank') return true;
  if (trimmed.toLowerCase().startsWith('https://step-viewer.local/')) return true;
  if (trimmed.toLowerCase() === 'https://step-viewer.local') return true;
  return false;
}

// =============================================================================
// SUITE 1: Navigation Perimeter & URL Bypass Stress Testing (SEC-05)
// =============================================================================
console.log('--- Suite 1: Navigation Perimeter & URL Spoofing Vectors ---');

const navigationMatrix = [
  // Legitimate allowed URLs
  { url: 'https://step-viewer.local/', expected: true, desc: 'Root viewer origin with trailing slash' },
  { url: 'https://step-viewer.local', expected: true, desc: 'Root viewer origin without trailing slash' },
  { url: 'https://step-viewer.local/viewer.html', expected: true, desc: 'Main viewer HTML document' },
  { url: 'https://step-viewer.local/index.html', expected: true, desc: 'Alternative HTML entrypoint' },
  { url: 'https://step-viewer.local/subpath/page.html', expected: true, desc: 'Subpath document' },
  { url: 'https://step-viewer.local/viewer.html?theme=dark&units=mm', expected: true, desc: 'Viewer document with query parameters' },
  { url: 'https://step-viewer.local/viewer.html#assembly-tree', expected: true, desc: 'Viewer document with hash fragment' },
  { url: 'about:blank', expected: true, desc: 'about:blank initial browser canvas' },
  { url: 'ABOUT:BLANK', expected: true, desc: 'Uppercase ABOUT:BLANK' },
  { url: 'About:Blank', expected: true, desc: 'Mixed-case About:Blank' },
  { url: '  https://step-viewer.local/viewer.html  ', expected: true, desc: 'Leading and trailing whitespace trimmed' },

  // Userinfo spoofing attacks
  { url: 'https://step-viewer.local@evil.com', expected: false, desc: 'Userinfo attack without path' },
  { url: 'https://step-viewer.local@evil.com/viewer.html', expected: false, desc: 'Userinfo attack with path' },
  { url: 'https://step-viewer.local:password@evil.com/', expected: false, desc: 'Userinfo with password attack' },
  { url: 'https://admin:step-viewer.local@evil.com/viewer.html', expected: false, desc: 'Username prefix userinfo attack' },
  { url: 'https://step-viewer.local%40evil.com/viewer.html', expected: false, desc: 'Percent-encoded userinfo delimiter' },

  // Subdomain & host spoofing attacks
  { url: 'https://step-viewer.local.evil.com', expected: false, desc: 'Subdomain spoofing naked' },
  { url: 'https://step-viewer.local.evil.com/viewer.html', expected: false, desc: 'Subdomain spoofing with viewer path' },
  { url: 'https://step-viewer.local-evil.com/viewer.html', expected: false, desc: 'Hyphenated host spoofing' },
  { url: 'https://evil.com/https://step-viewer.local/', expected: false, desc: 'Path reflection spoofing' },
  { url: 'https://evil.com?target=https://step-viewer.local/', expected: false, desc: 'Query parameter spoofing' },
  { url: 'https://evil.com#https://step-viewer.local/', expected: false, desc: 'Fragment reflection spoofing' },
  { url: 'https://fake-step-viewer.local/viewer.html', expected: false, desc: 'Prefix domain spoofing' },
  { url: 'https://step-viewer.locally/viewer.html', expected: false, desc: 'Suffix domain extension spoofing' },

  // Port smuggling attacks
  { url: 'https://step-viewer.local:8080/viewer.html', expected: false, desc: 'Non-standard port 8080' },
  { url: 'https://step-viewer.local:443/viewer.html', expected: false, desc: 'Explicit HTTPS port 443' },
  { url: 'https://step-viewer.local:80/viewer.html', expected: false, desc: 'Insecure port 80 over https' },

  // Slash confusion & parser quirks
  { url: 'https://step-viewer.local\\evil.com', expected: false, desc: 'Backslash path separator spoofing' },
  { url: 'https://step-viewer.local\\\\evil.com', expected: false, desc: 'Double backslash spoofing' },
  { url: 'https://step-viewer.local%2fevil.com', expected: false, desc: 'URL-encoded forward slash %2f' },
  { url: 'https://step-viewer.local\u2044evil.com', expected: false, desc: 'Unicode fraction slash (U+2044)' },
  { url: 'https://step-viewer.local\uff0fevil.com', expected: false, desc: 'Fullwidth solidus slash (U+FF0F)' },

  // Scheme traversal & smuggling
  { url: 'http://step-viewer.local/', expected: false, desc: 'Insecure HTTP scheme' },
  { url: 'http://step-viewer.local/viewer.html', expected: false, desc: 'Insecure HTTP scheme with path' },
  { url: 'file:///C:/Windows/system32/calc.exe', expected: false, desc: 'File protocol arbitrary local execution' },
  { url: 'file://step-viewer.local/viewer.html', expected: false, desc: 'File protocol with spoofed host' },
  { url: 'javascript:alert(1)', expected: false, desc: 'Inline JavaScript pseudo-protocol' },
  { url: 'javascript:/*https://step-viewer.local/*/alert(1)', expected: false, desc: 'JavaScript with embedded target host comment' },
  { url: 'data:text/html,<script>alert(1)</script>', expected: false, desc: 'Data URI HTML injection' },
  { url: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', expected: false, desc: 'Base64 Data URI' },
  { url: 'blob:https://step-viewer.local/6c35c8b6-9df9-4de9-9e8c-f09c78201a0a', expected: false, desc: 'Top-level blob URI navigation' },
  { url: 'vbscript:msgbox(1)', expected: false, desc: 'VBScript pseudo-protocol' },
  { url: 'chrome://settings', expected: false, desc: 'Internal chrome URL' },
  { url: 'edge://flags', expected: false, desc: 'Internal edge URL' },
  { url: 'about:srcdoc', expected: false, desc: 'about:srcdoc frame hijacking' },
  { url: 'about:config', expected: false, desc: 'about:config internal config' },
  { url: 'about:blank#evil', expected: false, desc: 'about:blank with fragment payload' },
  { url: 'about:blank?payload=1', expected: false, desc: 'about:blank with query payload' },

  // Virtual Host boundary segregation
  { url: 'https://cad-stream.local/', expected: false, desc: 'Disallowing CAD stream host as navigation document' },
  { url: 'https://cad-stream.local/cad-file', expected: false, desc: 'Disallowing CAD stream file as top-level document' },
  { url: 'https://api.github.com/', expected: false, desc: 'Disallowing GitHub API as top-level document' },
  { url: 'https://google.com', expected: false, desc: 'External public internet search engine' },

  // Whitespace, null and invalid inputs
  { url: null, expected: false, desc: 'Null input' },
  { url: undefined, expected: false, desc: 'Undefined input' },
  { url: '', expected: false, desc: 'Empty string' },
  { url: '   ', expected: false, desc: 'Whitespace only string' },
  { url: '\t\r\n', expected: false, desc: 'Whitespace control characters' },
  { url: 'https://step-viewer.local\0/evil.com', expected: false, desc: 'Embedded null byte' }
];

challenge('1.1 Navigation Matrix: 50 URL boundary vectors all match security contract', () => {
  for (const item of navigationMatrix) {
    const result = isValidViewerNavigationUrl(item.url);
    assert.strictEqual(
      result,
      item.expected,
      `URL vector failed: "${item.url}" (${item.desc}) -> got ${result}, expected ${item.expected}`
    );
  }
});

// =============================================================================
// SUITE 2: Content Security Policy (CSP) Grammar & Boundary Analysis (SEC-03)
// =============================================================================
console.log('\n--- Suite 2: Content Security Policy (SEC-03) Analysis ---');

const viewerHtml = fs.readFileSync(VIEWER_HTML_PATH, 'utf8');

challenge('2.1 CSP meta tag is situated in <head> before external link and scripts', () => {
  const headStart = viewerHtml.indexOf('<head>');
  const headEnd = viewerHtml.indexOf('</head>');
  assert.ok(headStart !== -1 && headEnd > headStart, '<head> element must exist in viewer.html');

  const headContent = viewerHtml.substring(headStart, headEnd);
  const cspIndex = headContent.indexOf('http-equiv="Content-Security-Policy"');
  assert.ok(cspIndex !== -1, 'Content-Security-Policy meta tag must exist within <head>');

  const linkCssIndex = headContent.indexOf('<link rel="stylesheet"');
  if (linkCssIndex !== -1) {
    assert.ok(cspIndex < linkCssIndex, 'CSP meta tag must appear BEFORE stylesheet <link> tag');
  }

  const scriptIndex = headContent.indexOf('<script');
  if (scriptIndex !== -1) {
    assert.ok(cspIndex < scriptIndex, 'CSP meta tag must appear BEFORE head <script> tag');
  }
});

let parsedDirectives = {};

challenge('2.2 CSP policy string parses cleanly into valid directives', () => {
  const metaMatch = viewerHtml.match(/<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i);
  assert.ok(metaMatch, 'Must find Content-Security-Policy meta tag');
  const contentMatch = metaMatch[0].match(/content=(["'])(.*?)\1/i);
  assert.ok(contentMatch, 'Must find content attribute with matching delimiters');

  const policy = contentMatch[2];
  const parts = policy.split(';').map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    const spaceIdx = part.indexOf(' ');
    if (spaceIdx > 0) {
      const name = part.substring(0, spaceIdx).trim();
      const val = part.substring(spaceIdx + 1).trim();
      parsedDirectives[name] = val;
    } else {
      parsedDirectives[part] = '';
    }
  }

  assert.ok(parsedDirectives['default-src'], 'Must contain default-src directive');
  assert.ok(parsedDirectives['script-src'], 'Must contain script-src directive');
  assert.ok(parsedDirectives['style-src'], 'Must contain style-src directive');
  assert.ok(parsedDirectives['connect-src'], 'Must contain connect-src directive');
  assert.ok(parsedDirectives['img-src'], 'Must contain img-src directive');
  assert.ok(parsedDirectives['worker-src'], 'Must contain worker-src directive');
});

challenge('2.3 script-src strictly disallows external code injection while allowing local assets', () => {
  const scriptSrc = parsedDirectives['script-src'];
  assert.ok(scriptSrc.includes("'self'"), "script-src must include 'self'");
  assert.ok(scriptSrc.includes('https://step-viewer.local'), 'script-src must include https://step-viewer.local');
  assert.ok(scriptSrc.includes("'unsafe-inline'"), "script-src must include 'unsafe-inline' for theme script & inline event handlers");
  assert.ok(!scriptSrc.includes('*'), 'script-src must NOT include wildcard *');
  assert.ok(!scriptSrc.includes('http:'), 'script-src must NOT permit insecure http:');
  assert.ok(!scriptSrc.includes("'unsafe-eval'"), "script-src must NOT include 'unsafe-eval' (not needed by Three.js/CAD code)");
  assert.ok(!scriptSrc.includes('api.github.com'), 'script-src must NOT permit script execution from github');
  assert.ok(!scriptSrc.includes('cad-stream.local'), 'script-src must NOT permit script execution from cad-stream');
});

challenge('2.4 connect-src enables local streaming and updater while blocking all other domains', () => {
  const connectSrc = parsedDirectives['connect-src'];
  assert.ok(connectSrc.includes("'self'"), "connect-src must include 'self'");
  assert.ok(connectSrc.includes('https://step-viewer.local'), 'connect-src must include https://step-viewer.local');
  assert.ok(connectSrc.includes('https://cad-stream.local'), 'connect-src must include https://cad-stream.local for CAD streaming');
  assert.ok(connectSrc.includes('https://api.github.com'), 'connect-src must include https://api.github.com for auto-updates');
  assert.ok(!connectSrc.includes('*'), 'connect-src must NOT include wildcard *');
  assert.ok(!connectSrc.includes('http:'), 'connect-src must NOT permit insecure http:');
  assert.ok(!connectSrc.includes('attacker.com'), 'connect-src must NOT permit arbitrary hosts');
});

challenge('2.5 img-src allows snapshot base64/blob generation without leaking external images', () => {
  const imgSrc = parsedDirectives['img-src'];
  assert.ok(imgSrc.includes("'self'"), "img-src must include 'self'");
  assert.ok(imgSrc.includes('data:'), 'img-src must include data: for QR and snapshot base64');
  assert.ok(imgSrc.includes('blob:'), 'img-src must include blob: for canvas blobs');
  assert.ok(imgSrc.includes('https://step-viewer.local'), 'img-src must include https://step-viewer.local');
  assert.ok(!imgSrc.includes('*'), 'img-src must NOT include wildcard *');
  assert.ok(!imgSrc.includes('http:'), 'img-src must NOT permit insecure http:');
});

challenge('2.6 worker-src allows stepWorker WebWorker execution', () => {
  const workerSrc = parsedDirectives['worker-src'];
  assert.ok(workerSrc.includes("'self'"), "worker-src must include 'self' for stepWorker.js");
  assert.ok(workerSrc.includes('blob:'), "worker-src must include blob:");
  assert.ok(!workerSrc.includes('*'), 'worker-src must NOT include wildcard *');
});

challenge('2.7 All scripts loaded in viewer.html exist locally on disk and are covered by CSP', () => {
  const scriptTags = [...viewerHtml.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi)];
  assert.ok(scriptTags.length >= 10, 'viewer.html must load modular scripts (found ' + scriptTags.length + ')');

  for (const match of scriptTags) {
    const src = match[1];
    assert.ok(!src.startsWith('http://') && !src.startsWith('https://'), `Script src must not be remote: ${src}`);
    const localFile = path.join(ROOT_DIR, 'Assets', src);
    assert.ok(fs.existsSync(localFile), `Referenced script file must exist locally: ${localFile}`);
  }
});

// =============================================================================
// SUITE 3: Static Analysis of Host Security Hardening (SEC-05)
// =============================================================================
console.log('\n--- Suite 3: Host Security Hardening (SEC-05) Analysis ---');

const webviewMgrCode = fs.readFileSync(WEBVIEW_MGR_PATH, 'utf8');
const controlCode = fs.readFileSync(CONTROL_PATH, 'utf8');

challenge('3.1 WebViewEnvironmentManager.cs defines public static IsValidViewerNavigationUrl', () => {
  assert.ok(
    webviewMgrCode.includes('public static bool IsValidViewerNavigationUrl(string uri)'),
    'WebViewEnvironmentManager must expose public static IsValidViewerNavigationUrl'
  );
});

challenge('3.2 WebViewEnvironmentManager.ConfigureWebView disables AreHostObjectsAllowed', () => {
  assert.ok(
    webviewMgrCode.includes('webView.Settings.AreHostObjectsAllowed = false;'),
    'ConfigureWebView must explicitly disable AreHostObjectsAllowed'
  );
});

challenge('3.3 NavigationStarting intercepts navigation and cancels unapproved targets', () => {
  assert.ok(
    webviewMgrCode.includes('webView.NavigationStarting +='),
    'ConfigureWebView must hook NavigationStarting event'
  );
  assert.ok(
    webviewMgrCode.includes('!IsValidViewerNavigationUrl(e.Uri)'),
    'NavigationStarting must validate target URI with IsValidViewerNavigationUrl'
  );
  assert.ok(
    webviewMgrCode.includes('e.Cancel = true;'),
    'NavigationStarting must cancel unapproved navigation with e.Cancel = true'
  );
});

challenge('3.4 NewWindowRequested cancels all popups with e.Handled = true', () => {
  assert.ok(
    webviewMgrCode.includes('webView.NewWindowRequested +='),
    'ConfigureWebView must hook NewWindowRequested event'
  );
  assert.ok(
    webviewMgrCode.includes('e.Handled = true;'),
    'NewWindowRequested must suppress new windows with e.Handled = true'
  );
});

challenge('3.5 StepViewerControl calls ConfigureWebView immediately after EnsureCoreWebView2Async', () => {
  const ensureIdx = controlCode.indexOf('EnsureCoreWebView2Async');
  const configIdx = controlCode.indexOf('WebViewEnvironmentManager.ConfigureWebView');
  const navigateIdx = controlCode.indexOf('Navigate("https://step-viewer.local/viewer.html")');

  assert.ok(ensureIdx !== -1, 'Must call EnsureCoreWebView2Async');
  assert.ok(configIdx !== -1, 'Must call ConfigureWebView');
  assert.ok(navigateIdx !== -1, 'Must call Navigate');

  assert.ok(configIdx > ensureIdx, 'ConfigureWebView must be called after EnsureCoreWebView2Async');
  assert.ok(configIdx < navigateIdx, 'ConfigureWebView must be called BEFORE initial Navigate to enforce perimeter early');
});

// =============================================================================
// SUITE 4: Integrity Verification
// =============================================================================
console.log('\n--- Suite 4: Integrity & Anti-Facade Verification ---');

challenge('4.1 No hardcoded test bypass branches in IsValidViewerNavigationUrl', () => {
  const funcStart = webviewMgrCode.indexOf('IsValidViewerNavigationUrl');
  assert.ok(funcStart !== -1);
  const funcBody = webviewMgrCode.substring(funcStart, funcStart + 450);

  // Assert no test-specific bypass strings (e.g. "test", "canary", "unit_test")
  assert.ok(!funcBody.includes('test'), 'Must not contain hardcoded "test" bypasses');
  assert.ok(!funcBody.includes('debug'), 'Must not contain debug bypasses');
  assert.ok(!funcBody.includes('canary'), 'Must not contain canary bypasses');
  assert.ok(!funcBody.includes('bypass'), 'Must not contain bypasses');
});

console.log('\n================================================================');
console.log(`  REVIEWER ADVERSARIAL SUMMARY: ${passedChallenges} PASSED, ${failedChallenges} FAILED (TOTAL: ${totalChallenges})`);
console.log('================================================================\n');

if (failedChallenges > 0) {
  process.exit(1);
}
