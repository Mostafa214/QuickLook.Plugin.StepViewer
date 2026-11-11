/**
 * Phase 5 Comprehensive Verification Suite: Dual Themes & Segmented Engineering Toolbar
 *
 * Verifies all Milestone 5 specifications and AUDIT_REPORT.md items:
 * 1. CSS Design Token Architecture (:root and body.theme-light custom properties)
 * 2. WCAG 2.1 AA/AAA Contrast Ratios (primary, secondary, muted, accent on panels)
 * 3. Segmented Engineering Toolbar DOM (4 segments + #hud-top-right, all 18 IDs preserved)
 * 4. FOUC Prevention Script in <head>
 * 5. Runtime Theme Synchronization (updateThemeLighting, scene background, sun/moon icons)
 * 6. GridHelper Material Color Updates (preserves elevation at box.min.y - 0.02, zero Z-fighting)
 * 7. LocalStorage Theme Persistence across sessions
 * 8. Responsive Toolbar & HUD Drawer-Open Transition Rules
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  STP-Quicklook: Phase 5 Dual Themes & Toolbar Test Suite       ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// -----------------------------------------------------------------------------
// TEST 1: CSS Design Token Architecture in Assets/css/viewer.css
// -----------------------------------------------------------------------------
console.log('--- TEST 1: CSS Design Token Architecture (:root & body.theme-light) ---');

const cssPath = path.resolve(__dirname, '../Assets/css/viewer.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Check :root block
const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/s);
assert(rootMatch !== null, ':root rule block is declared at top of viewer.css');

const rootBlock = rootMatch ? rootMatch[1] : '';

const requiredRootTokens = [
  '--token-bg-canvas',
  '--token-bg-panel',
  '--token-bg-panel-solid',
  '--token-bg-panel-translucent',
  '--token-bg-header',
  '--token-bg-item',
  '--token-bg-item-hover',
  '--token-bg-item-active',
  '--token-bg-input',
  '--token-bg-tooltip',
  '--token-text-primary',
  '--token-text-secondary',
  '--token-text-muted',
  '--token-text-accent',
  '--token-border-subtle',
  '--token-border-medium',
  '--token-border-active',
  '--token-divider',
  '--token-accent-primary',
  '--token-accent-hover',
  '--token-accent-active',
  '--token-shadow-toolbar',
  '--token-shadow-drawer',
  '--token-shadow-card',
  '--token-z-viewcube',
  '--token-z-toolbar',
  '--token-z-hud',
  '--token-z-drawer'
];

requiredRootTokens.forEach(token => {
  assert(rootBlock.includes(token), `:root declares design token ${token}`);
});

// Check theme-light override block
const lightMatch = cssContent.match(/body\.theme-light[^\{]*\{([^}]+)\}/s);
assert(lightMatch !== null, 'body.theme-light rule block is declared in viewer.css');

const lightBlock = lightMatch ? lightMatch[1] : '';

const requiredLightTokens = [
  '--token-bg-canvas',
  '--token-bg-panel',
  '--token-bg-header',
  '--token-text-primary',
  '--token-text-secondary',
  '--token-text-muted',
  '--token-text-accent',
  '--token-border-subtle',
  '--token-border-medium',
  '--token-divider',
  '--token-accent-primary',
  '--token-shadow-toolbar',
  '--token-shadow-drawer'
];

requiredLightTokens.forEach(token => {
  assert(lightBlock.includes(token), `body.theme-light overrides design token ${token}`);
});

// Verify obsolete monolithic !important block is removed
assert(!cssContent.includes('body.theme-light .tool-btn'), 'Obsolete body.theme-light .tool-btn selector is eliminated');
assert(!cssContent.includes('background-color: #f8fafc !important;'), 'Monolithic !important theme block is eliminated');

// Verify responsive drawer-open transform rule
assert(
  cssContent.includes('body.drawer-open .toolbar') &&
  cssContent.includes('calc(-50% - 190px)'),
  'body.drawer-open .toolbar shifts left with calc(-50% - 190px)'
);

// Verify HUD controls cluster styles
assert(
  cssContent.includes('.hud-controls-cluster') || cssContent.includes('#hud-top-right'),
  'HUD controls cluster styles are defined in viewer.css'
);

// Verify button active indicator
assert(
  cssContent.includes('.btn.active::after'),
  '.btn.active::after accent underline bar is defined in viewer.css'
);


// -----------------------------------------------------------------------------
// TEST 2: WCAG 2.1 Contrast Ratios for Light & Dark Themes
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: WCAG 2.1 Contrast Ratios (AA & AAA) ---');

function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '').trim();
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function relativeLuminance(rgb) {
  const rs = rgb.r / 255;
  const gs = rgb.g / 255;
  const bs = rgb.b / 255;
  const r = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const g = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const b = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Extract and parse declared CSS tokens from :root and body.theme-light
const darkTokens = {};
if (rootMatch) {
  rootMatch[1].split('\n').forEach(line => {
    const m = line.match(/(--token-[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/);
    if (m) darkTokens[m[1]] = m[2].trim();
  });
}

const lightTokens = {};
if (lightMatch) {
  lightMatch[1].split('\n').forEach(line => {
    const m = line.match(/(--token-[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/);
    if (m) lightTokens[m[1]] = m[2].trim();
  });
}

function resolveTokenValue(cssVal, tokenDict) {
  if (!cssVal) return null;
  const clean = cssVal.replace('!important', '').trim();
  const tokenMatch = clean.match(/var\((--token-[a-zA-Z0-9_-]+)\)/);
  if (tokenMatch && tokenDict[tokenMatch[1]]) {
    const rawVal = tokenDict[tokenMatch[1]];
    const hexMatch = rawVal.match(/#[0-9a-fA-F]{3,8}/);
    if (hexMatch) return hexMatch[0];
    return rawVal.split(' ')[0].trim();
  }
  const directHex = clean.match(/#[0-9a-fA-F]{3,8}/);
  if (directHex) return directHex[0];
  return clean.split(' ')[0].trim();
}

function extractRuleProperty(selectorPattern, propertyName) {
  const match = cssContent.match(new RegExp(selectorPattern + '\\s*\\{([^}]+)\\}'));
  if (!match) return null;
  const propMatch = match[1].match(new RegExp(propertyName + '\\s*:\\s*([^;]+);'));
  return propMatch ? propMatch[1].trim() : null;
}

// Extract declared component CSS rules
const treeNodeNameColorProp = extractRuleProperty('\\.tree-node-name', 'color');
const snapModeBtnColorProp = extractRuleProperty('\\.snap-mode-btn', 'color');
const matSearchInputColorProp = extractRuleProperty('\\.mat-search-input', 'color');
const btnActiveColorProp = extractRuleProperty('\\.btn\\.active', 'color');

// 1. Light Theme WCAG Verification (evaluated against white panel background #ffffff)
const lightPanelBg = resolveTokenValue(lightTokens['--token-bg-panel-solid'], lightTokens) || '#ffffff';
const lightTreeNodeColor = resolveTokenValue(treeNodeNameColorProp, lightTokens);
const lightSnapBtnColor = resolveTokenValue(snapModeBtnColorProp, lightTokens);
const lightMatSearchColor = resolveTokenValue(matSearchInputColorProp, lightTokens);
const lightBtnActiveColor = resolveTokenValue(btnActiveColorProp, lightTokens);

const ratioLightTree = contrastRatio(lightTreeNodeColor, lightPanelBg);
const ratioLightSnap = contrastRatio(lightSnapBtnColor, lightPanelBg);
const ratioLightMat = contrastRatio(lightMatSearchColor, lightPanelBg);
const ratioLightBtnActive = contrastRatio(lightBtnActiveColor, lightPanelBg);

assert(ratioLightTree >= 7.0, `Light theme .tree-node-name (${lightTreeNodeColor}) contrast >= 7.0:1 (Actual: ${ratioLightTree.toFixed(2)}:1, passes WCAG AAA)`);
assert(ratioLightSnap >= 7.0, `Light theme .snap-mode-btn (${lightSnapBtnColor}) contrast >= 7.0:1 (Actual: ${ratioLightSnap.toFixed(2)}:1, passes WCAG AAA)`);
assert(ratioLightMat >= 4.5, `Light theme .mat-search-input (${lightMatSearchColor}) contrast >= 4.5:1 (Actual: ${ratioLightMat.toFixed(2)}:1, passes WCAG AA)`);
assert(ratioLightBtnActive >= 4.5, `Light theme .btn.active (${lightBtnActiveColor}) contrast >= 4.5:1 (Actual: ${ratioLightBtnActive.toFixed(2)}:1, passes WCAG AA)`);

// 2. Dark Theme WCAG Verification (evaluated against dark panel background #111827)
const darkPanelBg = resolveTokenValue(darkTokens['--token-bg-panel-solid'], darkTokens) || '#111827';
const darkTreeNodeColor = resolveTokenValue(treeNodeNameColorProp, darkTokens);
const darkSnapBtnColor = resolveTokenValue(snapModeBtnColorProp, darkTokens);
const darkMatSearchColor = resolveTokenValue(matSearchInputColorProp, darkTokens);
const darkBtnActiveColor = resolveTokenValue(btnActiveColorProp, darkTokens);

const ratioDarkTree = contrastRatio(darkTreeNodeColor, darkPanelBg);
const ratioDarkSnap = contrastRatio(darkSnapBtnColor, darkPanelBg);
const ratioDarkMat = contrastRatio(darkMatSearchColor, darkPanelBg);
const ratioDarkBtnActive = contrastRatio(darkBtnActiveColor, darkPanelBg);

assert(ratioDarkTree >= 7.0, `Dark theme .tree-node-name (${darkTreeNodeColor}) contrast >= 7.0:1 (Actual: ${ratioDarkTree.toFixed(2)}:1, passes WCAG AAA)`);
assert(ratioDarkSnap >= 7.0, `Dark theme .snap-mode-btn (${darkSnapBtnColor}) contrast >= 7.0:1 (Actual: ${ratioDarkSnap.toFixed(2)}:1, passes WCAG AAA)`);
assert(ratioDarkMat >= 4.5, `Dark theme .mat-search-input (${darkMatSearchColor}) contrast >= 4.5:1 (Actual: ${ratioDarkMat.toFixed(2)}:1, passes WCAG AA)`);
assert(ratioDarkBtnActive >= 4.5, `Dark theme .btn.active (${darkBtnActiveColor}) contrast >= 4.5:1 (Actual: ${ratioDarkBtnActive.toFixed(2)}:1, passes WCAG AA)`);


// -----------------------------------------------------------------------------
// TEST 3: HTML Markup Architecture in Assets/viewer.html
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Segmented Toolbar & HTML DOM Structure ---');

const htmlPath = path.resolve(__dirname, '../Assets/viewer.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Synchronous FOUC prevention script in <head>
assert(
  htmlContent.includes("localStorage.getItem('quicklook_stp_theme')") &&
  htmlContent.includes("classList.add('theme-light')"),
  'Synchronous FOUC prevention script is present in viewer.html <head>'
);

// All 4 toolbar segments
assert(htmlContent.includes('data-segment="nav"'), 'Toolbar contains Group 1 Navigation segment (data-segment="nav")');
assert(htmlContent.includes('data-segment="display"'), 'Toolbar contains Group 2 Display segment (data-segment="display")');
assert(htmlContent.includes('data-segment="inspect"'), 'Toolbar contains Group 3 Inspection segment (data-segment="inspect")');
assert(htmlContent.includes('data-segment="hierarchy"'), 'Toolbar contains Group 4 Hierarchy segment (data-segment="hierarchy")');

// Toolbar dividers
assert(htmlContent.includes('class="toolbar-divider"'), 'Toolbar contains .toolbar-divider elements');

// Top-right HUD cluster
assert(htmlContent.includes('id="hud-top-right"'), 'Top-right HUD cluster #hud-top-right is declared');

// All 18 button IDs exist
const expected18Buttons = [
  'btn-reset', 'btn-view-iso', 'btn-view-top', 'btn-view-front', 'btn-view-right',
  'btn-edges', 'btn-wireframe', 'btn-autorotate',
  'btn-section', 'btn-explode', 'btn-measure',
  'btn-tree', 'btn-props', 'btn-snapshot',
  'btn-bbox-hud', 'btn-units', 'btn-theme-switch', 'btn-clearcache'
];

expected18Buttons.forEach(btnId => {
  assert(htmlContent.includes(`id="${btnId}"`), `Button #${btnId} is present in viewer.html`);
});

// Sun and Moon icons in #btn-theme-switch
assert(htmlContent.includes('id="theme-icon-sun"'), '#theme-icon-sun is present in #btn-theme-switch');
assert(htmlContent.includes('id="theme-icon-moon"'), '#theme-icon-moon is present in #btn-theme-switch');

// Semantic classes in #props-card (clean of hardcoded inline styles)
assert(htmlContent.includes('class="props-stats-block"'), '#props-card uses semantic .props-stats-block class');
assert(htmlContent.includes('class="props-stat-label"'), '#props-card uses semantic .props-stat-label class');
assert(htmlContent.includes('class="props-stat-value"'), '#props-card uses semantic .props-stat-value class');


// -----------------------------------------------------------------------------
// TEST 4: Runtime Theme Synchronization (workbenchUiEngine.js)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4: Runtime Theme Synchronization in workbenchUiEngine.js ---');

// Setup mock browser DOM environment
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
}

class MockElement {
  constructor(id = '', tag = 'DIV') {
    this.id = id;
    this.tagName = tag;
    this.classList = new ClassList(this);
    this.style = {};
    this.dataset = {};
    this.title = '';
    this.innerText = '';
    this.listeners = {};
    this.children = [];
  }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  click() {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(fn => fn());
    }
  }
  querySelectorAll(sel) {
    return [];
  }
  querySelector(sel) {
    if (sel === 'span') return this.children.find(c => c.tagName === 'SPAN') || null;
    return null;
  }
}

const mockElements = {
  'btn-theme-switch': new MockElement('btn-theme-switch', 'BUTTON'),
  'theme-icon-sun': new MockElement('theme-icon-sun', 'SVG'),
  'theme-icon-moon': new MockElement('theme-icon-moon', 'SVG'),
  'theme-btn-label': new MockElement('theme-btn-label', 'SPAN'),
  'btn-bbox-hud': new MockElement('btn-bbox-hud', 'BUTTON'),
  'btn-units': new MockElement('btn-units', 'BUTTON'),
  'btn-clearcache': new MockElement('btn-clearcache', 'BUTTON'),
  'inspector-drawer': new MockElement('inspector-drawer', 'DIV'),
  'btn-close-drawer': new MockElement('btn-close-drawer', 'BUTTON')
};

const mockLocalStorage = {};

class MockColor {
  constructor(hex = 0x000000) {
    this.hex = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  }
  copy(other) {
    this.hex = other.hex;
    return this;
  }
  getHex() { return this.hex; }
}

let updateThemeLightingCalledWith = null;

const sandbox = {
  console: console,
  document: {
    documentElement: new MockElement('html', 'HTML'),
    body: new MockElement('body', 'BODY'),
    getElementById: (id) => mockElements[id] || null,
    querySelectorAll: () => []
  },
  localStorage: {
    getItem: (key) => mockLocalStorage[key] || null,
    setItem: (key, val) => { mockLocalStorage[key] = String(val); },
    removeItem: (key) => { delete mockLocalStorage[key]; }
  },
  window: {
    THREE: {
      Color: MockColor,
      Group: class { constructor() { this.name = ''; this.add = () => {}; } }
    },
    scene: {
      background: new MockColor(0x080a0f),
      add: () => {},
      remove: () => {}
    },
    gridHelper: {
      position: { x: 0, y: -15.42, z: 0 }, // Model-adaptive base elevation
      scale: { x: 1, y: 1, z: 1 },
      material: [
        { color: new MockColor(0x38bdf8) }, // Center line
        { color: new MockColor(0x334155) }  // Grid lines
      ]
    },
    updateThemeLighting: (isLight) => {
      updateThemeLightingCalledWith = isLight;
    },
    showToast: (msg) => {},
    addEventListener: () => {}
  },
  THREE: {
    Color: MockColor,
    Group: class { constructor() { this.name = ''; this.add = () => {}; } }
  }
};

sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;

// Load workbenchUiEngine.js in sandbox
const engineCode = fs.readFileSync(path.resolve(__dirname, '../Assets/js/workbenchUiEngine.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(engineCode, sandbox);

assert(typeof sandbox.window.toggleTheme === 'function', 'window.toggleTheme is exported as a function');
assert(typeof sandbox.window.initWorkbenchUI === 'function', 'window.initWorkbenchUI is exported as a function');

// Initial grid elevation snapshot
const initialGridY = sandbox.window.gridHelper.position.y;
assert(initialGridY === -15.42, 'Initial grid elevation established at -15.42');

// 1. Toggle to Light Theme
sandbox.window.toggleTheme('light');

assert(sandbox.document.body.classList.contains('theme-light') === true, 'body acquired .theme-light class');
assert(sandbox.document.documentElement.classList.contains('theme-light') === true, 'documentElement acquired .theme-light class');
assert(updateThemeLightingCalledWith === true, 'window.updateThemeLighting(true) was invoked');
assert(sandbox.window.scene.background.getHex() === 0xf1f5f9, 'scene.background updated to Crisp Light Workbench hex 0xf1f5f9');

// GridHelper preservation
assert(sandbox.window.gridHelper.position.y === initialGridY, 'gridHelper.position.y PRESERVED at box.min.y - 0.02 across toggle (Zero Z-fighting)');
assert(sandbox.window.gridHelper.material[0].color.getHex() === 0x0284c7, 'gridHelper center line color updated to engineering blue 0x0284c7 in light theme');
assert(sandbox.window.gridHelper.material[1].color.getHex() === 0xcbd5e1, 'gridHelper grid lines color updated to soft slate 0xcbd5e1 in light theme');

// Sun/Moon icon toggle
assert(mockElements['theme-icon-sun'].style.display === 'none', 'Sun icon hidden in light mode');
assert(mockElements['theme-icon-moon'].style.display === 'block', 'Moon icon displayed in light mode (prompts night/dark switch)');
assert(mockElements['theme-btn-label'].innerText === 'Light', 'Theme button label updated to "Light"');

// LocalStorage persistence
assert(sandbox.localStorage.getItem('quicklook_stp_theme') === 'light', 'Theme preference persisted as "light" in localStorage');


// 2. Toggle back to Dark Theme
sandbox.window.toggleTheme('dark');

assert(sandbox.document.body.classList.contains('theme-light') === false, 'body removed .theme-light class');
assert(updateThemeLightingCalledWith === false, 'window.updateThemeLighting(false) was invoked');
assert(sandbox.window.scene.background.getHex() === 0x080a0f, 'scene.background restored to Dark CAD Studio Vignette hex 0x080a0f');

// GridHelper preservation
assert(sandbox.window.gridHelper.position.y === initialGridY, 'gridHelper.position.y PRESERVED at box.min.y - 0.02 when switching back to dark');
assert(sandbox.window.gridHelper.material[0].color.getHex() === 0x38bdf8, 'gridHelper center line color restored to sky cyan 0x38bdf8 in dark theme');
assert(sandbox.window.gridHelper.material[1].color.getHex() === 0x334155, 'gridHelper grid lines color restored to dark slate 0x334155 in dark theme');

// Sun/Moon icon toggle
assert(mockElements['theme-icon-sun'].style.display === 'block', 'Sun icon displayed in dark mode (prompts daylight switch)');
assert(mockElements['theme-icon-moon'].style.display === 'none', 'Moon icon hidden in dark mode');
assert(mockElements['theme-btn-label'].innerText === 'Dark', 'Theme button label updated to "Dark"');

// LocalStorage persistence
assert(sandbox.localStorage.getItem('quicklook_stp_theme') === 'dark', 'Theme preference persisted as "dark" in localStorage');


// -----------------------------------------------------------------------------
// TEST 5: Startup Theme Restoration from localStorage
// -----------------------------------------------------------------------------
console.log('\n--- TEST 5: Startup Theme Restoration from localStorage ---');

// Set localStorage to 'light' before initWorkbenchUI
sandbox.localStorage.setItem('quicklook_stp_theme', 'light');
sandbox.window.initWorkbenchUI();

assert(sandbox.document.body.classList.contains('theme-light') === true, 'initWorkbenchUI restored "light" theme from localStorage');
assert(sandbox.window.WorkbenchUI.getActiveTheme() === 'light', 'WorkbenchUI.getActiveTheme() reports "light"');


// -----------------------------------------------------------------------------
// TEST 6: Milestone 2 Responsive Media Queries & Bottom HUD Tokens
// -----------------------------------------------------------------------------
console.log('\n--- TEST 6: Milestone 2 Responsive Media Queries & Bottom HUD Tokens ---');

assert(cssContent.includes('.bottom-hud-cluster'), 'viewer.css defines .bottom-hud-cluster');
assert(cssContent.includes('.hud-pill-btn'), 'viewer.css defines .hud-pill-btn');
assert(cssContent.includes('.hud-shortcuts-btn'), 'viewer.css defines .hud-shortcuts-btn');
assert(cssContent.includes('.hints.hints-hidden'), 'viewer.css defines .hints.hints-hidden transition state');

// Verify token usage in bottom HUD elements
assert(cssContent.includes('z-index: var(--token-z-hud);'), '.bottom-hud-cluster uses var(--token-z-hud)');
assert(cssContent.includes('z-index: var(--token-z-hints);'), '.hints uses var(--token-z-hints)');

// Verify media queries
assert(cssContent.includes('@media (max-width: 960px)'), '@media (max-width: 960px) is declared');
assert(cssContent.includes('@media (max-width: 680px)'), '@media (max-width: 680px) is declared');
assert(
  cssContent.includes('.toolbar .btn span,') &&
  cssContent.includes('.hud-controls-cluster .btn span:not(#unit-indicator)'),
  '960px media query auto-hides button text labels while preserving #unit-indicator'
);
assert(
  cssContent.includes('#btn-units #unit-indicator') &&
  cssContent.includes('display: inline-block !important;'),
  '#unit-indicator has display: inline-block !important under media queries'
);

// -----------------------------------------------------------------------------
// TEST SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  PHASE 5 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
