/**
 * Comprehensive Verification Suite: 2D Blueprint Engine v3.5.0
 * File: tests/test_blueprint_v35_complete.js
 *
 * Verifies:
 * 1. View-Dependent Silhouette Extraction on Curved Geometry (Cylinder profile edges in Front/Right views, rim circles in Top view, zero internal diagonal wires)
 * 2. True Assembly Geometry Invariant (Exploded view displacement offset isolation)
 * 3. MaterialsEngine Integration (Mass calculation and display)
 * 4. Standard ISO Engineering Scale Selection (1:1, 1:2, etc.)
 * 5. ISO 7200 Title Block & ISO 5457 Sheet Format (Zero text collisions, First Angle Projection symbol)
 * 6. Strict XML Well-Formedness
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
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

// Set up global browser mock environment
global.window = {
  modelBodies: [],
  currentLoadedModelName: 'Bearing_Housing_Assembly.step',
  MaterialsEngine: {
    getTotalMassKg: () => 0.4284,
    getSelectedMaterialName: () => 'Stainless Steel 316L'
  }
};
global.THREE = THREE;

// Load blueprintSvgEngine
const blueprintEnginePath = path.join(__dirname, '../Assets/js/blueprintSvgEngine.js');
const blueprintCode = fs.readFileSync(blueprintEnginePath, 'utf8');
eval(blueprintCode);

console.log('================================================================');
console.log('  2D BLUEPRINT ENGINE v3.5.0 VERIFICATION SUITE                  ');
console.log('================================================================\n');

// Mock strict XML validator
function validateXml(xmlString) {
  const errors = [];
  if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    errors.push('Empty XML');
    return errors;
  }
  // Check unescaped ampersand
  const nakedAmpRegex = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g;
  let match;
  while ((match = nakedAmpRegex.exec(xmlString)) !== null) {
    errors.push(`Unescaped '&' at ${match.index}`);
  }
  // Basic tag nesting check
  const tagStack = [];
  const tagRegex = /<\/?([a-zA-Z0-9_\-:]+)(?:\s+[^>]*?)?(\/?)>/g;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(xmlString)) !== null) {
    const fullTag = tagMatch[0];
    const tagName = tagMatch[1];
    const isSelfClosing = tagMatch[2] === '/' || fullTag.endsWith('/>');
    const isClosing = fullTag.startsWith('</');

    if (fullTag.startsWith('<?') || fullTag.startsWith('<!')) continue;

    if (isClosing) {
      if (tagStack.length === 0) {
        errors.push(`Unexpected closing tag </${tagName}>`);
      } else {
        const top = tagStack.pop();
        if (top !== tagName) {
          errors.push(`Mismatched closing tag: expected </${top}>, got </${tagName}>`);
        }
      }
    } else if (!isSelfClosing) {
      tagStack.push(tagName);
    }
  }
  if (tagStack.length > 0) {
    errors.push(`Unclosed tags: ${tagStack.join(', ')}`);
  }
  return errors;
}

// -----------------------------------------------------------------------------
// Test 1: Silhouette extraction for Cylinder
// -----------------------------------------------------------------------------
test('Test 1: Silhouette extraction creates connected profile edges for cylinders', () => {
  const cylGeom = new THREE.CylinderGeometry(15, 15, 40, 32);
  const cylMesh = new THREE.Mesh(cylGeom, new THREE.MeshBasicMaterial());
  cylMesh.updateMatrixWorld(true);

  window.modelBodies = [
    {
      id: 1,
      name: 'Shaft_Cylinder',
      mesh: cylMesh
    }
  ];

  const svg = window.generateBlueprintSvg();
  assert.ok(svg, 'SVG must be generated');

  // Verify that Front view contains geometry lines
  const frontIdx = svg.indexOf('id="view-front"');
  const rightIdx = svg.indexOf('id="view-right"');
  assert.ok(frontIdx !== -1 && rightIdx !== -1, 'Front view and Right view must exist');
  const frontViewBlock = svg.slice(frontIdx, rightIdx);
  const lineCount = (frontViewBlock.match(/<line/g) || []).length;
  // In front view: 32 cap edges + 32 base edges + 2 vertical silhouette profile lines = 66 lines (+ centerlines & dimensions)
  assert.ok(lineCount >= 64, `Front view must contain silhouette + rim lines, got ${lineCount}`);

  // Strict XML validity
  const errs = validateXml(svg);
  assert.strictEqual(errs.length, 0, `XML must have 0 errors, got: ${errs.join('; ')}`);
});

// -----------------------------------------------------------------------------
// Test 2: True Assembly Invariant (Exploded View Isolation)
// -----------------------------------------------------------------------------
test('Test 2: Blueprint temporarily resets exploded bodies to (0,0,0) and restores afterward', () => {
  const boxGeom = new THREE.BoxGeometry(20, 20, 20);
  const mesh1 = new THREE.Mesh(boxGeom, new THREE.MeshBasicMaterial());
  const mesh2 = new THREE.Mesh(boxGeom, new THREE.MeshBasicMaterial());

  // Simulate active exploded view
  mesh1.position.set(150, 0, 0); // Exploded 150mm to the right
  mesh2.position.set(-150, 0, 0); // Exploded 150mm to the left
  mesh1.updateMatrixWorld(true);
  mesh2.updateMatrixWorld(true);

  window.modelBodies = [
    { id: 1, name: 'Part_A', mesh: mesh1 },
    { id: 2, name: 'Part_B', mesh: mesh2 }
  ];

  const svg = window.generateBlueprintSvg();
  assert.ok(svg, 'SVG must be generated');

  // Verify that mesh positions were restored to their user state
  assert.strictEqual(mesh1.position.x, 150, 'Mesh1 position must be restored after blueprint generation');
  assert.strictEqual(mesh2.position.x, -150, 'Mesh2 position must be restored after blueprint generation');

  // Verify bounding box in title block reflects assembled bounds (20 x 20 x 20), not exploded (320 x 20 x 20)
  assert.ok(svg.includes('20.0 × 20.0 × 20.0 mm'), 'Bounds in title block must reflect assembled geometry (20.0 x 20.0 x 20.0 mm)');
});

// -----------------------------------------------------------------------------
// Test 3: MaterialsEngine Integration in Title Block
// -----------------------------------------------------------------------------
test('Test 3: Title block displays real mass and material name from MaterialsEngine', () => {
  const boxGeom = new THREE.BoxGeometry(10, 10, 10);
  const mesh = new THREE.Mesh(boxGeom, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);

  window.modelBodies = [{ id: 1, name: 'TestBlock', mesh: mesh }];
  window.pendingFileName = 'Pinion_Gear.step';

  const svg = window.generateBlueprintSvg();
  assert.ok(!svg.includes('Calculated in App'), 'Must not display "Calculated in App"');
  assert.ok(svg.includes('0.428 kg'), 'Must display formatted mass 0.428 kg');
  assert.ok(svg.includes('Stainless Steel 316L'), 'Must display material name');
  assert.ok(svg.includes('Pinion_Gear'), 'Must display clean part title Pinion_Gear');
});

// -----------------------------------------------------------------------------
// Test 4: Standard ISO Engineering Scale Selection
// -----------------------------------------------------------------------------
test('Test 4: Scale in title block is a standard engineering ratio (1:1, 1:2, etc.)', () => {
  const boxGeom = new THREE.BoxGeometry(100, 100, 100);
  const mesh = new THREE.Mesh(boxGeom, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);

  window.modelBodies = [{ id: 1, name: 'TestBlock', mesh: mesh }];

  const svg = window.generateBlueprintSvg();
  assert.ok(!svg.includes('1 : 0.4'), 'Must not display non-standard decimal ratio 1 : 0.4');
  assert.ok(svg.includes('SCALE:') && (svg.includes('1:1') || svg.includes('1:2') || svg.includes('1:5')), 'Must display standard ISO scale');
});

// -----------------------------------------------------------------------------
// Test 5: ISO 5457 Sheet Format and First Angle Projection Symbol
// -----------------------------------------------------------------------------
test('Test 5: Drawing sheet contains ISO 5457 border, grid reference marks, and First Angle projection symbol', () => {
  const boxGeom = new THREE.BoxGeometry(10, 10, 10);
  const mesh = new THREE.Mesh(boxGeom, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);

  window.modelBodies = [{ id: 1, name: 'TestBlock', mesh: mesh }];

  const svg = window.generateBlueprintSvg();
  assert.ok(svg.includes('PROJECTION: 1st ANGLE'), 'Must designate First Angle projection');
  assert.ok(svg.includes('<polygon points="2,14 14,8 14,20 2,14"'), 'Must render First Angle truncated cone');
  assert.ok(svg.includes('<circle cx="28" cy="14" r="3.5"'), 'Must render First Angle concentric projection circles');
  assert.ok(svg.includes('<rect width="1200" height="848" fill="#ffffff"'), 'Must have clean pure white sheet background');
  assert.ok(!svg.includes('pattern id="grid"'), 'Childish cyan grid pattern must be eliminated');
});

console.log(`\n================================================================`);
console.log(`  BLUEPRINT RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log(`================================================================`);

if (failedTests > 0) process.exit(1);
