/**
 * Final Packaging & Materials Deep Stress Test
 * File: tests/test_challenger_zip_crc_and_materials_deep_stress.js
 *
 * Adversarial Challenger 2 (Milestone 5)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

console.log('================================================================================');
console.log('  CHALLENGER FINAL 2: PACKAGING CRC INTEGRITY & MATERIALS DEEP STRESS           ');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// PART 1: Strict ZIP Archive Binary Specification & CRC-32 Oracle
// -----------------------------------------------------------------------------
console.log('--- PART 1: Binary ZIP Central Directory & IEEE 802.3 CRC32 Verification ---');

// Build IEEE 802.3 CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c >>> 0;
}

function calculateCrc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xFF];
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0);
}

const rootPkgPath = path.resolve('QuickLook.Plugin.StepViewer.qlplugin');
const distPkgPath = path.resolve('dist', 'QuickLook.Plugin.StepViewer.qlplugin');

assert(fs.existsSync(rootPkgPath), `Root package missing: ${rootPkgPath}`);
assert(fs.existsSync(distPkgPath), `Dist package missing: ${distPkgPath}`);

const rootBuf = fs.readFileSync(rootPkgPath);
const distBuf = fs.readFileSync(distPkgPath);

assert.strictEqual(rootBuf.length, distBuf.length, 'Root and dist package sizes differ!');
assert(rootBuf.equals(distBuf), 'Root and dist package binary contents differ!');
console.log(`[PASS] Root & dist packages identical: ${rootBuf.length} bytes`);

// Parse End of Central Directory Record (EOCD)
// Signature 0x06054b50
let eocdOffset = -1;
for (let i = rootBuf.length - 22; i >= 0; i--) {
  if (rootBuf.readUInt32LE(i) === 0x06054b50) {
    eocdOffset = i;
    break;
  }
}
assert(eocdOffset !== -1, 'Could not find EOCD signature in ZIP package');

const totalEntries = rootBuf.readUInt16LE(eocdOffset + 10);
const cdSize = rootBuf.readUInt32LE(eocdOffset + 12);
const cdOffset = rootBuf.readUInt32LE(eocdOffset + 16);

console.log(`[INFO] EOCD found at offset ${eocdOffset}. Total entries: ${totalEntries}, CD size: ${cdSize}, CD offset: ${cdOffset}`);

// Parse each Central Directory entry
let currentCdOffset = cdOffset;
const parsedEntries = [];
let passedCrcCount = 0;

for (let i = 0; i < totalEntries; i++) {
  const sig = rootBuf.readUInt32LE(currentCdOffset);
  assert.strictEqual(sig, 0x02014b50, `Invalid Central Directory header signature at offset ${currentCdOffset}`);

  const compMethod = rootBuf.readUInt16LE(currentCdOffset + 10);
  const storedCrc = rootBuf.readUInt32LE(currentCdOffset + 16);
  const compSize = rootBuf.readUInt32LE(currentCdOffset + 20);
  const uncompSize = rootBuf.readUInt32LE(currentCdOffset + 24);
  const nameLen = rootBuf.readUInt16LE(currentCdOffset + 28);
  const extraLen = rootBuf.readUInt16LE(currentCdOffset + 30);
  const commentLen = rootBuf.readUInt16LE(currentCdOffset + 32);
  const localHeaderOffset = rootBuf.readUInt32LE(currentCdOffset + 42);

  const fileName = rootBuf.toString('utf8', currentCdOffset + 46, currentCdOffset + 46 + nameLen);
  currentCdOffset += 46 + nameLen + extraLen + commentLen;

  // Local File Header parsing
  const localSig = rootBuf.readUInt32LE(localHeaderOffset);
  assert.strictEqual(localSig, 0x04034b50, `Invalid local header signature for entry ${fileName}`);
  const localNameLen = rootBuf.readUInt16LE(localHeaderOffset + 26);
  const localExtraLen = rootBuf.readUInt16LE(localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

  const compressedData = rootBuf.slice(dataOffset, dataOffset + compSize);
  let decompressedData;

  if (compMethod === 0) {
    decompressedData = compressedData;
  } else if (compMethod === 8) {
    decompressedData = zlib.inflateRawSync(compressedData);
  } else {
    throw new Error(`Unsupported compression method ${compMethod} for ${fileName}`);
  }

  assert.strictEqual(decompressedData.length, uncompSize, `Decompressed length mismatch for ${fileName}`);
  const computedCrc = calculateCrc32(decompressedData);
  assert.strictEqual(computedCrc, storedCrc, `CRC32 mismatch for ${fileName}: computed 0x${computedCrc.toString(16)} != stored 0x${storedCrc.toString(16)}`);

  passedCrcCount++;
  parsedEntries.push({
    fileName,
    compMethod,
    compSize,
    uncompSize,
    crc: storedCrc
  });
}

console.log(`[PASS] Verified CRC32 on all ${passedCrcCount} ZIP entries with zero mismatches!\n`);

// -----------------------------------------------------------------------------
// PART 2: Packaging Security & Deployment Isolation
// -----------------------------------------------------------------------------
console.log('--- PART 2: Packaging Security & Deployment Isolation ---');

const forbiddenPatterns = [
  /QuickLook\.Common\.dll/i,
  /\.cs$/i,
  /\.csproj$/i,
  /\.pdb$/i,
  /^tests[\/\\]/i,
  /\.git/i
];

for (const entry of parsedEntries) {
  for (const pattern of forbiddenPatterns) {
    assert(!pattern.test(entry.fileName), `Security violation: Package contains forbidden file ${entry.fileName}`);
  }
}
console.log('[PASS] Security check passed: 0 forbidden assemblies, debug PDBs, or source files in package.');

const requiredAssets = [
  'QuickLook.Plugin.Metadata.config',
  'QuickLook.Plugin.StepViewer.dll',
  'Microsoft.Web.WebView2.Core.dll',
  'Microsoft.Web.WebView2.Wpf.dll',
  'WebView2Loader.dll',
  'Assets/viewer.html',
  'Assets/stepWorker.js',
  'Assets/three.min.js',
  'Assets/OrbitControls.js',
  'Assets/occt-import-js.js',
  'Assets/occt-import-js.wasm',
  'Assets/css/viewer.css',
  'Assets/js/viewerApp.js',
  'Assets/js/stlLoader.js',
  'Assets/js/meshFeatureDetector.js',
  'Assets/js/materialsEngine.js',
  'Assets/js/measureEngine.js',
  'Assets/js/workbenchUiEngine.js'
];

for (const req of requiredAssets) {
  const normReq = req.replace(/\\/g, '/');
  const found = parsedEntries.some(e => e.fileName.replace(/\\/g, '/') === normReq);
  assert(found, `Required asset missing in package: ${req}`);
}
console.log(`[PASS] All ${requiredAssets.length} required assets are confirmed present in the archive.\n`);

// -----------------------------------------------------------------------------
// PART 3: Deep Adversarial Stress on Materials Engine & Infill
// -----------------------------------------------------------------------------
console.log('--- PART 3: Deep Stress on Materials Engine & Infill Formulas ---');

const { createCadEnvironment } = require('./stl_test_harness.js');
const env = createCadEnvironment({
  loadCadState: true,
  loadMaterialsEngine: true,
  loadWorkbenchUiEngine: true
});

const MaterialsEngine = env.window.MaterialsEngine;
assert(MaterialsEngine, 'MaterialsEngine failed to initialize');

// 1. Verify all 5 3D printing filaments and densities
const expectedFilaments = {
  'pla': 1.24,
  'petg': 1.27,
  'abs': 1.04,
  'tpu': 1.21,
  'resin': 1.15
};

const allMaterials = MaterialsEngine.getAllMaterials();
for (const [id, density] of Object.entries(expectedFilaments)) {
  const mat = allMaterials.find(m => m.id === id);
  assert(mat, `Material ${id} missing in MaterialsEngine`);
  assert.strictEqual(mat.density, density, `Material ${id} density mismatch: ${mat.density} != ${density}`);
  assert.strictEqual(mat.category, '3D Printing', `Material ${id} category should be '3D Printing'`);
}
console.log('[PASS] All 5 standard 3D printing filaments verified with exact densities.');

// 2. Numerical Infill Clamping Stress
const infillFuzzCases = [
  { in: -100, expected: 5 },
  { in: -0.01, expected: 5 },
  { in: 0, expected: 5 },
  { in: 4, expected: 5 },
  { in: 5, expected: 5 },
  { in: 15, expected: 15 },
  { in: 20, expected: 20 },
  { in: 50, expected: 50 },
  { in: 100, expected: 100 },
  { in: 101, expected: 100 },
  { in: 150, expected: 100 },
  { in: 1e9, expected: 100 },
  { in: -1e9, expected: 5 },
  { in: NaN, expected: 5 },
  { in: 'invalid', expected: 5 },
  { in: null, expected: 5 }
];

for (const tc of infillFuzzCases) {
  const clamped = MaterialsEngine.clampInfill(tc.in);
  assert.strictEqual(clamped, tc.expected, `clampInfill failure for input ${tc.in}: got ${clamped}, expected ${tc.expected}`);
}
console.log(`[PASS] Infill clamping stress verified across ${infillFuzzCases.length} boundary and fuzz test cases.`);

// 3. Mathematical Formula Oracle on Physical Print Metrics
// Mass (g) = Vol(cm³) * Density(g/cm³) * Infill
// Vol(cm³) = Vol(mm³) / 1000
// Filament Length (m) = Vol(mm³) * Infill / (PI * (1.75 / 2)^2 * 1000)
// Spool Fraction (%) = Mass(g) / 1000 * 100 = Mass(g) / 10
const FILAMENT_AREA = Math.PI * Math.pow(1.75 / 2, 2); // ~2.4052818754 mm²
const FILAMENT_CONSTANT = FILAMENT_AREA * 1000.0;

const volumeStressCases = [
  1000,        // 1 cm³
  1e5,         // 100 cm³
  1e6,         // 1000 cm³ (1 liter)
  123456.789,  // Realistic mechanical part
  0.001,       // Tiny micro part
  1e9          // Huge industrial part
];

for (const vol of volumeStressCases) {
  for (const [matId, density] of Object.entries(expectedFilaments)) {
    MaterialsEngine.selectMaterial(matId);
    for (const infillPct of [15, 20, 50, 100]) {
      MaterialsEngine.setInfill(infillPct);

      // Seed modelPhysicalProps in window
      env.window.modelPhysicalProps = {
        volumeMm3: vol,
        areaMm2: 600,
        bbox: { x: 10, y: 10, z: 10 }
      };

      const metrics = MaterialsEngine.getPrintMetrics(vol, density, infillPct);
      const infillFactor = infillPct / 100.0;
      const expectedMassGrams = (vol / 1000.0) * density * infillFactor;
      const expectedLengthMeters = (vol * infillFactor) / FILAMENT_CONSTANT;
      const expectedSpool = (expectedMassGrams / 1000.0) * 100.0;

      const massDiff = Math.abs(metrics.massGrams - expectedMassGrams);
      const massTol = Math.max(1e-4, expectedMassGrams * 1e-4);
      assert(massDiff < massTol, `Mass oracle mismatch: vol=${vol}, mat=${matId}, infill=${infillPct}: got ${metrics.massGrams}, expected ${expectedMassGrams}`);

      const lenDiff = Math.abs(metrics.filamentLengthMeters - expectedLengthMeters);
      const lenTol = Math.max(1e-4, expectedLengthMeters * 1e-4);
      assert(lenDiff < lenTol, `Length oracle mismatch: vol=${vol}, mat=${matId}, infill=${infillPct}: got ${metrics.filamentLengthMeters}, expected ${expectedLengthMeters}`);

      const spoolDiff = Math.abs(metrics.spoolFractionPercent - expectedSpool);
      const spoolTol = Math.max(1e-4, expectedSpool * 1e-4);
      assert(spoolDiff < spoolTol, `Spool oracle mismatch: got ${metrics.spoolFractionPercent}, expected ${expectedSpool}`);
    }
  }
}
console.log(`[PASS] Closed-form mathematical oracle verified for ${volumeStressCases.length * 5 * 4} volume/material/infill permutations.`);

// 4. Format Isolation (STL infill vs STEP 100% solid)
env.window.modelPhysicalProps = { volumeMm3: 1000000 }; // 1000 cm³
MaterialsEngine.selectMaterial('pla');
MaterialsEngine.setInfill(20); // 20% infill

env.window.activeCadFormat = 'STL';
const massStl = MaterialsEngine.getTotalMassKg();

env.window.activeCadFormat = 'STEP';
const massStep = MaterialsEngine.getTotalMassKg();

// In STEP mode, infill is ignored and part is calculated at 100% solid density
assert(Math.abs(massStep - (massStl * 5)) < 1e-4, `Format isolation broken: STEP mass (${massStep}) should equal 5x 20% STL mass (${massStl})`);
console.log(`[PASS] Format isolation verified: STL mass = ${massStl.toFixed(3)} kg, STEP mass = ${massStep.toFixed(3)} kg (exact 5x 100% solid density ratio).`);

// -----------------------------------------------------------------------------
// PART 4: Exploded View Tool Adaptation Stress
// -----------------------------------------------------------------------------
console.log('\n--- PART 4: Exploded View Tool State & Keydown Interception ---');

const WorkbenchUI = env.window.WorkbenchUI;
assert(WorkbenchUI, 'WorkbenchUI failed to initialize');

const doc = env.document;
function ensureEl(id, tag = 'div') {
  let el = doc.getElementById(id);
  if (!el) {
    el = doc.createElement(tag);
    el.id = id;
    doc.body.appendChild(el);
    doc.registerElement(el);
  }
  return el;
}

const btnExplode = ensureEl('btn-explode', 'button');

// Scenario A: Single-body STL
env.window.activeCadFormat = 'STL';
env.window.modelBodies = [{ id: 1, name: 'single_body' }];
WorkbenchUI.updateExplodeToolState('STL', 1);

assert(btnExplode.classList.contains('disabled'), 'Explode button missing "disabled" class for single-body STL');
assert.strictEqual(btnExplode.getAttribute('disabled'), 'true', 'Explode button should have disabled="true"');
assert(btnExplode.title.includes('assembly') || btnExplode.title.includes('multi-body'), `Explode button title does not explain assembly requirement: ${btnExplode.title}`);

// Test keydown 'x' interception
let toastMessage = '';
env.window.showToast = (msg) => { toastMessage = msg; };

WorkbenchUI.setupExplodeKeyboardGuard();

let defaultPrevented = false;
let propagationStopped = false;
const fakeEvent = {
  key: 'x',
  target: doc.body,
  preventDefault: () => { defaultPrevented = true; },
  stopPropagation: () => { propagationStopped = true; },
  stopImmediatePropagation: () => { propagationStopped = true; }
};

env.window.dispatchEvent('keydown', fakeEvent);
assert(defaultPrevented, 'Keydown "x" on single-body STL was not prevented');
assert(toastMessage.includes('assembly') || toastMessage.includes('parts'), `Toast message should explain assembly requirement: ${toastMessage}`);
console.log('[PASS] Single-body STL cleanly disables explode button and intercepts "x" keydown.');

// Scenario B: Multi-body STL (count >= 2)
env.window.modelBodies = [{ id: 1 }, { id: 2 }];
WorkbenchUI.updateExplodeToolState('STL', 2);
assert(!btnExplode.classList.contains('disabled'), 'Explode button should NOT be disabled for multi-body STL');
assert.strictEqual(btnExplode.getAttribute('disabled'), null, 'Explode button disabled attribute should be removed');
console.log('[PASS] Multi-body STL enables explode button correctly.');

// Scenario C: Single-body STEP
env.window.activeCadFormat = 'STEP';
env.window.modelBodies = [{ id: 1 }];
WorkbenchUI.updateExplodeToolState('STEP', 1);
assert(!btnExplode.classList.contains('disabled'), 'Explode button should NOT be disabled for STEP models');
console.log('[PASS] STEP model leaves explode button in normal state.');

console.log('\n================================================================================');
console.log('  ALL PACKAGING & MATERIALS DEEP STRESS TESTS PASSED EMPIRICALLY!                ');
console.log('================================================================================');
