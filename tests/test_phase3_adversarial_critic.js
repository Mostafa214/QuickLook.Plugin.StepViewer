/**
 * ADVERSARIAL STRESS TEST HARNESS — Milestone 3 (Phase 3)
 * Teamwork Reviewer / Critic: Rigorous Challenge & Stress-Testing
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  CHALLENGER / CRITIC: Phase 3 Adversarial Stress Harness        ');
console.log('================================================================\n');

// 1. Build test environment with actual Three.js & OrbitControls
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

class DOMElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = new ClassList();
    if (className) className.trim().split(/\s+/).forEach(c => this.classList.add(c));
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this._innerText = '';
    this.width = 110;
    this.height = 110;
  }
  get innerText() { return this._innerText; }
  set innerText(v) { this._innerText = v; }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.width || 110, height: this.height || 110, right: 110, bottom: 110 };
  }
  getContext() {
    return {
      fillRect: () => {}, strokeRect: () => {}, fillText: () => {}, clearRect: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
      arc: () => {}, fill: () => {}, save: () => {}, restore: () => {},
      translate: () => {}, rotate: () => {}, scale: () => {},
      measureText: (txt) => ({ width: (txt || '').length * 8 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} })
    };
  }
  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) { this.childNodes.splice(idx, 1); child.parentNode = null; }
    return child;
  }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  click() {
    const handlers = this.listeners['click'] || [];
    const evt = { type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} };
    for (const h of handlers) h(evt);
  }
}

function buildSandbox() {
  const elements = new Map();
  function register(el) { if (el.id) elements.set(el.id, el); return el; }

  const doc = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new DOMElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const body = register(new DOMElement('body'));
  register(new DOMElement('div', 'canvas-container'));
  register(new DOMElement('canvas', 'triad-canvas'));
  const vcContainer = register(new DOMElement('div', 'viewcube-container'));
  const vcCanvas = register(new DOMElement('canvas', 'viewcube-canvas'));
  vcContainer.appendChild(vcCanvas);
  const vcBtnPersp = register(new DOMElement('button', 'vc-btn-persp', 'vc-mini-btn active'));
  vcContainer.appendChild(vcBtnPersp);
  const vcBtnHome = register(new DOMElement('button', 'vc-btn-home', 'vc-mini-btn'));
  vcContainer.appendChild(vcBtnHome);
  register(new DOMElement('div', 'hints-bar'));
  register(new DOMElement('div', 'status-text'));
  register(new DOMElement('button', 'btn-reset'));
  register(new DOMElement('button', 'btn-wireframe'));
  register(new DOMElement('div', 'toast-notify'));

  const toasts = [];
  const sandbox = {
    console,
    performance,
    document: doc,
    window: {
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      showToast: (m) => toasts.push(m),
      addEventListener: (evt, fn) => {
        if (!sandbox.window.listeners) sandbox.window.listeners = {};
        if (!sandbox.window.listeners[evt]) sandbox.window.listeners[evt] = [];
        sandbox.window.listeners[evt].push(fn);
      },
      removeEventListener: () => {},
      dispatchEvent: (evt) => {
        const hs = (sandbox.window.listeners && sandbox.window.listeners[evt.type]) || [];
        for (const h of hs) h(evt);
      }
    },
    toasts,
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout,
    clearTimeout
  };

  sandbox.window.document = doc;
  sandbox.global = sandbox;
  sandbox.self = sandbox.window;
  sandbox.globalThis = sandbox.window;
  global.document = doc;
  global.window = sandbox.window;

  const THREE = require(path.join(__dirname, '../Assets/three.min.js'));
  sandbox.THREE = THREE;
  sandbox.window.THREE = THREE;
  global.THREE = THREE;

  THREE.WebGLRenderer = function(opts = {}) {
    return {
      domElement: opts.canvas || doc.createElement('canvas'),
      setPixelRatio: () => {},
      setSize: () => {},
      render: () => {},
      dispose: () => {},
      forceContextLoss: () => {},
      outputEncoding: 3001,
      toneMapping: 4,
      toneMappingExposure: 1.0,
      localClippingEnabled: false,
      info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } }
    };
  };

  require(path.join(__dirname, '../Assets/OrbitControls.js'));
  vm.createContext(sandbox);

  const cadStateCode = fs.readFileSync(path.join(__dirname, '../Assets/js/cadState.js'), 'utf8');
  vm.runInContext(cadStateCode, sandbox);

  const viewCubeCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewCubeEngine.js'), 'utf8');
  vm.runInContext(viewCubeCode, sandbox);

  let viewerAppCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  viewerAppCode = viewerAppCode.replace(/if\s*\(document\.readyState\s*===\s*'loading'\)[\s\S]*?initViewport\(\);\s*\}/, '');
  vm.runInContext(viewerAppCode, sandbox);

  return { sandbox, elements, toasts };
}

let criticalCount = 0;
let passCount = 0;

function challengeAssert(condition, desc, errorDetail = '') {
  if (condition) {
    console.log(`  [PASS] ${desc}`);
    passCount++;
  } else {
    console.error(`  [CHALLENGE FAILED] ${desc}`);
    if (errorDetail) console.error(`    Details: ${errorDetail}`);
    criticalCount++;
  }
}

// =========================================================================
// CHALLENGE 1: Code Integrity & Anti-Cheating Verification
// =========================================================================
console.log('--- CHALLENGE 1: Code Integrity & Genuine Implementation Check ---');

const cadStateSrc = fs.readFileSync(path.join(__dirname, '../Assets/js/cadState.js'), 'utf8');
const viewCubeSrc = fs.readFileSync(path.join(__dirname, '../Assets/js/viewCubeEngine.js'), 'utf8');
const viewerAppSrc = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');

// Check for fake stubs or hardcoded bypasses
challengeAssert(
  !viewCubeSrc.includes('// dummy') && !viewerAppSrc.includes('// dummy'),
  'No dummy/facade implementations in viewCubeEngine.js or viewerApp.js'
);

challengeAssert(
  viewerAppSrc.includes('new THREE.OrthographicCamera(') &&
  viewerAppSrc.includes('new THREE.PerspectiveCamera('),
  'Genuine THREE.OrthographicCamera and THREE.PerspectiveCamera instantiations exist'
);

challengeAssert(
  viewCubeSrc.includes('cubeCamera.position.set(0, 0, 3.5).applyQuaternion(window.camera.quaternion)') &&
  viewCubeSrc.includes('cubeCamera.quaternion.copy(window.camera.quaternion)'),
  'Genuine quaternion orientation tracking used in ViewCube without lookAt polar singularity'
);

challengeAssert(
  viewerAppSrc.includes('window.camera = ') &&
  viewerAppSrc.includes('window.controls = ') &&
  viewerAppSrc.includes('window.renderer = ') &&
  viewerAppSrc.includes('window.scene = '),
  'All 4 global graphics handles exported to window'
);

// =========================================================================
// CHALLENGE 2: Rapid Multi-Cycle Reversibility with Diverse Zoom Levels
// =========================================================================
console.log('\n--- CHALLENGE 2: Multi-Cycle Camera Switching & Zoom Invariance ---');
const { sandbox } = buildSandbox();
const { window, THREE } = sandbox;
window.initViewport();

// Add a dummy CAD model to modelGroup
const geom = new THREE.CylinderGeometry(15, 15, 120, 32);
const mat = new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.34 });
const mesh = new THREE.Mesh(geom, mat);
window.modelGroup.add(mesh);

window.autoFitCamera();
const initialPos = window.camera.position.clone();
const initialTarget = window.controls.target.clone();

const testZooms = [0.1, 0.35, 1.0, 2.5, 7.8, 25.0];
let allZoomsPreserved = true;

testZooms.forEach(zoomFactor => {
  // 1. Perspective -> Ortho
  window.switchCamera('ortho');
  window.camera.zoom = zoomFactor;
  window.camera.updateProjectionMatrix();

  const orthoCam = window.camera;
  const H_ortho = (orthoCam.top - orthoCam.bottom) / orthoCam.zoom;

  // 2. Ortho -> Persp
  window.switchCamera('persp');
  const perspCam = window.camera;
  const d = perspCam.position.distanceTo(window.controls.target);
  const H_persp = 2 * d * Math.tan((perspCam.fov * Math.PI / 180) / 2);

  const diff = Math.abs(H_ortho - H_persp) / H_persp;
  if (diff > 0.0001 || isNaN(diff)) {
    allZoomsPreserved = false;
    console.error(`    Zoom=${zoomFactor} failed: H_ortho=${H_ortho}, H_persp=${H_persp}, diff=${diff}`);
  }
});

challengeAssert(allZoomsPreserved, 'Visible height H is preserved across all zoom factors (0.1x to 25x) with <0.01% error');

// =========================================================================
// CHALLENGE 3: Singularity & Boundary Conditions Stress Test
// =========================================================================
console.log('\n--- CHALLENGE 3: Singularities, Zero Distances, and Extreme Coordinates ---');

// Test 3.1: Zero distance (camera position == controls target)
window.switchCamera('persp');
window.camera.position.copy(window.controls.target); // d = 0
let switchZeroDistError = null;
try {
  window.switchCamera('ortho');
} catch (e) {
  switchZeroDistError = e;
}
challengeAssert(
  switchZeroDistError === null &&
  !isNaN(window.camera.top) && isFinite(window.camera.top) && window.camera.top > 0,
  'Camera switch survives d=0 singularity without throwing or generating NaN frustum'
);

// Test 3.2: Collinear direction in Ortho -> Persp
window.camera.position.set(0, 0, 0);
window.controls.target.set(0, 0, 0);
let collinearSwitchError = null;
try {
  window.switchCamera('persp');
} catch (e) {
  collinearSwitchError = e;
}
challengeAssert(
  collinearSwitchError === null &&
  !isNaN(window.camera.position.x) && isFinite(window.camera.position.z),
  'Ortho -> Persp survives zero direction vector fallback'
);

// Test 3.3: Extreme distance (d = 10,000,000)
window.controls.target.set(0, 0, 0);
window.camera.position.set(0, 0, 10000000);
window.camera.fov = 45;
window.switchCamera('ortho');
challengeAssert(
  isFinite(window.camera.top) && window.camera.top > 0 &&
  isFinite(window.camera.far) && window.camera.far >= 100000000,
  'Ortho camera establishes valid frustum and far plane at d=10,000,000'
);

// =========================================================================
// CHALLENGE 4: ViewCube Face Navigation in Orthographic Mode
// =========================================================================
console.log('\n--- CHALLENGE 4: ViewCube Face Navigation in Orthographic Mode ---');

window.switchCamera('ortho');
challengeAssert(window.camera.isOrthographicCamera === true, 'Camera is in Orthographic mode');

const testFaces = ['TOP', 'BOTTOM', 'FRONT', 'BACK', 'LEFT', 'RIGHT', 'ISO'];
let allFacesNavigated = true;

testFaces.forEach(face => {
  window.ViewCube.rotateToFace(face);
  // Allow simulated step or direct position
  const pos = window.camera.position;
  const up = window.camera.up;
  const isFinitePos = isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z);
  const isFiniteUp = isFinite(up.x) && isFinite(up.y) && isFinite(up.z);
  window.updateViewCube();

  if (!isFinitePos || !isFiniteUp) {
    allFacesNavigated = false;
    console.error(`    Face ${face} produced invalid coordinates: pos=(${pos.x},${pos.y},${pos.z}), up=(${up.x},${up.y},${up.z})`);
  }
});

challengeAssert(allFacesNavigated, 'All 7 ViewCube faces navigate cleanly in Orthographic mode with finite vectors');

// =========================================================================
// CHALLENGE 5: Extreme Aspect Ratio Resizes
// =========================================================================
console.log('\n--- CHALLENGE 5: Extreme Aspect Ratio Resizes ---');

const aspectScenarios = [
  { w: 5120, h: 1440, name: '32:9 Ultra-Wide' },
  { w: 1080, h: 1920, name: '9:16 Vertical Mobile' },
  { w: 100, h: 5000, name: 'Extreme Vertical Strip' },
  { w: 5000, h: 100, name: 'Extreme Horizontal Strip' },
  { w: 1, h: 1, name: '1x1 Minimized Viewport' }
];

let allResizesValid = true;
aspectScenarios.forEach(sc => {
  window.innerWidth = sc.w;
  window.innerHeight = sc.h;
  window.onResize();

  const left = window.camera.left;
  const right = window.camera.right;
  const top = window.camera.top;
  const bottom = window.camera.bottom;

  const valid = isFinite(left) && isFinite(right) && isFinite(top) && isFinite(bottom) &&
                (right > left) && (top > bottom);

  if (!valid) {
    allResizesValid = false;
    console.error(`    ${sc.name} failed: bounds=[${left}, ${right}, ${top}, ${bottom}]`);
  }
});

challengeAssert(allResizesValid, 'Ortho frustum bounds remain non-inverted and finite across extreme aspect ratios');

// =========================================================================
// CHALLENGE 6: Annotation Scaling Under Extreme Conditions
// =========================================================================
console.log('\n--- CHALLENGE 6: Annotation Scaling Under Extreme Ortho Conditions ---');

const testSprite = new THREE.Object3D();
testSprite.userData = { isScreenScaledSprite: true, pixelHeight: 40, aspect: 3.0 };
testSprite.position.set(0, 0, 0);
window.measureGroup.add(testSprite);

// Test with tiny zoom (0.01)
window.camera.zoom = 0.01;
window.updateScreenSpaceAnnotations();
const scaleZoomOut = testSprite.scale.x;

// Test with huge zoom (100.0)
window.camera.zoom = 100.0;
window.updateScreenSpaceAnnotations();
const scaleZoomIn = testSprite.scale.x;

challengeAssert(
  isFinite(scaleZoomOut) && scaleZoomOut > 0 &&
  isFinite(scaleZoomIn) && scaleZoomIn > 0 &&
  scaleZoomOut > scaleZoomIn,
  'Screen-space annotations scale inversely with camera.zoom to preserve screen pixels'
);

// =========================================================================
// FINAL VERDICT
// =========================================================================
console.log('\n================================================================');
console.log(`  ADVERSARIAL STRESS TEST SUMMARY: ${passCount} PASSED, ${criticalCount} FAILED`);
console.log('================================================================\n');

if (criticalCount > 0) {
  console.error('VERDICT: REQUEST_CHANGES — Adversarial vulnerabilities identified.');
  process.exit(1);
} else {
  console.log('VERDICT: APPROVE — Phase 3 implementation survived all stress challenges.');
  process.exit(0);
}
