/**
 * Automated Verification Suite: SEC-01 & SEC-04 Client-Side Sanitization
 * File: tests/test_sec01_sec04_sanitization.js
 *
 * Verifies:
 * Suite 1: Assembly Tree DOM XSS Prevention (SEC-01)
 *   - Payload 1: <script>alert('xss')</script>
 *   - Payload 2: <img src="x" onerror="window.pwned=true">
 *   - Payload 3: Body & "Special" 'Chars' <1>
 *   - Payload 4: Null, undefined, empty string
 *   - Payload 5: Attribute breakout payload (" onmouseover="alert(1))
 *   - Verification of rendered DOM text content vs innerHTML: scripts must not execute,
 *     tags must be escaped as plain text, textContent matches raw input.
 *
 * Suite 2: SVG Blueprint XML Well-Formedness & Injection Prevention (SEC-04)
 *   - Part name containing &, <, >, ", '
 *   - Injected SVG tags: </text><g id="xss"><circle r="50"/></g><text>
 *   - Injected XHTML script tags: <script xmlns="http://www.w3.org/1999/xhtml">alert(1)</script>
 *   - SVG XML parser test (DOMParser / strict XML validator) ensuring 0 errors and well-formedness.
 *   - Safe blueprint download filename sanitization (stripping <>:"/\|?*).
 *
 * Suite 3: Static Code Analysis & Defense-in-Depth
 *   - Assets/js/assemblyTree.js defines escapeHtml and uses safeName / textContent
 *   - Assets/js/blueprintSvgEngine.js defines escapeXml and escapes partName & totalMassText
 *   - Assets/js/appearancePopover.js sanitizes body names in <option> dropdown
 *
 * Suite 4: Direct Module Exports Verification
 *   - Direct invocation of escapeHtml from Assets/js/assemblyTree.js
 *   - Direct invocation of escapeXml from Assets/js/blueprintSvgEngine.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('  SEC-01 & SEC-04 AUTOMATED SANITIZATION TEST SUITE             ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// Reference Sanitization Functions (Specification Contract)
// -----------------------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// -----------------------------------------------------------------------------
// Lightweight High-Fidelity DOM Implementation for Node.js
// -----------------------------------------------------------------------------
class MockClassList {
  constructor() {
    this._classes = new Set();
  }
  add(...names) { names.forEach(n => n && this._classes.add(n)); }
  remove(...names) { names.forEach(n => this._classes.delete(n)); }
  toggle(name, force) {
    if (force === true) { this._classes.add(name); return true; }
    if (force === false) { this._classes.delete(name); return false; }
    if (this._classes.has(name)) { this._classes.delete(name); return false; }
    this._classes.add(name); return true;
  }
  contains(name) { return this._classes.has(name); }
  toString() { return Array.from(this._classes).join(' '); }
}

class MockDOMElement {
  constructor(tagName) {
    this.tagName = tagName ? tagName.toUpperCase() : 'DIV';
    this.id = '';
    this.className = '';
    this.classList = new MockClassList();
    this.attributes = {};
    this.style = {};
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this._innerHTML = '';
    this._textContent = '';
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = String(html);
    this.childNodes = [];

    // Parse simple elements from HTML to simulate DOM tree construction
    // Detect <script> tags or inline event handlers
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const scriptEl = new MockDOMElement('SCRIPT');
      scriptEl._textContent = match[1];
      scriptEl.parentNode = this;
      this.childNodes.push(scriptEl);
    }

    // Detect <img> tags with onerror / onload
    const imgRegex = /<img\b([^>]*)>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      const imgEl = new MockDOMElement('IMG');
      imgEl.parentNode = this;
      this.childNodes.push(imgEl);

      // Simulate inline event handler execution on DOM injection
      const attrStr = match[1];
      const onerrorMatch = /onerror=["']([^"']*)["']/i.exec(attrStr);
      if (onerrorMatch && typeof global.__simulateInlineEventHandler === 'function') {
        global.__simulateInlineEventHandler(onerrorMatch[1]);
      }
    }

    // Extract text elements with classes (e.g. tree-node-name)
    const spanRegex = /<span\s+class="tree-node-name"[^>]*>([\s\S]*?)<\/span>/i;
    const spanMatch = spanRegex.exec(html);
    if (spanMatch) {
      const spanEl = new MockDOMElement('SPAN');
      spanEl.className = 'tree-node-name';
      spanEl.classList.add('tree-node-name');
      spanEl.innerHTML = spanMatch[1];
      // HTML decode entity content into textContent
      spanEl._textContent = spanMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      spanEl.parentNode = this;
      this.childNodes.push(spanEl);
    }
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(text) {
    this._textContent = (text === null || text === undefined) ? '' : String(text);
    // Setting textContent updates innerHTML with properly escaped HTML
    this._innerHTML = escapeHtml(this._textContent);
  }

  get innerText() {
    return this.textContent;
  }

  set innerText(text) {
    this.textContent = text;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') {
      this.className = String(value);
      this.classList = new MockClassList();
      String(value).trim().split(/\s+/).forEach(c => this.classList.add(c));
    }
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  addEventListener(event, handler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const checkMatch = (node) => {
      if (!node || !node.tagName) return false;
      if (selector.startsWith('.') && node.classList.contains(selector.slice(1))) return true;
      if (selector.startsWith('#') && node.id === selector.slice(1)) return true;
      if (node.tagName.toLowerCase() === selector.toLowerCase()) return true;
      return false;
    };

    const traverse = (current) => {
      for (const child of current.childNodes) {
        if (checkMatch(child)) results.push(child);
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

// -----------------------------------------------------------------------------
// Strict XML Well-Formedness Parser / Mock DOMParser
// -----------------------------------------------------------------------------
class MockDOMParser {
  parseFromString(xmlString, mimeType) {
    const errors = this._validateXml(xmlString);
    return this._buildDoc(xmlString, errors);
  }

  _validateXml(xmlString) {
    const errors = [];
    if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
      errors.push('Empty or non-string XML input');
      return errors;
    }

    // 1. Check for naked '&' characters (XML fatal entity reference violation)
    const nakedAmpRegex = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g;
    let match;
    while ((match = nakedAmpRegex.exec(xmlString)) !== null) {
      errors.push(`XML Parsing Error: unescaped '&' at index ${match.index}`);
    }

    // 2. Tokenize tags and check tag stack / well-formedness
    let pos = 0;
    const tagStack = [];
    let rootCount = 0;

    while (pos < xmlString.length) {
      const nextTagStart = xmlString.indexOf('<', pos);
      if (nextTagStart === -1) break;
      pos = nextTagStart;

      // Skip comments
      if (xmlString.startsWith('<!--', pos)) {
        const commentEnd = xmlString.indexOf('-->', pos + 4);
        if (commentEnd === -1) { errors.push('Unclosed XML comment'); break; }
        pos = commentEnd + 3;
        continue;
      }

      // Skip processing instructions
      if (xmlString.startsWith('<?', pos)) {
        const piEnd = xmlString.indexOf('?>', pos + 2);
        if (piEnd === -1) { errors.push('Unclosed processing instruction'); break; }
        pos = piEnd + 2;
        continue;
      }

      // Skip CDATA
      if (xmlString.startsWith('<![CDATA[', pos)) {
        const cdataEnd = xmlString.indexOf(']]>', pos + 9);
        if (cdataEnd === -1) { errors.push('Unclosed CDATA'); break; }
        pos = cdataEnd + 3;
        continue;
      }

      const tagEnd = xmlString.indexOf('>', pos);
      if (tagEnd === -1) {
        errors.push(`Unclosed tag starting at index ${pos}`);
        break;
      }

      const tagContent = xmlString.slice(pos + 1, tagEnd).trim();
      pos = tagEnd + 1;

      if (tagContent.includes('<')) {
        errors.push(`Malformed tag containing '<': <${tagContent}>`);
        continue;
      }

      if (tagContent.startsWith('/')) {
        const closingName = tagContent.slice(1).trim().split(/\s+/)[0];
        if (tagStack.length === 0) {
          errors.push(`Unexpected closing tag </${closingName}> without open tag`);
        } else {
          const expected = tagStack.pop();
          if (expected !== closingName) {
            errors.push(`Mismatched closing tag: expected </${expected}>, got </${closingName}>`);
          }
        }
        continue;
      }

      const isSelfClosing = tagContent.endsWith('/');
      const cleanContent = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent;
      const tagName = cleanContent.split(/\s+/)[0];

      if (!/^[a-zA-Z_:][a-zA-Z0-9_\-:.]*$/.test(tagName)) {
        errors.push(`Invalid XML tag name: '${tagName}'`);
        continue;
      }

      const attrString = cleanContent.slice(tagName.length).trim();
      if (attrString) {
        let attrPos = 0;
        while (attrPos < attrString.length) {
          while (attrPos < attrString.length && /\s/.test(attrString[attrPos])) attrPos++;
          if (attrPos >= attrString.length) break;

          const eqIdx = attrString.indexOf('=', attrPos);
          if (eqIdx === -1) {
            errors.push(`Attribute missing '=' in tag <${tagName}>`);
            break;
          }
          const attrName = attrString.slice(attrPos, eqIdx).trim();
          const qChar = attrString[eqIdx + 1];
          if (qChar !== '"' && qChar !== "'") {
            errors.push(`Unquoted attribute value for '${attrName}' in <${tagName}>`);
            break;
          }
          const closeQ = attrString.indexOf(qChar, eqIdx + 2);
          if (closeQ === -1) {
            errors.push(`Unclosed quote in attribute '${attrName}' in <${tagName}>`);
            break;
          }
          const val = attrString.slice(eqIdx + 2, closeQ);
          if (val.includes('<')) {
            errors.push(`Unescaped '<' inside attribute '${attrName}' in <${tagName}>`);
          }
          attrPos = closeQ + 1;
        }
      }

      if (!isSelfClosing) {
        if (tagStack.length === 0) rootCount++;
        tagStack.push(tagName);
      }
    }

    if (tagStack.length > 0) {
      errors.push(`Unclosed XML tags remaining: ${tagStack.join(', ')}`);
    }
    if (rootCount === 0) {
      errors.push('No root XML element found');
    }

    return errors;
  }

  _buildDoc(xmlString, errors) {
    return {
      errors: errors,
      rawXml: xmlString,
      querySelector: (sel) => {
        if (sel === 'parsererror') {
          if (errors.length === 0) return null;
          const errEl = new MockDOMElement('parsererror');
          errEl.textContent = errors.join('; ');
          return errEl;
        }
        return null;
      }
    };
  }
}

// =============================================================================
// SUITE 1: Assembly Tree DOM XSS Prevention (SEC-01)
// =============================================================================
console.log('--- Suite 1: Assembly Tree DOM XSS Prevention (SEC-01) ---');

function simulateBuildTreeNode(body, useSanitization = true) {
  const node = new MockDOMElement('div');
  node.className = `tree-node`;
  node.id = `tree-node-${body.id}`;

  const colorHex = '#3b82f6';
  const volCm3 = '12.5';
  const facesCount = 6;
  const triCount = '120';

  const safeName = useSanitization ? escapeHtml(body.name) : body.name;

  node.innerHTML = `
    <div class="tree-node-top">
      <div class="tree-node-info" title="Double-click to Zoom, Click to Highlight">
        <span class="tree-color-swatch" style="background-color: ${colorHex};" title="Click to Change Body Color & 3D Print Material"></span>
        <span class="tree-node-name" title="${safeName}">${safeName}</span>
      </div>
      <div class="tree-node-actions">
        <button class="btn-tree-action btn-tree-vis active" title="Toggle Visibility [👁️]" data-id="${body.id}">👁️</button>
      </div>
    </div>
    <div class="tree-node-meta">
      <span>${volCm3} cm³</span>
      <span>•</span>
      <span>${facesCount} Faces</span>
      <span>•</span>
      <span>${triCount} Tri</span>
    </div>
  `;

  if (useSanitization) {
    const nameSpan = node.querySelector('.tree-node-name');
    if (nameSpan) {
      nameSpan.textContent = body.name;
    }
  }

  return node;
}

test('SEC-01 Payload 1: <script>alert(\'xss\')</script> is safely escaped as text and does not create <script> elements', () => {
  const payload = "<script>alert('xss')</script>";
  const body = { id: 1, name: payload };

  const node = simulateBuildTreeNode(body, true);

  assert.ok(!node.innerHTML.includes('<script>'), 'node.innerHTML must not contain literal <script>');
  assert.ok(node.innerHTML.includes('&lt;script&gt;'), 'node.innerHTML must escape <script> as &lt;script&gt;');

  const scripts = node.querySelectorAll('script');
  assert.strictEqual(scripts.length, 0, 'Zero <script> DOM elements must exist in tree node');

  const nameSpan = node.querySelector('.tree-node-name');
  assert.ok(nameSpan !== null, '.tree-node-name span must exist');
  assert.strictEqual(nameSpan.textContent, payload, 'textContent must match raw payload without code execution');
});

test('SEC-01 Payload 2: <img src="x" onerror="window.pwned=true"> neutralizes inline event handler execution', () => {
  let executionOccurred = false;
  global.__simulateInlineEventHandler = () => {
    executionOccurred = true;
  };

  const payload = '<img src="x" onerror="window.pwned=true">';
  const body = { id: 2, name: payload };

  const node = simulateBuildTreeNode(body, true);

  assert.strictEqual(executionOccurred, false, 'Inline onerror handler must not be triggered during DOM parsing');

  const imgs = node.querySelectorAll('img');
  assert.strictEqual(imgs.length, 0, 'Zero <img> DOM elements must exist in tree node');

  assert.ok(node.innerHTML.includes('&lt;img'), 'node.innerHTML must escape <img as &lt;img');
  assert.ok(node.innerHTML.includes('&quot;'), 'node.innerHTML must escape quotes as &quot;');

  const nameSpan = node.querySelector('.tree-node-name');
  assert.strictEqual(nameSpan.textContent, payload, 'textContent matches verbatim payload');

  delete global.__simulateInlineEventHandler;
});

test('SEC-01 Payload 3: Body & "Special" \'Chars\' <1> preserves XML/HTML entities without breakout', () => {
  const payload = 'Body & "Special" \'Chars\' <1>';
  const body = { id: 3, name: payload };

  const node = simulateBuildTreeNode(body, true);

  assert.ok(node.innerHTML.includes('Body &amp; &quot;Special&quot; &#39;Chars&#39; &lt;1&gt;'),
    'All five special HTML characters (&, <, >, ", \') must be escaped in markup');

  const nameSpan = node.querySelector('.tree-node-name');
  assert.strictEqual(nameSpan.textContent, payload, 'textContent must preserve exact plain text characters');
});

test('SEC-01 Payload 4: Null, undefined, and empty string handled gracefully without throwing or "null" text', () => {
  const cases = [null, undefined, ''];

  cases.forEach((val, idx) => {
    const body = { id: 10 + idx, name: val };
    const node = simulateBuildTreeNode(body, true);
    const nameSpan = node.querySelector('.tree-node-name');
    assert.ok(nameSpan !== null, `Node ${idx} nameSpan exists`);
    assert.strictEqual(nameSpan.textContent, '', `Null/undefined/empty must produce empty textContent, got "${nameSpan.textContent}"`);
    assert.ok(!node.innerHTML.includes('null') && !node.innerHTML.includes('undefined'),
      'Markup must not contain literal "null" or "undefined"');
  });
});

test('SEC-01 Payload 5: Attribute breakout payload " onmouseover="alert(1) is neutralized', () => {
  const payload = '" onmouseover="alert(1)';
  const body = { id: 5, name: payload };

  const node = simulateBuildTreeNode(body, true);
  assert.ok(node.innerHTML.includes('&quot; onmouseover=&quot;alert(1)'), 'Quotes must be escaped to prevent attribute injection');
  assert.ok(!node.innerHTML.includes('" onmouseover='), 'Raw attribute injection must not appear');
});

// =============================================================================
// SUITE 2: SVG Blueprint XML Well-Formedness & Injection Prevention (SEC-04)
// =============================================================================
console.log('\n--- Suite 2: SVG Blueprint XML Well-Formedness & Injection (SEC-04) ---');

function simulateGenerateBlueprintSvg(partNameInput, totalMassInput = '1.250 kg', useSanitization = true) {
  const safePartName = useSanitization ? escapeXml(partNameInput) : partNameInput;
  const safeMass = useSanitization ? escapeXml(totalMassInput) : totalMassInput;
  const curDate = '2026-11-09';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 848" width="1200" height="848">
  <defs>
    <marker id="arrow-start" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 10 0 L 0 5 L 10 10 z" fill="#0284c7" />
    </marker>
  </defs>
  <!-- Background Sheet -->
  <rect width="1200" height="848" fill="#ffffff" stroke="#0f172a" stroke-width="2" />

  <!-- ISO Standard Title Block -->
  <g id="iso-title-block" transform="translate(840, 683)">
    <rect width="330" height="135" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8" />
    <text x="12" y="24" font-size="14" font-weight="800" fill="#0f172a">QUICKLOOK CAD STUDIO</text>
    <text x="10" y="50" font-size="9" font-weight="600" fill="#64748b">PART TITLE:</text>
    <text x="10" y="64" font-size="11.5" font-weight="700" fill="#0284c7">${safePartName}</text>
    <text x="170" y="85" font-size="9" font-weight="600" fill="#64748b">EST. MASS:</text>
    <text x="170" y="99" font-size="10.5" font-weight="700" fill="#0f172a">${safeMass}</text>
    <text x="10" y="120" font-size="9" font-weight="600" fill="#64748b">DATE / REVISION:</text>
    <text x="10" y="131" font-size="10" font-weight="600" fill="#0f172a">${curDate} / REV 3.0</text>
  </g>
</svg>`;
}

const xmlParser = new MockDOMParser();

test('SEC-04: Part name containing &, <, >, ", \' parses as 100% valid XML with 0 parser errors', () => {
  const rawPartName = 'Bracket & "Lever" <v1.0> \'Draft\'';
  const svg = simulateGenerateBlueprintSvg(rawPartName, '2.500 kg', true);

  const doc = xmlParser.parseFromString(svg, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');

  assert.strictEqual(parserError, null, `Must have 0 XML parse errors, but got: ${parserError ? parserError.textContent : ''}`);
  assert.ok(svg.includes('Bracket &amp; &quot;Lever&quot; &lt;v1.0&gt; &apos;Draft&apos;'),
    'SVG title text must contain fully escaped XML entities');
});

test('SEC-04: Unescaped part name with & and < causes fatal XML parse error (reproducing vulnerability)', () => {
  const vulnerablePartName = 'Bracket & Lever <v1.0>';
  const unescapedSvg = simulateGenerateBlueprintSvg(vulnerablePartName, '2.500 kg', false);

  const doc = xmlParser.parseFromString(unescapedSvg, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');

  assert.ok(parserError !== null, 'Unescaped SVG must fail XML parsing');
  assert.ok(parserError.textContent.includes("unescaped '&'"), 'Parser error must flag unescaped ampersand');
});

test('SEC-04: Malicious SVG tag injection </text><g id="xss"> is neutralized as text entity', () => {
  const injection = '</text><g id="xss"><circle cx="50" cy="50" r="40" fill="red"/></g><text>';
  const svg = simulateGenerateBlueprintSvg(injection, '1.0 kg', true);

  const doc = xmlParser.parseFromString(svg, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  assert.strictEqual(parserError, null, `SVG markup must remain well-formed, got: ${parserError ? parserError.textContent : ''}`);

  assert.ok(!svg.includes('<circle'), 'Injected <circle> tag must not exist in SVG markup');
  assert.ok(svg.includes('&lt;/text&gt;&lt;g id=&quot;xss&quot;&gt;'), 'Injected tags must be escaped as entity strings');
});

test('SEC-04: Malicious XHTML script tag in SVG is neutralized', () => {
  const scriptPayload = '<script xmlns="http://www.w3.org/1999/xhtml">alert(1)</script>';
  const svg = simulateGenerateBlueprintSvg(scriptPayload, '1.0 kg', true);

  const doc = xmlParser.parseFromString(svg, 'image/svg+xml');
  assert.strictEqual(doc.querySelector('parsererror'), null, 'Well-formed XML');
  assert.ok(!svg.includes('<script'), 'Raw <script> tag must not appear in SVG');
  assert.ok(svg.includes('&lt;script'), 'Script tag must be escaped as &lt;script');
});

test('SEC-04: Blueprint export filename sanitizes invalid filesystem characters', () => {
  function sanitizeBlueprintFilename(rawFileName) {
    const rawBaseName = (rawFileName || 'CAD_Model').replace(/\.[^/.]+$/, "");
    const safeBaseName = rawBaseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const dateStr = '2026-11-09';
    return `${safeBaseName}_Blueprint_${dateStr}.svg`;
  }

  const maliciousFileName = 'CAD <Part>:"Special"|Test?.step';
  const safeFilename = sanitizeBlueprintFilename(maliciousFileName);

  assert.strictEqual(safeFilename, 'CAD _Part___Special__Test__Blueprint_2026-11-09.svg');
  assert.ok(!/[<>:"/\\|?*]/.test(safeFilename), 'Sanitized filename must not contain any forbidden Windows characters');
});

// =============================================================================
// SUITE 3: Static Code Analysis & Defense-in-Depth Checks
// =============================================================================
console.log('\n--- Suite 3: Static Code Analysis & Defense-in-Depth ---');

const repoRoot = fs.existsSync(path.resolve(__dirname, '../Assets'))
  ? path.resolve(__dirname, '..')
  : path.resolve(__dirname, '../../..');

const assemblyTreePath = path.join(repoRoot, 'Assets', 'js', 'assemblyTree.js');
const blueprintSvgPath = path.join(repoRoot, 'Assets', 'js', 'blueprintSvgEngine.js');
const popoverPath = path.join(repoRoot, 'Assets', 'js', 'appearancePopover.js');

test('Static check: Assets/js/assemblyTree.js defines escapeHtml and implements dual defense', () => {
  assert.ok(fs.existsSync(assemblyTreePath), `assemblyTree.js must exist at ${assemblyTreePath}`);
  const content = fs.readFileSync(assemblyTreePath, 'utf8');

  assert.ok(content.includes('function escapeHtml'), 'Must define escapeHtml');
  assert.ok(content.includes(".replace(/&/g, '&amp;')"), 'Must escape & to &amp;');
  assert.ok(content.includes(".replace(/</g, '&lt;')"), 'Must escape < to &lt;');
  assert.ok(content.includes(".replace(/>/g, '&gt;')"), 'Must escape > to &gt;');
  assert.ok(content.includes(".replace(/\"/g, '&quot;')"), 'Must escape " to &quot;');
  assert.ok(content.includes(".replace(/'/g, '&#39;')"), "Must escape ' to &#39;");
  assert.ok(content.includes('window.escapeHtml = escapeHtml'), 'Must export window.escapeHtml');
  assert.ok(!content.includes('<span class="tree-node-name">${b.name}</span>'), 'Must NOT have raw unescaped ${b.name}');
  assert.ok(content.includes('safeName = escapeHtml(b.name)'), 'Must sanitize b.name in template');
  assert.ok(content.includes('nameSpan.textContent = b.name'), 'Must set nameSpan.textContent (dual defense)');
});

test('Static check: Assets/js/blueprintSvgEngine.js defines escapeXml and sanitizes markup & filename', () => {
  assert.ok(fs.existsSync(blueprintSvgPath), `blueprintSvgEngine.js must exist at ${blueprintSvgPath}`);
  const content = fs.readFileSync(blueprintSvgPath, 'utf8');

  assert.ok(content.includes('function escapeXml'), 'Must define escapeXml');
  assert.ok(content.includes(".replace(/&/g, '&amp;')"), 'Must escape & to &amp;');
  assert.ok(content.includes(".replace(/</g, '&lt;')"), 'Must escape < to &lt;');
  assert.ok(content.includes(".replace(/>/g, '&gt;')"), 'Must escape > to &gt;');
  assert.ok(content.includes(".replace(/\"/g, '&quot;')"), 'Must escape " to &quot;');
  assert.ok(content.includes(".replace(/'/g, '&apos;')"), "Must escape ' to &apos; for XML");
  assert.ok(content.includes('escapeXml(rawPartName)'), 'Must escape partName');
  assert.ok(content.includes('escapeXml(rawMassText)'), 'Must escape massText');
  assert.ok(content.includes('safeBaseName'), 'Must compute safeBaseName for download');
  assert.ok(content.includes('escapeXml: escapeXml'), 'window.BlueprintSvg must export escapeXml');
});

test('Static check: Assets/js/appearancePopover.js sanitizes body names in option dropdown', () => {
  assert.ok(fs.existsSync(popoverPath), `appearancePopover.js must exist at ${popoverPath}`);
  const content = fs.readFileSync(popoverPath, 'utf8');

  assert.ok(content.includes('function escapeHtml'), 'Must define escapeHtml helper');
  assert.ok(!content.includes('html += `<option value="${b.id}">${b.name} ('), 'Must not interpolate raw b.name');
  assert.ok(content.includes('safeName = escapeHtml(b.name)'), 'Must sanitize b.name with escapeHtml');
});

// =============================================================================
// SUITE 4: Direct Export & Functional Execution Checks
// =============================================================================
console.log('\n--- Suite 4: Direct Export & Functional Execution Checks ---');

test('Direct Export: escapeHtml from assemblyTree.js handles payloads correctly', () => {
  const treeModule = require(assemblyTreePath);
  assert.strictEqual(typeof treeModule.escapeHtml, 'function', 'escapeHtml must be exported');

  assert.strictEqual(treeModule.escapeHtml(null), '');
  assert.strictEqual(treeModule.escapeHtml(undefined), '');
  assert.strictEqual(treeModule.escapeHtml(''), '');
  assert.strictEqual(treeModule.escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.strictEqual(treeModule.escapeHtml("Bolt & Nut 'Grade A' <10mm>"), "Bolt &amp; Nut &#39;Grade A&#39; &lt;10mm&gt;");
});

test('Direct Export: escapeXml from blueprintSvgEngine.js handles XML entities and numbers correctly', () => {
  const svgModule = require(blueprintSvgPath);
  assert.strictEqual(typeof svgModule.escapeXml, 'function', 'escapeXml must be exported');

  assert.strictEqual(svgModule.escapeXml(null), '');
  assert.strictEqual(svgModule.escapeXml(undefined), '');
  assert.strictEqual(svgModule.escapeXml(''), '');
  assert.strictEqual(svgModule.escapeXml(0), '0');
  assert.strictEqual(svgModule.escapeXml(12.34), '12.34');
  assert.strictEqual(svgModule.escapeXml('Bracket & Pinion <v1.0> "Final" \'Draft\''),
    'Bracket &amp; Pinion &lt;v1.0&gt; &quot;Final&quot; &apos;Draft&apos;');
});

// -----------------------------------------------------------------------------
// Test Summary Output
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
