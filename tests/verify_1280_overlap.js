const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function test() {
  const PORT = 8993;
  const CDP_PORT = 9226;
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

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  // Open drawer
  await send('Runtime.evaluate', { expression: `(() => {
    document.getElementById('inspector-drawer').classList.add('open');
    document.body.classList.add('drawer-open');
  })()` });
  await new Promise(r => setTimeout(r, 500));

  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const tb = document.querySelector('.toolbar').getBoundingClientRect();
      const bd = document.querySelector('.hud-badge').getBoundingClientRect();
      const pt1 = document.elementFromPoint(200, 60);
      const pt2 = document.elementFromPoint(bd.x + bd.width - 10, bd.y + 4);
      return {
        tb: { x: tb.x, y: tb.y, width: tb.width, height: tb.height, bottom: tb.bottom },
        bd: { x: bd.x, y: bd.y, width: bd.width, height: bd.height, bottom: bd.bottom },
        point200_60: pt1 ? (pt1.id || pt1.className || pt1.tagName) : null,
        pointEdge: pt2 ? (pt2.id || pt2.className || pt2.tagName) : null
      };
    })()`,
    returnByValue: true
  });

  console.log('MEASURED RESULT:\n', JSON.stringify(result.result.value, null, 2));

  // Capture screenshot as base64 and save as PNG
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(REPO_ROOT, 'tests/screenshot_1280_drawer_open.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('Saved screenshot to tests/screenshot_1280_drawer_open.png');

  ws.close();
  cp.kill();
  server.close();
}
test().catch(console.error);
