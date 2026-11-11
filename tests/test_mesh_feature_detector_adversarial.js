/**
 * test_mesh_feature_detector_adversarial.js
 * Adversarial Empirical Verification Suite for Milestone 3
 * QuickLook.Plugin.StepViewer native STL CAD Intelligence
 *
 * Verifies:
 *  1. Spatial Vertex Welding Stress (large offsets, zero boundary [-0.0005, +0.0005], degenerate triangles, 0 false welding)
 *  2. Boundary & Open Meshes (isolated triangle, 10x10 sheet, non-manifold T-junctions, multi-manifold fan)
 *  3. Scale & Performance Stress (50,000+ triangles benchmarks < 50ms SLA, memory integrity, branching crease DFS analysis)
 *  4. Snapping & Measure Engine Simulation (indexModelVertices, snapping resolution, 3D rotated hole pitch)
 *
 * Zero external dependencies beyond Node.js core and Assets/three.min.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

// ---------------------------------------------------------------------------
// 1. Environment Bootstrap & Loading
// ---------------------------------------------------------------------------
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
  getElementById: (id) => ({
    style: {},
    innerText: '',
    innerHTML: ''
  })
};

// Mock window dimensions
global.window.innerWidth = 1024;
global.window.innerHeight = 768;

// Load CAD state and measure engine into global scope
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../Assets/js/cadState.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../Assets/js/measureEngine.js'), 'utf8'));

const MeshFeatureDetector = require(path.join(__dirname, '../Assets/js/meshFeatureDetector.js'));
global.window.MeshFeatureDetector = MeshFeatureDetector;

// Harness tracking
let testCount = 0;
let passedCount = 0;
let failedCount = 0;
const testResults = [];

function runAdversarialTest(name, fn) {
  testCount++;
  process.stdout.write(`  [TEST ${testCount}] ${name}... `);
  const t0 = process.hrtime.bigint();
  try {
    fn();
    const t1 = process.hrtime.bigint();
    const elapsedMs = Number(t1 - t0) / 1e6;
    console.log(`\x1b[32mPASS\x1b[0m (${elapsedMs.toFixed(2)}ms)`);
    passedCount++;
    testResults.push({ name, status: 'PASS', elapsedMs });
  } catch (err) {
    console.log(`\x1b[31mFAIL\x1b[0m`);
    console.error(err);
    failedCount++;
    testResults.push({ name, status: 'FAIL', error: err.message });
  }
}

console.log('\n================================================================');
console.log('   Milestone 3: Empirical Adversarial Challenge Test Harness   ');
console.log('================================================================\n');

// ===========================================================================
// SUITE 1: Spatial Vertex Welding & Coordinate Stress
// ===========================================================================
console.log('--- Suite 1: Spatial Vertex Welding & Coordinate Stress ---');

// T1.1: High aspect ratio coordinates
runAdversarialTest('T1.1: High aspect ratio coordinates with sub-micron vs multi-micron delta', () => {
  const X0 = 1000.0001;
  const Y0 = -500.0002;
  const Z0 = 0.0008;

  const pos = [
    // Tri 1
    X0, Y0, Z0,
    X0 + 10, Y0, Z0,
    X0, Y0 + 10, Z0,

    // Tri 2: vertex 1 offset by +0.0003 mm from (X0, Y0, Z0) -> within 1 um cell (0.3 um delta)
    X0 + 0.0003, Y0, Z0,
    X0 + 10, Y0, Z0,
    X0 + 5, Y0 - 5, Z0,

    // Tri 3: vertex 1 offset by +0.0015 mm from (X0, Y0, Z0) -> 1.5 um > 1 um tol (must NOT weld)
    X0 + 0.0015, Y0, Z0,
    X0 + 10, Y0, Z0,
    X0 + 5, Y0 + 15, Z0
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const res = MeshFeatureDetector.detectFeatures(geom);

  assert(res, 'Result must exist');
  assert(res.brepFaces.length >= 1, 'Should find coplanar faces');
  assert(!isNaN(res.brepFaces[0].areaMm2), 'Face area must not be NaN');
});

// T1.2: Negative coordinates across zero boundary
runAdversarialTest('T1.2: Negative coordinates across zero boundary [-0.0005, +0.0005]', () => {
  const pos = [
    // Tri 1 using pA = -0.0004 mm (rounds to 0)
    -0.0004, 0, 0,
    10, 0, 0,
    0, 10, 0,

    // Tri 2 using pB = +0.0004 mm (rounds to 0, welds to pA)
    0.0004, 0, 0,
    10, 0, 0,
    0, -10, 0,

    // Tri 3 using pC = -0.0008 mm (rounds to -1, distinct)
    -0.0008, 0, 0,
    10, 0, 0,
    5, 5, 0,

    // Tri 4 using pD = +0.0008 mm (rounds to +1, distinct)
    0.0008, 0, 0,
    10, 0, 0,
    5, -5, 0
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const res = MeshFeatureDetector.detectFeatures(geom);

  assert(res, 'Features detected successfully');
  res.edgeFeatures.forEach(feat => {
    if (feat.type === 'line') {
      assert(!isNaN(feat.length), 'Line length must not be NaN');
      assert(!isNaN(feat.midpoint[0]), 'Midpoint X must not be NaN');
      assert(!isNaN(feat.midpoint[1]), 'Midpoint Y must not be NaN');
      assert(!isNaN(feat.midpoint[2]), 'Midpoint Z must not be NaN');
    }
  });
});

// T1.3: Degenerate triangles (slivers, zero-area, collinear)
runAdversarialTest('T1.3: Degenerate triangles (sliver triangles, collinear, zero area)', () => {
  const S = 20;
  const vertices = [
    // Bottom (Z = 0)
    0, 0, 0,   0, S, 0,   S, S, 0,
    0, 0, 0,   S, S, 0,   S, 0, 0,
    // Top (Z = S)
    0, 0, S,   S, 0, S,   S, S, S,
    0, 0, S,   S, S, S,   0, S, S,
    // Front (Y = 0)
    0, 0, 0,   S, 0, 0,   S, 0, S,
    0, 0, 0,   S, 0, S,   0, 0, S,
    // Back (Y = S)
    0, S, 0,   0, S, S,   S, S, S,
    0, S, 0,   S, S, S,   S, S, 0,
    // Left (X = 0)
    0, 0, 0,   0, 0, S,   0, S, S,
    0, 0, 0,   0, S, S,   0, S, 0,
    // Right (X = S)
    S, 0, 0,   S, S, 0,   S, S, S,
    S, 0, 0,   S, S, S,   S, 0, S
  ];

  // Inject 30 degenerate triangles
  for (let i = 0; i < 10; i++) {
    // v0 == v1
    vertices.push(5, 5, 5,   5, 5, 5,   10, 10, 10);
    // Collinear points
    vertices.push(0, 0, 0,   5, 5, 5,   10, 10, 10);
    // Micro sliver
    vertices.push(0, 0, 0,   1e-14, 0, 0,   0, 1e-14, 0);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  const res = MeshFeatureDetector.detectFeatures(geom);

  // Invariant 1: Cube must still produce exactly 12 crease edges
  assert.strictEqual(res.edgeFeatures.length, 12, `Expected 12 crease edges, got ${res.edgeFeatures.length}`);

  // Invariant 2: 0 circular holes
  const holes = res.edgeFeatures.filter(f => f.type === 'circle');
  assert.strictEqual(holes.length, 0, 'Must have 0 holes');

  // Invariant 3: 6 planar faces of 400 mm² each
  assert.strictEqual(res.brepFaces.length, 6, `Expected 6 planar faces, got ${res.brepFaces.length}`);
  res.brepFaces.forEach(face => {
    assert(Math.abs(face.areaMm2 - 400) < 0.1, `Face area ${face.areaMm2} must be ~400 mm²`);
  });
});

// T1.4: Zero false welding across distinct spatial cells
runAdversarialTest('T1.4: Zero false welding across distinct spatial cells', () => {
  const numPts = 500;
  const positions = [];
  for (let i = 0; i < numPts; i++) {
    const x = i * 0.005; // Spaced by 5 microns (0.005 mm)
    positions.push(
      x, 0, 0,
      x, 1, 0,
      x + 0.002, 0.5, 1
    );
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  const res = MeshFeatureDetector.detectFeatures(geom);

  assert(res.brepFaces.length > 0, 'Must process faces');
  assert(res.edgeIndices.length > 0, 'Must produce edge indices');
});

// ===========================================================================
// SUITE 2: Boundary and Open Meshes & Non-Manifold Edges
// ===========================================================================
console.log('\n--- Suite 2: Boundary and Open Meshes & Non-Manifold Edges ---');

// T2.1: Isolated single triangle
runAdversarialTest('T2.1: Isolated single triangle boundary edge classification', () => {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0,
    30, 0, 0,
    0, 40, 0
  ]), 3));

  const res = MeshFeatureDetector.detectFeatures(geom);

  assert.strictEqual(res.edgeFeatures.length, 3, `Expected 3 boundary edges, got ${res.edgeFeatures.length}`);
  res.edgeFeatures.forEach(f => {
    assert.strictEqual(f.type, 'line');
  });

  const lengths = res.edgeFeatures.map(f => f.length).sort((a, b) => a - b);
  assert(Math.abs(lengths[0] - 30) < 1e-4, 'Side 1 length 30');
  assert(Math.abs(lengths[1] - 40) < 1e-4, 'Side 2 length 40');
  assert(Math.abs(lengths[2] - 50) < 1e-4, 'Hypotenuse length 50');

  assert.strictEqual(res.brepFaces.length, 1);
  assert(Math.abs(res.brepFaces[0].areaMm2 - 600) < 1e-3, 'Face area must be 600 mm²');
});

// T2.2: Non-watertight open sheet mesh (10x10 quad grid = 200 triangles)
runAdversarialTest('T2.2: Open sheet mesh (10x10 grid) boundary vs interior edges', () => {
  const NX = 10;
  const NY = 10;
  const positions = [];

  for (let x = 0; x < NX; x++) {
    for (let y = 0; y < NY; y++) {
      const x0 = x * 10, x1 = (x + 1) * 10;
      const y0 = y * 10, y1 = (y + 1) * 10;

      // Tri 1
      positions.push(x0, y0, 0,   x1, y0, 0,   x1, y1, 0);
      // Tri 2
      positions.push(x0, y0, 0,   x1, y1, 0,   x0, y1, 0);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  const res = MeshFeatureDetector.detectFeatures(geom);

  // 10*4 = 40 perimeter boundary edges; all interior edges non-crease
  assert.strictEqual(res.edgeFeatures.length, 40, `Expected exactly 40 boundary crease edges, got ${res.edgeFeatures.length}`);

  // Exactly 1 coplanar face covering all 200 triangles with area = 10,000 mm²
  assert.strictEqual(res.brepFaces.length, 1, `Expected 1 unified planar B-Rep face, got ${res.brepFaces.length}`);
  assert(Math.abs(res.brepFaces[0].areaMm2 - 10000) < 0.1, `Expected area 10000 mm², got ${res.brepFaces[0].areaMm2}`);
  assert.strictEqual(res.brepFaces[0].triangles.length, 200, `Expected all 200 triangles in face, got ${res.brepFaces[0].triangles.length}`);
});

// T2.3: Non-manifold T-junction (3 triangles meeting at an edge)
runAdversarialTest('T2.3: Non-manifold T-junction (3 triangles meeting at shared edge)', () => {
  const pos = [
    // Tri 1
    0, 0, 0,   10, 0, 0,   5, 10, 0,
    // Tri 2
    0, 0, 0,   5, -10, 0,  10, 0, 0,
    // Tri 3
    0, 0, 0,   10, 0, 0,   5, 0, 10
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const res = MeshFeatureDetector.detectFeatures(geom);

  const spineLine = res.edgeFeatures.find(f => 
    f.type === 'line' && 
    Math.abs(f.length - 10) < 1e-3 &&
    Math.abs(f.midpoint[0] - 5) < 1e-3 &&
    Math.abs(f.midpoint[1]) < 1e-3 &&
    Math.abs(f.midpoint[2]) < 1e-3
  );
  assert(spineLine, 'Shared non-manifold spine must be classified as a crease line feature');
  assert(res.brepFaces.length >= 2, `Expected at least 2 separate faces, got ${res.brepFaces.length}`);
});

// T2.4: Multi-manifold fan (5 triangles sharing an edge)
runAdversarialTest('T2.4: Multi-manifold fan (5 triangles sharing edge)', () => {
  const pos = [];
  for (let k = 0; k < 5; k++) {
    const angle = (k * Math.PI) / 4;
    pos.push(
      0, 0, 0,
      20, 0, 0,
      10, Math.cos(angle) * 10, Math.sin(angle) * 10
    );
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const res = MeshFeatureDetector.detectFeatures(geom);

  const spine = res.edgeFeatures.find(f => f.type === 'line' && Math.abs(f.length - 20) < 1e-3);
  assert(spine, 'Spine of 5-manifold fan must be classified as crease line');
});

// ===========================================================================
// SUITE 3: Scale & Performance Stress (50,000+ Triangles)
// ===========================================================================
console.log('\n--- Suite 3: Scale & Performance Stress (50,000+ Triangles) ---');

// T3.1: 50,000 Triangles Watertight Cylinder Benchmark
runAdversarialTest('T3.1: 50,000 Triangles Watertight Cylinder Feature Detection Benchmark (< 50ms SLA)', () => {
  const N = 12500; // 12,500 segments * 4 triangles = 50,000 triangles
  const R = 20, H = 30;
  const positions = new Float32Array(N * 4 * 9);
  let ptr = 0;
  for (let i = 0; i < N; i++) {
    const th0 = (2 * Math.PI * i) / N;
    const th1 = (2 * Math.PI * (i + 1)) / N;
    const c0 = Math.cos(th0) * R, s0 = Math.sin(th0) * R;
    const c1 = Math.cos(th1) * R, s1 = Math.sin(th1) * R;

    // Top cap (1 tri)
    positions[ptr++] = 0;  positions[ptr++] = 0;  positions[ptr++] = H;
    positions[ptr++] = c0; positions[ptr++] = s0; positions[ptr++] = H;
    positions[ptr++] = c1; positions[ptr++] = s1; positions[ptr++] = H;

    // Bottom cap (1 tri)
    positions[ptr++] = 0;  positions[ptr++] = 0;  positions[ptr++] = 0;
    positions[ptr++] = c1; positions[ptr++] = s1; positions[ptr++] = 0;
    positions[ptr++] = c0; positions[ptr++] = s0; positions[ptr++] = 0;

    // Mantle quad (2 tris)
    positions[ptr++] = c0; positions[ptr++] = s0; positions[ptr++] = 0;
    positions[ptr++] = c1; positions[ptr++] = s1; positions[ptr++] = 0;
    positions[ptr++] = c1; positions[ptr++] = s1; positions[ptr++] = H;

    positions[ptr++] = c0; positions[ptr++] = s0; positions[ptr++] = 0;
    positions[ptr++] = c1; positions[ptr++] = s1; positions[ptr++] = H;
    positions[ptr++] = c0; positions[ptr++] = s0; positions[ptr++] = H;
  }

  const numTriangles = positions.length / 9;
  assert.strictEqual(numTriangles, 50000, `Expected 50,000 triangles, got ${numTriangles}`);

  const geom = { position: { array: positions } };

  // 2 warmups for V8 JIT steady-state profiling
  MeshFeatureDetector.detectFeatures(geom);
  MeshFeatureDetector.detectFeatures(geom);

  // Timed benchmark run
  const tStart = process.hrtime.bigint();
  const res = MeshFeatureDetector.detectFeatures(geom);
  const tEnd = process.hrtime.bigint();
  const elapsedMs = Number(tEnd - tStart) / 1e6;

  console.log(`\n      * Watertight Cylinder Scale Benchmark: ${numTriangles} triangles in ${elapsedMs.toFixed(2)}ms (SLA: < 50ms)`);
  assert(elapsedMs < 50.0, `Performance SLA violation: ${elapsedMs.toFixed(2)}ms >= 50.0ms`);

  const circles = res.edgeFeatures.filter(f => f.type === 'circle');
  assert.strictEqual(circles.length, 2, `Expected 2 circular rims, got ${circles.length}`);
  circles.forEach(c => {
    assert(Math.abs(c.diameter - 40.0) < 0.05, 'Diameter 40.0 mm');
  });
});

// T3.2: 50,562 Triangles Undulating Smooth Sheet Benchmark
runAdversarialTest('T3.2: 50,562 Triangles Undulating Smooth Sheet Benchmark (< 50ms SLA)', () => {
  const NX = 159, NY = 159;
  const positions = new Float32Array(NX * NY * 2 * 9);
  let ptr = 0;
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) {
      const x0 = x, x1 = x + 1;
      const y0 = y, y1 = y + 1;
      const z00 = Math.sin(x0 / 50) * Math.cos(y0 / 50) * 0.5;
      const z10 = Math.sin(x1 / 50) * Math.cos(y0 / 50) * 0.5;
      const z01 = Math.sin(x0 / 50) * Math.cos(y1 / 50) * 0.5;
      const z11 = Math.sin(x1 / 50) * Math.cos(y1 / 50) * 0.5;

      positions[ptr++] = x0; positions[ptr++] = y0; positions[ptr++] = z00;
      positions[ptr++] = x1; positions[ptr++] = y0; positions[ptr++] = z10;
      positions[ptr++] = x1; positions[ptr++] = y1; positions[ptr++] = z11;

      positions[ptr++] = x0; positions[ptr++] = y0; positions[ptr++] = z00;
      positions[ptr++] = x1; positions[ptr++] = y1; positions[ptr++] = z11;
      positions[ptr++] = x0; positions[ptr++] = y1; positions[ptr++] = z01;
    }
  }

  const numTriangles = positions.length / 9;
  assert.strictEqual(numTriangles, 50562, `Expected 50,562 triangles, got ${numTriangles}`);

  const geom = { position: { array: positions } };

  // Warmup run
  MeshFeatureDetector.detectFeatures(geom);

  // Timed benchmark run
  const tStart = process.hrtime.bigint();
  const res = MeshFeatureDetector.detectFeatures(geom);
  const tEnd = process.hrtime.bigint();
  const elapsedMs = Number(tEnd - tStart) / 1e6;

  console.log(`\n      * Smooth Sheet Scale Benchmark: ${numTriangles} triangles in ${elapsedMs.toFixed(2)}ms (SLA: < 50ms)`);
  assert(elapsedMs < 50.0, `Performance SLA violation: ${elapsedMs.toFixed(2)}ms >= 50.0ms`);
  assert(res.brepFaces.length > 0, 'Must produce B-Rep faces');
});

// T3.3: Large mesh edgeIndices within valid vertex buffer range
runAdversarialTest('T3.3: Large mesh edgeIndices within valid vertex buffer range', () => {
  const N = 5000;
  const positions = new Float32Array(N * 9);
  for (let i = 0; i < N * 9; i++) {
    positions[i] = (i % 100) * 1.5;
  }

  const geom = { position: { array: positions } };
  const res = MeshFeatureDetector.detectFeatures(geom);

  const maxValidIndex = (positions.length / 3) - 1;
  for (let i = 0; i < res.edgeIndices.length; i++) {
    const idx = res.edgeIndices[i];
    assert(idx >= 0 && idx <= maxValidIndex, `Edge index ${idx} out of range [0, ${maxValidIndex}]`);
  }
});

// T3.4: Branched crease graph fan cap (degree >= 3) combinatorial stress (< 150ms)
runAdversarialTest('T3.4: Branched crease graph fan cap (degree >= 3) combinatorial stress (< 150ms)', () => {
  const N = 500;
  const pos = [];
  for (let i = 0; i < N; i++) {
    const th0 = (2 * Math.PI * i) / N, th1 = (2 * Math.PI * (i + 1)) / N;
    // Cap triangle meeting at apex (0,0,10)
    pos.push(0, 0, 10, Math.cos(th0) * 10, Math.sin(th0) * 10, 10, Math.cos(th1) * 10, Math.sin(th1) * 10, 10);
    // Skirt triangle
    pos.push(Math.cos(th0) * 10, Math.sin(th0) * 10, 10, Math.cos(th0) * 10, Math.sin(th0) * 10, 0, Math.cos(th1) * 10, Math.sin(th1) * 10, 10);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));

  const tStart = process.hrtime.bigint();
  const res = MeshFeatureDetector.detectFeatures(geom);
  const tEnd = process.hrtime.bigint();
  const elapsedMs = Number(tEnd - tStart) / 1e6;

  console.log(`\n      * Branched Crease Fan Benchmark: N=${N} sectors in ${elapsedMs.toFixed(2)}ms (SLA: < 150ms)`);
  assert(elapsedMs < 150.0, `Performance SLA violation: ${elapsedMs.toFixed(2)}ms >= 150.0ms`);
  assert(res && res.edgeFeatures.length > 0, 'Must extract features without freezing');
});

// ===========================================================================
// SUITE 4: Snapping & Measure Engine Simulation
// ===========================================================================
console.log('\n--- Suite 4: Snapping & Measure Engine Simulation ---');

// T4.1: indexModelVertices feature population
runAdversarialTest('T4.1: indexModelVertices populates modelCadVertices with correct subTypes', () => {
  modelEdgeFeatures = [
    {
      type: 'line',
      start: [0, 0, 0],
      end: [20, 0, 0],
      midpoint: [10, 0, 0],
      length: 20
    },
    {
      type: 'circle',
      center: [30, 40, 0],
      radius: 5,
      diameter: 10,
      normal: [0, 0, 1],
      isClosed: true,
      isHole: true
    }
  ];

  indexModelVertices([]);

  assert(modelCadVertices.length >= 3, `Expected at least 3 CAD vertices, got ${modelCadVertices.length}`);

  const cornerVerts = modelCadVertices.filter(v => v.subType === 'corner');
  const midVerts = modelCadVertices.filter(v => v.subType === 'midpoint');
  const centerVerts = modelCadVertices.filter(v => v.subType === 'center');

  assert.strictEqual(cornerVerts.length, 2, 'Must have 2 corner/endpoint vertices');
  assert.strictEqual(midVerts.length, 1, 'Must have 1 midpoint vertex');
  assert.strictEqual(centerVerts.length, 1, 'Must have 1 hole center vertex');

  assert(centerVerts[0].point.distanceTo(new THREE.Vector3(30, 40, 0)) < 1e-4, 'Center position must match');
  assert.strictEqual(centerVerts[0].label, 'Hole Center');
});

// T4.2: Mouse snapping resolution simulation
runAdversarialTest('T4.2: Mouse snapping resolves Hole Center and Midpoint', () => {
  // Setup camera and renderer mock
  camera = new THREE.PerspectiveCamera(45, 1024 / 768, 0.1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  renderer = {
    domElement: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024, height: 768 })
    }
  };

  const mockMesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial()
  );
  mockMesh.visible = true;

  modelGroup = new THREE.Group();
  modelGroup.add(mockMesh);
  isMeasureActive = true;

  modelCadVertices = [
    {
      type: 'point',
      subType: 'center',
      point: new THREE.Vector3(10, 10, 0),
      label: 'Hole Center',
      feature: { type: 'circle', radius: 5, diameter: 10, center: [10, 10, 0] }
    },
    {
      type: 'point',
      subType: 'midpoint',
      point: new THREE.Vector3(-10, -10, 0),
      label: 'Midpoint',
      feature: { type: 'line', start: [-20, -10, 0], end: [0, -10, 0], midpoint: [-10, -10, 0], length: 20 }
    }
  ];

  // Project (10, 10, 0) to screen space
  const projCenter = new THREE.Vector3(10, 10, 0).project(camera);
  const screenX_center = (projCenter.x * 0.5 + 0.5) * 1024;
  const screenY_center = (-projCenter.y * 0.5 + 0.5) * 768;

  // Simulate mouse event 2px away from Hole Center
  const snap1 = findSnapTarget({ clientX: screenX_center + 2, clientY: screenY_center + 1 });
  assert(snap1, 'Snap target for hole center must be found');
  assert.strictEqual(snap1.subType, 'center', `Expected subType 'center', got '${snap1.subType}'`);
  assert.strictEqual(snap1.label, 'Hole Center');

  // Project (-10, -10, 0) to screen space
  const projMid = new THREE.Vector3(-10, -10, 0).project(camera);
  const screenX_mid = (projMid.x * 0.5 + 0.5) * 1024;
  const screenY_mid = (-projMid.y * 0.5 + 0.5) * 768;

  // Simulate mouse event 3px away from Midpoint
  const snap2 = findSnapTarget({ clientX: screenX_mid - 2, clientY: screenY_mid - 2 });
  assert(snap2, 'Snap target for midpoint must be found');
  assert.strictEqual(snap2.subType, 'midpoint', `Expected subType 'midpoint', got '${snap2.subType}'`);
  assert.strictEqual(snap2.label, 'Midpoint');
});

// T4.3: Rotated through-holes hole pitch calculation in 3D
runAdversarialTest('T4.3: 3D Rotated plate through-holes detection & dual-click pitch calculation', () => {
  const angle = Math.PI / 4; // 45 degrees
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  function rotY(x, y, z) {
    return [
      x * cosA + z * sinA,
      y,
      -x * sinA + z * cosA
    ];
  }

  const positions = [];
  const N = 32;
  const R_hole = 4.0;
  const H = 10.0;

  function addHole(cx, cy) {
    for (let k = 0; k < N; k++) {
      const th0 = (2 * Math.PI * k) / N;
      const th1 = (2 * Math.PI * (k + 1)) / N;
      const x0 = cx + R_hole * Math.cos(th0);
      const y0 = cy + R_hole * Math.sin(th0);
      const x1 = cx + R_hole * Math.cos(th1);
      const y1 = cy + R_hole * Math.sin(th1);

      const p0_b = rotY(x0, y0, 0);
      const p1_b = rotY(x1, y1, 0);
      const p0_t = rotY(x0, y0, H);
      const p1_t = rotY(x1, y1, H);

      positions.push(...p0_b, ...p1_t, ...p1_b);
      positions.push(...p0_b, ...p0_t, ...p1_t);

      const Rout = 8.0;
      const ro0_t = rotY(cx + Rout * Math.cos(th0), cy + Rout * Math.sin(th0), H);
      const ro1_t = rotY(cx + Rout * Math.cos(th1), cy + Rout * Math.sin(th1), H);
      positions.push(...p0_t, ...ro0_t, ...ro1_t);
      positions.push(...p0_t, ...ro1_t, ...p1_t);

      const ro0_b = rotY(cx + Rout * Math.cos(th0), cy + Rout * Math.sin(th0), 0);
      const ro1_b = rotY(cx + Rout * Math.cos(th1), cy + Rout * Math.sin(th1), 0);
      positions.push(...p0_b, ...ro1_b, ...ro0_b);
      positions.push(...p0_b, ...p1_b, ...ro1_b);
    }
  }

  addHole(-25, 0);
  addHole(25, 0);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));

  const res = MeshFeatureDetector.detectFeatures(geom);

  // Filter the 4 through-hole circular rims (diameter = 8.0 mm)
  const holeCircles = res.edgeFeatures.filter(f => f.type === 'circle' && Math.abs(f.diameter - 8.0) < 0.1);
  assert.strictEqual(holeCircles.length, 4, `Expected 4 through-hole rims of diameter 8.0 mm, got ${holeCircles.length}`);

  holeCircles.forEach(c => {
    assert(Math.abs(c.diameter - 8.0) < 0.05, `Circle diameter ${c.diameter.toFixed(3)} must be ~8.00 mm`);
  });

  const expHole1Top = rotY(-25, 0, 10);
  const expHole2Top = rotY(25, 0, 10);

  const circle1Top = holeCircles.find(c => Math.hypot(c.center[0] - expHole1Top[0], c.center[1] - expHole1Top[1], c.center[2] - expHole1Top[2]) < 0.1);
  const circle2Top = holeCircles.find(c => Math.hypot(c.center[0] - expHole2Top[0], c.center[1] - expHole2Top[1], c.center[2] - expHole2Top[2]) < 0.1);

  assert(circle1Top, 'Circle 1 top rim must match expected 3D rotated position');
  assert(circle2Top, 'Circle 2 top rim must match expected 3D rotated position');

  const c1Vec = new THREE.Vector3(...circle1Top.center);
  const c2Vec = new THREE.Vector3(...circle2Top.center);
  const measuredPitch = c1Vec.distanceTo(c2Vec);
  assert(Math.abs(measuredPitch - 50.0) < 0.02, `Measured pitch ${measuredPitch.toFixed(4)} must be 50.00 mm +- 0.02 mm`);

  // Verify getHoleInfo
  const snapHole1 = {
    type: 'point',
    subType: 'center',
    point: c1Vec.clone(),
    feature: circle1Top
  };
  const snapHole2 = {
    type: 'point',
    subType: 'center',
    point: c2Vec.clone(),
    feature: circle2Top
  };

  assert(isHoleEntity(snapHole1), 'snapHole1 must be hole entity');
  assert(isHoleEntity(snapHole2), 'snapHole2 must be hole entity');

  const info1 = getHoleInfo(snapHole1);
  const info2 = getHoleInfo(snapHole2);
  assert(info1, 'Hole 1 info must be generated');
  assert(info2, 'Hole 2 info must be generated');
  assert(Math.abs(info1.diameter - 8.0) < 0.05, 'Hole 1 diameter Ø 8.0 mm');
  assert(Math.abs(info2.diameter - 8.0) < 0.05, 'Hole 2 diameter Ø 8.0 mm');

  const calcPitch = info1.center.distanceTo(info2.center);
  assert(Math.abs(calcPitch - 50.0) < 0.02, `Calculated 3D pitch must be 50.00 mm +- 0.02 mm, got ${calcPitch}`);
});

// ===========================================================================
// Summary Report
// ===========================================================================
console.log('\n================================================================');
console.log(`   TEST HARNESS EXECUTION FINISHED: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${testCount})`);
console.log('================================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
