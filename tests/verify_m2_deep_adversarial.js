const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8996;
const CDP_PORT = 9229;
const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');

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

let server, chromeProcess, ws;
let cdpMsgId = 1;
const cdpCallbacks = new Map();

function cdpSend(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = cdpMsgId++;
    cdpCallbacks.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await cdpSend('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error('Evaluation exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result ? res.result.value : undefined;
}

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/viewer.html';
      let filePath = path.join(ASSETS_DIR, reqPath);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(REPO_ROOT, reqPath);
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found: ' + reqPath);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', resolve);
  });
}

function spawnChrome() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', `cdp_m2_adv_${Date.now()}`);
  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu-watchdog',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1920,1080',
    'about:blank'
  ];
  chromeProcess = spawn(chromePath, args, { stdio: 'ignore' });
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
          reject(new Error('Timed out waiting for Chrome CDP'));
        }
      }
    }, 200);
  });
}

async function run() {
  try {
    await startServer();
    const wsUrl = await spawnChrome();
    const WS = globalThis.WebSocket;
    ws = new WS(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && cdpCallbacks.has(msg.id)) {
        const cb = cdpCallbacks.get(msg.id);
        cdpCallbacks.delete(msg.id);
        if (msg.error) cb.reject(new Error(msg.error.message));
        else cb.resolve(msg.result);
      }
    };

    await cdpSend('Page.enable');
    await cdpSend('DOM.enable');
    await cdpSend('Runtime.enable');
    await cdpSend('Page.navigate', { url: `http://127.0.0.1:${PORT}/viewer.html` });
    await new Promise(r => setTimeout(r, 1500));

    console.log('=== ADVERSARIAL DEEP PROBE: VIEWPORTS & INTERACTIONS ===\n');

    // 1. Check 680px vertical clearance & scale retention
    await cdpSend('Emulation.setDeviceMetricsOverride', { width: 680, height: 600, deviceScaleFactor: 1, mobile: false });
    await evaluate('WorkbenchUI.closeDrawer();');
    await new Promise(r => setTimeout(r, 200));

    let probe680 = await evaluate(`(() => {
      const vc = document.querySelector('.viewcube-container');
      const hud = document.querySelector('#hud-top-right');
      const vcRect = vc.getBoundingClientRect();
      const hudRect = hud.getBoundingClientRect();
      const vcStyle = window.getComputedStyle(vc);
      return {
        vcRect: { y: vcRect.y, bottom: vcRect.bottom, h: vcRect.height, x: vcRect.x, right: vcRect.right, w: vcRect.width },
        hudRect: { y: hudRect.y, bottom: hudRect.bottom, h: hudRect.height, x: hudRect.x, right: hudRect.right, w: hudRect.width },
        transform: vcStyle.transform,
        vertClearance: hudRect.y - vcRect.bottom
      };
    })()`);
    console.log('680px Drawer CLOSED:');
    console.log(`  ViewCube: y=${probe680.vcRect.y.toFixed(1)}, bottom=${probe680.vcRect.bottom.toFixed(1)}, height=${probe680.vcRect.h.toFixed(1)}`);
    console.log(`  ViewCube computed transform: ${probe680.transform}`);
    console.log(`  HUD Top-Right: y=${probe680.hudRect.y.toFixed(1)}, height=${probe680.hudRect.h.toFixed(1)}`);
    console.log(`  Vertical Clearance: ${probe680.vertClearance.toFixed(1)}px (${probe680.vertClearance > 0 ? 'POSITIVE / PASS' : 'COLLISION / FAIL'})`);

    // 2. Open drawer at 680px and check ViewCube transform and scale
    await evaluate("WorkbenchUI.openDrawer('tree');");
    await new Promise(r => setTimeout(r, 400));
    let probe680Open = await evaluate(`(() => {
      const vc = document.querySelector('.viewcube-container');
      const hud = document.querySelector('#hud-top-right');
      const bHud = document.querySelector('#bottom-hud-cluster');
      const btnUpdate = document.querySelector('#btn-check-update');
      const btnShortcuts = document.querySelector('#btn-toggle-shortcuts');
      const drawer = document.querySelector('.inspector-drawer');

      const vcRect = vc.getBoundingClientRect();
      const hudRect = hud.getBoundingClientRect();
      const bHudRect = bHud.getBoundingClientRect();
      const uRect = btnUpdate.getBoundingClientRect();
      const sRect = btnShortcuts.getBoundingClientRect();
      const dRect = drawer.getBoundingClientRect();

      const vcStyle = window.getComputedStyle(vc);
      const bHudStyle = window.getComputedStyle(bHud);

      // Hit test center of update button
      const uHit = document.elementFromPoint(uRect.x + uRect.width / 2, uRect.y + uRect.height / 2);
      const sHit = document.elementFromPoint(sRect.x + sRect.width / 2, sRect.y + sRect.height / 2);

      return {
        vcRect: { x: vcRect.x, right: vcRect.right, y: vcRect.y, bottom: vcRect.bottom },
        transform: vcStyle.transform,
        vertClearance: hudRect.y - vcRect.bottom,
        bHudRect: { x: bHudRect.x, right: bHudRect.right, y: bHudRect.y, bottom: bHudRect.bottom },
        bHudTransform: bHudStyle.transform,
        drawerRect: { x: dRect.x, right: dRect.right },
        btnUpdateHit: uHit ? uHit.id || uHit.className : null,
        btnUpdateClickable: !!(uHit && (uHit.id === 'btn-check-update' || uHit.closest('#btn-check-update'))),
        btnShortcutsClickable: !!(sHit && (sHit.id === 'btn-toggle-shortcuts' || sHit.closest('#btn-toggle-shortcuts'))),
        drawerOverlapBottomHud: (bHudRect.right > dRect.x)
      };
    })()`);

    console.log('\n680px Drawer OPEN:');
    console.log(`  ViewCube transform: ${probe680Open.transform}`);
    console.log(`  Vertical Clearance: ${probe680Open.vertClearance.toFixed(1)}px`);
    console.log(`  Bottom HUD cluster transform: ${probe680Open.bHudTransform}`);
    console.log(`  Bottom HUD right edge: ${probe680Open.bHudRect.right.toFixed(1)}px vs Drawer left: ${probe680Open.drawerRect.x.toFixed(1)}px`);
    console.log(`  Drawer Overlap Bottom HUD: ${probe680Open.drawerOverlapBottomHud ? 'YES / FAIL' : 'NO / PASS'}`);
    console.log(`  #btn-check-update clickable: ${probe680Open.btnUpdateClickable} (hit: ${probe680Open.btnUpdateHit})`);
    console.log(`  #btn-toggle-shortcuts clickable: ${probe680Open.btnShortcutsClickable}`);

    // 3. Check 960px ViewCube transform and scale
    await cdpSend('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1, mobile: false });
    await evaluate('WorkbenchUI.closeDrawer();');
    await new Promise(r => setTimeout(r, 200));

    let probe960 = await evaluate(`(() => {
      const vc = document.querySelector('.viewcube-container');
      const tb = document.querySelector('.toolbar');
      const hud = document.querySelector('#hud-top-right');

      const vcRect = vc.getBoundingClientRect();
      const tbRect = tb.getBoundingClientRect();
      const hudRect = hud.getBoundingClientRect();
      const vcStyle = window.getComputedStyle(vc);

      return {
        tb: { x: tbRect.x, right: tbRect.right, y: tbRect.y, bottom: tbRect.bottom },
        hud: { x: hudRect.x, right: hudRect.right, y: hudRect.y, bottom: hudRect.bottom },
        vc: { x: vcRect.x, right: vcRect.right, y: vcRect.y, bottom: vcRect.bottom },
        vcTransform: vcStyle.transform,
        tbHudHorizClearance: hudRect.x - tbRect.right,
        tbHudVertClearance: hudRect.y - tbRect.bottom
      };
    })()`);

    console.log('\n960px Drawer CLOSED:');
    console.log(`  Toolbar: right=${probe960.tb.right.toFixed(1)}px, bottom=${probe960.tb.bottom.toFixed(1)}px`);
    console.log(`  HUD Top-Right: left=${probe960.hud.x.toFixed(1)}px, top=${probe960.hud.y.toFixed(1)}px`);
    console.log(`  Horizontal Clearance: ${probe960.tbHudHorizClearance.toFixed(1)}px`);
    console.log(`  Vertical Clearance: ${probe960.tbHudVertClearance.toFixed(1)}px`);
    console.log(`  ViewCube computed transform: ${probe960.vcTransform}`);

    // 4. Open drawer at 960px
    await evaluate("WorkbenchUI.openDrawer('tree');");
    await new Promise(r => setTimeout(r, 400));
    let probe960Open = await evaluate(`(() => {
      const vc = document.querySelector('.viewcube-container');
      const bHud = document.querySelector('#bottom-hud-cluster');
      const btnUpdate = document.querySelector('#btn-check-update');
      const drawer = document.querySelector('.inspector-drawer');
      const vcStyle = window.getComputedStyle(vc);
      const bHudRect = bHud.getBoundingClientRect();
      const dRect = drawer.getBoundingClientRect();
      const uRect = btnUpdate.getBoundingClientRect();
      const uHit = document.elementFromPoint(uRect.x + uRect.width / 2, uRect.y + uRect.height / 2);

      return {
        vcTransform: vcStyle.transform,
        bHudRight: bHudRect.right,
        drawerLeft: dRect.x,
        btnUpdateClickable: !!(uHit && (uHit.id === 'btn-check-update' || uHit.closest('#btn-check-update')))
      };
    })()`);

    console.log('\n960px Drawer OPEN:');
    console.log(`  ViewCube transform: ${probe960Open.vcTransform}`);
    console.log(`  Bottom HUD right=${probe960Open.bHudRight.toFixed(1)}px vs Drawer left=${probe960Open.drawerLeft.toFixed(1)}px`);
    console.log(`  #btn-check-update clickable: ${probe960Open.btnUpdateClickable}`);

  } catch (e) {
    console.error('Probe failed:', e);
  } finally {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
    if (server) server.close();
    process.exit(0);
  }
}

run();
