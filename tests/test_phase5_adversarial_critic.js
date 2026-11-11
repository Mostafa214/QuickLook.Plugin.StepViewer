/**
 * Phase 5 Adversarial Critic & Stress-Test Suite
 *
 * Stress-tests Milestone 5 implementation for:
 * 1. Self-certifying test checks vs actual CSS component selectors
 * 2. WCAG 2.1 AA/AAA contrast failures in Light Mode for unmigrated components
 *    (Assembly Tree, Snapshot Panel, Material Lists, Color Popover)
 * 3. Token coverage across all interactive inspector drawer panels
 * 4. Low-contrast Bounding Box lines in Light Mode
 */

const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  STP-Quicklook: Phase 5 Adversarial Critic & Stress Test       ');
console.log('================================================================\n');

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

const cssPath = path.resolve(__dirname, '../Assets/css/viewer.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

console.log('--- TEST 1: Assembly Tree Component Rules Contrast in Light Theme ---');
// In light theme, the drawer background is #ffffff.
// Check .tree-node-name color in viewer.css
const treeNodeNameMatch = cssContent.match(/\.tree-node-name\s*\{([^}]+)\}/);
console.log('  Found .tree-node-name rule:', treeNodeNameMatch ? treeNodeNameMatch[1].replace(/\s+/g, ' ').trim() : 'NONE');

let treeNodeColor = null;
if (treeNodeNameMatch) {
  const cMatch = treeNodeNameMatch[1].match(/color\s*:\s*([^;]+);/);
  if (cMatch) treeNodeColor = cMatch[1].trim();
}

console.log('  Declared .tree-node-name color:', treeNodeColor);
if (treeNodeColor && treeNodeColor.startsWith('#')) {
  const cr = contrastRatio(treeNodeColor, '#ffffff');
  console.log(`  Contrast ratio of .tree-node-name (${treeNodeColor}) on white drawer: ${cr.toFixed(2)}:1`);
  if (cr < 4.5) {
    console.error(`  [DEFECT DETECTED] .tree-node-name fails WCAG AA (4.5:1) in Light Mode! Contrast is ${cr.toFixed(2)}:1 (< 4.5:1)`);
  }
} else if (treeNodeColor && treeNodeColor.includes('var(--token-')) {
  console.log('  .tree-node-name uses design token: PASS');
}

console.log('\n--- TEST 2: Snapshot Panel Component Rules Contrast in Light Theme ---');
const snapModeBtnHoverMatch = cssContent.match(/\.snap-mode-btn:hover\s*\{([^}]+)\}/);
console.log('  Found .snap-mode-btn:hover rule:', snapModeBtnHoverMatch ? snapModeBtnHoverMatch[1].replace(/\s+/g, ' ').trim() : 'NONE');

let snapHoverColor = null;
if (snapModeBtnHoverMatch) {
  const cMatch = snapModeBtnHoverMatch[1].match(/color\s*:\s*([^;]+);/);
  if (cMatch) snapHoverColor = cMatch[1].trim();
}
console.log('  Declared .snap-mode-btn:hover color:', snapHoverColor);
if (snapHoverColor && snapHoverColor.startsWith('#')) {
  const cr = contrastRatio(snapHoverColor, '#ffffff');
  console.log(`  Contrast ratio of .snap-mode-btn:hover (${snapHoverColor}) on white drawer: ${cr.toFixed(2)}:1`);
  if (cr < 4.5) {
    console.error(`  [DEFECT DETECTED] .snap-mode-btn:hover fails WCAG AA in Light Mode! Text is invisible (${cr.toFixed(2)}:1)`);
  }
}

console.log('\n--- TEST 3: Material Search & Preset Names in Light Theme ---');
const matSearchMatch = cssContent.match(/\.mat-search-input\s*\{([^}]+)\}/);
let matSearchBg = null;
let matSearchColor = null;
if (matSearchMatch) {
  const bgMatch = matSearchMatch[1].match(/background\s*:\s*([^;]+);/);
  const cMatch = matSearchMatch[1].match(/color\s*:\s*([^;]+);/);
  if (bgMatch) matSearchBg = bgMatch[1].trim();
  if (cMatch) matSearchColor = cMatch[1].trim();
}
console.log(`  .mat-search-input background: ${matSearchBg}, color: ${matSearchColor}`);
if (matSearchBg && !matSearchBg.includes('var(--token-')) {
  console.error('  [DEFECT DETECTED] .mat-search-input uses hardcoded dark background instead of var(--token-bg-input)!');
}

console.log('\n--- TEST 4: CAD Body Appearance Popover Token Modernization ---');
const colorPopoverMatch = cssContent.match(/\.color-popover\s*\{([^}]+)\}/);
let colorPopoverBg = null;
if (colorPopoverMatch) {
  const bgMatch = colorPopoverMatch[1].match(/background\s*:\s*([^;]+);/);
  if (bgMatch) colorPopoverBg = bgMatch[1].trim();
}
console.log(`  .color-popover background: ${colorPopoverBg}`);
if (colorPopoverBg && !colorPopoverBg.includes('var(--token-')) {
  console.error('  [DEFECT DETECTED] .color-popover uses hardcoded dark background instead of var(--token-bg-panel)!');
}

console.log('\n--- TEST 5: Self-Certifying Verification Suite Audit (test_phase5_dual_themes.js) ---');
const testSuitePath = path.resolve(__dirname, 'test_phase5_dual_themes.js');
const testSuiteContent = fs.readFileSync(testSuitePath, 'utf8');

const hasHardcodedWhite = testSuiteContent.includes("const lightWhite = '#ffffff';");
const hasHardcodedPrimary = testSuiteContent.includes("const lightTextPrimary = '#0f172a';");
const hasActualComponentExtraction = testSuiteContent.includes(".tree-node-name") && testSuiteContent.includes("contrastRatio");

console.log('  test_phase5_dual_themes.js hardcodes lightWhite & lightTextPrimary:', hasHardcodedWhite && hasHardcodedPrimary);
console.log('  test_phase5_dual_themes.js extracts actual component colors for contrast checking:', hasActualComponentExtraction);

if (hasHardcodedWhite && hasHardcodedPrimary && !hasActualComponentExtraction) {
  console.error('  [INTEGRITY VIOLATION DETECTED] Test 2 in test_phase5_dual_themes.js is self-certifying: it computes contrast on hardcoded constants rather than verifying the actual CSS component selectors in viewer.css!');
}
