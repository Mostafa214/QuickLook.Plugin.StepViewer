/**
 * Phase 4 Challenger Verification Suite 1: Materials, Edge Lines, Photometrics & Scale Stress
 * 
 * Adversarial stress harness verifying:
 * 1. PBR Material Parameters & Physical Limits (metalness 0.35, roughness 0.34, color 0xb8c0cc, polygonOffset)
 * 2. Extreme Mesh Topologies (single-body, multi-body 50+, custom byte/float colors, 0-dim, inverted normals, wireframe)
 * 3. CAD Edge Lines Stress & Dihedral Crease (28 deg threshold on coplanar, curved cylinders/spheres, 27 vs 29 deg boundary, B-Rep edgeIndices, renderOrder=1, depthWrite=false)
 * 4. Photometric PMREM & 5-Point Studio Lighting (neutral reflectors, 0 blue/purple tint, chromatic delta)
 * 5. Extreme Scale Stress & Shadow Frustum Math (0.01mm to 100,000mm, near/far bounds, projection matrix finiteness, shadow camera clipping, ground contact shadow)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('========================================================================');
console.log('  CHALLENGER 1: Milestone 4 Stress & Empirical Verification Harness   ');
console.log('========================================================================\n');

// Mock DOM Environment
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
    for (const h of handlers) {
      h.fn(evt);
    }
  }

  click() {
    const evt = { type: 'click', target: this, preventDefault: () => {}, stopPropagation: () => {} };
    this.dispatchEvent(evt);
  }
}

function buildChallengerSandbox() {
  const elements = new Map();
  function register(el) {
    if (el.id) elements.set(el.id, el);
    return el;
  }

  const documentMock = {
    readyState: 'complete',
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, new DOMElement('div', id));
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

  const btnEdges = register(new DOMElement('button', 'btn-edges', 'toolbar-btn active'));
  body.appendChild(btnEdges);

  const btnWireframe = register(new DOMElement('button', 'btn-wireframe', 'toolbar-btn'));
  body.appendChild(btnWireframe);

  const btnAutoRotate = register(new DOMElement('button', 'btn-autorotate', 'toolbar-btn'));
  body.appendChild(btnAutoRotate);

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

  // Mock WebGLRenderer with real Three.js camera/shadow structures
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

  // Execute measureEngine.js (for setupToolbar wireframe / edges bindings)
  const measureEngineCode = fs.readFileSync(path.join(__dirname, '../Assets/js/measureEngine.js'), 'utf8');
  vm.runInContext(measureEngineCode, sandbox);

  // Execute appearancePopover.js
  const appearanceCode = fs.readFileSync(path.join(__dirname, '../Assets/js/appearancePopover.js'), 'utf8');
  vm.runInContext(appearanceCode, sandbox);

  // Execute explodedView.js
  const explodedViewCode = fs.readFileSync(path.join(__dirname, '../Assets/js/explodedView.js'), 'utf8');
  vm.runInContext(explodedViewCode, sandbox);

  return { sandbox, elements, toasts };
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function assert(condition, desc, category = 'GENERAL') {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] [${category}] ${desc}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] [${category}] ${desc}`);
    failedTests++;
    findings.push({ category, description: desc });
  }
}

function runChallengerStressTests() {
  const { sandbox, elements } = buildChallengerSandbox();
  const { window, THREE } = sandbox;

  // Initialize Viewport
  window.initViewport();

  // =========================================================================
  console.log('\n>>> STRESS TEST SUITE 1: PBR Material Parameters & Physical Limits <<<');
  // =========================================================================

  // Test 1.1: Single-Body Default PBR Mesh
  const singleBodyTess = {
    meshCount: 1,
    elapsedMs: 15,
    isCached: false,
    meshes: [{
      id: 0,
      name: 'CYLINDER_PISTON',
      color: null,
      position: new Float32Array([
        0, 0, 0,  10, 0, 0,  10, 10, 0,
        0, 0, 0,  10, 10, 0,  0, 10, 0
      ]),
      normal: new Float32Array([
        0, 0, 1,  0, 0, 1,  0, 0, 1,
        0, 0, 1,  0, 0, 1,  0, 0, 1
      ]),
      edgeIndices: null
    }]
  };
  window.onTessellationComplete(singleBodyTess);
  const body0 = window.modelBodies[0];
  const mat0 = body0.mesh.material;

  assert(mat0.isMeshStandardMaterial === true, 'Material is THREE.MeshStandardMaterial', 'PBR');
  assert(mat0.metalness === 0.35, 'Baseline metalness === 0.35', 'PBR');
  assert(mat0.roughness === 0.34, 'Baseline roughness === 0.34', 'PBR');
  assert(mat0.color.getHexString() === 'b8c0cc', 'Baseline color is #b8c0cc (Matte Aluminum)', 'PBR');
  assert(mat0.envMapIntensity === 1.0, 'Default envMapIntensity === 1.0', 'PBR');
  assert(mat0.polygonOffset === true, 'polygonOffset is enabled on solid faces', 'PBR');
  assert(mat0.polygonOffsetFactor === 1, 'polygonOffsetFactor === 1', 'PBR');
  assert(mat0.polygonOffsetUnits === 1, 'polygonOffsetUnits === 1', 'PBR');
  assert(mat0.side === THREE.DoubleSide, 'Material side === THREE.DoubleSide', 'PBR');

  // Physical Limits Validation
  assert(mat0.metalness >= 0.0 && mat0.metalness <= 1.0, 'metalness conforms to physical [0.0, 1.0] bound', 'PBR');
  assert(mat0.roughness >= 0.05 && mat0.roughness <= 1.0, 'roughness > 0.05 prevents singular Dirac specular flares', 'PBR');

  // Test 1.2: Multi-Body Assembly (Stress with 50 distinct bodies)
  const multiMeshes = [];
  for (let i = 0; i < 50; i++) {
    multiMeshes.push({
      id: i,
      name: `PART_BODY_${String(i).padStart(3, '0')}`,
      color: i % 2 === 0 ? null : [(i * 5) % 255, (i * 13) % 255, (i * 27) % 255],
      position: new Float32Array([i * 2, 0, 0,  i * 2 + 1, 0, 0,  i * 2, 1, 0]),
      normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
    });
  }
  window.onTessellationComplete({ meshCount: 50, elapsedMs: 40, isCached: false, meshes: multiMeshes });
  assert(window.modelBodies.length === 50, 'Multi-body assembly loads all 50 bodies', 'TOPOLOGY');

  // Verify memory independence: each body must have its own unique material and userData
  const matSet = new Set(window.modelBodies.map(b => b.mesh.material));
  assert(matSet.size === 50, 'Every body mesh maintains an independent material instance', 'PBR');
  const allCastShadow = window.modelBodies.every(b => b.mesh.castShadow === true && b.mesh.receiveShadow === true);
  assert(allCastShadow, 'All 50 body meshes have castShadow and receiveShadow enabled', 'PBR');

  // Test 1.3: Custom Colors Stress (Floats, Bytes, Degenerate Arrays)
  const colorTests = [
    { name: 'FLOAT_NORMALIZED', input: [0.9, 0.4, 0.1], expectedR: 0.9, expectedG: 0.4, expectedB: 0.1 },
    { name: 'BYTE_INTEGERS', input: [255, 128, 0], expectedR: 1.0, expectedG: 128 / 255, expectedB: 0.0 },
    { name: 'NULL_FALLBACK', input: null, expectedHex: 'b8c0cc' },
    { name: 'EMPTY_ARRAY', input: [], expectedHex: 'b8c0cc' },
    { name: 'UNDERSIZED_ARRAY', input: [0.5, 0.2], expectedHex: 'b8c0cc' }
  ];

  const colorMeshes = colorTests.map((t, idx) => ({
    id: idx,
    name: t.name,
    color: t.input,
    position: new Float32Array([0, 0, 0,  1, 0, 0,  0, 1, 0]),
    normal: new Float32Array([0, 0, 1,  0, 0, 1,  0, 0, 1])
  }));
  window.onTessellationComplete({ meshCount: colorMeshes.length, meshes: colorMeshes });

  // Float color
  const mFloat = window.modelBodies[0].mesh.material;
  assert(Math.abs(mFloat.color.r - 0.9) < 0.001 && Math.abs(mFloat.color.g - 0.4) < 0.001, 'Float color [0.9, 0.4, 0.1] parsed correctly', 'COLORS');
  assert(mFloat.metalness === 0.35 && mFloat.roughness === 0.34, 'Float colored body preserves 0.35/0.34 PBR balance', 'COLORS');

  // Byte color
  const mByte = window.modelBodies[1].mesh.material;
  assert(Math.abs(mByte.color.r - 1.0) < 0.001 && Math.abs(mByte.color.g - 128 / 255) < 0.005, 'Byte color [255, 128, 0] scaled correctly', 'COLORS');

  // Null fallback
  const mNull = window.modelBodies[2].mesh.material;
  assert(mNull.color.getHexString() === 'b8c0cc', 'Null color safely defaults to #b8c0cc', 'COLORS');

  // Empty array fallback
  const mEmpty = window.modelBodies[3].mesh.material;
  assert(mEmpty.color.getHexString() === 'b8c0cc', 'Empty array color safely defaults to #b8c0cc', 'COLORS');

  // Undersized array fallback
  const mUnder = window.modelBodies[4].mesh.material;
  assert(mUnder.color.getHexString() === 'b8c0cc', 'Undersized array [0.5, 0.2] safely defaults to #b8c0cc', 'COLORS');

  // Test 1.4: 0-Dimensional & Degenerate Meshes
  const degenMeshes = [
    {
      id: 0,
      name: 'DEGENERATE_POINT',
      color: null,
      position: new Float32Array([0, 0, 0,  0, 0, 0,  0, 0, 0]),
      normal: new Float32Array([0, 0, 1,  0, 0, 1,  0, 0, 1])
    },
    {
      id: 1,
      name: 'COLLINEAR_LINE',
      color: null,
      position: new Float32Array([0, 0, 0,  1, 0, 0,  2, 0, 0]),
      normal: new Float32Array([0, 1, 0,  0, 1, 0,  0, 1, 0])
    }
  ];
  let degenError = null;
  try {
    window.onTessellationComplete({ meshCount: 2, meshes: degenMeshes });
  } catch (err) {
    degenError = err;
  }
  assert(degenError === null, '0-dimensional and collinear degenerate meshes processed without exception', 'TOPOLOGY');
  assert(window.modelBodies.length === 2, 'Degenerate meshes registered safely into modelBodies', 'TOPOLOGY');

  // Test 1.5: Inverted Normals Resilience
  const invertedMesh = [{
    id: 0,
    name: 'INVERTED_NORMAL_SHELL',
    color: null,
    position: new Float32Array([0, 0, 0,  10, 0, 0,  0, 10, 0]),
    normal: new Float32Array([0, 0, -1,  0, 0, -1,  0, 0, -1]) // pointing backward
  }];
  window.onTessellationComplete({ meshCount: 1, meshes: invertedMesh });
  const invBody = window.modelBodies[0];
  assert(invBody.mesh.material.side === THREE.DoubleSide, 'DoubleSide shading guarantees visible shading on inverted normals', 'PBR');

  // Test 1.6: Wireframe Toggle & CAD Edge Lines Interaction
  const btnWireframe = elements.get('btn-wireframe');
  const btnEdges = elements.get('btn-edges');

  // Wireframe ON
  btnWireframe.click();
  const wireActive = invBody.mesh.material.wireframe;
  const edgeChild = invBody.mesh.children.find(c => c.name === 'solidworks_edges');
  assert(wireActive === true, 'Clicking btn-wireframe sets mesh.material.wireframe = true', 'WIREFRAME');
  assert(edgeChild.visible === false, 'Wireframe mode automatically hides solidworks_edges to prevent occlusion', 'WIREFRAME');

  // Wireframe OFF
  btnWireframe.click();
  assert(invBody.mesh.material.wireframe === false, 'Untoggling wireframe restores mesh.material.wireframe = false', 'WIREFRAME');
  assert(edgeChild.visible === true, 'Untoggling wireframe restores solidworks_edges visibility', 'WIREFRAME');

  // =========================================================================
  console.log('\n>>> STRESS TEST SUITE 2: CAD Edge Lines Stress & Dihedral Crease <<<');
  // =========================================================================

  // Test 2.1: Coplanar Faces (0 deg dihedral angle)
  // Two triangles sharing diagonal in a flat 10x10 square
  const coplanarGeom = new THREE.BufferGeometry();
  coplanarGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0,   10, 0, 0,   10, 10, 0,
    0, 0, 0,   10, 10, 0,  0, 10, 0
  ]), 3));
  const coplanarEdges = new THREE.EdgesGeometry(coplanarGeom, 28);
  const coplanarSegmentCount = coplanarEdges.attributes.position.count / 2;
  // A square has 4 boundary edges. Diagonal (0 deg) must NOT be generated!
  assert(coplanarSegmentCount === 4, `Coplanar quads produce exactly 4 boundary edges (actual=${coplanarSegmentCount}, diagonal 0 deg suppressed)`, 'EDGES');

  // Test 2.2: Smooth Cylinder (32 radial facets, 11.25 deg facet dihedral angle)
  const cylGeom = new THREE.CylinderGeometry(5, 5, 20, 32);
  const cylEdges = new THREE.EdgesGeometry(cylGeom, 28);
  const cylSegmentCount = cylEdges.attributes.position.count / 2;
  // 32 top rim segments + 32 bottom rim segments = 64. 0 longitudinal facet lines!
  assert(cylSegmentCount === 64, `Smooth cylinder (32 segments) produces 64 rim edges and 0 facet lines (actual=${cylSegmentCount})`, 'EDGES');

  // Test 2.3: Octagonal Cylinder / Prism (8 radial facets, 45 deg facet dihedral angle)
  const octGeom = new THREE.CylinderGeometry(5, 5, 20, 8);
  const octEdges = new THREE.EdgesGeometry(octGeom, 28);
  const octSegmentCount = octEdges.attributes.position.count / 2;
  // 8 top rim + 8 bottom rim + 8 longitudinal facet edges = 24 segments!
  assert(octSegmentCount === 24, `Octagonal prism (45 deg > 28 deg) produces 24 edges including all 8 longitudinal crease lines (actual=${octSegmentCount})`, 'EDGES');

  // Test 2.4: Smooth Sphere (32x16 segments)
  const sphereGeom = new THREE.SphereGeometry(10, 32, 16);
  const sphereEdges = new THREE.EdgesGeometry(sphereGeom, 28);
  const sphereSegmentCount = sphereEdges.attributes.position.count / 2;
  assert(sphereSegmentCount === 0, `Smooth sphere produces 0 crease edges (actual=${sphereSegmentCount})`, 'EDGES');

  // Test 2.5: Acute Angle Crease Boundary (27 deg vs 29 deg against 28 deg threshold)
  function createHingeGeom(deg) {
    const rad = deg * Math.PI / 180;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array([
      0, 0, 0,   1, 0, 0,   0, 1, 0,
      0, -Math.cos(rad), Math.sin(rad)
    ]);
    const idx = [0, 1, 2,  1, 0, 3];
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setIndex(idx);
    return geom;
  }

  const hinge27 = createHingeGeom(27);
  const edges27 = new THREE.EdgesGeometry(hinge27, 28);
  const count27 = edges27.attributes.position.count / 2;
  assert(count27 === 4, `Crease at 27 deg (<= 28 deg) is suppressed: 4 boundary edges, 0 crease edges (actual=${count27})`, 'EDGES');

  const hinge29 = createHingeGeom(29);
  const edges29 = new THREE.EdgesGeometry(hinge29, 28);
  const count29 = edges29.attributes.position.count / 2;
  assert(count29 === 5, `Crease at 29 deg (> 28 deg) is detected: 4 boundary edges + 1 crease edge = 5 edges (actual=${count29})`, 'EDGES');

  // Test 2.6: Topological B-Rep edgeIndices Bypass
  const bRepMesh = {
    id: 0,
    name: 'BREP_CHAMFER',
    color: null,
    position: new Float32Array([
      0, 0, 0,   10, 0, 0,   10, 10, 0,
      0, 0, 0,   10, 10, 0,  0, 10, 0
    ]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    edgeIndices: [0, 1,  1, 2,  2, 0] // Explicit triangle boundary loop
  };
  window.onTessellationComplete({ meshCount: 1, meshes: [bRepMesh] });
  const bRepBody = window.modelBodies[0];
  const bRepEdges = bRepBody.mesh.children.find(c => c.name === 'solidworks_edges');
  assert(bRepEdges !== undefined, 'Explicit topological edge lines attached to mesh', 'EDGES');
  const bRepIndexCount = bRepEdges.geometry.index.count;
  assert(bRepIndexCount === 6, `Topological edgeIndices directly applied (6 indices / 3 segments, actual=${bRepIndexCount})`, 'EDGES');

  // Test 2.7: Edge Lines Z-Buffer & Rasterization Flags
  assert(bRepEdges.renderOrder === 1, 'edgeLines.renderOrder === 1 (renders after solid triangles)', 'EDGES');
  assert(bRepEdges.material.depthWrite === false, 'edgeLines.material.depthWrite === false (eliminates z-fighting)', 'EDGES');
  assert(bRepEdges.material.depthTest === true, 'edgeLines.material.depthTest === true (culled behind solid geometry)', 'EDGES');
  assert(bRepEdges.material.transparent === true && bRepEdges.material.opacity === 0.85, 'edgeLines opacity === 0.85 CAD slate', 'EDGES');
  assert(bRepEdges.material.color.getHex() === 0x0f172a, 'edgeLines color === 0x0f172a high contrast', 'EDGES');

  // =========================================================================
  console.log('\n>>> STRESS TEST SUITE 3: Photometric PMREM & 5-Point Studio Lighting <<<');
  // =========================================================================

  // Test 3.1: PMREM Reflector Colors & Specular Tint Absence
  const viewerAppSource = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');

  // Check reflector planes in initStudioEnvironment
  const p1Match = viewerAppSource.match(/const p1 = new THREE\.Mesh\([\s\S]*?color:\s*(0x[0-9a-fA-F]+)/);
  const p2Match = viewerAppSource.match(/const p2 = new THREE\.Mesh\([\s\S]*?color:\s*(0x[0-9a-fA-F]+)/);
  const p3Match = viewerAppSource.match(/const p3 = new THREE\.Mesh\([\s\S]*?color:\s*(0x[0-9a-fA-F]+)/);

  assert(p1Match && p1Match[1].toLowerCase() === '0xffffff', 'Reflector p1 is pure white softbox 0xffffff', 'PHOTOMETRICS');
  assert(p2Match && p2Match[1].toLowerCase() === '0xe2e8f0', 'Reflector p2 is neutral studio reflector 0xe2e8f0', 'PHOTOMETRICS');
  assert(p3Match && p3Match[1].toLowerCase() === '0xcfd8dc', 'Reflector p3 is cool-neutral studio reflector 0xcfd8dc', 'PHOTOMETRICS');

  // Verify chromatic delta (absence of color cast) on reflector planes
  function getRgbDelta(hex) {
    const c = new THREE.Color(hex);
    return Math.max(Math.abs(c.r - c.g), Math.abs(c.r - c.b), Math.abs(c.g - c.b));
  }
  const deltaP2 = getRgbDelta(0xe2e8f0);
  const deltaP3 = getRgbDelta(0xcfd8dc);
  assert(deltaP2 < 0.08, `Reflector p2 chromatic delta is neutral (${deltaP2.toFixed(3)} < 0.08)`, 'PHOTOMETRICS');
  assert(deltaP3 < 0.08, `Reflector p3 chromatic delta is neutral (${deltaP3.toFixed(3)} < 0.08)`, 'PHOTOMETRICS');

  // Verify zero blue or purple tint in source
  assert(!viewerAppSource.includes('0x93c5fd'), 'Zero blue reflector tint 0x93c5fd in codebase', 'PHOTOMETRICS');
  assert(!viewerAppSource.includes('0xa5b4fc'), 'Zero purple light tint 0xa5b4fc in codebase', 'PHOTOMETRICS');

  // Test 3.2: 5-Point Studio CAD Neutral Lighting
  assert(window.ambientLight && window.ambientLight.intensity === 0.75, 'ambientLight intensity === 0.75', 'LIGHTING');
  assert(window.ambientLight.color.getHex() === 0xffffff, 'ambientLight color is pure white 0xffffff', 'LIGHTING');

  assert(window.keyLight && window.keyLight.intensity === 0.95, 'keyLight intensity === 0.95', 'LIGHTING');
  assert(window.keyLight.color.getHexString() === 'f8fafc', 'keyLight color is CAD highlight #f8fafc', 'LIGHTING');
  assert(window.keyLight.castShadow === true, 'keyLight.castShadow === true', 'LIGHTING');
  assert(window.keyLight.shadow.mapSize.width === 2048, 'keyLight shadow map width === 2048', 'LIGHTING');
  assert(window.keyLight.shadow.bias === -0.0001, 'keyLight shadow bias === -0.0001', 'LIGHTING');

  assert(window.fillLight && window.fillLight.intensity === 0.45, 'fillLight intensity === 0.45', 'LIGHTING');
  assert(window.fillLight.color.getHexString() === '94a3b8', 'fillLight color is slate grey #94a3b8', 'LIGHTING');

  assert(window.rimLight && window.rimLight.intensity === 0.30, 'rimLight intensity === 0.30', 'LIGHTING');
  assert(window.rimLight.color.getHexString() === 'e2e8f0', 'rimLight color is neutral #e2e8f0', 'LIGHTING');

  // =========================================================================
  console.log('\n>>> STRESS TEST SUITE 4: Extreme Scale Stress & Shadow Frustum Analysis <<<');
  // =========================================================================

  const testScales = [
    { label: '0.01mm (Precision Micro MEMS)', size: 0.01 },
    { label: '0.1mm (Fine Feature)', size: 0.1 },
    { label: '10mm (Fastener / Bolt)', size: 10.0 },
    { label: '100mm (Standard Mechanical Part)', size: 100.0 },
    { label: '5,000mm (Vehicle Chassis)', size: 5000.0 },
    { label: '100,000mm (Industrial Plant Layout)', size: 100000.0 }
  ];

  for (const scale of testScales) {
    console.log(`\n  --- Testing Scale: ${scale.label} ---`);
    const s = scale.size;
    const boxMesh = {
      id: 0,
      name: `BOX_${scale.size}`,
      color: null,
      position: new Float32Array([
        -s/2, 0, -s/2,   s/2, 0, -s/2,   s/2, s, -s/2,
        -s/2, 0, -s/2,   s/2, s, -s/2,  -s/2, s, -s/2
      ]),
      normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
    };

    window.onTessellationComplete({ meshCount: 1, meshes: [boxMesh] });
    window.autoFitCamera();

    // 1. Perspective Camera near/far validation
    const camNear = window.camera.near;
    const camFar = window.camera.far;
    assert(camNear > 0 && !isNaN(camNear) && isFinite(camNear), `camera.near is finite and > 0 (actual=${camNear.toFixed(5)})`, 'SCALE');
    assert(camFar > camNear && !isNaN(camFar) && isFinite(camFar), `camera.far > camera.near (actual=${camFar.toFixed(2)})`, 'SCALE');

    // 2. KeyLight Shadow Camera Frustum Validation
    const sCam = window.keyLight.shadow.camera;
    const sNear = sCam.near;
    const sFar = sCam.far;

    // Check depth range
    const depthRange = sFar - sNear;
    const isDepthRangePositive = depthRange > 0;
    assert(isDepthRangePositive, `Shadow camera (sFar - sNear) > 0: near=${sNear}, far=${sFar}, range=${depthRange.toFixed(5)}`, 'SHADOW_FRUSTUM');

    // Check Projection Matrix finiteness (must not contain Infinity or NaN)
    const elements = sCam.projectionMatrix.elements;
    const hasNonFinite = elements.some(val => !Number.isFinite(val));
    assert(!hasNonFinite, `Shadow camera projection matrix contains 100% finite values (no Infinity/NaN)`, 'SHADOW_FRUSTUM');

    // 3. OrbitControls distance limits validation
    const minD = window.controls.minDistance;
    const maxD = window.controls.maxDistance;
    assert(minD < maxD, `controls.minDistance (${minD.toFixed(5)}) < controls.maxDistance (${maxD.toFixed(2)})`, 'CONTROLS');

    // Check if initial camera distance exceeds maxDistance
    const curDist = window.camera.position.distanceTo(window.controls.target);
    const isCamWithinMaxDist = curDist <= maxD * 1.05; // 5% margin
    assert(isCamWithinMaxDist, `Camera distance (${curDist.toFixed(2)}) is within controls.maxDistance (${maxD.toFixed(2)}) without snap-in`, 'CONTROLS');

    // 4. Ground Contact Shadow elevation hierarchy
    const shadowMesh = window.contactShadowMesh;
    const gridHelper = window.gridHelper;
    assert(shadowMesh !== null && gridHelper !== null, 'Contact shadow mesh and grid helper created', 'SHADOW_PLANE');

    const modelMinY = 0; // base of box at y=0
    const shadowY = shadowMesh.position.y;
    const gridY = gridHelper.position.y;
    assert(Math.abs(shadowY - (modelMinY - 0.01)) < 0.001, `Contact shadow positioned at model base - 0.01 (actual=${shadowY.toFixed(3)})`, 'SHADOW_PLANE');
    assert(Math.abs(gridY - (modelMinY - 0.02)) < 0.001, `Grid helper positioned at model base - 0.02 (actual=${gridY.toFixed(3)})`, 'SHADOW_PLANE');
    assert(modelMinY > shadowY && shadowY > gridY, 'Elevation hierarchy Model Base (0) > Shadow Plane (-0.01) > Grid (-0.02) verified', 'SHADOW_PLANE');

    // 5. Shadow Camera Frustum Containment Test
    // Directional light shadow camera must contain the model center and outer corners
    window.scene.add(window.keyLight);
    window.scene.add(window.keyLight.target);
    window.scene.updateMatrixWorld();
    window.keyLight.shadow.updateMatrices(window.keyLight);

    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(sCam.projectionMatrix, sCam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const modelCenter = new THREE.Vector3(0, s / 2, 0);
    const containsCenter = frustum.containsPoint(modelCenter);
    assert(containsCenter, `Shadow camera frustum contains model center (0, ${s/2}, 0)`, 'SHADOW_FRUSTUM');

    // Test model top corner (+s/2, s, +s/2)
    const topCorner = new THREE.Vector3(s / 2, s, s / 2);
    const containsTopCorner = frustum.containsPoint(topCorner);
    assert(containsTopCorner, `Shadow camera frustum contains model top corner (${s/2}, ${s}, ${s/2})`, 'SHADOW_FRUSTUM');
  }

  // =========================================================================
  console.log('\n========================================================================');
  console.log(`  CHALLENGER 1 SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('========================================================================\n');

  if (findings.length > 0) {
    console.log('CRITICAL FINDINGS / DEFECTS DETECTED:');
    findings.forEach((f, i) => console.log(`  ${i + 1}. [${f.category}] ${f.description}`));
  }

  return { totalTests, passedTests, failedTests, findings };
}

const result = runChallengerStressTests();
if (result.failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
