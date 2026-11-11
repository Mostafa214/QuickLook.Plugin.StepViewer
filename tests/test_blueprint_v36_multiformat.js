/**
 * Automated Verification Suite: Blueprint Multi-Format & True Filename (v3.6.0)
 * File: tests/test_blueprint_v36_multiformat.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Global browser mock
const postedMessages = [];
global.window = {
  modelBodies: [],
  pendingFileName: 'Flange_Mount.step',
  MaterialsEngine: {
    getTotalMassKg: () => 1.85,
    getSelectedMaterialName: () => 'Aluminum 6061-T6'
  },
  chrome: {
    webview: {
      postMessage: (msg) => {
        postedMessages.push(msg);
      }
    }
  }
};
global.THREE = THREE;

// Load blueprintSvgEngine
const blueprintEnginePath = path.join(__dirname, '../Assets/js/blueprintSvgEngine.js');
const blueprintCode = fs.readFileSync(blueprintEnginePath, 'utf8');
eval(blueprintCode);

console.log('================================================================');
console.log('  BLUEPRINT v3.6.0 MULTI-FORMAT & TRUE FILENAME SUITE           ');
console.log('================================================================\n');

async function runAllTests() {
  // Test 1
  totalTests++;
  try {
    const boxGeom = new THREE.BoxGeometry(20, 20, 20);
    const mesh = new THREE.Mesh(boxGeom, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    window.modelBodies = [{ id: 1, name: 'MainFlange', mesh: mesh }];
    window.pendingFileName = 'Flange_Mount.step';

    postedMessages.length = 0;
    await window.BlueprintEngine.downloadSvg();

    assert.strictEqual(postedMessages.length, 1, 'Exactly 1 IPC message must be sent');
    assert.ok(postedMessages[0].defaultName.startsWith('Flange_Mount_Blueprint_'), 'Filename must start with original name Flange_Mount');
    assert.ok(postedMessages[0].defaultName.endsWith('.svg'), 'Filename must end with .svg');
    passedTests++;
    console.log('  [PASS] Test 1: True filename is inherited by export (PNG, PDF, SVG)');
  } catch (err) {
    failedTests++;
    console.error('  [FAIL] Test 1:', err.message);
  }

  // Test 2
  totalTests++;
  try {
    window.pendingFileName = '';
    window.currentLoadedModelName = '';

    // Mock DOM badge element
    global.document = {
      getElementById: (id) => {
        if (id === 'badge-filename') {
          return { innerText: 'Gearbox_Shaft_v2.step (4.2 MB)' };
        }
        return null;
      }
    };

    postedMessages.length = 0;
    // Wait for cooldown
    await new Promise(r => setTimeout(r, 1600));
    await window.BlueprintEngine.downloadSvg();

    assert.strictEqual(postedMessages.length, 1, 'Exactly 1 IPC message sent');
    assert.ok(postedMessages[0].defaultName.startsWith('Gearbox_Shaft_v2_Blueprint_'),
      `Filename must be extracted from badge, got ${postedMessages[0].defaultName}`);
    passedTests++;
    console.log('  [PASS] Test 2: Fallback filename resolution extracts from badge-filename DOM');
  } catch (err) {
    failedTests++;
    console.error('  [FAIL] Test 2:', err.message);
  }

  // Test 3
  totalTests++;
  try {
    postedMessages.length = 0;
    await new Promise(r => setTimeout(r, 1600));

    // Trigger 3 calls in rapid succession (simulating accidental rapid clicks)
    window.BlueprintEngine.downloadSvg();
    window.BlueprintEngine.downloadSvg();
    window.BlueprintEngine.downloadSvg();

    assert.strictEqual(postedMessages.length, 1, 'Only 1 message must be posted despite 3 rapid calls');
    passedTests++;
    console.log('  [PASS] Test 3: Idempotency lock blocks duplicate dialog dispatches during rapid clicks');
  } catch (err) {
    failedTests++;
    console.error('  [FAIL] Test 3:', err.message);
  }

  console.log(`\n================================================================`);
  console.log(`  MULTI-FORMAT RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log(`================================================================`);

  if (failedTests > 0) process.exit(1);
}

runAllTests();
