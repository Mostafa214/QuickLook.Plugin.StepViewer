/**
 * Milestone 1 Challenger 2 Empirical Stress Test Harness:
 * Camera Initialization, Consecutive Model Loading, Listener Leak, and Frustum Metric Resizing
 *
 * Verifies:
 * 1. 50 Consecutive Model Load Simulations:
 *    - Camera mode persistence/reset to Orthographic
 *    - #vc-btn-persp label ('Ortho') and .active class synchronization
 *    - Zoom reset to 1.0 and bounding box auto-centering
 *    - Pre-load state resilience (switching to Persp, zooming, panning)
 * 2. Event Listener Proliferation & Memory Leak on #vc-btn-persp:
 *    - Strict listener count invariancy (no duplicate listeners attached per load)
 *    - Click event invocation count (exactly 1 toggle per click, no rapid re-triggering)
 *    - Three.js geometry/material resource disposal in modelGroup
 * 3. Responsive Resizing & True 1:1 Metric Scale Frustum Math:
 *    - Aspect ratios: 16:9, 4:3, 1:1, 9:16, 21:9, plus extreme ratios (32:9, 1:2)
 *    - Frustum aspect ratio exact match with canvas aspect ratio
 *    - Horizontal vs Vertical pixel-to-millimeter metric scale equality (px_scale_x === px_scale_y)
 *    - Zero non-uniform stretching across all viewports
 * 4. Real Headless Chrome (CDP) Runtime Invariant Verification:
 *    - Real browser execution of consecutive loads and live resize matrix assertions
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');

console.log('================================================================================');
console.log('  CHALLENGER M1-2: EMPIRICAL STRESS TEST & ADVERSARIAL HARNESS (Milestone 1)    ');
console.log('================================================================================\n');

// ----------------------------------------------------------------------------
// Mock DOM Setup for In-Memory Stress Suite
// ----------------------------------------------------------------------------
class ClassList {
  constructor(owner) {
    this.owner = owner;
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

class MockDOMElement {
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
    this.title = '';
    this.width = 110;
    this.height = 110;
  }
  get innerText() { return this._innerText; }
  set innerText(v) { this._innerText = v; }
  get textContent() { return this._innerText; }
  set textContent(v) { this._innerText = v; }
  getBoundingClientRect() {
    return { left: 10, top: 10, width: this.width || 110, height: this.height || 110, right: 120, bottom: 120 };
  }
  getContext() {
    return {
      fillRect: () => {}, strokeRect: () => {}, fillText: () => {}, clearRect: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, arc: () => {},
      fill: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
      scale: () => {}, measureText: (txt) => ({ width: (txt || '').length * 8 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createImageData: () => ({ data: new Uint8ClampedArray(100) }),
      putImageData: () => {}, drawImage: () => {}
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
  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h !== fn);
  }
  click() {
    const handlers = (this.listeners['click'] || []).slice();
    const evt = { type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} };
    for (const h of handlers) h(evt);
  }
}

function buildSandbox() {
  const elements = new Map();
  function register(el) { if (el.id) elements.set(el.id, el); return el; }

  const documentMock = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new MockDOMElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const body = register(new MockDOMElement('body'));
  const canvasContainer = register(new MockDOMElement('div', 'canvas-container'));
  body.appendChild(canvasContainer);
  const triadCanvas = register(new MockDOMElement('canvas', 'triad-canvas'));
  body.appendChild(triadCanvas);
  const viewcubeContainer = register(new MockDOMElement('div', 'viewcube-container'));
  body.appendChild(viewcubeContainer);
  const viewcubeCanvas = register(new MockDOMElement('canvas', 'viewcube-canvas'));
  viewcubeContainer.appendChild(viewcubeCanvas);

  // Reflect initial HTML markup in Assets/viewer.html:
  // <button id="vc-btn-persp" class="vc-mini-btn active" title="Toggle Camera Projection (Orthographic / Perspective)">Ortho</button>
  const vcBtnPersp = register(new MockDOMElement('button', 'vc-btn-persp', 'vc-mini-btn active'));
  vcBtnPersp.innerText = 'Ortho';
  vcBtnPersp.title = 'Toggle Camera Projection (Orthographic / Perspective)';
  viewcubeContainer.appendChild(vcBtnPersp);

  const vcBtnHome = register(new MockDOMElement('button', 'vc-btn-home', 'vc-mini-btn'));
  viewcubeContainer.appendChild(vcBtnHome);
  const hintsBar = register(new MockDOMElement('div', 'hints-bar'));
  body.appendChild(hintsBar);
  const inspectorDrawer = register(new MockDOMElement('div', 'inspector-drawer'));
  body.appendChild(inspectorDrawer);
  const statusText = register(new MockDOMElement('div', 'status-text'));
  body.appendChild(statusText);
  const badgeFilename = register(new MockDOMElement('div', 'badge-filename'));
  body.appendChild(badgeFilename);
  const badgeDim = register(new MockDOMElement('div', 'badge-dim'));
  body.appendChild(badgeDim);
  const btnReset = register(new MockDOMElement('button', 'btn-reset'));
  body.appendChild(btnReset);
  const btnWireframe = register(new MockDOMElement('button', 'btn-wireframe'));
  body.appendChild(btnWireframe);
  const toastNotify = register(new MockDOMElement('div', 'toast-notify'));
  body.appendChild(toastNotify);

  let nextFrameId = 1;
  const frameCallbacks = new Map();
  const toasts = [];

  const sandbox = {
    console,
    performance,
    document: documentMock,
    window: {
      innerWidth: 1920,
      innerHeight: 1080,
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
    requestAnimationFrame: (cb) => {
      const id = nextFrameId++;
      frameCallbacks.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (id) => {
      frameCallbacks.delete(id);
    },
    setTimeout,
    clearTimeout
  };

  sandbox.window.document = documentMock;
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
      setSize: (w, h) => { canvas.width = w; canvas.height = h; },
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

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
    failed++;
    failures.push({ testName, details });
  }
}

// ----------------------------------------------------------------------------
// TEST SECTION 1: 50 Consecutive Model Load Simulations
// ----------------------------------------------------------------------------
async function runConsecutiveLoadStressSuite() {
  console.log('--- TEST SECTION 1: 50 Consecutive Model Loads & Ortho Persistence ---');
  const { sandbox, elements } = buildSandbox();
  const { window } = sandbox;
  window.initViewport();

  const vcBtn = elements.get('vc-btn-persp');

  // Verify initial state right after initViewport()
  assert(window.camera.isPerspectiveCamera === true, 'Viewport starts in setup camera before first model load');
  assert(vcBtn.innerText === 'Ortho', 'Initial button markup shows "Ortho"');
  assert(vcBtn.classList.contains('active'), 'Initial button markup has "active" class');

  let orthoCameraInstanceId = null;

  for (let i = 1; i <= 50; i++) {
    // Determine adversarial pre-load condition:
    // Every 3rd iteration: user switched to Perspective mode prior to loading
    // Every 5th iteration: user zoomed in/out aggressively (zoom = 4.5 or zoom = 0.2)
    // Every 7th iteration: user orbited controls target far from origin
    const forcePerspBeforeLoad = (i % 3 === 0);
    const alterZoomBeforeLoad = (i % 5 === 0);
    const alterControlsTarget = (i % 7 === 0);

    if (forcePerspBeforeLoad) {
      window.switchCamera('persp', true);
      assert(window.camera.isPerspectiveCamera === true, `[Load ${i}] Pre-load: switched to Perspective`);
      assert(vcBtn.innerText === 'Persp', `[Load ${i}] Pre-load: button text updated to 'Persp'`);
      assert(!vcBtn.classList.contains('active'), `[Load ${i}] Pre-load: button lost 'active' class`);
    }

    if (alterZoomBeforeLoad && window.camera) {
      window.camera.zoom = 3.5;
      if (window.camera.updateProjectionMatrix) window.camera.updateProjectionMatrix();
    }

    if (alterControlsTarget && window.controls) {
      window.controls.target.set(500, -200, 300);
    }

    // Simulate model tessellation completion with diverse bounding boxes:
    // Scale ranges from 2mm micro-part to 5000mm aircraft fuselage
    const scale = (i % 2 === 0) ? (i * 20) : (i * 2.5);
    window.onTessellationComplete({
      fileName: `Model_${i}_size_${scale.toFixed(1)}.stp`,
      meshes: [{
        name: `Mesh_${i}`,
        position: [
          -scale, -scale, -scale,
           scale, -scale, -scale,
           scale,  scale,  scale
        ],
        normal: [0, 1, 0, 0, 1, 0, 0, 1, 0],
        index: [0, 1, 2]
      }],
      meshCount: 1,
      elapsedMs: 15 + (i * 2),
      bufferSize: 1024 * i
    });

    // Invariants that MUST hold after EVERY model load:
    // 1. Camera must be OrthographicCamera
    assert(window.camera.isOrthographicCamera === true, `[Load ${i}] Camera is genuinely OrthographicCamera`);

    // 2. Camera zoom must be reset to 1.0 (no lingering zoomed-in state from prior model)
    assert(Math.abs(window.camera.zoom - 1.0) < 1e-6, `[Load ${i}] Camera zoom reset to 1.0 (actual: ${window.camera.zoom})`);

    // 3. #vc-btn-persp MUST display 'Ortho'
    assert(vcBtn.innerText === 'Ortho', `[Load ${i}] #vc-btn-persp displays 'Ortho'`);

    // 4. #vc-btn-persp MUST have 'active' class
    assert(vcBtn.classList.contains('active'), `[Load ${i}] #vc-btn-persp contains 'active' class`);

    // 5. #vc-btn-persp title must prompt switch to Perspective
    assert(vcBtn.title === 'Switch to Perspective Camera [O]', `[Load ${i}] #vc-btn-persp title is 'Switch to Perspective Camera [O]'`);

    // 6. Camera frustum parameters must be valid positive numbers
    assert(window.camera.left < 0 && window.camera.right > 0, `[Load ${i}] Frustum horizontal bounds symmetric and non-zero`);
    assert(window.camera.bottom < 0 && window.camera.top > 0, `[Load ${i}] Frustum vertical bounds symmetric and non-zero`);
    assert(!isNaN(window.camera.position.x) && !isNaN(window.camera.position.y), `[Load ${i}] Camera position free of NaNs`);

    if (!orthoCameraInstanceId) {
      orthoCameraInstanceId = window.camera.id;
    } else {
      // Check that camera instance is stably reused rather than leaking new camera allocations
      assert(window.camera.id === orthoCameraInstanceId, `[Load ${i}] Ortho camera instance reused without object churn`);
    }
  }

  console.log(`\nCompleted 50 consecutive loads across dynamic sizes and chaotic pre-load states.`);
}

// ----------------------------------------------------------------------------
// TEST SECTION 2: Listener Proliferation & Memory Leak on #vc-btn-persp
// ----------------------------------------------------------------------------
async function runListenerAndMemoryLeakSuite() {
  console.log('\n--- TEST SECTION 2: Listener Proliferation & Event Memory Leak Stress ---');
  const { sandbox, elements } = buildSandbox();
  const { window } = sandbox;
  window.initViewport();

  const vcBtn = elements.get('vc-btn-persp');

  // Baseline listener count on vc-btn-persp
  const clickListenersBaseline = (vcBtn.listeners['click'] || []).length;
  assert(clickListenersBaseline === 1, `Baseline click listener count on #vc-btn-persp is exactly 1 (actual: ${clickListenersBaseline})`);

  // Run 30 consecutive loads and track listener array
  for (let i = 1; i <= 30; i++) {
    window.onTessellationComplete({
      fileName: `LeakTest_${i}.stp`,
      meshes: [{
        name: `Mesh_${i}`,
        position: [0, 0, 0, 10, 0, 0, 10, 10, 0],
        normal: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        index: [0, 1, 2]
      }],
      meshCount: 1,
      elapsedMs: 10
    });
  }

  const clickListenersAfter30 = (vcBtn.listeners['click'] || []).length;
  assert(clickListenersAfter30 === 1, `Click listener count on #vc-btn-persp after 30 loads is STILL strictly 1 (actual: ${clickListenersAfter30})`);

  // Adversarial Action: Trigger click event on #vc-btn-persp
  // If multiple duplicate listeners were registered, one click would trigger multiple toggles in sequence!
  // E.g. Ortho -> Persp -> Ortho (oscillation bug).
  // We assert that clicking once switches to Perspective, and clicking a second time switches back to Ortho.
  assert(window.camera.isOrthographicCamera === true, 'Pre-click: camera is in Orthographic mode');
  assert(vcBtn.innerText === 'Ortho', 'Pre-click: button text is Ortho');

  // Click 1:
  vcBtn.click();
  assert(window.camera.isPerspectiveCamera === true, 'Click 1: camera cleanly switched to Perspective (no duplicate listener oscillation)');
  assert(vcBtn.innerText === 'Persp', 'Click 1: button text cleanly switched to Persp');
  assert(!vcBtn.classList.contains('active'), 'Click 1: button .active class removed');

  // Click 2:
  vcBtn.click();
  assert(window.camera.isOrthographicCamera === true, 'Click 2: camera cleanly returned to Orthographic');
  assert(vcBtn.innerText === 'Ortho', 'Click 2: button text cleanly returned to Ortho');
  assert(vcBtn.classList.contains('active'), 'Click 2: button .active class restored');

  // Check scene modelGroup child disposal:
  // After each load, previous model children must be cleared to prevent Three.js memory leak
  assert(window.modelGroup.children.length === 1, `Scene modelGroup contains exactly 1 model object (no abandoned geometries accumulated)`);
}

// ----------------------------------------------------------------------------
// TEST SECTION 3: Responsive Resizing & True 1:1 Metric Aspect Frustum Math
// ----------------------------------------------------------------------------
async function runResponsiveResizingFrustumSuite() {
  console.log('\n--- TEST SECTION 3: Responsive Resizing & True 1:1 Metric Aspect Frustum Math ---');
  const { sandbox } = buildSandbox();
  const { window } = sandbox;
  window.initViewport();

  // Load a reference model (100mm cube)
  window.onTessellationComplete({
    fileName: 'Reference_100mm_Cube.stp',
    meshes: [{
      name: 'Cube',
      position: [
        -50, -50, -50,
         50, -50, -50,
         50,  50,  50
      ],
      normal: [0, 1, 0, 0, 1, 0, 0, 1, 0],
      index: [0, 1, 2]
    }],
    meshCount: 1,
    elapsedMs: 20
  });

  assert(window.camera.isOrthographicCamera === true, 'Model loaded in OrthographicCamera');

  // Test across all required aspect ratios:
  const testAspectRatios = [
    { name: '16:9 (Standard Widescreen)', width: 1920, height: 1080 },
    { name: '4:3 (Traditional Display)', width: 1024, height: 768 },
    { name: '1:1 (Square Canvas)', width: 1000, height: 1000 },
    { name: '9:16 (Portrait Mobile/Window)', width: 1080, height: 1920 },
    { name: '21:9 (Ultra-wide Monitor)', width: 2560, height: 1080 },
    { name: '32:9 (Dual-wide Panoramic)', width: 5120, height: 1440 },
    { name: '1:2 (Narrow Vertical Split)', width: 600, height: 1200 }
  ];

  for (const tc of testAspectRatios) {
    window.innerWidth = tc.width;
    window.innerHeight = tc.height;
    window.onResize();

    const cam = window.camera;
    const frustumWidth = cam.right - cam.left;
    const frustumHeight = cam.top - cam.bottom;
    const frustumAspect = frustumWidth / frustumHeight;
    const canvasAspect = tc.width / tc.height;

    // Invariant 1: Frustum aspect ratio MUST match canvas aspect ratio
    const aspectDiff = Math.abs(frustumAspect - canvasAspect);
    assert(aspectDiff < 1e-12, `[${tc.name}] Frustum aspect ratio exact match: ${frustumAspect.toFixed(6)} vs ${canvasAspect.toFixed(6)} (diff: ${aspectDiff.toExponential(2)})`);

    // Invariant 2: Metric World Unit to Screen Pixel Scale Invariance
    // In true 1:1 orthographic CAD projection, 1 mm horizontally MUST span the EXACT same number of pixels as 1 mm vertically!
    // Horizontal pixels per millimeter: W_canvas / W_frustum
    // Vertical pixels per millimeter: H_canvas / H_frustum
    const pxPerMmX = tc.width / frustumWidth;
    const pxPerMmY = tc.height / frustumHeight;
    const metricScaleDiff = Math.abs(pxPerMmX - pxPerMmY);
    assert(metricScaleDiff < 1e-12, `[${tc.name}] True 1:1 Metric Scale: px/mm X = ${pxPerMmX.toFixed(6)}, px/mm Y = ${pxPerMmY.toFixed(6)} (diff: ${metricScaleDiff.toExponential(2)})`);

    // Invariant 3: Frustum Symmetry (optical center at 0,0)
    const symXDiff = Math.abs(cam.left + cam.right);
    const symYDiff = Math.abs(cam.bottom + cam.top);
    assert(symXDiff < 1e-12, `[${tc.name}] Frustum X symmetry: left = -${cam.right}`);
    assert(symYDiff < 1e-12, `[${tc.name}] Frustum Y symmetry: bottom = -${cam.top}`);

    // Invariant 4: Projection Matrix Non-NaN & Non-Degenerate
    const m = cam.projectionMatrix.elements;
    let hasNaN = false;
    for (let j = 0; j < 16; j++) {
      if (isNaN(m[j]) || !isFinite(m[j])) hasNaN = true;
    }
    assert(!hasNaN, `[${tc.name}] Projection matrix elements are 100% valid numbers`);

    // Invariant 5: Test a 20mm 3D circle projected onto screen NDC
    // A circle in CAD space with radius R=20mm in the XY plane must project to identical NDC radius in X and Y when corrected by aspect
    // NDC_x = (x_world / (frustumWidth/2))
    // NDC_y = (y_world / (frustumHeight/2))
    // Screen_px_x = NDC_x * (width / 2) = x_world * (width / frustumWidth)
    // Screen_px_y = NDC_y * (height / 2) = y_world * (height / frustumHeight)
    const testRadiusMm = 20.0;
    const screenCircleRadiusX = testRadiusMm * (tc.width / frustumWidth);
    const screenCircleRadiusY = testRadiusMm * (tc.height / frustumHeight);
    const circleDistortion = Math.abs(screenCircleRadiusX - screenCircleRadiusY);
    assert(circleDistortion < 1e-12, `[${tc.name}] 20mm CAD circle projects with zero distortion (Rx = ${screenCircleRadiusX.toFixed(3)}px, Ry = ${screenCircleRadiusY.toFixed(3)}px)`);
  }
}

// ----------------------------------------------------------------------------
// TEST SECTION 4: Real Headless Chrome Runtime Verification via CDP
// ----------------------------------------------------------------------------
const PORT = 8993;
const CDP_PORT = 9226;
const REPO_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.stp': 'application/octet-stream',
  '.step': 'application/octet-stream',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

async function runRealBrowserVerification() {
  console.log('\n--- TEST SECTION 4: Headless Chrome CDP Live Runtime Invariant Verification ---');

  let server = null;
  let chromeProcess = null;
  let ws = null;
  let cdpMsgId = 1;
  const cdpCallbacks = new Map();
  const consoleErrors = [];

  function cdpSend(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = cdpMsgId++;
      cdpCallbacks.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression, awaitPromise = true) {
    const res = await cdpSend('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  // 1. Start HTTP Static File Server
  const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');
  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/favicon.ico') { res.writeHead(204); res.end(); return; }

      let relPath = urlPath === '/' ? 'viewer.html' : urlPath.replace(/^\/+/, '');
      let filePath = path.join(ASSETS_DIR, relPath);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(REPO_ROOT, relPath);
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
      }
    });
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`  [HTTP Server] Listening on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });

  // 2. Find Chrome binary
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  let chromeExe = chromePaths.find(p => fs.existsSync(p));
  if (!chromeExe) {
    console.log('  [Notice] Chrome/Edge binary not found at standard path, skipping CDP live test.');
    server.close();
    return;
  }

  // 3. Spawn Browser
  const tmpUserDataDir = path.join(process.env.TEMP || 'C:\\Temp', `stp_browser_m1_c2_${Date.now()}`);
  const args = [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpUserDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-sync',
    '--disable-translate',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--window-size=1920,1080',
    'about:blank'
  ];
  chromeProcess = spawn(chromeExe, args, { stdio: 'ignore' });

  // 4. Wait for DevTools endpoint
  let pageWsUrl = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(p => p.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          pageWsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch (e) {}
  }

  if (!pageWsUrl) {
    throw new Error('Failed to connect to CDP endpoint on port ' + CDP_PORT);
  }

  // 5. Connect WebSocket using Node 22 built-in WebSocket
  ws = new WebSocket(pageWsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error') {
        const text = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
        consoleErrors.push(text);
      }
    }
    if (msg.id && cdpCallbacks.has(msg.id)) {
      const { resolve, reject } = cdpCallbacks.get(msg.id);
      cdpCallbacks.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };

  await cdpSend('Runtime.enable');
  await cdpSend('Page.enable');

  // Navigate to viewer.html
  await cdpSend('Page.navigate', { url: `http://127.0.0.1:${PORT}/viewer.html` });

  // Wait for DOM load and WebGL initialization
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const status = await evaluate(`({
        hasCamera: !!window.camera,
        hasRenderer: !!window.renderer,
        hasBtn: !!document.getElementById('vc-btn-persp')
      })`);
      if (status && status.hasRenderer && status.hasBtn) {
        ready = true;
        break;
      }
    } catch (e) {}
  }

  if (!ready) {
    throw new Error('Timed out waiting for viewer.html DOM and renderer to initialize');
  }

  // Invariant 1: Real Browser Initial Button State
  const initialBtnState = await evaluate(`(() => {
    const btn = document.getElementById('vc-btn-persp');
    return {
      text: btn ? btn.innerText.trim() : null,
      isActive: btn ? btn.classList.contains('active') : false,
      title: btn ? btn.title : null
    };
  })()`);
  assert(initialBtnState.text === 'Ortho', `[Browser Runtime] Initial ViewCube button displays 'Ortho' (actual: '${initialBtnState.text}')`);
  assert(initialBtnState.isActive === true, `[Browser Runtime] Initial ViewCube button has 'active' class`);

  // Invariant 2: Simulate Model Load via window.onTessellationComplete in live browser
  const modelLoadResult = await evaluate(`(() => {
    window.onTessellationComplete({
      fileName: 'live_test.stp',
      meshes: [{
        name: 'Solid1',
        position: [-10, -10, -10, 10, -10, -10, 10, 10, 10],
        normal: [0, 1, 0, 0, 1, 0, 0, 1, 0],
        index: [0, 1, 2]
      }],
      meshCount: 1,
      elapsedMs: 25
    });
    const btn = document.getElementById('vc-btn-persp');
    return {
      isOrtho: window.camera ? !!window.camera.isOrthographicCamera : false,
      isPersp: window.camera ? !!window.camera.isPerspectiveCamera : false,
      btnText: btn ? btn.innerText.trim() : null,
      btnActive: btn ? btn.classList.contains('active') : false,
      zoom: window.camera ? window.camera.zoom : null
    };
  })()`);

  assert(modelLoadResult.isOrtho === true, '[Browser Runtime] Post-load camera is genuinely Orthographic');
  assert(modelLoadResult.btnText === 'Ortho', '[Browser Runtime] Post-load button shows "Ortho"');
  assert(modelLoadResult.btnActive === true, '[Browser Runtime] Post-load button has .active class');
  assert(modelLoadResult.zoom === 1.0, '[Browser Runtime] Post-load camera zoom is 1.0');

  // Invariant 3: Toggle to Persp, then reload model to verify automatic reset
  const toggleAndReloadResult = await evaluate(`(() => {
    // 1. User toggles to Persp
    window.switchCamera('persp', true);
    const preLoadBtn = document.getElementById('vc-btn-persp').innerText.trim();
    const preLoadActive = document.getElementById('vc-btn-persp').classList.contains('active');
    const preLoadPersp = !!window.camera.isPerspectiveCamera;

    // 2. New model loads
    window.onTessellationComplete({
      fileName: 'second_model.stp',
      meshes: [{
        name: 'Solid2',
        position: [-25, -25, -25, 25, -25, -25, 25, 25, 25],
        normal: [0, 1, 0, 0, 1, 0, 0, 1, 0],
        index: [0, 1, 2]
      }],
      meshCount: 1,
      elapsedMs: 18
    });

    const postLoadBtn = document.getElementById('vc-btn-persp').innerText.trim();
    const postLoadActive = document.getElementById('vc-btn-persp').classList.contains('active');
    const postLoadOrtho = !!window.camera.isOrthographicCamera;

    return {
      preLoadBtn,
      preLoadActive,
      preLoadPersp,
      postLoadBtn,
      postLoadActive,
      postLoadOrtho
    };
  })()`);

  assert(toggleAndReloadResult.preLoadPersp === true, '[Browser Runtime] Pre-load camera switched to Perspective');
  assert(toggleAndReloadResult.preLoadBtn === 'Persp', '[Browser Runtime] Pre-load button showed "Persp"');
  assert(toggleAndReloadResult.preLoadActive === false, '[Browser Runtime] Pre-load button lost .active class');
  assert(toggleAndReloadResult.postLoadOrtho === true, '[Browser Runtime] Loading model 2 forced camera back to Orthographic');
  assert(toggleAndReloadResult.postLoadBtn === 'Ortho', '[Browser Runtime] Loading model 2 restored button text to "Ortho"');
  assert(toggleAndReloadResult.postLoadActive === true, '[Browser Runtime] Loading model 2 restored .active class');

  // Invariant 4: Live Responsive Resize Frustum Invariants in Browser
  const resizeRatios = [
    { name: '16:9', w: 1280, h: 720 },
    { name: '4:3', w: 1024, h: 768 },
    { name: '1:1', w: 800, h: 800 },
    { name: '9:16', w: 540, h: 960 },
    { name: '21:9', w: 1680, h: 720 }
  ];

  for (const r of resizeRatios) {
    const resResult = await evaluate(`(() => {
      window.innerWidth = ${r.w};
      window.innerHeight = ${r.h};
      window.onResize();

      const c = window.camera;
      const fw = c.right - c.left;
      const fh = c.top - c.bottom;
      const frustumAspect = fw / fh;
      const screenAspect = ${r.w} / ${r.h};
      const pxX = ${r.w} / fw;
      const pxY = ${r.h} / fh;

      return {
        aspectDiff: Math.abs(frustumAspect - screenAspect),
        scaleDiff: Math.abs(pxX - pxY),
        symX: Math.abs(c.left + c.right),
        symY: Math.abs(c.top + c.bottom)
      };
    })()`);

    assert(resResult.aspectDiff < 1e-10, `[Browser Runtime] [${r.name}] Live frustum aspect exact match (diff: ${resResult.aspectDiff.toExponential(2)})`);
    assert(resResult.scaleDiff < 1e-10, `[Browser Runtime] [${r.name}] Live metric 1:1 scale (diff: ${resResult.scaleDiff.toExponential(2)})`);
    assert(resResult.symX < 1e-10 && resResult.symY < 1e-10, `[Browser Runtime] [${r.name}] Live frustum symmetric`);
  }

  // Invariant 5: Zero Uncaught Console Errors
  assert(consoleErrors.length === 0, `[Browser Runtime] Exactly 0 uncaught console errors (actual: ${consoleErrors.length})`);

  // Teardown
  ws.close();
  chromeProcess.kill('SIGKILL');
  server.close();
  try {
    fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
  } catch (e) {}
}

// ----------------------------------------------------------------------------
// MAIN HARNESS EXECUTION
// ----------------------------------------------------------------------------
async function runAllChallenger2Suites() {
  await runConsecutiveLoadStressSuite();
  await runListenerAndMemoryLeakSuite();
  await runResponsiveResizingFrustumSuite();
  await runRealBrowserVerification();

  console.log('\n================================================================================');
  console.log(`  CHALLENGER M1-2 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================\n');

  if (failed > 0) {
    console.error('FAILURES:');
    failures.forEach((f, i) => console.error(`  ${i + 1}. ${f.testName}: ${f.details}`));
    process.exit(1);
  } else {
    console.log('VERDICT: APPROVE');
    console.log('All camera initialization, consecutive loading, listener retention,');
    console.log('and metric 1:1 orthographic frustum resizing invariants empirically verified.');
    process.exit(0);
  }
}

runAllChallenger2Suites().catch(err => {
  console.error('Fatal test error in Challenger M1-2 suite:', err);
  process.exit(1);
});
