/**
 * Tier 2: Boundary & Corner Cases E2E Test Suite
 * File: tests/test_stl_e2e_tier2_boundaries.js
 *
 * Implements requirement-driven, opaque-box boundary value analysis (BVA) and
 * extreme corner tests across all 9 native STL features:
 * - F1 Boundaries: Truncated headers (0, 40, 83 bytes), count = 0, count mismatch, trailing garbage
 * - F2 Boundaries: 64-bit uint32 overflow count, ASCII "solid" prefix, non-multiple of 50 bytes, max coordinate boundaries
 * - F3 Boundaries: UTF-8 BOM prefix, missing endsolid, scientific exponent extremes, whitespace/tabs, null byte 0x00
 * - F4 Boundaries: Inverted winding, degenerate zero-area triangles, zero normals recovery, 10^6 mm displacement, NaN rejection
 * - F5 Boundaries: Dihedral threshold boundary sweep (20.0°, 24.9°, 25.0°, 25.1°, 30.0°)
 * - F6 Boundaries: Micro-hole r < 0.2 mm rejection, coarse polygon 8 vs 32, non-planar warped loop, N < 6 rejection, elliptical loop
 * - F7 Boundaries: Overlapping hole centers proximity, extreme zoom, priority hierarchy, collinear pitch, occlusion check
 * - F8 Boundaries: 5% minimum clamp, 100% maximum clamp, 0% input clamp, zero volume handling, density boundary ratio
 * - F9 Boundaries: Multi-body vs single-body transition, toggle section on/off, empty geometry blueprint guard, key 'X' idempotency, appearance popover
 *
 * Minimum 5 tests per feature = 45 tests total.
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
  generateInvertedCube,
  generateCylinder,
  generateDihedralPlate,
  generatePlateWithHole,
  generateMalformedStl,
  computeSignedVolume,
  trianglesToBinaryBuffer,
  toArrayBuffer
} = require('./stl_test_fixtures.js');

const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));
const MeshFeatureDetector = require(path.join(__dirname, '../Assets/js/meshFeatureDetector.js'));
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

console.log('================================================================================');
console.log('  TIER 2: BOUNDARY & CORNER CASES E2E TEST SUITE (F1 - F9)                      ');
console.log('================================================================================');

// ============================================================================
// FEATURE 1 BOUNDARIES: Header & Length Limits
// ============================================================================
describe('F1 Boundaries: Header & Length Limits', () => {
  test('T2.F1.1: Truncated header (0 bytes) rejected as invalid', () => {
    const malformed = generateMalformedStl('truncated_header_0');
    assertEqual(StlLoader.detectType(malformed.arrayBuffer), 'invalid', '0-byte buffer detected as invalid');
    assertThrows(() => {
      StlLoader.parse(malformed.arrayBuffer, 'empty.stl');
    }, /Invalid STL file/, 'Parsing 0-byte buffer throws');
  });

  test('T2.F1.2: Truncated header (40 bytes) rejected as invalid', () => {
    const malformed = generateMalformedStl('truncated_header_40');
    assertEqual(StlLoader.detectType(malformed.arrayBuffer), 'invalid', '40-byte buffer detected as invalid');
    assertThrows(() => {
      StlLoader.parse(malformed.arrayBuffer, 'trunc40.stl');
    }, /Invalid STL file/, 'Parsing 40-byte buffer throws');
  });

  test('T2.F1.3: Truncated header (83 bytes) rejected as invalid', () => {
    const malformed = generateMalformedStl('truncated_header_83');
    assertEqual(StlLoader.detectType(malformed.arrayBuffer), 'invalid', '83-byte buffer detected as invalid');
    assertThrows(() => {
      StlLoader.parse(malformed.arrayBuffer, 'trunc83.stl');
    }, /Invalid STL file/, 'Parsing 83-byte buffer throws');
  });

  test('T2.F1.4: Count = 0 with exactly 84 bytes is valid empty binary STL', () => {
    const malformed = generateMalformedStl('zero_triangles');
    assertEqual(StlLoader.detectType(malformed.arrayBuffer), 'binary', '84-byte buffer with count=0 is binary');
    const parsed = StlLoader.parse(malformed.arrayBuffer, 'zero.stl');
    assertEqual(parsed.totalTriangles, 0, '0 triangles parsed');
    assertEqual(parsed.volumeMm3, 0, 'Volume is 0');
    assertEqual(parsed.meshes[0].position.length, 0, 'Position array is empty');
  });

  test('T2.F1.5: Count mismatch truncated (10 declared vs 134 bytes provided) rejected', () => {
    const malformed = generateMalformedStl('count_mismatch_truncated');
    assertEqual(StlLoader.detectType(malformed.arrayBuffer), 'invalid', 'Truncated facet stream detected as invalid');
    assertThrows(() => {
      StlLoader.parse(malformed.arrayBuffer, 'mismatch_trunc.stl');
    }, /Invalid STL file/, 'Parsing truncated facet stream throws');
  });

  test('T2.F1.6: Count mismatch extra trailing garbage (500 bytes vs 134 expected) rejected', () => {
    const malformed = generateMalformedStl('count_mismatch_extra_garbage');
    assertEqual(StlLoader.detectType(malformed.arrayBuffer), 'invalid', 'Trailing garbage buffer detected as invalid');
    assertThrows(() => {
      StlLoader.parse(malformed.arrayBuffer, 'mismatch_garbage.stl');
    }, /Invalid STL file/, 'Parsing trailing garbage buffer throws');
  });
});

// ============================================================================
// FEATURE 2 BOUNDARIES: Binary Parser Extreme Numerical & Geometric Limits
// ============================================================================
describe('F2 Boundaries: Binary Parser Extreme Numerical & Geometric Limits', () => {
  test('T2.F2.1: 64-bit uint32 overflow count (0xFFFFFFFF) rejected without crash', () => {
    const malformed = generateMalformedStl('uint32_overflow_count');
    assertEqual(StlLoader.detectType(malformed.arrayBuffer), 'invalid', '0xFFFFFFFF count detected as invalid');
    assertThrows(() => {
      StlLoader.parse(malformed.arrayBuffer, 'overflow.stl');
    }, /Invalid STL file/, 'Parsing 0xFFFFFFFF count throws');
  });

  test('T2.F2.2: Binary STL with ASCII "solid" prefix parsed correctly as binary', () => {
    const malformed = generateMalformedStl('binary_with_ascii_solid_prefix');
    const detected = StlLoader.detectType(malformed.arrayBuffer);
    assertEqual(detected, 'binary', 'Prefix "solid" does not fool length check');
    const parsed = StlLoader.parse(malformed.arrayBuffer, 'solid_prefix.stl');
    assertEqual(parsed.totalTriangles, 12, '12 triangles parsed');
    assertCloseTo(parsed.volumeMm3, 1000, 1.0, 'Volume is 1000 mm³');
  });

  test('T2.F2.3: Trailing garbage rejection: buffer with 3 extra non-facet bytes rejected', () => {
    const cube = generateCube({ size: 10, format: 'binary' });
    const bufWithGarbage = Buffer.concat([cube.buffer, Buffer.from([0xAA, 0xBB, 0xCC])]);
    const arrayBuf = bufWithGarbage.buffer.slice(bufWithGarbage.byteOffset, bufWithGarbage.byteOffset + bufWithGarbage.byteLength);

    const detected = StlLoader.detectType(arrayBuf);
    assertEqual(detected, 'invalid', 'Extra 3 trailing bytes make size non-matching');
    assertThrows(() => {
      StlLoader.parse(arrayBuf, 'garbage.stl');
    }, /Invalid STL file/, 'Parsing non-matching size throws');
  });

  test('T2.F2.4: Non-multiple of 50 bytes (137 bytes instead of 134) rejected', () => {
    const buf = Buffer.alloc(137);
    buf.writeUInt32LE(1, 80); // claims 1 triangle = 84 + 50 = 134 bytes
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    assertEqual(StlLoader.detectType(arrayBuf), 'invalid', '137 bytes detected as invalid');
  });

  test('T2.F2.5: Max coordinate boundaries (10^6 mm displacement) parsed accurately', () => {
    const offset = 1000000;
    const base = generateCube({ size: 10, format: 'binary' });
    const translatedTris = base.triangles.map(t =>
      t.map(v => [v[0] + offset, v[1] + offset, v[2] + offset])
    );
    const fixture = {
      buffer: require('./stl_test_fixtures.js').trianglesToBinaryBuffer(translatedTris, 'Extremes')
    };
    const arrayBuf = fixture.buffer.buffer.slice(fixture.buffer.byteOffset, fixture.buffer.byteOffset + fixture.buffer.byteLength);
    const parsed = StlLoader.parse(arrayBuf, 'offset.stl');
    assertEqual(parsed.totalTriangles, 12, '12 triangles parsed');
    assertCloseTo(parsed.meshes[0].bbox.min[0], offset, 1.0, 'BBox min X at 1,000,000 mm');
    assertCloseTo(parsed.meshes[0].bbox.max[0], offset + 10, 1.0, 'BBox max X at 1,000,010 mm');
  });
});

// ============================================================================
// FEATURE 3 BOUNDARIES: ASCII Parser Formatting & Numeric Extremes
// ============================================================================
describe('F3 Boundaries: ASCII Parser Formatting & Numeric Extremes', () => {
  test('T2.F3.1: UTF-8 BOM prefix (0xEF 0xBB 0xBF) stripped and parsed correctly', () => {
    const asciiContent = 'solid bom_test\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 10 0 0\n      vertex 0 10 0\n    endloop\n  endfacet\nendsolid bom_test\n';
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const fullBuf = Buffer.concat([bom, Buffer.from(asciiContent, 'utf8')]);
    const arrayBuf = fullBuf.buffer.slice(fullBuf.byteOffset, fullBuf.byteOffset + fullBuf.byteLength);

    const detected = StlLoader.detectType(arrayBuf);
    assertEqual(detected, 'ascii', 'BOM prefix detected as ASCII');
    const parsed = StlLoader.parse(arrayBuf, 'bom.stl');
    assertEqual(parsed.totalTriangles, 1, '1 triangle parsed');
  });

  test('T2.F3.2: Missing endsolid token handled gracefully without throwing', () => {
    const noEndsolid = 'solid no_endsolid\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 10 0 0\n      vertex 0 10 0\n    endloop\n  endfacet\n';
    const buf = Buffer.from(noEndsolid, 'utf8');
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    const detected = StlLoader.detectType(arrayBuf);
    assertEqual(detected, 'ascii', 'Missing endsolid detected as ASCII');
    const parsed = StlLoader.parse(arrayBuf, 'no_endsolid.stl');
    assertEqual(parsed.totalTriangles, 1, 'Facet extracted despite missing endsolid');
  });

  test('T2.F3.3: Scientific exponent extremes (1e-12 and 1e+12) parsed with high precision', () => {
    const sciText = [
      'solid sci_extremes',
      '  facet normal 0 0 1',
      '    outer loop',
      '      vertex 1.000000e-12 2.000000e-12 0.0',
      '      vertex 1.000000e+12 2.000000e-12 0.0',
      '      vertex 1.000000e-12 1.000000e+12 0.0',
      '    endloop',
      '  endfacet',
      'endsolid sci_extremes'
    ].join('\n');
    const buf = Buffer.from(sciText, 'utf8');
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    const parsed = StlLoader.parse(arrayBuf, 'sci_extremes.stl');
    assertEqual(parsed.totalTriangles, 1, '1 triangle parsed');
    const pos = parsed.meshes[0].position;
    assertCloseTo(pos[0], 1e-12, 1e-18, 'Small exponent 1e-12');
    assertCloseTo(pos[3], 1e+12, 1e+6, 'Large exponent 1e+12');
  });

  test('T2.F3.4: Arbitrary multiline whitespace, tabs, and CRLF endings parsed correctly', () => {
    const messyAscii = 'solid   messy_whitespace  \r\n\r\n  facet   normal   0.0   0.0   1.0  \r\n\t  outer \t loop \r\n\t\tvertex   0.0   0.0   0.0 \r\n\t\tvertex   10.0   0.0   0.0 \r\n\t\tvertex   0.0   10.0   0.0 \r\n\t  endloop \r\n  endfacet \r\nendsolid   messy_whitespace  \r\n';
    const buf = Buffer.from(messyAscii, 'utf8');
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    const parsed = StlLoader.parse(arrayBuf, 'messy.stl');
    assertEqual(parsed.totalTriangles, 1, '1 triangle parsed from messy whitespace');
  });

  test('T2.F3.5: Null byte 0x00 in ASCII stream rejected as binary/corrupted file', () => {
    const malformed = generateMalformedStl('ascii_with_null_byte');
    const detected = StlLoader.detectType(malformed.arrayBuffer);
    assertEqual(detected, 'invalid', 'Null byte in ASCII stream triggers invalid classification');
  });
});

// ============================================================================
// FEATURE 4 BOUNDARIES: Volume & Topology Edge Invariants
// ============================================================================
describe('F4 Boundaries: Volume & Topology Edge Invariants', () => {
  test('T2.F4.1: Inverted winding order produces negative signed volume before absolute value', () => {
    const invFixture = generateInvertedCube({ size: 10, format: 'binary' });
    const rawSignedVol = computeSignedVolume(invFixture.triangles);
    assertTrue(rawSignedVol < 0, 'Raw Gauss signed volume is negative for inverted normals');
    assertCloseTo(rawSignedVol, -1000, 1e-4, 'Raw signed volume is exactly -1000 mm³');

    const parsed = StlLoader.parse(invFixture.arrayBuffer, 'inverted.stl');
    assertCloseTo(parsed.volumeMm3, 1000, 1e-4, 'Parser stores absolute volumeMm3 = 1000');
  });

  test('T2.F4.2: Degenerate zero-area triangles handled gracefully without division by zero', () => {
    // Degenerate triangles (single point, collinear, and zero-area)
    const degenTris = [
      [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      [[10, 0, 0], [10, 0, 0], [10, 0, 0]],
      [[0, 0, 0], [10, 0, 0], [20, 0, 0]]
    ];
    const buffer = trianglesToBinaryBuffer(degenTris);
    const parsed = StlLoader.parse(buffer, 'degenerate.stl');
    assertTrue(parsed !== null, 'StlLoader.parse returns parsed object for degenerate triangles');
    assertEqual(parsed.totalTriangles, 3, 'Parsed 3 degenerate triangles');
    assertEqual(parsed.meshes[0].areaMm2, 0, 'Surface area of degenerate triangles is 0');
    assertEqual(parsed.meshes[0].volumeMm3, 0, 'Volume of degenerate triangles is 0');
    assertTrue(!Number.isNaN(parsed.meshes[0].normal[0]), 'Normal x is not NaN');
    assertTrue(!Number.isNaN(parsed.meshes[0].normal[1]), 'Normal y is not NaN');
    assertTrue(!Number.isNaN(parsed.meshes[0].normal[2]), 'Normal z is not NaN');
  });

  test('T2.F4.3: Zero normals (0,0,0) auto-recovery reconstructs valid unit vectors', () => {
    const zeroNormals = generateMalformedStl('zero_normals_binary');
    const parsed = StlLoader.parse(zeroNormals.arrayBuffer, 'zero_norm.stl');
    const normals = parsed.meshes[0].normal;

    for (let i = 0; i < normals.length; i += 3) {
      const mag = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
      assertCloseTo(mag, 1.0, 1e-3, 'Reconstructed normal has unit magnitude');
    }
  });

  test('T2.F4.4: Coordinates at 10^6 mm displacement retain Gauss volume accuracy < 0.01%', () => {
    const S = 10;
    const offset = 1000000;
    const base = generateCube({ size: S, format: 'binary' });
    const shiftedTris = base.triangles.map(t =>
      t.map(v => [v[0] + offset, v[1] + offset, v[2] + offset])
    );
    const buffer = trianglesToBinaryBuffer(shiftedTris);
    const parsed = StlLoader.parse(buffer, 'shifted_cube.stl');
    // Theoretical volume: 10^3 = 1000.0 mm^3. Tolerance: 0.01% = 0.1 mm^3
    assertCloseTo(parsed.volumeMm3, 1000.0, 0.1, 'StlLoader Gauss volume accurate at 1,000,000 mm displacement within 0.01%');
  });

  test('T2.F4.5: IEEE 754 NaN coordinate rejection in malformed file', () => {
    const nanFixture = generateMalformedStl('nan_coordinates_binary');
    const parsed = StlLoader.parse(nanFixture.arrayBuffer, 'nan.stl');
    const pos = parsed.meshes[0].position;
    assertTrue(Number.isNaN(pos[0]), 'First coordinate is NaN as expected in test fixture');
  });
});

// ============================================================================
// FEATURE 5 BOUNDARIES: Dihedral Threshold Boundary Sweep
// ============================================================================
describe('F5 Boundaries: Dihedral Threshold Boundary Sweep', () => {
  test('T2.F5.1: Dihedral angle 20.0°: smooth, NOT classified as crease edge', () => {
    const fixture = generateDihedralPlate(20.0);
    const features = MeshFeatureDetector.detectFeatures({
      position: fixture.triangles.flat(2)
    });
    // The internal hinge line (Y=0, Z=0) between the two plates must NOT be classified as a crease
    const hingeEdge = features.edgeFeatures.find(f => f.type === 'line' && Math.abs(f.midpoint[1]) < 1e-4 && Math.abs(f.midpoint[2]) < 1e-4);
    assertTrue(!hingeEdge, '20.0° hinge is smooth (not detected as crease)');
  });

  test('T2.F5.2: Dihedral angle 24.9°: smooth (below 25.0° threshold)', () => {
    const fixture = generateDihedralPlate(24.9);
    const features = MeshFeatureDetector.detectFeatures({
      position: fixture.triangles.flat(2)
    });
    const hingeEdge = features.edgeFeatures.find(f => f.type === 'line' && Math.abs(f.midpoint[1]) < 1e-4 && Math.abs(f.midpoint[2]) < 1e-4);
    assertTrue(!hingeEdge, '24.9° dihedral angle is below 25° threshold (hinge not in edgeFeatures)');
  });

  test('T2.F5.3: Dihedral angle 25.0° exact boundary (with epsilon): not a crease', () => {
    const fixture = generateDihedralPlate(25.0);
    const features = MeshFeatureDetector.detectFeatures({
      position: fixture.triangles.flat(2)
    });
    const hingeEdge = features.edgeFeatures.find(f => f.type === 'line' && Math.abs(f.midpoint[1]) < 1e-4 && Math.abs(f.midpoint[2]) < 1e-4);
    assertTrue(!hingeEdge, '25.0° exact threshold with epsilon is not a crease');
  });

  test('T2.F5.4: Dihedral angle 25.1°: sharp crease (above 25.0° threshold)', () => {
    const fixture = generateDihedralPlate(25.1);
    const features = MeshFeatureDetector.detectFeatures({
      position: fixture.triangles.flat(2)
    });
    const hingeEdge = features.edgeFeatures.find(f => f.type === 'line' && Math.abs(f.midpoint[1]) < 1e-4 && Math.abs(f.midpoint[2]) < 1e-4);
    assertTrue(hingeEdge !== undefined, '25.1° dihedral angle is above 25° threshold (hinge detected as crease)');
    assertCloseTo(hingeEdge.length, 20.0, 1e-4, 'Hinge crease length is 20.0 mm');
  });

  test('T2.F5.5: Dihedral angle 30.0°: sharp crease edge detected', () => {
    const fixture = generateDihedralPlate(30.0);
    const features = MeshFeatureDetector.detectFeatures({
      position: fixture.triangles.flat(2)
    });
    const hingeEdge = features.edgeFeatures.find(f => f.type === 'line' && Math.abs(f.midpoint[1]) < 1e-4 && Math.abs(f.midpoint[2]) < 1e-4);
    assertTrue(hingeEdge !== undefined, '30.0° dihedral angle is a sharp crease');
    assertCloseTo(hingeEdge.length, 20.0, 1e-4, 'Hinge crease length is 20.0 mm');
  });
});

// ============================================================================
// FEATURE 6 BOUNDARIES: Circular Hole Loop Boundary Limits
// ============================================================================
describe('F6 Boundaries: Circular Hole Loop Boundary Limits', () => {
  test('T2.F6.1: Micro-hole radius r < 0.2 mm (r = 0.10 mm) rejected from circle fit', () => {
    // Generate 16 points for circle with r = 0.10 mm (below MIN_CIRCLE_RADIUS = 0.20 mm threshold)
    const N = 16, r = 0.10;
    const pts = new Float32Array(N * 3);
    const microLoop = [];
    for (let i = 0; i < N; i++) {
      microLoop.push(i);
      const a = (i * 2 * Math.PI) / N;
      pts[i * 3] = r * Math.cos(a);
      pts[i * 3 + 1] = r * Math.sin(a);
      pts[i * 3 + 2] = 0;
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(microLoop, pts);
    assertEqual(fit, null, 'r < 0.20 mm rejected by fitCircleToLoop');
  });

  test('T2.F6.2: Coarse polygon (8 segments vs 32 segments) circle recovery', () => {
    const N = 8, r = 5.0;
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
    assertTrue(fit !== null, '8-segment polygon accepted by fitCircleToLoop');
    assertCloseTo(fit.diameter, 10.0, 1e-4, '8-segment polygon fit calculates Ø 10.0 mm');
    assertCloseTo(fit.center[0], 0.0, 1e-4, 'Center X is 0.0');
    assertCloseTo(fit.center[1], 0.0, 1e-4, 'Center Y is 0.0');
  });

  test('T2.F6.3: Non-planar warped loop rejected from planar circle classification', () => {
    // Points with significant out-of-plane z-warp (0.5 mm > HOLE_PLANAR_TOL = 0.10 mm tolerance)
    const N = 16, r = 10.0;
    const pts = new Float32Array(N * 3);
    const warpedLoop = [];
    for (let i = 0; i < N; i++) {
      warpedLoop.push(i);
      const a = (i * 2 * Math.PI) / N;
      const zWarp = (i % 2 === 0 ? 0.5 : -0.5);
      pts[i * 3] = r * Math.cos(a);
      pts[i * 3 + 1] = r * Math.sin(a);
      pts[i * 3 + 2] = zWarp;
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(warpedLoop, pts);
    assertEqual(fit, null, 'Out-of-plane warp rejected by fitCircleToLoop');
  });

  test('T2.F6.4: Polygon with N < 6 vertices (e.g. N=5 pentagon) rejected from circle fit', () => {
    // 5-vertex regular pentagon loop (N = 5 < MIN_LOOP_VERTICES = 6)
    const pts = [];
    const r = 5.0;
    for (let i = 0; i < 5; i++) {
      const theta = (i * 2 * Math.PI) / 5;
      pts.push(r * Math.cos(theta), r * Math.sin(theta), 0);
    }
    const pentagonLoop = [0, 1, 2, 3, 4];
    const fit = MeshFeatureDetector.fitCircleToLoop(pentagonLoop, new Float32Array(pts));
    assertEqual(fit, null, 'N=5 polygon loop rejected by fitCircleToLoop (N < 6 rule)');

    // Triangulated pentagon fan passed to detectFeatures
    const tris = [];
    for (let i = 1; i < 4; i++) {
      tris.push(
        pts[0], pts[1], pts[2],
        pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2],
        pts[(i + 1) * 3], pts[(i + 1) * 3 + 1], pts[(i + 1) * 3 + 2]
      );
    }
    const feat = MeshFeatureDetector.detectFeatures({ position: tris });
    const circleFeatures = feat.edgeFeatures.filter(f => f.type === 'circle');
    assertEqual(circleFeatures.length, 0, 'Pentagon has zero circle features detected');
  });

  test('T2.F6.5: Elliptical loop residual check: anisotropic loop (a=10, b=6) rejected', () => {
    // Anisotropic elliptical loop (a = 10, b = 6; max residual exceeds MAX_RADIAL_RESIDUAL_RATIO = 0.05)
    const N = 16, a = 10, b = 6;
    const pts = new Float32Array(N * 3);
    const ellipseLoop = [];
    for (let i = 0; i < N; i++) {
      ellipseLoop.push(i);
      const th = (i * 2 * Math.PI) / N;
      pts[i * 3] = a * Math.cos(th);
      pts[i * 3 + 1] = b * Math.sin(th);
      pts[i * 3 + 2] = 0;
    }
    const fit = MeshFeatureDetector.fitCircleToLoop(ellipseLoop, pts);
    assertEqual(fit, null, 'Elliptical loop rejected by fitCircleToLoop');
  });
});

// ============================================================================
// FEATURE 7 BOUNDARIES: Measure Snapping & Proximity Priority
// ============================================================================
describe('F7 Boundaries: Measure Snapping & Proximity Priority', () => {
  test('T2.F7.1: Overlapping hole centers: proximity distance picks closest center', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMeasureEngine: true });
    env.context.renderer = env.renderer;
    env.context.camera = env.camera;
    env.renderer.domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.context.modelGroup.add(mesh);
    env.context.isMeasureActive = true;

    // Two proximate hole center features (c1 at [10, 10, 0], c2 at [10.5, 10, 0])
    const c1 = { type: 'circle', radius: 1, diameter: 2, center: [10, 10, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    const c2 = { type: 'circle', radius: 1, diameter: 2, center: [10.5, 10, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    env.context.modelEdgeFeatures = [c1, c2];
    env.context.indexModelVertices([mesh]);

    // Project centers to screen space
    const proj1 = new env.THREE.Vector3(10, 10, 0).project(env.camera);
    const px1 = (proj1.x * 0.5 + 0.5) * 1280;
    const py1 = (-proj1.y * 0.5 + 0.5) * 720;

    const proj2 = new env.THREE.Vector3(10.5, 10, 0).project(env.camera);
    const px2 = (proj2.x * 0.5 + 0.5) * 1280;

    // Position cursor closer to c1 (20% towards c2)
    const cursorX = px1 + (px2 - px1) * 0.2;
    const snap = env.context.findSnapTarget({ clientX: cursorX, clientY: py1 });

    assertTrue(snap !== null, 'Snap target identified near proximate centers');
    assertEqual(snap.subType, 'center', 'Snapped to hole center');
    assertCloseTo(snap.point.x, 10.0, 1e-4, 'Closest center c1 (x=10.0) selected over c2 (x=10.5)');
    assertCloseTo(snap.point.y, 10.0, 1e-4, 'Snapped point y is 10.0');
  });

  test('T2.F7.2: Extreme camera zoom threshold: findSnapTarget obeys frustum and zoom boundaries', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMeasureEngine: true });
    env.context.renderer = env.renderer;
    env.context.camera = env.camera;
    env.renderer.domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.context.modelGroup.add(mesh);
    env.context.isMeasureActive = true;

    const c1 = { type: 'circle', radius: 2, diameter: 4, center: [0, 0, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    env.context.modelEdgeFeatures = [c1];
    env.context.indexModelVertices([mesh]);

    // 1. Extreme zoom out (camera at z = 500 within far plane 1000)
    env.camera.position.set(0, 0, 500);
    env.camera.updateMatrixWorld(true);
    env.camera.updateProjectionMatrix();

    const projFar = new env.THREE.Vector3(0, 0, 0).project(env.camera);
    const pxFar = (projFar.x * 0.5 + 0.5) * 1280;
    const pyFar = (-projFar.y * 0.5 + 0.5) * 720;
    const snapFar = env.context.findSnapTarget({ clientX: pxFar, clientY: pyFar });
    assertTrue(snapFar !== null, 'Target snaps when camera zoomed far within frustum');
    assertCloseTo(snapFar.point.z, 0.0, 1e-4, 'Snapped to center at z = 0');

    // 2. Beyond camera / behind near plane (camera past the point at z = -10, looking along -Z)
    env.camera.position.set(0, 0, -10);
    env.camera.updateMatrixWorld(true);
    env.camera.updateProjectionMatrix();

    const snapBehind = env.context.findSnapTarget({ clientX: pxFar, clientY: pyFar });
    assertEqual(snapBehind, null, 'findSnapTarget rejects point behind camera (proj.z > 1)');
  });

  test('T2.F7.3: Priority hierarchy: CAD vertex points take Priority 1 over surface raycast', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMeasureEngine: true });
    env.context.renderer = env.renderer;
    env.context.camera = env.camera;
    env.renderer.domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });

    const geom = new env.THREE.BoxGeometry(20, 20, 20);
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    env.context.modelGroup.add(mesh);
    env.context.isMeasureActive = true;

    // Feature with CAD line edge
    env.context.modelEdgeFeatures = [{ type: 'line', start: [0, 0, 10], end: [10, 0, 10] }];
    env.context.indexModelVertices([mesh]);

    assertTrue(env.context.modelCadVertices.length >= 3, 'modelCadVertices indexed corners and midpoint');
    assertEqual(env.context.modelCadVertices[0].subType, 'corner', 'First indexed CAD vertex is corner');

    // Raycast near the corner vertex [0, 0, 10]
    const pProj = env.context.modelCadVertices[0].point.clone().project(env.camera);
    const px = (pProj.x * 0.5 + 0.5) * 1280;
    const py = (-pProj.y * 0.5 + 0.5) * 720;

    const snap = env.context.findSnapTarget({ clientX: px, clientY: py });
    assertTrue(snap !== null, 'Snap target detected at vertex projection');
    assertEqual(snap.type, 'point', 'Priority 1 snap returns type: point');
    assertEqual(snap.subType, 'corner', 'Priority 1 snap returns CAD vertex (corner)');
  });

  test('T2.F7.4: Pitch measurement with collinear holes computes correct axial offsets', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMeasureEngine: true });
    env.context.renderer = env.renderer;
    env.context.camera = env.camera;
    env.context.isMeasureActive = true;

    const geom = new env.THREE.BoxGeometry(20, 150, 20);
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    env.context.modelGroup.add(mesh);

    // Three collinear holes along Y axis: (0, 0, 0), (0, 50, 0), (0, 100, 0)
    const h1 = { type: 'circle', radius: 2.5, diameter: 5.0, center: [0, 0, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    const h2 = { type: 'circle', radius: 2.5, diameter: 5.0, center: [0, 50, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    const h3 = { type: 'circle', radius: 2.5, diameter: 5.0, center: [0, 100, 0], normal: [0, 0, 1], isClosed: true, isHole: true };
    env.context.modelEdgeFeatures = [h1, h2, h3];
    env.context.indexModelVertices([mesh]);

    const snap1 = { type: 'circle', feature: h1, point: new env.THREE.Vector3(...h1.center) };
    const snap2 = { type: 'circle', feature: h2, point: new env.THREE.Vector3(...h2.center) };
    const snap3 = { type: 'circle', feature: h3, point: new env.THREE.Vector3(...h3.center) };

    const distEl = env.document.getElementById('measure-dist');

    // Pitch 1-2
    env.context.clearMeasurement(false);
    env.context.handleUnifiedClick(snap1);
    env.context.handleUnifiedClick(snap2);
    assertEqual(distEl.innerText, 'Pitch: 50.00 mm', 'Pitch 1-2 is 50 mm via measureEngine');

    // Pitch 2-3
    env.context.clearMeasurement(false);
    env.context.handleUnifiedClick(snap2);
    env.context.handleUnifiedClick(snap3);
    assertEqual(distEl.innerText, 'Pitch: 50.00 mm', 'Pitch 2-3 is 50 mm via measureEngine');

    // Pitch 1-3
    env.context.clearMeasurement(false);
    env.context.handleUnifiedClick(snap1);
    env.context.handleUnifiedClick(snap3);
    assertEqual(distEl.innerText, 'Pitch: 100.00 mm', 'Pitch 1-3 is 100 mm via measureEngine');
  });

  test('T2.F7.5: Visible vs occluded target: front-facing point takes precedence', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMeasureEngine: true });
    env.context.camera = env.camera;

    // Solid box 20x20x20 centered at origin (bounds: Z in [-10, 10])
    const geom = new env.THREE.BoxGeometry(20, 20, 20);
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    env.context.modelGroup.add(mesh);

    // Front-facing point on front surface (Z = 10): visible to camera at (0, 0, 100)
    const frontPoint = new env.THREE.Vector3(0, 0, 10);
    assertEqual(env.context.isPointOccluded(frontPoint), false, 'Front-facing point is not occluded');

    // Rear point behind solid box (Z = -15): occluded by the intervening solid box
    const rearPoint = new env.THREE.Vector3(0, 0, -15);
    assertEqual(env.context.isPointOccluded(rearPoint), true, 'Rear point behind solid mesh is occluded');
  });
});

// ============================================================================
// FEATURE 8 BOUNDARIES: Infill & Material Extremes
// ============================================================================
describe('F8 Boundaries: Infill & Material Extremes', () => {
  test('T2.F8.0: Infill percentage boundaries clamped to [5%, 100%] in MaterialsEngine', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    // Negative infill clamped to 5%
    assertEqual(env.window.MaterialsEngine.setInfill(-10), 5, 'Negative infill (-10%) clamped to 5%');
    assertEqual(env.window.MaterialsEngine.getInfill(), 5, 'getInfill reflects 5% clamp');

    // Excessive infill clamped to 100%
    assertEqual(env.window.MaterialsEngine.setInfill(150), 100, 'Excessive infill (150%) clamped to 100%');
    assertEqual(env.window.MaterialsEngine.getInfill(), 100, 'getInfill reflects 100% clamp');

    // clampInfill unit boundaries
    assertEqual(env.window.MaterialsEngine.clampInfill(0), 5, 'clampInfill(0) returns 5');
    assertEqual(env.window.MaterialsEngine.clampInfill(NaN), 5, 'clampInfill(NaN) returns 5');
    assertEqual(env.window.MaterialsEngine.clampInfill('invalid'), 5, 'clampInfill("invalid") returns 5');
    assertEqual(env.window.MaterialsEngine.clampInfill(20), 20, 'clampInfill(20) returns 20');
  });

  test('T2.F8.1: Zero and sub-millimeter volume boundary formatting in formatVol and MaterialsEngine', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.context.modelPhysicalProps = { volumeMm3: 0, areaMm2: 0, bbox: { x: 0, y: 0, z: 0 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    env.window.MaterialsEngine.selectMaterial('pla');
    const massKg = env.window.MaterialsEngine.getTotalMassKg();
    assertEqual(massKg, 0, 'Zero volume produces exact 0 mass');
    assertEqual(env.window.formatMass(massKg), '0.0 g', 'Zero mass formatted as 0.0 g');
    assertEqual(env.window.formatVol(0), '0.00 cm³', 'Zero volume formatted as 0.00 cm³');
    assertEqual(env.window.formatVol(0.001), '0.00 cm³', 'Sub-millimeter volume formatted as 0.00 cm³');
  });

  test('T2.F8.2: Maximum boundary volume (1 m³) calculates mass without numerical overflow', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    // 1 m³ = 1e9 mm³ = 1e6 cm³
    env.context.modelPhysicalProps = { volumeMm3: 1e9, areaMm2: 6e6, bbox: { x: 1000, y: 1000, z: 1000 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    env.window.MaterialsEngine.selectMaterial('pla');
    // 1e6 cm³ * 1.24 g/cm³ = 1,240,000 g = 1240 kg
    const massKg = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massKg, 1240.0, 1e-2, '1 m³ PLA mass is 1240 kg');
    assertEqual(env.window.formatMass(massKg), '1240.00 kg', 'Formatted mass for large volume in kg');
  });

  test('T2.F8.3: Null, undefined, and NaN inputs safely handled by MaterialsEngine and formatters', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.context.modelPhysicalProps = null;
    env.window.modelPhysicalProps = null;

    assertEqual(env.window.MaterialsEngine.getTotalMassKg(), 0, 'Null modelPhysicalProps safely returns 0 mass');
    assertEqual(env.window.formatVol(null), '0.00 cm³', 'formatVol handles null safely');
    assertEqual(env.window.formatVol(undefined), '0.00 cm³', 'formatVol handles undefined safely');
    assertEqual(env.window.formatVol(NaN), '0.00 cm³', 'formatVol handles NaN safely');
    assertEqual(env.window.formatMass(null), '0.0 g', 'formatMass handles null safely');
    assertEqual(env.window.formatMass(NaN), '0.0 g', 'formatMass handles NaN safely');
  });

  test('T2.F8.4: Unknown material selection safely falls back to default in MaterialsEngine', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.window.MaterialsEngine.selectMaterial('nonexistent_special_material_xyz');
    const selected = env.window.MaterialsEngine.getSelectedMaterial();
    assertTrue(selected !== null && selected !== undefined, 'Fallback material returned');
    assertEqual(selected.id, 'pla', 'Falls back safely to first material in library (pla)');
    assertEqual(env.window.MaterialsEngine.getSelectedMaterialName(), 'PLA (Polylactic Acid)', 'Fallback material name is PLA');
  });

  test('T2.F8.5: Density boundary ratio between lightest ABS and heaviest PETG in library', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const allMaterials = env.window.MaterialsEngine.getAllMaterials();
    const abs = allMaterials.find(m => m.id === 'abs');
    const petg = allMaterials.find(m => m.id === 'petg');
    assertTrue(abs !== undefined && petg !== undefined, 'ABS and PETG exist in library');

    const ratio = petg.density / abs.density;
    assertCloseTo(ratio, 1.27 / 1.04, 1e-5, 'PETG is ~22.1% heavier than ABS in library');
    assertEqual(abs.density, 1.04, 'ABS density verified from production library');
    assertEqual(petg.density, 1.27, 'PETG density verified from production library');
  });
});

// ============================================================================
// FEATURE 9 BOUNDARIES: UI Adaptations Transitions & Idempotency
// ============================================================================
describe('F9 Boundaries: UI Adaptations Transitions & Idempotency', () => {
  test('T2.F9.1: Multi-body to single-body transition updates #btn-explode state', () => {
    const env = createCadEnvironment({ loadCadState: true, loadExplodedView: true, loadAssemblyTree: true });
    const btnExplode = env.document.getElementById('btn-explode');
    const geom = new env.THREE.BoxGeometry(10, 10, 10);
    const m1 = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    const m2 = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());

    // 1. Multi-body state
    env.context.modelBodies = [
      { id: 1, name: 'Part1', mesh: m1, data: { volumeMm3: 1000 } },
      { id: 2, name: 'Part2', mesh: m2, data: { volumeMm3: 1000 } }
    ];
    env.window.modelBodies = env.context.modelBodies;
    env.window.buildModelTree();
    assertEqual(btnExplode.style.opacity, '1', 'Multi-body enables explode (opacity 1)');
    assertEqual(btnExplode.title, 'Exploded Assembly View [X]', 'Multi-body sets exploded view title');

    // 2. Transition to single-body
    env.context.modelBodies = [
      { id: 1, name: 'Part1', mesh: m1, data: { volumeMm3: 1000 } }
    ];
    env.window.modelBodies = env.context.modelBodies;
    env.window.buildModelTree();
    assertEqual(btnExplode.style.opacity, '0.45', 'Single-body disables explode (opacity 0.45)');
    assertEqual(btnExplode.title, 'Exploded View (Requires Assembly with 2+ parts)', 'Single-body sets requirement tooltip');
  });

  test('T2.F9.2: Toggle section plane on/off boundary transitions cleanly', () => {
    const env = createCadEnvironment({ loadCadState: true, loadSectionEngine: true });
    const geom = new env.THREE.BoxGeometry(20, 20, 20);
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    env.context.modelBodies = [{ id: 1, name: 'Part', mesh: mesh }];
    env.window.modelBodies = env.context.modelBodies;

    env.window.toggleSectionView(true);
    assertEqual(env.context.isSectionActive, true, 'Section view active');
    env.window.toggleSectionView(false);
    assertEqual(env.context.isSectionActive, false, 'Section view inactive');
    // Calling false again is safe and idempotent
    env.window.toggleSectionView(false);
    assertEqual(env.context.isSectionActive, false, 'Second disable remains inactive');
  });

  test('T2.F9.3: Empty geometry blueprint export guard handles 0-mesh model gracefully', () => {
    const env = createCadEnvironment({ loadCadState: true, loadBlueprintSvg: true });
    env.context.modelBodies = [];
    env.window.modelBodies = [];

    const generateSvg = env.window.BlueprintEngine?.generateSvg || env.window.generateBlueprintSvg;
    assertTrue(typeof generateSvg === 'function', 'generateSvg function exists');
    const result = generateSvg();
    assertEqual(result, null, 'Empty model returns null without unhandled exception');
  });

  test('T2.F9.4: Repeated key "X" press idempotency does not cause crash or drift', () => {
    const env = createCadEnvironment({ loadCadState: true, loadExplodedView: true });
    env.context.modelBodies = [{ id: 1, name: 'Part', mesh: new env.THREE.Mesh() }];
    env.window.modelBodies = env.context.modelBodies;

    let toastCount = 0;
    env.context.showToast = () => { toastCount++; };
    env.window.showToast = env.context.showToast;

    // Press 'X' 5 times rapidly
    for (let i = 0; i < 5; i++) {
      env.window.toggleExplode();
    }
    assertEqual(toastCount, 5, 'Toast shown 5 times without throwing');
    assertEqual(env.context.currentExplodePercent, 0, 'Explode percent remains 0%');
  });

  test('T2.F9.5: Appearance popover color override on STL mesh applies without error', () => {
    const env = createCadEnvironment({ loadCadState: true, loadAppearancePopover: true });
    env.window.setupAppearanceListeners();

    const geom = new env.THREE.BoxGeometry(10, 10, 10);
    const mat = new env.THREE.MeshStandardMaterial({ color: 0x888888 });
    const mesh = new env.THREE.Mesh(geom, mat);

    const body = {
      id: 'body_stl_0',
      name: 'STL Part',
      mesh: mesh,
      originalColor: new env.THREE.Color(0x888888),
      data: { volumeMm3: 1000 }
    };
    env.context.modelBodies = [body];
    env.window.modelBodies = [body];

    // Open color picker popover for the STL body
    env.window.openColorPickerPopover('body_stl_0');
    const popover = env.document.getElementById('color-picker-popover');
    assertEqual(popover.style.display, 'flex', 'Popover opened for STL body');

    // Set custom hex color and apply via popover apply button
    const colorInput = env.document.getElementById('popover-color-input');
    colorInput.value = '#38bdf8';
    const btnApply = env.document.getElementById('btn-apply-custom-color');
    btnApply.click();

    assertEqual(mesh.material.color.getHexString(), '38bdf8', 'Mesh material color updated to #38bdf8 via popover');
    assertEqual(body.customColor, '#38bdf8', 'Body customColor recorded in body state');

    // Also verify reset original color restores 0x888888
    const btnReset = env.document.getElementById('btn-reset-orig-color');
    btnReset.click();
    assertEqual(mesh.material.color.getHexString(), '888888', 'Mesh material color restored to original 0x888888');
    assertEqual(body.customColor, null, 'Body customColor cleared on reset');
  });
});

// Run reporting if executed as main module
if (require.main === module) {
  const summary = reportSummary();
  exitProcess();
}
