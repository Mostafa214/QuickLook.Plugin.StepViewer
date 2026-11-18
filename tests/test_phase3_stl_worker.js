/**
 * Phase 3C Test Suite: Non-blocking STL Web Worker & Feature Detection Offload
 * Verifies Assets/stlWorker.js in a mocked Web Worker environment and viewerApp.js integration.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.stack || err.message}`);
    failed++;
  }
}

function generateBinaryCubeBuffer(w, h, d) {
  const triangles = [
    // Front (z = d)
    [[0, 0, d], [w, 0, d], [w, h, d]],
    [[0, 0, d], [w, h, d], [0, h, d]],
    // Back (z = 0)
    [[0, 0, 0], [w, h, 0], [w, 0, 0]],
    [[0, 0, 0], [0, h, 0], [w, h, 0]],
    // Top (y = h)
    [[0, h, 0], [0, h, d], [w, h, d]],
    [[0, h, 0], [w, h, d], [w, h, 0]],
    // Bottom (y = 0)
    [[0, 0, 0], [w, 0, d], [0, 0, d]],
    [[0, 0, 0], [w, 0, 0], [w, 0, d]],
    // Right (x = w)
    [[w, 0, 0], [w, h, d], [w, 0, d]],
    [[w, 0, 0], [w, h, 0], [w, h, d]],
    // Left (x = 0)
    [[0, 0, 0], [0, 0, d], [0, h, d]],
    [[0, 0, 0], [0, h, d], [0, h, 0]]
  ];

  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);

  let offset = 84;
  for (const tri of triangles) {
    // normal = (0,0,0) to also exercise normal recovery
    view.setFloat32(offset, 0, true);
    view.setFloat32(offset + 4, 0, true);
    view.setFloat32(offset + 8, 0, true);
    offset += 12;
    for (const v of tri) {
      view.setFloat32(offset, v[0], true);
      view.setFloat32(offset + 4, v[1], true);
      view.setFloat32(offset + 8, v[2], true);
      offset += 12;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}

function generateAsciiCubeBuffer(w, h, d) {
  const triangles = [
    [[0, 0, d], [w, 0, d], [w, h, d]],
    [[0, 0, d], [w, h, d], [0, h, d]],
    [[0, 0, 0], [w, h, 0], [w, 0, 0]],
    [[0, 0, 0], [0, h, 0], [w, h, 0]],
    [[0, h, 0], [0, h, d], [w, h, d]],
    [[0, h, 0], [w, h, d], [w, h, 0]],
    [[0, 0, 0], [w, 0, d], [0, 0, d]],
    [[0, 0, 0], [w, 0, 0], [w, 0, d]],
    [[w, 0, 0], [w, h, d], [w, 0, d]],
    [[w, 0, 0], [w, h, 0], [w, h, d]],
    [[0, 0, 0], [0, 0, d], [0, h, d]],
    [[0, 0, 0], [0, h, d], [0, h, 0]]
  ];

  let str = 'solid cube\n';
  for (const tri of triangles) {
    str += '  facet normal 0 0 0\n    outer loop\n';
    for (const v of tri) {
      str += `      vertex ${v[0]} ${v[1]} ${v[2]}\n`;
    }
    str += '    endloop\n  endfacet\n';
  }
  str += 'endsolid cube\n';

  const encoded = new TextEncoder().encode(str);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

function createMockWorkerHarness() {
  const assetsDir = path.join(__dirname, '../Assets');
  const postedMessages = [];
  const importedScripts = [];

  const sandbox = {
    console,
    TextDecoder,
    TextEncoder,
    DataView,
    ArrayBuffer,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
    Set,
    Map,
    Math,
    Date,
    performance,
    Error,
    TypeError,
    importScripts: (...scripts) => {
      for (const rel of scripts) {
        importedScripts.push(rel);
        const fullPath = path.join(assetsDir, rel);
        const code = fs.readFileSync(fullPath, 'utf8');
        vm.runInContext(code, sandbox, { filename: fullPath });
      }
    },
    postMessage: (msg, transferables) => {
      postedMessages.push({ msg, transferables: transferables || [] });
    }
  };
  sandbox.self = sandbox;

  vm.createContext(sandbox);
  const workerPath = path.join(assetsDir, 'stlWorker.js');
  const workerCode = fs.readFileSync(workerPath, 'utf8');
  vm.runInContext(workerCode, sandbox, { filename: workerPath });

  return {
    sandbox,
    importedScripts,
    postedMessages,
    dispatchMessage: (data) => {
      assert.strictEqual(typeof sandbox.onmessage, 'function', 'stlWorker must assign self.onmessage');
      sandbox.onmessage({ data });
    }
  };
}

console.log('================================================================');
console.log('  PHASE 3C: STL WEB WORKER & FEATURE DETECTION OFFLOAD TESTS    ');
console.log('================================================================');

test('T1: Worker imports js/stlLoader.js and js/meshFeatureDetector.js', () => {
  const harness = createMockWorkerHarness();
  assert.deepStrictEqual(harness.importedScripts, ['js/stlLoader.js', 'js/meshFeatureDetector.js']);
  assert(harness.sandbox.StlLoader && typeof harness.sandbox.StlLoader.parse === 'function', 'StlLoader must be loaded');
  assert(harness.sandbox.MeshFeatureDetector && typeof harness.sandbox.MeshFeatureDetector.detectFeatures === 'function', 'MeshFeatureDetector must be loaded');
});

test('T2: Binary STL parsing + feature detection + deduplicated transferables', () => {
  const harness = createMockWorkerHarness();
  const buffer = generateBinaryCubeBuffer(10, 20, 30);

  harness.dispatchMessage({
    type: 'PARSE_STL',
    buffer,
    fileName: 'cube_binary.stl',
    loadId: 42
  });

  assert.strictEqual(harness.postedMessages.length, 1, 'Worker must post exactly 1 message');
  const { msg, transferables } = harness.postedMessages[0];

  assert.strictEqual(msg.type, 'STL_PARSE_SUCCESS');
  assert.strictEqual(msg.loadId, 42);
  assert(msg.result, 'result must be present');
  assert.strictEqual(msg.result.format, 'STL');
  assert.strictEqual(msg.result.fileName, 'cube_binary.stl');
  assert.strictEqual(msg.result.loadId, 42);
  assert.strictEqual(msg.result.totalTriangles, 12);
  assert(Math.abs(msg.result.volumeMm3 - 6000) < 1e-2, 'Volume must be 6000 mm3');
  assert(Math.abs(msg.result.areaMm2 - 2200) < 1e-2, 'Area must be 2200 mm2');

  assert.strictEqual(msg.result.meshes.length, 1);
  const mesh = msg.result.meshes[0];
  assert.strictEqual(mesh._featuresDetected, true, 'mesh._featuresDetected must be true');
  assert(Array.isArray(mesh.edgeFeatures), 'mesh.edgeFeatures must be an array');
  assert(Array.isArray(mesh.brepFaces) && mesh.brepFaces.length === 6, 'Cube must have 6 planar brepFaces');
  assert(mesh.edgeIndices && mesh.edgeIndices.length > 0, 'mesh.edgeIndices must be populated');

  // Verify transferables are deduplicated and contain all mesh typed array buffers
  assert(Array.isArray(transferables) && transferables.length > 0, 'transferables must be non-empty');
  assert.strictEqual(new Set(transferables).size, transferables.length, 'transferables must be deduplicated');
  assert(transferables.includes(mesh.position.buffer), 'position.buffer must be in transferables');
  assert(transferables.includes(mesh.normal.buffer), 'normal.buffer must be in transferables');
  assert(transferables.includes(mesh.edgeIndices.buffer), 'edgeIndices.buffer must be in transferables');
  for (const bf of mesh.brepFaces) {
    assert(transferables.includes(bf.triangles.buffer), 'brepFaces[i].triangles.buffer must be in transferables');
  }
  for (const ef of mesh.edgeFeatures) {
    if (ef.points && ef.points.buffer) {
      assert(transferables.includes(ef.points.buffer), 'edgeFeatures[i].points.buffer must be in transferables');
    }
  }
});

test('T3: ASCII STL parsing + feature detection + transferables', () => {
  const harness = createMockWorkerHarness();
  const buffer = generateAsciiCubeBuffer(10, 20, 30);

  harness.dispatchMessage({
    type: 'PARSE_STL',
    buffer,
    fileName: 'cube_ascii.stl',
    loadId: 99
  });

  assert.strictEqual(harness.postedMessages.length, 1);
  const { msg, transferables } = harness.postedMessages[0];
  assert.strictEqual(msg.type, 'STL_PARSE_SUCCESS');
  assert.strictEqual(msg.loadId, 99);
  assert.strictEqual(msg.result.totalTriangles, 12);
  const mesh = msg.result.meshes[0];
  assert.strictEqual(mesh._featuresDetected, true);
  assert.strictEqual(mesh.brepFaces.length, 6);
  assert(transferables.includes(mesh.position.buffer));
  assert(transferables.includes(mesh.normal.buffer));
  assert(transferables.includes(mesh.edgeIndices.buffer));
});

test('T4: Error handling posts STL_PARSE_ERROR with loadId and message', () => {
  const harness = createMockWorkerHarness();
  const badBuffer = new ArrayBuffer(12); // Too small / invalid STL

  harness.dispatchMessage({
    type: 'PARSE_STL',
    buffer: badBuffer,
    fileName: 'corrupt.stl',
    loadId: 7
  });

  assert.strictEqual(harness.postedMessages.length, 1);
  const { msg } = harness.postedMessages[0];
  assert.strictEqual(msg.type, 'STL_PARSE_ERROR');
  assert.strictEqual(msg.loadId, 7);
  assert(typeof msg.message === 'string' && msg.message.length > 0, 'Error message must be non-empty');
});

test('T5: Static viewerApp.js integration checks (lazy stlWorker, cleanup, Escape modal)', () => {
  const viewerAppSrc = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');

  assert(viewerAppSrc.includes('let stlWorker = null;'), 'stlWorker state variable must exist');
  assert(viewerAppSrc.includes("new Worker('stlWorker.js')"), 'initStlWorker must instantiate stlWorker.js');
  assert(viewerAppSrc.includes("typeof Worker !== 'undefined'"), 'startTessellation must guard Worker usage');
  assert(viewerAppSrc.includes("type: 'PARSE_STL'"), 'startTessellation must post PARSE_STL to stlWorker');
  assert(viewerAppSrc.includes('stlWorker.terminate()'), 'stlWorker must be terminated on cleanup/cancel');
  assert(viewerAppSrc.includes('blueprint-preview-modal'), 'Escape handler must check #blueprint-preview-modal');
  assert(viewerAppSrc.includes('BlueprintEngine?.closePreview'), 'Escape handler must call BlueprintEngine?.closePreview?.()');
});

console.log('\n================================================================');
console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('================================================================');

process.exit(failed > 0 ? 1 : 0);
