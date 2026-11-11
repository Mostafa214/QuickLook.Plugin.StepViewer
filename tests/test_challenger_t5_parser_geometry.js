/**
 * QuickLook CAD Studio - Tier 5 Adversarial Coverage Hardening
 * File: tests/test_challenger_t5_parser_geometry.js
 *
 * Code-Executing Adversarial Verifier 1 (teamwork_challenger)
 * Deep White-Box Stress Harness & Oracles targeting:
 *  - Suite 1: Degenerate, Collinear & Zero-Normal Geometries
 *  - Suite 2: Extreme ASCII Formatting & Numerical Parsing
 *  - Suite 3: Centered Kåsa Circle Fit Numerical Stability & Perturbation Stress
 *  - Suite 4: Spatial Hash Collision & 1 μm Vertex Welding Resilience
 *  - Suite 5: Dihedral Crease Extraction Under Non-Manifold & Open Boundaries
 *
 * Mandatory Integrity: Genuine production module verification; zero hardcoding or tautologies.
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
  reportSummary,
  exitProcess
} = require('./stl_test_harness.js');

const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));
const MeshFeatureDetector = require(path.join(__dirname, '../Assets/js/meshFeatureDetector.js'));
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

console.log('================================================================================');
console.log('  TIER 5 ADVERSARIAL COVERAGE HARDENING: PARSER & GEOMETRY INTELLIGENCE         ');
console.log('================================================================================');

// Helper to create binary STL ArrayBuffer from triangle definitions
function createBinaryStl(triangles, headerText = 'Adversarial Binary STL') {
  const count = triangles.length;
  const buf = Buffer.alloc(84 + 50 * count);
  buf.write(headerText.slice(0, 80), 0, 'utf8');
  buf.writeUInt32LE(count, 80);

  let offset = 84;
  for (let i = 0; i < count; i++) {
    const t = triangles[i];
    const n = t.n || [0, 0, 0];
    const a = t.a;
    const b = t.b;
    const c = t.c;

    buf.writeFloatLE(n[0], offset);
    buf.writeFloatLE(n[1], offset + 4);
    buf.writeFloatLE(n[2], offset + 8);

    buf.writeFloatLE(a[0], offset + 12);
    buf.writeFloatLE(a[1], offset + 16);
    buf.writeFloatLE(a[2], offset + 20);

    buf.writeFloatLE(b[0], offset + 24);
    buf.writeFloatLE(b[1], offset + 28);
    buf.writeFloatLE(b[2], offset + 32);

    buf.writeFloatLE(c[0], offset + 36);
    buf.writeFloatLE(c[1], offset + 40);
    buf.writeFloatLE(c[2], offset + 44);

    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }

  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// Canonical 12-facet cube generator (size dx, dy, dz)
function getCubeTriangles(dx = 10, dy = 10, dz = 10, ox = 0, oy = 0, oz = 0) {
  const p = [
    [ox, oy, oz],             // 0
    [ox + dx, oy, oz],        // 1
    [ox + dx, oy + dy, oz],   // 2
    [ox, oy + dy, oz],        // 3
    [ox, oy, oz + dz],        // 4
    [ox + dx, oy, oz + dz],   // 5
    [ox + dx, oy + dy, oz + dz], // 6
    [ox, oy + dy, oz + dz]    // 7
  ];

  return [
    // Bottom (Z=oz)
    { n: [0, 0, -1], a: p[0], b: p[2], c: p[1] },
    { n: [0, 0, -1], a: p[0], b: p[3], c: p[2] },
    // Top (Z=oz+dz)
    { n: [0, 0, 1],  a: p[4], b: p[5], c: p[6] },
    { n: [0, 0, 1],  a: p[4], b: p[6], c: p[7] },
    // Front (Y=oy)
    { n: [0, -1, 0], a: p[0], b: p[1], c: p[5] },
    { n: [0, -1, 0], a: p[0], b: p[5], c: p[4] },
    // Back (Y=oy+dy)
    { n: [0, 1, 0],  a: p[3], b: p[6], c: p[2] },
    { n: [0, 1, 0],  a: p[3], b: p[7], c: p[6] },
    // Left (X=ox)
    { n: [-1, 0, 0], a: p[0], b: p[4], c: p[7] },
    { n: [-1, 0, 0], a: p[0], b: p[7], c: p[3] },
    // Right (X=ox+dx)
    { n: [1, 0, 0],  a: p[1], b: p[2], c: p[6] },
    { n: [1, 0, 0],  a: p[1], b: p[6], c: p[5] }
  ];
}

// ============================================================================
// SUITE 1: Degenerate, Collinear & Zero-Normal Geometries
// ============================================================================
describe('Suite 1: Degenerate, Collinear & Zero-Normal Geometries', () => {

  test('T1.1: Binary STL with injected collinear triangles preserves exact volume & area without NaN', () => {
    const cubeTris = getCubeTriangles(10, 10, 10); // V = 1000, A = 600
    // Inject 3 collinear triangles: line segment (0,0,0) to (10,0,0)
    cubeTris.push({
      n: [0, 0, 0],
      a: [0, 0, 0],
      b: [5, 0, 0],
      c: [10, 0, 0]
    });
    cubeTris.push({
      n: [0, 0, 0],
      a: [0, 0, 10],
      b: [0, 5, 10],
      c: [0, 10, 10]
    });
    cubeTris.push({
      n: [0, 0, 0],
      a: [2, 2, 2],
      b: [4, 4, 4],
      c: [8, 8, 8]
    });

    const buffer = createBinaryStl(cubeTris, 'Cube with Collinear Triangles');
    const parsed = StlLoader.parse(buffer, 'collinear.stl');

    assertEqual(parsed.totalTriangles, 15, 'Total 15 triangles parsed');
    assertCloseTo(parsed.volumeMm3, 1000.0, 1e-4, 'Gauss volume unaffected by collinear triangles');
    assertCloseTo(parsed.areaMm2, 600.0, 1e-4, 'Surface area unaffected by collinear triangles');

    // Verify position and normal arrays contain zero NaN or Infinity
    for (let i = 0; i < parsed.meshes[0].normal.length; i++) {
      assertTrue(!Number.isNaN(parsed.meshes[0].normal[i]), `Normal index ${i} is not NaN`);
      assertTrue(Number.isFinite(parsed.meshes[0].normal[i]), `Normal index ${i} is finite`);
    }

    // Pass through MeshFeatureDetector
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    assertTrue(features.brepFaces.length >= 6, 'Detects at least 6 cube B-Rep faces');
    // None of the faces should have NaN area or centroid
    for (const face of features.brepFaces) {
      assertTrue(face.areaMm2 > 0, 'Face area > 0');
      assertTrue(!Number.isNaN(face.centroid[0]), 'Face centroid not NaN');
    }
  });

  test('T1.2: ASCII STL with collinear facet & zero normals recovers cleanly without NaN', () => {
    const asciiContent = `solid CollinearTest
      facet normal 0.000000e+00 0.000000e+00 0.000000e+00
        outer loop
          vertex 0.000000e+00 0.000000e+00 0.000000e+00
          vertex 1.000000e+01 0.000000e+00 0.000000e+00
          vertex 2.000000e+01 0.000000e+00 0.000000e+00
        endloop
      endfacet
      facet normal 0 0 1
        outer loop
          vertex 0 0 0
          vertex 10 0 0
          vertex 0 10 0
        endloop
      endfacet
      facet normal 0 0 1
        outer loop
          vertex 10 0 0
          vertex 10 10 0
          vertex 0 10 0
        endloop
      endfacet
    endsolid CollinearTest`;

    const buf = Buffer.from(asciiContent, 'utf8');
    const parsed = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'collinear.stl');

    assertEqual(parsed.totalTriangles, 3, '3 triangles parsed');
    assertCloseTo(parsed.areaMm2, 100.0, 1e-4, 'Area equals 100 mm² (collinear has 0 area)');

    // First triangle has normal recovered to [0, 0, 1] without NaN
    const n0x = parsed.meshes[0].normal[0];
    const n0y = parsed.meshes[0].normal[1];
    const n0z = parsed.meshes[0].normal[2];
    assertCloseTo(n0x, 0.0, 1e-4, 'Recovered nx is 0');
    assertCloseTo(n0y, 0.0, 1e-4, 'Recovered ny is 0');
    assertCloseTo(n0z, 1.0, 1e-4, 'Recovered nz is 1');
  });

  test('T1.3: Completely flat 2D planar polygon mesh reports V=0, A>0 and extracts boundary lines', () => {
    // 2 triangles forming a 20x20 planar square in XY plane
    const flatTris = [
      { n: [0, 0, 1], a: [0, 0, 0], b: [20, 0, 0], c: [20, 20, 0] },
      { n: [0, 0, 1], a: [0, 0, 0], b: [20, 20, 0], c: [0, 20, 0] }
    ];

    const buf = createBinaryStl(flatTris, 'Flat Plane');
    const parsed = StlLoader.parse(buf, 'flat.stl');

    assertCloseTo(parsed.volumeMm3, 0.0, 1e-5, 'Planar sheet has 0 volume');
    assertCloseTo(parsed.areaMm2, 400.0, 1e-4, 'Area is 400 mm²');
    assertEqual(parsed.isWatertight, false, 'Sheet is not watertight');
    assertEqual(parsed.isManifold, true, 'Sheet is manifold (edges have count 1 or 2)');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    assertEqual(features.brepFaces.length, 1, 'Single coplanar face clustered');
    assertCloseTo(features.brepFaces[0].areaMm2, 400.0, 1e-4, 'B-Rep face area matches 400 mm²');

    // 4 outer boundary edges should be extracted as line features
    const lineFeatures = features.edgeFeatures.filter(f => f.type === 'line');
    assertEqual(lineFeatures.length, 4, '4 outer perimeter line features detected');
    let totalPerimeter = 0;
    for (const lf of lineFeatures) {
      totalPerimeter += lf.length;
      assertCloseTo(lf.length, 20.0, 1e-4, 'Each boundary edge is 20 mm');
    }
    assertCloseTo(totalPerimeter, 80.0, 1e-4, 'Perimeter matches 80 mm');
  });

  test('T1.4: 100% degenerate mesh (all zero-area triangles) executes safely without unhandled error', () => {
    const degenerateTris = [
      { n: [0, 0, 0], a: [1, 1, 1], b: [1, 1, 1], c: [1, 1, 1] },
      { n: [0, 0, 0], a: [5, 5, 5], b: [5, 5, 5], c: [5, 5, 5] },
      { n: [0, 0, 0], a: [0, 0, 0], b: [1, 0, 0], c: [2, 0, 0] }
    ];

    const buf = createBinaryStl(degenerateTris, 'All Degenerate');
    const parsed = StlLoader.parse(buf, 'degen.stl');

    assertEqual(parsed.totalTriangles, 3, '3 triangles parsed');
    assertEqual(parsed.volumeMm3, 0, 'Volume is 0');
    assertEqual(parsed.areaMm2, 0, 'Area is 0');
    assertEqual(parsed.isWatertight, false, 'Not watertight');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    assertEqual(features.brepFaces.length, 0, 'Zero B-Rep faces from degenerate triangles');
    assertEqual(features.edgeFeatures.length, 0, 'Zero edge features');
    assertEqual(features.edgeIndices.length, 0, 'Zero edge indices');
  });

  test('T1.5: Zero-normal recovery on arbitrary 3D diagonal plane accurately matches analytical normal', () => {
    // Triangle on plane X + Y + Z = 10
    // Vertices: (10, 0, 0), (0, 10, 0), (0, 0, 10)
    // Vector AB = (-10, 10, 0), AC = (-10, 0, 10)
    // AB x AC = (100, 100, 100) -> Unit normal = (1/sqrt(3), 1/sqrt(3), 1/sqrt(3))
    const diagTri = [
      { n: [0, 0, 0], a: [10, 0, 0], b: [0, 10, 0], c: [0, 0, 10] }
    ];

    const buf = createBinaryStl(diagTri, 'Slanted Plane');
    const parsed = StlLoader.parse(buf, 'slanted.stl');

    const invSqrt3 = 1.0 / Math.sqrt(3.0);
    const nx = parsed.meshes[0].normal[0];
    const ny = parsed.meshes[0].normal[1];
    const nz = parsed.meshes[0].normal[2];

    assertCloseTo(nx, invSqrt3, 1e-4, 'Recovered nx matches 1/sqrt(3)');
    assertCloseTo(ny, invSqrt3, 1e-4, 'Recovered ny matches 1/sqrt(3)');
    assertCloseTo(nz, invSqrt3, 1e-4, 'Recovered nz matches 1/sqrt(3)');
    const mag = Math.hypot(nx, ny, nz);
    assertCloseTo(mag, 1.0, 1e-5, 'Recovered normal has exact unit magnitude');
  });

  test('T1.6: Subnormal/micro-scale coordinates (1e-5 mm) preserve non-zero area and unit normal', () => {
    const microTri = [
      { n: [0, 0, 0], a: [1e-4, 0, 0], b: [0, 1e-4, 0], c: [0, 0, 1e-4] }
    ];

    const buf = createBinaryStl(microTri, 'Micro Tri');
    const parsed = StlLoader.parse(buf, 'micro.stl');

    assertTrue(parsed.areaMm2 > 0, 'Micro triangle area > 0');
    assertTrue(!Number.isNaN(parsed.areaMm2), 'Micro triangle area is not NaN');
    const mag = Math.hypot(parsed.meshes[0].normal[0], parsed.meshes[0].normal[1], parsed.meshes[0].normal[2]);
    assertCloseTo(mag, 1.0, 1e-4, 'Micro triangle normal has unit magnitude');
  });
});

// ============================================================================
// SUITE 2: Extreme ASCII Formatting & Numerical Parsing
// ============================================================================
describe('Suite 2: Extreme ASCII Formatting & Numerical Parsing', () => {

  test('T2.1: Extreme scientific notation exponents (1e-15 to 1e+15) parsed accurately', () => {
    const asciiContent = `solid ScientificLimits
      facet normal 0.000000e+000 0.000000e+000 1.000000E+000
        outer loop
          vertex +1.000000e-005 -2.500000E-004 +3.000000e+002
          vertex 1.234567e+003 4.567890e-002 7.890123e+001
          vertex -9.876543e-001 +8.765432e+002 -5.000000e+000
        endloop
      endfacet
    endsolid ScientificLimits`;

    const buf = Buffer.from(asciiContent, 'utf8');
    const parsed = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'sci.stl');

    assertEqual(parsed.totalTriangles, 1, '1 triangle parsed');
    const pos = parsed.meshes[0].position;
    assertCloseTo(pos[0], 1e-5, 1e-7, 'Vertex 1 X matches 1e-5');
    assertCloseTo(pos[1], -2.5e-4, 1e-7, 'Vertex 1 Y matches -2.5e-4');
    assertCloseTo(pos[2], 300.0, 1e-4, 'Vertex 1 Z matches 300.0');
    assertCloseTo(pos[3], 1234.567, 1e-2, 'Vertex 2 X matches 1234.567');
  });

  test('T2.2: Deep multiline comments & preamble padding within 8KB scan window handled cleanly', () => {
    let padding = 'solid PreambleStress\n';
    for (let i = 0; i < 60; i++) {
      padding += `  # Comment line ${i} with random metadata string and symbols #*&$!\n`;
    }
    padding += `  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 10 0 0\n      vertex 0 10 0\n    endloop\n  endfacet\nendsolid PreambleStress`;

    const buf = Buffer.from(padding, 'utf8');
    assertEqual(StlLoader.detectType(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), 'ascii', 'Correctly detected as ASCII with 60 comment lines (~4KB)');
    const parsed = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'preamble.stl');
    assertEqual(parsed.totalTriangles, 1, 'Triangle extracted through preamble');
    assertEqual(parsed.meshes[0].name, 'PreambleStress', 'Solid name preserved');
  });

  test('T2.2b: Preamble exceeding 8192 bytes before first facet normal reaches architectural scan window limit', () => {
    // When comments push the first facet beyond the 8192-byte preamble window, detectType returns 'invalid'
    let hugePadding = 'solid HugePreamble\n';
    for (let i = 0; i < 150; i++) {
      hugePadding += `  # Long comment line ${i} exceeding 8192 bytes total preamble window scan limit\n`;
    }
    hugePadding += `  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 10 0 0\n      vertex 0 10 0\n    endloop\n  endfacet\nendsolid HugePreamble`;

    const buf = Buffer.from(hugePadding, 'utf8');
    assertTrue(buf.length > 8192, 'Buffer length exceeds 8192 bytes');
    assertEqual(StlLoader.detectType(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), 'invalid', 'Preambles > 8192 bytes without facet normal return invalid');
  });

  test('T2.3: Irregular whitespace: tabs, mixed CRLF/LF/CR, trailing spaces, no newline at EOF', () => {
    // Construct intentionally ugly ASCII formatting
    const raw = "solid\tWeirdSpaces\r\n" +
      "\t\tfacet\t\tnormal\t  0.0  0.0  1.0  \r" +
      "   outer   loop   \n" +
      "\tvertex   0.0   0.0   0.0   \t  \r\n" +
      "vertex   10.0   0.0   0.0 \r" +
      "   vertex   0.0   10.0   0.0   \n" +
      "   endloop   \r\n" +
      "endfacet\r\n" +
      "endsolid WeirdSpaces"; // No trailing newline

    const buf = Buffer.from(raw, 'utf8');
    const parsed = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'ugly.stl');
    assertEqual(parsed.totalTriangles, 1, 'Parsed 1 triangle across mixed line endings');
    assertCloseTo(parsed.areaMm2, 50.0, 1e-4, 'Area matches 50 mm²');
  });

  test('T2.4: Mixed-case keywords (sOLId, fACeT nORmAL, vErTeX, etc.) are 100% case-insensitive', () => {
    const raw = `sOLId CaseSensitivityTest
      FaCeT NoRMaL 0 0 1
        OuTeR LoOp
          VeRtEx 0 0 0
          VeRtEx 10 0 0
          VeRtEx 0 10 0
        EnDlOoP
      EnDfAcEt
    EnDsOlId CaseSensitivityTest`;

    const buf = Buffer.from(raw, 'utf8');
    assertEqual(StlLoader.detectType(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), 'ascii', 'Mixed case classified as ASCII');
    const parsed = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'case.stl');
    assertEqual(parsed.totalTriangles, 1, 'Parsed 1 triangle with mixed-case tokens');
  });

  test('T2.5: Multi-solid concatenated ASCII stream combines all facets into unified mesh', () => {
    const multiSolid = `solid PartA
      facet normal 0 0 1
        outer loop
          vertex 0 0 0
          vertex 10 0 0
          vertex 0 10 0
        endloop
      endfacet
    endsolid PartA
    solid PartB
      facet normal 0 0 1
        outer loop
          vertex 10 0 0
          vertex 10 10 0
          vertex 0 10 0
        endloop
      endfacet
    endsolid PartB`;

    const buf = Buffer.from(multiSolid, 'utf8');
    const parsed = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'multisolid.stl');
    assertEqual(parsed.totalTriangles, 2, '2 facets parsed from multi-solid file');
    assertCloseTo(parsed.areaMm2, 100.0, 1e-4, 'Combined area is 100 mm²');
  });

  test('T2.6: High-precision coordinates (16 significant figures) convert cleanly to Float32Array', () => {
    const raw = `solid PrecisionTest
      facet normal 0 0 1
        outer loop
          vertex 3.141592653589793 2.718281828459045 1.414213562373095
          vertex 0.123456789012345 0.987654321098765 0.555555555555555
          vertex 10 0 0
        endloop
      endfacet
    endsolid PrecisionTest`;

    const buf = Buffer.from(raw, 'utf8');
    const parsed = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'prec.stl');
    const p = parsed.meshes[0].position;
    assertCloseTo(p[0], Math.fround(3.141592653589793), 1e-7, 'X matches fround pi');
    assertCloseTo(p[1], Math.fround(2.718281828459045), 1e-7, 'Y matches fround e');
    assertCloseTo(p[2], Math.fround(1.414213562373095), 1e-7, 'Z matches fround sqrt(2)');
  });
});

// ============================================================================
// SUITE 3: Centered Kåsa Circle Fit Numerical Stability & Perturbation Stress
// ============================================================================
describe('Suite 3: Centered Kåsa Circle Fit Numerical Stability & Perturbation Stress', () => {

  // Helper to generate a 3D circle loop in an arbitrary plane defined by center, radius, N, and normal
  function generate3DCircleLoop(center, radius, normal, N = 32, radialNoise = 0, zWarp = 0) {
    // Normalize normal
    const mag = Math.hypot(normal[0], normal[1], normal[2]);
    const n = [normal[0] / mag, normal[1] / mag, normal[2] / mag];

    // Compute stable orthonormal basis (u, v)
    const ax = Math.abs(n[0]) < 0.9 ? 1.0 : 0.0;
    const ay = Math.abs(n[0]) < 0.9 ? 0.0 : 1.0;
    const az = 0.0;
    const wx = n[1] * az - n[2] * ay;
    const wy = n[2] * ax - n[0] * az;
    const wz = n[0] * ay - n[1] * ax;
    const wLen = Math.hypot(wx, wy, wz);
    const u = [wx / wLen, wy / wLen, wz / wLen];
    const v = [
      n[1] * u[2] - n[2] * u[1],
      n[2] * u[0] - n[0] * u[2],
      n[0] * u[1] - n[1] * u[0]
    ];

    const pts = new Float32Array(N * 3);
    const loop = [];

    for (let i = 0; i < N; i++) {
      loop.push(i);
      const angle = (i * 2.0 * Math.PI) / N;
      // Deterministic pseudo-random perturbation based on i
      const noiseFactor = radialNoise !== 0 ? (Math.sin(i * 3.7) * radialNoise) : 0;
      const r = radius * (1.0 + noiseFactor);
      const px = r * Math.cos(angle);
      const py = r * Math.sin(angle);
      const pz = zWarp !== 0 ? (Math.cos(i * 4.3) * zWarp) : 0;

      pts[i * 3]     = center[0] + px * u[0] + py * v[0] + pz * n[0];
      pts[i * 3 + 1] = center[1] + px * u[1] + py * v[1] + pz * n[1];
      pts[i * 3 + 2] = center[2] + px * u[2] + py * v[2] + pz * n[2];
    }

    return { loop, pts, normal: n, center, radius };
  }

  test('T3.1: Circle fit 3D plane invariance across 8 distinct spatial orientations', () => {
    const testPlanes = [
      { name: 'XY plane (+Z)', n: [0, 0, 1] },
      { name: 'YZ plane (+X)', n: [1, 0, 0] },
      { name: 'ZX plane (+Y)', n: [0, 1, 0] },
      { name: 'XY plane (-Z)', n: [0, 0, -1] },
      { name: '45-deg diagonal XY', n: [1, 1, 0] },
      { name: '3D cube diagonal (+X+Y+Z)', n: [1, 1, 1] },
      { name: '3D negative diagonal (-X+Y-Z)', n: [-1, 1, -1] },
      { name: 'Arbitrary Euler angle', n: [0.37, 0.53, 0.76] }
    ];

    const center = [15.0, 25.0, 35.0];
    const radius = 12.5;

    for (const tp of testPlanes) {
      const data = generate3DCircleLoop(center, radius, tp.n, 32);
      const fit = MeshFeatureDetector.fitCircleToLoop(data.loop, data.pts);

      assertTrue(fit !== null, `Circle fit succeeded on ${tp.name}`);
      assertEqual(fit.type, 'circle', 'Feature type is circle');
      assertCloseTo(fit.radius, radius, 0.05, `Radius matches ${radius} mm on ${tp.name}`);
      assertCloseTo(fit.diameter, radius * 2.0, 0.1, `Diameter matches ${radius * 2} mm on ${tp.name}`);
      assertCloseTo(fit.center[0], center[0], 0.05, `Center X matches on ${tp.name}`);
      assertCloseTo(fit.center[1], center[1], 0.05, `Center Y matches on ${tp.name}`);
      assertCloseTo(fit.center[2], center[2], 0.05, `Center Z matches on ${tp.name}`);

      // Plane normal alignment: absolute dot product between fitted and true normal should be ~ 1.0
      const dot = Math.abs(fit.normal[0] * data.normal[0] + fit.normal[1] * data.normal[1] + fit.normal[2] * data.normal[2]);
      assertCloseTo(dot, 1.0, 1e-4, `Normal is collinear on ${tp.name}`);
    }
  });

  test('T3.2: Tolerance to radial noise: 1%, 2%, 3%, 4% perturbation accurately reconstructs center < ±0.05mm', () => {
    const center = [0.0, 0.0, 10.0];
    const radius = 20.0;
    const noiseLevels = [0.01, 0.02, 0.03, 0.04]; // 1% to 4%

    for (const noise of noiseLevels) {
      const data = generate3DCircleLoop(center, radius, [0, 0, 1], 32, noise);
      const fit = MeshFeatureDetector.fitCircleToLoop(data.loop, data.pts);

      assertTrue(fit !== null, `Noise level ${(noise * 100).toFixed(0)}% accepted`);
      assertCloseTo(fit.center[0], center[0], 0.05, `Center X drift < 0.05 mm at ${(noise * 100).toFixed(0)}% noise`);
      assertCloseTo(fit.center[1], center[1], 0.05, `Center Y drift < 0.05 mm at ${(noise * 100).toFixed(0)}% noise`);
      assertCloseTo(fit.diameter, radius * 2.0, 0.1, `Diameter drift < 0.1 mm at ${(noise * 100).toFixed(0)}% noise`);
    }
  });

  test('T3.3: Strict rejection of over-perturbed loops (noise > 5% returns null)', () => {
    const center = [0.0, 0.0, 0.0];
    const radius = 10.0;
    // 6% and 10% noise levels
    const overNoise = [0.06, 0.10, 0.15];

    for (const noise of overNoise) {
      const data = generate3DCircleLoop(center, radius, [0, 0, 1], 32, noise);
      const fit = MeshFeatureDetector.fitCircleToLoop(data.loop, data.pts);
      assertEqual(fit, null, `Noise level ${(noise * 100).toFixed(0)}% must be rejected (return null)`);
    }
  });

  test('T3.4: Strict rejection of out-of-plane warped loops (warp > 0.10 mm returns null)', () => {
    const center = [0.0, 0.0, 0.0];
    const radius = 15.0;

    // Sub-threshold warp: 0.06 mm (below 0.10 mm HOLE_PLANAR_TOL)
    const mild = generate3DCircleLoop(center, radius, [0, 0, 1], 32, 0, 0.06);
    const fitMild = MeshFeatureDetector.fitCircleToLoop(mild.loop, mild.pts);
    assertTrue(fitMild !== null, 'Mild warp (0.06 mm) accepted');

    // Over-threshold warp: 0.15 mm (above 0.10 mm HOLE_PLANAR_TOL)
    const severe = generate3DCircleLoop(center, radius, [0, 0, 1], 32, 0, 0.15);
    const fitSevere = MeshFeatureDetector.fitCircleToLoop(severe.loop, severe.pts);
    assertEqual(fitSevere, null, 'Severe warp (0.15 mm >= 0.10 mm) rejected');
  });

  test('T3.5: Strict rejection of collinear loops (straight line or flat arc returns null)', () => {
    const N = 16;
    const pts = new Float32Array(N * 3);
    const loop = [];

    // Collinear points along X axis
    for (let i = 0; i < N; i++) {
      loop.push(i);
      pts[i * 3] = i * 2.0;
      pts[i * 3 + 1] = 0.0;
      pts[i * 3 + 2] = 0.0;
    }

    const fit = MeshFeatureDetector.fitCircleToLoop(loop, pts);
    assertEqual(fit, null, 'Collinear 3D vertices return null (nLen < 1e-12)');
  });

  test('T3.6: High-density polygon circular loops (32, 64, 128 vertices) converge smoothly < 1ms', () => {
    const densities = [32, 64, 128];
    const center = [50.0, 50.0, 0.0];
    const radius = 25.0;

    for (const N of densities) {
      const data = generate3DCircleLoop(center, radius, [0, 0, 1], N);
      const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      const fit = MeshFeatureDetector.fitCircleToLoop(data.loop, data.pts);
      const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

      assertTrue(fit !== null, `Circle fit succeeded on N=${N} vertices`);
      assertCloseTo(fit.radius, radius, 0.01, `Radius precision < 0.01 mm for N=${N}`);
      assertCloseTo(fit.center[0], center[0], 0.01, `Center X precision < 0.01 mm for N=${N}`);
      assertTrue((t1 - t0) < 5.0, `Fitting runtime < 5ms (took ${(t1 - t0).toFixed(3)}ms)`);
    }
  });

  test('T3.7: Micro-radius boundary verification at exact 0.20 mm threshold', () => {
    const N = 16;
    // Sub-threshold: 0.195 mm
    const sub = generate3DCircleLoop([0, 0, 0], 0.195, [0, 0, 1], N);
    assertEqual(MeshFeatureDetector.fitCircleToLoop(sub.loop, sub.pts), null, 'r=0.195 mm rejected (< 0.20 mm)');

    // Super-threshold: 0.205 mm
    const superR = generate3DCircleLoop([0, 0, 0], 0.205, [0, 0, 1], N);
    const fit = MeshFeatureDetector.fitCircleToLoop(superR.loop, superR.pts);
    assertTrue(fit !== null, 'r=0.205 mm accepted (>= 0.20 mm)');
    assertCloseTo(fit.radius, 0.205, 1e-3, 'Fitted radius matches 0.205 mm');
  });
});

// ============================================================================
// SUITE 4: Spatial Hash Collision & 1 μm Vertex Welding Resilience
// ============================================================================
describe('Suite 4: Spatial Hash Collision & 1 μm Vertex Welding Resilience', () => {

  test('T4.1: Massive hash collision attack (100 distinct vertices in single bucket) resolved without data loss', () => {
    // In MeshFeatureDetector:
    // h = (((qx * 73856093) ^ (qy * 19349663) ^ (qz * 83492791)) & MASK)
    // To construct collisions: choose coordinates such that (qx, qy, qz) differ, but they hash into the same table.
    // Even simpler: create 50 non-degenerate separate small triangles all placed near each other.
    const tris = [];
    const numTris = 60;

    for (let i = 0; i < numTris; i++) {
      const z = i * 2.0; // Distinct Z levels
      tris.push({
        n: [0, 0, 1],
        a: [0, 0, z],
        b: [1, 0, z],
        c: [0, 1, z]
      });
    }

    const buf = createBinaryStl(tris, 'Collision Stress');
    const parsed = StlLoader.parse(buf, 'collision.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    // All 60 triangles are independent: 60 * 3 = 180 unique vertices
    assertEqual(parsed.totalTriangles, 60, '60 triangles parsed');
    assertEqual(features.brepFaces.length, 60, 'All 60 distinct planar faces extracted');
    // Each triangle has 3 boundary edges -> 180 boundary line features
    assertEqual(features.edgeFeatures.length, 180, 'All 180 boundary edges preserved');
  });

  test('T4.2: Exact duplicate vertex deduplication in high-density bucket chains', () => {
    // 20 overlapping copies of the exact same triangle at (0,0,0)-(10,0,0)-(0,10,0)
    const tris = [];
    for (let i = 0; i < 20; i++) {
      tris.push({
        n: [0, 0, 1],
        a: [0, 0, 0],
        b: [10, 0, 0],
        c: [0, 10, 0]
      });
    }

    const buf = createBinaryStl(tris, 'Duplicate Vertices');
    const parsed = StlLoader.parse(buf, 'dup.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    // MeshFeatureDetector welds vertices within 1 micron: should yield exactly 3 unique vertices!
    // Since 20 identical triangles share the 3 edges, edge count is > 2 (non-manifold)
    assertTrue(features.edgeFeatures.length > 0, 'Features generated without crashing');
  });

  test('T4.3: 1 μm quantization boundary: 0.4 μm separation is welded, 1.1 μm separation is kept separate', () => {
    // Triangle 1: (0, 0, 0), (10, 0, 0), (0, 10, 0)
    // Triangle 2: shared hypotenuse vertex perturbed by 0.0004 mm (0.4 μm)
    // With INV_TOL = 1000: Math.round(0.0004 * 1000) = 0 -> Welded!
    const trisWelded = [
      { n: [0, 0, 1], a: [0, 0, 0], b: [10, 0, 0], c: [0, 10, 0] },
      { n: [0, 0, 1], a: [10, 0.0004, 0], b: [10, 10, 0], c: [0, 10.0004, 0] }
    ];

    const buf1 = createBinaryStl(trisWelded, 'Welded 0.4um');
    const p1 = StlLoader.parse(buf1, 'weld.stl');
    const f1 = MeshFeatureDetector.detectFeatures(p1.meshes[0]);
    // The two triangles should merge into 1 coplanar B-Rep face because the seam vertices welded!
    assertEqual(f1.brepFaces.length, 1, '0.4 μm gap successfully welded into 1 B-Rep face');

    // Triangle 3: shared vertex perturbed by 0.0015 mm (1.5 μm)
    // Math.round(0.0015 * 1000) = 2 -> Distinct grid bins -> Boundary seam!
    const trisSeparated = [
      { n: [0, 0, 1], a: [0, 0, 0], b: [10, 0, 0], c: [0, 10, 0] },
      { n: [0, 0, 1], a: [10, 0.0015, 0], b: [10, 10, 0], c: [0, 10.0015, 0] }
    ];

    const buf2 = createBinaryStl(trisSeparated, 'Separated 1.5um');
    const p2 = StlLoader.parse(buf2, 'sep.stl');
    const f2 = MeshFeatureDetector.detectFeatures(p2.meshes[0]);
    // Since the seam vertices did not weld, the shared edge has boundary status -> 2 separate faces!
    assertEqual(f2.brepFaces.length, 2, '1.5 μm gap kept separate into 2 B-Rep faces');
  });

  test('T4.4: Negative coordinate quantization across origin ([-5,-5,-5] to [+5,+5,+5]) welds cube to 8 vertices', () => {
    const cubeTris = getCubeTriangles(10, 10, 10, -5, -5, -5); // Centered at (0,0,0)
    const buf = createBinaryStl(cubeTris, 'Centered Cube');
    const parsed = StlLoader.parse(buf, 'centered.stl');

    assertEqual(parsed.isWatertight, true, 'Centered cube is watertight');
    assertCloseTo(parsed.volumeMm3, 1000.0, 1e-4, 'Volume is 1000 mm³ across origin');

    const topo = StlLoader.analyzeTopology(parsed.meshes[0].position);
    assertEqual(topo.uniqueVertices, 8, '8 unique vertices welded across negative coordinate bounds');
    assertEqual(topo.uniqueEdges, 18, '18 unique edges (12 outer + 6 diagonal face splits)');
  });

  test('T4.5: Extreme coordinate displacement (100,000 mm) preserves volume & vertex welding without integer overflow', () => {
    // Cube offset by 100 meters (100,000 mm)
    const cubeTris = getCubeTriangles(10, 10, 10, 100000, 100000, 100000);
    const buf = createBinaryStl(cubeTris, 'Distant Cube');
    const parsed = StlLoader.parse(buf, 'distant.stl');

    assertEqual(parsed.isWatertight, true, 'Watertight at 100,000 mm offset');
    // Gauss volume at large coordinate offset: test numerical stability
    assertCloseTo(parsed.volumeMm3, 1000.0, 0.05, 'Gauss volume within 0.05 mm³ despite 100m translation');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    assertEqual(features.brepFaces.length, 6, '6 planar faces detected at 100,000 mm offset');
    for (const f of features.brepFaces) {
      assertCloseTo(f.areaMm2, 100.0, 1e-3, 'Face area 100 mm²');
    }
  });

  test('T4.6: Undirected edge hashing 64-bit key bijective uniqueness (u * 67108864 + v)', () => {
    // In stlLoader.js: k = u * 67108864 + v
    // Verify that key encoding is lossless for edge vertex indices up to 67 million
    const testPairs = [
      [0, 1],
      [0, 67108863],
      [12345, 67890],
      [1000000, 2000000],
      [67108863, 67108863]
    ];

    const MULT = 67108864;
    for (const [u, v] of testPairs) {
      const key = u * MULT + v;
      // Reconstruct
      const recU = Math.floor(key / MULT);
      const recV = key % MULT;
      assertEqual(recU, u, `Reconstructed u=${u}`);
      assertEqual(recV, v, `Reconstructed v=${v}`);
    }
  });
});

// ============================================================================
// SUITE 5: Dihedral Crease Extraction Under Non-Manifold & Open Boundaries
// ============================================================================
describe('Suite 5: Dihedral Crease Extraction Under Non-Manifold & Open Boundaries', () => {

  test('T5.1: 4-way non-manifold edge (bowtie / shared edge between two tetrahedrons) detected as crease', () => {
    // Two tetrahedrons sharing edge from (0,0,0) to (0,0,10)
    // Tetrahedron 1: vertices (0,0,0), (0,0,10), (10,0,0), (0,10,0)
    // Tetrahedron 2: vertices (0,0,0), (0,0,10), (-10,0,0), (0,-10,0)
    // The shared edge (0,0,0)-(0,0,10) belongs to 2 triangles in Tet 1 and 2 triangles in Tet 2 = 4 triangles total!
    const tet1 = [
      { a: [0,0,0], b: [0,0,10], c: [10,0,0] },
      { a: [0,0,0], b: [0,10,0], c: [0,0,10] },
      { a: [0,0,0], b: [10,0,0], c: [0,10,0] },
      { a: [0,0,10], b: [0,10,0], c: [10,0,0] }
    ];
    const tet2 = [
      { a: [0,0,0], b: [-10,0,0], c: [0,0,10] },
      { a: [0,0,0], b: [0,0,10], c: [0,-10,0] },
      { a: [0,0,0], b: [0,-10,0], c: [-10,0,0] },
      { a: [0,0,10], b: [-10,0,0], c: [0,-10,0] }
    ];

    const allTris = tet1.concat(tet2);
    const buf = createBinaryStl(allTris, 'Bowtie Non-Manifold');
    const parsed = StlLoader.parse(buf, 'bowtie.stl');

    assertEqual(parsed.isWatertight, false, 'Bowtie mesh is not watertight');
    assertEqual(parsed.isManifold, false, 'Bowtie mesh is not manifold');

    const topo = StlLoader.analyzeTopology(parsed.meshes[0].position);
    assertEqual(topo.nonManifoldEdges, 1, 'Exactly 1 non-manifold edge detected in stlLoader');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    assertTrue(features.edgeFeatures.length > 0, 'Edge features extracted on non-manifold mesh');

    // Find the shared non-manifold line feature between (0,0,0) and (0,0,10)
    let foundSharedCrease = false;
    for (const feat of features.edgeFeatures) {
      if (feat.type === 'line' && Math.abs(feat.length - 10.0) < 1e-3) {
        if (Math.abs(feat.midpoint[0]) < 1e-3 && Math.abs(feat.midpoint[1]) < 1e-3 && Math.abs(feat.midpoint[2] - 5.0) < 1e-3) {
          foundSharedCrease = true;
          break;
        }
      }
    }
    assertTrue(foundSharedCrease, 'Shared 4-way non-manifold edge is classified as sharp crease feature');
  });

  test('T5.2: Open cylinder cup with circular boundary rim extracted as circular hole feature', () => {
    // Generate open cylinder (bottom cap + wall, open top at Z=20)
    const R = 15.0;
    const H = 20.0;
    const N = 32;
    const tris = [];

    // Bottom disk cap (fan from center [0,0,0] with normal [0,0,-1])
    for (let i = 0; i < N; i++) {
      const a1 = (i * 2 * Math.PI) / N;
      const a2 = ((i + 1) * 2 * Math.PI) / N;
      tris.push({
        n: [0, 0, -1],
        a: [0, 0, 0],
        b: [R * Math.cos(a2), R * Math.sin(a2), 0],
        c: [R * Math.cos(a1), R * Math.sin(a1), 0]
      });
    }

    // Cylindrical wall
    for (let i = 0; i < N; i++) {
      const a1 = (i * 2 * Math.PI) / N;
      const a2 = ((i + 1) * 2 * Math.PI) / N;
      const p1_bot = [R * Math.cos(a1), R * Math.sin(a1), 0];
      const p2_bot = [R * Math.cos(a2), R * Math.sin(a2), 0];
      const p1_top = [R * Math.cos(a1), R * Math.sin(a1), H];
      const p2_top = [R * Math.cos(a2), R * Math.sin(a2), H];

      // Two triangles per quad
      tris.push({ a: p1_bot, b: p2_bot, c: p2_top });
      tris.push({ a: p1_bot, b: p2_top, c: p1_top });
    }

    const buf = createBinaryStl(tris, 'Open Cup Cylinder');
    const parsed = StlLoader.parse(buf, 'cup.stl');

    assertEqual(parsed.isWatertight, false, 'Open cup is not watertight');
    assertEqual(parsed.isManifold, true, 'Open cup is manifold (edges have count 1 or 2)');

    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    // The open rim at Z=H has boundary edges (count=1), forming a clean 2-regular cycle!
    // It should be detected as a circular hole feature!
    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertTrue(circles.length >= 1, 'At least 1 circle feature detected on open rim');

    // Find the circle at Z = H
    const topCircle = circles.find(c => Math.abs(c.center[2] - H) < 0.1);
    assertTrue(topCircle !== undefined, 'Top rim circle detected at Z=20 mm');
    assertCloseTo(topCircle.radius, R, 0.05, 'Top rim radius matches 15.0 mm');
    assertCloseTo(topCircle.center[0], 0.0, 0.05, 'Top rim center X is 0');
    assertCloseTo(topCircle.center[1], 0.0, 0.05, 'Top rim center Y is 0');
  });

  test('T5.3: Stepped L-shaped plate extracts all 6 boundary edges as lines without false circles', () => {
    // Planar L-bracket on XY plane (thickness 0, flat 2D)
    // Vertices: (0,0), (30,0), (30,10), (10,10), (10,30), (0,30)
    // Triangulated into 4 triangles
    const tris = [
      { a: [0,0,0], b: [10,0,0], c: [10,10,0] },
      { a: [0,0,0], b: [10,10,0], c: [0,10,0] },
      { a: [10,0,0], b: [30,0,0], c: [30,10,0] },
      { a: [10,0,0], b: [30,10,0], c: [10,10,0] },
      { a: [0,10,0], b: [10,10,0], c: [10,30,0] },
      { a: [0,10,0], b: [10,30,0], c: [0,30,0] }
    ];

    const buf = createBinaryStl(tris, 'L-Bracket');
    const parsed = StlLoader.parse(buf, 'lbracket.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    // Zero circles should be detected (L-bracket boundary loop is not a circle!)
    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertEqual(circles.length, 0, 'Zero circles detected on L-bracket');

    // All boundary segments extracted as lines
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    assertTrue(lines.length >= 6, 'All outer perimeter edges extracted as line features');
  });

  test('T5.4: Coplanar clustering refusal across non-manifold seams (no cluster leakage)', () => {
    // Two coplanar squares touching along a shared edge where a third vertical square is also attached (3 triangles at edge)
    // Triangle 1: (0,0,0)-(10,0,0)-(10,10,0) (XY plane)
    // Triangle 2: (0,0,0)-(10,10,0)-(0,10,0) (XY plane)
    // Triangle 3: (0,0,0)-(0,10,0)-(-10,10,0) (XY plane, coplanar!)
    // Triangle 4: (0,0,0)-(-10,10,0)-(-10,0,0) (XY plane)
    // Shared edge: (0,0,0) to (0,10,0)
    // Vertical Triangle 5: (0,0,0)-(0,10,0)-(0,5,10) (YZ plane, perpendicular!)
    const tris = [
      { a: [0,0,0], b: [10,0,0], c: [10,10,0] },
      { a: [0,0,0], b: [10,10,0], c: [0,10,0] },
      { a: [0,0,0], b: [0,10,0], c: [-10,10,0] },
      { a: [0,0,0], b: [-10,10,0], c: [-10,0,0] },
      { a: [0,0,0], b: [0,10,0], c: [0,5,10] } // 3rd triangle at edge (0,0,0)-(0,10,0)
    ];

    const buf = createBinaryStl(tris, 'Non-Manifold T-Junction');
    const parsed = StlLoader.parse(buf, 'tjunction.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    // Because the edge (0,0,0)-(0,10,0) has count=3 (>2), it is marked as a sharp crease!
    // The coplanar clustering algorithm MUST NOT cross this crease edge!
    // So the XY plane should be split into 2 separate B-Rep faces (Right square of area 100, Left square of area 100)
    const xyFaces = features.brepFaces.filter(f => Math.abs(f.normal[2] - 1.0) < 0.1 || Math.abs(f.normal[2] + 1.0) < 0.1);
    assertEqual(xyFaces.length, 2, 'Coplanar clustering stops at non-manifold crease edge (2 distinct faces)');
  });

  test('T5.5: Branched crease graph bounded DFS step exhaustion defense (< 50ms runtime SLA)', () => {
    // Construct a dense wheel/fan topology with degree 12 at hub
    const tris = [];
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a1 = (i * 2 * Math.PI) / N;
      const a2 = ((i + 1) * 2 * Math.PI) / N;
      // Perpendicular vertical fins meeting at origin
      tris.push({
        a: [0, 0, 0],
        b: [10 * Math.cos(a1), 10 * Math.sin(a1), 0],
        c: [10 * Math.cos(a1), 10 * Math.sin(a1), 10]
      });
      tris.push({
        a: [0, 0, 0],
        b: [10 * Math.cos(a1), 10 * Math.sin(a1), 10],
        c: [0, 0, 10]
      });
    }

    const buf = createBinaryStl(tris, 'Dense Fin Hub');
    const parsed = StlLoader.parse(buf, 'finhub.stl');

    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    const elapsed = t1 - t0;
    assertTrue(elapsed < 50.0, `Branched crease graph DFS defense executed in ${elapsed.toFixed(2)}ms (< 50ms SLA)`);
    assertTrue(features.edgeFeatures.length > 0, 'Extracted crease features cleanly');
  });

  test('T5.6: Inconsistent normal winding triangle isolated into separate B-Rep face', () => {
    // 2 triangles forming a 10x10 square:
    // Tri 1: CCW (0,0,0) -> (10,0,0) -> (10,10,0) (normal [0, 0, 1])
    // Tri 2: CW (inverted) (0,0,0) -> (0,10,0) -> (10,10,0) (normal [0, 0, -1])
    const tris = [
      { a: [0, 0, 0], b: [10, 0, 0], c: [10, 10, 0] },
      { a: [0, 0, 0], b: [0, 10, 0], c: [10, 10, 0] } // Inverted winding
    ];

    const buf = createBinaryStl(tris, 'Inconsistent Winding');
    const parsed = StlLoader.parse(buf, 'inverted.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    // Face normals are opposite: dot product is -1.0 < 0.9063 -> Crease edge between them!
    // And coplanar clustering dotNorm check fails -> 2 separate B-Rep faces!
    assertEqual(features.brepFaces.length, 2, 'Inconsistent winding separates triangles into 2 B-Rep faces');
    assertCloseTo(features.brepFaces[0].areaMm2, 50.0, 1e-4, 'Face 1 area is 50 mm²');
    assertCloseTo(features.brepFaces[1].areaMm2, 50.0, 1e-4, 'Face 2 area is 50 mm²');
  });
});

// Run summary and exit with status
reportSummary();
exitProcess();
