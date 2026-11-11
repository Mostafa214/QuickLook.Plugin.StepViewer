/**
 * Challenger M1-2: Empirical Verification & Adversarial Stress Harness
 * Milestone 1 (Line 1: Camera & ViewCube Navigation)
 *
 * Requirements:
 * 1. 26-Hitbox Spatial Disjointness: Zero volume overlap for all 325 hitbox pairs and with core.
 * 2. Space-Filling Invariant: 26 hitboxes + central core (1.16^3) == 1.6^3 = 4.096 (exact + Monte Carlo).
 * 3. Surface Raycast Precision & Unambiguous Hit Resolution:
 *    - All 26 orientations (faces, edges, corners) hit correctly from various camera angles.
 *    - Transition boundary sweeps confirm sharp 0.580 transition without dead zones or ambiguity.
 * 4. Projection Switching Invariant:
 *    - switchCamera('persp') followed by switchCamera('ortho') retains exact visible world height (H_world)
 *      within 0.0001% (1e-6 relative tolerance) across multiple zoom levels, aspect ratios, and distances.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('========================================================================');
console.log('  CHALLENGER M1-2: Empirical Verification of Spatial & Camera Invariants');
console.log('========================================================================\n');

// Mock DOM & WebGL Environment
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
  toString() { return Array.from(this.classes).join(' '); }
}

class DOMElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = new ClassList();
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
    return { left: 0, top: 0, width: this.width || 110, height: this.height || 110, right: this.width || 110, bottom: this.height || 110 };
  }
  getContext() {
    return {
      fillRect: () => {}, strokeRect: () => {}, fillText: () => {}, clearRect: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, arc: () => {}, fill: () => {},
      save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, scale: () => {},
      measureText: (txt) => ({ width: (txt || '').length * 8 }),
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
    const handlers = this.listeners['click'] || [];
    const evt = { type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} };
    for (const h of handlers) h(evt);
  }
}

function buildTestSandbox() {
  const elements = new Map();
  function register(el) { if (el.id) elements.set(el.id, el); return el; }

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

  register(new DOMElement('div', 'hints-bar'));
  register(new DOMElement('div', 'inspector-drawer'));
  register(new DOMElement('div', 'status-text'));
  register(new DOMElement('button', 'btn-reset'));
  register(new DOMElement('button', 'btn-wireframe'));
  register(new DOMElement('div', 'toast-notify'));

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

  const THREE = require(path.join(__dirname, '../Assets/three.min.js'));
  sandbox.THREE = THREE;
  sandbox.window.THREE = THREE;
  global.THREE = THREE;

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

let passedAssertions = 0;
let failedAssertions = 0;
const failureDetails = [];

function assert(condition, desc) {
  if (condition) {
    console.log(`  ✓ PASS: ${desc}`);
    passedAssertions++;
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    failedAssertions++;
    failureDetails.push(desc);
  }
}

// Pseudo-Random Number Generator for reproducible stochastic testing
class SeededRNG {
  constructor(seed = 987654321) { this.state = seed; }
  next() {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }
  range(min, max) { return min + this.next() * (max - min); }
}

async function runChallengerTests() {
  const { sandbox } = buildTestSandbox();
  const { window, THREE } = sandbox;

  window.initViewport();
  window.ViewCube.init();

  const hitboxes = window.ViewCube.hitboxes;
  const orientations = window.ViewCube.orientations;

  console.log('\n========================================================================');
  console.log('PART 1: 26-Hitbox Spatial Disjointness Invariant (Zero Volume Overlap)');
  console.log('========================================================================');

  // Helper to compute AABB bounds for a hitbox
  function getAABB(mesh) {
    const p = mesh.position;
    const s = mesh.geometry.parameters;
    const width = s.width !== undefined ? s.width : mesh.userData.def.size[0];
    const height = s.height !== undefined ? s.height : mesh.userData.def.size[1];
    const depth = s.depth !== undefined ? s.depth : mesh.userData.def.size[2];
    return {
      minX: p.x - width / 2, maxX: p.x + width / 2,
      minY: p.y - height / 2, maxY: p.y + height / 2,
      minZ: p.z - depth / 2, maxZ: p.z + depth / 2,
      id: mesh.userData.id,
      cat: mesh.userData.def.cat,
      vol: width * height * depth
    };
  }

  const aabbs = hitboxes.map(getAABB);

  // Core AABB
  const coreAABB = {
    minX: -1.16 / 2, maxX: 1.16 / 2,
    minY: -1.16 / 2, maxY: 1.16 / 2,
    minZ: -1.16 / 2, maxZ: 1.16 / 2,
    id: 'CORE',
    cat: 'core',
    vol: 1.16 * 1.16 * 1.16
  };

  function computeOverlapVolume(b1, b2) {
    const ox = Math.max(0, Math.min(b1.maxX, b2.maxX) - Math.max(b1.minX, b2.minX));
    const oy = Math.max(0, Math.min(b1.maxY, b2.maxY) - Math.max(b1.minY, b2.minY));
    const oz = Math.max(0, Math.min(b1.maxZ, b2.maxZ) - Math.max(b1.minZ, b2.minZ));
    return ox * oy * oz;
  }

  // Verify all 325 pairwise intersections between hitboxes
  let maxHitboxOverlap = 0;
  let overlappingPair = null;
  let evaluatedPairs = 0;

  for (let i = 0; i < aabbs.length; i++) {
    for (let j = i + 1; j < aabbs.length; j++) {
      evaluatedPairs++;
      const vol = computeOverlapVolume(aabbs[i], aabbs[j]);
      if (vol > maxHitboxOverlap) {
        maxHitboxOverlap = vol;
        overlappingPair = `${aabbs[i].id} <-> ${aabbs[j].id}`;
      }
    }
  }

  assert(evaluatedPairs === 325, `Evaluated exactly C(26, 2) = 325 hitbox pairs (Actual: ${evaluatedPairs})`);
  assert(maxHitboxOverlap === 0, `All 325 hitbox pairs are strictly disjoint: Max overlap volume = ${maxHitboxOverlap.toFixed(10)}`);

  // Verify intersection with central core
  let maxCoreOverlap = 0;
  let coreOverlappingHitbox = null;
  aabbs.forEach(b => {
    const vol = computeOverlapVolume(b, coreAABB);
    if (vol > maxCoreOverlap) {
      maxCoreOverlap = vol;
      coreOverlappingHitbox = b.id;
    }
  });

  assert(maxCoreOverlap === 0, `All 26 hitboxes are strictly disjoint from central core (1.16^3): Max overlap = ${maxCoreOverlap.toFixed(10)}`);

  console.log('\n========================================================================');
  console.log('PART 2: Space-Filling Partition Invariant (4.096 m³ Completeness)');
  console.log('========================================================================');

  const sumHitboxVol = aabbs.reduce((acc, b) => acc + b.vol, 0);
  const totalPartitionVol = sumHitboxVol + coreAABB.vol;
  const expectedCubeVol = 1.6 * 1.6 * 1.6;
  const volumeError = Math.abs(totalPartitionVol - expectedCubeVol);

  console.log(`  Hitbox volume sum: ${sumHitboxVol.toFixed(8)}`);
  console.log(`  Central core volume: ${coreAABB.vol.toFixed(8)}`);
  console.log(`  Total partition volume: ${totalPartitionVol.toFixed(8)}`);
  console.log(`  Target volume (1.6^3): ${expectedCubeVol.toFixed(8)}`);
  console.log(`  Absolute discrepancy: ${volumeError.toExponential(4)}`);

  assert(volumeError < 1e-12, `Exact analytical space-filling invariant: |V_total - 4.096| = ${volumeError.toExponential(4)} < 1e-12`);

  // Monte Carlo Point-Containment Space-Filling Verification (100,000 random points)
  const rng = new SeededRNG(1337);
  const N_SAMPLES = 100000;
  let unassignedPoints = 0;
  let multiplyAssignedInteriorPoints = 0;
  const eps = 1e-5; // Boundary margin

  const allCells = [...aabbs, coreAABB];

  for (let k = 0; k < N_SAMPLES; k++) {
    const x = rng.range(-0.8, 0.8);
    const y = rng.range(-0.8, 0.8);
    const z = rng.range(-0.8, 0.8);

    // Skip points on mathematical boundaries to avoid boundary edge ambiguity
    const isNearBoundary = allCells.some(cell => {
      const dx = Math.min(Math.abs(x - cell.minX), Math.abs(x - cell.maxX));
      const dy = Math.min(Math.abs(y - cell.minY), Math.abs(y - cell.maxY));
      const dz = Math.min(Math.abs(z - cell.minZ), Math.abs(z - cell.maxZ));
      return (dx < eps && dy < eps) || (dy < eps && dz < eps) || (dx < eps && dz < eps);
    });
    if (isNearBoundary) continue;

    let containingCells = 0;
    for (let c = 0; c < allCells.length; c++) {
      const cell = allCells[c];
      if (x >= cell.minX && x <= cell.maxX &&
          y >= cell.minY && y <= cell.maxY &&
          z >= cell.minZ && z <= cell.maxZ) {
        containingCells++;
      }
    }

    if (containingCells === 0) unassignedPoints++;
    if (containingCells > 1) multiplyAssignedInteriorPoints++;
  }

  assert(unassignedPoints === 0, `Monte Carlo space coverage (100k points): 0 unassigned void holes (Actual: ${unassignedPoints})`);
  assert(multiplyAssignedInteriorPoints === 0, `Monte Carlo spatial uniqueness: 0 multiply-assigned interior points (Actual: ${multiplyAssignedInteriorPoints})`);

  console.log('\n========================================================================');
  console.log('PART 3: Adversarial Surface Raycast Precision & Hit Resolution');
  console.log('========================================================================');

  const raycaster = new THREE.Raycaster();
  const cubeScene = hitboxes[0].parent.parent; // hitboxGroup -> cubeScene
  const cubeCamera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 50);

  // Test 3.1: Targeted Center Rays for all 26 Orientations
  let targetedHitsCorrect = 0;
  let ambiguousIntersections = 0;

  Object.entries(orientations).forEach(([id, def]) => {
    if (id === 'ISO') return;
    // Ray origin placed outside the cube pointing directly at the hitbox center
    const hitPos = new THREE.Vector3(...def.pos);
    const rayDir = hitPos.clone().normalize();
    // If center is origin (impossible for hitboxes), default to (0,0,1)
    if (rayDir.lengthSq() < 1e-4) rayDir.set(0, 0, 1);

    const origin = rayDir.clone().multiplyScalar(4.0);
    const dir = rayDir.clone().negate().normalize();

    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(hitboxes);

    if (hits.length > 0) {
      const firstHit = hits[0].object;
      if (firstHit.userData.id === id) {
        targetedHitsCorrect++;
      } else {
        console.error(`Mismatch for ${id}: First hit was ${firstHit.userData.id}`);
      }

      // Check for ambiguous equal-distance hits between DIFFERENT hitboxes
      const competingHits = hits.filter(h => h.object !== firstHit && Math.abs(h.distance - hits[0].distance) < 1e-6);
      if (competingHits.length > 0) {
        ambiguousIntersections++;
        console.error(`Ambiguity on ${id}: ${firstHit.userData.id} and ${competingHits[0].object.userData.id} both at dist ${hits[0].distance}`);
      }
    } else {
      console.error(`No hit detected for targeted ray on ${id}`);
    }
  });

  assert(targetedHitsCorrect === 26, `All 26 targeted orientation center rays resolved strictly to their own hitbox (26/26)`);
  assert(ambiguousIntersections === 0, `Zero ambiguous equal-distance competing intersections on targeted rays (Actual: ${ambiguousIntersections})`);

  // Test 3.2: Dense Raycast Grid across Orthogonal View (Facing Front Face)
  // Camera placed at (0, 0, 4) looking towards (0, 0, 0)
  cubeCamera.position.set(0, 0, 4);
  cubeCamera.lookAt(0, 0, 0);
  cubeCamera.updateMatrixWorld(true);

  let faceHits = 0;
  let edgeHits = 0;
  let cornerHits = 0;
  let missOutsideCube = 0;
  let classificationErrors = 0;

  // Grid sweep in normalized device coordinates u, v in [-1, 1]
  // Cube half-width on screen: L/2 / 1.4 = 0.8 / 1.4 ~= 0.5714
  const steps = 101; // 101 x 101 = 10,201 rays
  for (let i = 0; i < steps; i++) {
    const u = -1.0 + (2.0 * i) / (steps - 1);
    for (let j = 0; j < steps; j++) {
      const v = -1.0 + (2.0 * j) / (steps - 1);

      // In camera space: x_world = u * 1.4, y_world = v * 1.4
      const xw = u * 1.4;
      const yw = v * 1.4;

      raycaster.setFromCamera(new THREE.Vector2(u, v), cubeCamera);
      const hits = raycaster.intersectObjects(hitboxes);

      const insideCubeX = Math.abs(xw) < 0.8;
      const insideCubeY = Math.abs(yw) < 0.8;

      if (!insideCubeX || !insideCubeY) {
        if (hits.length === 0) missOutsideCube++;
        continue;
      }

      // Inside cube silhouette [-0.8, 0.8]^2
      if (hits.length === 0) {
        classificationErrors++;
        console.error(`Dead zone detected inside cube silhouette at (${xw.toFixed(3)}, ${yw.toFixed(3)})`);
        continue;
      }

      const hitObj = hits[0].object;
      const cat = hitObj.userData.def.cat;

      // Analytical domain check on front face (z = 0.8)
      // Core width wf = 1.16, half = 0.58
      const isCoreX = Math.abs(xw) < 0.58;
      const isCoreY = Math.abs(yw) < 0.58;

      if (isCoreX && isCoreY) {
        // Must be FRONT face
        if (cat === 'face' && hitObj.userData.id === 'FRONT') {
          faceHits++;
        } else {
          classificationErrors++;
        }
      } else if (!isCoreX && !isCoreY) {
        // Must be Corner
        if (cat === 'corner') {
          cornerHits++;
        } else {
          classificationErrors++;
        }
      } else {
        // One is core, one is edge -> Must be Edge
        if (cat === 'edge') {
          edgeHits++;
        } else {
          classificationErrors++;
        }
      }
    }
  }

  assert(classificationErrors === 0, `Orthogonal front face dense grid (10,201 rays): 0 classification errors or dead zones`);
  assert(faceHits > 0 && edgeHits > 0 && cornerHits > 0,
    `Dense grid hit counts: Face=${faceHits}, Edge=${edgeHits}, Corner=${cornerHits}, Silhouette Misses=${missOutsideCube}`);

  // Test 3.3: High-Resolution Boundary Sweep & Transition Point Verification
  // Sweep from center (0, 0) along X axis to (0.75, 0)
  // Transition from FRONT face to FRONT_RIGHT edge must occur at exactly x = 0.580
  let detectedTransitionX = null;
  const sweepSteps = 1000;
  for (let s = 0; s <= sweepSteps; s++) {
    const x = 0.0 + (0.75 * s) / sweepSteps;
    const u = x / 1.4;
    const v = 0.0;
    raycaster.setFromCamera(new THREE.Vector2(u, v), cubeCamera);
    const hits = raycaster.intersectObjects(hitboxes);
    if (hits.length > 0 && hits[0].object.userData.id === 'FRONT_RIGHT') {
      detectedTransitionX = x;
      break;
    }
  }

  const expectedTransition = 0.580;
  const transitionError = Math.abs(detectedTransitionX - expectedTransition);
  console.log(`  Face -> Edge transition point along X: detected=${detectedTransitionX?.toFixed(4)}, expected=${expectedTransition.toFixed(4)}, diff=${transitionError.toFixed(4)}`);
  assert(transitionError < 0.002, `Face to Edge transition coordinate strictly equals wf/2 = 0.580 (diff = ${transitionError.toFixed(4)} < 0.002)`);

  // Test 3.4: Multi-Angle Raycasts (Compound 45° Edge View & Isometric Corner View)
  const testAngles = [
    { name: 'Isometric TOP_FRONT_RIGHT', pos: [3, 3, 3], expectedPrimary: 'TOP_FRONT_RIGHT' },
    { name: 'Isometric BOTTOM_BACK_LEFT', pos: [-3, -3, -3], expectedPrimary: 'BOTTOM_BACK_LEFT' },
    { name: 'Edge TOP_FRONT', pos: [0, 3, 3], expectedPrimary: 'TOP_FRONT' },
    { name: 'Edge FRONT_RIGHT', pos: [3, 0, 3], expectedPrimary: 'FRONT_RIGHT' }
  ];

  let multiAnglePasses = 0;
  testAngles.forEach(ta => {
    cubeCamera.position.set(...ta.pos);
    cubeCamera.lookAt(0, 0, 0);
    cubeCamera.updateMatrixWorld(true);

    // Center ray pointing right at target
    raycaster.setFromCamera(new THREE.Vector2(0, 0), cubeCamera);
    const hits = raycaster.intersectObjects(hitboxes);
    if (hits.length > 0 && hits[0].object.userData.id === ta.expectedPrimary) {
      multiAnglePasses++;
    } else {
      console.error(`Multi-angle failure on ${ta.name}: hit ${hits[0]?.object?.userData?.id} instead of ${ta.expectedPrimary}`);
    }
  });

  assert(multiAnglePasses === testAngles.length, `Multi-angle raycasts correctly resolve view-centered features for all ${testAngles.length} test angles`);

  console.log('\n========================================================================');
  console.log('PART 4: Projection Switching Visible World Height (H_world) Invariant');
  console.log('========================================================================');

  // Verify that switchCamera('persp') followed by switchCamera('ortho')
  // retains exact visible world height (H_world) within 0.0001% (1e-6) across multiple zoom levels.
  const zoomLevels = [0.1, 0.25, 0.5, 0.8, 1.0, 1.25, 2.0, 3.5, 5.0, 10.0, 50.0, 100.0];
  const aspectRatios = [16 / 9, 4 / 3, 1.0, 21 / 9, 9 / 16];
  const testDistances = [10, 50, 100, 250, 1000, 5000];

  let totalSwitchingTests = 0;
  let maxRelDiscrepancy = 0;
  let worstCaseDetail = '';

  let allSwitchedToPersp = true;
  let allSwitchedToOrtho = true;

  zoomLevels.forEach(zoom => {
    aspectRatios.forEach(aspect => {
      testDistances.forEach(d => {
        totalSwitchingTests++;

        // Setup Ortho camera state
        window.switchCamera('ortho', true);
        const fov = 45;
        const vFovRad = (fov * Math.PI) / 180;
        const halfH = d * Math.tan(vFovRad / 2);
        const halfW = halfH * aspect;

        window.camera.left = -halfW;
        window.camera.right = halfW;
        window.camera.top = halfH;
        window.camera.bottom = -halfH;
        window.camera.zoom = zoom;
        window.camera.userData = { baseHalfH: halfH, baseDistance: d };
        window.camera.updateProjectionMatrix();

        // Exact visible world height in Orthographic mode:
        // Three.js orthographic frustum height is (top - bottom) / zoom
        const H_ortho_initial = (window.camera.top - window.camera.bottom) / window.camera.zoom;

        // Switch to Perspective
        window.switchCamera('persp', true);
        if (!window.camera.isPerspectiveCamera) allSwitchedToPersp = false;

        // Distance in Perspective
        const perspDist = window.camera.position.distanceTo(window.controls.target);
        const H_persp = 2 * perspDist * Math.tan((window.camera.fov * Math.PI / 180) / 2);

        const diff1 = Math.abs(H_persp - H_ortho_initial) / H_ortho_initial;
        if (diff1 > maxRelDiscrepancy) {
          maxRelDiscrepancy = diff1;
          worstCaseDetail = `Ortho->Persp zoom=${zoom}, aspect=${aspect.toFixed(2)}, d=${d}: diff=${(diff1 * 100).toFixed(8)}%`;
        }

        // Switch back to Orthographic
        window.switchCamera('ortho', true);
        if (!window.camera.isOrthographicCamera) allSwitchedToOrtho = false;

        const H_ortho_final = (window.camera.top - window.camera.bottom) / window.camera.zoom;
        const diff2 = Math.abs(H_ortho_final - H_ortho_initial) / H_ortho_initial;
        if (diff2 > maxRelDiscrepancy) {
          maxRelDiscrepancy = diff2;
          worstCaseDetail = `Ortho->Persp->Ortho zoom=${zoom}, aspect=${aspect.toFixed(2)}, d=${d}: diff=${(diff2 * 100).toFixed(8)}%`;
        }
      });
    });
  });

  assert(allSwitchedToPersp, `All ${totalSwitchingTests} switchCamera('persp') calls correctly transitioned to PerspectiveCamera`);
  assert(allSwitchedToOrtho, `All ${totalSwitchingTests} switchCamera('ortho') calls correctly transitioned to OrthographicCamera`);

  console.log(`  Evaluated ${totalSwitchingTests} projection switching configurations.`);
  console.log(`  Worst-case discrepancy: ${(maxRelDiscrepancy * 100).toFixed(8)}% (${worstCaseDetail})`);
  assert(maxRelDiscrepancy < 1e-6,
    `H_world retained within 0.0001% across all zoom levels, aspects, and distances (Max observed: ${(maxRelDiscrepancy * 100).toFixed(8)}%)`);

  // Part 4.2: Rapid 500-Iteration Chaotic Toggle Stress Test (Zero Drift)
  console.log('\n--- Rapid 500-Iteration Chaotic Toggle Stress Test ---');
  let currentOrtho = true;
  window.switchCamera('ortho', true);
  const initialH = (window.camera.top - window.camera.bottom) / window.camera.zoom;

  for (let cycle = 0; cycle < 500; cycle++) {
    if (currentOrtho) {
      window.switchCamera('persp', true);
      currentOrtho = false;
    } else {
      window.switchCamera('ortho', true);
      currentOrtho = true;
    }
  }

  // Ensure returned to Ortho
  if (!currentOrtho) {
    window.switchCamera('ortho', true);
  }

  const finalH = (window.camera.top - window.camera.bottom) / window.camera.zoom;
  const drift = Math.abs(finalH - initialH) / initialH;
  console.log(`  Accumulated drift after 500 toggles: ${(drift * 100).toFixed(8)}%`);
  assert(drift < 1e-6, `500 rapid toggles produce zero cumulative drift (Drift: ${(drift * 100).toFixed(8)}% < 0.0001%)`);

  console.log('\n========================================================================');
  console.log(`  CHALLENGER EMPIRICAL VERIFICATION SUMMARY`);
  console.log(`  PASSED: ${passedAssertions}`);
  console.log(`  FAILED: ${failedAssertions}`);
  console.log('========================================================================\n');

  if (failedAssertions > 0) {
    console.error('FAILED ASSERTIONS:');
    failureDetails.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

runChallengerTests().catch(err => {
  console.error('UNCAUGHT EXCEPTION IN TEST RUNNER:', err);
  process.exit(1);
});
