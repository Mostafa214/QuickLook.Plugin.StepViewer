/**
 * Phase 4 Comprehensive Verification Suite: PBR Material & Lighting Overhaul
 *
 * Verifies all 9 core requirements from synthesis_m4.md & AUDIT_REPORT.md (DISC-09):
 * 1. Studio PMREM Neutral Reflector (plane p2 color = 0xe2e8f0, zero blue/purple specular tint)
 * 2. WebGLRenderer Shadow Maps (enabled = true, type = PCFSoftShadowMap)
 * 3. OrbitControls Damping (dampingFactor = 0.08, screenSpacePanning = true, guarded update in animate)
 * 4. Studio 5-Point Neutral CAD Lighting (Ambient 0.75, Key 0.95 #f8fafc with 2048x2048 shadows,
 *    Fill 0.45 #94a3b8 slate, Rim 0.30 #e2e8f0, Top 0.25, Bottom bounce 0.20, window exports)
 * 5. Precision Trackpad Gestures (capture phase, preventDefault, stopImmediatePropagation,
 *    smooth exponential zoom Math.exp(-e.deltaY * 0.002) without distance inversion)
 * 6. Orthographic Camera Polyfill Safeguard (orthoCamera.fov = 45, degToRad non-NaN)
 * 7. PBR Material Parameters (metalness = 0.35, roughness = 0.34, base color 0xb8c0cc, envMapIntensity = 1.0, polygonOffset)
 * 8. CAD Technical Edge Lines (crease 28 deg, color 0x0f172a, opacity 0.85, renderOrder 1, parented to mesh, shadow casting)
 * 9. Ground Contact Shadow & Grid Separation (THREE.ShadowMaterial at box.min.y - 0.01, grid at box.min.y - 0.02,
 *    keyLight shadow frustum adaptation, DISC-09 explodedView sync, updateThemeLighting hook)
 * 10. Subsystem Synchronization (appearancePopover.js 0.35/0.34, stepWorker.js [0.722, 0.753, 0.800])
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('  STP-Quicklook: Phase 4 PBR Material & Lighting Overhaul Tests ');
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
    const handlers = this.listeners[evt.type] || [];
    for (const h of handlers) {
      h.fn(evt);
    }
  }

  click() {
    const evt = { type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} };
    this.dispatchEvent(evt);
  }
}

function buildTestSandbox() {
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
        const handlers = this.listeners[evt.type] || [];
        for (const h of handlers) h.fn(evt);
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

  // Mock WebGLRenderer with real Three.js structures
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

  // Execute cadState.js
  const cadStateCode = fs.readFileSync(path.join(__dirname, '../Assets/js/cadState.js'), 'utf8');
  vm.runInContext(cadStateCode, sandbox);

  // Execute viewCubeEngine.js
  const viewCubeCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewCubeEngine.js'), 'utf8');
  vm.runInContext(viewCubeCode, sandbox);

  // Execute viewerApp.js (strip auto-init)
  let viewerAppCode = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  viewerAppCode = viewerAppCode.replace(/if\s*\(document\.readyState\s*===\s*'loading'\)[\s\S]*?initViewport\(\);\s*\}/, '');
  vm.runInContext(viewerAppCode, sandbox);

  // Execute appearancePopover.js
  const appearanceCode = fs.readFileSync(path.join(__dirname, '../Assets/js/appearancePopover.js'), 'utf8');
  vm.runInContext(appearanceCode, sandbox);

  // Execute explodedView.js
  const explodedViewCode = fs.readFileSync(path.join(__dirname, '../Assets/js/explodedView.js'), 'utf8');
  vm.runInContext(explodedViewCode, sandbox);

  return { sandbox, elements, toasts };
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

function runPhase4Tests() {
  const { sandbox } = buildTestSandbox();
  const { window, THREE } = sandbox;

  // Initialize Viewport
  window.initViewport();

  // =========================================================================
  console.log('--- TEST 1: PMREM Neutral Reflector & Blue Tint Elimination ---');
  // =========================================================================
  const viewerAppSource = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  assert(!viewerAppSource.includes('0x93c5fd'), 'Source does NOT contain outdated blue reflector 0x93c5fd');
  assert(viewerAppSource.includes('color: 0xe2e8f0'), 'Source specifies neutral studio reflector 0xe2e8f0');

  // Verify PMREM setup execution
  const pmremMatches = viewerAppSource.match(/const p2 = new THREE\.Mesh\([\s\S]*?color:\s*(0x[0-9a-fA-F]+)[\s\S]*?\);/);
  assert(pmremMatches && pmremMatches[1].toLowerCase() === '0xe2e8f0', 'Reflector plane p2 instantiated with neutral color 0xe2e8f0');

  // =========================================================================
  console.log('\n--- TEST 2: WebGLRenderer Shadow Maps Configuration ---');
  // =========================================================================
  assert(window.renderer.shadowMap.enabled === true, 'renderer.shadowMap.enabled === true');
  assert(window.renderer.shadowMap.type === THREE.PCFSoftShadowMap, 'renderer.shadowMap.type === THREE.PCFSoftShadowMap');

  // =========================================================================
  console.log('\n--- TEST 3: OrbitControls Damping & Navigation ---');
  // =========================================================================
  assert(window.controls.enableDamping === true, 'controls.enableDamping === true');
  assert(window.controls.dampingFactor === 0.08, 'controls.dampingFactor === 0.08 (tactile inertia)');
  assert(window.controls.screenSpacePanning === true, 'controls.screenSpacePanning === true');

  // Verify animate() guards controls.update()
  assert(viewerAppSource.includes('if (controls) controls.update();'), 'animate() safely guards controls.update()');

  // =========================================================================
  console.log('\n--- TEST 4: Studio 5-Point Neutral CAD Lighting & Exports ---');
  // =========================================================================
  assert(window.ambientLight && window.ambientLight.isAmbientLight, 'window.ambientLight is exported');
  assert(window.ambientLight.intensity === 0.75, 'ambientLight intensity === 0.75');
  assert(window.ambientLight.color.getHex() === 0xffffff, 'ambientLight color is pure white 0xffffff');

  assert(window.keyLight && window.keyLight.isDirectionalLight, 'window.keyLight is exported');
  assert(window.keyLight.intensity === 0.95, 'keyLight intensity === 0.95');
  assert(window.keyLight.color.getHexString() === 'f8fafc', 'keyLight color is neutral CAD highlight #f8fafc');
  assert(window.keyLight.castShadow === true, 'keyLight.castShadow === true');
  assert(window.keyLight.shadow.mapSize.width === 2048, 'keyLight shadow map width === 2048');
  assert(window.keyLight.shadow.mapSize.height === 2048, 'keyLight shadow map height === 2048');
  assert(window.keyLight.shadow.bias === -0.0001, 'keyLight shadow bias === -0.0001 (anti-acne)');

  assert(window.fillLight && window.fillLight.isDirectionalLight, 'window.fillLight is exported');
  assert(window.fillLight.intensity === 0.45, 'fillLight intensity === 0.45');
  assert(window.fillLight.color.getHexString() === '94a3b8', 'fillLight is neutral grey-slate 0x94a3b8 (0% purple)');

  assert(window.rimLight && window.rimLight.isDirectionalLight, 'window.rimLight is exported');
  assert(window.rimLight.intensity === 0.30, 'rimLight intensity === 0.30');
  assert(window.rimLight.color.getHexString() === 'e2e8f0', 'rimLight color is neutral 0xe2e8f0');

  // Check scene contains top & bottom bounce lights
  const sceneLights = window.scene.children.filter(c => c.isDirectionalLight);
  const topLight = sceneLights.find(l => l.position.y === 1 && l.position.x === 0 && l.position.z === 0);
  assert(topLight && topLight.intensity === 0.25, 'topLight positioned at (0, 1, 0) with intensity 0.25');

  const bottomLight = sceneLights.find(l => l.position.y === -1 && l.position.x === 0 && l.position.z === 0);
  assert(bottomLight && bottomLight.intensity === 0.20, 'bottomBounceLight positioned at (0, -1, 0) with intensity 0.20');

  // Verify zero purple tint in entire lighting setup
  const hasPurpleTint = sceneLights.some(l => l.color.getHexString().toLowerCase() === 'a5b4fc');
  assert(!hasPurpleTint, 'Zero purple (#a5b4fc) tint in any directional lights');

  // =========================================================================
  console.log('\n--- TEST 5: Precision Trackpad Gestures (Exponential & Capture) ---');
  // =========================================================================
  // Test capture phase listener exists on renderer.domElement and window
  const domWheelHandlers = window.renderer.domElement.listeners['wheel'] || [];
  const winWheelHandlers = window.listeners['wheel'] || [];
  assert(domWheelHandlers.some(h => h.opts && h.opts.capture === true), 'renderer.domElement has capture-phase wheel listener');
  assert(winWheelHandlers.some(h => h.opts && h.opts.capture === true), 'window has capture-phase wheel listener');

  // Test Perspective Zoom Non-Inversion
  window.controls.target.set(0, 0, 0);
  window.camera.position.set(0, 0, 10);
  window.controls.minDistance = 0.5;
  window.controls.maxDistance = 1000;

  let prevented = false;
  let stoppedImm = false;
  const pinchZoomIn = {
    type: 'wheel',
    ctrlKey: true,
    deltaY: -100, // Zoom in
    preventDefault: () => { prevented = true; },
    stopPropagation: () => {},
    stopImmediatePropagation: () => { stoppedImm = true; }
  };

  window.dispatchEvent(pinchZoomIn);
  assert(prevented === true, 'Pinch gesture called preventDefault()');
  assert(stoppedImm === true, 'Pinch gesture called stopImmediatePropagation()');
  assert(window.camera.position.z < 10, 'Pinch zoom in reduced camera distance towards target');
  assert(window.camera.position.z > 0, 'Camera distance remains strictly positive (0 inversion)');

  // Test Extreme Zoom-In Clamping against minDistance
  const extremePinchIn = {
    type: 'wheel',
    ctrlKey: true,
    deltaY: -50000,
    preventDefault: () => {},
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  };
  window.dispatchEvent(extremePinchIn);
  assert(window.camera.position.z >= window.controls.minDistance,
    `Extreme zoom in clamps at minDistance (${window.camera.position.z.toFixed(4)} >= ${window.controls.minDistance})`);
  assert(window.camera.position.z > 0, 'Extreme zoom in does NOT flip past target (0 gimbal inversion)');

  // Test Extreme Zoom-Out Clamping against maxDistance
  const extremePinchOut = {
    type: 'wheel',
    ctrlKey: true,
    deltaY: 50000,
    preventDefault: () => {},
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  };
  window.dispatchEvent(extremePinchOut);
  assert(window.camera.position.z <= window.controls.maxDistance,
    `Extreme zoom out clamps at maxDistance (${window.camera.position.z.toFixed(4)} <= ${window.controls.maxDistance})`);

  // =========================================================================
  console.log('\n--- TEST 6: Orthographic Camera Polyfill Safeguard (orthoCamera.fov = 45) ---');
  // =========================================================================
  window.toggleOrthoPersp();
  assert(window.camera.isOrthographicCamera === true, 'Active camera is OrthographicCamera');
  assert(window.camera.fov === 45, 'orthoCamera.fov is polyfilled to 45');
  assert(!isNaN(THREE.MathUtils.degToRad(window.camera.fov)), 'degToRad(camera.fov) is finite number (~0.785 rad)');

  // Test Orthographic exponential zoom clamping
  const initialOrthoZoom = window.camera.zoom;
  window.dispatchEvent(pinchZoomIn);
  assert(window.camera.zoom > initialOrthoZoom, `Ortho zoom increased exponentially from ${initialOrthoZoom} to ${window.camera.zoom.toFixed(4)}`);
  assert(window.camera.zoom <= 100.0, 'Ortho zoom bounded by maxZoom 100.0');

  window.dispatchEvent(extremePinchOut);
  assert(window.camera.zoom >= 0.01, `Ortho zoom bounded by minZoom 0.01 (Actual: ${window.camera.zoom.toFixed(4)})`);
  assert(!isNaN(window.camera.zoom), 'Ortho zoom is strictly non-NaN');

  // Switch back to perspective for subsequent tests
  window.toggleOrthoPersp();
  assert(window.camera.isPerspectiveCamera === true, 'Restored PerspectiveCamera');

  // =========================================================================
  console.log('\n--- TEST 7: PBR Material Parameters & Tessellation Pipeline ---');
  // =========================================================================
  // Trigger onTessellationComplete mock data
  const testTessData = {
    meshCount: 1,
    elapsedMs: 25,
    isCached: false,
    meshes: [
      {
        id: 0,
        name: 'SHAFT_BODY_01',
        color: null, // default uncolored
        position: new Float32Array([
          0, 0, 0,  10, 0, 0,  10, 10, 0,
          0, 0, 0,  10, 10, 0,  0, 10, 0
        ]),
        normal: new Float32Array([
          0, 0, 1,  0, 0, 1,  0, 0, 1,
          0, 0, 1,  0, 0, 1,  0, 0, 1
        ]),
        edgeIndices: null
      }
    ]
  };

  window.onTessellationComplete(testTessData);
  assert(window.modelBodies && window.modelBodies.length === 1, 'modelBodies populated with 1 part');

  const defaultBody = window.modelBodies[0];
  const mat = defaultBody.mesh.material;
  assert(mat.metalness === 0.35, 'Default PBR metalness === 0.35');
  assert(mat.roughness === 0.34, 'Default PBR roughness === 0.34');
  assert(mat.envMapIntensity === 1.0, 'Default PBR envMapIntensity === 1.0');
  assert(mat.color.getHexString() === 'b8c0cc', 'Default PBR base color is Matte Polished Aluminum #b8c0cc');
  assert(mat.polygonOffset === true, 'material.polygonOffset === true');
  assert(mat.polygonOffsetFactor === 1 && mat.polygonOffsetUnits === 1, 'polygonOffsetFactor === 1, units === 1');
  assert(defaultBody.mesh.castShadow === true, 'body mesh.castShadow === true');
  assert(defaultBody.mesh.receiveShadow === true, 'body mesh.receiveShadow === true');

  // Test custom CAD color retaining 0.35 / 0.34
  const testColoredData = {
    meshCount: 1,
    elapsedMs: 20,
    isCached: false,
    meshes: [
      {
        id: 1,
        name: 'BRASS_PIN',
        color: [0.85, 0.65, 0.25], // Custom CAD color
        position: new Float32Array([
          0, 0, 0,  5, 0, 0,  5, 5, 0
        ]),
        normal: new Float32Array([
          0, 0, 1,  0, 0, 1,  0, 0, 1
        ])
      }
    ]
  };
  window.onTessellationComplete(testColoredData);
  const coloredBody = window.modelBodies[0];
  assert(coloredBody.mesh.material.metalness === 0.35, 'Colored part preserves metalness 0.35');
  assert(coloredBody.mesh.material.roughness === 0.34, 'Colored part preserves roughness 0.34');
  assert(Math.abs(coloredBody.mesh.material.color.r - 0.85) < 0.01, 'Colored part preserves custom red channel 0.85');

  // =========================================================================
  console.log('\n--- TEST 8: CAD Technical Edge Lines & Scene Graph Parenting ---');
  // =========================================================================
  const edgeLines = coloredBody.mesh.children.find(c => c.name === 'solidworks_edges');
  assert(edgeLines !== undefined, 'Edge lines child solidworks_edges attached to body mesh');
  assert(edgeLines.renderOrder === 1, 'edgeLines.renderOrder === 1 (renders after solid triangles)');
  assert(edgeLines.material.color.getHex() === 0x0f172a, 'Edge lines color is high-contrast CAD slate 0x0f172a');
  assert(edgeLines.material.opacity === 0.85, 'Edge lines opacity === 0.85');
  assert(edgeLines.material.depthTest === true, 'Edge lines depthTest === true');
  assert(edgeLines.material.depthWrite === false, 'Edge lines depthWrite === false (eliminates z-fighting)');
  assert(coloredBody.mesh.userData.edgeLines === edgeLines, 'mesh.userData.edgeLines references edgeLines');

  // =========================================================================
  console.log('\n--- TEST 9: Ground Contact Shadow & Grid Separation (Zero Z-Fighting) ---');
  // =========================================================================
  window.autoFitCamera();
  assert(window.contactShadowMesh !== null, 'window.contactShadowMesh is created');
  assert(window.contactShadowMaterial !== null, 'window.contactShadowMaterial is created');
  assert(window.contactShadowMaterial.isShadowMaterial === true, 'contactShadowMaterial is THREE.ShadowMaterial');
  assert(window.contactShadowMaterial.opacity === 0.30, 'contactShadowMaterial opacity === 0.30');
  assert(window.contactShadowMaterial.depthWrite === false, 'contactShadowMaterial depthWrite === false');

  const modelBox = new THREE.Box3().setFromObject(window.modelGroup);
  const shadowY = window.contactShadowMesh.position.y;
  const gridY = window.gridHelper ? window.gridHelper.position.y : null;

  assert(Math.abs(shadowY - (modelBox.min.y - 0.01)) < 0.001,
    `Contact shadow elevation is box.min.y - 0.01: actual=${shadowY.toFixed(3)}, expected=${(modelBox.min.y - 0.01).toFixed(3)}`);
  assert(gridY !== null && Math.abs(gridY - (modelBox.min.y - 0.02)) < 0.001,
    `GridHelper elevation is box.min.y - 0.02: actual=${gridY.toFixed(3)}, expected=${(modelBox.min.y - 0.02).toFixed(3)}`);
  assert(modelBox.min.y > shadowY && shadowY > gridY,
    'Elevation hierarchy: Model Base > Shadow Plane (-0.01) > Grid Helper (-0.02) guarantees 0 z-fighting');

  // Test dynamic shadow update without arguments
  assert(typeof window.updateGroundContactShadow === 'function', 'window.updateGroundContactShadow is exported function');
  window.updateGroundContactShadow();
  assert(window.contactShadowMesh.name === 'ground_contact_shadow', 'updateGroundContactShadow() executed dynamically');

  // Test adaptive distance limits
  assert(window.controls.minDistance > 0, `Adaptive controls.minDistance set: ${window.controls.minDistance.toFixed(3)}`);
  assert(window.controls.maxDistance > window.controls.minDistance, `Adaptive controls.maxDistance set: ${window.controls.maxDistance.toFixed(3)}`);

  // Test updateThemeLighting
  assert(typeof window.updateThemeLighting === 'function', 'window.updateThemeLighting is exported function');
  window.updateThemeLighting(true);
  assert(window.renderer.toneMappingExposure === 0.92, 'Light theme modulates exposure to 0.92');
  assert(window.contactShadowMaterial.opacity === 0.22, 'Light theme modulates shadow opacity to 0.22');
  assert(window.ambientLight.intensity === 0.70, 'Light theme modulates ambientLight intensity to 0.70');

  window.updateThemeLighting(false);
  assert(window.renderer.toneMappingExposure === 1.05, 'Dark theme restores exposure to 1.05');
  assert(window.contactShadowMaterial.opacity === 0.30, 'Dark theme restores shadow opacity to 0.30');
  assert(window.ambientLight.intensity === 0.75, 'Dark theme restores ambientLight intensity to 0.75');

  // =========================================================================
  console.log('\n--- TEST 10: Ancillary Subsystems & Integration Verification ---');
  // =========================================================================
  // 1. appearancePopover.js sync
  const popoverSource = fs.readFileSync(path.join(__dirname, '../Assets/js/appearancePopover.js'), 'utf8');
  assert(popoverSource.includes('b.mesh.material.metalness = 0.35;'), 'appearancePopover.js resets metalness to 0.35');
  assert(popoverSource.includes('b.mesh.material.roughness = 0.34;'), 'appearancePopover.js resets roughness to 0.34');
  assert(popoverSource.includes('0xb8c0cc'), 'appearancePopover.js resets fallback color to 0xb8c0cc');

  // 2. stepWorker.js sync
  const workerSource = fs.readFileSync(path.join(__dirname, '../Assets/stepWorker.js'), 'utf8');
  assert(workerSource.includes('[0.722, 0.753, 0.800]'), 'stepWorker.js autoPalette[0] set to [0.722, 0.753, 0.800] (#b8c0cc)');

  // 3. explodedView.js dynamic ground shadow call (DISC-09)
  const explodedSource = fs.readFileSync(path.join(__dirname, '../Assets/js/explodedView.js'), 'utf8');
  assert(explodedSource.includes('window.updateGroundContactShadow'), 'explodedView.js invokes updateGroundContactShadow (resolves DISC-09)');

  // =========================================================================
  console.log('\n================================================================');
  console.log(`  PHASE 4 TEST SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log('================================================================');

  if (failedAssertions > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase4Tests();
