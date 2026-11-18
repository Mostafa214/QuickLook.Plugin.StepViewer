/**
 * Phase 5 Verification Suite: Smart Measure v2
 * (Multi-Dimension Pinning, Wall Thickness Probe, Minimum Body Clearance)
 * File: tests/test_phase5_measure_v2.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

function createMockElement(id) {
  return {
    id,
    innerText: '',
    innerHTML: '',
    style: { display: '' },
    children: [],
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._set.has(c)) this._set.delete(c);
          else this._set.add(c);
        } else if (force) this._set.add(c);
        else this._set.delete(c);
      },
      contains(c) { return this._set.has(c); }
    },
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      child.parentNode = null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    getContext() {
      return {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: '',
        beginPath() {},
        moveTo() {},
        lineTo() {},
        quadraticCurveTo() {},
        closePath() {},
        fill() {},
        stroke() {},
        fillRect() {},
        fillText() {}
      };
    }
  };
}

function createSandbox(withBvh = true) {
  const domElements = {
    'measure-card': createMockElement('measure-card'),
    'measure-card-title': createMockElement('measure-card-title'),
    'measure-dist': createMockElement('measure-dist'),
    'measure-deltas': createMockElement('measure-deltas'),
    'measure-extra': createMockElement('measure-extra'),
    'measure-angle': createMockElement('measure-angle'),
    'measure-pins-list': createMockElement('measure-pins-list'),
    'canvas-container': createMockElement('canvas-container'),
    'btn-measure': createMockElement('btn-measure'),
    'btn-measure-wall': createMockElement('btn-measure-wall'),
    'btn-measure-clearance': createMockElement('btn-measure-clearance')
  };

  const cam = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 1000);
  cam.position.set(0, 20, 60);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);

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
    isFinite,
    innerWidth: 800,
    innerHeight: 600,
    camera: cam,
    scene: new THREE.Scene(),
    modelGroup: new THREE.Group(),
    measureGroup: new THREE.Group(),
    controls: { addEventListener: () => {} },
    renderer: {
      domElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
      }
    },
    modelBodies: [],
    modelEdgeFeatures: [],
    modelCadVertices: [],
    selectedCadEntities: [],
    measurePoints: [],
    selectedFeatures: [],
    rubberbandLine: null,
    snapIndicator: null,
    hoverEdgeMesh: null,
    currentHoverFeature: null,
    currentHoverTarget: null,
    currentMeasuredValue: '',
    currentUnit: 'mm',
    currentModelDistance: 50,
    isMeasureActive: true,
    isEdgesActive: true,
    isWireframeActive: false,
    isAutoRotateActive: false,
    initialCameraState: { position: new THREE.Vector3(), target: new THREE.Vector3() },
    currentModelCenter: new THREE.Vector3(),
    formatDim: (v) => `${Number(v).toFixed(2)} mm`,
    formatCoord: (v) => Number(v).toFixed(2),
    document: {
      getElementById: (id) => domElements[id] || null,
      createElement: (tag) => createMockElement(tag)
    },
    module: { exports: {} }
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox._domElements = domElements;

  vm.createContext(sandbox);

  if (withBvh) {
    const bvhCode = fs.readFileSync(path.join(__dirname, '../Assets/js/vendor/three-mesh-bvh.umd.js'), 'utf8');
    vm.runInContext(bvhCode, sandbox);
  }

  const measureCode = fs.readFileSync(path.join(__dirname, '../Assets/js/measureEngine.js'), 'utf8');
  vm.runInContext(measureCode, sandbox);

  return sandbox;
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
    console.error(`  [FAIL] ${name}: ${err.stack || err.message}`);
  }
}

console.log('================================================================');
console.log('  PHASE 5: SMART MEASURE V2 VERIFICATION SUITE                  ');
console.log('================================================================\n');

runTest('Test 1: Window & module.exports expose all Smart Measure v2 APIs', () => {
  const sb = createSandbox(true);
  const expectedApis = [
    'pinMeasurement',
    'removePinnedMeasurement',
    'clearPinnedMeasurements',
    'getPinnedMeasurements',
    'updatePinnedBadgePositions',
    'measureWallThickness',
    'toggleWallThicknessMode',
    'measureMinClearance',
    'toggleClearanceMode'
  ];
  for (const api of expectedApis) {
    assert.strictEqual(typeof sb.MeasureEngine[api], 'function', `window.MeasureEngine.${api} must be a function`);
    assert.strictEqual(typeof sb.module.exports[api], 'function', `module.exports.${api} must be a function`);
    assert.strictEqual(typeof sb[api], 'function', `window.${api} must be a function`);
  }
});

runTest('Test 2: Multi-Dimension Pinning add / clearActiveMeasurement preservation / remove / clear', () => {
  const sb = createSandbox(true);

  // Perform a 2-point measurement via handleUnifiedClick
  sb.MeasureEngine.handleUnifiedClick({
    type: 'point',
    subType: 'corner',
    point: new THREE.Vector3(0, 0, 0)
  });
  sb.MeasureEngine.handleUnifiedClick({
    type: 'point',
    subType: 'corner',
    point: new THREE.Vector3(12, 0, 0)
  });

  const pin1 = sb.MeasureEngine.pinMeasurement();
  assert.ok(pin1 && pin1.id, 'pinMeasurement() should return a pin object with id');

  const pin2 = sb.MeasureEngine.pinMeasurement({
    title: 'Custom Span',
    valueText: '25.00 mm',
    distanceMm: 25,
    points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 25, 0)]
  });
  assert.ok(pin2 && pin2.id && pin2.id !== pin1.id, 'Second pin must have a distinct id');

  let pins = sb.MeasureEngine.getPinnedMeasurements();
  assert.strictEqual(pins.length, 2, `Expected 2 pins, got ${pins.length}`);
  assert.ok(pins[0].screenPos && typeof pins[0].screenPos.x === 'number', 'Projected 2D badge position should be computed');
  assert.ok(sb._domElements['measure-pins-list'].innerHTML.includes(pin1.id), '#measure-pins-list should render pin1');
  assert.ok(sb._domElements['measure-pins-list'].innerHTML.includes(pin2.id), '#measure-pins-list should render pin2');

  // Clearing active measurement must preserve pinned measurements
  sb.MeasureEngine.clearActiveMeasurement(false);
  pins = sb.MeasureEngine.getPinnedMeasurements();
  assert.strictEqual(pins.length, 2, 'clearActiveMeasurement must preserve pinned measurements');

  const pinnedGroup = sb.measureGroup.getObjectByName('pinned_measure_group');
  assert.ok(pinnedGroup && pinnedGroup.children.length === 2, '3D pinned_measure_group should contain 2 pin groups');

  // Remove individual pin
  const removed = sb.MeasureEngine.removePinnedMeasurement(pin1.id);
  assert.strictEqual(removed, true, 'removePinnedMeasurement should return true for existing id');
  pins = sb.MeasureEngine.getPinnedMeasurements();
  assert.strictEqual(pins.length, 1, 'Expected 1 pin remaining after remove');
  assert.strictEqual(pins[0].id, pin2.id, 'Remaining pin should be pin2');

  // Clear all pins
  sb.MeasureEngine.clearPinnedMeasurements();
  pins = sb.MeasureEngine.getPinnedMeasurements();
  assert.strictEqual(pins.length, 0, 'Expected 0 pins after clearPinnedMeasurements');
  assert.strictEqual(pinnedGroup.children.length, 0, '3D pinned_measure_group should be empty after clear');
});

runTest('Test 3: Wall Thickness Probe on 10mm-thick box returns ~10.0mm (BVH & Raycaster fallback)', () => {
  // 3a: With MeshBVH
  const sbBvh = createSandbox(true);
  const slabBvh = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 40), new THREE.MeshStandardMaterial());
  slabBvh.name = 'TestSlab';
  slabBvh.updateMatrixWorld(true);

  assert.strictEqual(sbBvh.MeasureEngine.toggleWallThicknessMode(true), true, 'toggleWallThicknessMode(true) should enable mode');
  const resBvh = sbBvh.MeasureEngine.measureWallThickness(
    new THREE.Vector3(0, 5, 0),
    new THREE.Vector3(0, 1, 0),
    slabBvh
  );
  assert.ok(resBvh, 'measureWallThickness with BVH should return a result');
  assert.ok(Math.abs(resBvh.thicknessMm - 10.0) < 0.01, `Expected ~10.0mm with BVH, got ${resBvh.thicknessMm}`);
  assert.ok(slabBvh.geometry.boundsTree, 'BVH boundsTree should be built on targetMesh');
  assert.strictEqual(sbBvh.MeasureEngine.toggleWallThicknessMode(false), false, 'toggleWallThicknessMode(false) should disable mode');

  // 3b: Without MeshBVH (THREE.Raycaster fallback)
  const sbFallback = createSandbox(false);
  const slabFallback = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 40), new THREE.MeshStandardMaterial());
  slabFallback.updateMatrixWorld(true);

  const resFallback = sbFallback.MeasureEngine.measureWallThickness(
    new THREE.Vector3(0, 5, 0),
    new THREE.Vector3(0, 1, 0),
    slabFallback
  );
  assert.ok(resFallback, 'measureWallThickness fallback should return a result');
  assert.ok(Math.abs(resFallback.thicknessMm - 10.0) < 0.01, `Expected ~10.0mm with Raycaster fallback, got ${resFallback.thicknessMm}`);
});

runTest('Test 4: Minimum Clearance Distance between two separated boxes (5mm gap -> ~5.0mm)', () => {
  const sb = createSandbox(true);
  const boxA = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  const boxB = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  boxA.name = 'BoxA';
  boxB.name = 'BoxB';
  // BoxA spans x in [-5, 5]; BoxB spans x in [10, 20] -> exact gap = 5.0mm
  boxA.position.set(0, 0, 0);
  boxB.position.set(15, 0, 0);
  boxA.updateMatrixWorld(true);
  boxB.updateMatrixWorld(true);

  assert.strictEqual(sb.MeasureEngine.toggleClearanceMode(true), true, 'toggleClearanceMode(true) should enable mode');
  const res = sb.MeasureEngine.measureMinClearance(boxA, boxB);
  assert.ok(res, 'measureMinClearance should return a result');
  assert.ok(Math.abs(res.distanceMm - 5.0) < 0.01, `Expected ~5.0mm clearance, got ${res.distanceMm}`);
  assert.ok(res.pointA && res.pointB, 'pointA and pointB must be returned');
  assert.ok(Math.abs(res.pointA.x - 5.0) < 0.01, `Expected pointA.x ~ 5.0, got ${res.pointA.x}`);
  assert.ok(Math.abs(res.pointB.x - 10.0) < 0.01, `Expected pointB.x ~ 10.0, got ${res.pointB.x}`);

  const lineObj = sb.measureGroup.children.find(c => c.isLine && c.material && c.material.isLineDashedMaterial);
  assert.ok(lineObj, 'A dashed clearance line should be added to measureGroup');
  assert.strictEqual(sb.MeasureEngine.toggleClearanceMode(false), false, 'toggleClearanceMode(false) should disable mode');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
