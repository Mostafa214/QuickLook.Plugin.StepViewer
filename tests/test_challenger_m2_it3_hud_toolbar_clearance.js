/**
 * Challenger M2 Iteration 3: Empirical Clearance Verification
 * Specifically tests .toolbar vs #hud-top-right clearance and absence of AABB collisions
 * across 1280px (drawer OPEN & CLOSED) and continuous widths.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT) : 8996;
const CDP_PORT = process.env.TEST_CDP_PORT ? parseInt(process.env.TEST_CDP_PORT) : 9233;
const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');

async function run() {
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/viewer.html';
    let f = path.join(ASSETS_DIR, p);
    if (!fs.existsSync(f)) f = path.join(REPO_ROOT, p);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200);
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'stp_cdp_clearance_' + Date.now());
  const cp = spawn(chromePath, [
    '--remote-debugging-port=' + CDP_PORT,
    '--headless=new',
    '--user-data-dir=' + userDataDir,
    '--window-size=1600,1000',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 1000));
  const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json');
  const list = await res.json();
  const page = list.find(p => p.type === 'page');
  const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const send = (m, p={}) => new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === id) {
        ws.removeEventListener('message', handler);
        if (d.error) reject(d.error); else resolve(d.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/viewer.html' });
  await new Promise(r => setTimeout(r, 1500));

  // Disable CSS transitions for deterministic snapshot geometry
  await send('Runtime.evaluate', { expression: `(() => {
    const style = document.createElement('style');
    style.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.appendChild(style);
  })()` });

  console.log('========================================================================');
  console.log(' CHALLENGER M2-IT3: EMPIRICAL CLEARANCE TEST (.toolbar vs #hud-top-right)');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function aabbAnalysis(boxA, boxB, nameA, nameB) {
    const ox = Math.max(0, Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left));
    const oy = Math.max(0, Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top));
    const colliding = (ox > 0 && oy > 0);

    let horizGap = 0;
    if (boxA.right <= boxB.left) horizGap = boxB.left - boxA.right;
    else if (boxB.right <= boxA.left) horizGap = boxA.left - boxB.right;

    let vertGap = 0;
    if (boxA.bottom <= boxB.top) vertGap = boxB.top - boxA.bottom;
    else if (boxB.bottom <= boxA.top) vertGap = boxA.top - boxB.bottom;

    return {
      colliding,
      ox,
      oy,
      horizGap,
      vertGap,
      boxA: { left: boxA.left, right: boxA.right, top: boxA.top, bottom: boxA.bottom, width: boxA.width, height: boxA.height },
      boxB: { left: boxB.left, right: boxB.right, top: boxB.top, bottom: boxB.bottom, width: boxB.width, height: boxB.height }
    };
  }

  // 1. Specific Target: 1280px with Drawer OPEN
  console.log('--- 1. Viewport 1280px with Drawer OPEN: .toolbar vs #hud-top-right ---');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: `WorkbenchUI.openDrawer('tree');` });
  await new Promise(r => setTimeout(r, 60));

  const eval1280Open = await send('Runtime.evaluate', {
    expression: `(() => {
      const tb = document.querySelector('.toolbar').getBoundingClientRect();
      const hud = document.querySelector('#hud-top-right').getBoundingClientRect();
      const vc = document.querySelector('.viewcube-container').getBoundingClientRect();
      const bd = document.querySelector('.hud-badge').getBoundingClientRect();
      return {
        tb: { left: tb.left, right: tb.right, top: tb.top, bottom: tb.bottom, width: tb.width, height: tb.height },
        hud: { left: hud.left, right: hud.right, top: hud.top, bottom: hud.bottom, width: hud.width, height: hud.height },
        vc: { left: vc.left, right: vc.right, top: vc.top, bottom: vc.bottom, width: vc.width, height: vc.height },
        bd: { left: bd.left, right: bd.right, top: bd.top, bottom: bd.bottom, width: bd.width, height: bd.height }
      };
    })()`,
    returnByValue: true
  });

  const evalDetails = await send('Runtime.evaluate', {
    expression: `(() => {
      const tb = document.querySelector('.toolbar').getBoundingClientRect();
      const hud = document.querySelector('#hud-top-right').getBoundingClientRect();
      const vc = document.querySelector('.viewcube-container').getBoundingClientRect();
      const canvas = document.querySelector('#viewcube-canvas').getBoundingClientRect();
      const lastBtn = document.querySelector('#btn-clearcache').getBoundingClientRect();
      return {
        tb: { left: tb.left, right: tb.right, top: tb.top, bottom: tb.bottom, width: tb.width, height: tb.height },
        hud: { left: hud.left, right: hud.right, top: hud.top, bottom: hud.bottom, width: hud.width, height: hud.height },
        vc: { left: vc.left, right: vc.right, top: vc.top, bottom: vc.bottom, width: vc.width, height: vc.height },
        canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom, width: canvas.width, height: canvas.height },
        lastBtn: { left: lastBtn.left, right: lastBtn.right, top: lastBtn.top, bottom: lastBtn.bottom, width: lastBtn.width, height: lastBtn.height }
      };
    })()`,
    returnByValue: true
  });

  const details = evalDetails.result.value;
  const tbVsHud = aabbAnalysis(details.tb, details.hud, 'Toolbar', 'HUD-Top-Right');
  const btnVsCanvas = aabbAnalysis(details.lastBtn, details.canvas, 'LastHUDButton', 'ViewCubeCanvas');

  console.log(`  Toolbar box:       [L=${tbVsHud.boxA.left.toFixed(1)}, R=${tbVsHud.boxA.right.toFixed(1)}, T=${tbVsHud.boxA.top.toFixed(1)}, B=${tbVsHud.boxA.bottom.toFixed(1)}] (W=${tbVsHud.boxA.width.toFixed(1)}, H=${tbVsHud.boxA.height.toFixed(1)})`);
  console.log(`  HUD-Top-Right box: [L=${tbVsHud.boxB.left.toFixed(1)}, R=${tbVsHud.boxB.right.toFixed(1)}, T=${tbVsHud.boxB.top.toFixed(1)}, B=${tbVsHud.boxB.bottom.toFixed(1)}] (W=${tbVsHud.boxB.width.toFixed(1)}, H=${tbVsHud.boxB.height.toFixed(1)})`);
  console.log(`  Last Button box:   [L=${details.lastBtn.left.toFixed(1)}, R=${details.lastBtn.right.toFixed(1)}, T=${details.lastBtn.top.toFixed(1)}, B=${details.lastBtn.bottom.toFixed(1)}]`);
  console.log(`  ViewCube Canvas:   [L=${details.canvas.left.toFixed(1)}, R=${details.canvas.right.toFixed(1)}, T=${details.canvas.top.toFixed(1)}, B=${details.canvas.bottom.toFixed(1)}]`);

  if (!tbVsHud.colliding && tbVsHud.vertGap >= 6.0) {
    passed++;
    console.log(`  ✓ PASS: .toolbar vs #hud-top-right has positive clearance: vertGap=${tbVsHud.vertGap.toFixed(1)}px (HUD top=${tbVsHud.boxB.top.toFixed(1)} is below toolbar bottom=${tbVsHud.boxA.bottom.toFixed(1)}). Zero AABB overlap.`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: .toolbar vs #hud-top-right COLLISION! ox=${tbVsHud.ox.toFixed(1)}px, oy=${tbVsHud.oy.toFixed(1)}px`);
  }

  if (details.lastBtn.right <= details.canvas.left) {
    passed++;
    console.log(`  ✓ PASS: Interactive HUD Button (#btn-clearcache) is strictly clear of ViewCube Canvas: horizGap=${(details.canvas.left - details.lastBtn.right).toFixed(1)}px.`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: HUD button collides with ViewCube Canvas!`);
  }

  // 2. Viewport 1280px with Drawer CLOSED
  console.log('\n--- 2. Viewport 1280px with Drawer CLOSED: .toolbar vs #hud-top-right ---');
  await send('Runtime.evaluate', { expression: `WorkbenchUI.closeDrawer();` });
  await new Promise(r => setTimeout(r, 60));

  const eval1280Closed = await send('Runtime.evaluate', {
    expression: `(() => {
      const tb = document.querySelector('.toolbar').getBoundingClientRect();
      const hud = document.querySelector('#hud-top-right').getBoundingClientRect();
      return {
        tb: { left: tb.left, right: tb.right, top: tb.top, bottom: tb.bottom, width: tb.width, height: tb.height },
        hud: { left: hud.left, right: hud.right, top: hud.top, bottom: hud.bottom, width: hud.width, height: hud.height }
      };
    })()`,
    returnByValue: true
  });
  const geom1280Closed = eval1280Closed.result.value;
  const tbVsHudClosed = aabbAnalysis(geom1280Closed.tb, geom1280Closed.hud, 'Toolbar', 'HUD-Top-Right');
  console.log(`  Toolbar box:       [L=${tbVsHudClosed.boxA.left.toFixed(1)}, R=${tbVsHudClosed.boxA.right.toFixed(1)}, T=${tbVsHudClosed.boxA.top.toFixed(1)}, B=${tbVsHudClosed.boxA.bottom.toFixed(1)}]`);
  console.log(`  HUD-Top-Right box: [L=${tbVsHudClosed.boxB.left.toFixed(1)}, R=${tbVsHudClosed.boxB.right.toFixed(1)}, T=${tbVsHudClosed.boxB.top.toFixed(1)}, B=${tbVsHudClosed.boxB.bottom.toFixed(1)}]`);

  if (!tbVsHudClosed.colliding && tbVsHudClosed.horizGap > 0) {
    passed++;
    console.log(`  ✓ PASS: 1280px Drawer CLOSED: .toolbar vs #hud-top-right has positive clearance: horizGap=${tbVsHudClosed.horizGap.toFixed(1)}px. Zero AABB overlap.`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: 1280px Drawer CLOSED collision: ox=${tbVsHudClosed.ox.toFixed(1)}px, oy=${tbVsHudClosed.oy.toFixed(1)}px`);
  }

  // 3. Multi-Width Sweep (Drawer OPEN): 1200px to 1600px
  console.log('\n--- 3. Multi-Width Sweep (Drawer OPEN) for Toolbar vs HUD Top Right ---');
  let openSweepCollisions = 0;
  for (let w = 1200; w <= 1600; w += 20) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Runtime.evaluate', { expression: `WorkbenchUI.openDrawer('tree');` });
    await new Promise(r => setTimeout(r, 20));

    const check = await send('Runtime.evaluate', {
      expression: `(() => {
        const tb = document.querySelector('.toolbar').getBoundingClientRect();
        const hud = document.querySelector('#hud-top-right').getBoundingClientRect();
        const ox = Math.max(0, Math.min(tb.right, hud.right) - Math.max(tb.left, hud.left));
        const oy = Math.max(0, Math.min(tb.bottom, hud.bottom) - Math.max(tb.top, hud.top));
        return { isColliding: (ox > 0 && oy > 0), ox, oy, tbRight: tb.right, tbBottom: tb.bottom, hudLeft: hud.left, hudTop: hud.top };
      })()`,
      returnByValue: true
    });
    const cVal = check.result.value;
    if (cVal.isColliding) {
      openSweepCollisions++;
      console.log(`  ✗ FAIL: Collision at W=${w}px Drawer OPEN! ox=${cVal.ox.toFixed(1)}, oy=${cVal.oy.toFixed(1)}`);
    }
  }

  if (openSweepCollisions === 0) {
    passed++;
    console.log('  ✓ PASS: All widths 1200px-1600px with Drawer OPEN have ZERO collisions between Toolbar and HUD Top Right.');
  } else {
    failed++;
  }

  console.log('\n========================================================================');
  console.log(` TOTAL CHECKS PASSED: ${passed}`);
  console.log(` TOTAL CHECKS FAILED: ${failed}`);
  console.log(` VERDICT: ${failed === 0 ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('========================================================================\n');

  ws.close();
  cp.kill();
  server.close();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(console.error);
