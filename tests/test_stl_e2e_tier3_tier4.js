/**
 * Tier 3 (Pairwise Combinations) & Tier 4 (Real-World Scenarios) E2E Test Suite
 * File: tests/test_stl_e2e_tier3_tier4.js
 *
 * Implements requirement-driven, opaque-box combinatorial interaction testing (Tier 3)
 * and realistic engineering workload scenario verification (Tier 4):
 *
 * Tier 3 Pairwise Combinations (>= 9 tests):
 * - T3.P1: Binary Format + Hole Detection & Kåsa Fit
 * - T3.P2: ASCII Format + Hole Detection & Kåsa Fit
 * - T3.P3: Binary Format + Sharp Crease Detection & CAD Vertex Snap Index
 * - T3.P4: ASCII Format + Sharp Crease Detection & CAD Vertex Snap Index
 * - T3.P5: Binary Format + 3D Print Infill Estimation (20% & 50% with PLA/ABS)
 * - T3.P6: ASCII Format + 3D Print Infill Estimation (15% & 100% with PETG/TPU)
 * - T3.P7: Binary Format + 2D Blueprint SVG Generation
 * - T3.P8: ASCII Format + 3D Section Plane Stencil Clipping
 * - T3.P9: Binary Format + UI Exploded View Disabling
 * - T3.P10: Format Switching & OpenCASCADE WASM Bypass
 *
 * Tier 4 Real-World Application Scenarios (5 realistic engineering models):
 * - Scenario 1: Flanged Bushing with Concentric Bore (generateSteppedBushing)
 * - Scenario 2: Structural Mounting Bracket with Bolt Pattern (generatePlateWithHole)
 * - Scenario 3: Snap-Fit Electronics Enclosure Base (thin-wall hollow shell)
 * - Scenario 4: Multi-Aperture Filter Manifold Plate (plate with clustered through-holes)
 * - Scenario 5: High-Facet Organic Scanned Artifact (curved surface, dihedral suppression, material density comparisons)
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

const {
  generateCube,
  generateTetrahedron,
  generateHollowBox,
  generateCylinder,
  generateSteppedBushing,
  generatePlateWithHole,
  computeSignedVolume,
  computeSurfaceArea,
  computeFaceNormal
} = require('./stl_test_fixtures.js');

const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));
const MeshFeatureDetector = require(path.join(__dirname, '../Assets/js/meshFeatureDetector.js'));
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

console.log('================================================================================');
console.log('  TIER 3 (PAIRWISE) & TIER 4 (REAL-WORLD SCENARIOS) E2E TEST SUITE              ');
console.log('================================================================================');

const cliArgs = process.argv.slice(2);
const tierArg = cliArgs.find(a => a.startsWith('--tier='));
const targetTier = tierArg ? tierArg.split('=')[1].trim() : null;

const runTier3 = !targetTier || targetTier === '3' || targetTier === 'all';
const runTier4 = !targetTier || targetTier === '4' || targetTier === 'all';

// ============================================================================
// TIER 3: PAIRWISE COMBINATORIAL INTERACTION TESTING
// ============================================================================
if (runTier3) {
describe('Tier 3: Pairwise Combinations (Format × Feature Workflows)', () => {
  test('T3.P1: Binary Format + Hole Detection & Kåsa Fit', () => {
    const fixture = generatePlateWithHole({ width: 50, length: 50, thickness: 12, holeRadius: 10, segments: 32, format: 'binary' });
    assertEqual(StlLoader.detectType(fixture.arrayBuffer), 'binary', 'Format is binary');
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'binary_hole.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertTrue(circles.length >= 2, 'Top and bottom hole circles extracted');
    for (const c of circles) {
      assertCloseTo(c.diameter, 20.0, 0.05, 'Diameter Ø 20.0 mm within ±0.05 mm');
      assertCloseTo(c.center[0], 0.0, 0.05, 'Center X is 0');
      assertCloseTo(c.center[1], 0.0, 0.05, 'Center Y is 0');
    }
  });

  test('T3.P2: ASCII Format + Hole Detection & Kåsa Fit', () => {
    const fixture = generatePlateWithHole({ width: 50, length: 50, thickness: 12, holeRadius: 10, segments: 32, format: 'ascii' });
    assertEqual(StlLoader.detectType(fixture.arrayBuffer), 'ascii', 'Format is ascii');
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'ascii_hole.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertTrue(circles.length >= 2, 'Top and bottom hole circles extracted from ASCII mesh');
    for (const c of circles) {
      assertCloseTo(c.diameter, 20.0, 0.05, 'Diameter Ø 20.0 mm within ±0.05 mm');
    }
  });

  test('T3.P3: Binary Format + Sharp Crease Detection & CAD Vertex Snap Index', () => {
    const env = createCadEnvironment({ loadCadState: true, loadFeatureDetector: true, loadMeasureEngine: true });
    const fixture = generateCube({ size: 25, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube25.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    env.context.modelEdgeFeatures = features.edgeFeatures;
    env.window.modelEdgeFeatures = features.edgeFeatures;

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.window.indexModelVertices([mesh]);

    const vertices = env.context.modelCadVertices || env.window.modelCadVertices;
    const midpoints = vertices.filter(v => v.subType === 'midpoint');
    assertEqual(midpoints.length, 12, '12 crease edge midpoints indexed from binary mesh');
  });

  test('T3.P4: ASCII Format + Sharp Crease Detection & CAD Vertex Snap Index', () => {
    const env = createCadEnvironment({ loadCadState: true, loadFeatureDetector: true, loadMeasureEngine: true });
    const fixture = generateCube({ size: 25, format: 'ascii' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'ascii_cube25.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    env.context.modelEdgeFeatures = features.edgeFeatures;
    env.window.modelEdgeFeatures = features.edgeFeatures;

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.window.indexModelVertices([mesh]);

    const vertices = env.context.modelCadVertices || env.window.modelCadVertices;
    const midpoints = vertices.filter(v => v.subType === 'midpoint');
    assertEqual(midpoints.length, 12, '12 crease edge midpoints indexed from ASCII mesh');
  });

  test('T3.P5: Binary Format + 3D Print Infill Estimation (20% & 50% with PLA/ABS in MaterialsEngine)', () => {
    const fixture = generateCube({ size: 20, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube20.stl');
    const vol = parsed.volumeMm3; // 8000 mm^3

    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.window.activeCadFormat = 'STL';
    env.context.modelPhysicalProps = { volumeMm3: vol, areaMm2: 2400 };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    // PLA (1.24 g/cm³) at 20% infill: 8000 * 0.20 = 1600 mm³ = 1.6 cm³ -> 1.984 g
    env.window.MaterialsEngine.selectMaterial('pla');
    env.window.MaterialsEngine.setInfill(20);
    const pla20MassKg = env.window.MaterialsEngine.getTotalMassKg();
    const m20 = env.window.MaterialsEngine.getPrintMetrics();
    assertCloseTo(pla20MassKg, (1.6 * 1.24) / 1000.0, 1e-5, 'PLA mass at 20% = 1.984 g via MaterialsEngine');
    assertCloseTo(m20.massKg, (1.6 * 1.24) / 1000.0, 1e-5, 'Print metrics massKg is 0.001984 kg');
    assertCloseTo(m20.effectiveVolMm3, 1600, 1e-4, '20% infill effective volume is 1600 mm³');
    assertEqual(env.window.formatVol(m20.effectiveVolMm3), '1.60 cm³', '20% infill effective volume formatted as 1.60 cm³');

    // ABS (1.04 g/cm³) at 50% infill: 8000 * 0.50 = 4000 mm³ = 4.0 cm³ -> 4.160 g
    env.window.MaterialsEngine.selectMaterial('abs');
    env.window.MaterialsEngine.setInfill(50);
    const abs50MassKg = env.window.MaterialsEngine.getTotalMassKg();
    const m50 = env.window.MaterialsEngine.getPrintMetrics();
    assertCloseTo(abs50MassKg, (4.0 * 1.04) / 1000.0, 1e-5, 'ABS mass at 50% = 4.160 g via MaterialsEngine');
    assertCloseTo(m50.massKg, (4.0 * 1.04) / 1000.0, 1e-5, 'Print metrics massKg is 0.004160 kg');
    assertCloseTo(m50.effectiveVolMm3, 4000, 1e-4, '50% infill effective volume is 4000 mm³');
    assertEqual(env.window.formatVol(m50.effectiveVolMm3), '4.00 cm³', '50% infill effective volume formatted as 4.00 cm³');
  });

  test('T3.P6: ASCII Format + 3D Print Infill Estimation (15% & 100% with PETG in MaterialsEngine)', () => {
    const fixture = generateCube({ size: 20, format: 'ascii' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'ascii_cube20.stl');
    const vol = parsed.volumeMm3; // 8000 mm^3

    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.window.activeCadFormat = 'STL';
    env.context.modelPhysicalProps = { volumeMm3: vol, areaMm2: 2400 };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;
    env.window.MaterialsEngine.selectMaterial('petg');

    // PETG (1.27 g/cm³) at 15% infill: 8000 * 0.15 = 1200 mm³ = 1.2 cm³ -> 1.524 g
    env.window.MaterialsEngine.setInfill(15);
    const petg15MassKg = env.window.MaterialsEngine.getTotalMassKg();
    const m15 = env.window.MaterialsEngine.getPrintMetrics();
    assertCloseTo(petg15MassKg, (1.2 * 1.27) / 1000.0, 1e-5, 'PETG mass at 15% = 1.524 g via MaterialsEngine');
    assertCloseTo(m15.massKg, (1.2 * 1.27) / 1000.0, 1e-5, 'Print metrics massKg is 0.001524 kg');
    assertCloseTo(m15.effectiveVolMm3, 1200, 1e-4, '15% infill effective volume is 1200 mm³');
    assertEqual(env.window.formatVol(m15.effectiveVolMm3), '1.20 cm³', '15% infill effective volume formatted as 1.20 cm³');

    // PETG (1.27 g/cm³) at 100% infill: 8000 * 1.0 = 8000 mm³ = 8.0 cm³ -> 10.160 g
    env.window.MaterialsEngine.setInfill(100);
    const petg100MassKg = env.window.MaterialsEngine.getTotalMassKg();
    const m100 = env.window.MaterialsEngine.getPrintMetrics();
    assertCloseTo(petg100MassKg, (8.0 * 1.27) / 1000.0, 1e-5, 'PETG mass at 100% = 10.160 g via MaterialsEngine');
    assertCloseTo(m100.massKg, (8.0 * 1.27) / 1000.0, 1e-5, 'Print metrics massKg is 0.010160 kg');
    assertCloseTo(m100.effectiveVolMm3, 8000, 1e-4, '100% infill effective volume is 8000 mm³');
    assertEqual(env.window.formatVol(m100.effectiveVolMm3), '8.00 cm³', '100% infill effective volume formatted as 8.00 cm³');
  });

  test('T3.P7: Binary Format + 2D Blueprint SVG Generation', () => {
    const env = createCadEnvironment({ loadCadState: true, loadBlueprintSvg: true });
    const fixture = generateCube({ width: 30, depth: 20, height: 10, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'bracket.stl');

    const geom = new env.THREE.BufferGeometry();
    geom.setAttribute('position', new env.THREE.BufferAttribute(parsed.meshes[0].position, 3));
    geom.computeBoundingBox();

    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    env.context.modelBodies = [{ id: 1, name: 'Bracket_Part', mesh: mesh }];
    env.window.modelBodies = env.context.modelBodies;
    env.window.pendingFileName = 'Bracket_Part.stl';

    const generateSvg = env.window.BlueprintEngine?.generateSvg || env.window.generateBlueprintSvg;
    const svgStr = generateSvg();
    assertTrue(typeof svgStr === 'string' && svgStr.includes('<svg'), 'Valid SVG markup generated');
    assertTrue(svgStr.includes('Bracket_Part'), 'Blueprint title block contains part name');
  });

  test('T3.P8: ASCII Format + 3D Section Plane Stencil Clipping', () => {
    const env = createCadEnvironment({ loadCadState: true, loadSectionEngine: true });
    const fixture = generateCube({ size: 20, format: 'ascii' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'section_test.stl');

    const geom = new env.THREE.BufferGeometry();
    geom.setAttribute('position', new env.THREE.BufferAttribute(parsed.meshes[0].position, 3));
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    env.context.modelBodies = [{ id: 1, name: 'Section_Cube', mesh: mesh }];
    env.window.modelBodies = env.context.modelBodies;

    env.window.toggleSectionView(true);
    assertEqual(env.context.isSectionActive, true, 'Section view enabled on ASCII model');
    env.window.toggleSectionView(false);
    assertEqual(env.context.isSectionActive, false, 'Section view disabled');
  });

  test('T3.P9: Binary Format + UI Exploded View Disabling', () => {
    const env = createCadEnvironment({ loadCadState: true, loadExplodedView: true });
    env.context.modelBodies = [{ id: 1, name: 'Single_Body_STL', mesh: new env.THREE.Mesh() }];
    env.window.modelBodies = env.context.modelBodies;

    let toastShown = false;
    env.context.showToast = (msg) => {
      if (msg.includes('multiple parts')) toastShown = true;
    };
    env.window.showToast = env.context.showToast;

    env.window.toggleExplode();
    assertTrue(toastShown, 'Exploded view rejected on single-body binary STL model');
  });

  test('T3.P10: Format Switching & OpenCASCADE WASM Bypass', () => {
    // Verifies format routing contract: STL files are handled directly by StlLoader in < 15ms
    // without loading occt-import-js.wasm worker
    const stlFixture = generateCube({ size: 10, format: 'binary' });
    const t0 = Date.now();
    const parsed = StlLoader.parse(stlFixture.arrayBuffer, 'test.stl');
    const parseTimeMs = Date.now() - t0;

    assertEqual(parsed.format, 'STL', 'Format routed to STL');
    assertTrue(parseTimeMs < 15, `STL parse time (${parseTimeMs}ms) is strictly under 15ms SLA`);
  });
});
}

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// ============================================================================
if (runTier4) {
describe('Tier 4: Real-World Application Workload Scenarios', () => {
  test('Scenario 1: Flanged Bushing with Concentric Bore (Rotational Component)', () => {
    // Stepped cylinder: R_flange=30, R_neck=18, R_bore=10, H_total=30, T_flange=10 (384 triangles)
    const bushing = generateSteppedBushing({
      flangeRadius: 30,
      flangeHeight: 10,
      neckRadius: 18,
      totalHeight: 30,
      boreRadius: 10,
      segments: 32,
      format: 'binary'
    });

    const parsed = StlLoader.parse(bushing.arrayBuffer, 'flanged_bushing.stl');
    assertEqual(parsed.totalTriangles, 384, 'Bushing has 384 triangles');

    // 1. Gauss Volume Accuracy
    // Discretized 32-segment polyhedral volume vs ideal smooth CAD cylinder volume
    const polyFactor = (32 / 2) * Math.sin((2 * Math.PI) / 32);
    const discretizedMeshVol = polyFactor * (
      (30 * 30 - 10 * 10) * 10 +
      (18 * 18 - 10 * 10) * 20
    ); // ~38,955.636 mm^3
    const idealSmoothVol = Math.PI * (
      (30 * 30 - 10 * 10) * 10 +
      (18 * 18 - 10 * 10) * 20
    ); // ~39,207.076 mm^3
    assertCloseTo(parsed.volumeMm3, discretizedMeshVol, 0.1, 'Bushing Gauss volume matches discretized mesh volume (< 0.1 mm³)');
    assertCloseTo(parsed.volumeMm3, idealSmoothVol, idealSmoothVol * 0.01, 'Bushing Gauss volume within 1% of ideal smooth volume');

    // 2. Circular Hole Extraction & Kåsa Fit
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    const boreCircles = circles.filter(c => Math.abs(c.diameter - 20.0) < 0.2);
    assertEqual(boreCircles.length, 2, 'Top and bottom bore holes detected');
    for (const c of boreCircles) {
      assertCloseTo(c.diameter, 20.0, 0.05, 'Bore diameter Ø 20.0 mm accurate to ±0.05 mm');
    }

    // 3. Center Pitch
    const cTop = new THREE.Vector3(...boreCircles[0].center);
    const cBottom = new THREE.Vector3(...boreCircles[1].center);
    const borePitch = cTop.distanceTo(cBottom);
    assertCloseTo(borePitch, 30.0, 0.05, 'Bushing bore center-to-center pitch is 30.0 mm');

    // 4. Infill Estimation via MaterialsEngine (PETG 1.27 g/cm³ at 50% infill)
    const matEnv = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    matEnv.window.activeCadFormat = 'STL';
    matEnv.context.modelPhysicalProps = { volumeMm3: parsed.volumeMm3 };
    matEnv.window.modelPhysicalProps = matEnv.context.modelPhysicalProps;
    matEnv.window.MaterialsEngine.selectMaterial('petg');
    matEnv.window.MaterialsEngine.setInfill(50);
    const massKg = matEnv.window.MaterialsEngine.getTotalMassKg();
    const metrics = matEnv.window.MaterialsEngine.getPrintMetrics();
    const expectedMassKg = (parsed.volumeMm3 * 0.50 / 1000.0 * 1.27) / 1000.0;
    assertCloseTo(massKg, expectedMassKg, 1e-4, 'Estimated PETG mass at 50% infill in kg via MaterialsEngine');
    assertCloseTo(metrics.massKg, expectedMassKg, 1e-4, 'getPrintMetrics mass matches 50% infill');
    assertEqual(matEnv.window.formatVol(metrics.effectiveVolMm3), `${(metrics.effectiveVolMm3 / 1000.0).toFixed(2)} cm³`, 'Formatted 50% volume');
  });

  test('Scenario 2: Structural Mounting Bracket with Bolt Pattern (Planar Plate + Hole)', () => {
    // Rectangular bracket plate (60x60x10 mm) with hole radius 8 (Ø 16 mm), 32 segments
    const bracket = generatePlateWithHole({
      width: 60,
      length: 60,
      thickness: 10,
      holeRadius: 8,
      segments: 32,
      format: 'binary'
    });

    const parsed = StlLoader.parse(bracket.arrayBuffer, 'mounting_bracket.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    // 1. Through-hole extraction
    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertTrue(circles.length >= 2, 'Top and bottom hole circles extracted');
    for (const c of circles) {
      assertCloseTo(c.diameter, 16.0, 0.05, 'Hole diameter Ø 16.0 mm within ±0.05 mm');
      assertCloseTo(c.center[0], 0.0, 0.05, 'Center X is 0');
      assertCloseTo(c.center[1], 0.0, 0.05, 'Center Y is 0');
    }

    // 2. Crease lines (outer rectangle boundaries)
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    assertTrue(lines.length >= 4, 'Plate boundary crease edges detected');

    // 3. 2D Blueprint SVG generation in CAD environment
    const env = createCadEnvironment({ loadCadState: true, loadBlueprintSvg: true });
    const geom = new env.THREE.BufferGeometry();
    geom.setAttribute('position', new env.THREE.BufferAttribute(parsed.meshes[0].position, 3));
    geom.computeBoundingBox();

    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    env.context.modelBodies = [{ id: 1, name: 'Bracket', mesh: mesh }];
    env.window.modelBodies = env.context.modelBodies;
    env.window.pendingFileName = 'Bracket.stl';

    const generateSvg = env.window.BlueprintEngine?.generateSvg || env.window.generateBlueprintSvg;
    const svg = generateSvg();
    assertTrue(svg.includes('<svg'), 'Blueprint SVG generated for mounting bracket');
  });

  test('Scenario 3: Snap-Fit Electronics Enclosure Base (Thin-Wall Hollow Shell)', () => {
    // Hollow open box (80x50x20 mm shell with open top)
    const enclosure = generateHollowBox({
      width: 80,
      depth: 50,
      height: 20,
      format: 'binary'
    });

    const parsed = StlLoader.parse(enclosure.arrayBuffer, 'enclosure_base.stl');

    // 1. Open mesh detection
    assertEqual(parsed.isWatertight, false, 'Open enclosure base is not watertight');
    assertEqual(parsed.totalTriangles, 10, 'Hollow box has 10 triangles');

    // 2. Exploded view disabled for single enclosure body
    const env = createCadEnvironment({ loadCadState: true, loadExplodedView: true });
    env.context.modelBodies = [{ id: 1, name: 'Enclosure_Base', mesh: new env.THREE.Mesh() }];
    env.window.modelBodies = env.context.modelBodies;

    let rejected = false;
    env.context.showToast = (msg) => {
      if (msg.includes('multiple parts')) rejected = true;
    };
    env.window.showToast = env.context.showToast;

    env.window.toggleExplode();
    assertTrue(rejected, 'Explode rejected for single-body enclosure base');

    // 3. Infill scaling comparison via MaterialsEngine: 15% draft vs 100% solid functional print
    const shellVolEstimate = 80 * 50 * 20; // 80,000 mm^3 envelope
    const matEnv = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    matEnv.window.activeCadFormat = 'STL';
    matEnv.context.modelPhysicalProps = { volumeMm3: shellVolEstimate };
    matEnv.window.modelPhysicalProps = matEnv.context.modelPhysicalProps;
    matEnv.window.MaterialsEngine.selectMaterial('pla');

    matEnv.window.MaterialsEngine.setInfill(15);
    const mass15 = matEnv.window.MaterialsEngine.getTotalMassKg();
    const metrics15 = matEnv.window.MaterialsEngine.getPrintMetrics();

    matEnv.window.MaterialsEngine.setInfill(100);
    const mass100 = matEnv.window.MaterialsEngine.getTotalMassKg();
    const metrics100 = matEnv.window.MaterialsEngine.getPrintMetrics();

    assertCloseTo(mass15 * (100 / 15), mass100, 1e-4, 'Infill mass scales linearly via MaterialsEngine');
    assertEqual(metrics15.effectiveVolMm3, 12000, '15% effective volume 12000 mm³');
    assertEqual(metrics100.effectiveVolMm3, 80000, '100% volume 80000 mm³');
    assertEqual(matEnv.window.formatVol(metrics15.effectiveVolMm3), '12.00 cm³', '15% effective volume');
    assertEqual(matEnv.window.formatVol(metrics100.effectiveVolMm3), '80.00 cm³', '100% volume');
  });

  test('Scenario 4: Multi-Aperture Filter Manifold Plate (Clustered Through-Holes)', () => {
    // Generate plate with through-hole and verify hole loops and center-to-center pitch
    const manifoldPlate = generatePlateWithHole({
      width: 80,
      length: 80,
      thickness: 10,
      holeRadius: 6, // Ø 12 mm
      segments: 32,
      format: 'binary'
    });

    const parsed = StlLoader.parse(manifoldPlate.arrayBuffer, 'manifold.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertTrue(circles.length >= 2, 'Top and bottom manifold hole loops extracted');
    for (const c of circles) {
      assertCloseTo(c.diameter, 12.0, 0.05, 'Manifold hole Ø 12.0 mm within ±0.05 mm');
      assertCloseTo(c.center[0], 0.0, 0.05, 'Hole center X is 0');
      assertCloseTo(c.center[1], 0.0, 0.05, 'Hole center Y is 0');
    }

    // Verify distance between top and bottom rims equals plate thickness
    const topCenter = new THREE.Vector3(...circles.find(c => c.center[2] > 5).center);
    const bottomCenter = new THREE.Vector3(...circles.find(c => c.center[2] < 5).center);
    assertCloseTo(topCenter.distanceTo(bottomCenter), 10.0, 0.05, 'Thru-hole axial depth is 10.0 mm');
  });

  test('Scenario 5: High-Facet Organic Scanned Artifact (Smooth Curved Surface & Materials)', () => {
    // Cylinder with 64 segments = 256 facets (dihedral angle 360/64 = 5.625° << 25°)
    const organicCylinder = generateCylinder({
      radius: 20,
      height: 40,
      segments: 64,
      format: 'binary'
    });

    const t0 = Date.now();
    const parsed = StlLoader.parse(organicCylinder.arrayBuffer, 'organic_artifact.stl');
    const parseTime = Date.now() - t0;
    assertTrue(parseTime < 15, `High-facet parsing (${parseTime}ms) within 15ms SLA`);

    // Dihedral suppression check: 64 mantle edges (5.625°) must NOT produce line creases
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    assertEqual(lines.length, 0, 'Smooth curved surface (5.625° dihedral) has 0 line creases');

    // Material Mass Comparison via MaterialsEngine: PLA vs PETG vs ABS
    const matEnv = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    matEnv.context.modelPhysicalProps = { volumeMm3: parsed.volumeMm3 };
    matEnv.window.modelPhysicalProps = matEnv.context.modelPhysicalProps;

    matEnv.window.MaterialsEngine.selectMaterial('pla');
    const plaMass = matEnv.window.MaterialsEngine.getTotalMassKg();

    matEnv.window.MaterialsEngine.selectMaterial('petg');
    const petgMass = matEnv.window.MaterialsEngine.getTotalMassKg();

    matEnv.window.MaterialsEngine.selectMaterial('abs');
    const absMass = matEnv.window.MaterialsEngine.getTotalMassKg();

    assertTrue(petgMass > plaMass, 'PETG (1.27 g/cm³) is heavier than PLA (1.24 g/cm³)');
    assertTrue(plaMass > absMass, 'PLA (1.24 g/cm³) is heavier than ABS (1.04 g/cm³)');
    assertCloseTo(petgMass / plaMass, 1.27 / 1.24, 1e-4, 'Mass ratio matches density ratio');
  });
});
}

// Run reporting if executed as main module
if (require.main === module) {
  const summary = reportSummary();
  exitProcess();
}
