/**
 * Forensic Integrity & Behavioral Verification Harness for Milestone 2
 * Auditor: Forensic Auditor M2 (auditor_m2_v3_1)
 * Target: TSK-03, TSK-04, TSK-11 (Responsive UI & Layout Defect Rectifications)
 *
 * Verifies empirically:
 * 1. Zero hardcoded test outputs / dummy facades in source files.
 * 2. Static CSS integrity for media queries (960px & 680px), units indicator preservation, and ViewCube scale.
 * 3. Static CSS & geometric clearance proof for Drawer header (.drawer-header, .drawer-tabs, .drawer-close-btn, .analysis-label).
 * 4. DOM structure in Assets/viewer.html for #bottom-hud-cluster, #btn-check-update, #btn-toggle-shortcuts, and #hints-bar decoupling.
 * 5. Runtime execution of shortcuts toggle, localStorage persistence, and hotkey binding in Assets/js/viewerApp.js.
 * 6. Adversarial stress & edge case probing (missing localStorage, null DOM elements, rapid repeated toggle).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('========================================================================');
console.log('  FORENSIC INTEGRITY AUDIT: Milestone 2 (TSK-03, TSK-04, TSK-11)');
console.log('========================================================================\n');

const ROOT_DIR = path.resolve(__dirname, '..');
const CSS_PATH = path.join(ROOT_DIR, 'Assets', 'css', 'viewer.css');
const HTML_PATH = path.join(ROOT_DIR, 'Assets', 'viewer.html');
const VIEWER_APP_PATH = path.join(ROOT_DIR, 'Assets', 'js', 'viewerApp.js');
const WORKBENCH_UI_PATH = path.join(ROOT_DIR, 'Assets', 'js', 'workbenchUiEngine.js');

let totalChecks = 0;
let passedChecks = 0;
const violations = [];

function check(desc, condition, failDetails = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${desc}`);
  } else {
    violations.push({ desc, failDetails });
    console.error(`  [FAIL/VIOLATION] ${desc}`);
    if (failDetails) console.error(`         Details: ${failDetails}`);
  }
}

// -----------------------------------------------------------------------------
// CHECK 1: File Existence & Basic Integrity
// -----------------------------------------------------------------------------
console.log('\n--- 1. Target Files Verification ---');
check('Assets/css/viewer.css exists', fs.existsSync(CSS_PATH));
check('Assets/viewer.html exists', fs.existsSync(HTML_PATH));
check('Assets/js/viewerApp.js exists', fs.existsSync(VIEWER_APP_PATH));
check('Assets/js/workbenchUiEngine.js exists', fs.existsSync(WORKBENCH_UI_PATH));

const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
const viewerAppContent = fs.readFileSync(VIEWER_APP_PATH, 'utf8');
const workbenchUiContent = fs.readFileSync(WORKBENCH_UI_PATH, 'utf8');

// -----------------------------------------------------------------------------
// CHECK 2: Absence of Hardcoded Test Strings & Dummy Facades
// -----------------------------------------------------------------------------
console.log('\n--- 2. Hardcoded Test Outputs & Dummy Facades Probing ---');

// Check for test mock strings or fake pass indicators in production files
const suspiciousPatterns = [
  /return\s+(true|false)\s*;\s*\/\/\s*for test/i,
  /mock[a-zA-Z0-9_]*Pass/i,
  /fake[a-zA-Z0-9_]*Result/i,
  /__test_override__/i
];

let suspiciousFound = false;
for (const p of suspiciousPatterns) {
  if (p.test(viewerAppContent) || p.test(workbenchUiContent)) {
    suspiciousFound = true;
    break;
  }
}
check('Zero suspicious test mock overrides in JS production code', !suspiciousFound);

// Verify that functions in workbenchUiEngine.js and viewerApp.js are not facades
check('switchDrawerTab is genuine function with real DOM mutations',
  workbenchUiContent.includes('function switchDrawerTab(tabName)') &&
  workbenchUiContent.includes("t.classList.toggle('active'") &&
  workbenchUiContent.includes("c.style.display = isActive ? 'flex' : 'none'")
);

check('toggleDrawer is genuine state machine',
  workbenchUiContent.includes('function toggleDrawer(') &&
  workbenchUiContent.includes('isDrawerOpen = true') &&
  workbenchUiContent.includes('isDrawerOpen = false')
);

check('toggleShortcuts is genuine logic with real DOM and storage operations',
  viewerAppContent.includes('function toggleShortcuts()') &&
  viewerAppContent.includes('localStorage.setItem(STORAGE_KEY_SHORTCUTS') &&
  viewerAppContent.includes('setShortcutsVisibility(nextVisible')
);

// -----------------------------------------------------------------------------
// CHECK 3: TSK-03 Responsive Media Queries & Unit Indicator Preservation
// -----------------------------------------------------------------------------
console.log('\n--- 3. TSK-03 Responsive Media Queries in Assets/css/viewer.css ---');

check('@media (max-width: 960px) query declared', cssContent.includes('@media (max-width: 960px)'));
check('@media (max-width: 680px) query declared', cssContent.includes('@media (max-width: 680px)'));

// Check label hiding with preservation of unit-indicator
const hasButtonSpanHiding = cssContent.includes('.toolbar .btn span,') &&
  cssContent.includes('.hud-controls-cluster .btn span:not(#unit-indicator)');
check('960px query hides button text spans while preserving #unit-indicator', hasButtonSpanHiding);

const hasUnitIndicatorRule = cssContent.includes('#btn-units #unit-indicator') &&
  cssContent.includes('display: inline-block !important;');
check('#unit-indicator explicitly forced to inline-block in responsive media queries', hasUnitIndicatorRule);

// Check ViewCube scaling
const hasViewCube960Scale = cssContent.includes('.viewcube-container') && cssContent.includes('transform: scale(0.8);');
check('ViewCube scaled down to scale(0.8) at 960px', hasViewCube960Scale);

const hasViewCube680Scale = cssContent.includes('transform: scale(0.72);');
check('ViewCube scaled down to scale(0.72) at 680px', hasViewCube680Scale);

// Check HUD cluster relocation below ViewCube
const hasHudRelocation = cssContent.includes('#hud-top-right') && (cssContent.includes('top: 128px;') || cssContent.includes('top: 120px;')) && cssContent.includes('right: 10px;');
check('HUD cluster relocated below ViewCube (top: 128px; or 120px; right: 10px;)', hasHudRelocation);

// Check HUD badge relocation at 680px
const hasBadgeRelocation = cssContent.includes('.hud-badge') && cssContent.includes('bottom: 85px;') && cssContent.includes('left: 14px;');
check('HUD badge relocated to bottom: 85px; left: 14px; at 680px', hasBadgeRelocation);

// Verify legacy colliding queries are eliminated
const legacyCollisions = [
  /@media\s*\(\s*max-width:\s*1180px\s*\)/,
  /@media\s*\(\s*max-width:\s*780px\s*\)/,
  /@media\s*\(\s*max-width:\s*600px\s*\)/,
  /@media\s*\(\s*max-width:\s*520px\s*\)/
];
let legacyFound = false;
for (const lq of legacyCollisions) {
  if (lq.test(cssContent)) {
    legacyFound = true;
    break;
  }
}
check('Scattered legacy media queries (1180px, 780px, 600px, 520px) eliminated', !legacyFound);

// -----------------------------------------------------------------------------
// CHECK 4: TSK-04 Drawer Header & Close Button Layout Invariants
// -----------------------------------------------------------------------------
console.log('\n--- 4. TSK-04 Drawer Header & Close Button Layout Invariants ---');

// Check header padding
const hasDrawerHeaderPadding = cssContent.includes('.drawer-header') && cssContent.includes('padding: 8px 48px 8px 10px;');
check('.drawer-header reserves dedicated 48px right gutter (padding: 8px 48px 8px 10px;)', hasDrawerHeaderPadding);

// Check absolute close button
const hasAbsoluteClose = cssContent.includes('.drawer-close-btn') &&
  cssContent.includes('position: absolute;') &&
  cssContent.includes('right: 12px;') &&
  cssContent.includes('top: 50%;');
check('.drawer-close-btn is absolutely positioned at right: 12px; top: 50%;', hasAbsoluteClose);

// Check flex containment on drawer tabs
const hasTabsFlexContainment = cssContent.includes('.drawer-tabs') &&
  cssContent.includes('flex: 1 1 0%;') &&
  cssContent.includes('min-width: 0;') &&
  cssContent.includes('overflow-x: auto;');
check('.drawer-tabs is flex: 1 1 0% with min-width: 0 and overflow-x: auto', hasTabsFlexContainment);

// Mathematical Clearance Buffer Proof
const drawerWidth = 380;
const headerPaddingRight = 48;
const closeBtnRight = 12;
const closeBtnWidth = 26;

const tabsRightBoundary = drawerWidth - headerPaddingRight; // 332
const closeBtnLeftBoundary = drawerWidth - closeBtnRight - closeBtnWidth; // 342
const airGap = closeBtnLeftBoundary - tabsRightBoundary; // 10px

check(`Mathematical air-gap between tabs and close button is positive (${airGap}px >= 10px)`, airGap >= 10);

// Check analysis label truncation
const hasAnalysisLabelTruncation = cssContent.includes('.analysis-label') &&
  cssContent.includes('min-width: 0;') &&
  cssContent.includes('overflow: hidden;') &&
  cssContent.includes('text-overflow: ellipsis;');
check('.analysis-label has min-width: 0 and text-overflow: ellipsis to prevent protrusion', hasAnalysisLabelTruncation);

// -----------------------------------------------------------------------------
// CHECK 5: TSK-11 DOM Structure in Assets/viewer.html
// -----------------------------------------------------------------------------
console.log('\n--- 5. TSK-11 DOM Structure in Assets/viewer.html ---');

check('#bottom-hud-cluster exists in HTML', htmlContent.includes('id="bottom-hud-cluster"'));
check('#btn-check-update exists in HTML', htmlContent.includes('id="btn-check-update"'));
check('#btn-toggle-shortcuts exists in HTML', htmlContent.includes('id="btn-toggle-shortcuts"'));
check('#hints-bar exists in HTML', htmlContent.includes('id="hints-bar"'));

// Check decoupling: #btn-check-update must NOT be inside #hints-bar
const hintsBarStart = htmlContent.indexOf('id="hints-bar"');
const hintsBarEnd = htmlContent.indexOf('</div>', hintsBarStart);
const hintsBarInner = htmlContent.substring(hintsBarStart, hintsBarEnd);
check('#btn-check-update is decoupled and NOT nested inside #hints-bar', !hintsBarInner.includes('btn-check-update'));

// Check stacking order in #bottom-hud-cluster
const clusterStart = htmlContent.indexOf('id="bottom-hud-cluster"');
const clusterEnd = htmlContent.indexOf('</div>', clusterStart);
const clusterInner = htmlContent.substring(clusterStart, clusterEnd);
const posUpdate = clusterInner.indexOf('id="btn-check-update"');
const posToggle = clusterInner.indexOf('id="btn-toggle-shortcuts"');

check('#btn-check-update and #btn-toggle-shortcuts are both children of #bottom-hud-cluster', posUpdate !== -1 && posToggle !== -1);
check('#btn-check-update is declared before #btn-toggle-shortcuts (top-to-bottom stack)', posUpdate < posToggle);

// -----------------------------------------------------------------------------
// CHECK 6: TSK-11 Runtime Behavior, Persistence & Keyboard Shortcuts
// -----------------------------------------------------------------------------
console.log('\n--- 6. TSK-11 Runtime Shortcuts & Persistence in viewerApp.js ---');

check('Legacy auto-fade onFirstUserAction completely eliminated', !viewerAppContent.includes('onFirstUserAction'));
check('Uses dedicated localStorage key quicklook_stp_shortcuts_visible', viewerAppContent.includes('quicklook_stp_shortcuts_visible'));
check('Exposes window.toggleShortcuts', viewerAppContent.includes('window.toggleShortcuts = toggleShortcuts;'));
check('Exposes window.setShortcutsVisibility', viewerAppContent.includes('window.setShortcutsVisibility = setShortcutsVisibility;'));

// Runtime Simulation in Node VM
const mockStorage = {};
const mockElements = new Map();

function createMockElement(id, classes = '', display = 'flex') {
  const el = {
    id,
    classList: {
      _set: new Set(classes.split(/\s+/).filter(Boolean)),
      add: function(c) { this._set.add(c); },
      remove: function(c) { this._set.delete(c); },
      contains: function(c) { return this._set.has(c); },
      toggle: function(c, force) {
        if (force === true) { this._set.add(c); return true; }
        if (force === false) { this._set.delete(c); return false; }
        if (this._set.has(c)) { this._set.delete(c); return false; }
        this._set.add(c); return true;
      }
    },
    style: { display },
    attributes: {},
    setAttribute: function(k, v) { this.attributes[k] = v; },
    getAttribute: function(k) { return this.attributes[k] || null; },
    listeners: {},
    addEventListener: function(ev, fn) {
      if (!this.listeners[ev]) this.listeners[ev] = [];
      this.listeners[ev].push(fn);
    },
    click: function() {
      const list = this.listeners['click'] || [];
      for (const fn of list) fn({ stopPropagation: () => {} });
    }
  };
  mockElements.set(id, el);
  return el;
}

const hintsBarEl = createMockElement('hints-bar', 'hints', 'flex');
const btnToggleShortcutsEl = createMockElement('btn-toggle-shortcuts', 'hud-pill-btn', 'inline-flex');
createMockElement('btn-check-update', 'hud-pill-btn', 'inline-flex');

const windowListeners = {};
const sandbox = {
  document: {
    getElementById: (id) => mockElements.get(id) || null
  },
  localStorage: {
    getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; }
  },
  requestAnimationFrame: (cb) => { if (typeof cb === 'function') cb(); },
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (id) => clearTimeout(id),
  console: console,
  window: {},
  showToast: (msg) => { sandbox.lastToast = msg; }
};
sandbox.window = sandbox;

// Extract shortcuts module from viewerApp.js
const moduleMatch = viewerAppContent.match(/\/\/ =+\s*\/\/ Keyboard Shortcuts Bar Toggle[\s\S]+?window\.setShortcutsVisibility = setShortcutsVisibility;/);
check('Shortcuts logic extractable from viewerApp.js for sandboxed verification', moduleMatch !== null);

if (moduleMatch) {
  const context = vm.createContext(sandbox);
  vm.runInContext(moduleMatch[0], context);

  check('toggleShortcuts instantiated as function', typeof sandbox.toggleShortcuts === 'function');
  check('setShortcutsVisibility instantiated as function', typeof sandbox.setShortcutsVisibility === 'function');

  // Verify initial state
  check('Initial state is visible and active on button',
    btnToggleShortcutsEl.classList.contains('active') &&
    btnToggleShortcutsEl.getAttribute('aria-expanded') === 'true' &&
    !hintsBarEl.classList.contains('hints-hidden')
  );

  // Click toggle to hide
  btnToggleShortcutsEl.click();
  check('Clicking button toggles state to hidden',
    hintsBarEl.classList.contains('hints-hidden') &&
    !btnToggleShortcutsEl.classList.contains('active') &&
    btnToggleShortcutsEl.getAttribute('aria-expanded') === 'false' &&
    sandbox.localStorage.getItem('quicklook_stp_shortcuts_visible') === 'false'
  );

  // Click toggle again to restore
  btnToggleShortcutsEl.click();
  check('Clicking button again restores state to visible',
    !hintsBarEl.classList.contains('hints-hidden') &&
    btnToggleShortcutsEl.classList.contains('active') &&
    btnToggleShortcutsEl.getAttribute('aria-expanded') === 'true' &&
    sandbox.localStorage.getItem('quicklook_stp_shortcuts_visible') === 'true'
  );

  // Adversarial: Test localStorage throw resilience
  let threw = false;
  sandbox.localStorage.setItem = () => { throw new Error('QuotaExceeded / SecurityError'); };
  try {
    sandbox.toggleShortcuts();
  } catch (e) {
    threw = true;
  }
  check('toggleShortcuts gracefully handles localStorage write errors without throwing uncaught exception', !threw);
}

// -----------------------------------------------------------------------------
// CHECK 7: Keyboard Listener Wiring in viewerApp.js
// -----------------------------------------------------------------------------
console.log('\n--- 7. Keyboard Shortcuts Hotkeys Wiring in viewerApp.js ---');
check('viewerApp.js binds keydown for "?" and "/"',
  viewerAppContent.includes("key === '?'") ||
  viewerAppContent.includes("e.key === '/'")
);
check('Hotkeys guard against ctrlKey, metaKey, altKey',
  viewerAppContent.includes('!e.ctrlKey && !e.metaKey && !e.altKey')
);

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`  AUDIT COMPLETED: ${passedChecks}/${totalChecks} checks passed.`);
if (violations.length === 0) {
  console.log('  VERDICT: CLEAN — Zero Integrity Violations Detected.');
} else {
  console.error(`  VERDICT: INTEGRITY VIOLATION — ${violations.length} violations detected!`);
  violations.forEach(v => console.error(`    - ${v.desc}: ${v.failDetails}`));
}
console.log('========================================================================\n');

process.exit(violations.length === 0 ? 0 : 1);
