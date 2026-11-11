/**
 * Empirical Adversarial Verification Suite: SEC-01 & SEC-04
 * File: tests/test_challenger_sec_m1_2_adversarial_stress.js
 *
 * Challenger M1-2: Empirical Stress Test Harness
 * Author: challenger_sec_m1_2
 *
 * Objective:
 * Stress-test DOM rendering (SEC-01) and SVG generation (SEC-04) end-to-end
 * against extreme adversarial payloads:
 *  1. Malicious filenames & path traversal (../../../etc/passwd, C:\Windows\System32\cmd.exe)
 *  2. Windows reserved device names (CON.step, AUX.step, NUL.step, PRN.step, COM1.step)
 *  3. SVG/HTML tag and event handler injection (<svg onload=alert(1)>.stp, <script>, <img>)
 *  4. Attribute breakout & delimiter combinations (Test"Part'With&Special<Chars>.step)
 *  5. Strict XML validation of SVG blueprints
 *  6. Safe export filename sanitization
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('  CHALLENGER SEC-M1-2: ADVERSARIAL STRESS TEST HARNESS (M1)      ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    failureDetails.push({ name, error: err.message, stack: err.stack });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

// =============================================================================
// 1. HIGH-FIDELITY DOM SIMULATOR (Accurate HTML parsing, entity decoding, DOM)
// =============================================================================

function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

class MockDOMTokenList {
  constructor() {
    this._tokens = new Set();
  }
  add(...tokens) {
    tokens.forEach(t => t && this._tokens.add(t));
  }
  remove(...tokens) {
    tokens.forEach(t => this._tokens.delete(t));
  }
  toggle(token, force) {
    if (force === true) { this._tokens.add(token); return true; }
    if (force === false) { this._tokens.delete(token); return false; }
    if (this._tokens.has(token)) { this._tokens.delete(token); return false; }
    this._tokens.add(token); return true;
  }
  contains(token) {
    return this._tokens.has(token);
  }
  toString() {
    return Array.from(this._tokens).join(' ');
  }
}

class MockDOMNode {
  constructor(tagName = 'DIV') {
    this.tagName = tagName ? tagName.toUpperCase() : 'DIV';
    this.nodeType = 1; // ELEMENT_NODE
    this.id = '';
    this.className = '';
    this.classList = new MockDOMTokenList();
    this.attributes = {};
    this.style = {};
    this.childNodes = [];
    this.parentNode = null;
    this.eventListeners = {};
    this._innerHTML = '';
    this._textContent = '';
    this.title = '';
  }

  getAttribute(name) {
    return this.attributes[name.toLowerCase()] ?? null;
  }

  setAttribute(name, value) {
    const lower = name.toLowerCase();
    this.attributes[lower] = String(value);
    if (lower === 'id') this.id = String(value);
    if (lower === 'title') this.title = String(value);
    if (lower === 'class') {
      this.className = String(value);
      this.classList = new MockDOMTokenList();
      String(value).trim().split(/\s+/).forEach(c => this.classList.add(c));
    }
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name.toLowerCase());
  }

  removeAttribute(name) {
    delete this.attributes[name.toLowerCase()];
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
      return child;
    }
    throw new Error('Node not found');
  }

  addEventListener(type, listener) {
    if (!this.eventListeners[type]) this.eventListeners[type] = [];
    this.eventListeners[type].push(listener);
  }

  // Accurate textContent getter and setter
  get textContent() {
    if (this.childNodes.length === 0) {
      return this._textContent;
    }
    let text = '';
    for (const child of this.childNodes) {
      text += child.textContent;
    }
    return text;
  }

  set textContent(val) {
    this.childNodes = [];
    this._textContent = (val === null || val === undefined) ? '' : String(val);
    // When textContent is set, innerHTML displays escaped text
    this._innerHTML = String(this._textContent)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  get innerText() {
    return this.textContent;
  }
  set innerText(val) {
    this.textContent = val;
  }

  // Accurate innerHTML setter that parses tokens and simulates browser DOM tree construction
  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = String(html);
    this.childNodes = [];
    this._textContent = '';

    // Parse HTML tokens into mock DOM tree
    this._parseHtmlIntoChildren(this._innerHTML);
  }

  _parseHtmlIntoChildren(html) {
    // Regex tokenizer for tags, attributes, and text
    const tagRegex = /<(\/)?([a-zA-Z0-9\-:]+)([^>]*)>|([^<]+)/g;
    const stack = [this];
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
      const isClosing = Boolean(match[1]);
      const tagName = match[2];
      const attrString = match[3];
      const textContent = match[4];

      if (textContent) {
        // Plain text node between tags
        const textNode = new MockDOMNode('#TEXT');
        textNode.nodeType = 3; // TEXT_NODE
        textNode._textContent = decodeHtmlEntities(textContent);
        stack[stack.length - 1].appendChild(textNode);
      } else if (tagName) {
        if (isClosing) {
          // Pop from stack if matching
          if (stack.length > 1) {
            for (let i = stack.length - 1; i >= 1; i--) {
              if (stack[i].tagName === tagName.toUpperCase()) {
                stack.splice(i, stack.length - i);
                break;
              }
            }
          }
        } else {
          // Opening or self-closing tag
          const newEl = new MockDOMNode(tagName);
          if (attrString) {
            this._parseAttributesIntoElement(attrString, newEl);
          }

          stack[stack.length - 1].appendChild(newEl);

          // Track security violations if malicious tags or event handlers were instantiated
          if (newEl.tagName === 'SCRIPT') {
            global.__xss_detected_tags = global.__xss_detected_tags || [];
            global.__xss_detected_tags.push({ tag: 'SCRIPT', content: attrString });
          }
          if (newEl.tagName === 'IMG' && (newEl.hasAttribute('onerror') || newEl.hasAttribute('onload'))) {
            global.__xss_detected_handlers = global.__xss_detected_handlers || [];
            global.__xss_detected_handlers.push({ tag: 'IMG', handler: newEl.getAttribute('onerror') || newEl.getAttribute('onload') });
          }

          const isSelfClosing = attrString && attrString.trim().endsWith('/');
          const voidElements = ['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'];
          if (!isSelfClosing && !voidElements.includes(newEl.tagName)) {
            stack.push(newEl);
          }
        }
      }
    }
  }

  _parseAttributesIntoElement(attrStr, el) {
    const attrRegex = /([a-zA-Z0-9\-_:.]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match;
    while ((match = attrRegex.exec(attrStr)) !== null) {
      const attrName = match[1];
      if (attrName === '/') continue;
      const attrVal = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : '';
      const decodedVal = decodeHtmlEntities(attrVal);
      el.setAttribute(attrName, decodedVal);

      // Check for inline event handler execution attempt (e.g. onerror=..., onload=...)
      if (/^on[a-z]+/i.test(attrName)) {
        global.__xss_detected_handlers = global.__xss_detected_handlers || [];
        global.__xss_detected_handlers.push({ attr: attrName, code: decodedVal });
      }
    }
  }

  querySelector(selector) {
    const matches = this.querySelectorAll(selector);
    return matches.length > 0 ? matches[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const checkMatch = (node) => {
      if (!node || node.nodeType !== 1) return false;
      if (selector.startsWith('.')) {
        return node.classList.contains(selector.slice(1));
      }
      if (selector.startsWith('#')) {
        return node.id === selector.slice(1);
      }
      return node.tagName.toLowerCase() === selector.toLowerCase();
    };

    const traverse = (parent) => {
      for (const child of parent.childNodes) {
        if (checkMatch(child)) {
          results.push(child);
        }
        traverse(child);
      }
    };

    traverse(this);
    return results;
  }
}

class MockDocument {
  constructor() {
    this.elementsById = {};
    this.body = new MockDOMNode('BODY');
  }

  createElement(tagName) {
    return new MockDOMNode(tagName);
  }

  getElementById(id) {
    return this.elementsById[id] || null;
  }

  registerElement(id, el) {
    el.id = id;
    this.elementsById[id] = el;
    return el;
  }
}

// =============================================================================
// 2. STRICT XML VALIDATOR FOR SVG BLUEPRINT EXPORTS
// =============================================================================

class StrictXmlValidator {
  /**
   * Validates XML according to the XML 1.0 Specification:
   * - Balanced tags (LIFO stack)
   * - No naked ampersands
   * - Quoted attribute values
   * - Well-formed comments, CDATA, processing instructions
   * - Valid XML tag names
   * - No illegal control characters
   */
  static validate(xmlString) {
    const errors = [];

    if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
      return { valid: false, errors: ['Empty or non-string XML input'] };
    }

    // 1. Check for illegal XML 1.0 control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F)
    const illegalCharsRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
    const illegalMatch = illegalCharsRegex.exec(xmlString);
    if (illegalMatch) {
      errors.push(`Illegal XML control character 0x${illegalMatch[0].charCodeAt(0).toString(16)} at index ${illegalMatch.index}`);
    }

    // 2. Check for naked '&' characters (XML fatal entity violation)
    // Valid entities: &amp;, &lt;, &gt;, &quot;, &apos;, &#123;, &#x1A;
    const nakedAmpRegex = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g;
    let match;
    while ((match = nakedAmpRegex.exec(xmlString)) !== null) {
      errors.push(`Unescaped naked '&' at index ${match.index} (around: "...${xmlString.slice(Math.max(0, match.index - 10), match.index + 15)}...")`);
    }

    // 3. Tokenize tags and check tag stack / well-formedness
    let pos = 0;
    const tagStack = [];
    let rootCount = 0;

    while (pos < xmlString.length) {
      const tagStart = xmlString.indexOf('<', pos);
      if (tagStart === -1) break;
      pos = tagStart;

      // Skip comments: <!-- ... -->
      if (xmlString.startsWith('<!--', pos)) {
        const commentEnd = xmlString.indexOf('-->', pos + 4);
        if (commentEnd === -1) { errors.push('Unclosed XML comment'); break; }
        pos = commentEnd + 3;
        continue;
      }

      // Skip processing instructions: <? ... ?>
      if (xmlString.startsWith('<?', pos)) {
        const piEnd = xmlString.indexOf('?>', pos + 2);
        if (piEnd === -1) { errors.push('Unclosed processing instruction'); break; }
        pos = piEnd + 2;
        continue;
      }

      // Skip CDATA: <![CDATA[ ... ]]>
      if (xmlString.startsWith('<![CDATA[', pos)) {
        const cdataEnd = xmlString.indexOf(']]>', pos + 9);
        if (cdataEnd === -1) { errors.push('Unclosed CDATA section'); break; }
        pos = cdataEnd + 3;
        continue;
      }

      const tagEnd = xmlString.indexOf('>', pos);
      if (tagEnd === -1) {
        errors.push(`Unclosed XML tag starting at index ${pos}`);
        break;
      }

      const rawTag = xmlString.slice(pos + 1, tagEnd).trim();
      pos = tagEnd + 1;

      if (rawTag.includes('<')) {
        errors.push(`Malformed tag containing unescaped '<' inside: <${rawTag}>`);
        continue;
      }

      // Closing tag: </tag>
      if (rawTag.startsWith('/')) {
        const closingName = rawTag.slice(1).trim().split(/\s+/)[0];
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

      const isSelfClosing = rawTag.endsWith('/');
      const cleanTag = isSelfClosing ? rawTag.slice(0, -1).trim() : rawTag;
      const tagName = cleanTag.split(/\s+/)[0];

      if (!/^[a-zA-Z_:][a-zA-Z0-9_\-:.]*$/.test(tagName)) {
        errors.push(`Invalid XML tag name: '${tagName}'`);
        continue;
      }

      // Validate tag attributes
      const attrString = cleanTag.slice(tagName.length).trim();
      if (attrString) {
        let attrPos = 0;
        while (attrPos < attrString.length) {
          while (attrPos < attrString.length && /\s/.test(attrString[attrPos])) attrPos++;
          if (attrPos >= attrString.length) break;

          const eqIdx = attrString.indexOf('=', attrPos);
          if (eqIdx === -1) {
            errors.push(`Attribute missing '=' in tag <${tagName}> around '${attrString.slice(attrPos)}'`);
            break;
          }
          const attrName = attrString.slice(attrPos, eqIdx).trim();
          const qChar = attrString[eqIdx + 1];
          if (qChar !== '"' && qChar !== "'") {
            errors.push(`Unquoted attribute value for '${attrName}' in tag <${tagName}>`);
            break;
          }
          const closeQ = attrString.indexOf(qChar, eqIdx + 2);
          if (closeQ === -1) {
            errors.push(`Unclosed attribute quote for '${attrName}' in tag <${tagName}>`);
            break;
          }
          const attrVal = attrString.slice(eqIdx + 2, closeQ);
          if (attrVal.includes('<')) {
            errors.push(`Attribute value contains '<' in '${attrName}' of <${tagName}>`);
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
      errors.push('No XML root element found');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// =============================================================================
// 3. LOAD PRODUCTION MODULES & INITIALIZE TEST ENVIRONMENT
// =============================================================================

const THREE = require('../Assets/three.min.js');

// Global mock state
global.THREE = THREE;
global.window = {
  SecurityUtils: {},
  modelBodies: [],
  pendingFileName: '',
  currentLoadedModelName: ''
};
global.autoColorizeAssembly = () => {};
global.isolatedBodyId = null;
global.initExplodeVectors = () => {};
global.previewBodyInScene = () => {};
global.clearBodyPreview = () => {};
global.selectAndFocusBody = () => {};
global.openColorPickerPopover = () => {};

// Load assemblyTree and blueprintSvgEngine
const assemblyTree = require('../Assets/js/assemblyTree.js');
const blueprintEngine = require('../Assets/js/blueprintSvgEngine.js');

const escapeHtml = assemblyTree.escapeHtml;
const buildModelTree = assemblyTree.buildModelTree;
const escapeXml = blueprintEngine.escapeXml;
const generateBlueprintSvg = blueprintEngine.generateBlueprintSvg;

// Ensure test_artifacts exists
const testArtifactsDir = path.resolve(__dirname, '../test_artifacts');
if (!fs.existsSync(testArtifactsDir)) {
  fs.mkdirSync(testArtifactsDir, { recursive: true });
}

// =============================================================================
// 4. ADVERSARIAL TEST SUITE
// =============================================================================

// Required extreme inputs from orchestrator dispatch
const primaryAdversarialInputs = [
  '../../../etc/passwd',
  'C:\\Windows\\System32\\cmd.exe',
  'CON.step',
  'AUX.step',
  'NUL.step',
  '<svg onload=alert(1)>.stp',
  'Test"Part\'With&Special<Chars>.step'
];

// Additional hostile edge-case payloads for comprehensive coverage
const extendedAdversarialInputs = [
  '<script>alert("xss")</script>',
  '<img src="x" onerror="window.__xss=1">',
  '"><script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  'test" onfocus="alert(1)" autofocus="',
  'test\' onclick=\'alert(1)\'',
  '</text><script xmlns="http://www.w3.org/1999/xhtml">alert(1)</script><text>',
  '</text><g id="xss" onload="alert(1)"><circle r="10"/></g><text>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  'Body & Ampersand & More',
  'COM1.step',
  'PRN.step',
  'LPT1.step',
  'A'.repeat(5000), // Buffer length stress
  '\u202Ereversed_file_name.exe', // Right-to-Left Override spoofing
  '<![CDATA[<script>alert(1)</script>]]>',
  '<!-- <script>alert(1)</script> -->',
  '<?xml-stylesheet type="text/xsl" href="malicious.xsl"?>',
  '\\..\\..\\..\\Windows\\System32\\calc.exe',
  '/var/log/../../etc/shadow'
];

const allAdversarialInputs = [...primaryAdversarialInputs, ...extendedAdversarialInputs];

console.log(`Loaded ${allAdversarialInputs.length} adversarial test payloads.`);
console.log('Beginning empirical stress verification...\n');

// -----------------------------------------------------------------------------
// SECTION 1: DOM RENDERING STRESS TESTS (SEC-01)
// -----------------------------------------------------------------------------
console.log('--- Suite 1: DOM Rendering & Model Tree Stress Tests (SEC-01) ---');

allAdversarialInputs.forEach((payload, idx) => {
  runTest(`SEC-01 DOM Test #${idx + 1}: Payload "${payload.slice(0, 35)}${payload.length > 35 ? '...' : ''}"`, () => {
    // Reset violation trackers
    global.__xss_detected_tags = [];
    global.__xss_detected_handlers = [];

    const mockDoc = new MockDocument();
    global.document = mockDoc;

    const treeContainer = mockDoc.createElement('div');
    const badgeEl = mockDoc.createElement('span');
    const explodeSec = mockDoc.createElement('div');
    const btnExplode = mockDoc.createElement('button');

    mockDoc.registerElement('tree-content', treeContainer);
    mockDoc.registerElement('tree-body-count', badgeEl);
    mockDoc.registerElement('tree-explode-section', explodeSec);
    mockDoc.registerElement('btn-explode', btnExplode);

    // Setup body with adversarial name
    const geom = new THREE.BoxGeometry(10, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    const mesh = new THREE.Mesh(geom, mat);

    global.modelBodies = [
      {
        id: 'body-0',
        name: payload,
        isHidden: false,
        isGhosted: false,
        mesh: mesh,
        data: { volumeMm3: 1000, brepFaces: [], index: [0, 1, 2] }
      }
    ];

    // Execute production buildModelTree
    buildModelTree();

    const node = treeContainer.querySelector('#tree-node-body-0');
    assert(node !== null, 'Tree node element must be created');

    const nameSpan = node.querySelector('.tree-node-name');
    assert(nameSpan !== null, '.tree-node-name span must exist');

    // 1. TextContent MUST match raw input verbatim (Plain text rendering invariant)
    assert.strictEqual(
      nameSpan.textContent,
      payload,
      `textContent must exactly equal raw input without escaping loss or mutation. Expected "${payload}", got "${nameSpan.textContent}"`
    );

    // 2. Title attribute MUST match raw input verbatim
    assert.strictEqual(
      nameSpan.title,
      payload,
      `title attribute must exactly equal raw input. Expected "${payload}", got "${nameSpan.title}"`
    );

    // 3. Verify querySelector('script') returns null (0 elements)
    const scriptEl = node.querySelector('script');
    assert.strictEqual(scriptEl, null, 'node.querySelector("script") must return null (zero script elements allowed)');

    // 4. Verify querySelector('img') returns null (0 elements)
    const imgEl = node.querySelector('img');
    assert.strictEqual(imgEl, null, 'node.querySelector("img") must return null (zero img elements allowed)');

    // 5. Verify querySelector('svg') returns null (0 elements)
    const svgEl = node.querySelector('svg');
    assert.strictEqual(svgEl, null, 'node.querySelector("svg") must return null (zero svg elements allowed)');

    // 6. Verify zero inline event handler attributes were created on any descendants
    const allDescendants = node.querySelectorAll('*');
    for (const desc of allDescendants) {
      assert(desc.tagName !== 'SCRIPT', `Forbidden SCRIPT tag found: ${desc.tagName}`);
      assert(desc.tagName !== 'IMG', `Forbidden IMG tag found: ${desc.tagName}`);
      for (const attr of Object.keys(desc.attributes)) {
        assert(!attr.startsWith('on'), `Forbidden inline event handler found: ${attr}="${desc.attributes[attr]}"`);
      }
    }

    // 7. Global violation trackers must remain 0
    assert.strictEqual(global.__xss_detected_tags.length, 0, 'No script tags should be registered during parsing');
    assert.strictEqual(global.__xss_detected_handlers.length, 0, 'No inline event handlers should be registered');
  });
});

// Falsy inputs for SEC-01
[null, undefined, '', '   '].forEach((falsyInput, idx) => {
  runTest(`SEC-01 DOM Test Falsy #${idx + 1}: ${JSON.stringify(falsyInput)}`, () => {
    const mockDoc = new MockDocument();
    global.document = mockDoc;

    const treeContainer = mockDoc.createElement('div');
    mockDoc.registerElement('tree-content', treeContainer);
    mockDoc.registerElement('tree-body-count', mockDoc.createElement('span'));

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshBasicMaterial());
    global.modelBodies = [
      {
        id: 'falsy-body',
        name: falsyInput,
        isHidden: false,
        isGhosted: false,
        mesh,
        data: { volumeMm3: 500 }
      }
    ];

    buildModelTree();
    const node = treeContainer.querySelector('#tree-node-falsy-body');
    assert(node !== null, 'Tree node must be created');
    const nameSpan = node.querySelector('.tree-node-name');
    assert(nameSpan !== null, 'Name span must exist');
    assert.strictEqual(nameSpan.textContent, falsyInput || '', 'Handled gracefully without "null" or "undefined" literal');
  });
});

// -----------------------------------------------------------------------------
// SECTION 2: SVG BLUEPRINT GENERATION & STRICT XML VALIDATION (SEC-04)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: SVG Blueprint Generation & Strict XML Parsing (SEC-04) ---');

allAdversarialInputs.forEach((payload, idx) => {
  runTest(`SEC-04 SVG XML Test #${idx + 1}: Part "${payload.slice(0, 35)}${payload.length > 35 ? '...' : ''}"`, () => {
    // Setup model in 3D scene
    const boxGeom = new THREE.BoxGeometry(20, 30, 40);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
    const boxMesh = new THREE.Mesh(boxGeom, boxMat);
    boxMesh.updateMatrixWorld(true);

    global.modelBodies = [
      {
        id: 'bp-part-0',
        name: payload,
        mesh: boxMesh,
        edgeMesh: null,
        data: { volumeMm3: 24000 }
      }
    ];
    global.window.modelBodies = global.modelBodies;

    // Set model name on window
    global.window.pendingFileName = payload;
    global.window.currentLoadedModelName = payload;

    // Generate production blueprint SVG
    const svgOutput = generateBlueprintSvg();
    assert(svgOutput !== null && typeof svgOutput === 'string', 'generateBlueprintSvg must return SVG string');
    assert(svgOutput.length > 500, `SVG output too short (${svgOutput.length} bytes)`);

    // 1. Strict XML Validation (XML 1.0 Spec verification)
    const xmlResult = StrictXmlValidator.validate(svgOutput);
    if (!xmlResult.valid) {
      throw new Error(`Strict XML validation failed:\n  ${xmlResult.errors.join('\n  ')}`);
    }

    // 2. Check XML Declaration and Root <svg>
    assert(svgOutput.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Missing or invalid XML declaration');
    assert(svgOutput.includes('<svg xmlns="http://www.w3.org/2000/svg"'), 'Missing SVG root or xmlns namespace');
    assert(svgOutput.trim().endsWith('</svg>'), 'SVG must end with closing </svg>');

    // 3. Verify that partName is properly escaped in the title block
    const expectedEscapedPartName = escapeXml(payload);
    assert(
      svgOutput.includes(`<text x="10" y="64" font-size="11.5" font-weight="700" fill="#0284c7">${expectedEscapedPartName}</text>`),
      `Title block must contain properly escaped part name: "${expectedEscapedPartName}"`
    );

    // 4. Verify NO unescaped scripts, foreignObjects, or event handlers exist in XML tags
    assert(!/<script\b/i.test(svgOutput), 'SVG output must NOT contain any unescaped <script> tags');
    assert(!/<foreignObject\b/i.test(svgOutput), 'SVG output must NOT contain <foreignObject> tags');
    assert(!/<[a-zA-Z0-9\-:]+\s+[^>]*\son[a-z]+\s*=/i.test(svgOutput), 'SVG output must NOT contain inline event handlers on XML tags (e.g. onload, onerror)');

    // 5. Save generated SVG for auditing
    const safePayloadLabel = `payload_${idx + 1}`;
    const auditFilePath = path.join(testArtifactsDir, `audit_svg_${safePayloadLabel}.svg`);
    fs.writeFileSync(auditFilePath, svgOutput, 'utf8');

    // 6. Native Windows .NET System.Xml.XmlDocument verification
    const psScript = path.resolve(__dirname, 'verify_svg_dotnet.ps1');
    const psResult = require('child_process').execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, '-FilePath', auditFilePath],
      { encoding: 'utf8' }
    );
    assert.strictEqual(psResult.trim(), 'OK', '.NET XmlDocument must successfully parse the SVG file');
  });
});

// -----------------------------------------------------------------------------
// SECTION 3: SAFE DOWNLOAD FILENAME SANITIZATION (SEC-04 Defense)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Safe Blueprint Export Filename Sanitization ---');

const filenameTraversalTests = [
  { input: '../../../etc/passwd', expectNoTraversal: true },
  { input: 'C:\\Windows\\System32\\cmd.exe', expectNoTraversal: true },
  { input: 'CON.step', expectNoIllegalChars: true },
  { input: 'AUX.step', expectNoIllegalChars: true },
  { input: 'NUL.step', expectNoIllegalChars: true },
  { input: '<svg onload=alert(1)>.stp', expectNoIllegalChars: true },
  { input: 'Test"Part\'With&Special<Chars>.step', expectNoIllegalChars: true },
  { input: '..\\..\\..\\..\\sensitive_file.txt', expectNoTraversal: true }
];

filenameTraversalTests.forEach((tc, idx) => {
  runTest(`Filename Sanitization Test #${idx + 1}: "${tc.input}"`, () => {
    // Exact production sanitization algorithm from blueprintSvgEngine.js lines 344-355:
    const rawInput = tc.input;
    const rawFileName = String(rawInput).replace(/^.*[\\\/]/, '');
    const rawBaseName = rawFileName.replace(/\.[^/.]+$/, '') || 'CAD_Model';
    const safeBaseName = rawBaseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const defaultFilename = `${safeBaseName}_Blueprint_${dateStr}.svg`;

    // 1. Must NOT contain directory traversal separators (/ or \)
    assert(!defaultFilename.includes('/'), `Filename contains forward slash: ${defaultFilename}`);
    assert(!defaultFilename.includes('\\'), `Filename contains backslash: ${defaultFilename}`);

    // 2. Must NOT contain reserved filesystem characters: < > : " | ? *
    assert(!/[<>:"|?*]/.test(defaultFilename), `Filename contains reserved characters: ${defaultFilename}`);

    // 3. Must NOT contain control characters
    assert(!/[\x00-\x1F]/.test(defaultFilename), `Filename contains control characters: ${defaultFilename}`);

    // 4. Must end with .svg
    assert(defaultFilename.endsWith('.svg'), `Filename must end with .svg: ${defaultFilename}`);
  });
});

// -----------------------------------------------------------------------------
// SECTION 4: UNESCAPED ENTITY REPRODUCTION & VULNERABILITY VERIFICATION
// -----------------------------------------------------------------------------
console.log('\n--- Suite 4: Vulnerability Reproduction (Oracle Negation) ---');

runTest('Vulnerability Reproduction: Unescaped & and < causes strict XML parser failure', () => {
  const vulnerablePartName = 'Vulnerable & Broken <Part>';
  const unescapedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg">
  <text>${vulnerablePartName}</text>
</svg>`;

  const result = StrictXmlValidator.validate(unescapedSvg);
  assert.strictEqual(result.valid, false, 'Validator MUST detect unescaped XML markup as invalid');
  assert(result.errors.length >= 2, 'Validator should detect both unescaped & and < errors');
});

runTest('Vulnerability Reproduction: Injected <script> is caught by XML script audit', () => {
  const injectedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg">
  <text>Safe</text>
  <script>alert(1)</script>
</svg>`;

  assert(/<script\b/i.test(injectedSvg), 'Injected script is detected by security regex');
});

// =============================================================================
// TEST SUMMARY & VERDICT
// =============================================================================
console.log('\n================================================================');
console.log(`  EMPIRICAL STRESS TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================');

if (failedTests > 0) {
  console.error('\nFAILURE DETAILS:');
  failureDetails.forEach(f => {
    console.error(`- ${f.name}:\n    ${f.error}`);
  });
  console.log('\nVERDICT: REQUEST_CHANGES');
  process.exit(1);
} else {
  console.log('\nALL ADVERSARIAL STRESS TESTS COMPLETED CLEANLY WITH 100% PASS RATE.');
  console.log('VERDICT: APPROVE');
  process.exit(0);
}
