/**
 * Automated Verification Suite: Blueprint HLR, Projection & Preview Studio (Phase 3B)
 * File: tests/test_blueprint_hlr_preview.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Load MeshBVH UMD into global scope just like viewer.html does
global.THREE = THREE;
const bvhPath = path.join(__dirname, '../Assets/js/vendor/three-mesh-bvh.umd.js');
const bvhCode = fs.readFileSync(bvhPath, 'utf8');
new Function('THREE', 'var globalThis = global; var self = global; ' + bvhCode.replace(/typeof exports === 'object'/g, 'false'))(THREE);

// Mock DOM elements for Preview Studio tests
const mockElements = {
  'blueprint-preview-modal': {
    style: { display: 'none' },
    attrs: { 'aria-hidden': 'true' },
    classes: new Set(),
    setAttribute(k, v) { this.attrs[k] = v; },
    classList: {
      add(c) { mockElements['blueprint-preview-modal'].classes.add(c); },
      remove(c) { mockElements['blueprint-preview-modal'].classes.delete(c); },
      toggle(c, f) { f ? this.add(c) : this.remove(c); }
    }
  },
  'blueprint-preview-stage': {
    innerHTML: ''
  },
  'btn-bp-proj-first': { attrs: {}, classes: new Set(['active']), setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle(c, f) { f ? mockElements['btn-bp-proj-first'].classes.add(c) : mockElements['btn-bp-proj-first'].classes.delete(c); } } },
  'btn-bp-proj-third': { attrs: {}, classes: new Set(), setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle(c, f) { f ? mockElements['btn-bp-proj-third'].classes.add(c) : mockElements['btn-bp-proj-third'].classes.delete(c); } } },
  'btn-bp-hlr-dashed': { attrs: {}, classes: new Set(['active']), setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle(c, f) { f ? mockElements['btn-bp-hlr-dashed'].classes.add(c) : mockElements['btn-bp-hlr-dashed'].classes.delete(c); } } },
  'btn-bp-hlr-clean': { attrs: {}, classes: new Set(), setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle(c, f) { f ? mockElements['btn-bp-hlr-clean'].classes.add(c) : mockElements['btn-bp-hlr-clean'].classes.delete(c); } } }
};

global.document = {
  getElementById: (id) => mockElements[id] || null
};

global.window = {
  modelBodies: [],
  pendingFileName: 'Bracket_HLR_Test.step',
  currentUnit: 'mm',
  MaterialsEngine: {
    getTotalMassKg: () => 2.45,
    getSelectedMaterialName: () => 'Stainless Steel 316L'
  }
};

// Load blueprintSvgEngine.js
const blueprintEnginePath = path.join(__dirname, '../Assets/js/blueprintSvgEngine.js');
const blueprintCode = fs.readFileSync(blueprintEnginePath, 'utf8');
eval(blueprintCode);

// Build a 2-body overlapping assembly so hidden lines are guaranteed to exist
function createTestAssembly() {
  const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 10), new THREE.MeshBasicMaterial());
  frontPlate.updateMatrixWorld(true);

  // Smaller rear boss centered behind frontPlate along +Z
  const rearBossGeom = new THREE.BoxGeometry(16, 16, 20);
  rearBossGeom.translate(0, 0, -15);
  const rearBoss = new THREE.Mesh(rearBossGeom, new THREE.MeshBasicMaterial());
  rearBoss.updateMatrixWorld(true);

  return [
    { id: 1, name: 'FrontPlate', mesh: frontPlate },
    { id: 2, name: 'RearBoss', mesh: rearBoss }
  ];
}

console.log('================================================================');
console.log('  BLUEPRINT HLR, PROJECTION & PREVIEW STUDIO SUITE (PHASE 3B)   ');
console.log('================================================================\n');

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

window.modelBodies = createTestAssembly();

runTest('Test 1: Zero-arg generateBlueprintSvg() returns valid SVG with <defs>, title block, visible & dashed hidden lines', () => {
  const svg = window.BlueprintEngine.generateSvg();
  assert.ok(typeof svg === 'string' && svg.length > 500, 'SVG output must be a non-empty string');
  assert.ok(svg.includes('<svg ') && svg.includes('</svg>'), 'Must contain root <svg> tags');
  assert.ok(svg.includes('<defs>') && svg.includes('</defs>'), 'Must contain <defs>');
  assert.ok(svg.includes('id="iso-title-block"'), 'Must contain ISO title block');
  assert.ok(svg.includes('PROJECTION: 1st ANGLE'), 'Default projection must be 1st ANGLE');
  assert.ok(svg.includes('class="bp-visible-edges"'), 'Must contain visible contour group');
  assert.ok(svg.includes('stroke="#0f172a" stroke-width="1.3"'), 'Visible contours must use #0f172a 1.3px stroke');
  assert.ok(svg.includes('class="bp-hidden-edges"'), 'Must contain hidden-line dashed group when occluded edges exist');
  assert.ok(svg.includes('stroke="#94a3b8" stroke-width="0.65" stroke-dasharray="4,3"'), 'Hidden lines must use #94a3b8 0.65px 4,3 dasharray');
});

runTest('Test 2: showHiddenLines: false omits hidden-line dashed group while keeping visible contours', () => {
  const svg = window.BlueprintEngine.generateSvg({ showHiddenLines: false });
  assert.ok(svg.includes('class="bp-visible-edges"'), 'Visible contours must still be rendered');
  assert.ok(!svg.includes('class="bp-hidden-edges"'), 'Hidden-line group must be omitted when showHiddenLines is false');
  assert.ok(!svg.includes('stroke-dasharray="4,3"'), 'Hidden-line dasharray must be omitted when showHiddenLines is false');
});

runTest('Test 3: projection: "third" updates title block text to 3rd ANGLE and renders ASME symbol', () => {
  const svg = window.BlueprintEngine.generateSvg({ projection: 'third' });
  assert.ok(svg.includes('PROJECTION: 3rd ANGLE'), 'Title block must display PROJECTION: 3rd ANGLE');
  assert.ok(svg.includes('id="projection-symbol-third"'), 'Must render ASME Third-Angle projection symbol');
  assert.ok(!svg.includes('PROJECTION: 1st ANGLE'), 'Must not contain 1st ANGLE label');
});

runTest('Test 4: unit: "in" formats dimension callouts and title block units in inches', () => {
  const svg = window.BlueprintEngine.generateSvg({ unit: 'in' });
  assert.ok(svg.includes('UNITS:'), 'Must include UNITS label');
  assert.ok(svg.includes('INCHES'), 'Title block units must be INCHES');
  assert.ok(svg.includes(' in</text>'), 'Dimension labels must use inch suffix');
});

runTest('Test 5: openBlueprintPreview / refreshBlueprintPreview / closeBlueprintPreview are exported and drive DOM stage', () => {
  assert.strictEqual(typeof window.BlueprintEngine.openBlueprintPreview, 'function');
  assert.strictEqual(typeof window.BlueprintEngine.refreshBlueprintPreview, 'function');
  assert.strictEqual(typeof window.BlueprintEngine.closeBlueprintPreview, 'function');
  assert.strictEqual(window.BlueprintSvg.openBlueprintPreview, window.BlueprintEngine.openBlueprintPreview);

  const opened = window.BlueprintEngine.openBlueprintPreview();
  assert.strictEqual(opened, true, 'openBlueprintPreview must return true when model is loaded');
  assert.strictEqual(mockElements['blueprint-preview-modal'].style.display, 'flex');
  assert.ok(mockElements['blueprint-preview-stage'].innerHTML.includes('<svg '), 'Preview stage must contain live SVG');

  window.BlueprintEngine.refreshBlueprintPreview({ projection: 'third', showHiddenLines: false });
  const stageHtml = mockElements['blueprint-preview-stage'].innerHTML;
  assert.ok(stageHtml.includes('PROJECTION: 3rd ANGLE'), 'Refresh must update projection in stage SVG');
  assert.ok(!stageHtml.includes('class="bp-hidden-edges"'), 'Refresh must omit hidden edges when showHiddenLines is false');
  assert.ok(mockElements['btn-bp-proj-third'].classes.has('active'), '3rd Angle button must become active');
  assert.ok(mockElements['btn-bp-hlr-clean'].classes.has('active'), 'Clean HLR button must become active');

  window.BlueprintEngine.closeBlueprintPreview();
  assert.strictEqual(mockElements['blueprint-preview-modal'].style.display, 'none');
});

console.log(`\n================================================================`);
console.log(`  HLR & PREVIEW RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log(`================================================================`);

if (failedTests > 0) process.exit(1);
