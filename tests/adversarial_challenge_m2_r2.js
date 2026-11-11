/**
 * QuickLook CAD Studio - Comprehensive Empirical Challenge Harness (M2 R2)
 * File: tests/adversarial_challenge_m2_r2.js
 * 
 * Objective: Empirically stress-test Assets/js/stlLoader.js across 5 critical domains:
 * 1. Corrupted Buffers & Header Edge Cases
 * 2. Extreme Coordinates & Geometric Stress
 * 3. Complex Topology (Non-manifold edges, bowtie vertices, multi-shell cancel)
 * 4. Scale & Performance Stress (50k+ Binary & ASCII benchmarks)
 * 5. Origin Invariance & Numerical Symmetries
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));

console.log('================================================================');
console.log('  M2 STL LOADER EMPIRICAL CHALLENGE HARNESS (CHALLENGER 1 R2)  ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function challenge(domain, name, fn) {
  totalTests++;
  const t0 = process.hrtime.bigint();
  try {
    fn();
    const t1 = process.hrtime.bigint();
    const durMs = Number(t1 - t0) / 1e6;
    passedTests++;
    console.log(`  [PASS] [${domain}] ${name} (${durMs.toFixed(2)}ms)`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] [${domain}] ${name}: ${err.message}`);
    findings.push({ domain, name, error: err.message, stack: err.stack });
  }
}

// -----------------------------------------------------------------------------
// Generators
// -----------------------------------------------------------------------------

function createBinaryBuffer(triangles, headerText = 'Empirical Challenge') {
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
// DOMAIN 1: CORRUPTED BUFFERS & HEADER EDGE CASES
// =============================================================================
console.log('--- Domain 1: Corrupted Buffers & Header Edge Cases ---');

challenge('Domain 1', 'D1.1: Truncated binary headers (0, 1, 10, 40, 83 bytes) throw cleanly', () => {
  for (const len of [0, 1, 10, 40, 83]) {
    const buf = Buffer.alloc(len);
    assert.throws(() => {
      StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }, /Invalid STL file/i);
  }
});

challenge('Domain 1', 'D1.2: Binary length mismatch (off by 1 byte, off by 49 bytes)', () => {
  const cubeBuf = createBinaryBuffer(getCubeTriangles());
  // Off by 1 byte
  const off1 = cubeBuf.slice(0, cubeBuf.byteLength - 1);
  assert.throws(() => StlLoader.parse(off1), /Invalid STL file/i);

  // Off by 49 bytes (less than one full facet)
  const off49 = cubeBuf.slice(0, cubeBuf.byteLength - 49);
  assert.throws(() => StlLoader.parse(off49), /Invalid STL file/i);
});

challenge('Domain 1', 'D1.3: Negative / giant 32-bit triangle count (0xFFFFFFFF) does not crash', () => {
  const buf = Buffer.alloc(84);
  buf.writeUInt32LE(0xFFFFFFFF, 80);
  assert.throws(() => {
    StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }, /Invalid STL file/i);
});

challenge('Domain 1', 'D1.4: Zero-triangle binary file (84 bytes exact)', () => {
  const buf = Buffer.alloc(84);
  buf.write('Empty', 0, 'utf8');
  buf.writeUInt32LE(0, 80);
  const res = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.strictEqual(res.totalTriangles, 0);
  assert.strictEqual(res.volumeMm3, 0);
  assert.strictEqual(res.areaMm2, 0);
  assert.strictEqual(res.isWatertight, false);
});

challenge('Domain 1', 'D1.5: ASCII STL with preamble description > 1024 bytes before first facet', () => {
  // Construct an ASCII STL where a long header comment / description exceeds 1024 bytes
  const longHeader = 'solid LongHeaderTest\n' + ' '.repeat(1100) +
    'facet normal 0 0 1\n  outer loop\n    vertex 0 0 0\n    vertex 1 0 0\n    vertex 0 1 0\n  endloop\nendfacet\nendsolid LongHeaderTest\n';
  const buf = Buffer.from(longHeader, 'utf8');
  
  // Note: StlLoader inspects first 1024 bytes. If facet normal or endsolid is past byte 1024, what happens?
  try {
    const res = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    console.log(`      * ASCII with 1100-byte preamble: parsed ${res.totalTriangles} triangle(s)`);
    assert.strictEqual(res.totalTriangles, 1);
  } catch (err) {
    // This probes the 1024 byte preamble limitation
    console.warn(`      * [VULNERABILITY REPRODUCED] ASCII preamble >1024 bytes fails detection: ${err.message}`);
    throw err;
  }
});

challenge('Domain 1', 'D1.6: ASCII STL with embedded null bytes rejected safely', () => {
  const asciiWithNull = Buffer.from('solid test\n\x00facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid', 'binary');
  assert.throws(() => {
    StlLoader.parse(asciiWithNull.buffer.slice(asciiWithNull.byteOffset, asciiWithNull.byteOffset + asciiWithNull.byteLength));
  }, /Invalid STL file/i);
});

challenge('Domain 1', 'D1.7: Random fuzzing (100 iterations of random noise)', () => {
  for (let i = 0; i < 100; i++) {
    const len = Math.floor(Math.random() * 1500) + 1;
    const buf = Buffer.alloc(len);
    for (let b = 0; b < len; b++) buf[b] = Math.floor(Math.random() * 256);
    try {
      StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    } catch (e) {
      assert(e instanceof Error);
    }
  }
});

// =============================================================================
// DOMAIN 2: EXTREME COORDINATES & GEOMETRIC STRESS
// =============================================================================
console.log('\n--- Domain 2: Extreme Coordinates & Geometric Stress ---');

challenge('Domain 2', 'D2.1: Huge Coordinates (10^6 mm / 1 km translation) maintains volume precision', () => {
  const origin = [1e6, 1e6, 1e6];
  const tris = getCubeTriangles(10, 20, 30, origin);
  const res = StlLoader.parse(createBinaryBuffer(tris));

  assert.strictEqual(res.totalTriangles, 12);
  assert.strictEqual(res.isWatertight, true);
  const relVolError = Math.abs(res.volumeMm3 - 6000.0) / 6000.0;
  console.log(`      * 10^6 mm scale volume: ${res.volumeMm3.toFixed(4)} mm³ (Rel error: ${(relVolError * 100).toFixed(6)}%)`);
  assert(relVolError < 0.01, `Relative error should be < 1%`);
});

challenge('Domain 2', 'D2.2: Extreme Coordinates (10^7 mm / 10,000 km GIS scale) float precision probe', () => {
  const origin = [1e7, 1e7, 1e7];
  const tris = getCubeTriangles(10, 20, 30, origin);
  const res = StlLoader.parse(createBinaryBuffer(tris));

  assert.strictEqual(res.totalTriangles, 12);
  const relVolError = Math.abs(res.volumeMm3 - 6000.0) / 6000.0;
  console.log(`      * 10^7 mm scale volume: ${res.volumeMm3.toFixed(4)} mm³ (Rel error: ${(relVolError * 100).toFixed(4)}%)`);
  // Note: at 10^7 mm, products reach 10^21. Float64 has 53 bits (9e15). Precision loss is expected.
  assert(!Number.isNaN(res.volumeMm3), 'Volume must not be NaN');
});

challenge('Domain 2', 'D2.3: Tiny Sub-Micron Coordinates (0.01 um) spatial welding behavior', () => {
  const tris = getCubeTriangles(0.00001, 0.00001, 0.00001); // 0.01 um = 10^-5 mm
  const res = StlLoader.parse(createBinaryBuffer(tris));
  assert.strictEqual(res.totalTriangles, 12);
  // All vertices collapse to (0,0,0) in spatial hash (invTol = 10000)
  assert.strictEqual(res.isWatertight, false, 'Sub-micron cube collapses in spatial hash');
  assert(res.volumeMm3 < 1e-12);
});

challenge('Domain 2', 'D2.4: Collinear Triangles with zero area produce valid normal', () => {
  const collinear = [
    { n: [0, 0, 0], a: [0, 0, 0], b: [5, 0, 0], c: [10, 0, 0] }
  ];
  const res = StlLoader.parse(createBinaryBuffer(collinear));
  assert.strictEqual(res.areaMm2, 0);
  assert.strictEqual(res.volumeMm3, 0);
  const norm = res.meshes[0].normal;
  assert.deepStrictEqual([norm[0], norm[1], norm[2]], [0, 0, 1]);
});

challenge('Domain 2', 'D2.5: Sliver Triangles with aspect ratio 10^7 : 1', () => {
  const sliver = [
    { n: [0, 0, 0], a: [0, 0, 0], b: [10, 0, 0], c: [5, 1e-6, 0] }
  ];
  const res = StlLoader.parse(createBinaryBuffer(sliver));
  const norm = res.meshes[0].normal;
  const len = Math.hypot(norm[0], norm[1], norm[2]);
  assert(Math.abs(len - 1.0) < 1e-3);
  assert(!Number.isNaN(len));
});

challenge('Domain 2', 'D2.6: Grid-Boundary Straddling (Two vertices 1e-10 mm apart straddling 0.00005 mm boundary)', () => {
  // invTol = 10000. Grid boundaries occur at multiples of 0.00005 mm (e.g. 0.00005 * 10000 = 0.5 -> rounds to 1; 0.00004999999 -> rounds to 0)
  // Construct two adjacent triangles sharing an edge where the shared vertex has a 1e-10 mm discrepancy across the grid boundary
  const tri1 = {
    n: [0, 0, 1],
    a: [0, 0, 0],
    b: [1, 0, 0],
    c: [0.00004999999, 1, 0] // rounds to Math.round(0.4999999) = 0
  };
  const tri2 = {
    n: [0, 0, 1],
    a: [1, 0, 0],
    b: [0, 0, 0],
    c: [0.00005000001, 1, 0] // rounds to Math.round(0.5000001) = 1
  };
  const res = StlLoader.parse(createBinaryBuffer([tri1, tri2]));
  // In a naive grid hash, point c in tri1 and point c in tri2 are placed in different cells (0 vs 1)
  // Check topology report:
  console.log(`      * Grid boundary straddle edge count: uniqueVertices=${res.uniqueVertices || 'N/A'}, isWatertight=${res.isWatertight}`);
  // This verifies whether the spatial hash handles or flags grid boundary straddling
});

challenge('Domain 2', 'D2.7: Inverted Winding (Clockwise) volume sign correction', () => {
  const inverted = getCubeTriangles(10, 20, 30, [0, 0, 0], 1, true);
  const res = StlLoader.parse(createBinaryBuffer(inverted));
  assert.strictEqual(res.isWatertight, true);
  assert(Math.abs(res.volumeMm3 - 6000.0) < 1e-4, 'Inverted winding must be made positive via Math.abs');
});

// =============================================================================
// DOMAIN 3: COMPLEX TOPOLOGY
// =============================================================================
console.log('\n--- Domain 3: Complex Topology ---');

challenge('Domain 3', 'D3.1: Non-Manifold T-Junction (3 triangles sharing one edge)', () => {
  const cube = getCubeTriangles(10, 20, 30);
  cube.push({
    n: [0, 1, 0],
    a: [0, 0, 0],
    b: [10, 0, 0],
    c: [5, 10, 0]
  });
  const res = StlLoader.parse(createBinaryBuffer(cube));
  assert.strictEqual(res.isWatertight, false);
  assert.strictEqual(res.isManifold, false);
});

challenge('Domain 3', 'D3.2: High Degree Non-Manifold Edge (6 shared blades)', () => {
  const blades = [];
  const N = 6;
  for (let k = 0; k < N; k++) {
    const angle = (k / N) * 2 * Math.PI;
    blades.push({
      n: [0, 0, 1],
      a: [0, 0, 0],
      b: [0, 0, 10],
      c: [Math.cos(angle) * 10, Math.sin(angle) * 10, 5]
    });
  }
  const res = StlLoader.parse(createBinaryBuffer(blades));
  assert.strictEqual(res.isManifold, false);
  assert.strictEqual(res.isWatertight, false);
});

challenge('Domain 3', 'D3.3: Non-Manifold Bowtie / Butterfly Vertex (2 cones touching at apex)', () => {
  // Tetrahedron 1: vertices (0,0,0), (1,0,0), (0,1,0), (0,0,1)
  const tet1 = [
    { n: [0, 0, -1], a: [0, 0, 0], b: [0, 1, 0], c: [1, 0, 0] },
    { n: [-1, 0, 0], a: [0, 0, 0], b: [0, 0, 1], c: [0, 1, 0] },
    { n: [0, -1, 0], a: [0, 0, 0], b: [1, 0, 0], c: [0, 0, 1] },
    { n: [1, 1, 1],  a: [1, 0, 0], b: [0, 1, 0], c: [0, 0, 1] }
  ];
  // Tetrahedron 2: touches ONLY at apex (0,0,0), extending into negative quadrant
  const tet2 = [
    { n: [0, 0, 1],  a: [0, 0, 0], b: [-1, 0, 0], c: [0, -1, 0] },
    { n: [1, 0, 0],  a: [0, 0, 0], b: [0, -1, 0], c: [0, 0, -1] },
    { n: [0, 1, 0],  a: [0, 0, 0], b: [0, 0, -1], c: [-1, 0, 0] },
    { n: [-1, -1, -1], a: [-1, 0, 0], b: [0, 0, -1], c: [0, -1, 0] }
  ];
  const bowtie = tet1.concat(tet2);
  const res = StlLoader.parse(createBinaryBuffer(bowtie));

  console.log(`      * Bowtie vertex topology: isWatertight=${res.isWatertight}, isManifold=${res.isManifold}`);
  // Note: an edge-only topology checker will report isManifold=true because every edge has count=2,
  // even though the vertex at (0,0,0) is a non-manifold pinch point!
});

challenge('Domain 3', 'D3.4: Disjoint Multi-Shell Volume Cancellation (1 normal shell + 1 inverted shell)', () => {
  // Shell 1: cube at (0,0,0) with normal winding (Vol = +1000)
  const shell1 = getCubeTriangles(10, 10, 10, [0, 0, 0]);
  // Shell 2: cube at (50,50,50) with INVERTED winding (Vol = -1000 in Gauss sum)
  const shell2 = getCubeTriangles(10, 10, 10, [50, 50, 50], 1, true);
  const multi = shell1.concat(shell2);

  const res = StlLoader.parse(createBinaryBuffer(multi));
  console.log(`      * Opposite-winding multi-shell volume: ${res.volumeMm3} mm³ (Expected 2000 mm³, got ${res.volumeMm3})`);
  // This probes the global Gauss summation behavior when multiple shells have conflicting winding
});

// =============================================================================
// DOMAIN 4: SCALE & PERFORMANCE STRESS (50,000+ TRIANGLES)
// =============================================================================
console.log('\n--- Domain 4: Scale & Performance Stress (50,000+ Triangles) ---');

challenge('Domain 4', 'D4.1: High-Density Binary Benchmark (60,000 Triangles)', () => {
  // M = 71 => 6 * 2 * 71 * 71 = 60,492 triangles
  const M = 71;
  const triCount = 6 * 2 * M * M;
  const buf = generateSubdividedCube(M);

  const memBefore = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint();
  const res = StlLoader.parse(buf);
  const t1 = process.hrtime.bigint();
  const memAfter = process.memoryUsage().heapUsed;

  const parseMs = Number(t1 - t0) / 1e6;
  const heapDeltaMb = (memAfter - memBefore) / (1024 * 1024);

  console.log(`      * ${triCount.toLocaleString()} triangles: parsed in ${parseMs.toFixed(2)}ms (Heap Delta: ${heapDeltaMb.toFixed(2)} MB)`);
  assert.strictEqual(res.totalTriangles, triCount);
  assert.strictEqual(res.isWatertight, true);
  assert(Math.abs(res.volumeMm3 - 6000.0) < 1e-2);
  assert(parseMs < 350, `Parse time should be < 350ms (got ${parseMs.toFixed(2)}ms)`);
});

challenge('Domain 4', 'D4.2: Extreme-Density Binary Benchmark (100,000+ Triangles)', () => {
  // M = 92 => 6 * 2 * 92 * 92 = 101,568 triangles
  const M = 92;
  const triCount = 6 * 2 * M * M;
  const buf = generateSubdividedCube(M);

  const t0 = process.hrtime.bigint();
  const res = StlLoader.parse(buf);
  const t1 = process.hrtime.bigint();
  const parseMs = Number(t1 - t0) / 1e6;

  console.log(`      * ${triCount.toLocaleString()} triangles: parsed in ${parseMs.toFixed(2)}ms`);
  assert.strictEqual(res.totalTriangles, triCount);
  assert.strictEqual(res.isWatertight, true);
  assert(parseMs < 750, `100k triangles should parse in < 750ms (got ${parseMs.toFixed(2)}ms)`);
});

challenge('Domain 4', 'D4.3: High-Density ASCII Benchmark (50,000 Triangles in text format)', () => {
  const triCount = 50000;
  const lines = ['solid ASCII_50k_Benchmark'];
  for (let i = 0; i < triCount; i++) {
    const x0 = (i % 200).toFixed(2);
    const x1 = ((i % 200) + 1).toFixed(2);
    lines.push(`  facet normal 0.000000 0.000000 1.000000`);
    lines.push(`    outer loop`);
    lines.push(`      vertex ${x0} 0.00 0.00`);
    lines.push(`      vertex ${x1} 1.00 0.00`);
    lines.push(`      vertex ${x0} 1.00 0.00`);
    lines.push(`    endloop`);
    lines.push(`  endfacet`);
  }
  lines.push('endsolid ASCII_50k_Benchmark');
  const asciiStr = lines.join('\n');
  const buf = Buffer.from(asciiStr, 'utf8');
  const sizeMb = (buf.byteLength / (1024 * 1024)).toFixed(2);

  const t0 = process.hrtime.bigint();
  const res = StlLoader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const t1 = process.hrtime.bigint();
  const parseMs = Number(t1 - t0) / 1e6;

  console.log(`      * 50,000 ASCII triangles (${sizeMb} MB): parsed in ${parseMs.toFixed(2)}ms`);
  assert.strictEqual(res.totalTriangles, triCount);
  assert(parseMs < 1200, `50k ASCII triangles should parse in < 1200ms (got ${parseMs.toFixed(2)}ms)`);
});

// =============================================================================
// DOMAIN 5: ORIGIN INVARIANCE & NUMERICAL SYMMETRIES
// =============================================================================
console.log('\n--- Domain 5: Origin Invariance & Numerical Symmetries ---');

challenge('Domain 5', 'D5.1: Gauss Volume Origin Invariance (Translation by (1000, 2000, 3000))', () => {
  const baseTris = getCubeTriangles(10, 20, 30, [0, 0, 0]);
  const baseRes = StlLoader.parse(createBinaryBuffer(baseTris));

  const transTris = getCubeTriangles(10, 20, 30, [1000, 2000, 3000]);
  const transRes = StlLoader.parse(createBinaryBuffer(transTris));

  const deltaVol = Math.abs(transRes.volumeMm3 - baseRes.volumeMm3);
  console.log(`      * Origin translation delta: ${deltaVol.toExponential(4)} mm³`);
  assert(deltaVol < 1e-4, `Volume must be origin-invariant within 1e-4 mm³`);
  assert(Math.abs(transRes.areaMm2 - baseRes.areaMm2) < 1e-4);
});

challenge('Domain 5', 'D5.2: Gauss Volume Origin Invariance (Negative Translation (-5000, -5000, -5000))', () => {
  const transTris = getCubeTriangles(10, 20, 30, [-5000, -5000, -5000]);
  const transRes = StlLoader.parse(createBinaryBuffer(transTris));

  const deltaVol = Math.abs(transRes.volumeMm3 - 6000.0);
  console.log(`      * Negative translation delta: ${deltaVol.toExponential(4)} mm³`);
  assert(deltaVol < 1e-4, `Volume must remain 6000.0 mm³`);
});

challenge('Domain 5', 'D5.3: Translation on OPEN mesh demonstrates origin sensitivity', () => {
  // An open mesh has non-zero net surface normal sum (\sum n_i != 0).
  // Therefore, Gauss divergence theorem volume is NOT origin-invariant for open meshes.
  const cube = getCubeTriangles(10, 20, 30);
  const openMesh = cube.slice(0, 10); // Remove top face

  const resOrigin0 = StlLoader.parse(createBinaryBuffer(openMesh));
  const openMeshTrans = openMesh.map(f => ({
    n: f.n,
    a: [f.a[0] + 100, f.a[1] + 100, f.a[2] + 100],
    b: [f.b[0] + 100, f.b[1] + 100, f.b[2] + 100],
    c: [f.c[0] + 100, f.c[1] + 100, f.c[2] + 100]
  }));
  const resOriginTrans = StlLoader.parse(createBinaryBuffer(openMeshTrans));

  const deltaVol = Math.abs(resOriginTrans.volumeMm3 - resOrigin0.volumeMm3);
  console.log(`      * Open mesh volume shift under translation: ${deltaVol.toFixed(2)} mm³ (Watertight: ${resOrigin0.isWatertight})`);
  assert.strictEqual(resOrigin0.isWatertight, false);
  // Volume shifts because open boundary integral is non-zero
  assert(deltaVol > 10.0, 'Open mesh Gauss volume must shift when translated away from origin');
});

challenge('Domain 5', 'D5.4: Scaling Law Invariance (s = 2.5 => Vol ~ s^3, Area ~ s^2)', () => {
  const s = 2.5;
  const scaledTris = getCubeTriangles(10, 20, 30, [0, 0, 0], s);
  const res = StlLoader.parse(createBinaryBuffer(scaledTris));

  const expVol = 6000.0 * Math.pow(s, 3);
  const expArea = 2200.0 * Math.pow(s, 2);
  const volErr = Math.abs(res.volumeMm3 - expVol);
  const areaErr = Math.abs(res.areaMm2 - expArea);

  console.log(`      * Scale law error: Vol=${volErr.toFixed(4)} mm³, Area=${areaErr.toFixed(4)} mm²`);
  assert(volErr < 1e-2);
  assert(areaErr < 1e-2);
});

challenge('Domain 5', 'D5.5: Arbitrary 3D Rigid Rotation Invariance (Compound Euler Rotation)', () => {
  // Compound rotation: Rx(30 deg) * Ry(45 deg) * Rz(60 deg)
  const radX = 30 * Math.PI / 180, radY = 45 * Math.PI / 180, radZ = 60 * Math.PI / 180;
  const cx = Math.cos(radX), sx = Math.sin(radX);
  const cy = Math.cos(radY), sy = Math.sin(radY);
  const cz = Math.cos(radZ), sz = Math.sin(radZ);

  // Rotation matrix R = Rz * Ry * Rx
  function rotatePoint(p) {
    const x = p[0], y = p[1], z = p[2];
    // Rx
    const y1 = cy !== undefined ? y * cx - z * sx : y;
    const z1 = cy !== undefined ? y * sx + z * cx : z;
    const x1 = x;
    // Ry
    const x2 = x1 * cy + z1 * sy;
    const z2 = -x1 * sy + z1 * cy;
    const y2 = y1;
    // Rz
    const x3 = x2 * cz - y2 * sz;
    const y3 = x2 * sz + y2 * cz;
    const z3 = z2;
    return [x3, y3, z3];
  }

  const baseTris = getCubeTriangles(10, 20, 30);
  const rotTris = baseTris.map(f => ({
    n: rotatePoint(f.n),
    a: rotatePoint(f.a),
    b: rotatePoint(f.b),
    c: rotatePoint(f.c)
  }));

  const res = StlLoader.parse(createBinaryBuffer(rotTris));
  assert.strictEqual(res.isWatertight, true);
  assert(Math.abs(res.volumeMm3 - 6000.0) < 1e-3, `Rotated volume should be 6000.0 mm³ (got ${res.volumeMm3})`);
  assert(Math.abs(res.areaMm2 - 2200.0) < 1e-3, `Rotated area should be 2200.0 mm² (got ${res.areaMm2})`);
});

// =============================================================================
// SUMMARY & EXIT
// =============================================================================
console.log('\n================================================================');
console.log(`  EMPIRICAL CHALLENGE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('================================================================');

if (findings.length > 0) {
  console.log('\n--- CONFIRMED EMPIRICAL FINDINGS ---');
  for (const f of findings) {
    console.log(`  * [${f.domain}] ${f.name}`);
    console.log(`    Error: ${f.error}`);
  }
}
