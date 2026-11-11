/**
 * STP-Quicklook Milestone M3 Adversarial Stress Harness: Interactive State Machine & Shortcuts
 * Author: challenger_m3_1 (Interactive State Challenger)
 *
 * Requirements Stress-Tested:
 * 1. Rapid Chaotic State Machine Transitions (1,500+ operations):
 *    - Invariant: #btn-analysis NEVER retains .active when another tab is active or when drawer is closed.
 *    - Invariant: Drawer tab content #drawer-tab-analysis and #analysis-panel strictly follow active state.
 *    - Invariant: Sibling toolbar buttons strictly adhere to mutual exclusivity (at most 1 active button).
 *    - Invariant: CAD Face Picking is cleanly terminated on ANY tab switch or drawer closure.
 * 2. Keyboard Shortcut Matrix & Focus Guards:
 *    - 'a', 'A', 'Shift+a', 'Ctrl+a', 'Meta+a', 'Alt+a', 'Ctrl+Shift+a', 'Alt+Shift+a', 'Meta+Shift+a', 'Ctrl+Alt+a'
 *    - Form input guards: <input>, <textarea>, <select>, contenteditable
 * 3. Hierarchical Escape Dismissal:
 *    - 1st Escape cancels active face picking without closing drawer.
 *    - 2nd Escape closes drawer.
 * 4. DOM Permanence & Identity:
 *    - Invariant: #analysis-panel and #drawer-tab-analysis never detached, destroyed, or recreated.
 *    - Invariant: drawerBody.innerHTML is NEVER wiped or reassigned.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const VIEWER_HTML_PATH = path.join(ROOT_DIR, 'Assets', 'viewer.html');
const WORKBENCH_UI_PATH = path.join(ROOT_DIR, 'Assets', 'js', 'workbenchUiEngine.js');
const VIEWER_APP_PATH = path.join(ROOT_DIR, 'Assets', 'js', 'viewerApp.js');
const CAD_ANALYSIS_PATH = path.join(ROOT_DIR, 'Assets', 'js', 'cadAnalysisEngine.js');

console.log('================================================================================');
console.log('  CHALLENGER M3: ADVERSARIAL INTERACTIVE STATE MACHINE & SHORTCUTS STRESS TEST   ');
console.log('================================================================================\n');

// Verify prerequisite files
[VIEWER_HTML_PATH, WORKBENCH_UI_PATH, VIEWER_APP_PATH, CAD_ANALYSIS_PATH].forEach(p => {
  if (!fs.existsSync(p)) throw new Error(`Missing required file: ${p}`);
});

const htmlContent = fs.readFileSync(VIEWER_HTML_PATH, 'utf8');
const workbenchCode = fs.readFileSync(WORKBENCH_UI_PATH, 'utf8');
const viewerAppCode = fs.readFileSync(VIEWER_APP_PATH, 'utf8');
const cadAnalysisCode = fs.readFileSync(CAD_ANALYSIS_PATH, 'utf8');

// =============================================================================
// HIGH-FIDELITY DOM IMPLEMENTATION FOR NODE.JS VM
// =============================================================================

class ClassList {
  constructor(owner) {
    this.owner = owner;
    this.set = new Set();
  }
  add(...names) {
    names.forEach(n => { if (n) this.set.add(n); });
    this._sync();
  }
  remove(...names) {
    names.forEach(n => { if (n) this.set.delete(n); });
    this._sync();
  }
  toggle(name, force) {
    let result;
    if (force === true) { this.set.add(name); result = true; }
    else if (force === false) { this.set.delete(name); result = false; }
    else if (this.set.has(name)) { this.set.delete(name); result = false; }
    else { this.set.add(name); result = true; }
    this._sync();
    return result;
  }
  contains(name) { return this.set.has(name); }
  _sync() {
    this.owner._className = Array.from(this.set).join(' ');
  }
  toString() { return Array.from(this.set).join(' '); }
}

class DOMElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this._className = className;
    this.classList = new ClassList(this);
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
    this.isContentEditable = false;
  }

  get className() { return this._className; }
  set className(val) {
    this._className = String(val || '');
    this.classList.set.clear();
    this._className.trim().split(/\s+/).forEach(c => c && this.classList.set.add(c));
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    if (this._onInnerHTMLSet) this._onInnerHTMLSet(val);
    this._innerHTML = val;
    if (val === '') this.childNodes = [];
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k.startsWith('data-')) {
      const prop = k.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      this.dataset[prop] = String(v);
    }
    if (k === 'id') this.id = String(v);
    if (k === 'class') this.className = String(v);
  }

  getAttribute(k) { return this.attributes[k] || null; }
  hasAttribute(k) { return k in this.attributes; }

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
    const evt = {
      type: 'click',
      target: this,
      defaultPrevented: false,
      preventDefault: () => { evt.defaultPrevented = true; },
      stopPropagation: () => {}
    };
    const handlers = this.listeners['click'] || [];
    for (const h of handlers) h(evt);
  }

  scrollIntoView(opts) {
    this.lastScrollOpts = opts;
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
        if (p.includes('[data-tab=')) {
          const m = p.match(/\[data-tab=["']?([^"']+)["']?\]/);
          if (m && node.dataset.tab === m[1]) return true;
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

// Global assert helpers
let totalAssertionsPassed = 0;
let totalAssertionsFailed = 0;

function pass(msg) {
  totalAssertionsPassed++;
}

function fail(msg, details = '') {
  totalAssertionsFailed++;
  console.error(`  ✗ FAIL: ${msg}`);
  if (details) console.error(`         Details: ${details}`);
  throw new Error(`Assertion failed: ${msg} | ${details}`);
}

function assertTrue(cond, msg, details = '') {
  if (cond) pass(msg);
  else fail(msg, details);
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) pass(msg);
  else fail(msg, `Expected: ${expected}, Got: ${actual}`);
}

// Build DOM Environment
function createEnvironment() {
  const elements = new Map();
  function reg(el) { if (el.id) elements.set(el.id, el); return el; }

  const docBody = new DOMElement('body', 'body');
  reg(docBody);

  const canvasContainer = new DOMElement('div', 'canvas-container');
  docBody.appendChild(canvasContainer);
  reg(canvasContainer);

  const toolbarDock = new DOMElement('div', 'toolbar-dock', 'toolbar');
  docBody.appendChild(toolbarDock);
  reg(toolbarDock);

  const inspectSegment = new DOMElement('div', '', 'toolbar-segment');
  inspectSegment.setAttribute('data-segment', 'inspect');
  toolbarDock.appendChild(inspectSegment);

  // Toolbar buttons
  const toolbarBtnIds = [
    'btn-tree', 'btn-measure', 'btn-section', 'btn-props',
    'btn-analysis', 'btn-snapshot', 'btn-theme-switch', 'btn-bbox-hud'
  ];
  toolbarBtnIds.forEach(id => {
    const btn = new DOMElement('button', id, 'btn');
    if (id === 'btn-analysis' || id === 'btn-measure' || id === 'btn-section') {
      inspectSegment.appendChild(btn);
    } else {
      toolbarDock.appendChild(btn);
    }
    reg(btn);
  });

  // Drawer structure
  const drawer = new DOMElement('div', 'inspector-drawer', 'inspector-drawer');
  docBody.appendChild(drawer);
  reg(drawer);

  const drawerHeader = new DOMElement('div', '', 'drawer-header');
  drawer.appendChild(drawerHeader);

  const drawerTabsContainer = new DOMElement('div', '', 'drawer-tabs');
  drawerHeader.appendChild(drawerTabsContainer);

  const tabDefs = [
    { tab: 'tree', title: 'Model Tree [T]', active: true },
    { tab: 'measure', title: 'Smart Measure [M]', active: false },
    { tab: 'section', title: 'Cross Section [S]', active: false },
    { tab: 'mass', title: 'Mass & Materials [P]', active: false },
    { tab: 'analysis', title: 'CAD Analysis [A]', active: false },
    { tab: 'export', title: 'Engineering Export [K]', active: false }
  ];

  const tabButtons = {};
  tabDefs.forEach(d => {
    const btn = new DOMElement('button', `drawer-tab-btn-${d.tab}`, `drawer-tab ${d.active ? 'active' : ''}`);
    btn.setAttribute('data-tab', d.tab);
    btn.setAttribute('title', d.title);
    drawerTabsContainer.appendChild(btn);
    reg(btn);
    tabButtons[d.tab] = btn;
  });

  const btnCloseDrawer = new DOMElement('button', 'btn-close-drawer', 'drawer-close-btn');
  drawerHeader.appendChild(btnCloseDrawer);
  reg(btnCloseDrawer);

  const drawerBody = new DOMElement('div', 'drawer-body', 'drawer-body');
  drawer.appendChild(drawerBody);
  reg(drawerBody);

  let innerHTMLWipeCount = 0;
  drawerBody._onInnerHTMLSet = () => { innerHTMLWipeCount++; };

  // Tab panes & inner panels
  const panes = {};
  const innerPanels = {};
  const panelMapping = {
    tree: 'tree-panel',
    measure: 'measure-card',
    section: 'section-panel',
    mass: 'props-card',
    analysis: 'analysis-panel',
    export: 'snapshot-panel'
  };

  tabDefs.forEach(d => {
    const pane = new DOMElement('div', `drawer-tab-${d.tab}`, `drawer-tab-content drawer-tab-pane ${d.active ? 'active' : ''}`);
    pane.setAttribute('data-tab', d.tab);
    pane.style.display = d.active ? 'flex' : 'none';
    drawerBody.appendChild(pane);
    reg(pane);
    panes[d.tab] = pane;

    const innerId = panelMapping[d.tab];
    const inner = new DOMElement('div', innerId, innerId);
    inner.style.display = d.active ? 'flex' : 'none';
    pane.appendChild(inner);
    reg(inner);
    innerPanels[d.tab] = inner;
  });

  // Additional close buttons inside legacy panels
  ['btn-close-tree', 'btn-close-props', 'btn-close-snapshot'].forEach(id => {
    const btn = new DOMElement('button', id, 'btn-close-legacy');
    docBody.appendChild(btn);
    reg(btn);
  });

  // Face picking trigger button in analysis panel
  const btnPickFace = new DOMElement('button', 'btn-draft-pick-face', 'btn-xs');
  const txtPickFace = new DOMElement('span', 'btn-draft-pick-face-text');
  txtPickFace.innerHTML = 'Pick Face Normal';
  btnPickFace.appendChild(txtPickFace);
  innerPanels.analysis.appendChild(btnPickFace);
  reg(btnPickFace);
  reg(txtPickFace);

  // Global listeners store
  const windowListeners = {};
  const documentListeners = {};

  const windowMock = {
    addEventListener: (ev, fn) => {
      if (!windowListeners[ev]) windowListeners[ev] = [];
      windowListeners[ev].push(fn);
    },
    removeEventListener: (ev, fn) => {
      if (windowListeners[ev]) windowListeners[ev] = windowListeners[ev].filter(h => h !== fn);
    },
    document: {
      body: docBody,
      documentElement: { classList: new ClassList(docBody) },
      getElementById: (id) => elements.get(id) || null,
      querySelector: (sel) => docBody.querySelector(sel),
      querySelectorAll: (sel) => docBody.querySelectorAll(sel),
      createElement: (tag) => new DOMElement(tag),
      addEventListener: (ev, fn) => {
        if (!documentListeners[ev]) documentListeners[ev] = [];
        documentListeners[ev].push(fn);
      }
    },
    THREE: {
      Group: function() { this.name = ''; this.add = () => {}; this.remove = () => {}; this.clear = () => {}; },
      Color: function(c) { this.color = c; },
      Vector3: function(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; this.clone = () => new windowMock.THREE.Vector3(this.x, this.y, this.z); }
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    console: console,
    isMeasureActive: false,
    isSectionActive: false,
    toggleMeasureMode: (enable) => {
      windowMock.isMeasureActive = (enable !== undefined) ? enable : !windowMock.isMeasureActive;
    },
    toggleSectionView: (enable) => {
      windowMock.isSectionActive = (enable !== undefined) ? enable : !windowMock.isSectionActive;
    },
    updatePhysicalPropertiesCard: () => {},
    initSnapshotSystem: () => {},
    showToast: () => {}
  };
  windowMock.window = windowMock;

  // CadAnalysis Subsystem State
  let isPickingDraftFace = false;
  let startFacePickingCount = 0;
  let stopFacePickingCount = 0;

  windowMock.CadAnalysis = {
    isPickingFace: () => isPickingDraftFace,
    startFacePicking: () => {
      isPickingDraftFace = true;
      startFacePickingCount++;
      const btn = elements.get('btn-draft-pick-face');
      if (btn) btn.classList.add('active');
    },
    stopFacePicking: () => {
      isPickingDraftFace = false;
      stopFacePickingCount++;
      const btn = elements.get('btn-draft-pick-face');
      if (btn) btn.classList.remove('active');
    },
    getStartCount: () => startFacePickingCount,
    getStopCount: () => stopFacePickingCount,
    resetCounts: () => { startFacePickingCount = 0; stopFacePickingCount = 0; }
  };

  // Run workbenchUiEngine.js in sandbox
  const sandbox = vm.createContext(windowMock);
  vm.runInContext(workbenchCode, sandbox);

  // Initialize WorkbenchUI
  sandbox.WorkbenchUI.init();

  return {
    windowMock,
    sandbox,
    elements,
    docBody,
    drawer,
    tabButtons,
    panes,
    innerPanels,
    windowListeners,
    getInnerHtmlWipeCount: () => innerHTMLWipeCount
  };
}

// =============================================================================
// SUITE 1: DOM & ATTRIBUTE FOUNDATION IN ASSETS
// =============================================================================
console.log('--- SUITE 1: DOM & Attribute Verification from Source Assets ---');

// 1.1 Toolbar Button Existence and Attributes
assertTrue(htmlContent.includes('id="btn-analysis"'), '#btn-analysis exists in Assets/viewer.html');
const inspectGroup = htmlContent.match(/<div class="toolbar-segment" data-segment="inspect">([\s\S]*?)<\/div>/);
assertTrue(inspectGroup !== null && inspectGroup[1].includes('id="btn-analysis"'),
  '#btn-analysis is located inside [data-segment="inspect"]');
assertTrue(inspectGroup[1].indexOf('id="btn-analysis"') > inspectGroup[1].indexOf('id="btn-measure"'),
  '#btn-analysis is positioned directly after #btn-measure');
assertTrue(/id="btn-analysis"[^>]*title="[^"]*\[A\][^"]*"/.test(htmlContent),
  '#btn-analysis title contains shortcut [A]');
assertTrue(/id="btn-analysis"[^>]*title="[^"]*Analysis[^"]*"/.test(htmlContent),
  '#btn-analysis title contains "Analysis"');

// 1.2 Drawer Tab 5 in Header
assertTrue(/data-tab="analysis"[^>]*title="[^"]*\[A\][^"]*"/.test(htmlContent),
  'Drawer tab button [data-tab="analysis"] includes shortcut [A]');

// 1.3 Analysis Tab Content Pane & Inner Panel ID
assertTrue(htmlContent.includes('id="drawer-tab-analysis"'), '#drawer-tab-analysis container exists');
assertTrue(htmlContent.includes('id="analysis-panel"'), '#analysis-panel container exists');
assertTrue(/class="[^"]*analysis-panel[^"]*"\s+id="analysis-panel"/.test(htmlContent),
  '#analysis-panel has class="analysis-panel"');

// 1.4 Shortcuts hints bar
assertTrue(htmlContent.includes('A: Analysis'), '#hints-bar contains "A: Analysis" shortcut hint');

console.log(`  ✓ Suite 1 complete: All DOM attribute integrity assertions passed.\n`);


// =============================================================================
// SUITE 2: DETERMINISTIC CYCLE STRESS (900 TAB TRANSITIONS)
// =============================================================================
console.log('--- SUITE 2: Deterministic Cycle Stress (900 Transitions) ---');

const env1 = createEnvironment();
const tabs = ['tree', 'measure', 'section', 'mass', 'analysis', 'export'];
const tabToTool = {
  tree: 'btn-tree',
  measure: 'btn-measure',
  section: 'btn-section',
  mass: 'btn-props',
  analysis: 'btn-analysis',
  export: 'btn-snapshot'
};

// Invariant Verification Function
function verifyStateInvariants(env, expectedOpen, expectedTab, stepInfo) {
  const isDrawerOpen = env.sandbox.WorkbenchUI.isDrawerOpen();
  const activeTab = env.sandbox.WorkbenchUI.getActiveTab();

  assertEqual(isDrawerOpen, expectedOpen, `${stepInfo}: Drawer open state mismatch`);
  if (expectedOpen) {
    assertEqual(activeTab, expectedTab, `${stepInfo}: Active tab mismatch`);
  }

  const drawer = env.elements.get('inspector-drawer');
  const body = env.docBody;

  assertEqual(drawer.classList.contains('open'), expectedOpen, `${stepInfo}: Drawer element .open class mismatch`);
  assertEqual(body.classList.contains('drawer-open'), expectedOpen, `${stepInfo}: body.drawer-open mismatch`);

  // Toolbar button invariants
  const activeToolId = expectedOpen ? tabToTool[expectedTab] : null;
  Object.entries(tabToTool).forEach(([tabName, toolId]) => {
    const btn = env.elements.get(toolId);
    const shouldBeActive = (expectedOpen && toolId === activeToolId);
    assertEqual(btn.classList.contains('active'), shouldBeActive,
      `${stepInfo}: Button #${toolId} (for tab ${tabName}) active class mismatch (expected: ${shouldBeActive})`);
  });

  // Specifically assert that #btn-analysis NEVER retains .active when not active
  const btnAnalysis = env.elements.get('btn-analysis');
  if (!expectedOpen || expectedTab !== 'analysis') {
    assertEqual(btnAnalysis.classList.contains('active'), false,
      `${stepInfo}: #btn-analysis ILLEGALLY retained .active class while drawer is ${expectedOpen ? 'on tab ' + expectedTab : 'closed'}!`);
  } else {
    assertEqual(btnAnalysis.classList.contains('active'), true,
      `${stepInfo}: #btn-analysis MUST have .active class when drawer is open on analysis tab!`);
  }

  // Drawer tab header buttons
  tabs.forEach(t => {
    const tabBtn = env.tabButtons[t];
    const shouldBeActive = (expectedOpen && t === expectedTab);
    assertEqual(tabBtn.classList.contains('active'), shouldBeActive,
      `${stepInfo}: Drawer tab button [data-tab="${t}"] active mismatch (expected: ${shouldBeActive})`);
  });

  // Drawer tab content panes
  tabs.forEach(t => {
    const pane = env.panes[t];
    const shouldBeActive = (t === activeTab); // note: display is toggled by switchDrawerTab
    const expectedDisplay = shouldBeActive ? 'flex' : 'none';
    assertEqual(pane.style.display, expectedDisplay,
      `${stepInfo}: Pane drawer-tab-${t} display style mismatch (expected: ${expectedDisplay}, got: ${pane.style.display})`);
    assertEqual(pane.classList.contains('active'), shouldBeActive,
      `${stepInfo}: Pane drawer-tab-${t} .active class mismatch (expected: ${shouldBeActive})`);
  });

  // Analysis panel visibility
  const analysisPane = env.panes['analysis'];
  const analysisPanel = env.elements.get('analysis-panel');
  if (activeTab === 'analysis') {
    assertEqual(analysisPane.style.display, 'flex', `${stepInfo}: #drawer-tab-analysis must be display: flex`);
    assertEqual(analysisPanel.style.display, 'flex', `${stepInfo}: #analysis-panel must be display: flex`);
  } else {
    assertEqual(analysisPane.style.display, 'none', `${stepInfo}: #drawer-tab-analysis must be display: none`);
  }

  // Face picking invariant: If drawer is closed OR active tab != 'analysis', face picking MUST be false
  if (!expectedOpen || expectedTab !== 'analysis') {
    assertEqual(env.windowMock.CadAnalysis.isPickingFace(), false,
      `${stepInfo}: CadAnalysis face picking was NOT terminated when navigating away from analysis or closing drawer!`);
  }
}

// 2.1 Forward Cycles: 100 cycles x 6 tabs = 600 transitions
env1.sandbox.WorkbenchUI.openDrawer('tree');
for (let cycle = 1; cycle <= 100; cycle++) {
  for (const tab of tabs) {
    // Optionally start face picking while on analysis to test auto-clearing
    if (env1.sandbox.WorkbenchUI.getActiveTab() === 'analysis') {
      env1.windowMock.CadAnalysis.startFacePicking();
      assertTrue(env1.windowMock.CadAnalysis.isPickingFace(), `Forward Cycle ${cycle}: Face picking started on analysis`);
    }

    env1.sandbox.WorkbenchUI.switchDrawerTab(tab);
    verifyStateInvariants(env1, true, tab, `Forward Cycle ${cycle} -> Tab [${tab}]`);
  }
}
console.log('  ✓ 100 Forward Cycles passed (600 transitions, all invariants preserved).');

// 2.2 Reverse Cycles: 50 cycles x 6 tabs = 300 transitions
const reverseTabs = [...tabs].reverse();
for (let cycle = 1; cycle <= 50; cycle++) {
  for (const tab of reverseTabs) {
    if (env1.sandbox.WorkbenchUI.getActiveTab() === 'analysis') {
      env1.windowMock.CadAnalysis.startFacePicking();
    }
    env1.sandbox.WorkbenchUI.switchDrawerTab(tab);
    verifyStateInvariants(env1, true, tab, `Reverse Cycle ${cycle} -> Tab [${tab}]`);
  }
}
console.log('  ✓ 50 Reverse Cycles passed (300 transitions, all invariants preserved).');

// Close drawer and verify closed state invariants
env1.sandbox.WorkbenchUI.closeDrawer();
verifyStateInvariants(env1, false, env1.sandbox.WorkbenchUI.getActiveTab(), 'Drawer Closed');
console.log('  ✓ Suite 2 complete: 900 transitions cleanly executed.\n');


// =============================================================================
// SUITE 3: RAPID CHAOTIC MULTI-ACTOR STRESS (600 RANDOM ACTIONS)
// =============================================================================
console.log('--- SUITE 3: Rapid Chaotic Multi-Actor Stress (600 Operations) ---');

const env2 = createEnvironment();

// Available actions
const toolbarActions = [
  { name: 'click_btn_analysis', execute: () => env2.elements.get('btn-analysis').click() },
  { name: 'click_btn_measure', execute: () => env2.elements.get('btn-measure').click() },
  { name: 'click_btn_section', execute: () => env2.elements.get('btn-section').click() },
  { name: 'click_btn_tree', execute: () => env2.elements.get('btn-tree').click() },
  { name: 'click_btn_props', execute: () => env2.elements.get('btn-props').click() },
  { name: 'click_btn_snapshot', execute: () => env2.elements.get('btn-snapshot').click() }
];

const drawerInternalActions = [
  { name: 'click_tab_analysis', execute: () => env2.tabButtons['analysis'].click() },
  { name: 'click_tab_measure', execute: () => env2.tabButtons['measure'].click() },
  { name: 'click_tab_section', execute: () => env2.tabButtons['section'].click() },
  { name: 'click_tab_tree', execute: () => env2.tabButtons['tree'].click() },
  { name: 'click_tab_mass', execute: () => env2.tabButtons['mass'].click() },
  { name: 'click_tab_export', execute: () => env2.tabButtons['export'].click() },
  { name: 'click_close_drawer', execute: () => env2.elements.get('btn-close-drawer').click() },
  { name: 'click_close_tree', execute: () => env2.elements.get('btn-close-tree').click() },
  { name: 'click_close_props', execute: () => env2.elements.get('btn-close-props').click() },
  { name: 'click_close_snapshot', execute: () => env2.elements.get('btn-close-snapshot').click() }
];

// Deterministic LCG Pseudo-Random Generator for repeatable stress tests
let seed = 42;
function pseudoRandom() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

let facePickingEngagedCount = 0;

for (let i = 1; i <= 600; i++) {
  const isDrawerOpenBefore = env2.sandbox.WorkbenchUI.isDrawerOpen();

  // If drawer happens to be on analysis, 50% chance to engage face picking
  if (isDrawerOpenBefore && env2.sandbox.WorkbenchUI.getActiveTab() === 'analysis') {
    if (pseudoRandom() > 0.5) {
      env2.windowMock.CadAnalysis.startFacePicking();
      facePickingEngagedCount++;
    }
  }

  // Available pool: toolbar actions are always clickable; drawer internal actions clickable only when drawer is open
  const pool = isDrawerOpenBefore
    ? toolbarActions.concat(drawerInternalActions)
    : toolbarActions;

  // Pick random action
  const actionIdx = Math.floor(pseudoRandom() * pool.length);
  const act = pool[actionIdx];
  act.execute();

  // Read current state
  const isDrawerOpen = env2.sandbox.WorkbenchUI.isDrawerOpen();
  const currentTab = env2.sandbox.WorkbenchUI.getActiveTab();

  // Assert comprehensive invariants
  verifyStateInvariants(env2, isDrawerOpen, currentTab, `Chaotic Step ${i} [${act.name}]`);
}

console.log(`  ✓ Completed 600 chaotic actions (Face picking engaged ${facePickingEngagedCount} times, always cleanly terminated).`);
console.log(`  ✓ Invariant verified: #btn-analysis NEVER retained .active when drawer was closed or another tab was active.`);
console.log(`  ✓ Invariant verified: #drawer-tab-analysis and #analysis-panel strictly followed active state.\n`);


// =============================================================================
// SUITE 4: EXHAUSTIVE KEYBOARD SHORTCUT & MODIFIER MATRIX
// =============================================================================
console.log('--- SUITE 4: Exhaustive Keyboard Shortcut & Modifier Matrix ---');

const env3 = createEnvironment();

// Wire viewerApp.js keydown listener into environment
function dispatchKeydown(eventProps) {
  const e = {
    key: eventProps.key,
    ctrlKey: !!eventProps.ctrlKey,
    metaKey: !!eventProps.metaKey,
    altKey: !!eventProps.altKey,
    shiftKey: !!eventProps.shiftKey,
    target: eventProps.target || env3.docBody,
    defaultPrevented: false,
    preventDefault: () => { e.defaultPrevented = true; },
    stopPropagation: () => {}
  };

  // Execute listener handlers registered on window
  const handlers = env3.windowListeners['keydown'] || [];
  for (const h of handlers) h(e);
  return e;
}

// Extract and bind keydown listener from viewerApp.js
const viewerAppSandbox = {
  ...env3.windowMock,
  document: env3.windowMock.document,
  WorkbenchUI: env3.sandbox.WorkbenchUI,
  autoFitCamera: () => {},
  toggleExplode: () => {},
  toggleUnits: () => {},
  toggleOrthoPersp: () => {},
  toggleMeasureMode: env3.windowMock.toggleMeasureMode,
  toggleSectionView: env3.windowMock.toggleSectionView,
  togglePropsModal: () => env3.sandbox.WorkbenchUI.toggleDrawer('mass'),
  toggleTreePanel: () => env3.sandbox.WorkbenchUI.toggleDrawer('tree'),
  toggleSnapshotModal: () => env3.sandbox.WorkbenchUI.toggleDrawer('export'),
  CadAnalysis: env3.windowMock.CadAnalysis,
  activeColorPopoverBodyId: null,
  closeColorPickerPopover: () => {}
};
viewerAppSandbox.window = viewerAppSandbox;

// Extract keydown listener from viewerApp.js using regex
const keydownRegex = /window\.addEventListener\('keydown',\s*\((?:e|evt|event)\)\s*=>\s*\{([\s\S]*?)\n\s{6}\}\);/m;
const keydownMatch = viewerAppCode.match(keydownRegex);
if (!keydownMatch) {
  throw new Error('Failed to extract window keydown listener from viewerApp.js');
}

const keydownPreamble = `
  let activeColorPopoverBodyId = null;
  let closeColorPickerPopover = () => {};
  let isolatedBodyId = null;
  let resetBodyIsolation = () => {};
  let selectedFaceInfo = null;
  let selectedBodyId = null;
  let isMeasureActive = false;
  let selectedCadEntities = [];
  let faceHighlightMesh = null;
  let autoFitCamera = () => {};
  let toggleExplode = () => {};
  let toggleUnits = () => {};
  let toggleOrthoPersp = () => {};
  let toggleMeasureMode = () => {};
  let toggleSectionView = () => {};
  let togglePropsModal = () => {};
  let toggleTreePanel = () => {};
  let toggleSnapshotModal = () => {};
  let deselectFace = () => {};
  let deselectBody = () => {};
  let showToast = () => {};
`;
const keydownHandlerFn = new Function('window', 'document', 'e', keydownPreamble + keydownMatch[1]);
env3.windowMock.addEventListener('keydown', (e) => {
  keydownHandlerFn.call(viewerAppSandbox, viewerAppSandbox, viewerAppSandbox.document, e);
});

// 4.1 Test lowercase 'a' toggling
// State 1: Drawer closed -> 'a' opens drawer on 'analysis'
env3.sandbox.WorkbenchUI.closeDrawer();
assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), false, 'Drawer initially closed');
dispatchKeydown({ key: 'a' });
assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), true, "Key 'a' opens drawer from closed state");
assertEqual(env3.sandbox.WorkbenchUI.getActiveTab(), 'analysis', "Active tab is 'analysis' after 'a'");
verifyStateInvariants(env3, true, 'analysis', "Key 'a' open");

// State 2: Drawer open on 'analysis' -> 'a' closes drawer
dispatchKeydown({ key: 'a' });
assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), false, "Key 'a' toggles drawer closed when already on analysis");
verifyStateInvariants(env3, false, 'analysis', "Key 'a' close");

// State 3: Drawer open on 'measure' -> 'a' switches to 'analysis'
env3.sandbox.WorkbenchUI.openDrawer('measure');
assertEqual(env3.sandbox.WorkbenchUI.getActiveTab(), 'measure', 'Drawer open on measure');
dispatchKeydown({ key: 'a' });
assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), true, "Key 'a' keeps drawer open when switching from measure");
assertEqual(env3.sandbox.WorkbenchUI.getActiveTab(), 'analysis', "Key 'a' switches tab from measure to analysis");
verifyStateInvariants(env3, true, 'analysis', "Key 'a' switch from measure");

// 4.2 Test uppercase 'A' (Shift + a) toggling
env3.sandbox.WorkbenchUI.closeDrawer();
dispatchKeydown({ key: 'A', shiftKey: true });
assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), true, "Key 'A' (Shift+A) opens drawer");
assertEqual(env3.sandbox.WorkbenchUI.getActiveTab(), 'analysis', "Active tab is 'analysis' after 'A'");
verifyStateInvariants(env3, true, 'analysis', "Key 'A' open");

dispatchKeydown({ key: 'A', shiftKey: true });
assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), false, "Key 'A' toggles drawer closed");
verifyStateInvariants(env3, false, 'analysis', "Key 'A' close");

// 4.3 Test Modifier Blocking Matrix (MUST NEVER TOGGLE DRAWER)
const blockedModifiers = [
  { name: 'Ctrl+a', event: { key: 'a', ctrlKey: true } },
  { name: 'Ctrl+A', event: { key: 'A', ctrlKey: true, shiftKey: true } },
  { name: 'Meta+a (Cmd+a)', event: { key: 'a', metaKey: true } },
  { name: 'Meta+A (Cmd+A)', event: { key: 'A', metaKey: true, shiftKey: true } },
  { name: 'Alt+a', event: { key: 'a', altKey: true } },
  { name: 'Alt+A', event: { key: 'A', altKey: true, shiftKey: true } },
  { name: 'Ctrl+Alt+a', event: { key: 'a', ctrlKey: true, altKey: true } },
  { name: 'Ctrl+Shift+a', event: { key: 'a', ctrlKey: true, shiftKey: true } },
  { name: 'Alt+Shift+a', event: { key: 'a', altKey: true, shiftKey: true } },
  { name: 'Meta+Shift+a', event: { key: 'a', metaKey: true, shiftKey: true } }
];

blockedModifiers.forEach(({ name, event }) => {
  // Case A: When drawer is closed, modifier+a must NOT open drawer
  env3.sandbox.WorkbenchUI.closeDrawer();
  dispatchKeydown(event);
  assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), false,
    `Security Guard: ${name} must NOT open the drawer!`);
  assertEqual(env3.elements.get('btn-analysis').classList.contains('active'), false,
    `Security Guard: ${name} must NOT activate #btn-analysis!`);

  // Case B: When drawer is open on measure, modifier+a must NOT switch to analysis
  env3.sandbox.WorkbenchUI.openDrawer('measure');
  dispatchKeydown(event);
  assertEqual(env3.sandbox.WorkbenchUI.getActiveTab(), 'measure',
    `Security Guard: ${name} must NOT switch away from active tab 'measure'!`);
  assertEqual(env3.elements.get('btn-analysis').classList.contains('active'), false,
    `Security Guard: ${name} must NOT activate #btn-analysis!`);

  // Case C: When drawer is open on analysis, modifier+a must NOT close drawer
  env3.sandbox.WorkbenchUI.openDrawer('analysis');
  dispatchKeydown(event);
  assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), true,
    `Security Guard: ${name} must NOT close the drawer!`);
  assertEqual(env3.sandbox.WorkbenchUI.getActiveTab(), 'analysis',
    `Security Guard: ${name} must preserve active tab 'analysis'!`);
});
console.log(`  ✓ All 10 modifier combinations verified (Ctrl/Meta/Alt strictly blocked across closed/open/switched states).`);

// 4.4 Form Input Focus Guards (Typing 'a' or 'A' in fields must never trigger drawer)
const inputTargets = [
  new DOMElement('input', 'input-text', ''),
  new DOMElement('input', 'input-search', ''),
  new DOMElement('input', 'input-number', ''),
  new DOMElement('textarea', 'textarea-field', ''),
  new DOMElement('select', 'select-field', ''),
  (() => {
    const el = new DOMElement('div', 'contenteditable-field', '');
    el.isContentEditable = true;
    return el;
  })()
];

inputTargets.forEach(target => {
  env3.sandbox.WorkbenchUI.closeDrawer();
  dispatchKeydown({ key: 'a', target });
  assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), false,
    `Focus Guard: Typing 'a' in <${target.tagName.toLowerCase()}> must NOT open drawer!`);

  dispatchKeydown({ key: 'A', shiftKey: true, target });
  assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), false,
    `Focus Guard: Typing 'A' in <${target.tagName.toLowerCase()}> must NOT open drawer!`);

  env3.sandbox.WorkbenchUI.openDrawer('measure');
  dispatchKeydown({ key: 'a', target });
  assertEqual(env3.sandbox.WorkbenchUI.getActiveTab(), 'measure',
    `Focus Guard: Typing 'a' in <${target.tagName.toLowerCase()}> must NOT switch away from measure!`);
});
console.log(`  ✓ All 6 input focus guards verified (<input>, <textarea>, <select>, contenteditable).`);

// 4.5 Rapid Keyboard Burst Stress (100 rapid keydowns)
for (let i = 1; i <= 100; i++) {
  const isOdd = (i % 2 === 1);
  dispatchKeydown({ key: 'a' });
  assertEqual(env3.sandbox.WorkbenchUI.isDrawerOpen(), isOdd, `Burst Key 'a' step ${i}: Drawer open mismatch`);
  if (isOdd) {
    assertEqual(env3.elements.get('btn-analysis').classList.contains('active'), true, `Burst step ${i}: #btn-analysis active`);
  } else {
    assertEqual(env3.elements.get('btn-analysis').classList.contains('active'), false, `Burst step ${i}: #btn-analysis inactive`);
  }
}
console.log(`  ✓ Rapid keyboard burst passed (100 rapid 'a' keydowns toggled cleanly with zero state drift).\n`);


// =============================================================================
// SUITE 5: HIERARCHICAL ESCAPE KEY DISMISSAL & FACE PICKING TEARDOWN
// =============================================================================
console.log('--- SUITE 5: Hierarchical Escape Dismissal & Face Picking Teardown ---');

const env4 = createEnvironment();
viewerAppSandbox.WorkbenchUI = env4.sandbox.WorkbenchUI;
viewerAppSandbox.CadAnalysis = env4.windowMock.CadAnalysis;

env4.windowMock.addEventListener('keydown', (e) => {
  keydownHandlerFn.call(viewerAppSandbox, viewerAppSandbox, viewerAppSandbox.document, e);
});

function dispatchKeydown4(eventProps) {
  const e = {
    key: eventProps.key,
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    target: env4.docBody,
    defaultPrevented: false,
    preventDefault: () => { e.defaultPrevented = true; },
    stopPropagation: () => {}
  };
  const handlers = env4.windowListeners['keydown'] || [];
  for (const h of handlers) h(e);
}

// Scenario 5.1: Face picking ACTIVE -> 1st Escape cancels picking, drawer remains open
env4.sandbox.WorkbenchUI.openDrawer('analysis');
env4.windowMock.CadAnalysis.startFacePicking();
assertTrue(env4.windowMock.CadAnalysis.isPickingFace(), 'Face picking engaged on analysis tab');
assertTrue(env4.sandbox.WorkbenchUI.isDrawerOpen(), 'Drawer is open');

dispatchKeydown4({ key: 'Escape' });
assertEqual(env4.windowMock.CadAnalysis.isPickingFace(), false,
  '1st Escape MUST terminate CadAnalysis face picking!');
assertEqual(env4.sandbox.WorkbenchUI.isDrawerOpen(), true,
  '1st Escape MUST leave drawer open when dismissing active face picking!');
assertEqual(env4.sandbox.WorkbenchUI.getActiveTab(), 'analysis',
  'Drawer remains on analysis tab after 1st Escape!');
assertEqual(env4.elements.get('btn-analysis').classList.contains('active'), true,
  '#btn-analysis remains active after 1st Escape!');

// 2nd Escape closes the drawer
dispatchKeydown4({ key: 'Escape' });
assertEqual(env4.sandbox.WorkbenchUI.isDrawerOpen(), false,
  '2nd Escape closes the drawer!');
assertEqual(env4.elements.get('btn-analysis').classList.contains('active'), false,
  '#btn-analysis loses .active when drawer closed by 2nd Escape!');

// Scenario 5.2: Face picking INACTIVE -> Single Escape closes drawer directly
env4.sandbox.WorkbenchUI.openDrawer('analysis');
assertEqual(env4.windowMock.CadAnalysis.isPickingFace(), false, 'Face picking not active');
dispatchKeydown4({ key: 'Escape' });
assertEqual(env4.sandbox.WorkbenchUI.isDrawerOpen(), false,
  'Single Escape immediately closes drawer when face picking is inactive!');
assertEqual(env4.elements.get('btn-analysis').classList.contains('active'), false,
  '#btn-analysis loses .active upon Escape closure!');

console.log('  ✓ Hierarchical Escape dismissal strictly verified (1st Esc cancels face pick, 2nd Esc closes drawer).\n');


// =============================================================================
// SUITE 6: DOM PERMANENCE & REFERENCE IDENTITY PRESERVATION
// =============================================================================
console.log('--- SUITE 6: DOM Permanence & Reference Identity Preservation ---');

const env5 = createEnvironment();
const initialAnalysisPane = env5.panes['analysis'];
const initialAnalysisPanel = env5.elements.get('analysis-panel');
const initialBtnAnalysis = env5.elements.get('btn-analysis');

// Execute 200 cycles of transitions
for (let i = 0; i < 200; i++) {
  env5.sandbox.WorkbenchUI.openDrawer('analysis');
  env5.sandbox.WorkbenchUI.switchDrawerTab('measure');
  env5.sandbox.WorkbenchUI.switchDrawerTab('tree');
  env5.sandbox.WorkbenchUI.switchDrawerTab('analysis');
  env5.sandbox.WorkbenchUI.closeDrawer();
}

// Invariants
assertEqual(env5.panes['analysis'], initialAnalysisPane,
  'Invariant: #drawer-tab-analysis DOM reference identity was strictly preserved');
assertEqual(env5.elements.get('analysis-panel'), initialAnalysisPanel,
  'Invariant: #analysis-panel DOM reference identity was strictly preserved');
assertEqual(env5.elements.get('btn-analysis'), initialBtnAnalysis,
  'Invariant: #btn-analysis DOM reference identity was strictly preserved');
assertEqual(initialAnalysisPanel.parentNode, initialAnalysisPane,
  'Invariant: #analysis-panel remained continuously attached to #drawer-tab-analysis');
assertEqual(env5.getInnerHtmlWipeCount(), 0,
  'Invariant: drawerBody.innerHTML was NEVER wiped or reassigned (0 innerHTML mutations)!');

console.log('  ✓ DOM permanence verified: 0 element recreations, 0 innerHTML wipes across all transitions.\n');


// =============================================================================
// SUMMARY & VERDICT
// =============================================================================
console.log('================================================================================');
console.log(`  CHALLENGER M3 STRESS RESULTS: ${totalAssertionsPassed} PASSED, ${totalAssertionsFailed} FAILED (TOTAL: ${totalAssertionsPassed + totalAssertionsFailed})`);
console.log('================================================================================');

if (totalAssertionsFailed > 0) {
  console.error(`\n❌ VERDICT: REQUEST_CHANGES — ${totalAssertionsFailed} invariant assertions failed!`);
  process.exit(1);
} else {
  console.log(`\n✅ VERDICT: APPROVE — 100% of adversarial interactive state machine invariants PASSED!`);
  process.exit(0);
}
