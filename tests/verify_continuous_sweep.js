const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function sweep() {
  const PORT = 9001;
  const CDP_PORT = 9235;
  const REPO_ROOT = path.resolve(__dirname, '..');
  const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');
  
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
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'stp_cdp_test_' + Date.now());
  const cp = spawn(chromePath, [
    '--remote-debugging-port=' + CDP_PORT,
    '--headless=new',
    '--user-data-dir=' + userDataDir,
    '--window-size=1280,800',
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

  const collisions = [];

  for (let w = 680; w <= 1400; w += 20) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 50));
    const result = await send('Runtime.evaluate', {
      expression: `(() => {
        const tb = document.querySelector('.toolbar').getBoundingClientRect();
        const bd = document.querySelector('.hud-badge').getBoundingClientRect();
        const isCollision = (bd.right > tb.x && tb.right > bd.x && bd.bottom > tb.y && tb.bottom > bd.y);
        return {
          w: ${w},
          tbLeft: tb.x,
          tbRight: tb.right,
          tbBottom: tb.bottom,
          bdRight: bd.right,
          bdY: bd.y,
          bdBottom: bd.bottom,
          overlapX: (bd.right > tb.x && tb.right > bd.x) ? (bd.right - tb.x) : 0,
          overlapY: (bd.bottom > tb.y && tb.bottom > bd.y) ? (Math.min(bd.bottom, tb.bottom) - Math.max(bd.y, tb.y)) : 0,
          isCollision
        };
      })()`,
      returnByValue: true
    });
    const d = result.result.value;
    if (d.isCollision) {
      collisions.push(d);
    }
  }

  console.log(`Continuous sweep from 680px to 1400px (step 20px):`);
  console.log(`Found ${collisions.length} collisions:`);
  for (const c of collisions) {
    console.log(`  Width ${c.w}px: OverlapX=${c.overlapX.toFixed(1)}px, OverlapY=${c.overlapY.toFixed(1)}px (Toolbar x=${c.tbLeft.toFixed(1)}, Badge right=${c.bdRight.toFixed(1)})`);
  }

  ws.close();
  cp.kill();
  server.close();
}
sweep().catch(console.error);
