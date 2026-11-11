/**
 * Adversarial Empirical Verification Suite for Milestone 2 (Phase 2: Right Drawer Lifecycle & Shortcuts)
 * Author: Challenger 1 (challenger_m2_1)
 *
 * This test harness directly models and executes the complete browser execution context:
 * - Assets/viewer.html DOM structure
 * - Assets/js/workbenchUiEngine.js
 * - Keydown event dispatch pipeline (matching Assets/js/viewerApp.js)
 * - Measure mode cursor & subsystem lifecycle (matching Assets/js/measureEngine.js)
 * - Section mode subsystem lifecycle (matching Assets/js/sectionEngine.js)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  CHALLENGER 1: Milestone 2 Adversarial Stress Harness');
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

// 2. Build DOM Mirror of viewer.html
function buildDomEnvironment() {
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

  // Main Toolbar
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

  // Drawer
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

  // Panes inside drawer
  const panes = {};
  tabNames.forEach(t => {
    const pane = new DOMElement('div', `drawer-tab-${t}`, `drawer-tab-content drawer-tab-pane ${t === 'tree' ? 'active' : ''}`);
    pane.setAttribute('data-tab', t);
    pane.style.display = t === 'tree' ? 'flex' : 'none';
    drawerBody.appendChild(pane);
    reg(pane);
    panes[t] = pane;
  });

  // Inner Panels
  const treePanel = new DOMElement('div', 'tree-panel', 'tree-panel');
  panes.tree.appendChild(treePanel);
  reg(treePanel);
  const btnCloseTree = new DOMElement('button', 'btn-close-tree');
  treePanel.appendChild(btnCloseTree);
  reg(btnCloseTree);

  const measureCard = new DOMElement('div', 'measure-card', 'measure-card');
  panes.measure.appendChild(measureCard);
  reg(measureCard);

  const sectionPanel = new DOMElement('div', 'section-panel', 'section-panel');
  panes.section.appendChild(sectionPanel);
  reg(sectionPanel);

  const propsCard = new DOMElement('div', 'props-card', 'measure-card');
  panes.mass.appendChild(propsCard);
  reg(propsCard);
  const btnCloseProps = new DOMElement('button', 'btn-close-props');
  propsCard.appendChild(btnCloseProps);
  reg(btnCloseProps);

  const analysisPanel = new DOMElement('div', '', 'analysis-panel');
  panes.analysis.appendChild(analysisPanel);

  const snapshotPanel = new DOMElement('div', 'snapshot-panel', 'snapshot-panel');
  panes.export.appendChild(snapshotPanel);
  reg(snapshotPanel);
  const btnCloseSnapshot = new DOMElement('button', 'btn-close-snapshot');
  snapshotPanel.appendChild(btnCloseSnapshot);
  reg(btnCloseSnapshot);

  // Form input element for focus guard test
  const testInput = new DOMElement('input', 'test-input');
  body.appendChild(testInput);
  reg(testInput);

  return { root, body, canvasContainer, measureTooltip, drawer, drawerBody, panes, tabButtons, elements };
}

function runAdversarialInvestigation(applyBugFix = false) {
  const dom = buildDomEnvironment();
  const { body, canvasContainer, measureTooltip, drawer, drawerBody, panes, tabButtons, elements } = dom;

  let innerHTMLViolationCount = 0;
  drawerBody._onInnerHTMLSet = (val) => {
    innerHTMLViolationCount++;
    console.error(`FATAL: drawerBody.innerHTML was set to: "${val}"`);
  };

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
    massCardUpdatedCount: 0,
    snapshotInitCount: 0,
    showToastCalls: [],

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

    updatePhysicalPropertiesCard: function() {
      windowMock.massCardUpdatedCount++;
    },

    initSnapshotSystem: function() {
      windowMock.snapshotInitCount++;
    },

    showToast: function(msg) {
      windowMock.showToastCalls.push(msg);
    }
  };
  windowMock.window = windowMock;

  let workbenchUiCode = fs.readFileSync(path.resolve(__dirname, '../Assets/js/workbenchUiEngine.js'), 'utf8');
  if (applyBugFix) {
    // Remove the premature activeTab assignment in openDrawer if present
    workbenchUiCode = workbenchUiCode.replace(
      /(function\s+openDrawer\s*\([^)]*\)\s*\{[^}]*?)(activeTab\s*=\s*tabName;\s*)/,
      '$1// $2 /* Challenger 1 Proposed Fix */'
    );
  }

  const vmContext = vm.createContext(windowMock);
  vm.runInContext(workbenchUiCode, vmContext);

  windowMock.WorkbenchUI.init();

  let activeColorPopoverBodyId = null;
  let isolatedBodyId = null;
  let selectedFaceInfo = null;
  let selectedBodyId = null;
  let selectedCadEntities = [];

  function dispatchViewerAppKeydown(key, target = body) {
    let defaultPrevented = false;
    let propagationStopped = false;
    const evt = {
      type: 'keydown',
      key: key,
      target: target,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => { defaultPrevented = true; },
      stopPropagation: () => { propagationStopped = true; }
    };

    for (const handler of windowListeners.keydown) {
      handler(evt);
    }

    if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA') {
      return { defaultPrevented, consumed: false };
    }

    const k = evt.key.toLowerCase();
    let consumed = false;

    if (k === 'm') {
      if (windowMock.WorkbenchUI) windowMock.WorkbenchUI.toggleDrawer('measure');
      consumed = true;
    } else if (k === 's') {
      if (windowMock.WorkbenchUI) windowMock.WorkbenchUI.toggleDrawer('section');
      consumed = true;
    } else if (k === 'p') {
      if (windowMock.WorkbenchUI) windowMock.WorkbenchUI.toggleDrawer('mass');
      consumed = true;
    } else if (k === 't') {
      if (windowMock.WorkbenchUI) windowMock.WorkbenchUI.toggleDrawer('tree');
      consumed = true;
    } else if (k === 'k') {
      if (windowMock.WorkbenchUI) windowMock.WorkbenchUI.toggleDrawer('export');
      consumed = true;
    } else if (k === 'escape') {
      if (activeColorPopoverBodyId !== null) {
        activeColorPopoverBodyId = null;
        consumed = true;
        return { defaultPrevented, consumed };
      }
      if (windowMock.WorkbenchUI?.isDrawerOpen && windowMock.WorkbenchUI.isDrawerOpen()) {
        windowMock.WorkbenchUI.closeDrawer();
        consumed = true;
        return { defaultPrevented, consumed };
      } else if (body.classList.contains('drawer-open') || drawer.classList.contains('open')) {
        if (typeof windowMock.closeDrawer === 'function') windowMock.closeDrawer();
        consumed = true;
        return { defaultPrevented, consumed };
      }
      if (isolatedBodyId !== null) {
        isolatedBodyId = null;
        consumed = true;
        return { defaultPrevented, consumed };
      }
      if (selectedFaceInfo || selectedBodyId !== null || (windowMock.isMeasureActive && selectedCadEntities.length > 0)) {
        selectedFaceInfo = null;
        selectedBodyId = null;
        selectedCadEntities = [];
        consumed = true;
        return { defaultPrevented, consumed };
      }
      consumed = false;
    }

    return { defaultPrevented, consumed };
  }

  const failures = [];
  function softAssert(cond, msg) {
    if (!cond) {
      failures.push(msg);
      console.log(`    ❌ FAILURE: ${msg}`);
    } else {
      console.log(`    ✓ PASS: ${msg}`);
    }
  }

  console.log(`\n================================================================`);
  console.log(`  RUNNING TEST SUITE (applyBugFix = ${applyBugFix})`);
  console.log(`================================================================`);

  // Step 1: Press 't'
  console.log('[STEP 1] Press "t" (Open Tree)');
  dispatchViewerAppKeydown('t');
  softAssert(windowMock.WorkbenchUI.isDrawerOpen() === true, "Key 't' opens drawer");
  softAssert(windowMock.WorkbenchUI.getActiveTab() === 'tree', "Active tab is 'tree'");
  softAssert(elements.get('btn-tree').classList.contains('active'), "#btn-tree is active");

  // Step 2: Press 't' again
  console.log('[STEP 2] Press "t" again (Close Tree)');
  dispatchViewerAppKeydown('t');
  softAssert(windowMock.WorkbenchUI.isDrawerOpen() === false, "Key 't' closes drawer");
  softAssert(!elements.get('btn-tree').classList.contains('active'), "#btn-tree lost active");

  // Step 3: Press 'm'
  console.log('[STEP 3] Press "m" (Open Measure)');
  dispatchViewerAppKeydown('m');
  softAssert(windowMock.WorkbenchUI.isDrawerOpen() === true, "Key 'm' opens drawer");
  softAssert(windowMock.WorkbenchUI.getActiveTab() === 'measure', "Active tab is 'measure'");
  softAssert(elements.get('btn-measure').classList.contains('active'), "#btn-measure is active");
  softAssert(windowMock.isMeasureActive === true, "window.isMeasureActive === true");
  softAssert(canvasContainer.style.cursor === 'crosshair', "Cursor changed to crosshair");

  // Step 4: Press 's' (Switch to Section from Measure via keyboard shortcut)
  console.log('[STEP 4] Press "s" (Switch to Section from Measure)');
  dispatchViewerAppKeydown('s');
  softAssert(windowMock.WorkbenchUI.getActiveTab() === 'section', "Active tab is 'section'");
  softAssert(elements.get('btn-section').classList.contains('active'), "#btn-section is active");
  softAssert(!elements.get('btn-measure').classList.contains('active'), "#btn-measure is NOT active");
  softAssert(windowMock.isMeasureActive === false, "toggleMeasureMode(false) called on leaving measure (isMeasureActive === false)");
  softAssert(canvasContainer.style.cursor === 'default', "Cursor restored to 'default'");
  softAssert(windowMock.isSectionActive === true, "toggleSectionView(true) called on entering section (isSectionActive === true)");

  // Step 5: Press 'p' (Switch to Mass)
  console.log('[STEP 5] Press "p" (Switch to Mass)');
  dispatchViewerAppKeydown('p');
  softAssert(windowMock.WorkbenchUI.getActiveTab() === 'mass', "Active tab is 'mass'");
  softAssert(elements.get('btn-props').classList.contains('active'), "#btn-props is active");
  softAssert(!elements.get('btn-section').classList.contains('active'), "#btn-section is NOT active");
  softAssert(windowMock.isSectionActive === false, "toggleSectionView(false) called on leaving section (isSectionActive === false)");

  // Step 6: Press 'k' (Switch to Export)
  console.log('[STEP 6] Press "k" (Switch to Export)');
  dispatchViewerAppKeydown('k');
  softAssert(windowMock.WorkbenchUI.getActiveTab() === 'export', "Active tab is 'export'");
  softAssert(elements.get('btn-snapshot').classList.contains('active'), "#btn-snapshot is active");
  softAssert(!elements.get('btn-props').classList.contains('active'), "#btn-props is NOT active");

  // Step 7: Press 'Escape' (Close Drawer)
  console.log('[STEP 7] Press "Escape" (Close Drawer)');
  const escRes = dispatchViewerAppKeydown('escape');
  softAssert(escRes.consumed === true, "Escape consumed by drawer close");
  softAssert(windowMock.WorkbenchUI.isDrawerOpen() === false, "Drawer is closed");
  softAssert(!elements.get('btn-snapshot').classList.contains('active'), "#btn-snapshot lost active");

  // Step 8: Input guard
  console.log('[STEP 8] Input element typing guard');
  const inputEl = elements.get('test-input');
  const inputRes = dispatchViewerAppKeydown('t', inputEl);
  softAssert(inputRes.consumed === false, "Key 't' not consumed while input focused");
  softAssert(windowMock.WorkbenchUI.isDrawerOpen() === false, "Drawer remained closed");

  // Step 9: Bidirectional Toolbar <-> Drawer Header Tab Sync
  console.log('[STEP 9] Bidirectional Synchronization');
  elements.get('btn-section').click();
  softAssert(tabButtons.section.classList.contains('active'), "Clicking #btn-section highlighted header tab 'section'");
  tabButtons.measure.click();
  softAssert(elements.get('btn-measure').classList.contains('active'), "Clicking header tab 'measure' highlighted #btn-measure");
  softAssert(!elements.get('btn-section').classList.contains('active'), "#btn-section lost active");
  windowMock.WorkbenchUI.closeDrawer();

  // Step 10: DOM Permanence Stress (1,000 Cycles)
  console.log('[STEP 10] DOM Permanence (1,000 Cycles)');
  const cachedNodes = {
    treePanel: elements.get('tree-panel'),
    measureCard: elements.get('measure-card'),
    sectionPanel: elements.get('section-panel'),
    propsCard: elements.get('props-card'),
    snapshotPanel: elements.get('snapshot-panel')
  };

  const actions = [
    () => dispatchViewerAppKeydown('t'),
    () => dispatchViewerAppKeydown('m'),
    () => dispatchViewerAppKeydown('s'),
    () => dispatchViewerAppKeydown('p'),
    () => dispatchViewerAppKeydown('k'),
    () => dispatchViewerAppKeydown('escape'),
    () => elements.get('btn-tree').click(),
    () => elements.get('btn-measure').click(),
    () => elements.get('btn-section').click(),
    () => elements.get('btn-props').click(),
    () => elements.get('btn-snapshot').click(),
    () => tabButtons.tree.click(),
    () => tabButtons.measure.click(),
    () => tabButtons.section.click(),
    () => tabButtons.mass.click(),
    () => tabButtons.export.click(),
    () => elements.get('btn-close-drawer').click()
  ];

  for (let i = 0; i < 1000; i++) {
    actions[Math.floor(Math.random() * actions.length)]();
    if (elements.get('tree-panel') !== cachedNodes.treePanel ||
        elements.get('measure-card') !== cachedNodes.measureCard ||
        elements.get('section-panel') !== cachedNodes.sectionPanel ||
        elements.get('props-card') !== cachedNodes.propsCard ||
        elements.get('snapshot-panel') !== cachedNodes.snapshotPanel) {
      failures.push(`DOM reference identity violated at iteration ${i}`);
      break;
    }
  }
  softAssert(innerHTMLViolationCount === 0, `drawerBody.innerHTML = '' call count is 0 (Actual: ${innerHTMLViolationCount})`);
  softAssert(!failures.some(f => f.includes('DOM reference')), "All DOM references remained permanent across 1,000 cycles");

  console.log(`\nSummary for applyBugFix=${applyBugFix}: Total Failures = ${failures.length}`);
  return failures;
}

console.log('--- TEST 1: Running against CURRENT UNALTERED CODEBASE ---');
const unalteredFailures = runAdversarialInvestigation(false);

console.log('\n--- TEST 2: Running against CODEBASE WITH 1-LINE PROPOSED FIX ---');
const fixedFailures = runAdversarialInvestigation(true);

console.log('\n================================================================');
console.log('  FINAL EMPIRICAL FINDINGS');
console.log('================================================================');
console.log(`Unaltered Codebase Failures: ${unalteredFailures.length}`);
if (unalteredFailures.length > 0) {
  unalteredFailures.forEach((f, idx) => console.log(`  [BUG ${idx + 1}] ${f}`));
}
console.log(`Fixed Codebase Failures: ${fixedFailures.length}`);

if (unalteredFailures.length > 0) {
  console.log('\nVERDICT: REQUEST_CHANGES');
  process.exit(1);
} else {
  console.log('\nVERDICT: APPROVE');
  process.exit(0);
}
