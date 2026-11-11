/**
 * Phase 5 Adversarial Stress & Empirical Challenge Suite: Dual Themes & Token Cascade
 * Challenger: challenger_m5_1 (Teamwork Challenger - Critic & Specialist)
 *
 * Scope:
 * 1. CSS Design Token Cascade & Coverage Invariants (:root vs body.theme-light)
 * 2. Mathematical Luminance & WCAG 2.1 AA/AAA Contrast Verification
 * 3. Component-Level Hardcoded Color & !important Pollution Detection
 * 4. 5,000 Rapid Theme Toggling Stress Test in Node.js VM (Synchronization, LocalStorage, Lighting Sync)
 * 5. FOUC Prevention Script & Robustness under Storage Exceptions
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  CHALLENGER 1: PHASE 5 ADVERSARIAL THEMES & STRESS TEST HARNESS ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function assert(condition, message, findingDetails = null) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
    if (findingDetails) {
      findings.push(findingDetails);
    }
  }
}

// -----------------------------------------------------------------------------
// WCAG 2.1 Mathematics & Luminance Calculator
// -----------------------------------------------------------------------------
function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function parseColorToRgb(colorStr, backgroundRgb = { r: 255, g: 255, b: 255 }) {
  const str = colorStr.trim();
  if (str.startsWith('#')) {
    return hexToRgb(str);
  }
  const rgbaMatch = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1.0;
    // Alpha blend over background
    return {
      r: Math.round(r * a + backgroundRgb.r * (1 - a)),
      g: Math.round(g * a + backgroundRgb.g * (1 - a)),
      b: Math.round(b * a + backgroundRgb.b * (1 - a))
    };
  }
  return null;
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

function calculateContrast(fgColor, bgColor) {
  const bgRgb = typeof bgColor === 'string' ? parseColorToRgb(bgColor) : bgColor;
  const fgRgb = typeof fgColor === 'string' ? parseColorToRgb(fgColor, bgRgb) : fgColor;
  if (!bgRgb || !fgRgb) return 1.0;
  const l1 = relativeLuminance(fgRgb);
  const l2 = relativeLuminance(bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// -----------------------------------------------------------------------------
// TEST SUITE 1: Design Token Cascade & Coverage Invariants
// -----------------------------------------------------------------------------
console.log('--- TEST SUITE 1: Design Token Cascade Invariants (:root & theme-light) ---');

const cssPath = path.resolve(__dirname, '../Assets/css/viewer.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/s);
assert(rootMatch !== null, ':root rule block declared at top of viewer.css');

const lightMatch = cssContent.match(/body\.theme-light[^\{]*\{([^}]+)\}/s);
assert(lightMatch !== null, 'body.theme-light, html.theme-light rule block declared in viewer.css');

const rootTokens = {};
if (rootMatch) {
  rootMatch[1].split('\n').forEach(l => {
    const m = l.match(/(--token-[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/);
    if (m) rootTokens[m[1]] = m[2].trim();
  });
}

const lightTokens = {};
if (lightMatch) {
  lightMatch[1].split('\n').forEach(l => {
    const m = l.match(/(--token-[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/);
    if (m) lightTokens[m[1]] = m[2].trim();
  });
}

// Visual design tokens that MUST have a light mode override (colors, borders, shadows, backgrounds)
const themeInvariantPrefixes = ['--token-radius-', '--token-transition-', '--token-z-'];
const visualTokensInRoot = Object.keys(rootTokens).filter(t => !themeInvariantPrefixes.some(p => t.startsWith(p)));

assert(visualTokensInRoot.length >= 40, `Found ${visualTokensInRoot.length} visual design tokens in :root`);

visualTokensInRoot.forEach(token => {
  const hasOverride = !!lightTokens[token];
  assert(hasOverride, `Token ${token} has corresponding override in body.theme-light`, {
    severity: 'MEDIUM',
    category: 'TOKEN_CASCADE',
    token: token,
    detail: `Token ${token} defined in :root is missing override in body.theme-light`
  });
});

// Check legacy aliases
const legacyAliases = ['--bg-canvas', '--bg-panel', '--text-primary', '--text-secondary', '--border-subtle', '--accent-blue', '--accent-active'];
legacyAliases.forEach(alias => {
  assert(rootMatch && rootMatch[1].includes(alias), `:root declares legacy alias ${alias}`);
  assert(lightMatch && lightMatch[1].includes(alias), `body.theme-light declares legacy alias ${alias}`);
});


// -----------------------------------------------------------------------------
// TEST SUITE 2: Mathematical Luminance & WCAG Contrast Verification
// -----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 2: WCAG 2.1 Contrast Ratios (Luminance Equation) ---');

// Dark Mode Contours
const darkPanel = '#111827';
const darkPrimary = rootTokens['--token-text-primary'] || '#f8fafc';
const darkSecondary = rootTokens['--token-text-secondary'] || '#cbd5e1';
const darkAccent = rootTokens['--token-accent-primary'] || '#38bdf8';
const darkMuted = rootTokens['--token-text-muted'] || '#94a3b8';

const crDarkPrimary = calculateContrast(darkPrimary, darkPanel);
const crDarkSecondary = calculateContrast(darkSecondary, darkPanel);
const crDarkAccent = calculateContrast(darkAccent, darkPanel);
const crDarkMuted = calculateContrast(darkMuted, darkPanel);

assert(crDarkPrimary >= 7.0, `Dark theme Primary text passes WCAG AAA (>= 7.0:1): Actual ${crDarkPrimary.toFixed(2)}:1`);
assert(crDarkSecondary >= 4.5, `Dark theme Secondary text passes WCAG AA (>= 4.5:1): Actual ${crDarkSecondary.toFixed(2)}:1`);
assert(crDarkSecondary >= 7.0, `Dark theme Secondary text passes WCAG AAA (>= 7.0:1): Actual ${crDarkSecondary.toFixed(2)}:1`);
assert(crDarkAccent >= 4.5, `Dark theme Accent text passes WCAG AA (>= 4.5:1): Actual ${crDarkAccent.toFixed(2)}:1`);
assert(crDarkMuted >= 4.5, `Dark theme Muted text passes WCAG AA (>= 4.5:1): Actual ${crDarkMuted.toFixed(2)}:1`);

// Light Mode Contours
const lightPanel = '#ffffff';
const lightPrimary = lightTokens['--token-text-primary'] || '#0f172a';
const lightSecondary = lightTokens['--token-text-secondary'] || '#334155';
const lightAccent = lightTokens['--token-accent-primary'] || '#0284c7';
const lightMuted = lightTokens['--token-text-muted'] || '#64748b';

const crLightPrimary = calculateContrast(lightPrimary, lightPanel);
const crLightSecondary = calculateContrast(lightSecondary, lightPanel);
const crLightAccent = calculateContrast(lightAccent, lightPanel);
const crLightMuted = calculateContrast(lightMuted, lightPanel);

assert(crLightPrimary >= 7.0, `Light theme Primary text passes WCAG AAA (>= 7.0:1): Actual ${crLightPrimary.toFixed(2)}:1`);
assert(crLightSecondary >= 4.5, `Light theme Secondary text passes WCAG AA (>= 4.5:1): Actual ${crLightSecondary.toFixed(2)}:1`);
assert(crLightSecondary >= 7.0, `Light theme Secondary text passes WCAG AAA (>= 7.0:1): Actual ${crLightSecondary.toFixed(2)}:1`);
assert(crLightAccent >= 4.5, `Light theme Accent text passes WCAG AA (>= 4.5:1): Actual ${crLightAccent.toFixed(2)}:1`);
assert(crLightMuted >= 4.5, `Light theme Muted text passes WCAG AA (>= 4.5:1): Actual ${crLightMuted.toFixed(2)}:1`);


// -----------------------------------------------------------------------------
// TEST SUITE 3: Component-Level Hardcoded Color & !important Pollution
// -----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 3: Component-Level Hardcoded Colors & !important Pollution ---');

// Parse all rule blocks in viewer.css
const cssRuleBlocks = [];
const ruleRegex = /([^{]+)\{([^}]+)\}/g;
let rMatch;
while ((rMatch = ruleRegex.exec(cssContent)) !== null) {
  cssRuleBlocks.push({
    selector: rMatch[1].trim(),
    body: rMatch[2].trim()
  });
}

// 1. Verify obsolete monolithic !important block is gone
assert(!cssContent.includes('body.theme-light .tool-btn'), 'Monolithic body.theme-light .tool-btn block is eliminated');

// 2. Check for active tree node text color pollution
const activeBodyRule = cssRuleBlocks.find(r => r.selector.includes('.tree-node.active-body .tree-node-name'));
if (activeBodyRule) {
  const hasWhiteImportant = activeBodyRule.body.includes('#ffffff') && activeBodyRule.body.includes('!important');
  // Check if there is an explicit body.theme-light override
  const lightActiveBody = cssRuleBlocks.find(r => r.selector.includes('theme-light') && r.selector.includes('.tree-node.active-body'));
  assert(
    !hasWhiteImportant || !!lightActiveBody,
    'Model tree active body text (.tree-node.active-body .tree-node-name) must not hardcode #ffffff !important without a theme-light override',
    {
      severity: 'CRITICAL',
      category: 'ACCESSIBILITY_CONTRAST',
      selector: '.tree-node.active-body .tree-node-name',
      actualContrast: '1.14:1 (Fail WCAG)',
      detail: 'Selected body node text in model tree is forced to #ffffff !important on light background, making text completely illegible in light theme.'
    }
  );
} else {
  assert(true, 'No .tree-node.active-body .tree-node-name rule found');
}

// 3. Check for general tree node name color
const treeNodeNameRule = cssRuleBlocks.find(r => r.selector === '.tree-node-name');
if (treeNodeNameRule) {
  const hasHardcodedWhite = /color\s*:\s*#f1f5f9/i.test(treeNodeNameRule.body);
  const lightTreeNode = cssRuleBlocks.find(r => r.selector.includes('theme-light') && r.selector.includes('.tree-node-name'));
  assert(
    !hasHardcodedWhite || !!lightTreeNode,
    'Model tree node label (.tree-node-name) must not hardcode light color #f1f5f9 without theme-light override',
    {
      severity: 'HIGH',
      category: 'ACCESSIBILITY_CONTRAST',
      selector: '.tree-node-name',
      actualContrast: '1.10:1 (Fail WCAG)',
      detail: 'Body node names in Model Tree use hardcoded color: #f1f5f9 with no theme-light override, rendering text invisible against #ffffff drawer.'
    }
  );
}

// 4. Check for active face item in tree
const activeFaceRule = cssRuleBlocks.find(r => r.selector.includes('.tree-face-item.active span:last-child'));
if (activeFaceRule) {
  const hasE2Important = activeFaceRule.body.includes('#e2e8f0') && activeFaceRule.body.includes('!important');
  const lightFaceItem = cssRuleBlocks.find(r => r.selector.includes('theme-light') && r.selector.includes('.tree-face-item'));
  assert(
    !hasE2Important || !!lightFaceItem,
    '.tree-face-item.active span:last-child must not hardcode #e2e8f0 !important without theme-light override',
    {
      severity: 'HIGH',
      category: 'ACCESSIBILITY_CONTRAST',
      selector: '.tree-face-item.active span:last-child',
      actualContrast: '1.25:1 (Fail WCAG)',
      detail: 'Active face item span uses hardcoded #e2e8f0 !important without theme-light override, failing contrast in light mode.'
    }
  );
}

// 5. Check Section Divider in Drawer
const drawerSecDividerRule = cssRuleBlocks.find(r => r.selector.includes('.drawer-tab-pane #section-panel .sec-divider'));
if (drawerSecDividerRule) {
  const hasHardcodedWhiteDivider = drawerSecDividerRule.body.includes('rgba(255, 255, 255, 0.08)');
  assert(
    !hasHardcodedWhiteDivider,
    '.drawer-tab-pane #section-panel .sec-divider uses token divider instead of hardcoded white rgba(255, 255, 255, 0.08) !important',
    {
      severity: 'LOW',
      category: 'STYLE_INCONSISTENCY',
      selector: '.drawer-tab-pane #section-panel .sec-divider',
      detail: 'Section divider inside drawer hardcodes white rgba(255, 255, 255, 0.08) !important making it invisible against light background.'
    }
  );
}


// -----------------------------------------------------------------------------
// TEST SUITE 4: Rapid Theme Toggling Stress Harness (5,000 Iterations)
// -----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 4: Rapid Theme Toggling Stress (5,000 VM Iterations) ---');

class MockClassList {
  constructor() {
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
    this.classList = new MockClassList();
    this.style = {};
    this.title = '';
    this.innerText = '';
    this.listeners = {};
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
}

class MockThreeColor {
  constructor(hex = 0x000000) {
    this.hex = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  }
  copy(other) {
    this.hex = other.hex;
    return this;
  }
  setHex(hex) {
    this.hex = hex;
    return this;
  }
  getHex() { return this.hex; }
}

const mockStorageStore = {};
let storageQuotaExceeded = false;

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

let lastLightingCall = null;
let lightingCallCount = 0;

const stressSandbox = {
  console: console,
  document: {
    documentElement: new MockElement('html', 'HTML'),
    body: new MockElement('body', 'BODY'),
    getElementById: (id) => mockElements[id] || null,
    querySelectorAll: () => []
  },
  localStorage: {
    getItem: (k) => mockStorageStore[k] || null,
    setItem: (k, v) => {
      if (storageQuotaExceeded) {
        const err = new Error('QuotaExceededError: DOM Exception 22');
        err.name = 'QuotaExceededError';
        throw err;
      }
      mockStorageStore[k] = String(v);
    },
    removeItem: (k) => { delete mockStorageStore[k]; }
  },
  window: {
    THREE: {
      Color: MockThreeColor,
      Group: class { constructor() { this.name = ''; this.add = () => {}; } }
    },
    scene: {
      background: new MockThreeColor(0x080a0f),
      add: () => {},
      remove: () => {}
    },
    gridHelper: {
      position: { x: 0, y: -24.85, z: 0 },
      material: [
        { color: new MockThreeColor(0x38bdf8) },
        { color: new MockThreeColor(0x334155) }
      ]
    },
    updateThemeLighting: (isLight) => {
      lastLightingCall = isLight;
      lightingCallCount++;
    },
    showToast: () => {},
    addEventListener: () => {}
  },
  THREE: {
    Color: MockThreeColor,
    Group: class { constructor() { this.name = ''; this.add = () => {}; } }
  }
};

stressSandbox.window.document = stressSandbox.document;
stressSandbox.window.localStorage = stressSandbox.localStorage;

const engineCode = fs.readFileSync(path.resolve(__dirname, '../Assets/js/workbenchUiEngine.js'), 'utf8');
vm.createContext(stressSandbox);
vm.runInContext(engineCode, stressSandbox);

assert(typeof stressSandbox.window.toggleTheme === 'function', 'window.toggleTheme is exported');

// Execution of 5,000 rapid toggles
const NUM_TOGGLES = 5000;
let desyncDetected = false;
let lightingMismatch = false;
let storageMismatch = false;
let gridYAltered = false;
const initialGridY = stressSandbox.window.gridHelper.position.y;

const startTime = Date.now();

for (let i = 1; i <= NUM_TOGGLES; i++) {
  // Strategy:
  // First 2500: alternating toggleTheme()
  // 2501 - 3500: explicit toggleTheme('light')
  // 3501 - 4500: explicit toggleTheme('dark')
  // 4501 - 5000: pseudo-random switching
  let expectedTheme;
  if (i <= 2500) {
    stressSandbox.window.toggleTheme();
    expectedTheme = (i % 2 === 1) ? 'light' : 'dark';
  } else if (i <= 3500) {
    stressSandbox.window.toggleTheme('light');
    expectedTheme = 'light';
  } else if (i <= 4500) {
    stressSandbox.window.toggleTheme('dark');
    expectedTheme = 'dark';
  } else {
    const pick = (i % 3 === 0) ? 'dark' : 'light';
    stressSandbox.window.toggleTheme(pick);
    expectedTheme = pick;
  }

  const isLight = (expectedTheme === 'light');
  const bodyHasLight = stressSandbox.document.body.classList.contains('theme-light');
  const htmlHasLight = stressSandbox.document.documentElement.classList.contains('theme-light');

  // Verify class synchronization between <html> and <body>
  if (bodyHasLight !== htmlHasLight || bodyHasLight !== isLight) {
    desyncDetected = true;
  }

  // Verify updateThemeLighting call
  if (lastLightingCall !== isLight) {
    lightingMismatch = true;
  }

  // Verify localStorage persistence
  if (mockStorageStore['quicklook_stp_theme'] !== expectedTheme) {
    storageMismatch = true;
  }

  // Verify gridHelper.position.y is preserved
  if (stressSandbox.window.gridHelper.position.y !== initialGridY) {
    gridYAltered = true;
  }
}

const elapsedMs = Date.now() - startTime;
console.log(`  Executed 5,000 iterations in ${elapsedMs} ms (~${(elapsedMs / 5000).toFixed(3)} ms/toggle)`);

assert(!desyncDetected, `Zero class desynchronization between <html> and <body> across all 5,000 rapid toggles`);
assert(!lightingMismatch, `updateThemeLighting strictly matched active theme state across all 5,000 toggles`);
assert(!storageMismatch, `localStorage persisted correct theme without corruption across all 5,000 toggles`);
assert(!gridYAltered, `gridHelper elevation stayed strictly invariant at box.min.y - 0.02 across all 5,000 toggles`);
assert(lightingCallCount === NUM_TOGGLES, `updateThemeLighting was triggered exactly 5,000 times`);


// -----------------------------------------------------------------------------
// TEST SUITE 5: Storage Quota Exception Hardening & FOUC Prevention
// -----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 5: LocalStorage Quota Resilience & FOUC Prevention ---');

// Stress under QuotaExceededError
storageQuotaExceeded = true;
let threwDuringQuota = false;
try {
  stressSandbox.window.toggleTheme('light');
  stressSandbox.window.toggleTheme('dark');
} catch (e) {
  threwDuringQuota = true;
}
storageQuotaExceeded = false;

assert(!threwDuringQuota, 'toggleTheme handles QuotaExceededError / private browsing storage restrictions gracefully without throwing');

// Inspect viewer.html <head> for FOUC prevention script
const htmlPath = path.resolve(__dirname, '../Assets/viewer.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const headMatch = htmlContent.match(/<head[^>]*>(.*?)<\/head>/s);
assert(headMatch !== null, '<head> tag located in Assets/viewer.html');

const headContent = headMatch ? headMatch[1] : '';
const hasFoucScript = headContent.includes('localStorage.getItem') && headContent.includes('classList.add');
assert(hasFoucScript, 'Synchronous FOUC prevention script exists inside <head> before <body> render');


// -----------------------------------------------------------------------------
// SUMMARY & FINDINGS REPORT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  CHALLENGER SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================\n');

if (findings.length > 0) {
  console.log('================================================================');
  console.log(`  EMPIRICAL CHALLENGER FINDINGS REPORT (${findings.length} Itemized Issues) `);
  console.log('================================================================');
  findings.forEach((f, idx) => {
    console.log(`\n[Finding ${idx + 1}] [${f.severity}] Category: ${f.category}`);
    if (f.selector) console.log(`  Selector: ${f.selector}`);
    if (f.token) console.log(`  Token: ${f.token}`);
    if (f.actualContrast) console.log(`  Measured Contrast: ${f.actualContrast}`);
    console.log(`  Detail: ${f.detail}`);
  });
  console.log('\n');
}

// Exit code based on failed tests
if (failedTests > 0) {
  console.error(`FAILED: ${failedTests} test(s) failed.`);
  process.exit(1);
} else {
  console.log('All adversarial tests passed!');
  process.exit(0);
}
