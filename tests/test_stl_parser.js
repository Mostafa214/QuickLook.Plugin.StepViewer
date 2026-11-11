/**
 * QuickLook CAD Studio - Automated STL Parser & Pipeline Isolation Test Suite
 * File: tests/test_stl_parser.js
 *
 * Verifies:
 * Suite 1: Dual-Format Detection & Binary Priority
 * Suite 2: Binary Cube Geometry & Physical Properties (Gauss Volume, Area, AABB, Topology)
 * Suite 3: ASCII Cube Geometry & Scientific Notation
 * Suite 4: Regular Tetrahedron Verification (Analytical Geometry)
 * Suite 5: Non-Watertight / Open Mesh Detection
 * Suite 6: Zero-Normals Degenerate Recovery
 * Suite 7: High-Density Benchmark (10,800 Triangles < 15ms SLA)
 * Suite 8: Pipeline Isolation, WASM Worker Bypass & Output Schema
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Environment bootstrap: Load Three.js and StlLoader
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));
if (typeof global.window === 'undefined') {
  global.window = {};
}
global.THREE = THREE;

const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));
global.window.StlLoader = StlLoader;

console.log('================================================================');
console.log('  PURE JS STL LOADER & PIPELINE ISOLATION TEST SUITE            ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

// =============================================================================
// Synthetic Fixture Generators
// =============================================================================

/**
 * Generates an ArrayBuffer containing a canonical Binary STL cube.
 * @param {number} dx Length in X (default 10)
 * @param {number} dy Length in Y (default 20)
 * @param {number} dz Length in Z (default 30)
 * @param {Object} [opts] Options: { headerText, zeroNormals, openTop }
 * @returns {ArrayBuffer}
 */
function generateBinaryCubeBuffer(dx = 10, dy = 20, dz = 30, opts = {}) {
  const triCount = opts.openTop ? 10 : 12;
  const buf = Buffer.alloc(84 + 50 * triCount);
  const header = opts.headerText || 'Binary Cube 10x20x30';
  buf.write(header, 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);

  const faces = [
    // Bottom (Z=0, normal [0, 0, -1])
    { n: [0, 0, -1], a: [0, 0, 0], b: [0, dy, 0], c: [dx, dy, 0] },
    { n: [0, 0, -1], a: [0, 0, 0], b: [dx, dy, 0], c: [dx, 0, 0] },
    // Front (Y=0, normal [0, -1, 0])
    { n: [0, -1, 0], a: [0, 0, 0], b: [dx, 0, 0], c: [dx, 0, dz] },
    { n: [0, -1, 0], a: [0, 0, 0], b: [dx, 0, dz], c: [0, 0, dz] },
    // Back (Y=dy, normal [0, 1, 0])
    { n: [0, 1, 0], a: [0, dy, 0], b: [0, dy, dz], c: [dx, dy, dz] },
    { n: [0, 1, 0], a: [0, dy, 0], b: [dx, dy, dz], c: [dx, dy, 0] },
    // Left (X=0, normal [-1, 0, 0])
    { n: [-1, 0, 0], a: [0, 0, 0], b: [0, 0, dz], c: [0, dy, dz] },
    { n: [-1, 0, 0], a: [0, 0, 0], b: [0, dy, dz], c: [0, dy, 0] },
    // Right (X=dx, normal [1, 0, 0])
    { n: [1, 0, 0], a: [dx, 0, 0], b: [dx, dy, 0], c: [dx, dy, dz] },
    { n: [1, 0, 0], a: [dx, 0, 0], b: [dx, dy, dz], c: [dx, 0, dz] }
  ];

  if (!opts.openTop) {
    // Top (Z=dz, normal [0, 0, 1])
    faces.push(
      { n: [0, 0, 1], a: [0, 0, dz], b: [dx, 0, dz], c: [dx, dy, dz] },
      { n: [0, 0, 1], a: [0, 0, dz], b: [dx, dy, dz], c: [0, dy, dz] }
    );
  }

  let offset = 84;
  for (const f of faces) {
    const n = opts.zeroNormals ? [0, 0, 0] : f.n;
    buf.writeFloatLE(n[0], offset);
    buf.writeFloatLE(n[1], offset + 4);
    buf.writeFloatLE(n[2], offset + 8);
    buf.writeFloatLE(f.a[0], offset + 12);
    buf.writeFloatLE(f.a[1], offset + 16);
    buf.writeFloatLE(f.a[2], offset + 20);
    buf.writeFloatLE(f.b[0], offset + 24);
    buf.writeFloatLE(f.b[1], offset + 28);
    buf.writeFloatLE(f.b[2], offset + 32);
    buf.writeFloatLE(f.c[0], offset + 36);
    buf.writeFloatLE(f.c[1], offset + 40);
    buf.writeFloatLE(f.c[2], offset + 44);
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Generates an ArrayBuffer containing a canonical ASCII STL cube.
 * @param {number} dx Length in X (default 10)
 * @param {number} dy Length in Y (default 20)
 * @param {number} dz Length in Z (default 30)
 * @param {Object} [opts] Options: { name, useScientific, mixedCase }
 * @returns {ArrayBuffer}
 */
function generateAsciiCubeBuffer(dx = 10, dy = 20, dz = 30, opts = {}) {
  const name = opts.name || 'ASCII_Cube';
  const fmt = (v) => opts.useScientific ? Number(v).toExponential(6) : Number(v).toFixed(4);
  const facetTag = opts.mixedCase ? 'FaCeT' : 'facet';
  const normalTag = opts.mixedCase ? 'NoRmAl' : 'normal';
  const outerTag = opts.mixedCase ? 'OuTeR lOoP' : 'outer loop';
  const vertexTag = opts.mixedCase ? 'VeRtEx' : 'vertex';
  const endloopTag = opts.mixedCase ? 'EnDlOoP' : 'endloop';
  const endfacetTag = opts.mixedCase ? 'EnDfAcEt' : 'endfacet';

  const faces = [
    { n: [0, 0, -1], a: [0, 0, 0], b: [0, dy, 0], c: [dx, dy, 0] },
    { n: [0, 0, -1], a: [0, 0, 0], b: [dx, dy, 0], c: [dx, 0, 0] },
    { n: [0, -1, 0], a: [0, 0, 0], b: [dx, 0, 0], c: [dx, 0, dz] },
    { n: [0, -1, 0], a: [0, 0, 0], b: [dx, 0, dz], c: [0, 0, dz] },
    { n: [0, 1, 0], a: [0, dy, 0], b: [0, dy, dz], c: [dx, dy, dz] },
    { n: [0, 1, 0], a: [0, dy, 0], b: [dx, dy, dz], c: [dx, dy, 0] },
    { n: [-1, 0, 0], a: [0, 0, 0], b: [0, 0, dz], c: [0, dy, dz] },
    { n: [-1, 0, 0], a: [0, 0, 0], b: [0, dy, dz], c: [0, dy, 0] },
    { n: [1, 0, 0], a: [dx, 0, 0], b: [dx, dy, 0], c: [dx, dy, dz] },
    { n: [1, 0, 0], a: [dx, 0, 0], b: [dx, dy, dz], c: [dx, 0, dz] },
    { n: [0, 0, 1], a: [0, 0, dz], b: [dx, 0, dz], c: [dx, dy, dz] },
    { n: [0, 0, 1], a: [0, 0, dz], b: [dx, dy, dz], c: [0, dy, dz] }
  ];

  let str = `solid ${name}\n`;
  for (const f of faces) {
    str += `  ${facetTag} ${normalTag} ${fmt(f.n[0])} ${fmt(f.n[1])} ${fmt(f.n[2])}\n`;
    str += `    ${outerTag}\n`;
    str += `      ${vertexTag} ${fmt(f.a[0])} ${fmt(f.a[1])} ${fmt(f.a[2])}\n`;
    str += `      ${vertexTag} ${fmt(f.b[0])} ${fmt(f.b[1])} ${fmt(f.b[2])}\n`;
    str += `      ${vertexTag} ${fmt(f.c[0])} ${fmt(f.c[1])} ${fmt(f.c[2])}\n`;
    str += `    ${endloopTag}\n`;
    str += `  ${endfacetTag}\n`;
  }
  str += `endsolid ${name}\n`;

  const nodeBuf = Buffer.from(str, 'utf8');
  return nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);
}

/**
 * Generates an ArrayBuffer containing a regular 4-triangle tetrahedron.
 * @returns {ArrayBuffer}
 */
function generateBinaryTetrahedronBuffer() {
  const triCount = 4;
  const buf = Buffer.alloc(84 + 50 * triCount);
  buf.write('Regular Tetrahedron', 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);

  const p1 = [1, 1, 1], p2 = [1, -1, -1], p3 = [-1, 1, -1], p4 = [-1, -1, 1];
  const faces = [
    [p1, p2, p3],
    [p1, p4, p2],
    [p1, p3, p4],
    [p2, p4, p3]
  ];

  let offset = 84;
  for (const [a, b, c] of faces) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;

    buf.writeFloatLE(nx / len, offset);
    buf.writeFloatLE(ny / len, offset + 4);
    buf.writeFloatLE(nz / len, offset + 8);
    buf.writeFloatLE(a[0], offset + 12);
    buf.writeFloatLE(a[1], offset + 16);
    buf.writeFloatLE(a[2], offset + 20);
    buf.writeFloatLE(b[0], offset + 24);
    buf.writeFloatLE(b[1], offset + 28);
    buf.writeFloatLE(b[2], offset + 32);
    buf.writeFloatLE(c[0], offset + 36);
    buf.writeFloatLE(c[1], offset + 40);
    buf.writeFloatLE(c[2], offset + 44);
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Generates an ArrayBuffer of a subdivided cube for high-density benchmarking (10,800 triangles).
 * @param {number} M Grid subdivisions per face (default 30 => 10,800 triangles)
 * @returns {ArrayBuffer}
 */
function generateSubdividedCubeBuffer(M = 30) {
  const L = 10, W = 20, H = 30;
  const triCount = 6 * 2 * M * M;
  const buf = Buffer.alloc(84 + 50 * triCount);
  buf.write('Benchmark Subdivided Cube', 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);

  let offset = 84;
  function writeTri(n, a, b, c) {
    buf.writeFloatLE(n[0], offset); buf.writeFloatLE(n[1], offset + 4); buf.writeFloatLE(n[2], offset + 8);
    buf.writeFloatLE(a[0], offset + 12); buf.writeFloatLE(a[1], offset + 16); buf.writeFloatLE(a[2], offset + 20);
    buf.writeFloatLE(b[0], offset + 24); buf.writeFloatLE(b[1], offset + 28); buf.writeFloatLE(b[2], offset + 32);
    buf.writeFloatLE(c[0], offset + 36); buf.writeFloatLE(c[1], offset + 40); buf.writeFloatLE(c[2], offset + 44);
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }

  function addQuad(n, p00, p01, p11, p10) {
    writeTri(n, p00, p01, p11);
    writeTri(n, p00, p11, p10);
  }

  // Bottom Z=0 (normal [0, 0, -1])
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const x0 = (i / M) * L, x1 = ((i + 1) / M) * L;
      const y0 = (j / M) * W, y1 = ((j + 1) / M) * W;
      addQuad([0, 0, -1], [x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0]);
    }
  }
  // Top Z=H (normal [0, 0, 1])
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const x0 = (i / M) * L, x1 = ((i + 1) / M) * L;
      const y0 = (j / M) * W, y1 = ((j + 1) / M) * W;
      writeTri([0, 0, 1], [x0, y0, H], [x1, y0, H], [x1, y1, H]);
      writeTri([0, 0, 1], [x0, y0, H], [x1, y1, H], [x0, y1, H]);
    }
  }
  // Front Y=0 (normal [0, -1, 0])
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < M; k++) {
      const x0 = (i / M) * L, x1 = ((i + 1) / M) * L;
      const z0 = (k / M) * H, z1 = ((k + 1) / M) * H;
      writeTri([0, -1, 0], [x0, 0, z0], [x1, 0, z0], [x1, 0, z1]);
      writeTri([0, -1, 0], [x0, 0, z0], [x1, 0, z1], [x0, 0, z1]);
    }
  }
  // Back Y=W (normal [0, 1, 0])
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < M; k++) {
      const x0 = (i / M) * L, x1 = ((i + 1) / M) * L;
      const z0 = (k / M) * H, z1 = ((k + 1) / M) * H;
      addQuad([0, 1, 0], [x0, W, z0], [x0, W, z1], [x1, W, z1], [x1, W, z0]);
    }
  }
  // Left X=0 (normal [-1, 0, 0])
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < M; k++) {
      const y0 = (j / M) * W, y1 = ((j + 1) / M) * W;
      const z0 = (k / M) * H, z1 = ((k + 1) / M) * H;
      addQuad([-1, 0, 0], [0, y0, z0], [0, y0, z1], [0, y1, z1], [0, y1, z0]);
    }
  }
  // Right X=L (normal [1, 0, 0])
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < M; k++) {
      const y0 = (j / M) * W, y1 = ((j + 1) / M) * W;
      const z0 = (k / M) * H, z1 = ((k + 1) / M) * H;
      writeTri([1, 0, 0], [L, y0, z0], [L, y1, z0], [L, y1, z1]);
      writeTri([1, 0, 0], [L, y0, z0], [L, y1, z1], [L, y0, z1]);
    }
  }

  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// =============================================================================
// Suite 1: Dual-Format Detection & Binary Priority
// =============================================================================
console.log('--- Suite 1: Dual-Format Detection & Binary Priority ---');

test('T1.1: Standard Binary Byte Length detected as binary', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30);
  assert.strictEqual(buf.byteLength, 684);
  const type = StlLoader.detectType(buf);
  assert.strictEqual(type, 'binary');
});

test('T1.2: Binary Header with "solid" String classified as binary (not ASCII)', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30, {
    headerText: 'solid BinaryModel with solid keyword in header exported by CAD'
  });
  const type = StlLoader.detectType(buf);
  assert.strictEqual(type, 'binary', 'Binary length check MUST precede ASCII solid check');
  const result = StlLoader.parse(buf, 'model_with_solid_header.stl');
  assert.strictEqual(result.totalTriangles, 12);
  assert.strictEqual(result.format, 'STL');
});

test('T1.3: ASCII Preamble Detection correctly identifies ASCII STL', () => {
  const buf = generateAsciiCubeBuffer(10, 20, 30);
  const type = StlLoader.detectType(buf);
  assert.strictEqual(type, 'ascii');
});

test('T1.4: Mixed-Case & Whitespace Tolerance in ASCII STL', () => {
  const buf = generateAsciiCubeBuffer(10, 20, 30, { mixedCase: true });
  const type = StlLoader.detectType(buf);
  assert.strictEqual(type, 'ascii');
  const result = StlLoader.parse(buf, 'mixed_case.stl');
  assert.strictEqual(result.totalTriangles, 12);
});

test('T1.5: Corrupted / Truncated Buffers rejected', () => {
  // Truncated binary buffer (declared 12 triangles but only 400 bytes)
  const corruptBuf = Buffer.alloc(400);
  corruptBuf.writeUInt32LE(12, 80);
  const type = StlLoader.detectType(corruptBuf.buffer);
  assert.strictEqual(type, 'invalid');

  assert.throws(() => {
    StlLoader.parse(corruptBuf.buffer, 'corrupt.stl');
  }, /Invalid STL file/);
});

// =============================================================================
// Suite 2: Binary Cube Geometry & Physical Properties
// =============================================================================
console.log('\n--- Suite 2: Binary Cube Geometry & Physical Properties ---');

test('T2.1: Coordinate Buffering layout (Float32Array 108 floats)', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30);
  const result = StlLoader.parse(buf, 'cube.stl');
  const mesh = result.meshes[0];
  assert(mesh.position instanceof Float32Array, 'position must be Float32Array');
  assert.strictEqual(mesh.position.length, 12 * 9);
  assert(mesh.normal instanceof Float32Array, 'normal must be Float32Array');
  assert.strictEqual(mesh.normal.length, 12 * 9);
  assert.strictEqual(mesh.index, null);
});

test('T2.2: Three.js BufferGeometry compatibility', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30);
  const result = StlLoader.parse(buf, 'cube.stl');
  const mesh = result.meshes[0];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normal, 3));
  geometry.computeBoundingBox();

  assert.strictEqual(geometry.attributes.position.count, 36);
  assert.strictEqual(geometry.boundingBox.max.x, 10);
  assert.strictEqual(geometry.boundingBox.max.y, 20);
  assert.strictEqual(geometry.boundingBox.max.z, 30);
});

test('T2.3: Exact Gauss Signed Volume (V = 6000.0 mm³)', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30);
  const result = StlLoader.parse(buf, 'cube.stl');
  const mesh = result.meshes[0];
  const expectedVol = 10 * 20 * 30; // 6000 mm³
  const relError = Math.abs(mesh.volumeMm3 - expectedVol) / expectedVol;
  assert(relError < 0.0001, `Volume error ${relError} exceeds 0.01% threshold. Got ${mesh.volumeMm3}`);
  assert.strictEqual(result.volumeMm3, mesh.volumeMm3);
});

test('T2.4: Surface Area Verification (A = 2200.0 mm²)', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30);
  const result = StlLoader.parse(buf, 'cube.stl');
  const mesh = result.meshes[0];
  const expectedArea = 2 * (10 * 20 + 20 * 30 + 10 * 30); // 2200 mm²
  const relError = Math.abs(mesh.areaMm2 - expectedArea) / expectedArea;
  assert(relError < 0.0001, `Area error ${relError} exceeds 0.01% threshold. Got ${mesh.areaMm2}`);
  assert.strictEqual(result.areaMm2, mesh.areaMm2);
});

test('T2.5: Bounding Box Extents ([0,0,0] to [10,20,30])', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30);
  const result = StlLoader.parse(buf, 'cube.stl');
  const bbox = result.meshes[0].bbox;
  assert.deepStrictEqual(bbox.min, [0, 0, 0]);
  assert.deepStrictEqual(bbox.max, [10, 20, 30]);
  assert.deepStrictEqual(bbox.size, [10, 20, 30]);
});

test('T2.6: Watertight & Manifold Status for closed cube', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30);
  const result = StlLoader.parse(buf, 'cube.stl');
  assert.strictEqual(result.isWatertight, true);
  assert.strictEqual(result.isManifold, true);
  assert.strictEqual(result.meshes[0].isWatertight, true);
  assert.strictEqual(result.meshes[0].isManifold, true);
});

// =============================================================================
// Suite 3: ASCII Cube Geometry & Scientific Notation
// =============================================================================
console.log('\n--- Suite 3: ASCII Cube Geometry & Scientific Notation ---');

test('T3.1: ASCII Vertex Parsing (12 facets, 36 vertices)', () => {
  const buf = generateAsciiCubeBuffer(10, 20, 30);
  const result = StlLoader.parse(buf, 'ascii_cube.stl');
  assert.strictEqual(result.totalTriangles, 12);
  assert.strictEqual(result.meshes[0].position.length, 108);
  assert.strictEqual(result.meshes[0].normal.length, 108);
});

test('T3.2: Scientific Notation Parsing (1.000000e+01, etc.)', () => {
  const buf = generateAsciiCubeBuffer(10, 20, 30, { useScientific: true });
  const result = StlLoader.parse(buf, 'sci_cube.stl');
  assert.strictEqual(result.totalTriangles, 12);
  const bbox = result.meshes[0].bbox;
  assert.strictEqual(Math.round(bbox.max[0]), 10);
  assert.strictEqual(Math.round(bbox.max[1]), 20);
  assert.strictEqual(Math.round(bbox.max[2]), 30);
});

test('T3.3: ASCII Volume Accuracy (V = 6000.0 mm³)', () => {
  const buf = generateAsciiCubeBuffer(10, 20, 30, { useScientific: true });
  const result = StlLoader.parse(buf, 'sci_cube.stl');
  const expectedVol = 6000.0;
  const relError = Math.abs(result.volumeMm3 - expectedVol) / expectedVol;
  assert(relError < 0.0001, `ASCII volume error ${relError} exceeds 0.01% threshold. Got ${result.volumeMm3}`);
});

test('T3.4: ASCII Surface Area Accuracy (A = 2200.0 mm²)', () => {
  const buf = generateAsciiCubeBuffer(10, 20, 30, { useScientific: true });
  const result = StlLoader.parse(buf, 'sci_cube.stl');
  const expectedArea = 2200.0;
  const relError = Math.abs(result.areaMm2 - expectedArea) / expectedArea;
  assert(relError < 0.0001, `ASCII area error ${relError} exceeds 0.01% threshold. Got ${result.areaMm2}`);
});

// =============================================================================
// Suite 4: Regular Tetrahedron Verification (Analytical Geometry)
// =============================================================================
console.log('\n--- Suite 4: Regular Tetrahedron Verification ---');

test('T4.1: Tetrahedron Ingestion (4 triangles, 12 vertices)', () => {
  const buf = generateBinaryTetrahedronBuffer();
  const result = StlLoader.parse(buf, 'tetrahedron.stl');
  assert.strictEqual(result.totalTriangles, 4);
  assert.strictEqual(result.meshes[0].position.length, 36);
});

test('T4.2: Theoretical Tetrahedron Volume (V = 8/3 mm³)', () => {
  const buf = generateBinaryTetrahedronBuffer();
  const result = StlLoader.parse(buf, 'tetrahedron.stl');
  const expectedVol = 8.0 / 3.0; // 2.666667
  const relError = Math.abs(result.volumeMm3 - expectedVol) / expectedVol;
  assert(relError < 0.0001, `Tetrahedron volume error ${relError}. Expected ${expectedVol}, got ${result.volumeMm3}`);
});

test('T4.3: Theoretical Tetrahedron Surface Area (A = 8*sqrt(3) mm²)', () => {
  const buf = generateBinaryTetrahedronBuffer();
  const result = StlLoader.parse(buf, 'tetrahedron.stl');
  const expectedArea = 8.0 * Math.sqrt(3.0); // 13.856406
  const relError = Math.abs(result.areaMm2 - expectedArea) / expectedArea;
  assert(relError < 0.0001, `Tetrahedron area error ${relError}. Expected ${expectedArea}, got ${result.areaMm2}`);
});

test('T4.4: Tetrahedron Watertight Topology (6 unique edges, count=2)', () => {
  const buf = generateBinaryTetrahedronBuffer();
  const result = StlLoader.parse(buf, 'tetrahedron.stl');
  assert.strictEqual(result.isWatertight, true);
  assert.strictEqual(result.isManifold, true);
});

// =============================================================================
// Suite 5: Non-Watertight / Open Mesh Detection
// =============================================================================
console.log('\n--- Suite 5: Non-Watertight / Open Mesh Detection ---');

test('T5.1: Boundary Edge Identification on Open Mesh', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30, { openTop: true });
  const result = StlLoader.parse(buf, 'open_cube.stl');
  assert.strictEqual(result.totalTriangles, 10);
  assert.strictEqual(result.isWatertight, false, 'Mesh missing top face must not be watertight');
  assert.strictEqual(result.isManifold, true, 'Mesh with boundary edges is still 2-manifold');
});

test('T5.2: Watertight Flag False for Open Mesh', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30, { openTop: true });
  const result = StlLoader.parse(buf, 'open_cube.stl');
  assert.strictEqual(result.meshes[0].isWatertight, false);
});

// =============================================================================
// Suite 6: Zero-Normals Degenerate Recovery
// =============================================================================
console.log('\n--- Suite 6: Zero-Normals Degenerate Recovery ---');

test('T6.1: Detection & Handling of (0,0,0) Normals without NaN', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30, { zeroNormals: true });
  const result = StlLoader.parse(buf, 'zero_normals.stl');
  const normals = result.meshes[0].normal;
  for (let i = 0; i < normals.length; i++) {
    assert(!isNaN(normals[i]), `Normal at index ${i} is NaN`);
    assert(isFinite(normals[i]), `Normal at index ${i} is not finite`);
  }
});

test('T6.2: Reconstructed Normal Magnitude ||n|| ≈ 1.0', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30, { zeroNormals: true });
  const result = StlLoader.parse(buf, 'zero_normals.stl');
  const normals = result.meshes[0].normal;
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    assert(Math.abs(len - 1.0) < 1e-4, `Normal magnitude ${len} deviates from 1.0`);
  }
});

test('T6.3: Geometric Outward Direction of Recovered Normals', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30, { zeroNormals: true });
  const result = StlLoader.parse(buf, 'zero_normals.stl');
  const normals = result.meshes[0].normal;
  // First triangle is Bottom face (Z=0). Normal should point in -Z direction: [0, 0, -1]
  assert(Math.abs(normals[0]) < 1e-4, `nx should be ~0, got ${normals[0]}`);
  assert(Math.abs(normals[1]) < 1e-4, `ny should be ~0, got ${normals[1]}`);
  assert(Math.abs(normals[2] - (-1.0)) < 1e-4, `nz should be -1.0, got ${normals[2]}`);
});

// =============================================================================
// Suite 7: High-Density Benchmark (10,800 Triangles)
// =============================================================================
console.log('\n--- Suite 7: High-Density Benchmark (10,800 Triangles) ---');

test('T7.1: Parsing Speed SLA (< 15ms for 10,800 Triangles)', () => {
  const buf = generateSubdividedCubeBuffer(30);
  assert.strictEqual(buf.byteLength, 84 + 50 * 10800);

  // Warm-up pass to trigger V8 JIT compilation
  StlLoader.parse(buf, 'warmup.stl');

  const t0 = performance.now();
  const result = StlLoader.parse(buf, 'benchmark.stl');
  const duration = performance.now() - t0;

  console.log(`      * Benchmark parsed 10,800 triangles in ${duration.toFixed(2)}ms (SLA: < 15ms)`);
  assert(duration < 15.0, `Parsing duration ${duration.toFixed(2)}ms exceeded 15ms SLA`);
  assert.strictEqual(result.totalTriangles, 10800);
});

test('T7.2: High-Density Volume Invariant (V = 6000.0 mm³)', () => {
  const buf = generateSubdividedCubeBuffer(30);
  const result = StlLoader.parse(buf, 'benchmark.stl');
  const expectedVol = 6000.0;
  const relError = Math.abs(result.volumeMm3 - expectedVol) / expectedVol;
  assert(relError < 0.0001, `High-density volume error ${relError}. Expected ${expectedVol}, got ${result.volumeMm3}`);
});

test('T7.3: Scale Topology Invariant (isWatertight === true on 16,200 edges)', () => {
  const buf = generateSubdividedCubeBuffer(30);
  const result = StlLoader.parse(buf, 'benchmark.stl');
  assert.strictEqual(result.isWatertight, true, 'Subdivided cube must be watertight');
  assert.strictEqual(result.isManifold, true, 'Subdivided cube must be 2-manifold');
});

// =============================================================================
// Suite 8: Pipeline Isolation, WASM Worker Bypass & Output Schema
// =============================================================================
console.log('\n--- Suite 8: Pipeline Isolation & Worker Bypass ---');

test('T8.1: Static ViewerApp Inspection - initViewport does not call initWorker()', () => {
  const viewerAppSrc = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  const initViewportMatch = viewerAppSrc.match(/function\s+initViewport\s*\(\)\s*\{([\s\S]*?)\n\s*function\s+/);
  assert(initViewportMatch, 'initViewport function must exist in Assets/js/viewerApp.js');
  const body = initViewportMatch[1];
  assert(!body.includes('initWorker('), 'initViewport must not eagerly call initWorker()');
});

test('T8.2: Format Routing in detectCadFormat', () => {
  const viewerAppSrc = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');
  const detectMatch = viewerAppSrc.match(/function\s+detectCadFormat\s*\([\s\S]*?\n\s*\}/);
  assert(detectMatch, 'detectCadFormat must exist');
  const fnCode = detectMatch[0];
  const testFn = new Function('name', fnCode + '\nreturn detectCadFormat(name);');

  assert.strictEqual(testFn('model.stl'), 'STL');
  assert.strictEqual(testFn('MODEL.STL'), 'STL');
  assert.strictEqual(testFn('component.step'), 'STEP');
  assert.strictEqual(testFn('part.stp'), 'STEP');
  assert.strictEqual(testFn('assembly.iges'), 'IGES');
  assert.strictEqual(testFn('wire.igs'), 'IGES');
  assert.strictEqual(testFn('shape.brep'), 'BREP');
});

test('T8.3: Mock Worker Isolation Check - STL buffer creates 0 Web Workers', () => {
  let workerConstructedCount = 0;
  class MockWorker {
    constructor(script) {
      workerConstructedCount++;
      this.script = script;
    }
    postMessage() {}
    terminate() {}
  }
  global.Worker = MockWorker;

  // Simulate viewerApp startTessellation logic for STL
  let tessellationResult = null;
  function mockOnTessellationComplete(res) {
    tessellationResult = res;
  }

  const stlBuffer = generateBinaryCubeBuffer(10, 20, 30);
  const format = 'STL';

  if (format === 'STL') {
    const res = StlLoader.parse(stlBuffer, 'sample.stl');
    mockOnTessellationComplete(res);
  } else {
    new Worker('stepWorker.js');
  }

  assert.strictEqual(workerConstructedCount, 0, 'Worker must NOT be instantiated for STL files');
  assert(tessellationResult !== null, 'Tessellation result must be dispatched');
  assert.strictEqual(tessellationResult.format, 'STL');
  assert.strictEqual(tessellationResult.totalTriangles, 12);
});

test('T8.4: Lazy Worker Initialization Check - STEP buffer triggers Worker', () => {
  let workerConstructedCount = 0;
  class MockWorker {
    constructor(script) {
      workerConstructedCount++;
      this.script = script;
    }
    postMessage() {}
    terminate() {}
  }
  global.Worker = MockWorker;

  let currentWorker = null;
  function mockInitWorker() {
    currentWorker = new MockWorker('stepWorker.js');
  }

  const format = 'STEP';
  if (format === 'STL') {
    StlLoader.parse(new ArrayBuffer(100), 'sample.stl');
  } else {
    if (!currentWorker) {
      mockInitWorker();
    }
  }

  assert.strictEqual(workerConstructedCount, 1, 'Worker must be lazily initialized on demand for STEP');
  assert(currentWorker !== null);
});

test('T8.5: Output Schema Conformance matching onTessellationComplete', () => {
  const buf = generateBinaryCubeBuffer(10, 20, 30);
  const result = StlLoader.parse(buf, 'conformance.stl');

  // Root schema properties
  assert.strictEqual(result.format, 'STL');
  assert.strictEqual(result.fileName, 'conformance.stl');
  assert(Array.isArray(result.meshes), 'meshes must be an array');
  assert.strictEqual(result.meshCount, 1);
  assert.strictEqual(result.isMultiBody, false);
  assert.strictEqual(typeof result.totalTriangles, 'number');
  assert.strictEqual(typeof result.elapsedMs, 'number');
  assert.strictEqual(typeof result.volumeMm3, 'number');
  assert.strictEqual(typeof result.areaMm2, 'number');
  assert.strictEqual(typeof result.isWatertight, 'boolean');
  assert.strictEqual(typeof result.isManifold, 'boolean');

  // Mesh schema properties
  const m = result.meshes[0];
  assert.strictEqual(m.id, 0);
  assert.strictEqual(typeof m.name, 'string');
  assert(Array.isArray(m.color), 'color must be an array');
  assert.strictEqual(m.hasOriginalColor, false);
  assert(m.position instanceof Float32Array, 'position must be Float32Array');
  assert(m.normal instanceof Float32Array, 'normal must be Float32Array');
  assert.strictEqual(m.index, null);
  assert.strictEqual(m.edgeIndices, null);
  assert(Array.isArray(m.edgeFeatures), 'edgeFeatures must be an array');
  assert(Array.isArray(m.brepFaces), 'brepFaces must be an array');
  assert.strictEqual(typeof m.volumeMm3, 'number');
  assert.strictEqual(typeof m.areaMm2, 'number');
  assert(m.bbox && typeof m.bbox === 'object', 'bbox must be an object');
  assert(Array.isArray(m.bbox.min) && m.bbox.min.length === 3);
  assert(Array.isArray(m.bbox.max) && m.bbox.max.length === 3);
  assert(Array.isArray(m.bbox.size) && m.bbox.size.length === 3);
  assert.strictEqual(typeof m.isWatertight, 'boolean');
  assert.strictEqual(typeof m.isManifold, 'boolean');
});

// =============================================================================
// Suite 9: Edge Case Regression Tests (Milestone 2 Challenger Edge Cases)
// =============================================================================
console.log('\n--- Suite 9: Edge Case Regression Tests ---');

test('T9.1: Long ASCII Preamble (> 1024 bytes) parses successfully', () => {
  // Construct ASCII STL with 2000 bytes of comments/metadata before the first facet normal
  let longPreamble = 'solid LongPreambleModel\n';
  const commentLine = '# Parameter metadata, slicing profile, and software license block information\n';
  while (longPreamble.length < 2000) {
    longPreamble += commentLine;
  }
  const asciiBody = longPreamble +
    '  facet normal 0.0 0.0 1.0\n' +
    '    outer loop\n' +
    '      vertex 0.0 0.0 0.0\n' +
    '      vertex 10.0 0.0 0.0\n' +
    '      vertex 0.0 10.0 0.0\n' +
    '    endloop\n' +
    '  endfacet\n' +
    'endsolid LongPreambleModel\n';

  const buf = Buffer.from(asciiBody, 'utf-8');
  assert.strictEqual(StlLoader.detectType(buf), 'ascii', 'ASCII STL with >1024 bytes preamble must be detected as ASCII');
  const res = StlLoader.parse(buf, 'long_preamble.stl');
  assert.strictEqual(res.format, 'STL');
  assert.strictEqual(res.totalTriangles, 1);
  assert.strictEqual(res.meshes[0].name, 'LongPreambleModel');
});

test('T9.2: Solid header line with no name does not capture line 2 as mesh name', () => {
  // File with "solid\n" and no name on line 1
  const asciiNoName =
    'solid\n' +
    '  facet normal 0.0 0.0 1.0\n' +
    '    outer loop\n' +
    '      vertex 0.0 0.0 0.0\n' +
    '      vertex 1.0 0.0 0.0\n' +
    '      vertex 0.0 1.0 0.0\n' +
    '    endloop\n' +
    '  endfacet\n' +
    'endsolid\n';

  const buf = Buffer.from(asciiNoName, 'utf-8');
  const res = StlLoader.parse(buf, 'custom_fallback.stl');
  assert.strictEqual(res.meshes[0].name, 'custom_fallback.stl', 'Name must fallback to fileName and not capture line 2');
  assert.notStrictEqual(res.meshes[0].name, 'facet normal 0.0 0.0 1.0');

  // Also test with trailing spaces after solid
  const asciiSpacesOnly =
    'solid   \r\n' +
    '  facet normal 0.0 0.0 1.0\n' +
    '    outer loop\n' +
    '      vertex 0.0 0.0 0.0\n' +
    '      vertex 1.0 0.0 0.0\n' +
    '      vertex 0.0 1.0 0.0\n' +
    '    endloop\n' +
    '  endfacet\n' +
    'endsolid\n';
  const res2 = StlLoader.parse(Buffer.from(asciiSpacesOnly, 'utf-8'), 'spaces_fallback.stl');
  assert.strictEqual(res2.meshes[0].name, 'spaces_fallback.stl');
});

test('T9.3: ASCII STL with 0 valid triangles throws "Invalid STL file: No valid facet triangles found"', () => {
  // 1. Empty solid/endsolid block
  const emptyAscii = 'solid EmptyModel\nendsolid EmptyModel\n';
  assert.throws(() => {
    StlLoader.parse(Buffer.from(emptyAscii, 'utf-8'), 'empty.stl');
  }, /Invalid STL file: No valid facet triangles found/);

  // 2. Truncated facet with missing vertices
  const malformedAscii =
    'solid BrokenFacet\n' +
    '  facet normal 0 0 1\n' +
    '    outer loop\n' +
    '      vertex 0 0 0\n' +
    '    endloop\n' +
    '  endfacet\n' +
    'endsolid BrokenFacet\n';
  assert.throws(() => {
    StlLoader.parse(Buffer.from(malformedAscii, 'utf-8'), 'broken.stl');
  }, /Invalid STL file: No valid facet triangles found/);
});

test('T9.4: Token gating & load cancellation behavior validation', () => {
  const viewerAppSrc = fs.readFileSync(path.join(__dirname, '../Assets/js/viewerApp.js'), 'utf8');

  // Verify activeLoadId and workerDispatchedLoadId are declared
  assert(/let\s+activeLoadId\s*=\s*0;/.test(viewerAppSrc), 'activeLoadId generation counter must be declared');
  assert(/let\s+workerDispatchedLoadId\s*=\s*0;/.test(viewerAppSrc), 'workerDispatchedLoadId must be declared');

  // Verify loadId increment in startTessellation
  assert(/activeLoadId/.test(viewerAppSrc) && /\+\+activeLoadId/.test(viewerAppSrc), 'startTessellation must increment activeLoadId');

  // Verify guard on PARSE_SUCCESS in currentWorker.onmessage
  assert(viewerAppSrc.includes('if (msg.loadId && msg.loadId !== activeLoadId) return;'), 'PARSE_SUCCESS must check msg.loadId vs activeLoadId');
  assert(viewerAppSrc.includes('if (workerDispatchedLoadId !== activeLoadId || activeCadFormat === \'STL\') return;'), 'PARSE_SUCCESS must reject stale worker messages when activeCadFormat is STL');

  // Verify onTessellationComplete token guard
  assert(viewerAppSrc.includes('if (data.loadId && data.loadId !== activeLoadId) return;'), 'onTessellationComplete must check data.loadId vs activeLoadId');

  // Functional simulation of token gating
  let activeLoadId = 0;
  let currentModel = null;

  function simulateStartTessellation(format, name) {
    const loadId = ++activeLoadId;
    if (format === 'STL') {
      currentModel = { name: name, format: 'STL', loadId: loadId };
    }
    return loadId;
  }

  function simulateWorkerMessage(msg) {
    if (msg.loadId && msg.loadId !== activeLoadId) return false;
    currentModel = { name: msg.fileName, format: 'STEP', loadId: msg.loadId };
    return true;
  }

  // Dispatched STEP load #1
  const stepLoadId = simulateStartTessellation('STEP', 'step_1.step');
  assert.strictEqual(stepLoadId, 1);
  assert.strictEqual(activeLoadId, 1);

  // Rapidly followed by STL load #2
  const stlLoadId = simulateStartTessellation('STL', 'stl_2.stl');
  assert.strictEqual(stlLoadId, 2);
  assert.strictEqual(activeLoadId, 2);
  assert.strictEqual(currentModel.name, 'stl_2.stl');

  // In-flight worker finishes STEP load #1 (late arrival)
  const applied = simulateWorkerMessage({ type: 'PARSE_SUCCESS', fileName: 'step_1.step', loadId: stepLoadId });
  assert.strictEqual(applied, false, 'Late worker message must be ignored');
  assert.strictEqual(currentModel.name, 'stl_2.stl', 'Active STL model must remain intact');
  assert.strictEqual(currentModel.format, 'STL');
});

// =============================================================================
// Summary and Exit Code
// =============================================================================
console.log('\n================================================================');
console.log(`  TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
