/**
 * Tier 5 Adversarial Coverage Hardening: Materials, Infill, UI & Pipeline Isolation
 * File: tests/test_challenger_t5_materials_ui.js
 *
 * Code-Executing Adversarial Verifier 2 (teamwork_challenger)
 * Targets:
 * - Assets/js/materialsEngine.js
 * - Assets/js/workbenchUiEngine.js
 * - Assets/js/viewerApp.js
 *
 * Test Suites:
 * 1. Infill Scaling Extremes, Numerical Boundaries & Fuzzing
 * 2. 3D Printing Materials, Physical Properties & Closed-Form Mathematical Oracles
 * 3. Exploded View Tool State, Keydown Spamming, and Event Interception Leaks
 * 4. OpenCASCADE WASM Worker Bypass (initWorker) Strict Verification
 * 5. Cross-Feature Pipeline Isolation & Concurrency Race Resistance
 */

'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertCloseTo,
  assertDeepCloseTo,
  assertThrows,
  createCadEnvironment,
  reportSummary,
  exitProcess
} = require('./stl_test_harness.js');

const {
  generateCube,
  generateSteppedBushing,
  generateMultiHolePlate,
  generateInvertedCube
} = require('./stl_test_fixtures.js');

console.log('================================================================================');
console.log('  TIER 5 ADVERSARIAL COVERAGE HARDENING: MATERIALS, INFILL & UI ISOLATION       ');
console.log('================================================================================');

const asyncPromises = [];
function asyncTest(name, fn) {
  const p = test(name, fn);
  if (p && typeof p.then === 'function') {
    asyncPromises.push(p);
  }
  return p;
}

// Helper to seed complete viewer environment for viewerApp and workbenchUiEngine
function setupFullViewerEnvironment(env) {
  const doc = env.document;

  const ensureEl = (id, tag = 'div', className = '') => {
    let el = doc.getElementById(id);
    if (!el) {
      el = doc.createElement(tag);
      el.id = id;
      if (className) el.className = className;
      doc.body.appendChild(el);
      doc.registerElement(el);
    }
    return el;
  };

  const canvasContainer = ensureEl('canvas-container');
  canvasContainer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });

  ensureEl('error-container');
  ensureEl('status-text');
  ensureEl('spinner');
  ensureEl('badge-filename');
  ensureEl('loading-progress-bar');
  ensureEl('section-infill');
  ensureEl('print-est-mass', 'span');
  ensureEl('print-est-length', 'span');
  ensureEl('print-est-spool', 'span');
  ensureEl('infill-val', 'span');
  ensureEl('prop-vol', 'span');
  ensureEl('prop-area', 'span');
  ensureEl('prop-bbox', 'span');
  ensureEl('active-mat-name', 'span');
  ensureEl('active-mat-density', 'span');
  ensureEl('active-mat-weight', 'span');
  ensureEl('mat-list');
  ensureEl('toast-notify');
  ensureEl('inspector-drawer');

  let slider = doc.getElementById('infill-slider');
  if (!slider) {
    slider = doc.createElement('input');
    slider.id = 'infill-slider';
    slider.value = 20;
    doc.body.appendChild(slider);
    doc.registerElement(slider);
  }

  [15, 20, 50, 100].forEach(p => {
    const btn = doc.createElement('button');
    btn.className = 'btn-preset-infill';
    btn.setAttribute('data-infill', String(p));
    if (p === 20) btn.className += ' active';
    doc.body.appendChild(btn);
  });

  // Ensure window handles
  env.window.document = env.document;
  global.document = env.document;
  env.THREE.WebGLRenderer = function () { return env.renderer; };
  env.THREE.OrbitControls = function () {
    this.mouseButtons = {};
    this.target = new env.THREE.Vector3();
    this.update = () => {};
    this.enableDamping = false;
  };
  env.THREE.PMREMGenerator = null;

  return env;
}

// ============================================================================
// SUITE 1: Infill Scaling Extremes, Numerical Boundaries & Fuzzing
// ============================================================================
describe('Suite 1: Infill Scaling Extremes, Numerical Boundaries & Fuzzing', () => {
  test('T5.1.1: Boundary values 0.05 and 1.0 vs percentage scale 5% and 100%', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const clamp = env.window.MaterialsEngine.clampInfill;

    // Numerical analysis:
    // If a user inputs 0.05 (thinking it's 5% in normalized 0..1 range),
    // clampInfill(0.05): Number(0.05) -> Math.round(0.05) = 0 -> Math.max(5, 0) = 5
    assertEqual(clamp(0.05), 5, 'Input 0.05 rounds to 0 and clamps to 5% floor');

    // If a user inputs 1.0 (thinking it's 100% in normalized range),
    // clampInfill(1.0): Number(1.0) -> Math.round(1) = 1 -> Math.max(5, 1) = 5
    assertEqual(clamp(1.0), 5, 'Input 1.0 rounds to 1 and clamps to 5% floor (not 100%)');

    // Nominal percentage inputs
    assertEqual(clamp(5), 5, 'Input 5% returns 5%');
    assertEqual(clamp(100), 100, 'Input 100% returns 100%');
    assertEqual(clamp(50.4), 50, 'Input 50.4% rounds down to 50%');
    assertEqual(clamp(50.6), 51, 'Input 50.6% rounds up to 51%');
  });

  test('T5.1.2: Extreme negative, sub-zero, and micro-positive infill inputs', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const clamp = env.window.MaterialsEngine.clampInfill;

    assertEqual(clamp(-1e9), 5, 'Astronomical negative (-10^9) clamps to 5%');
    assertEqual(clamp(-50), 5, '-50% clamps to 5%');
    assertEqual(clamp(-0.000001), 5, 'Microscopic negative clamps to 5%');
    assertEqual(clamp(-0), 5, '-0 clamps to 5%');
    assertEqual(clamp(0), 5, 'Zero clamps to 5%');
    assertEqual(clamp(Number.MIN_VALUE), 5, 'Number.MIN_VALUE (5e-324) clamps to 5%');
    assertEqual(clamp(4.4999), 5, '4.4999 rounds to 4, clamped to 5%');
    assertEqual(clamp(4.5001), 5, '4.5001 rounds to 5, returns 5%');
  });

  test('T5.1.3: Extreme positive, astronomical, and overflow infill inputs', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const clamp = env.window.MaterialsEngine.clampInfill;

    assertEqual(clamp(100.0001), 100, '100.0001% clamps to 100%');
    assertEqual(clamp(100.5), 100, '100.5% rounds to 101, clamped to 100%');
    assertEqual(clamp(150), 100, '150% clamps to 100%');
    assertEqual(clamp(9999), 100, '9999% clamps to 100%');
    assertEqual(clamp(Number.MAX_SAFE_INTEGER), 100, 'Number.MAX_SAFE_INTEGER clamps to 100%');
    assertEqual(clamp(1e30), 100, '10^30 clamps to 100%');
    assertEqual(clamp(Infinity), 100, '+Infinity clamps to 100%');
    assertEqual(clamp(-Infinity), 5, '-Infinity clamps to 5%');
  });

  test('T5.1.4: Non-numeric, boolean, object, and whitespace string inputs', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const clamp = env.window.MaterialsEngine.clampInfill;

    assertEqual(clamp(true), 5, 'true converts to 1, clamped to 5%');
    assertEqual(clamp(false), 5, 'false converts to 0, clamped to 5%');
    assertEqual(clamp(null), 5, 'null converts to 0, clamped to 5%');
    assertEqual(clamp(undefined), 5, 'undefined converts to NaN, clamped to 5%');
    assertEqual(clamp(NaN), 5, 'NaN clamped to 5%');
    assertEqual(clamp(''), 5, 'Empty string clamped to 5%');
    assertEqual(clamp('   '), 5, 'Whitespace string clamped to 5%');
    assertEqual(clamp('  42  '), 42, 'Padded string "  42  " parsed to 42%');
    assertEqual(clamp('00085'), 85, 'Leading zeros "00085" parsed to 85%');
    assertEqual(clamp('100.00%'), 5, 'String with percent suffix "100.00%" safely clamped to 5%');
    assertEqual(clamp('bad_input'), 5, 'Arbitrary text clamped to 5%');
    assertEqual(clamp([]), 5, 'Empty array clamped to 5%');
    assertEqual(clamp([50]), 50, 'Array [50] converts to 50%');
    assertEqual(clamp([20, 50]), 5, 'Multi-element array clamped to 5%');
    assertEqual(clamp({}), 5, 'Object literal clamped to 5%');
  });

  test('T5.1.5: setInfill() state persistence and DOM synchronization under stress', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    setupFullViewerEnvironment(env);

    const testValues = [-10, 0, 5, 15, 20, 50, 85, 100, 200, NaN, '45'];
    for (const val of testValues) {
      const res = env.window.MaterialsEngine.setInfill(val);
      const clamped = env.window.MaterialsEngine.clampInfill(val);
      assertEqual(res, clamped, `setInfill(${val}) returns expected clamped ${clamped}%`);
      assertEqual(env.window.MaterialsEngine.getInfill(), clamped, `getInfill() matches clamped ${clamped}%`);

      // Verify DOM slider sync
      const slider = env.document.getElementById('infill-slider');
      assertEqual(Number(slider.value), clamped, `DOM slider value synchronized to ${clamped}`);

      // Verify DOM label sync
      const label = env.document.getElementById('infill-val');
      assertEqual(label.innerText, `${clamped}%`, `DOM label synchronized to ${clamped}%`);

      // Verify localStorage sync
      const stored = env.window.localStorage.getItem('stepviewer_infill_percent');
      assertEqual(Number(stored), clamped, `localStorage synchronized to ${clamped}`);
    }
  });
});

// ============================================================================
// SUITE 2: 3D Printing Materials, Physical Properties & Closed-Form Oracles
// ============================================================================
describe('Suite 2: 3D Printing Materials, Physical Properties & Closed-Form Oracles', () => {
  test('T5.2.1: Closed-form oracle for 1.75mm filament length and 1kg spool fraction', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });

    // Mathematical specification:
    // Diameter = 1.75 mm, Radius = 0.875 mm
    // Cross-sectional Area = PI * (1.75 / 2)^2 mm^2 = 2.405281875404688 mm^2
    // Volume per linear meter (1000 mm) = Area * 1000 = 2405.281875404688 mm^3
    const radius = 1.75 / 2.0;
    const expectedAreaMm2 = Math.PI * radius * radius;
    const expectedConstant = expectedAreaMm2 * 1000.0; // mm^3 / m

    const volMm3 = 240528.1875404688; // Exactly 100 meters of 100% solid filament
    const density = 1.24; // PLA (g/cm^3)

    const metrics = env.window.MaterialsEngine.getPrintMetrics(volMm3, density, 100);

    // Filament length should be exactly 100 meters
    assertCloseTo(metrics.filamentLengthMeters, 100.0, 1e-4, '100 meters of filament calculation matches oracle');

    // Mass: Vol = 240.5281875 cm^3 * 1.24 g/cm^3 = 298.25495 g
    const expectedMassG = (volMm3 / 1000.0) * density;
    assertCloseTo(metrics.massGrams, expectedMassG, 1e-4, 'Part mass matches oracle');

    // Spool fraction: massG / 1000 * 100 % = 29.825495%
    const expectedSpool = (expectedMassG / 1000.0) * 100.0;
    assertCloseTo(metrics.spoolFractionPercent, expectedSpool, 1e-4, 'Spool fraction matches oracle');
  });

  test('T5.2.2: Extreme geometric volume boundaries (0, negative, micro, astronomical)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });

    // 1. Zero Volume (0 mm^3)
    const mZero = env.window.MaterialsEngine.getPrintMetrics(0, 1.24, 20);
    assertEqual(mZero.effectiveVolMm3, 0, 'Zero volume produces 0 effective volume');
    assertEqual(mZero.massGrams, 0, 'Zero volume produces 0 mass');
    assertEqual(mZero.filamentLengthMeters, 0, 'Zero volume produces 0 filament length');
    assertEqual(mZero.spoolFractionPercent, 0, 'Zero volume produces 0 spool percent');

    // 2. Negative Volume (-500 mm^3) - must be clamped to 0
    const mNeg = env.window.MaterialsEngine.getPrintMetrics(-500, 1.24, 20);
    assertEqual(mNeg.volumeMm3, 0, 'Negative volume is clamped to 0');
    assertEqual(mNeg.massGrams, 0, 'Negative volume produces 0 mass');
    assertEqual(mNeg.filamentLengthMeters, 0, 'Negative volume produces 0 filament length');

    // 3. Sub-microscopic Volume (1e-9 mm^3) - non-negative, no NaN
    const mMicro = env.window.MaterialsEngine.getPrintMetrics(1e-9, 1.24, 20);
    assertTrue(!isNaN(mMicro.massGrams) && isFinite(mMicro.massGrams), 'Micro volume mass is finite number');
    assertTrue(mMicro.massGrams >= 0, 'Micro volume mass is non-negative');

    // 4. Astronomical Volume (1e15 mm^3 = 1 km^3 block of plastic)
    const mMax = env.window.MaterialsEngine.getPrintMetrics(1e15, 1.24, 100);
    assertTrue(!isNaN(mMax.massGrams) && isFinite(mMax.massGrams), 'Astronomical mass is finite float');
    assertTrue(mMax.massKg > 1e9, 'Astronomical volume produces expected large mass in kg');
  });

  test('T5.2.3: Multi-body selection volume resolution and invalid ID fallback', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    setupFullViewerEnvironment(env);

    // Setup modelBodies and modelPhysicalProps
    env.window.modelPhysicalProps = { volumeMm3: 100000, areaMm2: 5000 };
    env.window.modelBodies = [
      { id: 0, name: 'Body_0', data: { volumeMm3: 30000 } },
      { id: 1, name: 'Body_1', data: { volumeMm3: 70000 } }
    ];

    // Case A: Whole assembly (selectedBodyForProps = -1)
    env.sandbox.selectedBodyForProps = -1;
    const mAll = env.window.MaterialsEngine.getPrintMetrics(undefined, 1.24, 100);
    assertEqual(mAll.volumeMm3, 100000, 'Whole assembly volume resolved to 100,000 mm³');

    // Case B: Specific body selection (selectedBodyForProps = 1)
    env.sandbox.selectedBodyForProps = 1;
    const mB1 = env.window.MaterialsEngine.getPrintMetrics(undefined, 1.24, 100);
    assertEqual(mB1.volumeMm3, 70000, 'Selected body 1 volume resolved to 70,000 mm³');

    // Case C: Non-existent body ID (selectedBodyForProps = 999) - safe fallback
    env.sandbox.selectedBodyForProps = 999;
    const mFallback = env.window.MaterialsEngine.getPrintMetrics(undefined, 1.24, 100);
    assertEqual(mFallback.volumeMm3, 100000, 'Non-existent body ID safely falls back to total model volume');
  });

  test('T5.2.4: Density extremes (0 g/cm³, negative density, missing material fallback)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });

    // Zero density custom material (e.g., phantom preview)
    const mZeroD = env.window.MaterialsEngine.getPrintMetrics(10000, 0, 100);
    assertEqual(mZeroD.massGrams, 0, 'Zero density produces 0 grams');
    assertTrue(mZeroD.filamentLengthMeters > 0, 'Zero density still computes valid non-zero filament length');

    // Negative density
    const mNegD = env.window.MaterialsEngine.getPrintMetrics(10000, -2.5, 100);
    assertEqual(mNegD.density, 0, 'Negative density clamped to 0');
    assertEqual(mNegD.massGrams, 0, 'Negative density produces 0 grams');

    // NaN density
    const mNaND = env.window.MaterialsEngine.getPrintMetrics(10000, NaN, 100);
    assertEqual(mNaND.density, 0, 'NaN density clamped to 0');
    assertEqual(mNaND.massGrams, 0, 'NaN density produces 0 grams without throwing');
  });

  test('T5.2.5: SI (mm) vs Imperial (in) units display and mass invariance', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    setupFullViewerEnvironment(env);

    env.window.modelPhysicalProps = { volumeMm3: 1000000, areaMm2: 60000, bbox: { x: 100, y: 100, z: 100 } };
    env.sandbox.modelPhysicalProps = env.window.modelPhysicalProps;
    env.window.activeCadFormat = 'STL';

    // 1. SI Units (mm)
    env.sandbox.currentUnit = 'mm';
    env.window.updatePhysicalPropertiesCard();

    const volEl = env.document.getElementById('prop-vol');
    const areaEl = env.document.getElementById('prop-area');
    assertTrue(volEl.innerText.includes('cm³') && volEl.innerText.includes('mm³'), 'SI volume displays cm³ and mm³');
    assertTrue(areaEl.innerText.includes('cm²') && areaEl.innerText.includes('mm²'), 'SI area displays cm² and mm²');

    const totalMassSI = env.window.MaterialsEngine.getTotalMassKg();

    // 2. Imperial Units (in)
    env.sandbox.currentUnit = 'in';
    env.window.updatePhysicalPropertiesCard();

    assertTrue(volEl.innerText.includes('in³'), 'Imperial volume displays in³');
    assertTrue(areaEl.innerText.includes('in²'), 'Imperial area displays in²');

    const totalMassImp = env.window.MaterialsEngine.getTotalMassKg();

    // Fundamental Physical Invariant: getTotalMassKg() is strictly in kg regardless of display unit
    assertEqual(totalMassSI, totalMassImp, 'getTotalMassKg() is invariant to UI display unit switching');
  });
});

// ============================================================================
// SUITE 3: Exploded View Tool State, Keydown Spamming & Listener Leak Immunity
// ============================================================================
describe('Suite 3: Exploded View Tool State, Keydown Spamming & Listener Leak Immunity', () => {
  test('T5.3.1: Strict disabled state enforcement on single-body STL', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    setupFullViewerEnvironment(env);
    env.window.WorkbenchUI.init();

    const btn = env.document.getElementById('btn-explode');
    assertTrue(btn !== null, '#btn-explode exists');

    // Single-body STL (format = 'STL', count = 1)
    env.window.WorkbenchUI.updateExplodeToolState('STL', 1);

    assertTrue(btn.disabled === true, 'btn.disabled is true for single-body STL');
    assertEqual(btn.getAttribute('disabled'), 'true', 'disabled attribute is set to "true"');
    assertTrue(btn.classList.contains('disabled'), 'btn has class "disabled"');
    assertEqual(btn.style.pointerEvents, 'none', 'pointer-events is "none"');
    assertEqual(btn.style.opacity, '0.4', 'opacity is 0.4');
    assertEqual(btn.title, 'Exploded view requires a multi-body assembly', 'Accurate tooltip is set');
  });

  test('T5.3.2: Enabled state enforcement on multi-body STL (count >= 2)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    setupFullViewerEnvironment(env);
    env.window.WorkbenchUI.init();

    const btn = env.document.getElementById('btn-explode');

    // Multi-body STL (format = 'STL', count = 3)
    env.window.WorkbenchUI.updateExplodeToolState('STL', 3);

    assertTrue(btn.disabled === false, 'btn.disabled is false for multi-body STL');
    assertEqual(btn.getAttribute('disabled'), null, 'disabled attribute is removed');
    assertTrue(!btn.classList.contains('disabled'), 'btn class "disabled" is removed');
    assertEqual(btn.style.pointerEvents, 'auto', 'pointer-events is "auto"');
    assertEqual(btn.style.opacity, '1', 'opacity is 1.0');
    assertEqual(btn.title, 'Exploded Assembly View [X]', 'Active exploded view tooltip is set');
  });

  test('T5.3.3: Permitted state on single-body STEP / IGES / BREP', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    setupFullViewerEnvironment(env);
    env.window.WorkbenchUI.init();

    const btn = env.document.getElementById('btn-explode');

    // Single-body STEP (format = 'STEP', count = 1)
    env.window.WorkbenchUI.updateExplodeToolState('STEP', 1);

    assertTrue(btn.disabled === false, 'btn.disabled is false for single-body STEP');
    assertEqual(btn.style.pointerEvents, 'auto', 'pointer-events is "auto"');
    assertEqual(btn.title, 'Exploded View (Requires Assembly with 2+ parts)', 'Accurate STEP tooltip');
  });

  test('T5.3.4: 100 rapid keydown spamming events ("x" and "X") on single-body STL', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    setupFullViewerEnvironment(env);
    env.window.WorkbenchUI.init();

    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [{ id: 1, name: 'Single_Mesh' }];
    env.window.WorkbenchUI.updateExplodeToolState('STL', 1);

    let toastCount = 0;
    env.window.showToast = (msg) => {
      if (msg.includes('multiple parts')) toastCount++;
    };

    // Spam 100 alternating 'x' and 'X' keydowns
    for (let i = 0; i < 100; i++) {
      let prevented = false;
      let stopped = false;
      const keyChar = (i % 2 === 0) ? 'x' : 'X';

      const evt = {
        type: 'keydown',
        key: keyChar,
        target: { tagName: 'DIV' },
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: () => { prevented = true; },
        stopPropagation: () => { stopped = true; },
        stopImmediatePropagation: () => { stopped = true; }
      };

      env.window.dispatchEvent(evt);
      assertTrue(prevented, `Event ${i} ('${keyChar}') preventDefault called`);
      assertTrue(stopped, `Event ${i} ('${keyChar}') stopPropagation called`);
    }

    assertEqual(toastCount, 100, 'All 100 keydown spam events triggered warning toast');
  });

  test('T5.3.5: Modifier key bypass (Ctrl+X, Alt+X, Meta+X) and text input isolation', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    setupFullViewerEnvironment(env);
    env.window.WorkbenchUI.init();

    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [{ id: 1, name: 'Single_Mesh' }];

    let intercepted = false;
    const testEvt = (overrides) => {
      intercepted = false;
      const evt = Object.assign({
        type: 'keydown',
        key: 'x',
        target: { tagName: 'DIV' },
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: () => { intercepted = true; },
        stopPropagation: () => { intercepted = true; }
      }, overrides);
      env.window.dispatchEvent(evt);
      return intercepted;
    };

    // 1. Modifier keys must NOT be intercepted
    assertTrue(!testEvt({ ctrlKey: true }), 'Ctrl+X is never intercepted');
    assertTrue(!testEvt({ altKey: true }), 'Alt+X is never intercepted');
    assertTrue(!testEvt({ metaKey: true }), 'Meta+X is never intercepted');

    // 2. Typing inside INPUT or TEXTAREA must NOT be intercepted
    assertTrue(!testEvt({ target: { tagName: 'INPUT' } }), 'Typing "x" inside <input> is not intercepted');
    assertTrue(!testEvt({ target: { tagName: 'TEXTAREA' } }), 'Typing "x" inside <textarea> is not intercepted');
  });

  test('T5.3.6: Direct programmatic toggleExplode() guard on single-body STL', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    setupFullViewerEnvironment(env);

    // Mock existing toggleExplode implementation
    let originalToggleCalled = false;
    env.window.toggleExplode = function () {
      originalToggleCalled = true;
    };

    env.window.WorkbenchUI.init();

    // Set single-body STL state
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [{ id: 1, name: 'Single_Mesh' }];
    env.window.WorkbenchUI.updateExplodeToolState('STL', 1);

    let toastShown = false;
    env.window.showToast = (msg) => {
      if (msg.includes('multiple parts')) toastShown = true;
    };

    // Direct invocation
    originalToggleCalled = false;
    env.window.toggleExplode();

    assertTrue(!originalToggleCalled, 'Original toggleExplode() was not executed');
    assertTrue(toastShown, 'Toast warning triggered on programmatic toggleExplode()');

    // Now switch to multi-body assembly
    env.window.modelBodies = [{ id: 1 }, { id: 2 }];
    env.window.WorkbenchUI.updateExplodeToolState('STL', 2);

    originalToggleCalled = false;
    env.window.toggleExplode();
    assertTrue(originalToggleCalled, 'Original toggleExplode() allowed on multi-body assembly');
  });

  test('T5.3.7: Event listener leak immunity & lifecycle hook idempotence (50 iterations)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    setupFullViewerEnvironment(env);

    // Provide base function to be hooked
    env.window.toggleExplode = function () {};

    // Stress test: call setupExplodeKeyboardGuard and hookExplodeLifecycle 50 times
    for (let i = 0; i < 50; i++) {
      env.window.WorkbenchUI.setupExplodeKeyboardGuard();
      env.window.WorkbenchUI.hookExplodeLifecycle();
    }

    // Verify keydown listeners array on window has not accumulated duplicates
    const keydownListeners = env.window._listeners ? env.window._listeners['keydown'] || [] : [];
    const captureListeners = keydownListeners.filter(fn => typeof fn === 'function');
    assertEqual(captureListeners.length, 1, 'Only 1 active keyboard guard listener remains after 50 setups');

    // Verify toggleExplode wrapping depth is strictly 1 (no recursive wrap explosion)
    assertTrue(env.window.toggleExplode._isExplodeHooked === true, 'toggleExplode is marked as hooked');
  });
});

// ============================================================================
// SUITE 4: OpenCASCADE WASM Worker Bypass (initWorker) Strict Verification
// ============================================================================
describe('Suite 4: OpenCASCADE WASM Worker Bypass (initWorker) Strict Verification', () => {
  asyncTest('T5.4.1: Binary STL model load NEVER instantiates OpenCASCADE Worker', async () => {
    const env = createCadEnvironment({ loadCadState: true, loadStlLoader: true, loadFeatureDetector: true });
    setupFullViewerEnvironment(env);

    let workerInstantiations = 0;
    const MockWorker = function (script) {
      workerInstantiations++;
      this.script = script;
      this.postMessage = () => {};
      this.terminate = () => {};
    };
    env.window.Worker = MockWorker;
    env.sandbox.Worker = MockWorker;
    global.Worker = MockWorker;

    env.loadScript('Assets/js/viewerApp.js');

    const cube = generateCube({ size: 25, format: 'binary' });
    await env.window.startTessellation(cube.arrayBuffer, 'cube_binary.stl');

    assertEqual(workerInstantiations, 0, 'Worker instantiations strictly 0 when loading Binary STL');
    assertEqual(env.window.activeCadFormat, 'STL', 'activeCadFormat correctly set to STL');
    assertTrue(env.window.modelGroup.children.length > 0, 'Model group populated with parsed STL mesh');
  });

  asyncTest('T5.4.2: ASCII STL model load NEVER instantiates OpenCASCADE Worker', async () => {
    const env = createCadEnvironment({ loadCadState: true, loadStlLoader: true, loadFeatureDetector: true });
    setupFullViewerEnvironment(env);

    let workerInstantiations = 0;
    const MockWorker = function (script) {
      workerInstantiations++;
      this.postMessage = () => {};
      this.terminate = () => {};
    };
    env.window.Worker = MockWorker;
    env.sandbox.Worker = MockWorker;
    global.Worker = MockWorker;

    env.loadScript('Assets/js/viewerApp.js');

    const cube = generateCube({ size: 15, format: 'ascii' });
    await env.window.startTessellation(cube.arrayBuffer, 'cube_ascii.stl');

    assertEqual(workerInstantiations, 0, 'Worker instantiations strictly 0 when loading ASCII STL');
    assertEqual(env.window.activeCadFormat, 'STL', 'activeCadFormat correctly set to STL');
    assertTrue(env.window.modelGroup.children.length > 0, 'Model group populated with parsed ASCII STL mesh');
  });

  asyncTest('T5.4.3: Corrupted / Malformed STL fails in pure JS without touching Worker', async () => {
    const env = createCadEnvironment({ loadCadState: true, loadStlLoader: true, loadFeatureDetector: true });
    setupFullViewerEnvironment(env);

    let workerInstantiations = 0;
    const MockWorker = function () {
      workerInstantiations++;
      this.postMessage = () => {};
      this.terminate = () => {};
    };
    env.window.Worker = MockWorker;
    env.sandbox.Worker = MockWorker;
    global.Worker = MockWorker;

    env.loadScript('Assets/js/viewerApp.js');

    // Corrupted buffer (too short for binary STL, not ASCII solid)
    const corruptBuffer = new ArrayBuffer(50);
    await env.window.startTessellation(corruptBuffer, 'corrupted_model.stl');

    assertEqual(workerInstantiations, 0, 'Worker was NOT instantiated on corrupted STL file');
    const stEl = env.document.getElementById('status-text');
    assertEqual(stEl.innerText, 'STL Parse Error', 'Status text displayed STL Parse Error');
  });

  asyncTest('T5.4.4: STEP model load DOES trigger OpenCASCADE Worker lazy initialization', async () => {
    const env = createCadEnvironment({ loadCadState: true, loadStlLoader: true, loadFeatureDetector: true });
    setupFullViewerEnvironment(env);

    let workerInstantiations = 0;
    let workerScript = '';
    const MockWorker = function (script) {
      workerInstantiations++;
      workerScript = script;
      this.postMessage = () => {};
      this.terminate = () => {};
    };
    env.window.Worker = MockWorker;
    env.sandbox.Worker = MockWorker;
    global.Worker = MockWorker;

    env.loadScript('Assets/js/viewerApp.js');

    const fakeStepBuffer = new ArrayBuffer(256);
    await env.window.startTessellation(fakeStepBuffer, 'bracket.step');

    assertEqual(workerInstantiations, 1, 'Worker was lazily instantiated for STEP model');
    assertEqual(workerScript, 'stepWorker.js', 'Worker targeted stepWorker.js');
    assertEqual(env.window.activeCadFormat, 'STEP', 'activeCadFormat set to STEP');
  });
});

// ============================================================================
// SUITE 5: Cross-Feature Pipeline Switching & Concurrency Race Resistance
// ============================================================================
describe('Suite 5: Cross-Feature Pipeline Switching & Concurrency Race Resistance', () => {
  asyncTest('T5.5.1: Seamless format switching: STL -> STEP -> STL sequence', async () => {
    const env = createCadEnvironment({ loadCadState: true, loadStlLoader: true, loadFeatureDetector: true });
    setupFullViewerEnvironment(env);

    let workerInstantiations = 0;
    const MockWorker = function () {
      workerInstantiations++;
      this.postMessage = () => {};
      this.terminate = () => {};
    };
    env.window.Worker = MockWorker;
    env.sandbox.Worker = MockWorker;
    global.Worker = MockWorker;

    env.loadScript('Assets/js/viewerApp.js');

    const cube = generateCube({ size: 10, format: 'binary' });

    // Step 1: Load STL
    await env.window.startTessellation(cube.arrayBuffer, 'part1.stl');
    assertEqual(env.window.activeCadFormat, 'STL', 'Format 1 is STL');
    assertEqual(workerInstantiations, 0, 'No worker created for STL');

    // Step 2: Load STEP
    await env.window.startTessellation(new ArrayBuffer(128), 'assembly.step');
    assertEqual(env.window.activeCadFormat, 'STEP', 'Format 2 is STEP');
    assertEqual(workerInstantiations, 1, 'Worker initialized for STEP');

    // Step 3: Load STL again
    await env.window.startTessellation(cube.arrayBuffer, 'part2.stl');
    assertEqual(env.window.activeCadFormat, 'STL', 'Format 3 is back to STL');
    assertEqual(workerInstantiations, 1, 'Worker count did not increase (bypassed for STL)');
  });

  asyncTest('T5.5.2: Concurrency race condition: late-arriving WASM message dropped when in STL mode', async () => {
    const env = createCadEnvironment({ loadCadState: true, loadStlLoader: true, loadFeatureDetector: true });
    setupFullViewerEnvironment(env);

    let workerInstance = null;
    const MockWorker = function () {
      this.postMessage = () => {};
      this.terminate = () => {};
      workerInstance = this;
    };
    env.window.Worker = MockWorker;
    env.sandbox.Worker = MockWorker;
    global.Worker = MockWorker;

    env.loadScript('Assets/js/viewerApp.js');

    // 1. Start loading STEP (loadId = 1)
    await env.window.startTessellation(new ArrayBuffer(128), 'slow_occt_model.step');
    const stepLoadId = env.window._getActiveLoadId ? env.window._getActiveLoadId() : 1;

    // 2. Immediately switch to STL before worker finishes (loadId = 2)
    const cube = generateCube({ size: 10, format: 'binary' });
    await env.window.startTessellation(cube.arrayBuffer, 'instant_model.stl');
    assertEqual(env.window.activeCadFormat, 'STL', 'activeCadFormat is now STL');

    // Save STL model group state
    const stlMeshCount = env.window.modelGroup.children.length;
    assertTrue(stlMeshCount > 0, 'STL mesh loaded');

    // 3. Late-arriving worker message arrives from stepWorker
    if (workerInstance && typeof workerInstance.onmessage === 'function') {
      const lateMessage = {
        data: {
          type: 'PARSE_SUCCESS',
          loadId: stepLoadId,
          meshes: [{ name: 'Late_STEP_Mesh', position: new Float32Array(9) }],
          elapsedMs: 2500
        }
      };

      // Dispatch late message
      workerInstance.onmessage(lateMessage);

      // Verify that STL state was NOT overwritten by late STEP worker message
      assertEqual(env.window.activeCadFormat, 'STL', 'activeCadFormat remains STL');
      assertEqual(env.window.modelGroup.children.length, stlMeshCount, 'STL modelGroup children not clobbered');
    }
  });

  test('T5.5.3: Total mass calculation format isolation across pipeline transitions', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    setupFullViewerEnvironment(env);

    env.window.modelPhysicalProps = { volumeMm3: 1000000 }; // 1000 cm^3
    env.sandbox.modelPhysicalProps = env.window.modelPhysicalProps;

    // Set 20% infill with PLA (1.24 g/cm^3)
    env.window.MaterialsEngine.setInfill(20);
    env.window.MaterialsEngine.selectMaterial('pla');

    // State A: STL format -> mass = 1000 cm^3 * 0.20 * 1.24 g/cm^3 = 248 g = 0.248 kg
    env.window.activeCadFormat = 'STL';
    const stlMassKg = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(stlMassKg, 0.248, 1e-4, 'STL mass reflects 20% infill factor');

    // State B: Switch to STEP format -> mass = 1000 cm^3 * 1.00 * 1.24 g/cm^3 = 1240 g = 1.240 kg
    env.window.activeCadFormat = 'STEP';
    const stepMassKg = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(stepMassKg, 1.240, 1e-4, 'STEP mass evaluates at 100% solid density despite infill slider at 20%');

    // State C: Switch to IGES format -> mass = 1.240 kg
    env.window.activeCadFormat = 'IGES';
    const igesMassKg = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(igesMassKg, 1.240, 1e-4, 'IGES mass evaluates at 100% solid density');

    // State D: Switch to BREP format -> mass = 1.240 kg
    env.window.activeCadFormat = 'BREP';
    const brepMassKg = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(brepMassKg, 1.240, 1e-4, 'BREP mass evaluates at 100% solid density');

    // State E: Switch back to STL -> mass = 0.248 kg
    env.window.activeCadFormat = 'STL';
    const stlMassBack = env.window.MaterialsEngine.getTotalMassKg();
    assertEqual(stlMassBack, stlMassKg, 'STL mass returns to 20% infill value');
  });
});

// Run reporting and exit
(async () => {
  if (asyncPromises.length > 0) {
    await Promise.all(asyncPromises);
  }
  const summary = reportSummary();
  exitProcess(summary.failed === 0 ? 0 : 1);
})();
