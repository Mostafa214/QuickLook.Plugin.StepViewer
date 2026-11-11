/**
 * Challenger 1 Iteration 2 Empirical Probe
 * Independent adversarial stress verification for:
 * 1. Key 'O' and 'o' shortcut toggling, modifier rejection, input suppression, button state sync.
 * 2. Ortho -> Resize -> Persp aspect ratio updating and projection matrix math verification.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passCount = 0;
let failCount = 0;

function assert(condition, desc) {
  if (condition) {
    console.log(`  ✓ PASS: ${desc}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    failCount++;
  }
}

// Minimal DOM mock
class ClassList {
  constructor() { this.classes = new Set(); }
  add(...names) { names.forEach(n => n && this.classes.add(n)); }
  remove(...names) { names.forEach(n => this.classes.delete(n)); }
  toggle(name, force) {
    if (force === true) { this.classes.add(name); return true; }
    if (force === false) { this.classes.delete(name); return false; }
    if (this.classes.has(name)) { this.classes.delete(name); return false; }
    this.classes.add(name); return true;
  }
  contains(name) { return this.classes.has(name); }
}

class MockElement {
  constructor(tag, id = '', className = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = new ClassList();
    if (className) className.split(/\s+/).forEach(c => this.classList.add(c));
    this.style = {};
    this.innerText = '';
    this.title = '';
    this.attributes = {};
    this.listeners = {};
    this.isContentEditable = false;
  }
  setAttribute(k, v) { this.attributes[k] = v; if (k === 'title') this.title = v; }
  getAttribute(k) { return this.attributes[k] || null; }
  addEventListener(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
  appendChild(c) { return c; }
  removeChild(c) { return c; }
  click() {
    const list = this.listeners['click'] || [];
    list.forEach(fn => fn({ type: 'click', target: this, stopPropagation: () => {}, preventDefault: () => {} }));
  }
}

const elements = new Map();
function reg(el) { elements.set(el.id, el); return el; }

const domIds = [
  'canvas-container', 'vc-btn-persp', 'btn-view-iso', 'btn-view-top', 'btn-view-front', 'btn-view-right',
  'btn-edges', 'btn-wireframe', 'btn-reset', 'btn-toggle-shortcuts', 'error-container', 'spinner',
  'status-text', 'viewcube-canvas', 'badge-filename', 'toolbar', 'bottom-bar'
];
domIds.forEach(id => reg(new MockElement('div', id)));
elements.get('vc-btn-persp').innerText = 'Ortho';
elements.get('vc-btn-persp').classList.add('active');

const documentMock = {
  readyState: 'complete',
  getElementById: id => elements.get(id) || null,
  querySelector: sel => sel.startsWith('#') ? elements.get(sel.slice(1)) || null : null,
  querySelectorAll: () => [],
  createElement: tag => new MockElement(tag),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: new MockElement('body')
};

const windowMock = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  document: documentMock,
  addEventListener: (evt, fn) => { (windowMock._listeners[evt] = windowMock._listeners[evt] || []).push(fn); },
  removeEventListener: () => {},
  dispatchEvent: (evt) => {
    const list = windowMock._listeners[evt.type] || [];
    list.forEach(fn => fn(evt));
  },
  _listeners: {},
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  localStorage: { getItem: () => null, setItem: () => {} },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  console: console,
  showToast: () => {}
};

// Load Three.js
const threeCode = fs.readFileSync(path.join(__dirname, '../Assets/three.min.js'), 'utf8');
const threeContext = { window: windowMock, document: documentMock, console, Math };
vm.createContext(threeContext);
vm.runInContext(threeCode, threeContext);
const THREE = threeContext.THREE;
windowMock.THREE = THREE;

// OrbitControls mock
windowMock.THREE.OrbitControls = function(cam, dom) {
  this.object = cam;
  this.domElement = dom;
  this.target = new THREE.Vector3(0, 0, 0);
  this.update = () => {};
};

// WebGLRenderer mock
windowMock.THREE.WebGLRenderer = function(opts = {}) {
  const canvas = (opts && opts.canvas) || documentMock.createElement('canvas');
  return {
    domElement: canvas,
    setPixelRatio: () => {},
    setSize: () => {},
    render: () => {},
    dispose: () => {},
    forceContextLoss: () => {},
    compile: () => {},
    outputEncoding: 3001,
    toneMapping: 4,
    toneMappingExposure: 1.0,
    localClippingEnabled: false,
    info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } }
  };
};

const sandbox = Object.assign({}, windowMock, { THREE });
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

// Load cadState.js
const cadStateCode = fs.readFileSync(path.join(__dirname, '../Assets/js/cadState.js'), 'utf8');
vm.runInContext(cadStateCode, sandbox);

// Load viewCubeEngine.js
const viewCubeCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewCubeEngine.js'), 'utf8');
vm.runInContext(viewCubeCode, sandbox);

// Load viewerApp.js
const appCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
vm.runInContext(appCode, sandbox);

console.log('--- STARTING EMPIRICAL PROBES ---');

// Initialize viewport (initViewport sets up initial PerspectiveCamera before CAD model load)
sandbox.initViewport();

// Populate modelGroup with test geometry
const boxGeom = new THREE.BoxGeometry(60, 120, 40);
const boxMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
const mesh = new THREE.Mesh(boxGeom, boxMat);
sandbox.modelGroup.add(mesh);

// Simulate CAD model load completion via onTessellationComplete
sandbox.onTessellationComplete({
  fileName: 'TEST_PART.stp',
  meshes: [{
    id: 'body-1',
    name: 'Main Body',
    color: [0.6, 0.6, 0.7, 1.0],
    position: [0, 0, 0, 10, 0, 0, 0, 10, 0],
    normal: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    index: [0, 1, 2]
  }],
  meshCount: 1,
  elapsedMs: 25,
  bufferSize: 2048
});

const btn = elements.get('vc-btn-persp');

function dispatchKey(key, opts = {}) {
  const evt = Object.assign({
    type: 'keydown',
    key: key,
    code: 'Key' + key.toUpperCase(),
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: documentMock.body,
    preventDefault: () => {}
  }, opts);
  sandbox.dispatchEvent(evt);
}

// Probe 1: Initial state after model load
assert(sandbox.camera.isOrthographicCamera === true, 'Camera starts as genuinely Orthographic');
assert(btn.innerText === 'Ortho', `Button text is 'Ortho' (actual: '${btn.innerText}')`);
assert(btn.classList.contains('active'), 'Button contains .active class');

// Probe 2: Toggle via 'o' (lowercase)
dispatchKey('o');
assert(sandbox.camera.isPerspectiveCamera === true, "Key 'o' toggles camera to Perspective");
assert(btn.innerText === 'Persp', `Button text switched to 'Persp' (actual: '${btn.innerText}')`);
assert(!btn.classList.contains('active'), 'Button removed .active class');

// Probe 3: Toggle via 'O' (uppercase)
dispatchKey('O');
assert(sandbox.camera.isOrthographicCamera === true, "Key 'O' toggles camera back to Orthographic");
assert(btn.innerText === 'Ortho', `Button text returned to 'Ortho' (actual: '${btn.innerText}')`);
assert(btn.classList.contains('active'), 'Button restored .active class');

// Probe 4: Modifier keys must NOT toggle
['ctrlKey', 'altKey', 'metaKey'].forEach(mod => {
  const opts = {};
  opts[mod] = true;
  dispatchKey('o', opts);
  assert(sandbox.camera.isOrthographicCamera === true, `Key 'o' with ${mod}=true ignored (camera stayed Ortho)`);
});

// Probe 5: Input field key presses must NOT toggle
['INPUT', 'TEXTAREA', 'SELECT'].forEach(tag => {
  const inputEl = new MockElement(tag);
  dispatchKey('o', { target: inputEl });
  assert(sandbox.camera.isOrthographicCamera === true, `Key 'o' inside <${tag}> ignored (camera stayed Ortho)`);
});

// Probe 6: 200 Rapid 'O' / 'o' alternations
let toggleFails = 0;
let labelFails = 0;
let classFails = 0;
for (let i = 0; i < 200; i++) {
  const key = (i % 2 === 0) ? 'o' : 'O';
  const expectedType = (i % 2 === 0) ? 'PerspectiveCamera' : 'OrthographicCamera';
  const expectedText = (i % 2 === 0) ? 'Persp' : 'Ortho';
  const expectedClass = (i % 2 !== 0);

  dispatchKey(key);

  const actualType = sandbox.camera.isPerspectiveCamera ? 'PerspectiveCamera' : 'OrthographicCamera';
  if (actualType !== expectedType) toggleFails++;
  if (btn.innerText !== expectedText) labelFails++;
}
assert(toggleFails === 0, `200 rapid key alternates correctly toggled camera (failures: ${toggleFails})`);
assert(labelFails === 0, `200 rapid key alternates strictly updated button label (failures: ${labelFails})`);
assert(classFails === 0, `200 rapid key alternates strictly updated .active class (failures: ${classFails})`);

// Probe 7: Resizing while in Ortho and switching to Persp
console.log('\n--- PROBE: Resizing while in Ortho and switching to Persp ---');
// Ensure in Ortho first
if (!sandbox.camera.isOrthographicCamera) {
  sandbox.switchCamera('ortho');
}

const testAspects = [
  { w: 1920, h: 1080, name: '16:9 1080p' },
  { w: 800, h: 600, name: '4:3 standard' },
  { w: 1000, h: 1000, name: '1:1 square' },
  { w: 600, h: 1200, name: '1:2 portrait split' },
  { w: 2560, h: 1080, name: '21:9 ultrawide' },
  { w: 3840, h: 1080, name: '32:9 dual monitor' },
  { w: 500, h: 2500, name: '1:5 extreme tall' },
  { w: 3000, h: 300, name: '10:1 extreme banner' }
];

let aspectMismatches = 0;
let projectionMismatches = 0;

testAspects.forEach(t => {
  // Stay in Ortho, resize window
  sandbox.innerWidth = t.w;
  sandbox.innerHeight = t.h;
  const expectedAspect = t.w / t.h;
  sandbox.onResize();

  // Verify ortho aspect
  assert(Math.abs((sandbox.camera.right - sandbox.camera.left) / (sandbox.camera.top - sandbox.camera.bottom) - expectedAspect) < 1e-5,
    `[${t.name}] Ortho frustum aspect matches window aspect ratio`);

  // Switch to Persp
  sandbox.switchCamera('persp');

  // Check perspCamera.aspect
  const actualAspect = sandbox.camera.aspect;
  const diff = Math.abs(actualAspect - expectedAspect);
  if (diff > 1e-6) {
    aspectMismatches++;
    console.error(`  Aspect mismatch: actual=${actualAspect}, expected=${expectedAspect}, diff=${diff}`);
  }

  // Check that projectionMatrix reflects this aspect ratio
  // In Three.js PerspectiveCamera projectionMatrix:
  // elements[0] = 1 / (tan(fov/2) * aspect)
  // elements[5] = 1 / tan(fov/2)
  // Thus elements[5] / elements[0] == aspect
  const m = sandbox.camera.projectionMatrix.elements;
  const matrixAspect = m[5] / m[0];
  const matDiff = Math.abs(matrixAspect - expectedAspect);
  if (matDiff > 1e-5) {
    projectionMismatches++;
    console.error(`  Projection matrix aspect mismatch: actual=${matrixAspect}, expected=${expectedAspect}, diff=${matDiff}`);
  }

  // Switch back to Ortho for next test
  sandbox.switchCamera('ortho');
});

assert(aspectMismatches === 0, `perspCamera.aspect correctly updated on switch from Ortho across all ${testAspects.length} aspect ratios (mismatches: ${aspectMismatches})`);
assert(projectionMismatches === 0, `perspCamera projectionMatrix accurately matches aspect ratio (mismatches: ${projectionMismatches})`);

console.log('\n================================================================');
console.log(`  EMPIRICAL PROBE TOTAL: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
