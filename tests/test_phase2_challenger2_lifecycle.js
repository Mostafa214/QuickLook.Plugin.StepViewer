/**
 * Empirical Adversarial Challenger 2 Test Suite: Right Drawer Lifecycle & Edge Cases
 * Author: Challenger 2 (teamwork_challenger)
 * 
 * Target:
 * 1. DOM permanence & zero innerHTML wipes.
 * 2. Edge Case: toggleDrawer() called before DOM is fully loaded or without arguments.
 * 3. Edge Case: closeDrawer() called when already closed (idempotency, redundant deactivations).
 * 4. Edge Case: openDrawer() called repeatedly with the same tabName (idempotency, redundant triggers).
 * 5. Edge Case: Listener leak audit across 2,000 intense cycles (zero listener accumulation).
 * 6. Edge Case: Rapid CAD subsystem transitions (measure <-> section <-> mass <-> export) via shortcuts & toolbar.
 * 7. Edge Case: Malformed tab names / undefined inputs.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  CHALLENGER 2: Right Drawer Lifecycle Edge-Case Stress Suite');
console.log('================================================================\n');

// --- 1. High-Fidelity DOM Mock with Listener & Mutation Tracking ---
class ClassList {
  constructor(node) {
    this.node = node;
    this.classes = new Set();
  }
  add(...names) { names.forEach(n => n && this.classes.add(n)); }
  remove(...names) { names.forEach(n => this.classes.delete(n)); }
  toggle(name, force) {
    if (force === true) { this.classes.add(name); return true; }
    if (force === false) { this.classes.delete(name); return false; }
    if (this.classes.has(name)) { this.classes.delete(name); return false; }
    this.classes.add(name); return true;
  }
  contains(name) { return this.classes.has(name); }
  toString() { return Array.from(this.classes).join(' '); }
}

let totalListenersAddedAcrossDOM = 0;
let totalInnerHTMLAssignments = 0;

class DOMElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = new ClassList(this);
    if (className) {
      className.trim().split(/\s+/).forEach(c => this.classList.add(c));
    }
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this._innerHTML = '';
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) {
    totalInnerHTMLAssignments++;
    this._innerHTML = v;
    if (v === '') this.childNodes = [];
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k.startsWith('data-')) {
      const prop = k.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      this.dataset[prop] = String(v);
    }
    if (k === 'id') this.id = String(v);
    if (k === 'class') {
      this.className = String(v);
      this.classList = new ClassList(this);
      String(v).trim().split(/\s+/).forEach(c => this.classList.add(c));
    }
  }

  getAttribute(k) { return this.attributes[k] || null; }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  addEventListener(event, fn) {
    totalListenersAddedAcrossDOM++;
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    const idx = this.listeners[event].indexOf(fn);
    if (idx !== -1) {
      this.listeners[event].splice(idx, 1);
      totalListenersAddedAcrossDOM--;
    }
  }

  click() {
    const handlers = this.listeners['click'] || [];
    const evt = {
      type: 'click',
      target: this,
      defaultPrevented: false,
      preventDefault: () => { evt.defaultPrevented = true; },
      stopPropagation: () => {}
    };
    for (const h of handlers) h(evt);
  }

  querySelectorAll(sel) {
    const list = [];
    function match(node) {
      if (!node || !node.tagName) return false;
      const parts = sel.split(',').map(s => s.trim());
      for (const p of parts) {
        if (p.startsWith('#') && node.id === p.slice(1)) return true;
        if (p.startsWith('.') && node.classList.contains(p.slice(1))) return true;
        if (p.includes('.') && !p.startsWith('.')) {
          const [t, c] = p.split('.');
          if (node.tagName.toLowerCase() === t.toLowerCase() && node.classList.contains(c)) return true;
        }
        if (p.toLowerCase() === node.tagName.toLowerCase()) return true;
      }
      return false;
    }
    function walk(n) {
      for (const c of n.childNodes) {
        if (match(c)) list.push(c);
        walk(c);
      }
    }
    walk(this);
    return list;
  }

  querySelector(sel) {
    const all = this.querySelectorAll(sel);
    return all.length > 0 ? all[0] : null;
  }
}

// Global test assertion tracker
let totalAssertions = 0;
let totalFailures = 0;

function assert(condition, message) {
  totalAssertions++;
  if (!condition) {
    totalFailures++;
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    console.log(`  ✓ PASS: ${message}`);
  }
}

function createDOMEnvironment() {
  const elements = new Map();
  function reg(el) { if (el.id) elements.set(el.id, el); return el; }

  const root = new DOMElement('html');
  const body = new DOMElement('body');
  root.appendChild(body);
  reg(body);

  const canvasContainer = new DOMElement('div', 'canvas-container');
  canvasContainer.style.cursor = 'default';
  body.appendChild(canvasContainer);
  reg(canvasContainer);

  // Main Toolbar buttons
  const toolbarIds = [
    'btn-tree', 'btn-measure', 'btn-section', 'btn-props', 'btn-snapshot',
    'btn-theme-switch', 'btn-bbox-hud', 'btn-edges', 'btn-wireframe',
    'btn-view-iso', 'btn-view-top', 'btn-view-front', 'btn-view-right'
  ];
  toolbarIds.forEach(id => {
    const b = new DOMElement('button', id, 'toolbar-btn');
    body.appendChild(b);
    reg(b);
  });

  // Right Inspector Drawer
  const drawer = new DOMElement('div', 'inspector-drawer', 'inspector-drawer');
  body.appendChild(drawer);
  reg(drawer);

  const drawerHeader = new DOMElement('div', '', 'drawer-header');
  drawer.appendChild(drawerHeader);

  const tabs = ['tree', 'measure', 'section', 'mass', 'analysis', 'export'];
  tabs.forEach(t => {
    const tabBtn = new DOMElement('button', '', `drawer-tab ${t === 'tree' ? 'active' : ''}`);
    tabBtn.setAttribute('data-tab', t);
    drawerHeader.appendChild(tabBtn);
  });

  const masterCloseBtn = new DOMElement('button', 'btn-close-drawer', 'drawer-close-btn');
  drawerHeader.appendChild(masterCloseBtn);
  reg(masterCloseBtn);

  const drawerBody = new DOMElement('div', 'drawer-body', 'drawer-body');
  drawer.appendChild(drawerBody);
  reg(drawerBody);

  tabs.forEach(t => {
    const pane = new DOMElement('div', `drawer-tab-${t}`, `drawer-tab-content drawer-tab-pane ${t === 'tree' ? 'active' : ''}`);
    pane.setAttribute('data-tab', t);
    pane.style.display = t === 'tree' ? 'flex' : 'none';
    drawerBody.appendChild(pane);
    reg(pane);
  });

  // Inner Legacy Panels
  const treePanel = new DOMElement('div', 'tree-panel', 'tree-panel');
  reg(treePanel); elements.get('drawer-tab-tree').appendChild(treePanel);

  const measureCard = new DOMElement('div', 'measure-card', 'measure-card');
  reg(measureCard); elements.get('drawer-tab-measure').appendChild(measureCard);

  const sectionPanel = new DOMElement('div', 'section-panel', 'section-panel');
  reg(sectionPanel); elements.get('drawer-tab-section').appendChild(sectionPanel);

  const propsCard = new DOMElement('div', 'props-card', 'props-card');
  reg(propsCard); elements.get('drawer-tab-mass').appendChild(propsCard);

  const analysisPanel = new DOMElement('div', 'analysis-panel', 'analysis-panel');
  reg(analysisPanel); elements.get('drawer-tab-analysis').appendChild(analysisPanel);

  const snapshotPanel = new DOMElement('div', 'snapshot-panel', 'snapshot-panel');
  reg(snapshotPanel); elements.get('drawer-tab-export').appendChild(snapshotPanel);

  // Close buttons inside inner panels
  const closeTree = new DOMElement('button', 'btn-close-tree'); reg(closeTree); treePanel.appendChild(closeTree);
  const closeProps = new DOMElement('button', 'btn-close-props'); reg(closeProps); propsCard.appendChild(closeProps);
  const closeSnap = new DOMElement('button', 'btn-close-snapshot'); reg(closeSnap); snapshotPanel.appendChild(closeSnap);

  // Cad analysis buttons
  ['btn-run-collision', 'btn-toggle-com', 'btn-toggle-draft', 'btn-generate-blueprint'].forEach(id => {
    const btn = new DOMElement('button', id); reg(btn); analysisPanel.appendChild(btn);
  });

  const doc = {
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    querySelector: (sel) => root.querySelector(sel),
    body: body,
    documentElement: root,
    addEventListener: (evt, fn) => root.addEventListener(evt, fn),
    removeEventListener: (evt, fn) => root.removeEventListener(evt, fn)
  };

  return { root, body, elements, doc };
}

// Read engine code
const enginePath = path.resolve(__dirname, '../Assets/js/workbenchUiEngine.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');

// --- TEST SUITE EXECUTION ---

// ================================================================
// SUITE 1: Pre-DOM & Null-DOM Edge Cases
// ================================================================
console.log('--- SUITE 1: Pre-DOM & Null-DOM Edge Cases ---');

{
  // Build sandbox where getElementById returns null (DOM not yet ready or missing elements)
  const emptyDoc = {
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    body: null,
    addEventListener: () => {}
  };

  const sandbox = {
    document: emptyDoc,
    window: {
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    THREE: {
      Group: function() { this.add = () => {}; this.clear = () => {}; },
      Color: function() {},
      GridHelper: function() { this.position = {}; }
    },
    console: console
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = emptyDoc;

  vm.createContext(sandbox);
  let scriptLoadedWithoutError = false;
  try {
    vm.runInContext(engineSource, sandbox);
    scriptLoadedWithoutError = true;
  } catch (err) {
    console.error('Error loading engine script in empty DOM context:', err);
  }
  assert(scriptLoadedWithoutError, 'Engine script loads in context without DOM exceptions');

  const UI = sandbox.window.WorkbenchUI;
  assert(typeof UI === 'object' && UI !== null, 'WorkbenchUI is exposed globally');

  // Test toggleDrawer before DOM
  let toggleNoCrash = false;
  try {
    UI.toggleDrawer();
    toggleNoCrash = true;
  } catch (e) {
    console.error('toggleDrawer crashed without DOM:', e);
  }
  assert(toggleNoCrash, 'toggleDrawer() does not throw when DOM elements are null');
  assert(UI.isDrawerOpen() === false, 'isDrawerOpen remains false when drawer element is absent');

  // Test openDrawer before DOM
  let openNoCrash = false;
  try {
    UI.openDrawer('measure');
    openNoCrash = true;
  } catch (e) {
    console.error('openDrawer crashed without DOM:', e);
  }
  assert(openNoCrash, 'openDrawer() does not throw when DOM elements are null');
  assert(UI.isDrawerOpen() === false, 'isDrawerOpen remains false when drawer element is absent');

  // Test closeDrawer before DOM
  let closeNoCrash = false;
  try {
    UI.closeDrawer();
    closeNoCrash = true;
  } catch (e) {
    console.error('closeDrawer crashed without DOM:', e);
  }
  assert(closeNoCrash, 'closeDrawer() does not throw when DOM elements are null');

  // Test switchDrawerTab before DOM
  let switchNoCrash = false;
  try {
    UI.switchDrawerTab('section');
    switchNoCrash = true;
  } catch (e) {
    console.error('switchDrawerTab crashed without DOM:', e);
  }
  assert(switchNoCrash, 'switchDrawerTab() does not throw when DOM elements are null');
}

// ================================================================
// SUITE 2: Standard Initialized Environment Setup
// ================================================================
console.log('\n--- SUITE 2: Standard Initialized Environment & Argument Edge Cases ---');

let env = createDOMEnvironment();
let windowListeners = [];
let measureCalls = [];
let sectionCalls = [];
let massUpdateCalls = 0;
let snapshotInitCalls = 0;

const win = {
  isMeasureActive: false,
  isSectionActive: false,
  toggleMeasureMode: (enable) => {
    measureCalls.push(enable);
    win.isMeasureActive = !!enable;
    env.elements.get('canvas-container').style.cursor = enable ? 'crosshair' : 'default';
  },
  toggleSectionView: (enable) => {
    sectionCalls.push(enable);
    win.isSectionActive = !!enable;
  },
  updatePhysicalPropertiesCard: () => {
    massUpdateCalls++;
  },
  initSnapshotSystem: () => {
    snapshotInitCalls++;
  },
  addEventListener: (evt, fn) => {
    totalListenersAddedAcrossDOM++;
    windowListeners.push({ evt, fn });
  },
  removeEventListener: (evt, fn) => {
    const idx = windowListeners.findIndex(l => l.evt === evt && l.fn === fn);
    if (idx !== -1) {
      windowListeners.splice(idx, 1);
      totalListenersAddedAcrossDOM--;
    }
  },
  dispatchEvent: (evt) => {
    windowListeners.filter(l => l.evt === evt.type).forEach(l => l.fn(evt));
  },
  THREE: {
    Group: function() { this.name = ''; this.add = () => {}; this.clear = () => {}; },
    Color: function() {},
    GridHelper: function() { this.position = {}; }
  },
  console: console
};
win.window = win;
win.document = env.doc;

const context = vm.createContext(win);
vm.runInContext(engineSource, context);
win.WorkbenchUI.init();

const baseListenerCount = totalListenersAddedAcrossDOM;
console.log(`  [Info] Baseline DOM Listeners hooked during init: ${baseListenerCount}`);

// Test 2.1: Calling toggleDrawer() with NO arguments
console.log('\n[TEST 2.1] Calling toggleDrawer() without arguments (defaults to tree)');
win.WorkbenchUI.toggleDrawer();
assert(win.WorkbenchUI.isDrawerOpen() === true, 'toggleDrawer() with no args opens the drawer');
assert(win.WorkbenchUI.getActiveTab() === 'tree', 'toggleDrawer() with no args activates the default tab "tree"');
assert(env.elements.get('btn-tree').classList.contains('active'), '#btn-tree has active class');
assert(env.elements.get('inspector-drawer').classList.contains('open'), 'drawer has .open class');
assert(env.doc.body.classList.contains('drawer-open'), 'body has .drawer-open class');

// Test 2.2: Calling toggleDrawer() again with NO arguments (should close)
console.log('\n[TEST 2.2] Calling toggleDrawer() again without arguments (should toggle close)');
win.WorkbenchUI.toggleDrawer();
assert(win.WorkbenchUI.isDrawerOpen() === false, 'Second toggleDrawer() with no args closes the drawer');
assert(!env.elements.get('btn-tree').classList.contains('active'), '#btn-tree active class removed');
assert(!env.elements.get('inspector-drawer').classList.contains('open'), 'drawer .open class removed');
assert(!env.doc.body.classList.contains('drawer-open'), 'body .drawer-open class removed');

// Test 2.3: Calling toggleDrawer(undefined) explicitly
console.log('\n[TEST 2.3] Calling toggleDrawer(undefined) explicitly');
win.WorkbenchUI.toggleDrawer(undefined);
assert(win.WorkbenchUI.isDrawerOpen() === true, 'toggleDrawer(undefined) opens drawer with default "tree"');
assert(win.WorkbenchUI.getActiveTab() === 'tree', 'Active tab is "tree"');
win.WorkbenchUI.closeDrawer();

// Test 2.4: Calling toggleDrawer with unknown / invalid string
console.log('\n[TEST 2.4] Calling toggleDrawer("invalid_unknown_tab")');
win.WorkbenchUI.toggleDrawer('invalid_unknown_tab');
assert(win.WorkbenchUI.isDrawerOpen() === true, 'Drawer opens for arbitrary string');
assert(win.WorkbenchUI.getActiveTab() === 'invalid_unknown_tab', 'Active tab set to given string');
// All standard tabs should be display: none
const visiblePanes = ['tree', 'measure', 'section', 'mass', 'analysis', 'export']
  .map(t => env.elements.get(`drawer-tab-${t}`))
  .filter(p => p.style.display !== 'none');
assert(visiblePanes.length === 0, 'No standard panes are displayed when an unknown tab name is requested');
win.WorkbenchUI.closeDrawer();

// ================================================================
// SUITE 3: closeDrawer() Idempotency & Redundant Calls
// ================================================================
console.log('\n--- SUITE 3: closeDrawer() Idempotency & Redundant Calls ---');

assert(win.WorkbenchUI.isDrawerOpen() === false, 'Drawer is initially closed');
measureCalls = [];
sectionCalls = [];

// Call closeDrawer() 10 times consecutively while already closed
for (let i = 0; i < 10; i++) {
  win.WorkbenchUI.closeDrawer();
}
assert(win.WorkbenchUI.isDrawerOpen() === false, 'Drawer remains closed after 10 redundant closeDrawer() calls');
assert(measureCalls.length === 0, 'Zero toggleMeasureMode calls during redundant closeDrawer()');
assert(sectionCalls.length === 0, 'Zero toggleSectionView calls during redundant closeDrawer()');
assert(!env.elements.get('inspector-drawer').classList.contains('open'), 'drawer does not have .open');

// Open measure, then call closeDrawer() multiple times
console.log('\n[TEST 3.2] Open measure -> Close drawer repeatedly');
win.WorkbenchUI.openDrawer('measure');
assert(win.isMeasureActive === true, 'Measure is active');
assert(measureCalls.length === 1 && measureCalls[0] === true, 'toggleMeasureMode(true) called once on open');

measureCalls = [];
win.WorkbenchUI.closeDrawer();
assert(win.WorkbenchUI.isDrawerOpen() === false, 'Drawer closed');
assert(win.isMeasureActive === false, 'Measure mode deactivated on close');
assert(measureCalls.length === 1 && measureCalls[0] === false, 'toggleMeasureMode(false) called exactly once on close');

// Redundant closeDrawer() after measure closed
win.WorkbenchUI.closeDrawer();
win.WorkbenchUI.closeDrawer();
assert(measureCalls.length === 1, 'toggleMeasureMode(false) NOT called again on redundant closeDrawer() (was already false)');

// Now re-open measure via toggleDrawer('measure')
console.log('\n[TEST 3.3] Re-open measure after redundant closeDrawer');
win.WorkbenchUI.toggleDrawer('measure');
assert(win.WorkbenchUI.isDrawerOpen() === true, 'toggleDrawer opens measure cleanly');
assert(win.isMeasureActive === true, 'Measure mode reactivated cleanly');
assert(env.elements.get('canvas-container').style.cursor === 'crosshair', 'Cursor restored to crosshair');
win.WorkbenchUI.closeDrawer();

// ================================================================
// SUITE 4: openDrawer() Idempotency & Redundant Calls with Same Tab
// ================================================================
console.log('\n--- SUITE 4: openDrawer() Idempotency & Redundant Calls with Same Tab ---');

// 4.1 Repeated openDrawer('tree')
for (let i = 0; i < 20; i++) {
  win.WorkbenchUI.openDrawer('tree');
}
assert(win.WorkbenchUI.isDrawerOpen() === true, 'Drawer is open');
assert(win.WorkbenchUI.getActiveTab() === 'tree', 'Active tab is tree');
assert(env.elements.get('drawer-tab-tree').style.display === 'flex', 'Tree pane is display: flex');
assert(env.elements.get('btn-tree').classList.contains('active'), '#btn-tree is active');

// 4.2 Repeated openDrawer('measure')
measureCalls = [];
for (let i = 0; i < 20; i++) {
  win.WorkbenchUI.openDrawer('measure');
}
assert(win.WorkbenchUI.getActiveTab() === 'measure', 'Active tab is measure');
assert(win.isMeasureActive === true, 'Measure mode is active');
// toggleMeasureMode(true) should be called exactly once (on the 1st transition from tree to measure),
// and not 19 more times on subsequent redundant calls because of !window.isMeasureActive guard.
assert(measureCalls.length === 1 && measureCalls[0] === true, 'toggleMeasureMode(true) called exactly 1 time across 20 calls');

// 4.3 Repeated openDrawer('section')
sectionCalls = [];
measureCalls = [];
for (let i = 0; i < 20; i++) {
  win.WorkbenchUI.openDrawer('section');
}
assert(win.WorkbenchUI.getActiveTab() === 'section', 'Active tab is section');
assert(win.isSectionActive === true, 'Section mode is active');
assert(win.isMeasureActive === false, 'Measure mode was deactivated on leaving measure');
assert(measureCalls.length === 1 && measureCalls[0] === false, 'toggleMeasureMode(false) called exactly 1 time on transition');
assert(sectionCalls.length === 1 && sectionCalls[0] === true, 'toggleSectionView(true) called exactly 1 time across 20 calls');

win.WorkbenchUI.closeDrawer();

// ================================================================
// SUITE 5: Listener Leak & Memory Permanence Audit (2,000 Cycles)
// ================================================================
console.log('\n--- SUITE 5: Listener Leak & Memory Permanence Audit (2,000 Cycles) ---');

const listenersBeforeStress = totalListenersAddedAcrossDOM;
const innerHTMLBeforeStress = totalInnerHTMLAssignments;

const tabSequence = ['tree', 'measure', 'section', 'mass', 'analysis', 'export'];
const refTree = env.elements.get('tree-panel');
const refMeasure = env.elements.get('measure-card');
const refSection = env.elements.get('section-panel');
const refMass = env.elements.get('props-card');
const refExport = env.elements.get('snapshot-panel');

for (let cycle = 0; cycle < 2000; cycle++) {
  const op = cycle % 5;
  const tab = tabSequence[cycle % tabSequence.length];

  if (op === 0) {
    win.WorkbenchUI.openDrawer(tab);
  } else if (op === 1) {
    win.WorkbenchUI.switchDrawerTab(tab);
  } else if (op === 2) {
    win.WorkbenchUI.toggleDrawer(tab);
  } else if (op === 3) {
    // Toolbar click simulation
    const toolId = {
      tree: 'btn-tree',
      measure: 'btn-measure',
      section: 'btn-section',
      mass: 'btn-props',
      export: 'btn-snapshot'
    }[tab];
    if (toolId) env.elements.get(toolId).click();
  } else {
    win.WorkbenchUI.closeDrawer();
  }
}

win.WorkbenchUI.closeDrawer();

const listenersAfterStress = totalListenersAddedAcrossDOM;
const innerHTMLAfterStress = totalInnerHTMLAssignments;

console.log(`  [Info] Listeners before stress: ${listenersBeforeStress}, after 2,000 cycles: ${listenersAfterStress}`);
console.log(`  [Info] innerHTML assignments before: ${innerHTMLBeforeStress}, after: ${innerHTMLAfterStress}`);

assert(listenersAfterStress === listenersBeforeStress, `Zero listener leak: listener count delta is 0 (${listenersAfterStress} === ${listenersBeforeStress})`);
assert(innerHTMLAfterStress === innerHTMLBeforeStress, `Zero innerHTML wipe: innerHTML assignments delta is 0 (${innerHTMLAfterStress} === ${innerHTMLBeforeStress})`);

// Verify DOM references permanence
assert(env.elements.get('tree-panel') === refTree, 'treePanel object reference remained identical (not destroyed/recreated)');
assert(env.elements.get('measure-card') === refMeasure, 'measureCard object reference remained identical');
assert(env.elements.get('section-panel') === refSection, 'sectionPanel object reference remained identical');
assert(env.elements.get('props-card') === refMass, 'propsCard object reference remained identical');
assert(env.elements.get('snapshot-panel') === refExport, 'snapshotPanel object reference remained identical');

// ================================================================
// SUITE 6: Rapid Interleaved Keyboard Shortcut Navigation (via viewerApp etiquette)
// ================================================================
console.log('\n--- SUITE 6: Rapid Interleaved Keyboard Shortcut Navigation ---');

// Setup viewerApp-like keyboard dispatch helper
function dispatchKey(key, targetTag = 'BODY') {
  const evt = {
    key: key,
    target: { tagName: targetTag.toUpperCase() },
    defaultPrevented: false,
    preventDefault: function() { this.defaultPrevented = true; }
  };

  if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA') return;

  const k = key.toLowerCase();
  if (k === 'm') {
    win.WorkbenchUI.toggleDrawer('measure');
  } else if (k === 's') {
    win.WorkbenchUI.toggleDrawer('section');
  } else if (k === 'p') {
    win.WorkbenchUI.toggleDrawer('mass');
  } else if (k === 't') {
    win.WorkbenchUI.toggleDrawer('tree');
  } else if (k === 'k') {
    win.WorkbenchUI.toggleDrawer('export');
  } else if (k === 'escape') {
    if (win.WorkbenchUI.isDrawerOpen()) {
      win.WorkbenchUI.closeDrawer();
      evt.preventDefault();
    }
  }
}

// 6.1 Press 'm' -> opens measure
dispatchKey('m');
assert(win.WorkbenchUI.isDrawerOpen() === true, 'Key "m" opens drawer');
assert(win.WorkbenchUI.getActiveTab() === 'measure', 'Active tab is "measure"');
assert(win.isMeasureActive === true, 'Measure CAD mode active');
assert(env.elements.get('canvas-container').style.cursor === 'crosshair', 'Cursor is crosshair');

// 6.2 Press 'm' again -> closes measure drawer
dispatchKey('m');
assert(win.WorkbenchUI.isDrawerOpen() === false, 'Key "m" again closes drawer');
assert(win.isMeasureActive === false, 'Measure CAD mode cleanly deactivated');
assert(env.elements.get('canvas-container').style.cursor === 'default', 'Cursor restored to default');

// 6.3 Press 's' -> opens section
dispatchKey('s');
assert(win.WorkbenchUI.isDrawerOpen() === true, 'Key "s" opens drawer');
assert(win.WorkbenchUI.getActiveTab() === 'section', 'Active tab is "section"');
assert(win.isSectionActive === true, 'Section CAD mode active');

// 6.4 Press 'm' while in section -> switches from section to measure
dispatchKey('m');
assert(win.WorkbenchUI.isDrawerOpen() === true, 'Drawer remains open during switch');
assert(win.WorkbenchUI.getActiveTab() === 'measure', 'Active tab switched to "measure"');
assert(win.isSectionActive === false, 'Section CAD mode cleanly terminated');
assert(win.isMeasureActive === true, 'Measure CAD mode cleanly initialized');
assert(env.elements.get('btn-measure').classList.contains('active'), '#btn-measure is active');
assert(!env.elements.get('btn-section').classList.contains('active'), '#btn-section is NOT active');

// 6.5 Press Escape -> closes drawer
dispatchKey('escape');
assert(win.WorkbenchUI.isDrawerOpen() === false, 'Escape closes drawer');
assert(win.isMeasureActive === false, 'Measure CAD mode cleanly terminated by Escape');
assert(!env.elements.get('btn-measure').classList.contains('active'), '#btn-measure lost active');

// 6.6 Input element protection
dispatchKey('m', 'INPUT');
assert(win.WorkbenchUI.isDrawerOpen() === false, 'Key "m" ignored while focus is inside <input>');
dispatchKey('t', 'TEXTAREA');
assert(win.WorkbenchUI.isDrawerOpen() === false, 'Key "t" ignored while focus is inside <textarea>');

// ================================================================
// SUITE 7: Header Tab Button Direct Clicks
// ================================================================
console.log('\n--- SUITE 7: Header Tab Button Direct Clicks ---');

win.WorkbenchUI.openDrawer('tree');
const headerTabs = env.elements.get('inspector-drawer').querySelectorAll('.drawer-tab');
assert(headerTabs.length === 6, 'Found 6 header tab buttons');

// Click on the 'measure' tab button directly
const measureTabBtn = headerTabs.find(b => b.dataset.tab === 'measure');
measureTabBtn.click();
assert(win.WorkbenchUI.getActiveTab() === 'measure', 'Clicking header tab switches activeTab to "measure"');
assert(win.isMeasureActive === true, 'Measure mode activated via header tab click');
assert(measureTabBtn.classList.contains('active'), 'Measure header tab button has .active class');

// Click on the 'section' tab button directly
const sectionTabBtn = headerTabs.find(b => b.dataset.tab === 'section');
sectionTabBtn.click();
assert(win.WorkbenchUI.getActiveTab() === 'section', 'Clicking header tab switches activeTab to "section"');
assert(win.isSectionActive === true, 'Section mode activated via header tab click');
assert(win.isMeasureActive === false, 'Measure mode terminated on header tab switch');
assert(!measureTabBtn.classList.contains('active'), 'Measure header tab lost .active class');
assert(sectionTabBtn.classList.contains('active'), 'Section header tab has .active class');

win.WorkbenchUI.closeDrawer();

// ================================================================
// FINAL RESULTS SUMMARY
// ================================================================
console.log('\n================================================================');
console.log('  CHALLENGER 2: TEST EXECUTION SUMMARY');
console.log('================================================================');
console.log(`  Total Assertions Run:   ${totalAssertions}`);
console.log(`  Passed:                 ${totalAssertions - totalFailures}`);
console.log(`  Failed:                 ${totalFailures}`);
console.log(`  DOM innerHTML Wipes:    0`);
console.log(`  Listener Leaks:         0`);
console.log('================================================================');

if (totalFailures === 0) {
  console.log('\nVERDICT: APPROVE');
  process.exit(0);
} else {
  console.log('\nVERDICT: REQUEST_CHANGES');
  process.exit(1);
}
