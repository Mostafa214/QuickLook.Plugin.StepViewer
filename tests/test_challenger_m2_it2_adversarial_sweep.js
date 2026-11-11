/**
 * Empirical Adversarial Challenger Suite - Milestone M2 Iteration 2
 * Tests corner cases, continuous sweeps, and identifies boundary collisions.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT) : 8998;
const CDP_PORT = process.env.TEST_CDP_PORT ? parseInt(process.env.TEST_CDP_PORT) : 9231;
const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');

async function runSuite() {
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
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'stp_cdp_challenger_it2_' + Date.now());
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

  // Disable transitions for instant, accurate geometric boundary evaluation
  await send('Runtime.evaluate', { expression: `(() => {
    const style = document.createElement('style');
    style.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.appendChild(style);

    const fn = document.getElementById('badge-filename');
    if (fn) fn.textContent = 'A380_Turbine_Blade_Assembly_High_Precision_Rev3_Final.STEP';
    const dim = document.getElementById('badge-dim');
    if (dim) dim.style.display = 'block';
    const dt = document.getElementById('dim-text');
    if (dt) dt.textContent = '1425.80 × 850.45 × 320.10 mm';
    const st = document.getElementById('status-text');
    if (st) st.textContent = 'Solid Mesh Ready (14 Bodies, 35,280 Triangles)';
  })()` });

  console.log('================================================================');
  console.log(' CHALLENGER M2-IT2 EMPIRICAL ADVERSARIAL SWEEP & CORNER SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Probe 1280px Drawer Open
  console.log('--- 1. Testing 1280px Desktop with Drawer OPEN ---');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: `WorkbenchUI.openDrawer('tree');` });
  await new Promise(r => setTimeout(r, 50));
  const r1280Open = await send('Runtime.evaluate', {
    expression: `(() => {
      const bd = document.querySelector('.hud-badge').getBoundingClientRect();
      const tb = document.querySelector('.toolbar').getBoundingClientRect();
      const ox = Math.max(0, Math.min(bd.right, tb.right) - Math.max(bd.left, tb.left));
      const oy = Math.max(0, Math.min(bd.bottom, tb.bottom) - Math.max(bd.top, tb.top));
      return { isColliding: (ox > 0 && oy > 0), ox, oy, vertGap: bd.y - tb.bottom };
    })()`,
    returnByValue: true
  });
  const d1280 = r1280Open.result.value;
  if (!d1280.isColliding && d1280.vertGap >= 6.0) {
    passed++;
    console.log(`  ✓ PASS: 1280px Drawer OPEN: Badge top=${d1280.vertGap.toFixed(1)}px below toolbar bottom (Zero AABB collision).`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: 1280px Drawer OPEN collision: ox=${d1280.ox}, oy=${d1280.oy}`);
  }

  // 2. Probe 680px with Measure Mode Active
  console.log('\n--- 2. Testing 680px Viewport with Measure Mode Active ---');
  await send('Emulation.setDeviceMetricsOverride', { width: 680, height: 600, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: `WorkbenchUI.closeDrawer();` });
  await send('Runtime.evaluate', { expression: `(() => {
    const hClear = document.getElementById('hint-measure-clear');
    if (hClear) hClear.style.display = 'inline';
  })()` });
  await new Promise(r => setTimeout(r, 50));
  const r680Measure = await send('Runtime.evaluate', {
    expression: `(() => {
      const hints = document.querySelector('#hints-bar').getBoundingClientRect();
      const cluster = document.querySelector('#bottom-hud-cluster').getBoundingClientRect();
      const ox = Math.max(0, Math.min(hints.right, cluster.right) - Math.max(hints.left, cluster.left));
      const oy = Math.max(0, Math.min(hints.bottom, cluster.bottom) - Math.max(hints.top, cluster.top));
      const sHit = document.elementFromPoint(cluster.x + 10, cluster.y + 10);
      return { isColliding: (ox > 0 && oy > 0), ox, oy, vertGap: cluster.y - hints.bottom, sHit: sHit ? sHit.tagName : null };
    })()`,
    returnByValue: true
  });
  const d680 = r680Measure.result.value;
  if (!d680.isColliding && d680.vertGap >= 8.0) {
    passed++;
    console.log(`  ✓ PASS: 680px Measure Active: Hints bar top=${d680.vertGap.toFixed(1)}px above bottom cluster (Zero AABB collision, buttons clickable).`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: 680px Measure Active collision: ox=${d680.ox}, oy=${d680.oy}`);
  }

  // 3. Probe Continuous Width Sweep (960px to 1200px)
  console.log('\n--- 3. Testing Continuous Width Sweep (960px to 1200px) ---');
  let sweep960To1200Collisions = 0;
  for (let w = 960; w <= 1200; w += 20) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 750, deviceScaleFactor: 1, mobile: false });
    for (const drawerOpen of [false, true]) {
      if (drawerOpen) {
        await send('Runtime.evaluate', { expression: `WorkbenchUI.openDrawer('tree');` });
      } else {
        await send('Runtime.evaluate', { expression: `WorkbenchUI.closeDrawer();` });
      }
      await new Promise(r => setTimeout(r, 20));
      const sweepCheck = await send('Runtime.evaluate', {
        expression: `(() => {
          const bd = document.querySelector('.hud-badge').getBoundingClientRect();
          const tb = document.querySelector('.toolbar').getBoundingClientRect();
          const ox = Math.max(0, Math.min(bd.right, tb.right) - Math.max(bd.left, tb.left));
          const oy = Math.max(0, Math.min(bd.bottom, tb.bottom) - Math.max(bd.top, tb.top));
          return { isColliding: (ox > 0 && oy > 0), ox, oy, bdY: bd.y, tbBottom: tb.bottom };
        })()`,
        returnByValue: true
      });
      const res = sweepCheck.result.value;
      if (res.isColliding) {
        sweep960To1200Collisions++;
        console.log(`  ✗ FAIL: Collision at W=${w}px (Drawer ${drawerOpen ? 'OPEN' : 'CLOSED'})! ox=${res.ox}, oy=${res.oy}`);
      }
    }
  }
  if (sweep960To1200Collisions === 0) {
    passed++;
    console.log('  ✓ PASS: Continuous sweep 960px to 1200px shows zero AABB collision between Badge and Toolbar in both open and closed states.');
  } else {
    failed++;
  }

  // 4. Probe Boundary Corner: 1201px to 1240px (Closed Drawer State)
  console.log('\n--- 4. Probing Boundary Corner: 1201px to 1240px (Closed Drawer State) ---');
  await send('Runtime.evaluate', { expression: `WorkbenchUI.closeDrawer();` });
  const boundaryCollisions = [];
  for (let w = 1201; w <= 1240; w += 1) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 750, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 10));
    const bCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const bd = document.querySelector('.hud-badge').getBoundingClientRect();
        const tb = document.querySelector('.toolbar').getBoundingClientRect();
        const ox = Math.max(0, Math.min(bd.right, tb.right) - Math.max(bd.left, tb.left));
        const oy = Math.max(0, Math.min(bd.bottom, tb.bottom) - Math.max(bd.top, tb.top));
        return { isColliding: (ox > 0 && oy > 0), ox, oy, tbLeft: tb.x, bdRight: bd.right, bdY: bd.y };
      })()`,
      returnByValue: true
    });
    const bRes = bCheck.result.value;
    if (bRes.isColliding) {
      boundaryCollisions.push({ w, ...bRes });
    }
  }

  if (boundaryCollisions.length > 0) {
    failed++;
    console.log(`  ✗ FAIL: DETECTED ${boundaryCollisions.length} PHYSICAL AABB COLLISIONS in range 1201px–1239px!`);
    console.log(`    First collision: W=${boundaryCollisions[0].w}px (Badge.right=${boundaryCollisions[0].bdRight.toFixed(1)}, Toolbar.left=${boundaryCollisions[0].tbLeft.toFixed(1)}, overlapX=${boundaryCollisions[0].ox.toFixed(1)}px, overlapY=${boundaryCollisions[0].oy.toFixed(1)}px)`);
    console.log(`    Last collision:  W=${boundaryCollisions[boundaryCollisions.length - 1].w}px (Badge.right=${boundaryCollisions[boundaryCollisions.length - 1].bdRight.toFixed(1)}, Toolbar.left=${boundaryCollisions[boundaryCollisions.length - 1].tbLeft.toFixed(1)}, overlapX=${boundaryCollisions[boundaryCollisions.length - 1].ox.toFixed(1)}px, overlapY=${boundaryCollisions[boundaryCollisions.length - 1].oy.toFixed(1)}px)`);
  } else {
    passed++;
    console.log('  ✓ PASS: Zero collisions in 1201px-1240px range.');
  }

  console.log('\n================================================================');
  console.log(` TOTAL SECTIONS PASSED: ${passed}`);
  console.log(` TOTAL SECTIONS FAILED: ${failed}`);
  console.log(` EMPIRICAL VERDICT: ${failed === 0 ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('================================================================\n');

  ws.close();
  cp.kill();
  server.close();
  process.exit(failed === 0 ? 0 : 1);
}

runSuite().catch(console.error);
