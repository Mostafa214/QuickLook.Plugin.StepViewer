/**
 * meshFeatureDetector.js — Smart Mesh Feature Detection & Measurement Snapping
 * QuickLook.Plugin.StepViewer native STL CAD Intelligence
 *
 * Provides:
 *  - Stage 1: Spatial Vertex Quantization & Welding (1 micron resolution, flat TypedArray spatial hash table)
 *  - Stage 2: Adjacency Graph & Face Normal / Area computation
 *  - Stage 3: Sharp Crease Edge Detection (dihedral angle > 25 deg, boundary edges, non-manifold edges)
 *  - Stage 4: Closed Circular Hole Loop Extraction & Centered Kåsa Circle Fit (sub-0.05 mm precision via Cramer's rule)
 *  - Stage 5: Coplanar Face Clustering (flood-fill BFS into B-Rep planar faces)
 *  - Stage 6: Edge Line Indices Packing for THREE.LineSegments CAD edge rendering
 *
 * Zero external dependencies. UMD module (Node.js & browser compatible).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MeshFeatureDetector = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INV_TOL = 1000; // 1 micron resolution = 1000 units/mm
  var CREASE_COS_THRESHOLD = 0.9063077870366499; // cos(25 deg)
  var COPLANAR_COS_THRESHOLD = 0.999; // cos(2.5 deg) ~ 0.999 to prevent normal drift on curved surfaces
  var PLANE_DIST_TOL = 0.05; // 0.05 mm plane offset tolerance
  var HOLE_PLANAR_TOL = 0.10; // 0.10 mm planarity residual for circular loops
  var MIN_CIRCLE_RADIUS = 0.20; // 0.20 mm minimum circular hole radius
  var MAX_RADIAL_RESIDUAL_RATIO = 0.05; // max 5% radial deviation from circle fit
  var MIN_LOOP_VERTICES = 6; // minimum vertices for circle fit (polygons >= 6 sides)

  /**
   * Helper to compute next power of two
   */
  function nextPowerOfTwo(v) {
    var p = 1;
    while (p < v) p <<= 1;
    return p;
  }

  /**
   * Extract raw position and index arrays from various geometry representations.
   */
  function extractGeometryData(input) {
    if (!input) return null;

    var positions = null;
    var indices = null;

    if (input.isMesh && input.geometry) {
      input = input.geometry;
    }

    if (input.attributes && input.attributes.position) {
      var posAttr = input.attributes.position;
      positions = posAttr.array ? posAttr.array : posAttr;
      if (input.index) {
        indices = input.index.array ? input.index.array : input.index;
      }
    } else if (input.position) {
      positions = input.position.array ? input.position.array : input.position;
      if (input.index) {
        indices = input.index.array ? input.index.array : input.index;
      }
    } else if (ArrayBuffer.isView(input) || Array.isArray(input)) {
      positions = input;
    }

    if (!positions || positions.length < 9) return null;

    var numTriangles = indices ? (indices.length / 3) | 0 : (positions.length / 9) | 0;
    return {
      positions: positions,
      indices: indices,
      numTriangles: numTriangles
    };
  }

  /**
   * Fits a circle to a 3D vertex loop using Newell plane normal, 2D orthonormal projection,
   * and Centered Kåsa algebraic circle fit solved via Cramer's rule in O(N) operations.
   */
  function fitCircleToLoop(loop, uniquePositions) {
    var N = loop.length;
    if (N < MIN_LOOP_VERTICES) return null;

    // 1. 3D centroid
    var cx = 0, cy = 0, cz = 0;
    var i, idx;
    for (i = 0; i < N; i++) {
      idx = loop[i] * 3;
      cx += uniquePositions[idx];
      cy += uniquePositions[idx + 1];
      cz += uniquePositions[idx + 2];
    }
    cx /= N; cy /= N; cz /= N;

    // 2. Newell's method for plane normal
    var nx = 0, ny = 0, nz = 0;
    for (i = 0; i < N; i++) {
      var j = (i + 1) % N;
      var i3 = loop[i] * 3;
      var j3 = loop[j] * 3;
      var xi = uniquePositions[i3],     yi = uniquePositions[i3 + 1], zi = uniquePositions[i3 + 2];
      var xj = uniquePositions[j3],     yj = uniquePositions[j3 + 1], zj = uniquePositions[j3 + 2];
      nx += (yi - yj) * (zi + zj);
      ny += (zi - zj) * (xi + xj);
      nz += (xi - xj) * (yi + yj);
    }
    var nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-12) return null;
    nx /= nLen; ny /= nLen; nz /= nLen;

    // 3. Planarity verification
    for (i = 0; i < N; i++) {
      idx = loop[i] * 3;
      var px = uniquePositions[idx];
      var py = uniquePositions[idx + 1];
      var pz = uniquePositions[idx + 2];
      var dist = Math.abs((px - cx) * nx + (py - cy) * ny + (pz - cz) * nz);
      if (dist >= HOLE_PLANAR_TOL) return null;
    }

    // 4. Stable orthonormal basis (u, v)
    var ax = Math.abs(nx) < 0.9 ? 1.0 : 0.0;
    var ay = Math.abs(nx) < 0.9 ? 0.0 : 1.0;
    var az = 0.0;
    var wx = ny * az - nz * ay;
    var wy = nz * ax - nx * az;
    var wz = nx * ay - ny * ax;
    var wLen = Math.hypot(wx, wy, wz);
    if (wLen < 1e-12) return null;
    var ux = wx / wLen, uy = wy / wLen, uz = wz / wLen;
    var vx = ny * uz - nz * uy;
    var vy = nz * ux - nx * uz;
    var vz = nx * uy - ny * ux;

    // 5. Isometric 2D projection
    var x = new Float64Array(N);
    var y = new Float64Array(N);
    var meanX = 0, meanY = 0;
    for (i = 0; i < N; i++) {
      idx = loop[i] * 3;
      var dx = uniquePositions[idx] - cx;
      var dy = uniquePositions[idx + 1] - cy;
      var dz = uniquePositions[idx + 2] - cz;
      var projX = dx * ux + dy * uy + dz * uz;
      var projY = dx * vx + dy * vy + dz * vz;
      x[i] = projX;
      y[i] = projY;
      meanX += projX;
      meanY += projY;
    }
    meanX /= N;
    meanY /= N;

    // 6. Centered Kåsa algebraic circle fit in 2D
    var Suu = 0, Svv = 0, Suv = 0, Suz = 0, Svz = 0;
    for (i = 0; i < N; i++) {
      var u = x[i] - meanX;
      var v = y[i] - meanY;
      var z = u * u + v * v;
      Suu += u * u;
      Svv += v * v;
      Suv += u * v;
      Suz += u * z;
      Svz += v * z;
    }

    var det = Suu * Svv - Suv * Suv;
    if (det < 1e-12) return null;

    // Cramer's rule closed form solution
    var u0 = (Svv * Suz - Suv * Svz) / (2.0 * det);
    var v0 = (Suu * Svz - Suv * Suz) / (2.0 * det);
    var x0 = meanX + u0;
    var y0 = meanY + v0;

    // 7. Geometric mean radius
    var sumR = 0;
    var rArr = new Float64Array(N);
    for (i = 0; i < N; i++) {
      var r = Math.hypot(x[i] - x0, y[i] - y0);
      rArr[i] = r;
      sumR += r;
    }
    var R = sumR / N;

    // 8. Circularity validation
    if (R < MIN_CIRCLE_RADIUS) return null;
    var maxResidual = 0;
    for (i = 0; i < N; i++) {
      var res = Math.abs(rArr[i] - R);
      if (res > maxResidual) maxResidual = res;
    }
    if (maxResidual > MAX_RADIAL_RESIDUAL_RATIO * R) return null;

    // 9. 3D back-projection
    var center3D = [
      cx + x0 * ux + y0 * vx,
      cy + x0 * uy + y0 * vy,
      cz + x0 * uz + y0 * vz
    ];

    var pointsFlat = new Float32Array(N * 3);
    for (i = 0; i < N; i++) {
      idx = loop[i] * 3;
      pointsFlat[i * 3] = uniquePositions[idx];
      pointsFlat[i * 3 + 1] = uniquePositions[idx + 1];
      pointsFlat[i * 3 + 2] = uniquePositions[idx + 2];
    }

    return {
      type: 'circle',
      radius: R,
      diameter: R * 2.0,
      center: center3D,
      normal: [nx, ny, nz],
      isClosed: true,
      isHole: true,
      points: pointsFlat
    };
  }

  /**
   * Detects CAD features on a mesh geometry.
   *
   * @param {Object} input - THREE.BufferGeometry, THREE.Mesh, or { position, index }
   * @returns {Object} { edgeFeatures, brepFaces, edgeIndices }
   */
  function detectFeatures(input) {
    var geomData = extractGeometryData(input);
    if (!geomData) {
      return {
        edgeFeatures: [],
        brepFaces: [],
        edgeIndices: new Uint32Array(0)
      };
    }

    var positions = geomData.positions;
    var indices = geomData.indices;
    var numTriangles = geomData.numTriangles;

    // =========================================================================
    // Stage 1: Spatial Vertex Quantization & Welding (1 micron resolution)
    // =========================================================================
    var maxVerts = numTriangles * 3;
    var TABLE_SIZE = nextPowerOfTwo(Math.max(1024, maxVerts * 2));
    var MASK = TABLE_SIZE - 1;

    var head = new Int32Array(TABLE_SIZE).fill(-1);
    var next = new Int32Array(maxVerts);
    var qxArr = new Int32Array(maxVerts);
    var qyArr = new Int32Array(maxVerts);
    var qzArr = new Int32Array(maxVerts);
    var uniquePositions = new Float64Array(maxVerts * 3);
    var weldedToOriginalIndex = new Int32Array(maxVerts);
    var triIndices = new Uint32Array(numTriangles * 3);
    var isDegenerateTri = new Uint8Array(numTriangles);
    var uniqueCount = 0;

    var t, c, k, x, y, z, qx, qy, qz, h, curr, wid;
    for (t = 0; t < numTriangles; t++) {
      for (c = 0; c < 3; c++) {
        k = indices ? indices[t * 3 + c] : (t * 3 + c);
        x = positions[k * 3];
        y = positions[k * 3 + 1];
        z = positions[k * 3 + 2];

        qx = Math.round(x * INV_TOL) | 0;
        qy = Math.round(y * INV_TOL) | 0;
        qz = Math.round(z * INV_TOL) | 0;

        h = (((qx * 73856093) ^ (qy * 19349663) ^ (qz * 83492791)) & MASK);

        curr = head[h];
        wid = -1;
        while (curr !== -1) {
          if (qxArr[curr] === qx && qyArr[curr] === qy && qzArr[curr] === qz) {
            wid = curr;
            break;
          }
          curr = next[curr];
        }

        if (wid === -1) {
          wid = uniqueCount++;
          qxArr[wid] = qx;
          qyArr[wid] = qy;
          qzArr[wid] = qz;
          uniquePositions[wid * 3] = x;
          uniquePositions[wid * 3 + 1] = y;
          uniquePositions[wid * 3 + 2] = z;
          weldedToOriginalIndex[wid] = k;
          next[wid] = head[h];
          head[h] = wid;
        }

        triIndices[t * 3 + c] = wid;
      }

      var w0 = triIndices[t * 3];
      var w1 = triIndices[t * 3 + 1];
      var w2 = triIndices[t * 3 + 2];
      if (w0 === w1 || w1 === w2 || w2 === w0) {
        isDegenerateTri[t] = 1;
      }
    }

    // =========================================================================
    // Stage 2: Adjacency Graph & Face Normal / Area computation
    // =========================================================================
    var faceNormals = new Float32Array(numTriangles * 3);
    var faceAreas = new Float32Array(numTriangles);

    for (t = 0; t < numTriangles; t++) {
      if (isDegenerateTri[t]) continue;

      var v0 = triIndices[t * 3] * 3;
      var v1 = triIndices[t * 3 + 1] * 3;
      var v2 = triIndices[t * 3 + 2] * 3;

      var ax = uniquePositions[v0],     ay = uniquePositions[v0 + 1], az = uniquePositions[v0 + 2];
      var bx = uniquePositions[v1],     by = uniquePositions[v1 + 1], bz = uniquePositions[v1 + 2];
      var cxCoord = uniquePositions[v2], cyCoord = uniquePositions[v2 + 1], czCoord = uniquePositions[v2 + 2];

      var abx = bx - ax, aby = by - ay, abz = bz - az;
      var acx = cxCoord - ax, acy = cyCoord - ay, acz = czCoord - az;

      var crossX = aby * acz - abz * acy;
      var crossY = abz * acx - abx * acz;
      var crossZ = abx * acy - aby * acx;

      var crossLen = Math.hypot(crossX, crossY, crossZ);
      if (crossLen < 1e-12) {
        isDegenerateTri[t] = 1;
      } else {
        faceAreas[t] = 0.5 * crossLen;
        faceNormals[t * 3] = crossX / crossLen;
        faceNormals[t * 3 + 1] = crossY / crossLen;
        faceNormals[t * 3 + 2] = crossZ / crossLen;
      }
    }

    // Undirected edge hashing
    var maxEdges = numTriangles * 3;
    var eTABLE_SIZE = nextPowerOfTwo(Math.max(1024, maxEdges * 2));
    var eMASK = eTABLE_SIZE - 1;
    var eHead = new Int32Array(eTABLE_SIZE).fill(-1);
    var eNext = new Int32Array(maxEdges);
    var eU = new Int32Array(maxEdges);
    var eV = new Int32Array(maxEdges);
    var eTri1 = new Int32Array(maxEdges).fill(-1);
    var eTri2 = new Int32Array(maxEdges).fill(-1);
    var eTriCount = new Int32Array(maxEdges);
    var triEdges = new Int32Array(numTriangles * 3).fill(-1);
    var edgeCount = 0;

    for (t = 0; t < numTriangles; t++) {
      if (isDegenerateTri[t]) continue;

      var tv0 = triIndices[t * 3];
      var tv1 = triIndices[t * 3 + 1];
      var tv2 = triIndices[t * 3 + 2];

      for (c = 0; c < 3; c++) {
        var va = (c === 0) ? tv0 : ((c === 1) ? tv1 : tv2);
        var vb = (c === 0) ? tv1 : ((c === 1) ? tv2 : tv0);
        var uVert = va < vb ? va : vb;
        var vVert = va < vb ? vb : va;

        var eh = (((uVert * 73856093) ^ (vVert * 19349663)) & eMASK);

        var eCurr = eHead[eh];
        var eIdx = -1;
        while (eCurr !== -1) {
          if (eU[eCurr] === uVert && eV[eCurr] === vVert) {
            eIdx = eCurr;
            break;
          }
          eCurr = eNext[eCurr];
        }

        if (eIdx !== -1) {
          eTriCount[eIdx]++;
          if (eTriCount[eIdx] === 2) {
            eTri2[eIdx] = t;
          }
          triEdges[t * 3 + c] = eIdx;
        } else {
          eIdx = edgeCount++;
          eU[eIdx] = uVert;
          eV[eIdx] = vVert;
          eTri1[eIdx] = t;
          eTriCount[eIdx] = 1;
          eNext[eIdx] = eHead[eh];
          eHead[eh] = eIdx;
          triEdges[t * 3 + c] = eIdx;
        }
      }
    }

    // =========================================================================
    // Stage 3: Sharp Crease Edge Detection (> 25 deg, boundary, non-manifold)
    // =========================================================================
    var isCrease = new Uint8Array(edgeCount);
    var creaseEdges = [];
    var creaseAdj = new Map(); // weldedVertexId -> array of { nbr: vertexId, edgeIdx: edgeId }

    for (var e = 0; e < edgeCount; e++) {
      var eu = eU[e];
      var ev = eV[e];
      var pAx = uniquePositions[eu * 3], pAy = uniquePositions[eu * 3 + 1], pAz = uniquePositions[eu * 3 + 2];
      var pBx = uniquePositions[ev * 3], pBy = uniquePositions[ev * 3 + 1], pBz = uniquePositions[ev * 3 + 2];
      var edgeLen = Math.hypot(pBx - pAx, pBy - pAy, pBz - pAz);
      if (edgeLen < 1e-6) continue;

      var edgeIsCrease = false;
      var count = eTriCount[e];

      if (count === 1 || eTri2[e] === -1) {
        // Boundary edge
        edgeIsCrease = true;
      } else if (count > 2) {
        // Non-manifold seam
        edgeIsCrease = true;
      } else if (count === 2) {
        var t1 = eTri1[e];
        var t2 = eTri2[e];
        var dot = faceNormals[t1 * 3] * faceNormals[t2 * 3] +
                  faceNormals[t1 * 3 + 1] * faceNormals[t2 * 3 + 1] +
                  faceNormals[t1 * 3 + 2] * faceNormals[t2 * 3 + 2];
        if (dot < CREASE_COS_THRESHOLD) {
          edgeIsCrease = true;
        }
      }

      if (edgeIsCrease) {
        isCrease[e] = 1;
        creaseEdges.push(e);

        if (!creaseAdj.has(eu)) creaseAdj.set(eu, []);
        creaseAdj.get(eu).push({ nbr: ev, edgeIdx: e });

        if (!creaseAdj.has(ev)) creaseAdj.set(ev, []);
        creaseAdj.get(ev).push({ nbr: eu, edgeIdx: e });
      }
    }

    // =========================================================================
    // Stage 4: Closed Circular Hole Loop Extraction & Centered Kåsa Circle Fit
    // =========================================================================
    var visitedLoopNodes = new Set();
    var circularLoops = [];
    var circleEdgeSet = new Set();
    var edgeFeatures = [];

    // 4.1 Trace clean 2-regular cycles
    creaseAdj.forEach(function (nbrs, startNode) {
      if (visitedLoopNodes.has(startNode) || nbrs.length !== 2) return;

      var loop = [startNode];
      var loopEdges = [];
      visitedLoopNodes.add(startNode);
      var prev = startNode;
      var currNode = nbrs[0].nbr;
      loopEdges.push(nbrs[0].edgeIdx);
      var isClosed = false;

      while (currNode !== undefined) {
        if (currNode === startNode) {
          isClosed = true;
          break;
        }
        var cNbrs = creaseAdj.get(currNode);
        if (!cNbrs || cNbrs.length !== 2 || visitedLoopNodes.has(currNode)) break;

        visitedLoopNodes.add(currNode);
        loop.push(currNode);
        var nextItem = (cNbrs[0].nbr === prev) ? cNbrs[1] : cNbrs[0];
        prev = currNode;
        currNode = nextItem.nbr;
        loopEdges.push(nextItem.edgeIdx);
      }

      if (isClosed && loop.length >= MIN_LOOP_VERTICES) {
        var circleFeat = fitCircleToLoop(loop, uniquePositions);
        if (circleFeat) {
          circularLoops.push(circleFeat);
          edgeFeatures.push(circleFeat);
          for (var j = 0; j < loopEdges.length; j++) {
            circleEdgeSet.add(loopEdges[j]);
          }
        }
      }
    });

    // 4.2 Bounded cycle search for holes with branched vertices (degree >= 3)
    var evaluatedCycleKeys = new Set();
    var dfsSteps = 0;
    function searchCyclesDFS(startNode, currentNode, parentNode, path, pathEdges, depth) {
      if (++dfsSteps > 256) return;
      if (depth > 32) return;
      var neighbors = creaseAdj.get(currentNode);
      if (!neighbors) return;

      for (var ni = 0; ni < neighbors.length; ni++) {
        var nbrItem = neighbors[ni];
        var nbr = nbrItem.nbr;
        var edgeId = nbrItem.edgeIdx;
        if (nbr === parentNode) continue;

        if (nbr === startNode) {
          if (path.length >= MIN_LOOP_VERTICES) {
            // Found a cycle returning to startNode
            var fullEdges = pathEdges.concat([edgeId]);
            // Canonical key to prevent duplicates
            var minNode = path[0];
            var minIdx = 0;
            for (var pi = 1; pi < path.length; pi++) {
              if (path[pi] < minNode) {
                minNode = path[pi];
                minIdx = pi;
              }
            }
            var keyParts = [];
            for (var ki = 0; ki < path.length; ki++) {
              keyParts.push(path[(minIdx + ki) % path.length]);
            }
            var cycleKey = keyParts.join('_');
            if (!evaluatedCycleKeys.has(cycleKey)) {
              evaluatedCycleKeys.add(cycleKey);
              var feat = fitCircleToLoop(path, uniquePositions);
              if (feat) {
                circularLoops.push(feat);
                edgeFeatures.push(feat);
                for (var fe = 0; fe < fullEdges.length; fe++) {
                  circleEdgeSet.add(fullEdges[fe]);
                }
              }
            }
          }
          continue;
        }

        if (path.indexOf(nbr) === -1 && depth < 32) {
          path.push(nbr);
          pathEdges.push(edgeId);
          searchCyclesDFS(startNode, nbr, currentNode, path, pathEdges, depth + 1);
          path.pop();
          pathEdges.pop();
        }
      }
    }

    creaseAdj.forEach(function (nbrs, node) {
      if (nbrs.length >= 3 && !visitedLoopNodes.has(node)) {
        dfsSteps = 0;
        searchCyclesDFS(node, node, -1, [node], [], 0);
      }
    });

    // 4.3 Emit straight line features for non-circle crease edges
    for (var ci = 0; ci < creaseEdges.length; ci++) {
      var ce = creaseEdges[ci];
      if (circleEdgeSet.has(ce)) continue; // Suppress circle rim chord segments

      var cu = eU[ce];
      var cv = eV[ce];
      var cxA = uniquePositions[cu * 3], cyA = uniquePositions[cu * 3 + 1], czA = uniquePositions[cu * 3 + 2];
      var cxB = uniquePositions[cv * 3], cyB = uniquePositions[cv * 3 + 1], czB = uniquePositions[cv * 3 + 2];
      var clen = Math.hypot(cxB - cxA, cyB - cyA, czB - czA);
      if (clen < 1e-6) continue;

      var mid = [(cxA + cxB) * 0.5, (cyA + cyB) * 0.5, (czA + czB) * 0.5];
      var linePts = new Float32Array([cxA, cyA, czA, cxB, cyB, czB]);

      edgeFeatures.push({
        type: 'line',
        length: clen,
        start: [cxA, cyA, czA],
        end: [cxB, cyB, czB],
        midpoint: mid,
        points: linePts
      });
    }

    // =========================================================================
    // Stage 5: Coplanar Face Clustering (flood-fill BFS)
    // =========================================================================
    var visitedTri = new Uint8Array(numTriangles);
    var queue = new Int32Array(numTriangles);
    var brepFaces = [];

    for (t = 0; t < numTriangles; t++) {
      if (visitedTri[t] || isDegenerateTri[t]) continue;

      visitedTri[t] = 1;
      queue[0] = t;
      var qHead = 0;
      var qTail = 1;

      var seedNx = faceNormals[t * 3];
      var seedNy = faceNormals[t * 3 + 1];
      var seedNz = faceNormals[t * 3 + 2];

      var seedV0 = triIndices[t * 3] * 3;
      var p0x = uniquePositions[seedV0];
      var p0y = uniquePositions[seedV0 + 1];
      var p0z = uniquePositions[seedV0 + 2];
      var D_seed = -(seedNx * p0x + seedNy * p0y + seedNz * p0z);

      var cluster = [t];
      var clusterArea = faceAreas[t];

      var seedV1 = triIndices[t * 3 + 1] * 3;
      var seedV2 = triIndices[t * 3 + 2] * 3;
      var tCentroidX = (p0x + uniquePositions[seedV1] + uniquePositions[seedV2]) / 3.0;
      var tCentroidY = (p0y + uniquePositions[seedV1 + 1] + uniquePositions[seedV2 + 1]) / 3.0;
      var tCentroidZ = (p0z + uniquePositions[seedV1 + 2] + uniquePositions[seedV2 + 2]) / 3.0;

      var sumCx = clusterArea * tCentroidX;
      var sumCy = clusterArea * tCentroidY;
      var sumCz = clusterArea * tCentroidZ;
      var sumNx = clusterArea * seedNx;
      var sumNy = clusterArea * seedNy;
      var sumNz = clusterArea * seedNz;

      var minTri = t;
      var maxTri = t;

      while (qHead < qTail) {
        var currTri = queue[qHead++];
        for (var edgeIdx = 0; edgeIdx < 3; edgeIdx++) {
          var triEdge = triEdges[currTri * 3 + edgeIdx];
          if (triEdge === -1 || isCrease[triEdge]) continue;

          var nbr = (eTri1[triEdge] === currTri) ? eTri2[triEdge] : eTri1[triEdge];
          if (nbr === -1 || visitedTri[nbr] || isDegenerateTri[nbr]) continue;

          // 1. Normal alignment check against seed normal
          var nbrNx = faceNormals[nbr * 3];
          var nbrNy = faceNormals[nbr * 3 + 1];
          var nbrNz = faceNormals[nbr * 3 + 2];
          var dotNorm = nbrNx * seedNx + nbrNy * seedNy + nbrNz * seedNz;
          if (dotNorm < COPLANAR_COS_THRESHOLD) continue;

          // 2. Vertex-to-plane distance check
          var nv0 = triIndices[nbr * 3] * 3;
          var nv1 = triIndices[nbr * 3 + 1] * 3;
          var nv2 = triIndices[nbr * 3 + 2] * 3;

          var dist0 = Math.abs(seedNx * uniquePositions[nv0] + seedNy * uniquePositions[nv0 + 1] + seedNz * uniquePositions[nv0 + 2] + D_seed);
          var dist1 = Math.abs(seedNx * uniquePositions[nv1] + seedNy * uniquePositions[nv1 + 1] + seedNz * uniquePositions[nv1 + 2] + D_seed);
          var dist2 = Math.abs(seedNx * uniquePositions[nv2] + seedNy * uniquePositions[nv2 + 1] + seedNz * uniquePositions[nv2 + 2] + D_seed);
          if (dist0 >= PLANE_DIST_TOL || dist1 >= PLANE_DIST_TOL || dist2 >= PLANE_DIST_TOL) continue;

          visitedTri[nbr] = 1;
          queue[qTail++] = nbr;
          cluster.push(nbr);
          if (nbr < minTri) minTri = nbr;
          if (nbr > maxTri) maxTri = nbr;

          var nbrArea = faceAreas[nbr];
          clusterArea += nbrArea;

          var nCentroidX = (uniquePositions[nv0] + uniquePositions[nv1] + uniquePositions[nv2]) / 3.0;
          var nCentroidY = (uniquePositions[nv0 + 1] + uniquePositions[nv1 + 1] + uniquePositions[nv2 + 1]) / 3.0;
          var nCentroidZ = (uniquePositions[nv0 + 2] + uniquePositions[nv1 + 2] + uniquePositions[nv2 + 2]) / 3.0;

          sumCx += nbrArea * nCentroidX;
          sumCy += nbrArea * nCentroidY;
          sumCz += nbrArea * nCentroidZ;
          sumNx += nbrArea * nbrNx;
          sumNy += nbrArea * nbrNy;
          sumNz += nbrArea * nbrNz;
        }
      }

      var normMag = Math.hypot(sumNx, sumNy, sumNz);
      var finalNormal = normMag > 1e-12 ? [sumNx / normMag, sumNy / normMag, sumNz / normMag] : [seedNx, seedNy, seedNz];
      var finalCentroid = clusterArea > 0 ? [sumCx / clusterArea, sumCy / clusterArea, sumCz / clusterArea] : [p0x, p0y, p0z];

      brepFaces.push({
        id: brepFaces.length,
        surfaceType: 'plane',
        areaMm2: clusterArea,
        centroid: finalCentroid,
        normal: finalNormal,
        triangles: new Uint32Array(cluster),
        first: minTri,
        last: maxTri
      });
    }

    // =========================================================================
    // Stage 6: Edge Line Indices Packing for THREE.LineSegments
    // =========================================================================
    var edgeIndices = new Uint32Array(creaseEdges.length * 2);
    for (var ei = 0; ei < creaseEdges.length; ei++) {
      var cre = creaseEdges[ei];
      edgeIndices[ei * 2] = weldedToOriginalIndex[eU[cre]];
      edgeIndices[ei * 2 + 1] = weldedToOriginalIndex[eV[cre]];
    }

    return {
      edgeFeatures: edgeFeatures,
      brepFaces: brepFaces,
      edgeIndices: edgeIndices
    };
  }

  return {
    detectFeatures: detectFeatures,
    fitCircleToLoop: fitCircleToLoop
  };
}));
