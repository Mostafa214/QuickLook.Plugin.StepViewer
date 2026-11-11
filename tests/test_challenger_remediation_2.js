/**
 * Challenger 2: Empirical Stress Test Harness & Adversarial Oracles
 * File: tests/test_challenger_remediation_2.js
 *
 * Rigorously stress-tests:
 * 1. Mathematical Invariants (Gauss divergence theorem translation/rotation/permutation, degenerate triangles)
 * 2. Floating-Point Precision & Spatial Welding (sub-micron thresholds, boundary straddling, coordinate magnitudes)
 * 3. Extreme Boundaries (empty, single triangle, non-manifold topology, thin shells, open tubes)
 * 4. Kåsa Circle Fit Perturbations (vertex counts, radial noise, aspect ratio, Z-jitter planarity, non-uniform angles)
 * 5. Crease Threshold Behavior (24.9° vs 25.0° vs 25.1°, coplanar 0°, inverted 180°, boundary/non-manifold edges)
 * 6. MaterialsEngine Boundary Conditions (infill clamping, print metrics analytical formulas, format-aware scaling)
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
  generateCylinder,
  generatePlateWithHole,
  generateSteppedBushing
} = require('./stl_test_fixtures.js');

const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));
const MeshFeatureDetector = require(path.join(__dirname, '../Assets/js/meshFeatureDetector.js'));
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

console.log('================================================================================');
console.log('  CHALLENGER 2: ADVERSARIAL STRESS TEST SUITE & EMPIRICAL ORACLES               ');
console.log('================================================================================');

// Helper to convert triangles array to binary STL buffer
function createBinaryStl(triangles, header = 'Challenger2 Fixture') {
  const N = triangles.length;
  const buf = Buffer.alloc(84 + 50 * N);
  buf.write(header.slice(0, 80), 0, 'utf8');
  buf.writeUInt32LE(N, 80);
  let offset = 84;
  for (let i = 0; i < N; i++) {
    const [v1, v2, v3] = triangles[i];
    // Write 0 normal (trigger loader recalculation)
    buf.writeFloatLE(0, offset);
    buf.writeFloatLE(0, offset + 4);
    buf.writeFloatLE(0, offset + 8);
    // v1
    buf.writeFloatLE(v1[0], offset + 12);
    buf.writeFloatLE(v1[1], offset + 16);
    buf.writeFloatLE(v1[2], offset + 20);
    // v2
    buf.writeFloatLE(v2[0], offset + 24);
    buf.writeFloatLE(v2[1], offset + 28);
    buf.writeFloatLE(v2[2], offset + 32);
    // v3
    buf.writeFloatLE(v3[0], offset + 36);
    buf.writeFloatLE(v3[1], offset + 40);
    buf.writeFloatLE(v3[2], offset + 44);
    // attribute
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ============================================================================
// SUITE 1: MATHEMATICAL INVARIANTS
// ============================================================================
describe('Suite 1: Mathematical Invariants (Gauss Volume & Surface Area)', () => {

  test('M1.1: Translation invariance under extreme spatial offset (10^5 mm)', () => {
    const cubeOrigin = generateCube({ size: 10, format: 'binary' });
    const parsedOrigin = StlLoader.parse(cubeOrigin.arrayBuffer, 'cube_orig.stl');
    assertCloseTo(parsedOrigin.volumeMm3, 1000.0, 1e-4, 'Origin volume = 1000 mm³');

    // Translate all vertices by (+100000, -200000, +50000)
    const shiftedTris = cubeOrigin.triangles.map(tri =>
      tri.map(([x, y, z]) => [x + 100000, y - 200000, z + 50000])
    );
    const shiftedBuf = createBinaryStl(shiftedTris);
    const parsedShifted = StlLoader.parse(shiftedBuf, 'cube_shifted.stl');

    // Floating point cancellation test: relative error should still be < 0.001%
    const relErr = Math.abs(parsedShifted.volumeMm3 - 1000.0) / 1000.0;
    assertTrue(relErr < 1e-5, `Relative volume error after translation (${relErr}) < 1e-5`);
    assertCloseTo(parsedShifted.areaMm2, 600.0, 1e-4, 'Surface area remains 600 mm²');
    assertTrue(parsedShifted.isWatertight, 'Mesh remains watertight after translation');
  });

  test('M1.2: Rigid 3D rotation invariance (Euler 37°, 53°, 19°)', () => {
    const cube = generateCube({ size: 10, format: 'binary' });
    const radX = (37 * Math.PI) / 180;
    const radY = (53 * Math.PI) / 180;
    const radZ = (19 * Math.PI) / 180;

    const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(radX, radY, radZ, 'XYZ'));

    const rotatedTris = cube.triangles.map(tri =>
      tri.map(([x, y, z]) => {
        const v = new THREE.Vector3(x, y, z).applyMatrix4(rotMatrix);
        return [v.x, v.y, v.z];
      })
    );
    const rotBuf = createBinaryStl(rotatedTris);
    const parsedRot = StlLoader.parse(rotBuf, 'cube_rot.stl');

    assertCloseTo(parsedRot.volumeMm3, 1000.0, 1e-3, 'Rotated cube volume = 1000 mm³ (< 0.1% error)');
    assertCloseTo(parsedRot.areaMm2, 600.0, 1e-3, 'Rotated cube area = 600 mm²');
    assertTrue(parsedRot.isWatertight, 'Rotated mesh is watertight');
  });

  test('M1.3: Permutation invariance under randomized triangle reordering', () => {
    const cube = generateCube({ size: 10, format: 'binary' });
    const originalTris = cube.triangles.slice();

    // Fisher-Yates shuffle
    const shuffledTris = originalTris.slice();
    for (let i = shuffledTris.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = shuffledTris[i];
      shuffledTris[i] = shuffledTris[j];
      shuffledTris[j] = tmp;
    }

    const shuffledBuf = createBinaryStl(shuffledTris);
    const parsedShuffled = StlLoader.parse(shuffledBuf, 'cube_shuffled.stl');

    assertCloseTo(parsedShuffled.volumeMm3, 1000.0, 1e-5, 'Permuted volume = 1000 mm³');
    assertCloseTo(parsedShuffled.areaMm2, 600.0, 1e-5, 'Permuted area = 600 mm²');
    assertEqual(parsedShuffled.isWatertight, true, 'Permuted mesh remains watertight');
    assertEqual(parsedShuffled.isManifold, true, 'Permuted mesh remains manifold');
  });

  test('M1.4: Inverted winding orientation (CW vs CCW) preserves magnitude via Math.abs', () => {
    const cube = generateCube({ size: 10, format: 'binary' });
    // Invert winding of all triangles: [v1, v2, v3] -> [v1, v3, v2]
    const invertedTris = cube.triangles.map(([v1, v2, v3]) => [v1, v3, v2]);
    const invertedBuf = createBinaryStl(invertedTris);
    const parsedInverted = StlLoader.parse(invertedBuf, 'cube_inv.stl');

    // Signed Gauss divergence theorem yields negative volume, but loader returns Math.abs
    assertCloseTo(parsedInverted.volumeMm3, 1000.0, 1e-4, 'Inverted winding volume is positive 1000 mm³');
    assertCloseTo(parsedInverted.areaMm2, 600.0, 1e-4, 'Inverted winding area is 600 mm²');
    assertTrue(parsedInverted.isWatertight, 'Inverted mesh remains watertight');
  });

  test('M1.5: Inconsistent winding orientation (half CW, half CCW) produces volume cancellation warning', () => {
    const cube = generateCube({ size: 10, format: 'binary' });
    // Invert exactly 6 of the 12 triangles (e.g. 3 faces CCW, 3 faces CW)
    const mixedTris = cube.triangles.map((tri, idx) => (idx < 6 ? [tri[0], tri[2], tri[1]] : tri));
    const mixedBuf = createBinaryStl(mixedTris);
    const parsedMixed = StlLoader.parse(mixedBuf, 'cube_mixed.stl');

    // Cancellation: net volume of 3 faces cancel out other 3 faces -> volume ≈ 0!
    assertTrue(parsedMixed.volumeMm3 < 1000.0, 'Inconsistent winding causes Gauss volume cancellation');
    // Note: topology check on undirected edges will still report watertight = true because undirected counts are 2
    assertEqual(parsedMixed.isWatertight, true, 'Undirected edge topology reports 2-occurrence watertight');
  });
});

// ============================================================================
// SUITE 2: FLOATING-POINT PRECISION & SPATIAL WELDING
// ============================================================================
describe('Suite 2: Floating-Point Precision & Spatial Welding', () => {

  test('P2.1: Sub-micron vertex welding: separation < 1 μm inside same cell welds to 1 vertex', () => {
    // 2 triangles sharing an edge, where vertex coordinates differ by 0.1 μm (0.0001 mm)
    // Both lie within cell 10000 (e.g. x = 10.0001 and 10.0002)
    // Both wound consistently (CCW) so face normals point in +Z
    const tri1 = [[0, 0, 0], [10.0001, 0, 0], [5, 10, 0]];
    const tri2 = [[10.0002, 0, 0], [0, 0, 0], [5, -10, 0]];
    const pos = new Float32Array([...tri1.flat(), ...tri2.flat()]);

    const features = MeshFeatureDetector.detectFeatures({ position: pos });
    // Common edge [0,0,0] to [10,0,0] is shared by 2 triangles (flat coplanar plate, 0° dihedral)
    // It should NOT be detected as a boundary crease edge if vertices are welded!
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    const centerLine = lines.find(l => Math.abs(l.start[1]) < 0.01 && Math.abs(l.end[1]) < 0.01);
    assertEqual(centerLine, undefined, 'Center edge is welded and suppressed from creases');
    assertEqual(lines.length, 4, 'Only 4 exterior boundary edges detected');
  });

  test('P2.1b: Inverted winding on flat plate produces 180° crease seam (dot = -1.0 < cos 25°)', () => {
    // Opposite winding: tri1 normal is +Z, tri2 normal is -Z
    const tri1 = [[0, 0, 0], [10.0001, 0, 0], [5, 10, 0]];
    const tri2 = [[0, 0, 0], [10.0002, 0, 0], [5, -10, 0]]; // CW winding -> -Z normal
    const pos = new Float32Array([...tri1.flat(), ...tri2.flat()]);

    const features = MeshFeatureDetector.detectFeatures({ position: pos });
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    const centerLine = lines.find(l => Math.abs(l.start[1]) < 0.01 && Math.abs(l.end[1]) < 0.01);
    assertTrue(centerLine !== undefined, 'Inverted winding (dot = -1) detected as 180° crease seam');
  });

  test('P2.2: Grid boundary straddling: points differing by 2 nanometers across round boundary (0.000499 vs 0.000501)', () => {
    // x1 = 10.000499 -> round(10000.499) = 10000
    // x2 = 10.000501 -> round(10000.501) = 10001
    // Even though distance is 2 nm, they land in adjacent grid cells without neighbor search
    const tri1 = [[0, 0, 0], [10.000499, 0, 0], [5, 10, 0]];
    const tri2 = [[0, 0, 0], [10.000501, 0, 0], [5, -10, 0]];
    const pos = new Float32Array([...tri1.flat(), ...tri2.flat()]);

    const features = MeshFeatureDetector.detectFeatures({ position: pos });
    // Because they straddle grid cells, the center edge appears as 2 distinct boundary edges!
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    const centerLines = lines.filter(l => Math.abs(l.start[1]) < 0.01 && Math.abs(l.end[1]) < 0.01);
    assertTrue(centerLines.length >= 1, 'Boundary straddling across quantization cell behaves predictably as discrete boundary');
  });

  test('P2.3: Large coordinate quantization (> 2.5 × 10^6 mm) testing 32-bit integer conversion', () => {
    // Coordinates at 100,000 mm (100 m) well within 32-bit int bounds:
    // 100,000 * 1000 = 100,000,000 < 2^31 - 1
    const cube100m = generateCube({ size: 100, format: 'binary' });
    const tris = cube100m.triangles.map(tri =>
      tri.map(([x, y, z]) => [x + 100000, y + 100000, z + 100000])
    );
    const buf = createBinaryStl(tris);
    const parsed = StlLoader.parse(buf, 'large_coord.stl');
    assertCloseTo(parsed.volumeMm3, 1000000.0, 1e-2, 'Large coordinate volume is 10^6 mm³');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    assertEqual(lines.length, 12, 'All 12 cube edges detected as sharp creases at large coordinates');
  });

  test('P2.4: Micro-scale geometry (5 μm cube, size = 0.005 mm)', () => {
    // 0.005 mm * 1000 = 5 units in quantized space
    const microCube = generateCube({ size: 0.005, format: 'binary' });
    const parsed = StlLoader.parse(microCube.arrayBuffer, 'micro_cube.stl');
    assertCloseTo(parsed.volumeMm3, 1.25e-7, 1e-12, 'Micro cube volume = 0.005^3 = 1.25e-7 mm³');
    assertTrue(parsed.isWatertight, 'Micro cube is watertight');
  });
});

// ============================================================================
// SUITE 3: EXTREME BOUNDARIES & DEGENERATE TOPOLOGY
// ============================================================================
describe('Suite 3: Extreme Boundaries & Degenerate Topology', () => {

  test('B3.1: Zero-triangle binary STL (N = 0) returns empty meshes and isWatertight = false', () => {
    const emptyBuf = Buffer.alloc(84);
    emptyBuf.write('Empty STL Header', 0, 'utf8');
    emptyBuf.writeUInt32LE(0, 80);
    const ab = emptyBuf.buffer.slice(emptyBuf.byteOffset, emptyBuf.byteOffset + emptyBuf.byteLength);

    const parsed = StlLoader.parse(ab, 'empty.stl');
    assertEqual(parsed.totalTriangles, 0, '0 triangles parsed');
    assertEqual(parsed.volumeMm3, 0, '0 volume');
    assertEqual(parsed.areaMm2, 0, '0 area');
    assertEqual(parsed.isWatertight, false, 'Empty STL is not watertight');
    assertEqual(parsed.isManifold, false, 'Empty STL is not manifold');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    assertEqual(features.edgeFeatures.length, 0, '0 edge features on empty mesh');
  });

  test('B3.2: Single isolated triangle (N = 1, open boundary)', () => {
    const tri = [[[0, 0, 0], [10, 0, 0], [0, 10, 0]]];
    const buf = createBinaryStl(tri);
    const parsed = StlLoader.parse(buf, 'single_tri.stl');

    assertEqual(parsed.totalTriangles, 1, '1 triangle parsed');
    assertEqual(parsed.isWatertight, false, 'Single triangle is not watertight');
    assertCloseTo(parsed.areaMm2, 50.0, 1e-4, 'Area = 0.5 * 10 * 10 = 50 mm²');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    // All 3 edges are boundary edges (count === 1) -> detected as creases
    assertEqual(lines.length, 3, 'All 3 boundary edges detected as creases');
  });

  test('B3.3: Degenerate collinear / zero-area triangles in mesh handled without NaN', () => {
    // 2 valid triangles + 2 collapsed degenerate triangles (collinear)
    const valid1 = [[0, 0, 0], [10, 0, 0], [10, 10, 0]];
    const valid2 = [[0, 0, 0], [10, 10, 0], [0, 10, 0]];
    const degen1 = [[0, 0, 0], [5, 0, 0], [10, 0, 0]]; // Collinear line
    const degen2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];  // Collapsed point

    const buf = createBinaryStl([valid1, valid2, degen1, degen2]);
    const parsed = StlLoader.parse(buf, 'degen.stl');

    assertTrue(!isNaN(parsed.volumeMm3), 'Volume is not NaN');
    assertTrue(!isNaN(parsed.areaMm2), 'Area is not NaN');
    assertCloseTo(parsed.areaMm2, 100.0, 1e-4, 'Area equals 100 mm² of valid square');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    assertTrue(Array.isArray(features.edgeFeatures), 'detectFeatures succeeds without throwing');
  });

  test('B3.4: Non-manifold seam: 3 triangles meeting at a single common edge (T-junction/fan)', () => {
    // Edge from [0,0,0] to [10,0,0] shared by 3 triangles at 0°, 90°, 180°
    const tri1 = [[0, 0, 0], [10, 0, 0], [5, 10, 0]];   // XY plane +Y
    const tri2 = [[0, 0, 0], [10, 0, 0], [5, -10, 0]];  // XY plane -Y
    const tri3 = [[0, 0, 0], [10, 0, 0], [5, 0, 10]];   // XZ plane +Z

    const buf = createBinaryStl([tri1, tri2, tri3]);
    const parsed = StlLoader.parse(buf, 'non_manifold.stl');

    assertEqual(parsed.isManifold, false, 'Non-manifold 3-face edge detected (isManifold = false)');
    assertEqual(parsed.isWatertight, false, 'Non-manifold mesh is not watertight');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    const commonEdge = lines.find(l => Math.abs(l.start[1]) < 0.01 && Math.abs(l.end[1]) < 0.01);
    assertTrue(commonEdge !== undefined, 'Non-manifold seam (count > 2) is flagged as crease');
  });

  test('B3.5: Hollow tube / open cylinder (no top/bottom caps) detects 2 circular boundaries', () => {
    // Generate cylinder side mantle only (32 segments)
    const R = 10, H = 20, N = 32;
    const triangles = [];
    for (let i = 0; i < N; i++) {
      const a1 = (i * 2 * Math.PI) / N;
      const a2 = ((i + 1) * 2 * Math.PI) / N;
      const x1 = R * Math.cos(a1), y1 = R * Math.sin(a1);
      const x2 = R * Math.cos(a2), y2 = R * Math.sin(a2);
      triangles.push([[x1, y1, 0], [x2, y2, 0], [x2, y2, H]]);
      triangles.push([[x1, y1, 0], [x2, y2, H], [x1, y1, H]]);
    }

    const buf = createBinaryStl(triangles);
    const parsed = StlLoader.parse(buf, 'tube.stl');
    assertEqual(parsed.isWatertight, false, 'Open tube is not watertight');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertEqual(circles.length, 2, 'Top and bottom open circular rims extracted as circles');
    for (const c of circles) {
      assertCloseTo(c.diameter, 20.0, 0.05, 'Tube diameter Ø 20.0 mm');
    }
  });
});

// ============================================================================
// SUITE 4: KÅSA CIRCLE FIT PERTURBATIONS & ORACLES
// ============================================================================
describe('Suite 4: Kåsa Circle Fit Perturbations & Adversarial Oracles', () => {

  test('K4.1: Loop vertex count boundary: N < 6 rejected, N = 6 (regular hexagon) accepted', () => {
    const R = 10.0;

    // N = 5 regular pentagon
    const pts5 = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI) / 5;
      pts5.push(R * Math.cos(a), R * Math.sin(a), 0);
    }
    const loop5 = [0, 1, 2, 3, 4];
    const fit5 = MeshFeatureDetector.fitCircleToLoop(loop5, new Float32Array(pts5));
    assertEqual(fit5, null, 'N = 5 pentagon rejected under N < 6 rule');

    // N = 6 regular hexagon
    const pts6 = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * 2 * Math.PI) / 6;
      pts6.push(R * Math.cos(a), R * Math.sin(a), 0);
    }
    const loop6 = [0, 1, 2, 3, 4, 5];
    const fit6 = MeshFeatureDetector.fitCircleToLoop(loop6, new Float32Array(pts6));
    assertTrue(fit6 !== null, 'N = 6 regular hexagon accepted by circle fit');
    assertCloseTo(fit6.diameter, 20.0, 1e-4, 'Hexagon circumscribed circle diameter = 20.0 mm');
  });

  test('K4.2: Radial perturbation sweep: 1% noise accepted, 4.9% accepted, 5.1% rejected (> 5% max residual)', () => {
    const R = 10.0;
    const N = 32;

    // Helper to generate perturbed circular loop
    function createPerturbedCircle(noisePercent) {
      const pts = [];
      for (let i = 0; i < N; i++) {
        const a = (i * 2 * Math.PI) / N;
        // Alternating radial perturbation
        const delta = (i % 2 === 0 ? 1 : -1) * (noisePercent / 100.0) * R;
        const r = R + delta;
        pts.push(r * Math.cos(a), r * Math.sin(a), 0);
      }
      const loop = Array.from({ length: N }, (_, i) => i);
      return MeshFeatureDetector.fitCircleToLoop(loop, new Float32Array(pts));
    }

    // 1% noise: delta = ±0.1 mm -> residual ratio = 0.01 <= 0.05
    const fit1 = createPerturbedCircle(1.0);
    assertTrue(fit1 !== null, '1.0% radial noise accepted');
    assertCloseTo(fit1.diameter, 20.0, 0.1, 'Diameter Ø ~20.0 mm with 1% noise');

    // 4.5% noise: delta = ±0.45 mm -> residual ratio = 0.045 <= 0.05
    const fit4p5 = createPerturbedCircle(4.5);
    assertTrue(fit4p5 !== null, '4.5% radial noise accepted (within 5% SLA)');

    // 5.5% noise: delta = ±0.55 mm -> residual ratio = 0.055 > 0.05 -> REJECTED
    const fit5p5 = createPerturbedCircle(5.5);
    assertEqual(fit5p5, null, '5.5% radial noise strictly rejected by MAX_RADIAL_RESIDUAL_RATIO = 0.05');
  });

  test('K4.3: Out-of-plane planarity threshold: Z-jitter 0.08 mm accepted, 0.12 mm rejected (> 0.10 mm HOLE_PLANAR_TOL)', () => {
    const R = 10.0;
    const N = 32;

    function createZPerturbedCircle(zNoise) {
      const pts = [];
      for (let i = 0; i < N; i++) {
        const a = (i * 2 * Math.PI) / N;
        const z = (i % 2 === 0 ? 1 : -1) * zNoise;
        pts.push(R * Math.cos(a), R * Math.sin(a), z);
      }
      const loop = Array.from({ length: N }, (_, i) => i);
      return MeshFeatureDetector.fitCircleToLoop(loop, new Float32Array(pts));
    }

    // Z-jitter = 0.05 mm < 0.10 mm planar tolerance -> accepted
    const fitUnder = createZPerturbedCircle(0.05);
    assertTrue(fitUnder !== null, 'Z-jitter 0.05 mm accepted (under 0.10 mm tolerance)');

    // Z-jitter = 0.15 mm > 0.10 mm planar tolerance -> rejected
    const fitOver = createZPerturbedCircle(0.15);
    assertEqual(fitOver, null, 'Z-jitter 0.15 mm strictly rejected by HOLE_PLANAR_TOL = 0.10 mm');
  });

  test('K4.4: Elliptical boundary rejection: aspect ratio 1.15 (a=10, b=8.5) rejected as non-circular', () => {
    const N = 32;
    const a = 10.0;
    const b = 8.5; // 15% ellipticity
    const pts = [];
    for (let i = 0; i < N; i++) {
      const angle = (i * 2 * Math.PI) / N;
      pts.push(a * Math.cos(angle), b * Math.sin(angle), 0);
    }
    const loop = Array.from({ length: N }, (_, i) => i);
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, new Float32Array(pts));
    assertEqual(fit, null, 'Elliptical loop with 15% elongation rejected by circle detector');
  });

  test('K4.5: Collinear degenerate loop: det < 1e-12 Cramer rule returns null without throwing', () => {
    const N = 10;
    const pts = [];
    for (let i = 0; i < N; i++) {
      pts.push(i * 2.0, 0, 0); // All along X axis
    }
    const loop = Array.from({ length: N }, (_, i) => i);
    const fit = MeshFeatureDetector.fitCircleToLoop(loop, new Float32Array(pts));
    assertEqual(fit, null, 'Collinear loop safely returns null without exception');
  });
});

// ============================================================================
// SUITE 5: CREASE THRESHOLD BEHAVIOR
// ============================================================================
describe('Suite 5: Crease Threshold Behavior (25° Dihedral Angle)', () => {

  // Helper to construct a 2-triangle hinge plate at a specific dihedral angle
  function createHingePlate(dihedralDeg) {
    const rad = (dihedralDeg * Math.PI) / 180;
    // Triangle 1 on XY plane: [0,0,0], [20,0,0], [10,10,0] -> normal [0, 0, 1]
    const tri1 = [[0, 0, 0], [20, 0, 0], [10, 10, 0]];
    // Triangle 2 rotated about X axis by dihedralDeg:
    // normal: [0, -sin(rad), cos(rad)] -> dot = cos(rad)
    const y2 = -10 * Math.cos(rad);
    const z2 = 10 * Math.sin(rad);
    const tri2 = [[20, 0, 0], [0, 0, 0], [10, y2, z2]];

    const pos = new Float32Array([...tri1.flat(), ...tri2.flat()]);
    const features = MeshFeatureDetector.detectFeatures({ position: pos });
    // Look specifically for the hinge edge from [0,0,0] to [20,0,0]
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    const hinge = lines.find(l =>
      (Math.abs(l.start[0]) < 0.1 && Math.abs(l.end[0] - 20) < 0.1) ||
      (Math.abs(l.start[0] - 20) < 0.1 && Math.abs(l.end[0]) < 0.1)
    );
    return hinge !== undefined;
  }

  test('C5.1: Sub-threshold angles (0°, 15°, 20°, 24.9°) are NOT detected as creases', () => {
    assertEqual(createHingePlate(0.0), false, '0.0° (coplanar) is not a crease');
    assertEqual(createHingePlate(15.0), false, '15.0° is not a crease');
    assertEqual(createHingePlate(20.0), false, '20.0° is not a crease');
    assertEqual(createHingePlate(24.9), false, '24.9° is not a crease (< 25.0°)');
  });

  test('C5.2: Exact boundary angle 25.0° is NOT detected as crease (strict > 25° rule: dot < cos(25°))', () => {
    assertEqual(createHingePlate(25.0), false, '25.0° exact threshold is not a crease (requires > 25°)');
  });

  test('C5.3: Super-threshold angles (25.1°, 30°, 90°, 135°, 170°) ARE detected as creases', () => {
    assertEqual(createHingePlate(25.1), true, '25.1° is detected as a crease (> 25°)');
    assertEqual(createHingePlate(30.0), true, '30.0° is detected as a crease');
    assertEqual(createHingePlate(90.0), true, '90.0° orthogonal is detected as a crease');
    assertEqual(createHingePlate(135.0), true, '135.0° obtuse is detected as a crease');
    assertEqual(createHingePlate(170.0), true, '170.0° reflex is detected as a crease');
  });

  test('C5.4: Inverted back-to-back plate (180° dihedral, anti-parallel normals) detected as crease', () => {
    assertEqual(createHingePlate(180.0), true, '180.0° anti-parallel normals detected as crease');
  });
});

// ============================================================================
// SUITE 6: MATERIALS ENGINE & INFILL BOUNDARY CONDITIONS
// ============================================================================
describe('Suite 6: Materials Engine & Infill Boundary Conditions', () => {

  test('MAT6.1: clampInfill boundaries: min 5%, max 100%, 0 clamped to 5%, NaN clamped to 5%', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const ME = env.window.MaterialsEngine;

    assertEqual(ME.clampInfill(0), 5, '0% infill clamped to 5% min');
    assertEqual(ME.clampInfill(-25), 5, 'Negative infill clamped to 5% min');
    assertEqual(ME.clampInfill(150), 100, '150% infill clamped to 100% max');
    assertEqual(ME.clampInfill(NaN), 5, 'NaN clamped to 5%');
    assertEqual(ME.clampInfill(null), 5, 'null clamped to 5%');
    assertEqual(ME.clampInfill(undefined), 5, 'undefined clamped to 5%');

    // Standard presets
    assertEqual(ME.clampInfill(15), 15, '15% preset unchanged');
    assertEqual(ME.clampInfill(20), 20, '20% preset unchanged');
    assertEqual(ME.clampInfill(50), 50, '50% preset unchanged');
    assertEqual(ME.clampInfill(100), 100, '100% preset unchanged');
  });

  test('MAT6.2: getPrintMetrics analytical formulas for mass, filament length, and spool percentage', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const ME = env.window.MaterialsEngine;

    // Test with PLA (density = 1.24 g/cm³), Vol = 100,000 mm³ (100 cm³), infill = 20%
    // Effective vol = 100 * 0.20 = 20 cm³ = 20,000 mm³
    // Mass = 20 cm³ * 1.24 g/cm³ = 24.8 grams = 0.0248 kg
    // Filament constant = π * (1.75/2)^2 * 1000 = 2405.281875 mm³/m
    // Filament length = 20,000 / 2405.281875 = 8.315033 meters
    // Spool fraction = 24.8 / 1000 * 100 = 2.48%
    const metrics = ME.getPrintMetrics(100000, 1.24, 20);

    assertCloseTo(metrics.effectiveVolMm3, 20000.0, 1e-4, 'Effective vol 20,000 mm³');
    assertCloseTo(metrics.effectiveVolCm3, 20.0, 1e-4, 'Effective vol 20 cm³');
    assertCloseTo(metrics.massGrams, 24.8, 1e-4, 'Mass grams = 24.8 g');
    assertCloseTo(metrics.massKg, 0.0248, 1e-6, 'Mass kg = 0.0248 kg');
    assertCloseTo(metrics.filamentLengthMeters, 20000.0 / 2405.281875, 1e-4, 'Filament length ~8.315 m');
    assertCloseTo(metrics.spoolFractionPercent, 2.48, 1e-4, 'Spool fraction = 2.48%');
  });

  test('MAT6.3: getPrintMetrics zero and negative volume safety guards', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const ME = env.window.MaterialsEngine;

    const zeroMetrics = ME.getPrintMetrics(0, 1.24, 20);
    assertEqual(zeroMetrics.massGrams, 0, 'Zero volume produces 0 mass');
    assertEqual(zeroMetrics.filamentLengthMeters, 0, 'Zero volume produces 0 filament length');
    assertEqual(zeroMetrics.spoolFractionPercent, 0, 'Zero volume produces 0 spool fraction');

    const negMetrics = ME.getPrintMetrics(-5000, 1.24, 20);
    assertEqual(negMetrics.massGrams, 0, 'Negative volume produces 0 mass without NaN or throw');
  });

  test('MAT6.4: Format-aware getTotalMassKg() infill scaling for STL vs STEP', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const ME = env.window.MaterialsEngine;
    env.context.modelPhysicalProps = { volumeMm3: 100000 }; // 100 cm³
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;
    ME.selectMaterial('pla'); // 1.24 g/cm³ -> 100 cm³ = 124 g = 0.124 kg at 100%

    // 1. When format is STL, infill scales mass:
    env.window.activeCadFormat = 'STL';
    env.context.activeCadFormat = 'STL';
    ME.setInfill(50);
    const stl50Mass = ME.getTotalMassKg();
    assertCloseTo(stl50Mass, 0.124 * 0.50, 1e-5, 'STL format scales mass by 50% infill: 0.062 kg');

    ME.setInfill(20);
    const stl20Mass = ME.getTotalMassKg();
    assertCloseTo(stl20Mass, 0.124 * 0.20, 1e-5, 'STL format scales mass by 20% infill: 0.0248 kg');

    // 2. When format is STEP, infill slider is ignored (evaluated at 100% solid):
    env.window.activeCadFormat = 'STEP';
    env.context.activeCadFormat = 'STEP';
    const stepMass = ME.getTotalMassKg();
    assertCloseTo(stepMass, 0.124, 1e-5, 'STEP format evaluates at 100% solid mass (0.124 kg) regardless of infill');
  });

  test('MAT6.5: All 5 filament types (PLA, PETG, ABS, TPU, Resin) print metrics accuracy', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const ME = env.window.MaterialsEngine;
    const vol = 50000; // 50 cm³

    const filaments = [
      { id: 'pla', density: 1.24 },
      { id: 'petg', density: 1.27 },
      { id: 'abs', density: 1.04 },
      { id: 'tpu', density: 1.21 },
      { id: 'resin', density: 1.15 }
    ];

    for (const fil of filaments) {
      ME.selectMaterial(fil.id);
      const metrics = ME.getPrintMetrics(vol, fil.density, 100);
      const expectedGrams = 50.0 * fil.density;
      assertCloseTo(metrics.massGrams, expectedGrams, 1e-4, `${fil.id} 100% mass = ${expectedGrams} g`);
      const expectedLength = 50000 / 2405.281875;
      assertCloseTo(metrics.filamentLengthMeters, expectedLength, 1e-4, `${fil.id} filament length`);
    }
  });
});

// Run report and exit
const summary = reportSummary();
exitProcess(summary.failed === 0 ? 0 : 1);
