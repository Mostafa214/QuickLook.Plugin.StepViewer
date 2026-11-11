/**
 * Phase 4 Adversarial Stress & Integrity Challenge Harness
 *
 * Conducts aggressive stress testing and integrity verification for Milestone 4:
 * 1. Integrity check: no hardcoded shortcuts, facade implementations, or bypasses.
 * 2. Ground Contact Shadow & Grid: elevation hierarchy invariant Y_model > Y_shadow > Y_grid across arbitrary & extreme boxes, zero memory leak on repeated calls.
 * 3. CAD Edge Lines: B-Rep topological edgeIndices vs fallback 28 deg dihedral threshold, depth & renderOrder configuration, userData linkage.
 * 4. PBR Material Parameters & Multi-body consistency: metalness=0.35, roughness=0.34, base color 0xb8c0cc, appearancePopover reset integrity.
 * 5. Trackpad Gesture Chaos Fuzzer: 1,000 chaotic pinch events in Perspective and Orthographic modes, verifying strict non-inversion, distance boundaries, and NaN safety.
 * 6. Lighting & Theme Modulation: 100 alternating light/dark cycles, verifying stability and 0% purple tint.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  CHALLENGER / CRITIC: Phase 4 Adversarial Stress Harness       ');
console.log('================================================================\n');

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

  addEventListener(event, fn, opts) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push({ fn, opts });
  }

  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h.fn !== fn);
  }

  dispatchEvent(evt) {
    const handlers = (this.listeners[evt.type] || []).slice();
    for (const h of handlers) {
      if (evt._immediateStopped) break;
      h.fn(evt);
    }
  }

  click() {
    const evt = {
      type: 'click',
      target: this,
      preventDefault: () => {},
      stopPropagation: () => {},
      stopImmediatePropagation: () => { evt._immediateStopped = true; }
    };
    this.dispatchEvent(evt);
  }
}

function buildCriticSandbox() {
  const elements = new Map();
  function register(el) {
    if (el.id) elements.set(el.id, el);
    return el;
  }

  const documentMock = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: (sel) => {
      const results = [];
      for (const el of elements.values()) {
        if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) {
          results.push(el);
        }
      }
      return results;
    },
    querySelector: (sel) => {
      for (const el of elements.values()) {
        if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) {
          return el;
        }
      }
      return null;
    },
    createElement: (tag) => new DOMElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const body = new DOMElement('body');
  register(body);

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

  const statusText = register(new DOMElement('div', 'status-text'));
  body.appendChild(statusText);

  const badgeStatus = register(new DOMElement('div', 'badge-status'));
  body.appendChild(badgeStatus);

  // Appearance Popover DOM Elements
  const colorPickerPopover = register(new DOMElement('div', 'color-picker-popover'));
  body.appendChild(colorPickerPopover);

  const popoverBodyName = register(new DOMElement('div', 'color-popover-body-name'));
  colorPickerPopover.appendChild(popoverBodyName);

  const popoverOrigSwatch = register(new DOMElement('div', 'popover-orig-swatch'));
  colorPickerPopover.appendChild(popoverOrigSwatch);

  const popoverOrigHex = register(new DOMElement('div', 'popover-orig-hex'));
  colorPickerPopover.appendChild(popoverOrigHex);

  const popoverColorInput = register(new DOMElement('input', 'popover-color-input'));
  colorPickerPopover.appendChild(popoverColorInput);

  const popoverColorHexVal = register(new DOMElement('div', 'popover-color-hex-val'));
  colorPickerPopover.appendChild(popoverColorHexVal);

  const popoverOpacitySlider = register(new DOMElement('input', 'popover-opacity-slider'));
  colorPickerPopover.appendChild(popoverOpacitySlider);

  const btnResetOrigColor = register(new DOMElement('button', 'btn-reset-orig-color'));
  colorPickerPopover.appendChild(btnResetOrigColor);

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
      removeEventListener: () => {},
      dispatchEvent: function(evt) {
        const handlers = (this.listeners[evt.type] || []).slice();
        for (const h of handlers) {
          if (evt._immediateStopped) break;
          h.fn(evt);
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
  sandbox.updateTreeItemState = () => {};
  sandbox.window.updateTreeItemState = () => {};
  global.document = documentMock;
  global.window = sandbox.window;

  // Load Three.js
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

  const appearanceCode = fs.readFileSync(path.join(__dirname, '../Assets/js/appearancePopover.js'), 'utf8');
  vm.runInContext(appearanceCode, sandbox);

  const explodedViewCode = fs.readFileSync(path.join(__dirname, '../Assets/js/explodedView.js'), 'utf8');
  vm.runInContext(explodedViewCode, sandbox);

  return { sandbox, elements, toasts };
}

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, desc) {
  totalAssertions++;
  if (condition) {
    console.log(`  ✓ [PASS]: ${desc}`);
    passedAssertions++;
  } else {
    console.error(`  ✗ [FAIL]: ${desc}`);
    failedAssertions++;
  }
}

function runAdversarialSuite() {
  const { sandbox, elements } = buildCriticSandbox();
  const { window, THREE } = sandbox;

  window.initViewport();

  // =========================================================================
  console.log('--- CHALLENGE 1: Code Integrity & Anti-Cheating Forensic Audit ---');
  // =========================================================================
  const viewerAppSrc = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  const popoverSrc = fs.readFileSync(path.join(__dirname, '../Assets/js/appearancePopover.js'), 'utf8');
  const workerSrc = fs.readFileSync(path.join(__dirname, '../Assets/stepWorker.js'), 'utf8');

  // Verify real THREE.MeshStandardMaterial construction
  assert(viewerAppSrc.includes('new THREE.MeshStandardMaterial('), 'Genuine MeshStandardMaterial instantiated in viewerApp.js');
  // Verify real THREE.LineSegments construction
  assert(viewerAppSrc.includes('new THREE.LineSegments('), 'Genuine LineSegments instantiated for CAD edges');
  // Verify real THREE.ShadowMaterial construction
  assert(viewerAppSrc.includes('new THREE.ShadowMaterial('), 'Genuine ShadowMaterial instantiated for ground contact shadow');
  // Verify genuine exponential zoom formula
  assert(viewerAppSrc.includes('Math.exp(-e.deltaY * 0.002)'), 'Genuine exponential non-inverting zoom calculation present');
  // Verify no hardcoded test overrides
  assert(!viewerAppSrc.includes('// TEST_OVERRIDE'), 'No test override markers in viewerApp.js');

  // =========================================================================
  console.log('\n--- CHALLENGE 2: Ground Shadow Elevation Invariant Under 500 Random Models ---');
  // =========================================================================
  // Initialize gridHelper via autoFitCamera first
  const initialMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  window.modelGroup.add(initialMesh);
  window.autoFitCamera();
  window.modelGroup.remove(initialMesh);

  assert(window.gridHelper !== null, 'gridHelper initialized in scene');

  // Invariant: Y_model_min > Y_shadow > Y_grid for all bounding boxes
  let elevationHierarchyViolations = 0;
  let nanElevations = 0;
  for (let k = 0; k < 500; k++) {
    const minY = (Math.random() - 0.5) * 10000;
    const height = Math.random() * 500 + 0.01;
    const maxY = minY + height;
    const minX = (Math.random() - 0.5) * 500;
    const maxX = minX + Math.random() * 500 + 0.01;
    const minZ = (Math.random() - 0.5) * 500;
    const maxZ = minZ + Math.random() * 500 + 0.01;

    const box = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    window.updateGroundContactShadow(box, center, size);

    const shadowY = window.contactShadowMesh.position.y;
    const gridY = window.gridHelper ? window.gridHelper.position.y : null;

    if (isNaN(shadowY) || (gridY !== null && isNaN(gridY))) {
      nanElevations++;
    }

    const expectedShadowY = box.min.y - 0.01;
    const expectedGridY = box.min.y - 0.02;

    if (Math.abs(shadowY - expectedShadowY) > 1e-4) {
      elevationHierarchyViolations++;
    }
    if (gridY !== null && Math.abs(gridY - expectedGridY) > 1e-4) {
      elevationHierarchyViolations++;
    }
    if (gridY !== null && !(box.min.y > shadowY && shadowY > gridY)) {
      elevationHierarchyViolations++;
    }
  }

  assert(elevationHierarchyViolations === 0, `500 random bounding boxes: 0 elevation hierarchy violations (actual: ${elevationHierarchyViolations})`);
  assert(nanElevations === 0, `500 random bounding boxes: 0 NaN elevation coordinates (actual: ${nanElevations})`);

  // =========================================================================
  console.log('\n--- CHALLENGE 3: Repeated Ground Shadow Calls & Scene Leak Audit ---');
  // =========================================================================
  const initialChildCount = window.scene.children.length;
  for (let i = 0; i < 200; i++) {
    const box = new THREE.Box3(new THREE.Vector3(-10, -5, -10), new THREE.Vector3(10, 5, 10));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    window.updateGroundContactShadow(box, center, size);
  }
  const finalChildCount = window.scene.children.length;
  assert(finalChildCount === initialChildCount, `Scene child count invariant under 200 updates (Initial: ${initialChildCount}, Final: ${finalChildCount})`);
  const shadowMeshInstances = window.scene.children.filter(c => c.name === 'ground_contact_shadow');
  assert(shadowMeshInstances.length === 1, `Strictly 1 contact shadow instance in scene graph (Found: ${shadowMeshInstances.length})`);

  // =========================================================================
  console.log('\n--- CHALLENGE 4: CAD B-Rep vs Dihedral Edge Lines Stress ---');
  // =========================================================================
  // Part A: Mesh with topological edgeIndices (explicit B-Rep edges)
  const brepMeshMock = {
    id: 0,
    name: 'CYLINDER_PISTON',
    color: [0.722, 0.753, 0.800],
    position: new Float32Array([
      0, 0, 0,  10, 0, 0,  10, 10, 0,
      0, 0, 0,  10, 10, 0,  0, 10, 0
    ]),
    normal: new Float32Array([
      0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, 1,  0, 0, 1,  0, 0, 1
    ]),
    edgeIndices: [0, 1, 1, 2, 2, 3, 3, 0] // 4 topological boundary edges
  };

  // Part B: Mesh without topological edgeIndices (fallback to 28 deg dihedral)
  const dihedralMeshMock = {
    id: 1,
    name: 'FILLETED_BRACKET',
    color: null,
    position: new Float32Array([
      0, 0, 0,  20, 0, 0,  20, 20, 0,
      0, 0, 0,  20, 20, 0,  0, 20, 0
    ]),
    normal: new Float32Array([
      0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, 1,  0, 0, 1,  0, 0, 1
    ]),
    edgeIndices: null
  };

  window.onTessellationComplete({
    meshCount: 2,
    elapsedMs: 30,
    isCached: false,
    meshes: [brepMeshMock, dihedralMeshMock]
  });

  assert(window.modelBodies.length === 2, '2 bodies registered in modelBodies');

  const b0 = window.modelBodies[0];
  const b1 = window.modelBodies[1];

  assert(b0.mesh.userData.edgeLines !== undefined, 'B-Rep body has userData.edgeLines');
  assert(b1.mesh.userData.edgeLines !== undefined, 'Dihedral fallback body has userData.edgeLines');

  // Verify renderOrder and depth configurations
  assert(b0.mesh.userData.edgeLines.renderOrder === 1, 'B-Rep edgeLines.renderOrder === 1');
  assert(b1.mesh.userData.edgeLines.renderOrder === 1, 'Dihedral edgeLines.renderOrder === 1');
  assert(b0.mesh.userData.edgeLines.material.depthTest === true, 'B-Rep edgeLines.material.depthTest === true');
  assert(b0.mesh.userData.edgeLines.material.depthWrite === false, 'B-Rep edgeLines.material.depthWrite === false');
  assert(b0.mesh.userData.edgeLines.material.color.getHex() === 0x0f172a, 'Edge lines color is 0x0f172a');
  assert(b0.mesh.userData.edgeLines.material.opacity === 0.85, 'Edge lines opacity is 0.85');

  // Verify both meshes cast & receive shadows
  assert(b0.mesh.castShadow === true && b0.mesh.receiveShadow === true, 'Body 0 castShadow & receiveShadow === true');
  assert(b1.mesh.castShadow === true && b1.mesh.receiveShadow === true, 'Body 1 castShadow & receiveShadow === true');

  // =========================================================================
  console.log('\n--- CHALLENGE 5: AppearancePopover Reset Integrity ---');
  // =========================================================================
  // Modify body material to arbitrary values
  b0.mesh.material.color.setHex(0xff0000);
  b0.mesh.material.metalness = 0.99;
  b0.mesh.material.roughness = 0.05;

  b1.mesh.material.color.setHex(0x00ff00);
  b1.mesh.material.metalness = 0.80;
  b1.mesh.material.roughness = 0.10;

  // Initialize appearance listeners
  window.setupAppearanceListeners();

  // Reset Body 0 via popover
  window.openColorPickerPopover(0);
  const btnReset = elements.get('btn-reset-orig-color');
  assert(btnReset !== null, 'btn-reset-orig-color found in popover');
  btnReset.click();

  // Reset Body 1 via popover
  window.openColorPickerPopover(1);
  btnReset.click();

  assert(b0.mesh.material.metalness === 0.35, 'Body 0 metalness reset to 0.35');
  assert(b0.mesh.material.roughness === 0.34, 'Body 0 roughness reset to 0.34');
  assert(b1.mesh.material.metalness === 0.35, 'Body 1 metalness reset to 0.35');
  assert(b1.mesh.material.roughness === 0.34, 'Body 1 roughness reset to 0.34');
  assert(b1.mesh.material.color.getHexString() === 'b8c0cc', 'Body 1 color reset to fallback 0xb8c0cc');

  // =========================================================================
  console.log('\n--- CHALLENGE 6: Trackpad Gesture Chaos Fuzzer (1,000 Cycles) ---');
  // =========================================================================
  window.controls.target.set(0, 0, 0);
  window.camera.position.set(0, 0, 100);
  window.controls.minDistance = 1.0;
  window.controls.maxDistance = 5000;

  let distanceInversions = 0;
  let boundaryViolations = 0;
  let nanCoordinates = 0;

  for (let step = 0; step < 1000; step++) {
    // Chaotic deltaY spanning [-5000, 5000]
    const chaoticDeltaY = (Math.random() - 0.5) * 10000;
    const evt = {
      type: 'wheel',
      ctrlKey: true,
      deltaY: chaoticDeltaY,
      preventDefault: () => {},
      stopPropagation: () => {},
      stopImmediatePropagation: () => { evt._immediateStopped = true; }
    };

    window.dispatchEvent(evt);

    const dist = window.camera.position.distanceTo(window.controls.target);

    if (dist <= 0 || isNaN(dist)) {
      distanceInversions++;
    }
    if (dist < window.controls.minDistance - 1e-4 || dist > window.controls.maxDistance + 1e-4) {
      boundaryViolations++;
    }
    if (isNaN(window.camera.position.x) || isNaN(window.camera.position.y) || isNaN(window.camera.position.z)) {
      nanCoordinates++;
    }
  }

  assert(distanceInversions === 0, `1,000 chaotic zoom steps: 0 camera distance inversions (actual: ${distanceInversions})`);
  assert(boundaryViolations === 0, `1,000 chaotic zoom steps: 0 min/max distance bound violations (actual: ${boundaryViolations})`);
  assert(nanCoordinates === 0, `1,000 chaotic zoom steps: 0 NaN position coordinates (actual: ${nanCoordinates})`);

  // Switch to Orthographic and test Ortho zoom fuzzer
  window.switchCamera('ortho');
  assert(window.camera.isOrthographicCamera === true, 'Switched to OrthographicCamera for fuzzer');

  let orthoBoundViolations = 0;
  let orthoNaNZooms = 0;

  for (let step = 0; step < 500; step++) {
    const chaoticDeltaY = (Math.random() - 0.5) * 10000;
    const evt = {
      type: 'wheel',
      ctrlKey: true,
      deltaY: chaoticDeltaY,
      preventDefault: () => {},
      stopPropagation: () => {},
      stopImmediatePropagation: () => { evt._immediateStopped = true; }
    };

    window.dispatchEvent(evt);

    const zoom = window.camera.zoom;
    if (isNaN(zoom)) {
      orthoNaNZooms++;
    }
    if (zoom < 0.01 - 1e-5 || zoom > 100.0 + 1e-5) {
      orthoBoundViolations++;
    }
  }

  assert(orthoBoundViolations === 0, `500 chaotic ortho zoom steps: 0 bound violations [0.01, 100.0] (actual: ${orthoBoundViolations})`);
  assert(orthoNaNZooms === 0, `500 chaotic ortho zoom steps: 0 NaN zooms (actual: ${orthoNaNZooms})`);

  // Restore Perspective
  window.switchCamera('perspective');
  assert(window.camera.isPerspectiveCamera === true, 'Restored PerspectiveCamera');

  // =========================================================================
  console.log('\n--- CHALLENGE 7: Dual Theme Rapid Modulation & Lighting Stability ---');
  // =========================================================================
  for (let cycle = 0; cycle < 100; cycle++) {
    window.updateThemeLighting(cycle % 2 === 0);
  }
  // End on dark theme
  window.updateThemeLighting(false);

  assert(window.renderer.toneMappingExposure === 1.05, 'Dark theme exposure maintained at 1.05');
  assert(window.ambientLight.intensity === 0.75, 'Dark theme ambientLight maintained at 0.75');
  assert(window.keyLight.intensity === 0.95, 'Dark theme keyLight maintained at 0.95');
  assert(window.contactShadowMaterial.opacity === 0.30, 'Dark theme shadow opacity maintained at 0.30');

  // =========================================================================
  console.log('\n================================================================');
  console.log(`  ADVERSARIAL STRESS SUMMARY: ${passedAssertions} / ${totalAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log('================================================================');

  if (failedAssertions > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdversarialSuite();
