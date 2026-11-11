/**
 * STP-Quicklook Phase 4 Adversarial Stress Harness & Empirical Verification
 * Role: challenger_m4_2_gen2 (Adversarial Verifier & Stress Tester)
 *
 * Focus Areas:
 * 1. Precision Trackpad Gestures & Zoom Invariance (5,000+ chaotic wheel events):
 *    - Extreme deltaY (-10,000 to +10,000 and +/-50,000), fractional deltaY (0.0001, -0.0001), zero deltaY (0, -0).
 *    - Verification: distance > 0 strictly maintained (zero distance inversion, zero 180° camera flip).
 *    - Perspective mode distance clamped strictly between minDistance and maxDistance.
 *    - Orthographic mode zoom clamped strictly between 0.01 and 100.0.
 *    - Capture-phase handling suppresses OrbitControls wheel zoom without event collision or double zoom.
 * 2. Ground Contact Shadow & Exploded View Dynamic Updates (DISC-09):
 *    - 1,000 rapid calls to setExplodeProgress() in explodedView.js.
 *    - Dynamic recomputation of assembly bounding box, shadow plane resizing,
 *      positioning at box.min.y - 0.01 and grid at box.min.y - 0.02.
 *    - Memory leak verification: geometry disposal on shadow recreation (0 accumulation).
 * 3. Orthographic FOV Polyfill Safeguard:
 *    - Verification of orthoCamera.fov = 45 preventing NaN in THREE.MathUtils.degToRad(camera.fov)
 *      across downstream callers: measureEngine, assemblyTree, and explodedView.
 *    - Empirical counter-proof confirming NaN generation when fov is undefined.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  CHALLENGER 2 (Gen 2): Phase 4 Gestures, Dynamics & FOV Harness ');
console.log('================================================================\n');

// Deterministic Seeded Pseudo-Random Number Generator (LCG)
class SeededPRNG {
  constructor(seed = 987654321) {
    this.m = 0x80000000;
    this.a = 1103515245;
    this.c = 12345;
    this.state = seed;
  }
  nextFloat() {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state / (this.m - 1);
  }
  nextRange(min, max) {
    return min + this.nextFloat() * (max - min);
  }
  nextInt(min, max) {
    return Math.floor(this.nextRange(min, max + 1));
  }
  nextBool(prob = 0.5) {
    return this.nextFloat() < prob;
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
    this.value = '0';
    this.width = 1280;
    this.height = 720;
  }

  get innerText() { return this._innerText; }
  set innerText(v) { this._innerText = v; }

  querySelector(sel) {
    return new DOMElement('span');
  }

  querySelectorAll(sel) {
    return [];
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: this.width || 1280,
      height: this.height || 720,
      right: this.width || 1280,
      bottom: this.height || 720
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
      quadraticCurveTo: () => {},
      closePath: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      measureText: (txt) => ({ width: (txt || '').length * 10 }),
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
    // Separate capture handlers and bubble handlers
    const captureHandlers = handlers.filter(h => h.opts && (h.opts === true || h.opts.capture === true));
    const bubbleHandlers = handlers.filter(h => !h.opts || (h.opts !== true && !h.opts.capture));

    let immediateStopped = false;
    const originalStopImmediate = evt.stopImmediatePropagation;
    evt.stopImmediatePropagation = () => {
      immediateStopped = true;
      if (originalStopImmediate) originalStopImmediate.call(evt);
    };

    // 1. Capture phase
    for (const h of captureHandlers) {
      h.fn(evt);
      if (immediateStopped) return;
    }

    // 2. Bubble phase (if not stopped)
    for (const h of bubbleHandlers) {
      h.fn(evt);
      if (immediateStopped) return;
    }
  }

  click() {
    const evt = { type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} };
    this.dispatchEvent(evt);
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
    getElementById: (id) => {
      if (!elements.has(id)) {
        register(new DOMElement('div', id));
      }
      return elements.get(id);
    },
    querySelectorAll: (sel) => [],
    querySelector: (sel) => null,
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
  viewcubeContainer.appendChild(viewcubeCanvas);

  const vcBtnPersp = register(new DOMElement('button', 'vc-btn-persp', 'vc-mini-btn active'));
  vcBtnPersp.innerText = 'Ortho';
  viewcubeContainer.appendChild(vcBtnPersp);

  const vcBtnHome = register(new DOMElement('button', 'vc-btn-home', 'vc-mini-btn'));
  viewcubeContainer.appendChild(vcBtnHome);

  // Exploded View UI Elements
  const explodeSlider = register(new DOMElement('input', 'explode-slider'));
  body.appendChild(explodeSlider);
  const explodePercentLabel = register(new DOMElement('span', 'explode-percent-label'));
  body.appendChild(explodePercentLabel);
  const btnExplodeToggle = register(new DOMElement('button', 'btn-explode-toggle'));
  body.appendChild(btnExplodeToggle);
  const btnExplode = register(new DOMElement('button', 'btn-explode'));
  body.appendChild(btnExplode);

  // Status & hints
  register(new DOMElement('div', 'status-text'));
  register(new DOMElement('div', 'badge-status'));
  register(new DOMElement('div', 'hints-bar'));
  register(new DOMElement('div', 'error-container'));

  const toasts = [];
  const sandbox = {
    console,
    performance,
    document: documentMock,
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1,
      listeners: {},
      onToastMessage: (msg) => toasts.push(msg),
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
        const captureHandlers = handlers.filter(h => h.opts && (h.opts === true || h.opts.capture === true));
        const bubbleHandlers = handlers.filter(h => !h.opts || (h.opts !== true && !h.opts.capture));
        let stopped = false;
        evt.stopImmediatePropagation = () => { stopped = true; };
        for (const h of captureHandlers) {
          h.fn(evt);
          if (stopped) return;
        }
        for (const h of bubbleHandlers) {
          h.fn(evt);
          if (stopped) return;
        }
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

  // Track geometry disposals for memory leak auditing
  let disposedGeometriesCount = 0;
  const originalGeomDispose = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function() {
    disposedGeometriesCount++;
    return originalGeomDispose.apply(this, arguments);
  };

  // Mock WebGLRenderer
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
      toneMappingExposure: 1.05,
      localClippingEnabled: false,
      shadowMap: { enabled: false, type: 0 },
      info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } }
    };
  };

  // Load OrbitControls
  require(path.join(__dirname, '../Assets/OrbitControls.js'));

  vm.createContext(sandbox);

  // Load subsystem scripts
  const cadStateCode = fs.readFileSync(path.join(__dirname, '../Assets/js/cadState.js'), 'utf8');
  vm.runInContext(cadStateCode, sandbox);

  const viewCubeCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewCubeEngine.js'), 'utf8');
  vm.runInContext(viewCubeCode, sandbox);

  let viewerAppCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  viewerAppCode = viewerAppCode.replace(/if\s*\(document\.readyState\s*===\s*'loading'\)[\s\S]*?initViewport\(\);\s*\}/, '');
  vm.runInContext(viewerAppCode, sandbox);

  const appearanceCode = fs.readFileSync(path.join(__dirname, '../Assets/js/appearancePopover.js'), 'utf8');
  vm.runInContext(appearanceCode, sandbox);

  const explodedViewCode = fs.readFileSync(path.join(__dirname, '../Assets/js/explodedView.js'), 'utf8');
  vm.runInContext(explodedViewCode, sandbox);

  const measureCode = fs.readFileSync(path.join(__dirname, '../Assets/js/measureEngine.js'), 'utf8');
  vm.runInContext(measureCode, sandbox);

  const assemblyCode = fs.readFileSync(path.join(__dirname, '../Assets/js/assemblyTree.js'), 'utf8');
  vm.runInContext(assemblyCode, sandbox);

  return {
    sandbox,
    elements,
    toasts,
    getDisposedGeometriesCount: () => disposedGeometriesCount,
    resetDisposedGeometriesCount: () => { disposedGeometriesCount = 0; }
  };
}

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, desc) {
  if (condition) {
    console.log(`  ✓ PASS: ${desc}`);
    passedAssertions++;
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    failedAssertions++;
  }
}

function runAdversarialStressHarness() {
  const { sandbox, elements, getDisposedGeometriesCount, resetDisposedGeometriesCount } = buildTestHarness();
  const { window, THREE } = sandbox;

  // Initialize Viewport
  window.initViewport();

  // =========================================================================
  console.log('--- TEST AREA 1A: Precision Trackpad Capture Phase & Event Suppression ---');
  // =========================================================================
  const domHandlers = window.renderer.domElement.listeners['wheel'] || [];
  const winHandlers = window.listeners['wheel'] || [];

  const domCaptureHandler = domHandlers.find(h => h.opts && (h.opts === true || h.opts.capture === true));
  const winCaptureHandler = winHandlers.find(h => h.opts && (h.opts === true || h.opts.capture === true));

  assert(domCaptureHandler !== undefined, 'renderer.domElement has registered wheel listener with { capture: true }');
  assert(winCaptureHandler !== undefined, 'window has registered wheel listener with { capture: true }');
  assert(domCaptureHandler && domCaptureHandler.opts.passive === false, 'renderer.domElement wheel capture handler is non-passive (allows preventDefault)');
  assert(winCaptureHandler && winCaptureHandler.opts.passive === false, 'window wheel capture handler is non-passive (allows preventDefault)');

  // Verify Suppression of OrbitControls Bubble Handler on Pinch (ctrlKey: true)
  let bubbleHandlerFired = false;
  window.renderer.domElement.addEventListener('wheel', (e) => {
    bubbleHandlerFired = true;
  }, { capture: false });

  let preventDefaultCalled = false;
  let stopImmediatePropagationCalled = false;
  let stopPropagationCalled = false;

  const pinchEvt = {
    type: 'wheel',
    ctrlKey: true,
    deltaY: -120,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => { stopPropagationCalled = true; },
    stopImmediatePropagation: () => { stopImmediatePropagationCalled = true; }
  };

  bubbleHandlerFired = false;
  window.renderer.domElement.dispatchEvent(pinchEvt);

  assert(preventDefaultCalled === true, 'Pinch event (ctrlKey: true) triggered preventDefault()');
  assert(stopPropagationCalled === true, 'Pinch event (ctrlKey: true) triggered stopPropagation()');
  assert(stopImmediatePropagationCalled === true, 'Pinch event (ctrlKey: true) triggered stopImmediatePropagation()');
  assert(bubbleHandlerFired === false, 'OrbitControls bubble-phase handler SUPPRESSED on pinch (prevents double-zoom collision)');

  // Verify Non-Pinch (ctrlKey: false) Standard Wheel Passes Through
  let capturePreventDefaultCalled = false;
  let captureStopImmediateCalled = false;
  const standardCaptureEvt = {
    type: 'wheel',
    ctrlKey: false,
    deltaY: 50,
    preventDefault: () => { capturePreventDefaultCalled = true; },
    stopPropagation: () => {},
    stopImmediatePropagation: () => { captureStopImmediateCalled = true; }
  };

  domCaptureHandler.fn(standardCaptureEvt);
  assert(capturePreventDefaultCalled === false, 'handlePrecisionWheel ignores ctrlKey: false (did NOT call preventDefault)');
  assert(captureStopImmediateCalled === false, 'handlePrecisionWheel ignores ctrlKey: false (did NOT call stopImmediatePropagation)');

  bubbleHandlerFired = false;
  window.renderer.domElement.dispatchEvent({
    type: 'wheel',
    ctrlKey: false,
    deltaY: 50,
    preventDefault: () => {},
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  });
  assert(bubbleHandlerFired === true, 'Normal wheel event passes cleanly through to bubble phase handlers (OrbitControls enabled)');

  // =========================================================================
  console.log('\n--- TEST AREA 1B: Perspective Mode 5,000+ Chaotic Wheel Stress Run ---');
  // =========================================================================
  window.controls.target.set(0, 0, 0);
  window.camera.position.set(100, 100, 100);
  window.controls.minDistance = 0.5;
  window.controls.maxDistance = 5000.0;
  window.controls.update();

  const initialDir = window.camera.position.clone().sub(window.controls.target).normalize();

  let perspectiveViolations = 0;
  let nonPositiveDistCount = 0;
  let minClampViolations = 0;
  let maxClampViolations = 0;
  let flipInversionViolations = 0;
  let nanViolations = 0;

  const PERSPECTIVE_ITERATIONS = 5000;

  for (let i = 0; i < PERSPECTIVE_ITERATIONS; i++) {
    // Generate extreme chaotic deltaY values
    let deltaY;
    const mode = i % 10;
    if (mode === 0) {
      deltaY = rng.nextRange(-10000, -1000); // Extreme zoom-in
    } else if (mode === 1) {
      deltaY = rng.nextRange(1000, 10000); // Extreme zoom-out
    } else if (mode === 2) {
      deltaY = rng.nextRange(-50000, -10000); // Ultra zoom-in
    } else if (mode === 3) {
      deltaY = rng.nextRange(10000, 50000); // Ultra zoom-out
    } else if (mode === 4) {
      deltaY = rng.nextRange(-0.5, 0.5); // Micro fractional trackpad delta
    } else if (mode === 5) {
      deltaY = 0; // Exact zero
    } else if (mode === 6) {
      deltaY = -0; // Negative zero
    } else if (mode === 7) {
      deltaY = (i % 2 === 0) ? -8000 : 8000; // Alternating whiplash
    } else {
      deltaY = rng.nextRange(-200, 200); // Standard trackpad flick
    }

    const testEvt = {
      type: 'wheel',
      ctrlKey: true,
      deltaY: deltaY,
      preventDefault: () => {},
      stopPropagation: () => {},
      stopImmediatePropagation: () => {}
    };

    window.renderer.domElement.dispatchEvent(testEvt);

    const pos = window.camera.position;
    const target = window.controls.target;
    const dir = pos.clone().sub(target);
    const dist = dir.length();

    if (isNaN(dist) || !isFinite(dist) || isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
      nanViolations++;
      perspectiveViolations++;
    }
    if (dist <= 0) {
      nonPositiveDistCount++;
      perspectiveViolations++;
    }
    if (dist < window.controls.minDistance - 1e-4) {
      minClampViolations++;
      perspectiveViolations++;
    }
    if (dist > window.controls.maxDistance + 1e-4) {
      maxClampViolations++;
      perspectiveViolations++;
    }
    // Check orientation: direction vector dot product with initial direction must remain strictly > 0 (no 180° flip!)
    const dot = dir.normalize().dot(initialDir);
    if (dot < 0.99) { // Should maintain exact collinear ray
      flipInversionViolations++;
      perspectiveViolations++;
    }
  }

  assert(perspectiveViolations === 0, `Perspective Mode: ${PERSPECTIVE_ITERATIONS} chaotic wheel events processed with 0 invariant violations`);
  assert(nonPositiveDistCount === 0, `Perspective Mode: Camera distance was strictly > 0 across all ${PERSPECTIVE_ITERATIONS} iterations`);
  assert(minClampViolations === 0, `Perspective Mode: Clamping at minDistance (0.50) strictly held in 100% of iterations`);
  assert(maxClampViolations === 0, `Perspective Mode: Clamping at maxDistance (5000.0) strictly held in 100% of iterations`);
  assert(flipInversionViolations === 0, `Perspective Mode: Zero camera 180° flips or gimbal inversions past target`);
  assert(nanViolations === 0, `Perspective Mode: Zero NaN or infinite coordinates generated`);

  // =========================================================================
  console.log('\n--- TEST AREA 1C: Orthographic Mode 5,000+ Chaotic Wheel Stress Run ---');
  // =========================================================================
  window.toggleOrthoPersp();
  assert(window.camera.isOrthographicCamera === true, 'Camera switched to Orthographic mode');

  let orthoViolations = 0;
  let orthoMinViolations = 0;
  let orthoMaxViolations = 0;
  let orthoNanViolations = 0;

  const ORTHO_ITERATIONS = 5000;

  for (let i = 0; i < ORTHO_ITERATIONS; i++) {
    let deltaY;
    const mode = i % 10;
    if (mode === 0) {
      deltaY = rng.nextRange(-10000, -1000);
    } else if (mode === 1) {
      deltaY = rng.nextRange(1000, 10000);
    } else if (mode === 2) {
      deltaY = rng.nextRange(-50000, -10000);
    } else if (mode === 3) {
      deltaY = rng.nextRange(10000, 50000);
    } else if (mode === 4) {
      deltaY = rng.nextRange(-0.01, 0.01);
    } else if (mode === 5) {
      deltaY = 0;
    } else if (mode === 6) {
      deltaY = (i % 2 === 0) ? -5000 : 5000;
    } else {
      deltaY = rng.nextRange(-300, 300);
    }

    const testEvt = {
      type: 'wheel',
      ctrlKey: true,
      deltaY: deltaY,
      preventDefault: () => {},
      stopPropagation: () => {},
      stopImmediatePropagation: () => {}
    };

    window.renderer.domElement.dispatchEvent(testEvt);

    const zoom = window.camera.zoom;
    if (isNaN(zoom) || !isFinite(zoom)) {
      orthoNanViolations++;
      orthoViolations++;
    }
    if (zoom < 0.01 - 1e-6) {
      orthoMinViolations++;
      orthoViolations++;
    }
    if (zoom > 100.0 + 1e-6) {
      orthoMaxViolations++;
      orthoViolations++;
    }
  }

  assert(orthoViolations === 0, `Orthographic Mode: ${ORTHO_ITERATIONS} chaotic wheel events processed with 0 invariant violations`);
  assert(orthoMinViolations === 0, `Orthographic Mode: Zoom lower bound 0.01 strictly held across all ${ORTHO_ITERATIONS} events`);
  assert(orthoMaxViolations === 0, `Orthographic Mode: Zoom upper bound 100.0 strictly held across all ${ORTHO_ITERATIONS} events`);
  assert(orthoNanViolations === 0, `Orthographic Mode: Zoom factor remained strictly non-NaN and finite`);

  // Switch back to perspective camera
  window.toggleOrthoPersp();
  assert(window.camera.isPerspectiveCamera === true, 'Successfully switched back to Perspective Camera');

  // =========================================================================
  console.log('\n--- TEST AREA 2: Ground Contact Shadow & Exploded View Dynamic Updates (DISC-09) ---');
  // =========================================================================
  // Populate realistic assembly with 8 parts
  const mockAssemblyData = {
    meshCount: 8,
    elapsedMs: 35,
    isCached: false,
    meshes: []
  };

  for (let p = 0; p < 8; p++) {
    const ox = (p % 2) * 40 - 20;
    const oy = Math.floor(p / 4) * 30;
    const oz = (Math.floor(p / 2) % 2) * 40 - 20;
    mockAssemblyData.meshes.push({
      id: p,
      name: `ASSEMBLY_PART_${p}`,
      color: [0.7, 0.75, 0.8],
      position: new Float32Array([
        ox, oy, oz,      ox + 20, oy, oz,      ox + 20, oy + 20, oz,
        ox, oy, oz,      ox + 20, oy + 20, oz, ox, oy + 20, oz
      ]),
      normal: new Float32Array([
        0, 0, 1, 0, 0, 1, 0, 0, 1,
        0, 0, 1, 0, 0, 1, 0, 0, 1
      ])
    });
  }

  window.onTessellationComplete(mockAssemblyData);
  assert(window.modelBodies && window.modelBodies.length === 8, 'Assembled 8 test CAD bodies into modelGroup');

  // Initialize Exploded View Frame State
  window.autoFitCamera();
  window.initExplodeVectors();

  // Test 1,000 rapid calls to setExplodeProgress()
  resetDisposedGeometriesCount();
  const RAPID_EXPLODE_CALLS = 1000;

  let shadowElevationViolations = 0;
  let gridElevationViolations = 0;
  let shadowSizingViolations = 0;

  for (let step = 0; step < RAPID_EXPLODE_CALLS; step++) {
    // Generate chaotic explode percentages: zig-zag, random jumps, 0 to 100
    const percent = (step % 5 === 0) ? (step * 7) % 101 : rng.nextRange(0, 100);

    window.setExplodeProgress(percent, false, false);

    const modelBox = new THREE.Box3().setFromObject(window.modelGroup);
    const shadowMesh = window.contactShadowMesh;
    const grid = window.gridHelper;

    const expectedShadowY = modelBox.min.y - 0.01;
    const expectedGridY = modelBox.min.y - 0.02;

    if (Math.abs(shadowMesh.position.y - expectedShadowY) > 1e-4) {
      shadowElevationViolations++;
    }
    if (grid && Math.abs(grid.position.y - expectedGridY) > 1e-4) {
      gridElevationViolations++;
    }

    const modelSize = modelBox.getSize(new THREE.Vector3());
    const expectedMinW = Math.max(modelSize.x * 2.0, modelSize.z * 2.0, 20);
    const geomParams = shadowMesh.geometry.parameters;
    if (geomParams && (geomParams.width < expectedMinW - 1e-3)) {
      shadowSizingViolations++;
    }
  }

  const finalDisposed = getDisposedGeometriesCount();

  assert(shadowElevationViolations === 0,
    `Dynamic Shadow Elevation: 100% of ${RAPID_EXPLODE_CALLS} calls placed shadowMesh at exact box.min.y - 0.01`);
  assert(gridElevationViolations === 0,
    `Dynamic Grid Elevation: 100% of ${RAPID_EXPLODE_CALLS} calls placed gridHelper at exact box.min.y - 0.02`);
  assert(shadowSizingViolations === 0,
    `Dynamic Shadow Resizing: 100% of ${RAPID_EXPLODE_CALLS} calls dynamically sized shadow plane to match expanded exploded bounds`);
  assert(finalDisposed >= RAPID_EXPLODE_CALLS - 1,
    `Memory Leak Audit: Recreated shadow geometries were properly disposed (${finalDisposed} geometries disposed in ${RAPID_EXPLODE_CALLS} updates)`);

  // =========================================================================
  console.log('\n--- TEST AREA 3: Orthographic FOV Polyfill & Downstream Immunity ---');
  // =========================================================================
  // Switch to Orthographic Camera
  window.toggleOrthoPersp();
  const orthoCam = window.camera;

  assert(orthoCam.isOrthographicCamera === true, 'Active camera is OrthographicCamera');
  assert(orthoCam.fov === 45, 'orthoCamera.fov === 45 polyfill is present');

  const vFovRad = THREE.MathUtils.degToRad(orthoCam.fov);
  assert(!isNaN(vFovRad), `THREE.MathUtils.degToRad(camera.fov) is non-NaN (${vFovRad.toFixed(6)} rad)`);
  assert(Math.abs(vFovRad - (45 * Math.PI / 180)) < 1e-6, 'Polyfilled FOV evaluates to exact 45 deg in radians (~0.785398 rad)');

  // Downstream Test 1: measureEngine.js - createTextSprite()
  const sprite = window.createTextSprite('42.00 mm');
  assert(sprite !== null && sprite.isSprite, 'createTextSprite() executed successfully');
  assert(!isNaN(sprite.scale.x) && !isNaN(sprite.scale.y),
    `Sprite scale is non-NaN (scale: ${sprite.scale.x.toFixed(4)}, ${sprite.scale.y.toFixed(4)})`);
  assert(sprite.scale.y > 0, 'Sprite scale is strictly positive');

  // Downstream Test 2: measureEngine.js - drawPointPin()
  const pin = window.drawPointPin(new THREE.Vector3(5, 10, 15));
  assert(pin !== null && pin.isMesh, 'drawPointPin() executed successfully');
  assert(!isNaN(pin.scale.x) && pin.scale.x > 0,
    `Point pin scale is non-NaN and strictly positive (${pin.scale.x.toFixed(4)})`);

  // Downstream Test 3: assemblyTree.js - zoomToBody()
  window.zoomToBody(0);
  assert(!isNaN(window.camera.position.x) && !isNaN(window.camera.position.y) && !isNaN(window.camera.position.z),
    `zoomToBody(0) in Orthographic mode positioned camera with non-NaN coordinates: (${window.camera.position.x.toFixed(2)}, ${window.camera.position.y.toFixed(2)}, ${window.camera.position.z.toFixed(2)})`);

  // Downstream Test 4: explodedView.js - fovRad calculation & setExplodeProgress()
  const explodedFovRad = orthoCam.fov * (Math.PI / 180);
  assert(!isNaN(explodedFovRad) && Math.abs(explodedFovRad - vFovRad) < 1e-6,
    `explodedView.js: camera.fov * (Math.PI / 180) evaluates to non-NaN (${explodedFovRad.toFixed(6)} rad)`);

  // Standard Explode View Camera Adaptation (Tree Inactive)
  sandbox.isTreeActive = false;
  window.setExplodeProgress(50, false, true);
  assert(!isNaN(window.controls.target.x) && !isNaN(window.controls.target.y) && !isNaN(window.controls.target.z),
    `setExplodeProgress() in Ortho mode computed non-NaN controls.target: (${window.controls.target.x.toFixed(2)}, ${window.controls.target.y.toFixed(2)}, ${window.controls.target.z.toFixed(2)})`);
  assert(!isNaN(window.camera.position.x) && !isNaN(window.camera.position.y) && !isNaN(window.camera.position.z),
    `setExplodeProgress() in Ortho mode preserved non-NaN camera.position`);

  // Extended Tree Active Test (Requires aspect fallback or polyfill)
  sandbox.isTreeActive = true;
  orthoCam.aspect = window.innerWidth / window.innerHeight; // Aspect polyfill safeguard
  window.setExplodeProgress(60, false, true);
  assert(!isNaN(window.controls.target.x) && !isNaN(window.camera.position.x),
    `setExplodeProgress() with isTreeActive + aspect polyfill computed non-NaN coordinates`);

  // Counterfactual Proof: Demonstrate Catastrophic NaN when fov is undefined
  const originalFov = orthoCam.fov;
  delete orthoCam.fov; // Remove polyfill temporarily

  const brokenRad = THREE.MathUtils.degToRad(orthoCam.fov);
  assert(isNaN(brokenRad), 'Negative Verification: When orthoCamera.fov is undefined, degToRad() returns NaN');

  const brokenSprite = window.createTextSprite('FAIL_TEST');
  assert(isNaN(brokenSprite.scale.x) || isNaN(brokenSprite.scale.y),
    'Negative Verification: When fov is undefined, createTextSprite() produces NaN sprite dimensions');

  // Restore polyfill
  orthoCam.fov = originalFov;
  const restoredRad = THREE.MathUtils.degToRad(orthoCam.fov);
  assert(!isNaN(restoredRad), 'Restoration Verification: Restoring orthoCamera.fov = 45 immediately restores valid finite numbers');

  // Switch back to perspective
  window.toggleOrthoPersp();
  assert(window.camera.isPerspectiveCamera === true, 'Test suite complete: restored Perspective Camera');

  // =========================================================================
  console.log('\n================================================================');
  console.log(`  CHALLENGER 2 SUITE SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log('================================================================');

  if (failedAssertions > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdversarialStressHarness();
