/**
 * QuickLook CAD Studio - Zero-Dependency Dual Binary/ASCII STL Loader
 * File: Assets/js/stlLoader.js
 *
 * Capabilities:
 * 1. Strict Dual-Format Detection: Byte-length precedence prevents misclassifying binary STLs with "solid" headers.
 * 2. High-Performance Binary Single-Pass: Direct DataView extraction into Float32Array positions and normals (<15ms).
 * 3. Degenerate Normal Recovery: Automatic fallback using normalized cross product (b-a) x (c-a).
 * 4. In-Pass Analytical Physics: Exact signed volume via Gauss divergence theorem, surface area, and AABB min/max.
 * 5. High-Performance Spatial Topology: 0.1 um vertex welding and numeric undirected edge occurrence validation (watertight/manifold).
 * 6. Pipeline Conformance: Direct output matching onTessellationComplete schema.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StlLoader = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Fast format discriminator.
   * Byte-length validation MUST precede ASCII "solid" detection.
   * @param {ArrayBuffer|Uint8Array} buffer
   * @returns {'binary' | 'ascii' | 'invalid'}
   */
  function detectType(buffer) {
    if (!buffer) return 'invalid';

    let arrayBuffer = buffer;
    let byteOffset = 0;
    let byteLength = buffer.byteLength;

    if (buffer instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(buffer))) {
      arrayBuffer = buffer.buffer;
      byteOffset = buffer.byteOffset;
      byteLength = buffer.byteLength;
    }

    if (byteLength < 84) {
      // Possible small ASCII STL
      if (byteLength >= 6) {
        const u8 = new Uint8Array(arrayBuffer, byteOffset, byteLength);
        for (let i = 0; i < u8.length; i++) {
          if (u8[i] === 0) return 'invalid';
        }
        const s = new TextDecoder('utf-8').decode(u8);
        if (/^\s*solid/i.test(s) && (/facet\s+normal/i.test(s) || /endsolid/i.test(s))) {
          return 'ascii';
        }
      }
      return 'invalid';
    }

    // Binary check: 84 + 50 * triangleCount === byteLength
    const view = new DataView(arrayBuffer, byteOffset, byteLength);
    const triangleCount = view.getUint32(80, true);
    const expectedBinarySize = 84 + triangleCount * 50;

    if (expectedBinarySize === byteLength) {
      return 'binary';
    }

    // ASCII heuristic: verify absence of null bytes in preamble and check for keywords
    const scanLen = Math.min(byteLength, 8192);
    const u8 = new Uint8Array(arrayBuffer, byteOffset, scanLen);
    for (let i = 0; i < scanLen; i++) {
      if (u8[i] === 0) return 'invalid'; // Binary or corrupted file
    }

    const preamble = new TextDecoder('utf-8').decode(u8);
    if (/^\s*solid/i.test(preamble) && (/facet\s+normal/i.test(preamble) || /endsolid/i.test(preamble))) {
      return 'ascii';
    }

    return 'invalid';
  }

  /**
   * High-performance spatial vertex welding and undirected edge occurrence topology analysis.
   * @param {Float32Array} positions - 9 floats per triangle (non-indexed)
   * @returns {{ isWatertight: boolean, isManifold: boolean, uniqueVertices: number, uniqueEdges: number, boundaryEdges: number, nonManifoldEdges: number }}
   */
  function analyzeTopology(positions) {
    const numTris = positions.length / 9;
    if (numTris === 0) {
      return { isWatertight: false, isManifold: false, uniqueVertices: 0, uniqueEdges: 0, boundaryEdges: 0, nonManifoldEdges: 0 };
    }

    const invTol = 10000; // 0.1 micron precision (10^-4 mm)
    const vertMap = new Map();
    let nextVertId = 0;

    function getSpatialId(x, y, z) {
      const k = Math.round(x * invTol) + '_' + Math.round(y * invTol) + '_' + Math.round(z * invTol);
      let id = vertMap.get(k);
      if (id === undefined) {
        id = nextVertId++;
        vertMap.set(k, id);
      }
      return id;
    }

    // Map undirected edges to counts.
    // Encodes (u, v) into a 64-bit numeric double (min * 67108864 + max) for zero string allocations.
    const edgeMap = new Map();

    for (let i = 0; i < numTris; i++) {
      const p = i * 9;
      const v0 = getSpatialId(positions[p],     positions[p + 1], positions[p + 2]);
      const v1 = getSpatialId(positions[p + 3], positions[p + 4], positions[p + 5]);
      const v2 = getSpatialId(positions[p + 6], positions[p + 7], positions[p + 8]);

      // Skip degenerate triangles (collapsed to point or line)
      if (v0 === v1 || v1 === v2 || v2 === v0) continue;

      const e0u = v0 < v1 ? v0 : v1, e0v = v0 < v1 ? v1 : v0;
      const e1u = v1 < v2 ? v1 : v2, e1v = v1 < v2 ? v2 : v1;
      const e2u = v2 < v0 ? v2 : v0, e2v = v2 < v0 ? v0 : v2;

      const k0 = e0u * 67108864 + e0v;
      const k1 = e1u * 67108864 + e1v;
      const k2 = e2u * 67108864 + e2v;

      edgeMap.set(k0, (edgeMap.get(k0) || 0) + 1);
      edgeMap.set(k1, (edgeMap.get(k1) || 0) + 1);
      edgeMap.set(k2, (edgeMap.get(k2) || 0) + 1);
    }

    let isWatertight = true;
    let isManifold = true;
    let boundaryEdges = 0;
    let nonManifoldEdges = 0;

    for (const [, count] of edgeMap) {
      if (count !== 2) {
        isWatertight = false;
        if (count === 1) {
          boundaryEdges++;
        } else if (count > 2) {
          isManifold = false;
          nonManifoldEdges++;
        }
      }
    }

    return {
      isWatertight: isWatertight && edgeMap.size > 0,
      isManifold: isManifold && edgeMap.size > 0,
      uniqueVertices: nextVertId,
      uniqueEdges: edgeMap.size,
      boundaryEdges: boundaryEdges,
      nonManifoldEdges: nonManifoldEdges
    };
  }

  /**
   * Single-pass binary STL parser.
   */
  function parseBinary(arrayBuffer, byteOffset, byteLength, fileName) {
    const view = new DataView(arrayBuffer, byteOffset, byteLength);
    const triangleCount = view.getUint32(80, true);

    // Header solid name sniffing
    let headerName = '';
    try {
      const h80 = new Uint8Array(arrayBuffer, byteOffset, 80);
      let end = 0;
      while (end < 80 && h80[end] !== 0) end++;
      if (end > 0) {
        const raw = new TextDecoder('utf-8').decode(h80.subarray(0, end)).trim();
        if (raw && !raw.startsWith('COLOR=') && !raw.startsWith('MATERIAL=')) {
          headerName = raw;
        }
      }
    } catch (e) {}

    const meshName = headerName || fileName || 'STL_Mesh';
    const positions = new Float32Array(triangleCount * 9);
    const normals = new Float32Array(triangleCount * 9);

    let offset = 84;
    let posIdx = 0;
    let totalVol = 0;
    let totalArea = 0;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < triangleCount; i++) {
      let nx = view.getFloat32(offset, true);
      let ny = view.getFloat32(offset + 4, true);
      let nz = view.getFloat32(offset + 8, true);

      const ax = view.getFloat32(offset + 12, true);
      const ay = view.getFloat32(offset + 16, true);
      const az = view.getFloat32(offset + 20, true);

      const bx = view.getFloat32(offset + 24, true);
      const by = view.getFloat32(offset + 28, true);
      const bz = view.getFloat32(offset + 32, true);

      const cx = view.getFloat32(offset + 36, true);
      const cy = view.getFloat32(offset + 40, true);
      const cz = view.getFloat32(offset + 44, true);

      offset += 50; // Skip 2-byte attribute uint16

      // Write positions
      positions[posIdx]     = ax; positions[posIdx + 1] = ay; positions[posIdx + 2] = az;
      positions[posIdx + 3] = bx; positions[posIdx + 4] = by; positions[posIdx + 5] = bz;
      positions[posIdx + 6] = cx; positions[posIdx + 7] = cy; positions[posIdx + 8] = cz;

      // Cross product (b - a) x (c - a)
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;

      const crossLen = Math.hypot(crossX, crossY, crossZ);
      totalArea += 0.5 * crossLen;

      // Gauss divergence theorem tetrahedron signed volume
      totalVol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6.0;

      // Normal recovery & unit normalization
      const normLenSq = nx * nx + ny * ny + nz * nz;
      if (normLenSq < 1e-6 || !isFinite(normLenSq)) {
        if (crossLen > 1e-12) {
          const invLen = 1.0 / crossLen;
          nx = crossX * invLen; ny = crossY * invLen; nz = crossZ * invLen;
        } else {
          nx = 0; ny = 0; nz = 1;
        }
      } else if (Math.abs(normLenSq - 1.0) > 1e-4) {
        const invL = 1.0 / Math.sqrt(normLenSq);
        nx *= invL; ny *= invL; nz *= invL;
      }

      normals[posIdx]     = nx; normals[posIdx + 1] = ny; normals[posIdx + 2] = nz;
      normals[posIdx + 3] = nx; normals[posIdx + 4] = ny; normals[posIdx + 5] = nz;
      normals[posIdx + 6] = nx; normals[posIdx + 7] = ny; normals[posIdx + 8] = nz;

      posIdx += 9;

      // AABB bounds update
      if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
      if (ay < minY) minY = ay; if (ay > maxY) maxY = ay;
      if (az < minZ) minZ = az; if (az > maxZ) maxZ = az;

      if (bx < minX) minX = bx; if (bx > maxX) maxX = bx;
      if (by < minY) minY = by; if (by > maxY) maxY = by;
      if (bz < minZ) minZ = bz; if (bz > maxZ) maxZ = bz;

      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;
    }

    if (triangleCount === 0) {
      minX = minY = minZ = maxX = maxY = maxZ = 0;
    }

    const topo = analyzeTopology(positions);

    return {
      format: 'STL',
      fileName: fileName,
      meshes: [
        {
          id: 0,
          name: meshName,
          color: [0.722, 0.753, 0.800],
          hasOriginalColor: false,
          position: positions,
          normal: normals,
          index: null,
          edgeIndices: null,
          edgeFeatures: [],
          brepFaces: [],
          volumeMm3: Math.abs(totalVol),
          areaMm2: totalArea,
          bbox: {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
            size: [maxX - minX, maxY - minY, maxZ - minZ]
          },
          isWatertight: topo.isWatertight,
          isManifold: topo.isManifold
        }
      ],
      totalTriangles: triangleCount,
      isWatertight: topo.isWatertight,
      isManifold: topo.isManifold,
      volumeMm3: Math.abs(totalVol),
      areaMm2: totalArea
    };
  }

  /**
   * Fast two-phase ASCII STL parser.
   */
  function parseAscii(arrayBuffer, byteOffset, byteLength, fileName) {
    const text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer, byteOffset, byteLength));
    const solidMatch = text.match(/solid[ \t]+([^\r\n]+)/i);
    const solidName = (solidMatch && solidMatch[1].trim()) || fileName || 'STL_Mesh';

    // Phase 1: Fast facet count estimation & pre-allocation
    const facetMatches = text.match(/facet\s+normal/gi);
    const triangleCount = facetMatches ? facetMatches.length : 0;

    let positions = new Float32Array(triangleCount * 9);
    let normals = new Float32Array(triangleCount * 9);

    // Phase 2: Regex extraction
    const facetRe = /facet\s+normal\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)[\s\S]*?vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)[\s\S]*?vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)[\s\S]*?vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/gi;

    let m;
    let posIdx = 0;
    let totalVol = 0;
    let totalArea = 0;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    while ((m = facetRe.exec(text)) !== null) {
      let nx = parseFloat(m[1]);
      let ny = parseFloat(m[2]);
      let nz = parseFloat(m[3]);

      const ax = parseFloat(m[4]);
      const ay = parseFloat(m[5]);
      const az = parseFloat(m[6]);

      const bx = parseFloat(m[7]);
      const by = parseFloat(m[8]);
      const bz = parseFloat(m[9]);

      const cx = parseFloat(m[10]);
      const cy = parseFloat(m[11]);
      const cz = parseFloat(m[12]);

      positions[posIdx]     = ax; positions[posIdx + 1] = ay; positions[posIdx + 2] = az;
      positions[posIdx + 3] = bx; positions[posIdx + 4] = by; positions[posIdx + 5] = bz;
      positions[posIdx + 6] = cx; positions[posIdx + 7] = cy; positions[posIdx + 8] = cz;

      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;

      const crossLen = Math.hypot(crossX, crossY, crossZ);
      totalArea += 0.5 * crossLen;

      totalVol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6.0;

      const normLenSq = nx * nx + ny * ny + nz * nz;
      if (normLenSq < 1e-6 || !isFinite(normLenSq)) {
        if (crossLen > 1e-12) {
          const invLen = 1.0 / crossLen;
          nx = crossX * invLen; ny = crossY * invLen; nz = crossZ * invLen;
        } else {
          nx = 0; ny = 0; nz = 1;
        }
      } else if (Math.abs(normLenSq - 1.0) > 1e-4) {
        const invL = 1.0 / Math.sqrt(normLenSq);
        nx *= invL; ny *= invL; nz *= invL;
      }

      normals[posIdx]     = nx; normals[posIdx + 1] = ny; normals[posIdx + 2] = nz;
      normals[posIdx + 3] = nx; normals[posIdx + 4] = ny; normals[posIdx + 5] = nz;
      normals[posIdx + 6] = nx; normals[posIdx + 7] = ny; normals[posIdx + 8] = nz;

      posIdx += 9;

      if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
      if (ay < minY) minY = ay; if (ay > maxY) maxY = ay;
      if (az < minZ) minZ = az; if (az > maxZ) maxZ = az;

      if (bx < minX) minX = bx; if (bx > maxX) maxX = bx;
      if (by < minY) minY = by; if (by > maxY) maxY = by;
      if (bz < minZ) minZ = bz; if (bz > maxZ) maxZ = bz;

      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;
    }

    const actualTriangles = posIdx / 9;
    if (actualTriangles === 0) {
      throw new Error('Invalid STL file: No valid facet triangles found');
    }

    if (actualTriangles < triangleCount) {
      positions = positions.subarray(0, posIdx);
      normals = normals.subarray(0, posIdx);
    }

    const topo = analyzeTopology(positions);

    return {
      format: 'STL',
      fileName: fileName,
      meshes: [
        {
          id: 0,
          name: solidName,
          color: [0.722, 0.753, 0.800],
          hasOriginalColor: false,
          position: positions,
          normal: normals,
          index: null,
          edgeIndices: null,
          edgeFeatures: [],
          brepFaces: [],
          volumeMm3: Math.abs(totalVol),
          areaMm2: totalArea,
          bbox: {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
            size: [maxX - minX, maxY - minY, maxZ - minZ]
          },
          isWatertight: topo.isWatertight,
          isManifold: topo.isManifold
        }
      ],
      totalTriangles: actualTriangles,
      isWatertight: topo.isWatertight,
      isManifold: topo.isManifold,
      volumeMm3: Math.abs(totalVol),
      areaMm2: totalArea
    };
  }

  /**
   * Main entry point: parses Binary or ASCII STL ArrayBuffer into tessellation payload.
   * @param {ArrayBuffer|Uint8Array} buffer - File buffer.
   * @param {string} fileName - Optional file name.
   * @returns {Object} Payload matching onTessellationComplete schema.
   */
  function parse(buffer, fileName) {
    const tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    let arrayBuffer = buffer;
    let byteOffset = 0;
    let byteLength = buffer ? buffer.byteLength : 0;

    if (buffer instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(buffer))) {
      arrayBuffer = buffer.buffer;
      byteOffset = buffer.byteOffset;
      byteLength = buffer.byteLength;
    }

    const type = detectType(buffer);

    let result;
    if (type === 'binary') {
      result = parseBinary(arrayBuffer, byteOffset, byteLength, fileName);
    } else if (type === 'ascii') {
      result = parseAscii(arrayBuffer, byteOffset, byteLength, fileName);
    } else {
      throw new Error('Invalid STL file: Not a valid Binary (size mismatch) or ASCII (missing solid/facet structure) STL.');
    }

    const tEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    result.elapsedMs = Math.round(tEnd - tStart);
    result.bufferSize = byteLength;
    result.meshCount = result.meshes.length;
    result.isMultiBody = result.meshCount > 1;

    return result;
  }

  return {
    parse: parse,
    detectType: detectType,
    analyzeTopology: analyzeTopology
  };
}));
