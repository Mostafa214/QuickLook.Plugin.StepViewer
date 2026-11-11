/**
 * test_mesh_feature_detector.js — Milestone 3 Automated Test Suite
 *
 * Verifies Smart Mesh Feature Detection & Measurement Snapping:
 *  - Fixture 1: Canonical Cube (20x20x20 mm, creases, midpoints, planar faces)
 *  - Fixture 2: Hollow Cylinder / Bushing (R_out=15, R_in=5, H=20, 4 circular hole rims, mantle suppressed)
 *  - Fixture 3: Bolt Pattern Plate (100x60x10 mm, 4 through-holes Ø 6.0 mm, 8 circular rims, pitch 60 mm)
 *  - Fixture 4: Dihedral Threshold Boundary (15 deg & 24.9 deg vs 25.1 deg & 45 deg, boundary edge)
 *  - Fixture 5: Snapping Integration (modelCadVertices, indexModelVertices, isHoleEntity, getHoleInfo, hole pitch)
 *  - Fixture 6: Branched Crease Graph (Fan Cap) DFS Step Limit & Combinatorial Defense (< 150ms)
 *
 * Exit code 0 on complete pass, 1 on failure.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---------------------------------------------------------------------------
// 1. Environment Bootstrap & Module Loading
// ---------------------------------------------------------------------------
const vm = require('vm');
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));
global.THREE = THREE;
global.window = global;
global.document = {
  createElement: () => ({
    getContext: () => ({
      fillRect: () => {}, strokeRect: () => {}, fillText: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
      quadraticCurveTo: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}
    })
  }),
  getElementById: () => null
};

// Load cadState and measureEngine in global scope
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../Assets/js/cadState.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../Assets/js/measureEngine.js'), 'utf8'));

const MeshFeatureDetector = require(path.join(__dirname, '../Assets/js/meshFeatureDetector.js'));
global.window.MeshFeatureDetector = MeshFeatureDetector;

// Test Runner Harness
let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  process.stdout.write(`  Testing: ${name}... `);
  const t0 = Date.now();
  try {
    fn();
    const elapsed = Date.now() - t0;
    console.log(`\x1b[32mPASS\x1b[0m (${elapsed}ms)`);
    passedCount++;
  } catch (err) {
    console.log(`\x1b[31mFAIL\x1b[0m`);
    console.error(err);
    failedCount++;
  }
}

console.log('\n===============================================================');
console.log('   Milestone 3: Smart Mesh Feature Detector Test Suite');
console.log('===============================================================\n');

// ===========================================================================
// Helper: Geometry Generators
// ===========================================================================

/**
 * Generates non-indexed BufferGeometry for a canonical cube [0, S] x [0, S] x [0, S].
 */
function createCubeGeometry(size) {
  const S = size;
  // 6 faces, 2 triangles each = 12 triangles = 36 vertices
  const vertices = [
    // Bottom (Z = 0, normal -Z)
    0, 0, 0,   0, S, 0,   S, S, 0,
    0, 0, 0,   S, S, 0,   S, 0, 0,

    // Top (Z = S, normal +Z)
    0, 0, S,   S, 0, S,   S, S, S,
    0, 0, S,   S, S, S,   0, S, S,

    // Front (Y = 0, normal -Y)
    0, 0, 0,   S, 0, 0,   S, 0, S,
    0, 0, 0,   S, 0, S,   0, 0, S,

    // Back (Y = S, normal +Y)
    0, S, 0,   0, S, S,   S, S, S,
    0, S, 0,   S, S, S,   S, S, 0,

    // Left (X = 0, normal -X)
    0, 0, 0,   0, 0, S,   0, S, S,
    0, 0, 0,   0, S, S,   0, S, 0,

    // Right (X = S, normal +X)
    S, 0, 0,   S, S, 0,   S, S, S,
    S, 0, 0,   S, S, S,   S, 0, S
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  return geom;
}

/**
 * Generates non-indexed BufferGeometry for a hollow cylinder / bushing.
 */
function createHollowCylinderGeometry(Rout, Rin, H, N) {
  const positions = [];

  for (let k = 0; k < N; k++) {
    const th0 = (2 * Math.PI * k) / N;
    const th1 = (2 * Math.PI * (k + 1)) / N;

    const cos0 = Math.cos(th0), sin0 = Math.sin(th0);
    const cos1 = Math.cos(th1), sin1 = Math.sin(th1);

    // Outer vertices
    const out0_bot = [Rout * cos0, Rout * sin0, 0];
    const out1_bot = [Rout * cos1, Rout * sin1, 0];
    const out0_top = [Rout * cos0, Rout * sin0, H];
    const out1_top = [Rout * cos1, Rout * sin1, H];

    // Inner vertices
    const in0_bot = [Rin * cos0, Rin * sin0, 0];
    const in1_bot = [Rin * cos1, Rin * sin1, 0];
    const in0_top = [Rin * cos0, Rin * sin0, H];
    const in1_top = [Rin * cos1, Rin * sin1, H];

    // 1. Outer mantle (outward normal)
    positions.push(...out0_bot, ...out1_bot, ...out1_top);
    positions.push(...out0_bot, ...out1_top, ...out0_top);

    // 2. Inner mantle (inward normal)
    positions.push(...in0_bot, ...in1_top, ...in1_bot);
    positions.push(...in0_bot, ...in0_top, ...in1_top);

    // 3. Top rim face (+Z normal)
    positions.push(...in0_top, ...out0_top, ...out1_top);
    positions.push(...in0_top, ...out1_top, ...in1_top);

    // 4. Bottom rim face (-Z normal)
    positions.push(...in0_bot, ...out1_bot, ...out0_bot);
    positions.push(...in0_bot, ...in1_bot, ...out1_bot);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  return geom;
}

/**
 * Helper: Project ray from (cx, cy) at angle th to rectangle [xMin, xMax] x [yMin, yMax]
 */
function rayIntersectBox2D(cx, cy, th, xMin, xMax, yMin, yMax) {
  const dx = Math.cos(th);
  const dy = Math.sin(th);

  let t = Infinity;

  // X planes
  if (Math.abs(dx) > 1e-9) {
    const tRight = (xMax - cx) / dx;
    if (tRight > 0) {
      const y = cy + tRight * dy;
      if (y >= yMin - 1e-6 && y <= yMax + 1e-6 && tRight < t) t = tRight;
    }
    const tLeft = (xMin - cx) / dx;
    if (tLeft > 0) {
      const y = cy + tLeft * dy;
      if (y >= yMin - 1e-6 && y <= yMax + 1e-6 && tLeft < t) t = tLeft;
    }
  }

  // Y planes
  if (Math.abs(dy) > 1e-9) {
    const tTop = (yMax - cy) / dy;
    if (tTop > 0) {
      const x = cx + tTop * dx;
      if (x >= xMin - 1e-6 && x <= xMax + 1e-6 && tTop < t) t = tTop;
    }
    const tBottom = (yMin - cy) / dy;
    if (tBottom > 0) {
      const x = cx + tBottom * dx;
      if (x >= xMin - 1e-6 && x <= xMax + 1e-6 && tBottom < t) t = tBottom;
    }
  }

  return [cx + t * dx, cy + t * dy];
}

/**
 * Generates non-indexed BufferGeometry for a Bolt Pattern Plate:
 * 100 x 60 x 10 mm with 4 through-holes of Ø 6.0 mm at (±30, ±15).
 */
function createBoltPlateGeometry() {
  const positions = [];
  const H = 10.0;
  const R = 3.0;
  const N = 32;

  const holes = [
    { cx: 30.0, cy: 15.0,  xMin: 10.0, xMax: 50.0,  yMin: 0.0,   yMax: 30.0 },
    { cx: -30.0, cy: 15.0, xMin: -50.0, xMax: -10.0, yMin: 0.0,  yMax: 30.0 },
    { cx: -30.0, cy: -15.0, xMin: -50.0, xMax: -10.0, yMin: -30.0, yMax: 0.0 },
    { cx: 30.0, cy: -15.0,  xMin: 10.0, xMax: 50.0,  yMin: -30.0, yMax: 0.0 }
  ];

  // 1. Hole Mantles + Annular Top/Bottom Covers around each hole
  for (let hi = 0; hi < holes.length; hi++) {
    const hole = holes[hi];
    const cx = hole.cx;
    const cy = hole.cy;

    for (let k = 0; k < N; k++) {
      const th0 = (2 * Math.PI * k) / N;
      const th1 = (2 * Math.PI * (k + 1)) / N;

      const c0x = cx + R * Math.cos(th0);
      const c0y = cy + R * Math.sin(th0);
      const c1x = cx + R * Math.cos(th1);
      const c1y = cy + R * Math.sin(th1);

      // Inner cylindrical through-hole mantle (inward normal)
      positions.push(c0x, c0y, 0,   c1x, c1y, H,   c1x, c1y, 0);
      positions.push(c0x, c0y, 0,   c0x, c0y, H,   c1x, c1y, H);

      // Local outer box intersection points
      const b0 = rayIntersectBox2D(cx, cy, th0, hole.xMin, hole.xMax, hole.yMin, hole.yMax);
      const b1 = rayIntersectBox2D(cx, cy, th1, hole.xMin, hole.xMax, hole.yMin, hole.yMax);

      // Top face (+Z normal)
      positions.push(c0x, c0y, H,   b0[0], b0[1], H,   b1[0], b1[1], H);
      positions.push(c0x, c0y, H,   b1[0], b1[1], H,   c1x, c1y, H);

      // Bottom face (-Z normal)
      positions.push(c0x, c0y, 0,   b1[0], b1[1], 0,   b0[0], b0[1], 0);
      positions.push(c0x, c0y, 0,   c1x, c1y, 0,       b1[0], b1[1], 0);
    }
  }

  // 2. Central Strip between X in [-10, 10], Y in [-30, 30]
  // Top face (+Z normal)
  positions.push(-10, -30, H,   10, -30, H,   10, 30, H);
  positions.push(-10, -30, H,   10, 30, H,   -10, 30, H);
  // Bottom face (-Z normal)
  positions.push(-10, -30, 0,   10, 30, 0,    10, -30, 0);
  positions.push(-10, -30, 0,  -10, 30, 0,    10, 30, 0);

  // 3. Outer Box 4 Side Walls
  // Right wall (X = 50)
  positions.push(50, -30, 0,   50, 30, 0,   50, 30, H);
  positions.push(50, -30, 0,   50, 30, H,   50, -30, H);
  // Left wall (X = -50)
  positions.push(-50, -30, 0,  -50, -30, H, -50, 30, H);
  positions.push(-50, -30, 0,  -50, 30, H,  -50, 30, 0);
  // Top wall (Y = 30)
  positions.push(-50, 30, 0,   -50, 30, H,   50, 30, H);
  positions.push(-50, 30, 0,    50, 30, H,   50, 30, 0);
  // Bottom wall (Y = -30)
  positions.push(-50, -30, 0,   50, -30, H,  -50, -30, H);
  positions.push(-50, -30, 0,   50, -30, 0,   50, -30, H);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  return geom;
}

// ===========================================================================
// Test 1: Canonical Cube (20 x 20 x 20 mm)
// ===========================================================================
runTest('Fixture 1: Canonical Cube (20x20x20 mm)', () => {
  const cubeGeom = createCubeGeometry(20.0);
  const result = MeshFeatureDetector.detectFeatures(cubeGeom);

  assert(result, 'Result must exist');
  assert(Array.isArray(result.edgeFeatures), 'edgeFeatures must be an array');
  assert(Array.isArray(result.brepFaces), 'brepFaces must be an array');
  assert(result.edgeIndices instanceof Uint32Array, 'edgeIndices must be Uint32Array');

  // 1. Crease Edges (12 orthogonal edges)
  assert.strictEqual(result.edgeIndices.length, 24, '12 crease edges = 24 edgeIndices');

  const lineFeatures = result.edgeFeatures.filter(f => f.type === 'line');
  const circleFeatures = result.edgeFeatures.filter(f => f.type === 'circle');

  assert.strictEqual(circleFeatures.length, 0, 'Cube must have 0 circular hole features');
  assert.strictEqual(lineFeatures.length, 12, 'Cube must have exactly 12 straight line features');

  // Theoretical 12 midpoints
  const expectedMidpoints = [
    [10, 0, 0], [20, 10, 0], [10, 20, 0], [0, 10, 0],   // 4 bottom
    [10, 0, 20], [20, 10, 20], [10, 20, 20], [0, 10, 20], // 4 top
    [0, 0, 10], [20, 0, 10], [20, 20, 10], [0, 20, 10]   // 4 vertical
  ];

  for (let em = 0; em < expectedMidpoints.length; em++) {
    const exp = expectedMidpoints[em];
    const match = lineFeatures.find(f =>
      Math.hypot(f.midpoint[0] - exp[0], f.midpoint[1] - exp[1], f.midpoint[2] - exp[2]) < 0.01
    );
    assert(match, `Expected midpoint [${exp.join(',')}] must be present in detected crease lines`);
  }

  // 2. Coplanar B-Rep Faces (6 planar faces of 400 mm2)
  assert.strictEqual(result.brepFaces.length, 6, 'Cube must have exactly 6 coplanar B-Rep faces');

  let totalArea = 0;
  for (let fi = 0; fi < result.brepFaces.length; fi++) {
    const face = result.brepFaces[fi];
    assert.strictEqual(face.surfaceType, 'plane');
    assert(Math.abs(face.areaMm2 - 400.0) < 0.05, `Face ${fi} area must be ~400.0 mm2, got ${face.areaMm2}`);
    totalArea += face.areaMm2;
  }
  assert(Math.abs(totalArea - 2400.0) < 0.1, `Total cube area must be 2400.0 mm2, got ${totalArea}`);
});

// ===========================================================================
// Test 2: Hollow Cylinder / Bushing
// ===========================================================================
runTest('Fixture 2: Hollow Cylinder / Bushing (Rout=15, Rin=5, H=20)', () => {
  const cylinderGeom = createHollowCylinderGeometry(15.0, 5.0, 20.0, 32);
  const result = MeshFeatureDetector.detectFeatures(cylinderGeom);

  assert(result, 'Result must exist');
  const circleFeatures = result.edgeFeatures.filter(f => f.type === 'circle');
  const lineFeatures = result.edgeFeatures.filter(f => f.type === 'line');

  // 1. Longitudinal cylinder mantle edges (11.25 deg) MUST be suppressed
  assert.strictEqual(lineFeatures.length, 0, 'Longitudinal mantle facets must not be detected as straight lines');

  // 2. Exactly 4 circular rims detected
  assert.strictEqual(circleFeatures.length, 4, 'Must detect exactly 4 circular hole/rim features');

  // Check top outer rim (Z=20, D=30)
  const topOuter = circleFeatures.find(c => Math.abs(c.center[2] - 20.0) < 0.05 && Math.abs(c.diameter - 30.0) < 0.05);
  assert(topOuter, 'Top outer rim must be detected at Z=20 with D=30');
  assert(Math.hypot(topOuter.center[0], topOuter.center[1]) < 0.02, 'Top outer center must be (0,0)');

  // Check bottom outer rim (Z=0, D=30)
  const botOuter = circleFeatures.find(c => Math.abs(c.center[2] - 0.0) < 0.05 && Math.abs(c.diameter - 30.0) < 0.05);
  assert(botOuter, 'Bottom outer rim must be detected at Z=0 with D=30');
  assert(Math.hypot(botOuter.center[0], botOuter.center[1]) < 0.02, 'Bottom outer center must be (0,0)');

  // Check top inner hole rim (Z=20, D=10)
  const topInner = circleFeatures.find(c => Math.abs(c.center[2] - 20.0) < 0.05 && Math.abs(c.diameter - 10.0) < 0.05);
  assert(topInner, 'Top inner hole rim must be detected at Z=20 with D=10');
  assert(Math.hypot(topInner.center[0], topInner.center[1]) < 0.02, 'Top inner center must be (0,0)');

  // Check bottom inner hole rim (Z=0, D=10)
  const botInner = circleFeatures.find(c => Math.abs(c.center[2] - 0.0) < 0.05 && Math.abs(c.diameter - 10.0) < 0.05);
  assert(botInner, 'Bottom inner hole rim must be detected at Z=0 with D=10');
  assert(Math.hypot(botInner.center[0], botInner.center[1]) < 0.02, 'Bottom inner center must be (0,0)');

  // 3. Edge indices packing
  // 4 rims x 32 segments x 2 indices = 256 indices
  assert.strictEqual(result.edgeIndices.length, 256, 'Crease line segments must index 4 circular rims (256 indices)');
});

// ===========================================================================
// Test 3: Bolt Pattern Plate (100x60x10 mm, 4 Through-Holes)
// ===========================================================================
runTest('Fixture 3: Bolt Pattern Plate (4 through-holes Ø 6.0 mm, pitch 60 mm)', () => {
  const plateGeom = createBoltPlateGeometry();
  const result = MeshFeatureDetector.detectFeatures(plateGeom);

  assert(result, 'Result must exist');
  const circleFeatures = result.edgeFeatures.filter(f => f.type === 'circle');

  // Exactly 8 circular hole rims (4 holes x 2 rims)
  assert.strictEqual(circleFeatures.length, 8, `Must detect exactly 8 circular hole loops, got ${circleFeatures.length}`);

  // Top rims at Z=10
  const topCircles = circleFeatures.filter(c => Math.abs(c.center[2] - 10.0) < 0.05);
  assert.strictEqual(topCircles.length, 4, 'Must detect 4 top circular rims at Z=10');

  // Verify diameter for all holes
  for (let ci = 0; ci < circleFeatures.length; ci++) {
    const c = circleFeatures[ci];
    assert(Math.abs(c.diameter - 6.0) < 0.05, `Circle diameter must be 6.00 mm +- 0.05 mm, got ${c.diameter}`);
    assert(Math.abs(c.radius - 3.0) < 0.03, `Circle radius must be 3.00 mm +- 0.03 mm, got ${c.radius}`);
  }

  // Find the 4 top holes
  const h1 = topCircles.find(c => Math.hypot(c.center[0] - 30.0, c.center[1] - 15.0) < 0.05);
  const h2 = topCircles.find(c => Math.hypot(c.center[0] - (-30.0), c.center[1] - 15.0) < 0.05);
  const h3 = topCircles.find(c => Math.hypot(c.center[0] - (-30.0), c.center[1] - (-15.0)) < 0.05);
  const h4 = topCircles.find(c => Math.hypot(c.center[0] - 30.0, c.center[1] - (-15.0)) < 0.05);

  assert(h1, 'Hole 1 at (+30, +15) must be found');
  assert(h2, 'Hole 2 at (-30, +15) must be found');
  assert(h3, 'Hole 3 at (-30, -15) must be found');
  assert(h4, 'Hole 4 at (+30, -15) must be found');

  // Pitch Calculations
  const pitchH1_H2 = Math.hypot(h1.center[0] - h2.center[0], h1.center[1] - h2.center[1]);
  const pitchH1_H4 = Math.hypot(h1.center[0] - h4.center[0], h1.center[1] - h4.center[1]);
  const pitchH1_H3 = Math.hypot(h1.center[0] - h3.center[0], h1.center[1] - h3.center[1]);

  assert(Math.abs(pitchH1_H2 - 60.00) < 0.05, `Pitch H1-H2 must be 60.00 mm +- 0.05 mm, got ${pitchH1_H2}`);
  assert(Math.abs(pitchH1_H4 - 30.00) < 0.05, `Pitch H1-H4 must be 30.00 mm +- 0.05 mm, got ${pitchH1_H4}`);
  assert(Math.abs(pitchH1_H3 - 67.082) < 0.05, `Diagonal pitch H1-H3 must be 67.08 mm +- 0.05 mm, got ${pitchH1_H3}`);

  // Minimum & Maximum gap
  const minGap = pitchH1_H2 - h1.radius - h2.radius;
  const maxGap = pitchH1_H2 + h1.radius + h2.radius;
  assert(Math.abs(minGap - 54.00) < 0.05, `Min gap must be 54.00 mm, got ${minGap}`);
  assert(Math.abs(maxGap - 66.00) < 0.05, `Max gap must be 66.00 mm, got ${maxGap}`);
});

// ===========================================================================
// Test 4: Dihedral Threshold Boundary (15 deg & 24.9 deg vs 25.1 deg & 45 deg)
// ===========================================================================
runTest('Fixture 4: Dihedral Threshold Boundary Discrimination', () => {
  function testTwoTrianglesAngle(deg) {
    const rad = (deg * Math.PI) / 180.0;
    // T1: (0,0,0) -> (10,0,0) -> (0,10,0) in XY plane (normal [0,0,1])
    // T2: (0,0,0) -> (0,10,0) -> (-10*cos(rad), 0, 10*sin(rad)) sharing edge along Y axis (0,0,0)-(0,10,0)
    const pos = new Float32Array([
      0, 0, 0,   10, 0, 0,   0, 10, 0,
      0, 0, 0,   0, 10, 0,  -10 * Math.cos(rad), 0, 10 * Math.sin(rad)
    ]);
    const res = MeshFeatureDetector.detectFeatures(pos);
    // Find the shared edge (0,0,0) to (0,10,0) in lines
    const sharedLine = res.edgeFeatures.find(f =>
      f.type === 'line' &&
      Math.abs(f.midpoint[0] - 0.0) < 0.01 &&
      Math.abs(f.midpoint[1] - 5.0) < 0.01 &&
      Math.abs(f.midpoint[2] - 0.0) < 0.01
    );
    return !!sharedLine;
  }

  // 15.0 deg: smooth, NOT a crease
  assert.strictEqual(testTwoTrianglesAngle(15.0), false, '15.0 deg edge must NOT be detected as crease');

  // 24.9 deg: sub-threshold, NOT a crease
  assert.strictEqual(testTwoTrianglesAngle(24.9), false, '24.9 deg edge must NOT be detected as crease');

  // 25.1 deg: super-threshold, IS a crease
  assert.strictEqual(testTwoTrianglesAngle(25.1), true, '25.1 deg edge MUST be detected as crease');

  // 45.0 deg: sharp crease, IS a crease
  assert.strictEqual(testTwoTrianglesAngle(45.0), true, '45.0 deg edge MUST be detected as crease');

  // Boundary Edge Check: Single triangle with 3 unshared boundary edges
  const singleTri = new Float32Array([
    0, 0, 0,   10, 0, 0,   0, 10, 0
  ]);
  const bRes = MeshFeatureDetector.detectFeatures(singleTri);
  // All 3 boundary edges must be detected as creases
  const boundaryLines = bRes.edgeFeatures.filter(f => f.type === 'line');
  assert.strictEqual(boundaryLines.length, 3, 'All 3 boundary edges of an open triangle must be detected as creases');
});

// ===========================================================================
// Test 5: Snapping Integration Verification
// ===========================================================================
runTest('Fixture 5: Snapping Integration (modelCadVertices & Hole Pitch)', () => {
  const plateGeom = createBoltPlateGeometry();
  const result = MeshFeatureDetector.detectFeatures(plateGeom);

  // Simulate viewerApp ingestion
  const mockMesh = {
    geometry: plateGeom,
    userData: {
      brepFaces: result.brepFaces,
      edgeIndices: result.edgeIndices
    },
    edgeFeatures: result.edgeFeatures,
    brepFaces: result.brepFaces,
    edgeIndices: result.edgeIndices
  };

  // Populate cadState modelEdgeFeatures
  modelEdgeFeatures = [];
  modelEdgeFeatures.push(...result.edgeFeatures);

  // Invoke indexModelVertices from measureEngine.js
  indexModelVertices([mockMesh]);

  assert(Array.isArray(modelCadVertices), 'modelCadVertices must be populated');
  assert(modelCadVertices.length > 0, 'modelCadVertices must not be empty');

  // 1. Check hole center entities
  const centerVertices = modelCadVertices.filter(v => v.subType === 'center');
  assert.strictEqual(centerVertices.length, 8, `Must index 8 hole centers, got ${centerVertices.length}`);

  for (let ci = 0; ci < centerVertices.length; ci++) {
    const cv = centerVertices[ci];
    assert.strictEqual(cv.type, 'point');
    assert.strictEqual(cv.subType, 'center');
    assert.strictEqual(cv.label, 'Hole Center');
    assert(cv.feature, 'CAD vertex must reference feature');
    assert.strictEqual(cv.feature.type, 'circle');
  }

  // 2. Simulate Hole 1 and Hole 2 snapping
  const h1Center = centerVertices.find(v => Math.hypot(v.point.x - 30.0, v.point.y - 15.0, v.point.z - 10.0) < 0.05);
  const h2Center = centerVertices.find(v => Math.hypot(v.point.x - (-30.0), v.point.y - 15.0, v.point.z - 10.0) < 0.05);

  assert(h1Center, 'Hole 1 center point must exist in modelCadVertices');
  assert(h2Center, 'Hole 2 center point must exist in modelCadVertices');

  // Verify measureEngine entity resolution functions
  // Simulate Priority 1 snap target return object from measureEngine:293
  const snap1 = {
    type: 'point',
    subType: h1Center.subType || h1Center.type,
    point: h1Center.point.clone(),
    label: h1Center.label,
    feature: h1Center.feature
  };

  const snap2 = {
    type: 'point',
    subType: h2Center.subType || h2Center.type,
    point: h2Center.point.clone(),
    label: h2Center.label,
    feature: h2Center.feature
  };

  // Check isHoleEntity
  assert.strictEqual(isHoleEntity(snap1), true, 'snap1 must be recognized as hole entity');
  assert.strictEqual(isHoleEntity(snap2), true, 'snap2 must be recognized as hole entity');

  // Check getHoleInfo
  const info1 = getHoleInfo(snap1);
  const info2 = getHoleInfo(snap2);

  assert(info1, 'getHoleInfo(snap1) must return valid hole info object');
  assert(info2, 'getHoleInfo(snap2) must return valid hole info object');

  assert(Math.abs(info1.diameter - 6.0) < 0.05, `Hole 1 diameter must be 6.0 +- 0.05 mm, got ${info1.diameter}`);
  assert(Math.abs(info1.radius - 3.0) < 0.05, `Hole 1 radius must be 3.0 +- 0.05 mm, got ${info1.radius}`);
  assert(Math.abs(info2.diameter - 6.0) < 0.05, `Hole 2 diameter must be 6.0 +- 0.05 mm, got ${info2.diameter}`);

  // Pitch calculation
  const calculatedPitch = info1.center.distanceTo(info2.center);
  assert(Math.abs(calculatedPitch - 60.00) < 0.05, `Measured hole pitch must be 60.00 mm, got ${calculatedPitch}`);
});

// ===========================================================================
// Fixture 6: Branched Crease Graph (Fan Cap) DFS Step Limit Defense
// ===========================================================================

runTest('Fixture 6: Branched Crease Graph (Fan Cap) DFS Step Limit & Combinatorial Defense (< 150ms)', () => {
  const N = 200;
  const pos = [];
  for (let i = 0; i < N; i++) {
    const th0 = (2 * Math.PI * i) / N, th1 = (2 * Math.PI * (i + 1)) / N;
    // Apex fan triangle
    pos.push(0, 0, 10, Math.cos(th0) * 10, Math.sin(th0) * 10, 10, Math.cos(th1) * 10, Math.sin(th1) * 10, 10);
    // Skirt triangle
    pos.push(Math.cos(th0) * 10, Math.sin(th0) * 10, 10, Math.cos(th0) * 10, Math.sin(th0) * 10, 0, Math.cos(th1) * 10, Math.sin(th1) * 10, 10);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));

  const tStart = Date.now();
  const res = MeshFeatureDetector.detectFeatures(geom);
  const elapsed = Date.now() - tStart;

  assert(res, 'Result must exist');
  assert(res.edgeFeatures.length > 0, 'Must extract features');
  assert(elapsed < 150, `Fan cap detection must execute in < 150ms, took ${elapsed}ms`);
});

// ===========================================================================
// Summary
// ===========================================================================
console.log('\n---------------------------------------------------------------');
console.log(`Test Execution Finished: ${passedCount} Passed, ${failedCount} Failed`);
console.log('---------------------------------------------------------------\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
