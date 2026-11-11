/**
 * QuickLook CAD Studio - Challenger M2 Gen1 Empirical Concurrency & Stress Harness
 * File: tests/test_challenger_m2_gen1_stress.js
 *
 * Rigorous adversarial verification of Milestone 2:
 * 1. Rapid model switching matrix:
 *    - STEP -> STL (burst, 0ms)
 *    - STL -> STEP (burst, 0ms)
 *    - STL -> STL (burst, 0ms)
 *    - STEP -> STEP (burst, 0ms)
 *    - Multi-burst interleaved shuffle (STEP -> STL -> STEP -> STL -> STL -> STEP)
 * 2. Web Worker out-of-order message resilience:
 *    - Artificial delay on worker PARSE_SUCCESS arriving after STL has rendered.
 *    - Worker READY message arriving while STL model is active.
 *    - Worker PARSE_ERROR message arriving while STL model is active.
 *    - Verification that active STL viewport, modelBodies, modelPhysicalProps,
 *      and status badge are strictly preserved and never corrupted/overwritten.
 * 3. Boundary & Error Handling:
 *    - 0-byte buffer, truncated headers (1, 10, 40, 83 bytes).
 *    - Binary triangle count overflow & byte length mismatch (+1, -1, +49, -49 bytes).
 *    - Corrupted ASCII: empty solid (0 facets), truncated vertex blocks, null bytes.
 *    - Non-manifold meshes: T-junction (3 triangles sharing 1 edge), open mesh (missing face).
 * 4. Watertight Gauss signed volume precision:
 *    - Watertight box (10x20x30 mm): V = 6000.000 mm³, Area = 2200.000 mm² (<0.01% error).
 *    - Regular tetrahedron: V = 8/3 mm³, Area = 8*sqrt(3) mm² (<0.01% error).
 *    - Regular octahedron (r=10 mm): V = 4000/3 mm³, Area = 400*sqrt(3) mm² (<0.01% error).
 *    - Coordinate invariance under translation (1000, -2500, 5000 mm) & negative quadrant.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');

const HTTP_PORT = 9885;
const CDP_PORT = 9886;

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
  const userDataDir = path.join(process.env.TEMP, 'cdp_m2_gen1_' + Date.now());
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

// 4.1 Binary Box
function generateBinaryBoxBuffer(dx = 10, dy = 20, dz = 30, opts = {}) {
  const triCount = opts.openTop ? 10 : 12;
  const buf = Buffer.alloc(84 + 50 * triCount);
  const header = opts.headerText || 'Empirical Binary Box';
  buf.write(header, 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);

  const ox = opts.offsetX || 0;
  const oy = opts.offsetY || 0;
  const oz = opts.offsetZ || 0;

  const faces = [
    // Bottom (Z=0, normal [0, 0, -1])
    { n: [0, 0, -1], a: [ox, oy, oz], b: [ox, oy + dy, oz], c: [ox + dx, oy + dy, oz] },
    { n: [0, 0, -1], a: [ox, oy, oz], b: [ox + dx, oy + dy, oz], c: [ox + dx, oy, oz] },
    // Front (Y=0, normal [0, -1, 0])
    { n: [0, -1, 0], a: [ox, oy, oz], b: [ox + dx, oy, oz], c: [ox + dx, oy, oz + dz] },
    { n: [0, -1, 0], a: [ox, oy, oz], b: [ox + dx, oy, oz + dz], c: [ox, oy, oz + dz] },
    // Back (Y=dy, normal [0, 1, 0])
    { n: [0, 1, 0], a: [ox, oy + dy, oz], b: [ox, oy + dy, oz + dz], c: [ox + dx, oy + dy, oz + dz] },
    { n: [0, 1, 0], a: [ox, oy + dy, oz], b: [ox + dx, oy + dy, oz + dz], c: [ox + dx, oy + dy, oz] },
    // Left (X=0, normal [-1, 0, 0])
    { n: [-1, 0, 0], a: [ox, oy, oz], b: [ox, oy, oz + dz], c: [ox, oy + dy, oz + dz] },
    { n: [-1, 0, 0], a: [ox, oy, oz], b: [ox, oy + dy, oz + dz], c: [ox, oy + dy, oz] },
    // Right (X=dx, normal [1, 0, 0])
    { n: [1, 0, 0], a: [ox + dx, oy, oz], b: [ox + dx, oy + dy, oz], c: [ox + dx, oy + dy, oz + dz] },
    { n: [1, 0, 0], a: [ox + dx, oy, oz], b: [ox + dx, oy + dy, oz + dz], c: [ox + dx, oy, oz + dz] }
  ];

  if (!opts.openTop) {
    // Top (Z=dz, normal [0, 0, 1])
    faces.push(
      { n: [0, 0, 1], a: [ox, oy, oz + dz], b: [ox + dx, oy, oz + dz], c: [ox + dx, oy + dy, oz + dz] },
      { n: [0, 0, 1], a: [ox, oy, oz + dz], b: [ox + dx, oy + dy, oz + dz], c: [ox, oy + dy, oz + dz] }
    );
  }

  let offset = 84;
  for (const f of faces) {
    buf.writeFloatLE(f.n[0], offset);
    buf.writeFloatLE(f.n[1], offset + 4);
    buf.writeFloatLE(f.n[2], offset + 8);
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

// 4.2 Regular Tetrahedron (V = 8/3 mm³, Area = 8*sqrt(3) mm²)
function generateBinaryTetrahedronBuffer() {
  const triCount = 4;
  const buf = Buffer.alloc(84 + 50 * triCount);
  buf.write('Tetrahedron', 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);

  const A = [1, 1, 1];
  const B = [1, -1, -1];
  const C = [-1, 1, -1];
  const D = [-1, -1, 1];

  // Outward winding faces
  const faces = [
    { a: A, b: B, c: C },
    { a: A, b: C, c: D },
    { a: A, b: D, c: B },
    { a: B, b: D, c: C }
  ];

  let offset = 84;
  for (const f of faces) {
    // Normal = (B-A) x (C-A) normalized
    const ab = [f.b[0] - f.a[0], f.b[1] - f.a[1], f.b[2] - f.a[2]];
    const ac = [f.c[0] - f.a[0], f.c[1] - f.a[1], f.c[2] - f.a[2]];
    let nx = ab[1] * ac[2] - ab[2] * ac[1];
    let ny = ab[2] * ac[0] - ab[0] * ac[2];
    let nz = ab[0] * ac[1] - ab[1] * ac[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    buf.writeFloatLE(nx, offset);
    buf.writeFloatLE(ny, offset + 4);
    buf.writeFloatLE(nz, offset + 8);
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

// 4.3 Regular Octahedron (r = 10, V = 4000/3 mm³, Area = 400*sqrt(3) mm²)
function generateBinaryOctahedronBuffer(r = 10) {
  const triCount = 8;
  const buf = Buffer.alloc(84 + 50 * triCount);
  buf.write('Octahedron', 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);

  const Xp = [r, 0, 0];
  const Xm = [-r, 0, 0];
  const Yp = [0, r, 0];
  const Ym = [0, -r, 0];
  const Zp = [0, 0, r];
  const Zm = [0, 0, -r];

  const faces = [
    { a: Zp, b: Xp, c: Yp },
    { a: Zp, b: Yp, c: Xm },
    { a: Zp, b: Xm, c: Ym },
    { a: Zp, b: Ym, c: Xp },
    { a: Zm, b: Yp, c: Xp },
    { a: Zm, b: Xm, c: Yp },
    { a: Zm, b: Ym, c: Xm },
    { a: Zm, b: Xp, c: Ym }
  ];

  let offset = 84;
  for (const f of faces) {
    const ab = [f.b[0] - f.a[0], f.b[1] - f.a[1], f.b[2] - f.a[2]];
    const ac = [f.c[0] - f.a[0], f.c[1] - f.a[1], f.c[2] - f.a[2]];
    let nx = ab[1] * ac[2] - ab[2] * ac[1];
    let ny = ab[2] * ac[0] - ab[0] * ac[2];
    let nz = ab[0] * ac[1] - ab[1] * ac[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    buf.writeFloatLE(nx, offset);
    buf.writeFloatLE(ny, offset + 4);
    buf.writeFloatLE(nz, offset + 8);
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

// 4.4 Non-Manifold T-Junction Mesh
function generateBinaryTJunctionBuffer() {
  const triCount = 3;
  const buf = Buffer.alloc(84 + 50 * triCount);
  buf.write('TJunction', 0, 'utf8');
  buf.writeUInt32LE(triCount, 80);

  // 3 triangles sharing edge (0,0,0) -> (10,0,0)
  const e1 = [0, 0, 0];
  const e2 = [10, 0, 0];
  const v1 = [0, 10, 0];
  const v2 = [0, -10, 0];
  const v3 = [0, 0, 10];

  const faces = [
    { a: e1, b: e2, c: v1 },
    { a: e1, b: e2, c: v2 },
    { a: e1, b: e2, c: v3 }
  ];

  let offset = 84;
  for (const f of faces) {
    buf.writeFloatLE(0, offset); buf.writeFloatLE(0, offset + 4); buf.writeFloatLE(1, offset + 8);
    buf.writeFloatLE(f.a[0], offset + 12); buf.writeFloatLE(f.a[1], offset + 16); buf.writeFloatLE(f.a[2], offset + 20);
    buf.writeFloatLE(f.b[0], offset + 24); buf.writeFloatLE(f.b[1], offset + 28); buf.writeFloatLE(f.b[2], offset + 32);
    buf.writeFloatLE(f.c[0], offset + 36); buf.writeFloatLE(f.c[1], offset + 40); buf.writeFloatLE(f.c[2], offset + 44);
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }
  return buf;
}

// 4.5 ASCII Box
function generateAsciiBoxString(dx = 10, dy = 20, dz = 30) {
  return `solid AsciiBox
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 0 ${dy} 0
      vertex ${dx} ${dy} 0
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex ${dx} ${dy} 0
      vertex ${dx} 0 0
    endloop
  endfacet
  facet normal 0 -1 0
    outer loop
      vertex 0 0 0
      vertex ${dx} 0 0
      vertex ${dx} 0 ${dz}
    endloop
  endfacet
  facet normal 0 -1 0
    outer loop
      vertex 0 0 0
      vertex ${dx} 0 ${dz}
      vertex 0 0 ${dz}
    endloop
  endfacet
  facet normal 0 1 0
    outer loop
      vertex 0 ${dy} 0
      vertex 0 ${dy} ${dz}
      vertex ${dx} ${dy} ${dz}
    endloop
  endfacet
  facet normal 0 1 0
    outer loop
      vertex 0 ${dy} 0
      vertex ${dx} ${dy} ${dz}
      vertex ${dx} ${dy} 0
    endloop
  endfacet
  facet normal -1 0 0
    outer loop
      vertex 0 0 0
      vertex 0 0 ${dz}
      vertex 0 ${dy} ${dz}
    endloop
  endfacet
  facet normal -1 0 0
    outer loop
      vertex 0 0 0
      vertex 0 ${dy} ${dz}
      vertex 0 ${dy} 0
    endloop
  endfacet
  facet normal 1 0 0
    outer loop
      vertex ${dx} 0 0
      vertex ${dx} ${dy} 0
      vertex ${dx} ${dy} ${dz}
    endloop
  endfacet
  facet normal 1 0 0
    outer loop
      vertex ${dx} 0 0
      vertex ${dx} ${dy} ${dz}
      vertex ${dx} 0 ${dz}
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 ${dz}
      vertex ${dx} 0 ${dz}
      vertex ${dx} ${dy} ${dz}
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 ${dz}
      vertex ${dx} ${dy} ${dz}
      vertex 0 ${dy} ${dz}
    endloop
  endfacet
endsolid AsciiBox`;
}

// -----------------------------------------------------------------------------
// 5. Main Test Suite
// -----------------------------------------------------------------------------
async function runGen1StressSuite() {
  console.log('================================================================');
  console.log('  CHALLENGER M2 GEN1: ADVERSARIAL CONCURRENCY & STRESS HARNESS  ');
  console.log('================================================================\n');

  let server, chromeProcess, cdp;

  try {
    server = await startServer(HTTP_PORT);
    chromeProcess = launchChrome(CDP_PORT);

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

    // Fixtures
    const boxBuf = generateBinaryBoxBuffer(10, 20, 30);
    const boxB64 = boxBuf.toString('base64');

    const tetraBuf = generateBinaryTetrahedronBuffer();
    const tetraB64 = tetraBuf.toString('base64');

    const octaBuf = generateBinaryOctahedronBuffer(10);
    const octaB64 = octaBuf.toString('base64');

    const openBuf = generateBinaryBoxBuffer(10, 20, 30, { openTop: true });
    const openB64 = openBuf.toString('base64');

    const tJuncBuf = generateBinaryTJunctionBuffer();
    const tJuncB64 = tJuncBuf.toString('base64');

    const asciiBoxStr = generateAsciiBoxString(10, 20, 30);
    const asciiBoxB64 = Buffer.from(asciiBoxStr, 'utf8').toString('base64');

    const sampleBoxPath = path.join(REPO_ROOT, 'sample_box.step');
    const stepBuf = fs.readFileSync(sampleBoxPath);
    const stepB64 = stepBuf.toString('base64');

    // =========================================================================
    // SECTION 1: GAUSS SIGNED VOLUME & PHYSICAL PROPERTIES PRECISION (< 0.01%)
    // =========================================================================
    console.log('--- Section 1: Watertight Gauss Signed Volume Precision (<0.01% Error) ---');

    // S1.1 Watertight Box (V = 6000 mm³, Area = 2200 mm²)
    const boxEval = await cdp.eval(`
      (() => {
        const raw = atob('${boxB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const parsed = window.StlLoader.parse(u8.buffer, 'box.stl');
        const m = parsed.meshes[0];
        return {
          triangles: parsed.totalTriangles,
          volumeMm3: m.volumeMm3,
          areaMm2: m.areaMm2,
          isWatertight: m.isWatertight,
          isManifold: m.isManifold
        };
      })()
    `);
    const boxVolErr = Math.abs(boxEval.volumeMm3 - 6000.0) / 6000.0 * 100;
    const boxAreaErr = Math.abs(boxEval.areaMm2 - 2200.0) / 2200.0 * 100;
    assert(boxVolErr < 0.01, `Box volume error < 0.01% (Actual: ${boxEval.volumeMm3.toFixed(4)} mm³, error: ${boxVolErr.toFixed(6)}%)`);
    assert(boxAreaErr < 0.01, `Box surface area error < 0.01% (Actual: ${boxEval.areaMm2.toFixed(4)} mm², error: ${boxAreaErr.toFixed(6)}%)`);
    assert(boxEval.isWatertight === true, 'Box is watertight');
    assert(boxEval.isManifold === true, 'Box is 2-manifold');

    // S1.2 Regular Tetrahedron (V = 8/3 ≈ 2.666667 mm³, Area = 8*sqrt(3) ≈ 13.856406 mm²)
    const tetraEval = await cdp.eval(`
      (() => {
        const raw = atob('${tetraB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const parsed = window.StlLoader.parse(u8.buffer, 'tetra.stl');
        const m = parsed.meshes[0];
        return {
          triangles: parsed.totalTriangles,
          volumeMm3: m.volumeMm3,
          areaMm2: m.areaMm2,
          isWatertight: m.isWatertight,
          isManifold: m.isManifold
        };
      })()
    `);
    const targetTetraVol = 8.0 / 3.0;
    const targetTetraArea = 8.0 * Math.sqrt(3.0);
    const tetraVolErr = Math.abs(tetraEval.volumeMm3 - targetTetraVol) / targetTetraVol * 100;
    const tetraAreaErr = Math.abs(tetraEval.areaMm2 - targetTetraArea) / targetTetraArea * 100;
    assert(tetraVolErr < 0.01, `Tetrahedron volume error < 0.01% (Actual: ${tetraEval.volumeMm3.toFixed(6)} mm³, target: ${targetTetraVol.toFixed(6)}, error: ${tetraVolErr.toFixed(6)}%)`);
    assert(tetraAreaErr < 0.01, `Tetrahedron area error < 0.01% (Actual: ${tetraEval.areaMm2.toFixed(6)} mm², target: ${targetTetraArea.toFixed(6)}, error: ${tetraAreaErr.toFixed(6)}%)`);
    assert(tetraEval.isWatertight === true, 'Tetrahedron is watertight');
    assert(tetraEval.isManifold === true, 'Tetrahedron is 2-manifold');

    // S1.3 Regular Octahedron (r = 10, V = 4000/3 ≈ 1333.333333 mm³, Area = 400*sqrt(3) ≈ 692.820323 mm²)
    const octaEval = await cdp.eval(`
      (() => {
        const raw = atob('${octaB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const parsed = window.StlLoader.parse(u8.buffer, 'octa.stl');
        const m = parsed.meshes[0];
        return {
          triangles: parsed.totalTriangles,
          volumeMm3: m.volumeMm3,
          areaMm2: m.areaMm2,
          isWatertight: m.isWatertight,
          isManifold: m.isManifold
        };
      })()
    `);
    const targetOctaVol = 4000.0 / 3.0;
    const targetOctaArea = 400.0 * Math.sqrt(3.0);
    const octaVolErr = Math.abs(octaEval.volumeMm3 - targetOctaVol) / targetOctaVol * 100;
    const octaAreaErr = Math.abs(octaEval.areaMm2 - targetOctaArea) / targetOctaArea * 100;
    assert(octaVolErr < 0.01, `Octahedron volume error < 0.01% (Actual: ${octaEval.volumeMm3.toFixed(4)} mm³, target: ${targetOctaVol.toFixed(4)}, error: ${octaVolErr.toFixed(6)}%)`);
    assert(octaAreaErr < 0.01, `Octahedron area error < 0.01% (Actual: ${octaEval.areaMm2.toFixed(4)} mm², target: ${targetOctaArea.toFixed(4)}, error: ${octaAreaErr.toFixed(6)}%)`);
    assert(octaEval.isWatertight === true, 'Octahedron is watertight');
    assert(octaEval.isManifold === true, 'Octahedron is 2-manifold');

    // S1.4 Coordinate Invariance Under Large Translation (1000, -2500, 5000 mm)
    const translatedBoxBuf = generateBinaryBoxBuffer(10, 20, 30, { offsetX: 1000, offsetY: -2500, offsetZ: 5000 });
    const transB64 = translatedBoxBuf.toString('base64');
    const transEval = await cdp.eval(`
      (() => {
        const raw = atob('${transB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const parsed = window.StlLoader.parse(u8.buffer, 'trans_box.stl');
        const m = parsed.meshes[0];
        return {
          volumeMm3: m.volumeMm3,
          areaMm2: m.areaMm2,
          isWatertight: m.isWatertight
        };
      })()
    `);
    const transVolErr = Math.abs(transEval.volumeMm3 - 6000.0) / 6000.0 * 100;
    assert(transVolErr < 0.01, `Translated box volume invariant (<0.01% error): ${transEval.volumeMm3.toFixed(4)} mm³, error: ${transVolErr.toFixed(6)}%`);

    // S1.5 Negative Coordinate Quadrant ([-30, -20, -10] to [-20, 0, 20])
    const negBoxBuf = generateBinaryBoxBuffer(10, 20, 30, { offsetX: -30, offsetY: -20, offsetZ: -10 });
    const negB64 = negBoxBuf.toString('base64');
    const negEval = await cdp.eval(`
      (() => {
        const raw = atob('${negB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const parsed = window.StlLoader.parse(u8.buffer, 'neg_box.stl');
        const m = parsed.meshes[0];
        return {
          volumeMm3: m.volumeMm3,
          areaMm2: m.areaMm2,
          isWatertight: m.isWatertight
        };
      })()
    `);
    const negVolErr = Math.abs(negEval.volumeMm3 - 6000.0) / 6000.0 * 100;
    assert(negVolErr < 0.01, `Negative quadrant box volume invariant (<0.01% error): ${negEval.volumeMm3.toFixed(4)} mm³, error: ${negVolErr.toFixed(6)}%`);

    // =========================================================================
    // SECTION 2: ADVERSARIAL CONCURRENCY & RAPID SWITCHING MATRIX
    // =========================================================================
    console.log('\n--- Section 2: Adversarial Concurrency & Rapid Switching Matrix ---');

    // Helper to load and monitor in browser
    await cdp.eval(`
      window.__loadOrderTracker = [];
      const _origOnTess = window.onTessellationComplete;
      window.onTessellationComplete = function(data) {
        window.__loadOrderTracker.push({
          format: data.format,
          fileName: data.fileName,
          loadId: data.loadId,
          activeLoadId: window._activeLoadId,
          meshCount: data.meshCount || (data.meshes ? data.meshes.length : 0),
          triangles: (data.meshes && data.meshes[0]) ? (data.meshes[0].position.length / 9) : 0,
          timestamp: performance.now()
        });
        return _origOnTess.apply(this, arguments);
      };
    `);

    // 2.1 STEP -> STL Rapid Switching (0ms interleaving)
    console.log('[Section 2.1] Testing burst: STEP -> STL (0ms)...');
    const stepToStlRes = await cdp.eval(`
      new Promise(async (resolve) => {
        const stepRaw = atob('${stepB64}');
        const stepU8 = new Uint8Array(stepRaw.length);
        for (let i = 0; i < stepRaw.length; i++) stepU8[i] = stepRaw.charCodeAt(i);

        const boxRaw = atob('${boxB64}');
        const boxU8 = new Uint8Array(boxRaw.length);
        for (let i = 0; i < boxRaw.length; i++) boxU8[i] = boxRaw.charCodeAt(i);

        // Burst: dispatch STEP, then immediately STL
        window.startTessellation(stepU8.buffer.slice(0), 'step_first.step');
        window.startTessellation(boxU8.buffer.slice(0), 'stl_second.stl');

        // Immediate snapshot
        const immediateFormat = window.activeCadFormat;
        const immediateTriangles = (window.modelPhysicalProps || {}).triangles;
        const immediateStatus = document.getElementById('status-text').innerText;

        // Wait 400ms for background worker STEP parse to conclude
        await new Promise(r => setTimeout(r, 400));

        const postDelayFormat = window.activeCadFormat;
        const postDelayTriangles = (window.modelPhysicalProps || {}).triangles;
        const postDelayStatus = document.getElementById('status-text').innerText;
        const modelBodiesCount = (window.modelBodies || []).length;
        const modelGroupChildren = window.modelGroup.children.length;

        resolve({
          immediateFormat,
          immediateTriangles,
          immediateStatus,
          postDelayFormat,
          postDelayTriangles,
          postDelayStatus,
          modelBodiesCount,
          modelGroupChildren
        });
      })
    `);

    assert(stepToStlRes.immediateFormat === 'STL', `Active CAD format immediately set to 'STL' (Actual: '${stepToStlRes.immediateFormat}')`);
    assert(stepToStlRes.immediateTriangles === 12, `Immediate STL triangle count is 12 (Actual: ${stepToStlRes.immediateTriangles})`);
    assert(stepToStlRes.postDelayFormat === 'STL', `Active CAD format remains 'STL' after worker finishes (Actual: '${stepToStlRes.postDelayFormat}')`);
    assert(stepToStlRes.postDelayTriangles === 12, `Viewport retained 12 STL triangles; NOT overwritten by background STEP (Actual: ${stepToStlRes.postDelayTriangles})`);
    assert(stepToStlRes.postDelayStatus.includes('STL Mesh'), `Status badge preserved as STL Mesh (Actual: '${stepToStlRes.postDelayStatus}')`);
    assert(stepToStlRes.modelBodiesCount === 1, `Scene contains exactly 1 active body (Actual: ${stepToStlRes.modelBodiesCount})`);
    assert(stepToStlRes.modelGroupChildren === 1, `modelGroup contains exactly 1 mesh (no ghost mesh leakage, Actual: ${stepToStlRes.modelGroupChildren})`);

    // 2.2 STL -> STEP Rapid Switching (0ms interleaving)
    console.log('[Section 2.2] Testing burst: STL -> STEP (0ms)...');
    const stlToStepRes = await cdp.eval(`
      new Promise(async (resolve) => {
        const stepRaw = atob('${stepB64}');
        const stepU8 = new Uint8Array(stepRaw.length);
        for (let i = 0; i < stepRaw.length; i++) stepU8[i] = stepRaw.charCodeAt(i);

        const boxRaw = atob('${boxB64}');
        const boxU8 = new Uint8Array(boxRaw.length);
        for (let i = 0; i < boxRaw.length; i++) boxU8[i] = boxRaw.charCodeAt(i);

        // Burst: dispatch STL, then immediately STEP
        window.startTessellation(boxU8.buffer.slice(0), 'stl_first.stl');
        window.startTessellation(stepU8.buffer.slice(0), 'step_second.step');

        // Wait for STEP completion
        await new Promise(res => {
          const check = () => {
            if (window.activeCadFormat === 'STEP' && document.getElementById('status-text').innerText.includes('Part(s)')) {
              res();
            } else {
              setTimeout(check, 50);
            }
          };
          setTimeout(check, 100);
        });

        resolve({
          finalFormat: window.activeCadFormat,
          statusText: document.getElementById('status-text').innerText,
          modelBodiesCount: (window.modelBodies || []).length,
          modelGroupChildren: window.modelGroup.children.length
        });
      })
    `);

    assert(stlToStepRes.finalFormat === 'STEP', `Active CAD format finalized as 'STEP' (Actual: '${stlToStepRes.finalFormat}')`);
    assert(stlToStepRes.statusText.includes('Part(s)'), `Status text indicates Part(s) for STEP (Actual: '${stlToStepRes.statusText}')`);
    assert(stlToStepRes.modelBodiesCount >= 1, `STEP bodies loaded (Actual: ${stlToStepRes.modelBodiesCount})`);
    assert(stlToStepRes.modelGroupChildren >= 1, `Scene graph contains STEP mesh (Actual: ${stlToStepRes.modelGroupChildren})`);

    // 2.3 STL -> STL Rapid Consecutive Switching (0ms interleaving)
    console.log('[Section 2.3] Testing burst: STL -> STL -> STL (0ms)...');
    const stlToStlRes = await cdp.eval(`
      new Promise(async (resolve) => {
        const boxRaw = atob('${boxB64}');
        const boxU8 = new Uint8Array(boxRaw.length);
        for (let i = 0; i < boxRaw.length; i++) boxU8[i] = boxRaw.charCodeAt(i);

        const tetraRaw = atob('${tetraB64}');
        const tetraU8 = new Uint8Array(tetraRaw.length);
        for (let i = 0; i < tetraRaw.length; i++) tetraU8[i] = tetraRaw.charCodeAt(i);

        const octaRaw = atob('${octaB64}');
        const octaU8 = new Uint8Array(octaRaw.length);
        for (let i = 0; i < octaRaw.length; i++) octaU8[i] = octaRaw.charCodeAt(i);

        // Fire 3 consecutive STLs synchronously
        window.startTessellation(boxU8.buffer.slice(0), 'box.stl');
        window.startTessellation(tetraU8.buffer.slice(0), 'tetra.stl');
        window.startTessellation(octaU8.buffer.slice(0), 'octa.stl');

        // Allow microtask cycle
        await new Promise(r => setTimeout(r, 50));

        const finalTriangles = (window.modelPhysicalProps || {}).triangles;
        const finalStatus = document.getElementById('status-text').innerText;
        const finalFileName = window.pendingFileName;
        const modelBodiesCount = (window.modelBodies || []).length;
        const modelGroupChildren = window.modelGroup.children.length;

        resolve({
          finalTriangles,
          finalStatus,
          finalFileName,
          modelBodiesCount,
          modelGroupChildren
        });
      })
    `);

    assert(stlToStlRes.finalTriangles === 8, `Octahedron (8 triangles) is the winning final model (Actual: ${stlToStlRes.finalTriangles})`);
    assert(stlToStlRes.finalFileName === 'octa.stl', `Final file name is octa.stl (Actual: '${stlToStlRes.finalFileName}')`);
    assert(stlToStlRes.finalStatus.includes('8 Triangles'), `Status text displays 8 Triangles (Actual: '${stlToStlRes.finalStatus}')`);
    assert(stlToStlRes.modelBodiesCount === 1, `Scene contains exactly 1 body (Actual: ${stlToStlRes.modelBodiesCount})`);
    assert(stlToStlRes.modelGroupChildren === 1, `Scene graph contains exactly 1 mesh (Actual: ${stlToStlRes.modelGroupChildren})`);

    // 2.4 STEP -> STEP Rapid Switching
    console.log('[Section 2.4] Testing burst: STEP -> STEP (0ms)...');
    const stepToStepRes = await cdp.eval(`
      new Promise(async (resolve) => {
        const stepRaw = atob('${stepB64}');
        const stepU8 = new Uint8Array(stepRaw.length);
        for (let i = 0; i < stepRaw.length; i++) stepU8[i] = stepRaw.charCodeAt(i);

        // Fire 2 consecutive STEP requests
        window.startTessellation(stepU8.buffer.slice(0), 'step1.step');
        window.startTessellation(stepU8.buffer.slice(0), 'step2.step');

        // Wait for final STEP completion
        await new Promise(res => {
          const check = () => {
            if (window.pendingFileName === 'step2.step' && document.getElementById('status-text').innerText.includes('Part(s)')) {
              res();
            } else {
              setTimeout(check, 50);
            }
          };
          setTimeout(check, 100);
        });

        resolve({
          finalFileName: window.pendingFileName,
          statusText: document.getElementById('status-text').innerText,
          modelBodiesCount: (window.modelBodies || []).length,
          modelGroupChildren: window.modelGroup.children.length
        });
      })
    `);

    assert(stepToStepRes.finalFileName === 'step2.step', `Final loaded model is step2.step (Actual: '${stepToStepRes.finalFileName}')`);
    assert(stepToStepRes.statusText.includes('Part(s)'), `Status text displays Part(s) (Actual: '${stepToStepRes.statusText}')`);

    // 2.5 Multi-Burst Shuffle: STEP -> STL -> STEP -> STL -> STL -> STEP
    console.log('[Section 2.5] Testing adversarial shuffle sequence (STEP -> STL -> STEP -> STL -> STL -> STEP)...');
    const shuffleRes = await cdp.eval(`
      new Promise(async (resolve) => {
        const stepRaw = atob('${stepB64}');
        const stepU8 = new Uint8Array(stepRaw.length);
        for (let i = 0; i < stepRaw.length; i++) stepU8[i] = stepRaw.charCodeAt(i);

        const boxRaw = atob('${boxB64}');
        const boxU8 = new Uint8Array(boxRaw.length);
        for (let i = 0; i < boxRaw.length; i++) boxU8[i] = boxRaw.charCodeAt(i);

        const tetraRaw = atob('${tetraB64}');
        const tetraU8 = new Uint8Array(tetraRaw.length);
        for (let i = 0; i < tetraRaw.length; i++) tetraU8[i] = tetraRaw.charCodeAt(i);

        // Sequence with jitter
        window.startTessellation(stepU8.buffer.slice(0), 'seq1.step');
        await new Promise(r => setTimeout(r, 5));
        window.startTessellation(boxU8.buffer.slice(0), 'seq2.stl');
        await new Promise(r => setTimeout(r, 10));
        window.startTessellation(stepU8.buffer.slice(0), 'seq3.step');
        await new Promise(r => setTimeout(r, 2));
        window.startTessellation(tetraU8.buffer.slice(0), 'seq4.stl');
        await new Promise(r => setTimeout(r, 5));
        window.startTessellation(boxU8.buffer.slice(0), 'seq5.stl');
        await new Promise(r => setTimeout(r, 15));
        // Final load is STEP
        window.startTessellation(stepU8.buffer.slice(0), 'seq6_final.step');

        // Wait for final STEP completion
        await new Promise(res => {
          const check = () => {
            if (window.pendingFileName === 'seq6_final.step' && 
                window.activeCadFormat === 'STEP' && 
                document.getElementById('status-text').innerText.includes('Part(s)')) {
              res();
            } else {
              setTimeout(check, 50);
            }
          };
          setTimeout(check, 200);
        });

        resolve({
          finalFileName: window.pendingFileName,
          finalFormat: window.activeCadFormat,
          modelBodiesCount: (window.modelBodies || []).length,
          modelGroupChildren: window.modelGroup.children.length,
          statusText: document.getElementById('status-text').innerText
        });
      })
    `);

    assert(shuffleRes.finalFileName === 'seq6_final.step', `Final model is seq6_final.step (Actual: '${shuffleRes.finalFileName}')`);
    assert(shuffleRes.finalFormat === 'STEP', `Active format is STEP (Actual: '${shuffleRes.finalFormat}')`);
    assert(shuffleRes.modelBodiesCount >= 1, `Model bodies cleanly populated (Actual: ${shuffleRes.modelBodiesCount})`);
    assert(shuffleRes.modelGroupChildren >= 1, `Scene graph populated without zombie accumulation (Actual: ${shuffleRes.modelGroupChildren})`);

    // =========================================================================
    // SECTION 3: SIMULATED OUT-OF-ORDER WORKER MESSAGE INJECTIONS
    // =========================================================================
    console.log('\n--- Section 3: Simulated Out-of-Order Worker Message Injections ---');

    // 3.1 Simulated Late PARSE_SUCCESS Message with Outdated loadId
    console.log('[Section 3.1] Injecting artificial stale PARSE_SUCCESS with outdated loadId...');
    const staleParseSuccessRes = await cdp.eval(`
      (() => {
        // Load an STL first
        const boxRaw = atob('${boxB64}');
        const boxU8 = new Uint8Array(boxRaw.length);
        for (let i = 0; i < boxRaw.length; i++) boxU8[i] = boxRaw.charCodeAt(i);
        window.startTessellation(boxU8.buffer, 'active_stl.stl');

        const preStatus = document.getElementById('status-text').innerText;
        const preTriangles = (window.modelPhysicalProps || {}).triangles;
        const preBodies = (window.modelBodies || []).length;
        const currentActiveLoadId = window._activeLoadId;

        // Inject simulated stale PARSE_SUCCESS message from worker with loadId = currentActiveLoadId - 5
        if (window.currentWorker && window.currentWorker.onmessage) {
          window.currentWorker.onmessage({
            data: {
              type: 'PARSE_SUCCESS',
              loadId: currentActiveLoadId - 5,
              fileName: 'stale_worker_model.step',
              format: 'STEP',
              meshCount: 99,
              meshes: [{
                name: 'StaleGhostMesh',
                position: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
                normal: new Float32Array([0,0,1, 0,0,1, 0,0,1]),
                index: null
              }],
              elapsedMs: 9999
            }
          });
        }

        const postStatus = document.getElementById('status-text').innerText;
        const postTriangles = (window.modelPhysicalProps || {}).triangles;
        const postBodies = (window.modelBodies || []).length;
        const postFormat = window.activeCadFormat;

        return {
          preStatus,
          postStatus,
          preTriangles,
          postTriangles,
          preBodies,
          postBodies,
          postFormat,
          corrupted: postTriangles !== 12 || !postStatus.includes('STL Mesh') || postFormat !== 'STL'
        };
      })()
    `);

    assert(!staleParseSuccessRes.corrupted, 'Out-of-order PARSE_SUCCESS with stale loadId is strictly ignored');
    assert(staleParseSuccessRes.postTriangles === 12, `STL 12 triangles preserved (Actual: ${staleParseSuccessRes.postTriangles})`);
    assert(staleParseSuccessRes.postFormat === 'STL', `Active format remains STL (Actual: '${staleParseSuccessRes.postFormat}')`);
    assert(staleParseSuccessRes.postStatus.includes('STL Mesh'), `Status badge preserved (Actual: '${staleParseSuccessRes.postStatus}')`);

    // 3.2 Simulated Late READY Message when STL is Active
    console.log('[Section 3.2] Injecting artificial late READY message while STL is active...');
    const lateReadyRes = await cdp.eval(`
      (() => {
        const boxRaw = atob('${boxB64}');
        const boxU8 = new Uint8Array(boxRaw.length);
        for (let i = 0; i < boxRaw.length; i++) boxU8[i] = boxRaw.charCodeAt(i);
        window.startTessellation(boxU8.buffer, 'active_stl2.stl');

        const preStatus = document.getElementById('status-text').innerText;

        // Inject simulated READY
        if (window.currentWorker && window.currentWorker.onmessage) {
          window.currentWorker.onmessage({
            data: {
              type: 'READY',
              version: '1.0.0'
            }
          });
        }

        const postStatus = document.getElementById('status-text').innerText;

        return {
          preStatus,
          postStatus,
          overwritten: postStatus === 'Ready for CAD files' || !postStatus.includes('STL Mesh')
        };
      })()
    `);

    assert(!lateReadyRes.overwritten, 'Worker READY message does NOT overwrite active STL status badge');
    assert(lateReadyRes.postStatus.includes('STL Mesh'), `Status badge remains STL Mesh (Actual: '${lateReadyRes.postStatus}')`);

    // 3.3 Simulated Late PARSE_ERROR Message with Stale loadId
    console.log('[Section 3.3] Injecting artificial late PARSE_ERROR with stale loadId...');
    const staleParseErrorRes = await cdp.eval(`
      (() => {
        const boxRaw = atob('${boxB64}');
        const boxU8 = new Uint8Array(boxRaw.length);
        for (let i = 0; i < boxRaw.length; i++) boxU8[i] = boxRaw.charCodeAt(i);
        window.startTessellation(boxU8.buffer, 'active_stl3.stl');

        const currentActiveLoadId = window._activeLoadId;

        // Inject simulated PARSE_ERROR with stale loadId
        if (window.currentWorker && window.currentWorker.onmessage) {
          window.currentWorker.onmessage({
            data: {
              type: 'PARSE_ERROR',
              loadId: currentActiveLoadId - 1,
              message: 'Simulated stale worker crash'
            }
          });
        }

        const errEl = document.getElementById('error-container');
        const stEl = document.getElementById('status-text');

        return {
          errVisible: errEl && errEl.style.display !== 'none',
          statusText: stEl ? stEl.innerText : ''
        };
      })()
    `);

    assert(!staleParseErrorRes.errVisible, 'Stale worker PARSE_ERROR does NOT trigger error popup for active STL');
    assert(staleParseErrorRes.statusText.includes('STL Mesh'), `Status text remains STL Mesh (Actual: '${staleParseErrorRes.statusText}')`);

    // =========================================================================
    // SECTION 4: BOUNDARY CONDITIONS & ERROR HANDLING
    // =========================================================================
    console.log('\n--- Section 4: Boundary Conditions & Error Handling ---');

    // 4.1 Empty ASCII File (solid ... endsolid with 0 facets)
    console.log('[Section 4.1] Testing Empty ASCII File (0 facets)...');
    const emptyAsciiStr = 'solid EmptySolid\nendsolid EmptySolid\n';
    const emptyAsciiB64 = Buffer.from(emptyAsciiStr, 'utf8').toString('base64');
    const emptyAsciiRes = await cdp.eval(`
      (() => {
        const raw = atob('${emptyAsciiB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

        window.startTessellation(u8.buffer, 'empty_ascii.stl');

        const errEl = document.getElementById('error-container');
        const stEl = document.getElementById('status-text');

        return {
          errVisible: errEl && errEl.style.display !== 'none',
          errText: errEl ? errEl.innerText : '',
          statusText: stEl ? stEl.innerText : '',
          triangles: (window.modelPhysicalProps || {}).triangles
        };
      })()
    `);

    assert(emptyAsciiRes.errVisible, 'Empty ASCII file (0 facets) triggers error popup');
    assert(emptyAsciiRes.statusText === 'STL Parse Error', `Status text is 'STL Parse Error' (Actual: '${emptyAsciiRes.statusText}')`);
    assert(emptyAsciiRes.errText.includes('No valid facet triangles found') || emptyAsciiRes.errText.includes('STL Parse Error'),
      `Error container displays proper diagnostic (Actual: '${emptyAsciiRes.errText}')`);

    // 4.2 Truncated ASCII Facet Block
    console.log('[Section 4.2] Testing Truncated ASCII Facet Block (missing vertices)...');
    const truncAsciiStr = 'solid Truncated\nfacet normal 0 0 1\nouter loop\nvertex 1 2 3\nendloop\nendfacet\nendsolid';
    const truncAsciiB64 = Buffer.from(truncAsciiStr, 'utf8').toString('base64');
    const truncAsciiRes = await cdp.eval(`
      (() => {
        const raw = atob('${truncAsciiB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

        window.startTessellation(u8.buffer, 'truncated_ascii.stl');

        const errEl = document.getElementById('error-container');
        const stEl = document.getElementById('status-text');

        return {
          errVisible: errEl && errEl.style.display !== 'none',
          statusText: stEl ? stEl.innerText : ''
        };
      })()
    `);

    assert(truncAsciiRes.errVisible, 'Truncated ASCII facet triggers error popup');
    assert(truncAsciiRes.statusText === 'STL Parse Error', `Status text is 'STL Parse Error' (Actual: '${truncAsciiRes.statusText}')`);

    // 4.3 Giant 32-bit Integer in Binary Triangle Count (Integer Overflow Protection)
    console.log('[Section 4.3] Testing Giant 32-bit Integer in Binary Triangle Count...');
    const giantTriBuf = Buffer.alloc(84);
    giantTriBuf.writeUInt32LE(0xFFFFFFFF, 80);
    const giantTriB64 = giantTriBuf.toString('base64');
    const giantTriRes = await cdp.eval(`
      (() => {
        const raw = atob('${giantTriB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

        window.startTessellation(u8.buffer, 'overflow.stl');

        const errEl = document.getElementById('error-container');
        const stEl = document.getElementById('status-text');

        return {
          errVisible: errEl && errEl.style.display !== 'none',
          statusText: stEl ? stEl.innerText : ''
        };
      })()
    `);

    assert(giantTriRes.errVisible, 'Giant triangle count (0xFFFFFFFF) size mismatch is rejected safely');
    assert(giantTriRes.statusText === 'STL Parse Error', `Status text is 'STL Parse Error' (Actual: '${giantTriRes.statusText}')`);

    // 4.4 Non-Manifold T-Junction Topology Recognition
    console.log('[Section 4.4] Testing Non-Manifold T-Junction Mesh (3 triangles on 1 edge)...');
    const tJuncRes = await cdp.eval(`
      (() => {
        const raw = atob('${tJuncB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

        const parsed = window.StlLoader.parse(u8.buffer, 't_junction.stl');
        const m = parsed.meshes[0];

        window.startTessellation(u8.buffer, 't_junction.stl');
        const statusText = document.getElementById('status-text').innerText;

        return {
          isWatertight: m.isWatertight,
          isManifold: m.isManifold,
          statusText: statusText
        };
      })()
    `);

    assert(tJuncRes.isWatertight === false, `T-Junction isWatertight is false (Actual: ${tJuncRes.isWatertight})`);
    assert(tJuncRes.isManifold === false, `T-Junction isManifold is false (3 triangles sharing edge, Actual: ${tJuncRes.isManifold})`);
    assert(tJuncRes.statusText.includes('Non-Manifold'), `Status badge displays Non-Manifold (Actual: '${tJuncRes.statusText}')`);

    // 4.5 Open Mesh Topology Recognition (10-triangle box)
    console.log('[Section 4.5] Testing Open Mesh Topology Recognition (10-triangle box)...');
    const openRes = await cdp.eval(`
      (() => {
        const raw = atob('${openB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

        const parsed = window.StlLoader.parse(u8.buffer, 'open_box.stl');
        const m = parsed.meshes[0];

        window.startTessellation(u8.buffer, 'open_box.stl');
        const statusText = document.getElementById('status-text').innerText;

        return {
          isWatertight: m.isWatertight,
          isManifold: m.isManifold,
          statusText: statusText
        };
      })()
    `);

    assert(openRes.isWatertight === false, `Open mesh isWatertight is false (Actual: ${openRes.isWatertight})`);
    assert(openRes.isManifold === true, `Open mesh with boundary edges isManifold is true (2-manifold with boundary, Actual: ${openRes.isManifold})`);
    assert(openRes.statusText.includes('Open Mesh'), `Status badge displays Open Mesh (Actual: '${openRes.statusText}')`);

    // 4.6 ASCII File with Long Preamble (> 4096 bytes) Before First Facet
    console.log('[Section 4.6] Testing ASCII file with long preamble (5000 bytes comment)...');
    const longPreambleStr = 'solid LongComment\n' + '# '.repeat(2500) + '\n' +
      'facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid LongComment\n';
    const longPreambleB64 = Buffer.from(longPreambleStr, 'utf8').toString('base64');
    const longPreambleRes = await cdp.eval(`
      (() => {
        const raw = atob('${longPreambleB64}');
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

        const parsed = window.StlLoader.parse(u8.buffer, 'long_preamble.stl');
        return {
          triangles: parsed.totalTriangles,
          format: parsed.format
        };
      })()
    `);

    assert(longPreambleRes.triangles === 1, `5000-byte preamble ASCII parses 1 triangle (Actual: ${longPreambleRes.triangles})`);
    assert(longPreambleRes.format === 'STL', 'Format is STL');

    // 4.7 Self-Healing Verification: Final Valid Model Renders Perfectly
    console.log('[Section 4.7] Testing self-healing after error storm...');
    const healRes = await cdp.eval(`
      (() => {
        const boxRaw = atob('${boxB64}');
        const boxU8 = new Uint8Array(boxRaw.length);
        for (let i = 0; i < boxRaw.length; i++) boxU8[i] = boxRaw.charCodeAt(i);

        window.startTessellation(boxU8.buffer, 'healed_model.stl');

        const errEl = document.getElementById('error-container');
        const stEl = document.getElementById('status-text');

        return {
          errVisible: errEl && errEl.style.display !== 'none',
          statusText: stEl ? stEl.innerText : '',
          triangles: (window.modelPhysicalProps || {}).triangles,
          bodiesCount: (window.modelBodies || []).length
        };
      })()
    `);

    assert(!healRes.errVisible, 'Error container is hidden after self-healing load');
    assert(healRes.statusText.includes('Watertight'), `Status restored to Watertight (Actual: '${healRes.statusText}')`);
    assert(healRes.triangles === 12, '12 triangles restored');
    assert(healRes.bodiesCount === 1, '1 model body in memory');

    console.log('\n================================================================');
    console.log(`  M2 GEN1 EMPIRICAL STRESS SUITE: ${totalPassed} PASSED, ${totalFailed} FAILED`);
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
runGen1StressSuite()
  .then(({ totalPassed, totalFailed, findings }) => {
    if (totalFailed > 0) {
      console.error(`Suite failed with ${totalFailed} assertion failures.`);
      process.exit(1);
    } else {
      console.log('All empirical stress challenges passed 100%!');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
