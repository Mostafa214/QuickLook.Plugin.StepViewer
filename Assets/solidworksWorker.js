// Web Worker for Non-blocking SolidWorks (.SLDPRT / .SLDASM) Parsing & Mesh Feature Detection
/* global importScripts, SolidWorksLoader, MeshFeatureDetector, fetch */

importScripts('js/vendor/fflate.min.js', 'js/solidworksLoader.js', 'js/meshFeatureDetector.js');

self.onmessage = async function (e) {
  const msg = e.data;
  if (!msg || msg.type !== 'PARSE_SOLIDWORKS') return;

  const { buffer, fileName, loadId } = msg;

  try {
    const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const t0 = now();

    const siblingResolver = (typeof fetch === 'function')
      ? async (sibName) => {
          try {
            const res = await fetch('https://cad-stream.local/cad-sibling?name=' + encodeURIComponent(sibName));
            if (!res || !res.ok) return null;
            return await res.arrayBuffer();
          } catch (err) {
            return null;
          }
        }
      : null;

    const result = await SolidWorksLoader.parse(buffer, fileName, siblingResolver);
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
        if (hasDetector && m.position && m.position.length > 0) {
          const existingBrepFaces = m.brepFaces;
          const features = MeshFeatureDetector.detectFeatures(m);
          if (features) {
            m.edgeFeatures = features.edgeFeatures || [];
            m.edgeIndices = features.edgeIndices || null;
            if (existingBrepFaces && existingBrepFaces.length > 0 && existingBrepFaces.some(bf => bf && bf.color)) {
              m.brepFaces = existingBrepFaces;
            } else {
              m.brepFaces = features.brepFaces || [];
            }
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
      type: 'SOLIDWORKS_PARSE_SUCCESS',
      loadId: loadId,
      result: result
    }, transferables);
  } catch (err) {
    self.postMessage({
      type: 'SOLIDWORKS_PARSE_ERROR',
      loadId: loadId,
      message: (err && err.message) ? err.message : String(err)
    });
  }
};
