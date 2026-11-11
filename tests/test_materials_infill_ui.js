/**
 * Automated Test Suite: 3D Printing Materials, Infill & UI Adaptations (Milestone 4)
 * File: tests/test_materials_infill_ui.js
 *
 * Verifies:
 * - Feature 18: Standard 3D printing filaments (PLA, PETG, ABS, TPU, Resin) & preservation of engineering alloys
 * - Feature 19: Infill percentage calculation (5%-100%), clamping, analytical accuracy of print metrics
 * - Feature 20: Exploded view tool disabling, tooltip, styling, and shortcut 'X' interception for single-body STL
 * - Feature 21: Blueprint SVG title block infill-adjusted mass & 3D section stencil clipping on STL
 * - Layout compliance in Assets/viewer.html & Assets/js/workbenchUiEngine.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

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

const { generateCube } = require('./stl_test_fixtures.js');

console.log('================================================================================');
console.log('  MILESTONE 4: 3D PRINTING MATERIALS, INFILL & UI ADAPTATIONS TEST SUITE        ');
console.log('================================================================================');

// Helper to seed infill elements in mock environment
function seedInfillElements(env) {
  const doc = env.document;
  
  // Create #section-infill container
  let sec = doc.getElementById('section-infill');
  if (!sec) {
    sec = doc.createElement('div');
    sec.id = 'section-infill';
    doc.body.appendChild(sec);
    doc.registerElement(sec);
  }

  // Create #infill-val label
  let valLabel = doc.getElementById('infill-val');
  if (!valLabel) {
    valLabel = doc.createElement('span');
    valLabel.id = 'infill-val';
    valLabel.innerText = '20%';
    sec.appendChild(valLabel);
    doc.registerElement(valLabel);
  }

  // Create preset buttons
  [15, 20, 50, 100].forEach(p => {
    const btn = doc.createElement('button');
    btn.className = 'btn-preset-infill';
    btn.setAttribute('data-infill', String(p));
    if (p === 20) btn.className += ' active';
    sec.appendChild(btn);
  });

  return { sec, valLabel };
}

// ============================================================================
// SUITE 1: 3D Printing Materials Library & Preserved Engineering Alloys
// ============================================================================
describe('Suite 1: 3D Printing Materials Library & Preserved Engineering Alloys', () => {
  test('T4.1.1: 5 Standard 3D printing filaments present with accurate densities', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const mats = env.window.MaterialsEngine.getAllMaterials();
    assertTrue(Array.isArray(mats) && mats.length >= 25, 'Materials library contains >= 25 materials');

    const pla = mats.find(m => m.id === 'pla');
    const petg = mats.find(m => m.id === 'petg');
    const abs = mats.find(m => m.id === 'abs');
    const tpu = mats.find(m => m.id === 'tpu');
    const resin = mats.find(m => m.id === 'resin');

    assertTrue(pla !== undefined, 'PLA material exists');
    assertEqual(pla.density, 1.24, 'PLA density is 1.24 g/cm³');

    assertTrue(petg !== undefined, 'PETG material exists');
    assertEqual(petg.density, 1.27, 'PETG density is 1.27 g/cm³');

    assertTrue(abs !== undefined, 'ABS material exists');
    assertEqual(abs.density, 1.04, 'ABS density is 1.04 g/cm³');

    assertTrue(tpu !== undefined, 'TPU material exists');
    assertEqual(tpu.density, 1.21, 'TPU density is 1.21 g/cm³');

    assertTrue(resin !== undefined, 'Photopolymer Resin material exists');
    assertEqual(resin.density, 1.15, 'Resin density is 1.15 g/cm³');
  });

  test('T4.1.2: Preservation of engineering steels, aluminum, titanium, copper, and polymers', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const mats = env.window.MaterialsEngine.getAllMaterials();

    // Verify Steels
    const steel1018 = mats.find(m => m.id === 'steel_1018');
    assertTrue(steel1018 !== undefined, 'Steel 1018 preserved');
    assertEqual(steel1018.density, 7.85, 'Steel 1018 density 7.85 g/cm³');

    const ss304 = mats.find(m => m.id === 'ss_304');
    assertTrue(ss304 !== undefined, 'Stainless 304 preserved');
    assertEqual(ss304.density, 8.00, 'SS 304 density 8.00 g/cm³');

    // Verify Aluminum & Light Alloys
    const al6061 = mats.find(m => m.id === 'al_6061');
    assertTrue(al6061 !== undefined, 'Aluminum 6061 preserved');
    assertEqual(al6061.density, 2.70, 'Al 6061 density 2.70 g/cm³');

    const tiGr5 = mats.find(m => m.id === 'ti_gr5');
    assertTrue(tiGr5 !== undefined, 'Titanium Grade 5 preserved');
    assertEqual(tiGr5.density, 4.43, 'Ti Gr5 density 4.43 g/cm³');

    // Verify Copper & Brass
    const cuPure = mats.find(m => m.id === 'cu_c11000');
    assertTrue(cuPure !== undefined, 'Pure Copper C11000 preserved');
    assertEqual(cuPure.density, 8.96, 'Copper density 8.96 g/cm³');

    const brass = mats.find(m => m.id === 'brass_c360');
    assertTrue(brass !== undefined, 'Brass C360 preserved');
    assertEqual(brass.density, 8.50, 'Brass density 8.50 g/cm³');

    // Verify Engineering Polymers
    const delrin = mats.find(m => m.id === 'pom_delrin');
    assertTrue(delrin !== undefined, 'Delrin / POM preserved');
    assertEqual(delrin.density, 1.41, 'Delrin density 1.41 g/cm³');

    const peek = mats.find(m => m.id === 'peek');
    assertTrue(peek !== undefined, 'PEEK preserved');
    assertEqual(peek.density, 1.30, 'PEEK density 1.30 g/cm³');
  });
});

// ============================================================================
// SUITE 2: Infill Clamping, State Management & Public API Contracts
// ============================================================================
describe('Suite 2: Infill Clamping, State Management & Public API Contracts', () => {
  test('T4.2.1: Default infill state is 20% and getInfill() contract', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    assertEqual(env.window.MaterialsEngine.getInfill(), 20, 'Default infill is 20%');
  });

  test('T4.2.2: setInfill() updates state, localStorage, and returns clamped value', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    seedInfillElements(env);

    const val50 = env.window.MaterialsEngine.setInfill(50);
    assertEqual(val50, 50, 'setInfill(50) returns 50');
    assertEqual(env.window.MaterialsEngine.getInfill(), 50, 'getInfill() returns 50');
    assertEqual(env.window.localStorage.getItem('stepviewer_infill_percent'), '50', 'Persisted to localStorage');

    const slider = env.document.getElementById('infill-slider');
    assertEqual(slider.value, 50, 'Slider value synced to 50');
    const label = env.document.getElementById('infill-val');
    assertEqual(label.innerText, '50%', 'Value label synced to 50%');
  });

  test('T4.2.3: Infill clamping boundaries: min 5%, max 100%, negative & NaN handling', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const clamp = env.window.MaterialsEngine.clampInfill || env.window.clampInfill;
    assertTrue(typeof clamp === 'function', 'clampInfill function is exported');

    assertEqual(clamp(2), 5, '2% clamped to 5% minimum');
    assertEqual(clamp(0), 5, '0% clamped to 5% minimum');
    assertEqual(clamp(-25), 5, 'Negative value clamped to 5%');
    assertEqual(clamp(150), 100, '150% clamped to 100% maximum');
    assertEqual(clamp('invalid'), 5, 'NaN input clamped to 5%');
    assertEqual(clamp(NaN), 5, 'NaN clamped to 5%');
    assertEqual(clamp(null), 5, 'null input clamped to 5%');
    assertEqual(clamp(undefined), 5, 'undefined input clamped to 5%');

    // setInfill boundary checks
    assertEqual(env.window.MaterialsEngine.setInfill(1), 5, 'setInfill(1) clamped to 5');
    assertEqual(env.window.MaterialsEngine.setInfill(250), 100, 'setInfill(250) clamped to 100');
  });
});

// ============================================================================
// SUITE 3: Analytical Accuracy of Print Metrics Across Presets
// ============================================================================
describe('Suite 3: Analytical Accuracy of Print Metrics Across Presets', () => {
  const cubeVolMm3 = 8000; // 20x20x20 mm cube = 8.00 cm³

  test('T4.3.1: 100% Solid Infill analytical accuracy with PLA (1.24 g/cm³)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const metrics = env.window.MaterialsEngine.getPrintMetrics(cubeVolMm3, 1.24, 100);

    assertEqual(metrics.infillPercent, 100, 'Infill is 100%');
    assertEqual(metrics.effectiveVolMm3, 8000, 'Effective volume is 8000 mm³');
    assertCloseTo(metrics.effectiveVolCm3, 8.00, 1e-5, 'Effective volume is 8.00 cm³');
    assertCloseTo(metrics.massGrams, 9.92, 1e-4, 'Mass is 8 * 1.24 = 9.92 g');
    assertCloseTo(metrics.massKg, 0.00992, 1e-5, 'Mass is 0.00992 kg');

    // 1.75mm filament length: V / 2405.281875
    const expectedLen = 8000 / 2405.281875;
    assertCloseTo(metrics.filamentLengthMeters, expectedLen, 1e-4, 'Filament length ~3.326 m');

    // 1kg Spool usage: 9.92g / 1000g * 100 = 0.992%
    assertCloseTo(metrics.spoolFractionPercent, 0.992, 1e-4, 'Spool fraction is 0.992%');
  });

  test('T4.3.2: 50% Infill analytical accuracy with PLA (1.24 g/cm³)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const metrics = env.window.MaterialsEngine.getPrintMetrics(cubeVolMm3, 1.24, 50);

    assertEqual(metrics.infillPercent, 50, 'Infill is 50%');
    assertEqual(metrics.effectiveVolMm3, 4000, 'Effective volume is 4000 mm³');
    assertCloseTo(metrics.effectiveVolCm3, 4.00, 1e-5, 'Effective volume is 4.00 cm³');
    assertCloseTo(metrics.massGrams, 4.96, 1e-4, 'Mass is 4 * 1.24 = 4.96 g');
    assertCloseTo(metrics.massKg, 0.00496, 1e-5, 'Mass is 0.00496 kg');

    const expectedLen = 4000 / 2405.281875;
    assertCloseTo(metrics.filamentLengthMeters, expectedLen, 1e-4, 'Filament length ~1.663 m');
    assertCloseTo(metrics.spoolFractionPercent, 0.496, 1e-4, 'Spool fraction is 0.496%');
  });

  test('T4.3.3: 20% Preset Infill analytical accuracy with PETG (1.27 g/cm³)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const metrics = env.window.MaterialsEngine.getPrintMetrics(cubeVolMm3, 1.27, 20);

    assertEqual(metrics.infillPercent, 20, 'Infill is 20%');
    assertEqual(metrics.effectiveVolMm3, 1600, 'Effective volume is 1600 mm³');
    assertCloseTo(metrics.effectiveVolCm3, 1.60, 1e-5, 'Effective volume is 1.60 cm³');
    assertCloseTo(metrics.massGrams, 2.032, 1e-4, 'Mass is 1.6 * 1.27 = 2.032 g');
    assertCloseTo(metrics.massKg, 0.002032, 1e-5, 'Mass is 0.002032 kg');

    const expectedLen = 1600 / 2405.281875;
    assertCloseTo(metrics.filamentLengthMeters, expectedLen, 1e-4, 'Filament length ~0.665 m');
    assertCloseTo(metrics.spoolFractionPercent, 0.2032, 1e-4, 'Spool fraction is 0.2032%');
  });

  test('T4.3.4: 15% Preset Infill analytical accuracy with ABS (1.04 g/cm³)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const metrics = env.window.MaterialsEngine.getPrintMetrics(cubeVolMm3, 1.04, 15);

    assertEqual(metrics.infillPercent, 15, 'Infill is 15%');
    assertEqual(metrics.effectiveVolMm3, 1200, 'Effective volume is 1200 mm³');
    assertCloseTo(metrics.effectiveVolCm3, 1.20, 1e-5, 'Effective volume is 1.20 cm³');
    assertCloseTo(metrics.massGrams, 1.248, 1e-4, 'Mass is 1.2 * 1.04 = 1.248 g');
    assertCloseTo(metrics.massKg, 0.001248, 1e-5, 'Mass is 0.001248 kg');

    const expectedLen = 1200 / 2405.281875;
    assertCloseTo(metrics.filamentLengthMeters, expectedLen, 1e-4, 'Filament length ~0.499 m');
    assertCloseTo(metrics.spoolFractionPercent, 0.1248, 1e-4, 'Spool fraction is 0.1248%');
  });

  test('T4.3.5: TPU (1.21 g/cm³) and Resin (1.15 g/cm³) print metrics', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    
    // TPU at 20%
    const tpuMetrics = env.window.MaterialsEngine.getPrintMetrics(cubeVolMm3, 1.21, 20);
    assertCloseTo(tpuMetrics.massGrams, 1.936, 1e-4, 'TPU 20% mass = 1.6 * 1.21 = 1.936 g');

    // Resin at 100%
    const resinMetrics = env.window.MaterialsEngine.getPrintMetrics(cubeVolMm3, 1.15, 100);
    assertCloseTo(resinMetrics.massGrams, 9.20, 1e-4, 'Resin 100% mass = 8 * 1.15 = 9.20 g');
  });

  test('T4.3.6: Zero-volume and negative edge cases produce 0 without NaN or Infinity', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const zeroMetrics = env.window.MaterialsEngine.getPrintMetrics(0, 1.24, 20);

    assertEqual(zeroMetrics.effectiveVolMm3, 0, 'Zero effective volume mm³');
    assertEqual(zeroMetrics.effectiveVolCm3, 0, 'Zero effective volume cm³');
    assertEqual(zeroMetrics.massGrams, 0, 'Zero mass grams');
    assertEqual(zeroMetrics.massKg, 0, 'Zero mass kg');
    assertEqual(zeroMetrics.filamentLengthMeters, 0, 'Zero filament length');
    assertEqual(zeroMetrics.spoolFractionPercent, 0, 'Zero spool fraction');
    assertTrue(!isNaN(zeroMetrics.filamentLengthMeters), 'No NaN in filament length');
    assertTrue(isFinite(zeroMetrics.filamentLengthMeters), 'No Infinity in filament length');

    // Negative volume handled cleanly
    const negMetrics = env.window.MaterialsEngine.getPrintMetrics(-500, 1.24, 20);
    assertEqual(negMetrics.massGrams, 0, 'Negative volume produces 0 mass');
  });
});

// ============================================================================
// SUITE 4: Format-Aware Mass Estimation (getTotalMassKg)
// ============================================================================
describe('Suite 4: Format-Aware Mass Estimation (getTotalMassKg)', () => {
  const cubeVolMm3 = 8000;

  test('T4.4.1: STL format uses infill percentage to calculate getTotalMassKg()', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelPhysicalProps = { volumeMm3: cubeVolMm3, areaMm2: 2400, bbox: { x: 20, y: 20, z: 20 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    env.window.MaterialsEngine.selectMaterial('pla'); // 1.24 g/cm³

    // Default infill: 20% -> 8 cm³ * 0.20 * 1.24 = 1.984 g = 0.001984 kg
    env.window.MaterialsEngine.setInfill(20);
    const massKg20 = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massKg20, 0.001984, 1e-6, 'STL total mass at 20% is 0.001984 kg');

    // Change infill to 50% -> 8 * 0.50 * 1.24 = 4.96 g = 0.00496 kg
    env.window.MaterialsEngine.setInfill(50);
    const massKg50 = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massKg50, 0.00496, 1e-6, 'STL total mass at 50% is 0.00496 kg');

    // Change infill to 100% -> 8 * 1.0 * 1.24 = 9.92 g = 0.00992 kg
    env.window.MaterialsEngine.setInfill(100);
    const massKg100 = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massKg100, 0.00992, 1e-6, 'STL total mass at 100% is 0.00992 kg');
  });

  test('T4.4.2: STEP format evaluates at 100% solid density regardless of infill slider', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.context.activeCadFormat = 'STEP';
    env.window.activeCadFormat = 'STEP';
    env.context.modelPhysicalProps = { volumeMm3: cubeVolMm3, areaMm2: 2400, bbox: { x: 20, y: 20, z: 20 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    env.window.MaterialsEngine.selectMaterial('al_6061'); // 2.70 g/cm³

    // Infill slider moved to 20%, but STEP must remain 100% solid: 8 * 2.70 = 21.6 g = 0.0216 kg
    env.window.MaterialsEngine.setInfill(20);
    const massKg = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massKg, 0.0216, 1e-5, 'STEP total mass remains solid 0.0216 kg regardless of slider');
  });
});

// ============================================================================
// SUITE 5: DOM UI Updates & Contextual Visibility
// ============================================================================
describe('Suite 5: DOM UI Updates & Contextual Visibility', () => {
  test('T4.5.1: updatePhysicalPropertiesCard() updates print metrics and infill display in DOM', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    seedInfillElements(env);

    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelPhysicalProps = { volumeMm3: 8000, areaMm2: 2400, bbox: { x: 20, y: 20, z: 20 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    env.window.MaterialsEngine.selectMaterial('pla');
    env.window.MaterialsEngine.setInfill(20);

    const massEl = env.document.getElementById('print-est-mass');
    const lengthEl = env.document.getElementById('print-est-length');
    const spoolEl = env.document.getElementById('print-est-spool');

    assertTrue(massEl.innerText.includes('2.0 g'), 'Mass element displays ~2.0 g');
    assertTrue(lengthEl.innerText.includes('0.67 m'), 'Length element displays ~0.67 m');
    assertTrue(spoolEl.innerText.includes('0.2% of 1kg'), 'Spool element displays 0.2% of 1kg');
  });

  test('T4.5.2: Contextual visibility: #section-infill displays for STL and hides for non-3D STEP', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const { sec } = seedInfillElements(env);

    env.context.modelPhysicalProps = { volumeMm3: 8000, areaMm2: 2400, bbox: { x: 20, y: 20, z: 20 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    // 1. STL format: section-infill is displayed
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.window.updatePhysicalPropertiesCard();
    assertEqual(sec.style.display, 'block', 'Visible for STL format');

    // 2. STEP format with Steel: section-infill is hidden
    env.context.activeCadFormat = 'STEP';
    env.window.activeCadFormat = 'STEP';
    env.window.MaterialsEngine.selectMaterial('steel_1018');
    env.window.updatePhysicalPropertiesCard();
    assertEqual(sec.style.display, 'none', 'Hidden for STEP format with Steel');

    // 3. STEP format with PLA (user selecting 3D print material): section-infill is shown
    env.window.MaterialsEngine.selectMaterial('pla');
    env.window.updatePhysicalPropertiesCard();
    assertEqual(sec.style.display, 'block', 'Visible when 3D print filament is selected on any format');
  });
});

// ============================================================================
// SUITE 6: Exploded View Tool Adaptation (#btn-explode)
// ============================================================================
describe('Suite 6: Exploded View Tool Adaptation (#btn-explode)', () => {
  test('T4.6.1: Single-body STL disables #btn-explode with tooltip, styles, and attributes', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    const btn = env.document.getElementById('btn-explode');
    assertTrue(btn !== null, '#btn-explode exists in DOM');

    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelBodies = [{ id: 1, name: 'Part' }];
    env.window.modelBodies = env.context.modelBodies;

    env.window.WorkbenchUI.updateExplodeToolState('STL', 1);

    assertEqual(btn.disabled, true, 'btn.disabled is true');
    assertEqual(btn.getAttribute('disabled'), 'true', 'disabled attribute is set');
    assertTrue(btn.classList.contains('disabled'), 'disabled class is applied');
    assertEqual(btn.style.opacity, '0.4', 'opacity is 0.4');
    assertEqual(btn.style.pointerEvents, 'none', 'pointer-events is none');
    assertEqual(btn.style.cursor, 'not-allowed', 'cursor is not-allowed');
    assertEqual(btn.title, 'Exploded view requires a multi-body assembly', 'Informative tooltip set');
  });

  test('T4.6.2: Multi-body assembly enables #btn-explode with active styles and tooltip', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    const btn = env.document.getElementById('btn-explode');

    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelBodies = [{ id: 1 }, { id: 2 }, { id: 3 }];
    env.window.modelBodies = env.context.modelBodies;

    env.window.WorkbenchUI.updateExplodeToolState('STL', 3);

    assertEqual(btn.disabled, false, 'btn.disabled is false');
    assertEqual(btn.hasAttribute('disabled'), false, 'disabled attribute is removed');
    assertEqual(btn.classList.contains('disabled'), false, 'disabled class is removed');
    assertEqual(btn.style.opacity, '1', 'opacity is 1');
    assertEqual(btn.style.pointerEvents, 'auto', 'pointer-events is auto');
    assertEqual(btn.style.cursor, 'pointer', 'cursor is pointer');
    assertEqual(btn.title, 'Exploded Assembly View [X]', 'Default explode tooltip set');
  });

  test('T4.6.3: Transition between multi-body and single-body STL updates state cleanly', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    const btn = env.document.getElementById('btn-explode');

    // 1. Multi-body
    env.window.WorkbenchUI.updateExplodeToolState('STL', 2);
    assertEqual(btn.disabled, false, 'Multi-body enables button');

    // 2. Transition to single-body
    env.window.WorkbenchUI.updateExplodeToolState('STL', 1);
    assertEqual(btn.disabled, true, 'Single-body disables button');

    // 3. Transition back to multi-body
    env.window.WorkbenchUI.updateExplodeToolState('STL', 4);
    assertEqual(btn.disabled, false, 'Multi-body re-enables button');
  });
});

// ============================================================================
// SUITE 7: Keyboard Shortcut 'X' Capture-Phase Guard
// ============================================================================
describe('Suite 7: Keyboard Shortcut \'X\' Capture-Phase Guard', () => {
  test('T4.7.1: Pressing \'x\' on single-body STL intercepts event and triggers toast', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelBodies = [{ id: 1, name: 'Part' }];
    env.window.modelBodies = env.context.modelBodies;

    // Attach event bus to mock window
    const listeners = [];
    env.window.addEventListener = (evt, fn, capture) => {
      listeners.push({ evt, fn, capture });
    };

    let toastMsg = null;
    env.window.showToast = (msg) => { toastMsg = msg; };

    // Register guard
    env.window.WorkbenchUI.setupExplodeKeyboardGuard();

    // Simulate keydown 'x'
    const keyEvent = {
      type: 'keydown',
      key: 'x',
      target: { tagName: 'DIV' },
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault: function() { this.defaultPrevented = true; },
      stopPropagation: function() { this.propagationStopped = true; },
      stopImmediatePropagation: function() { this.propagationStopped = true; }
    };

    listeners.filter(l => l.evt === 'keydown').forEach(l => l.fn(keyEvent));

    assertTrue(keyEvent.defaultPrevented, 'preventDefault() was called');
    assertTrue(keyEvent.propagationStopped, 'stopImmediatePropagation() was called');
    assertEqual(toastMsg, 'Exploded view requires a multi-body assembly with multiple parts', 'Toast displayed');
  });

  test('T4.7.2: Typing \'x\' in INPUT or TEXTAREA is not intercepted', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelBodies = [{ id: 1, name: 'Part' }];
    env.window.modelBodies = env.context.modelBodies;

    const listeners = [];
    env.window.addEventListener = (evt, fn, capture) => {
      listeners.push({ evt, fn, capture });
    };

    let toastShown = false;
    env.window.showToast = () => { toastShown = true; };

    env.window.WorkbenchUI.setupExplodeKeyboardGuard();

    const inputKeyEvent = {
      type: 'keydown',
      key: 'x',
      target: { tagName: 'INPUT' },
      defaultPrevented: false,
      preventDefault: function() { this.defaultPrevented = true; }
    };

    listeners.filter(l => l.evt === 'keydown').forEach(l => l.fn(inputKeyEvent));

    assertEqual(inputKeyEvent.defaultPrevented, false, 'INPUT keypress was not intercepted');
    assertEqual(toastShown, false, 'No toast displayed when typing in INPUT');
  });

  test('T4.7.3: Pressing \'x\' on multi-body assembly is permitted to proceed', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelBodies = [{ id: 1 }, { id: 2 }];
    env.window.modelBodies = env.context.modelBodies;

    const listeners = [];
    env.window.addEventListener = (evt, fn, capture) => {
      listeners.push({ evt, fn, capture });
    };

    let toastShown = false;
    env.window.showToast = () => { toastShown = true; };

    env.window.WorkbenchUI.setupExplodeKeyboardGuard();

    const keyEvent = {
      type: 'keydown',
      key: 'x',
      target: { tagName: 'CANVAS' },
      defaultPrevented: false,
      preventDefault: function() { this.defaultPrevented = true; }
    };

    listeners.filter(l => l.evt === 'keydown').forEach(l => l.fn(keyEvent));

    assertEqual(keyEvent.defaultPrevented, false, 'Multi-body keypress was not intercepted');
    assertEqual(toastShown, false, 'No toast displayed on multi-body model');
  });
});

// ============================================================================
// SUITE 8: Blueprint SVG & 3D Section Integration on STL Meshes
// ============================================================================
describe('Suite 8: Blueprint SVG & 3D Section Integration on STL Meshes', () => {
  test('T4.8.1: Blueprint SVG title block embeds infill-adjusted mass and material name', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true, loadBlueprintSvg: true });
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';

    // Synthetic 20x20x20 STL mesh
    const cube = generateCube({ size: 20, format: 'binary' });
    const geom = new env.THREE.BufferGeometry();
    geom.setAttribute('position', new env.THREE.BufferAttribute(cube.positions, 3));
    geom.computeVertexNormals();

    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshStandardMaterial());
    env.context.modelBodies = [{ id: 1, name: 'bearing_mount.stl', mesh: mesh, data: { volumeMm3: 8000 } }];
    env.window.modelBodies = env.context.modelBodies;
    env.context.modelGroup.add(mesh);
    env.window.modelGroup = env.context.modelGroup;

    env.context.modelPhysicalProps = { volumeMm3: 8000, areaMm2: 2400, bbox: { x: 20, y: 20, z: 20 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    // Select PLA and 20% infill: 8 * 0.2 * 1.24 = 1.984 g = 0.002 kg
    env.window.MaterialsEngine.selectMaterial('pla');
    env.window.MaterialsEngine.setInfill(20);

    const generateSvg = env.window.BlueprintEngine?.generateSvg || env.window.generateBlueprintSvg;
    assertTrue(typeof generateSvg === 'function', 'generateSvg function is available');

    const svg = generateSvg();
    assertTrue(typeof svg === 'string' && svg.length > 100, 'SVG generated successfully');
    assertTrue(svg.includes('PLA (Polylactic Acid)'), 'SVG contains selected material name');
    assertTrue(svg.includes('0.002 kg'), 'SVG contains infill-adjusted mass');
  });

  test('T4.8.2: 3D Section stencil initialization executes on STL mesh without error', () => {
    const env = createCadEnvironment({ loadCadState: true, loadSectionEngine: true });
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';

    const cube = generateCube({ size: 20, format: 'binary' });
    const geom = new env.THREE.BufferGeometry();
    geom.setAttribute('position', new env.THREE.BufferAttribute(cube.positions, 3));
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshStandardMaterial());

    env.context.modelBodies = [{ id: 1, name: 'part.stl', mesh: mesh }];
    env.window.modelBodies = env.context.modelBodies;

    // Toggle section view on
    env.window.toggleSectionView(true);
    assertEqual(env.context.isSectionActive, true, 'Section view active on STL mesh');
    assertTrue(env.context.sectionPlane !== null, 'Section plane initialized');

    // Toggle section view off
    env.window.toggleSectionView(false);
    assertEqual(env.context.isSectionActive, false, 'Section view deactivated cleanly');
  });
});

// ============================================================================
// SUITE 9: Viewer HTML Static Layout Compliance
// ============================================================================
describe('Suite 9: Viewer HTML Static Layout Compliance', () => {
  const viewerHtmlPath = path.resolve(__dirname, '../Assets/viewer.html');
  const viewerHtml = fs.readFileSync(viewerHtmlPath, 'utf8');

  test('T4.9.1: viewer.html contains disabled button CSS styles', () => {
    assertTrue(viewerHtml.includes('.btn[disabled]'), '.btn[disabled] selector exists in viewer.html');
    assertTrue(viewerHtml.includes('.btn.disabled'), '.btn.disabled selector exists in viewer.html');
    assertTrue(viewerHtml.includes('pointer-events: none !important'), 'pointer-events: none !important specified');
    assertTrue(viewerHtml.includes('cursor: not-allowed !important'), 'cursor: not-allowed !important specified');
  });

  test('T4.9.2: viewer.html contains #section-infill and all required infill UI elements', () => {
    assertTrue(viewerHtml.includes('id="section-infill"'), '#section-infill container exists in viewer.html');
    assertTrue(viewerHtml.includes('id="infill-slider"'), '#infill-slider exists in viewer.html');
    assertTrue(viewerHtml.includes('id="infill-val"'), '#infill-val exists in viewer.html');
    assertTrue(viewerHtml.includes('data-infill="15"'), '15% preset button exists');
    assertTrue(viewerHtml.includes('data-infill="20"'), '20% preset button exists');
    assertTrue(viewerHtml.includes('data-infill="50"'), '50% preset button exists');
    assertTrue(viewerHtml.includes('data-infill="100"'), '100% preset button exists');
    assertTrue(viewerHtml.includes('id="print-est-mass"'), '#print-est-mass exists in viewer.html');
    assertTrue(viewerHtml.includes('id="print-est-length"'), '#print-est-length exists in viewer.html');
    assertTrue(viewerHtml.includes('id="print-est-spool"'), '#print-est-spool exists in viewer.html');
  });
});

// Run reporting if executed directly
if (require.main === module) {
  const summary = reportSummary();
  exitProcess();
}
