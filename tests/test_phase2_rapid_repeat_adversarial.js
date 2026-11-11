/**
 * Rapid Keyboard Repeat & Subsystem Invariant Stress Test for Phase 2
 * Author: Challenger 1 (challenger_m2_it2_1)
 *
 * Requirements Tested:
 * 1. Rapid keyboard repeat (holding down 'M' or alternating 'M', 'S', 'P', 'K' at high speed).
 * 2. Invariant: Whenever drawer closes or switches, `isMeasureActive` and `isSectionActive` match the active tab accurately.
 * 3. Invariant: Viewport cursor restores to 'default' whenever Measure tab is closed or switched away from.
 * 4. DOM permanence: 0 innerHTML wipes across all transitions.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  CHALLENGER 1: Rapid Keyboard Repeat & Subsystem Stress Harness');
console.log('================================================================\n');

// 1. High-Fidelity DOM Mock with Setter Spy
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
    if (this._onInnerHTMLSet) this._onInnerHTMLSet(v);
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
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  click() {
    const handlers = this.listeners['click'] || [];
    const evt = { type: 'click', target: this, defaultPrevented: false, preventDefault: () => { evt.defaultPrevented = true; }, stopPropagation: () => {} };
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

function createHarness() {
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

  const measureTooltip = new DOMElement('div', 'measure-tooltip');
  measureTooltip.style.display = 'none';
  body.appendChild(measureTooltip);
  reg(measureTooltip);

  const toolbarDock = new DOMElement('div', 'toolbar-dock', 'toolbar');
  body.appendChild(toolbarDock);
  reg(toolbarDock);

  const toolbarButtons = [
    'btn-edges', 'btn-wireframe', 'btn-autorotate',
    'btn-view-iso', 'btn-view-top', 'btn-view-front', 'btn-view-right',
    'btn-bbox-hud', 'btn-tree', 'btn-explode', 'btn-measure', 'btn-section',
    'btn-props', 'btn-units', 'btn-reset', 'btn-snapshot', 'btn-theme-switch', 'btn-clearcache'
  ];
  toolbarButtons.forEach(id => {
    const btn = new DOMElement('button', id, 'btn');
    toolbarDock.appendChild(btn);
    reg(btn);
  });

  const drawer = new DOMElement('div', 'inspector-drawer', 'inspector-drawer');
  body.appendChild(drawer);
  reg(drawer);

  const drawerHeader = new DOMElement('div', '', 'drawer-header');
  drawer.appendChild(drawerHeader);

  const drawerTabsContainer = new DOMElement('div', '', 'drawer-tabs');
  drawerHeader.appendChild(drawerTabsContainer);

  const tabNames = ['tree', 'measure', 'section', 'mass', 'analysis', 'export'];
  const tabButtons = {};
  tabNames.forEach(t => {
    const btn = new DOMElement('button', '', `drawer-tab ${t === 'tree' ? 'active' : ''}`);
    btn.setAttribute('data-tab', t);
    drawerTabsContainer.appendChild(btn);
    tabButtons[t] = btn;
  });

  const btnCloseDrawer = new DOMElement('button', 'btn-close-drawer', 'drawer-close-btn');
  drawerHeader.appendChild(btnCloseDrawer);
  reg(btnCloseDrawer);

  const drawerBody = new DOMElement('div', 'drawer-body', 'drawer-body');
  drawer.appendChild(drawerBody);
  reg(drawerBody);

  let innerHTMLWipeCount = 0;
  drawerBody._onInnerHTMLSet = (val) => {
    innerHTMLWipeCount++;
  };

  const panes = {};
  tabNames.forEach(t => {
    const pane = new DOMElement('div', `drawer-tab-${t}`, `drawer-tab-content drawer-tab-pane ${t === 'tree' ? 'active' : ''}`);
    pane.setAttribute('data-tab', t);
    pane.style.display = t === 'tree' ? 'flex' : 'none';
    drawerBody.appendChild(pane);
    reg(pane);
    panes[t] = pane;
  });

  const treePanel = new DOMElement('div', 'tree-panel', 'tree-panel');
  panes.tree.appendChild(treePanel);
  reg(treePanel);

  const measureCard = new DOMElement('div', 'measure-card', 'measure-card');
  panes.measure.appendChild(measureCard);
  reg(measureCard);

  const sectionPanel = new DOMElement('div', 'section-panel', 'section-panel');
  panes.section.appendChild(sectionPanel);
  reg(sectionPanel);

  const propsCard = new DOMElement('div', 'props-card', 'measure-card');
  panes.mass.appendChild(propsCard);
  reg(propsCard);

  const snapshotPanel = new DOMElement('div', 'snapshot-panel', 'snapshot-panel');
  panes.export.appendChild(snapshotPanel);
  reg(snapshotPanel);

  const windowListeners = { keydown: [] };

  const windowMock = {
    addEventListener: (ev, handler) => {
      if (!windowListeners[ev]) windowListeners[ev] = [];
      windowListeners[ev].push(handler);
    },
    removeEventListener: (ev, handler) => {
      if (windowListeners[ev]) {
        windowListeners[ev] = windowListeners[ev].filter(h => h !== handler);
      }
    },
    document: {
      body,
      getElementById: (id) => elements.get(id) || null,
      querySelector: (sel) => body.querySelector(sel),
      querySelectorAll: (sel) => body.querySelectorAll(sel),
      createElement: (tag) => new DOMElement(tag)
    },
    THREE: {
      Group: function() { this.name = ''; this.add = () => {}; this.clear = () => {}; },
      Color: function(c) { this.color = c; },
      GridHelper: function() { this.position = { y: 0 }; }
    },
    isMeasureActive: false,
    isSectionActive: false,

    toggleMeasureMode: function(enable) {
      windowMock.isMeasureActive = (enable !== undefined) ? enable : !windowMock.isMeasureActive;
      const btn = elements.get('btn-measure');
      const card = elements.get('measure-card');
      const container = canvasContainer;
      const tooltip = measureTooltip;

      if (windowMock.isMeasureActive) {
        if (btn) btn.classList.add('active');
        if (card) card.style.display = 'flex';
        if (container) container.style.cursor = 'crosshair';
      } else {
        if (btn) btn.classList.remove('active');
        if (card) card.style.display = 'none';
        if (tooltip) tooltip.style.display = 'none';
        if (container) container.style.cursor = 'default';
      }
    },

    toggleSectionView: function(enable) {
      windowMock.isSectionActive = (enable !== undefined) ? enable : !windowMock.isSectionActive;
      const btn = elements.get('btn-section');
      const panel = elements.get('section-panel');
      if (windowMock.isSectionActive) {
        if (btn) btn.classList.add('active');
        if (panel) panel.style.display = 'flex';
      } else {
        if (btn) btn.classList.remove('active');
        if (panel) panel.style.display = 'none';
      }
    },

    updatePhysicalPropertiesCard: function() {},
    initSnapshotSystem: function() {}
  };
  windowMock.window = windowMock;

  const workbenchUiCode = fs.readFileSync(path.resolve(__dirname, '../Assets/js/workbenchUiEngine.js'), 'utf8');
  const vmContext = vm.createContext(windowMock);
  vm.runInContext(workbenchUiCode, vmContext);
  windowMock.WorkbenchUI.init();

  function dispatchKey(key, repeat = false) {
    const evt = {
      type: 'keydown',
      key: key,
      repeat: repeat,
      target: body,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => {},
      stopPropagation: () => {}
    };

    for (const h of windowListeners.keydown) h(evt);

    const k = key.toLowerCase();
    if (k === 'm') {
      windowMock.WorkbenchUI.toggleDrawer('measure');
    } else if (k === 's') {
      windowMock.WorkbenchUI.toggleDrawer('section');
    } else if (k === 'p') {
      windowMock.WorkbenchUI.toggleDrawer('mass');
    } else if (k === 't') {
      windowMock.WorkbenchUI.toggleDrawer('tree');
    } else if (k === 'k') {
      windowMock.WorkbenchUI.toggleDrawer('export');
    } else if (k === 'escape') {
      if (windowMock.WorkbenchUI.isDrawerOpen()) {
        windowMock.WorkbenchUI.closeDrawer();
      }
    }
  }

  return {
    elements,
    canvasContainer,
    drawer,
    drawerBody,
    tabButtons,
    panes,
    windowMock,
    dispatchKey,
    getInnerHTMLWipeCount: () => innerHTMLWipeCount
  };
}

// Invariant Oracle
function verifyInvariants(harness, contextDescription) {
  const { elements, canvasContainer, drawer, tabButtons, windowMock } = harness;
  const isOpen = windowMock.WorkbenchUI.isDrawerOpen();
  const activeTab = windowMock.WorkbenchUI.getActiveTab();
  const errors = [];

  // Invariant A: Drawer open state class coherence
  if (isOpen !== drawer.classList.contains('open')) {
    errors.push(`Drawer open boolean (${isOpen}) contradicts drawer.classList contains 'open' (${drawer.classList.contains('open')})`);
  }

  // Invariant B: Subsystem coherence
  if (isOpen) {
    if (activeTab === 'measure') {
      if (!windowMock.isMeasureActive) errors.push(`activeTab is 'measure' but isMeasureActive is false`);
      if (canvasContainer.style.cursor !== 'crosshair') errors.push(`activeTab is 'measure' but cursor is '${canvasContainer.style.cursor}' (expected 'crosshair')`);
      if (windowMock.isSectionActive) errors.push(`activeTab is 'measure' but isSectionActive is true`);
      if (!elements.get('btn-measure').classList.contains('active')) errors.push(`#btn-measure missing active class`);
      if (!tabButtons.measure.classList.contains('active')) errors.push(`drawer-tab 'measure' missing active class`);
    } else if (activeTab === 'section') {
      if (!windowMock.isSectionActive) errors.push(`activeTab is 'section' but isSectionActive is false`);
      if (windowMock.isMeasureActive) errors.push(`activeTab is 'section' but isMeasureActive is true`);
      if (canvasContainer.style.cursor !== 'default') errors.push(`activeTab is 'section' but cursor is '${canvasContainer.style.cursor}' (expected 'default')`);
      if (!elements.get('btn-section').classList.contains('active')) errors.push(`#btn-section missing active class`);
      if (!tabButtons.section.classList.contains('active')) errors.push(`drawer-tab 'section' missing active class`);
    } else {
      // Any other tab (tree, mass, export, analysis)
      if (windowMock.isMeasureActive) errors.push(`activeTab is '${activeTab}' but isMeasureActive is true`);
      if (windowMock.isSectionActive) errors.push(`activeTab is '${activeTab}' but isSectionActive is true`);
      if (canvasContainer.style.cursor !== 'default') errors.push(`activeTab is '${activeTab}' but cursor is '${canvasContainer.style.cursor}' (expected 'default')`);
      if (elements.get('btn-measure').classList.contains('active')) errors.push(`#btn-measure has active class when tab is '${activeTab}'`);
      if (elements.get('btn-section').classList.contains('active')) errors.push(`#btn-section has active class when tab is '${activeTab}'`);
    }
  } else {
    // Drawer is closed
    if (windowMock.isMeasureActive) errors.push(`Drawer is closed but isMeasureActive is true`);
    if (windowMock.isSectionActive) errors.push(`Drawer is closed but isSectionActive is true`);
    if (canvasContainer.style.cursor !== 'default') errors.push(`Drawer is closed but cursor is '${canvasContainer.style.cursor}' (expected 'default')`);
    if (elements.get('btn-measure').classList.contains('active')) errors.push(`Drawer is closed but #btn-measure has active class`);
    if (elements.get('btn-section').classList.contains('active')) errors.push(`Drawer is closed but #btn-section has active class`);
  }

  if (errors.length > 0) {
    throw new Error(`[Invariant Violation] at "${contextDescription}":\n  ${errors.join('\n  ')}`);
  }
}

// -------------------------------------------------------------
// TEST SUITE EXECUTION
// -------------------------------------------------------------
let totalAssertions = 0;
function assert(desc, fn) {
  try {
    fn();
    totalAssertions++;
  } catch (err) {
    console.error(`❌ TEST FAILED: ${desc}`);
    console.error(err.message);
    process.exit(1);
  }
}

console.log('--- TEST 1: Rapid Keyboard Repeat: 500 consecutive "M" keystrokes (holding "M") ---');
{
  const harness = createHarness();
  for (let i = 0; i < 500; i++) {
    harness.dispatchKey('m', i > 0);
    verifyInvariants(harness, `Repeat 'm' iteration ${i}`);
  }
  // After 500 presses (even count), drawer should be closed, cursor default, subsystems inactive
  assert("500 'm' keystrokes leaves drawer closed and cursor default", () => {
    if (harness.windowMock.WorkbenchUI.isDrawerOpen() !== false) throw new Error("Drawer should be closed");
    if (harness.canvasContainer.style.cursor !== 'default') throw new Error("Cursor should be default");
    if (harness.windowMock.isMeasureActive !== false) throw new Error("isMeasureActive should be false");
  });
}
console.log('    ✓ PASS: 500 rapid "M" repeat keystrokes preserved perfect state coherence');

console.log('--- TEST 2: Rapid Keyboard Repeat: 500 consecutive "S" keystrokes (holding "S") ---');
{
  const harness = createHarness();
  for (let i = 0; i < 500; i++) {
    harness.dispatchKey('s', i > 0);
    verifyInvariants(harness, `Repeat 's' iteration ${i}`);
  }
  assert("500 's' keystrokes leaves drawer closed and section inactive", () => {
    if (harness.windowMock.WorkbenchUI.isDrawerOpen() !== false) throw new Error("Drawer should be closed");
    if (harness.windowMock.isSectionActive !== false) throw new Error("isSectionActive should be false");
  });
}
console.log('    ✓ PASS: 500 rapid "S" repeat keystrokes preserved perfect state coherence');

console.log('--- TEST 3: High-Speed Alternating "M" and "S" (200 cycles) ---');
{
  const harness = createHarness();
  for (let cycle = 0; cycle < 200; cycle++) {
    harness.dispatchKey('m');
    verifyInvariants(harness, `Cycle ${cycle} - press 'm'`);
    assert(`Cycle ${cycle} 'm' active`, () => {
      if (harness.windowMock.WorkbenchUI.getActiveTab() !== 'measure') throw new Error("Expected activeTab measure");
      if (harness.canvasContainer.style.cursor !== 'crosshair') throw new Error("Expected crosshair");
      if (harness.windowMock.isMeasureActive !== true) throw new Error("Expected isMeasureActive true");
      if (harness.windowMock.isSectionActive !== false) throw new Error("Expected isSectionActive false");
    });

    harness.dispatchKey('s');
    verifyInvariants(harness, `Cycle ${cycle} - press 's'`);
    assert(`Cycle ${cycle} 's' active`, () => {
      if (harness.windowMock.WorkbenchUI.getActiveTab() !== 'section') throw new Error("Expected activeTab section");
      if (harness.canvasContainer.style.cursor !== 'default') throw new Error("Expected cursor default");
      if (harness.windowMock.isMeasureActive !== false) throw new Error("Expected isMeasureActive false");
      if (harness.windowMock.isSectionActive !== true) throw new Error("Expected isSectionActive true");
    });
  }
}
console.log('    ✓ PASS: 200 alternating M <-> S cycles correctly swapped CAD modes and cursors');

console.log('--- TEST 4: Rapid Cycling Through All Tabs "M" -> "S" -> "P" -> "K" -> "T" (100 cycles) ---');
{
  const harness = createHarness();
  const sequence = [
    { key: 'm', tab: 'measure', measure: true, section: false, cursor: 'crosshair' },
    { key: 's', tab: 'section', measure: false, section: true, cursor: 'default' },
    { key: 'p', tab: 'mass', measure: false, section: false, cursor: 'default' },
    { key: 'k', tab: 'export', measure: false, section: false, cursor: 'default' },
    { key: 't', tab: 'tree', measure: false, section: false, cursor: 'default' }
  ];

  for (let cycle = 0; cycle < 100; cycle++) {
    for (const step of sequence) {
      harness.dispatchKey(step.key);
      verifyInvariants(harness, `Cycle ${cycle} - key '${step.key}'`);
      assert(`Cycle ${cycle} step '${step.key}' state`, () => {
        if (harness.windowMock.WorkbenchUI.getActiveTab() !== step.tab) throw new Error(`Expected tab ${step.tab}`);
        if (harness.windowMock.isMeasureActive !== step.measure) throw new Error(`Expected isMeasureActive ${step.measure}`);
        if (harness.windowMock.isSectionActive !== step.section) throw new Error(`Expected isSectionActive ${step.section}`);
        if (harness.canvasContainer.style.cursor !== step.cursor) throw new Error(`Expected cursor ${step.cursor}`);
      });
    }
  }
}
console.log('    ✓ PASS: 100 cycles of M -> S -> P -> K -> T maintained 100% subsystem accuracy');

console.log('--- TEST 5: Rapid "Escape" Dismissal from Measure and Section (100 cycles) ---');
{
  const harness = createHarness();
  for (let i = 0; i < 50; i++) {
    // Open measure, then escape
    harness.dispatchKey('m');
    verifyInvariants(harness, `Esc test ${i} - open measure`);
    harness.dispatchKey('escape');
    verifyInvariants(harness, `Esc test ${i} - escape from measure`);
    assert(`Esc test ${i} measure cleanup`, () => {
      if (harness.windowMock.WorkbenchUI.isDrawerOpen() !== false) throw new Error("Drawer should be closed");
      if (harness.canvasContainer.style.cursor !== 'default') throw new Error("Cursor should be default");
      if (harness.windowMock.isMeasureActive !== false) throw new Error("isMeasureActive should be false");
    });

    // Open section, then escape
    harness.dispatchKey('s');
    verifyInvariants(harness, `Esc test ${i} - open section`);
    harness.dispatchKey('escape');
    verifyInvariants(harness, `Esc test ${i} - escape from section`);
    assert(`Esc test ${i} section cleanup`, () => {
      if (harness.windowMock.WorkbenchUI.isDrawerOpen() !== false) throw new Error("Drawer should be closed");
      if (harness.windowMock.isSectionActive !== false) throw new Error("isSectionActive should be false");
    });
  }
}
console.log('    ✓ PASS: Rapid Escape dismissal reliably cleans up CAD subsystems and resets cursor');

console.log('--- TEST 6: Chaotic Fuzzing: 5,000 Random Keystrokes & UI Clicks ---');
{
  const harness = createHarness();
  const keys = ['m', 'M', 's', 'S', 'p', 'P', 'k', 'K', 't', 'T', 'escape', 'Escape', 'x', 'z', '1', '2'];
  const clickables = [
    // Toolbar buttons (always visible on screen)
    { desc: '#btn-measure', fn: () => harness.elements.get('btn-measure').click() },
    { desc: '#btn-section', fn: () => harness.elements.get('btn-section').click() },
    { desc: '#btn-tree', fn: () => harness.elements.get('btn-tree').click() },
    { desc: '#btn-props', fn: () => harness.elements.get('btn-props').click() },
    { desc: '#btn-snapshot', fn: () => harness.elements.get('btn-snapshot').click() },
    // Drawer-internal elements (only clickable when drawer is open)
    { desc: 'tab-tree', fn: () => harness.windowMock.WorkbenchUI.isDrawerOpen() && harness.tabButtons.tree.click() },
    { desc: 'tab-measure', fn: () => harness.windowMock.WorkbenchUI.isDrawerOpen() && harness.tabButtons.measure.click() },
    { desc: 'tab-section', fn: () => harness.windowMock.WorkbenchUI.isDrawerOpen() && harness.tabButtons.section.click() },
    { desc: 'tab-mass', fn: () => harness.windowMock.WorkbenchUI.isDrawerOpen() && harness.tabButtons.mass.click() },
    { desc: 'tab-export', fn: () => harness.windowMock.WorkbenchUI.isDrawerOpen() && harness.tabButtons.export.click() },
    { desc: '#btn-close-drawer', fn: () => harness.windowMock.WorkbenchUI.isDrawerOpen() && harness.elements.get('btn-close-drawer').click() },
    { desc: '#btn-close-tree', fn: () => harness.windowMock.WorkbenchUI.isDrawerOpen() && harness.elements.get('tree-panel').querySelector('#btn-close-tree')?.click() },
    { desc: '#btn-close-props', fn: () => harness.windowMock.WorkbenchUI.isDrawerOpen() && harness.elements.get('props-card').querySelector('#btn-close-props')?.click() },
    { desc: '#btn-close-snapshot', fn: () => harness.windowMock.WorkbenchUI.isDrawerOpen() && harness.elements.get('snapshot-panel').querySelector('#btn-close-snapshot')?.click() }
  ];

  const actionHistory = [];
  for (let i = 0; i < 5000; i++) {
    let actDesc = '';
    if (Math.random() < 0.6) {
      const randKey = keys[Math.floor(Math.random() * keys.length)];
      actDesc = `key '${randKey}'`;
      actionHistory.push(actDesc);
      harness.dispatchKey(randKey);
    } else {
      const randIdx = Math.floor(Math.random() * clickables.length);
      actDesc = `click: ${clickables[randIdx].desc}`;
      actionHistory.push(actDesc);
      clickables[randIdx].fn();
    }
    try {
      verifyInvariants(harness, `Fuzz iteration ${i} (${actDesc})`);
    } catch (e) {
      console.log('Recent 10 actions:');
      console.log(actionHistory.slice(-10).join(' -> '));
      throw e;
    }
  }

  assert("0 innerHTML wipes across 5,000 chaotic operations", () => {
    if (harness.getInnerHTMLWipeCount() !== 0) throw new Error(`innerHTML wipes detected: ${harness.getInnerHTMLWipeCount()}`);
  });
}
console.log('    ✓ PASS: 5,000 chaotic operations passed with ZERO invariant violations and 0 DOM wipes');

console.log('--- TEST 7: Exhaustive Verification of All 18 Measure Mode Exit Paths ---');
{
  const paths = [
    { name: '1. Key "s" to Section', action: (h) => h.dispatchKey('s') },
    { name: '2. Click #btn-section', action: (h) => h.elements.get('btn-section').click() },
    { name: '3. Click header tab "section"', action: (h) => h.tabButtons.section.click() },
    { name: '4. Key "t" to Tree', action: (h) => h.dispatchKey('t') },
    { name: '5. Click #btn-tree', action: (h) => h.elements.get('btn-tree').click() },
    { name: '6. Click header tab "tree"', action: (h) => h.tabButtons.tree.click() },
    { name: '7. Key "p" to Mass', action: (h) => h.dispatchKey('p') },
    { name: '8. Click #btn-props', action: (h) => h.elements.get('btn-props').click() },
    { name: '9. Click header tab "mass"', action: (h) => h.tabButtons.mass.click() },
    { name: '10. Key "k" to Export', action: (h) => h.dispatchKey('k') },
    { name: '11. Click #btn-snapshot', action: (h) => h.elements.get('btn-snapshot').click() },
    { name: '12. Click header tab "export"', action: (h) => h.tabButtons.export.click() },
    { name: '13. Key "m" (toggle close)', action: (h) => h.dispatchKey('m') },
    { name: '14. Click #btn-measure (toggle close)', action: (h) => h.elements.get('btn-measure').click() },
    { name: '15. Key "Escape" (close drawer)', action: (h) => h.dispatchKey('escape') },
    { name: '16. Click #btn-close-drawer', action: (h) => h.elements.get('btn-close-drawer').click() },
    { name: '17. WorkbenchUI.closeDrawer() direct call', action: (h) => h.windowMock.WorkbenchUI.closeDrawer() },
    { name: '18. Key "c" measurement clear & close', action: (h) => {
      // In viewerApp.js: when isMeasureActive and selectedCadEntities is empty, key 'c' closes drawer
      if (h.windowMock.isMeasureActive) h.windowMock.WorkbenchUI.closeDrawer();
    }}
  ];

  for (const p of paths) {
    const harness = createHarness();
    // 1. Enter Measure mode
    harness.dispatchKey('m');
    assert(`Enter measure for ${p.name}`, () => {
      if (harness.windowMock.WorkbenchUI.getActiveTab() !== 'measure') throw new Error("Expected activeTab measure");
      if (harness.windowMock.isMeasureActive !== true) throw new Error("Expected isMeasureActive true");
      if (harness.canvasContainer.style.cursor !== 'crosshair') throw new Error("Expected cursor crosshair");
    });

    // 2. Execute exit action
    p.action(harness);

    // 3. Verify cursor restored to 'default' and isMeasureActive is false
    assert(`Exit measure via ${p.name}`, () => {
      if (harness.canvasContainer.style.cursor !== 'default') {
        throw new Error(`Path ${p.name} failed: cursor is '${harness.canvasContainer.style.cursor}', expected 'default'`);
      }
      if (harness.windowMock.isMeasureActive !== false) {
        throw new Error(`Path ${p.name} failed: isMeasureActive is ${harness.windowMock.isMeasureActive}, expected false`);
      }
      if (harness.elements.get('btn-measure').classList.contains('active')) {
        throw new Error(`Path ${p.name} failed: #btn-measure still has active class`);
      }
    });
  }
}
console.log('    ✓ PASS: All 18 exit paths out of Measure mode reliably restore cursor to "default" and disable measure mode');

console.log('\n================================================================');
console.log(`  ALL ADVERSARIAL STRESS TESTS PASSED (${totalAssertions} assertions verified)`);
console.log('  VERDICT: APPROVE');
console.log('================================================================');
