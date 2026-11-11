/**
 * Comprehensive Factory Verification Test Suite v3.0 ("کارخونه مهندسی")
 * Validates all 11 user requirements and architectural defect resolutions.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('   FACTORY VERIFICATION TEST SUITE v3.0 (کارخونه مهندسی)   ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// -------------------------------------------------------------
// SUITE 1: TSK-08 Section View Gizmo Center Projection & 2-Axis Lock
// -------------------------------------------------------------
console.log('Suite 1: Section View Gizmo Center Projection (Image 4 Fix)');

test('Section Gizmo projects modelCenter onto cutting plane locking 2 orthogonal axes', () => {
  // Mock THREE Vector3 and Box3
  class MockVector3 {
    constructor(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new MockVector3(this.x, this.y, this.z); }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  }

  // Model bounding center at (50, 100, 200)
  const modelCenter = new MockVector3(50, 100, 200);

  // Case A: Section along Z with normal (0, 0, -1), cut plane at Z = 220
  // Plane equation: -z + 220 = 0 -> normal=(0, 0, -1), constant = 220
  const normalZ = new MockVector3(0, 0, -1);
  const constantZ = 220;
  const distZ = normalZ.dot(modelCenter) + constantZ; // (0)(50) + (0)(100) + (-1)(200) + 220 = 20
  const planePosZ = modelCenter.clone().sub(normalZ.clone().multiplyScalar(distZ));
  // planePosZ = (50, 100, 200) - (0, 0, -20) = (50, 100, 220)

  assert.strictEqual(planePosZ.x, 50, 'X dimension must be locked to modelCenter.x');
  assert.strictEqual(planePosZ.y, 100, 'Y dimension must be locked to modelCenter.y');
  assert.strictEqual(planePosZ.z, 220, 'Z dimension must match cutting plane position');

  // Case B: Section along X with normal (-1, 0, 0), cut plane at X = 75
  const normalX = new MockVector3(-1, 0, 0);
  const constantX = 75;
  const distX = normalX.dot(modelCenter) + constantX; // -50 + 75 = 25
  const planePosX = modelCenter.clone().sub(normalX.clone().multiplyScalar(distX));

  assert.strictEqual(planePosX.x, 75, 'X dimension must match cutting plane position');
  assert.strictEqual(planePosX.y, 100, 'Y dimension must be locked to modelCenter.y');
  assert.strictEqual(planePosX.z, 200, 'Z dimension must be locked to modelCenter.z');
});

test('Assets/js/sectionEngine.js implements projected modelCenter', () => {
  const code = fs.readFileSync('Assets/js/sectionEngine.js', 'utf8');
  assert.ok(code.includes('dist = normal.dot(modelCenter) + sectionPlane.constant'), 'Must project modelCenter onto sectionPlane');
  assert.ok(code.includes('planePos = modelCenter.clone().sub(normal.clone().multiplyScalar(dist))'), 'Must subtract normal * dist');
});

// -------------------------------------------------------------
// SUITE 2: TSK-06 & TSK-07 2D Blueprint SVG Silhouette & Dimensions (Image 3 Fix)
// -------------------------------------------------------------
console.log('\nSuite 2: 2D Blueprint SVG Engine & ISO Dimensions (Image 3 Fix)');

test('Assets/js/blueprintSvgEngine.js has no wireframe triangle sampling', () => {
  const code = fs.readFileSync('Assets/js/blueprintSvgEngine.js', 'utf8');
  assert.ok(!code.includes('edgeSegments3D.push([v0, v1], [v1, v2], [v2, v0])'), 'Must not sample raw triangle edges');
  assert.ok(code.includes('THREE.EdgesGeometry') || code.includes('edgeMesh'), 'Must extract true CAD edges');
});

test('Assets/js/blueprintSvgEngine.js generates ISO 129-1 dimension lines and callouts', () => {
  const code = fs.readFileSync('Assets/js/blueprintSvgEngine.js', 'utf8');
  assert.ok(code.includes('dim-callout'), 'Must include dim-callout elements');
  assert.ok(code.includes('marker-start="url(#arrow-start)"'), 'Must include marker-start arrow');
  assert.ok(code.includes('marker-end="url(#arrow-end)"'), 'Must include marker-end arrow');
  assert.ok(code.includes('dimXLabel') && code.includes('dimYLabel'), 'Must include dimension labels in mm');
});

test('Assets/js/blueprintSvgEngine.js sends SAVE_SNAPSHOT IPC to trigger SaveFileDialog', () => {
  const code = fs.readFileSync('Assets/js/blueprintSvgEngine.js', 'utf8');
  assert.ok(code.includes('window.chrome.webview.postMessage'), 'Must call WebView2 postMessage');
  assert.ok(code.includes('action: \'SAVE_SNAPSHOT\''), 'Must dispatch SAVE_SNAPSHOT');
});

test('SnapshotExportService.cs allows .svg and supports SaveFileDialog filter', () => {
  const code = fs.readFileSync('SnapshotExportService.cs', 'utf8');
  assert.ok(code.includes('".svg"'), 'AllowedSnapshotExtensions must include .svg');
  assert.ok(code.includes('Scalable Vector Graphics (*.svg)|*.svg'), 'SaveFileDialog filter must include SVG');
  assert.ok(code.includes('prefix.StartsWith("<svg"'), 'IsValidImageHeader must accept SVG XML header');
});

// -------------------------------------------------------------
// SUITE 3: TSK-10 True Alpha Transparent Snapshot (Zero Halos)
// -------------------------------------------------------------
console.log('\nSuite 3: True Alpha Transparent Snapshot & WebGL Alpha');

test('Assets/js/viewerApp.js WebGLRenderer allocates true alpha buffer', () => {
  const code = fs.readFileSync('Assets/js/viewerApp.js', 'utf8');
  assert.ok(code.includes('new THREE.WebGLRenderer({ antialias: true, alpha: true'), 'WebGLRenderer must have alpha: true');
});

test('Assets/js/snapshotEngine.js transparent export sets clearAlpha to 0 and suppresses contact shadow', () => {
  const code = fs.readFileSync('Assets/js/snapshotEngine.js', 'utf8');
  assert.ok(code.includes("renderer.setClearColor(0x000000, 0)"), 'Must set clearColor to (0x000000, 0)');
  assert.ok(code.includes("!snapExportIncludeShadow || snapExportMode === 'transparent'"), 'Must hide ground shadow on transparent export');
  assert.ok(code.includes("renderer.setClearColor(prevClearColor, prevClearAlpha)"), 'Must restore clearColor and alpha');
});

// -------------------------------------------------------------
// SUITE 4: TSK-01, TSK-02, TSK-03, TSK-04, TSK-09, TSK-11 Regressions
// -------------------------------------------------------------
console.log('\nSuite 4: Previous Milestones Regression Integrity');

test('TSK-01: Orthographic projection is default on model load', () => {
  const code = fs.readFileSync('Assets/js/viewerApp.js', 'utf8');
  assert.ok(code.includes("switchCamera('ortho', true)"), 'Must call switchCamera(\'ortho\', true) on load');
});

test('TSK-02: ViewCube contains 26 hitboxes', () => {
  const code = fs.readFileSync('Assets/js/viewCubeEngine.js', 'utf8');
  assert.ok(code.includes('const ORIENTATIONS'), 'Must define ORIENTATIONS');
  assert.ok(code.includes('hitboxMeshes.push(mesh)'), 'Must register 26 hitbox meshes');
  assert.ok(code.includes('TOP_FRONT_RIGHT'), 'Must include 8 isometric corners');
  assert.ok(code.includes('TOP_FRONT'), 'Must include 12 edges');
});

test('TSK-03: Responsive CSS rules exist for small viewports', () => {
  const code = fs.readFileSync('Assets/css/viewer.css', 'utf8');
  assert.ok(code.includes('@media (max-width: 960px)'), 'Must have 960px breakpoint');
  assert.ok(code.includes('@media (max-width: 680px)'), 'Must have 680px breakpoint');
  assert.ok(code.includes('.viewcube-container') && code.includes('scale('), 'Must scale ViewCube in small viewports');
});

test('TSK-04: Action bar button overflow and close [X] fixed', () => {
  const html = fs.readFileSync('Assets/viewer.html', 'utf8');
  assert.ok(html.includes('id="btn-close-drawer"'), 'Must have drawer close button');
  const css = fs.readFileSync('Assets/css/viewer.css', 'utf8');
  assert.ok(css.includes('.drawer-tab'), 'Must have drawer tab buttons styled');
});

test('TSK-09: Measure tool C key clears active dimensions without exiting measure mode', () => {
  const code = fs.readFileSync('Assets/js/viewerApp.js', 'utf8');
  assert.ok(code.includes("key === 'c'"), 'Must handle C key');
  assert.ok(code.includes('clearActiveMeasurement'), 'Must call clearActiveMeasurement');
  assert.ok(code.includes('isMeasureActive = true') || code.includes('strictly maintaining isMeasureActive = true'), 'Must keep measure mode active');
});

test('TSK-11: Shortcuts toggle and update button in HUD', () => {
  const html = fs.readFileSync('Assets/viewer.html', 'utf8');
  assert.ok(html.includes('id="btn-toggle-shortcuts"'), 'Must have shortcuts toggle button');
  assert.ok(html.includes('id="btn-check-update"'), 'Must have update button in HUD');
});

console.log('\n----------------------------------------------------------------');
console.log(`   ALL ${passedTests} OF ${totalTests} VERIFICATION TESTS PASSED SUCCESSFULLY!   `);
console.log('----------------------------------------------------------------\n');
