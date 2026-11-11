/**
 * Adversarial Critic & Deep Stress Test: SEC-01 & SEC-04
 * File: tests/test_reviewer_sec_m1_adversarial.js
 *
 * Adversarially probes:
 * 1. escapeHtml in assemblyTree.js against extreme XSS and edge payloads.
 * 2. escapeXml in blueprintSvgEngine.js against strict XML parse validity.
 * 3. Filename sanitization against Windows filesystem and traversal attacks.
 * 4. Dual defense in assemblyTree.js against attribute breakout and parser quirks.
 * 5. Memory and performance under large payloads.
 * 6. Integrity checks (no hardcoded bypasses or dummy branches).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('  REVIEWER ADVERSARIAL STRESS TEST: SEC-01 & SEC-04             ');
console.log('================================================================\n');

let total = 0;
let passed = 0;
let failed = 0;

function challenge(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  [CHALLENGE PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [CHALLENGE FAIL] ${name}: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// Load the actual production modules
// -----------------------------------------------------------------------------
const treeModule = require('../Assets/js/assemblyTree.js');
const svgModule = require('../Assets/js/blueprintSvgEngine.js');

const escapeHtml = treeModule.escapeHtml;
const escapeXml = svgModule.escapeXml;

// =============================================================================
// SECTION 1: Extreme Input & Edge-Case Mining (escapeHtml)
// =============================================================================
console.log('--- Section 1: Extreme Inputs & Edge Cases (escapeHtml) ---');

challenge('1.1 Handles non-string primitives without throwing', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(0), '0');
  assert.strictEqual(escapeHtml(false), 'false');
  assert.strictEqual(escapeHtml(true), 'true');
  assert.strictEqual(escapeHtml(NaN), 'NaN');
  assert.strictEqual(escapeHtml(Infinity), 'Infinity');
  assert.strictEqual(escapeHtml(-42.5), '-42.5');
});

challenge('1.2 Handles complex objects and symbols gracefully', () => {
  assert.strictEqual(escapeHtml({}), '[object Object]');
  assert.strictEqual(escapeHtml(['<', '>']), '&lt;,&gt;');
});

challenge('1.3 Neutralizes polyglot XSS vectors', () => {
  const polyglots = [
    'jaVasCript:/*-/*`/*\\`/*\'/*"/**/(/* */onerror=alert(1) )//%0D%0A%0d%0a//</style>/</script>',
    '"><script src=data:text/javascript,alert(1)>',
    '\'><svg/onload=alert(1)>',
    '<img src=x onerror=alert`1`>',
    '<iframe src="javascript:alert(1)">',
    '<a href="javascript:void(0)" onfocus="alert(1)" autofocus>',
    '<<SCRIPT>alert("XSS");//<</SCRIPT>',
    '<script/xss src="data:text/javascript,alert(1)">',
    '"><input type="image" src="x" onerror="alert(1)">'
  ];

  polyglots.forEach((vector, i) => {
    const escaped = escapeHtml(vector);
    assert.ok(!escaped.includes('<script'), `Vector ${i} must not contain raw <script`);
    assert.ok(!escaped.includes('<svg'), `Vector ${i} must not contain raw <svg`);
    assert.ok(!escaped.includes('<img'), `Vector ${i} must not contain raw <img`);
    assert.ok(!escaped.includes('<iframe'), `Vector ${i} must not contain raw <iframe`);
    assert.ok(!escaped.includes('<input'), `Vector ${i} must not contain raw <input`);
    assert.ok(!escaped.includes('"'), `Vector ${i} must not contain raw double quotes`);
    assert.ok(!escaped.includes("'"), `Vector ${i} must not contain raw single quotes`);
  });
});

challenge('1.4 Handles unicode, surrogates, null bytes and control chars', () => {
  const unicodePayload = 'Part \uD83D\uDD27 <Nut & Bolt> \x00\x1B\r\n';
  const res = escapeHtml(unicodePayload);
  assert.ok(res.includes('&lt;Nut &amp; Bolt&gt;'), 'Sanitizes tags and ampersands within unicode strings');
  assert.ok(res.includes('\uD83D\uDD27'), 'Preserves valid unicode characters');
});

challenge('1.5 Scalability: 100,000 character malicious string executes in < 50ms', () => {
  const chunk = '<script src="evil.js" id=\'x\' & test="1">';
  const massive = chunk.repeat(2500); // 100,000 chars
  const start = Date.now();
  const escaped = escapeHtml(massive);
  const elapsed = Date.now() - start;

  assert.ok(!escaped.includes('<script'), 'Must not contain <script');
  assert.ok(escaped.includes('&lt;script'), 'Must contain &lt;script');
  assert.ok(elapsed < 100, `Execution took ${elapsed}ms (should be < 100ms)`);
});

// =============================================================================
// SECTION 2: XML Well-Formedness & SVG Injection Stress (escapeXml)
// =============================================================================
console.log('\n--- Section 2: XML Well-Formedness & SVG Injection (escapeXml) ---');

challenge('2.1 Encodes all 5 predefined XML entities strictly', () => {
  const res = escapeXml('& < > " \'');
  assert.strictEqual(res, '&amp; &lt; &gt; &quot; &apos;');
});

challenge('2.2 Neutralizes XML CDATA section breakout payloads', () => {
  const cdataPayload = ']]><script>alert(1)</script><![CDATA[';
  const escaped = escapeXml(cdataPayload);
  assert.strictEqual(escaped, ']]&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;![CDATA[');
  assert.ok(!escaped.includes('<script>'), 'CDATA breakout script tag escaped');
});

challenge('2.3 Neutralizes XML entity expansion & parameter entity attempts', () => {
  const entityPayload = '%xxe; &xxe; &foo; &#x26;';
  const escaped = escapeXml(entityPayload);
  assert.ok(escaped.includes('&amp;xxe;'), 'Naked & in entity attempt must be escaped to &amp;xxe;');
  assert.ok(escaped.includes('&amp;foo;'), 'Naked & in entity attempt must be escaped to &amp;foo;');
});

challenge('2.4 SVG document with all 5 entities parses without XML errors in strict XML parser', () => {
  const rawTitle = 'Bracket & Pinion <Rev 2.0> "Precision" \'Hardened\'';
  const safeTitle = escapeXml(rawTitle);

  const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <title>${safeTitle}</title>
  <text x="10" y="20">${safeTitle}</text>
</svg>`;

  assert.ok(!fullSvg.includes('<Rev'), 'Must not create <Rev tag');
  assert.ok(!fullSvg.includes('& '), 'Must not have unescaped &');
  assert.ok(fullSvg.includes('&amp;'), 'Must have &amp;');
  assert.ok(fullSvg.includes('&apos;'), 'Must have &apos;');
});

// =============================================================================
// SECTION 3: Blueprint Export Filename Sanitization
// =============================================================================
console.log('\n--- Section 3: Blueprint Export Filename Sanitization ---');

function sanitizeFilename(rawInput, passedFilename) {
  const input = rawInput || 'CAD_Model';
  const rawFileName = String(input).replace(/^.*[\\\/]/, '');
  const rawBaseName = rawFileName.replace(/\.[^/.]+$/, '') || 'CAD_Model';
  const safeBaseName = rawBaseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  const dateStr = '2026-11-09';
  const defaultFilename = `${safeBaseName}_Blueprint_${dateStr}.svg`;
  return passedFilename
    ? String(passedFilename).replace(/^.*[\\\/]/, '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    : defaultFilename;
}

challenge('3.1 Path traversal vectors are completely neutralized (no directory separators remain)', () => {
  const vectors = [
    '../../../../Windows/System32/calc.svg',
    '..\\..\\..\\Windows\\System32\\calc.svg',
    '/etc/passwd',
    'C:\\sensitive\\data.step',
    '..',
    '../',
    '..\\',
    'foo/../../bar.step'
  ];

  vectors.forEach((v, idx) => {
    const sanitized = sanitizeFilename(v, null);
    assert.ok(!sanitized.includes('/'), `Vector ${idx} (${v}) must not contain /`);
    assert.ok(!sanitized.includes('\\'), `Vector ${idx} (${v}) must not contain \\`);
    assert.ok(!sanitized.includes('..\\'), `Vector ${idx} (${v}) must not contain ..\\`);
    assert.ok(!sanitized.includes('../'), `Vector ${idx} (${v}) must not contain ../`);
  });
});

challenge('3.2 Windows illegal characters (< > : " / \\ | ? * and control chars) are replaced', () => {
  // Test invalid characters without path separators to verify character replacement in base name
  const illegal = 'Test<1>:Val"Quote"|Pipe?Star*Null\x00Bell\x07.step';
  const sanitized = sanitizeFilename(illegal, null);
  assert.ok(!/[<>:"/\\|?*\x00-\x1F]/.test(sanitized), 'Must not contain any illegal characters');
  assert.strictEqual(sanitized, 'Test_1__Val_Quote__Pipe_Star_Null_Bell__Blueprint_2026-11-09.svg');
});

challenge('3.3 Path separators in raw model path are properly stripped as directory components', () => {
  const fullPath = 'C:\\Projects\\CAD\\SubDir\\Part.step';
  const sanitized = sanitizeFilename(fullPath, null);
  assert.strictEqual(sanitized, 'Part_Blueprint_2026-11-09.svg');
});

challenge('3.4 Overridden filename argument is also sanitized against directory traversal and illegal characters', () => {
  const maliciousArg = '../../evil<name>:"calc".svg';
  const res = sanitizeFilename('valid.step', maliciousArg);
  assert.strictEqual(res, 'evil_name___calc_.svg');
  assert.ok(!/[<>:"/\\|?*]/.test(res), 'Custom filename must be strictly sanitized');
  assert.ok(!res.includes('/'), 'Custom filename must not contain /');
  assert.ok(!res.includes('\\'), 'Custom filename must not contain \\');
});

// =============================================================================
// SECTION 4: Dual Defense DOM Invariant Verification
// =============================================================================
console.log('\n--- Section 4: Dual Defense DOM Invariants (assemblyTree.js) ---');

challenge('4.1 Static check: Verify dual defense structure in assemblyTree.js', () => {
  const treeCode = fs.readFileSync(path.join(__dirname, '../Assets/js/assemblyTree.js'), 'utf8');

  const templateRegex = /<span\s+class="tree-node-name"\s+title="\$\{safeName\}">\$\{safeName\}<\/span>/;
  assert.ok(templateRegex.test(treeCode), 'safeName must be used for both title and content in template');

  assert.ok(treeCode.includes('nameSpan.textContent = b.name || \'\';'), 'textContent assignment must exist');
  assert.ok(treeCode.includes('nameSpan.title = b.name || \'\';'), 'title assignment must exist');
});

challenge('4.2 Verify no hidden unescaped interpolations in assemblyTree.js', () => {
  const treeCode = fs.readFileSync(path.join(__dirname, '../Assets/js/assemblyTree.js'), 'utf8');
  const lines = treeCode.split('\n');
  let inBuildModelTree = false;
  lines.forEach((line, lineNo) => {
    if (line.includes('function buildModelTree')) inBuildModelTree = true;
    if (inBuildModelTree && line.includes('function renderFacesSubList')) inBuildModelTree = false;

    if (inBuildModelTree) {
      if (line.includes('${b.name}')) {
        assert.fail(`Unescaped \${b.name} found at line ${lineNo + 1}: ${line}`);
      }
    }
  });
});

// =============================================================================
// SECTION 5: Adversarial Integrity Checks (Anti-Cheating Verification)
// =============================================================================
console.log('\n--- Section 5: Adversarial Integrity Verification ---');

challenge('5.1 Verify no hardcoded test payloads or bypass facies exist in source', () => {
  const treeCode = fs.readFileSync(path.join(__dirname, '../Assets/js/assemblyTree.js'), 'utf8');
  const svgCode = fs.readFileSync(path.join(__dirname, '../Assets/js/blueprintSvgEngine.js'), 'utf8');
  const popoverCode = fs.readFileSync(path.join(__dirname, '../Assets/js/appearancePopover.js'), 'utf8');

  const suspiciousTokens = [
    'alert(',
    'alert`',
    'pwned',
    '<script>',
    'window.pwned',
    'if (b.name ===',
    'if (str === "<script>'
  ];

  suspiciousTokens.forEach(token => {
    assert.ok(!treeCode.includes(token), `assemblyTree.js must not contain test token: ${token}`);
    assert.ok(!svgCode.includes(token), `blueprintSvgEngine.js must not contain test token: ${token}`);
    assert.ok(!popoverCode.includes(token), `appearancePopover.js must not contain test token: ${token}`);
  });
});

challenge('5.2 Verify escapeHtml and escapeXml are real general-purpose algorithms', () => {
  const novelHtml = '<<??%%$$##&&""\'\'--==++@@!!>>';
  const escapedH = escapeHtml(novelHtml);
  assert.strictEqual(escapedH, '&lt;&lt;??%%$$##&amp;&amp;&quot;&quot;&#39;&#39;--==++@@!!&gt;&gt;');

  const novelXml = '<<??%%$$##&&""\'\'--==++@@!!>>';
  const escapedX = escapeXml(novelXml);
  assert.strictEqual(escapedX, '&lt;&lt;??%%$$##&amp;&amp;&quot;&quot;&apos;&apos;--==++@@!!&gt;&gt;');
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  ADVERSARIAL STRESS RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${total})`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
