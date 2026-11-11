// tests/test_challenger_m2_it5_live_cdp.js
// EMPIRICAL CHALLENGER M2-IT5: Live Chrome CDP Hit-Testing & Precision Clearance Probe

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function serveViewer(port) {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png'
  };

  const server = http.createServer((req, res) => {
    let cleanPath = req.url.split('?')[0];
    if (cleanPath === '/') cleanPath = '/viewer.html';

    let filePath = path.join(__dirname, '..', 'Assets', cleanPath);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, '..', cleanPath);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found: ' + cleanPath);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function launchChrome(cdpPort) {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP, 'cdp_challenger_m2_it5_' + Date.now());
  const args = [
    `--remote-debugging-port=${cdpPort}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ];
  return spawn(chromePath, args);
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new (globalThis.WebSocket || require('ws'))(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      const handler = (evt) => {
        const msg = JSON.parse(evt.data || evt);
        if (msg.id === msgId) {
          this.ws.removeEventListener('message', handler);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
      this.ws.addEventListener('message', handler);
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runLiveCDPProbe() {
  const HTTP_PORT = 9055;
  const CDP_PORT = 9255;

  console.log('Starting local HTTP server...');
  const server = await serveViewer(HTTP_PORT);
  console.log(`HTTP server listening on 127.0.0.1:${HTTP_PORT}`);

  console.log('Launching headless Chrome...');
  const chromeProcess = launchChrome(CDP_PORT);
  await new Promise((r) => setTimeout(r, 1500));

  let pageTarget;
  for (let i = 0; i < 10; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
      pageTarget = list.find((t) => t.type === 'page');
      if (pageTarget) break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!pageTarget) {
    throw new Error('Failed to find Chrome page target');
  }

  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  console.log('Connected to Chrome DevTools Protocol.');

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  const testViewports = [
    { name: '1024px Tablet (Key Defect Resolution Target)', width: 1024, height: 768 },
    { name: '961px Boundary Low (Worst-Case Pre-Fix Overlap)', width: 961, height: 768 },
    { name: '960px Boundary Breakpoint', width: 960, height: 768 },
    { name: '970px Intermediate', width: 970, height: 768 },
    { name: '1000px Intermediate', width: 1000, height: 768 },
    { name: '1050px Intermediate', width: 1050, height: 768 },
    { name: '1100px Intermediate', width: 1100, height: 768 },
    { name: '1149px Boundary Low (New Media Query In-Range)', width: 1149, height: 768 },
    { name: '1150px Media Query Breakpoint', width: 1150, height: 768 },
    { name: '1151px Media Query Upper (Desktop Rule Re-Engaged)', width: 1151, height: 768 },
    { name: '1265px Media Query Breakpoint', width: 1265, height: 768 },
    { name: '1266px Desktop Non-Collapsed Toolbar', width: 1266, height: 768 },
    { name: '1280px Standard Desktop', width: 1280, height: 800 }
  ];

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failureDetails = [];

  function record(desc, passed, detail) {
    totalTests++;
    if (passed) {
      passedTests++;
      console.log(`  ✓ PASS: ${desc}`);
    } else {
      failedTests++;
      failureDetails.push(`${desc}: ${detail}`);
      console.error(`  ✗ FAIL: ${desc} -> ${detail}`);
    }
  }

  for (const vp of testViewports) {
    console.log(`\n========================================================================`);
    console.log(`PROBING VIEWPORT: ${vp.width}x${vp.height} (${vp.name})`);
    console.log(`========================================================================`);

    await cdp.setViewport(vp.width, vp.height);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/viewer.html` });
    await new Promise((r) => setTimeout(r, 1000));

    // Disable CSS transitions for deterministic geometry measurement
    await cdp.eval(`
      const style = document.createElement('style');
      style.id = 'disable-transitions';
      style.textContent = '* { transition: none !important; animation: none !important; }';
      document.head.appendChild(style);
    `);

    for (const drawerOpen of [false, true]) {
      const stateLabel = drawerOpen ? 'DRAWER OPEN' : 'DRAWER CLOSED';
      console.log(`\n--- State: ${stateLabel} at ${vp.width}px ---`);

      if (drawerOpen) {
        await cdp.eval(`document.body.classList.add('drawer-open')`);
      } else {
        await cdp.eval(`document.body.classList.remove('drawer-open')`);
      }

      const rects = await cdp.eval(`(() => {
        const getR = sel => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        return {
          hud: getR('#hud-top-right'),
          toolbar: getR('.toolbar'),
          viewcube: getR('#viewcube-container'),
          badge: getR('#badge-filename'),
          btnBbox: getR('#btn-bbox-hud'),
          btnUnits: getR('#btn-units'),
          vcPersp: getR('#vc-btn-persp'),
          vcHome: getR('#vc-btn-home'),
          hints: getR('#hints-bar'),
          btnShortcuts: getR('#btn-toggle-shortcuts')
        };
      })()`);

      // 1. Collision check: HUD vs Toolbar
      const hudTbHorizOverlap = Math.max(0, Math.min(rects.hud.right, rects.toolbar.right) - Math.max(rects.hud.left, rects.toolbar.left));
      const hudTbVertOverlap = Math.max(0, Math.min(rects.hud.bottom, rects.toolbar.bottom) - Math.max(rects.hud.top, rects.toolbar.top));
      const hudTbCollision = hudTbHorizOverlap > 0 && hudTbVertOverlap > 0;

      const tbHudGapDesc = hudTbVertOverlap === 0
        ? `Vert Gap: +${(rects.hud.top - rects.toolbar.bottom).toFixed(1)}px`
        : `Horiz Gap: +${(rects.hud.left - rects.toolbar.right).toFixed(1)}px`;

      record(
        `W=${vp.width}px [${stateLabel}] HUD vs Toolbar Collision Free (${tbHudGapDesc})`,
        !hudTbCollision,
        `Overlap: X=${hudTbHorizOverlap.toFixed(1)}px, Y=${hudTbVertOverlap.toFixed(1)}px`
      );

      // 2. Collision check: HUD vs ViewCube
      const hudVcHorizOverlap = Math.max(0, Math.min(rects.hud.right, rects.viewcube.right) - Math.max(rects.hud.left, rects.viewcube.left));
      const hudVcVertOverlap = Math.max(0, Math.min(rects.hud.bottom, rects.viewcube.bottom) - Math.max(rects.hud.top, rects.viewcube.top));
      const hudVcCollision = hudVcHorizOverlap > 0 && hudVcVertOverlap > 0;

      const hudVcGapDesc = hudVcHorizOverlap === 0
        ? `Horiz Gap: +${(rects.viewcube.left - rects.hud.right).toFixed(1)}px`
        : `Vert Gap: +${(rects.hud.top - rects.viewcube.bottom).toFixed(1)}px`;

      record(
        `W=${vp.width}px [${stateLabel}] HUD vs ViewCube Collision Free (${hudVcGapDesc})`,
        !hudVcCollision,
        `Overlap: X=${hudVcHorizOverlap.toFixed(1)}px, Y=${hudVcVertOverlap.toFixed(1)}px`
      );

      // 3. Collision check: Toolbar vs HUD Badge (Left)
      const badgeTbHorizOverlap = Math.max(0, Math.min(rects.badge.right, rects.toolbar.right) - Math.max(rects.badge.left, rects.toolbar.left));
      const badgeTbVertOverlap = Math.max(0, Math.min(rects.badge.bottom, rects.toolbar.bottom) - Math.max(rects.badge.top, rects.toolbar.top));
      const badgeTbCollision = badgeTbHorizOverlap > 0 && badgeTbVertOverlap > 0;

      record(
        `W=${vp.width}px [${stateLabel}] Badge vs Toolbar Collision Free`,
        !badgeTbCollision,
        `Overlap: X=${badgeTbHorizOverlap.toFixed(1)}px, Y=${badgeTbVertOverlap.toFixed(1)}px`
      );

      // 4. Pointer Hit-Testing via document.elementFromPoint
      const hitTestResults = await cdp.eval(`(() => {
        function getHit(sel) {
          const el = document.querySelector(sel);
          if (!el) return { found: false };
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const hit = document.elementFromPoint(cx, cy);
          const hitTag = hit ? hit.tagName + (hit.id ? '#' + hit.id : '') + (hit.className ? '.' + (typeof hit.className === 'string' ? hit.className.split(' ').join('.') : 'svg') : '') : 'NULL';
          const targetSelfOrChild = !!hit && (el === hit || el.contains(hit));
          return {
            found: true,
            cx, cy,
            hitTag,
            targetSelfOrChild
          };
        }
        return {
          btnBbox: getHit('#btn-bbox-hud'),
          btnUnits: getHit('#btn-units'),
          vcPersp: getHit('#vc-btn-persp'),
          vcHome: getHit('#vc-btn-home'),
          btnShortcuts: getHit('#btn-toggle-shortcuts'),
          btnProps: getHit('#btn-props'),
          btnAnalysis: getHit('#btn-analysis')
        };
      })()`);

      record(
        `W=${vp.width}px [${stateLabel}] #btn-bbox-hud hit-test clickable`,
        hitTestResults.btnBbox.targetSelfOrChild,
        `Target hit was: ${hitTestResults.btnBbox.hitTag} at (${hitTestResults.btnBbox.cx}, ${hitTestResults.btnBbox.cy})`
      );

      record(
        `W=${vp.width}px [${stateLabel}] #btn-units hit-test clickable`,
        hitTestResults.btnUnits.targetSelfOrChild,
        `Target hit was: ${hitTestResults.btnUnits.hitTag} at (${hitTestResults.btnUnits.cx}, ${hitTestResults.btnUnits.cy})`
      );

      record(
        `W=${vp.width}px [${stateLabel}] #vc-btn-persp hit-test clickable`,
        hitTestResults.vcPersp.targetSelfOrChild,
        `Target hit was: ${hitTestResults.vcPersp.hitTag}`
      );

      record(
        `W=${vp.width}px [${stateLabel}] #vc-btn-home hit-test clickable`,
        hitTestResults.vcHome.targetSelfOrChild,
        `Target hit was: ${hitTestResults.vcHome.hitTag}`
      );

      record(
        `W=${vp.width}px [${stateLabel}] #btn-toggle-shortcuts hit-test clickable`,
        hitTestResults.btnShortcuts.targetSelfOrChild,
        `Target hit was: ${hitTestResults.btnShortcuts.hitTag}`
      );
    }
  }

  // Teardown
  cdp.close();
  chromeProcess.kill();
  server.close();

  console.log(`\n========================================================================`);
  console.log(`TOTAL CHECKS: ${totalTests}`);
  console.log(`PASSED: ${passedTests}`);
  console.log(`FAILED: ${failedTests}`);
  if (failedTests > 0) {
    console.error('FAILURES:');
    failureDetails.forEach(f => console.error('  - ' + f));
  }
  console.log(`LIVE CDP VERDICT: ${failedTests === 0 ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log(`========================================================================`);

  process.exit(failedTests === 0 ? 0 : 1);
}

runLiveCDPProbe().catch(err => {
  console.error('Fatal error in CDP Probe:', err);
  process.exit(1);
});
