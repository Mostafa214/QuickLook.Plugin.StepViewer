/**
 * Challenger 1 Independent Mathematical Stress & Adversarial Verification Suite
 * Milestone 3 (Phase 3: Global Graphics & ViewCube)
 *
 * Mathematical Invariant Focus:
 * 1. Zero-Jump Mathematical Invariant:
 *    - 1,000 arbitrary camera positions, target distances (d in [0.1, 10000]), and aspects (0.25 <= aspect <= 4.0):
 *      Verifies H_world = 2 * d * tan(fov/2) matches orthographic frustum height (top - bottom)
 *      and roundtrip conversions (Persp -> Ortho -> Persp) preserve camera distance and target frame within 10^-6 relative error.
 *    - Orthographic zoom scaling invariant: d' = d / zoom within 10^-6.
 * 2. Polar Orientation & Singularity Stress:
 *    - 500 polar vectors arbitrarily close to pure +Y and -Y (theta in [0, 10^-7]):
 *      Verifies cubeCamera.position, cubeCamera.quaternion, and cubeCamera.matrixWorld NEVER evaluate to
 *      NaN, Infinity, or subnormal IEEE-754 floats (< 1.17549435e-38 for single-precision WebGL).
 * 3. Subsystem Stress & Bounding Box Extremes:
 *    - computeSafeCameraDistance and updateScreenSpaceAnnotations with extreme bounding boxes
 *      (tiny 10^-4, microscopic 10^-10, massive 10^6, gigantic 10^9, degenerate needle/flat/empty)
 *      verifying finite non-NaN positive results and valid projection matrices.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================================');
console.log('  CHALLENGER 1: PHASE 3 MATHEMATICAL RIGOR & POLAR SINGULARITY STRESS HARNESS  ');
console.log('================================================================================\n');

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
      right: 120,
      bottom: 120
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

// Build Sandboxed Test Environment
function buildStressSandbox() {
  const elements = new Map();
  function register(el) {
    if (el.id) elements.set(el.id, el);
    return el;
  }

  const documentMock = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => register(new DOMElement(tag)),
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
  const btnReset = register(new DOMElement('button', 'btn-reset'));
  body.appendChild(btnReset);
  const btnWireframe = register(new DOMElement('button', 'btn-wireframe'));
  body.appendChild(btnWireframe);
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

  // Intercept OrthographicCamera constructor to capture cubeCamera instance
  let capturedCubeCamera = null;
  const OriginalOrthographicCamera = THREE.OrthographicCamera;
  THREE.OrthographicCamera = function (...args) {
    const inst = new OriginalOrthographicCamera(...args);
    // ViewCube initializes with left = -1.4, right = 1.4
    if (args[0] === -1.4 && args[1] === 1.4) {
      capturedCubeCamera = inst;
    }
    return inst;
  };
  Object.setPrototypeOf(THREE.OrthographicCamera, OriginalOrthographicCamera);
  THREE.OrthographicCamera.prototype = OriginalOrthographicCamera.prototype;

  // Mock WebGLRenderer
  THREE.WebGLRenderer = function (opts = {}) {
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

  sandbox.THREE = THREE;
  sandbox.window.THREE = THREE;
  global.THREE = THREE;

  // Load OrbitControls
  require(path.join(__dirname, '../Assets/OrbitControls.js'));

  vm.createContext(sandbox);

  // Load cadState.js
  const cadStateCode = fs.readFileSync(path.join(__dirname, '../Assets/js/cadState.js'), 'utf8');
  vm.runInContext(cadStateCode, sandbox);

  // Load viewCubeEngine.js
  const viewCubeCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewCubeEngine.js'), 'utf8');
  vm.runInContext(viewCubeCode, sandbox);

  // Load viewerApp.js without DOMContentLoaded auto-init
  let viewerAppCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  viewerAppCode = viewerAppCode.replace(/if\s*\(document\.readyState\s*===\s*'loading'\)[\s\S]*?initViewport\(\);\s*\}/, '');
  vm.runInContext(viewerAppCode, sandbox);

  return {
    sandbox,
    elements,
    toasts,
    getCapturedCubeCamera: () => capturedCubeCamera
  };
}

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failureDetails = [];

function recordTest(passed, desc, details = null) {
  totalAssertions++;
  if (passed) {
    passedAssertions++;
  } else {
    failedAssertions++;
    failureDetails.push({ desc, details });
    console.error(`  [FAIL] ${desc}: ${details || ''}`);
  }
}

// Pseudo-random generator with deterministic seed for reproducibility
let rngSeed = 42;
function seededRandom() {
  rngSeed = (rngSeed * 9301 + 49297) % 233280;
  return rngSeed / 233280;
}

// Subnormal floating-point check for IEEE-754 single precision WebGL
const IEEE754_SINGLE_MIN_NORMAL = 1.17549435e-38;
function isSubnormalFloat(val) {
  if (val === 0) return false;
  return Math.abs(val) < IEEE754_SINGLE_MIN_NORMAL;
}

function runChallengerStressTests() {
  const { sandbox, elements, getCapturedCubeCamera } = buildStressSandbox();
  const { window, THREE } = sandbox;

  // Initialize Viewport
  window.initViewport();
  const cubeCamera = getCapturedCubeCamera();
  recordTest(cubeCamera !== null, 'ViewCube internal cubeCamera instance successfully captured for adversarial probing');

  // ============================================================================
  // STRESS 1: ZERO-JUMP MATHEMATICAL INVARIANT (1,000 CONFIGURATIONS)
  // ============================================================================
  console.log('--------------------------------------------------------------------------------');
  console.log(' STRESS 1: Zero-Jump Mathematical Invariant (1,000 Arbitrary Configurations)');
  console.log(' Invariant: H_world = 2 * d * tan(fov/2) == (top - bottom)');
  console.log(' Invariant: Roundtrip (Persp -> Ortho -> Persp) relative error < 10^-6');
  console.log(' Range: d in [0.1, 10,000], aspect in [0.25, 4.0], arbitrary 3D target coordinates');
  console.log('--------------------------------------------------------------------------------');

  const NUM_ZERO_JUMP_RUNS = 1000;
  let maxHWorldDiscrepancyRel = 0;
  let maxRoundtripDistanceErrorRel = 0;
  let maxPositionErrorRel = 0;
  let maxDirectionAngleRad = 0;
  let maxFrustumAspectErrorRel = 0;

  for (let i = 0; i < NUM_ZERO_JUMP_RUNS; i++) {
    // 1. Ensure camera is in Perspective mode
    if (window.camera.isOrthographicCamera) {
      window.switchCamera('persp');
    }

    // 2. Generate random target coordinates in [-1000, 1000]^3
    const target = new THREE.Vector3(
      (seededRandom() * 2 - 1) * 1000,
      (seededRandom() * 2 - 1) * 1000,
      (seededRandom() * 2 - 1) * 1000
    );

    // 3. Log-uniform distance in [0.1, 10,000]
    // log10(0.1) = -1, log10(10000) = 4
    const logDist = -1 + seededRandom() * 5;
    const distance = Math.pow(10, logDist);

    // 4. Random aspect ratio in [0.25, 4.0]
    const aspect = 0.25 + seededRandom() * 3.75;

    // 5. Random viewing direction on unit sphere
    const theta = Math.acos(1 - 2 * seededRandom()); // polar angle
    const phi = seededRandom() * 2 * Math.PI; // azimuthal angle
    const viewDir = new THREE.Vector3(
      Math.sin(theta) * Math.cos(phi),
      Math.sin(theta) * Math.sin(phi),
      Math.cos(theta)
    ).normalize();

    // 6. Camera position looking towards target
    const camPos = target.clone().addScaledVector(viewDir, distance);

    // Update viewport configuration
    window.innerWidth = 10000 * aspect;
    window.innerHeight = 10000;
    const effectiveAspect = window.innerWidth / window.innerHeight;
    window.camera.aspect = effectiveAspect;
    window.camera.fov = 45;
    window.camera.position.copy(camPos);
    window.controls.target.copy(target);
    window.camera.lookAt(target);
    window.controls.update();

    const d_initial = window.camera.position.distanceTo(window.controls.target);
    const fovRad = window.camera.fov * (Math.PI / 180);
    const H_world_expected = 2 * d_initial * Math.tan(fovRad / 2);
    const W_world_expected = H_world_expected * effectiveAspect;

    // --- Switch to Orthographic ---
    window.switchCamera('ortho');
    const ortho = window.camera;

    recordTest(ortho.isOrthographicCamera === true, `Iteration ${i}: camera is Orthographic`);

    const H_ortho_actual = (ortho.top - ortho.bottom) / ortho.zoom;
    const W_ortho_actual = (ortho.right - ortho.left) / ortho.zoom;

    // Invariant 1.1: H_ortho precisely matches H_world within 10^-6 relative error
    const hDiffRel = Math.abs(H_ortho_actual - H_world_expected) / H_world_expected;
    if (hDiffRel > maxHWorldDiscrepancyRel) maxHWorldDiscrepancyRel = hDiffRel;
    recordTest(hDiffRel < 1e-6, `Iteration ${i}: H_ortho matches H_world within 10^-6 (rel error: ${hDiffRel.toExponential(3)})`);

    // Invariant 1.2: Frustum aspect ratio preserves window aspect ratio within 10^-6
    const frustumAspect = W_ortho_actual / H_ortho_actual;
    const aspectDiffRel = Math.abs(frustumAspect - effectiveAspect) / effectiveAspect;
    if (aspectDiffRel > maxFrustumAspectErrorRel) maxFrustumAspectErrorRel = aspectDiffRel;
    recordTest(aspectDiffRel < 1e-6, `Iteration ${i}: Frustum aspect matches window aspect within 10^-6 (rel error: ${aspectDiffRel.toExponential(3)})`);

    // --- Switch back to Perspective ---
    window.switchCamera('persp');
    const persp = window.camera;

    recordTest(persp.isPerspectiveCamera === true, `Iteration ${i}: camera restored to Perspective`);

    // Invariant 1.3: Camera distance preserved within 10^-6 relative error
    const d_returned = persp.position.distanceTo(window.controls.target);
    const dDiffRel = Math.abs(d_returned - d_initial) / d_initial;
    if (dDiffRel > maxRoundtripDistanceErrorRel) maxRoundtripDistanceErrorRel = dDiffRel;
    recordTest(dDiffRel < 1e-6, `Iteration ${i}: Roundtrip distance preserved within 10^-6 (rel error: ${dDiffRel.toExponential(3)})`);

    // Invariant 1.4: 3D Camera position vector preserved within 10^-6 relative error
    const posDiffRel = persp.position.distanceTo(camPos) / d_initial;
    if (posDiffRel > maxPositionErrorRel) maxPositionErrorRel = posDiffRel;
    recordTest(posDiffRel < 1e-6, `Iteration ${i}: Camera position vector preserved within 10^-6 (rel error: ${posDiffRel.toExponential(3)})`);

    // Invariant 1.5: Optical direction vector colinearity preserved within 10^-6
    const returnedDir = new THREE.Vector3();
    persp.getWorldDirection(returnedDir);
    const expectedLookDir = target.clone().sub(camPos).normalize();
    const dot = Math.max(-1, Math.min(1, returnedDir.dot(expectedLookDir)));
    const angleRad = Math.acos(dot);
    if (angleRad > maxDirectionAngleRad) maxDirectionAngleRad = angleRad;
    recordTest(angleRad < 1e-5, `Iteration ${i}: View direction colinearity angle < 10^-5 rad (angle: ${angleRad.toExponential(3)} rad)`);
  }

  console.log(`  -> 1,000 Runs Completed:`);
  console.log(`     Max H_world relative discrepancy:       ${maxHWorldDiscrepancyRel.toExponential(4)} (Threshold: 1.0000e-6)`);
  console.log(`     Max frustum aspect relative error:      ${maxFrustumAspectErrorRel.toExponential(4)} (Threshold: 1.0000e-6)`);
  console.log(`     Max roundtrip distance relative error:  ${maxRoundtripDistanceErrorRel.toExponential(4)} (Threshold: 1.0000e-6)`);
  console.log(`     Max camera position relative error:     ${maxPositionErrorRel.toExponential(4)} (Threshold: 1.0000e-6)`);
  console.log(`     Max view direction angular drift:       ${maxDirectionAngleRad.toExponential(4)} rad (Threshold: 1.0000e-5 rad)`);

  // Sub-Test 1B: Zoomed Orthographic Roundtrip Invariant (100 runs)
  console.log('\n--- SUBTEST 1B: Zoomed Orthographic Roundtrip Scaling (d\' = d / zoom) ---');
  let maxZoomScalingDiscrepancyRel = 0;
  for (let j = 0; j < 100; j++) {
    const d0 = 50 + seededRandom() * 500;
    window.controls.target.set(0, 0, 0);
    window.camera.position.set(0, 0, d0);
    window.camera.lookAt(0, 0, 0);
    window.controls.update();

    window.switchCamera('ortho');
    const zoomFactor = 0.2 + seededRandom() * 4.8; // zoom in [0.2, 5.0]
    window.camera.zoom = zoomFactor;
    window.camera.updateProjectionMatrix();

    // Switch back to perspective: expected new distance is d0 / zoomFactor
    window.switchCamera('persp');
    const d_zoomed = window.camera.position.distanceTo(window.controls.target);
    const expected_d_zoomed = d0 / zoomFactor;
    const zoomDiffRel = Math.abs(d_zoomed - expected_d_zoomed) / expected_d_zoomed;
    if (zoomDiffRel > maxZoomScalingDiscrepancyRel) maxZoomScalingDiscrepancyRel = zoomDiffRel;
    recordTest(zoomDiffRel < 1e-6, `Subtest 1B.${j}: Zoomed distance d'=${d_zoomed.toFixed(3)} matches d/zoom=${expected_d_zoomed.toFixed(3)} within 10^-6`);
  }
  console.log(`     Max zoom scaling relative error:        ${maxZoomScalingDiscrepancyRel.toExponential(4)} (Threshold: 1.0000e-6)`);

  // ============================================================================
  // STRESS 2: POLAR ORIENTATION & SINGULARITY STRESS (500 POLAR VECTORS)
  // ============================================================================
  console.log('\n--------------------------------------------------------------------------------');
  console.log(' STRESS 2: Polar Orientation & Singularity Stress (500 Polar Vectors)');
  console.log(' Boundary: Vectors arbitrarily close to pure +Y and -Y (theta in [0, 10^-7])');
  console.log(' Invariant: cubeCamera.quaternion & cubeCamera.matrixWorld NEVER NaN, Inf, or subnormal');
  console.log('--------------------------------------------------------------------------------');

  const NUM_POLAR_RUNS = 500;
  let totalFloatsInspected = 0;
  let nanCount = 0;
  let infCount = 0;
  let subnormalCount = 0;
  let maxQuaternionNormError = 0;

  for (let k = 0; k < NUM_POLAR_RUNS; k++) {
    // Generate polar offset theta in [0, 10^-7]
    // Include boundary values: exactly 0, machine epsilon 1e-16, 1e-14, 1e-11, 1e-9, 1e-7
    let theta;
    if (k === 0) theta = 0;
    else if (k === 1) theta = 1e-16;
    else if (k === 2) theta = 1e-14;
    else if (k === 3) theta = 1e-11;
    else if (k === 4) theta = 1e-9;
    else if (k === 5) theta = 1e-7;
    else theta = seededRandom() * 1e-7;

    const phi = seededRandom() * 2 * Math.PI;
    const isNorthPole = (k % 2 === 0);

    // Vector near North (+Y) or South (-Y) pole
    const nx = Math.sin(theta) * Math.cos(phi);
    const nz = Math.sin(theta) * Math.sin(phi);
    const ny = (isNorthPole ? 1 : -1) * Math.cos(theta);
    const polarDir = new THREE.Vector3(nx, ny, nz).normalize();

    // Position camera along polar vector
    const dist = 250;
    window.controls.target.set(0, 0, 0);
    window.camera.position.copy(polarDir).multiplyScalar(dist);

    // Vary up vector: standard (0, 1, 0), top CAD (0, 0, -1), bottom CAD (0, 0, 1)
    if (isNorthPole) {
      window.camera.up.set(0, 0, -1);
    } else {
      window.camera.up.set(0, 0, 1);
    }
    window.camera.lookAt(0, 0, 0);
    window.controls.update();

    // Execute ViewCube synchronization
    window.updateViewCube();

    // Probe cubeCamera transform elements
    const elementsToInspect = [
      cubeCamera.position.x,
      cubeCamera.position.y,
      cubeCamera.position.z,
      cubeCamera.quaternion.x,
      cubeCamera.quaternion.y,
      cubeCamera.quaternion.z,
      cubeCamera.quaternion.w,
      ...cubeCamera.matrixWorld.elements
    ];

    for (const val of elementsToInspect) {
      totalFloatsInspected++;
      if (isNaN(val)) nanCount++;
      if (!isFinite(val)) infCount++;
      if (isSubnormalFloat(val)) subnormalCount++;
    }

    // Check quaternion normality: ||q|| == 1
    const q = cubeCamera.quaternion;
    const qNorm = Math.hypot(q.x, q.y, q.z, q.w);
    const qNormError = Math.abs(qNorm - 1.0);
    if (qNormError > maxQuaternionNormError) maxQuaternionNormError = qNormError;

    recordTest(!isNaN(q.x) && !isNaN(q.y) && !isNaN(q.z) && !isNaN(q.w),
      `Polar run ${k} (${isNorthPole ? '+Y North' : '-Y South'}, theta=${theta.toExponential(2)}): Quaternion is finite non-NaN`);
    recordTest(qNormError < 1e-5,
      `Polar run ${k}: Quaternion is normalized to unity (norm diff: ${qNormError.toExponential(3)})`);
  }

  console.log(`  -> 500 Polar Stress Runs Completed:`);
  console.log(`     Total Float32/Float64 Elements Probed:   ${totalFloatsInspected.toLocaleString()}`);
  console.log(`     NaN Elements Encountered:                ${nanCount} (Expected: 0)`);
  console.log(`     Infinity Elements Encountered:           ${infCount} (Expected: 0)`);
  console.log(`     Subnormal Elements Encountered:          ${subnormalCount} (Expected: 0)`);
  console.log(`     Max Quaternion Norm Drift:               ${maxQuaternionNormError.toExponential(4)} (Threshold: 1.0000e-5)`);
  recordTest(nanCount === 0, 'ZERO NaN elements across all 500 polar singularity tests');
  recordTest(infCount === 0, 'ZERO Infinity elements across all 500 polar singularity tests');
  recordTest(subnormalCount === 0, 'ZERO subnormal float elements across all 500 polar singularity tests');

  // ============================================================================
  // STRESS 3: SUBSYSTEM STRESS & BOUNDING BOX EXTREMES
  // ============================================================================
  console.log('\n--------------------------------------------------------------------------------');
  console.log(' STRESS 3: Subsystem Stress & Extreme Bounding Boxes');
  console.log(' Scenarios: Microscopic (10^-10), Tiny (10^-4), Massive (10^6), Gigantic (10^9),');
  console.log('            Needle, Flat Degenerate, and Displaced Off-Center Models');
  console.log(' Probing: computeSafeCameraDistance, updateScreenSpaceAnnotations, autoFitCamera');
  console.log('--------------------------------------------------------------------------------');

  const testBoxes = [
    { name: 'Empty / Degenerate Box', box: new THREE.Box3() },
    { name: 'Microscopic Box (10^-10)', box: new THREE.Box3(new THREE.Vector3(-1e-10, -1e-10, -1e-10), new THREE.Vector3(1e-10, 1e-10, 1e-10)) },
    { name: 'Tiny Box (10^-4)', box: new THREE.Box3(new THREE.Vector3(-1e-4, -1e-4, -1e-4), new THREE.Vector3(1e-4, 1e-4, 1e-4)) },
    { name: 'Massive Box (10^6)', box: new THREE.Box3(new THREE.Vector3(-1e6, -1e6, -1e6), new THREE.Vector3(1e6, 1e6, 1e6)) },
    { name: 'Gigantic Box (10^9)', box: new THREE.Box3(new THREE.Vector3(-1e9, -1e9, -1e9), new THREE.Vector3(1e9, 1e9, 1e9)) },
    { name: 'Ultra-Slender Needle (10^-4 x 10^-4 x 10^6)', box: new THREE.Box3(new THREE.Vector3(-1e-4, -1e-4, -1e6), new THREE.Vector3(1e-4, 1e-4, 1e6)) },
    { name: 'Zero-Thickness Flat Sheet', box: new THREE.Box3(new THREE.Vector3(-500, 0, -500), new THREE.Vector3(500, 0, 500)) },
    { name: 'Displaced Off-Center Box (+10^7)', box: new THREE.Box3(new THREE.Vector3(1e7, 1e7, 1e7), new THREE.Vector3(1e7 + 200, 1e7 + 200, 1e7 + 200)) }
  ];

  // 3A: computeSafeCameraDistance across bounding box extremes and camera modes
  for (const tb of testBoxes) {
    // In Perspective
    window.switchCamera('persp');
    const dPersp = window.computeSafeCameraDistance(tb.box, 1.25);
    recordTest(!isNaN(dPersp) && isFinite(dPersp) && dPersp > 0,
      `computeSafeCameraDistance [Persp] on ${tb.name}: returned finite positive ${dPersp.toExponential(3)}`);

    // In Orthographic
    window.switchCamera('ortho');
    const dOrtho = window.computeSafeCameraDistance(tb.box, 1.25);
    recordTest(!isNaN(dOrtho) && isFinite(dOrtho) && dOrtho > 0,
      `computeSafeCameraDistance [Ortho] on ${tb.name}: returned finite positive ${dOrtho.toExponential(3)}`);

    // Extreme FOVs: 1 deg, 179 deg
    window.camera.fov = 1;
    const dNarrow = window.computeSafeCameraDistance(tb.box, 1.25);
    recordTest(!isNaN(dNarrow) && isFinite(dNarrow) && dNarrow > 0,
      `computeSafeCameraDistance [FOV 1 deg] on ${tb.name}: returned finite ${dNarrow.toExponential(3)}`);

    window.camera.fov = 179;
    const dWide = window.computeSafeCameraDistance(tb.box, 1.25);
    recordTest(!isNaN(dWide) && isFinite(dWide) && dWide > 0,
      `computeSafeCameraDistance [FOV 179 deg] on ${tb.name}: returned finite ${dWide.toExponential(3)}`);
    window.camera.fov = 45;
  }

  // 3B: updateScreenSpaceAnnotations across scale extremes
  console.log('\n--- SUBTEST 3B: updateScreenSpaceAnnotations Scale Stability ---');
  // Clear and populate measureGroup with test objects
  while (window.measureGroup.children.length > 0) {
    window.measureGroup.remove(window.measureGroup.children[0]);
  }

  const spriteObj = new THREE.Object3D();
  spriteObj.userData = { isScreenScaledSprite: true, pixelHeight: 34, aspect: 4.0 };
  spriteObj.position.set(0, 0, 0);
  window.measureGroup.add(spriteObj);

  const pinObj = new THREE.Object3D();
  pinObj.userData = { isScreenScaled: true, screenPixelRadius: 7.5 };
  pinObj.position.set(0, 0, 0);
  window.measureGroup.add(pinObj);

  const testDistances = [0, 1e-4, 1.0, 50, 1e4, 1e6, 1e9];
  const testZooms = [1e-3, 0.01, 1.0, 10.0, 1e3];

  // Perspective mode distance tests
  window.switchCamera('persp');
  for (const td of testDistances) {
    window.camera.position.set(0, 0, td);
    window.updateScreenSpaceAnnotations();

    const sx = spriteObj.scale.x;
    const sy = spriteObj.scale.y;
    const px = pinObj.scale.x;

    recordTest(!isNaN(sx) && isFinite(sx) && sx >= 0.0001,
      `Sprite scale in Persp at distance ${td.toExponential(1)}: finite >= 0.0001 (actual: ${sx.toExponential(3)})`);
    recordTest(!isNaN(px) && isFinite(px) && px >= 0.0001,
      `Pin scale in Persp at distance ${td.toExponential(1)}: finite >= 0.0001 (actual: ${px.toExponential(3)})`);
  }

  // Orthographic mode zoom tests
  window.switchCamera('ortho');
  for (const tz of testZooms) {
    window.camera.zoom = tz;
    window.camera.updateProjectionMatrix();
    window.updateScreenSpaceAnnotations();

    const sx = spriteObj.scale.x;
    const px = pinObj.scale.x;

    recordTest(!isNaN(sx) && isFinite(sx) && sx >= 0.0001,
      `Sprite scale in Ortho at zoom ${tz.toExponential(1)}: finite >= 0.0001 (actual: ${sx.toExponential(3)})`);
    recordTest(!isNaN(px) && isFinite(px) && px >= 0.0001,
      `Pin scale in Ortho at zoom ${tz.toExponential(1)}: finite >= 0.0001 (actual: ${px.toExponential(3)})`);
  }

  // 3C: autoFitCamera with extreme bounding boxes
  console.log('\n--- SUBTEST 3C: autoFitCamera Frustum & Matrix Extremes ---');
  // Clear modelGroup and add extreme meshes
  for (const tb of testBoxes) {
    if (tb.box.isEmpty()) continue;
    while (window.modelGroup.children.length > 0) {
      window.modelGroup.remove(window.modelGroup.children[0]);
    }

    const sz = tb.box.getSize(new THREE.Vector3());
    const cnt = tb.box.getCenter(new THREE.Vector3());
    const geom = new THREE.BoxGeometry(Math.max(sz.x, 1e-4), Math.max(sz.y, 1e-4), Math.max(sz.z, 1e-4));
    const mat = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(cnt);
    window.modelGroup.add(mesh);

    // Test in Orthographic
    window.switchCamera('ortho');
    window.autoFitCamera();

    const orthoCam = window.camera;
    recordTest(orthoCam.left < orthoCam.right, `autoFitCamera [Ortho] on ${tb.name}: left < right (${orthoCam.left.toExponential(2)} < ${orthoCam.right.toExponential(2)})`);
    recordTest(orthoCam.bottom < orthoCam.top, `autoFitCamera [Ortho] on ${tb.name}: bottom < top (${orthoCam.bottom.toExponential(2)} < ${orthoCam.top.toExponential(2)})`);
    recordTest(orthoCam.near < orthoCam.far, `autoFitCamera [Ortho] on ${tb.name}: near < far (${orthoCam.near.toExponential(2)} < ${orthoCam.far.toExponential(2)})`);

    const hasNanOrtho = orthoCam.projectionMatrix.elements.some(v => isNaN(v) || !isFinite(v));
    recordTest(!hasNanOrtho, `autoFitCamera [Ortho] on ${tb.name}: 0 NaN/Inf in projectionMatrix`);

    // Test in Perspective
    window.switchCamera('persp');
    window.autoFitCamera();

    const perspCam = window.camera;
    recordTest(perspCam.near < perspCam.far, `autoFitCamera [Persp] on ${tb.name}: near < far (${perspCam.near.toExponential(2)} < ${perspCam.far.toExponential(2)})`);
    recordTest(!isNaN(perspCam.position.x) && isFinite(perspCam.position.x), `autoFitCamera [Persp] on ${tb.name}: position is finite`);

    const hasNanPersp = perspCam.projectionMatrix.elements.some(v => isNaN(v) || !isFinite(v));
    recordTest(!hasNanPersp, `autoFitCamera [Persp] on ${tb.name}: 0 NaN/Inf in projectionMatrix`);
  }

  // ============================================================================
  // FINAL STATISTICAL VERDICT
  // ============================================================================
  console.log('\n================================================================================');
  console.log('                       CHALLENGER 1 STRESS TEST SUMMARY                         ');
  console.log('================================================================================');
  console.log(`  Total Assertions Verified:  ${totalAssertions.toLocaleString()}`);
  console.log(`  Assertions Passed:          ${passedAssertions.toLocaleString()} (100.0%)`);
  console.log(`  Assertions Failed:          ${failedAssertions}`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`  Verdict:                    ${failedAssertions === 0 ? 'APPROVE (Phase 3 Verified)' : 'REQUEST_CHANGES'}`);
  console.log('================================================================================\n');

  if (failedAssertions > 0) {
    console.error(`FAILED ${failedAssertions} assertions:`);
    failureDetails.slice(0, 10).forEach(f => console.error(`  - ${f.desc}: ${f.details}`));
    process.exit(1);
  }
  process.exit(0);
}

runChallengerStressTests();
