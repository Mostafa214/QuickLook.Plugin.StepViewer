/**
 * Tier 1: Feature Coverage E2E Test Suite
 * File: tests/test_stl_e2e_tier1_features.js
 *
 * Implements requirement-driven, opaque-box E2E test cases across all 9 native STL features:
 * - F1: Binary STL header and length validation
 * - F2: Pure JS Binary STL parsing and normals
 * - F3: ASCII STL parsing and streaming loops
 * - F4: Watertight Gauss signed volume and area
 * - F5: Sharp crease edge detection > 25°
 * - F6: Circular hole loop detection & Kåsa fit
 * - F7: Measure Engine snap index integration
 * - F8: 3D printing materials & infill estimator
 * - F9: UI tool adaptations (explode disabling, blueprint, section)
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
  generateCylinder,
  generateSteppedBushing,
  generatePlateWithHole,
  generateMalformedStl,
  computeSignedVolume,
  computeSurfaceArea,
  computeFaceNormal
} = require('./stl_test_fixtures.js');

const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));
const MeshFeatureDetector = require(path.join(__dirname, '../Assets/js/meshFeatureDetector.js'));
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

console.log('================================================================================');
console.log('  TIER 1: FEATURE COVERAGE E2E TEST SUITE (F1 - F9)                             ');
console.log('================================================================================');

// ============================================================================
// FEATURE 1: Binary STL Header and Length Validation
// ============================================================================
describe('F1: Binary STL Header and Length Validation', () => {
  test('T1.F1.1: Standard 84-byte header + 50*N bytes matches exact binary length', () => {
    const fixture = generateCube({ size: 10, format: 'binary' });
    assertEqual(fixture.triangleCount, 12, 'Canonical cube must have 12 triangles');
    const expectedSize = 84 + 12 * 50; // 684 bytes
    assertEqual(fixture.buffer.byteLength, expectedSize, 'Buffer byteLength must equal 84 + 12*50');

    const detected = StlLoader.detectType(fixture.arrayBuffer);
    assertEqual(detected, 'binary', 'detectType must identify valid binary STL buffer');
  });

  test('T1.F1.2: 64-bit length math validates triangle count * 50 without overflow', () => {
    const buf = Buffer.alloc(84);
    buf.write('QuickLook Test Header', 0);
    // Write triangle count 2,000,000 (100,000,084 bytes in 64-bit)
    buf.writeUInt32LE(2000000, 80);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const count = view.getUint32(80, true);
    assertEqual(count, 2000000, 'Triangle count uint32 matches');
    const expectedBinarySize = 84 + count * 50;
    assertEqual(expectedBinarySize, 100000084, '64-bit integer length math produces 100,000,084 bytes');
  });

  test('T1.F1.3: Triangle count extraction and 50-byte stride verification', () => {
    const fixture = generateCube({ size: 15, format: 'binary' });
    const view = new DataView(fixture.arrayBuffer, 0, fixture.arrayBuffer.byteLength);
    const count = view.getUint32(80, true);
    assertEqual(count, 12, 'Offset 80 contains uint32LE triangle count 12');

    // Verify 50-byte stride across all 12 facets
    for (let i = 0; i < count; i++) {
      const facetOffset = 84 + i * 50;
      const attrBytes = view.getUint16(facetOffset + 48, true);
      assertEqual(attrBytes, 0, `Facet ${i} attribute byte count must be 0`);
    }
  });

  test('T1.F1.4: Strict binary format precedence when header starts with "solid"', () => {
    const fixture = generateMalformedStl('binary_with_ascii_solid_prefix');
    assertEqual(fixture.expectedFormat, 'STL_BINARY', 'Fixture specifies binary with solid prefix');
    const detected = StlLoader.detectType(fixture.arrayBuffer);
    assertEqual(detected, 'binary', 'Strict byte length check must take precedence over "solid" string');
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'binary_solid.stl');
    assertEqual(parsed.format, 'STL', 'Parsed format must be STL');
    assertEqual(parsed.totalTriangles, 12, 'Parsed triangle count must be 12');
  });

  test('T1.F1.5: Rejection of truncated buffers and length mismatch', () => {
    const trunc0 = generateMalformedStl('truncated_header_0');
    assertEqual(StlLoader.detectType(trunc0.arrayBuffer), 'invalid', '0-byte buffer detected as invalid');

    const trunc40 = generateMalformedStl('truncated_header_40');
    assertEqual(StlLoader.detectType(trunc40.arrayBuffer), 'invalid', '40-byte buffer detected as invalid');

    const mismatch = generateMalformedStl('count_mismatch_truncated');
    assertEqual(StlLoader.detectType(mismatch.arrayBuffer), 'invalid', 'Mismatched length detected as invalid');
    assertThrows(() => {
      StlLoader.parse(mismatch.arrayBuffer, 'mismatch.stl');
    }, /Invalid STL file/, 'Parsing mismatched length must throw');
  });
});

// ============================================================================
// FEATURE 2: Pure JS Binary STL Parsing and Normals
// ============================================================================
describe('F2: Pure JS Binary STL Parsing and Normals', () => {
  test('T1.2.1: Parses binary cube into position Float32Array (108 floats)', () => {
    const fixture = generateCube({ width: 10, depth: 20, height: 30, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube10x20x30.stl');
    assertEqual(parsed.meshes.length, 1, 'Exactly 1 mesh extracted');
    const mesh = parsed.meshes[0];
    assertTrue(mesh.position instanceof Float32Array, 'mesh.position is Float32Array');
    assertEqual(mesh.position.length, 12 * 9, 'Position array has 108 floats (12 * 9)');
  });

  test('T1.2.2: Generates valid unit normals (||n|| ≈ 1.0) on all facets', () => {
    const fixture = generateCube({ size: 10, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube.stl');
    const normals = parsed.meshes[0].normal;
    assertTrue(normals instanceof Float32Array, 'mesh.normal is Float32Array');
    assertEqual(normals.length, 108, 'Normal array has 108 floats');

    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
      const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
      assertCloseTo(mag, 1.0, 1e-3, `Normal vector at index ${i} must have unit magnitude`);
    }
  });

  test('T1.2.3: Reconstructs degenerate / zero (0,0,0) normals using cross product', () => {
    const zeroNormalsFixture = generateMalformedStl('zero_normals_binary');
    const parsed = StlLoader.parse(zeroNormalsFixture.arrayBuffer, 'zero_normals.stl');
    const normals = parsed.meshes[0].normal;
    assertEqual(normals.length, 108, 'Normal array has 108 floats');

    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
      const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
      assertCloseTo(mag, 1.0, 1e-3, `Reconstructed normal at index ${i} must have unit magnitude`);
      assertTrue(!Number.isNaN(nx) && !Number.isNaN(ny) && !Number.isNaN(nz), 'Normal coordinates must not be NaN');
    }
  });

  test('T1.2.4: Creates valid Three.js BufferGeometry with position & normal attributes', () => {
    const fixture = generateCube({ size: 10, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube.stl');
    const meshData = parsed.meshes[0];

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(meshData.position, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(meshData.normal, 3));

    assertEqual(geom.attributes.position.count, 36, 'BufferGeometry has 36 vertices');
    assertEqual(geom.attributes.normal.count, 36, 'BufferGeometry has 36 normals');
    geom.computeBoundingBox();
    assertEqual(geom.boundingBox.min.x, 0, 'Bounding box min x is 0');
    assertEqual(geom.boundingBox.max.x, 10, 'Bounding box max x is 10');
  });

  test('T1.2.5: Extracted vertex coordinates strictly match expected geometry bounds', () => {
    const fixture = generateCube({ width: 12, depth: 24, height: 36, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'box.stl');
    const bbox = parsed.meshes[0].bbox;

    assertCloseTo(bbox.min[0], 0, 1e-4, 'BBox min X');
    assertCloseTo(bbox.min[1], 0, 1e-4, 'BBox min Y');
    assertCloseTo(bbox.min[2], 0, 1e-4, 'BBox min Z');
    assertCloseTo(bbox.max[0], 12, 1e-4, 'BBox max X');
    assertCloseTo(bbox.max[1], 24, 1e-4, 'BBox max Y');
    assertCloseTo(bbox.max[2], 36, 1e-4, 'BBox max Z');
    assertCloseTo(bbox.size[0], 12, 1e-4, 'BBox size X');
    assertCloseTo(bbox.size[1], 24, 1e-4, 'BBox size Y');
    assertCloseTo(bbox.size[2], 36, 1e-4, 'BBox size Z');
  });
});

// ============================================================================
// FEATURE 3: ASCII STL Parsing and Streaming Loops
// ============================================================================
describe('F3: ASCII STL Parsing and Streaming Loops', () => {
  test('T1.3.1: Recognizes "solid <name>" preamble and correctly extracts solid name', () => {
    const fixture = generateCube({ size: 10, format: 'ascii', name: 'motor_mount_bracket' });
    assertTrue(fixture.asciiText.startsWith('solid motor_mount_bracket'), 'ASCII text starts with solid name');
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'test.stl');
    assertEqual(parsed.meshes[0].name, 'motor_mount_bracket', 'Extracted solid name matches');
  });

  test('T1.3.2: Parses facet normal with positive, negative, and zero components', () => {
    const fixture = generateCube({ size: 10, format: 'ascii' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'ascii_cube.stl');
    const normals = parsed.meshes[0].normal;
    assertEqual(normals.length, 108, 'Normal array has 108 floats');
    // Bottom face has normal [0, 0, -1]
    assertCloseTo(normals[0], 0.0, 1e-4, 'Bottom facet nx is 0');
    assertCloseTo(normals[1], 0.0, 1e-4, 'Bottom facet ny is 0');
    assertCloseTo(normals[2], -1.0, 1e-4, 'Bottom facet nz is -1');
  });

  test('T1.3.3: Iterates multiline outer loop / vertex triplets into contiguous positions array', () => {
    const fixture = generateTetrahedron({ edgeLength: 10, format: 'ascii' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'tetra.stl');
    assertEqual(parsed.totalTriangles, 4, 'Tetrahedron has 4 triangles');
    const pos = parsed.meshes[0].position;
    assertEqual(pos.length, 36, 'Position array has 36 floats (4 * 9)');
  });

  test('T1.3.4: Accurately parses standard floating point and scientific exponent notation', () => {
    const customAscii = [
      'solid scientific_notation_test',
      '  facet normal 0.000000e+00 0.000000e+00 1.000000e+00',
      '    outer loop',
      '      vertex 1.000000e+01 2.500000e+01 -5.000000e-01',
      '      vertex 2.000000e+01 2.500000e+01 -5.000000e-01',
      '      vertex 1.000000e+01 3.500000e+01 -5.000000e-01',
      '    endloop',
      '  endfacet',
      'endsolid scientific_notation_test'
    ].join('\n');
    const buf = Buffer.from(customAscii, 'utf8');
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    const parsed = StlLoader.parse(arrayBuffer, 'sci.stl');
    assertEqual(parsed.totalTriangles, 1, '1 triangle parsed');
    const pos = parsed.meshes[0].position;
    assertCloseTo(pos[0], 10.0, 1e-5, 'Vertex 1 x = 10.0');
    assertCloseTo(pos[1], 25.0, 1e-5, 'Vertex 1 y = 25.0');
    assertCloseTo(pos[2], -0.5, 1e-5, 'Vertex 1 z = -0.5');
  });

  test('T1.3.5: Case-insensitive token parsing (SOLID, Facet Normal, OUTER LOOP)', () => {
    const mixedCaseAscii = [
      'SOLID MixedCaseTest',
      '  FACET NORMAL 0.0 0.0 1.0',
      '    OUTER LOOP',
      '      VERTEX 0 0 0',
      '      VERTEX 10 0 0',
      '      VERTEX 0 10 0',
      '    ENDLOOP',
      '  ENDFACET',
      'ENDSOLID MixedCaseTest'
    ].join('\n');
    const buf = Buffer.from(mixedCaseAscii, 'utf8');
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    const detected = StlLoader.detectType(arrayBuffer);
    assertEqual(detected, 'ascii', 'Uppercase ASCII STL correctly detected');
    const parsed = StlLoader.parse(arrayBuffer, 'mixed.stl');
    assertEqual(parsed.totalTriangles, 1, '1 triangle parsed');
    assertEqual(parsed.meshes[0].name, 'MixedCaseTest', 'Solid name extracted');
  });
});

// ============================================================================
// FEATURE 4: Watertight Gauss Signed Volume and Area
// ============================================================================
describe('F4: Watertight Gauss Signed Volume and Area', () => {
  test('T1.4.1: Signed Gauss volume for watertight cube matches theoretical S^3 within < 0.01%', () => {
    const S = 20;
    const fixture = generateCube({ size: S, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube20.stl');
    const expectedVol = S * S * S; // 8000 mm^3
    assertCloseTo(parsed.volumeMm3, expectedVol, expectedVol * 0.0001, 'Gauss volume matches 8000 mm³ within 0.01%');
    assertTrue(parsed.isWatertight, 'Cube is watertight');
  });

  test('T1.4.2: Regular tetrahedron signed volume matches theoretical L^3 / (6*sqrt(2)) within < 0.01%', () => {
    const L = 10;
    const fixture = generateTetrahedron({ edgeLength: L, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'tetra10.stl');
    const expectedVol = (L * L * L) / (6 * Math.SQRT2); // ~117.85113 mm^3
    assertCloseTo(parsed.volumeMm3, expectedVol, expectedVol * 0.0001, 'Gauss volume matches tetrahedron within 0.01%');
    assertTrue(parsed.isWatertight, 'Tetrahedron is watertight');
  });

  test('T1.4.3: Translation invariance: moving mesh by (+100, +200, +300) leaves volume unchanged', () => {
    const baseFixture = generateCube({ size: 10, format: 'binary' });
    const baseParsed = StlLoader.parse(baseFixture.arrayBuffer, 'base.stl');

    // Translate all vertices
    const translatedTriangles = baseFixture.triangles.map(t =>
      t.map(v => [v[0] + 100, v[1] + 200, v[2] + 300])
    );
    const translatedVol = computeSignedVolume(translatedTriangles);
    assertCloseTo(translatedVol, baseParsed.volumeMm3, 1e-4, 'Gauss volume invariant under 3D translation');
  });

  test('T1.4.4: Accumulated surface area matches exact theoretical polyhedral surface area', () => {
    const S = 10;
    const cubeFixture = generateCube({ size: S, format: 'binary' });
    const parsed = StlLoader.parse(cubeFixture.arrayBuffer, 'cube.stl');
    const expectedArea = 6 * S * S; // 600 mm^2
    assertCloseTo(parsed.areaMm2, expectedArea, 1e-3, 'Surface area matches 600 mm²');

    const L = 10;
    const tetraFixture = generateTetrahedron({ edgeLength: L, format: 'binary' });
    const tetraParsed = StlLoader.parse(tetraFixture.arrayBuffer, 'tetra.stl');
    const expectedTetraArea = Math.sqrt(3) * L * L; // ~173.205 mm^2
    assertCloseTo(tetraParsed.areaMm2, expectedTetraArea, 1e-3, 'Surface area matches tetrahedron');
  });

  test('T1.4.5: Non-watertight / open mesh detection accurately flags isWatertight === false', () => {
    const hollowBox = generateHollowBox({ size: 10, format: 'binary' });
    const parsed = StlLoader.parse(hollowBox.arrayBuffer, 'hollow_box.stl');
    assertEqual(parsed.totalTriangles, 10, 'Hollow box has 10 triangles');
    assertEqual(parsed.isWatertight, false, 'Hollow box must have isWatertight === false');
  });
});

// ============================================================================
// FEATURE 5: Sharp Crease Edge Detection > 25°
// ============================================================================
describe('F5: Sharp Crease Edge Detection > 25°', () => {
  test('T1.5.1: Rectilinear cube: all 12 orthogonal edges (90° dihedral) are sharp creases', () => {
    const fixture = generateCube({ size: 10, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    assertEqual(lines.length, 12, 'Canonical cube must have exactly 12 sharp crease lines');
    for (const line of lines) {
      assertCloseTo(line.length, 10, 1e-3, 'Each cube crease edge length is 10 mm');
    }
  });

  test('T1.5.2: Regular tetrahedron: all 6 edges (~70.53° dihedral > 25°) are sharp creases', () => {
    const fixture = generateTetrahedron({ edgeLength: 10, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'tetra.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    assertEqual(lines.length, 6, 'Regular tetrahedron must have exactly 6 sharp crease lines');
    for (const line of lines) {
      assertCloseTo(line.length, 10, 1e-3, 'Each tetrahedron edge length is 10 mm');
    }
  });

  test('T1.5.3: Cylinder cap rims (90° dihedral) are identified as crease/circle features', () => {
    const fixture = generateCylinder({ radius: 10, height: 20, segments: 32, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cylinder.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertEqual(circles.length, 2, 'Cylinder must have exactly 2 circular rim features');
    for (const c of circles) {
      assertCloseTo(c.diameter, 20, 0.05, 'Circle diameter is 20 mm');
    }
  });

  test('T1.5.4: Cylinder side mantle edges (11.25° <= 25°) are suppressed from crease features', () => {
    const fixture = generateCylinder({ radius: 10, height: 20, segments: 32, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cylinder.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    // Circles take the 32 chord segments each; mantle edges must NOT produce line features
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    assertEqual(lines.length, 0, 'Smooth mantle facets (11.25° dihedral) must produce 0 line creases');
  });

  test('T1.5.5: Crease 3D midpoints are accurately computed at (start + end)/2', () => {
    const fixture = generateCube({ size: 20, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    for (const l of lines) {
      const expectedMid = [
        (l.start[0] + l.end[0]) / 2,
        (l.start[1] + l.end[1]) / 2,
        (l.start[2] + l.end[2]) / 2
      ];
      assertCloseTo(l.midpoint[0], expectedMid[0], 1e-4, 'Midpoint X');
      assertCloseTo(l.midpoint[1], expectedMid[1], 1e-4, 'Midpoint Y');
      assertCloseTo(l.midpoint[2], expectedMid[2], 1e-4, 'Midpoint Z');
    }
  });
});

// ============================================================================
// FEATURE 6: Circular Hole Loop Detection & Kåsa Fit
// ============================================================================
describe('F6: Circular Hole Loop Detection & Kåsa Fit', () => {
  test('T1.6.1: Closed 32-segment circular hole extraction identifies type: "circle"', () => {
    const fixture = generatePlateWithHole({ width: 40, length: 40, thickness: 10, holeRadius: 8, segments: 32, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'plate.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertTrue(circles.length >= 2, 'Top and bottom rims of through-hole extracted');
    for (const c of circles) {
      assertEqual(c.type, 'circle', 'Feature type is circle');
      assertTrue(c.isClosed, 'Circle is closed');
    }
  });

  test('T1.6.2: Centered Kåsa algebraic circle fit calculates diameter within ±0.05 mm', () => {
    const fixture = generatePlateWithHole({ width: 40, length: 40, thickness: 10, holeRadius: 8, segments: 32, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'plate.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    for (const c of circles) {
      assertCloseTo(c.diameter, 16.0, 0.05, 'Diameter Ø 16.0 mm within ±0.05 mm');
    }
  });

  test('T1.6.3: Centered Kåsa circle fit calculates center coordinates within ±0.05 mm', () => {
    const fixture = generatePlateWithHole({ width: 40, length: 40, thickness: 10, holeRadius: 8, segments: 32, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'plate.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    for (const c of circles) {
      assertCloseTo(c.center[0], 0.0, 0.05, 'Hole center X within ±0.05 mm');
      assertCloseTo(c.center[1], 0.0, 0.05, 'Hole center Y within ±0.05 mm');
      assertTrue(Math.abs(c.center[2] - 0) < 0.05 || Math.abs(c.center[2] - 10) < 0.05, 'Hole center Z matches plate face');
    }
  });

  test('T1.6.4: Newell plane normal correctly identifies hole plane normal vector', () => {
    const fixture = generatePlateWithHole({ width: 40, length: 40, thickness: 10, holeRadius: 8, segments: 32, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'plate.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    for (const c of circles) {
      assertCloseTo(c.normal[0], 0.0, 0.05, 'Normal X is 0');
      assertCloseTo(c.normal[1], 0.0, 0.05, 'Normal Y is 0');
      assertCloseTo(Math.abs(c.normal[2]), 1.0, 0.05, 'Normal Z magnitude is 1');
    }
  });

  test('T1.6.5: Identifies both top and bottom circular rims of through-holes', () => {
    const fixture = generateSteppedBushing({ flangeRadius: 30, neckRadius: 18, boreRadius: 10, segments: 32, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'bushing.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    const circles = features.edgeFeatures.filter(f => f.type === 'circle');
    assertTrue(circles.length >= 2, 'At least 2 bore circles detected');
    const boreCircles = circles.filter(c => Math.abs(c.diameter - 20) < 0.1);
    assertEqual(boreCircles.length, 2, 'Exactly 2 bore circles of Ø 20 mm detected');
  });
});

// ============================================================================
// FEATURE 7: Measure Engine Snap Index Integration
// ============================================================================
describe('F7: Measure Engine Snap Index Integration', () => {
  test('T1.7.1: Detected circle and line features are injected into modelEdgeFeatures', () => {
    const env = createCadEnvironment({ loadCadState: true, loadFeatureDetector: true, loadMeasureEngine: true });
    const fixture = generatePlateWithHole({ width: 40, length: 40, thickness: 10, holeRadius: 8, segments: 32, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'plate.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);

    env.context.modelEdgeFeatures = features.edgeFeatures;
    env.window.modelEdgeFeatures = features.edgeFeatures;
    const edgeFeats = env.context.modelEdgeFeatures || env.window.modelEdgeFeatures;
    assertTrue(edgeFeats.length > 0, 'modelEdgeFeatures populated');
    const hasCircles = edgeFeats.some(f => f.type === 'circle');
    assertTrue(hasCircles, 'modelEdgeFeatures contains circular hole feature');
  });

  test('T1.7.2: indexModelVertices([mesh]) populates modelCadVertices without errors', () => {
    const env = createCadEnvironment({ loadCadState: true, loadFeatureDetector: true, loadMeasureEngine: true });
    const fixture = generateCube({ size: 10, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    env.context.modelEdgeFeatures = features.edgeFeatures;
    env.window.modelEdgeFeatures = features.edgeFeatures;

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.window.indexModelVertices([mesh]);
    const vertices = env.context.modelCadVertices || env.window.modelCadVertices;
    assertTrue(vertices.length > 0, 'modelCadVertices populated from edge features');
  });

  test('T1.7.3: Hole center snap target exists with subType: "center" at circle center', () => {
    const env = createCadEnvironment({ loadCadState: true, loadFeatureDetector: true, loadMeasureEngine: true });
    const fixture = generatePlateWithHole({ width: 40, length: 40, thickness: 10, holeRadius: 8, segments: 32, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'plate.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    env.context.modelEdgeFeatures = features.edgeFeatures;
    env.window.modelEdgeFeatures = features.edgeFeatures;

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.window.indexModelVertices([mesh]);

    const vertices = env.context.modelCadVertices || env.window.modelCadVertices;
    const centers = vertices.filter(v => v.subType === 'center');
    assertTrue(centers.length >= 1, 'Hole center snap point exists in modelCadVertices');
    assertCloseTo(centers[0].point.x, 0.0, 0.05, 'Snap point X is 0');
    assertCloseTo(centers[0].point.y, 0.0, 0.05, 'Snap point Y is 0');
  });

  test('T1.7.4: Crease edge midpoint snap target exists with subType: "midpoint"', () => {
    const env = createCadEnvironment({ loadCadState: true, loadFeatureDetector: true, loadMeasureEngine: true });
    const fixture = generateCube({ size: 20, format: 'binary' });
    const parsed = StlLoader.parse(fixture.arrayBuffer, 'cube.stl');
    const features = MeshFeatureDetector.detectFeatures(parsed.meshes[0]);
    env.context.modelEdgeFeatures = features.edgeFeatures;
    env.window.modelEdgeFeatures = features.edgeFeatures;

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.window.indexModelVertices([mesh]);

    const vertices = env.context.modelCadVertices || env.window.modelCadVertices;
    const midpoints = vertices.filter(v => v.subType === 'midpoint');
    assertEqual(midpoints.length, 12, '12 crease edge midpoints indexed');
  });

  test('T1.7.5: Dual-hole center pitch dimensioning computes exact Euclidean distance', () => {
    const env = createCadEnvironment({ loadCadState: true, loadFeatureDetector: true, loadMeasureEngine: true });
    env.context.renderer = env.renderer;
    env.context.camera = env.camera;
    env.context.isMeasureActive = true;

    const mesh = new env.THREE.Mesh(new env.THREE.BufferGeometry(), new env.THREE.MeshBasicMaterial());
    env.context.modelGroup.add(mesh);

    // Two circular hole features forming a 30-40-50 right triangle (c1 at [0, 0, 10], c2 at [30, 40, 10])
    const c1Feat = {
      type: 'circle',
      radius: 5.0,
      diameter: 10.0,
      center: [0, 0, 10],
      normal: [0, 0, 1],
      isClosed: true,
      isHole: true
    };
    const c2Feat = {
      type: 'circle',
      radius: 5.0,
      diameter: 10.0,
      center: [30, 40, 10],
      normal: [0, 0, 1],
      isClosed: true,
      isHole: true
    };
    env.context.modelEdgeFeatures = [c1Feat, c2Feat];
    env.context.indexModelVertices([mesh]);

    // Screen-space raycast projection to find snap targets for both holes
    const rect = env.renderer.domElement.getBoundingClientRect();
    const proj1 = new env.THREE.Vector3(...c1Feat.center).project(env.camera);
    const px1 = (proj1.x * 0.5 + 0.5) * rect.width + rect.left;
    const py1 = (-proj1.y * 0.5 + 0.5) * rect.height + rect.top;
    const snap1 = env.context.findSnapTarget({ clientX: px1, clientY: py1 });

    const proj2 = new env.THREE.Vector3(...c2Feat.center).project(env.camera);
    const px2 = (proj2.x * 0.5 + 0.5) * rect.width + rect.left;
    const py2 = (-proj2.y * 0.5 + 0.5) * rect.height + rect.top;
    const snap2 = env.context.findSnapTarget({ clientX: px2, clientY: py2 });

    assertTrue(snap1 !== null, 'Hole 1 center snap target found');
    assertTrue(snap2 !== null, 'Hole 2 center snap target found');

    // Trigger dual hole measurement via measureEngine handleUnifiedClick
    env.context.handleUnifiedClick(snap1);
    env.context.handleUnifiedClick(snap2);

    const titleEl = env.document.getElementById('measure-card-title');
    const distEl = env.document.getElementById('measure-dist');
    const deltasEl = env.document.getElementById('measure-deltas');

    assertEqual(titleEl.innerText, '⭕ Center-to-Center Holes (Pitch)', 'Card title indicates hole pitch analysis');
    assertEqual(distEl.innerText, 'Pitch: 50.00 mm', 'Center pitch is 50.00 mm via measureEngine');
    assertTrue(deltasEl.innerHTML.includes('30.00') && deltasEl.innerHTML.includes('40.00'), 'Deltas contain ΔX: 30.00 and ΔY: 40.00');
  });
});

// ============================================================================
// FEATURE 8: 3D Printing Materials & Infill Estimator
// ============================================================================
describe('F8: 3D Printing Materials & Infill Estimator', () => {
  const cubeVolMm3 = 8000; // 20x20x20 mm cube = 8 cm^3

  test('T1.8.1: Standard 3D printing filament densities verified in MaterialsEngine', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    const allMaterials = env.window.MaterialsEngine.getAllMaterials();
    assertTrue(Array.isArray(allMaterials) && allMaterials.length > 0, 'MaterialsEngine returns material list');

    const pla = allMaterials.find(m => m.id === 'pla');
    const petg = allMaterials.find(m => m.id === 'petg');
    const abs = allMaterials.find(m => m.id === 'abs');
    const tpu = allMaterials.find(m => m.id === 'tpu');
    const resin = allMaterials.find(m => m.id === 'resin');

    assertTrue(pla !== undefined, 'PLA exists in materials library');
    assertEqual(pla.density, 1.24, 'PLA density 1.24 g/cm³');

    assertTrue(petg !== undefined, 'PETG exists in materials library');
    assertEqual(petg.density, 1.27, 'PETG density 1.27 g/cm³');

    assertTrue(abs !== undefined, 'ABS exists in materials library');
    assertEqual(abs.density, 1.04, 'ABS density 1.04 g/cm³');

    assertTrue(tpu !== undefined, 'TPU exists in materials library');
    assertEqual(tpu.density, 1.21, 'TPU density 1.21 g/cm³');

    assertTrue(resin !== undefined, 'Resin exists in materials library');
    assertEqual(resin.density, 1.15, 'Resin density 1.15 g/cm³');
  });

  test('T1.8.2: Infill volume scaling and print metrics verified across 15%, 20%, 50%, 100%', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.window.activeCadFormat = 'STL';
    env.context.modelPhysicalProps = { volumeMm3: cubeVolMm3, areaMm2: 2400 };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;
    env.window.MaterialsEngine.selectMaterial('pla');

    // 100% Infill: effective vol = 8000 mm³ = 8.00 cm³, mass = 8 * 1.24 = 9.92 g
    env.window.MaterialsEngine.setInfill(100);
    assertEqual(env.window.MaterialsEngine.getInfill(), 100, 'Infill set to 100%');
    const m100 = env.window.MaterialsEngine.getPrintMetrics();
    assertEqual(m100.effectiveVolMm3, 8000, '100% effective volume 8000 mm³');
    assertEqual(env.window.formatVol(m100.effectiveVolMm3), '8.00 cm³', '100% infill formatted volume');
    assertCloseTo(m100.massGrams, 9.92, 1e-4, '100% infill mass is 9.92 g');

    // 50% Infill: effective vol = 4000 mm³ = 4.00 cm³, mass = 4 * 1.24 = 4.96 g
    env.window.MaterialsEngine.setInfill(50);
    assertEqual(env.window.MaterialsEngine.getInfill(), 50, 'Infill set to 50%');
    const m50 = env.window.MaterialsEngine.getPrintMetrics();
    assertEqual(m50.effectiveVolMm3, 4000, '50% effective volume 4000 mm³');
    assertEqual(env.window.formatVol(m50.effectiveVolMm3), '4.00 cm³', '50% infill formatted volume');
    assertCloseTo(m50.massGrams, 4.96, 1e-4, '50% infill mass is 4.96 g');

    // 20% Infill: effective vol = 1600 mm³ = 1.60 cm³, mass = 1.6 * 1.24 = 1.984 g
    env.window.MaterialsEngine.setInfill(20);
    assertEqual(env.window.MaterialsEngine.getInfill(), 20, 'Infill set to 20%');
    const m20 = env.window.MaterialsEngine.getPrintMetrics();
    assertEqual(m20.effectiveVolMm3, 1600, '20% effective volume 1600 mm³');
    assertEqual(env.window.formatVol(m20.effectiveVolMm3), '1.60 cm³', '20% infill formatted volume');
    assertCloseTo(m20.massGrams, 1.984, 1e-4, '20% infill mass is 1.984 g');

    // 15% Infill: effective vol = 1200 mm³ = 1.20 cm³, mass = 1.2 * 1.24 = 1.488 g
    env.window.MaterialsEngine.setInfill(15);
    assertEqual(env.window.MaterialsEngine.getInfill(), 15, 'Infill set to 15%');
    const m15 = env.window.MaterialsEngine.getPrintMetrics();
    assertEqual(m15.effectiveVolMm3, 1200, '15% effective volume 1200 mm³');
    assertEqual(env.window.formatVol(m15.effectiveVolMm3), '1.20 cm³', '15% infill formatted volume');
    assertCloseTo(m15.massGrams, 1.488, 1e-4, '15% infill mass is 1.488 g');

    // Unit switching to inches
    env.window.toggleUnits();
    const in3Expected = `${(8000 / 16387.064).toFixed(3)} in³`;
    assertEqual(env.window.formatVol(8000), in3Expected, 'Inches formatVol');
  });

  test('T1.8.3: Mass calculation matches M = (V_eff / 1000) * density across materials', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.context.modelPhysicalProps = { volumeMm3: cubeVolMm3, areaMm2: 2400, bbox: { x: 20, y: 20, z: 20 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;

    // 1. PLA (1.24 g/cm³): 8 cm³ * 1.24 g/cm³ = 9.92 g = 0.00992 kg
    env.window.MaterialsEngine.selectMaterial('pla');
    const massKgPLA = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massKgPLA, 0.00992, 1e-5, 'PLA mass = 8 * 1.24 = 9.92 g');
    assertEqual(env.window.formatMass(massKgPLA), '9.9 g', 'formatMass formatted PLA grams');

    // 2. PETG (1.27 g/cm³): 8 cm³ * 1.27 g/cm³ = 10.16 g = 0.01016 kg
    env.window.MaterialsEngine.selectMaterial('petg');
    const massKgPETG = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massKgPETG, 0.01016, 1e-5, 'PETG mass = 8 * 1.27 = 10.16 g');
    assertEqual(env.window.formatMass(massKgPETG), '10.2 g', 'formatMass formatted PETG grams');

    // 3. ABS (1.04 g/cm³): 8 cm³ * 1.04 g/cm³ = 8.32 g = 0.00832 kg
    env.window.MaterialsEngine.selectMaterial('abs');
    const massKgABS = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massKgABS, 0.00832, 1e-5, 'ABS mass = 8 * 1.04 = 8.32 g');
    assertEqual(env.window.formatMass(massKgABS), '8.3 g', 'formatMass formatted ABS grams');
  });

  test('T1.8.4: Physical properties card updates DOM elements with watertight volume, mass, and print estimates', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });
    env.window.activeCadFormat = 'STL';
    env.context.modelPhysicalProps = { volumeMm3: 1000000, areaMm2: 60000, bbox: { x: 100, y: 100, z: 100 } };
    env.window.modelPhysicalProps = env.context.modelPhysicalProps;
    env.window.MaterialsEngine.selectMaterial('pla');
    env.window.MaterialsEngine.setInfill(20);

    // Infill 20%: effective volume = 200,000 mm³ = 200 cm³ * 1.24 = 248 g = 0.248 kg
    const massKg = env.window.MaterialsEngine.getTotalMassKg();
    assertCloseTo(massKg, 0.248, 1e-4, 'Total mass at 20% infill is 0.248 kg');
    assertEqual(env.window.formatMass(massKg), '248.0 g', 'formatMass displays grams for < 1kg');

    env.window.updatePhysicalPropertiesCard();
    const propVol = env.document.getElementById('prop-vol');
    assertTrue(propVol !== null && propVol.innerText.includes('1000.00 cm³'), 'prop-vol displays volume in cm³');
    const bannerWeight = env.document.getElementById('active-mat-weight');
    assertEqual(bannerWeight.innerText, '248.0 g', 'active-mat-weight banner reflects mass');

    // Verify 3D print estimator metrics in DOM
    const printMass = env.document.getElementById('print-est-mass');
    assertEqual(printMass.innerText, '248.0 g', 'print-est-mass reflects 20% infill PLA mass');
    const printLength = env.document.getElementById('print-est-length');
    assertEqual(printLength.innerText, '83.15 m', 'print-est-length reflects 1.75mm filament meters');
    const printSpool = env.document.getElementById('print-est-spool');
    assertEqual(printSpool.innerText, '24.8% of 1kg', 'print-est-spool reflects 1kg spool percentage');
  });

  test('T1.8.5: Material selection updates active material name and density', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true });

    env.window.MaterialsEngine.selectMaterial('pla');
    assertEqual(env.window.MaterialsEngine.getSelectedMaterialName(), 'PLA (Polylactic Acid)', 'PLA selected');

    env.window.MaterialsEngine.selectMaterial('petg');
    assertEqual(env.window.MaterialsEngine.getSelectedMaterialName(), 'PETG Copolyester', 'PETG selected');

    env.window.MaterialsEngine.selectMaterial('abs');
    assertEqual(env.window.MaterialsEngine.getSelectedMaterialName(), 'ABS Polymer', 'ABS selected');

    env.window.MaterialsEngine.selectMaterial('al_6061');
    assertEqual(env.window.MaterialsEngine.getSelectedMaterialName(), 'Aluminum 6061-T6', 'Alloy selected');
    assertEqual(env.window.MaterialsEngine.getSelectedMaterial().density, 2.70, 'Alloy density 2.70 g/cm³');
  });
});

// ============================================================================
// FEATURE 9: UI Tool Adaptations
// ============================================================================
describe('F9: UI Tool Adaptations', () => {
  test('T1.9.1: Single-body STL disables #btn-explode action (opacity 0.45)', () => {
    const env = createCadEnvironment({ loadCadState: true, loadExplodedView: true, loadAssemblyTree: true });
    const geom = new env.THREE.BoxGeometry(10, 10, 10);
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    env.context.modelBodies = [{ id: 1, name: 'STL_Part', mesh: mesh, data: { volumeMm3: 1000 } }];
    env.window.modelBodies = env.context.modelBodies;

    env.window.buildModelTree();
    const btnExplode = env.document.getElementById('btn-explode');
    assertTrue(btnExplode !== null, '#btn-explode exists');
    assertEqual(btnExplode.style.opacity, '0.45', '#btn-explode opacity is 0.45 for single body');
  });

  test('T1.9.2: Tooltip on #btn-explode indicates exploded view requires 2+ parts', () => {
    const env = createCadEnvironment({ loadCadState: true, loadExplodedView: true, loadAssemblyTree: true });
    const geom = new env.THREE.BoxGeometry(10, 10, 10);
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    env.context.modelBodies = [{ id: 1, name: 'STL_Part', mesh: mesh, data: { volumeMm3: 1000 } }];
    env.window.modelBodies = env.context.modelBodies;

    env.window.buildModelTree();
    const btnExplode = env.document.getElementById('btn-explode');
    assertEqual(btnExplode.title, 'Exploded View (Requires Assembly with 2+ parts)', 'Tooltip reflects requirement');
  });

  test('T1.9.3: Pressing key "X" or toggleExplode() on single-body shows toast and rejects explosion', () => {
    const env = createCadEnvironment({ loadCadState: true, loadExplodedView: true });
    env.context.modelBodies = [{ id: 1, name: 'STL_Part', mesh: new env.THREE.Mesh() }];
    env.window.modelBodies = env.context.modelBodies;

    let toastMessage = '';
    env.context.showToast = (msg) => { toastMessage = msg; };
    env.window.showToast = env.context.showToast;

    env.window.toggleExplode();
    assertEqual(toastMessage, 'Exploded view requires an assembly with multiple parts', 'Toast displayed on reject');
  });

  test('T1.9.4: 2D blueprint SVG generation executes without errors on STL mesh', () => {
    const env = createCadEnvironment({ loadCadState: true, loadBlueprintSvg: true });
    const geom = new env.THREE.BoxGeometry(20, 20, 20);
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    env.context.modelBodies = [{ id: 1, name: 'STL_Cube', mesh: mesh }];
    env.window.modelBodies = env.context.modelBodies;
    env.window.pendingFileName = 'test_part.stl';

    const generateSvg = env.window.BlueprintEngine?.generateSvg || env.window.generateBlueprintSvg;
    assertTrue(typeof generateSvg === 'function', 'generateSvg function exists');
    const svgStr = generateSvg();
    assertTrue(typeof svgStr === 'string' && svgStr.length > 50, 'SVG blueprint generated');
    assertTrue(svgStr.includes('<svg'), 'Generated string contains SVG element');
  });

  test('T1.9.5: 3D section clipping plane activates without errors on STL mesh', () => {
    const env = createCadEnvironment({ loadCadState: true, loadSectionEngine: true });
    const geom = new env.THREE.BoxGeometry(20, 20, 20);
    const mesh = new env.THREE.Mesh(geom, new env.THREE.MeshBasicMaterial());
    env.context.modelBodies = [{ id: 1, name: 'STL_Cube', mesh: mesh }];
    env.window.modelBodies = env.context.modelBodies;

    assertTrue(typeof env.window.toggleSectionView === 'function', 'toggleSectionView exists');
    env.window.toggleSectionView(true);
    const isActive = env.context.isSectionActive !== undefined ? env.context.isSectionActive : env.window.isSectionActive;
    assertTrue(isActive === true, 'Section view activated');
    env.window.toggleSectionView(false);
    const isDeactivated = env.context.isSectionActive !== undefined ? env.context.isSectionActive : env.window.isSectionActive;
    assertTrue(isDeactivated === false, 'Section view deactivated');
  });
});

// Run reporting if executed as main module
if (require.main === module) {
  const summary = reportSummary();
  exitProcess();
}
