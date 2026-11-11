/**
 * Headless CAD Sandbox & E2E Test Harness
 * File: tests/stl_test_harness.js
 *
 * Provides a zero-dependency headless Node.js browser and Three.js runtime
 * with isolated VM contexts for opaque-box E2E testing of QuickLook STL Native Support.
 *
 * Components:
 * 1. Mock DOM Hierarchy (MockClassList, MockDOMElement, MockDocument, MockCanvasRenderingContext2D)
 * 2. Headless CAD Environment Factory (createCadEnvironment)
 * 3. High-Precision Numerical Assertion Framework (assertCloseTo, assertDeepCloseTo, assertEqual, assertTrue, assertThrows)
 * 4. Multi-Tier Hierarchical Test Runner (describe, test/it, summary reporting, process exit code management)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const THREE_PATH = fs.existsSync(path.resolve(__dirname, '../Assets/three.min.js'))
  ? path.resolve(__dirname, '../Assets/three.min.js')
  : path.resolve(process.cwd(), 'Assets/three.min.js');

let THREE = null;
try {
  THREE = require(THREE_PATH);
} catch (e) {
  // Graceful fallback if THREE is supplied externally
}

// ============================================================================
// 1. ASSERTION FRAMEWORK
// ============================================================================

let totalAssertionsPassed = 0;
let totalAssertionsFailed = 0;

function recordPass() {
  totalAssertionsPassed++;
}

function recordFail(err) {
  totalAssertionsFailed++;
  throw err;
}

/**
 * Asserts that a condition evaluates to truthy.
 * @param {boolean} condition
 * @param {string} msg
 */
function assertTrue(condition, msg = '') {
  if (!condition) {
    const errorMsg = msg ? `Assertion failed: ${msg}` : 'Assertion failed: expected condition to be truthy';
    const err = new assert.AssertionError({ message: errorMsg, actual: false, expected: true, operator: '==' });
    recordFail(err);
  }
  recordPass();
}

/**
 * Asserts strict equality between two values.
 * @param {*} actual
 * @param {*} expected
 * @param {string} msg
 */
function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    const errorMsg = msg ? `Assertion failed: ${msg} (expected ${expected}, got ${actual})` : `Expected ${expected}, got ${actual}`;
    const err = new assert.AssertionError({ message: errorMsg, actual, expected, operator: '===' });
    recordFail(err);
  }
  recordPass();
}

/**
 * Asserts that a numerical value is within epsilon of expected value.
 * @param {number} actual
 * @param {number} expected
 * @param {number} epsilon
 * @param {string} msg
 */
function assertCloseTo(actual, expected, epsilon = 1e-5, msg = '') {
  if (Number.isNaN(actual) || Number.isNaN(expected)) {
    const errorMsg = `${msg ? msg + ' - ' : ''}Expected ${expected} ± ${epsilon}, received ${actual} (Value is NaN)`;
    const err = new assert.AssertionError({ message: errorMsg, actual, expected, operator: 'closeTo' });
    recordFail(err);
  }
  const diff = Math.abs(actual - expected);
  if (diff > epsilon) {
    const errorMsg = `${msg ? msg + ' - ' : ''}Expected ${expected} ± ${epsilon}, received ${actual} (diff: ${diff.toExponential(4)})`;
    const err = new assert.AssertionError({ message: errorMsg, actual, expected, operator: 'closeTo' });
    recordFail(err);
  }
  recordPass();
}

/**
 * Recursively asserts deep closeness for structures containing numerical values.
 * @param {*} actual
 * @param {*} expected
 * @param {number} epsilon
 * @param {string} msg
 */
function assertDeepCloseTo(actual, expected, epsilon = 1e-5, msg = '') {
  if (Number.isNaN(actual) || Number.isNaN(expected)) {
    assertCloseTo(actual, expected, epsilon, msg);
    return;
  }

  if (typeof actual === 'number' && typeof expected === 'number') {
    assertCloseTo(actual, expected, epsilon, msg);
    return;
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      const errorMsg = `${msg ? msg + ' - ' : ''}Array length mismatch: expected ${expected.length}, got ${actual.length}`;
      const err = new assert.AssertionError({ message: errorMsg, actual: actual.length, expected: expected.length, operator: '===' });
      recordFail(err);
    }
    for (let i = 0; i < actual.length; i++) {
      assertDeepCloseTo(actual[i], expected[i], epsilon, `${msg}[${i}]`);
    }
    return;
  }

  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const expectedKeys = Object.keys(expected);
    for (const key of expectedKeys) {
      if (!(key in actual)) {
        const errorMsg = `${msg ? msg + ' - ' : ''}Missing expected key "${key}" in actual object`;
        const err = new assert.AssertionError({ message: errorMsg, actual, expected, operator: 'in' });
        recordFail(err);
      }
      assertDeepCloseTo(actual[key], expected[key], epsilon, `${msg}.${key}`);
    }
    return;
  }

  assertEqual(actual, expected, msg);
}

/**
 * Asserts that a function throws an error matching the expected pattern or constructor.
 * @param {Function} fn
 * @param {RegExp|string|Function} expectedError
 * @param {string} msg
 */
function assertThrows(fn, expectedError = null, msg = '') {
  let threw = false;
  let caughtError = null;
  try {
    fn();
  } catch (err) {
    threw = true;
    caughtError = err;
  }

  if (!threw) {
    const errorMsg = `${msg ? msg + ' - ' : ''}Expected function to throw, but it succeeded without error`;
    const err = new assert.AssertionError({ message: errorMsg, actual: 'no error', expected: 'error', operator: 'throws' });
    recordFail(err);
  }

  if (expectedError) {
    const errMsg = (caughtError && typeof caughtError === 'object' && caughtError.message !== undefined)
      ? caughtError.message
      : String(caughtError);
    const errName = (caughtError && typeof caughtError === 'object' && caughtError.name !== undefined)
      ? caughtError.name
      : '';

    if (expectedError instanceof RegExp) {
      if (!expectedError.test(errMsg) && !expectedError.test(errName)) {
        const errorMsg = `${msg ? msg + ' - ' : ''}Error message "${errMsg}" did not match regex ${expectedError}`;
        const err = new assert.AssertionError({ message: errorMsg, actual: errMsg, expected: expectedError, operator: 'match' });
        recordFail(err);
      }
    } else if (typeof expectedError === 'string') {
      if (!errMsg.includes(expectedError) && errName !== expectedError && String(caughtError) !== expectedError) {
        const errorMsg = `${msg ? msg + ' - ' : ''}Error message "${errMsg}" does not contain "${expectedError}"`;
        const err = new assert.AssertionError({ message: errorMsg, actual: errMsg, expected: expectedError, operator: 'includes' });
        recordFail(err);
      }
    } else if (typeof expectedError === 'function') {
      if (!(caughtError instanceof expectedError)) {
        const actualName = (caughtError && caughtError.constructor) ? caughtError.constructor.name : typeof caughtError;
        const errorMsg = `${msg ? msg + ' - ' : ''}Expected error instance of ${expectedError.name}, got ${actualName}`;
        const err = new assert.AssertionError({ message: errorMsg, actual: actualName, expected: expectedError.name, operator: 'instanceof' });
        recordFail(err);
      }
    }
  }

  recordPass();
}

// ============================================================================
// 2. MOCK DOM IMPLEMENTATION
// ============================================================================

class MockClassList {
  constructor(owner) {
    this.owner = owner;
    this.set = new Set();
  }
  add(...names) {
    for (const n of names) {
      if (n) this.set.add(String(n).trim());
    }
    this._sync();
  }
  remove(...names) {
    for (const n of names) {
      if (n) this.set.delete(String(n).trim());
    }
    this._sync();
  }
  toggle(name, force) {
    const clean = String(name).trim();
    let result;
    if (force === true) {
      this.set.add(clean);
      result = true;
    } else if (force === false) {
      this.set.delete(clean);
      result = false;
    } else if (this.set.has(clean)) {
      this.set.delete(clean);
      result = false;
    } else {
      this.set.add(clean);
      result = true;
    }
    this._sync();
    return result;
  }
  contains(name) {
    return this.set.has(String(name).trim());
  }
  _sync() {
    this.owner._className = Array.from(this.set).join(' ');
  }
  toString() {
    return Array.from(this.set).join(' ');
  }
}

class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
  }
  fillRect() {}
  clearRect() {}
  strokeRect() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  rect() {}
  stroke() {}
  fill() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  setTransform() {}
  resetTransform() {}
  drawImage() {}
  fillText() {}
  strokeText() {}
  measureText(text) {
    const str = String(text || '');
    return {
      width: str.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2
    };
  }
  getImageData(x, y, w, h) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData() {}
  createImageData(w, h) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  createLinearGradient() {
    return { addColorStop: () => {} };
  }
  createRadialGradient() {
    return { addColorStop: () => {} };
  }
}

class MockDOMElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = String(tagName || 'DIV').toUpperCase();
    this.id = String(id || '');
    this._className = String(className || '');
    this.classList = new MockClassList(this);
    if (className) {
      className.trim().split(/\s+/).forEach(c => c && this.classList.set.add(c));
    }
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this._innerHTML = '';
    this._textContent = '';
    this.value = '';
    this.disabled = false;
    this.title = '';
    this.checked = false;
    this.width = 0;
    this.height = 0;
    this._context2d = null;
  }

  getBoundingClientRect() {
    const w = this.width || 1280;
    const h = this.height || 720;
    return {
      left: 0,
      top: 0,
      right: w,
      bottom: h,
      width: w,
      height: h,
      x: 0,
      y: 0
    };
  }

  get className() { return this._className; }
  set className(val) {
    this._className = String(val || '');
    this.classList.set.clear();
    this._className.trim().split(/\s+/).forEach(c => c && this.classList.set.add(c));
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    this._innerHTML = String(val || '');
    this._textContent = '';
    if (val === '') this.childNodes = [];
  }

  get textContent() { return this._textContent || this._innerHTML; }
  set textContent(val) {
    this._textContent = String(val || '');
    this._innerHTML = String(val || '');
  }

  get innerText() { return this.textContent; }
  set innerText(val) { this.textContent = val; }

  setAttribute(k, v) {
    const key = String(k);
    const val = String(v);
    this.attributes[key] = val;
    if (key.startsWith('data-')) {
      const prop = key.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      this.dataset[prop] = val;
    }
    if (key === 'id') this.id = val;
    if (key === 'class') this.className = val;
    if (key === 'title') this.title = val;
    if (key === 'disabled') this.disabled = true;
  }

  getAttribute(k) {
    return this.attributes[k] !== undefined ? this.attributes[k] : null;
  }

  hasAttribute(k) {
    return k in this.attributes;
  }

  removeAttribute(k) {
    delete this.attributes[k];
    if (k.startsWith('data-')) {
      const prop = k.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      delete this.dataset[prop];
    }
    if (k === 'id') this.id = '';
    if (k === 'class') this.className = '';
    if (k === 'disabled') this.disabled = false;
  }

  appendChild(child) {
    if (child) {
      child.parentNode = this;
      this.childNodes.push(child);
    }
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChild(newChild, oldChild) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx !== -1) {
      newChild.parentNode = this;
      oldChild.parentNode = null;
      this.childNodes[idx] = newChild;
    }
    return oldChild;
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== fn);
    }
  }

  dispatchEvent(evt) {
    const type = evt.type;
    const handlers = this.listeners[type] || [];
    for (const h of handlers) {
      h(evt);
    }
    return !evt.defaultPrevented;
  }

  click() {
    const evt = {
      type: 'click',
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault: () => { evt.defaultPrevented = true; },
      stopPropagation: () => {}
    };
    return this.dispatchEvent(evt);
  }

  scrollIntoView(options) {
    this.lastScrollOptions = options;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0
    };
  }

  getContext(type) {
    if (this.tagName === 'CANVAS' && (type === '2d' || type === '2D')) {
      if (!this._context2d) {
        this._context2d = new MockCanvasRenderingContext2D(this);
      }
      return this._context2d;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (matchesSelector(child, selector)) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }
}

/**
 * Universal selector matcher for MockDOM.
 * Supports #id, .class, tag, [attr=val], [attr], and comma combinations.
 */
function matchesSelector(node, sel) {
  if (!node || !node.tagName) return false;
  sel = sel.trim();
  if (sel === '*') return true;

  if (sel.includes(',')) {
    return sel.split(',').some(s => matchesSelector(node, s));
  }

  // Attribute selector [data-tab="analysis"] or [attr]
  const attrMatch = sel.match(/^\[([^=\]]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/);
  if (attrMatch) {
    const attrName = attrMatch[1].trim();
    const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : attrMatch[4]);
    const hasAttr = node.hasAttribute(attrName) || (node.dataset && attrName.startsWith('data-') && attrName.slice(5) in node.dataset);
    if (!hasAttr) return false;
    if (attrVal === undefined) return true;
    const actual = node.getAttribute(attrName) || (node.dataset ? node.dataset[attrName.replace(/^data-/, '')] : null);
    return String(actual) === String(attrVal);
  }

  // Tag with optional #id and .classes
  const parts = sel.match(/^([a-zA-Z0-9_-]+)?(?:#([a-zA-Z0-9_-]+))?((?:\.[a-zA-Z0-9_-]+)*)$/);
  if (parts) {
    const tag = parts[1] || '';
    const id = parts[2] || '';
    const classes = parts[3] ? parts[3].split('.').filter(Boolean) : [];

    if (tag && node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (id && node.id !== id) return false;
    for (const c of classes) {
      if (!node.classList.contains(c)) return false;
    }
    return true;
  }

  return false;
}

class MockDocument {
  constructor() {
    this.readyState = 'complete';
    this.body = new MockDOMElement('body');
    this.head = new MockDOMElement('head');
    this.elementsMap = new Map();
    this.listeners = {};
  }

  createElement(tagName) {
    const el = new MockDOMElement(tagName);
    return el;
  }

  registerElement(el) {
    if (el && el.id) {
      this.elementsMap.set(el.id, el);
    }
  }

  getElementById(id) {
    if (this.elementsMap.has(id)) {
      return this.elementsMap.get(id);
    }
    const found = this.body.querySelector('#' + id);
    if (found) {
      this.elementsMap.set(id, found);
      return found;
    }
    return null;
  }

  querySelector(selector) {
    if (selector.startsWith('#') && !selector.includes(' ') && !selector.includes('.')) {
      const id = selector.slice(1);
      const fromMap = this.getElementById(id);
      if (fromMap) return fromMap;
    }
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== fn);
    }
  }

  dispatchEvent(evt) {
    const handlers = this.listeners[evt.type] || [];
    for (const h of handlers) h(evt);
    return !evt.defaultPrevented;
  }

  seedViewerElements() {
    const seeds = [
      { id: 'btn-explode', tag: 'button', class: 'tool-btn' },
      { id: 'btn-measure', tag: 'button', class: 'tool-btn' },
      { id: 'btn-analysis', tag: 'button', class: 'tool-btn' },
      { id: 'btn-materials', tag: 'button', class: 'tool-btn' },
      { id: 'btn-section', tag: 'button', class: 'tool-btn' },
      { id: 'btn-blueprint', tag: 'button', class: 'tool-btn' },
      { id: 'tree-panel', tag: 'div', class: 'panel' },
      { id: 'tree-explode-section', tag: 'div', class: 'panel-section' },
      { id: 'tree-content', tag: 'div', class: 'panel-content' },
      { id: 'tree-body-count', tag: 'span', class: 'badge' },
      { id: 'print-est-mass', tag: 'span', class: 'metric-val' },
      { id: 'print-est-length', tag: 'span', class: 'metric-val' },
      { id: 'print-est-spool', tag: 'span', class: 'metric-val' },
      { id: 'infill-val', tag: 'span', class: 'metric-val' },
      { id: 'section-infill', tag: 'div', class: 'panel-section' },
      { id: 'toast-container', tag: 'div', class: 'toast-layer' },
      { id: 'hud-badge-triangles', tag: 'span', class: 'hud-badge' },
      { id: 'hud-badge-watertight', tag: 'span', class: 'hud-badge' },
      { id: 'hud-badge-volume', tag: 'span', class: 'hud-badge' },
      { id: 'infill-slider', tag: 'input', class: 'slider' },
      { id: 'material-selector', tag: 'select', class: 'dropdown' },
      { id: 'prop-vol', tag: 'span', class: 'prop-val' },
      { id: 'prop-area', tag: 'span', class: 'prop-val' },
      { id: 'prop-bbox', tag: 'span', class: 'prop-val' },
      { id: 'active-mat-name', tag: 'span', class: 'mat-val' },
      { id: 'active-mat-density', tag: 'span', class: 'mat-val' },
      { id: 'active-mat-weight', tag: 'span', class: 'mat-val' },
      { id: 'mat-list', tag: 'div', class: 'mat-list' },
      { id: 'mat-search', tag: 'input', class: 'search-input' },
      { id: 'btn-units', tag: 'button', class: 'tool-btn' },
      { id: 'measure-card', tag: 'div', class: 'measure-card' },
      { id: 'measure-dist', tag: 'div', class: 'measure-val' },
      { id: 'measure-deltas', tag: 'div', class: 'measure-deltas' },
      { id: 'measure-extra', tag: 'div', class: 'measure-extra' },
      { id: 'measure-angle', tag: 'div', class: 'measure-angle' },
      { id: 'measure-card-title', tag: 'div', class: 'measure-title' },
      { id: 'color-picker-popover', tag: 'div', class: 'popover' },
      { id: 'color-popover-body-name', tag: 'div', class: 'popover-title' },
      { id: 'popover-orig-swatch', tag: 'div', class: 'swatch' },
      { id: 'popover-orig-hex', tag: 'span', class: 'hex' },
      { id: 'popover-color-input', tag: 'input', class: 'color-input' },
      { id: 'popover-color-hex-val', tag: 'span', class: 'hex' },
      { id: 'popover-opacity-slider', tag: 'input', class: 'slider' },
      { id: 'popover-opacity-val', tag: 'span', class: 'percent' },
      { id: 'btn-close-color-popover', tag: 'button', class: 'btn' },
      { id: 'btn-reset-orig-color', tag: 'button', class: 'btn' },
      { id: 'btn-apply-custom-color', tag: 'button', class: 'btn' },
      { id: 'meter-mat-name', tag: 'span', class: 'val' },
      { id: 'meter-mat-mass', tag: 'span', class: 'val' },
      { id: 'meter-mat-length', tag: 'span', class: 'val' }
    ];

    for (const s of seeds) {
      const el = this.createElement(s.tag);
      el.id = s.id;
      el.className = s.class;
      if (s.id === 'btn-units') {
        const span = this.createElement('span');
        span.innerText = 'mm';
        el.appendChild(span);
      }
      this.body.appendChild(el);
      this.registerElement(el);
    }
  }
}

// ============================================================================
// 3. HEADLESS CAD ENVIRONMENT FACTORY
// ============================================================================

/**
 * Creates an isolated sandboxed CAD environment executing client scripts in vm.createContext.
 * @param {object} options - Options configuring mock DOM and script loading
 * @returns {object} Environment controller
 */
function createCadEnvironment(options = {}) {
  const mockDocument = new MockDocument();
  if (options.seedElements !== false) {
    mockDocument.seedViewerElements();
  }

  const canvas = mockDocument.createElement('canvas');
  canvas.id = 'viewport-canvas';
  canvas.width = 1280;
  canvas.height = 720;
  mockDocument.body.appendChild(canvas);
  mockDocument.registerElement(canvas);

  const mockRenderer = {
    domElement: canvas,
    render: () => {},
    setSize: () => {},
    setPixelRatio: () => {},
    setClearColor: () => {},
    getClearColor: () => ({ getHexString: () => '1e1e1e' }),
    dispose: () => {}
  };

  let mockCamera = null;
  let mockScene = null;

  if (THREE) {
    mockCamera = new THREE.PerspectiveCamera(45, 1280 / 720, 0.1, 1000);
    mockCamera.position.set(0, 0, 100);
    mockCamera.lookAt(0, 0, 0);
    mockCamera.updateProjectionMatrix();
    mockCamera.updateMatrixWorld(true);
    mockScene = new THREE.Scene();
  }

  const sandbox = {
    THREE,
    window: {
      THREE,
      innerWidth: 1280,
      innerHeight: 720,
      modelBodies: [],
      modelEdgeFeatures: [],
      modelCadVertices: [],
      modelPhysicalProps: null,
      renderer: mockRenderer,
      camera: mockCamera,
      scene: mockScene,
      performance,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      requestAnimationFrame: (cb) => setTimeout(cb, 16),
      cancelAnimationFrame: (id) => clearTimeout(id),
      TextDecoder,
      TextEncoder,
      DataView,
      Float32Array,
      Uint32Array,
      Uint16Array,
      Uint8Array,
      ArrayBuffer,
      Event: function (type) { this.type = type; },
      CustomEvent: function (type, detail) { this.type = type; this.detail = detail; },
      localStorage: {
        _data: {},
        getItem: function(k) { return this._data[k] !== undefined ? this._data[k] : null; },
        setItem: function(k, v) { this._data[k] = String(v); },
        removeItem: function(k) { delete this._data[k]; },
        clear: function() { this._data = {}; }
      },
      currentUnit: 'mm',
      currentModelDistance: 100,
      currentModelCenter: (THREE ? new THREE.Vector3(0, 0, 0) : null),
      isMeasureActive: false,
      isSectionActive: false,
      selectedCadEntities: [],
      selectedBodyForProps: -1,
      showToast: function(msg) {
        if (sandbox.window) sandbox.window.lastToast = String(msg);
      },
      updateBoundingBoxBadge: function() {},
      autoColorizeAssembly: function() {},
      computeSafeCameraDistance: function(targetBox, padding = 1.25) {
        if (!targetBox || typeof targetBox.isEmpty === 'function' && targetBox.isEmpty()) return 100;
        const sphere = new THREE.Sphere();
        if (typeof targetBox.getBoundingSphere === 'function') targetBox.getBoundingSphere(sphere);
        const radius = Math.max(sphere.radius || 10, 1.0);
        return Math.max(radius * 2.5, 10) * padding;
      },
      _listeners: {},
      addEventListener: function(event, fn) {
        if (!this._listeners) this._listeners = {};
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
      },
      removeEventListener: function(event, fn) {
        if (this._listeners && this._listeners[event]) {
          this._listeners[event] = this._listeners[event].filter(h => h !== fn);
        }
      },
      dispatchEvent: function(evt) {
        const handlers = (this._listeners && this._listeners[evt.type]) || [];
        for (const h of handlers) h(evt);
        return !evt.defaultPrevented;
      }
    },
    currentUnit: 'mm',
    currentModelDistance: 100,
    currentModelCenter: (THREE ? new THREE.Vector3(0, 0, 0) : null),
    isMeasureActive: false,
    isSectionActive: false,
    selectedCadEntities: [],
    selectedBodyForProps: -1,
    computeSafeCameraDistance: function(targetBox, padding = 1.25) {
      if (!targetBox || typeof targetBox.isEmpty === 'function' && targetBox.isEmpty()) return 100;
      const sphere = new THREE.Sphere();
      if (typeof targetBox.getBoundingSphere === 'function') targetBox.getBoundingSphere(sphere);
      const radius = Math.max(sphere.radius || 10, 1.0);
      return Math.max(radius * 2.5, 10) * padding;
    },
    autoColorizeAssembly: function() {},
    updateBoundingBoxBadge: function() {},
    document: mockDocument,
    renderer: mockRenderer,
    camera: mockCamera,
    scene: mockScene,
    console,
    performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    TextDecoder,
    TextEncoder,
    DataView,
    Float32Array,
    Uint32Array,
    Uint16Array,
    Uint8Array,
    ArrayBuffer
  };

  sandbox.self = sandbox.window;
  sandbox.global = sandbox.window;
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = mockDocument;
  sandbox.window.window = sandbox.window;
  sandbox.window.self = sandbox.window;
  sandbox.window.global = sandbox.window;
  sandbox.window.globalThis = sandbox.window;

  function syncGlobals() {
    for (const key of Object.keys(sandbox)) {
      if (key !== 'window' && sandbox.window[key] === undefined) {
        sandbox.window[key] = sandbox[key];
      }
    }
    for (const key of Object.keys(sandbox.window)) {
      if (sandbox[key] === undefined) {
        sandbox[key] = sandbox.window[key];
      }
    }
    if (sandbox.window.modelPhysicalProps !== undefined && sandbox.modelPhysicalProps === undefined) {
      sandbox.modelPhysicalProps = sandbox.window.modelPhysicalProps;
    }
    if (sandbox.modelPhysicalProps !== undefined && sandbox.window.modelPhysicalProps === undefined) {
      sandbox.window.modelPhysicalProps = sandbox.modelPhysicalProps;
    }
  }

  const context = vm.createContext(sandbox);

  let _modelPhysicalProps = null;
  Object.defineProperty(sandbox, 'modelPhysicalProps', {
    get: () => _modelPhysicalProps,
    set: (v) => { _modelPhysicalProps = v; },
    configurable: true
  });
  Object.defineProperty(sandbox.window, 'modelPhysicalProps', {
    get: () => _modelPhysicalProps,
    set: (v) => { _modelPhysicalProps = v; },
    configurable: true
  });

  function loadScript(relativePath) {
    const fullPath = path.resolve(ROOT_DIR, relativePath);
    if (fs.existsSync(fullPath)) {
      const code = fs.readFileSync(fullPath, 'utf8');
      vm.runInContext(code, context, { filename: fullPath });
      syncGlobals();
      return true;
    }
    return false;
  }

  // Conditionally load client modules based on options
  if (options.loadCadState) {
    loadScript('Assets/js/cadState.js');
    if (context.camera === null && mockCamera) context.camera = mockCamera;
    if (context.scene === null && mockScene) context.scene = mockScene;
    if (context.renderer === null && mockRenderer) context.renderer = mockRenderer;
    if (sandbox.window) {
      sandbox.window.camera = context.camera;
      sandbox.window.scene = context.scene;
      sandbox.window.renderer = context.renderer;
    }
  }
  if (options.loadStlLoader) loadScript('Assets/js/stlLoader.js');
  if (options.loadFeatureDetector) loadScript('Assets/js/meshFeatureDetector.js');
  if (options.loadMaterialsEngine) loadScript('Assets/js/materialsEngine.js');
  if (options.loadMeasureEngine) {
    loadScript('Assets/js/materialsEngine.js');
    loadScript('Assets/js/measureEngine.js');
  }
  if (options.loadWorkbenchUi) loadScript('Assets/js/workbenchUiEngine.js');
  if (options.loadBlueprintSvg) loadScript('Assets/js/blueprintSvgEngine.js');
  if (options.loadSectionEngine) loadScript('Assets/js/sectionEngine.js');
  if (options.loadExplodedView) loadScript('Assets/js/explodedView.js');
  if (options.loadAssemblyTree) loadScript('Assets/js/assemblyTree.js');
  if (options.loadAppearancePopover) {
    loadScript('Assets/js/assemblyTree.js');
    loadScript('Assets/js/appearancePopover.js');
  }

  return {
    context,
    sandbox,
    window: sandbox.window,
    document: mockDocument,
    renderer: mockRenderer,
    camera: mockCamera,
    scene: mockScene,
    THREE,
    loadScript,
    run: (code) => vm.runInContext(code, context)
  };
}

// ============================================================================
// 4. TEST RUNNER FRAMEWORK
// ============================================================================

let currentSuitePath = [];
let totalSuitesRun = 0;
let totalTestsRun = 0;
let totalTestsPassed = 0;
let totalTestsFailed = 0;
const testFailures = [];
const suiteStartTime = Date.now();

/**
 * Declares a test suite block.
 * @param {string} suiteName
 * @param {Function} fn
 */
function describe(suiteName, fn) {
  totalSuitesRun++;
  currentSuitePath.push(suiteName);
  const indent = '  '.repeat(currentSuitePath.length - 1);
  console.log(`\n${indent}\x1b[1m\x1b[36m[SUITE]\x1b[0m \x1b[1m${suiteName}\x1b[0m`);

  try {
    fn();
  } catch (err) {
    console.error(`\x1b[31mSuite setup failed in ${suiteName}: ${err.message}\x1b[0m`);
    testFailures.push({
      suite: currentSuitePath.join(' > '),
      name: 'Suite Setup',
      error: err,
      durationMs: 0
    });
    totalTestsFailed++;
  } finally {
    currentSuitePath.pop();
  }
}

/**
 * Declares and executes an individual test case.
 * Supports both synchronous and asynchronous (Promise) test functions.
 * @param {string} testName
 * @param {Function} fn
 */
function test(testName, fn) {
  totalTestsRun++;
  const indent = '  '.repeat(currentSuitePath.length);
  const currentSuite = currentSuitePath.join(' > ');
  const t0 = Date.now();

  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      // Async test handling
      return result.then(() => {
        const duration = Date.now() - t0;
        totalTestsPassed++;
        console.log(`${indent}\x1b[32m[PASS]\x1b[0m ${testName} \x1b[90m(${duration}ms)\x1b[0m`);
      }).catch(err => {
        const duration = Date.now() - t0;
        totalTestsFailed++;
        testFailures.push({
          suite: currentSuite,
          name: testName,
          error: err,
          durationMs: duration
        });
        console.error(`${indent}\x1b[31m[FAIL]\x1b[0m ${testName} \x1b[90m(${duration}ms)\x1b[0m`);
        console.error(`${indent}       \x1b[31m${err.message}\x1b[0m`);
      });
    }

    const duration = Date.now() - t0;
    totalTestsPassed++;
    console.log(`${indent}\x1b[32m[PASS]\x1b[0m ${testName} \x1b[90m(${duration}ms)\x1b[0m`);
  } catch (err) {
    const duration = Date.now() - t0;
    totalTestsFailed++;
    testFailures.push({
      suite: currentSuite,
      name: testName,
      error: err,
      durationMs: duration
    });
    console.error(`${indent}\x1b[31m[FAIL]\x1b[0m ${testName} \x1b[90m(${duration}ms)\x1b[0m`);
    console.error(`${indent}       \x1b[31m${err.message}\x1b[0m`);
  }
}

const it = test;

/**
 * Prints the final execution summary table and returns stats.
 * @returns {object} Summary statistics
 */
function reportSummary() {
  const durationTotal = Date.now() - suiteStartTime;
  console.log('\n================================================================================');
  console.log('  E2E TEST EXECUTION SUMMARY                                                    ');
  console.log('================================================================================');
  console.log(`  Suites:       ${totalSuitesRun}`);
  console.log(`  Total Tests:  ${totalTestsRun}`);
  console.log(`  Passed:       \x1b[32m${totalTestsPassed}\x1b[0m`);
  console.log(`  Failed:       ${totalTestsFailed > 0 ? `\x1b[31m${totalTestsFailed}\x1b[0m` : `0`}`);
  console.log(`  Assertions:   ${totalAssertionsPassed} passed`);
  console.log(`  Duration:     ${durationTotal} ms`);
  console.log('================================================================================');

  if (testFailures.length > 0) {
    console.log('\n\x1b[31mFAILURE DETAILS:\x1b[0m');
    testFailures.forEach((f, idx) => {
      console.log(`\n  ${idx + 1}) ${f.suite} > ${f.name}`);
      console.log(`     Error: ${f.error.message}`);
      if (f.error.stack) {
        const stackLines = f.error.stack.split('\n').slice(1, 4).join('\n');
        console.log(`     Stack:\n${stackLines}`);
      }
    });
    console.log('');
  }

  return {
    suites: totalSuitesRun,
    total: totalTestsRun,
    passed: totalTestsPassed,
    failed: totalTestsFailed,
    assertions: totalAssertionsPassed,
    durationMs: durationTotal,
    exitCode: totalTestsFailed > 0 ? 1 : 0
  };
}

/**
 * Exits the current Node.js process using proper return codes:
 * Code 0 on 100% pass, Code 1 on any assertion or test failure.
 */
function exitProcess() {
  const code = totalTestsFailed > 0 ? 1 : 0;
  process.exit(code);
}

// ============================================================================
// 5. MODULE EXPORTS
// ============================================================================

module.exports = {
  // DOM & Environment Factory
  MockClassList,
  MockDOMElement,
  MockDocument,
  MockCanvasRenderingContext2D,
  createCadEnvironment,

  // Numerical & Geometric Assertions
  assertTrue,
  assertEqual,
  assertCloseTo,
  assertDeepCloseTo,
  assertThrows,

  // Test Runner API
  describe,
  test,
  it,
  reportSummary,
  exitProcess
};
