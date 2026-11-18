'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

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

function createThreeStub() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    crossVectors(a, b) {
      this.x = a.y * b.z - a.z * b.y;
      this.y = a.z * b.x - a.x * b.z;
      this.z = a.x * b.y - a.y * b.x;
      return this;
    }
    cross(v) { return this.crossVectors(this, v); }
    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= l; this.y /= l; this.z /= l; return this;
    }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  }
  class Box3 {
    constructor(min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity)) {
      this.min = min; this.max = max;
    }
    isEmpty() { return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z; }
    getCenter(target = new Vector3()) {
      return target.set((this.min.x + this.max.x) / 2, (this.min.y + this.max.y) / 2, (this.min.z + this.max.z) / 2);
    }
    getSize(target = new Vector3()) {
      return target.set(this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z);
    }
    setFromObject() { return this; }
  }
  class Plane {
    constructor(normal = new Vector3(1, 0, 0), constant = 0) { this.normal = normal; this.constant = constant; }
    setFromNormalAndCoplanarPoint() { return this; }
  }
  class Group {
    constructor() {
      this.children = [];
      this.name = '';
      this.position = new Vector3();
      this.rotation = new Vector3();
      this.scale = new Vector3(1, 1, 1);
      this.visible = true;
    }
    add(c) { this.children.push(c); }
    clear() { this.children = []; }
    lookAt() {}
    traverse(fn) { fn(this); this.children.forEach(c => c.traverse ? c.traverse(fn) : fn(c)); }
  }
  class Color { constructor(hex) { this.hex = hex; } getHex() { return this.hex; } copy(c) { this.hex = c.hex; } setHex(h) { this.hex = h; } }
  class MaterialStub {
    constructor(opts = {}) { Object.assign(this, opts); }
    clone() { return new MaterialStub(this); }
    dispose() {}
  }
  class GeomStub {
    rotateX() { return this; }
    translate() { return this; }
    dispose() {}
  }
  class ObjectStub {
    constructor() {
      this.position = new Vector3();
      this.rotation = new Vector3();
      this.scale = new Vector3(1, 1, 1);
      this.children = [];
      this.userData = {};
      this.visible = true;
    }
    add(c) { this.children.push(c); }
    lookAt() {}
    traverse(fn) { fn(this); this.children.forEach(c => c.traverse ? c.traverse(fn) : fn(c)); }
  }
  return {
    Vector3, Box3, Plane, Group, Color,
    MeshBasicMaterial: MaterialStub,
    MeshStandardMaterial: MaterialStub,
    LineBasicMaterial: MaterialStub,
    PlaneGeometry: GeomStub,
    EdgesGeometry: GeomStub,
    BoxGeometry: GeomStub,
    TorusGeometry: GeomStub,
    CylinderGeometry: GeomStub,
    ConeGeometry: GeomStub,
    Mesh: ObjectStub,
    LineSegments: ObjectStub
  };
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
    _store: store
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
// 1. Section Plane Precision Controls (Slider <-> Numeric Offset Sync)
// ---------------------------------------------------------------------------
test('Section numeric offset <-> slider bidirectional sync (mm and in)', () => {
  const THREE = createThreeStub();
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
    THREE,
    console,
    Math,
    parseFloat,
    isNaN,
    isFinite,
    window: {},
    document: {
      getElementById: (id) => elements[id] || null
    },
    formatDim: (mmVal) => {
      if (sandbox.currentUnit === 'in') return `${(mmVal / 25.4).toFixed(3)} in`;
      return `${mmVal.toFixed(2)} mm`;
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/sectionEngine.js'), 'utf8'), sandbox);

  // Set a 100 x 50 x 20 mm bounding box centered at (0, 0, 0)
  sandbox.sectionBox = new THREE.Box3(new THREE.Vector3(-50, -25, -10), new THREE.Vector3(50, 25, 10));
  sandbox.isSectionActive = true;
  sandbox.setupSectionListeners();

  // Slider 50% -> 0.00 mm
  elements['sec-slider'].value = '50';
  elements['sec-slider'].dispatchEvent('input');
  assert.strictEqual(elements['sec-offset-input'].value, '0.00');
  assert.strictEqual(elements['sec-offset-unit'].innerText, 'mm');
  assert.strictEqual(sandbox.sectionPlane.constant, 0);

  // Slider 75% -> +25.00 mm
  elements['sec-slider'].value = '75';
  elements['sec-slider'].dispatchEvent('input');
  assert.strictEqual(elements['sec-offset-input'].value, '25.00');
  assert.strictEqual(sandbox.sectionPlane.constant, 25);

  // Numeric input -25 mm -> Slider 25.00%
  elements['sec-offset-input'].value = '-25';
  elements['sec-offset-input'].dispatchEvent('input');
  assert.strictEqual(elements['sec-slider'].value, '25.00');
  assert.strictEqual(sandbox.sectionPlane.constant, -25);

  // Out-of-bounds numeric input commit -> clamped to +50.00 mm / 100.00%
  elements['sec-offset-input'].value = '999';
  elements['sec-offset-input'].dispatchEvent('change');
  assert.strictEqual(elements['sec-slider'].value, '100.00');
  assert.strictEqual(elements['sec-offset-input'].value, '50.00');
  assert.strictEqual(sandbox.sectionPlane.constant, 50);

  // Unit switch to inches -> 50 mm = 1.969 in
  sandbox.currentUnit = 'in';
  sandbox.updateSectionPlane();
  assert.strictEqual(elements['sec-offset-unit'].innerText, 'in');
  assert.strictEqual(elements['sec-offset-input'].value, (50 / 25.4).toFixed(3));

  // Typing 1.000 in -> 25.4 mm -> slider 75.40%
  elements['sec-offset-input'].value = '1.000';
  elements['sec-offset-input'].dispatchEvent('input');
  assert.ok(Math.abs(sandbox.sectionPlane.constant - 25.4) < 1e-6);
  assert.strictEqual(elements['sec-slider'].value, '75.40');

  // Switch to Y axis -> Y range is [-25, +25] mm
  sandbox.currentUnit = 'mm';
  elements['btn-sec-y'].click();
  assert.strictEqual(elements['sec-offset-unit'].innerText, 'mm');
  assert.ok(Math.abs(parseFloat(elements['sec-offset-input'].max) - 25) < 1e-6);
});

// ---------------------------------------------------------------------------
// 2. User Preferences Persistence (localStorage round-trip & restricted mode)
// ---------------------------------------------------------------------------
test('CadPrefs save/load round-trip and restricted localStorage fallback', () => {
  const THREE = createThreeStub();
  const storage = createMemoryStorage();

  const sandbox = {
    THREE,
    localStorage: storage,
    console,
    window: {},
    document: { getElementById: () => null }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), sandbox);

  // Defaults
  const def = JSON.parse(JSON.stringify(sandbox.CadPrefs.load()));
  assert.deepStrictEqual(def, {
    defaultUnit: 'mm',
    showHlrEdges: true,
    defaultCameraMode: 'ortho',
    theme: 'dark'
  });

  // Save custom prefs
  sandbox.CadPrefs.save({
    defaultUnit: 'in',
    showHlrEdges: false,
    defaultCameraMode: 'persp',
    theme: 'light'
  });

  const raw = JSON.parse(storage.getItem('quicklook_cad_prefs_v1'));
  assert.strictEqual(raw.defaultUnit, 'in');
  assert.strictEqual(raw.showHlrEdges, false);
  assert.strictEqual(raw.defaultCameraMode, 'persp');
  assert.strictEqual(raw.theme, 'light');

  // Reload round-trip
  const loaded = JSON.parse(JSON.stringify(sandbox.CadPrefs.load()));
  assert.deepStrictEqual(loaded, {
    defaultUnit: 'in',
    showHlrEdges: false,
    defaultCameraMode: 'persp',
    theme: 'light'
  });

  // Restricted environment where localStorage throws
  const restrictedSandbox = {
    THREE,
    get localStorage() { throw new Error('SecurityError: storage disabled'); },
    console,
    window: {},
    document: { getElementById: () => null }
  };
  restrictedSandbox.window = restrictedSandbox;
  vm.createContext(restrictedSandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), restrictedSandbox);

  const safeLoaded = restrictedSandbox.CadPrefs.load();
  assert.strictEqual(safeLoaded.defaultUnit, 'mm');
  const safeSaved = restrictedSandbox.CadPrefs.save({ theme: 'light' });
  assert.strictEqual(safeSaved.theme, 'light');
});

test('WorkbenchUI restores saved preferences on init and auto-saves on toggles', () => {
  const THREE = createThreeStub();
  const storage = createMemoryStorage();
  storage.setItem('quicklook_cad_prefs_v1', JSON.stringify({
    defaultUnit: 'in',
    showHlrEdges: false,
    defaultCameraMode: 'persp',
    theme: 'light'
  }));

  const body = createMockElement('body');
  const documentElement = createMockElement('html');
  const btnUnits = createMockElement('btn-units');
  const btnEdges = createMockElement('btn-edges', { classes: ['active'] });
  const btnTheme = createMockElement('btn-theme-switch');
  const btnPersp = createMockElement('vc-btn-persp');

  let edgesToggledCount = 0;
  btnEdges.addEventListener('click', () => {
    edgesToggledCount++;
    btnEdges.classList.toggle('active');
  });

  const elements = {
    'btn-units': btnUnits,
    'btn-edges': btnEdges,
    'btn-theme-switch': btnTheme,
    'vc-btn-persp': btnPersp
  };

  let cameraMode = 'ortho';
  const sandbox = {
    THREE,
    localStorage: storage,
    console,
    window: {},
    document: {
      readyState: 'complete',
      body,
      documentElement,
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  sandbox.window = sandbox;
  sandbox.camera = { isOrthographicCamera: true };
  sandbox.toggleUnits = () => {
    sandbox.currentUnit = (sandbox.currentUnit === 'mm') ? 'in' : 'mm';
  };
  sandbox.switchCamera = (target) => {
    cameraMode = target || (cameraMode === 'ortho' ? 'persp' : 'ortho');
    sandbox.camera.isOrthographicCamera = (cameraMode === 'ortho');
  };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/cadState.js'), 'utf8'), sandbox);
  sandbox.camera = { isOrthographicCamera: true };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Assets/js/workbenchUiEngine.js'), 'utf8'), sandbox);

  sandbox.initWorkbenchUI();

  // Verify restored state
  assert.strictEqual(sandbox.WorkbenchUI.getActiveTheme(), 'light');
  assert.strictEqual(body.classList.contains('theme-light'), true);
  assert.strictEqual(sandbox.currentUnit, 'in');
  assert.strictEqual(edgesToggledCount, 1);
  assert.strictEqual(btnEdges.classList.contains('active'), false);
  assert.strictEqual(cameraMode, 'persp');

  // Toggle each preference and verify localStorage updates
  sandbox.toggleUnits();
  btnEdges.click();
  sandbox.switchCamera('ortho');
  btnTheme.click();

  const updated = JSON.parse(storage.getItem('quicklook_cad_prefs_v1'));
  assert.strictEqual(updated.defaultUnit, 'mm');
  assert.strictEqual(updated.showHlrEdges, true);
  assert.strictEqual(updated.defaultCameraMode, 'ortho');
  assert.strictEqual(updated.theme, 'dark');
});

// ---------------------------------------------------------------------------
// 3. Phase 5 UI DOM IDs Presence Check
// ---------------------------------------------------------------------------
test('viewer.html contains all Phase 5 section, measure, and printability DOM IDs', () => {
  const html = fs.readFileSync(path.join(ROOT, 'Assets/viewer.html'), 'utf8');
  const requiredIds = [
    'sec-offset-input',
    'sec-offset-unit',
    'measure-pins-list',
    'btn-clear-pins',
    'btn-measure-wall',
    'btn-measure-clearance',
    'btn-toggle-overhang',
    'overhang-angle-slider',
    'overhang-axis-select',
    'overhang-stats',
    'btn-toggle-manifold',
    'manifold-stats'
  ];
  for (const id of requiredIds) {
    assert.ok(html.includes(`id="${id}"`), `Missing id="${id}" in Assets/viewer.html`);
  }
});

console.log(`\nPhase 5 Section & Prefs Tests: ${passed} passed.`);
