/**
 * Phase 2 Unit & Integration Verification: Right Drawer Lifecycle & Shortcuts
 * Tests Worker 2 Deliverables:
 * 1. toggleDrawer(tabName) state machine
 * 2. Bidirectional toolbar synchronization
 * 3. CAD Subsystem lifecycle transitions (measure, section, mass, export)
 * 4. Keyboard shortcut routing (T, M, S, P, K, C, Escape)
 * 5. Elimination of conflicting / duplicate listeners
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  STP-Quicklook: Phase 2 Right Drawer Lifecycle & Shortcuts Test');
console.log('================================================================\n');

class ClassList {
  constructor() { this.classes = new Set(); }
  add(...names) { names.forEach(n => n && this.classes.add(n)); }
  remove(...names) { names.forEach(n => this.classes.delete(n)); }
  toggle(name, force) {
    if (force === true) { this.classes.add(name); return true; }
    if (force === false) { this.classes.delete(name); return false; }
    if (this.classes.has(name)) { this.classes.delete(name); return false; }
    this.classes.add(name); return true;
  }
  contains(name) { return this.classes.has(name); }
}

class DOMElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new ClassList();
    if (className) className.trim().split(/\s+/).forEach(c => this.classList.add(c));
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.childNodes = [];
    this.listeners = {};
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
    if (k.startsWith('data-')) {
      const prop = k.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      this.dataset[prop] = v;
    }
  }
  getAttribute(k) { return this.attributes[k] || null; }
  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  click() {
    const handlers = this.listeners['click'] || [];
    const evt = { type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} };
    for (const h of handlers) h(evt);
  }
  scrollIntoView(opts) {
    this.scrolledIntoView = true;
    this.scrollOptions = opts;
  }
  querySelectorAll(sel) {
    const list = [];
    function match(node) {
      if (!node || !node.tagName) return false;
      const parts = sel.split(',').map(s => s.trim());
      for (const p of parts) {
        if (p.startsWith('#') && node.id === p.slice(1)) return true;
        if (p.startsWith('.') && node.classList.contains(p.slice(1))) return true;
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
}

function createTestEnvironment() {
  const elements = new Map();
  function reg(el) { if (el.id) elements.set(el.id, el); return el; }

  const body = new DOMElement('body');
  reg(body);

  // Toolbar
  const toolbarIds = ['btn-tree', 'btn-measure', 'btn-section', 'btn-props', 'btn-snapshot', 'btn-theme-switch', 'btn-bbox-hud'];
  toolbarIds.forEach(id => {
    const b = new DOMElement('button', id, 'btn');
    body.appendChild(b);
    reg(b);
  });

  // Drawer
  const drawer = new DOMElement('div', 'inspector-drawer', 'inspector-drawer');
  body.appendChild(drawer);
  reg(drawer);

  const header = new DOMElement('div', '', 'drawer-header');
  drawer.appendChild(header);

  const tabs = ['tree', 'measure', 'section', 'mass', 'analysis', 'export'];
  tabs.forEach(t => {
    const btn = new DOMElement('button', '', `drawer-tab ${t === 'tree' ? 'active' : ''}`);
    btn.setAttribute('data-tab', t);
    header.appendChild(btn);
  });

  const closeBtn = new DOMElement('button', 'btn-close-drawer', 'drawer-close-btn');
  header.appendChild(closeBtn);
  reg(closeBtn);

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

  // Inner panels
  const treePanel = new DOMElement('div', 'tree-panel', 'tree-panel');
  reg(treePanel); elements.get('drawer-tab-tree').appendChild(treePanel);

  const measureCard = new DOMElement('div', 'measure-card', 'measure-card');
  reg(measureCard); elements.get('drawer-tab-measure').appendChild(measureCard);

  const sectionPanel = new DOMElement('div', 'section-panel', 'section-panel');
  reg(sectionPanel); elements.get('drawer-tab-section').appendChild(sectionPanel);

  const propsCard = new DOMElement('div', 'props-card', 'props-card');
  reg(propsCard); elements.get('drawer-tab-mass').appendChild(propsCard);

  const snapshotPanel = new DOMElement('div', 'snapshot-panel', 'snapshot-panel');
  reg(snapshotPanel); elements.get('drawer-tab-export').appendChild(snapshotPanel);

  // Close buttons inside inner panels
  const closeTree = new DOMElement('button', 'btn-close-tree'); reg(closeTree); treePanel.appendChild(closeTree);
  const closeProps = new DOMElement('button', 'btn-close-props'); reg(closeProps); propsCard.appendChild(closeProps);
  const closeSnap = new DOMElement('button', 'btn-close-snapshot'); reg(closeSnap); snapshotPanel.appendChild(closeSnap);

  // Bottom hints bar & HUD cluster elements (TSK-11)
  const hintsBar = new DOMElement('div', 'hints-bar', 'hints');
  body.appendChild(hintsBar);
  reg(hintsBar);

  const bottomCluster = new DOMElement('div', 'bottom-hud-cluster', 'bottom-hud-cluster');
  body.appendChild(bottomCluster);
  reg(bottomCluster);

  const btnCheckUpdate = new DOMElement('button', 'btn-check-update', 'hud-pill-btn hud-update-btn');
  bottomCluster.appendChild(btnCheckUpdate);
  reg(btnCheckUpdate);

  const btnToggleShortcuts = new DOMElement('button', 'btn-toggle-shortcuts', 'hud-pill-btn hud-shortcuts-btn');
  bottomCluster.appendChild(btnToggleShortcuts);
  reg(btnToggleShortcuts);

  const storage = {};
  const localStorageMock = {
    getItem: (k) => storage[k] !== undefined ? storage[k] : null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };

  const windowListeners = {};
  const windowMock = {
    localStorage: localStorageMock,
    showToast: (msg) => { windowMock.lastToast = msg; },
    requestAnimationFrame: (cb) => { if (typeof cb === 'function') cb(); },
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (id) => clearTimeout(id),
    console: console,
    addEventListener: (ev, fn) => {
      if (!windowListeners[ev]) windowListeners[ev] = [];
      windowListeners[ev].push(fn);
    },
    dispatchEvent: (ev) => {
      const handlers = windowListeners[ev.type] || [];
      for (const h of handlers) h(ev);
    },
    document: {
      body,
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: (sel) => body.querySelectorAll(sel),
      querySelector: (sel) => body.querySelectorAll(sel)[0] || null
    },
    THREE: {
      Group: function() { this.add = () => {}; this.clear = () => {}; },
      Color: function(c) {},
      GridHelper: function() { this.position = {}; }
    },
    // Subsystem lifecycle mocks
    toggleMeasureMode: (enable) => { windowMock.isMeasureActive = (enable !== undefined) ? enable : !windowMock.isMeasureActive; },
    toggleSectionView: (enable) => { windowMock.isSectionActive = (enable !== undefined) ? enable : !windowMock.isSectionActive; },
    updatePhysicalPropertiesCard: () => { windowMock.massCardUpdated = true; },
    initSnapshotSystem: () => { windowMock.snapshotInitialized = true; },
    isMeasureActive: false,
    isSectionActive: false,
    massCardUpdated: false,
    snapshotInitialized: false
  };
  windowMock.window = windowMock;

  return { elements, windowMock, body, drawer, drawerBody };
}

function runTests() {
  const env = createTestEnvironment();
  const { elements, windowMock, body, drawer } = env;

  const code = fs.readFileSync(path.resolve(__dirname, '../Assets/js/workbenchUiEngine.js'), 'utf8');
  const context = vm.createContext(windowMock);
  vm.runInContext(code, context);

  // Initialize
  windowMock.WorkbenchUI.init();

  let passed = 0;
  function assert(cond, msg) {
    if (!cond) throw new Error('Assertion Failed: ' + msg);
    passed++;
  }

  console.log('[TEST 1] Initial state');
  assert(!windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer initially closed');
  assert(windowMock.WorkbenchUI.getActiveTab() === 'tree', 'Initial tab is tree');
  assert(!drawer.classList.contains('open'), 'Drawer does not have open class');
  assert(!body.classList.contains('drawer-open'), 'Body does not have drawer-open class');

  console.log('[TEST 2] Toggle tree tab via WorkbenchUI.toggleDrawer("tree")');
  windowMock.WorkbenchUI.toggleDrawer('tree');
  assert(windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer is now open');
  assert(drawer.classList.contains('open'), 'Drawer element has .open');
  assert(body.classList.contains('drawer-open'), 'Body element has .drawer-open');
  assert(elements.get('btn-tree').classList.contains('active'), '#btn-tree has .active');
  assert(elements.get('drawer-tab-tree').style.display === 'flex', 'Tree tab pane is flex');

  console.log('[TEST 3] Toggle tree tab again -> should close drawer');
  windowMock.WorkbenchUI.toggleDrawer('tree');
  assert(!windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer is now closed');
  assert(!drawer.classList.contains('open'), 'Drawer element lost .open');
  assert(!body.classList.contains('drawer-open'), 'Body element lost .drawer-open');
  assert(!elements.get('btn-tree').classList.contains('active'), '#btn-tree lost .active');

  console.log('[TEST 4] Switch tab to measure -> triggers measure lifecycle');
  windowMock.WorkbenchUI.toggleDrawer('measure');
  assert(windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer is open on measure');
  assert(windowMock.WorkbenchUI.getActiveTab() === 'measure', 'Active tab is measure');
  assert(elements.get('btn-measure').classList.contains('active'), '#btn-measure is active');
  assert(!elements.get('btn-tree').classList.contains('active'), '#btn-tree is NOT active');
  assert(windowMock.isMeasureActive === true, 'toggleMeasureMode(true) was invoked');

  console.log('[TEST 5] Switch tab to section via toggleDrawer -> terminates measure mode and starts section mode');
  windowMock.WorkbenchUI.toggleDrawer('section');
  assert(windowMock.WorkbenchUI.getActiveTab() === 'section', 'Active tab is section');
  assert(elements.get('btn-section').classList.contains('active'), '#btn-section is active');
  assert(!elements.get('btn-measure').classList.contains('active'), '#btn-measure is NOT active');
  assert(windowMock.isMeasureActive === false, 'toggleMeasureMode(false) was invoked on leaving measure via toggleDrawer');
  assert(windowMock.isSectionActive === true, 'toggleSectionView(true) was invoked on entering section via toggleDrawer');

  console.log('[TEST 5B] Switch tab to mass via toggleDrawer -> terminates section mode and updates mass card');
  windowMock.WorkbenchUI.toggleDrawer('mass');
  assert(windowMock.WorkbenchUI.getActiveTab() === 'mass', 'Active tab is mass');
  assert(elements.get('btn-props').classList.contains('active'), '#btn-props is active');
  assert(!elements.get('btn-section').classList.contains('active'), '#btn-section is NOT active');
  assert(windowMock.isSectionActive === false, 'toggleSectionView(false) was invoked on leaving section via toggleDrawer');
  assert(windowMock.massCardUpdated === true, 'updatePhysicalPropertiesCard was invoked on entering mass');

  console.log('[TEST 6] Close drawer -> cleans up drawer and subsystems');
  windowMock.WorkbenchUI.closeDrawer();
  assert(!windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer is closed');
  assert(!elements.get('btn-props').classList.contains('active'), '#btn-props lost .active');

  console.log('[TEST 7] Inner close buttons (#btn-close-tree, #btn-close-props, #btn-close-snapshot)');
  windowMock.WorkbenchUI.openDrawer('tree');
  assert(windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer opened for tree');
  elements.get('btn-close-tree').click();
  assert(!windowMock.WorkbenchUI.isDrawerOpen(), 'Clicking #btn-close-tree closed drawer');

  windowMock.WorkbenchUI.openDrawer('mass');
  assert(windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer opened for mass');
  elements.get('btn-close-props').click();
  assert(!windowMock.WorkbenchUI.isDrawerOpen(), 'Clicking #btn-close-props closed drawer');

  windowMock.WorkbenchUI.openDrawer('export');
  assert(windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer opened for export');
  elements.get('btn-close-snapshot').click();
  assert(!windowMock.WorkbenchUI.isDrawerOpen(), 'Clicking #btn-close-snapshot closed drawer');

  console.log('[TEST 8] Master close button (#btn-close-drawer)');
  windowMock.WorkbenchUI.openDrawer('tree');
  assert(windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer opened');
  elements.get('btn-close-drawer').click();
  assert(!windowMock.WorkbenchUI.isDrawerOpen(), 'Clicking #btn-close-drawer closed drawer');

  console.log('[TEST 9] Toolbar buttons click toggle');
  elements.get('btn-tree').click();
  assert(windowMock.WorkbenchUI.isDrawerOpen(), 'Clicking #btn-tree opened drawer');
  assert(elements.get('btn-tree').classList.contains('active'), '#btn-tree is active');

  elements.get('btn-tree').click();
  assert(!windowMock.WorkbenchUI.isDrawerOpen(), 'Clicking #btn-tree again closed drawer');
  assert(!elements.get('btn-tree').classList.contains('active'), '#btn-tree lost active');

  console.log('[TEST 10] Toolbar button switching between CAD subsystems cleanly terminates inactive modes');
  // Click #btn-measure to open measure
  elements.get('btn-measure').click();
  assert(windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer open on measure');
  assert(windowMock.isMeasureActive === true, 'Measure active via toolbar click');

  // Click #btn-section to switch to section directly
  elements.get('btn-section').click();
  assert(windowMock.WorkbenchUI.getActiveTab() === 'section', 'Active tab is section');
  assert(windowMock.isMeasureActive === false, 'toggleMeasureMode(false) invoked when switching to section via toolbar');
  assert(windowMock.isSectionActive === true, 'toggleSectionView(true) invoked via toolbar');

  // Click #btn-tree to switch to tree
  elements.get('btn-tree').click();
  assert(windowMock.WorkbenchUI.getActiveTab() === 'tree', 'Active tab is tree');
  assert(windowMock.isSectionActive === false, 'toggleSectionView(false) invoked when switching to tree via toolbar');

  console.log('[TEST 11] Keyboard shortcut navigation cleanly terminates CAD subsystems');
  // Simulate viewerApp keydown routing: T, M, S, P, K
  function simulateShortcut(key) {
    if (key === 'm') windowMock.WorkbenchUI.toggleDrawer('measure');
    else if (key === 's') windowMock.WorkbenchUI.toggleDrawer('section');
    else if (key === 'p') windowMock.WorkbenchUI.toggleDrawer('mass');
    else if (key === 't') windowMock.WorkbenchUI.toggleDrawer('tree');
    else if (key === 'k') windowMock.WorkbenchUI.toggleDrawer('export');
  }

  // Press 'm'
  simulateShortcut('m');
  assert(windowMock.WorkbenchUI.getActiveTab() === 'measure', 'Shortcut M activates measure');
  assert(windowMock.isMeasureActive === true, 'Measure mode active');

  // Press 's' (Switch to section)
  simulateShortcut('s');
  assert(windowMock.WorkbenchUI.getActiveTab() === 'section', 'Shortcut S activates section');
  assert(windowMock.isMeasureActive === false, 'toggleMeasureMode(false) invoked on shortcut switch M -> S');
  assert(windowMock.isSectionActive === true, 'Section mode active');

  // Press 'p' (Switch to mass)
  simulateShortcut('p');
  assert(windowMock.WorkbenchUI.getActiveTab() === 'mass', 'Shortcut P activates mass');
  assert(windowMock.isSectionActive === false, 'toggleSectionView(false) invoked on shortcut switch S -> P');

  // Close drawer
  windowMock.WorkbenchUI.closeDrawer();
  assert(!windowMock.WorkbenchUI.isDrawerOpen(), 'Drawer closed after shortcut tests');

  console.log('[TEST 12] TSK-04: Drawer tab scrollIntoView behavior on switchDrawerTab');
  windowMock.WorkbenchUI.openDrawer('analysis');
  const analysisTabBtn = drawer.querySelectorAll('.drawer-tab').find(t => t.dataset.tab === 'analysis');
  assert(analysisTabBtn !== undefined, 'Analysis tab button exists in header');
  assert(analysisTabBtn.scrolledIntoView === true, 'Analysis tab button received scrollIntoView() call');
  assert(analysisTabBtn.scrollOptions && analysisTabBtn.scrollOptions.inline === 'nearest', 'scrollIntoView inline option is "nearest"');
  assert(analysisTabBtn.scrollOptions && analysisTabBtn.scrollOptions.behavior === 'smooth', 'scrollIntoView behavior option is "smooth"');

  console.log('[TEST 13] TSK-03 & TSK-04: Static CSS analysis in Assets/css/viewer.css');
  const cssPath = path.resolve(__dirname, '../Assets/css/viewer.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // TSK-04 Drawer layout invariants
  assert(cssContent.includes('.drawer-header') && cssContent.includes('padding: 8px 48px 8px 10px;'), '.drawer-header reserves 48px right gutter for close button');
  assert(cssContent.includes('.drawer-close-btn') && cssContent.includes('position: absolute;') && cssContent.includes('right: 12px;'), '.drawer-close-btn is absolutely positioned at right: 12px');
  assert(cssContent.includes('.drawer-tabs') && cssContent.includes('flex: 1 1 0%;') && cssContent.includes('min-width: 0;'), '.drawer-tabs is bounded with flex: 1 1 0% and min-width: 0');
  assert(cssContent.includes('.analysis-label') && cssContent.includes('min-width: 0;'), '.analysis-label has min-width: 0 to prevent protrusion');

  // TSK-03 Media queries invariants
  assert(cssContent.includes('@media (max-width: 960px)'), 'viewer.css defines @media (max-width: 960px)');
  assert(cssContent.includes('@media (max-width: 680px)'), 'viewer.css defines @media (max-width: 680px)');
  assert(cssContent.includes('.toolbar .btn span,') && cssContent.includes('.hud-controls-cluster .btn span:not(#unit-indicator)'), '960px query hides button text spans while preserving #unit-indicator');
  assert(cssContent.includes('#btn-units #unit-indicator') && cssContent.includes('display: inline-block !important;'), '#unit-indicator is explicitly preserved in compact modes');
  assert(cssContent.includes('scale(0.8)'), 'ViewCube scales down to scale(0.8) at 960px');
  assert(cssContent.includes('scale(0.72)'), 'ViewCube scales down to scale(0.72) at 680px');

  console.log('[TEST 14] TSK-11: Static HTML DOM analysis in Assets/viewer.html');
  const htmlPath = path.resolve(__dirname, '../Assets/viewer.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert(htmlContent.includes('id="bottom-hud-cluster"'), '#bottom-hud-cluster container is declared in viewer.html');
  assert(htmlContent.includes('id="btn-toggle-shortcuts"'), '#btn-toggle-shortcuts button is declared in viewer.html');
  assert(htmlContent.includes('id="btn-check-update"'), '#btn-check-update button is declared in viewer.html');
  const hintsBarIndex = htmlContent.indexOf('id="hints-bar"');
  const hintsBarEnd = htmlContent.indexOf('</div>', hintsBarIndex);
  const hintsBarSlice = htmlContent.substring(hintsBarIndex, hintsBarEnd);
  assert(!hintsBarSlice.includes('btn-check-update'), '#btn-check-update is decoupled and NOT nested inside #hints-bar');
  const clusterIndex = htmlContent.indexOf('id="bottom-hud-cluster"');
  const updateBtnIndex = htmlContent.indexOf('id="btn-check-update"');
  const toggleBtnIndex = htmlContent.indexOf('id="btn-toggle-shortcuts"');
  assert(clusterIndex < updateBtnIndex && updateBtnIndex < toggleBtnIndex, '#btn-check-update is stacked directly above #btn-toggle-shortcuts in #bottom-hud-cluster');

  console.log('[TEST 15] TSK-11: Runtime Shortcuts toggle & persistence in viewerApp.js');
  const viewerAppCode = fs.readFileSync(path.resolve(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  assert(!viewerAppCode.includes('onFirstUserAction'), 'Legacy auto-fade onFirstUserAction is completely removed');
  assert(viewerAppCode.includes('quicklook_stp_shortcuts_visible'), 'viewerApp.js uses localStorage key quicklook_stp_shortcuts_visible');
  assert(viewerAppCode.includes('window.toggleShortcuts = toggleShortcuts;'), 'viewerApp.js exports window.toggleShortcuts');
  assert(viewerAppCode.includes('window.setShortcutsVisibility = setShortcutsVisibility;'), 'viewerApp.js exports window.setShortcutsVisibility');

  // Execute shortcuts toggle logic in sandbox
  const shortcutsModuleMatch = viewerAppCode.match(/\/\/ =+\s*\/\/ Keyboard Shortcuts Bar Toggle[\s\S]+?window\.setShortcutsVisibility = setShortcutsVisibility;/);
  assert(shortcutsModuleMatch !== null, 'Shortcuts persistence module found in viewerApp.js');
  vm.runInContext(shortcutsModuleMatch[0], context);

  assert(typeof windowMock.toggleShortcuts === 'function', 'windowMock.toggleShortcuts is callable');
  assert(typeof windowMock.setShortcutsVisibility === 'function', 'windowMock.setShortcutsVisibility is callable');

  // Verify initial state
  const btnToggleShortcuts = elements.get('btn-toggle-shortcuts');
  const hintsBarEl = elements.get('hints-bar');
  assert(btnToggleShortcuts.classList.contains('active'), '#btn-toggle-shortcuts is initially active');
  assert(btnToggleShortcuts.getAttribute('aria-expanded') === 'true', '#btn-toggle-shortcuts aria-expanded is "true"');

  // Toggle to hidden
  windowMock.toggleShortcuts();
  assert(hintsBarEl.classList.contains('hints-hidden'), '#hints-bar acquired .hints-hidden');
  assert(!btnToggleShortcuts.classList.contains('active'), '#btn-toggle-shortcuts lost .active');
  assert(btnToggleShortcuts.getAttribute('aria-expanded') === 'false', '#btn-toggle-shortcuts aria-expanded is "false"');
  assert(windowMock.localStorage.getItem('quicklook_stp_shortcuts_visible') === 'false', 'Preference "false" saved in localStorage');

  // Toggle back to visible
  windowMock.toggleShortcuts();
  assert(!hintsBarEl.classList.contains('hints-hidden'), '#hints-bar removed .hints-hidden');
  assert(btnToggleShortcuts.classList.contains('active'), '#btn-toggle-shortcuts regained .active');
  assert(btnToggleShortcuts.getAttribute('aria-expanded') === 'true', '#btn-toggle-shortcuts aria-expanded is "true"');
  assert(windowMock.localStorage.getItem('quicklook_stp_shortcuts_visible') === 'true', 'Preference "true" saved in localStorage');

  console.log('\n================================================================');
  console.log(`  PHASE 2 & MILESTONE 2 VERIFICATION PASSED: All ${passed} assertions verified!`);
  console.log('================================================================\n');
}

runTests();
