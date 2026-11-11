/**
 * Empirical Challenger 2 - Adversarial Deep Stress Harness
 * File: tests/test_adversarial_empirical_challenger2.js
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
  createCadEnvironment,
  reportSummary,
  exitProcess
} = require('./stl_test_harness.js');

console.log('================================================================================');
console.log('  EMPIRICAL CHALLENGER 2: ADVERSARIAL STRESS & ORACLE HARNESS                  ');
console.log('================================================================================');

describe('Suite C2.1: Materials Engine Fuzzing & Mathematical Invariants', () => {
  const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
  const ME = env.window.MaterialsEngine;

  test('C2.1.1: Infill clamping fuzzing across pathological inputs', () => {
    // Pathological inputs
    const cases = [
      { input: -100, expected: 5 },
      { input: 0, expected: 5 },
      { input: 4.9, expected: 5 },
      { input: 5, expected: 5 },
      { input: 15, expected: 15 },
      { input: 20.4, expected: 20 },
      { input: 50.6, expected: 51 },
      { input: 99.4, expected: 99 },
      { input: 100, expected: 100 },
      { input: 101, expected: 100 },
      { input: 999999, expected: 100 },
      { input: NaN, expected: 5 },
      { input: 'NaN', expected: 5 },
      { input: '25', expected: 25 },
      { input: 'invalid_str', expected: 5 },
      { input: null, expected: 5 },
      { input: undefined, expected: 5 },
      { input: {}, expected: 5 },
      { input: [], expected: 5 }
    ];

    for (const c of cases) {
      const res = ME.setInfill(c.input);
      assertEqual(res, c.expected, `setInfill(${JSON.stringify(c.input)}) clamped to ${c.expected}`);
      assertEqual(ME.getInfill(), c.expected, `getInfill() matches clamped state ${c.expected}`);
    }
  });

  test('C2.1.2: Mathematical invariants for filament length & spool fraction', () => {
    const densities = [1.24, 1.27, 1.04, 1.21, 1.15, 2.70, 7.85];
    const infills = [5, 15, 20, 50, 100];
    const volumes = [1000, 50000, 1000000, 2500000];

    for (const d of densities) {
      for (const inf of infills) {
        for (const v of volumes) {
          const metrics = ME.getPrintMetrics(v, d, inf);
          
          // Invariant 1: Effective volume = V * (inf / 100)
          const expectedEffVolMm3 = v * (inf / 100.0);
          assertCloseTo(metrics.effectiveVolMm3, expectedEffVolMm3, 1e-4, 'Effective volume invariant');

          // Invariant 2: massGrams = (V_eff / 1000) * density
          const expectedMassGrams = (expectedEffVolMm3 / 1000.0) * d;
          assertCloseTo(metrics.massGrams, expectedMassGrams, 1e-4, 'Mass grams invariant');

          // Invariant 3: massKg = massGrams / 1000
          assertCloseTo(metrics.massKg, expectedMassGrams / 1000.0, 1e-6, 'Mass kg invariant');

          // Invariant 4: spoolFractionPercent = massKg * 100%
          assertCloseTo(metrics.spoolFractionPercent, (metrics.massGrams / 1000.0) * 100.0, 1e-4, 'Spool fraction invariant');

          // Invariant 5: filamentLengthMeters = V_eff / (pi * (1.75/2)^2 * 1000)
          const filamentArea = Math.PI * Math.pow(1.75 / 2.0, 2);
          const expectedLength = expectedEffVolMm3 / (filamentArea * 1000.0);
          assertCloseTo(metrics.filamentLengthMeters, expectedLength, 1e-4, 'Filament length invariant');
        }
      }
    }
  });

  test('C2.1.3: Extreme volume boundary handling (0, negative, Infinity, NaN)', () => {
    const zeroMetrics = ME.getPrintMetrics(0, 1.24, 20);
    assertEqual(zeroMetrics.massGrams, 0, 'Zero volume produces zero mass');
    assertEqual(zeroMetrics.filamentLengthMeters, 0, 'Zero volume produces zero filament length');
    assertEqual(zeroMetrics.spoolFractionPercent, 0, 'Zero volume produces zero spool fraction');

    const negMetrics = ME.getPrintMetrics(-5000, 1.24, 20);
    assertEqual(negMetrics.massGrams, 0, 'Negative volume produces zero mass without NaN');
    assertEqual(negMetrics.filamentLengthMeters, 0, 'Negative volume produces zero filament length');

    const nanMetrics = ME.getPrintMetrics(NaN, 1.24, 20);
    assertEqual(nanMetrics.massGrams, 0, 'NaN volume produces zero mass without NaN');
  });

  test('C2.1.4: Material lookup and fallback behavior', () => {
    // Select standard materials
    const stlMaterials = ['pla', 'petg', 'abs', 'tpu', 'resin'];
    for (const id of stlMaterials) {
      ME.selectMaterial(id);
      const active = ME.getSelectedMaterial();
      assertEqual(active.id, id, `Selected material is ${id}`);
      assertEqual(active.category, '3D Printing', `${id} is categorized as 3D Printing`);
    }

    // Engineering alloys
    const alloys = ['al_6061', 'steel_1018', 'ss_304', 'ti_gr5', 'cu_c11000'];
    for (const id of alloys) {
      ME.selectMaterial(id);
      const active = ME.getSelectedMaterial();
      assertEqual(active.id, id, `Selected alloy is ${id}`);
      assertTrue(active.category !== '3D Printing', `${id} is not 3D printing`);
    }

    // Invalid material ID fallback
    ME.selectMaterial('completely_non_existent_material_12345');
    const fallback = ME.getSelectedMaterial();
    assertTrue(fallback !== null && typeof fallback === 'object', 'Fallback material is returned');
    assertTrue(fallback.density > 0, 'Fallback material has positive density');
  });
});

describe('Suite C2.2: Workbench UI & Exploded View Disabling Resilience', () => {
  const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true, loadWorkbenchUi: true });
  const doc = env.document;

  const btnExplode = doc.createElement('button');
  btnExplode.id = 'btn-explode';
  doc.body.appendChild(btnExplode);
  doc.registerElement(btnExplode);

  test('C2.2.1: Single-body STL strictly disables #btn-explode', () => {
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [{ id: 0, name: 'SingleStlBody' }];
    env.window.WorkbenchUI.updateExplodeToolState('STL', 1);

    assertTrue(btnExplode.disabled === true, 'btnExplode.disabled is true');
    assertEqual(btnExplode.getAttribute('disabled'), 'true', 'disabled attribute set');
    assertEqual(btnExplode.style.pointerEvents, 'none', 'pointerEvents is none');
    assertTrue(btnExplode.classList.contains('disabled'), 'has disabled class');
  });

  test('C2.2.2: Multi-body STL (count >= 2) enables #btn-explode', () => {
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [
      { id: 0, name: 'Body1' },
      { id: 1, name: 'Body2' }
    ];
    env.window.WorkbenchUI.updateExplodeToolState('STL', 2);

    assertTrue(btnExplode.disabled === false, 'btnExplode.disabled is false');
    assertEqual(btnExplode.getAttribute('disabled'), null, 'disabled attribute removed');
    assertEqual(btnExplode.style.pointerEvents, 'auto', 'pointerEvents is auto');
    assertTrue(!btnExplode.classList.contains('disabled'), 'disabled class removed');
  });

  test('C2.2.3: Single-body STEP / IGES / BREP is permitted to explode (OpenCASCADE multi-shape)', () => {
    for (const fmt of ['STEP', 'IGES', 'BREP']) {
      env.window.activeCadFormat = fmt;
      env.window.modelBodies = [{ id: 0, name: 'CadPart' }];
      env.window.WorkbenchUI.updateExplodeToolState(fmt, 1);

      assertTrue(btnExplode.disabled === false, `${fmt} single-body explode button is not hard-disabled`);
      assertEqual(btnExplode.style.pointerEvents, 'auto', `${fmt} pointerEvents is auto`);
    }
  });

  test('C2.2.4: Shortcut "X" keydown interception on single-body STL', () => {
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [{ id: 0, name: 'SingleStlBody' }];
    env.window.WorkbenchUI.updateExplodeToolState('STL', 1);

    const listeners = [];
    env.window.addEventListener = (evt, fn, capture) => {
      listeners.push({ evt, fn, capture });
    };
    env.window.WorkbenchUI.setupExplodeKeyboardGuard();

    let toastShown = false;
    env.window.showToast = (msg) => {
      toastShown = true;
    };

    let defaultPrevented = false;
    let propStopped = false;
    const fakeEvent = {
      type: 'keydown',
      key: 'x',
      target: { tagName: 'DIV' },
      preventDefault: () => { defaultPrevented = true; },
      stopImmediatePropagation: () => { propStopped = true; }
    };

    listeners.filter(l => l.evt === 'keydown').forEach(l => l.fn(fakeEvent));
    assertTrue(defaultPrevented, 'Event default was prevented');
    assertTrue(propStopped, 'Immediate propagation was stopped');
    assertTrue(toastShown, 'Toast notification was shown');
  });

  test('C2.2.5: Shortcut "X" in INPUT / TEXTAREA is not intercepted', () => {
    env.window.activeCadFormat = 'STL';
    env.window.modelBodies = [{ id: 0, name: 'SingleStlBody' }];
    env.window.WorkbenchUI.updateExplodeToolState('STL', 1);

    const listeners = [];
    env.window.addEventListener = (evt, fn, capture) => {
      listeners.push({ evt, fn, capture });
    };
    env.window.WorkbenchUI.setupExplodeKeyboardGuard();

    let defaultPrevented = false;
    let propStopped = false;
    const fakeEvent = {
      type: 'keydown',
      key: 'x',
      target: { tagName: 'INPUT' },
      preventDefault: () => { defaultPrevented = true; },
      stopImmediatePropagation: () => { propStopped = true; }
    };

    listeners.filter(l => l.evt === 'keydown').forEach(l => l.fn(fakeEvent));
    assertTrue(!defaultPrevented, 'Input keydown default was NOT prevented');
    assertTrue(!propStopped, 'Input keydown propagation was NOT stopped');
  });
});

const summary = reportSummary();
exitProcess(summary.failed === 0 ? 0 : 1);
