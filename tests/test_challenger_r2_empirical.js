/**
 * Challenger 2 Round 2 Extended Adversarial Oracle Suite
 * File: tests/test_challenger_r2_empirical.js
 *
 * Directly stress-tests the remediated areas:
 * 1. Circle fit rejection boundaries (micro-radius, planar tolerance, radial residual)
 * 2. Measure engine snap priority & screen projection stability
 * 3. MaterialsEngine infill linear scaling & print metrics conservation
 * 4. Appearance popover state integrity & DOM lifecycle
 */

'use strict';

const path = require('path');
const {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertCloseTo,
  assertDeepCloseTo,
  createCadEnvironment,
  reportSummary,
  exitProcess
} = require('./stl_test_harness.js');

const MeshFeatureDetector = require(path.join(__dirname, '../Assets/js/meshFeatureDetector.js'));
const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

console.log('================================================================================');
console.log('  CHALLENGER 2: ROUND 2 EXTENDED EMPIRICAL ADVERSARIAL ORACLES                 ');
console.log('================================================================================');

describe('C2.R2 Suite 1: Production fitCircleToLoop Parametric Rejection Boundaries', () => {
  test('R1.1: Micro-radius boundary sweep: [0.05, 0.10, 0.15, 0.199] mm all return null; [0.201, 0.50, 1.0] accepted', () => {
    const N = 16;
    const subRadii = [0.05, 0.10, 0.15, 0.199];
    for (const r of subRadii) {
      const pts = new Float32Array(N * 3);
      const loop = [];
      for (let i = 0; i < N; i++) {
        loop.push(i);
        const a = (i * 2 * Math.PI) / N;
        pts[i * 3] = r * Math.cos(a);
        pts[i * 3 + 1] = r * Math.sin(a);
        pts[i * 3 + 2] = 0;
      }
      const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
      assertEqual(fit, null, `Sub-threshold radius r=${r} mm must be rejected (return null)`);
    }

    const superRadii = [0.201, 0.50, 1.0, 10.0];
    for (const r of superRadii) {
      const pts = new Float32Array(N * 3);
      const loop = [];
      for (let i = 0; i < N; i++) {
        loop.push(i);
        const a = (i * 2 * Math.PI) / N;
        pts[i * 3] = r * Math.cos(a);
        pts[i * 3 + 1] = r * Math.sin(a);
        pts[i * 3 + 2] = 0;
      }
      const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
      assertTrue(fit !== null, `Super-threshold radius r=${r} mm must be accepted`);
      assertCloseTo(fit.radius, r, 1e-3, `Radius matches r=${r} mm`);
    }
  });

  test('R1.2: Planar tolerance sweep: z-warp < 0.10 mm accepted, z-warp > 0.10 mm rejected', () => {
    const N = 16, r = 10.0;
    // Mild warp: 0.08 mm (below 0.10 mm HOLE_PLANAR_TOL)
    const ptsMild = new Float32Array(N * 3);
    const loop = [];
    for (let i = 0; i < N; i++) {
      loop.push(i);
      const a = (i * 2 * Math.PI) / N;
      ptsMild[i * 3] = r * Math.cos(a);
      ptsMild[i * 3 + 1] = r * Math.sin(a);
      ptsMild[i * 3 + 2] = (i % 2 === 0 ? 0.04 : -0.04); // peak-to-peak = 0.08 mm, max dev ~ 0.04 < 0.10
    }
    const fitMild = MeshFeatureDetector.fitCircleToLoop(loop, ptsMild);
    assertTrue(fitMild !== null, 'Mild out-of-plane warp (< 0.10 mm) accepted');

    // Severe warp: 0.15 mm (above 0.10 mm HOLE_PLANAR_TOL)
    const ptsSevere = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      ptsSevere[i * 3] = r * Math.cos(a);
      ptsSevere[i * 3 + 1] = r * Math.sin(a);
      ptsSevere[i * 3 + 2] = (i % 2 === 0 ? 0.15 : -0.15); // dev = 0.15 > 0.10
    }
    const fitSevere = MeshFeatureDetector.fitCircleToLoop(loop, ptsSevere);
    assertEqual(fitSevere, null, 'Severe out-of-plane warp (0.15 mm >= 0.10 mm) rejected');
  });

  test('R1.3: Anisotropic aspect ratio sweep: circle (aspect 1.0) accepted, ellipse (aspect 1.3) rejected', () => {
    const N = 16;
    // Circular: a=10, b=10
    const ptsCirc = new Float32Array(N * 3);
    const loop = [];
    for (let i = 0; i < N; i++) {
      loop.push(i);
      const th = (i * 2 * Math.PI) / N;
      ptsCirc[i * 3] = 10 * Math.cos(th);
      ptsCirc[i * 3 + 1] = 10 * Math.sin(th);
      ptsCirc[i * 3 + 2] = 0;
    }
    const fitCirc = MeshFeatureDetector.fitCircleToLoop(loop, ptsCirc);
    assertTrue(fitCirc !== null, 'Circular loop accepted');

    // Elliptical: a=10, b=7 (ratio 1.43, radial residual >> 5%)
    const ptsEll = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = (i * 2 * Math.PI) / N;
      ptsEll[i * 3] = 10 * Math.cos(th);
      ptsEll[i * 3 + 1] = 7 * Math.sin(th);
      ptsEll[i * 3 + 2] = 0;
    }
    const fitEll = MeshFeatureDetector.fitCircleToLoop(loop, ptsEll);
    assertEqual(fitEll, null, 'Elliptical loop rejected by residual threshold');
  });
});

describe('C2.R2 Suite 2: MeasureEngine Snapping & Pitch Dimensioning End-to-End', () => {
  test('R2.1: Proximity snapping accurately distinguishes hole centers separated by 0.5 mm in screen space', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMeasureEngine: true });
    env.context.renderer = env.renderer;
    env.context.camera = env.camera;
    env.renderer.domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.context.modelGroup.add(mesh);
    env.context.isMeasureActive = true;

    const c1 = { type: 'circle', radius: 1, diameter: 2, center: [10.0, 10.0, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    const c2 = { type: 'circle', radius: 1, diameter: 2, center: [10.5, 10.0, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    env.context.modelEdgeFeatures = [c1, c2];
    env.context.indexModelVertices([mesh]);

    const proj1 = new env.THREE.Vector3(10.0, 10.0, 0).project(env.camera);
    const px1 = (proj1.x * 0.5 + 0.5) * 1280;
    const py1 = (-proj1.y * 0.5 + 0.5) * 720;

    const proj2 = new env.THREE.Vector3(10.5, 10.0, 0).project(env.camera);
    const px2 = (proj2.x * 0.5 + 0.5) * 1280;

    // Pick 10% from c1 -> selects c1
    const snap1 = env.context.findSnapTarget({ clientX: px1 + (px2 - px1) * 0.1, clientY: py1 });
    assertTrue(snap1 !== null && snap1.subType === 'center', 'Snapped to center');
    assertCloseTo(snap1.point.x, 10.0, 1e-4, 'Selected c1');

    // Pick 90% from c1 (closer to c2) -> selects c2
    const snap2 = env.context.findSnapTarget({ clientX: px1 + (px2 - px1) * 0.9, clientY: py1 });
    assertTrue(snap2 !== null && snap2.subType === 'center', 'Snapped to center');
    assertCloseTo(snap2.point.x, 10.5, 1e-4, 'Selected c2');
  });

  test('R2.2: Three-hole pitch dimensioning via handleUnifiedClick updates DOM pitch and deltas accurately', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMeasureEngine: true });
    env.context.renderer = env.renderer;
    env.context.camera = env.camera;
    env.context.isMeasureActive = true;

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.context.modelGroup.add(mesh);

    const hA = { type: 'circle', radius: 2, diameter: 4, center: [0, 0, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    const hB = { type: 'circle', radius: 2, diameter: 4, center: [30, 40, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    env.context.modelEdgeFeatures = [hA, hB];
    env.context.indexModelVertices([mesh]);

    const snapA = { type: 'circle', feature: hA, point: new env.THREE.Vector3(...hA.center) };
    const snapB = { type: 'circle', feature: hB, point: new env.THREE.Vector3(...hB.center) };

    env.context.handleUnifiedClick(snapA);
    env.context.handleUnifiedClick(snapB);

    const distEl = env.document.getElementById('measure-dist');
    const deltasEl = env.document.getElementById('measure-deltas');
    assertEqual(distEl.innerText, 'Pitch: 50.00 mm', 'Pitch distance 50.00 mm');
    assertTrue(deltasEl.innerHTML.includes('30.00') && deltasEl.innerHTML.includes('40.00'), 'Deltas accurate');
  });
});

describe('C2.R2 Suite 3: MaterialsEngine Infill & Print Metrics Conservation', () => {
  test('R3.1: Infill linearity: mass at 50% is exactly 2.5x mass at 20% across all 5 filaments', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.window.activeCadFormat = 'STL';
    env.context.modelPhysicalProps = { volumeMm3: 10000 }; // 10 cm³
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    const filaments = ['pla', 'petg', 'abs', 'tpu', 'resin'];
    for (const f of filaments) {
      env.window.MaterialsEngine.selectMaterial(f);

      env.window.MaterialsEngine.setInfill(20);
      const m20 = env.window.MaterialsEngine.getPrintMetrics();

      env.window.MaterialsEngine.setInfill(50);
      const m50 = env.window.MaterialsEngine.getPrintMetrics();

      assertCloseTo(m50.massGrams / m20.massGrams, 2.5, 1e-5, `Filament ${f} mass scales linearly (50/20 = 2.5)`);
      assertCloseTo(m50.filamentLengthMeters / m20.filamentLengthMeters, 2.5, 1e-5, `Filament ${f} length scales linearly`);
    }
  });
});

describe('C2.R2 Suite 4: Appearance Popover Color Mutation & Reset Integrity', () => {
  test('R4.1: Appearance popover updates customColor, material hex, and restores orig on reset', () => {
    const env = createCadEnvironment({ loadCadState: true, loadAppearancePopover: true });
    env.window.setupAppearanceListeners();

    const geom = new env.THREE.BoxGeometry(10, 10, 10);
    const mat = new env.THREE.MeshStandardMaterial({ color: 0x999999 });
    const mesh = new env.THREE.Mesh(geom, mat);

    const body = {
      id: 'body_part_1',
      name: 'Bracket',
      mesh: mesh,
      originalColor: new env.THREE.Color(0x999999),
      data: { volumeMm3: 1000 }
    };
    env.context.modelBodies = [body];
    env.window.modelBodies = [body];

    // Open popover
    env.window.openColorPickerPopover('body_part_1');
    const popover = env.document.getElementById('color-picker-popover');
    assertEqual(popover.style.display, 'flex', 'Popover displayed');

    // Apply #ef4444 (Crimson)
    const input = env.document.getElementById('popover-color-input');
    input.value = '#ef4444';
    const btnApply = env.document.getElementById('btn-apply-custom-color');
    btnApply.click();

    assertEqual(mesh.material.color.getHexString(), 'ef4444', 'Material color changed to crimson');
    assertEqual(body.customColor, '#ef4444', 'Body state updated');

    // Reset color
    const btnReset = env.document.getElementById('btn-reset-orig-color');
    btnReset.click();
    assertEqual(mesh.material.color.getHexString(), '999999', 'Material color restored');
    assertEqual(body.customColor, null, 'Custom color cleared');
  });
});

if (require.main === module) {
  const summary = reportSummary();
  exitProcess();
}
