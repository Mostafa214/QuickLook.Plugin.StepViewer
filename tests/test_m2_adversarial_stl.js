/**
 * QuickLook CAD Studio - Adversarial Stress & Invariant Test Suite for Pure JS STL Loader
 * Milestone 2 Challenger Suite (Domain-Specific Adversarial Probing)
 * File: tests/test_m2_adversarial_stl.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));

console.log('================================================================');
console.log('  M2 STL LOADER ADVERSARIAL & STRESS HARNESS (CHALLENGER 1)     ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testDetails = [];

function challenge(domain, name, fn) {
  totalTests++;
  const t0 = process.hrtime.bigint();
  try {
    fn();
    const t1 = process.hrtime.bigint();
    const durMs = Number(t1 - t0) / 1e6;
    passedTests++;
    console.log(`  [PASS] [${domain}] ${name} (${durMs.toFixed(2)}ms)`);
    testDetails.push({ domain, name, status: 'PASS', durMs, error: null });
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] [${domain}] ${name}: ${err.message}`);
    testDetails.push({ domain, name, status: 'FAIL', durMs: 0, error: err.message });
  }
}

// =============================================================================
// Helper Generators
// =============================================================================

function createBinaryBuffer(triangles, headerText = 'Adversarial Test') {
  const triCount = triangles.length;
  const buf = Buffer.alloc(84 + 50 * triCount);
  buf.write(headerText, 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);

  let offset = 84;
  for (const tri of triangles) {
    const n = tri.n || [0, 0, 0];
    const a = tri.a, b = tri.b, c = tri.c;
    buf.writeFloatLE(n[0], offset);
    buf.writeFloatLE(n[1], offset + 4);
    buf.writeFloatLE(n[2], offset + 8);
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

function getCubeTriangles(dx = 10, dy = 20, dz = 30, origin = [0, 0, 0], scale = 1, invertWinding = false) {
  const ox = origin[0], oy = origin[1], oz = origin[2];
  const x = dx * scale, y = dy * scale, z = dz * scale;

  const rawFaces = [
    // Bottom (Z=0, outward normal [0, 0, -1])
    { n: [0, 0, -1], a: [ox, oy, oz], b: [ox, oy + y, oz], c: [ox + x, oy + y, oz] },
    { n: [0, 0, -1], a: [ox, oy, oz], b: [ox + x, oy + y, oz], c: [ox + x, oy, oz] },
    // Front (Y=0, outward normal [0, -1, 0])
    { n: [0, -1, 0], a: [ox, oy, oz], b: [ox + x, oy, oz], c: [ox + x, oy, oz + z] },
    { n: [0, -1, 0], a: [ox, oy, oz], b: [ox + x, oy, oz + z], c: [ox, oy, oz + z] },
    // Back (Y=y, outward normal [0, 1, 0])
    { n: [0, 1, 0], a: [ox, oy + y, oz], b: [ox, oy + y, oz + z], c: [ox + x, oy + y, oz + z] },
    { n: [0, 1, 0], a: [ox, oy + y, oz], b: [ox + x, oy + y, oz + z], c: [ox + x, oy + y, oz] },
    // Left (X=0, outward normal [-1, 0, 0])
    { n: [-1, 0, 0], a: [ox, oy, oz], b: [ox, oy, oz + z], c: [ox, oy + y, oz + z] },
    { n: [-1, 0, 0], a: [ox, oy, oz], b: [ox, oy + y, oz + z], c: [ox, oy + y, oz] },
    // Right (X=x, outward normal [1, 0, 0])
    { n: [1, 0, 0], a: [ox + x, oy, oz], b: [ox + x, oy + y, oz], c: [ox + x, oy + y, oz + z] },
    { n: [1, 0, 0], a: [ox + x, oy, oz], b: [ox + x, oy + y, oz + z], c: [ox + x, oy, oz + z] },
    // Top (Z=z, outward normal [0, 0, 1])
    { n: [0, 0, 1], a: [ox, oy, oz + z], b: [ox + x, oy, oz + z], c: [ox + x, oy + y, oz + z] },
    { n: [0, 0, 1], a: [ox, oy, oz + z], b: [ox + x, oy + y, oz + z], c: [ox, oy + y, oz + z] }
  ];

  if (!invertWinding) return rawFaces;

  return rawFaces.map(f => ({
    n: [-f.n[0], -f.n[1], -f.n[2]],
    a: f.a,
    b: f.c, // Swap b and c to invert winding
    c: f.b
  }));
}

function generateSubdividedCube(M, dx = 10, dy = 20, dz = 30) {
  const triCount = 6 * 2 * M * M;
  const buf = Buffer.alloc(84 + 50 * triCount);
  buf.write(`Subdivided Cube M=${M}`, 0, 'utf8');
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

  // Bottom Z=0
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const x0 = (i / M) * dx, x1 = ((i + 1) / M) * dx;
      const y0 = (j / M) * dy, y1 = ((j + 1) / M) * dy;
      addQuad([0, 0, -1], [x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0]);
    }
  }
  // Top Z=dz
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const x0 = (i / M) * dx, x1 = ((i + 1) / M) * dx;
      const y0 = (j / M) * dy, y1 = ((j + 1) / M) * dy;
      addQuad([0, 0, 1], [x0, y0, dz], [x1, y0, dz], [x1, y1, dz], [x0, y1, dz]);
    }
  }
  // Front Y=0
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < M; k++) {
      const x0 = (i / M) * dx, x1 = ((i + 1) / M) * dx;
      const z0 = (k / M) * dz, z1 = ((k + 1) / M) * dz;
      addQuad([0, -1, 0], [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]);
    }
  }
  // Back Y=dy
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < M; k++) {
      const x0 = (i / M) * dx, x1 = ((i + 1) / M) * dx;
      const z0 = (k / M) * dz, z1 = ((k + 1) / M) * dz;
      addQuad([0, 1, 0], [x0, dy, z0], [x0, dy, z1], [x1, dy, z1], [x1, dy, z0]);
    }
  }
  // Left X=0
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < M; k++) {
      const y0 = (j / M) * dy, y1 = ((j + 1) / M) * dy;
      const z0 = (k / M) * dz, z1 = ((k + 1) / M) * dz;
      addQuad([-1, 0, 0], [0, y0, z0], [0, y0, z1], [0, y1, z1], [0, y1, z0]);
    }
  }
  // Right X=dx
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < M; k++) {
      const y0 = (j / M) * dy, y1 = ((j + 1) / M) * dy;
      const z0 = (k / M) * dz, z1 = ((k + 1) / M) * dz;
      addQuad([1, 0, 0], [dx, y0, z0], [dx, y1, z0], [dx, y1, z1], [dx, y0, z1]);
    }
  }

  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// =============================================================================
// DOMAIN 1: CORRUPTED BUFFERS & MALFORMED INPUTS
// =============================================================================
console.log('--- Domain 1: Corrupted Buffers & Malformed Inputs ---');

challenge('Domain 1', 'D1.1: Truncated headers (0, 1, 10, 40, 83 bytes) throw gracefully', () => {
  const truncatedLengths = [0, 1, 10, 40, 83];
  for (const len of truncatedLengths) {
    const buf = Buffer.alloc(len);
    assert.throws(() => {
      StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }, /Invalid STL file/i, `Should throw Invalid STL on length ${len}`);
  }
});

challenge('Domain 1', 'D1.2: Truncated binary facets (size mismatch) rejected cleanly', () => {
  // Header specifies 10 triangles (84 + 500 = 584 bytes), but buffer is only 200 bytes
  const buf = Buffer.alloc(200);
  buf.writeUInt32LE(10, 80);
  assert.throws(() => {
    StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }, /Invalid STL file/i);

  // Exact 84 + 50*N - 1 bytes (off by one byte)
  const cubeBuf = createBinaryBuffer(getCubeTriangles());
  const offByOne = cubeBuf.slice(0, cubeBuf.byteLength - 1);
  assert.throws(() => {
    StlLoader.parse(offByOne);
  }, /Invalid STL file/i);
});

challenge('Domain 1', 'D1.3: Huge 32-bit triangle count (0xFFFFFFFF) does not hang or OOM', () => {
  const buf = Buffer.alloc(84);
  buf.writeUInt32LE(0xFFFFFFFF, 80); // 4,294,967,295 triangles
  assert.throws(() => {
    StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }, /Invalid STL file/i);
});

challenge('Domain 1', 'D1.4: Zero-triangle binary file (84 bytes exact) handled safely', () => {
  const buf = Buffer.alloc(84);
  buf.write('Empty STL', 0, 'utf8');
  buf.writeUInt32LE(0, 80);
  const res = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.strictEqual(res.totalTriangles, 0);
  assert.strictEqual(res.volumeMm3, 0);
  assert.strictEqual(res.areaMm2, 0);
  assert.strictEqual(res.isWatertight, false);
  assert.deepStrictEqual(res.meshes[0].bbox.min, [0, 0, 0]);
  assert.deepStrictEqual(res.meshes[0].bbox.max, [0, 0, 0]);
});

challenge('Domain 1', 'D1.5: Malformed ASCII files (abrupt termination, missing coords, empty)', () => {
  // Case A: Truncated facet
  const truncatedAscii = Buffer.from('solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nendsolid', 'utf8');
  const resA = StlLoader.parse(truncatedAscii.buffer.slice(truncatedAscii.byteOffset, truncatedAscii.byteOffset + truncatedAscii.byteLength));
  assert.strictEqual(resA.totalTriangles, 0, 'Incomplete facet should result in 0 parsed triangles');

  // Case B: Completely empty solid
  const emptyAscii = Buffer.from('solid empty\nendsolid empty', 'utf8');
  const resB = StlLoader.parse(emptyAscii.buffer.slice(emptyAscii.byteOffset, emptyAscii.byteOffset + emptyAscii.byteLength));
  assert.strictEqual(resB.totalTriangles, 0);
  assert.strictEqual(resB.isWatertight, false);

  // Case C: Missing third vertex coordinate
  const missingCoord = Buffer.from('solid bad\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 1\nvertex 2 2 2\nendloop\nendfacet\nendsolid bad', 'utf8');
  const resC = StlLoader.parse(missingCoord.buffer.slice(missingCoord.byteOffset, missingCoord.byteOffset + missingCoord.byteLength));
  assert.strictEqual(resC.totalTriangles, 0, 'Malformed vertex line should not parse as valid triangle');
});

challenge('Domain 1', 'D1.6: Fuzzing - Random byte buffers do not crash process', () => {
  for (let i = 0; i < 50; i++) {
    const len = Math.floor(Math.random() * 2000) + 1;
    const buf = Buffer.alloc(len);
    for (let b = 0; b < len; b++) buf[b] = Math.floor(Math.random() * 256);

    try {
      StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    } catch (e) {
      assert(e instanceof Error);
    }
  }
});

challenge('Domain 1', 'D1.7: NaN and Infinite vertex coordinates do not throw unhandled error', () => {
  const triWithNaN = [
    { n: [0, 0, 1], a: [NaN, 0, 0], b: [1, 0, 0], c: [0, 1, 0] }
  ];
  const buf = createBinaryBuffer(triWithNaN);
  const res = StlLoader.parse(buf);
  assert.strictEqual(res.totalTriangles, 1);
  // Verify that NaN coordinates are surfaced and handled without hard crash
  assert(Number.isNaN(res.volumeMm3) || res.volumeMm3 === 0);
});

// =============================================================================
// DOMAIN 2: EXTREME GEOMETRY & COORDINATES
// =============================================================================
console.log('\n--- Domain 2: Extreme Geometry & Coordinates ---');

challenge('Domain 2', 'D2.1: Huge Coordinates (10^6 mm / 1 km cube)', () => {
  const hugeOrigin = [1e6, 1e6, 1e6];
  const tris = getCubeTriangles(10, 20, 30, hugeOrigin);
  const buf = createBinaryBuffer(tris);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 12);
  assert.strictEqual(res.isWatertight, true);
  // Theoretical volume = 6000.0 mm3. Check floating point precision at 10^6 scale
  const relVolError = Math.abs(res.volumeMm3 - 6000.0) / 6000.0;
  console.log(`      * Huge coordinate volume: ${res.volumeMm3.toFixed(4)} mm³ (Rel error: ${(relVolError * 100).toFixed(6)}%)`);
  assert(relVolError < 0.05, `Relative error at 10^6 mm should be < 5% (got ${(relVolError * 100).toFixed(4)}%)`);

  // BBox check
  assert.strictEqual(res.meshes[0].bbox.min[0], 1e6);
  assert.strictEqual(res.meshes[0].bbox.max[0], 1e6 + 10);
});

challenge('Domain 2', 'D2.2: Tiny Coordinates (Sub-Micron / 0.02 um cube below welding threshold)', () => {
  // invTol is 10000 (0.1 um = 10^-4 mm). Size of 0.00002 mm = 0.02 um is below 0.1 um threshold.
  const tris = getCubeTriangles(0.00002, 0.00002, 0.00002);
  const buf = createBinaryBuffer(tris);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 12);
  // Because all vertices quantize to (0,0,0), triangles collapse in topology analysis
  console.log(`      * Sub-micron topology: isWatertight=${res.isWatertight}, volume=${res.volumeMm3} mm³`);
  assert.strictEqual(res.isWatertight, false, 'Sub-0.1um features collapse in spatial vertex welding');
  assert(res.volumeMm3 < 1e-12, 'Volume should be near zero');
});

challenge('Domain 2', 'D2.3: Collinear Triangles (Zero Area, Degenerate Normal)', () => {
  const collinear = [
    // 3 points on the X axis: (0,0,0), (5,0,0), (10,0,0)
    { n: [0, 0, 0], a: [0, 0, 0], b: [5, 0, 0], c: [10, 0, 0] }
  ];
  const buf = createBinaryBuffer(collinear);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 1);
  assert.strictEqual(res.areaMm2, 0);
  assert.strictEqual(res.volumeMm3, 0);
  // Fallback normal should be [0, 0, 1] without NaN
  const norms = res.meshes[0].normal;
  assert.strictEqual(norms[0], 0);
  assert.strictEqual(norms[1], 0);
  assert.strictEqual(norms[2], 1);
});

challenge('Domain 2', 'D2.4: Sliver Triangles (Extreme Aspect Ratio 10^7 : 1)', () => {
  const sliver = [
    { n: [0, 0, 0], a: [0, 0, 0], b: [10, 0, 0], c: [5, 1e-6, 0] }
  ];
  const buf = createBinaryBuffer(sliver);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 1);
  const norms = res.meshes[0].normal;
  const len = Math.hypot(norms[0], norms[1], norms[2]);
  assert(Math.abs(len - 1.0) < 1e-3, `Normal must be unit normalized (got ${len})`);
  assert(!Number.isNaN(len), 'Normal must not contain NaN');
});

challenge('Domain 2', 'D2.5: Strictly Negative Coordinates Quadrant', () => {
  // Cube from [-30, -20, -10] to [-10, -5, -2] => dx=20, dy=15, dz=8
  const tris = getCubeTriangles(20, 15, 8, [-30, -20, -10]);
  const buf = createBinaryBuffer(tris);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 12);
  assert.strictEqual(res.isWatertight, true);
  const expectedVol = 20 * 15 * 8; // 2400.0 mm3
  assert(Math.abs(res.volumeMm3 - expectedVol) < 1e-4, `Volume must be positive +2400 mm³ (got ${res.volumeMm3})`);
  assert.deepStrictEqual(res.meshes[0].bbox.min, [-30, -20, -10]);
  assert.deepStrictEqual(res.meshes[0].bbox.max, [-10, -5, -2]);
});

challenge('Domain 2', 'D2.6: Inverted Face Windings (Clockwise)', () => {
  const invertedTris = getCubeTriangles(10, 20, 30, [0, 0, 0], 1, true);
  const buf = createBinaryBuffer(invertedTris);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 12);
  // Volume should be positive due to Math.abs
  assert(Math.abs(res.volumeMm3 - 6000.0) < 1e-4, `Volume must be positive 6000 mm³ (got ${res.volumeMm3})`);
  assert.strictEqual(res.isWatertight, true);
});

challenge('Domain 2', 'D2.7: Inconsistent / Mixed Face Windings', () => {
  const standard = getCubeTriangles(10, 20, 30);
  // Invert winding on half the faces (top and front)
  const mixed = standard.map((f, idx) => {
    if (idx < 6) {
      return { n: f.n, a: f.a, b: f.c, c: f.b };
    }
    return f;
  });
  const buf = createBinaryBuffer(mixed);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 12);
  // Because faces cancel each other in Gauss divergence sum, volume will be corrupted
  console.log(`      * Mixed winding volume result: ${res.volumeMm3.toFixed(2)} mm³ (Expected cancellation drop vs 6000.0 mm³)`);
  assert(res.volumeMm3 < 6000.0, 'Mixed winding causes signed volume cancellation');
});

// =============================================================================
// DOMAIN 3: COMPLEX TOPOLOGY
// =============================================================================
console.log('\n--- Domain 3: Complex Topology ---');

challenge('Domain 3', 'D3.1: Non-Manifold Edge (T-Junction fin with 3 shared triangles)', () => {
  const cube = getCubeTriangles(10, 20, 30);
  // Add a 13th triangle sharing the edge between (0,0,0) and (10,0,0)
  const fin = {
    n: [0, 1, 0],
    a: [0, 0, 0],
    b: [10, 0, 0],
    c: [5, 10, 0] // Fin sticking out in Y
  };
  cube.push(fin);

  const buf = createBinaryBuffer(cube);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 13);
  assert.strictEqual(res.isWatertight, false, 'T-junction must not be watertight');
  assert.strictEqual(res.isManifold, false, '3-shared edge must flag non-manifold');
});

challenge('Domain 3', 'D3.2: Highly Non-Manifold Edges (4 and 5 shared triangles)', () => {
  // Central axis along Z from (0,0,0) to (0,0,10)
  // Create 5 blades sharing this single edge
  const blades = [];
  const N = 5;
  for (let k = 0; k < N; k++) {
    const angle = (k / N) * 2 * Math.PI;
    const px = Math.cos(angle) * 10;
    const py = Math.sin(angle) * 10;
    blades.push({
      n: [0, 0, 1],
      a: [0, 0, 0],
      b: [0, 0, 10],
      c: [px, py, 5]
    });
  }

  const buf = createBinaryBuffer(blades);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 5);
  assert.strictEqual(res.isManifold, false, '5-blade edge must be non-manifold');
  assert.strictEqual(res.isWatertight, false);
});

challenge('Domain 3', 'D3.3: Open Mesh with 8 Boundary Edges (Cube without top or bottom)', () => {
  const cube = getCubeTriangles(10, 20, 30);
  // Remove 2 bottom triangles (indices 0, 1) and 2 top triangles (indices 10, 11)
  const openTube = cube.slice(2, 10); // 8 side triangles (4 quad faces)
  assert.strictEqual(openTube.length, 8);

  const buf = createBinaryBuffer(openTube);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 8);
  assert.strictEqual(res.isWatertight, false, 'Tube must not be watertight');
  assert.strictEqual(res.isManifold, true, 'Tube is a valid 2-manifold with boundary');
});

challenge('Domain 3', 'D3.4: Disconnected Multi-Body Shells in single STL', () => {
  const cube1 = getCubeTriangles(10, 10, 10, [0, 0, 0]);
  const cube2 = getCubeTriangles(10, 10, 10, [50, 50, 50]);
  const multiBody = cube1.concat(cube2);

  const buf = createBinaryBuffer(multiBody);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 24);
  assert.strictEqual(res.isWatertight, true, 'Two disjoint closed shells are both watertight');
  assert.strictEqual(res.isManifold, true);
  // Volume should be sum: 1000 + 1000 = 2000 mm3
  assert(Math.abs(res.volumeMm3 - 2000.0) < 1e-4, `Total volume should equal sum of shells (got ${res.volumeMm3})`);
  assert.deepStrictEqual(res.meshes[0].bbox.min, [0, 0, 0]);
  assert.deepStrictEqual(res.meshes[0].bbox.max, [60, 60, 60]);
});

challenge('Domain 3', 'D3.5: Hollow Cavity / Inverted Inner Shell', () => {
  // Outer cube: 20x20x20 at origin [0,0,0] (V = 8000 mm3)
  const outerCube = getCubeTriangles(20, 20, 20, [0, 0, 0]);
  // Inner cube: 10x10x10 at center [5,5,5] with inverted winding (V = -1000 mm3)
  const innerCube = getCubeTriangles(10, 10, 10, [5, 5, 5], 1, true);
  const hollowBox = outerCube.concat(innerCube);

  const buf = createBinaryBuffer(hollowBox);
  const res = StlLoader.parse(buf);

  assert.strictEqual(res.totalTriangles, 24);
  assert.strictEqual(res.isWatertight, true, 'Hollow box with inverted inner shell is closed watertight');
  // Net Gauss divergence volume: 8000 - 1000 = 7000 mm3
  console.log(`      * Hollow cavity calculated volume: ${res.volumeMm3.toFixed(2)} mm³ (Expected: 7000.0 mm³)`);
  assert(Math.abs(res.volumeMm3 - 7000.0) < 1e-3, `Gauss theorem must subtract cavity volume (got ${res.volumeMm3})`);
});

// =============================================================================
// DOMAIN 4: SCALE & PERFORMANCE STRESS
// =============================================================================
console.log('\n--- Domain 4: Scale & Performance Stress ---');

challenge('Domain 4', 'D4.1: High-Density Binary Benchmark (58,800 Triangles)', () => {
  // M = 70 => 6 * 2 * 70 * 70 = 58,800 triangles
  const M = 70;
  const buf = generateSubdividedCube(M);
  assert.strictEqual(buf.byteLength, 84 + 50 * 58800);

  const memBefore = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint();
  const res = StlLoader.parse(buf);
  const t1 = process.hrtime.bigint();
  const memAfter = process.memoryUsage().heapUsed;

  const parseMs = Number(t1 - t0) / 1e6;
  const heapDeltaMb = (memAfter - memBefore) / (1024 * 1024);

  console.log(`      * 58,800 triangles: parsed in ${parseMs.toFixed(2)}ms (Heap Delta: ${heapDeltaMb.toFixed(2)} MB)`);
  assert.strictEqual(res.totalTriangles, 58800);
  assert.strictEqual(res.isWatertight, true);
  assert(Math.abs(res.volumeMm3 - 6000.0) < 1e-2, `Volume must be 6000.0 mm³ (got ${res.volumeMm3})`);
  assert(Math.abs(res.areaMm2 - 2200.0) < 1e-2, `Area must be 2200.0 mm² (got ${res.areaMm2})`);
  // Performance SLA: ensure no O(N^2) explosion
  assert(parseMs < 350, `58.8k triangles should parse in < 350ms (got ${parseMs.toFixed(2)}ms)`);
});

challenge('Domain 4', 'D4.2: Extreme-Density Binary Benchmark (120,000 Triangles)', () => {
  // M = 100 => 6 * 2 * 10000 = 120,000 triangles
  const M = 100;
  const buf = generateSubdividedCube(M);
  assert.strictEqual(buf.byteLength, 84 + 50 * 120000);

  const t0 = process.hrtime.bigint();
  const res = StlLoader.parse(buf);
  const t1 = process.hrtime.bigint();
  const parseMs = Number(t1 - t0) / 1e6;

  console.log(`      * 120,000 triangles: parsed in ${parseMs.toFixed(2)}ms`);
  assert.strictEqual(res.totalTriangles, 120000);
  assert.strictEqual(res.isWatertight, true);
  assert(parseMs < 800, `120k triangles should parse in < 800ms (got ${parseMs.toFixed(2)}ms)`);
});

challenge('Domain 4', 'D4.3: High-Density ASCII Stress (10,800 Triangles in text format)', () => {
  // Generate multi-megabyte ASCII string
  const M = 30; // 10,800 triangles
  const lines = ['solid ASCII_Benchmark'];
  for (let i = 0; i < 10800; i++) {
    lines.push(`  facet normal 0.000000 0.000000 1.000000`);
    lines.push(`    outer loop`);
    lines.push(`      vertex ${(i % 100).toFixed(4)} 0.0000 0.0000`);
    lines.push(`      vertex ${(i % 100 + 1).toFixed(4)} 1.0000 0.0000`);
    lines.push(`      vertex ${(i % 100).toFixed(4)} 1.0000 0.0000`);
    lines.push(`    endloop`);
    lines.push(`  endfacet`);
  }
  lines.push('endsolid ASCII_Benchmark');
  const asciiStr = lines.join('\n');
  const buf = Buffer.from(asciiStr, 'utf8');

  const t0 = process.hrtime.bigint();
  const res = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const t1 = process.hrtime.bigint();
  const parseMs = Number(t1 - t0) / 1e6;

  console.log(`      * 10,800 ASCII triangles (${(buf.byteLength / 1024 / 1024).toFixed(2)} MB): parsed in ${parseMs.toFixed(2)}ms`);
  assert.strictEqual(res.totalTriangles, 10800);
  assert(parseMs < 500, `ASCII parsing should complete in < 500ms without ReDoS (got ${parseMs.toFixed(2)}ms)`);
});

// =============================================================================
// DOMAIN 5: GEOMETRIC & NUMERICAL INVARIANTS
// =============================================================================
console.log('\n--- Domain 5: Geometric & Numerical Invariants ---');

challenge('Domain 5', 'D5.1: Gauss Volume Origin Invariance (Translation by (1000, 2000, 3000))', () => {
  const baseTris = getCubeTriangles(10, 20, 30, [0, 0, 0]);
  const baseRes = StlLoader.parse(createBinaryBuffer(baseTris));

  const transTris = getCubeTriangles(10, 20, 30, [1000, 2000, 3000]);
  const transRes = StlLoader.parse(createBinaryBuffer(transTris));

  const deltaVol = Math.abs(transRes.volumeMm3 - baseRes.volumeMm3);
  console.log(`      * Origin invariance delta: ${deltaVol.toExponential(4)} mm³`);
  assert(deltaVol < 1e-4, `Volume must be origin-invariant within 1e-4 mm³ (delta: ${deltaVol})`);
  assert(Math.abs(transRes.areaMm2 - baseRes.areaMm2) < 1e-4, 'Surface area must be origin-invariant');
});

challenge('Domain 5', 'D5.2: Gauss Volume Origin Invariance (Negative Translation (-5000, -5000, -5000))', () => {
  const transTris = getCubeTriangles(10, 20, 30, [-5000, -5000, -5000]);
  const transRes = StlLoader.parse(createBinaryBuffer(transTris));

  const deltaVol = Math.abs(transRes.volumeMm3 - 6000.0);
  console.log(`      * Negative translation invariance delta: ${deltaVol.toExponential(4)} mm³`);
  assert(deltaVol < 1e-4, `Volume must remain 6000.0 mm³ (delta: ${deltaVol})`);
});

challenge('Domain 5', 'D5.3: Scaling Invariance (Scale Factor s = 3.5)', () => {
  const s = 3.5;
  const scaledTris = getCubeTriangles(10, 20, 30, [0, 0, 0], s);
  const res = StlLoader.parse(createBinaryBuffer(scaledTris));

  const expectedVol = 6000.0 * Math.pow(s, 3); // 6000 * 42.875 = 257,250 mm3
  const expectedArea = 2200.0 * Math.pow(s, 2); // 2200 * 12.25 = 26,950 mm2

  const volError = Math.abs(res.volumeMm3 - expectedVol);
  const areaError = Math.abs(res.areaMm2 - expectedArea);

  console.log(`      * Scaling: Vol error=${volError.toFixed(4)} mm³, Area error=${areaError.toFixed(4)} mm²`);
  assert(volError < 1e-2, `Scaled volume must match s^3 law (got ${res.volumeMm3}, expected ${expectedVol})`);
  assert(areaError < 1e-2, `Scaled area must match s^2 law (got ${res.areaMm2}, expected ${expectedArea})`);
});

challenge('Domain 5', 'D5.4: Rigid 90-degree Rotation Invariance', () => {
  // Rotate cube vertices around X axis by 90 degrees: (x, y, z) -> (x, -z, y)
  const baseTris = getCubeTriangles(10, 20, 30);
  const rotTris = baseTris.map(f => {
    function rot(p) { return [p[0], -p[2], p[1]]; }
    return {
      n: rot(f.n),
      a: rot(f.a),
      b: rot(f.b),
      c: rot(f.c)
    };
  });

  const res = StlLoader.parse(createBinaryBuffer(rotTris));
  assert.strictEqual(res.isWatertight, true);
  assert(Math.abs(res.volumeMm3 - 6000.0) < 1e-4, `Rotated volume must equal 6000 mm³ (got ${res.volumeMm3})`);
  assert(Math.abs(res.areaMm2 - 2200.0) < 1e-4, `Rotated area must equal 2200 mm² (got ${res.areaMm2})`);
});

// =============================================================================
// SUMMARY & EXIT
// =============================================================================
console.log('\n================================================================');
console.log(`  ADVERSARIAL SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
}
