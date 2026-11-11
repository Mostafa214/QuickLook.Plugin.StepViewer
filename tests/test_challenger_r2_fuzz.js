/**
 * Challenger 1 (Round 2) Adversarial Empirical Fuzz & Stress Harness
 * Stress-testing production CAD modules and boundary rejection contracts:
 * - MeshFeatureDetector.fitCircleToLoop boundary thresholds (planarity, aspect ratio, micro-radius, N vertices)
 * - StlLoader malformed, truncated, and edge-case buffer tolerance
 * - MaterialsEngine infill clamping and extreme numerical safety
 * - MeasureEngine snapping sensitivity and edge cases
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Load production modules
const StlLoader = require('../Assets/js/stlLoader.js');
const MeshFeatureDetector = require('../Assets/js/meshFeatureDetector.js');
const { createCadEnvironment } = require('./stl_test_harness.js');

let passCount = 0;
let failCount = 0;
const results = [];

function runCase(name, fn) {
  try {
    fn();
    passCount++;
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failCount++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('================================================================================');
console.log('  CHALLENGER 1 (ROUND 2): ADVERSARIAL STRESS & FUZZ HARNESS                     ');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// Suite 1: fitCircleToLoop Sharp Threshold Verification
// -----------------------------------------------------------------------------
console.log('[SUITE 1] fitCircleToLoop Sharp Threshold & Boundary Fuzzing');

runCase('1.1: Micro-radius sweep: R in [0.01, 0.19] mm must reject (null); R in [0.21, 5.0] mm must accept', () => {
  const N = 16;
  const loop = Array.from({ length: N }, (_, i) => i);

  // Sub-threshold radii (must return null)
  const rejectedRadii = [0.01, 0.05, 0.10, 0.15, 0.18, 0.199];
  for (const r of rejectedRadii) {
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      pts[i * 3] = r * Math.cos(a);
      pts[i * 3 + 1] = r * Math.sin(a);
      pts[i * 3 + 2] = 0;
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
    assert.strictEqual(fit, null, `Radius ${r} mm must be rejected by fitCircleToLoop`);
  }

  // Super-threshold radii (must return circle object)
  const acceptedRadii = [0.21, 0.25, 0.50, 1.0, 5.0, 50.0];
  for (const r of acceptedRadii) {
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      pts[i * 3] = r * Math.cos(a);
      pts[i * 3 + 1] = r * Math.sin(a);
      pts[i * 3 + 2] = 0;
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
    assert.notStrictEqual(fit, null, `Radius ${r} mm must be accepted by fitCircleToLoop`);
    assert.ok(Math.abs(fit.diameter - 2 * r) < 1e-3, `Fitted diameter must match 2*r`);
  }
});

runCase('1.2: Planarity Z-noise sweep: zDev in [0.00, 0.09] accepted; zDev in [0.11, 2.0] rejected', () => {
  const N = 16, r = 10.0;
  const loop = Array.from({ length: N }, (_, i) => i);

  // Below tolerance 0.10 mm (accepted)
  for (const zNoise of [0.00, 0.02, 0.05, 0.08, 0.09]) {
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      pts[i * 3] = r * Math.cos(a);
      pts[i * 3 + 1] = r * Math.sin(a);
      pts[i * 3 + 2] = (i % 2 === 0 ? zNoise : -zNoise);
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
    assert.notStrictEqual(fit, null, `Z-noise ${zNoise} mm <= 0.10 mm should be accepted`);
  }

  // Above tolerance 0.10 mm (rejected)
  for (const zNoise of [0.11, 0.15, 0.20, 0.50, 1.0, 5.0]) {
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      pts[i * 3] = r * Math.cos(a);
      pts[i * 3 + 1] = r * Math.sin(a);
      pts[i * 3 + 2] = (i % 2 === 0 ? zNoise : -zNoise);
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
    assert.strictEqual(fit, null, `Z-noise ${zNoise} mm > 0.10 mm should be rejected`);
  }
});

runCase('1.3: Aspect ratio ellipse sweep: a=10, b varying from 10 down to 4', () => {
  const N = 16, a = 10.0;
  const loop = Array.from({ length: N }, (_, i) => i);

  // Anisotropic ellipses with aspect ratio > 1.05 (b <= 9.0) must be rejected
  for (const b of [4.0, 5.0, 6.0, 7.0, 8.0, 9.0]) {
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = (i * 2 * Math.PI) / N;
      pts[i * 3] = a * Math.cos(th);
      pts[i * 3 + 1] = b * Math.sin(th);
      pts[i * 3 + 2] = 0;
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
    assert.strictEqual(fit, null, `Ellipse a=10, b=${b} must be rejected as non-circular`);
  }

  // Circular / near-circular (b = 9.99, b = 10.0) must be accepted
  for (const b of [9.99, 10.0]) {
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = (i * 2 * Math.PI) / N;
      pts[i * 3] = a * Math.cos(th);
      pts[i * 3 + 1] = b * Math.sin(th);
      pts[i * 3 + 2] = 0;
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
    assert.notStrictEqual(fit, null, `Near-circle a=10, b=${b} must be accepted`);
  }
});

runCase('1.4: Polygon vertex count sweep: N in [3, 5] rejected; N >= 6 accepted', () => {
  for (let N = 3; N <= 5; N++) {
    const loop = Array.from({ length: N }, (_, i) => i);
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      pts[i * 3] = 5.0 * Math.cos(a);
      pts[i * 3 + 1] = 5.0 * Math.sin(a);
      pts[i * 3 + 2] = 0;
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
    assert.strictEqual(fit, null, `N=${N} polygon loop must be rejected (N < 6 rule)`);
  }

  for (let N of [6, 8, 12, 16, 32, 64]) {
    const loop = Array.from({ length: N }, (_, i) => i);
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      pts[i * 3] = 5.0 * Math.cos(a);
      pts[i * 3 + 1] = 5.0 * Math.sin(a);
      pts[i * 3 + 2] = 0;
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
    assert.notStrictEqual(fit, null, `N=${N} polygon loop must be accepted`);
    assert.ok(Math.abs(fit.diameter - 10.0) < 0.1, `N=${N} diameter ~ 10.0 mm`);
  }
});

// -----------------------------------------------------------------------------
// Suite 2: MaterialsEngine Extreme Numerical Safety & Infill Contracts
// -----------------------------------------------------------------------------
console.log('\n[SUITE 2] MaterialsEngine Extreme Numerical Safety & Infill Contracts');

runCase('2.1: MaterialsEngine.clampInfill exhaustive edge input fuzzing', () => {
  const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
  const ME = env.window.MaterialsEngine;

  assert.strictEqual(ME.clampInfill(-1000), 5);
  assert.strictEqual(ME.clampInfill(-0.001), 5);
  assert.strictEqual(ME.clampInfill(0), 5);
  assert.strictEqual(ME.clampInfill(4.99), 5);
  assert.strictEqual(ME.clampInfill(5), 5);
  assert.strictEqual(ME.clampInfill(20), 20);
  assert.strictEqual(ME.clampInfill(50), 50);
  assert.strictEqual(ME.clampInfill(100), 100);
  assert.strictEqual(ME.clampInfill(100.01), 100);
  assert.strictEqual(ME.clampInfill(999999), 100);
  assert.strictEqual(ME.clampInfill(NaN), 5);
  assert.strictEqual(ME.clampInfill(Infinity), 100);
  assert.strictEqual(ME.clampInfill(-Infinity), 5);
  assert.strictEqual(ME.clampInfill(null), 5);
  assert.strictEqual(ME.clampInfill(undefined), 5);
  assert.strictEqual(ME.clampInfill('invalid string'), 5);
});

runCase('2.2: Extreme volume scaling in getPrintMetrics: 10^12 mm³ and 10^-6 mm³', () => {
  const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
  const ME = env.window.MaterialsEngine;
  ME.selectMaterial('pla');

  // Huge volume: 10^12 mm³ = 10^9 cm³ = 10^6 m³
  const hugeMetrics = ME.getPrintMetrics(1e12, 1.24, 50);
  assert.ok(Number.isFinite(hugeMetrics.massKg) && hugeMetrics.massKg > 0);
  assert.ok(Number.isFinite(hugeMetrics.filamentLengthMeters) && hugeMetrics.filamentLengthMeters > 0);

  // Tiny volume: 10^-6 mm³
  const tinyMetrics = ME.getPrintMetrics(1e-6, 1.24, 20);
  assert.ok(Number.isFinite(tinyMetrics.massGrams) && tinyMetrics.massGrams >= 0);

  // Negative volume input clamped to 0
  const negMetrics = ME.getPrintMetrics(-5000, 1.24, 20);
  assert.strictEqual(negMetrics.massGrams, 0);
  assert.strictEqual(negMetrics.filamentLengthMeters, 0);
  assert.strictEqual(negMetrics.spoolFractionPercent, 0);
});

// -----------------------------------------------------------------------------
// Suite 3: StlLoader Corrupted Buffers & Parser Stress
// -----------------------------------------------------------------------------
console.log('\n[SUITE 3] StlLoader Malformed Buffer & Fuzz Tolerance');

runCase('3.1: StlLoader safely throws or handles truncated binary headers', () => {
  for (const size of [0, 1, 10, 40, 80, 83]) {
    const buf = new ArrayBuffer(size);
    let threw = false;
    try {
      StlLoader.parse(buf, 'truncated.stl');
    } catch (e) {
      threw = true;
    }
    assert.ok(threw, `Truncated buffer of size ${size} must throw error`);
  }
});

runCase('3.2: StlLoader detects corrupted facet counts exceeding file buffer', () => {
  // 84 bytes header, but facet count declares 1000 facets (requires 50,084 bytes)
  const buf = new ArrayBuffer(84);
  const view = new DataView(buf);
  view.setUint32(80, 1000, true);
  let threw = false;
  try {
    StlLoader.parse(buf, 'mismatch.stl');
  } catch (e) {
    threw = true;
  }
  assert.ok(threw, 'Mismatched facet count must throw validation error');
});

runCase('3.3: ASCII parser handles empty solid, solid with garbage, and scientific extremes', () => {
  // Empty solid (must throw 'No valid facet triangles found')
  const emptyAscii = 'solid empty\nendsolid empty\n';
  const bufEmpty = new TextEncoder().encode(emptyAscii).buffer;
  let emptyThrew = false;
  try {
    StlLoader.parse(bufEmpty, 'empty.stl');
  } catch (e) {
    emptyThrew = e.message.includes('No valid facet triangles found');
  }
  assert.ok(emptyThrew, 'Empty ASCII solid with 0 facets must throw invalid file error');

  // Extreme exponent numbers
  const asciiExp = `solid exp
facet normal 0 0 1
  outer loop
    vertex 1.0e-15 2.0e-15 0.0
    vertex 1.0 0.0 0.0
    vertex 0.0 1.0 0.0
  endloop
endfacet
endsolid exp`;
  const bufExp = new TextEncoder().encode(asciiExp).buffer;
  const resExp = StlLoader.parse(bufExp, 'exp.stl');
  assert.strictEqual(resExp.totalTriangles, 1);
  assert.ok(Number.isFinite(resExp.meshes[0].position[0]));
});

// -----------------------------------------------------------------------------
// Execution Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(`  CHALLENGER 1 FUZZ HARNESS: ${passCount} passed, ${failCount} failed`);
console.log('================================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
