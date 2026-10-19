// Web Worker for Non-blocking Open CASCADE STEP B-Rep Tessellation
/* global importScripts, occtimportjs */

let occt = null;
let occtInitPromise = null;

function getOcct() {
    if (!occtInitPromise) {
        importScripts('occt-import-js.js');
        occtInitPromise = occtimportjs({
            locateFile: (path) => path
        }).then((instance) => {
            occt = instance;
            return instance;
        });
    }
    return occtInitPromise;
}

function extractEdgeFeatures(posArray, edgeIndices) {
    if (!edgeIndices || edgeIndices.length === 0) return [];

    // Spatial quantization to connect coincident edge vertices (1 micron = 10^-3 mm precision)
    const invTol = 1000;
    const ptToNode = new Map();
    const nodes = [];
    function getNode(idx) {
        const x = posArray[idx * 3];
        const y = posArray[idx * 3 + 1];
        const z = posArray[idx * 3 + 2];
        const k = Math.round(x * invTol) + '_' + Math.round(y * invTol) + '_' + Math.round(z * invTol);
        let nId = ptToNode.get(k);
        if (nId === undefined) {
            nId = nodes.length;
            nodes.push({ id: nId, pt: [x, y, z] });
            ptToNode.set(k, nId);
        }
        return nId;
    }

    const adj = new Map();
    const numEdges = edgeIndices.length / 2;
    for (let i = 0; i < numEdges; i++) {
        const nA = getNode(edgeIndices[i * 2]);
        const nB = getNode(edgeIndices[i * 2 + 1]);
        if (nA === nB) continue;
        if (!adj.has(nA)) adj.set(nA, []);
        if (!adj.has(nB)) adj.set(nB, []);
        if (!adj.get(nA).includes(nB)) adj.get(nA).push(nB);
        if (!adj.get(nB).includes(nA)) adj.get(nB).push(nA);
    }

    const visited = new Set();
    const features = [];

    // Traverse all connected loops and paths
    for (const startNode of adj.keys()) {
        if (visited.has(startNode)) continue;
        const loop = [startNode];
        visited.add(startNode);
        let curr = startNode, prev = -1;
        let isClosed = false;

        while (true) {
            const nbrs = adj.get(curr) || [];
            // Check if loop completes back to startNode
            if (loop.length >= 6 && nbrs.includes(startNode) && prev !== startNode) {
                isClosed = true;
                break;
            }
            let next = nbrs.find(n => n !== prev && !visited.has(n));
            if (next === undefined) break;
            visited.add(next);
            loop.push(next);
            prev = curr;
            curr = next;
        }

        if (loop.length < 2) continue;

        // 1. Check if loop is a 3D circle or circular hole rim
        if (loop.length >= 6) {
            let cx = 0, cy = 0, cz = 0;
            for (let k = 0; k < loop.length; k++) {
                const pt = nodes[loop[k]].pt;
                cx += pt[0]; cy += pt[1]; cz += pt[2];
            }
            cx /= loop.length; cy /= loop.length; cz /= loop.length;

            let minR = Infinity, maxR = -Infinity, sumR = 0;
            for (let k = 0; k < loop.length; k++) {
                const pt = nodes[loop[k]].pt;
                const r = Math.hypot(pt[0] - cx, pt[1] - cy, pt[2] - cz);
                if (r < minR) minR = r;
                if (r > maxR) maxR = r;
                sumR += r;
            }
            const avgR = sumR / loop.length;
            const rVar = (maxR - minR) / avgR;

            // Compute circle normal from cross product of points along circumference
            const pt0 = nodes[loop[0]].pt;
            const pt1 = nodes[loop[Math.floor(loop.length / 3)]].pt;
            const pt2 = nodes[loop[Math.floor(2 * loop.length / 3)]].pt;
            const v1 = [pt1[0] - pt0[0], pt1[1] - pt0[1], pt1[2] - pt0[2]];
            const v2 = [pt2[0] - pt0[0], pt2[1] - pt0[1], pt2[2] - pt0[2]];
            let nx = v1[1] * v2[2] - v1[2] * v2[1];
            let ny = v1[2] * v2[0] - v1[0] * v2[2];
            let nz = v1[0] * v2[1] - v1[1] * v2[0];
            const nLen = Math.hypot(nx, ny, nz);
            if (nLen > 1e-6) { nx /= nLen; ny /= nLen; nz /= nLen; }

            // If radius variation is < 8% and radius > 0.2mm, it's a circle!
            if (avgR > 0.2 && rVar <= 0.08) {
                const pts = new Float32Array(loop.length * 3);
                for (let k = 0; k < loop.length; k++) {
                    const pt = nodes[loop[k]].pt;
                    pts[k * 3] = pt[0];
                    pts[k * 3 + 1] = pt[1];
                    pts[k * 3 + 2] = pt[2];
                }
                features.push({
                    type: 'circle',
                    radius: avgR,
                    diameter: avgR * 2,
                    center: [cx, cy, cz],
                    normal: [nx, ny, nz],
                    isClosed: isClosed,
                    points: pts
                });
                continue;
            }
        }

        // 2. Decompose into straight edges
        let segStart = 0;
        const ptA0 = nodes[loop[0]].pt;
        const ptB0 = nodes[loop[1]].pt;
        let dx0 = ptB0[0] - ptA0[0];
        let dy0 = ptB0[1] - ptA0[1];
        let dz0 = ptB0[2] - ptA0[2];
        let len0 = Math.hypot(dx0, dy0, dz0);
        let dirX = dx0 / (len0 || 1), dirY = dy0 / (len0 || 1), dirZ = dz0 / (len0 || 1);

        for (let i = 1; i < loop.length; i++) {
            const a = loop[i], b = loop[(i + 1) % loop.length];
            const ptA = nodes[a].pt;
            const ptB = nodes[b].pt;
            const dx = ptB[0] - ptA[0];
            const dy = ptB[1] - ptA[1];
            const dz = ptB[2] - ptA[2];
            const len = Math.hypot(dx, dy, dz);
            const ndx = dx / (len || 1), ndy = dy / (len || 1), ndz = dz / (len || 1);
            const dot = dirX * ndx + dirY * ndy + dirZ * ndz;

            const isLast = (i === loop.length - 1);
            if (dot < 0.985 || isLast) {
                const pStartV = loop[segStart];
                const pEndV = loop[isLast && dot >= 0.985 ? (i + 1) % loop.length : i];
                const p1 = nodes[pStartV].pt;
                const p2 = nodes[pEndV].pt;
                const totalLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);

                if (totalLen > 0.4) {
                    const count = (i - segStart + 1);
                    const pts = new Float32Array(count * 3);
                    for (let c = 0; c < count; c++) {
                        const pt = nodes[loop[segStart + c]].pt;
                        pts[c * 3] = pt[0];
                        pts[c * 3 + 1] = pt[1];
                        pts[c * 3 + 2] = pt[2];
                    }
                    features.push({
                        type: 'line',
                        length: totalLen,
                        start: p1,
                        end: p2,
                        points: pts
                    });
                }
                segStart = i;
                dirX = ndx; dirY = ndy; dirZ = ndz;
            }
        }
    }

    return features;
}

function detectFaceCylinder(posArray, normArray, idxArray, first, last) {
    if (!normArray || last - first < 2) return null;
    const faceVerts = [];
    const faceNorms = [];
    const vSet = new Set();
    for (let t = first; t <= last; t++) {
        for (let k = 0; k < 3; k++) {
            const vIdx = idxArray[t * 3 + k];
            if (!vSet.has(vIdx)) {
                vSet.add(vIdx);
                faceVerts.push([posArray[vIdx * 3], posArray[vIdx * 3 + 1], posArray[vIdx * 3 + 2]]);
                faceNorms.push([normArray[vIdx * 3], normArray[vIdx * 3 + 1], normArray[vIdx * 3 + 2]]);
            }
        }
    }
    if (faceVerts.length < 6) return null;

    // 1. Determine cylinder axis A
    let axis = null;
    let maxCrossLen = 0;
    const lenF = faceNorms.length;
    for (let i = 0; i < lenF; i += 2) {
        for (let j = i + 1; j < lenF; j += 2) {
            const n1 = faceNorms[i], n2 = faceNorms[j];
            const cx = n1[1] * n2[2] - n1[2] * n2[1];
            const cy = n1[2] * n2[0] - n1[0] * n2[2];
            const cz = n1[0] * n2[1] - n1[1] * n2[0];
            const clen = Math.hypot(cx, cy, cz);
            if (clen > maxCrossLen) {
                maxCrossLen = clen;
                axis = [cx / clen, cy / clen, cz / clen];
            }
        }
    }
    if (!axis || maxCrossLen < 0.25) return null;

    // Verify normals are perpendicular to axis
    let perpCount = 0;
    for (let i = 0; i < lenF; i++) {
        const dot = faceNorms[i][0] * axis[0] + faceNorms[i][1] * axis[1] + faceNorms[i][2] * axis[2];
        if (Math.abs(dot) < 0.12) perpCount++;
    }
    if (perpCount / lenF < 0.85) return null;

    // 2. Coordinate frame (u, v) orthogonal to axis
    let ux, uy, uz;
    if (Math.abs(axis[0]) < 0.8) {
        ux = 0; uy = -axis[2]; uz = axis[1];
    } else {
        ux = axis[2]; uy = 0; uz = -axis[0];
    }
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen; uy /= uLen; uz /= uLen;

    const vx = axis[1] * uz - axis[2] * uy;
    const vy = axis[2] * ux - axis[0] * uz;
    const vz = axis[0] * uy - axis[1] * ux;

    // Intersect 2D normals to find center (cu, cv) and radius
    let bestC = null;
    let bestR = 0;
    const vCount = faceVerts.length;
    for (let i = 0; i < vCount; i += 3) {
        for (let j = i + 1; j < vCount; j += 3) {
            const p1 = faceVerts[i], n1 = faceNorms[i];
            const p2 = faceVerts[j], n2 = faceNorms[j];

            const p1x = p1[0] * ux + p1[1] * uy + p1[2] * uz;
            const p1y = p1[0] * vx + p1[1] * vy + p1[2] * vz;
            const n1x = n1[0] * ux + n1[1] * uy + n1[2] * uz;
            const n1y = n1[0] * vx + n1[1] * vy + n1[2] * vz;

            const p2x = p2[0] * ux + p2[1] * uy + p2[2] * uz;
            const p2y = p2[0] * vx + p2[1] * vy + p2[2] * vz;
            const n2x = n2[0] * ux + n2[1] * uy + n2[2] * uz;
            const n2y = n2[0] * vx + n2[1] * vy + n2[2] * vz;

            const det = n1x * (-n2y) - n1y * (-n2x);
            if (Math.abs(det) < 0.2) continue;

            const dx = p2x - p1x;
            const dy = p2y - p1y;
            const t1 = (dx * (-n2y) - dy * (-n2x)) / det;
            const t2 = (n1x * dy - n1y * dx) / det;

            if (t1 * t2 > 0) {
                const r = Math.abs(t1);
                if (r > 0.2 && r < 5000) {
                    bestC = { u: p1x + t1 * n1x, v: p1y + t1 * n1y, isHole: t1 > 0 };
                    bestR = r;
                    break;
                }
            }
        }
        if (bestC) break;
    }
    if (!bestC || bestR <= 0.2) return null;

    let validCount = 0;
    let minH = Infinity, maxH = -Infinity;
    for (let i = 0; i < vCount; i++) {
        const p = faceVerts[i];
        const px = p[0] * ux + p[1] * uy + p[2] * uz;
        const py = p[0] * vx + p[1] * vy + p[2] * vz;
        const ph = p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2];
        const dist = Math.hypot(px - bestC.u, py - bestC.v);
        if (Math.abs(dist - bestR) <= 0.08 * bestR + 0.1) validCount++;
        if (ph < minH) minH = ph;
        if (ph > maxH) maxH = ph;
    }
    if (validCount / vCount < 0.8) return null;

    const midH = (minH + maxH) * 0.5;
    const cx = ux * bestC.u + vx * bestC.v + axis[0] * midH;
    const cy = uy * bestC.u + vy * bestC.v + axis[1] * midH;
    const cz = uz * bestC.u + vz * bestC.v + axis[2] * midH;
    const depth = maxH - minH;

    return {
        isHole: bestC.isHole,
        radius: bestR,
        diameter: bestR * 2,
        depth: depth,
        center: [cx, cy, cz],
        axis: axis
    };
}

self.onmessage = async function (e) {
    const data = e.data;
    if (!data) return;

    if (data.type === 'INIT') {
        try {
            await getOcct();
            self.postMessage({ type: 'READY' });
        } catch (err) {
            self.postMessage({ type: 'ERROR', message: 'Failed to initialize OpenCASCADE WASM: ' + (err.message || err) });
        }
        return;
    }

    if (data.type === 'PARSE') {
        const startTime = Date.now();
        try {
            const instance = await getOcct();
            const arrayBuffer = data.buffer;
            if (!arrayBuffer) {
                throw new Error('No ArrayBuffer provided for parsing');
            }

            const uint8Data = new Uint8Array(arrayBuffer);

            // Use null by default for optimal Open CASCADE internal fast-path
            let params = null;
            if (data.params && typeof data.params === 'object') {
                params = data.params;
            }

            const fileName = data.fileName || '';
            const ext = fileName.toLowerCase().split('.').pop();

            let format = 'STEP';
            if (ext === 'iges' || ext === 'igs') {
                format = 'IGES';
            } else if (ext === 'brep') {
                format = 'BREP';
            } else {
                // Header sniff fallback
                const snippet = String.fromCharCode.apply(null, uint8Data.subarray(0, Math.min(uint8Data.length, 128)));
                if (snippet.indexOf('ISO-10303-21') >= 0) {
                    format = 'STEP';
                } else if (snippet.indexOf('DBRep_DrawableShape') >= 0 || snippet.indexOf('CASCADE Topology') >= 0) {
                    format = 'BREP';
                } else if (uint8Data.length >= 73 && (snippet.charAt(72) === 'S' || snippet.charAt(72) === 'G')) {
                    format = 'IGES';
                }
            }

            // Perform CAD B-Rep tessellation in WebAssembly
            let result = null;
            if (format === 'IGES') {
                result = instance.ReadIgesFile(uint8Data, params);
            } else if (format === 'BREP') {
                result = instance.ReadBrepFile(uint8Data, params);
            } else {
                result = instance.ReadStepFile(uint8Data, params);
            }

            if (!result || !result.success) {
                throw new Error('Open CASCADE failed to parse ' + format + ' file geometry.');
            }

            const meshes = [];

            if (result.meshes && result.meshes.length > 0) {
                for (let i = 0; i < result.meshes.length; i++) {
                    const m = result.meshes[i];
                    if (!m.attributes || !m.attributes.position) continue;

                    // Safely copy out of WebAssembly heap into standalone typed arrays
                    const posArray = new Float32Array(m.attributes.position.array);
                    const normArray = (m.attributes.normal && m.attributes.normal.array)
                        ? new Float32Array(m.attributes.normal.array)
                        : null;
                    const idxArray = (m.index && m.index.array)
                        ? new Uint32Array(m.index.array)
                        : null;

                    // Extract True B-Rep Topological Feature Edges (matching SolidWorks HLR display)
                    let edgeIndices = null;
                    let edgeFeatures = [];
                    if (m.brep_faces && m.brep_faces.length > 0 && idxArray) {
                        const numTriangles = idxArray.length / 3;
                        const triToFace = new Int32Array(numTriangles);
                        triToFace.fill(-1);
                        for (let f = 0; f < m.brep_faces.length; f++) {
                            const face = m.brep_faces[f];
                            for (let t = face.first; t <= face.last && t < numTriangles; t++) {
                                triToFace[t] = f;
                            }
                        }

                        // Precalculate normalized geometric triangle normals and body signed volume
                        let bodyVol = 0;
                        const triNormals = new Float32Array(numTriangles * 3);
                        for (let t = 0; t < numTriangles; t++) {
                            const i0 = idxArray[t * 3] * 3;
                            const i1 = idxArray[t * 3 + 1] * 3;
                            const i2 = idxArray[t * 3 + 2] * 3;
                            const ax = posArray[i0], ay = posArray[i0 + 1], az = posArray[i0 + 2];
                            const bx = posArray[i1], by = posArray[i1 + 1], bz = posArray[i1 + 2];
                            const cx = posArray[i2], cy = posArray[i2 + 1], cz = posArray[i2 + 2];
                            bodyVol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6.0;
                            const abx = bx - ax, aby = by - ay, abz = bz - az;
                            const acx = cx - ax, acy = cy - ay, acz = cz - az;
                            let nx = aby * acz - abz * acy;
                            let ny = abz * acx - abx * acz;
                            let nz = abx * acy - aby * acx;
                            const len = Math.hypot(nx, ny, nz);
                            if (len > 1e-7) {
                                triNormals[t * 3] = nx / len;
                                triNormals[t * 3 + 1] = ny / len;
                                triNormals[t * 3 + 2] = nz / len;
                            }
                        }

                        // Spatial vertex quantization to unify coincident seam vertices across face boundaries (0.1 micron precision)
                        const numVerts = posArray.length / 3;
                        const vertToSpatial = new Int32Array(numVerts);
                        const pDict = new Map();
                        let sCount = 0;
                        const invTol = 10000; // 0.1 micron precision (10^-4 mm)
                        for (let v = 0; v < numVerts; v++) {
                            const vx = Math.round(posArray[v * 3] * invTol);
                            const vy = Math.round(posArray[v * 3 + 1] * invTol);
                            const vz = Math.round(posArray[v * 3 + 2] * invTol);
                            const k = vx + '_' + vy + '_' + vz;
                            let sId = pDict.get(k);
                            if (sId === undefined) {
                                sId = sCount++;
                                pDict.set(k, sId);
                            }
                            vertToSpatial[v] = sId;
                        }

                        const edgeMap = new Map();
                        for (let t = 0; t < numTriangles; t++) {
                            const i0 = idxArray[t * 3];
                            const i1 = idxArray[t * 3 + 1];
                            const i2 = idxArray[t * 3 + 2];
                            const s0 = vertToSpatial[i0];
                            const s1 = vertToSpatial[i1];
                            const s2 = vertToSpatial[i2];
                            const fId = triToFace[t];
                            const pairs = [[i0, i1, s0, s1], [i1, i2, s1, s2], [i2, i0, s2, s0]];
                            for (let p = 0; p < 3; p++) {
                                const origA = pairs[p][0];
                                const origB = pairs[p][1];
                                const sa = pairs[p][2];
                                const sb = pairs[p][3];
                                if (sa === sb) continue; // degenerate edge
                                const minS = sa < sb ? sa : sb;
                                const maxS = sa < sb ? sb : sa;
                                const k = minS + '_' + maxS;
                                let item = edgeMap.get(k);
                                if (!item) {
                                    edgeMap.set(k, { a: origA, b: origB, f1: fId, f2: -1, t1: t, t2: -1, count: 1 });
                                } else {
                                    if (item.f2 === -1 && fId !== item.f1) {
                                        item.f2 = fId;
                                        item.t2 = t;
                                    } else if (item.t2 === -1) {
                                        item.t2 = t;
                                    }
                                    item.count++;
                                }
                            }
                        }

                        const lines = [];
                        const isClosedSolid = Math.abs(bodyVol) >= 1e-4;
                        for (const [, e] of edgeMap) {
                            // 1. Sharp Crease between two distinct B-Rep faces (both faces valid and f1 !== f2)
                            if (e.f1 >= 0 && e.f2 >= 0 && e.f1 !== e.f2) {
                                if (e.t1 >= 0 && e.t2 >= 0) {
                                    const n1x = triNormals[e.t1 * 3], n1y = triNormals[e.t1 * 3 + 1], n1z = triNormals[e.t1 * 3 + 2];
                                    const n2x = triNormals[e.t2 * 3], n2y = triNormals[e.t2 * 3 + 1], n2z = triNormals[e.t2 * 3 + 2];
                                    const dot = n1x * n2x + n1y * n2y + n1z * n2z;
                                    // SolidWorks "Tangent Edges Removed" mode:
                                    // Suppress tangent blends, fillets, and smooth curvature transitions (dot >= 0.88 / angle <= 28 deg).
                                    // Keep sharp mechanical creases (steps, holes, cuts, chamfers where dot < 0.88).
                                    if (dot < 0.88) {
                                        lines.push(e.a, e.b);
                                    }
                                }
                            }
                            // 2. Open boundary edge of an open sheet / surface body (only on non-solid open shells)
                            else if (e.count === 1 && !isClosedSolid) {
                                lines.push(e.a, e.b);
                            }
                            // Note: on closed solids, all internal triangle edges and periodic seams have f1 === f2 or f2 === -1 and are suppressed.
                        }
                        edgeIndices = new Uint32Array(lines);
                        edgeFeatures = extractEdgeFeatures(posArray, edgeIndices);
                    }

                    // Extract per-body metrics: surface area, signed volume, bounding box, and face details
                    let bodyAreaMm2 = 0;
                    let bodyVolMm3 = 0;
                    let minX = Infinity, minY = Infinity, minZ = Infinity;
                    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

                    const numVerts = posArray.length / 3;
                    for (let v = 0; v < numVerts; v++) {
                        const vx = posArray[v * 3];
                        const vy = posArray[v * 3 + 1];
                        const vz = posArray[v * 3 + 2];
                        if (vx < minX) minX = vx;
                        if (vx > maxX) maxX = vx;
                        if (vy < minY) minY = vy;
                        if (vy > maxY) maxY = vy;
                        if (vz < minZ) minZ = vz;
                        if (vz > maxZ) maxZ = vz;
                    }

                    const brepFaceSummaries = [];
                    if (idxArray) {
                        const numTriangles = idxArray.length / 3;
                        for (let t = 0; t < numTriangles; t++) {
                            const i0 = idxArray[t * 3] * 3;
                            const i1 = idxArray[t * 3 + 1] * 3;
                            const i2 = idxArray[t * 3 + 2] * 3;

                            const ax = posArray[i0], ay = posArray[i0 + 1], az = posArray[i0 + 2];
                            const bx = posArray[i1], by = posArray[i1 + 1], bz = posArray[i1 + 2];
                            const cx = posArray[i2], cy = posArray[i2 + 1], cz = posArray[i2 + 2];

                            const abx = bx - ax, aby = by - ay, abz = bz - az;
                            const acx = cx - ax, acy = cy - ay, acz = cz - az;
                            const crossX = aby * acz - abz * acy;
                            const crossY = abz * acx - abx * acz;
                            const crossZ = abx * acy - aby * acx;
                            bodyAreaMm2 += 0.5 * Math.hypot(crossX, crossY, crossZ);

                            bodyVolMm3 += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6.0;
                        }

                        // Summarize individual B-Rep faces if available
                        if (m.brep_faces && m.brep_faces.length > 0) {
                            for (let f = 0; f < m.brep_faces.length; f++) {
                                const bf = m.brep_faces[f];
                                let fArea = 0;
                                for (let t = bf.first; t <= bf.last && t < numTriangles; t++) {
                                    const i0 = idxArray[t * 3] * 3;
                                    const i1 = idxArray[t * 3 + 1] * 3;
                                    const i2 = idxArray[t * 3 + 2] * 3;
                                    const abx = posArray[i1] - posArray[i0];
                                    const aby = posArray[i1 + 1] - posArray[i0 + 1];
                                    const abz = posArray[i1 + 2] - posArray[i0 + 2];
                                    const acx = posArray[i2] - posArray[i0];
                                    const acy = posArray[i2 + 1] - posArray[i0 + 1];
                                    const acz = posArray[i2 + 2] - posArray[i0 + 2];
                                    fArea += 0.5 * Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
                                }
                                const cylData = detectFaceCylinder(posArray, normArray, idxArray, bf.first, bf.last);
                                brepFaceSummaries.push({
                                    id: f + 1,
                                    first: bf.first,
                                    last: bf.last,
                                    triangleCount: Math.max(0, bf.last - bf.first + 1),
                                    areaMm2: fArea,
                                    surfaceType: cylData ? 'cylinder' : 'plane',
                                    cylinder: cylData
                                });
                            }
                        }
                    }

                    // Auto-assigned palette colors for multi-body discrimination (Studio Graphite palette)
                    const autoPalette = [
                        [0.627, 0.658, 0.706], // Machined Steel #a0a8b4
                        [0.290, 0.545, 0.749], // Titanium Cyan #4a8bbf
                        [0.761, 0.608, 0.408], // Engineering Bronze #c29b68
                        [0.353, 0.549, 0.463], // Anodized Sage #5a8c76
                        [0.549, 0.408, 0.659], // Manganese Violet #8c68a8
                        [0.659, 0.322, 0.322], // Oxide Red #a85252
                        [0.850, 0.650, 0.250]  // Industrial Brass #d9a640
                    ];
                    const defaultColor = autoPalette[i % autoPalette.length];

                    meshes.push({
                        id: i,
                        name: m.name || ('Solid ' + (i + 1)),
                        color: m.color || defaultColor,
                        hasOriginalColor: !!m.color,
                        position: posArray,
                        normal: normArray,
                        index: idxArray,
                        edgeIndices: edgeIndices,
                        edgeFeatures: edgeFeatures,
                        brepFaces: brepFaceSummaries,
                        volumeMm3: Math.abs(bodyVolMm3),
                        areaMm2: bodyAreaMm2,
                        bbox: {
                            min: [minX, minY, minZ],
                            max: [maxX, maxY, maxZ],
                            size: [maxX - minX, maxY - minY, maxZ - minZ]
                        }
                    });
                }
            }

            const elapsedMs = Date.now() - startTime;

            self.postMessage({
                type: 'PARSE_SUCCESS',
                format: format,
                fileName: data.fileName,
                meshes: meshes,
                meshCount: meshes.length,
                isMultiBody: meshes.length > 1,
                elapsedMs: elapsedMs,
                cacheKey: data.cacheKey,
                bufferSize: data.bufferSize
            });

        } catch (err) {
            self.postMessage({
                type: 'PARSE_ERROR',
                message: err.message || String(err)
            });
        }
    }
};
