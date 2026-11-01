/**
 * Admin Twin: Runtime Diagnostic Telemetry & IndexedDB LRU Cache Controller
 * Real-time performance tracking (Three.js memory, WASM heap, FPS, IndexedDB utilization & 1-click purge)
 */
(function () {
  const DB_NAME = 'QuickLook_StepCache';
  const DB_VERSION = 1;
  const STORE_NAME = 'models';
  const MAX_CACHE_ENTRIES = 60;
  const MAX_CACHE_BYTES = 300 * 1024 * 1024; // 300 MB cap

  let lastFrameTime = performance.now();
  let frameCount = 0;
  let currentFps = 60;
  let telemetryCardEl = null;
  let telemetryInterval = null;

  function trackFps() {
    frameCount++;
    const now = performance.now();
    if (now - lastFrameTime >= 1000) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFrameTime));
      frameCount = 0;
      lastFrameTime = now;
    }
  }

  function openCacheDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (e) {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function () { resolve(null); };
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function getCachedModel(key) {
    try {
      const db = await openCacheDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = function () {
          const result = req.result;
          if (result && result.meshes) {
            updateCacheTimestamp(db, key);
            resolve(result);
          } else {
            resolve(null);
          }
        };
        req.onerror = function () { resolve(null); };
      });
    } catch (e) {
      return null;
    }
  }

  function updateCacheTimestamp(db, key) {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = function () {
        if (req.result) {
          req.result.timestamp = Date.now();
          store.put(req.result);
        }
      };
    } catch (e) {}
  }

  async function saveCachedModel(key, modelData, byteLength) {
    try {
      const db = await openCacheDB();
      if (!db) return;
      await pruneCache(db);

      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        key: key,
        meshes: modelData.meshes,
        meshCount: modelData.meshCount,
        size: byteLength,
        timestamp: Date.now()
      });
    } catch (e) {}
  }

  function pruneCache(db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const req = index.getAll();
        req.onsuccess = function () {
          const items = req.result || [];
          items.sort((a, b) => a.timestamp - b.timestamp);

          let totalBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);

          while (items.length >= MAX_CACHE_ENTRIES || totalBytes > MAX_CACHE_BYTES) {
            const oldest = items.shift();
            if (!oldest) break;
            store.delete(oldest.key);
            totalBytes -= (oldest.size || 0);
          }
          resolve();
        };
        req.onerror = function () { resolve(); };
      } catch (e) {
        resolve();
      }
    });
  }

  function clearAllCache() {
    return new Promise((resolve) => {
      openCacheDB().then((db) => {
        if (!db) { resolve(false); return; }
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.clear();
          req.onsuccess = function () { resolve(true); };
          req.onerror = function () { resolve(false); };
        } catch (e) {
          resolve(false);
        }
      });
    });
  }

  function getCacheStats() {
    return new Promise((resolve) => {
      openCacheDB().then((db) => {
        if (!db) {
          resolve({ count: 0, totalBytes: 0, maxBytes: MAX_CACHE_BYTES, maxEntries: MAX_CACHE_ENTRIES });
          return;
        }
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();
          req.onsuccess = function () {
            const items = req.result || [];
            const totalBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);
            resolve({
              count: items.length,
              totalBytes: totalBytes,
              maxBytes: MAX_CACHE_BYTES,
              maxEntries: MAX_CACHE_ENTRIES
            });
          };
          req.onerror = function () {
            resolve({ count: 0, totalBytes: 0, maxBytes: MAX_CACHE_BYTES, maxEntries: MAX_CACHE_ENTRIES });
          };
        } catch (e) {
          resolve({ count: 0, totalBytes: 0, maxBytes: MAX_CACHE_BYTES, maxEntries: MAX_CACHE_ENTRIES });
        }
      });
    });
  }

  function collectTelemetry(renderer) {
    trackFps();
    const mem = renderer ? renderer.info.memory : { geometries: 0, textures: 0 };
    const render = renderer ? renderer.info.render : { calls: 0, triangles: 0, points: 0, lines: 0 };
    const jsHeap = (window.performance && performance.memory)
      ? Math.round(performance.memory.usedJSHeapSize / (1024 * 1024))
      : 0;

    let wasmHeap = 0;
    if (window.occt && window.occt.HEAP8 && window.occt.HEAP8.buffer) {
      wasmHeap = Math.round(window.occt.HEAP8.buffer.byteLength / (1024 * 1024));
    }

    return {
      fps: currentFps,
      drawCalls: render.calls,
      triangles: render.triangles,
      geometries: mem.geometries,
      textures: mem.textures,
      jsHeapMb: jsHeap,
      wasmHeapMb: wasmHeap
    };
  }

  function toggleInspectionCard(renderer) {
    if (!telemetryCardEl) {
      telemetryCardEl = document.createElement('div');
      telemetryCardEl.id = 'admin-twin-card';
      telemetryCardEl.className = 'admin-twin-card';
      telemetryCardEl.style.display = 'none';
      document.body.appendChild(telemetryCardEl);
    }

    const isVisible = telemetryCardEl.style.display !== 'none';
    if (isVisible) {
      telemetryCardEl.style.display = 'none';
      if (telemetryInterval) {
        clearInterval(telemetryInterval);
        telemetryInterval = null;
      }
    } else {
      telemetryCardEl.style.display = 'flex';
      const refresh = async () => {
        const t = collectTelemetry(renderer);
        const cache = await getCacheStats();
        const cacheMb = (cache.totalBytes / (1024 * 1024)).toFixed(1);
        telemetryCardEl.innerHTML = `
          <div class="admin-twin-header">
            <span class="admin-twin-title">
              <svg class="lucide" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>
              Admin Twin Telemetry
            </span>
            <button class="btn-copy" id="btn-close-admintwin" style="font-size:10px; padding:1px 5px;">✕</button>
          </div>
          <div class="admin-twin-grid">
            <div class="admin-twin-stat"><span class="admin-twin-label">Framerate</span><span class="admin-twin-val">${t.fps} FPS</span></div>
            <div class="admin-twin-stat"><span class="admin-twin-label">Triangles</span><span class="admin-twin-val">${t.triangles.toLocaleString()}</span></div>
            <div class="admin-twin-stat"><span class="admin-twin-label">Draw Calls</span><span class="admin-twin-val">${t.drawCalls}</span></div>
            <div class="admin-twin-stat"><span class="admin-twin-label">Geometries</span><span class="admin-twin-val">${t.geometries}</span></div>
            <div class="admin-twin-stat"><span class="admin-twin-label">JS Heap</span><span class="admin-twin-val">${t.jsHeapMb} MB</span></div>
            <div class="admin-twin-stat"><span class="admin-twin-label">WASM Heap</span><span class="admin-twin-val">${t.wasmHeapMb} MB</span></div>
            <div class="admin-twin-stat"><span class="admin-twin-label">Cache Entries</span><span class="admin-twin-val">${cache.count} / 60</span></div>
            <div class="admin-twin-stat"><span class="admin-twin-label">Cache Space</span><span class="admin-twin-val">${cacheMb} / 300 MB</span></div>
          </div>
          <button id="btn-purge-cache-inline" class="btn-copy" style="margin-top:4px; justify-content:center; color:#f87171;">
            Purge All Cached Models
          </button>
        `;
        const closeBtn = document.getElementById('btn-close-admintwin');
        if (closeBtn) closeBtn.onclick = () => toggleInspectionCard(renderer);
        const purgeBtn = document.getElementById('btn-purge-cache-inline');
        if (purgeBtn) {
          purgeBtn.onclick = async () => {
            await clearAllCache();
            if (typeof window.showToast === 'function') window.showToast('Cache purged successfully.');
            refresh();
          };
        }
      };
      refresh();
      telemetryInterval = setInterval(refresh, 1000);
    }
  }

  function setupCachePurgeButton() {
    const btn = document.getElementById('btn-clearcache');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const icon = document.getElementById('clearcache-icon');
      const text = document.getElementById('clearcache-text');
      if (text) text.innerText = 'Purging...';
      const success = await clearAllCache();
      if (text) text.innerText = success ? 'Cleaned!' : 'Error';
      if (typeof window.showToast === 'function') {
        window.showToast(success ? 'CAD cache database cleared (0 models).' : 'Failed to clear cache.');
      }
      setTimeout(() => {
        if (text) text.innerText = 'Cache';
      }, 1800);
    });
  }

  const AdminTwin = {
    openCacheDB,
    getCachedModel,
    saveCachedModel,
    updateCacheTimestamp,
    pruneCache,
    clearAllCache,
    getCacheStats,
    collectTelemetry,
    trackFps,
    recordRenderFrame: trackFps,
    toggleInspectionCard,
    setupCachePurgeButton,
    setupUI: setupCachePurgeButton
  };

  window.AdminTwin = AdminTwin;
  window.getCachedModel = getCachedModel;
  window.saveCachedModel = saveCachedModel;
  window.clearAllCache = clearAllCache;
})();
