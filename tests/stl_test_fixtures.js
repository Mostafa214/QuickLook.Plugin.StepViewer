/**
 * Synthetic STL Test Fixture Engine & Ground Truth Generator
 * File: tests/stl_test_fixtures.js
 *
 * Implements deterministic programmatic Binary and ASCII STL generators with
 * exact analytical and discrete ground truth for QuickLook STL Native Support
 * opaque-box E2E testing (Tiers 1 to 4).
 *
 * Ground truths include:
 * - Gauss divergence theorem watertight signed volume
 * - Continuous CAD theoretical volume
 * - Discrete polyhedral surface area
 * - Dihedral angle crease edges (> 25°)
 * - Newell-plane circular hole loops with Kåsa algebraic centers and diameters
 * - AABB bounding boxes
 */

'use strict';

const path = require('path');
let THREE = null;
try {
  THREE = require(path.join(__dirname, '../Assets/three.min.js'));
} catch (e) {
  // Graceful fallback if THREE is loaded in environment
}

// ============================================================================
// 1. MATHEMATICAL GROUND-TRUTH HELPERS
// ============================================================================

/**
 * Computes exact watertight signed volume via Gauss Divergence Theorem.
 * V = (1/6) * sum( v1 . (v2 x v3) )
 * Strictly coordinate-origin invariant for closed polyhedra.
 * @param {Array<Array<Array<number>>>} triangles
 * @returns {number}
 */
function computeSignedVolume(triangles) {
  let totalVolume = 0;
  for (let i = 0; i < triangles.length; i++) {
    const [v1, v2, v3] = triangles[i];
    const crossX = v2[1] * v3[2] - v2[2] * v3[1];
    const crossY = v2[2] * v3[0] - v2[0] * v3[2];
    const crossZ = v2[0] * v3[1] - v2[1] * v3[0];
    const dot = v1[0] * crossX + v1[1] * crossY + v1[2] * crossZ;
    totalVolume += dot;
  }
  return totalVolume / 6.0;
}

/**
 * Computes accumulated surface area across all triangular facets.
 * A = (1/2) * sum( ||(v2 - v1) x (v3 - v1)|| )
 * @param {Array<Array<Array<number>>>} triangles
 * @returns {number}
 */
function computeSurfaceArea(triangles) {
  let totalArea = 0;
  for (let i = 0; i < triangles.length; i++) {
    const [v1, v2, v3] = triangles[i];
    const ax = v2[0] - v1[0], ay = v2[1] - v1[1], az = v2[2] - v1[2];
    const bx = v3[0] - v1[0], by = v3[1] - v1[1], bz = v3[2] - v1[2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    totalArea += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }
  return totalArea;
}

/**
 * Computes unit outward face normal vector from CCW vertices.
 * @param {Array<number>} v1
 * @param {Array<number>} v2
 * @param {Array<number>} v3
 * @returns {Array<number>} [nx, ny, nz]
 */
function computeFaceNormal(v1, v2, v3) {
  const ax = v2[0] - v1[0], ay = v2[1] - v1[1], az = v2[2] - v1[2];
  const bx = v3[0] - v1[0], by = v3[1] - v1[1], bz = v3[2] - v1[2];
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (len > 1e-20) {
    return [cx / len, cy / len, cz / len];
  }
  return [0, 0, 0];
}

/**
 * Computes Axis-Aligned Bounding Box (AABB) for a triangle collection.
 * @param {Array<Array<Array<number>>>} triangles
 * @returns {{ min: Array<number>, max: Array<number>, size: Array<number> }}
 */
function computeBBox(triangles) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    for (let j = 0; j < 3; j++) {
      const v = t[j];
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
      if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
    }
  }
  if (minX === Infinity) {
    return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ]
  };
}

/**
 * Centered Kåsa algebraic circle fit on a planar 2D point cloud.
 * Minimizes algebraic error sum( ( (x - xc)^2 + (y - yc)^2 - r^2 )^2 ).
 * @param {Array<Array<number>>} points2D - Array of [x, y] coordinates
 * @returns {{ xc: number, yc: number, r: number, diameter: number }}
 */
function fitCircleKasa(points2D) {
  const M = points2D.length;
  if (M < 3) throw new Error('At least 3 points required for circle fit');

  let sumX = 0, sumY = 0;
  for (let i = 0; i < M; i++) {
    sumX += points2D[i][0];
    sumY += points2D[i][1];
  }
  const meanX = sumX / M, meanY = sumY / M;

  let Suu = 0, Suv = 0, Svv = 0;
  let Suuu_v = 0, Svvv_u = 0;

  for (let i = 0; i < M; i++) {
    const u = points2D[i][0] - meanX;
    const v = points2D[i][1] - meanY;
    const u2 = u * u;
    const v2 = v * v;
    const z = u2 + v2;
    Suu += u2;
    Suv += u * v;
    Svv += v2;
    Suuu_v += u * z;
    Svvv_u += v * z;
  }

  const det = Suu * Svv - Suv * Suv;
  const denom = Suu * Svv;
  if (denom < 1e-24 || Math.abs(det) / denom < 1e-12) {
    throw new Error('Singular matrix in Kåsa circle fit');
  }

  const uc = (Svv * Suuu_v - Suv * Svvv_u) / (2 * det);
  const vc = (Suu * Svvv_u - Suv * Suuu_v) / (2 * det);

  const xc = uc + meanX;
  const yc = vc + meanY;
  const r = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / M);

  return { xc, yc, r, diameter: 2 * r };
}

// ============================================================================
// 2. LOW-LEVEL SERIALIZERS & CONVERTERS
// ============================================================================

/**
 * Converts a Node.js Buffer to a clean standalone ArrayBuffer.
 * @param {Buffer} buffer
 * @returns {ArrayBuffer}
 */
function toArrayBuffer(buffer) {
  if (!buffer) return new ArrayBuffer(0);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Serializes triangles into a standard Binary STL Buffer (84 + 50 * N bytes).
 * @param {Array<Array<Array<number>>>} triangles
 * @param {string} headerText - Optional 80-byte header prefix
 * @returns {Buffer}
 */
function trianglesToBinaryBuffer(triangles, headerText = 'QuickLook STL Native Support Synthetic Fixture') {
  const N = triangles.length;
  const buffer = Buffer.alloc(84 + 50 * N);

  // 80-byte header
  buffer.write(headerText.slice(0, 80), 0, 'utf8');

  // 4-byte uint32 little-endian triangle count
  buffer.writeUInt32LE(N, 80);

  let offset = 84;
  for (let i = 0; i < N; i++) {
    const [v1, v2, v3] = triangles[i];
    const n = computeFaceNormal(v1, v2, v3);

    // Normal vector
    buffer.writeFloatLE(n[0], offset + 0);
    buffer.writeFloatLE(n[1], offset + 4);
    buffer.writeFloatLE(n[2], offset + 8);

    // Vertex 1
    buffer.writeFloatLE(v1[0], offset + 12);
    buffer.writeFloatLE(v1[1], offset + 16);
    buffer.writeFloatLE(v1[2], offset + 20);

    // Vertex 2
    buffer.writeFloatLE(v2[0], offset + 24);
    buffer.writeFloatLE(v2[1], offset + 28);
    buffer.writeFloatLE(v2[2], offset + 32);

    // Vertex 3
    buffer.writeFloatLE(v3[0], offset + 36);
    buffer.writeFloatLE(v3[1], offset + 40);
    buffer.writeFloatLE(v3[2], offset + 44);

    // Attribute byte count (0)
    buffer.writeUInt16LE(0, offset + 48);

    offset += 50;
  }
  return buffer;
}

/**
 * Serializes triangles into a standard ASCII STL text string.
 * @param {Array<Array<Array<number>>>} triangles
 * @param {string} solidName
 * @returns {string}
 */
function trianglesToAsciiString(triangles, solidName = 'synthetic_solid') {
  const lines = [`solid ${solidName}`];
  for (let i = 0; i < triangles.length; i++) {
    const [v1, v2, v3] = triangles[i];
    const n = computeFaceNormal(v1, v2, v3);
    lines.push(`  facet normal ${n[0].toExponential(6)} ${n[1].toExponential(6)} ${n[2].toExponential(6)}`);
    lines.push('    outer loop');
    lines.push(`      vertex ${v1[0].toExponential(6)} ${v1[1].toExponential(6)} ${v1[2].toExponential(6)}`);
    lines.push(`      vertex ${v2[0].toExponential(6)} ${v2[1].toExponential(6)} ${v2[2].toExponential(6)}`);
    lines.push(`      vertex ${v3[0].toExponential(6)} ${v3[1].toExponential(6)} ${v3[2].toExponential(6)}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  }
  lines.push(`endsolid ${solidName}`);
  return lines.join('\n') + '\n';
}

/**
 * Unified fixture packaging helper.
 * Standardizes metadata bundle return contract across all generators.
 */
function packageFixture(triangles, options = {}, metadata = {}) {
  const format = options.format || 'binary';
  const name = options.name || 'synthetic_fixture';
  const header = options.header || `QuickLook STL Fixture: ${name}`;

  let buffer, asciiText = null;
  if (format === 'ascii') {
    asciiText = trianglesToAsciiString(triangles, name);
    buffer = Buffer.from(asciiText, 'utf8');
  } else {
    buffer = trianglesToBinaryBuffer(triangles, header);
  }

  const arrayBuffer = toArrayBuffer(buffer);
  const bbox = computeBBox(triangles);
  const meshVol = computeSignedVolume(triangles);
  const meshArea = computeSurfaceArea(triangles);

  return {
    name,
    format,
    buffer,
    arrayBuffer,
    asciiText,
    triangles,
    triangleCount: triangles.length,
    expectedBBox: bbox,
    expectedMeshVolume: meshVol,
    expectedExactVolume: metadata.exactVolume !== undefined ? metadata.exactVolume : meshVol,
    expectedMeshArea: meshArea,
    expectedExactArea: metadata.exactArea !== undefined ? metadata.exactArea : meshArea,
    isWatertight: metadata.isWatertight !== undefined ? metadata.isWatertight : true,
    isManifold: metadata.isManifold !== undefined ? metadata.isManifold : true,
    expectedHoles: metadata.expectedHoles || [],
    expectedCreaseEdges: metadata.expectedCreaseEdges || []
  };
}

// ============================================================================
// 3. POLYHEDRAL GEOMETRY GENERATORS
// ============================================================================

/**
 * Generates a 12-triangle watertight rectilinear cube/box.
 * @param {object} options - { size, width, depth, height, format }
 * @returns {object} Fixture bundle
 */
function generateCube(options = {}) {
  const size = options.size || 10;
  const Lx = options.width || size;
  const Ly = options.depth || size;
  const Lz = options.height || size;

  const v = [
    [0, 0, 0], [Lx, 0, 0], [Lx, Ly, 0], [0, Ly, 0],
    [0, 0, Lz], [Lx, 0, Lz], [Lx, Ly, Lz], [0, Ly, Lz]
  ];

  const triangles = [
    // Bottom (-Z)
    [v[0], v[3], v[2]], [v[0], v[2], v[1]],
    // Top (+Z)
    [v[4], v[5], v[6]], [v[4], v[6], v[7]],
    // Front (-Y)
    [v[0], v[1], v[5]], [v[0], v[5], v[4]],
    // Back (+Y)
    [v[3], v[7], v[6]], [v[3], v[6], v[2]],
    // Left (-X)
    [v[0], v[4], v[7]], [v[0], v[7], v[3]],
    // Right (+X)
    [v[1], v[2], v[6]], [v[1], v[6], v[5]]
  ];

  const exactVolume = Lx * Ly * Lz;
  const exactArea = 2 * (Lx * Ly + Ly * Lz + Lz * Lx);

  // 12 sharp 90-degree crease edges
  const expectedCreaseEdges = [
    // Bottom 4 edges
    { start: v[0], end: v[1], midpoint: [Lx / 2, 0, 0], length: Lx, dihedralAngleDeg: 90, isCrease: true },
    { start: v[1], end: v[2], midpoint: [Lx, Ly / 2, 0], length: Ly, dihedralAngleDeg: 90, isCrease: true },
    { start: v[2], end: v[3], midpoint: [Lx / 2, Ly, 0], length: Lx, dihedralAngleDeg: 90, isCrease: true },
    { start: v[3], end: v[0], midpoint: [0, Ly / 2, 0], length: Ly, dihedralAngleDeg: 90, isCrease: true },
    // Top 4 edges
    { start: v[4], end: v[5], midpoint: [Lx / 2, 0, Lz], length: Lx, dihedralAngleDeg: 90, isCrease: true },
    { start: v[5], end: v[6], midpoint: [Lx, Ly / 2, Lz], length: Ly, dihedralAngleDeg: 90, isCrease: true },
    { start: v[6], end: v[7], midpoint: [Lx / 2, Ly, Lz], length: Lx, dihedralAngleDeg: 90, isCrease: true },
    { start: v[7], end: v[4], midpoint: [0, Ly / 2, Lz], length: Ly, dihedralAngleDeg: 90, isCrease: true },
    // Vertical 4 edges
    { start: v[0], end: v[4], midpoint: [0, 0, Lz / 2], length: Lz, dihedralAngleDeg: 90, isCrease: true },
    { start: v[1], end: v[5], midpoint: [Lx, 0, Lz / 2], length: Lz, dihedralAngleDeg: 90, isCrease: true },
    { start: v[2], end: v[6], midpoint: [Lx, Ly, Lz / 2], length: Lz, dihedralAngleDeg: 90, isCrease: true },
    { start: v[3], end: v[7], midpoint: [0, Ly, Lz / 2], length: Lz, dihedralAngleDeg: 90, isCrease: true }
  ];

  return packageFixture(triangles, Object.assign({ name: 'cube' }, options), {
    exactVolume,
    exactArea,
    isWatertight: true,
    isManifold: true,
    expectedCreaseEdges
  });
}

/**
 * Generates a 4-triangle regular tetrahedron with non-orthogonal face normals.
 * @param {object} options - { edgeLength, format }
 * @returns {object} Fixture bundle
 */
function generateTetrahedron(options = {}) {
  const edgeLength = options.edgeLength || 10;
  const a = edgeLength / Math.SQRT2;

  const v = [
    [ a / 2,  a / 2,  a / 2],
    [ a / 2, -a / 2, -a / 2],
    [-a / 2,  a / 2, -a / 2],
    [-a / 2, -a / 2,  a / 2]
  ];

  const triangles = [
    [v[0], v[1], v[2]],
    [v[0], v[3], v[1]],
    [v[0], v[2], v[3]],
    [v[1], v[3], v[2]]
  ];

  const exactVolume = (edgeLength * edgeLength * edgeLength) / (6 * Math.SQRT2);
  const exactArea = Math.sqrt(3) * edgeLength * edgeLength;
  const dihedralAngleDeg = (Math.acos(1.0 / 3.0) * 180) / Math.PI; // ~70.528779°

  const expectedCreaseEdges = [
    { start: v[0], end: v[1], midpoint: [(v[0][0]+v[1][0])/2, (v[0][1]+v[1][1])/2, (v[0][2]+v[1][2])/2], length: edgeLength, dihedralAngleDeg, isCrease: true },
    { start: v[0], end: v[2], midpoint: [(v[0][0]+v[2][0])/2, (v[0][1]+v[2][1])/2, (v[0][2]+v[2][2])/2], length: edgeLength, dihedralAngleDeg, isCrease: true },
    { start: v[0], end: v[3], midpoint: [(v[0][0]+v[3][0])/2, (v[0][1]+v[3][1])/2, (v[0][2]+v[3][2])/2], length: edgeLength, dihedralAngleDeg, isCrease: true },
    { start: v[1], end: v[2], midpoint: [(v[1][0]+v[2][0])/2, (v[1][1]+v[2][1])/2, (v[1][2]+v[2][2])/2], length: edgeLength, dihedralAngleDeg, isCrease: true },
    { start: v[1], end: v[3], midpoint: [(v[1][0]+v[3][0])/2, (v[1][1]+v[3][1])/2, (v[1][2]+v[3][2])/2], length: edgeLength, dihedralAngleDeg, isCrease: true },
    { start: v[2], end: v[3], midpoint: [(v[2][0]+v[3][0])/2, (v[2][1]+v[3][1])/2, (v[2][2]+v[3][2])/2], length: edgeLength, dihedralAngleDeg, isCrease: true }
  ];

  return packageFixture(triangles, Object.assign({ name: 'tetrahedron' }, options), {
    exactVolume,
    exactArea,
    isWatertight: true,
    isManifold: true,
    expectedCreaseEdges
  });
}

/**
 * Generates an open hollow box (10 triangles, missing top cap).
 * Tests non-watertight detection and boundary edge tracking.
 * @param {object} options - { size, format }
 * @returns {object} Fixture bundle
 */
function generateHollowBox(options = {}) {
  const cube = generateCube(options);
  // Omit the top two triangles (indices 2 and 3)
  const openTriangles = [
    cube.triangles[0], cube.triangles[1],
    cube.triangles[4], cube.triangles[5],
    cube.triangles[6], cube.triangles[7],
    cube.triangles[8], cube.triangles[9],
    cube.triangles[10], cube.triangles[11]
  ];

  return packageFixture(openTriangles, Object.assign({ name: 'hollow_box' }, options), {
    exactVolume: 0,
    isWatertight: false,
    isManifold: true
  });
}

/**
 * Generates a cube with inverted winding order (normals pointing inward).
 * Tests negative signed volume detection.
 * @param {object} options - { size, format }
 * @returns {object} Fixture bundle
 */
function generateInvertedCube(options = {}) {
  const cube = generateCube(options);
  // Invert winding of all triangles: [v1, v2, v3] -> [v1, v3, v2]
  const invertedTriangles = cube.triangles.map(t => [t[0], t[2], t[1]]);

  return packageFixture(invertedTriangles, Object.assign({ name: 'inverted_cube' }, options), {
    exactVolume: -cube.expectedExactVolume,
    isWatertight: true,
    isManifold: true
  });
}

// ============================================================================
// 4. CURVED & FEATURE-RICH GEOMETRY GENERATORS
// ============================================================================

/**
 * Generates a 4N-triangle discretized watertight cylinder.
 * Top/bottom rim edges have 90° dihedral angle (sharp crease).
 * Side mantle facets have dihedral angle 360/N° <= 25° (smooth).
 * @param {object} options - { radius, height, segments, format }
 * @returns {object} Fixture bundle
 */
function generateCylinder(options = {}) {
  const R = options.radius || 10;
  const H = options.height || 20;
  const N = options.segments || 32;

  const triangles = [];
  const topCenter = [0, 0, H];
  const bottomCenter = [0, 0, 0];

  for (let i = 0; i < N; i++) {
    const a1 = (i * 2 * Math.PI) / N;
    const a2 = ((i + 1) * 2 * Math.PI) / N;

    const b1 = [R * Math.cos(a1), R * Math.sin(a1), 0];
    const b2 = [R * Math.cos(a2), R * Math.sin(a2), 0];
    const t1 = [R * Math.cos(a1), R * Math.sin(a1), H];
    const t2 = [R * Math.cos(a2), R * Math.sin(a2), H];

    // Bottom cap (normal points -Z)
    triangles.push([bottomCenter, b2, b1]);
    // Top cap (normal points +Z)
    triangles.push([topCenter, t1, t2]);
    // Side walls (two triangles per quad)
    triangles.push([b1, b2, t2]);
    triangles.push([b1, t2, t1]);
  }

  const exactVolume = Math.PI * R * R * H;
  const exactArea = 2 * Math.PI * R * R + 2 * Math.PI * R * H;

  // Expected hole circles (top and bottom rims)
  const expectedHoles = [
    { center: [0, 0, H], diameter: 2 * R, radius: R, normal: [0, 0, 1], planeZ: H, isThroughHole: false },
    { center: [0, 0, 0], diameter: 2 * R, radius: R, normal: [0, 0, -1], planeZ: 0, isThroughHole: false }
  ];

  return packageFixture(triangles, Object.assign({ name: 'cylinder' }, options), {
    exactVolume,
    exactArea,
    isWatertight: true,
    isManifold: true,
    expectedHoles
  });
}

/**
 * Generates two hinged plates sharing an edge with an exact dihedral angle.
 * Used for boundary verification of the 25.0° sharp crease threshold.
 * @param {number} angleDeg - Dihedral angle in degrees (e.g. 24.9, 25.0, 25.1)
 * @param {object} options - { width, length, format }
 * @returns {object} Fixture bundle
 */
function generateDihedralPlate(angleDeg, options = {}) {
  const width = options.width || 10;
  const length = options.length || 20;
  const rad = (angleDeg * Math.PI) / 180;

  const v0 = [0, -width, 0];
  const v1 = [length, -width, 0];
  const v2 = [length, 0, 0];
  const v3 = [0, 0, 0];

  // Plate 2 rotated by angleDeg around the hinge axis (X-axis)
  const v4 = [0, width * Math.cos(rad), width * Math.sin(rad)];
  const v5 = [length, width * Math.cos(rad), width * Math.sin(rad)];

  const t1 = [v3, v2, v1];
  const t2 = [v3, v1, v0];
  const t3 = [v3, v5, v2];
  const t4 = [v3, v4, v5];

  const n1 = computeFaceNormal(t1[0], t1[1], t1[2]);
  const n2 = computeFaceNormal(t3[0], t3[1], t3[2]);
  const dot = Math.max(-1, Math.min(1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]));
  const actualAngleDeg = (Math.acos(dot) * 180) / Math.PI;

  const creaseEdge = {
    start: v3,
    end: v2,
    midpoint: [length / 2, 0, 0],
    length: length,
    dihedralAngleDeg: actualAngleDeg,
    isCrease: actualAngleDeg > 25.0 + 1e-6
  };

  return packageFixture([t1, t2, t3, t4], Object.assign({ name: `dihedral_${angleDeg}deg` }, options), {
    isWatertight: false,
    isManifold: true,
    expectedCreaseEdges: [creaseEdge]
  });
}

/**
 * Generates a 100% watertight stepped bushing with a central through-bore.
 * Contains 12N facets (e.g. 384 triangles for N=32) and two circular hole loops.
 * @param {object} options - { flangeRadius, flangeHeight, neckRadius, totalHeight, boreRadius, segments, format }
 * @returns {object} Fixture bundle
 */
function generateSteppedBushing(options = {}) {
  const R_flange = options.flangeRadius || 30;
  const T_flange = options.flangeHeight || 10;
  const R_neck = options.neckRadius || 18;
  const H_total = options.totalHeight || 30;
  const R_bore = options.boreRadius || 10;
  const N = options.segments || 32;
  const T_neck = H_total - T_flange;

  const triangles = [];

  function addRing(rInner, rOuter, z, normalUp = true) {
    for (let i = 0; i < N; i++) {
      const a1 = (i * 2 * Math.PI) / N;
      const a2 = ((i + 1) * 2 * Math.PI) / N;

      const pIn1 = [rInner * Math.cos(a1), rInner * Math.sin(a1), z];
      const pIn2 = [rInner * Math.cos(a2), rInner * Math.sin(a2), z];
      const pOut1 = [rOuter * Math.cos(a1), rOuter * Math.sin(a1), z];
      const pOut2 = [rOuter * Math.cos(a2), rOuter * Math.sin(a2), z];

      if (normalUp) {
        triangles.push([pIn1, pOut1, pOut2]);
        triangles.push([pIn1, pOut2, pIn2]);
      } else {
        triangles.push([pIn1, pOut2, pOut1]);
        triangles.push([pIn1, pIn2, pOut2]);
      }
    }
  }

  function addCylinder(r, zLow, zHigh, normalOut = true) {
    for (let i = 0; i < N; i++) {
      const a1 = (i * 2 * Math.PI) / N;
      const a2 = ((i + 1) * 2 * Math.PI) / N;

      const pLow1 = [r * Math.cos(a1), r * Math.sin(a1), zLow];
      const pLow2 = [r * Math.cos(a2), r * Math.sin(a2), zLow];
      const pHigh1 = [r * Math.cos(a1), r * Math.sin(a1), zHigh];
      const pHigh2 = [r * Math.cos(a2), r * Math.sin(a2), zHigh];

      if (normalOut) {
        triangles.push([pLow1, pLow2, pHigh2]);
        triangles.push([pLow1, pHigh2, pHigh1]);
      } else {
        triangles.push([pLow1, pHigh2, pLow2]);
        triangles.push([pLow1, pHigh1, pHigh2]);
      }
    }
  }

  // 1. Bottom annular face (z = 0)
  addRing(R_bore, R_flange, 0, false);
  // 2. Flange outer mantle (r = R_flange, z = 0..T_flange)
  addCylinder(R_flange, 0, T_flange, true);
  // 3. Flange step annular face (z = T_flange)
  addRing(R_neck, R_flange, T_flange, true);
  // 4. Neck outer mantle (r = R_neck, z = T_flange..H_total)
  addCylinder(R_neck, T_flange, H_total, true);
  // 5. Neck top annular face (z = H_total)
  addRing(R_bore, R_neck, H_total, true);
  // 6. Central through-bore inner mantle (r = R_bore, z = 0..H_total)
  addCylinder(R_bore, 0, H_total, false);

  const exactVolume = Math.PI * (
    (R_flange * R_flange - R_bore * R_bore) * T_flange +
    (R_neck * R_neck - R_bore * R_bore) * T_neck
  );

  const expectedHoles = [
    { center: [0, 0, H_total], diameter: 2 * R_bore, radius: R_bore, normal: [0, 0, 1], planeZ: H_total, isThroughHole: true },
    { center: [0, 0, 0], diameter: 2 * R_bore, radius: R_bore, normal: [0, 0, -1], planeZ: 0, isThroughHole: true }
  ];

  return packageFixture(triangles, Object.assign({ name: 'stepped_bushing' }, options), {
    exactVolume,
    isWatertight: true,
    isManifold: true,
    expectedHoles
  });
}

/**
 * Generates a 100% watertight rectangular mounting plate with a circular through-hole.
 * Pure mathematical sector triangulation (8N triangles).
 * @param {object} options - { width, length, thickness, holeRadius, segments, format }
 * @returns {object} Fixture bundle
 */
function generatePlateWithHole(options = {}) {
  const W = options.width || 40;
  const L = options.length || 40;
  const T = options.thickness || 10;
  const R = options.holeRadius || 8;
  const N = options.segments || 32;

  const triangles = [];
  const P = [], Q = [];

  for (let i = 0; i < N; i++) {
    const a = (i * 2 * Math.PI) / N;
    const cos = Math.cos(a), sin = Math.sin(a);
    const tx = (L / 2) / Math.abs(cos || 1e-9);
    const ty = (W / 2) / Math.abs(sin || 1e-9);
    const t = Math.min(tx, ty);
    P.push([t * cos, t * sin]);
    Q.push([R * cos, R * sin]);
  }

  // 1. Top face (z = T, normal +Z)
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    const p1 = [P[i][0], P[i][1], T];
    const p2 = [P[next][0], P[next][1], T];
    const q1 = [Q[i][0], Q[i][1], T];
    const q2 = [Q[next][0], Q[next][1], T];
    triangles.push([q1, p1, p2]);
    triangles.push([q1, p2, q2]);
  }

  // 2. Bottom face (z = 0, normal -Z)
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    const p1 = [P[i][0], P[i][1], 0];
    const p2 = [P[next][0], P[next][1], 0];
    const q1 = [Q[i][0], Q[i][1], 0];
    const q2 = [Q[next][0], Q[next][1], 0];
    triangles.push([q1, p2, p1]);
    triangles.push([q1, q2, p2]);
  }

  // 3. Outer boundary walls (z = 0..T, normal outward)
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    const pLow1 = [P[i][0], P[i][1], 0];
    const pLow2 = [P[next][0], P[next][1], 0];
    const pHigh1 = [P[i][0], P[i][1], T];
    const pHigh2 = [P[next][0], P[next][1], T];
    triangles.push([pLow1, pLow2, pHigh2]);
    triangles.push([pLow1, pHigh2, pHigh1]);
  }

  // 4. Inner through-hole wall (z = 0..T, normal inward toward center)
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    const qLow1 = [Q[i][0], Q[i][1], 0];
    const qLow2 = [Q[next][0], Q[next][1], 0];
    const qHigh1 = [Q[i][0], Q[i][1], T];
    const qHigh2 = [Q[next][0], Q[next][1], T];
    triangles.push([qLow1, qHigh2, qLow2]);
    triangles.push([qLow1, qHigh1, qHigh2]);
  }

  const exactVolume = (W * L - Math.PI * R * R) * T;
  const holeMeshArea = 0.5 * N * R * R * Math.sin((2 * Math.PI) / N);
  const meshVolume = (W * L - holeMeshArea) * T;

  const expectedHoles = [
    { center: [0, 0, T], diameter: 2 * R, radius: R, normal: [0, 0, 1], planeZ: T, isThroughHole: true },
    { center: [0, 0, 0], diameter: 2 * R, radius: R, normal: [0, 0, -1], planeZ: 0, isThroughHole: true }
  ];

  return packageFixture(triangles, Object.assign({ name: 'plate_with_hole' }, options), {
    exactVolume,
    isWatertight: true,
    isManifold: true,
    expectedHoles
  });
}

/**
 * Generates a flanged bushing with bolt circle through-holes on the flange.
 * @param {object} options - { flangeRadius, flangeHeight, neckRadius, totalHeight, boreRadius, boltCircleRadius, boltRadius, numBolts, segments, format }
 * @returns {object} Fixture bundle
 */
function generateFlangedBushingWithBolts(options = {}) {
  const R_flange = options.flangeRadius || 30;
  const T_flange = options.flangeHeight || 10;
  const R_neck = options.neckRadius || 18;
  const H_total = options.totalHeight || 30;
  const R_bore = options.boreRadius || 10;
  const R_boltCircle = options.boltCircleRadius || 24;
  const R_bolt = options.boltRadius || 2;
  const numBolts = options.numBolts || 4;
  const T_neck = H_total - T_flange;

  if (!THREE) {
    throw new Error('THREE runtime required for generateFlangedBushingWithBolts');
  }

  // 1. Flange shape with central bore + bolt holes
  const flangeShape = new THREE.Shape();
  flangeShape.absarc(0, 0, R_flange, 0, Math.PI * 2, false);

  const boreHole = new THREE.Path();
  boreHole.absarc(0, 0, R_bore, 0, Math.PI * 2, true);
  flangeShape.holes.push(boreHole);

  const boltCenters = [];
  for (let i = 0; i < numBolts; i++) {
    const a = (i * 2 * Math.PI) / numBolts;
    const cx = R_boltCircle * Math.cos(a);
    const cy = R_boltCircle * Math.sin(a);
    boltCenters.push([cx, cy]);
    const boltHole = new THREE.Path();
    boltHole.absarc(cx, cy, R_bolt, 0, Math.PI * 2, true);
    flangeShape.holes.push(boltHole);
  }

  const flangeGeom = new THREE.ExtrudeGeometry(flangeShape, { depth: T_flange, bevelEnabled: false, curveSegments: 16 });

  // 2. Neck shape with central bore
  const neckShape = new THREE.Shape();
  neckShape.absarc(0, 0, R_neck, 0, Math.PI * 2, false);
  const neckBore = new THREE.Path();
  neckBore.absarc(0, 0, R_bore, 0, Math.PI * 2, true);
  neckShape.holes.push(neckBore);

  const neckGeom = new THREE.ExtrudeGeometry(neckShape, { depth: T_neck, bevelEnabled: false, curveSegments: 16 });
  neckGeom.translate(0, 0, T_flange);

  // Extract triangles from both geometries
  const triangles = [];
  function extractGeom(geom) {
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      triangles.push([
        [pos.getX(i), pos.getY(i), pos.getZ(i)],
        [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)],
        [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)]
      ]);
    }
  }
  extractGeom(flangeGeom);
  extractGeom(neckGeom);

  const exactVolume = Math.PI * (
    (R_flange * R_flange - R_bore * R_bore - numBolts * R_bolt * R_bolt) * T_flange +
    (R_neck * R_neck - R_bore * R_bore) * T_neck
  );

  const expectedHoles = [
    { center: [0, 0, H_total], diameter: 2 * R_bore, radius: R_bore, normal: [0, 0, 1], planeZ: H_total, isThroughHole: true },
    { center: [0, 0, 0], diameter: 2 * R_bore, radius: R_bore, normal: [0, 0, -1], planeZ: 0, isThroughHole: true }
  ];

  for (let i = 0; i < boltCenters.length; i++) {
    const [cx, cy] = boltCenters[i];
    expectedHoles.push({ center: [cx, cy, T_flange], diameter: 2 * R_bolt, radius: R_bolt, normal: [0, 0, 1], planeZ: T_flange, isThroughHole: true });
    expectedHoles.push({ center: [cx, cy, 0], diameter: 2 * R_bolt, radius: R_bolt, normal: [0, 0, -1], planeZ: 0, isThroughHole: true });
  }

  return packageFixture(triangles, Object.assign({ name: 'flanged_bushing_with_bolts' }, options), {
    exactVolume,
    isWatertight: false,
    isManifold: false,
    expectedHoles
  });
}

// ============================================================================
// 5. MALFORMED & CORRUPTED STL FIXTURES MATRIX
// ============================================================================

/**
 * Generates corrupt, truncated, overflowed, and malformed STL files for parser stress testing.
 * @param {string} type - Corrupted fixture identifier
 * @param {object} options - Options
 * @returns {object} Corrupted fixture descriptor
 */
function generateMalformedStl(type, options = {}) {
  switch (type) {
    case 'truncated_header_0': {
      const buf = Buffer.alloc(0);
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), expectedError: 'TRUNCATED_HEADER' };
    }
    case 'truncated_header_40': {
      const buf = Buffer.alloc(40);
      buf.write('Truncated 40-byte header', 0);
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), expectedError: 'TRUNCATED_HEADER' };
    }
    case 'truncated_header_83': {
      const buf = Buffer.alloc(83);
      buf.write('Truncated 83-byte header', 0);
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), expectedError: 'TRUNCATED_HEADER' };
    }
    case 'zero_triangles': {
      const buf = Buffer.alloc(84);
      buf.write('Zero Triangles Binary STL', 0);
      buf.writeUInt32LE(0, 80);
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), triangleCount: 0, expectedVolume: 0 };
    }
    case 'count_mismatch_truncated': {
      const buf = Buffer.alloc(84 + 50 * 1);
      buf.write('Header claims 10 triangles but only 1 provided', 0);
      buf.writeUInt32LE(10, 80);
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), expectedError: 'LENGTH_MISMATCH' };
    }
    case 'count_mismatch_extra_garbage': {
      const buf = Buffer.alloc(500);
      buf.write('Header claims 1 triangle (134 bytes) but file has 500 bytes', 0);
      buf.writeUInt32LE(1, 80);
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), expectedError: 'LENGTH_MISMATCH' };
    }
    case 'uint32_overflow_count': {
      const buf = Buffer.alloc(84);
      buf.write('Triangle count is 0xFFFFFFFF (4,294,967,295)', 0);
      buf.writeUInt32LE(0xFFFFFFFF, 80);
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), expectedError: 'INTEGER_OVERFLOW' };
    }
    case 'binary_with_ascii_solid_prefix': {
      const cube = generateCube({ size: 10, format: 'binary', header: 'solid my_binary_cad_model_with_solid_prefix' });
      return {
        type,
        buffer: cube.buffer,
        arrayBuffer: cube.arrayBuffer,
        expectedFormat: 'STL_BINARY',
        triangleCount: 12,
        expectedMeshVolume: cube.expectedMeshVolume
      };
    }
    case 'zero_normals_binary': {
      const cube = generateCube({ size: 10, format: 'binary' });
      // Zero out all facet normals in the binary buffer
      for (let i = 0; i < cube.triangleCount; i++) {
        const offset = 84 + 50 * i;
        cube.buffer.writeFloatLE(0.0, offset + 0);
        cube.buffer.writeFloatLE(0.0, offset + 4);
        cube.buffer.writeFloatLE(0.0, offset + 8);
      }
      return {
        type,
        buffer: cube.buffer,
        arrayBuffer: toArrayBuffer(cube.buffer),
        triangleCount: cube.triangleCount,
        expectedMeshVolume: cube.expectedMeshVolume,
        normalRecoveryRequired: true
      };
    }
    case 'nan_coordinates_binary': {
      const cube = generateCube({ size: 10, format: 'binary' });
      // Insert NaN into vertex 1 x-coordinate of first facet
      cube.buffer.writeFloatLE(NaN, 84 + 12);
      return { type, buffer: cube.buffer, arrayBuffer: toArrayBuffer(cube.buffer), expectedError: 'INVALID_COORDINATES' };
    }
    case 'ascii_truncated': {
      const buf = Buffer.from('solid incomplete\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n', 'utf8');
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), asciiText: buf.toString('utf8'), expectedError: 'ASCII_PARSE_ERROR' };
    }
    case 'ascii_missing_endsolid': {
      const buf = Buffer.from('solid test\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 1 0 0\n      vertex 0 1 0\n    endloop\n  endfacet\n', 'utf8');
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), asciiText: buf.toString('utf8'), expectedError: 'MISSING_ENDSOLID' };
    }
    case 'ascii_with_null_byte': {
      const cube = generateCube({ size: 10, format: 'ascii' });
      const buf = Buffer.from(cube.asciiText, 'utf8');
      buf[20] = 0x00; // Inject null byte
      return { type, buffer: buf, arrayBuffer: toArrayBuffer(buf), expectedError: 'BINARY_CORRUPTED_ASCII' };
    }
    default:
      throw new Error(`Unknown malformed STL type: ${type}`);
  }
}

// ============================================================================
// 6. SCOPE.MD CONVENIENCE GENERATOR ALIASES
// ============================================================================

/**
 * Generates a binary STL cube matching SCOPE.md interface contract.
 * @param {number} [size=10] - Cube side length
 * @param {object} [options={}] - Additional generator options
 * @returns {object} Fixture bundle with { buffer, expectedVolume, expectedArea, triangleCount: 12 }
 */
function generateBinaryCube(size = 10, options = {}) {
  const fixture = generateCube(Object.assign({ size, format: 'binary' }, options));
  fixture.expectedVolume = fixture.expectedExactVolume;
  fixture.expectedArea = fixture.expectedExactArea;
  return fixture;
}

/**
 * Generates an ASCII STL cube matching SCOPE.md interface contract.
 * @param {number} [size=10] - Cube side length
 * @param {string} [solidName='ascii_cube'] - Solid name for ASCII header
 * @param {object} [options={}] - Additional generator options
 * @returns {object} Fixture bundle with { text, buffer, expectedVolume, expectedArea, triangleCount: 12 }
 */
function generateAsciiCube(size = 10, solidName = 'ascii_cube', options = {}) {
  const fixture = generateCube(Object.assign({ size, format: 'ascii', name: solidName }, options));
  fixture.text = fixture.asciiText;
  fixture.expectedVolume = fixture.expectedExactVolume;
  fixture.expectedArea = fixture.expectedExactArea;
  return fixture;
}

/**
 * Generates a rectangular plate with circular through-hole matching SCOPE.md interface contract.
 * @param {number} [plateSize=40] - Plate width and length
 * @param {number} [holeDiameter=16] - Through-hole diameter
 * @param {number} [plateThickness=10] - Plate thickness
 * @param {number} [segments=32] - Circle tessellation segment count
 * @param {object} [options={}] - Additional generator options
 * @returns {object} Fixture bundle with { buffer, expectedDiameter, expectedCenter, expectedMidpoints }
 */
function generateCylinderHolePlate(plateSize = 40, holeDiameter = 16, plateThickness = 10, segments = 32, options = {}) {
  const fixture = generatePlateWithHole(Object.assign({
    width: plateSize,
    length: plateSize,
    thickness: plateThickness,
    holeRadius: holeDiameter / 2,
    segments: segments
  }, options));
  fixture.expectedDiameter = holeDiameter;
  fixture.expectedCenter = [0, 0, plateThickness / 2];
  fixture.expectedMidpoints = [
    [0, -plateSize / 2, plateThickness / 2],
    [plateSize / 2, 0, plateThickness / 2],
    [0, plateSize / 2, plateThickness / 2],
    [-plateSize / 2, 0, plateThickness / 2]
  ];
  return fixture;
}

/**
 * Generates a two-facet dihedral wedge matching SCOPE.md interface contract.
 * @param {number} [angleDegrees=30] - Dihedral angle in degrees
 * @param {object} [options={}] - Additional generator options
 * @returns {object} Fixture bundle with { buffer, expectedDihedral, isCrease }
 */
function generateDihedralWedge(angleDegrees = 30, options = {}) {
  const fixture = generateDihedralPlate(angleDegrees, options);
  fixture.expectedDihedral = angleDegrees;
  fixture.isCrease = angleDegrees > 25.0;
  return fixture;
}

// ============================================================================
// 7. MODULE EXPORTS
// ============================================================================

module.exports = {
  // Low-level serializers & converters
  trianglesToBinaryBuffer,
  trianglesToAsciiString,
  toArrayBuffer,

  // Polyhedral generators
  generateCube,
  generateTetrahedron,
  generateHollowBox,
  generateInvertedCube,

  // Curved & feature-rich generators
  generateCylinder,
  generateDihedralPlate,
  generateSteppedBushing,
  generatePlateWithHole,
  generateFlangedBushingWithBolts,

  // Convenience export aliases matching SCOPE.md
  generateBinaryCube,
  generateAsciiCube,
  generateCylinderHolePlate,
  generateDihedralWedge,

  // Malformed test fixtures
  generateMalformedStl,

  // Mathematical ground-truth helpers
  computeSignedVolume,
  computeSurfaceArea,
  fitCircleKasa,
  computeFaceNormal,
  computeBBox
};
