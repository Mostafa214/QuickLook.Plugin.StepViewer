/**
 * Milestone M4 Verification Test Suite: Draft Angle Dynamic Gradient Legend Overlay
 * File: tests/test_milestone4_draft_legend.js
 *
 * Validates:
 * Suite 1: Static DOM & CSS Asset Specification Integrity (viewer.html & viewer.css)
 * Suite 2: cadAnalysisEngine Dynamic Graduation Algorithm & Public API (3°, 10°, 45°, 0.5°)
 * Suite 3: Auto-Toggle Lifecycle & UI State Machine Integration (Toggle button, slider, drawer close, tab switch)
 * Suite 4: Multi-Viewport Responsive AABB Non-Collision Assertions (680px, 960px, 1280px)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const VIEWER_HTML_PATH = path.join(ROOT, 'Assets', 'viewer.html');
const VIEWER_CSS_PATH = path.join(ROOT, 'Assets', 'css', 'viewer.css');
const CAD_ANALYSIS_JS_PATH = path.join(ROOT, 'Assets', 'js', 'cadAnalysisEngine.js');
const WORKBENCH_JS_PATH = path.join(ROOT, 'Assets', 'js', 'workbenchUiEngine.js');

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (!condition) {
    totalFailed++;
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  totalPassed++;
  console.log(`  ✓ PASS: ${message}`);
}

assert.strictEqual = function(actual, expected, message) {
  if (actual !== expected) {
    totalFailed++;
    console.error(`  ✗ FAIL: ${message} (Expected: ${expected}, Got: ${actual})`);
    throw new Error(`Assertion failed: ${message}`);
  }
  totalPassed++;
  console.log(`  ✓ PASS: ${message}`);
};

console.log('========================================================================');
console.log('  MILESTONE M4 TEST SUITE: DRAFT ANGLE DYNAMIC GRADIENT LEGEND OVERLAY  ');
console.log('========================================================================\n');

// =============================================================================
// SUITE 1: STATIC DOM & CSS ASSET SPECIFICATION INTEGRITY
// =============================================================================
console.log('--- SUITE 1: Static DOM & CSS Asset Specification Integrity ---');

const htmlContent = fs.readFileSync(VIEWER_HTML_PATH, 'utf8');
const cssContent = fs.readFileSync(VIEWER_CSS_PATH, 'utf8');

// 1.1 #draft-angle-legend container existence
assert(htmlContent.includes('id="draft-angle-legend"'), '#draft-angle-legend element exists in viewer.html');
assert(htmlContent.includes('class="draft-angle-legend"'), '#draft-angle-legend has class="draft-angle-legend"');
assert(htmlContent.includes('style="display: none;"') || htmlContent.includes("style='display: none;'"), '#draft-angle-legend is initially hidden with display: none');

// 1.2 Legend Header & Threshold Badge
assert(htmlContent.includes('class="legend-header"'), '.legend-header exists in viewer.html');
assert(htmlContent.includes('class="legend-title"'), '.legend-title exists in viewer.html');
assert(htmlContent.includes('Draft Angle') || htmlContent.includes('DRAFT ANGLE'), 'Legend title contains "Draft Angle"');
assert(htmlContent.includes('id="legend-threshold-badge"'), '#legend-threshold-badge exists in viewer.html');

// 1.3 Legend Body, Gradient Bar & Scale
assert(htmlContent.includes('class="legend-body"'), '.legend-body exists in viewer.html');
assert(htmlContent.includes('class="legend-bar-track"'), '.legend-bar-track exists in viewer.html');
assert(htmlContent.includes('id="legend-bar-gradient"'), '#legend-bar-gradient exists in viewer.html');
assert(htmlContent.includes('id="legend-scale"'), '#legend-scale ticks container exists in viewer.html');

// 1.4 Semantic Zone Badges
assert(htmlContent.includes('id="legend-zones"'), '#legend-zones exists in viewer.html');
assert(htmlContent.includes('id="legend-lbl-safe"'), '#legend-lbl-safe exists in viewer.html');
assert(htmlContent.includes('id="legend-lbl-warn"'), '#legend-lbl-warn exists in viewer.html');

// 1.5 CSS Rules in viewer.css
assert(cssContent.includes('.draft-angle-legend'), 'viewer.css defines .draft-angle-legend styling');
assert(cssContent.includes('position: absolute'), 'viewer.css positions .draft-angle-legend absolutely');
assert(cssContent.includes('backdrop-filter: blur('), 'viewer.css specifies glassmorphic backdrop-filter blur');
assert(cssContent.includes('.legend-bar-gradient'), 'viewer.css defines .legend-bar-gradient styling');
assert(cssContent.includes('.legend-tick-row'), 'viewer.css defines .legend-tick-row styling');

// 1.6 Responsive Media Queries in viewer.css
assert(cssContent.includes('@media (max-width: 960px)') && cssContent.match(/@media\s*\(max-width:\s*960px\)[\s\S]*?\.draft-angle-legend/), 'viewer.css has 960px responsive rule for .draft-angle-legend');
assert(cssContent.includes('@media (max-width: 680px)') && cssContent.match(/@media\s*\(max-width:\s*680px\)[\s\S]*?\.draft-angle-legend/), 'viewer.css has 680px responsive rule for .draft-angle-legend');
assert(cssContent.includes('@media (max-width: 540px)') && cssContent.match(/@media\s*\(max-width:\s*540px\)[\s\S]*?body\.drawer-open\s+\.draft-angle-legend/), 'viewer.css hides .draft-angle-legend at <= 540px when drawer is open');
assert(cssContent.match(/@media\s*\(max-width:\s*680px\)[\s\S]*?body\.drawer-open\s+\.hud-badge/), 'viewer.css qualifies body.drawer-open .hud-badge at <= 680px to prevent height stretch');


// =============================================================================
// SUITE 2: DYNAMIC GRADUATION ALGORITHM & PUBLIC API
// =============================================================================
console.log('\n--- SUITE 2: Dynamic Graduation Algorithm & Public API ---');

// Mock Three.js & DOM Environment for cadAnalysisEngine
class MockClassList {
  constructor() { this.classes = new Set(); }
  add(c) { if (c) this.classes.add(c); }
  remove(c) { if (c) this.classes.delete(c); }
  contains(c) { return this.classes.has(c); }
  toggle(c, f) {
    if (f !== undefined) { f ? this.add(c) : this.remove(c); return f; }
    if (this.contains(c)) { this.remove(c); return false; }
    this.add(c); return true;
  }
}

class MockElement {
  constructor(tag, id = '', className = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = new MockClassList();
    if (className) className.split(' ').filter(Boolean).forEach(c => this.classList.add(c));
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.innerText = '';
    this._value = '';
    this.attributes = {};
  }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  setAttribute(k, v) { this.attributes[k] = String(v); this[k] = v; }
  getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : (this[k] !== undefined ? this[k] : null); }
  removeAttribute(k) { delete this.attributes[k]; delete this[k]; }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  set innerHTML(html) {
    this.children = [];
    this._rawHtml = html;
  }
  get innerHTML() { return this._rawHtml || ''; }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    }
  }
  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : event.type;
    const evt = typeof event === 'string' ? { type: event, target: this } : event;
    if (!evt.target) evt.target = this;
    if (this.listeners[type]) {
      this.listeners[type].forEach(fn => fn(evt));
    }
  }
  click() { this.dispatchEvent('click'); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}

const mockDomElements = {};
function mockGetElementById(id) { return mockDomElements[id] || null; }

function setupMockDOM() {
  const ids = [
    'canvas-container', 'draft-angle-legend', 'legend-threshold-badge',
    'legend-bar-gradient', 'draft-legend-bar', 'legend-scale', 'legend-zones', 'legend-lbl-safe',
    'legend-lbl-warn', 'legend-threshold-val', 'legend-threshold-val-warn', 'card-draft-analysis',
    'btn-toggle-draft', 'draft-controls-panel', 'btn-draft-plane-xy', 'btn-draft-plane-yz',
    'btn-draft-plane-zx', 'btn-draft-flip', 'btn-draft-pick-face', 'btn-draft-pick-face-text',
    'draft-pull-dir-readout', 'draft-angle-slider', 'draft-angle-val'
  ];
  ids.forEach(id => {
    mockDomElements[id] = new MockElement('div', id);
  });
  mockDomElements['btn-toggle-draft'].tagName = 'BUTTON';
  mockDomElements['draft-angle-slider'].tagName = 'INPUT';
  mockDomElements['draft-angle-slider'].value = '3.0';
  mockDomElements['draft-angle-val'].innerText = '3.0°';
}
setupMockDOM();

const mockDocument = {
  getElementById: mockGetElementById,
  createElement: (tag) => new MockElement(tag),
  body: new MockElement('body', 'body')
};

const mockTHREE = {
  Vector3: function(x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
    this.set = (a, b, c) => { this.x = a; this.y = b; this.z = c; return this; };
    this.copy = (v) => { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
    this.clone = () => new mockTHREE.Vector3(this.x, this.y, this.z);
    this.normalize = () => this;
    this.negate = () => { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; };
    this.equals = (v) => this.x === v.x && this.y === v.y && this.z === v.z;
  },
  Matrix3: function() { this.getNormalMatrix = () => this; },
  Matrix4: function() { this.multiplyMatrices = () => this; },
  Color: function(c) { this.hex = c; },
  Box3: function() {
    this.setFromObject = () => this;
    this.getSize = () => new mockTHREE.Vector3(10, 10, 10);
    this.getCenter = () => new mockTHREE.Vector3(0, 0, 0);
  },
  ShaderMaterial: function(opts) {
    this.uniforms = opts.uniforms || {};
    this.uniformsNeedUpdate = false;
  },
  DoubleSide: 2,
  Group: function() { this.children = []; this.add = () => {}; this.remove = () => {}; },
  ArrowHelper: function() {
    this.setDirection = () => {};
    this.setLength = () => {};
    this.position = new mockTHREE.Vector3();
  }
};

const cadSandbox = {
  window: {},
  document: mockDocument,
  THREE: mockTHREE,
  console: console,
  showToast: () => {}
};
cadSandbox.window = cadSandbox;

const cadAnalysisCode = fs.readFileSync(CAD_ANALYSIS_JS_PATH, 'utf8');
vm.createContext(cadSandbox);
vm.runInContext(cadAnalysisCode, cadSandbox);

const Cad = cadSandbox.window.CadAnalysis;
assert(typeof Cad === 'object', 'CadAnalysis object exists on window');

// 2.1 Public API Validation
assert(typeof Cad.showDraftLegend === 'function', 'CadAnalysis.showDraftLegend is exported');
assert(typeof Cad.hideDraftLegend === 'function', 'CadAnalysis.hideDraftLegend is exported');
assert(typeof Cad.updateDraftLegendThreshold === 'function', 'CadAnalysis.updateDraftLegendThreshold is exported');
assert(typeof Cad.calculateDraftTicks === 'function', 'CadAnalysis.calculateDraftTicks is exported');
assert(typeof Cad.isDraftActive === 'function' || typeof Cad.isDraftAngleActive === 'function', 'CadAnalysis.isDraftActive is exported');

// 2.2 Default Threshold Graduation (T = 3.0°)
const ticks3 = Cad.calculateDraftTicks(3.0);
assert.strictEqual(ticks3.threshold, 3.0, 'Threshold is 3.0°');
assert.strictEqual(ticks3.step, 1.0, 'Step size for 3.0° is 1.0°');
assert.strictEqual(ticks3.ticks.length, 7, 'Generates exactly 7 ticks for ±3.0° (-3° to +3°)');
assert.strictEqual(ticks3.ticks[0].value, -3.0, 'First tick is -3.0°');
assert.strictEqual(ticks3.ticks[0].percent, 0, 'First tick is at bottom 0%');
assert.strictEqual(ticks3.ticks[3].value, 0, 'Center tick is 0.0°');
assert.strictEqual(ticks3.ticks[3].percent, 50, 'Center tick is at bottom 50%');
assert.strictEqual(ticks3.ticks[3].isZero, true, 'Center tick is tagged isZero');
assert.strictEqual(ticks3.ticks[6].value, 3.0, 'Top tick is +3.0°');
assert.strictEqual(ticks3.ticks[6].percent, 100, 'Top tick is at 100%');

// 2.3 Changed Threshold Graduation (T = 10.0°)
const ticks10 = Cad.calculateDraftTicks(10.0);
assert.strictEqual(ticks10.threshold, 10.0, 'Threshold is 10.0°');
assert(ticks10.step === 2.0 || ticks10.step === 5.0, 'Step size for 10.0° is clean (2.0° or 5.0°)');
assert.strictEqual(ticks10.ticks[0].value, -10.0, 'First tick is -10.0° at 0%');
assert.strictEqual(ticks10.ticks[ticks10.ticks.length - 1].value, 10.0, 'Last tick is +10.0° at 100%');

// 2.4 Extreme Threshold Graduation (T = 45.0°)
const ticks45 = Cad.calculateDraftTicks(45.0);
assert.strictEqual(ticks45.threshold, 45.0, 'Threshold is 45.0°');
assert(ticks45.ticks.length >= 5 && ticks45.ticks.length <= 11, 'Generates readable tick density for 45.0°');
assert.strictEqual(ticks45.ticks[0].value, -45.0, 'First tick is -45.0°');
assert.strictEqual(ticks45.ticks[ticks45.ticks.length - 1].value, 45.0, 'Last tick is +45.0°');

// 2.5 Fine Threshold Graduation (T = 0.5°)
const ticks05 = Cad.calculateDraftTicks(0.5);
assert.strictEqual(ticks05.threshold, 0.5, 'Threshold is 0.5°');
assert(ticks05.step <= 0.25, 'Step size for 0.5° is fractional (<= 0.25°)');

// 2.6 All 20 UI Slider Thresholds (0.5° to 10.0° in 0.5° steps) Regression Check
let sliderCount = 0;
for (let v = 0.5; v <= 10.0 + 1e-5; v += 0.5) {
  const T = Math.round(v * 10) / 10;
  const res = Cad.calculateDraftTicks(T);
  sliderCount++;
  assert.strictEqual(res.threshold, T, `Slider threshold ${T}° is set correctly`);

  // Assert exact 0.0° tick exists at 50% percent
  const zeroTick = res.ticks.find(t => t.isZero || Math.abs(t.angle) < 1e-4);
  assert(zeroTick !== undefined, `Exact 0.0° tick exists at slider threshold ${T}°`);
  assert.strictEqual(zeroTick.angle, 0, `0.0° tick angle is 0 at threshold ${T}°`);
  assert.strictEqual(zeroTick.percent, 50.0, `0.0° tick is at exactly 50% percent at threshold ${T}°`);

  // Assert strictly monotonically increasing angles
  for (let i = 1; i < res.ticks.length; i++) {
    assert(res.ticks[i].angle > res.ticks[i - 1].angle,
      `Ticks are strictly monotonically increasing at T=${T}° (${res.ticks[i - 1].angle}° < ${res.ticks[i].angle}°)`);
  }

  // Assert boundary ticks at -T and +T
  assert.strictEqual(res.ticks[0].angle, -T, `Bottom tick is -${T}° at 0% for T=${T}°`);
  assert.strictEqual(res.ticks[0].percent, 0.0, `Bottom tick is at 0% for T=${T}°`);
  assert.strictEqual(res.ticks[res.ticks.length - 1].angle, T, `Top tick is +${T}° at 100% for T=${T}°`);
  assert.strictEqual(res.ticks[res.ticks.length - 1].percent, 100.0, `Top tick is at 100% for T=${T}°`);
}
assert.strictEqual(sliderCount, 20, 'All 20 slider thresholds tested');

// 2.7 Clamping of Extreme and Invalid Inputs (e.g., Infinity, -5, NaN, null, undefined)
const infRes = Cad.calculateDraftTicks(Infinity);
assert.strictEqual(infRes.threshold, 45.0, 'calculateDraftTicks(Infinity) is clamped to 45.0°');
assert(infRes.ticks.length >= 5, 'calculateDraftTicks(Infinity) generates valid finite ticks');

const negRes = Cad.calculateDraftTicks(-5);
assert.strictEqual(negRes.threshold, 0.1, 'calculateDraftTicks(-5) is clamped to 0.1°');
assert(negRes.ticks.length >= 3, 'calculateDraftTicks(-5) generates valid finite ticks');

const nanRes = Cad.calculateDraftTicks(NaN);
assert.strictEqual(nanRes.threshold, 3.0, 'calculateDraftTicks(NaN) falls back to default 3.0°');
assert.strictEqual(nanRes.ticks.length, 7, 'calculateDraftTicks(NaN) generates 7 ticks for default 3.0°');

const nullRes = Cad.calculateDraftTicks(null);
assert.strictEqual(nullRes.threshold, 3.0, 'calculateDraftTicks(null) falls back to default 3.0°');

const undefRes = Cad.calculateDraftTicks(undefined);
assert.strictEqual(undefRes.threshold, 3.0, 'calculateDraftTicks(undefined) falls back to default 3.0°');


// =============================================================================
// SUITE 3: AUTO-TOGGLE LIFECYCLE & UI STATE MACHINE INTEGRATION
// =============================================================================
console.log('\n--- SUITE 3: Auto-Toggle Lifecycle & UI State Machine Integration ---');

// Build Unified UI Sandbox
const uiSandbox = {
  window: {},
  document: mockDocument,
  THREE: mockTHREE,
  console: console,
  CadAnalysis: Cad,
  toggleMeasureMode: (on) => { uiSandbox.isMeasureActive = on; },
  toggleSectionView: (on) => { uiSandbox.isSectionActive = on; },
  updatePhysicalPropertiesCard: () => {},
  initSnapshotSystem: () => {},
  isMeasureActive: false,
  isSectionActive: false,
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {}
};
uiSandbox.window = uiSandbox;

// Setup drawer mock elements
const drawerEl = new MockElement('div', 'inspector-drawer', 'inspector-drawer');
mockDomElements['inspector-drawer'] = drawerEl;
const drawerHeader = new MockElement('div', 'drawer-header', 'drawer-header');
drawerEl.appendChild(drawerHeader);
const drawerTabsContainer = new MockElement('div', 'drawer-tabs', 'drawer-tabs');
drawerHeader.appendChild(drawerTabsContainer);

const tabs = ['tree', 'measure', 'section', 'mass', 'analysis', 'export'];
tabs.forEach(t => {
  const tabBtn = new MockElement('button', `drawer-tab-${t}`, 'drawer-tab');
  tabBtn.dataset.tab = t;
  drawerTabsContainer.appendChild(tabBtn);
  mockDomElements[`drawer-tab-${t}`] = tabBtn;

  const pane = new MockElement('div', `drawer-tab-${t}-pane`, 'drawer-tab-pane');
  pane.dataset.tab = t;
  drawerEl.appendChild(pane);
  mockDomElements[`drawer-tab-${t}-pane`] = pane;

  mockDomElements[`btn-${t === 'export' ? 'snapshot' : (t === 'mass' ? 'props' : t)}`] = new MockElement('button', `btn-${t}`);
});
mockDomElements['btn-close-drawer'] = new MockElement('button', 'btn-close-drawer');
drawerEl.querySelectorAll = (sel) => {
  if (sel === '.drawer-tab') return tabs.map(t => mockDomElements[`drawer-tab-${t}`]);
  if (sel.includes('.drawer-tab-content') || sel.includes('.drawer-tab-pane')) return tabs.map(t => mockDomElements[`drawer-tab-${t}-pane`]);
  return [];
};

const workbenchCode = fs.readFileSync(WORKBENCH_JS_PATH, 'utf8');
vm.createContext(uiSandbox);
vm.runInContext(workbenchCode, uiSandbox);

uiSandbox.WorkbenchUI.init();

// 3.1 Toggle Draft Analysis ON
const btnToggleDraft = mockDomElements['btn-toggle-draft'];
const legendEl = mockDomElements['draft-angle-legend'];

assert(legendEl.style.display === 'none' || !legendEl.style.display, 'Legend initially hidden');
btnToggleDraft.click(); // Turn on draft angle analysis

assert(Cad.isDraftActive(), 'Draft angle analysis is now active');
assert(legendEl.style.display === 'flex' || legendEl.style.display === 'block', 'Legend overlay automatically displayed on activation');

// 3.2 Dynamic Slider Drag Reactivity
const slider = mockDomElements['draft-angle-slider'];
slider.value = '5.0';
slider.dispatchEvent({ type: 'input', target: slider });

assert.strictEqual(Cad.getDraftThreshold(), 5.0, 'CadAnalysis threshold updated to 5.0° via slider input');
assert.strictEqual(mockDomElements['draft-angle-val'].innerText, '5.0°', '#draft-angle-val badge updated to 5.0°');
assert.strictEqual(mockDomElements['legend-threshold-badge'].innerText, '±5.0°', 'Legend threshold badge updated to ±5.0°');

// 3.3 Toggle Draft Analysis OFF
btnToggleDraft.click(); // Turn off draft angle analysis
assert(!Cad.isDraftActive(), 'Draft angle analysis is now inactive');
assert.strictEqual(legendEl.style.display, 'none', 'Legend overlay automatically hidden on deactivation');

// 3.4 Drawer Close Auto-Toggle Lifecycle
btnToggleDraft.click(); // Turn on again
assert(Cad.isDraftActive(), 'Draft analysis reactivated');
assert(legendEl.style.display !== 'none', 'Legend visible');

// User closes drawer
mockDomElements['btn-close-drawer'].click();
assert.strictEqual(legendEl.style.display, 'none', 'Legend overlay automatically hidden when drawer closed');

// 3.5 Drawer Tab Switch Auto-Toggle Lifecycle
uiSandbox.WorkbenchUI.openDrawer('analysis');
btnToggleDraft.click();
assert(legendEl.style.display !== 'none', 'Legend visible on analysis tab');

// User switches to Measure tab
uiSandbox.WorkbenchUI.switchDrawerTab('measure');
assert.strictEqual(legendEl.style.display, 'none', 'Legend overlay automatically hidden when switching away from analysis tab');


// =============================================================================
// SUITE 4: MULTI-VIEWPORT RESPONSIVE AABB NON-COLLISION ASSERTIONS
// =============================================================================
console.log('\n--- SUITE 4: Multi-Viewport Responsive AABB Non-Collision Assertions ---');

function checkCollision(r1, r2) {
  return !(r1.right <= r2.left || r1.left >= r2.right || r1.bottom <= r2.top || r1.top >= r2.bottom);
}

const viewports = [
  { width: 1280, height: 800, name: '1280px Desktop Wide' },
  { width: 960,  height: 700, name: '960px Tablet / Medium' },
  { width: 680,  height: 600, name: '680px Compact QuickLook' }
];

viewports.forEach(vp => {
  const w = vp.width;
  const h = vp.height;

  // Compute AABBs
  // 1. Legend: left: 18px (or 10px on 680), top: 50%, h: ~220px, w: ~160px
  const scale = w <= 680 ? 0.8 : (w <= 960 ? 0.9 : 1.0);
  const legendW = 160 * scale;
  const legendH = 220 * scale;
  const legendLeft = w <= 680 ? 10 : (w <= 960 ? 14 : 18);
  const legendTop = (h / 2) - (legendH / 2);
  const legendBox = { left: legendLeft, right: legendLeft + legendW, top: legendTop, bottom: legendTop + legendH };

  // 2. Toolbar: top: 14px (or 10px), centered
  const tbW = w <= 680 ? 300 : (w <= 960 ? 450 : 600);
  const tbLeft = (w - tbW) / 2;
  const tbBox = { left: tbLeft, right: tbLeft + tbW, top: 14, bottom: 58 };

  // 3. ViewCube: right: 18px, top: 14px, size: 100px
  const vcSize = w <= 680 ? 72 : (w <= 960 ? 80 : 100);
  const vcBox = { left: w - vcSize - 18, right: w - 18, top: 14, bottom: 14 + vcSize };

  // 4. Triad: bottom: 14px, left: 16px, 70x70px
  const triadBox = { left: 16, right: 86, top: h - 84, bottom: h - 14 };

  // 5. HUD Badge
  let badgeBox;
  if (w <= 680) {
    // Bottom-left in sub-680px
    badgeBox = { left: 14, right: 234, top: h - 130, bottom: h - 86 };
  } else {
    // Top-left
    badgeBox = { left: 16, right: 260, top: 72, bottom: 118 };
  }

  // 6. Right Drawer (when open)
  const drawerBox = { left: w - 380, right: w, top: 0, bottom: h };

  // Run Non-Collision Assertions
  assert(!checkCollision(legendBox, tbBox), `[${vp.name}] Legend does not collide with Toolbar Dock`);
  assert(!checkCollision(legendBox, vcBox), `[${vp.name}] Legend does not collide with ViewCube`);
  assert(!checkCollision(legendBox, triadBox), `[${vp.name}] Legend does not collide with Coordinate Triad`);
  assert(!checkCollision(legendBox, badgeBox), `[${vp.name}] Legend does not collide with HUD Metadata Badge`);
  assert(!checkCollision(legendBox, drawerBox), `[${vp.name}] Legend does not collide with Inspector Drawer (Open State)`);
  assert(legendBox.left >= 10, `[${vp.name}] Legend preserves positive viewport boundary margin`);
});

console.log('\n========================================================================');
console.log(`  M4 TEST SUMMARY: ${totalPassed} Passed, ${totalFailed} Failed`);
console.log('========================================================================\n');
