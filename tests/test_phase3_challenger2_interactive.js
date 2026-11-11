/**
 * Phase 3 Adversarial Verification & Interactive Stress Harness (Challenger 2)
 *
 * Focus Areas:
 * 1. Rapid Camera Projection Cycling (2,000 iterations):
 *    - 2,000 rapid chaotic toggleOrthoPersp() calls interspersed with controls.update(),
 *      onResize(), autoFitCamera(), and updateViewCube().
 *    - Verification of 100% lockstep (window.camera === controls.object), zero reference leaks,
 *      and DOM element (#vc-btn-persp) integrity.
 * 2. Viewport Dynamic Resizing Invariant (500 iterations):
 *    - 500 random window resizes (from 100x100 to 7680x4320, ultra-wide and ultra-tall).
 *    - Orthographic frustum aspect ratio strictly matches innerWidth / innerHeight without stretching.
 * 3. Trackpad / Wheel Zoom Invariant (1,000 iterations):
 *    - 1,000 zoom operations across Perspective (dolly) and Orthographic (camera.zoom).
 *    - Safe clamping, non-inversion (zoom > 0), no division-by-zero or NaN matrix elements.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  CHALLENGER 2: Milestone 3 Interactive & Projection Stress Harness ');
console.log('================================================================\n');

// Deterministic Pseudo-Random Number Generator (Linear Congruential Generator)
class SeededPRNG {
  constructor(seed = 123456789) {
    this.m = 0x80000000; // 2**31
    this.a = 1103515245;
    this.c = 12345;
    this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
  }
  nextFloat() {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state / (this.m - 1);
  }
  nextInt(min, max) {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }
  pick(arr) {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

const rng = new SeededPRNG(424242);

// Mock DOM & WebGL Environment
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
    this.width = 110;
    this.height = 110;
  }

  get innerText() { return this._innerText; }
  set innerText(v) { this._innerText = v; }

  getBoundingClientRect() {
    return {
      left: 10,
      top: 10,
      width: this.width || 110,
      height: this.height || 110,
      right: (this.width || 110) + 10,
      bottom: (this.height || 110) + 10
    };
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

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h !== fn);
  }

  click() {
    const handlers = this.listeners['click'] || [];
    const evt = { type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} };
    for (const h of handlers) h(evt);
  }
}

function buildTestHarness() {
  const elements = new Map();
  function register(el) {
    if (el.id) elements.set(el.id, el);
    return el;
  }

  const documentMock = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new DOMElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const body = register(new DOMElement('body'));
  const canvasContainer = register(new DOMElement('div', 'canvas-container'));
  body.appendChild(canvasContainer);
  const triadCanvas = register(new DOMElement('canvas', 'triad-canvas'));
  body.appendChild(triadCanvas);
  const viewcubeContainer = register(new DOMElement('div', 'viewcube-container'));
  body.appendChild(viewcubeContainer);
  const viewcubeCanvas = register(new DOMElement('canvas', 'viewcube-canvas'));
  viewcubeCanvas.width = 110;
  viewcubeCanvas.height = 110;
  viewcubeContainer.appendChild(viewcubeCanvas);

  const vcBtnPersp = register(new DOMElement('button', 'vc-btn-persp', 'vc-mini-btn active'));
  vcBtnPersp.innerText = 'Ortho';
  viewcubeContainer.appendChild(vcBtnPersp);

  const vcBtnHome = register(new DOMElement('button', 'vc-btn-home', 'vc-mini-btn'));
  viewcubeContainer.appendChild(vcBtnHome);

  const hintsBar = register(new DOMElement('div', 'hints-bar'));
  body.appendChild(hintsBar);
  const inspectorDrawer = register(new DOMElement('div', 'inspector-drawer'));
  body.appendChild(inspectorDrawer);
  const statusText = register(new DOMElement('div', 'status-text'));
  body.appendChild(statusText);
  const toastNotify = register(new DOMElement('div', 'toast-notify'));
  body.appendChild(toastNotify);

  const toasts = [];
  const sandbox = {
    console,
    performance,
    document: documentMock,
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1,
      onToastMessage: (msg) => toasts.push(msg),
      addEventListener: (evt, fn) => {
        if (!sandbox.window.listeners) sandbox.window.listeners = {};
        if (!sandbox.window.listeners[evt]) sandbox.window.listeners[evt] = [];
        sandbox.window.listeners[evt].push(fn);
      },
      removeEventListener: () => {},
      dispatchEvent: (evt) => {
        const handlers = (sandbox.window.listeners && sandbox.window.listeners[evt.type]) || [];
        for (const h of handlers) h(evt);
      },
      showToast: (msg) => toasts.push(msg)
    },
    toasts,
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout,
    clearTimeout
  };

  sandbox.window.document = documentMock;
  sandbox.global = sandbox;
  sandbox.self = sandbox.window;
  sandbox.globalThis = sandbox.window;
  global.document = documentMock;
  global.window = sandbox.window;

  // Load Three.js
  const THREE = require(path.join(__dirname, '../Assets/three.min.js'));
  sandbox.THREE = THREE;
  sandbox.window.THREE = THREE;
  global.THREE = THREE;

  // WebGLRenderer mock
  THREE.WebGLRenderer = function(opts = {}) {
    const canvas = opts.canvas || documentMock.createElement('canvas');
    return {
      domElement: canvas,
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

  // Load OrbitControls
  require(path.join(__dirname, '../Assets/OrbitControls.js'));

  vm.createContext(sandbox);

  // Load cadState.js
  const cadStateCode = fs.readFileSync(path.join(__dirname, '../Assets/js/cadState.js'), 'utf8');
  vm.runInContext(cadStateCode, sandbox);

  // Load viewCubeEngine.js
  const viewCubeCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewCubeEngine.js'), 'utf8');
  vm.runInContext(viewCubeCode, sandbox);

  // Load viewerApp.js without automatic loading trigger
  let viewerAppCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  viewerAppCode = viewerAppCode.replace(/if\s*\(document\.readyState\s*===\s*'loading'\)[\s\S]*?initViewport\(\);\s*\}/, '');
  vm.runInContext(viewerAppCode, sandbox);

  return { sandbox, elements, toasts };
}

let totalAssertionsPassed = 0;
let totalAssertionsFailed = 0;

function assert(cond, msg) {
  if (cond) {
    totalAssertionsPassed++;
  } else {
    totalAssertionsFailed++;
    console.error(`  [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function verifyProjectionMatrixFinite(camera, label) {
  const elements = camera.projectionMatrix.elements;
  for (let i = 0; i < 16; i++) {
    const val = elements[i];
    if (isNaN(val) || !isFinite(val)) {
      return { ok: false, index: i, val };
    }
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------
// TEST SUITE EXECUTION
// -----------------------------------------------------------------------------
function runChallenger2Suite() {
  const { sandbox, elements } = buildTestHarness();
  const { window, THREE } = sandbox;

  // Initialize Viewport and ViewCube
  window.initViewport();

  // Populate CAD modelGroup with realistic geometry
  const boxGeom = new THREE.BoxGeometry(60, 120, 40);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
  const modelMesh = new THREE.Mesh(boxGeom, boxMat);
  window.modelGroup.add(modelMesh);
  window.autoFitCamera();

  const vcBtnPersp = elements.get('vc-btn-persp');

  // ===========================================================================
  // SECTION 1: RAPID CAMERA PROJECTION CYCLING (2,000 ITERATIONS)
  // ===========================================================================
  console.log('--- SECTION 1: Rapid Camera Projection Cycling (2,000 Iterations) ---');

  const initialPerspCam = window.camera;
  let seenPerspInstances = new Set();
  let seenOrthoInstances = new Set();
  seenPerspInstances.add(initialPerspCam);

  let lockstepViolations = 0;
  let domCorruptionCount = 0;
  let matrixNanCount = 0;

  for (let i = 1; i <= 2000; i++) {
    const actionRoll = rng.nextFloat();

    // Chaotic choice of operation
    if (actionRoll < 0.70) {
      window.toggleOrthoPersp();
    } else if (actionRoll < 0.85) {
      window.switchCamera(rng.nextFloat() > 0.5 ? 'ortho' : 'persp');
    } else {
      // Direct button click simulation
      vcBtnPersp.click();
    }

    // Interspersals
    const intersperseRoll = rng.nextFloat();
    if (intersperseRoll < 0.35) {
      window.controls.update();
    } else if (intersperseRoll < 0.55) {
      window.innerWidth = rng.nextInt(320, 3840);
      window.innerHeight = rng.nextInt(240, 2160);
      window.onResize();
    } else if (intersperseRoll < 0.70) {
      window.autoFitCamera();
    } else if (intersperseRoll < 0.85) {
      window.updateViewCube();
    } else {
      // Perturb orbit position slightly
      window.camera.position.x += rng.nextFloat() * 2 - 1;
      window.camera.position.y += rng.nextFloat() * 2 - 1;
      window.camera.position.z += rng.nextFloat() * 2 - 1;
      window.controls.update();
    }

    const currentCam = window.camera;
    const currentControlsObj = window.controls.object;

    // Invariant 1: window.camera and controls.object in 100% lockstep
    if (currentCam !== currentControlsObj) {
      lockstepViolations++;
    }

    // Track instance reuse (memory leak check)
    if (currentCam.isPerspectiveCamera) {
      seenPerspInstances.add(currentCam);
      // DOM Invariant for Perspective:
      if (vcBtnPersp.innerText !== 'Persp' || vcBtnPersp.classList.contains('active')) {
        domCorruptionCount++;
      }
    } else if (currentCam.isOrthographicCamera) {
      seenOrthoInstances.add(currentCam);
      // DOM Invariant for Orthographic:
      if (vcBtnPersp.innerText !== 'Ortho' || !vcBtnPersp.classList.contains('active')) {
        domCorruptionCount++;
      }
    }

    // Matrix Finite Invariant
    const matrixCheck = verifyProjectionMatrixFinite(currentCam, `Cycle ${i}`);
    if (!matrixCheck.ok) {
      matrixNanCount++;
    }

    // Position & Target Finite Invariant
    if (isNaN(currentCam.position.x) || isNaN(window.controls.target.x)) {
      matrixNanCount++;
    }
  }

  assert(lockstepViolations === 0, `Lockstep violations must be 0 (Actual: ${lockstepViolations})`);
  assert(domCorruptionCount === 0, `DOM state corruption on #vc-btn-persp must be 0 (Actual: ${domCorruptionCount})`);
  assert(matrixNanCount === 0, `Matrix NaN / infinite elements must be 0 (Actual: ${matrixNanCount})`);

  // Memory Leak Check: only 1 PerspectiveCamera and 1 OrthographicCamera instances should exist and be reused
  assert(seenPerspInstances.size === 1, `Perspective camera instance must be reused (Created: ${seenPerspInstances.size})`);
  assert(seenOrthoInstances.size === 1, `Orthographic camera instance must be reused (Created: ${seenOrthoInstances.size})`);

  console.log(`  ✓ Completed 2,000 rapid chaotic cycles:`);
  console.log(`    - Lockstep Violations: 0 / 2000`);
  console.log(`    - DOM State Corruptions: 0 / 2000`);
  console.log(`    - Matrix / Position NaNs: 0 / 2000`);
  console.log(`    - Unique Perspective Instances Reused: ${seenPerspInstances.size}`);
  console.log(`    - Unique Orthographic Instances Reused: ${seenOrthoInstances.size}`);

  // ===========================================================================
  // SECTION 2: VIEWPORT DYNAMIC RESIZING INVARIANT (500 ITERATIONS)
  // ===========================================================================
  console.log('\n--- SECTION 2: Viewport Dynamic Resizing Invariant (500 Iterations) ---');

  let aspectDiscrepancies = 0;
  let maxAspectDiscrepancy = 0;
  let resizeNanCount = 0;

  // Generate 500 test resolutions
  const testResolutions = [];

  // Group A: 100 random sizes across standard desktop / multi-monitor (100x100 to 7680x4320)
  for (let i = 0; i < 100; i++) {
    testResolutions.push({ w: rng.nextInt(100, 7680), h: rng.nextInt(100, 4320), desc: 'Random Range' });
  }

  // Group B: 100 extreme ultra-wide ratios (W/H >= 4.0 up to 38.4)
  for (let i = 0; i < 100; i++) {
    const h = rng.nextInt(100, 600);
    const w = rng.nextInt(h * 4, 7680);
    testResolutions.push({ w, h, desc: 'Ultra-Wide' });
  }

  // Group C: 100 extreme ultra-tall ratios (H/W >= 4.0 up to 43.2)
  for (let i = 0; i < 100; i++) {
    const w = rng.nextInt(100, 600);
    const h = rng.nextInt(w * 4, 7680);
    testResolutions.push({ w, h, desc: 'Ultra-Tall' });
  }

  // Group D: 100 standard and precision engineering aspect ratios
  const standardAspects = [
    { w: 1920, h: 1080 }, // 16:9
    { w: 1920, h: 1200 }, // 16:10
    { w: 2560, h: 1440 }, // 16:9 QHD
    { w: 3840, h: 2160 }, // 4K UHD
    { w: 7680, h: 4320 }, // 8K FUHD
    { w: 3440, h: 1440 }, // 21:9 Ultrawide
    { w: 5120, h: 1440 }, // 32:9 Super Ultrawide
    { w: 1024, h: 768 },  // 4:3 Legacy
    { w: 1280, h: 1024 }, // 5:4 CAD Classic
    { w: 1000, h: 1000 }, // 1:1 Square
    { w: 1080, h: 1920 }, // 9:16 Vertical Pivot
    { w: 1440, h: 2560 }  // 9:16 Vertical QHD
  ];
  for (let i = 0; i < 100; i++) {
    testResolutions.push(rng.pick(standardAspects));
  }

  // Group E: 100 boundary & extreme prime/odd dimensions
  const boundaryPrimes = [
    { w: 100, h: 100 },
    { w: 101, h: 103 },
    { w: 1927, h: 1087 },
    { w: 3847, h: 2161 },
    { w: 7673, h: 4319 },
    { w: 137, h: 4327 },
    { w: 7681, h: 139 }
  ];
  for (let i = 0; i < 100; i++) {
    testResolutions.push(rng.pick(boundaryPrimes));
  }

  // Ensure camera is in Orthographic mode for the first pass
  window.switchCamera('ortho');

  for (let i = 0; i < testResolutions.length; i++) {
    const res = testResolutions[i];
    window.innerWidth = res.w;
    window.innerHeight = res.h;
    window.onResize();

    const expectedAspect = res.w / res.h;

    // Check Orthographic Frustum Aspect Invariant:
    // (right - left) / (top - bottom) === expectedAspect
    const orthoCam = window.camera;
    const frustumW = orthoCam.right - orthoCam.left;
    const frustumH = orthoCam.top - orthoCam.bottom;
    const actualAspect = frustumW / frustumH;

    const diff = Math.abs(actualAspect - expectedAspect);
    if (diff > maxAspectDiscrepancy) {
      maxAspectDiscrepancy = diff;
    }
    if (diff > 1e-5) {
      aspectDiscrepancies++;
    }

    // Check symmetry: left === -right, bottom === -top
    const symHorizDiff = Math.abs(orthoCam.left + orthoCam.right);
    const symVertDiff = Math.abs(orthoCam.bottom + orthoCam.top);
    if (symHorizDiff > 1e-5 || symVertDiff > 1e-5) {
      aspectDiscrepancies++;
    }

    const check = verifyProjectionMatrixFinite(orthoCam, `Resize ${res.w}x${res.h}`);
    if (!check.ok) {
      resizeNanCount++;
    }

    // Interleave check in Perspective mode every 5th iteration
    if (i % 5 === 0) {
      window.switchCamera('persp');
      window.onResize();
      const perspCam = window.camera;
      const perspDiff = Math.abs(perspCam.aspect - expectedAspect);
      if (perspDiff > 1e-5) {
        aspectDiscrepancies++;
      }
      const perspCheck = verifyProjectionMatrixFinite(perspCam, `Persp Resize ${res.w}x${res.h}`);
      if (!perspCheck.ok) {
        resizeNanCount++;
      }
      window.switchCamera('ortho');
    }
  }

  assert(aspectDiscrepancies === 0, `Orthographic frustum aspect discrepancies must be 0 (Actual: ${aspectDiscrepancies})`);
  assert(resizeNanCount === 0, `Resize matrix NaNs must be 0 (Actual: ${resizeNanCount})`);
  assert(maxAspectDiscrepancy < 1e-5, `Max aspect discrepancy must be < 1e-5 (Actual: ${maxAspectDiscrepancy.toExponential(4)})`);

  console.log(`  ✓ Completed 500 dynamic viewport resizes:`);
  console.log(`    - Aspect Ratio Invariant Discrepancies: 0 / 500`);
  console.log(`    - Maximum Frustum Aspect Error: ${maxAspectDiscrepancy.toExponential(4)} (well below 1e-5 tolerance)`);
  console.log(`    - Matrix NaNs: 0 / 500`);

  // ===========================================================================
  // SECTION 3: TRACKPAD / WHEEL ZOOM INVARIANT (1,000 ITERATIONS)
  // ===========================================================================
  console.log('\n--- SECTION 3: Trackpad / Wheel Zoom Invariant (1,000 Iterations) ---');

  let orthoZoomViolations = 0;
  let perspDistanceViolations = 0;
  let zoomNanCount = 0;
  let minObservedOrthoZoom = Infinity;
  let maxObservedOrthoZoom = -Infinity;

  // 1. 500 Zoom Operations in Orthographic Mode
  window.switchCamera('ortho');
  window.autoFitCamera(); // Reset to zoom = 1.0

  for (let i = 1; i <= 500; i++) {
    // Generate various deltaY magnitudes: small (±1), detent (±120), large (±2000), pathological (±100,000)
    let deltaY = 0;
    const mode = rng.nextInt(1, 4);
    if (mode === 1) deltaY = rng.nextInt(-15, 15);
    else if (mode === 2) deltaY = rng.pick([-120, 120, -240, 240]);
    else if (mode === 3) deltaY = rng.nextInt(-2500, 2500);
    else deltaY = rng.nextInt(-200000, 200000);

    // Dispatch precision trackpad wheel event (ctrlKey = true)
    const wheelEvt = {
      type: 'wheel',
      ctrlKey: true,
      deltaY: deltaY,
      preventDefault: () => {}
    };
    window.dispatchEvent(wheelEvt);

    const zoom = window.camera.zoom;
    if (isNaN(zoom) || !isFinite(zoom) || zoom <= 0) {
      orthoZoomViolations++;
    }
    // Check safe clamping bounds: 0.01 <= zoom <= 100
    if (zoom < 0.01 - 1e-7 || zoom > 100 + 1e-7) {
      orthoZoomViolations++;
    }

    if (zoom < minObservedOrthoZoom) minObservedOrthoZoom = zoom;
    if (zoom > maxObservedOrthoZoom) maxObservedOrthoZoom = zoom;

    const check = verifyProjectionMatrixFinite(window.camera, `Ortho Zoom ${i}`);
    if (!check.ok) {
      zoomNanCount++;
    }
  }

  assert(orthoZoomViolations === 0, `Ortho zoom bounds / inversion violations must be 0 (Actual: ${orthoZoomViolations})`);
  assert(zoomNanCount === 0, `Zoom matrix NaNs must be 0 (Actual: ${zoomNanCount})`);
  assert(minObservedOrthoZoom >= 0.01, `Min zoom clamped to >= 0.01 (Observed: ${minObservedOrthoZoom})`);
  assert(maxObservedOrthoZoom <= 100, `Max zoom clamped to <= 100 (Observed: ${maxObservedOrthoZoom})`);

  console.log(`  ✓ Completed 500 Orthographic zoom cycles:`);
  console.log(`    - Zoom Inversions / Non-Positive Zooms: 0`);
  console.log(`    - Bound Violations: 0 (Min Observed: ${minObservedOrthoZoom.toFixed(4)}, Max Observed: ${maxObservedOrthoZoom.toFixed(4)})`);
  console.log(`    - Projection Matrix NaNs: 0`);

  // 2. 500 Zoom Operations in Perspective Mode
  window.switchCamera('persp');
  window.autoFitCamera();

  for (let i = 1; i <= 500; i++) {
    let deltaY = 0;
    const mode = rng.nextInt(1, 3);
    if (mode === 1) deltaY = rng.nextInt(-10, 10);
    else if (mode === 2) deltaY = rng.pick([-100, 100, -200, 200]);
    else deltaY = rng.nextInt(-800, 800);

    const wheelEvt = {
      type: 'wheel',
      ctrlKey: true,
      deltaY: deltaY,
      preventDefault: () => {}
    };
    window.dispatchEvent(wheelEvt);

    const camPos = window.camera.position;
    const targetPos = window.controls.target;
    const dist = camPos.distanceTo(targetPos);

    if (isNaN(dist) || !isFinite(dist) || dist <= 0.0001) {
      perspDistanceViolations++;
    }

    const check = verifyProjectionMatrixFinite(window.camera, `Persp Zoom ${i}`);
    if (!check.ok) {
      zoomNanCount++;
    }

    // Interleave controls.update() to test damping and matrix recalculation
    if (i % 10 === 0) {
      window.controls.update();
    }
  }

  assert(perspDistanceViolations === 0, `Perspective distance violations must be 0 (Actual: ${perspDistanceViolations})`);
  assert(zoomNanCount === 0, `Zoom matrix NaNs must be 0 (Actual: ${zoomNanCount})`);

  console.log(`  ✓ Completed 500 Perspective zoom cycles:`);
  console.log(`    - Negative / Zero Distance Inversions: 0`);
  console.log(`    - Projection Matrix NaNs: 0`);

  // ===========================================================================
  // SECTION 4: EXTREME CROSS-ZOOM PROJECTION SWITCHING STRESS
  // ===========================================================================
  console.log('\n--- SECTION 4: Extreme Cross-Zoom Projection Switching Stress ---');

  // Case A: Zoom in Ortho to maximum clamp (100.0), switch to Persp, verify finite position
  window.switchCamera('ortho');
  window.camera.zoom = 100.0;
  window.camera.updateProjectionMatrix();
  window.switchCamera('persp');

  const distMax = window.camera.position.distanceTo(window.controls.target);
  assert(!isNaN(distMax) && isFinite(distMax) && distMax > 0, `Switching from max ortho zoom (100x) to persp yields valid distance (${distMax.toFixed(4)})`);
  assert(verifyProjectionMatrixFinite(window.camera, 'Max Zoom Switch').ok, 'Projection matrix is finite after max zoom switch');

  // Case B: Zoom in Ortho to minimum clamp (0.01), switch to Persp, verify finite position
  window.switchCamera('ortho');
  window.camera.zoom = 0.01;
  window.camera.updateProjectionMatrix();
  window.switchCamera('persp');

  const distMin = window.camera.position.distanceTo(window.controls.target);
  assert(!isNaN(distMin) && isFinite(distMin) && distMin > 0, `Switching from min ortho zoom (0.01x) to persp yields valid distance (${distMin.toFixed(4)})`);
  assert(verifyProjectionMatrixFinite(window.camera, 'Min Zoom Switch').ok, 'Projection matrix is finite after min zoom switch');

  // Case C: Recover back to standard ISO framing
  window.switchCamera('ortho');
  window.autoFitCamera();
  assert(window.camera.zoom === 1.0, 'autoFitCamera reset zoom to exactly 1.0');
  assert(window.camera.left < 0 && window.camera.right > 0, 'Symmetric horizontal frustum restored');

  console.log('  ✓ Extreme cross-zoom transitions (0.01x & 100x) verified seamlessly.');

  // ===========================================================================
  // SECTION 5: COMPLEX CHAOTIC FUZZER (1,000 MULTI-ACTION STEPS)
  // ===========================================================================
  console.log('\n--- SECTION 5: Multi-Action Chaotic Fuzzer (1,000 Steps) ---');

  let fuzzerErrors = 0;
  for (let step = 1; step <= 1000; step++) {
    try {
      const action = rng.nextInt(1, 6);
      switch (action) {
        case 1:
          window.toggleOrthoPersp();
          break;
        case 2:
          window.innerWidth = rng.nextInt(200, 4000);
          window.innerHeight = rng.nextInt(200, 3000);
          window.onResize();
          break;
        case 3:
          window.dispatchEvent({
            type: 'wheel',
            ctrlKey: true,
            deltaY: rng.nextInt(-500, 500),
            preventDefault: () => {}
          });
          break;
        case 4:
          window.autoFitCamera();
          break;
        case 5:
          window.ViewCube.rotateToFace(rng.pick(['TOP', 'BOTTOM', 'FRONT', 'BACK', 'LEFT', 'RIGHT', 'ISO']));
          break;
        case 6:
          window.updateViewCube();
          window.controls.update();
          break;
      }

      // Continuous lockstep check
      if (window.camera !== window.controls.object) {
        fuzzerErrors++;
      }
      // Continuous matrix check
      if (!verifyProjectionMatrixFinite(window.camera, `Fuzzer step ${step}`).ok) {
        fuzzerErrors++;
      }
    } catch (err) {
      console.error(`Fuzzer exception at step ${step}:`, err);
      fuzzerErrors++;
    }
  }

  assert(fuzzerErrors === 0, `Fuzzer errors must be 0 (Actual: ${fuzzerErrors})`);
  console.log(`  ✓ 1,000 continuous multi-action fuzzer steps completed with 0 errors.`);

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`  CHALLENGER 2 STRESS SUITE RESULTS:`);
  console.log(`  Total Iterations Executed: 4,500 operations (2,000 toggles + 500 resizes + 1,000 zooms + 1,000 fuzzer)`);
  console.log(`  Total Assertions Verified: ${totalAssertionsPassed} PASSED, ${totalAssertionsFailed} FAILED`);
  console.log(`  VERDICT: ${totalAssertionsFailed === 0 ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('================================================================\n');

  if (totalAssertionsFailed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runChallenger2Suite();
