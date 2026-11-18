/**
 * Phase 5 Verification Suite: 3D Printability Diagnostics (Overhang Heatmap & Manifold Edge Visualizer)
 * File: tests/test_phase5_printability.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

const domElements = {
  'overhang-stats': { textContent: '' },
  'manifold-stats': { textContent: '' }
};

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
    getElementById: (id) => domElements[id] || null,
    createElement: () => ({
      width: 128,
      height: 128,
      style: {},
      className: '',
      setAttribute: () => {},
      appendChild: () => {},
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
sandbox.cadGroup = new THREE.Group();
sandbox.scene.add(sandbox.cadGroup);

vm.createContext(sandbox);

const bvhCode = fs.readFileSync(path.join(__dirname, '../Assets/js/vendor/three-mesh-bvh.umd.js'), 'utf8');
vm.runInContext(bvhCode, sandbox);

const analysisCode = fs.readFileSync(path.join(__dirname, '../Assets/js/cadAnalysisEngine.js'), 'utf8');
vm.runInContext(analysisCode, sandbox);

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

function resetSceneAndGroup() {
  sandbox.CadAnalysis.resetAnalysisState();
  while (sandbox.cadGroup.children.length > 0) {
    sandbox.cadGroup.remove(sandbox.cadGroup.children[0]);
  }
  sandbox.modelBodies = [];
  domElements['overhang-stats'].textContent = '';
  domElements['manifold-stats'].textContent = '';
}

function createOpenBoxGeometryMissingTop() {
  // Unit cube [0,1]^3 missing +Y top face (5 faces = 10 CCW outward triangles)
  const positions = [
    // Bottom (-Y)
    0, 0, 0,  1, 0, 0,  1, 0, 1,
    0, 0, 0,  1, 0, 1,  0, 0, 1,
    // Front (+Z)
    0, 0, 1,  1, 0, 1,  1, 1, 1,
    0, 0, 1,  1, 1, 1,  0, 1, 1,
    // Back (-Z)
    1, 0, 0,  0, 0, 0,  0, 1, 0,
    1, 0, 0,  0, 1, 0,  1, 1, 0,
    // Left (-X)
    0, 0, 0,  0, 0, 1,  0, 1, 1,
    0, 0, 0,  0, 1, 1,  0, 1, 0,
    // Right (+X)
    1, 0, 1,  1, 0, 0,  1, 1, 0,
    1, 0, 1,  1, 1, 0,  1, 1, 1
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function createTJunctionGeometry() {
  // 3 triangles sharing the edge (0,0,0) -> (1,0,0)
  const positions = [
    0, 0, 0,  1, 0, 0,  0.5, 1, 0,
    0, 0, 0,  1, 0, 0,  0.5, -1, 0,
    0, 0, 0,  1, 0, 0,  0.5, 0, 1
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

console.log('================================================================');
console.log('  PHASE 5: 3D PRINTABILITY DIAGNOSTICS TEST SUITE               ');
console.log('================================================================\n');

runTest('Test 1: Overhang heatmap detects bottom face of cube & restores cleanly on toggle off', () => {
  resetSceneAndGroup();
  const origMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
  const origGeom = new THREE.BoxGeometry(10, 10, 10);
  const cube = new THREE.Mesh(origGeom, origMat);
  sandbox.cadGroup.add(cube);

  const stats = sandbox.CadAnalysis.toggleOverhangHeatmap(true);
  assert.strictEqual(sandbox.CadAnalysis.isOverhangActive(), true, 'Overhang heatmap should be active');
  assert.strictEqual(stats.totalTriangles, 12, `Expected 12 triangles, got ${stats.totalTriangles}`);
  assert.strictEqual(stats.overhangTriangles, 2, `Expected 2 bottom-face overhang triangles, got ${stats.overhangTriangles}`);
  assert.ok(Math.abs(stats.overhangPercent - (2 / 12) * 100) < 1e-4, `Unexpected overhangPercent: ${stats.overhangPercent}`);
  assert.strictEqual(stats.axis, 'Y');
  assert.strictEqual(stats.thresholdDeg, 45);
  assert.notStrictEqual(cube.material, origMat, 'Heatmap material should replace original material');
  assert.ok(cube.geometry.getAttribute('color'), 'Vertex color attribute should be present');
  assert.ok(domElements['overhang-stats'].textContent.includes('2 / 12'), 'DOM #overhang-stats should be updated');

  // Verify threshold clamping (15..75) and axis switching ('Z')
  sandbox.CadAnalysis.setOverhangThreshold(5);
  assert.strictEqual(sandbox.CadAnalysis.getOverhangThreshold(), 15, 'Threshold should clamp to min 15');
  sandbox.CadAnalysis.setOverhangThreshold(90);
  assert.strictEqual(sandbox.CadAnalysis.getOverhangThreshold(), 75, 'Threshold should clamp to max 75');
  const zStats = sandbox.CadAnalysis.setOverhangAxis('Z');
  assert.strictEqual(zStats.axis, 'Z');
  assert.strictEqual(zStats.overhangTriangles, 2, 'Bottom -Z face should also have 2 overhang triangles');

  // Toggle off and verify clean restoration
  sandbox.CadAnalysis.toggleOverhangHeatmap(false);
  assert.strictEqual(sandbox.CadAnalysis.isOverhangActive(), false, 'Overhang heatmap should be inactive');
  assert.strictEqual(cube.material, origMat, 'Original material should be restored');
  assert.strictEqual(cube.geometry, origGeom, 'Original geometry should be restored');
  assert.strictEqual(cube.geometry.getAttribute('color'), undefined, 'Original geometry should have no color attribute');
  assert.strictEqual(domElements['overhang-stats'].textContent, 'Off');
});

runTest('Test 2: Manifold edge visualizer reports closed cube as watertight & manifold (0 boundary, 0 non-manifold)', () => {
  resetSceneAndGroup();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  sandbox.cadGroup.add(cube);

  const stats = sandbox.CadAnalysis.analyzeManifoldEdges(sandbox.cadGroup);
  assert.strictEqual(stats.boundaryEdges, 0, `Expected 0 boundary edges, got ${stats.boundaryEdges}`);
  assert.strictEqual(stats.nonManifoldEdges, 0, `Expected 0 non-manifold edges, got ${stats.nonManifoldEdges}`);
  assert.strictEqual(stats.isWatertight, true, 'Closed cube should be watertight');
  assert.strictEqual(stats.isManifold, true, 'Closed cube should be manifold');
});

runTest('Test 3: Open box missing 1 face detects 4 boundary edges and toggles overlay cleanly', () => {
  resetSceneAndGroup();
  const openBox = new THREE.Mesh(createOpenBoxGeometryMissingTop(), new THREE.MeshStandardMaterial());
  sandbox.cadGroup.add(openBox);

  const stats = sandbox.CadAnalysis.toggleManifoldEdges(true, sandbox.cadGroup);
  assert.strictEqual(sandbox.CadAnalysis.isManifoldActive(), true);
  assert.strictEqual(stats.boundaryEdges, 4, `Expected 4 boundary edges, got ${stats.boundaryEdges}`);
  assert.strictEqual(stats.nonManifoldEdges, 0, `Expected 0 non-manifold edges, got ${stats.nonManifoldEdges}`);
  assert.strictEqual(stats.isWatertight, false, 'Open box should not be watertight');
  assert.strictEqual(stats.isManifold, true, 'Open box without T-junctions is still manifold');
  assert.ok(domElements['manifold-stats'].textContent.includes('Open: 4'), 'DOM #manifold-stats should show Open: 4');

  const overlay = sandbox.scene.getObjectByName('manifoldEdgeOverlay');
  assert.ok(overlay, 'manifoldEdgeOverlay group should be added to scene');
  const boundaryLines = overlay.getObjectByName('manifoldBoundaryEdges');
  assert.ok(boundaryLines && boundaryLines.isLineSegments, 'manifoldBoundaryEdges LineSegments should exist');

  sandbox.CadAnalysis.toggleManifoldEdges(false);
  assert.strictEqual(sandbox.CadAnalysis.isManifoldActive(), false);
  assert.strictEqual(sandbox.scene.getObjectByName('manifoldEdgeOverlay'), undefined, 'Overlay should be removed on toggle off');
  assert.strictEqual(domElements['manifold-stats'].textContent, 'Off');
});

runTest('Test 4: T-junction geometry detects nonManifoldEdges > 0', () => {
  resetSceneAndGroup();
  const tMesh = new THREE.Mesh(createTJunctionGeometry(), new THREE.MeshStandardMaterial());
  sandbox.cadGroup.add(tMesh);

  const stats = sandbox.CadAnalysis.toggleManifoldEdges(true, sandbox.cadGroup);
  assert.ok(stats.nonManifoldEdges > 0, `Expected nonManifoldEdges > 0, got ${stats.nonManifoldEdges}`);
  assert.strictEqual(stats.isManifold, false, 'T-junction should not be manifold');
  assert.strictEqual(stats.isWatertight, false, 'T-junction should not be watertight');

  const overlay = sandbox.scene.getObjectByName('manifoldEdgeOverlay');
  assert.ok(overlay && overlay.getObjectByName('manifoldNonManifoldEdges'), 'manifoldNonManifoldEdges LineSegments should exist');

  sandbox.CadAnalysis.toggleManifoldEdges(false);
});

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
