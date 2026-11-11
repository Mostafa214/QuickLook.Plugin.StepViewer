/**
 * Adversarial Stress & Edge Case Test Suite: 3D Printing Materials, Infill & UI
 * File: tests/test_materials_infill_adversarial.js
 *
 * Implements rigorous adversarial stress tests, edge case harnesses, and mathematical
 * oracles against:
 * - Assets/js/materialsEngine.js
 * - Assets/viewer.html
 * - Assets/js/workbenchUiEngine.js
 *
 * Focus Areas:
 * 1. Extreme Infill Boundaries (-100%, 0%, 0.0001%, 4.99%, 5%, 99.999%, 100%, 100.01%, 500%, NaN, Infinity, null, undefined, "20%", "fifty")
 * 2. Extreme Volumes (0 mm³, 10⁻⁹ mm³, 10¹⁵ mm³, negative volumes, inverted STL normals)
 * 3. Zero-density custom materials & missing active material fallbacks
 * 4. Exact Mathematical Oracles for 1.75mm filament length and 1kg spool usage
 * 5. High-frequency state mutation stress (1,000 iterations) verifying getTotalMassKg() vs getPrintMetrics() sync
 * 6. STEP/IGES format isolation under infill mutations
 * 7. Exploded view tool & capture-phase 'X' guard under rapid stress
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
  createCadEnvironment,
  reportSummary,
  exitProcess
} = require('./stl_test_harness.js');

const {
  generateCube,
  generateInvertedCube
} = require('./stl_test_fixtures.js');

console.log('================================================================================');
console.log('  ADVERSARIAL STRESS & ORACLE TEST SUITE: M4 3D PRINTING & INFILL               ');
console.log('================================================================================');

// Helper to seed infill elements in mock environment
function seedInfillElements(env) {
  const doc = env.document;
  
  let sec = doc.getElementById('section-infill');
  if (!sec) {
    sec = doc.createElement('div');
    sec.id = 'section-infill';
    doc.body.appendChild(sec);
    doc.registerElement(sec);
  }

  let slider = doc.getElementById('infill-slider');
  if (!slider) {
    slider = doc.createElement('input');
    slider.id = 'infill-slider';
    slider.value = 20;
    sec.appendChild(slider);
    doc.registerElement(slider);
  }

  let valLabel = doc.getElementById('infill-val');
  if (!valLabel) {
    valLabel = doc.createElement('span');
    valLabel.id = 'infill-val';
    valLabel.innerText = '20%';
    sec.appendChild(valLabel);
    doc.registerElement(valLabel);
  }

  [15, 20, 50, 100].forEach(p => {
    const btn = doc.createElement('button');
    btn.className = 'btn-preset-infill';
    btn.setAttribute('data-infill', String(p));
    if (p === 20) btn.className += ' active';
    sec.appendChild(btn);
  });

  return { sec, slider, valLabel };
}

// ============================================================================
// SUITE 1: Extreme Infill Boundaries & Malformed Input Fuzzing
// ============================================================================
describe('Suite 1: Extreme Infill Boundaries & Malformed Input Fuzzing', () => {
  test('ADV-1.1: Clamping extreme lower-bound inputs (-100%, 0%, 0.0001%, 4.99%, 5%)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const clamp = env.window.MaterialsEngine.clampInfill;
    assertTrue(typeof clamp === 'function', 'clampInfill is exported on MaterialsEngine');

    // Negative percentages
    assertEqual(clamp(-100), 5, '-100% clamped to 5% minimum');
    assertEqual(clamp(-0.001), 5, '-0.001% clamped to 5%');
    assertEqual(clamp(0), 5, '0% clamped to 5% minimum');

    // Microscopic positive values below 5%
    assertEqual(clamp(0.0001), 5, '0.0001% clamped to 5%');
    assertEqual(clamp(0.999), 5, '0.999% clamped to 5%');
    assertEqual(clamp(4.49), 5, '4.49% clamped to 5%');
    assertEqual(clamp(4.99), 5, '4.99% clamped to 5%');

    // Exact floor threshold
    assertEqual(clamp(5.0), 5, 'Exact 5.0% returns 5%');
  });

  test('ADV-1.2: Clamping extreme upper-bound inputs (99.999%, 100%, 100.01%, 500%)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const clamp = env.window.MaterialsEngine.clampInfill;

    assertEqual(clamp(99.4), 99, '99.4% rounds to 99%');
    assertEqual(clamp(99.999), 100, '99.999% rounds to 100%');
    assertEqual(clamp(100.0), 100, 'Exact 100% returns 100%');
    assertEqual(clamp(100.01), 100, '100.01% clamped to 100%');
    assertEqual(clamp(150), 100, '150% clamped to 100%');
    assertEqual(clamp(500), 100, '500% clamped to 100%');
    assertEqual(clamp(1e6), 100, '1,000,000% clamped to 100%');
  });

  test('ADV-1.3: Fuzzing non-numeric, special IEEE-754 floats, and string inputs', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const clamp = env.window.MaterialsEngine.clampInfill;

    // Special IEEE-754 numbers
    assertEqual(clamp(NaN), 5, 'NaN clamped to 5%');
    assertEqual(clamp(Infinity), 100, 'Infinity clamped to 100%');
    assertEqual(clamp(-Infinity), 5, '-Infinity clamped to 5%');

    // Null and Undefined
    assertEqual(clamp(null), 5, 'null clamped to 5%');
    assertEqual(clamp(undefined), 5, 'undefined clamped to 5%');

    // Numeric strings vs text strings
    assertEqual(clamp('20'), 20, 'String "20" parsed as 20%');
    assertEqual(clamp(' 50 '), 50, 'String " 50 " parsed as 50%');
    assertEqual(clamp('100'), 100, 'String "100" parsed as 100%');
    assertEqual(clamp('20%'), 5, 'String with percent "20%" falls back to 5%');
    assertEqual(clamp('fifty'), 5, 'Text "fifty" falls back to 5%');
    assertEqual(clamp(''), 5, 'Empty string falls back to 5%');
    assertEqual(clamp({}), 5, 'Object literal falls back to 5%');
    assertEqual(clamp([]), 5, 'Empty array falls back to 5%');
  });

  test('ADV-1.4: setInfill() mutation stress with edge inputs', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    seedInfillElements(env);

    // Negative input
    env.window.MaterialsEngine.setInfill(-50);
    assertEqual(env.window.MaterialsEngine.getInfill(), 5, 'setInfill(-50) sets 5%');
    assertEqual(env.window.localStorage.getItem('stepviewer_infill_percent'), '5', 'Saved 5%');

    // Huge input
    env.window.MaterialsEngine.setInfill(999);
    assertEqual(env.window.MaterialsEngine.getInfill(), 100, 'setInfill(999) sets 100%');
    assertEqual(env.window.localStorage.getItem('stepviewer_infill_percent'), '100', 'Saved 100%');

    // NaN input
    env.window.MaterialsEngine.setInfill('not_a_number');
    assertEqual(env.window.MaterialsEngine.getInfill(), 5, 'setInfill("not_a_number") sets 5%');
  });
});

// ============================================================================
// SUITE 2: Extreme Geometric Volumes & Physical Properties Oracles
// ============================================================================
describe('Suite 2: Extreme Geometric Volumes & Physical Properties Oracles', () => {
  test('ADV-2.1: Zero volume (0 mm³) print metrics oracle', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const metrics = env.window.MaterialsEngine.getPrintMetrics(0, 1.24, 20);

    assertEqual(metrics.volumeMm3, 0, 'Volume mm³ is 0');
    assertEqual(metrics.effectiveVolMm3, 0, 'Effective volume mm³ is 0');
    assertEqual(metrics.effectiveVolCm3, 0, 'Effective volume cm³ is 0');
    assertEqual(metrics.massGrams, 0, 'Mass grams is 0');
    assertEqual(metrics.massKg, 0, 'Mass kg is 0');
    assertEqual(metrics.filamentLengthMeters, 0, 'Filament length meters is 0');
    assertEqual(metrics.spoolFractionPercent, 0, 'Spool fraction percent is 0');
    assertTrue(!isNaN(metrics.filamentLengthMeters), 'Filament length is not NaN');
    assertTrue(isFinite(metrics.filamentLengthMeters), 'Filament length is finite');
  });

  test('ADV-2.2: Microscopic volume (10⁻⁹ mm³) numerical stability', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const vol = 1e-9; // 10^-9 mm^3
    const metrics = env.window.MaterialsEngine.getPrintMetrics(vol, 1.24, 20);

    assertTrue(metrics.effectiveVolMm3 > 0, 'Effective volume is strictly positive');
    assertCloseTo(metrics.effectiveVolMm3, 2e-10, 1e-15, 'Effective vol is 0.2 * 10^-9');
    assertTrue(metrics.massGrams > 0, 'Mass grams is strictly positive');
    assertTrue(metrics.filamentLengthMeters > 0, 'Filament length is strictly positive');
    assertTrue(isFinite(metrics.massGrams), 'Mass grams is finite');
    assertTrue(!isNaN(metrics.massGrams), 'Mass grams is not NaN');
  });

  test('ADV-2.3: Astronomical volume (10¹⁵ mm³ = 1 km³ solid block) without overflow', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const vol = 1e15; // 1 billion m^3 = 1 km^3
    const metrics = env.window.MaterialsEngine.getPrintMetrics(vol, 1.24, 100);

    assertTrue(isFinite(metrics.effectiveVolMm3), 'Effective volume is finite');
    assertTrue(isFinite(metrics.massGrams), 'Mass grams is finite');
    assertTrue(isFinite(metrics.massKg), 'Mass kg is finite');
    assertTrue(isFinite(metrics.filamentLengthMeters), 'Filament length is finite');
    assertTrue(isFinite(metrics.spoolFractionPercent), 'Spool fraction is finite');

    // Mass: 10^15 mm^3 = 10^12 cm^3. At 1.24 g/cm^3 -> 1.24 * 10^12 g = 1.24 * 10^9 kg
    assertCloseTo(metrics.massKg, 1.24e9, 1e4, 'Mass matches 1.24 billion kg');
    const expectedLen = 1e15 / 2405.281875;
    assertCloseTo(metrics.filamentLengthMeters, expectedLen, 1e2, 'Filament length matches ~4.157 * 10^11 meters');
  });

  test('ADV-2.4: Negative volume input handled safely by clamping to zero', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const metrics = env.window.MaterialsEngine.getPrintMetrics(-5000, 1.24, 20);

    assertEqual(metrics.volumeMm3, 0, 'Volume clamped to 0');
    assertEqual(metrics.effectiveVolMm3, 0, 'Effective volume clamped to 0');
    assertEqual(metrics.massGrams, 0, 'Mass clamped to 0');
    assertEqual(metrics.filamentLengthMeters, 0, 'Filament length clamped to 0');
  });

  test('ADV-2.5: Inverted STL normals mesh produces valid positive mass and metrics', () => {
    const env = createCadEnvironment({ loadCadState: true, loadStlLoader: true, loadMaterialsEngine: true });
    
    // Generate 20x20x20 cube with inverted facet normals (clockwise winding)
    const invertedFixture = generateInvertedCube({ size: 20, format: 'binary' });
    const parsed = env.window.StlLoader.parse(invertedFixture.buffer.buffer, 'inverted_cube.stl');

    assertTrue(parsed.volumeMm3 > 0, 'StlLoader parsed volume is strictly positive via Math.abs');
    assertCloseTo(parsed.volumeMm3, 8000, 1e-4, 'Volume is 8000 mm³ despite inverted normals');

    // Inject into environment
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelPhysicalProps = { volumeMm3: parsed.volumeMm3, areaMm2: parsed.areaMm2, bbox: { x: 20, y: 20, z: 20 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    env.window.MaterialsEngine.selectMaterial('pla');
    env.window.MaterialsEngine.setInfill(20);

    const massKg = env.window.MaterialsEngine.getTotalMassKg();
    const metrics = env.window.MaterialsEngine.getPrintMetrics();

    assertCloseTo(massKg, 0.001984, 1e-6, 'Total mass is positive 0.001984 kg');
    assertCloseTo(metrics.massKg, 0.001984, 1e-6, 'getPrintMetrics massKg matches');
    assertCloseTo(metrics.filamentLengthMeters, 1600 / 2405.281875, 1e-4, 'Filament length matches');
  });
});

// ============================================================================
// SUITE 3: Material Library Edge Cases & Zero Density Handling
// ============================================================================
describe('Suite 3: Material Library Edge Cases & Zero Density Handling', () => {
  test('ADV-3.1: Zero-density custom material produces 0 mass but accurate filament length', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const cubeVol = 8000; // mm³

    // Call getPrintMetrics with density 0 and infill 50% (effective vol = 4000 mm³)
    const metrics = env.window.MaterialsEngine.getPrintMetrics(cubeVol, 0, 50);

    assertEqual(metrics.density, 0, 'Density is 0');
    assertEqual(metrics.effectiveVolMm3, 4000, 'Effective volume is 4000 mm³');
    assertEqual(metrics.massGrams, 0, 'Mass grams is 0');
    assertEqual(metrics.massKg, 0, 'Mass kg is 0');
    assertEqual(metrics.spoolFractionPercent, 0, 'Spool usage is 0%');

    // Crucial physical property: Extruder length depends purely on geometric volume, not material mass!
    const expectedLen = 4000 / 2405.281875;
    assertCloseTo(metrics.filamentLengthMeters, expectedLen, 1e-4, 'Filament length computed accurately despite zero mass');
    assertTrue(metrics.filamentLengthMeters > 0, 'Filament length is > 0');
  });

  test('ADV-3.2: Missing active material falls back safely without unhandled exceptions', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    
    // Set invalid material ID
    env.window.MaterialsEngine.selectMaterial('non_existent_material_12345');
    
    // Expect fallback to default material (PLA or first material)
    const active = env.window.MaterialsEngine.getSelectedMaterial();
    assertTrue(active !== null && typeof active === 'object', 'Fallback material is returned');
    assertTrue(typeof active.density === 'number' && active.density > 0, 'Fallback material has positive density');

    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelPhysicalProps = { volumeMm3: 8000, areaMm2: 2400, bbox: { x: 20, y: 20, z: 20 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    const totalMass = env.window.MaterialsEngine.getTotalMassKg();
    assertTrue(totalMass > 0, 'getTotalMassKg computes valid positive mass using fallback');
  });

  test('ADV-3.3: Exact analytical mass checks across all 5 standard filaments', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const volMm3 = 10000; // 10 cm³
    const infill = 50; // 50% -> 5 cm³ effective

    const materials = [
      { id: 'pla', density: 1.24, expectedGrams: 5 * 1.24 },   // 6.20 g
      { id: 'petg', density: 1.27, expectedGrams: 5 * 1.27 },  // 6.35 g
      { id: 'abs', density: 1.04, expectedGrams: 5 * 1.04 },   // 5.20 g
      { id: 'tpu', density: 1.21, expectedGrams: 5 * 1.21 },   // 6.05 g
      { id: 'resin', density: 1.15, expectedGrams: 5 * 1.15 }  // 5.75 g
    ];

    materials.forEach(mat => {
      const m = env.window.MaterialsEngine.getPrintMetrics(volMm3, mat.density, infill);
      assertCloseTo(m.massGrams, mat.expectedGrams, 1e-4, `${mat.id} mass matches ${mat.expectedGrams} g`);
      assertCloseTo(m.massKg, mat.expectedGrams / 1000, 1e-6, `${mat.id} massKg matches`);
    });
  });
});

// ============================================================================
// SUITE 4: Mathematical Oracles: Filament Length & 1kg Spool Usage
// ============================================================================
describe('Suite 4: Mathematical Oracles: Filament Length & 1kg Spool Usage', () => {
  test('ADV-4.1: Filament length cross-sectional constant derivation oracle', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });

    // Mathematical definition:
    // Diameter d = 1.75 mm, radius r = 0.875 mm.
    // Cross-sectional area A = pi * r^2 = pi * (0.875)^2 mm^2.
    // Volume per linear meter (1000 mm) = A * 1000 mm^3.
    const pi = Math.PI;
    const r = 1.75 / 2.0;
    const exactConstant = pi * r * r * 1000.0; // 2405.2818754046927 mm^3/m

    // If effective volume is exactly equal to the constant, filament length must equal 1.000 meter!
    const metrics = env.window.MaterialsEngine.getPrintMetrics(exactConstant, 1.24, 100);
    assertCloseTo(metrics.filamentLengthMeters, 1.0, 1e-5, 'Volume equal to constant yields exactly 1.000 meter');

    // Test scaling
    const metrics10m = env.window.MaterialsEngine.getPrintMetrics(exactConstant * 10, 1.24, 100);
    assertCloseTo(metrics10m.filamentLengthMeters, 10.0, 1e-5, '10x volume yields exactly 10.000 meters');
  });

  test('ADV-4.2: 1kg Spool usage fraction percentage oracle', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    
    // Density 1.0 g/cm^3 for trivial mass calculation
    // 1000 cm^3 = 1,000,000 mm^3 at 100% infill = 1000 g = 1 kg -> exactly 100.0% spool
    const metricsFull = env.window.MaterialsEngine.getPrintMetrics(1000000, 1.0, 100);
    assertCloseTo(metricsFull.massGrams, 1000, 1e-4, 'Mass is 1000 g');
    assertCloseTo(metricsFull.spoolFractionPercent, 100.0, 1e-4, 'Spool fraction is 100.0%');

    // Half spool: 500 g -> 50%
    const metricsHalf = env.window.MaterialsEngine.getPrintMetrics(500000, 1.0, 100);
    assertCloseTo(metricsHalf.spoolFractionPercent, 50.0, 1e-4, '500g yields 50.0% spool');

    // Multi-spool print: 2500 g -> 250%
    const metricsMulti = env.window.MaterialsEngine.getPrintMetrics(2500000, 1.0, 100);
    assertCloseTo(metricsMulti.spoolFractionPercent, 250.0, 1e-4, '2500g yields 250.0% spool');
  });
});

// ============================================================================
// SUITE 5: High-Frequency State Mutation Stress (1,000 Iterations)
// ============================================================================
describe('Suite 5: High-Frequency State Mutation Stress (1,000 Iterations)', () => {
  test('ADV-5.1: 1,000 rapid infill mutations & filament switches with strict sync', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    seedInfillElements(env);

    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    const baseVol = 12500; // mm³
    env.context.modelPhysicalProps = { volumeMm3: baseVol, areaMm2: 3750, bbox: { x: 25, y: 25, z: 25 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    const filaments = ['pla', 'petg', 'abs', 'tpu', 'resin'];
    const testValues = [
      -50, 0, 1, 4.99, 5, 15, 20, 33, 50, 75, 99.9, 100, 105, 500,
      '20', '50', 'invalid', NaN, Infinity
    ];

    const slider = env.document.getElementById('infill-slider');
    const label = env.document.getElementById('infill-val');

    for (let i = 0; i < 1000; i++) {
      const filamentId = filaments[i % filaments.length];
      const targetInfill = testValues[i % testValues.length];

      env.window.MaterialsEngine.selectMaterial(filamentId);
      const returnedInfill = env.window.MaterialsEngine.setInfill(targetInfill);

      // 1. Infill must always be an integer in [5, 100]
      assertTrue(returnedInfill >= 5 && returnedInfill <= 100, `Infill ${returnedInfill} in [5, 100]`);
      assertEqual(returnedInfill, env.window.MaterialsEngine.getInfill(), 'State matches getInfill()');

      // 2. DOM elements synchronized
      assertEqual(Number(slider.value), returnedInfill, 'Slider value synced');
      assertEqual(label.innerText, `${returnedInfill}%`, 'Label text synced');

      // 3. Strict synchronization between getTotalMassKg() and getPrintMetrics().massKg
      const totalMass = env.window.MaterialsEngine.getTotalMassKg();
      const printMetrics = env.window.MaterialsEngine.getPrintMetrics();

      const diff = Math.abs(totalMass - printMetrics.massKg);
      assertTrue(diff < 1e-12, `getTotalMassKg (${totalMass}) and printMetrics.massKg (${printMetrics.massKg}) strictly synchronized (diff: ${diff})`);

      // 4. Preset button active class consistency
      const presetBtns = env.document.querySelectorAll('.btn-preset-infill');
      presetBtns.forEach(btn => {
        const p = parseFloat(btn.getAttribute('data-infill'));
        const hasActive = btn.classList.contains('active');
        if (p === returnedInfill) {
          assertTrue(hasActive, `Button ${p}% has active class`);
        } else {
          assertTrue(!hasActive, `Button ${p}% does not have active class`);
        }
      });
    }
  });
});

// ============================================================================
// SUITE 6: STEP / IGES Pipeline Isolation Under Infill Mutation
// ============================================================================
describe('Suite 6: STEP / IGES Pipeline Isolation Under Infill Mutation', () => {
  test('ADV-6.1: STEP model mass remains 100% solid regardless of infill slider settings', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    
    env.context.activeCadFormat = 'STEP';
    env.window.activeCadFormat = 'STEP';
    const stepVolMm3 = 8000; // 8 cm³
    env.context.modelPhysicalProps = { volumeMm3: stepVolMm3, areaMm2: 2400, bbox: { x: 20, y: 20, z: 20 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    const materials = [
      { id: 'steel_1018', density: 7.85 },
      { id: 'al_6061', density: 2.70 },
      { id: 'ti_gr5', density: 4.43 }
    ];

    materials.forEach(mat => {
      env.window.MaterialsEngine.selectMaterial(mat.id);
      const expectedSolidMassKg = (8.0 * mat.density) / 1000.0;

      // Move infill slider through diverse values
      [5, 15, 20, 50, 75, 100].forEach(infillVal => {
        env.window.MaterialsEngine.setInfill(infillVal);
        const mass = env.window.MaterialsEngine.getTotalMassKg();
        assertCloseTo(mass, expectedSolidMassKg, 1e-6, `STEP model mass for ${mat.id} invariant at ${infillVal}% infill`);
      });
    });
  });

  test('ADV-6.2: IGES model mass remains 100% solid regardless of infill slider settings', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    
    env.context.activeCadFormat = 'IGES';
    env.window.activeCadFormat = 'IGES';
    const igesVolMm3 = 10000; // 10 cm³
    env.context.modelPhysicalProps = { volumeMm3: igesVolMm3, areaMm2: 3000, bbox: { x: 20, y: 20, z: 25 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    env.window.MaterialsEngine.selectMaterial('cu_c11000'); // Copper 8.96 g/cm³
    const expectedMass = (10.0 * 8.96) / 1000.0; // 0.0896 kg

    [5, 20, 50, 100].forEach(infillVal => {
      env.window.MaterialsEngine.setInfill(infillVal);
      const mass = env.window.MaterialsEngine.getTotalMassKg();
      assertCloseTo(mass, expectedMass, 1e-6, `IGES model mass invariant at ${infillVal}% infill`);
    });
  });
});

// ============================================================================
// SUITE 7: Exploded View Tool Adaptation & Rapid Stress Interception
// ============================================================================
describe('Suite 7: Exploded View Tool Adaptation & Rapid Stress Interception', () => {
  test('ADV-7.1: Rapid switching between single-body and multi-body STL states (100 transitions)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    const btn = env.document.getElementById('btn-explode');
    assertTrue(btn !== null, '#btn-explode exists');

    for (let i = 0; i < 100; i++) {
      const isSingle = (i % 2 === 0);
      const count = isSingle ? 1 : 4;

      env.window.WorkbenchUI.updateExplodeToolState('STL', count);

      if (isSingle) {
        assertEqual(btn.disabled, true, `Iter ${i}: disabled is true for single-body STL`);
        assertEqual(btn.getAttribute('disabled'), 'true', `Iter ${i}: disabled attribute set`);
        assertTrue(btn.classList.contains('disabled'), `Iter ${i}: disabled class present`);
        assertEqual(btn.style.pointerEvents, 'none', `Iter ${i}: pointer-events none`);
        assertEqual(btn.title, 'Exploded view requires a multi-body assembly', `Iter ${i}: tooltip correct`);
      } else {
        assertEqual(btn.disabled, false, `Iter ${i}: disabled is false for multi-body STL`);
        assertEqual(btn.hasAttribute('disabled'), false, `Iter ${i}: disabled attribute removed`);
        assertTrue(!btn.classList.contains('disabled'), `Iter ${i}: disabled class removed`);
        assertEqual(btn.style.pointerEvents, 'auto', `Iter ${i}: pointer-events auto`);
        assertEqual(btn.title, 'Exploded Assembly View [X]', `Iter ${i}: tooltip correct`);
      }
    }
  });

  test('ADV-7.2: 50 rapid keydown "x" events on single-body STL consistently intercepted', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelBodies = [{ id: 1, name: 'single_body.stl' }];
    env.window.modelBodies = env.context.modelBodies;

    const listeners = [];
    env.window.addEventListener = (evt, fn, capture) => {
      listeners.push({ evt, fn, capture });
    };

    let toastCount = 0;
    env.window.showToast = (msg) => {
      if (msg.includes('Exploded view requires a multi-body assembly')) {
        toastCount++;
      }
    };

    env.window.WorkbenchUI.setupExplodeKeyboardGuard();

    const keydownListeners = listeners.filter(l => l.evt === 'keydown');
    assertTrue(keydownListeners.length > 0, 'Keydown listener registered in capture phase');

    for (let i = 0; i < 50; i++) {
      const evt = {
        type: 'keydown',
        key: 'x',
        target: { tagName: 'CANVAS' },
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault: function() { this.defaultPrevented = true; },
        stopPropagation: function() { this.propagationStopped = true; },
        stopImmediatePropagation: function() { this.propagationStopped = true; }
      };

      keydownListeners.forEach(l => l.fn(evt));

      assertTrue(evt.defaultPrevented, `Event ${i}: defaultPrevented`);
      assertTrue(evt.propagationStopped, `Event ${i}: propagationStopped`);
    }

    assertEqual(toastCount, 50, 'Toast displayed exactly 50 times across 50 keydown events');
  });

  test('ADV-7.3: Modifier keys (Ctrl+X, Alt+X, Meta+X) are never intercepted by explode guard', () => {
    const env = createCadEnvironment({ loadCadState: true, loadWorkbenchUi: true });
    env.context.activeCadFormat = 'STL';
    env.window.activeCadFormat = 'STL';
    env.context.modelBodies = [{ id: 1 }];
    env.window.modelBodies = env.context.modelBodies;

    const listeners = [];
    env.window.addEventListener = (evt, fn) => { listeners.push({ evt, fn }); };
    let toastFired = false;
    env.window.showToast = () => { toastFired = true; };

    env.window.WorkbenchUI.setupExplodeKeyboardGuard();
    const keydownListeners = listeners.filter(l => l.evt === 'keydown');

    const modifierCombos = [
      { ctrlKey: true, altKey: false, metaKey: false },
      { ctrlKey: false, altKey: true, metaKey: false },
      { ctrlKey: false, altKey: false, metaKey: true },
      { ctrlKey: true, altKey: true, metaKey: false }
    ];

    modifierCombos.forEach((mod, idx) => {
      const evt = Object.assign({
        type: 'keydown',
        key: 'x',
        target: { tagName: 'DIV' },
        defaultPrevented: false,
        preventDefault: function() { this.defaultPrevented = true; }
      }, mod);

      keydownListeners.forEach(l => l.fn(evt));
      assertEqual(evt.defaultPrevented, false, `Modifier combo ${idx} was not intercepted`);
      assertEqual(toastFired, false, `No toast fired for modifier combo ${idx}`);
    });
  });
});

// Run reporting if executed directly
if (require.main === module) {
  const summary = reportSummary();
  exitProcess();
}
