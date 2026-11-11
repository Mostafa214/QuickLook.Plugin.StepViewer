const path = require('path');
const THREE = require(path.join(process.cwd(), 'Assets/three.min.js'));

function extractViewEdges(mesh, viewDir) {
  const geom = mesh.geometry;
  if (!geom || !geom.attributes || !geom.attributes.position) return [];

  const matrixWorld = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);
  const posAttr = geom.attributes.position;
  const index = geom.index;

  // We want to group shared edges across triangles based on vertex world coordinates
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const nC = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  const edgeMap = new Map(); // key -> { v0, v1, faceNormals: [], frontFacing: [] }

  function getVertexWorld(idx, target) {
    target.set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
    target.applyMatrix4(matrixWorld);
  }

  function hashCoord(v) {
    return `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)},${Math.round(v.z * 1000)}`;
  }

  function addEdge(v0, v1, fNormal, isFront) {
    const h0 = hashCoord(v0);
    const h1 = hashCoord(v1);
    if (h0 === h1) return; // Degenerate edge
    const key = h0 < h1 ? `${h0}|${h1}` : `${h1}|${h0}`;

    let entry = edgeMap.get(key);
    if (!entry) {
      entry = {
        v0: v0.clone(),
        v1: v1.clone(),
        normals: [fNormal.clone()],
        front: [isFront]
      };
      edgeMap.set(key, entry);
    } else {
      entry.normals.push(fNormal.clone());
      entry.front.push(isFront);
    }
  }

  const triCount = index ? index.count / 3 : posAttr.count / 3;

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    getVertexWorld(i0, pA);
    getVertexWorld(i1, pB);
    getVertexWorld(i2, pC);

    // Compute face normal in world space
    cb.subVectors(pC, pB);
    ab.subVectors(pA, pB);
    faceNormal.crossVectors(cb, ab);
    if (faceNormal.lengthSq() < 1e-10) continue; // Degenerate triangle
    faceNormal.normalize();

    // Dot product with viewDir
    // If viewDir is direction from object to eye: dot > 0 is front facing
    const dot = faceNormal.dot(viewDir);
    const isFront = dot > 0;

    addEdge(pA, pB, faceNormal, isFront);
    addEdge(pB, pC, faceNormal, isFront);
    addEdge(pC, pA, faceNormal, isFront);
  }

  const resultEdges = [];
  const CREASE_THRESHOLD = Math.cos(25 * (Math.PI / 180)); // ~0.9063

  for (const entry of edgeMap.values()) {
    // Case 1: Open boundary edge (only 1 triangle) -> ALWAYS an edge
    if (entry.normals.length === 1) {
      resultEdges.push([entry.v0, entry.v1]);
      continue;
    }

    // Case 2: Crease edge (sharp feature where dihedral angle > 25 deg)
    let isCrease = false;
    for (let i = 0; i < entry.normals.length - 1; i++) {
      for (let j = i + 1; j < entry.normals.length; j++) {
        const dotN = entry.normals[i].dot(entry.normals[j]);
        if (dotN < CREASE_THRESHOLD) {
          isCrease = true;
          break;
        }
      }
      if (isCrease) break;
    }

    if (isCrease) {
      resultEdges.push([entry.v0, entry.v1]);
      continue;
    }

    // Case 3: Silhouette edge!
    // One adjacent triangle is front-facing (dot > 0), another is back-facing (dot <= 0)
    let hasFront = false;
    let hasBack = false;
    for (const f of entry.front) {
      if (f) hasFront = true;
      else hasBack = true;
    }

    if (hasFront && hasBack) {
      resultEdges.push([entry.v0, entry.v1]);
    }
  }

  return resultEdges;
}

// Test with cylinder
const cyl = new THREE.CylinderGeometry(10, 10, 20, 32);
const mesh = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial());
mesh.updateMatrixWorld(true);

console.log('Testing Front View viewDir (0, 0, 1):');
const frontEdges = extractViewEdges(mesh, new THREE.Vector3(0, 0, 1));
console.log('Front View Edge count:', frontEdges.length);

console.log('Testing Top View viewDir (0, 1, 0):');
const topEdges = extractViewEdges(mesh, new THREE.Vector3(0, 1, 0));
console.log('Top View Edge count:', topEdges.length);

console.log('Testing Isometric View viewDir (1, 1, 1).normalize():');
const isoEdges = extractViewEdges(mesh, new THREE.Vector3(1, 1, 1).normalize());
console.log('Iso View Edge count:', isoEdges.length);
