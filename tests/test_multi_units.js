'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const REAL_THREE = require(path.join(ROOT, 'Assets/three.min.js'));

function createMockElement(id, initialProps = {}) {
  const listeners = {};
  const classes = new Set(initialProps.classes || []);
  const el = {
    id,
    value: initialProps.value !== undefined ? String(initialProps.value) : '',
    innerText: initialProps.innerText || '',
    innerHTML: '',
    min: '',
    max: '',
    step: '',
    title: '',
    disabled: false,
    style: {},
    dataset: initialProps.dataset || {},
    classList: {
      add: (...cls) => cls.forEach(c => classes.add(c)),
      remove: (...cls) => cls.forEach(c => classes.delete(c)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) { classes.delete(c); return false; }
          classes.add(c); return true;
        }
        if (force) classes.add(c);
        else classes.delete(c);
        return !!force;
      },
      contains: (c) => classes.has(c)
    },
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evtObj) => {
      const type = typeof evtObj === 'string' ? evtObj : evtObj.type;
      const event = typeof evtObj === 'string' ? { type, target: el } : Object.assign({ target: el }, evtObj);
      (listeners[type] || []).forEach(fn => fn(event));
    },
    click: () => {
      el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} });
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute: (k, v) => { el[k] = v; },
    removeAttribute: (k) => { delete el[k]; }
  };
  return el;
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); }
  };
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 1. CadState: SUPPORTED_UNITS, UNIT_META, conversions, formatting, cycling, CadPrefs
// ---------------------------------------------------------------------------
test('CadState exposes all 5 units, exact conversion factors, formatting, cycling & CadPrefs', () => {
  const storage = createMemoryStorage();
  const sandbox = {
    THREE: REAL_THREE,
    localStorage: storage,
    console,
    Math,
    Number,
    isFinite,
    isNaN,
    window: {},
    document: { getElementById: () => null }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), sandbox);

  const cs = sandbox.CadState;
  assert.deepStrictEqual(Array.from(cs.SUPPORTED_UNITS), ['mm', 'cm', 'm', 'in', 'ft']);

  assert.strictEqual(cs.UNIT_META.mm.factor, 1);
  assert.strictEqual(cs.UNIT_META.cm.factor, 0.1);
  assert.strictEqual(cs.UNIT_META.m.factor, 0.001);
  assert.ok(Math.abs(cs.UNIT_META.in.factor - 1 / 25.4) < 1e-12);
  assert.ok(Math.abs(cs.UNIT_META.ft.factor - 1 / 304.8) < 1e-12);

  assert.strictEqual(cs.UNIT_META.mm.decimals, 2);
  assert.strictEqual(cs.UNIT_META.cm.decimals, 2);
  assert.strictEqual(cs.UNIT_META.m.decimals, 4);
  assert.strictEqual(cs.UNIT_META.in.decimals, 3);
  assert.strictEqual(cs.UNIT_META.ft.decimals, 4);

  // Round-trip conversions for 304.8 mm (= 1 ft = 12 in = 30.48 cm = 0.3048 m)
  assert.ok(Math.abs(cs.convertFromMm(304.8, 'mm') - 304.8) < 1e-9);
  assert.ok(Math.abs(cs.convertFromMm(304.8, 'cm') - 30.48) < 1e-9);
  assert.ok(Math.abs(cs.convertFromMm(304.8, 'm') - 0.3048) < 1e-9);
  assert.ok(Math.abs(cs.convertFromMm(304.8, 'in') - 12.0) < 1e-9);
  assert.ok(Math.abs(cs.convertFromMm(304.8, 'ft') - 1.0) < 1e-9);

  for (const u of cs.SUPPORTED_UNITS) {
    const converted = cs.convertFromMm(123.456, u);
    const back = cs.convertToMm(converted, u);
    assert.ok(Math.abs(back - 123.456) < 1e-9, `Round-trip failed for ${u}`);
  }

  assert.strictEqual(cs.formatLength(25.4, 'mm'), '25.40 mm');
  assert.strictEqual(cs.formatLength(25.4, 'cm'), '2.54 cm');
  assert.strictEqual(cs.formatLength(25.4, 'm'), '0.0254 m');
  assert.strictEqual(cs.formatLength(25.4, 'in'), '1.000 in');
  assert.strictEqual(cs.formatLength(304.8, 'ft'), '1.0000 ft');

  assert.strictEqual(cs.formatArea(100, 'cm'), '1.00 cm²');
  assert.strictEqual(cs.formatArea(645.16, 'in'), '1.000 in²');
  assert.strictEqual(cs.formatVolume(1000, 'cm'), '1.00 cm³');

  // Cycle order: mm -> cm -> m -> in -> ft -> mm
  assert.strictEqual(sandbox.currentUnit, 'mm');
  assert.strictEqual(cs.cycleCurrentUnit(), 'cm');
  assert.strictEqual(cs.cycleCurrentUnit(), 'm');
  assert.strictEqual(cs.cycleCurrentUnit(), 'in');
  assert.strictEqual(cs.cycleCurrentUnit(), 'ft');
  assert.strictEqual(cs.cycleCurrentUnit(), 'mm');

  // CadPrefs accepts all 5 units
  for (const u of cs.SUPPORTED_UNITS) {
    sandbox.CadPrefs.save({ defaultUnit: u });
    assert.strictEqual(sandbox.CadPrefs.load().defaultUnit, u);
  }
});

// ---------------------------------------------------------------------------
// 2. WorkbenchUI & viewer.html: #btn-units cycling + CadPrefs restore
// ---------------------------------------------------------------------------
test('WorkbenchUI cycles #btn-units through MM -> CM -> M -> IN -> FT and restores any unit', () => {
  const storage = createMemoryStorage();
  storage.setItem('quicklook_cad_prefs_v1', JSON.stringify({ defaultUnit: 'cm' }));

  const unitIndicator = createMockElement('unit-indicator', { innerText: 'MM' });
  const btnUnits = createMockElement('btn-units');
  const secOffsetUnit = createMockElement('sec-offset-unit', { innerText: 'mm' });

  const elements = {
    'btn-units': btnUnits,
    'unit-indicator': unitIndicator,
    'sec-offset-unit': secOffsetUnit
  };

  const sandbox = {
    THREE: REAL_THREE,
    localStorage: storage,
    console,
    Math,
    Number,
    isFinite,
    isNaN,
    window: {},
    document: {
      readyState: 'complete',
      body: createMockElement('body'),
      documentElement: createMockElement('html'),
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/workbenchUiEngine.js'), 'utf8'), sandbox);

  sandbox.initWorkbenchUI();

  // Restored 'cm'
  assert.strictEqual(sandbox.currentUnit, 'cm');
  assert.strictEqual(unitIndicator.innerText, 'CM');
  assert.strictEqual(secOffsetUnit.innerText, 'cm');

  // Click cycles CM -> M -> IN -> FT -> MM -> CM
  const expected = [
    { unit: 'm', badge: 'M' },
    { unit: 'in', badge: 'IN' },
    { unit: 'ft', badge: 'FT' },
    { unit: 'mm', badge: 'MM' },
    { unit: 'cm', badge: 'CM' }
  ];
  for (const exp of expected) {
    btnUnits.click();
    assert.strictEqual(sandbox.currentUnit, exp.unit);
    assert.strictEqual(unitIndicator.innerText, exp.badge);
    assert.strictEqual(secOffsetUnit.innerText, exp.unit);
    assert.strictEqual(JSON.parse(storage.getItem('quicklook_cad_prefs_v1')).defaultUnit, exp.unit);
  }
});

// ---------------------------------------------------------------------------
// 3. SectionEngine: all 5 units bidirectional sync
// ---------------------------------------------------------------------------
test('SectionEngine supports all 5 units (mm, cm, m, in, ft) for offset display & input', () => {
  const elements = {
    'sec-slider': createMockElement('sec-slider', { value: '50' }),
    'sec-offset-input': createMockElement('sec-offset-input', { value: '0.00' }),
    'sec-offset-unit': createMockElement('sec-offset-unit', { innerText: 'mm' }),
    'sec-offset-val': createMockElement('sec-offset-val', { innerText: 'X: 0.00 mm' }),
    'btn-sec-center': createMockElement('btn-sec-center'),
    'btn-sec-x': createMockElement('btn-sec-x', { classes: ['active'] }),
    'btn-sec-y': createMockElement('btn-sec-y'),
    'btn-sec-z': createMockElement('btn-sec-z'),
    'btn-sec-flip': createMockElement('btn-sec-flip'),
    'btn-sec-cap': createMockElement('btn-sec-cap', { classes: ['active'] }),
    'btn-sec-plane': createMockElement('btn-sec-plane', { classes: ['active'] })
  };

  const sandbox = {
    THREE: REAL_THREE,
    console,
    Math,
    Number,
    parseFloat,
    isNaN,
    isFinite,
    window: {},
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: () => ({
        width: 256,
        height: 64,
        getContext: () => ({
          font: '',
          measureText: () => ({ width: 80 }),
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          quadraticCurveTo: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          fillText: () => {},
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          textAlign: '',
          textBaseline: ''
        })
      })
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/sectionEngine.js'), 'utf8'), sandbox);

  // 1000 mm wide box [-500, +500]
  sandbox.sectionBox = new REAL_THREE.Box3(new REAL_THREE.Vector3(-500, -100, -100), new REAL_THREE.Vector3(500, 100, 100));
  sandbox.isSectionActive = true;
  sandbox.setupSectionListeners();

  // Slider 75% => +250 mm
  elements['sec-slider'].value = '75';
  elements['sec-slider'].dispatchEvent('input');

  const checks = [
    { unit: 'mm', expectedVal: '250.00', inputVal: '100', expectedConst: 100 },
    { unit: 'cm', expectedVal: '25.00', inputVal: '15', expectedConst: 150 },
    { unit: 'm', expectedVal: '0.2500', inputVal: '0.2', expectedConst: 200 },
    { unit: 'in', expectedVal: (250 / 25.4).toFixed(3), inputVal: '10', expectedConst: 254 },
    { unit: 'ft', expectedVal: (250 / 304.8).toFixed(4), inputVal: '1', expectedConst: 304.8 }
  ];

  for (const c of checks) {
    elements['sec-slider'].value = '75';
    elements['sec-slider'].dispatchEvent('input');
    sandbox.CadState.setCurrentUnit(c.unit);
    sandbox.updateSectionPlane();
    assert.strictEqual(elements['sec-offset-unit'].innerText, c.unit);
    assert.strictEqual(elements['sec-offset-input'].value, c.expectedVal);
    assert.ok(elements['sec-offset-val'].innerText.includes(` ${c.unit}`));

    elements['sec-offset-input'].value = c.inputVal;
    elements['sec-offset-input'].dispatchEvent('input');
    assert.ok(Math.abs(sandbox.sectionPlane.constant - c.expectedConst) < 1e-6, `Section input failed for ${c.unit}`);
  }
});

// ---------------------------------------------------------------------------
// 4. MeasureEngine: wall thickness & clearance formatting across all 5 units
// ---------------------------------------------------------------------------
test('MeasureEngine formats wall thickness & clearance across all 5 units', () => {
  const distEl = createMockElement('measure-dist');
  const titleEl = createMockElement('measure-card-title');
  const deltasEl = createMockElement('measure-deltas');
  const pinsList = createMockElement('measure-pins-list');

  const elements = {
    'measure-dist': distEl,
    'measure-card-title': titleEl,
    'measure-deltas': deltasEl,
    'measure-pins-list': pinsList
  };

  const sandbox = {
    THREE: REAL_THREE,
    console,
    Math,
    Number,
    isFinite,
    isNaN,
    currentModelDistance: 100,
    window: {},
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: () => ({
        width: 256,
        height: 64,
        getContext: () => ({
          font: '',
          measureText: () => ({ width: 80 }),
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          quadraticCurveTo: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          fillText: () => {},
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          textAlign: '',
          textBaseline: ''
        })
      })
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/measureEngine.js'), 'utf8'), sandbox);

  // Build a 10mm-thick box centered at origin and a second box with 5mm gap along +X
  const boxGeom = new REAL_THREE.BoxGeometry(100, 100, 10);
  const mesh = new REAL_THREE.Mesh(boxGeom, new REAL_THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);

  const boxA = new REAL_THREE.Mesh(new REAL_THREE.BoxGeometry(10, 10, 10), new REAL_THREE.MeshStandardMaterial());
  boxA.position.set(0, 0, 0);
  boxA.updateMatrixWorld(true);
  const boxB = new REAL_THREE.Mesh(new REAL_THREE.BoxGeometry(10, 10, 10), new REAL_THREE.MeshStandardMaterial());
  boxB.position.set(15, 0, 0); // 5mm gap between x=5 and x=10
  boxB.updateMatrixWorld(true);

  sandbox.modelGroup.add(mesh);
  sandbox.modelBodies = [{ id: 'body-1', name: 'Plate', mesh }];
  sandbox.camera = new REAL_THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  sandbox.camera.position.set(0, 0, 200);

  const hitPoint = new REAL_THREE.Vector3(0, 0, 5);
  const hitNormal = new REAL_THREE.Vector3(0, 0, 1);

  for (const u of ['mm', 'cm', 'm', 'in', 'ft']) {
    sandbox.CadState.setCurrentUnit(u);
    const wallRes = sandbox.MeasureEngine.measureWallThickness(hitPoint, hitNormal, mesh);
    assert.ok(wallRes && Math.abs(wallRes.thicknessMm - 10) < 1e-4, `Wall thickness failed for ${u}`);
    assert.strictEqual(distEl.innerText, sandbox.CadState.formatLength(10, u));

    const clearRes = sandbox.MeasureEngine.measureMinClearance(boxA, boxB);
    assert.ok(clearRes && Math.abs(clearRes.distanceMm - 5) < 1e-4, `Min clearance failed for ${u}`);
    assert.strictEqual(distEl.innerText, sandbox.CadState.formatLength(5, u));
  }
});

// ---------------------------------------------------------------------------
// 5. CadAnalysis: updateComReadout across all 5 units
// ---------------------------------------------------------------------------
test('CadAnalysis updateComReadout formats CoM coordinates in all 5 units', () => {
  const comReadout = createMockElement('com-coords-readout');
  const sandbox = {
    THREE: REAL_THREE,
    console,
    Math,
    Number,
    isFinite,
    isNaN,
    currentModelDistance: 100,
    window: {},
    document: {
      getElementById: (id) => (id === 'com-coords-readout' ? comReadout : null),
      createElement: () => createMockElement('div')
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadAnalysisEngine.js'), 'utf8'), sandbox);

  // Add a 100x100x100 box centered at (25.4, 50.8, 304.8)
  const geom = new REAL_THREE.BoxGeometry(10, 10, 10);
  const mesh = new REAL_THREE.Mesh(geom, new REAL_THREE.MeshStandardMaterial());
  mesh.position.set(25.4, 50.8, 304.8);
  mesh.updateMatrixWorld(true);
  sandbox.modelBodies = [{ id: 'b1', name: 'Cube', mesh, volumeMm3: 1000 }];

  const expected = {
    mm: ['X: 25.40', 'Y: 50.80', 'Z: 304.80 mm'],
    cm: ['X: 2.54', 'Y: 5.08', 'Z: 30.48 cm'],
    m: ['X: 0.0254', 'Y: 0.0508', 'Z: 0.3048 m'],
    in: ['X: 1.000', 'Y: 2.000', 'Z: 12.000 in'],
    ft: ['X: 0.0833', 'Y: 0.1667', 'Z: 1.0000 ft']
  };

  for (const u of ['mm', 'cm', 'm', 'in', 'ft']) {
    sandbox.CadState.setCurrentUnit(u);
    sandbox.CadAnalysis.toggleCoM(true);
    sandbox.CadAnalysis.refreshCoM();
    for (const token of expected[u]) {
      assert.ok(comReadout.innerHTML.includes(token), `Missing "${token}" in CoM readout for ${u}: ${comReadout.innerHTML}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 6. BlueprintEngine: 2D SVG generation across all 5 units
// ---------------------------------------------------------------------------
test('BlueprintEngine generates valid SVG with correct unit labels & dimensions for all 5 units', () => {
  const sandbox = {
    THREE: REAL_THREE,
    console,
    Math,
    Number,
    isFinite,
    isNaN,
    currentModelDistance: 100,
    window: {},
    document: { getElementById: () => null }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/blueprintSvgEngine.js'), 'utf8'), sandbox);

  const geom = new REAL_THREE.BoxGeometry(304.8, 25.4, 50.8);
  const mesh = new REAL_THREE.Mesh(geom, new REAL_THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);
  sandbox.modelBodies = [{ id: 'b1', name: 'Block', mesh }];
  sandbox.pendingFileName = 'MultiUnit_Test.step';

  const expectedUnits = {
    mm: 'MILLIMETERS',
    cm: 'CENTIMETERS',
    m: 'METERS',
    in: 'INCHES',
    ft: 'FEET'
  };

  for (const [u, fullName] of Object.entries(expectedUnits)) {
    const svg = sandbox.BlueprintEngine.generateSvg({ unit: u });
    assert.ok(svg && svg.includes('<svg '), `Invalid SVG for ${u}`);
    assert.ok(svg.includes(fullName), `Missing title block unit ${fullName} for ${u}`);
    assert.ok(svg.includes(` ${u}</text>`), `Missing dimension suffix " ${u}" for ${u}`);
  }
});

console.log(`\nMulti-Unit Test Suite: ${passed} passed, ${process.exitCode ? 1 : 0} failed.`);
