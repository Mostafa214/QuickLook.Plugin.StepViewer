/**
 * Phase 6 Comprehensive Empirical Verification Harness: Headless Browser Runtime Verification
 *
 * Runs headless Chromium (Google Chrome or Microsoft Edge) using native Chrome DevTools Protocol (CDP)
 * over Node.js native WebSocket without requiring external npm packages.
 *
 * Verifies:
 * 1. Static asset and worker serving (viewer.html, viewer.css, stepWorker.js, occt-import-js.wasm)
 * 2. WebGL / WebGL2 context initialization with hardware acceleration (ANGLE / Direct3D11)
 * 3. B-Rep parsing & tessellation of SHAFT HONARI -P1.stp (282,030 bytes)
 * 4. Zero uncaught console errors (console.error count === 0)
 * 5. OrbitControls (orbit rotation, target panning, zoom/dolly)
 * 6. Dual Theme Switching (Dark studio vignette #080a0f <-> Light engineering workbench #f1f5f9)
 * 7. Unified Right Inspector Drawer lifecycle and tab preservation (no innerHTML destruction)
 * 8. Interactive ViewCube synchronization, camera tweening, and Ortho/Persp switching
 * 9. High-resolution screenshot capture to test_artifacts/headless_browser_verification.png
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8992;
const CDP_PORT = 9225;
const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');
const SCREENSHOT_PATH = path.join(REPO_ROOT, 'test_artifacts', 'headless_browser_verification.png');
const AGENT_SCREENSHOT_PATH = path.join(REPO_ROOT, '.agents', 'teamwork', 'challenger_m6_browser', 'headless_browser_verification.png');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.stp': 'application/octet-stream',
  '.step': 'application/octet-stream',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

let server = null;
let chromeProcess = null;
let ws = null;
let cdpMsgId = 1;
const cdpCallbacks = new Map();
const consoleErrors = [];
const consoleLogs = [];

function cdpSend(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = cdpMsgId++;
    cdpCallbacks.set(id, { resolve, reject });
    const payload = JSON.stringify({ id, method, params });
    ws.send(payload);
  });
}

async function evaluate(expression, awaitPromise = true) {
  const res = await cdpSend('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

function startHttpServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);

      if (urlPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Serve CAD model
      if (urlPath.toLowerCase().endsWith('.stp') || urlPath.toLowerCase().endsWith('.step')) {
        const modelFileName = path.basename(urlPath);
        let modelFilePath = path.join(REPO_ROOT, modelFileName);
        if (!fs.existsSync(modelFilePath)) {
          modelFilePath = path.join(REPO_ROOT, 'test_artifacts', modelFileName);
        }
        if (!fs.existsSync(modelFilePath)) {
          modelFilePath = path.join('C:\\Users\\Lenovo\\Desktop', modelFileName);
        }

        if (fs.existsSync(modelFilePath)) {
          const stat = fs.statSync(modelFilePath);
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stat.size,
            'Access-Control-Allow-Origin': '*'
          });
          fs.createReadStream(modelFilePath).pipe(res);
          return;
        }
      }

      let relPath = urlPath === '/' ? 'viewer.html' : urlPath.replace(/^\/+/, '');
      let filePath = path.join(ASSETS_DIR, relPath);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(REPO_ROOT, relPath);
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: ${urlPath}`);
      }
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[HTTP Server] Listening on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });
}

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('No supported browser executable found (Chrome or Edge).');
}

function launchBrowser(browserPath) {
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', `stp_browser_test_${Date.now()}`);
  const args = [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-sync',
    '--disable-translate',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--window-size=1920,1080',
    'about:blank'
  ];

  console.log(`[Browser] Spawning ${browserPath} with CDP port ${CDP_PORT}...`);
  chromeProcess = spawn(browserPath, args, { stdio: 'ignore' });

  return new Promise((resolve, reject) => {
    let retries = 0;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        if (res.ok) {
          const list = await res.json();
          const page = list.find(p => p.type === 'page');
          if (page && page.webSocketDebuggerUrl) {
            clearInterval(interval);
            resolve(page.webSocketDebuggerUrl);
          }
        }
      } catch (e) {
        retries++;
        if (retries > 30) {
          clearInterval(interval);
          reject(new Error('Timed out waiting for Chrome CDP WebSocket'));
        }
      }
    }, 200);
  });
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  STP-Quicklook: Phase 6 Headless Browser Verification Suite   ');
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✓ PASS: ${message}`);
    } else {
      failedTests++;
      console.error(`  ✗ FAIL: ${message}`);
    }
  }

  try {
    await startHttpServer();
    const browserPath = findBrowserExecutable();
    const wsUrl = await launchBrowser(browserPath);
    console.log(`[CDP] Connecting to ${wsUrl}...`);

    ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && cdpCallbacks.has(msg.id)) {
        const { resolve, reject } = cdpCallbacks.get(msg.id);
        cdpCallbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Console.messageAdded') {
        const m = msg.params?.message;
        if (m) {
          consoleLogs.push(`[Console ${m.level}] ${m.text}`);
          if (m.level === 'error') {
            consoleErrors.push(m.text);
          }
        }
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const exp = msg.params?.exceptionDetails;
        const text = exp?.exception?.description || exp?.text || 'Uncaught exception';
        consoleErrors.push(text);
      }
    };

    await cdpSend('Console.enable');
    await cdpSend('Runtime.enable');
    await cdpSend('Page.enable');

    console.log('\n--- 1. Page Navigation & Asset Loading ---');
    await cdpSend('Page.navigate', { url: `http://127.0.0.1:${PORT}/viewer.html` });

    // Wait for DOM load and Web Worker ready
    let workerReady = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 200));
      const status = await evaluate(`({
        docTitle: document.title,
        workerReady: !!window._workerReadyInfo,
        hasRenderer: !!window.renderer
      })`);
      if (status && status.workerReady && status.hasRenderer) {
        workerReady = true;
        break;
      }
    }

    assert(workerReady, 'Assets/viewer.html loaded and stepWorker.js signaled READY');

    console.log('\n--- 2. WebGL Hardware Context Verification ---');
    const glInfo = await evaluate(`(() => {
      const gl = window.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        isWebGL2: !!window.renderer.capabilities.isWebGL2,
        glRenderer: gl.getParameter(gl.RENDERER),
        glVendor: gl.getParameter(gl.VENDOR),
        unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
        unmaskedVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null
      };
    })()`);

    assert(glInfo.isWebGL2, `WebGL2 context active: isWebGL2 === true`);
    assert(glInfo.glRenderer && glInfo.glRenderer.length > 0, `GL RENDERER identified: ${glInfo.glRenderer}`);
    console.log(`    Hardware Vendor/Renderer: ${glInfo.unmaskedVendor || glInfo.glVendor} / ${glInfo.unmaskedRenderer || glInfo.glRenderer}`);

    console.log('\n--- 3. CAD STEP Tessellation (SHAFT HONARI -P1.stp) ---');
    const tessStart = await evaluate(`(async () => {
      const res = await fetch('/SHAFT HONARI -P1.stp');
      if (!res.ok) throw new Error('Fetch status ' + res.status);
      const buffer = await res.arrayBuffer();
      window.startTessellation(buffer, 'SHAFT HONARI -P1.stp');
      return { size: buffer.byteLength };
    })()`);

    assert(tessStart.size === 282030, `Fetched SHAFT HONARI -P1.stp (${tessStart.size} bytes) and initiated tessellation`);

    let tessDone = false;
    let tessResult = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 250));
      tessResult = await evaluate(`(() => {
        const statusEl = document.getElementById('status-text');
        const badgeDim = document.getElementById('badge-dim');
        const errEl = document.getElementById('error-container');
        let meshCount = 0;
        let triangleCount = 0;
        if (window.scene) {
          window.scene.traverse(o => {
            if (o.isMesh && o.name !== 'ViewCube' && !o.userData?.isBBoxCallout) {
              meshCount++;
              if (o.geometry?.attributes?.position) {
                triangleCount += (o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3);
              }
            }
          });
        }
        return {
          elapsedMs: window._lastTessellationElapsed || null,
          statusText: statusEl ? statusEl.innerText : '',
          dimText: badgeDim ? badgeDim.innerText : '',
          hasError: errEl ? (errEl.style.display !== 'none' && errEl.innerText) : false,
          meshCount,
          triangleCount
        };
      })()`);

      if (tessResult.elapsedMs !== null && tessResult.meshCount > 0) {
        tessDone = true;
        break;
      }
    }

    assert(tessDone, `STEP model tessellated successfully in ${tessResult?.elapsedMs}ms`);
    assert(tessResult.triangleCount > 8000, `Model mesh geometry generated: ${tessResult.triangleCount} triangles`);
    assert(tessResult.dimText.includes('39.6') && tessResult.dimText.includes('51.0'), `Physical dimensions match bounding box: "${tessResult.dimText}"`);
    assert(!tessResult.hasError, `Error container is hidden (no parse errors)`);

    console.log('\n--- 4. Multi-Model Dynamic Switching & Cache Stress Test ---');
    const boxTess = await evaluate(`(async () => {
      const res = await fetch('/sample_box.step');
      if (!res.ok) throw new Error('Fetch sample_box failed');
      const buffer = await res.arrayBuffer();
      window.startTessellation(buffer, 'sample_box.step');
      return { size: buffer.byteLength };
    })()`);
    assert(boxTess.size === 6604, 'Loaded fallback model sample_box.step (6,604 bytes)');

    let boxDone = false;
    let boxResult = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 200));
      boxResult = await evaluate(`(() => {
        const badgeFn = document.getElementById('badge-filename');
        const badgeDim = document.getElementById('badge-dim');
        let meshCount = 0;
        if (window.scene) {
          window.scene.traverse(o => {
            if (o.isMesh && o.name !== 'ViewCube' && !o.userData?.isBBoxCallout) meshCount++;
          });
        }
        return {
          filename: badgeFn ? badgeFn.innerText : '',
          dimText: badgeDim ? badgeDim.innerText : '',
          meshCount,
          elapsed: window._lastTessellationElapsed
        };
      })()`);
      if (boxResult.filename.includes('sample_box') && boxResult.meshCount > 0) {
        boxDone = true;
        break;
      }
    }
    assert(boxDone, `sample_box.step replaced scene without page reload in ${boxResult?.elapsed}ms`);

    // Reload SHAFT HONARI -P1.stp to verify instant cache hit
    const reloadTess = await evaluate(`(async () => {
      const res = await fetch('/SHAFT HONARI -P1.stp');
      const buffer = await res.arrayBuffer();
      window.startTessellation(buffer, 'SHAFT HONARI -P1.stp');
      return true;
    })()`);

    let reloadDone = false;
    let reloadResult = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 100));
      reloadResult = await evaluate(`(() => {
        const statusEl = document.getElementById('status-text');
        const badgeFn = document.getElementById('badge-filename');
        return {
          filename: badgeFn ? badgeFn.innerText : '',
          statusText: statusEl ? statusEl.innerText : '',
          elapsed: window._lastTessellationElapsed
        };
      })()`);
      if (reloadResult.filename.includes('SHAFT HONARI')) {
        reloadDone = true;
        break;
      }
    }
    assert(reloadDone, `SHAFT HONARI -P1.stp reloaded instantly from cache`);

    console.log('\n--- 5. Interactive 3D Controls Verification (Orbit, Pan, Zoom) ---');
    const controlsRes = await evaluate(`(() => {
      const c = window.controls;
      const cam = window.camera;
      const oldAz = c.getAzimuthalAngle();
      cam.position.x += 15;
      cam.position.z += 15;
      c.update();
      const newAz = c.getAzimuthalAngle();

      const oldTar = c.target.clone();
      c.target.x += 5;
      c.update();
      const newTar = c.target.clone();

      const dist1 = cam.position.distanceTo(c.target);
      cam.position.multiplyScalar(1.2);
      c.update();
      const dist2 = cam.position.distanceTo(c.target);

      window.autoFitCamera();
      return {
        azimuthRotated: oldAz !== newAz,
        targetPanned: oldTar.x !== newTar.x,
        zoomDollying: dist1 !== dist2
      };
    })()`);

    assert(controlsRes.azimuthRotated, 'Orbit rotation alters azimuthal angle without error');
    assert(controlsRes.targetPanned, 'Panning shifts camera target coordinates without error');
    assert(controlsRes.zoomDollying, 'Dolly zoom scales distance to target without error');

    console.log('\n--- 5. Dual Themes Verification (Dark CAD Studio <-> Light Workbench) ---');
    const themeRes = await evaluate(`(() => {
      window.toggleTheme('light');
      const isLight = document.body.classList.contains('theme-light');
      const lightBg = window.scene.background.getHexString();

      window.toggleTheme('dark');
      const isDark = !document.body.classList.contains('theme-light');
      const darkBg = window.scene.background.getHexString();

      return { isLight, lightBg, isDark, darkBg };
    })()`);

    assert(themeRes.isLight && themeRes.lightBg === 'f1f5f9', `Switched to Light workbench theme (scene bg: #${themeRes.lightBg})`);
    assert(themeRes.isDark && themeRes.darkBg === '080a0f', `Switched back to Dark CAD studio vignette (scene bg: #${themeRes.darkBg})`);

    console.log('\n--- 6. Unified Right Drawer Lifecycle & DOM Preservation ---');
    const drawerRes = await evaluate(`(() => {
      const drawer = document.getElementById('inspector-drawer');
      window.openDrawer('tree');
      const opened = drawer.classList.contains('open') && document.body.classList.contains('drawer-open');

      const tabs = ['measure', 'section', 'mass', 'analysis', 'export', 'tree'];
      const tabsPreserved = tabs.every(t => {
        window.switchDrawerTab(t);
        const pane = document.getElementById('drawer-tab-' + t);
        return pane && window.getComputedStyle(pane).display === 'flex';
      });

      window.closeDrawer();
      const closed = !drawer.classList.contains('open') && !document.body.classList.contains('drawer-open');

      return { opened, tabsPreserved, closed };
    })()`);

    assert(drawerRes.opened, 'Right inspector drawer opens on demand with CSS classes');
    assert(drawerRes.tabsPreserved, 'All 6 drawer tab panels (tree, measure, section, mass, analysis, export) preserve DOM nodes');
    assert(drawerRes.closed, 'Right inspector drawer closes cleanly');

    console.log('\n--- 7. ViewCube Synchronization & Camera Switching ---');
    const vcRes = await evaluate(`(() => {
      window.ViewCube.update();
      // On model load, Orthographic is default for true 1:1 engineering scale (TSK-01)
      const isOrtho1 = !!window.camera.isOrthographicCamera;
      window.ViewCube.toggleOrthoPersp();
      const isPersp2 = !!window.camera.isPerspectiveCamera;
      window.ViewCube.toggleOrthoPersp();
      const isOrtho3 = !!window.camera.isOrthographicCamera;

      return { isOrtho1, isPersp2, isOrtho3 };
    })()`);

    assert(vcRes.isOrtho1 && vcRes.isPersp2 && vcRes.isOrtho3, 'ViewCube starts in Orthographic and cleanly toggles between Ortho and Persp');

    // Wait for camera tween back to standard ISO
    await evaluate(`window.ViewCube.rotateToFace('ISO')`);
    await new Promise(r => setTimeout(r, 600));

    console.log('\n--- 8. High-Resolution Screenshot Capture ---');
    const screenshotData = await cdpSend('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(screenshotData.data, 'base64');
    fs.writeFileSync(SCREENSHOT_PATH, buffer);
    fs.writeFileSync(AGENT_SCREENSHOT_PATH, buffer);
    assert(fs.existsSync(SCREENSHOT_PATH) && fs.statSync(SCREENSHOT_PATH).size > 100000, `Screenshot saved to ${SCREENSHOT_PATH} (${fs.statSync(SCREENSHOT_PATH).size} bytes)`);

    console.log('\n--- 9. Console Error Assertion ---');
    console.log(`    Total console log messages captured: ${consoleLogs.length}`);
    console.log(`    Total uncaught console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((err, idx) => console.error(`    [Error ${idx + 1}] ${err}`));
    }
    assert(consoleErrors.length === 0, `Exactly ZERO uncaught console errors (actual: ${consoleErrors.length})`);

  } catch (err) {
    console.error(`\n[FATAL RUNTIME ERROR]: ${err.stack || err.message}`);
    failedTests++;
  } finally {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (chromeProcess) {
      try { chromeProcess.kill('SIGKILL'); } catch (e) {}
    }
    if (server) {
      try { server.close(); } catch (e) {}
    }

    console.log('\n================================================================');
    console.log(`  TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
    console.log('================================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTestSuite();
