// Web Worker for Non-blocking STL Parsing & Mesh Feature Detection
/* global importScripts, StlLoader, MeshFeatureDetector */

importScripts('js/stlLoader.js', 'js/meshFeatureDetector.js');

self.onmessage = function (e) {
  const msg = e.data;
  if (!msg || msg.type !== 'PARSE_STL') return;

  const { buffer, fileName, loadId } = msg;

  try {
    const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const t0 = now();

    const result = StlLoader.parse(buffer, fileName);
    result.loadId = loadId;

    const transferSet = new Set();
    const addTransferable = (typedArray) => {
      if (typedArray && typedArray.buffer && typeof typedArray.buffer.byteLength === 'number') {
        transferSet.add(typedArray.buffer);
      }
    };

    if (result && Array.isArray(result.meshes)) {
      const hasDetector = typeof MeshFeatureDetector !== 'undefined' && typeof MeshFeatureDetector.detectFeatures === 'function';
      for (let i = 0; i < result.meshes.length; i++) {
        const m = result.meshes[i];
        if (hasDetector) {
          const features = MeshFeatureDetector.detectFeatures(m);
          if (features) {
            m.edgeFeatures = features.edgeFeatures || [];
            m.brepFaces = features.brepFaces || [];
            m.edgeIndices = features.edgeIndices || null;
          }
          m._featuresDetected = true;
        }

        addTransferable(m.position);
        addTransferable(m.normal);
        addTransferable(m.index);
        addTransferable(m.edgeIndices);

        if (Array.isArray(m.edgeFeatures)) {
          for (let j = 0; j < m.edgeFeatures.length; j++) {
            const ef = m.edgeFeatures[j];
            if (ef) addTransferable(ef.points);
          }
        }

        if (Array.isArray(m.brepFaces)) {
          for (let j = 0; j < m.brepFaces.length; j++) {
            const bf = m.brepFaces[j];
            if (bf) addTransferable(bf.triangles);
          }
        }
      }
    }

    result.elapsedMs = Math.round(now() - t0);

    const transferables = Array.from(transferSet);
    self.postMessage({
      type: 'STL_PARSE_SUCCESS',
      loadId: loadId,
      result: result
    }, transferables);
  } catch (err) {
    self.postMessage({
      type: 'STL_PARSE_ERROR',
      loadId: loadId,
      message: (err && err.message) ? err.message : String(err)
    });
  }
};
