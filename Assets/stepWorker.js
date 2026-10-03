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

    const adj = new Map();
    const numEdges = edgeIndices.length / 2;
    for (let i = 0; i < numEdges; i++) {
        const a = edgeIndices[i * 2];
        const b = edgeIndices[i * 2 + 1];
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push(b);
        adj.get(b).push(a);
    }

    const visited = new Set();
    const features = [];

    // Traverse all connected loops and paths
    for (const startV of adj.keys()) {
        if (visited.has(startV)) continue;
        const loop = [startV];
        visited.add(startV);
        let curr = startV, prev = -1;
        while (true) {
            const nbrs = adj.get(curr) || [];
            let next = nbrs.find(n => n !== prev && !visited.has(n));
            if (next === undefined) break;
            visited.add(next);
            loop.push(next);
            prev = curr;
            curr = next;
        }

        if (loop.length < 2) continue;

        // 1. Check if loop is a circle or circular hole
        if (loop.length >= 8) {
            let cx = 0, cy = 0, cz = 0;
            for (let k = 0; k < loop.length; k++) {
                const idx = loop[k] * 3;
                cx += posArray[idx];
                cy += posArray[idx + 1];
                cz += posArray[idx + 2];
            }
            cx /= loop.length; cy /= loop.length; cz /= loop.length;

            let minR = Infinity, maxR = -Infinity, sumR = 0;
            for (let k = 0; k < loop.length; k++) {
                const idx = loop[k] * 3;
                const dist = Math.hypot(posArray[idx] - cx, posArray[idx + 1] - cy, posArray[idx + 2] - cz);
                if (dist < minR) minR = dist;
                if (dist > maxR) maxR = dist;
                sumR += dist;
            }
            const avgR = sumR / loop.length;

            // If radius variation is < 6% and average radius > 0.2mm, it's a circle!
            if (avgR > 0.2 && (maxR - minR) <= (0.06 * avgR)) {
                const pts = new Float32Array(loop.length * 3);
                for (let k = 0; k < loop.length; k++) {
                    const idx = loop[k] * 3;
                    pts[k * 3] = posArray[idx];
                    pts[k * 3 + 1] = posArray[idx + 1];
                    pts[k * 3 + 2] = posArray[idx + 2];
                }
                features.push({
                    type: 'circle',
                    radius: avgR,
                    diameter: avgR * 2,
                    center: [cx, cy, cz],
                    points: pts
                });
                continue;
            }
        }

        // 2. Decompose into straight edges
        let segStart = 0;
        let v0 = loop[0], v1 = loop[1];
        let dx0 = posArray[v1 * 3] - posArray[v0 * 3];
        let dy0 = posArray[v1 * 3 + 1] - posArray[v0 * 3 + 1];
        let dz0 = posArray[v1 * 3 + 2] - posArray[v0 * 3 + 2];
        let len0 = Math.hypot(dx0, dy0, dz0);
        let dirX = dx0 / (len0 || 1), dirY = dy0 / (len0 || 1), dirZ = dz0 / (len0 || 1);

        for (let i = 1; i < loop.length; i++) {
            const a = loop[i], b = loop[(i + 1) % loop.length];
            const dx = posArray[b * 3] - posArray[a * 3];
            const dy = posArray[b * 3 + 1] - posArray[a * 3 + 1];
            const dz = posArray[b * 3 + 2] - posArray[a * 3 + 2];
            const len = Math.hypot(dx, dy, dz);
            const ndx = dx / (len || 1), ndy = dy / (len || 1), ndz = dz / (len || 1);
            const dot = dirX * ndx + dirY * ndy + dirZ * ndz;

            const isLast = (i === loop.length - 1);
            if (dot < 0.985 || isLast) {
                const pStartV = loop[segStart];
                const pEndV = loop[isLast && dot >= 0.985 ? (i + 1) % loop.length : i];
                const p1 = [posArray[pStartV * 3], posArray[pStartV * 3 + 1], posArray[pStartV * 3 + 2]];
                const p2 = [posArray[pEndV * 3], posArray[pEndV * 3 + 1], posArray[pEndV * 3 + 2]];
                const totalLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);

                if (totalLen > 0.4) {
                    const count = (i - segStart + 1);
                    const pts = new Float32Array(count * 3);
                    for (let c = 0; c < count; c++) {
                        const vIdx = loop[segStart + c] * 3;
                        pts[c * 3] = posArray[vIdx];
                        pts[c * 3 + 1] = posArray[vIdx + 1];
                        pts[c * 3 + 2] = posArray[vIdx + 2];
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

            // Perform CAD B-Rep tessellation in WebAssembly
            const result = instance.ReadStepFile(uint8Data, params);

            if (!result || !result.success) {
                throw new Error('Open CASCADE failed to parse STEP file geometry.');
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
                                brepFaceSummaries.push({
                                    id: f + 1,
                                    first: bf.first,
                                    last: bf.last,
                                    triangleCount: Math.max(0, bf.last - bf.first + 1),
                                    areaMm2: fArea
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
