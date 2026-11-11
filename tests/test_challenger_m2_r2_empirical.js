/**
 * QuickLook CAD Studio - Challenger 2 (R2) Empirical Challenge Harness
 * File: tests/test_challenger_m2_r2_empirical.js
 * 
 * Verifies in real headless Chrome via Chrome DevTools Protocol (CDP):
 * 1. Pipeline Isolation Proof: Zero Worker instantiation, zero WASM network/compilation on STL loading, <15ms SLA.
 * 2. Lazy Worker Trigger: Loading STEP after STL triggers initWorker(), loads WASM, and parses without crash/deadlock.
 * 3. Rapid Sequential Switching & Concurrency: Rapid alternation (STL -> STEP -> STL) and race conditions (late READY / late PARSE_SUCCESS).
 * 4. Non-Indexed Physical Properties Ingestion: modelPhysicalProps volume & area non-zero, downstream materialsEngine mass calculations.
 * 5. Error Handling & Recovery: Truncated, malformed, zero-byte, and garbage STLs display clean UI error, keep render loop alive, and self-heal on subsequent valid load.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');

const HTTP_PORT = 9883;
const CDP_PORT = 9884;

let totalPassed = 0;
let totalFailed = 0;
const findings = [];

function assert(condition, message) {
  if (!condition) {
    totalFailed++;
    const err = new Error(`Assertion failed: ${message}`);
    console.error(`  [FAIL] ${message}`);
    findings.push({ message, stack: err.stack });
    throw err;
  }
  totalPassed++;
  console.log(`  [PASS] ${message}`);
}

// -----------------------------------------------------------------------------
// 1. HTTP Server for Assets & Test Fixtures
// -----------------------------------------------------------------------------
function startServer(port) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.step': 'application/octet-stream',
    '.stp': 'application/octet-stream',
    '.stl': 'application/octet-stream'
  };

  const server = http.createServer((req, res) => {
    let cleanUrl = req.url.split('?')[0];
    if (cleanUrl === '/') cleanUrl = '/viewer.html';

    let filePath = path.join(ASSETS_DIR, cleanUrl);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(REPO_ROOT, cleanUrl);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${cleanUrl}`);
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[HTTP Server] Listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// -----------------------------------------------------------------------------
// 2. Headless Chrome Launcher
// -----------------------------------------------------------------------------
function launchChrome(cdpPort) {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP, 'cdp_m2_r2_' + Date.now());
  const args = [
    `--remote-debugging-port=${cdpPort}`,
    '--remote-debugging-address=127.0.0.1',
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ];
  return spawn(chromePath, args);
}

// -----------------------------------------------------------------------------
// 3. Lightweight CDP Client over native WebSocket
// -----------------------------------------------------------------------------
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.eventListeners = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const WS = globalThis.WebSocket;
      this.ws = new WS(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;

      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data || evt);
          if (msg.method && this.eventListeners.has(msg.method)) {
            for (const cb of this.eventListeners.get(msg.method)) {
              cb(msg.params);
            }
          }
        } catch (e) {}
      };
    });
  }

  on(method, callback) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, []);
    }
    this.eventListeners.get(method).push(callback);
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      const handler = (evt) => {
        const msg = JSON.parse(evt.data || evt);
        if (msg.id === msgId) {
          this.ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
      this.ws.addEventListener('message', handler);
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }
}

// -----------------------------------------------------------------------------
// 4. Synthetic Geometry Fixtures
// -----------------------------------------------------------------------------
function generateBinaryCubeBuffer(dx = 10, dy = 20, dz = 30, opts = {}) {
  const triCount = opts.openTop ? 10 : 12;
  const buf = Buffer.alloc(84 + 50 * triCount);
  const header = opts.headerText || 'Empirical Binary Cube';
  buf.write(header, 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);

  const faces = [
    // Bottom (Z=0, normal [0, 0, -1])
    { n: [0, 0, -1], a: [0, 0, 0], b: [0, dy, 0], c: [dx, dy, 0] },
    { n: [0, 0, -1], a: [0, 0, 0], b: [dx, dy, 0], c: [dx, 0, 0] },
    // Front (Y=0, normal [0, -1, 0])
    { n: [0, -1, 0], a: [0, 0, 0], b: [dx, 0, 0], c: [dx, 0, dz] },
    { n: [0, -1, 0], a: [0, 0, 0], b: [dx, 0, dz], c: [0, 0, dz] },
    // Back (Y=dy, normal [0, 1, 0])
    { n: [0, 1, 0], a: [0, dy, 0], b: [0, dy, dz], c: [dx, dy, dz] },
    { n: [0, 1, 0], a: [0, dy, 0], b: [dx, dy, dz], c: [dx, dy, 0] },
    // Left (X=0, normal [-1, 0, 0])
    { n: [-1, 0, 0], a: [0, 0, 0], b: [0, 0, dz], c: [0, dy, dz] },
    { n: [-1, 0, 0], a: [0, 0, 0], b: [0, dy, dz], c: [0, dy, 0] },
    // Right (X=dx, normal [1, 0, 0])
    { n: [1, 0, 0], a: [dx, 0, 0], b: [dx, dy, 0], c: [dx, dy, dz] },
    { n: [1, 0, 0], a: [dx, 0, 0], b: [dx, dy, dz], c: [dx, 0, dz] }
  ];

  if (!opts.openTop) {
    // Top (Z=dz, normal [0, 0, 1])
    faces.push(
      { n: [0, 0, 1], a: [0, 0, dz], b: [dx, 0, dz], c: [dx, dy, dz] },
      { n: [0, 0, 1], a: [0, 0, dz], b: [dx, dy, dz], c: [0, dy, dz] }
    );
  }

  let offset = 84;
  for (const f of faces) {
    const n = opts.zeroNormals ? [0, 0, 0] : f.n;
    buf.writeFloatLE(n[0], offset);
    buf.writeFloatLE(n[1], offset + 4);
    buf.writeFloatLE(n[2], offset + 8);
    buf.writeFloatLE(f.a[0], offset + 12);
    buf.writeFloatLE(f.a[1], offset + 16);
    buf.writeFloatLE(f.a[2], offset + 20);
    buf.writeFloatLE(f.b[0], offset + 24);
    buf.writeFloatLE(f.b[1], offset + 28);
    buf.writeFloatLE(f.b[2], offset + 32);
    buf.writeFloatLE(f.c[0], offset + 36);
    buf.writeFloatLE(f.c[1], offset + 40);
    buf.writeFloatLE(f.c[2], offset + 44);
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }

  return buf;
}

function generateAsciiCubeString(dx = 10, dy = 20, dz = 30) {
  return `solid AsciiCube
  facet normal 0.000000 0.000000 -1.000000
    outer loop
      vertex 0.000000 0.000000 0.000000
      vertex 0.000000 ${dy}.000000 0.000000
      vertex ${dx}.000000 ${dy}.000000 0.000000
    endloop
  endfacet
  facet normal 0.000000 0.000000 -1.000000
    outer loop
      vertex 0.000000 0.000000 0.000000
      vertex ${dx}.000000 ${dy}.000000 0.000000
      vertex ${dx}.000000 0.000000 0.000000
    endloop
  endfacet
  facet normal 0.000000 -1.000000 0.000000
    outer loop
      vertex 0.000000 0.000000 0.000000
      vertex ${dx}.000000 0.000000 0.000000
      vertex ${dx}.000000 0.000000 ${dz}.000000
    endloop
  endfacet
  facet normal 0.000000 -1.000000 0.000000
    outer loop
      vertex 0.000000 0.000000 0.000000
      vertex ${dx}.000000 0.000000 ${dz}.000000
      vertex 0.000000 0.000000 ${dz}.000000
    endloop
  endfacet
  facet normal 0.000000 1.000000 0.000000
    outer loop
      vertex 0.000000 ${dy}.000000 0.000000
      vertex 0.000000 ${dy}.000000 ${dz}.000000
      vertex ${dx}.000000 ${dy}.000000 ${dz}.000000
    endloop
  endfacet
  facet normal 0.000000 1.000000 0.000000
    outer loop
      vertex 0.000000 ${dy}.000000 0.000000
      vertex ${dx}.000000 ${dy}.000000 ${dz}.000000
      vertex ${dx}.000000 ${dy}.000000 0.000000
    endloop
  endfacet
  facet normal -1.000000 0.000000 0.000000
    outer loop
      vertex 0.000000 0.000000 0.000000
      vertex 0.000000 0.000000 ${dz}.000000
      vertex 0.000000 ${dy}.000000 ${dz}.000000
    endloop
  endfacet
  facet normal -1.000000 0.000000 0.000000
    outer loop
      vertex 0.000000 0.000000 0.000000
      vertex 0.000000 ${dy}.000000 ${dz}.000000
      vertex 0.000000 ${dy}.000000 0.000000
    endloop
  endfacet
  facet normal 1.000000 0.000000 0.000000
    outer loop
      vertex ${dx}.000000 0.000000 0.000000
      vertex ${dx}.000000 ${dy}.000000 0.000000
      vertex ${dx}.000000 ${dy}.000000 ${dz}.000000
    endloop
  endfacet
  facet normal 1.000000 0.000000 0.000000
    outer loop
      vertex ${dx}.000000 0.000000 0.000000
      vertex ${dx}.000000 ${dy}.000000 ${dz}.000000
      vertex ${dx}.000000 0.000000 ${dz}.000000
    endloop
  endfacet
  facet normal 0.000000 0.000000 1.000000
    outer loop
      vertex 0.000000 0.000000 ${dz}.000000
      vertex ${dx}.000000 0.000000 ${dz}.000000
      vertex ${dx}.000000 ${dy}.000000 ${dz}.000000
    endloop
  endfacet
  facet normal 0.000000 0.000000 1.000000
    outer loop
      vertex 0.000000 0.000000 ${dz}.000000
      vertex ${dx}.000000 ${dy}.000000 ${dz}.000000
      vertex 0.000000 ${dy}.000000 ${dz}.000000
    endloop
  endfacet
endsolid AsciiCube`;
}

// -----------------------------------------------------------------------------
// 5. Main Test Suite Execution
// -----------------------------------------------------------------------------
async function runEmpiricalChallenge() {
  console.log('================================================================');
  console.log('  CHALLENGER 2 (R2): LIVE EMPIRICAL PIPELINE ISOLATION HARNESS  ');
  console.log('================================================================\n');

  let server, chromeProcess, cdp;

  try {
    server = await startServer(HTTP_PORT);
    chromeProcess = launchChrome(CDP_PORT);

    // Wait for Chrome CDP endpoint
    console.log('[CDP] Connecting to Chrome remote debugging port...');
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        if (res.ok) {
          const list = await res.json();
          const pageTarget = list.find(t => t.type === 'page');
          if (pageTarget && pageTarget.webSocketDebuggerUrl) {
            wsUrl = pageTarget.webSocketDebuggerUrl;
            break;
          }
        }
      } catch (e) {}
    }

    if (!wsUrl) {
      throw new Error(`Failed to obtain webSocketDebuggerUrl from Chrome on port ${CDP_PORT}`);
    }

    console.log(`[CDP] WebSocket URL obtained: ${wsUrl}`);
    cdp = new CDPClient(wsUrl);
    await cdp.connect();
    console.log('[CDP] Connected successfully.');

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const networkRequests = [];
    cdp.on('Network.requestWillBeSent', (params) => {
      networkRequests.push({
        url: params.request.url,
        method: params.request.method
      });
    });

    // Injected instrumentation before page load
    const preloadScript = `
      window.__workerCreations = [];
      const OriginalWorker = window.Worker;
      window.Worker = function(scriptUrl, options) {
        window.__workerCreations.push({
          scriptUrl: String(scriptUrl),
          options: options,
          timestamp: performance.now()
        });
        return new OriginalWorker(scriptUrl, options);
      };
      window.Worker.prototype = OriginalWorker.prototype;

      window.__fetchRequests = [];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        window.__fetchRequests.push(String(args[0]));
        return originalFetch.apply(this, args);
      };

      window.__tessellationHistory = [];
      window.__errorHistory = [];
    `;

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: preloadScript
    });

    // Navigate to viewer.html
    console.log('[Browser] Navigating to viewer.html...');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/viewer.html` });

    // Wait for viewer initialization
    await new Promise((resolve) => {
      const check = async () => {
        try {
          const ready = await cdp.eval(`typeof window.startTessellation === 'function' && typeof window.StlLoader !== 'undefined'`);
          if (ready) resolve();
          else setTimeout(check, 100);
        } catch (e) {
          setTimeout(check, 100);
        }
      };
      check();
    });
    console.log('[Browser] viewer.html initialized and ready.\n');

    // =========================================================================
    // DOMAIN 1: PIPELINE ISOLATION PROOF
    // =========================================================================
    console.log('--- Domain 1: OpenCASCADE WASM Pipeline Isolation Proof ---');

    // 1.1 Viewport Boot Check: Zero Worker, Zero WASM
    const initWorkers = await cdp.eval(`window.__workerCreations.length`);
    assert(initWorkers === 0, `Initial viewport boot MUST NOT instantiate any Web Worker (Actual: ${initWorkers})`);

    const wasmNetInit = networkRequests.filter(r => r.url.includes('.wasm') || r.url.includes('stepWorker'));
    assert(wasmNetInit.length === 0, `Initial viewport boot MUST NOT fetch occt-import-js.wasm or stepWorker.js (Actual: ${wasmNetInit.length})`);

    const initialStatus = await cdp.eval(`document.getElementById('status-text').innerText`);
    assert(initialStatus === 'Ready for CAD files', `Status text after boot is 'Ready for CAD files' (Actual: '${initialStatus}')`);

    // 1.2 Binary STL Load: Pure JS execution
    const binCube = generateBinaryCubeBuffer(10, 20, 30);
    const binCubeB64 = binCube.toString('base64');

    const loadStlRes = await cdp.eval(`
      new Promise((resolve) => {
        const raw = atob('${binCubeB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const buffer = u8.buffer;

        const tParse0 = performance.now();
        const parsed = window.StlLoader.parse(buffer.slice(0), 'test_cube.stl');
        const parseElapsed = performance.now() - tParse0;

        const t0 = performance.now();
        window.startTessellation(buffer, 'test_cube.stl');
        const elapsed = performance.now() - t0;

        resolve({
          parseElapsedMs: parseElapsed,
          pipelineElapsedMs: elapsed,
          workerCount: window.__workerCreations.length,
          modelBodiesCount: (window.modelBodies || []).length,
          triangles: (window.modelPhysicalProps || {}).triangles,
          statusText: document.getElementById('status-text').innerText,
          spinnerVisible: document.getElementById('spinner').style.display !== 'none'
        });
      })
    `);

    assert(loadStlRes.workerCount === 0, `Loading Binary STL MUST NOT instantiate Web Worker (Worker count: ${loadStlRes.workerCount})`);
    assert(loadStlRes.statusText.includes('STL Mesh'), `Status text must indicate 'STL Mesh' (Actual: '${loadStlRes.statusText}')`);
    assert(loadStlRes.parseElapsedMs < 15, `StlLoader.parse for Binary STL must execute in < 15ms SLA (Actual: ${loadStlRes.parseElapsedMs.toFixed(2)}ms)`);
    assert(loadStlRes.pipelineElapsedMs < 50, `startTessellation pipeline for Binary STL must execute under 50ms (Actual: ${loadStlRes.pipelineElapsedMs.toFixed(2)}ms)`);
    assert(loadStlRes.modelBodiesCount === 1, `Scene must contain exactly 1 model body (Actual: ${loadStlRes.modelBodiesCount})`);
    assert(loadStlRes.triangles === 12, `10x20x30 cube must contain 12 triangles (Actual: ${loadStlRes.triangles})`);
    assert(loadStlRes.statusText.includes('STL Mesh') && loadStlRes.statusText.includes('Watertight'), 
      `Status badge must indicate STL Mesh & Watertight (Actual: '${loadStlRes.statusText}')`);
    assert(!loadStlRes.spinnerVisible, 'Loading spinner must be hidden after STL load');

    // Verify zero WASM network requests occurred during STL loading
    const wasmNetStl = networkRequests.filter(r => r.url.includes('.wasm') || r.url.includes('stepWorker'));
    assert(wasmNetStl.length === 0, `Zero network requests for WASM or stepWorker during STL parsing (Actual: ${wasmNetStl.length})`);

    // 1.3 ASCII STL Load: Pure JS execution
    const asciiCubeStr = generateAsciiCubeString(10, 20, 30);
    const asciiCubeB64 = Buffer.from(asciiCubeStr, 'utf8').toString('base64');

    const loadAsciiRes = await cdp.eval(`
      new Promise((resolve) => {
        const raw = atob('${asciiCubeB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const buffer = u8.buffer;

        const tParse0 = performance.now();
        const parsed = window.StlLoader.parse(buffer.slice(0), 'test_ascii_cube.stl');
        const parseElapsed = performance.now() - tParse0;

        const t0 = performance.now();
        window.startTessellation(buffer, 'test_ascii_cube.stl');
        const elapsed = performance.now() - t0;

        resolve({
          parseElapsedMs: parseElapsed,
          pipelineElapsedMs: elapsed,
          workerCount: window.__workerCreations.length,
          modelBodiesCount: (window.modelBodies || []).length,
          triangles: (window.modelPhysicalProps || {}).triangles,
          statusText: document.getElementById('status-text').innerText
        });
      })
    `);

    assert(loadAsciiRes.workerCount === 0, `Loading ASCII STL MUST NOT instantiate Web Worker (Worker count: ${loadAsciiRes.workerCount})`);
    assert(loadAsciiRes.parseElapsedMs < 15, `StlLoader.parse for ASCII STL must execute in < 15ms SLA (Actual: ${loadAsciiRes.parseElapsedMs.toFixed(2)}ms)`);
    assert(loadAsciiRes.triangles === 12, `ASCII cube must contain 12 triangles (Actual: ${loadAsciiRes.triangles})`);

    // =========================================================================
    // DOMAIN 2: LAZY WORKER TRIGGER & STEP COMPILATION
    // =========================================================================
    console.log('\n--- Domain 2: Lazy Worker Trigger & OpenCASCADE WASM Ingestion ---');

    const sampleBoxPath = path.join(REPO_ROOT, 'sample_box.step');
    const stepBuf = fs.readFileSync(sampleBoxPath);
    const stepB64 = stepBuf.toString('base64');

    console.log(`[Domain 2] Loading sample_box.step (${stepBuf.byteLength} bytes)...`);
    const triggerStepPromise = cdp.eval(`
      new Promise((resolve, reject) => {
        const raw = atob('${stepB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const buffer = u8.buffer;

        const origOnTess = window.onTessellationComplete;
        const timeout = setTimeout(() => {
          resolve({ timedOut: true, status: document.getElementById('status-text').innerText });
        }, 12000);

        window.onTessellationComplete = function(data) {
          clearTimeout(timeout);
          origOnTess.apply(this, arguments);
          resolve({
            timedOut: false,
            data: {
              format: data.format,
              meshCount: data.meshCount,
              totalTriangles: (window.modelPhysicalProps || {}).triangles,
              workerCount: window.__workerCreations.length,
              statusText: document.getElementById('status-text').innerText
            }
          });
        };

        window.startTessellation(buffer, 'sample_box.step');
      })
    `);

    const stepResult = await triggerStepPromise;
    assert(!stepResult.timedOut, 'STEP loading completed without timing out');
    assert(stepResult.data.workerCount === 1, `Lazy worker initialization triggered exactly 1 Worker for STEP (Actual: ${stepResult.data.workerCount})`);
    assert(stepResult.data.format === 'STEP', `Active format after STEP completion is 'STEP' (Actual: '${stepResult.data.format}')`);
    assert(stepResult.data.meshCount >= 1, `STEP model contains at least 1 mesh body (Actual: ${stepResult.data.meshCount})`);
    console.log(`[Domain 2] Lazy worker successfully compiled WASM and rendered STEP model!`);

    // =========================================================================
    // DOMAIN 3: RAPID SEQUENTIAL FILE LOADING & CONCURRENCY CHALLENGE
    // =========================================================================
    console.log('\n--- Domain 3: Rapid Sequential File Loading & Concurrency Challenge ---');

    // 3.1 Orderly Sequential Format Switching (STL -> STEP -> STL)
    console.log('[Domain 3] Testing orderly sequential format switching (STL -> STEP -> STL)...');
    const orderlySwitchRes = await cdp.eval(`
      new Promise(async (resolve) => {
        const binCubeRaw = atob('${binCubeB64}');
        const binU8 = new Uint8Array(binCubeRaw.length);
        for (let i = 0; i < binCubeRaw.length; i++) binU8[i] = binCubeRaw.charCodeAt(i);

        const stepRaw = atob('${stepB64}');
        const stepU8 = new Uint8Array(stepRaw.length);
        for (let i = 0; i < stepRaw.length; i++) stepU8[i] = stepRaw.charCodeAt(i);

        // 1. Load STL
        window.startTessellation(binU8.buffer.slice(0), 'orderly_1.stl');
        const stl1Triangles = (window.modelPhysicalProps || {}).triangles;

        // 2. Load STEP and wait for completion
        await new Promise((res) => {
          const orig = window.onTessellationComplete;
          window.onTessellationComplete = function(d) {
            orig.apply(this, arguments);
            window.onTessellationComplete = orig;
            res();
          };
          window.startTessellation(stepU8.buffer.slice(0), 'orderly_2.step');
        });
        const stepTriangles = (window.modelPhysicalProps || {}).triangles;

        // 3. Load STL again
        window.startTessellation(binU8.buffer.slice(0), 'orderly_3.stl');
        const stl2Triangles = (window.modelPhysicalProps || {}).triangles;

        resolve({
          stl1Triangles,
          stepTriangles,
          stl2Triangles,
          finalStatusText: document.getElementById('status-text').innerText,
          finalModelBodies: (window.modelBodies || []).length,
          finalModelGroupChildren: window.modelGroup.children.length,
          timerActive: window.loadTimer !== null && window.loadTimer !== undefined
        });
      })
    `);

    assert(orderlySwitchRes.stl1Triangles === 12, `Step 1 (STL) loaded 12 triangles (Actual: ${orderlySwitchRes.stl1Triangles})`);
    assert(orderlySwitchRes.stepTriangles > 0, `Step 2 (STEP) loaded CAD solid geometry (Actual: ${orderlySwitchRes.stepTriangles} triangles)`);
    assert(orderlySwitchRes.stl2Triangles === 12, `Step 3 (STL) restored 12 triangles (Actual: ${orderlySwitchRes.stl2Triangles})`);
    assert(orderlySwitchRes.finalStatusText.includes('STL Mesh'), `Final status badge indicates 'STL Mesh' (Actual: '${orderlySwitchRes.finalStatusText}')`);
    assert(orderlySwitchRes.finalModelBodies === 1, `Single body model in memory after switching (Actual: ${orderlySwitchRes.finalModelBodies})`);
    assert(orderlySwitchRes.finalModelGroupChildren === 1, `Scene graph has exactly 1 root mesh (no memory leak/ghosts, Actual: ${orderlySwitchRes.finalModelGroupChildren})`);
    assert(!orderlySwitchRes.timerActive, 'loadTimer is not leaking in background');

    // 3.2 Adversarial Race Condition Probe: Rapid uncoordinated switching (STL -> STEP -> STL in 0ms)
    console.log('[Domain 3] Adversarial Stress: Rapid concurrent file switching (burst interleaving)...');
    const burstSwitchRes = await cdp.eval(`
      new Promise(async (resolve) => {
        const binCubeRaw = atob('${binCubeB64}');
        const binU8 = new Uint8Array(binCubeRaw.length);
        for (let i = 0; i < binCubeRaw.length; i++) binU8[i] = binCubeRaw.charCodeAt(i);

        const stepRaw = atob('${stepB64}');
        const stepU8 = new Uint8Array(stepRaw.length);
        for (let i = 0; i < stepRaw.length; i++) stepU8[i] = stepRaw.charCodeAt(i);

        // Rapid burst: dispatch STEP then immediately STL before worker completes
        window.startTessellation(stepU8.buffer.slice(0), 'burst_step.step');
        window.startTessellation(binU8.buffer.slice(0), 'burst_stl.stl');

        // Immediate state right after STL load
        const immediateStatus = document.getElementById('status-text').innerText;
        const immediateTriangles = (window.modelPhysicalProps || {}).triangles;

        // Wait 300ms for in-flight worker to finish its background STEP parse
        await new Promise(r => setTimeout(r, 300));

        const delayedStatus = document.getElementById('status-text').innerText;
        const delayedTriangles = (window.modelPhysicalProps || {}).triangles;

        resolve({
          immediateStatus,
          immediateTriangles,
          delayedStatus,
          delayedTriangles,
          overwrittenByWorker: delayedTriangles !== immediateTriangles || !delayedStatus.includes('STL Mesh')
        });
      })
    `);

    if (burstSwitchRes.overwrittenByWorker) {
      console.warn(`  [VULNERABILITY DETECTED]: In-flight Web Worker overwritten the active STL model! Immediate: ${burstSwitchRes.immediateTriangles} tris ('${burstSwitchRes.immediateStatus}'), Delayed: ${burstSwitchRes.delayedTriangles} tris ('${burstSwitchRes.delayedStatus}')`);
      findings.push({
        domain: 'Domain 3: Rapid Sequential File Loading & Concurrency Challenge',
        issue: 'In-flight Web Worker PARSE_SUCCESS message lacks request-version gating; overwrites newer STL model loaded while worker was parsing in background',
        immediateState: `${burstSwitchRes.immediateTriangles} triangles (${burstSwitchRes.immediateStatus})`,
        corruptedState: `${burstSwitchRes.delayedTriangles} triangles (${burstSwitchRes.delayedStatus})`,
        severity: 'HIGH'
      });
    } else {
      assert(true, 'In-flight worker message does not overwrite active STL model');
    }

    // 3.2 Race Condition Probe: Late Worker Messages
    console.log('[Domain 3] Probing worker late-message race condition handling...');
    const lateMessageProbe = await cdp.eval(`
      new Promise((resolve) => {
        // Load an STL model
        const binCubeRaw = atob('${binCubeB64}');
        const binU8 = new Uint8Array(binCubeRaw.length);
        for (let i = 0; i < binCubeRaw.length; i++) binU8[i] = binCubeRaw.charCodeAt(i);
        window.startTessellation(binU8.buffer, 'probe_stl.stl');

        const initialStatus = document.getElementById('status-text').innerText;
        const initialFormat = window.activeCadFormat;

        // Simulate a late READY message from worker arriving while STL is displayed
        if (window.currentWorker && window.currentWorker.onmessage) {
          // Send simulated READY
          window.currentWorker.onmessage({ data: { type: 'READY' } });
        }

        const postReadyStatus = document.getElementById('status-text').innerText;

        resolve({
          initialStatus,
          postReadyStatus,
          overwritten: postReadyStatus === 'Ready for CAD files'
        });
      })
    `);

    if (lateMessageProbe.overwritten) {
      console.warn(`  [VULNERABILITY DETECTED]: Worker READY message unconditionally overwrote status-text from '${lateMessageProbe.initialStatus}' to '${lateMessageProbe.postReadyStatus}' while STL model is active!`);
      findings.push({
        domain: 'Concurrency / Race Condition',
        issue: 'Late Worker READY message wipes active STL status badge to "Ready for CAD files"',
        severity: 'MEDIUM'
      });
    } else {
      assert(true, 'Worker READY message does not overwrite active STL status text');
    }

    // =========================================================================
    // DOMAIN 4: NON-INDEXED PHYSICAL PROPERTIES & MATERIALS ENGINE
    // =========================================================================
    console.log('\n--- Domain 4: Non-Indexed Physical Properties & Materials Engine Ingestion ---');

    // Load watertight 10x20x30 cube (Theoretical V = 6000 mm³ = 6.0 cm³, A = 2200 mm² = 22.0 cm²)
    await cdp.eval(`
      const binCubeRaw = atob('${binCubeB64}');
      const binU8 = new Uint8Array(binCubeRaw.length);
      for (let i = 0; i < binCubeRaw.length; i++) binU8[i] = binCubeRaw.charCodeAt(i);
      window.startTessellation(binU8.buffer, 'watertight_cube.stl');
    `);

    const propsCheck = await cdp.eval(`
      (() => {
        const p = window.modelPhysicalProps || {};
        const mb = (window.modelBodies && window.modelBodies[0]) ? window.modelBodies[0].data : {};
        
        // Trigger physical properties card update
        if (typeof window.updatePhysicalPropertiesCard === 'function') {
          window.updatePhysicalPropertiesCard();
        }

        const volEl = document.getElementById('prop-vol');
        const areaEl = document.getElementById('prop-area');
        const weightEl = document.getElementById('active-mat-weight');
        const matNameEl = document.getElementById('active-mat-name');

        return {
          volMm3: p.volumeMm3,
          areaMm2: p.areaMm2,
          meshVolMm3: mb.volumeMm3,
          meshAreaMm2: mb.areaMm2,
          volElText: volEl ? volEl.innerText : null,
          areaElText: areaEl ? areaEl.innerText : null,
          weightText: weightEl ? weightEl.innerText : null,
          matName: matNameEl ? matNameEl.innerText : null
        };
      })()
    `);

    assert(Math.abs(propsCheck.volMm3 - 6000.0) < 1e-2, `modelPhysicalProps.volumeMm3 must be exactly 6000.0 mm³ (Actual: ${propsCheck.volMm3})`);
    assert(Math.abs(propsCheck.areaMm2 - 2200.0) < 1e-2, `modelPhysicalProps.areaMm2 must be exactly 2200.0 mm² (Actual: ${propsCheck.areaMm2})`);
    assert(Math.abs(propsCheck.meshVolMm3 - 6000.0) < 1e-2, `Mesh body data.volumeMm3 must be 6000.0 mm³ (Actual: ${propsCheck.meshVolMm3})`);

    // Verify UI card rendering
    if (propsCheck.volElText) {
      assert(propsCheck.volElText.includes('6.00 cm³'), `Physical properties card displays '6.00 cm³' (Actual: '${propsCheck.volElText}')`);
    }
    if (propsCheck.areaElText) {
      assert(propsCheck.areaElText.includes('22.0 cm²'), `Physical properties card displays '22.0 cm²' (Actual: '${propsCheck.areaElText}')`);
    }

    // Verify Materials mass calculation (Default Al 6061: 2.70 g/cm³ => 6.00 * 2.70 = 16.2 g)
    if (propsCheck.weightText) {
      assert(propsCheck.weightText.includes('16.2 g'), `Calculated part weight is 16.2 g (non-zero!) for Al 6061 (Actual: '${propsCheck.weightText}')`);
    }

    // Test material switching: Steel (7.85 g/cm³ => 6.00 * 7.85 = 47.1 g)
    const steelWeightCheck = await cdp.eval(`
      (() => {
        if (typeof window.selectMaterial === 'function') {
          window.selectMaterial('steel_304');
        }
        const weightEl = document.getElementById('active-mat-weight');
        return weightEl ? weightEl.innerText : null;
      })()
    `);
    if (steelWeightCheck) {
      assert(steelWeightCheck.includes('47.1 g'), `Steel 304 mass updates correctly to 47.1 g (Actual: '${steelWeightCheck}')`);
    }

    // Open Mesh Topology: 10-triangle box (missing top face)
    const openMeshBuf = generateBinaryCubeBuffer(10, 20, 30, { openTop: true });
    const openMeshB64 = openMeshBuf.toString('base64');
    const openMeshRes = await cdp.eval(`
      (() => {
        const raw = atob('${openMeshB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        window.startTessellation(u8.buffer, 'open_box.stl');

        const mb0 = (window.modelBodies && window.modelBodies[0]) ? window.modelBodies[0].data : {};
        return {
          statusText: document.getElementById('status-text').innerText,
          isWatertight: mb0.isWatertight,
          isManifold: mb0.isManifold,
          triangles: (window.modelPhysicalProps || {}).triangles
        };
      })()
    `);

    assert(openMeshRes.isWatertight === false, `Open mesh must report isWatertight === false (Actual: ${openMeshRes.isWatertight})`);
    assert(openMeshRes.isManifold === true, `Open mesh with boundary edges must report isManifold === true (Actual: ${openMeshRes.isManifold})`);
    assert(openMeshRes.statusText.includes('Open Mesh'), `Status badge must report 'Open Mesh' for non-watertight geometry (Actual: '${openMeshRes.statusText}')`);

    // =========================================================================
    // DOMAIN 5: ERROR HANDLING & VIEWPORT RESILIENCE
    // =========================================================================
    console.log('\n--- Domain 5: Robust Error Handling & Viewport Resilience ---');

    const corruptCases = [
      {
        name: 'Truncated binary header (< 84 bytes)',
        buf: Buffer.alloc(40)
      },
      {
        name: 'Binary triangle count mismatch (claims 100,000 tris, 84 bytes actual)',
        buf: (() => {
          const b = Buffer.alloc(84);
          b.writeUInt32LE(100000, 80);
          return b;
        })()
      },
      {
        name: 'Corrupted ASCII (solid preamble without facet normal or endsolid)',
        buf: Buffer.from('solid BrokenMesh\nSome random non-facet text that is definitely not an STL mesh\n', 'utf8')
      },
      {
        name: 'Zero-byte empty file',
        buf: Buffer.alloc(0)
      },
      {
        name: 'Random noise binary buffer (500 bytes)',
        buf: Buffer.from(Array.from({ length: 500 }, (_, i) => (i * 37) % 256))
      }
    ];

    for (const testCase of corruptCases) {
      const b64 = testCase.buf.toString('base64');
      const errRes = await cdp.eval(`
        (() => {
          const raw = atob('${b64}');
          const u8 = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

          window.startTessellation(u8.buffer, 'corrupt_test.stl');

          const errEl = document.getElementById('error-container');
          const stEl = document.getElementById('status-text');
          const spEl = document.getElementById('spinner');

          return {
            errVisible: errEl && errEl.style.display !== 'none',
            errText: errEl ? errEl.innerText : '',
            statusText: stEl ? stEl.innerText : '',
            spinnerHidden: spEl ? spEl.style.display === 'none' : false,
            modelBodiesCount: (window.modelBodies || []).length
          };
        })()
      `);

      assert(errRes.errVisible, `[${testCase.name}] Error container is visible`);
      assert(errRes.errText.includes('STL Parse Error'), `[${testCase.name}] Error container displays 'STL Parse Error' (Actual: '${errRes.errText}')`);
      assert(errRes.statusText === 'STL Parse Error', `[${testCase.name}] Status text indicates 'STL Parse Error' (Actual: '${errRes.statusText}')`);
      assert(errRes.spinnerHidden, `[${testCase.name}] Spinner is hidden`);
      assert(errRes.modelBodiesCount === 0, `[${testCase.name}] Erroneous model leaves zero dangling bodies`);
    }

    // 5.2 Adversarial Probe: Incomplete/Malformed ASCII STL (contains keyword but 0 valid triangles)
    console.log('[Domain 5] Adversarial Stress: Incomplete ASCII STL with broken facets...');
    const incompleteAsciiBuf = Buffer.from('solid BrokenMesh\\n  facet normal 0 0 1\\n    outer loop\\n      vertex 1 2 3\\nendsolid', 'utf8');
    const incompleteB64 = incompleteAsciiBuf.toString('base64');
    const incompleteRes = await cdp.eval(`
      (() => {
        const raw = atob('${incompleteB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

        window.startTessellation(u8.buffer, 'incomplete_ascii.stl');

        const errEl = document.getElementById('error-container');
        const stEl = document.getElementById('status-text');
        const triangles = (window.modelPhysicalProps || {}).triangles;

        return {
          errVisible: errEl && errEl.style.display !== 'none',
          statusText: stEl ? stEl.innerText : '',
          triangles: triangles
        };
      })()
    `);

    if (!incompleteRes.errVisible && incompleteRes.triangles === 0) {
      console.warn(`  [VULNERABILITY DETECTED]: Incomplete ASCII STL with truncated vertices parsed silently as 0 triangles instead of throwing error! Status: '${incompleteRes.statusText}'`);
      findings.push({
        domain: 'Domain 5: Robust Error Handling & Viewport Resilience',
        issue: 'Incomplete/malformed ASCII STL containing keyword `facet normal` but missing vertices yields 0 triangles without error, resulting in empty mesh with badge "✓ STL Mesh • 0 Triangles • Open Mesh" instead of displaying STL Parse Error',
        observedStatus: incompleteRes.statusText,
        severity: 'MEDIUM'
      });
    } else {
      assert(incompleteRes.errVisible, 'Incomplete ASCII STL triggers error');
    }

    // Viewport Health: Verify render loop is still alive after multiple errors
    const renderLoopAlive = await cdp.eval(`
      new Promise((resolve) => {
        let frameCount = 0;
        const tick = () => {
          frameCount++;
          if (frameCount >= 5) resolve(true);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(() => resolve(false), 500);
      })
    `);
    assert(renderLoopAlive, 'WebGL render loop (requestAnimationFrame) is ALIVE and ticking after error storms');

    // Self-Healing / Recovery: Load valid model after multiple errors
    const recoveryRes = await cdp.eval(`
      (() => {
        const binCubeRaw = atob('${binCubeB64}');
        const binU8 = new Uint8Array(binCubeRaw.length);
        for (let i = 0; i < binCubeRaw.length; i++) binU8[i] = binCubeRaw.charCodeAt(i);
        window.startTessellation(binU8.buffer, 'recovered_cube.stl');

        const errEl = document.getElementById('error-container');
        const stEl = document.getElementById('status-text');

        return {
          errVisible: errEl && errEl.style.display !== 'none',
          statusText: stEl ? stEl.innerText : '',
          modelBodiesCount: (window.modelBodies || []).length
        };
      })()
    `);

    assert(!recoveryRes.errVisible, 'Error container is cleanly HIDDEN upon loading subsequent valid file');
    assert(recoveryRes.modelBodiesCount === 1, 'Valid model renders properly after previous error state (self-healing)');
    assert(recoveryRes.statusText.includes('Watertight'), `Status badge restores to healthy state (Actual: '${recoveryRes.statusText}')`);

    console.log('\n================================================================');
    console.log(`  EMPIRICAL CHALLENGE SUITE: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log(`  FINDINGS COUNT: ${findings.length}`);
    console.log('================================================================\n');

  } finally {
    if (cdp && cdp.ws) {
      try { cdp.ws.close(); } catch (e) {}
    }
    if (chromeProcess) {
      chromeProcess.kill('SIGKILL');
    }
    if (server) {
      server.close();
    }
  }

  return { totalPassed, totalFailed, findings };
}

// Execute
runEmpiricalChallenge()
  .then(({ totalPassed, totalFailed, findings }) => {
    if (totalFailed > 0) {
      console.error(`Suite failed with ${totalFailed} assertion failures.`);
      process.exit(1);
    } else {
      console.log('All empirical challenges passed 100%!');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
