/**
 * 3D Model Format Conversion Exporter (Phase 4)
 * Exports the active Three.js CAD group to Binary STL (.stl), Wavefront OBJ (.obj),
 * or Binary glTF 2.0 (.glb) and dispatches over WebView2 IPC (or browser download).
 */
(function (rootScope) {
  'use strict';

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    const chunkSize = 0x8000;
    const chunks = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
    }
    return btoa(chunks.join(''));
  }

  function textToBase64(text) {
    if (typeof TextEncoder !== 'undefined') {
      return arrayBufferToBase64(new TextEncoder().encode(text).buffer);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(text, 'utf8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(text)));
  }

  function buildExportGroup(sourceGroup, THREE_REF) {
    const exportGroup = new THREE_REF.Group();
    exportGroup.name = (sourceGroup && sourceGroup.name) || 'CAD_Model';
    if (!sourceGroup) return exportGroup;

    if (typeof sourceGroup.updateMatrixWorld === 'function') {
      sourceGroup.updateMatrixWorld(true);
    }

    const traverseMeshes = (node) => {
      if (node && node.isMesh && node.geometry && node.visible !== false) {
        const geom = node.geometry.clone();
        if (node.matrixWorld) {
          geom.applyMatrix4(node.matrixWorld);
        }
        const cloneMesh = new THREE_REF.Mesh(geom, node.material);
        cloneMesh.name = node.name || 'Body';
        exportGroup.add(cloneMesh);
      }
      if (node && Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i++) {
          traverseMeshes(node.children[i]);
        }
      }
    };

    traverseMeshes(sourceGroup);
    return exportGroup;
  }

  function disposeExportGroup(exportGroup) {
    if (!exportGroup || !Array.isArray(exportGroup.children)) return;
    for (let i = 0; i < exportGroup.children.length; i++) {
      const child = exportGroup.children[i];
      if (child && child.geometry && typeof child.geometry.dispose === 'function') {
        child.geometry.dispose();
      }
    }
  }

  function serializeModel(format, sourceGroup) {
    const fmt = String(format || 'stl').trim().toLowerCase();
    const THREE_REF = rootScope.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    if (!THREE_REF) {
      return Promise.reject(new Error('Three.js runtime is not loaded'));
    }

    const exportGroup = buildExportGroup(sourceGroup, THREE_REF);
    if (exportGroup.children.length === 0) {
      return Promise.reject(new Error('No visible 3D mesh geometry to export'));
    }

    return new Promise((resolve, reject) => {
      try {
        if (fmt === 'stl') {
          if (typeof THREE_REF.STLExporter !== 'function') {
            throw new Error('STLExporter is not loaded');
          }
          const exporter = new THREE_REF.STLExporter();
          const result = exporter.parse(exportGroup, { binary: true });
          const buffer = (result instanceof DataView)
            ? result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
            : (result instanceof ArrayBuffer ? result : new TextEncoder().encode(String(result)).buffer);
          disposeExportGroup(exportGroup);
          resolve({
            format: 'stl',
            mimeType: 'model/stl',
            base64: arrayBufferToBase64(buffer),
            byteLength: buffer.byteLength
          });
          return;
        }

        if (fmt === 'obj') {
          if (typeof THREE_REF.OBJExporter !== 'function') {
            throw new Error('OBJExporter is not loaded');
          }
          const exporter = new THREE_REF.OBJExporter();
          const text = exporter.parse(exportGroup);
          disposeExportGroup(exportGroup);
          const base64 = textToBase64(text);
          resolve({
            format: 'obj',
            mimeType: 'text/plain',
            base64: base64,
            byteLength: text.length
          });
          return;
        }

        if (fmt === 'glb') {
          if (typeof THREE_REF.GLTFExporter !== 'function') {
            throw new Error('GLTFExporter is not loaded');
          }
          const exporter = new THREE_REF.GLTFExporter();
          // Scale mm -> metres on glTF export for Khronos glTF 2.0 compliance
          exportGroup.scale.set(0.001, 0.001, 0.001);
          exportGroup.updateMatrixWorld(true);
          exporter.parse(
            exportGroup,
            (gltfBuffer) => {
              disposeExportGroup(exportGroup);
              const isAb = (gltfBuffer instanceof ArrayBuffer) ||
                (Object.prototype.toString.call(gltfBuffer) === '[object ArrayBuffer]');
              if (!isAb) {
                reject(new Error('GLTFExporter did not return a binary ArrayBuffer'));
                return;
              }
              resolve({
                format: 'glb',
                mimeType: 'model/gltf-binary',
                base64: arrayBufferToBase64(gltfBuffer),
                byteLength: gltfBuffer.byteLength
              });
            },
            { binary: true }
          );
          return;
        }

        disposeExportGroup(exportGroup);
        reject(new Error(`Unsupported export format: ${fmt}`));
      } catch (err) {
        disposeExportGroup(exportGroup);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async function exportCurrentModel(format, baseName, sourceGroup) {
    const fmt = String(format || 'stl').trim().toLowerCase();
    const cleanBase = (baseName ? String(baseName).replace(/\.[^.]+$/, '') : 'CAD_Model') || 'CAD_Model';
    const defaultName = `${cleanBase}.${fmt}`;

    const serialized = await serializeModel(fmt, sourceGroup);
    if (rootScope.chrome && rootScope.chrome.webview && typeof rootScope.chrome.webview.postMessage === 'function') {
      rootScope.chrome.webview.postMessage({
        type: 'EXPORT_MODEL',
        action: 'EXPORT_MODEL',
        format: serialized.format,
        data: `data:${serialized.mimeType};base64,${serialized.base64}`,
        defaultName: defaultName
      });
      return serialized;
    }

    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      const binStr = atob(serialized.base64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: serialized.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    return serialized;
  }

  const api = {
    serializeModel: serializeModel,
    exportCurrentModel: exportCurrentModel
  };

  rootScope.ModelExportEngine = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
