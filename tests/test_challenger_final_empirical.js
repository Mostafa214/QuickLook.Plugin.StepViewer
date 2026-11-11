/**
 * QuickLook CAD Studio - Final Integration Adversarial Empirical Stress Test Suite
 * File: tests/test_challenger_final_empirical.js
 *
 * Final Integration Empirical Challenger 1 (teamwork_challenger)
 * Comprehensive empirical verification & stress testing:
 *  - Suite 1: High-Density SLA Performance & Throughput Benchmark (< 15ms)
 *  - Suite 2: Watertight Gauss Divergence Theorem Mathematical Invariants
 *  - Suite 3: Centered Kåsa Circle Fit Center & Diameter Tolerance Stress
 *  - Suite 4: Crease Midpoint Extraction & Dihedral Threshold Boundary Testing
 *  - Suite 5: End-to-End Integrated Multi-Subsystem Stress & Concurrency
 */

'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertCloseTo,
  assertDeepCloseTo,
  assertThrows,
  createCadEnvironment,
  reportSummary,
  exitProcess
} = require('./stl_test_harness.js');

const StlLoader = require(path.join(__dirname, '../Assets/js/stlLoader.js'));
const MeshFeatureDetector = require(path.join(__dirname, '../Assets/js/meshFeatureDetector.js'));
const THREE = require(path.join(__dirname, '../Assets/three.min.js'));

console.log('================================================================================');
console.log('  MILESTONE 5 FINAL INTEGRATION: EMPIRICAL ADVERSARIAL STRESS HARNESS          ');
console.log('================================================================================');

// Helper to construct binary STL buffer from triangle array
function buildBinaryStlBuffer(triangles, header = 'Adversarial STL Benchmark') {
  const count = triangles.length;
  const buf = Buffer.alloc(84 + 50 * count);
  buf.write(header.slice(0, 80), 0, 'utf8');
  buf.writeUInt32LE(count, 80);

  let offset = 84;
  for (let i = 0; i < count; i++) {
    const t = triangles[i];
    const n = t.n || [0, 0, 0];
    const a = t.a;
    const b = t.b;
    const c = t.c;

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

// Generate subdivided box with mathematically consistent outward CCW winding
function generateSubdividedBox(Nx, Ny, Nz, sx = 20, sy = 20, sz = 20) {
  const triangles = [];
  function addQuad(p0, p1, p2, p3) {
    triangles.push({ a: p0, b: p1, c: p2 });
    triangles.push({ a: p0, b: p2, c: p3 });
  }

  const hx = sx / 2, hy = sy / 2, hz = sz / 2;

  // Face +Z (Normal [0, 0, 1]) and -Z (Normal [0, 0, -1])
  for (let ix = 0; ix < Nx; ix++) {
    for (let iy = 0; iy < Ny; iy++) {
      const x0 = -hx + (ix * sx) / Nx;
      const x1 = -hx + ((ix + 1) * sx) / Nx;
      const y0 = -hy + (iy * sy) / Ny;
      const y1 = -hy + ((iy + 1) * sy) / Ny;
      // +Z face
      addQuad([x0, y0, hz], [x1, y0, hz], [x1, y1, hz], [x0, y1, hz]);
      // -Z face
      addQuad([x0, y0, -hz], [x0, y1, -hz], [x1, y1, -hz], [x1, y0, -hz]);
    }
  }

  // Face +X (Normal [1, 0, 0]) and -X (Normal [-1, 0, 0])
  for (let iy = 0; iy < Ny; iy++) {
    for (let iz = 0; iz < Nz; iz++) {
      const y0 = -hy + (iy * sy) / Ny;
      const y1 = -hy + ((iy + 1) * sy) / Ny;
      const z0 = -hz + (iz * sz) / Nz;
      const z1 = -hz + ((iz + 1) * sz) / Nz;
      // +X face
      addQuad([hx, y0, z0], [hx, y1, z0], [hx, y1, z1], [hx, y0, z1]);
      // -X face
      addQuad([-hx, y0, z0], [-hx, y0, z1], [-hx, y1, z1], [-hx, y1, z0]);
    }
  }

  // Face +Y (Normal [0, 1, 0]) and -Y (Normal [0, -1, 0])
  for (let ix = 0; ix < Nx; ix++) {
    for (let iz = 0; iz < Nz; iz++) {
      const x0 = -hx + (ix * sx) / Nx;
      const x1 = -hx + ((ix + 1) * sx) / Nx;
      const z0 = -hz + (iz * sz) / Nz;
      const z1 = -hz + ((iz + 1) * sz) / Nz;
      // +Y face
      addQuad([x0, hy, z0], [x0, hy, z1], [x1, hy, z1], [x1, hy, z0]);
      // -Y face
      addQuad([x0, -hy, z0], [x1, -hy, z0], [x1, -hy, z1], [x0, -hy, z1]);
    }
  }

  return triangles;
}

// -----------------------------------------------------------------------------
// Suite 1: High-Density SLA Performance & Throughput Benchmark (< 15ms)
// -----------------------------------------------------------------------------
describe('Suite 1: High-Density SLA Performance & Throughput Benchmark (< 15ms)', () => {

  test('T1.1: 100 consecutive parses of 10,800-triangle mesh meet SLA (< 15ms)', () => {
    // 30 x 30 x 6 quads = 5400 quads = 10,800 triangles
    const tris10800 = generateSubdividedBox(30, 30, 30);
    assertEqual(tris10800.length, 10800, 'Exact 10,800 triangles generated');
    const buffer = buildBinaryStlBuffer(tris10800);
    assertEqual(buffer.byteLength, 84 + 10800 * 50, 'Binary STL length exact');

    // Run 100 iterations
    const times = [];
    for (let i = 0; i < 100; i++) {
      const t0 = process.hrtime.bigint();
      const result = StlLoader.parse(buffer, 'benchmark_10800.stl');
      const t1 = process.hrtime.bigint();
      const elapsedMs = Number(t1 - t0) / 1e6;
      times.push(elapsedMs);
      assertEqual(result.totalTriangles, 10800);
      assertTrue(result.meshes[0].isWatertight);
    }

    times.sort((a, b) => a - b);
    const min = times[0];
    const max = times[times.length - 1];
    const sum = times.reduce((acc, v) => acc + v, 0);
    const mean = sum / times.length;
    const median = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const p99 = times[Math.floor(times.length * 0.99)];

    console.log(`    [Empirical SLA Metrics 10,800 Tris]: Min: ${min.toFixed(2)}ms, Median: ${median.toFixed(2)}ms, Mean: ${mean.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, Max: ${max.toFixed(2)}ms`);

    assertTrue(mean < 15.0, `Mean parse time (${mean.toFixed(2)}ms) must be < 15ms SLA`);
    assertTrue(median < 15.0, `Median parse time (${median.toFixed(2)}ms) must be < 15ms SLA`);
  });

  test('T1.2: Scaled High-Poly Mesh Throughput (25,000 and 50,000 Triangles)', () => {
    // 45 x 45 x 45 -> 12,150 quads -> 24,300 triangles
    const tris24k = generateSubdividedBox(45, 45, 45);
    const buf24k = buildBinaryStlBuffer(tris24k);

    const t0 = process.hrtime.bigint();
    const res24k = StlLoader.parse(buf24k, 'bench_24k.stl');
    const t1 = process.hrtime.bigint();
    const time24k = Number(t1 - t0) / 1e6;

    console.log(`    [Empirical High-Poly 24,300 Tris]: ${time24k.toFixed(2)}ms (${(res24k.totalTriangles / time24k).toFixed(0)} tris/ms)`);
    assertEqual(res24k.totalTriangles, 24300);
    assertTrue(res24k.meshes[0].isWatertight);

    // 65 x 65 x 65 -> 25,350 quads -> 50,700 triangles
    const tris50k = generateSubdividedBox(65, 65, 65);
    const buf50k = buildBinaryStlBuffer(tris50k);

    const t2 = process.hrtime.bigint();
    const res50k = StlLoader.parse(buf50k, 'bench_50k.stl');
    const t3 = process.hrtime.bigint();
    const time50k = Number(t3 - t2) / 1e6;

    console.log(`    [Empirical High-Poly 50,700 Tris]: ${time50k.toFixed(2)}ms (${(res50k.totalTriangles / time50k).toFixed(0)} tris/ms)`);
    assertEqual(res50k.totalTriangles, 50700);
    assertTrue(res50k.meshes[0].isWatertight);
  });

  test('T1.3: Streaming ASCII Parser Throughput on 4,800 Triangles', () => {
    const tris = generateSubdividedBox(20, 20, 20); // 4800 triangles
    assertEqual(tris.length, 4800);
    let ascii = 'solid benchmark_ascii\n';
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      ascii += `  facet normal 0 0 1\n    outer loop\n`;
      ascii += `      vertex ${t.a[0]} ${t.a[1]} ${t.a[2]}\n`;
      ascii += `      vertex ${t.b[0]} ${t.b[1]} ${t.b[2]}\n`;
      ascii += `      vertex ${t.c[0]} ${t.c[1]} ${t.c[2]}\n`;
      ascii += `    endloop\n  endfacet\n`;
    }
    ascii += 'endsolid benchmark_ascii\n';

    const asciiBuf = Buffer.from(ascii, 'utf8').buffer;
    const t0 = process.hrtime.bigint();
    const res = StlLoader.parse(asciiBuf, 'bench_ascii.stl');
    const t1 = process.hrtime.bigint();
    const elapsed = Number(t1 - t0) / 1e6;

    console.log(`    [Empirical ASCII 4,800 Tris]: ${elapsed.toFixed(2)}ms`);
    assertEqual(res.totalTriangles, 4800);
    assertTrue(res.meshes[0].isWatertight);
  });
});

// -----------------------------------------------------------------------------
// Suite 2: Watertight Gauss Divergence Theorem Mathematical Invariants
// -----------------------------------------------------------------------------
describe('Suite 2: Watertight Gauss Divergence Theorem Mathematical Invariants', () => {

  test('T2.1: Arbitrary 3D Rotated & Translated Cube Invariance', () => {
    const L = 25.0; // 25 mm cube -> Volume = 15,625 mm³
    const theoreticalVolume = L * L * L;
    const theoreticalArea = 6 * L * L;

    const corners = [
      [0, 0, 0], [L, 0, 0], [L, L, 0], [0, L, 0],
      [0, 0, L], [L, 0, L], [L, L, L], [0, L, L]
    ];

    const rx = 33 * Math.PI / 180;
    const ry = 47 * Math.PI / 180;
    const rz = 71 * Math.PI / 180;
    const tx = 1234.56, ty = -7890.12, tz = 3456.78;

    function transform(p) {
      let x = p[0], y = p[1], z = p[2];
      let y1 = y * Math.cos(rx) - z * Math.sin(rx);
      let z1 = y * Math.sin(rx) + z * Math.cos(rx);
      let x1 = x;
      let x2 = x1 * Math.cos(ry) + z1 * Math.sin(ry);
      let z2 = -x1 * Math.sin(ry) + z1 * Math.cos(ry);
      let y2 = y1;
      let x3 = x2 * Math.cos(rz) - y2 * Math.sin(rz);
      let y3 = x2 * Math.sin(rz) + y2 * Math.cos(rz);
      let z3 = z2;
      return [x3 + tx, y3 + ty, z3 + tz];
    }

    const tCorners = corners.map(transform);

    const quadIndices = [
      [0, 3, 2, 1], // Bottom (-Z)
      [4, 5, 6, 7], // Top (+Z)
      [0, 1, 5, 4], // Front (-Y)
      [2, 3, 7, 6], // Back (+Y)
      [0, 4, 7, 3], // Left (-X)
      [1, 2, 6, 5]  // Right (+X)
    ];

    const triangles = [];
    quadIndices.forEach(([p0, p1, p2, p3]) => {
      triangles.push({ a: tCorners[p0], b: tCorners[p1], c: tCorners[p2] });
      triangles.push({ a: tCorners[p0], b: tCorners[p2], c: tCorners[p3] });
    });

    const buffer = buildBinaryStlBuffer(triangles);
    const parsed = StlLoader.parse(buffer, 'rotated_cube.stl');
    const mesh = parsed.meshes[0];

    const volRelError = Math.abs(mesh.volumeMm3 - theoreticalVolume) / theoreticalVolume;
    const areaRelError = Math.abs(mesh.areaMm2 - theoreticalArea) / theoreticalArea;

    console.log(`    [Rotated/Translated Cube]: Calculated Vol: ${mesh.volumeMm3.toFixed(4)} mm³, Theory: ${theoreticalVolume} mm³, RelError: ${(volRelError * 100).toFixed(6)}%`);

    assertTrue(volRelError < 0.0001, `Volume relative error ${(volRelError * 100).toFixed(6)}% must be < 0.01%`);
    assertTrue(areaRelError < 0.0001, `Area relative error ${(areaRelError * 100).toFixed(6)}% must be < 0.01%`);
    assertTrue(mesh.isWatertight, 'Mesh must be watertight');
    assertTrue(mesh.isManifold, 'Mesh must be manifold');
  });

  test('T2.2: Regular Icosahedron Exact Closed-Form Volume Verification', () => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const a = 10.0;
    const rawVerts = [
      [-1,  phi, 0], [ 1,  phi, 0], [-1, -phi, 0], [ 1, -phi, 0],
      [ 0, -1,  phi], [ 0,  1,  phi], [ 0, -1, -phi], [ 0,  1, -phi],
      [ phi, 0, -1], [ phi, 0,  1], [-phi, 0, -1], [-phi, 0,  1]
    ];

    const scale = a / 2.0;
    const verts = rawVerts.map(v => [v[0] * scale, v[1] * scale, v[2] * scale]);
    const edgeLength = Math.hypot(verts[0][0] - verts[1][0], verts[0][1] - verts[1][1], verts[0][2] - verts[1][2]);

    const s = edgeLength;
    const theoreticalVolume = (5.0 / 12.0) * (3.0 + Math.sqrt(5.0)) * Math.pow(s, 3);
    const theoreticalArea = 5.0 * Math.sqrt(3.0) * s * s;

    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];

    const triangles = faces.map(([i0, i1, i2]) => ({
      a: verts[i0], b: verts[i1], c: verts[i2]
    }));

    const buffer = buildBinaryStlBuffer(triangles);
    const parsed = StlLoader.parse(buffer, 'icosahedron.stl');
    const mesh = parsed.meshes[0];

    const volRelError = Math.abs(mesh.volumeMm3 - theoreticalVolume) / theoreticalVolume;
    const areaRelError = Math.abs(mesh.areaMm2 - theoreticalArea) / theoreticalArea;

    console.log(`    [Icosahedron]: Calc Vol: ${mesh.volumeMm3.toFixed(4)} mm³, Theory: ${theoreticalVolume.toFixed(4)} mm³, RelError: ${(volRelError * 100).toFixed(6)}%`);

    assertTrue(volRelError < 0.0001, `Volume relative error ${(volRelError * 100).toFixed(6)}% must be < 0.01%`);
    assertTrue(areaRelError < 0.0001, `Area relative error ${(areaRelError * 100).toFixed(6)}% must be < 0.01%`);
    assertTrue(mesh.isWatertight, 'Icosahedron must be watertight (20 faces, 30 edges)');
  });

  test('T2.3: Inverted Vertex Winding Sign Invariance', () => {
    const L = 10.0;
    const normalCube = generateSubdividedBox(1, 1, 1, L, L, L);
    const invertedCube = normalCube.map(t => ({ a: t.a, b: t.c, c: t.b }));

    const bufNormal = buildBinaryStlBuffer(normalCube);
    const bufInverted = buildBinaryStlBuffer(invertedCube);

    const resNormal = StlLoader.parse(bufNormal, 'normal.stl');
    const resInverted = StlLoader.parse(bufInverted, 'inverted.stl');

    assertCloseTo(resNormal.meshes[0].volumeMm3, 1000.0, 0.001);
    assertCloseTo(resInverted.meshes[0].volumeMm3, 1000.0, 0.001);
    assertEqual(resNormal.meshes[0].volumeMm3, resInverted.meshes[0].volumeMm3, 'Inverted winding must yield positive absolute volume');
  });

  test('T2.4: Extreme Numerical Coordinate Dynamic Range', () => {
    // Micro cube: 0.05 mm side -> Vol = 0.000125 mm³
    const microCube = generateSubdividedBox(1, 1, 1, 0.05, 0.05, 0.05);
    const microBuf = buildBinaryStlBuffer(microCube);
    const microRes = StlLoader.parse(microBuf, 'micro.stl');
    assertCloseTo(microRes.meshes[0].volumeMm3, 0.000125, 1e-8);
    assertTrue(microRes.meshes[0].isWatertight);

    // Macro cube: 500 mm side -> Vol = 125,000,000 mm³
    const macroCube = generateSubdividedBox(1, 1, 1, 500, 500, 500);
    const macroBuf = buildBinaryStlBuffer(macroCube);
    const macroRes = StlLoader.parse(macroBuf, 'macro.stl');
    assertCloseTo(macroRes.meshes[0].volumeMm3, 125000000.0, 0.01);
    assertTrue(macroRes.meshes[0].isWatertight);
  });

  test('T2.5: Concentric Hollow Shell (Hollow Cube with Internal Cavity)', () => {
    // Outer cube: 20 mm -> Vol = 8000 mm³
    // Inner cube: 10 mm -> Vol = 1000 mm³
    // Net volume of solid shell between outer and inner = 7000 mm³
    const outerTris = generateSubdividedBox(1, 1, 1, 20, 20, 20);
    // Inner cavity with inward-facing normals (CW)
    const innerTris = generateSubdividedBox(1, 1, 1, 10, 10, 10).map(t => ({ a: t.a, b: t.c, c: t.b }));

    const shellTris = outerTris.concat(innerTris);
    const shellBuf = buildBinaryStlBuffer(shellTris);
    const shellRes = StlLoader.parse(shellBuf, 'shell.stl');

    console.log(`    [Hollow Cube]: Calc Vol: ${shellRes.meshes[0].volumeMm3.toFixed(2)} mm³, Expected: 7000.00 mm³`);
    assertCloseTo(shellRes.meshes[0].volumeMm3, 7000.0, 0.01);
  });
});

// -----------------------------------------------------------------------------
// Suite 3: Centered Kåsa Circle Fit Center & Diameter Tolerance Stress
// -----------------------------------------------------------------------------
describe('Suite 3: Centered Kåsa Circle Fit Center & Diameter Tolerance Stress', () => {

  function generate3DCircleLoop(center, normal, radius, N, noiseRatio = 0, angleClustering = false) {
    const len = Math.hypot(normal[0], normal[1], normal[2]);
    const nz = [normal[0] / len, normal[1] / len, normal[2] / len];

    const ax = Math.abs(nz[0]) < 0.9 ? 1 : 0;
    const ay = Math.abs(nz[0]) < 0.9 ? 0 : 1;
    const ux = [nz[1] * 0 - nz[2] * ay, nz[2] * ax - nz[0] * 0, nz[0] * ay - nz[1] * ax];
    const uLen = Math.hypot(ux[0], ux[1], ux[2]);
    ux[0] /= uLen; ux[1] /= uLen; ux[2] /= uLen;

    const vx = [nz[1] * ux[2] - nz[2] * ux[1], nz[2] * ux[0] - nz[0] * ux[2], nz[0] * ux[1] - nz[1] * ux[0]];

    const positions = new Float32Array(N * 3);
    const loopIndices = [];

    for (let i = 0; i < N; i++) {
      let theta;
      if (angleClustering) {
        if (i < Math.floor(N * 0.75)) {
          theta = (i / Math.floor(N * 0.75)) * (Math.PI * 0.5);
        } else {
          theta = (Math.PI * 0.5) + ((i - Math.floor(N * 0.75)) / (N - Math.floor(N * 0.75))) * (Math.PI * 1.5);
        }
      } else {
        theta = (2 * Math.PI * i) / N;
      }

      const r = radius * (1.0 + (Math.sin(i * 13.37) * noiseRatio));

      const px = center[0] + r * Math.cos(theta) * ux[0] + r * Math.sin(theta) * vx[0];
      const py = center[1] + r * Math.cos(theta) * ux[1] + r * Math.sin(theta) * vx[1];
      const pz = center[2] + r * Math.cos(theta) * ux[2] + r * Math.sin(theta) * vx[2];

      positions[i * 3]     = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;
      loopIndices.push(i);
    }

    return { loopIndices, positions };
  }

  test('T3.1: Arbitrary Tilted 3D Plane Convergence Across Sample Densities', () => {
    const center = [12.34, -56.78, 90.12];
    const normal = [1.0, 2.0, 2.0];
    const radius = 8.5;
    const sampleCounts = [8, 12, 16, 24, 32, 64, 128];

    sampleCounts.forEach(N => {
      const { positions } = generate3DCircleLoop(center, normal, radius, N, 0);

      const geoTris = [];
      const outerR = radius * 2.5;
      const { positions: outerPos } = generate3DCircleLoop(center, normal, outerR, N, 0);

      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const i3 = i * 3, j3 = j * 3;
        const pIn0 = [positions[i3], positions[i3+1], positions[i3+2]];
        const pIn1 = [positions[j3], positions[j3+1], positions[j3+2]];
        const pOut0 = [outerPos[i3], outerPos[i3+1], outerPos[i3+2]];
        const pOut1 = [outerPos[j3], outerPos[j3+1], outerPos[j3+2]];

        geoTris.push({ a: pOut0, b: pIn0, c: pIn1 });
        geoTris.push({ a: pOut0, b: pIn1, c: pOut1 });
      }

      const depth = 5.0;
      const nLen = Math.hypot(normal[0], normal[1], normal[2]);
      const dx = (normal[0] / nLen) * depth;
      const dy = (normal[1] / nLen) * depth;
      const dz = (normal[2] / nLen) * depth;

      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const i3 = i * 3, j3 = j * 3;
        const p0 = [positions[i3], positions[i3+1], positions[i3+2]];
        const p1 = [positions[j3], positions[j3+1], positions[j3+2]];
        const p0b = [p0[0] + dx, p0[1] + dy, p0[2] + dz];
        const p1b = [p1[0] + dx, p1[1] + dy, p1[2] + dz];

        geoTris.push({ a: p0, b: p0b, c: p1b });
        geoTris.push({ a: p0, b: p1b, c: p1 });
      }

      const flatPositions = new Float32Array(geoTris.length * 9);
      for (let t = 0; t < geoTris.length; t++) {
        const tri = geoTris[t];
        flatPositions[t*9]   = tri.a[0]; flatPositions[t*9+1] = tri.a[1]; flatPositions[t*9+2] = tri.a[2];
        flatPositions[t*9+3] = tri.b[0]; flatPositions[t*9+4] = tri.b[1]; flatPositions[t*9+5] = tri.b[2];
        flatPositions[t*9+6] = tri.c[0]; flatPositions[t*9+7] = tri.c[1]; flatPositions[t*9+8] = tri.c[2];
      }

      const features = MeshFeatureDetector.detectFeatures(flatPositions);
      const circles = features.edgeFeatures.filter(f => f.type === 'circle');
      assertTrue(circles.length >= 1, `Must detect circle for N=${N}`);

      const foundCircle = circles.find(c => Math.abs(c.diameter - radius * 2) < 0.2);
      assertTrue(!!foundCircle, `Found matching circle feature for N=${N}`);

      const centerDist = Math.hypot(
        foundCircle.center[0] - center[0],
        foundCircle.center[1] - center[1],
        foundCircle.center[2] - center[2]
      );
      const diamDiff = Math.abs(foundCircle.diameter - radius * 2.0);

      console.log(`    [Kåsa Fit N=${N}]: CenterError: ${centerDist.toFixed(4)} mm, DiamError: ${diamDiff.toFixed(4)} mm`);
      assertTrue(centerDist < 0.05, `Center error (${centerDist.toFixed(4)}mm) must be < 0.05mm`);
      assertTrue(diamDiff < 0.05, `Diameter error (${diamDiff.toFixed(4)}mm) must be < 0.05mm`);
    });
  });

  test('T3.2: Non-Uniform Angular Clustering Invariance', () => {
    const center = [0, 0, 0];
    const normal = [0, 0, 1];
    const radius = 10.0;
    const N = 32;

    const { positions } = generate3DCircleLoop(center, normal, radius, N, 0, true);

    const geoTris = [];
    const outerR = 30.0;
    const { positions: outerPos } = generate3DCircleLoop(center, normal, outerR, N, 0, true);

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const i3 = i * 3, j3 = j * 3;
      const pIn0 = [positions[i3], positions[i3+1], positions[i3+2]];
      const pIn1 = [positions[j3], positions[j3+1], positions[j3+2]];
      const pOut0 = [outerPos[i3], outerPos[i3+1], outerPos[i3+2]];
      const pOut1 = [outerPos[j3], outerPos[j3+1], outerPos[j3+2]];
      geoTris.push({ a: pOut0, b: pIn0, c: pIn1 });
      geoTris.push({ a: pOut0, b: pIn1, c: pOut1 });

      const p0b = [pIn0[0], pIn0[1], pIn0[2] + 5];
      const p1b = [pIn1[0], pIn1[1], pIn1[2] + 5];
      geoTris.push({ a: pIn0, b: p0b, c: p1b });
      geoTris.push({ a: pIn0, b: p1b, c: pIn1 });
    }

    const flat = new Float32Array(geoTris.length * 9);
    for (let t = 0; t < geoTris.length; t++) {
      flat[t*9]   = geoTris[t].a[0]; flat[t*9+1] = geoTris[t].a[1]; flat[t*9+2] = geoTris[t].a[2];
      flat[t*9+3] = geoTris[t].b[0]; flat[t*9+4] = geoTris[t].b[1]; flat[t*9+5] = geoTris[t].b[2];
      flat[t*9+6] = geoTris[t].c[0]; flat[t*9+7] = geoTris[t].c[1]; flat[t*9+8] = geoTris[t].c[2];
    }

    const features = MeshFeatureDetector.detectFeatures(flat);
    // Find circle matching inner hole (diameter approx 20mm)
    const circle = features.edgeFeatures.find(f => f.type === 'circle' && Math.abs(f.diameter - 20.0) < 2.0);
    assertTrue(!!circle, 'Must detect inner circle under non-uniform clustering');

    const centerDist = Math.hypot(circle.center[0], circle.center[1], circle.center[2]);
    const diamDiff = Math.abs(circle.diameter - 20.0);

    console.log(`    [Clustered Loop Fit]: CenterError: ${centerDist.toFixed(4)} mm, DiamError: ${diamDiff.toFixed(4)} mm`);
    assertTrue(centerDist < 0.05, `Center error must be < 0.05mm`);
    assertTrue(diamDiff < 0.05, `Diameter error must be < 0.05mm`);
  });

  test('T3.3: Strict Rejection of Non-Circular Elliptical Loop (> 5% Aspect Ratio)', () => {
    // Ellipse with semi-axes a = 12.0 mm, b = 10.0 mm
    // Mean radius R ~ 11.0mm, max residual = 1.0mm -> ratio = 1.0/11.0 = 9.09% > 5% threshold
    const N = 32;
    const a = 12.0, b = 10.0;
    const geoTris = [];

    const innerPoints = [];
    for (let i = 0; i < N; i++) {
      const theta = (2 * Math.PI * i) / N;
      innerPoints.push([a * Math.cos(theta), b * Math.sin(theta), 0]);
    }

    const outerPoints = [];
    for (let i = 0; i < N; i++) {
      const theta = (2 * Math.PI * i) / N;
      outerPoints.push([35 * Math.cos(theta), 35 * Math.sin(theta), 0]);
    }

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      geoTris.push({ a: outerPoints[i], b: innerPoints[i], c: innerPoints[j] });
      geoTris.push({ a: outerPoints[i], b: innerPoints[j], c: outerPoints[j] });

      const p0b = [innerPoints[i][0], innerPoints[i][1], innerPoints[i][2] + 5];
      const p1b = [innerPoints[j][0], innerPoints[j][1], innerPoints[j][2] + 5];
      geoTris.push({ a: innerPoints[i], b: p0b, c: p1b });
      geoTris.push({ a: innerPoints[i], b: p1b, c: innerPoints[j] });
    }

    const flat = new Float32Array(geoTris.length * 9);
    for (let t = 0; t < geoTris.length; t++) {
      flat[t*9]   = geoTris[t].a[0]; flat[t*9+1] = geoTris[t].a[1]; flat[t*9+2] = geoTris[t].a[2];
      flat[t*9+3] = geoTris[t].b[0]; flat[t*9+4] = geoTris[t].b[1]; flat[t*9+5] = geoTris[t].b[2];
      flat[t*9+6] = geoTris[t].c[0]; flat[t*9+7] = geoTris[t].c[1]; flat[t*9+8] = geoTris[t].c[2];
    }

    const features = MeshFeatureDetector.detectFeatures(flat);
    // The inner elliptical loop has 9.09% residual > 5% MAX_RADIAL_RESIDUAL_RATIO, so it MUST NOT be classified as a circle
    const innerCircles = features.edgeFeatures.filter(f => f.type === 'circle' && f.diameter < 30);
    assertEqual(innerCircles.length, 0, 'Elliptical loop (>5% elongation) must be rejected from circle classification');
  });
});

// -----------------------------------------------------------------------------
// Suite 4: Crease Midpoint Extraction & Dihedral Threshold Boundary Testing
// -----------------------------------------------------------------------------
describe('Suite 4: Crease Midpoint Extraction & Dihedral Threshold Boundary Testing', () => {

  function createHingeMesh(dihedralDeg) {
    const angleRad = (dihedralDeg * Math.PI) / 180;
    const v0 = [0, 0, 0];
    const v1 = [10, 0, 0];
    const v2 = [5, 10, 0];
    const v3 = [5, -10 * Math.cos(angleRad), -10 * Math.sin(angleRad)];

    const triangles = [
      { a: v0, b: v1, c: v2 },
      { a: v1, b: v0, c: v3 }
    ];

    const flat = new Float32Array(18);
    flat[0] = v0[0]; flat[1] = v0[1]; flat[2] = v0[2];
    flat[3] = v1[0]; flat[4] = v1[1]; flat[5] = v1[2];
    flat[6] = v2[0]; flat[7] = v2[1]; flat[8] = v2[2];

    flat[9]  = v1[0]; flat[10] = v1[1]; flat[11] = v1[2];
    flat[12] = v0[0]; flat[13] = v0[1]; flat[14] = v0[2];
    flat[15] = v3[0]; flat[16] = v3[1]; flat[17] = v3[2];

    return flat;
  }

  test('T4.1: Dihedral Angle Sharp Threshold Boundary (24.9° vs 25.1°)', () => {
    function hasSharedEdgeCrease(dihedralDeg) {
      const mesh = createHingeMesh(dihedralDeg);
      const features = MeshFeatureDetector.detectFeatures(mesh);
      const lines = features.edgeFeatures.filter(f => f.type === 'line');
      return lines.some(line => {
        const isMatch = (
          (Math.hypot(line.start[0] - 0, line.start[1] - 0, line.start[2] - 0) < 0.01 &&
           Math.hypot(line.end[0] - 10, line.end[1] - 0, line.end[2] - 0) < 0.01) ||
          (Math.hypot(line.start[0] - 10, line.start[1] - 0, line.start[2] - 0) < 0.01 &&
           Math.hypot(line.end[0] - 0, line.end[1] - 0, line.end[2] - 0) < 0.01)
        );
        return isMatch;
      });
    }

    const sub24_9 = hasSharedEdgeCrease(24.9);
    const super25_1 = hasSharedEdgeCrease(25.1);

    console.log(`    [Dihedral 24.9°]: Shared edge is crease: ${sub24_9}`);
    console.log(`    [Dihedral 25.1°]: Shared edge is crease: ${super25_1}`);

    assertEqual(sub24_9, false, '24.9° dihedral edge must NOT be extracted as sharp crease');
    assertEqual(super25_1, true, '25.1° dihedral edge MUST be extracted as sharp crease');
  });

  test('T4.2: Crease Midpoint Extraction Geometric Precision', () => {
    const cubeTris = generateSubdividedBox(1, 1, 1, 20, 30, 40);
    const flat = new Float32Array(cubeTris.length * 9);
    for (let t = 0; t < cubeTris.length; t++) {
      flat[t*9]   = cubeTris[t].a[0]; flat[t*9+1] = cubeTris[t].a[1]; flat[t*9+2] = cubeTris[t].a[2];
      flat[t*9+3] = cubeTris[t].b[0]; flat[t*9+4] = cubeTris[t].b[1]; flat[t*9+5] = cubeTris[t].b[2];
      flat[t*9+6] = cubeTris[t].c[0]; flat[t*9+7] = cubeTris[t].c[1]; flat[t*9+8] = cubeTris[t].c[2];
    }

    const features = MeshFeatureDetector.detectFeatures(flat);
    const lines = features.edgeFeatures.filter(f => f.type === 'line');
    assertEqual(lines.length, 12, 'Cube must extract exactly 12 crease lines');

    lines.forEach((line) => {
      const mid = line.midpoint;
      const expectedMid = [
        (line.start[0] + line.end[0]) * 0.5,
        (line.start[1] + line.end[1]) * 0.5,
        (line.start[2] + line.end[2]) * 0.5
      ];
      assertCloseTo(mid[0], expectedMid[0], 1e-6);
      assertCloseTo(mid[1], expectedMid[1], 1e-6);
      assertCloseTo(mid[2], expectedMid[2], 1e-6);

      const dStart = Math.hypot(mid[0] - line.start[0], mid[1] - line.start[1], mid[2] - line.start[2]);
      const dEnd = Math.hypot(mid[0] - line.end[0], mid[1] - line.end[1], mid[2] - line.end[2]);
      assertCloseTo(dStart, line.length * 0.5, 1e-5);
      assertCloseTo(dEnd, line.length * 0.5, 1e-5);
    });
  });
});

// -----------------------------------------------------------------------------
// Suite 5: End-to-End Integrated Multi-Subsystem Stress & Concurrency
// -----------------------------------------------------------------------------
describe('Suite 5: End-to-End Integrated Multi-Subsystem Stress & Concurrency', () => {

  test('T5.1: High-Concurrency Stress Pipeline Across 50 Models in Succession', () => {
    const env = createCadEnvironment({ loadCadState: true, loadMaterialsEngine: true, loadWorkbenchUi: true });

    const sizes = [10, 15, 20, 25, 30];
    let totalPasses = 0;

    for (let i = 0; i < 50; i++) {
      const s = sizes[i % sizes.length];
      const tris = generateSubdividedBox(1, 1, 1, s, s, s);
      const buffer = buildBinaryStlBuffer(tris);

      // 1. Parse
      const parsed = StlLoader.parse(buffer, `stress_${i}.stl`);
      assertEqual(parsed.format, 'STL');
      const meshData = parsed.meshes[0];

      // 2. Feature Detect
      const features = MeshFeatureDetector.detectFeatures(meshData.position);
      assertEqual(features.edgeFeatures.filter(f => f.type === 'line').length, 12);

      // 3. Materials & Infill
      env.context.activeCadFormat = 'STL';
      env.context.modelPhysicalProps = { volumeMm3: meshData.volumeMm3 };
      const printMetrics = env.window.MaterialsEngine.getPrintMetrics(meshData.volumeMm3, 1.24, 20);
      assertTrue(printMetrics.massGrams > 0);

      // 4. UI Adaptations
      env.window.WorkbenchUI.updateExplodeToolState('STL', 1);
      const btn = env.document.getElementById('btn-explode');
      assertEqual(btn.disabled, true);

      totalPasses++;
    }

    assertEqual(totalPasses, 50, 'All 50 sequential end-to-end cycles completed cleanly');
  });
});

// Run report and exit
const summary = reportSummary();
exitProcess(summary.failed > 0 ? 1 : 0);
