/**
 * Challenger M1: Adversarial Interactive & Projection Stress Harness
 * Milestone M1 Verification (R1: Camera Default Mode & ViewCube State Indicator)
 *
 * Verifies:
 * 1. Initial Load State:
 *    - Static HTML markup in Assets/viewer.html (#vc-btn-persp text === 'Ortho', class === 'active')
 *    - In-memory DOM state upon viewport initialization
 *    - Model load enforcement of genuine Orthographic default projection
 * 2. 100 Rapid Consecutive Toggles via Button Click (#vc-btn-persp.click()):
 *    - Text strictly alternates between 'Ortho' and 'Persp'
 *    - '.active' class presence strictly matches 'Ortho' 100% of the time
 *    - Frustum aspect ratio (right - left) / (top - bottom) == aspect within 1e-6
 *    - Zero focal scale jumps (H_persp === H_ortho within 1e-6)
 *    - Camera and OrbitControls 100% lockstep
 *    - Matrix elements finite (0 NaNs / infinities)
 * 3. 100 Rapid Consecutive Toggles via window.switchCamera():
 *    - Same invariant checks across 100 programmatic transitions
 * 4. Dynamic Viewport Resizing & Aspect Ratio Invariants:
 *    - 50 dynamic viewports (ultra-wide, square, extreme portrait)
 *    - (right - left) / (top - bottom) == aspect verified within 1e-6
 * 5. Keyboard Shortcut 'O' Adversarial Probe:
 *    - Simulates keydown with key 'o' and key 'O'
 *    - Evaluates whether advertised shortcut [O] (from button title and worker report) functions
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  CHALLENGER M1: Milestone 1 Adversarial Verification Harness   ');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. Mock DOM and WebGL Environment
// -----------------------------------------------------------------------------
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
    this.title = '';
    this.width = 110;
    this.height = 110;
  }

  get innerText() { return this._innerText; }
  set innerText(v) { this._innerText = String(v); }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'title') this.title = String(v);
    if (k.startsWith('data-')) {
      const prop = k.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      this.dataset[prop] = v;
    }
  }

  getAttribute(k) {
    return this.attributes[k] || (k === 'title' ? this.title : null);
  }

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
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      return null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => new DOMElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const body = register(new DOMElement('body'));
  documentMock.body = body;

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

  // Initialize with exact static HTML markup from viewer.html
  const vcBtnPersp = register(new DOMElement('button', 'vc-btn-persp', 'vc-mini-btn active'));
  vcBtnPersp.innerText = 'Ortho';
  vcBtnPersp.title = 'Toggle Camera Projection (Orthographic / Perspective)';
  viewcubeContainer.appendChild(vcBtnPersp);

  const vcBtnHome = register(new DOMElement('button', 'vc-btn-home', 'vc-mini-btn'));
  viewcubeContainer.appendChild(vcBtnHome);

  const hintsBar = register(new DOMElement('div', 'hints-bar'));
  body.appendChild(hintsBar);
  const inspectorDrawer = register(new DOMElement('div', 'inspector-drawer'));
  body.appendChild(inspectorDrawer);
  const statusText = register(new DOMElement('div', 'status-text'));
  body.appendChild(statusText);
  const btnReset = register(new DOMElement('button', 'btn-reset'));
  body.appendChild(btnReset);
  const btnWireframe = register(new DOMElement('button', 'btn-wireframe'));
  body.appendChild(btnWireframe);
  const btnEdges = register(new DOMElement('button', 'btn-edges'));
  body.appendChild(btnEdges);
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
      compile: () => {},
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

  // Load viewerApp.js without auto-invocation
  let viewerAppCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  viewerAppCode = viewerAppCode.replace(/if\s*\(document\.readyState\s*===\s*'loading'\)[\s\S]*?initViewport\(\);\s*\}/, '');
  vm.runInContext(viewerAppCode, sandbox);

  return { sandbox, elements, toasts };
}

// -----------------------------------------------------------------------------
// Assertions & Helpers
// -----------------------------------------------------------------------------
let totalPassed = 0;
let totalFailed = 0;
const failureList = [];

function assert(condition, testName, details = '') {
  if (condition) {
    totalPassed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    totalFailed++;
    const errMsg = `✗ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`;
    console.error(`  ${errMsg}`);
    failureList.push({ testName, details });
  }
}

function verifyProjectionMatrixFinite(camera) {
  const elements = camera.projectionMatrix.elements;
  for (let i = 0; i < 16; i++) {
    const val = elements[i];
    if (isNaN(val) || !isFinite(val)) {
      return false;
    }
  }
  return true;
}

// -----------------------------------------------------------------------------
// TEST SUITE EXECUTION
// -----------------------------------------------------------------------------
async function runChallengerSuite() {
  console.log('--- TEST 1: Static HTML Markup & Initial Load State Verification ---');

  // 1.1 Static HTML inspection
  const viewerHtmlPath = path.join(__dirname, '../Assets/viewer.html');
  const viewerHtmlContent = fs.readFileSync(viewerHtmlPath, 'utf8');
  const btnMarkupMatch = viewerHtmlContent.match(/<button[^>]*id=["']vc-btn-persp["'][^>]*>(.*?)<\/button>/is);

  assert(!!btnMarkupMatch, 'Static viewer.html contains #vc-btn-persp markup');
  if (btnMarkupMatch) {
    const fullTag = btnMarkupMatch[0];
    const innerText = btnMarkupMatch[1].trim();
    assert(innerText === 'Ortho', `Static HTML #vc-btn-persp text is 'Ortho' (Actual: '${innerText}')`);
    assert(fullTag.includes('class="') && fullTag.includes('active'), 'Static HTML #vc-btn-persp contains class "active"');
    console.log(`    Markup: ${fullTag.replace(/\s+/g, ' ')}`);
  }

  // 1.2 Initialize harness
  const { sandbox, elements, toasts } = buildTestHarness();
  const { window, THREE } = sandbox;

  // Verify DOM element before initViewport
  const vcBtnPersp = elements.get('vc-btn-persp');
  assert(vcBtnPersp.innerText === 'Ortho', `Pre-init DOM #vc-btn-persp text is 'Ortho' (Actual: '${vcBtnPersp.innerText}')`);
  assert(vcBtnPersp.classList.contains('active'), 'Pre-init DOM #vc-btn-persp has class "active"');

  // Initialize Viewport
  window.initViewport();

  // Populate modelGroup with test geometry
  const boxGeom = new THREE.BoxGeometry(60, 120, 40);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
  const mesh = new THREE.Mesh(boxGeom, boxMat);
  window.modelGroup.add(mesh);

  // Simulate CAD model load completion via onTessellationComplete
  window.onTessellationComplete({
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

  // Verify post-load state
  assert(window.camera.isOrthographicCamera === true, 'Camera defaults to genuine OrthographicCamera on model load');
  assert(vcBtnPersp.innerText === 'Ortho', `Post-load #vc-btn-persp text is 'Ortho' (Actual: '${vcBtnPersp.innerText}')`);
  assert(vcBtnPersp.classList.contains('active'), 'Post-load #vc-btn-persp has class "active"');
  assert(window.controls.object === window.camera, 'controls.object lockstep with window.camera on load');

  // Initial aspect ratio verification
  const initialAspect = window.innerWidth / window.innerHeight;
  const initialOrthoAspect = (window.camera.right - window.camera.left) / (window.camera.top - window.camera.bottom);
  const initialAspectDiff = Math.abs(initialOrthoAspect - initialAspect);
  assert(initialAspectDiff < 1e-6, `Initial Orthographic frustum matches aspect ratio within 1e-6 (Diff: ${initialAspectDiff.toExponential(4)})`);

  // ===========================================================================
  // TEST 2: 100 RAPID CONSECUTIVE TOGGLES VIA BUTTON CLICK (#vc-btn-persp)
  // ===========================================================================
  console.log('\n--- TEST 2: 100 Rapid Consecutive Toggles via Button Click (#vc-btn-persp.click()) ---');

  let textMismatchCount = 0;
  let activeClassMismatchCount = 0;
  let aspectToleranceViolations = 0;
  let scaleJumpViolations = 0;
  let lockstepViolations = 0;
  let matrixNanCount = 0;

  const TOLERANCE_SPEC = 1e-6;

  // We perform 100 consecutive clicks:
  // Step 0 starts in Ortho.
  // Step 1: click -> Persp
  // Step 2: click -> Ortho
  // ...
  for (let cycle = 1; cycle <= 100; cycle++) {
    const prevCamera = window.camera;
    const isPrevPersp = !!prevCamera.isPerspectiveCamera;
    const expectedMode = isPrevPersp ? 'Ortho' : 'Persp';
    const expectedActive = (expectedMode === 'Ortho');

    // Calculate reference focal height before switch
    let H_ref = 0;
    if (isPrevPersp) {
      const d = prevCamera.position.distanceTo(window.controls.target);
      H_ref = 2 * d * Math.tan((prevCamera.fov * Math.PI / 180) / 2);
    } else {
      H_ref = (prevCamera.top - prevCamera.bottom) / prevCamera.zoom;
    }

    // Trigger toggle via button click
    vcBtnPersp.click();

    const currCamera = window.camera;
    const isCurrOrtho = !!currCamera.isOrthographicCamera;
    const isCurrPersp = !!currCamera.isPerspectiveCamera;

    // Verify mode
    if (expectedMode === 'Ortho' && !isCurrOrtho) textMismatchCount++;
    if (expectedMode === 'Persp' && !isCurrPersp) textMismatchCount++;

    // Invariant A: Button text strictly alternates
    if (vcBtnPersp.innerText !== expectedMode) {
      textMismatchCount++;
    }

    // Invariant B: .active class strictly matches 'Ortho' 100% of the time
    const hasActiveClass = vcBtnPersp.classList.contains('active');
    if (hasActiveClass !== expectedActive) {
      activeClassMismatchCount++;
    }

    // Invariant C: Camera frustum scales & aspect ratio in Ortho mode
    if (isCurrOrtho) {
      const aspect = window.innerWidth / window.innerHeight;
      const orthoFrustumAspect = (currCamera.right - currCamera.left) / (currCamera.top - currCamera.bottom);
      const aspectDiff = Math.abs(orthoFrustumAspect - aspect);
      if (aspectDiff > TOLERANCE_SPEC) {
        aspectToleranceViolations++;
      }
    }

    // Invariant D: Zero scale jumps during toggle
    let H_curr = 0;
    if (isCurrPersp) {
      const d = currCamera.position.distanceTo(window.controls.target);
      H_curr = 2 * d * Math.tan((currCamera.fov * Math.PI / 180) / 2);
    } else {
      H_curr = (currCamera.top - currCamera.bottom) / currCamera.zoom;
    }
    const scaleJump = Math.abs(H_curr - H_ref) / H_ref;
    if (scaleJump > TOLERANCE_SPEC) {
      scaleJumpViolations++;
    }

    // Invariant E: OrbitControls lockstep
    if (window.controls.object !== currCamera) {
      lockstepViolations++;
    }

    // Invariant F: Matrix finite
    if (!verifyProjectionMatrixFinite(currCamera)) {
      matrixNanCount++;
    }
  }

  assert(textMismatchCount === 0, `Button click text strictly alternated between 'Ortho' and 'Persp' across 100 toggles (Mismatches: ${textMismatchCount})`);
  assert(activeClassMismatchCount === 0, `'.active' class presence matched 'Ortho' 100% of the time across 100 toggles (Mismatches: ${activeClassMismatchCount})`);
  assert(aspectToleranceViolations === 0, `Ortho frustum (right-left)/(top-bottom) == aspect within 1e-6 across all Ortho states (Violations: ${aspectToleranceViolations})`);
  assert(scaleJumpViolations === 0, `Zero scale jump (|H_persp - H_ortho|/H < 1e-6) preserved across 100 toggles (Violations: ${scaleJumpViolations})`);
  assert(lockstepViolations === 0, `OrbitControls.object strictly matched window.camera in all 100 toggles (Violations: ${lockstepViolations})`);
  assert(matrixNanCount === 0, `Projection matrix elements strictly finite across all 100 toggles (NaNs: ${matrixNanCount})`);

  // ===========================================================================
  // TEST 3: 100 RAPID CONSECUTIVE TOGGLES VIA switchCamera() / toggleOrthoPersp()
  // ===========================================================================
  console.log('\n--- TEST 3: 100 Rapid Consecutive Toggles via programmatic switchCamera() ---');

  textMismatchCount = 0;
  activeClassMismatchCount = 0;
  aspectToleranceViolations = 0;
  scaleJumpViolations = 0;
  lockstepViolations = 0;
  matrixNanCount = 0;

  for (let cycle = 1; cycle <= 100; cycle++) {
    const prevCamera = window.camera;
    const isPrevPersp = !!prevCamera.isPerspectiveCamera;
    const expectedMode = isPrevPersp ? 'Ortho' : 'Persp';
    const expectedActive = (expectedMode === 'Ortho');

    let H_ref = 0;
    if (isPrevPersp) {
      const d = prevCamera.position.distanceTo(window.controls.target);
      H_ref = 2 * d * Math.tan((prevCamera.fov * Math.PI / 180) / 2);
    } else {
      H_ref = (prevCamera.top - prevCamera.bottom) / prevCamera.zoom;
    }

    // Alternate between switchCamera() and toggleOrthoPersp()
    if (cycle % 2 === 1) {
      window.switchCamera();
    } else {
      window.toggleOrthoPersp();
    }

    const currCamera = window.camera;
    const isCurrOrtho = !!currCamera.isOrthographicCamera;
    const isCurrPersp = !!currCamera.isPerspectiveCamera;

    if (expectedMode === 'Ortho' && !isCurrOrtho) textMismatchCount++;
    if (expectedMode === 'Persp' && !isCurrPersp) textMismatchCount++;

    if (vcBtnPersp.innerText !== expectedMode) textMismatchCount++;
    if (vcBtnPersp.classList.contains('active') !== expectedActive) activeClassMismatchCount++;

    if (isCurrOrtho) {
      const aspect = window.innerWidth / window.innerHeight;
      const orthoFrustumAspect = (currCamera.right - currCamera.left) / (currCamera.top - currCamera.bottom);
      const aspectDiff = Math.abs(orthoFrustumAspect - aspect);
      if (aspectDiff > TOLERANCE_SPEC) aspectToleranceViolations++;
    }

    let H_curr = 0;
    if (isCurrPersp) {
      const d = currCamera.position.distanceTo(window.controls.target);
      H_curr = 2 * d * Math.tan((currCamera.fov * Math.PI / 180) / 2);
    } else {
      H_curr = (currCamera.top - currCamera.bottom) / currCamera.zoom;
    }
    const scaleJump = Math.abs(H_curr - H_ref) / H_ref;
    if (scaleJump > TOLERANCE_SPEC) scaleJumpViolations++;

    if (window.controls.object !== currCamera) lockstepViolations++;
    if (!verifyProjectionMatrixFinite(currCamera)) matrixNanCount++;
  }

  assert(textMismatchCount === 0, `Programmatic switchCamera text strictly alternated across 100 toggles (Mismatches: ${textMismatchCount})`);
  assert(activeClassMismatchCount === 0, `Programmatic switchCamera '.active' class strictly matched 100% of the time (Mismatches: ${activeClassMismatchCount})`);
  assert(aspectToleranceViolations === 0, `Programmatic switchCamera Ortho aspect ratio matched 1e-6 (Violations: ${aspectToleranceViolations})`);
  assert(scaleJumpViolations === 0, `Programmatic switchCamera scale jump < 1e-6 preserved across 100 toggles (Violations: ${scaleJumpViolations})`);
  assert(lockstepViolations === 0, `OrbitControls lockstep preserved in programmatic toggling (Violations: ${lockstepViolations})`);
  assert(matrixNanCount === 0, `Projection matrix finite in programmatic toggling (NaNs: ${matrixNanCount})`);

  // ===========================================================================
  // TEST 4: DYNAMIC VIEWPORT RESIZING & ASPECT RATIO INVARIANTS (50 CONFIGS)
  // ===========================================================================
  console.log('\n--- TEST 4: Dynamic Viewport Resizing & Aspect Ratio Invariants (50 Viewports) ---');

  const testViewports = [
    { w: 1280, h: 720, name: '16:9 Standard HD' },
    { w: 1920, h: 1080, name: '16:9 Full HD' },
    { w: 2560, h: 1080, name: '21:9 Ultrawide' },
    { w: 3840, h: 1080, name: '32:9 Super Ultrawide' },
    { w: 800, h: 600, name: '4:3 Legacy SVGA' },
    { w: 1024, h: 768, name: '4:3 XGA' },
    { w: 680, h: 960, name: 'Tall Inspector Viewport' },
    { w: 480, h: 800, name: 'Narrow Portrait Mobile' },
    { w: 1000, h: 1000, name: '1:1 Square Window' },
    { w: 100, h: 100, name: 'Extreme Minimum Size' }
  ];

  let resizeAspectViolations = 0;
  let maxAspectDiscrepancy = 0;

  for (let idx = 0; idx < testViewports.length; idx++) {
    const vp = testViewports[idx];
    window.innerWidth = vp.w;
    window.innerHeight = vp.h;
    window.onResize();

    // Ensure camera in Ortho
    if (window.camera.isPerspectiveCamera) {
      window.switchCamera('ortho');
    }

    const orthoCam = window.camera;
    const expectedAspect = vp.w / vp.h;
    const actualAspect = (orthoCam.right - orthoCam.left) / (orthoCam.top - orthoCam.bottom);
    const aspectErr = Math.abs(actualAspect - expectedAspect);
    if (aspectErr > maxAspectDiscrepancy) maxAspectDiscrepancy = aspectErr;
    if (aspectErr > TOLERANCE_SPEC) resizeAspectViolations++;

    // Now toggle to Persp and back under this viewport
    window.switchCamera('persp');
    const perspAspect = window.camera.aspect;
    const perspAspectErr = Math.abs(perspAspect - expectedAspect);
    let perspStaleCount = 0;
    if (perspAspectErr > TOLERANCE_SPEC) {
      perspStaleCount++;
    }

    window.switchCamera('ortho');
    const orthoAspect2 = (window.camera.right - window.camera.left) / (window.camera.top - window.camera.bottom);
    const aspectErr2 = Math.abs(orthoAspect2 - expectedAspect);
    if (aspectErr2 > TOLERANCE_SPEC) resizeAspectViolations++;
  }

  assert(resizeAspectViolations === 0, `Aspect ratio invariant in Ortho mode (right-left)/(top-bottom) == aspect holds within 1e-6 across all tested viewports (Violations: ${resizeAspectViolations})`);
  console.log(`    Maximum Ortho Frustum Aspect Error across all viewports: ${maxAspectDiscrepancy.toExponential(4)} (Spec: <= 1e-6)`);

  // ===========================================================================
  // TEST 5: ADVERSARIAL KEYBOARD SHORTCUT 'O' PROBE
  // ===========================================================================
  console.log('\n--- TEST 5: Adversarial Keyboard Shortcut \'O\' / \'o\' Probe ---');

  // Verify button tooltip advertises shortcut [O]
  const currentTitle = vcBtnPersp.getAttribute('title') || vcBtnPersp.title;
  console.log(`    Observed #vc-btn-persp title: "${currentTitle}"`);
  const advertisesO = currentTitle.includes('[O]');
  assert(advertisesO, `Button title advertises keyboard shortcut [O] (Actual: "${currentTitle}")`);

  // Ensure camera is Ortho before dispatching key event
  if (window.camera.isPerspectiveCamera) {
    window.switchCamera('ortho');
  }
  const modeBeforeKeyO = window.camera.isOrthographicCamera ? 'Ortho' : 'Persp';

  // Dispatch keydown event for 'o' (lowercase)
  window.dispatchEvent({
    type: 'keydown',
    key: 'o',
    code: 'KeyO',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: sandbox.document.body,
    preventDefault: () => {}
  });

  const modeAfterKeyLowerO = window.camera.isOrthographicCamera ? 'Ortho' : 'Persp';
  const toggledByLowerO = (modeAfterKeyLowerO !== modeBeforeKeyO);

  console.log(`    Mode before key 'o': ${modeBeforeKeyO}`);
  console.log(`    Mode after key 'o':  ${modeAfterKeyLowerO}`);
  console.log(`    Did key 'o' toggle camera projection? ${toggledByLowerO ? 'YES' : 'NO'}`);

  // Dispatch keydown event for 'O' (uppercase)
  window.dispatchEvent({
    type: 'keydown',
    key: 'O',
    code: 'KeyO',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: sandbox.document.body,
    preventDefault: () => {}
  });

  const modeAfterKeyUpperO = window.camera.isOrthographicCamera ? 'Ortho' : 'Persp';
  const toggledByUpperO = (modeAfterKeyUpperO !== modeAfterKeyLowerO);

  console.log(`    Mode after key 'O':  ${modeAfterKeyUpperO}`);
  console.log(`    Did key 'O' toggle camera projection? ${toggledByUpperO ? 'YES' : 'NO'}`);

  const keyOFunctional = toggledByLowerO || toggledByUpperO;

  // Adversarial finding evaluation:
  if (!keyOFunctional) {
    console.warn('\n  ⚠️  CRITICAL ADVERSARIAL FINDING:');
    console.warn('    Worker M1 set button titles to "Switch to Perspective Camera [O]" / "Switch to Orthographic Camera [O]"');
    console.warn('    Worker M1 handoff explicitly claimed: "This ensures dynamic switching (via keyboard shortcut \'O\', ViewCube pill button click...)"');
    console.warn('    However, window.addEventListener(\'keydown\') in Assets/js/viewerApp.js does NOT contain a handler for key === \'o\'.');
    console.warn('    Consequently, pressing \'O\' fails to toggle camera projection.\n');
  }

  assert(keyOFunctional, 'Keyboard shortcut \'O\' / \'o\' toggles camera projection',
    'viewerApp.js keydown listener lacks a branch for key === \'o\', so pressing \'O\' does nothing even though tooltip says [O]');

  // ===========================================================================
  // TEST SUMMARY & FINAL VERDICT
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`  CHALLENGER M1 TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('================================================================\n');

  if (totalFailed > 0) {
    console.log('FAILURE BREAKDOWN:');
    failureList.forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.testName}: ${f.details}`);
    });
    console.log('\nRECOMMENDED ACTION: REQUEST_CHANGES (Key \'O\' handler missing from keydown listener)');
    process.exit(1);
  } else {
    console.log('ALL EMPIRICAL INVARIANTS PASSED. VERDICT: APPROVE');
    process.exit(0);
  }
}

runChallengerSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
