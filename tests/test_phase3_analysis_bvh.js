/**
 * Phase 3A Verification Suite: Exact BVH Mesh Interference & True Tetrahedron CoM
 * File: tests/test_phase3_analysis_bvh.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

const sandbox = {
  THREE,
  console,
  Math,
  Set,
  Map,
  Float32Array,
  Uint16Array,
  Uint32Array,
  Array,
  Object,
  Number,
  String,
  Boolean,
  Error,
  TypeError,
  document: {
    getElementById: () => null,
    createElement: () => ({
      width: 128,
      height: 128,
      getContext: () => ({
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        fillRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {}
      })
    })
  }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.modelBodies = [];
sandbox.scene = new THREE.Scene();

vm.createContext(sandbox);

// Load three-mesh-bvh.umd.js before cadAnalysisEngine.js (matching viewer.html)
const bvhCode = fs.readFileSync(path.join(__dirname, '../Assets/js/vendor/three-mesh-bvh.umd.js'), 'utf8');
vm.runInContext(bvhCode, sandbox);

const analysisCode = fs.readFileSync(path.join(__dirname, '../Assets/js/cadAnalysisEngine.js'), 'utf8');
vm.runInContext(analysisCode, sandbox);

function createClosedLBracketGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(20, 0);
  shape.lineTo(20, 5);
  shape.lineTo(5, 5);
  shape.lineTo(5, 20);
  shape.lineTo(0, 20);
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: 10,
    bevelEnabled: false,
    curveSegments: 1
  });
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('================================================================');
console.log('  PHASE 3A: BVH INTERFERENCE & TETRAHEDRON CoM TEST SUITE       ');
console.log('================================================================\n');

runTest('Test 1: Overlapping AABBs with non-intersecting L-bracket & box return 0 collisions', () => {
  assert.ok(sandbox.MeshBVHLib && typeof sandbox.MeshBVHLib.MeshBVH === 'function', 'MeshBVHLib.MeshBVH must be loaded');

  const lMesh = new THREE.Mesh(createClosedLBracketGeometry(), new THREE.MeshStandardMaterial());
  const notchBox = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  // L-bracket occupies [0,20]x[0,5]x[0,10] and [0,5]x[5,20]x[0,10].
  // Notch box occupies [8,18]x[8,18]x[0,10] -> AABBs overlap by 1000 mm^3, triangles do NOT intersect.
  notchBox.position.set(13, 13, 5);
  lMesh.updateMatrixWorld(true);
  notchBox.updateMatrixWorld(true);

  sandbox.modelBodies = [
    { id: 1, name: 'L-Bracket', mesh: lMesh },
    { id: 2, name: 'Notch-Block', mesh: notchBox }
  ];

  const results = sandbox.CadAnalysis.checkCollisions();
  assert.strictEqual(results.length, 0, `Expected 0 collisions, got ${results.length}`);
  assert.ok(lMesh.geometry.boundsTree, 'boundsTree should be cached on L-bracket geometry');
  assert.ok(notchBox.geometry.boundsTree, 'boundsTree should be cached on box geometry');
});

runTest('Test 2: Actually intersecting boxes return 1 collision and clearCollisionHighlights restores state', () => {
  const boxA = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  const boxB = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  boxA.position.set(0, 0, 0);
  boxB.position.set(5, 0, 0);
  boxA.updateMatrixWorld(true);
  boxB.updateMatrixWorld(true);

  const origMatA = boxA.material;
  sandbox.modelBodies = [
    { id: 1, name: 'Box-A', mesh: boxA },
    { id: 2, name: 'Box-B', mesh: boxB }
  ];

  const results = sandbox.CadAnalysis.checkCollisions();
  assert.strictEqual(results.length, 1, `Expected 1 collision, got ${results.length}`);
  assert.notStrictEqual(boxA.material, origMatA, 'Colliding body should receive highlight material');

  sandbox.CadAnalysis.clearCollisions();
  assert.strictEqual(boxA.material, origMatA, 'clearCollisionHighlights should restore original material');
});

runTest('Test 3: Asymmetric L-shaped mesh CoM matches analytical volumetric centroid (not AABB center)', () => {
  const lMesh = new THREE.Mesh(createClosedLBracketGeometry(), new THREE.MeshStandardMaterial());
  lMesh.position.set(100, -50, 20);
  lMesh.updateMatrixWorld(true);

  // Analytical centroid of L-shape:
  // Leg 1: [0,20]x[0,5]x[0,10], V1=1000, C1=(10, 2.5, 5)
  // Leg 2: [0,5]x[5,20]x[0,10], V2=750, C2=(2.5, 12.5, 5)
  // Total V=1750, local C=(11875/1750, 11875/1750, 5) = (6.7857142857, 6.7857142857, 5)
  const expectedLocal = 11875 / 1750;
  const expectedWorldX = 100 + expectedLocal;
  const expectedWorldY = -50 + expectedLocal;
  const expectedWorldZ = 20 + 5;

  sandbox.MaterialsEngine = {
    getSelectedMaterial: () => ({ name: 'Aluminum 6061', density: 2.70 })
  };
  sandbox.modelBodies = [
    { id: 1, name: 'L-Bracket', mesh: lMesh }
  ];

  const com = sandbox.CadAnalysis.computeCoM();
  assert.ok(Math.abs(com.x - expectedWorldX) < 1e-4, `CoM X mismatch: ${com.x} vs ${expectedWorldX}`);
  assert.ok(Math.abs(com.y - expectedWorldY) < 1e-4, `CoM Y mismatch: ${com.y} vs ${expectedWorldY}`);
  assert.ok(Math.abs(com.z - expectedWorldZ) < 1e-4, `CoM Z mismatch: ${com.z} vs ${expectedWorldZ}`);

  const expectedMassKg = 1750 * 2.70e-6;
  assert.ok(Math.abs(com.totalMassKg - expectedMassKg) < 1e-7, `Mass mismatch: ${com.totalMassKg} vs ${expectedMassKg}`);
});

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
