/**
 * Unified 3D Mesh Format Loader (Phase 4)
 * Normalizes 3MF, OBJ, PLY, GLB, and GLTF assets into the QuickLook CAD
 * tessellation schema (position/normal/index, signed volume, surface area, colors).
 */
(function (rootScope) {
  'use strict';

  function computeGeometryMetrics(geometry) {
    const pos = geometry.attributes && geometry.attributes.position;
    if (!pos || pos.count < 3) {
      return { triangles: 0, surfaceAreaMm2: 0, volumeMm3: 0 };
    }

    const index = geometry.index;
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    const arr = pos.array;
    const idxArr = index ? index.array : null;

    let area = 0;
    let signedVol = 0;

    for (let t = 0; t < triCount; t++) {
      const i0 = (idxArr ? idxArr[t * 3] : t * 3) * 3;
      const i1 = (idxArr ? idxArr[t * 3 + 1] : t * 3 + 1) * 3;
      const i2 = (idxArr ? idxArr[t * 3 + 2] : t * 3 + 2) * 3;

      const x0 = arr[i0], y0 = arr[i0 + 1], z0 = arr[i0 + 2];
      const x1 = arr[i1], y1 = arr[i1 + 1], z1 = arr[i1 + 2];
      const x2 = arr[i2], y2 = arr[i2 + 1], z2 = arr[i2 + 2];

      const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
      const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;

      const cx = uy * vz - uz * vy;
      const cy = uz * vx - ux * vz;
      const cz = ux * vy - uy * vx;

      area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      signedVol += (x0 * (y1 * z2 - y2 * z1) +
                    y0 * (z1 * x2 - z2 * x1) +
                    z0 * (x1 * y2 - x2 * y1)) / 6.0;
    }

    return {
      triangles: triCount,
      surfaceAreaMm2: area,
      volumeMm3: Math.abs(signedVol)
    };
  }

  function extractMeshColor(mesh) {
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (mat && mat.color && typeof mat.color.r === 'number') {
      return [mat.color.r, mat.color.g, mat.color.b];
    }
    return [0.72, 0.76, 0.82];
  }

  function normalizeObjectToMeshes(object3d, unitScale, defaultBaseName) {
    const meshes = [];
    if (!object3d) return meshes;

    if (typeof object3d.updateMatrixWorld === 'function') {
      object3d.updateMatrixWorld(true);
    }

    let meshIndex = 0;
    const collect = (node) => {
      if (node && node.isMesh && node.geometry) {
        meshIndex++;
        const geom = node.geometry.clone();
        if (node.matrixWorld) {
          geom.applyMatrix4(node.matrixWorld);
        }
        if (unitScale !== 1 && typeof geom.scale === 'function') {
          geom.scale(unitScale, unitScale, unitScale);
        }
        if (!geom.attributes.normal && typeof geom.computeVertexNormals === 'function') {
          geom.computeVertexNormals();
        }

        const posAttr = geom.attributes.position;
        if (posAttr && posAttr.count >= 3) {
          const normAttr = geom.attributes.normal;
          const idxAttr = geom.index;
          const metrics = computeGeometryMetrics(geom);
          if (metrics.triangles > 0) {
            const posCopy = new Float32Array(posAttr.array);
            const normCopy = normAttr ? new Float32Array(normAttr.array) : null;
            let idxCopy = null;
            if (idxAttr && idxAttr.array) {
              idxCopy = (idxAttr.array instanceof Uint32Array)
                ? new Uint32Array(idxAttr.array)
                : Uint32Array.from(idxAttr.array);
            }

            meshes.push({
              name: (node.name && node.name.trim()) ? node.name.trim() : `${defaultBaseName}_${meshIndex}`,
              color: extractMeshColor(node),
              position: posCopy,
              normal: normCopy,
              index: idxCopy,
              triangles: metrics.triangles,
              surfaceAreaMm2: metrics.surfaceAreaMm2,
              volumeMm3: metrics.volumeMm3,
              isWatertight: metrics.volumeMm3 > 0,
              topologyStatus: 'Mesh Geometry'
            });
          }
        }
        if (typeof geom.dispose === 'function') geom.dispose();
      }

      if (node && Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i++) {
          collect(node.children[i]);
        }
      }
    };

    collect(object3d);
    return meshes;
  }

  function decodeUtf8(buffer) {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(buffer);
    }
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }

  function parse(format, buffer, fileName) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const fmt = String(format || '').toUpperCase();
    const baseName = (fileName ? String(fileName).replace(/\.[^.]+$/, '') : fmt) || 'Mesh';

    return new Promise((resolve, reject) => {
      try {
        const THREE_REF = rootScope.THREE || (typeof THREE !== 'undefined' ? THREE : null);
        if (!THREE_REF) {
          throw new Error('Three.js runtime is not loaded');
        }

        const finalize = (rootObj, unitScale) => {
          const meshes = normalizeObjectToMeshes(rootObj, unitScale, baseName);
          const elapsedMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
          resolve({
            format: fmt,
            fileName: fileName || `${baseName}.${fmt.toLowerCase()}`,
            bufferSize: buffer ? buffer.byteLength : 0,
            elapsedMs: elapsedMs,
            meshCount: meshes.length,
            meshes: meshes
          });
        };

        if (fmt === '3MF') {
          if (typeof THREE_REF.ThreeMFLoader !== 'function') {
            throw new Error('ThreeMFLoader is not loaded');
          }
          const loader = new THREE_REF.ThreeMFLoader();
          const group = loader.parse(buffer);
          finalize(group, 1);
          return;
        }

        if (fmt === 'OBJ') {
          if (typeof THREE_REF.OBJLoader !== 'function') {
            throw new Error('OBJLoader is not loaded');
          }
          const loader = new THREE_REF.OBJLoader();
          const text = decodeUtf8(buffer);
          const group = loader.parse(text);
          finalize(group, 1);
          return;
        }

        if (fmt === 'PLY') {
          if (typeof THREE_REF.PLYLoader !== 'function') {
            throw new Error('PLYLoader is not loaded');
          }
          const loader = new THREE_REF.PLYLoader();
          const geometry = loader.parse(buffer);
          if (geometry && !geometry.attributes.normal) {
            geometry.computeVertexNormals();
          }
          const hasVertexColor = Boolean(geometry && geometry.attributes && geometry.attributes.color);
          const mat = new THREE_REF.MeshStandardMaterial({
            color: 0xb8c2cc,
            vertexColors: hasVertexColor
          });
          const mesh = new THREE_REF.Mesh(geometry, mat);
          mesh.name = baseName;
          finalize(mesh, 1);
          if (typeof mat.dispose === 'function') mat.dispose();
          if (geometry && typeof geometry.dispose === 'function') geometry.dispose();
          return;
        }

        if (fmt === 'GLB' || fmt === 'GLTF') {
          if (typeof THREE_REF.GLTFLoader !== 'function') {
            throw new Error('GLTFLoader is not loaded');
          }
          const loader = new THREE_REF.GLTFLoader();
          const input = (fmt === 'GLTF') ? decodeUtf8(buffer) : buffer;
          loader.parse(
            input,
            '',
            (gltf) => {
              // glTF 2.0 specification units are metres; convert to millimetres for CAD consistency
              const sceneRoot = (gltf && gltf.scene) ? gltf.scene : (gltf && gltf.scenes && gltf.scenes[0]) || null;
              finalize(sceneRoot, 1000);
            },
            (err) => {
              reject(err instanceof Error ? err : new Error(String((err && err.message) || err || 'glTF parse error')));
            }
          );
          return;
        }

        throw new Error(`Unsupported mesh format: ${fmt}`);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  const api = {
    parse: parse,
    normalizeObjectToMeshes: normalizeObjectToMeshes,
    computeGeometryMetrics: computeGeometryMetrics
  };

  rootScope.MeshFormatLoader = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
