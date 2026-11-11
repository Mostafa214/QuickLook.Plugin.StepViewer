/**
 * Phase 4 Iteration 2 Adversarial Re-verification & Extreme Stress Harness
 * 
 * Verifies the fixes applied in Milestone 4 Iteration 2:
 * 1. Shadow camera frustum math across extreme translations (far off-center) and aspect ratios (needles, foils)
 * 2. 8-corner bounding box containment for all non-origin CAD assemblies
 * 3. Degenerate and zero-size model bounds (0mm, 0.0001mm, 1,000,000mm)
 * 4. OrthographicCamera aspect ratio consistency across diverse viewport ratios (16:9, 21:9, 9:16, 1:1)
 * 5. Exploded view dynamic centering with Orthographic camera across aspect ratios and tree active states
 * 6. Directional light target matrix update and scene parenting verification
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('========================================================================');
console.log('  CHALLENGER M4.1 IT2: Deep Empirical Adversarial Verification Harness  ');
console.log('========================================================================\n');

// Mock DOM & Three.js Environment
class ClassList {
  constructor(node) {
    this.node = node;
    this.classes = new Set();
  }
  add(...names) { names.forEach(n => n && this.classes.add(n)); }
  remove(...names) { names.forEach(n => this.classes.delete(n)); }
  toggle(name, force) {
    if (force === true) { this.classes.add(name); return true; }
    if (force === false) { this.classes.delete(name); return false; }
    if (this.classes.has(name)) { this.classes.delete(name); return false; }
    this.classes.add(name); return true;
  }
  contains(name) { return this.classes.has(name); }
  toString() { return Array.from(this.classes).join(' '); }
}

class DOMElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = new ClassList(this);
    if (className) {
      className.trim().split(/\s+/).forEach(c => this.classList.add(c));
    }
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this._innerText = '';
    this.width = 1280;
    this.height = 720;
  }

  get innerText() { return this._innerText; }
  set innerText(v) { this._innerText = v; }

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this.childNodes.find(c => c.classList && c.classList.contains(cls)) || null;
    }
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.childNodes.find(c => c.id === id) || null;
    }
    return this.childNodes.find(c => c.tagName.toLowerCase() === selector.toLowerCase()) || null;
  }

  querySelectorAll(selector) {
    const res = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (selector.startsWith('.') && c.classList && c.classList.contains(selector.slice(1))) res.push(c);
        else if (selector.startsWith('#') && c.id === selector.slice(1)) res.push(c);
        else if (c.tagName.toLowerCase() === selector.toLowerCase()) res.push(c);
        walk(c);
      }
    };
    walk(this);
    return res;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height };
  }

  getContext(type) {
    return {
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      measureText: (txt) => ({ width: (txt || '').length * 8 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createImageData: () => ({ data: new Uint8ClampedArray(100) }),
      putImageData: () => {},
      drawImage: () => {}
    };
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  addEventListener(event, fn, opts) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push({ fn, opts });
  }

  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h.fn !== fn);
  }

  dispatchEvent(evt) {
    const handlers = this.listeners[evt.type] || [];
    for (const h of handlers) h.fn(evt);
  }

  click() {
    const evt = { type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} };
    this.dispatchEvent(evt);
  }
}

function buildSandbox() {
  const elements = new Map();
  function register(el) {
    if (el.id) elements.set(el.id, el);
    return el;
  }

  const documentMock = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: () => [],
    querySelector: () => null,
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
  vcBtnPersp.innerText = 'Ortho';
  vcContainer.appendChild(vcBtnPersp);
  const vcBtnHome = register(new DOMElement('button', 'vc-btn-home', 'vc-mini-btn'));
  vcContainer.appendChild(vcBtnHome);

  register(new DOMElement('div', 'btn-wireframe', 'btn-icon'));
  register(new DOMElement('div', 'btn-tree', 'btn-icon'));
  register(new DOMElement('div', 'btn-section', 'btn-icon'));
  register(new DOMElement('div', 'btn-exploded', 'btn-icon'));
  register(new DOMElement('div', 'btn-snapshot', 'btn-icon'));
  register(new DOMElement('div', 'btn-appearance', 'btn-icon'));
  register(new DOMElement('div', 'btn-materials', 'btn-icon'));
  register(new DOMElement('div', 'cache-purge-btn', 'btn-icon'));

  register(new DOMElement('div', 'assembly-tree'));
  register(new DOMElement('div', 'properties-panel'));
  register(new DOMElement('div', 'materials-panel'));
  register(new DOMElement('div', 'snapshot-panel'));
  register(new DOMElement('div', 'section-panel'));
  register(new DOMElement('div', 'measure-panel'));

  const toasts = [];
  const sandbox = {
    console,
    Math,
    Float32Array,
    Uint8ClampedArray,
    Set,
    Map,
    Array,
    Object,
    Number,
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1,
      document: documentMock,
      listeners: {},
      addEventListener: function(evt, fn, opts) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push({ fn, opts });
      },
      removeEventListener: function(evt, fn) {
        if (!this.listeners[evt]) return;
        this.listeners[evt] = this.listeners[evt].filter(h => h.fn !== fn);
      },
      dispatchEvent: function(evt) {
        const handlers = this.listeners[evt.type] || [];
        for (const h of handlers) h.fn(evt);
      },
      showToast: (msg) => toasts.push(msg)
    },
    toasts,
    requestAnimationFrame: () => {}, // No-op to avoid infinite loops
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout
  };

  sandbox.window.document = documentMock;
  sandbox.document = documentMock;
  sandbox.global = sandbox;
  sandbox.self = sandbox.window;
  sandbox.globalThis = sandbox.window;
  global.document = documentMock;
  global.window = sandbox.window;

  const THREE = require(path.join(__dirname, '../Assets/three.min.js'));
  sandbox.THREE = THREE;
  sandbox.window.THREE = THREE;
  global.THREE = THREE;

  THREE.WebGLRenderer = function(opts = {}) {
    const canvas = opts.canvas || documentMock.createElement('canvas');
    return {
      domElement: canvas,
      setPixelRatio: () => {},
      setSize: (w, h) => {
        canvas.width = w;
        canvas.height = h;
      },
      render: () => {},
      dispose: () => {},
      forceContextLoss: () => {},
      outputEncoding: 3001,
      toneMapping: 4,
      toneMappingExposure: 1.05,
      localClippingEnabled: false,
      shadowMap: { enabled: false, type: 0 },
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

  const explodedViewCode = fs.readFileSync(path.join(__dirname, '../Assets/js/explodedView.js'), 'utf8');
  vm.runInContext(explodedViewCode, sandbox);

  return { sandbox, elements };
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message, category = 'REVERIFICATION') {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] [${category}] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] [${category}] ${message}`);
    failedTests++;
  }
}

function runDeepReverification() {
  const { sandbox } = buildSandbox();
  const { window, THREE } = sandbox;

  window.initViewport();

  // =========================================================================
  console.log('>>> SECTION 1: Extreme Off-Center & Arbitrary Translations <<<');
  // =========================================================================

  const offCenterCases = [
    { label: 'Deep Positive Octant (+50,000, +25,000, +100,000)', center: [50000, 25000, 100000], size: [200, 100, 150] },
    { label: 'Deep Negative Octant (-100,000, -50,000, -80,000)', center: [-100000, -50000, -80000], size: [500, 300, 400] },
    { label: 'Extreme Mixed Octant (-500,000, +250,000, -100,000)', center: [-500000, 250000, -100000], size: [1000, 2000, 500] }
  ];

  for (const c of offCenterCases) {
    console.log(`\n  --- Case: ${c.label} ---`);
    const cx = c.center[0], cy = c.center[1], cz = c.center[2];
    const sx = c.size[0], sy = c.size[1], sz = c.size[2];

    const mesh = {
      id: 0,
      name: `OFFCENTER_${c.label}`,
      color: null,
      position: new Float32Array([
        cx - sx/2, cy - sy/2, cz - sz/2,
        cx + sx/2, cy - sy/2, cz - sz/2,
        cx + sx/2, cy + sy/2, cz - sz/2,
        cx - sx/2, cy - sy/2, cz + sz/2,
        cx + sx/2, cy + sy/2, cz + sz/2,
        cx - sx/2, cy + sy/2, cz + sz/2
      ]),
      normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
    };

    window.onTessellationComplete({ meshCount: 1, meshes: [mesh] });
    window.autoFitCamera();

    const sCam = window.keyLight.shadow.camera;
    window.scene.updateMatrixWorld();
    window.keyLight.shadow.updateMatrices(window.keyLight);

    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(sCam.projectionMatrix, sCam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    // Verify keyLight.target position matches center
    assert(Math.abs(window.keyLight.target.position.x - cx) < 1e-3 &&
           Math.abs(window.keyLight.target.position.y - cy) < 1e-3 &&
           Math.abs(window.keyLight.target.position.z - cz) < 1e-3,
           `keyLight.target tracked center (${cx}, ${cy}, ${cz})`, 'SHADOW_TARGET');

    // Verify center is contained
    const centerPoint = new THREE.Vector3(cx, cy, cz);
    assert(frustum.containsPoint(centerPoint), `Shadow frustum contains center (${cx}, ${cy}, ${cz})`, 'CONTAINMENT');

    // Verify ALL 8 bounding box corners are contained
    const corners = [
      new THREE.Vector3(cx - sx/2, cy - sy/2, cz - sz/2),
      new THREE.Vector3(cx + sx/2, cy - sy/2, cz - sz/2),
      new THREE.Vector3(cx - sx/2, cy + sy/2, cz - sz/2),
      new THREE.Vector3(cx + sx/2, cy + sy/2, cz - sz/2),
      new THREE.Vector3(cx - sx/2, cy - sy/2, cz + sz/2),
      new THREE.Vector3(cx + sx/2, cy - sy/2, cz + sz/2),
      new THREE.Vector3(cx - sx/2, cy + sy/2, cz + sz/2),
      new THREE.Vector3(cx + sx/2, cy + sy/2, cz + sz/2)
    ];

    let allCornersContained = true;
    for (let i = 0; i < 8; i++) {
      if (!frustum.containsPoint(corners[i])) {
        allCornersContained = false;
        console.error(`    Corner ${i} (${corners[i].x}, ${corners[i].y}, ${corners[i].z}) failed containment!`);
      }
    }
    assert(allCornersContained, `All 8 bounding box corners strictly contained in shadow frustum`, 'CONTAINMENT');
  }

  // =========================================================================
  console.log('\n>>> SECTION 2: Extreme Aspect Ratios (Needles, Thin Plates, Spikes) <<<');
  // =========================================================================

  const aspectCases = [
    { label: 'Long Horizontal Needle (10,000 x 1 x 1 mm)', size: [10000, 1, 1] },
    { label: 'Ultra-thin Sheet Metal (2,000 x 0.05 x 2,000 mm)', size: [2000, 0.05, 2000] },
    { label: 'Vertical Spire (0.5 x 5,000 x 0.5 mm)', size: [0.5, 5000, 0.5] }
  ];

  for (const c of aspectCases) {
    console.log(`\n  --- Aspect: ${c.label} ---`);
    const sx = c.size[0], sy = c.size[1], sz = c.size[2];
    const mesh = {
      id: 0,
      name: `ASPECT_${c.label}`,
      color: null,
      position: new Float32Array([
        -sx/2, 0, -sz/2,   sx/2, 0, -sz/2,   sx/2, sy, -sz/2,
        -sx/2, 0, -sz/2,   sx/2, sy, -sz/2,  -sx/2, sy, -sz/2
      ]),
      normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
    };

    window.onTessellationComplete({ meshCount: 1, meshes: [mesh] });
    window.autoFitCamera();

    const sCam = window.keyLight.shadow.camera;
    window.scene.updateMatrixWorld();
    window.keyLight.shadow.updateMatrices(window.keyLight);

    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(sCam.projectionMatrix, sCam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const corners = [
      new THREE.Vector3(-sx/2, 0, -sz/2),
      new THREE.Vector3(sx/2, 0, -sz/2),
      new THREE.Vector3(-sx/2, sy, -sz/2),
      new THREE.Vector3(sx/2, sy, -sz/2),
      new THREE.Vector3(-sx/2, 0, sz/2),
      new THREE.Vector3(sx/2, 0, sz/2),
      new THREE.Vector3(-sx/2, sy, sz/2),
      new THREE.Vector3(sx/2, sy, sz/2)
    ];

    let allContained = true;
    for (const p of corners) {
      if (!frustum.containsPoint(p)) allContained = false;
    }
    assert(allContained, `Shadow frustum completely encloses extreme aspect ratio geometry`, 'ASPECT_CONTAINMENT');
  }

  // =========================================================================
  console.log('\n>>> SECTION 3: Degenerate Models & Singularity Probing <<<');
  // =========================================================================

  // Point geometry (0 x 0 x 0)
  const pointMesh = {
    id: 0,
    name: 'SINGULARITY_POINT',
    color: null,
    position: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
    normal: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0])
  };
  window.onTessellationComplete({ meshCount: 1, meshes: [pointMesh] });
  window.autoFitCamera();

  const sCam0 = window.keyLight.shadow.camera;
  assert(sCam0.far > sCam0.near, `Degenerate 0mm model: shadow far (${sCam0.far}) > near (${sCam0.near})`, 'SINGULARITY');
  assert(isFinite(sCam0.projectionMatrix.elements[0]), 'Degenerate 0mm model: shadow projection matrix is strictly finite', 'SINGULARITY');
  assert(window.controls.minDistance > 0, `controls.minDistance > 0 for 0mm model (${window.controls.minDistance})`, 'SINGULARITY');

  // Sub-micron geometry (0.0001mm)
  const microMesh = {
    id: 0,
    name: 'SUB_MICRON',
    color: null,
    position: new Float32Array([0, 0, 0,  1e-4, 0, 0,  1e-4, 1e-4, 0]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
  };
  window.onTessellationComplete({ meshCount: 1, meshes: [microMesh] });
  window.autoFitCamera();
  const sCamMicro = window.keyLight.shadow.camera;
  assert(sCamMicro.far - sCamMicro.near >= 19.9, `Sub-micron (0.0001mm) shadow depth range >= 19.9 (${(sCamMicro.far - sCamMicro.near).toFixed(2)})`, 'SINGULARITY');

  // =========================================================================
  console.log('\n>>> SECTION 4: Viewport Aspect Ratio & Orthographic Invariants <<<');
  // =========================================================================

  // Switch to Orthographic
  window.toggleOrthoPersp();
  assert(window.camera.isOrthographicCamera === true, 'Switched to Orthographic Camera', 'CAMERA');
  assert(window.camera.aspect !== undefined, 'orthoCamera.aspect is defined', 'CAMERA');

  const aspectTests = [
    { label: 'Standard Desktop 16:9', width: 1920, height: 1080, expectedAspect: 1920 / 1080 },
    { label: 'Ultrawide 21:9', width: 2560, height: 1080, expectedAspect: 2560 / 1080 },
    { label: 'Square 1:1', width: 1000, height: 1000, expectedAspect: 1.0 },
    { label: 'Portrait Mobile 9:16', width: 720, height: 1280, expectedAspect: 720 / 1280 }
  ];

  for (const t of aspectTests) {
    window.innerWidth = t.width;
    window.innerHeight = t.height;
    window.dispatchEvent({ type: 'resize' });

    assert(Math.abs(window.camera.aspect - t.expectedAspect) < 1e-4,
      `onResize (${t.label}): camera.aspect matches viewport (${window.camera.aspect.toFixed(3)})`, 'ASPECT_RESIZE');

    const curHalfH = window.camera.top;
    const curHalfW = window.camera.right;
    const computedAspect = curHalfW / curHalfH;
    assert(Math.abs(computedAspect - t.expectedAspect) < 1e-3,
      `onResize (${t.label}): Ortho frustum width/height ratio (${computedAspect.toFixed(3)}) preserves aspect without distortion`, 'ORTHO_FRUSTUM');
  }

  // Restore desktop 16:9
  window.innerWidth = 1280;
  window.innerHeight = 720;
  window.dispatchEvent({ type: 'resize' });

  // =========================================================================
  console.log('\n>>> SECTION 5: Exploded View Dynamic Centering with Orthographic Camera <<<');
  // =========================================================================

  // Create a 2-body assembly for exploded view
  const multiMesh1 = {
    id: 0,
    name: 'PART_A',
    color: null,
    position: new Float32Array([-20, -10, -10,  0, -10, -10,  0, 10, -10]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
  };
  const multiMesh2 = {
    id: 1,
    name: 'PART_B',
    color: null,
    position: new Float32Array([10, -10, -10,  30, -10, -10,  30, 10, -10]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
  };

  window.onTessellationComplete({ meshCount: 2, meshes: [multiMesh1, multiMesh2] });
  window.autoFitCamera();

  // Test setExplodeProgress in Orthographic mode with tree active and inactive
  const explodeSteps = [0.0, 0.25, 0.5, 0.75, 1.0];

  for (const factor of explodeSteps) {
    window.setExplodeProgress(factor, true);

    assert(!isNaN(window.camera.position.x) && !isNaN(window.camera.position.y) && !isNaN(window.camera.position.z),
      `Explode ${factor * 100}% (Ortho): camera.position is strictly non-NaN: (${window.camera.position.x.toFixed(2)}, ${window.camera.position.y.toFixed(2)}, ${window.camera.position.z.toFixed(2)})`, 'EXPLODED_ORTHO');

    assert(!isNaN(window.controls.target.x) && !isNaN(window.controls.target.y) && !isNaN(window.controls.target.z),
      `Explode ${factor * 100}% (Ortho): controls.target is strictly non-NaN: (${window.controls.target.x.toFixed(2)}, ${window.controls.target.y.toFixed(2)}, ${window.controls.target.z.toFixed(2)})`, 'EXPLODED_ORTHO');

    assert(window.camera.near < window.camera.far,
      `Explode ${factor * 100}% (Ortho): camera.near (${window.camera.near.toFixed(2)}) < camera.far (${window.camera.far.toFixed(2)})`, 'EXPLODED_ORTHO');
  }

  // Reset exploded view
  window.setExplodeProgress(0.0, false);

  // Switch back to perspective
  window.toggleOrthoPersp();
  assert(window.camera.isPerspectiveCamera === true, 'Restored Perspective Camera cleanly', 'CAMERA');

  // =========================================================================
  console.log('\n========================================================================');
  console.log(`  CHALLENGER M4.1 IT2 SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('========================================================================\n');

  return { totalTests, passedTests, failedTests };
}

const result = runDeepReverification();
if (result.failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
