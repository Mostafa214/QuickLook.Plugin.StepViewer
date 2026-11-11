/**
 * Challenger M2-IT4 Specialized ViewCube & HUD Precision Probe
 * Directly measures exact bounding boxes and CDP elementFromPoint hit tests
 * across 960px, 800px, 768px, and 1280px (closed and drawer-open).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT) : 8996;
const CDP_PORT = process.env.TEST_CDP_PORT ? parseInt(process.env.TEST_CDP_PORT) : 9234;
const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');

(async () => {
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/viewer.html';
    let f = path.join(ASSETS_DIR, p);
    if (!fs.existsSync(f)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200);
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const cp = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--user-data-dir=' + path.join(process.env.TEMP || 'C:\\Temp', 'cdp_' + Date.now()),
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1000));
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
  const page = (await res.json()).find(p => p.type === 'page');
  const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (m, p = {}) => new Promise(resolve => {
    const i = id++;
    const h = e => {
      const d = JSON.parse(e.data);
      if (d.id === i) {
        ws.removeEventListener('message', h);
        resolve(d.result);
      }
    };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/viewer.html` });
  await new Promise(r => setTimeout(r, 1200));

  const viewports = [1280, 960, 800, 768];
  const states = ['closed', 'open'];

  console.log('========================================================================');
  console.log(' CHALLENGER M2-IT4: PRECISION VIEWCUBE OCCLUSION & HIT-TEST REPORT');
  console.log('========================================================================\n');

  let allPassed = true;

  for (const w of viewports) {
    for (const drawer of states) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
      if (drawer === 'closed') {
        await send('Runtime.evaluate', { expression: 'WorkbenchUI.closeDrawer();' });
      } else {
        await send('Runtime.evaluate', { expression: "WorkbenchUI.openDrawer('tree');" });
      }
      await new Promise(r => setTimeout(r, 300));

      const data = await send('Runtime.evaluate', {
        expression: `(() => {
          const hud = document.querySelector('#hud-top-right');
          const vc = document.querySelector('#viewcube-container');
          const btnPersp = document.querySelector('#vc-btn-persp');
          const btnHome = document.querySelector('#vc-btn-home');

          const hudR = hud.getBoundingClientRect();
          const vcR = vc.getBoundingClientRect();
          const pR = btnPersp ? btnPersp.getBoundingClientRect() : null;
          const hR = btnHome ? btnHome.getBoundingClientRect() : null;

          const pCenter = pR ? { x: pR.x + pR.width / 2, y: pR.y + pR.height / 2 } : null;
          const hCenter = hR ? { x: hR.x + hR.width / 2, y: hR.y + hR.height / 2 } : null;

          const pHit = pCenter ? document.elementFromPoint(pCenter.x, pCenter.y) : null;
          const hHit = hCenter ? document.elementFromPoint(hCenter.x, hCenter.y) : null;

          const getTag = el => el ? (el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.toString().split(' ').join('.') : '')) : 'null';

          const isPerspSafe = pHit && (pHit.id === 'vc-btn-persp' || pHit.closest('#vc-btn-persp'));
          const isHomeSafe = hHit && (hHit.id === 'vc-btn-home' || hHit.closest('#vc-btn-home'));

          return {
            hud: { x: hudR.x, y: hudR.y, r: hudR.right, b: hudR.bottom, w: hudR.width, h: hudR.height },
            vc: { x: vcR.x, y: vcR.y, r: vcR.right, b: vcR.bottom, w: vcR.width, h: vcR.height },
            btnPersp: pR ? { x: pR.x, y: pR.y, r: pR.right, b: pR.bottom, w: pR.width, h: pR.height } : null,
            btnHome: hR ? { x: hR.x, y: hR.y, r: hR.right, b: hR.bottom, w: hR.width, h: hR.height } : null,
            pCenter,
            hCenter,
            pHitTag: getTag(pHit),
            hHitTag: getTag(hHit),
            isPerspSafe: !!isPerspSafe,
            isHomeSafe: !!isHomeSafe
          };
        })()`,
        returnByValue: true
      });

      const resVal = data.result.value;
      console.log(`--- VIEWPORT W=${w}px | DRAWER: ${drawer.toUpperCase()} ---`);
      console.log(`  ViewCube Box:       [L=${resVal.vc.x.toFixed(1)}, R=${resVal.vc.r.toFixed(1)}, T=${resVal.vc.y.toFixed(1)}, B=${resVal.vc.b.toFixed(1)}] (W=${resVal.vc.w.toFixed(1)}, H=${resVal.vc.h.toFixed(1)})`);
      console.log(`  HUD-Top-Right Box:  [L=${resVal.hud.x.toFixed(1)}, R=${resVal.hud.r.toFixed(1)}, T=${resVal.hud.y.toFixed(1)}, B=${resVal.hud.b.toFixed(1)}] (W=${resVal.hud.w.toFixed(1)}, H=${resVal.hud.h.toFixed(1)})`);

      if (w === 1280) {
        const horizGap = resVal.vc.x - resVal.hud.r;
        console.log(`  Desktop Clearance:  VC.left - HUD.right = ${horizGap.toFixed(1)}px (Requirement: > 5.0px)`);
        if (horizGap > 5.0) {
          console.log(`  ✓ PASS: Positive horizontal clearance (${horizGap.toFixed(1)}px > 5.0px)`);
        } else {
          console.log(`  ✗ FAIL: Inadequate desktop clearance: ${horizGap.toFixed(1)}px`);
          allPassed = false;
        }
      } else {
        const vertGap = resVal.hud.y - resVal.vc.b;
        console.log(`  Tablet Clearance:   HUD.top - VC.bottom = ${vertGap.toFixed(1)}px (Requirement: > 0.0px)`);
        if (vertGap > 0) {
          console.log(`  ✓ PASS: Positive vertical air gap (${vertGap.toFixed(1)}px > 0px)`);
        } else {
          console.log(`  ✗ FAIL: Vertical overlap detected: ${vertGap.toFixed(1)}px`);
          allPassed = false;
        }
      }

      console.log(`  #vc-btn-persp:      Center=(${resVal.pCenter.x.toFixed(1)}, ${resVal.pCenter.y.toFixed(1)}) -> Hit Element: ${resVal.pHitTag}`);
      console.log(`  #vc-btn-home:       Center=(${resVal.hCenter.x.toFixed(1)}, ${resVal.hCenter.y.toFixed(1)}) -> Hit Element: ${resVal.hHitTag}`);

      if (resVal.isPerspSafe) {
        console.log(`  ✓ PASS: #vc-btn-persp is 100% clickable (NOT occluded).`);
      } else {
        console.log(`  ✗ FAIL: #vc-btn-persp is OCCLUDED by ${resVal.pHitTag}!`);
        allPassed = false;
      }

      if (resVal.isHomeSafe) {
        console.log(`  ✓ PASS: #vc-btn-home is 100% clickable (NOT occluded).`);
      } else {
        console.log(`  ✗ FAIL: #vc-btn-home is OCCLUDED by ${resVal.hHitTag}!`);
        allPassed = false;
      }
      console.log('');
    }
  }

  console.log('--- DRAWER TOGGLE STABILITY & DRIFT HARNESS (10 CYCLES) ---');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: 'WorkbenchUI.closeDrawer();' });
  await new Promise(r => setTimeout(r, 400));

  const initBox = await send('Runtime.evaluate', {
    expression: '(() => { const h = document.querySelector("#hud-top-right").getBoundingClientRect(); return { x: h.x, y: h.y }; })()',
    returnByValue: true
  });
  console.log(`  Baseline Position at 1280px: x=${initBox.result.value.x.toFixed(3)}, y=${initBox.result.value.y.toFixed(3)}`);

  for (let c = 1; c <= 10; c++) {
    await send('Runtime.evaluate', { expression: 'WorkbenchUI.openDrawer("tree");' });
    await new Promise(r => setTimeout(r, 200));
    await send('Runtime.evaluate', { expression: 'WorkbenchUI.closeDrawer();' });
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 200));

  const finalBox = await send('Runtime.evaluate', {
    expression: '(() => { const h = document.querySelector("#hud-top-right").getBoundingClientRect(); return { x: h.x, y: h.y }; })()',
    returnByValue: true
  });
  console.log(`  Final Position after 10 cycles: x=${finalBox.result.value.x.toFixed(3)}, y=${finalBox.result.value.y.toFixed(3)}`);

  const driftX = Math.abs(initBox.result.value.x - finalBox.result.value.x);
  const driftY = Math.abs(initBox.result.value.y - finalBox.result.value.y);
  console.log(`  Drift: dX=${driftX.toFixed(4)}px, dY=${driftY.toFixed(4)}px`);

  if (driftX < 0.01 && driftY < 0.01) {
    console.log('  ✓ PASS: Zero geometry drift after 10 rapid toggle cycles.');
  } else {
    console.log(`  ✗ FAIL: Layout drift detected: dX=${driftX}, dY=${driftY}`);
    allPassed = false;
  }

  console.log('\n========================================================================');
  console.log(` VERDICT: ${allPassed ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('========================================================================');

  ws.close();
  cp.kill();
  server.close();
  process.exit(allPassed ? 0 : 1);
})();
