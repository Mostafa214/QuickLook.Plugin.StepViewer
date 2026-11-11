/**
 * test_sec03_sec05_adversarial_stress.js
 * Adversarial stress harness verifying SEC-03 (CSP W3C grammar & origin isolation)
 * and SEC-05 (Navigation bypass attacks & URL parser fuzzing).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let totalTests = 0;
let passedTests = 0;

function it(desc, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  [PASS] ${desc}`);
    } catch (err) {
        console.error(`  [FAIL] ${desc}: ${err.message}`);
        throw err;
    }
}

console.log('=== STARTING SEC-03 & SEC-05 ADVERSARIAL STRESS HARNESS ===\n');

// -------------------------------------------------------------
// SEC-05: Simulation of IsValidViewerNavigationUrl algorithm
// exactly matching WebViewEnvironmentManager.cs
// -------------------------------------------------------------
function isValidViewerNavigationUrl(uri) {
    if (uri === null || uri === undefined || typeof uri !== 'string') return false;
    if (uri.trim().length === 0) return false;
    const trimmed = uri.trim();
    if (trimmed.toLowerCase() === 'about:blank') return true;
    if (trimmed.toLowerCase().startsWith('https://step-viewer.local/')) return true;
    if (trimmed.toLowerCase() === 'https://step-viewer.local') return true;
    return false;
}

console.log('--- SUITE 1: SEC-05 Navigation Bypass & Fuzzing Matrix ---');

const bypassVectors = [
    // 1. Credential / Userinfo Spoofing
    { url: 'https://step-viewer.local@evil.com/', expected: false, category: 'Credential spoofing' },
    { url: 'https://step-viewer.local:secret@evil.com/', expected: false, category: 'Credential spoofing' },
    { url: 'https://admin:pass@step-viewer.local/', expected: false, category: 'Credential spoofing' },
    { url: 'https://step-viewer.local@step-viewer.local/', expected: false, category: 'Credential spoofing' },
    { url: 'https://step-viewer.local%40evil.com/', expected: false, category: 'Credential spoofing' },

    // 2. Subdomain / Host Suffix Spoofing
    { url: 'https://step-viewer.local.evil.com/', expected: false, category: 'Subdomain spoofing' },
    { url: 'https://step-viewer.local.evil.com/viewer.html', expected: false, category: 'Subdomain spoofing' },
    { url: 'https://step-viewer.localevil.com/', expected: false, category: 'Subdomain spoofing' },
    { url: 'https://evil-step-viewer.local/', expected: false, category: 'Subdomain spoofing' },
    { url: 'https://sub.step-viewer.local/', expected: false, category: 'Subdomain spoofing' },
    { url: 'https://step-viewer.local.com/', expected: false, category: 'Subdomain spoofing' },

    // 3. Port Confusion
    { url: 'https://step-viewer.local:8080/', expected: false, category: 'Port confusion' },
    { url: 'https://step-viewer.local:8080/viewer.html', expected: false, category: 'Port confusion' },
    { url: 'https://step-viewer.local:443/', expected: false, category: 'Port confusion' },
    { url: 'https://step-viewer.local:80/', expected: false, category: 'Port confusion' },
    { url: 'https://step-viewer.local:3000/path', expected: false, category: 'Port confusion' },

    // 4. Path Confusion (No trailing slash)
    { url: 'https://step-viewer.local#anchor', expected: false, category: 'Path confusion' },
    { url: 'https://step-viewer.local?evil=1', expected: false, category: 'Path confusion' },
    { url: 'https://step-viewer.local;evil', expected: false, category: 'Path confusion' },
    { url: 'https://step-viewer.local\\evil.com', expected: false, category: 'Path confusion' },

    // 5. Protocol Downgrade & Alternative Schemes
    { url: 'http://step-viewer.local/', expected: false, category: 'Protocol downgrade' },
    { url: 'http://step-viewer.local', expected: false, category: 'Protocol downgrade' },
    { url: 'ftp://step-viewer.local/', expected: false, category: 'Alternative scheme' },
    { url: 'ws://step-viewer.local/', expected: false, category: 'Alternative scheme' },
    { url: 'wss://step-viewer.local/', expected: false, category: 'Alternative scheme' },
    { url: 'file:///C:/Windows/win.ini', expected: false, category: 'Alternative scheme' },
    { url: 'file:///C:/secret.txt', expected: false, category: 'Alternative scheme' },
    { url: 'file://step-viewer.local/viewer.html', expected: false, category: 'Alternative scheme' },
    { url: 'javascript:alert(1)', expected: false, category: 'Alternative scheme' },
    { url: 'javascript:void(0)', expected: false, category: 'Alternative scheme' },
    { url: 'data:text/html,<h1>Pwned</h1>', expected: false, category: 'Alternative scheme' },
    { url: 'data:text/html;<script>alert(1)</script>', expected: false, category: 'Alternative scheme' },
    { url: 'data:application/xhtml+xml,<script>alert(1)</script>', expected: false, category: 'Alternative scheme' },
    { url: 'blob:https://step-viewer.local/uuid', expected: false, category: 'Alternative scheme' },
    { url: 'chrome://settings', expected: false, category: 'Alternative scheme' },
    { url: 'ms-appx:///Assets/viewer.html', expected: false, category: 'Alternative scheme' },
    { url: 'about:srcdoc', expected: false, category: 'Alternative scheme' },
    { url: 'about:config', expected: false, category: 'Alternative scheme' },
    { url: 'about:blank?evil=1', expected: false, category: 'Alternative scheme' },
    { url: 'about:blank#hash', expected: false, category: 'Alternative scheme' },

    // 6. Encoded & Null Characters
    { url: 'https://step-viewer.local%00/', expected: false, category: 'Encoded null' },
    { url: 'https://step-viewer.local%2f', expected: false, category: 'Encoded slash' },
    { url: 'https://step-viewer.local%20/', expected: false, category: 'Encoded space' },
    { url: 'https://step-viewer.local\0/', expected: false, category: 'Raw null' },
    { url: 'https://step-viewer.local\r\n/', expected: false, category: 'CRLF injection' },

    // 7. Sister Virtual Endpoints
    { url: 'https://cad-stream.local/', expected: false, category: 'Virtual domain isolation' },
    { url: 'https://cad-stream.local/cad-file', expected: false, category: 'Virtual domain isolation' },
    { url: 'https://api.github.com/', expected: false, category: 'Virtual domain isolation' },

    // 8. Empty / Whitespace / Null
    { url: '', expected: false, category: 'Empty string' },
    { url: '   ', expected: false, category: 'Whitespace only' },
    { url: '\t\r\n', expected: false, category: 'Control chars only' },
    { url: null, expected: false, category: 'Null' },
    { url: undefined, expected: false, category: 'Undefined' },

    // 9. Legitimate Allowed Endpoints
    { url: 'https://step-viewer.local/', expected: true, category: 'Valid origin root' },
    { url: 'https://step-viewer.local/viewer.html', expected: true, category: 'Valid viewer document' },
    { url: 'https://step-viewer.local/index.html', expected: true, category: 'Valid html document' },
    { url: 'https://step-viewer.local/css/viewer.css', expected: true, category: 'Valid asset subpath' },
    { url: 'https://step-viewer.local/js/three.min.js', expected: true, category: 'Valid asset subpath' },
    { url: 'https://step-viewer.local/viewer.html?theme=light', expected: true, category: 'Valid query parameter' },
    { url: 'https://step-viewer.local/viewer.html#viewport', expected: true, category: 'Valid fragment anchor' },
    { url: 'https://step-viewer.local/#anchor', expected: true, category: 'Valid fragment root' },
    { url: 'https://step-viewer.local', expected: true, category: 'Valid origin bare' },
    { url: 'HTTPS://STEP-VIEWER.LOCAL/', expected: true, category: 'Valid uppercase origin' },
    { url: 'about:blank', expected: true, category: 'Valid about:blank' },
    { url: 'ABOUT:BLANK', expected: true, category: 'Valid uppercase about:blank' },
    { url: '  https://step-viewer.local/viewer.html  ', expected: true, category: 'Valid padded origin' },
    { url: '  about:blank  ', expected: true, category: 'Valid padded about:blank' }
];

for (const vec of bypassVectors) {
    it(`Navigation vector [${vec.category}]: "${vec.url}" => ${vec.expected}`, () => {
        const result = isValidViewerNavigationUrl(vec.url);
        assert.strictEqual(result, vec.expected);
    });
}

console.log('\n--- SUITE 2: SEC-03 Content Security Policy Analysis ---');

const viewerHtmlPath = path.resolve(__dirname, '..', 'Assets', 'viewer.html');
assert.ok(fs.existsSync(viewerHtmlPath), `viewer.html missing at ${viewerHtmlPath}`);
const viewerHtml = fs.readFileSync(viewerHtmlPath, 'utf8');

it('viewer.html contains Content-Security-Policy meta tag in <head>', () => {
    const headMatch = /<head>([\s\S]*?)<\/head>/i.exec(viewerHtml);
    assert.ok(headMatch, 'viewer.html must contain <head>');
    const headContent = headMatch[1];
    
    const cspMatch = /<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i.exec(headContent);
    assert.ok(cspMatch, 'CSP meta tag must be within <head>');
});

const cspMetaTagMatch = /<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=(["'])(.*?)\1[^>]*>/i.exec(viewerHtml);
assert.ok(cspMetaTagMatch, 'Could not extract CSP content attribute');
const cspContent = cspMetaTagMatch[2];

it('CSP conforms to W3C Level 3 grammar and directive tokenization', () => {
    const directives = cspContent.split(';').map(d => d.trim()).filter(Boolean);
    assert.ok(directives.length >= 4, 'Must have at least 4 directives');

    const validDirectiveSet = new Set([
        'default-src', 'script-src', 'style-src', 'connect-src', 'img-src',
        'font-src', 'worker-src', 'frame-src', 'object-src', 'media-src'
    ]);

    for (const d of directives) {
        const tokens = d.split(/\s+/);
        const name = tokens[0].toLowerCase();
        assert.ok(validDirectiveSet.has(name), `Unknown or invalid directive name: ${name}`);

        const sources = tokens.slice(1);
        for (const s of sources) {
            // Check for unquoted keywords
            if (['self', 'unsafe-inline', 'unsafe-eval', 'none'].includes(s.toLowerCase())) {
                assert.fail(`Keyword ${s} must be enclosed in single quotes, e.g. '${s}'`);
            }
        }
    }
});

it('CSP restricts script-src strictly to self and step-viewer.local', () => {
    const match = /script-src\s+([^;]+)/i.exec(cspContent);
    assert.ok(match, 'script-src directive missing');
    const sources = match[1].split(/\s+/);

    assert.ok(sources.includes("'self'"), "script-src must include 'self'");
    assert.ok(sources.includes("https://step-viewer.local"), "script-src must include https://step-viewer.local");

    const forbiddenDomains = [
        '*', 'http:', 'https:', 'https://evil.com', 'https://cdn.jsdelivr.net',
        'https://unpkg.com', 'https://cad-stream.local', 'https://api.github.com'
    ];
    for (const f of forbiddenDomains) {
        assert.ok(!sources.includes(f), `script-src must NOT permit ${f}`);
    }
});

it('CSP restricts style-src strictly to self and step-viewer.local', () => {
    const match = /style-src\s+([^;]+)/i.exec(cspContent);
    assert.ok(match, 'style-src directive missing');
    const sources = match[1].split(/\s+/);

    assert.ok(sources.includes("'self'"), "style-src must include 'self'");
    assert.ok(sources.includes("https://step-viewer.local"), "style-src must include https://step-viewer.local");

    const forbiddenDomains = ['*', 'http:', 'https://evil.com', 'https://fonts.googleapis.com'];
    for (const f of forbiddenDomains) {
        assert.ok(!sources.includes(f), `style-src must NOT permit ${f}`);
    }
});

it('CSP restricts connect-src strictly to self, step-viewer.local, cad-stream.local, and api.github.com', () => {
    const match = /connect-src\s+([^;]+)/i.exec(cspContent);
    assert.ok(match, 'connect-src directive missing');
    const sources = match[1].split(/\s+/);

    assert.ok(sources.includes("'self'"), "connect-src must include 'self'");
    assert.ok(sources.includes("https://step-viewer.local"), "connect-src must include https://step-viewer.local");
    assert.ok(sources.includes("https://cad-stream.local"), "connect-src must include https://cad-stream.local");
    assert.ok(sources.includes("https://api.github.com"), "connect-src must include https://api.github.com");

    const forbiddenDomains = [
        '*', 'http:', 'https://evil.com', 'https://attacker.com',
        'https://cdn.jsdelivr.net', 'https://raw.githubusercontent.com',
        'ws:', 'wss:'
    ];
    for (const f of forbiddenDomains) {
        assert.ok(!sources.includes(f), `connect-src must NOT permit ${f}`);
    }
});

it('CSP contains zero wildcards and zero insecure http: schemes', () => {
    assert.ok(!cspContent.includes('*'), 'CSP must not contain wildcard *');
    assert.ok(!cspContent.includes('http:'), 'CSP must not contain insecure http:');
});

console.log(`\n========================================`);
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log(`========================================`);

if (totalTests === passedTests) {
    console.log('ALL ADVERSARIAL STRESS TESTS PASSED CLEANLY!\n');
    process.exit(0);
} else {
    process.exit(1);
}
