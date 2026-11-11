const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/viewer.html';
    let f = path.join(__dirname, '..', 'Assets', p);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200);
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(8999, '127.0.0.1', r));

  const cp = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--remote-debugging-port=9232',
    '--headless=new',
    '--user-data-dir=' + path.join(process.env.TEMP || 'C:\\Temp', 'cdp_' + Date.now()),
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1000));
  const res = await fetch('http://127.0.0.1:9232/json');
  const page = (await res.json()).find(p => p.type === 'page');
  const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (m, p={}) => new Promise(resolve => {
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
  await send('Page.navigate', { url: 'http://127.0.0.1:8999/viewer.html' });
  await new Promise(r => setTimeout(r, 1000));

  for (const w of [1280, 1251, 1250, 960, 768, 680, 520]) {
    for (const drawer of ['closed', 'open']) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
      if (drawer === 'closed') {
        await send('Runtime.evaluate', { expression: 'WorkbenchUI.closeDrawer();' });
      } else {
        await send('Runtime.evaluate', { expression: "WorkbenchUI.openDrawer('tree');" });
      }
      await new Promise(r => setTimeout(r, 200));

      const rects = await send('Runtime.evaluate', {
        expression: `(() => {
          const hud = document.querySelector('#hud-top-right').getBoundingClientRect();
          const vc = document.querySelector('#viewcube-container').getBoundingClientRect();
          const tb = document.querySelector('.toolbar').getBoundingClientRect();
          const bd = document.querySelector('.hud-badge').getBoundingClientRect();
          const hints = document.querySelector('#hints-bar').getBoundingClientRect();
          const triad = document.querySelector('#triad-container').getBoundingClientRect();
          const bCluster = document.querySelector('#bottom-hud-cluster').getBoundingClientRect();

          const toB = r => ({ x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom });
          return {
            hud: toB(hud),
            vc: toB(vc),
            tb: toB(tb),
            bd: toB(bd),
            hints: toB(hints),
            triad: toB(triad),
            bCluster: toB(bCluster)
          };
        })()`,
        returnByValue: true
      });
      console.log(`\n=== W=${w}px | Drawer: ${drawer.toUpperCase()} ===`);
      const v = rects.result.value;
      console.log(`Top-Right HUD: x=${v.hud.x.toFixed(1)}, right=${v.hud.r.toFixed(1)}, y=${v.hud.y.toFixed(1)}, bottom=${v.hud.b.toFixed(1)}`);
      console.log(`ViewCube:      x=${v.vc.x.toFixed(1)}, right=${v.vc.r.toFixed(1)}, y=${v.vc.y.toFixed(1)}, bottom=${v.vc.b.toFixed(1)}`);
      console.log(`HUD right (${v.hud.r.toFixed(1)}) vs VC left (${v.vc.x.toFixed(1)}) -> Diff: ${(v.vc.x - v.hud.r).toFixed(1)}px`);
      console.log(`Hints:         x=${v.hints.x.toFixed(1)}, right=${v.hints.r.toFixed(1)}, y=${v.hints.y.toFixed(1)}, bottom=${v.hints.b.toFixed(1)}`);
      console.log(`Triad:         x=${v.triad.x.toFixed(1)}, right=${v.triad.r.toFixed(1)}, y=${v.triad.y.toFixed(1)}, bottom=${v.triad.b.toFixed(1)}`);
      console.log(`BottomCluster: x=${v.bCluster.x.toFixed(1)}, right=${v.bCluster.r.toFixed(1)}, y=${v.bCluster.y.toFixed(1)}, bottom=${v.bCluster.b.toFixed(1)}`);

      const hits = await send('Runtime.evaluate', {
        expression: `(() => {
          const btnPersp = document.querySelector('#vc-btn-persp');
          const btnHome = document.querySelector('#vc-btn-home');
          const pR = btnPersp ? btnPersp.getBoundingClientRect() : null;
          const hR = btnHome ? btnHome.getBoundingClientRect() : null;

          const pHit = pR ? document.elementFromPoint(pR.x + pR.width / 2, pR.y + pR.height / 2) : null;
          const hHit = hR ? document.elementFromPoint(hR.x + hR.width / 2, hR.y + hR.height / 2) : null;

          return {
            btnPerspRect: pR,
            pHitTag: pHit ? (pHit.tagName + '#' + pHit.id + '.' + pHit.className) : 'null',
            btnHomeRect: hR,
            hHitTag: hHit ? (hHit.tagName + '#' + hHit.id + '.' + hHit.className) : 'null'
          };
        })()`,
        returnByValue: true
      });
      console.log('VC Button Hit Tests:', JSON.stringify(hits.result.value));
    }
  }

  console.log('\n=== Testing Transition Recovery After 5 Cycles with 350ms wait ===');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: 'WorkbenchUI.closeDrawer();' });
  await new Promise(r => setTimeout(r, 400));
  const b0 = await send('Runtime.evaluate', { expression: '(() => { const h = document.querySelector("#hud-top-right").getBoundingClientRect(); return { x: h.x, y: h.y }; })()', returnByValue: true });
  console.log('Initial at 1280px:', b0.result.value);

  for (let i = 0; i < 5; i++) {
    await send('Runtime.evaluate', { expression: 'WorkbenchUI.openDrawer("tree");' });
    await new Promise(r => setTimeout(r, 350));
    await send('Runtime.evaluate', { expression: 'WorkbenchUI.closeDrawer();' });
    await new Promise(r => setTimeout(r, 350));
  }
  const b1 = await send('Runtime.evaluate', { expression: '(() => { const h = document.querySelector("#hud-top-right").getBoundingClientRect(); return { x: h.x, y: h.y }; })()', returnByValue: true });
  console.log('Final after 5 cycles:', b1.result.value);
  console.log('Delta:', Math.abs(b0.result.value.x - b1.result.value.x), Math.abs(b0.result.value.y - b1.result.value.y));

  ws.close();
  cp.kill();
  server.close();
})();
