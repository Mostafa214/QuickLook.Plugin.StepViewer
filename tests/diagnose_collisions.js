const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8998;
const CDP_PORT = 9231;
const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'Assets');

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/viewer.html';
  let filePath = path.join(ASSETS_DIR, reqPath);
  if (!fs.existsSync(filePath)) filePath = path.join(REPO_ROOT, reqPath);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html' : (ext === '.css' ? 'text/css' : 'application/javascript') });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', async () => {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'cdp_diag_' + Date.now());
  const cp = spawn(chromePath, ['--remote-debugging-port=' + CDP_PORT, '--headless=new', '--user-data-dir=' + userDataDir, 'about:blank'], { stdio: 'ignore' });
  
  await new Promise(r => setTimeout(r, 1200));
  const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json');
  const list = await res.json();
  const page = list.find(p => p.type === 'page');
  const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = msgId++;
    const handler = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === id) { ws.removeEventListener('message', handler); resolve(d.result); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/viewer.html' });
  await new Promise(r => setTimeout(r, 1500));

  // Diagnostic 1: 1280px Desktop with Drawer OPEN
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: "WorkbenchUI.openDrawer('tree');" });
  await new Promise(r => setTimeout(r, 400));

  const diag1280 = await send('Runtime.evaluate', {
    expression: "(() => {\n" +
      "  const b = document.querySelector('#info-badge').getBoundingClientRect();\n" +
      "  const t = document.querySelector('.toolbar').getBoundingClientRect();\n" +
      "  return {\n" +
      "    badge: { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height },\n" +
      "    toolbar: { x: t.x, y: t.y, right: t.right, bottom: t.bottom, width: t.width, height: t.height }\n" +
      "  };\n" +
      "})()",
    returnByValue: true
  });
  console.log('1280px Drawer OPEN:');
  console.log('  Toolbar:', diag1280.result.value.toolbar);
  console.log('  Badge:  ', diag1280.result.value.badge);
  const tb = diag1280.result.value.toolbar;
  const bd = diag1280.result.value.badge;
  const overlapX1280 = Math.max(0, Math.min(bd.right, tb.right) - Math.max(bd.x, tb.x));
  const overlapY1280 = Math.max(0, Math.min(bd.bottom, tb.bottom) - Math.max(bd.y, tb.y));
  console.log(`  -> Overlap: X=${overlapX1280.toFixed(1)}px, Y=${overlapY1280.toFixed(1)}px (Colliding: ${overlapX1280 > 0 && overlapY1280 > 0})`);

  // Diagnostic 2: 680px with Drawer CLOSED & Measure ON
  await send('Emulation.setDeviceMetricsOverride', { width: 680, height: 600, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: "WorkbenchUI.closeDrawer();" });
  await send('Runtime.evaluate', { expression: "document.getElementById('hint-measure-clear').style.display = 'inline';" });
  await new Promise(r => setTimeout(r, 400));

  const diag680 = await send('Runtime.evaluate', {
    expression: "(() => {\n" +
      "  const h = document.querySelector('#hints-bar').getBoundingClientRect();\n" +
      "  const c = document.querySelector('#bottom-hud-cluster').getBoundingClientRect();\n" +
      "  const btnU = document.querySelector('#btn-check-update').getBoundingClientRect();\n" +
      "  const btnS = document.querySelector('#btn-toggle-shortcuts').getBoundingClientRect();\n" +
      "  return {\n" +
      "    hints: { x: h.x, y: h.y, right: h.right, bottom: h.bottom, width: h.width, height: h.height },\n" +
      "    cluster: { x: c.x, y: c.y, right: c.right, bottom: c.bottom, width: c.width, height: c.height },\n" +
      "    btnU: { x: btnU.x, y: btnU.y, right: btnU.right, bottom: btnU.bottom },\n" +
      "    btnS: { x: btnS.x, y: btnS.y, right: btnS.right, bottom: btnS.bottom }\n" +
      "  };\n" +
      "})()",
    returnByValue: true
  });
  console.log('\n680px Drawer CLOSED (Measure ON):');
  console.log('  Hints:  ', diag680.result.value.hints);
  console.log('  Cluster:', diag680.result.value.cluster);
  console.log('  btnU:   ', diag680.result.value.btnU);
  console.log('  btnS:   ', diag680.result.value.btnS);
  const ht = diag680.result.value.hints;
  const cl = diag680.result.value.cluster;
  const overlapX680 = Math.max(0, Math.min(ht.right, cl.right) - Math.max(ht.x, cl.x));
  const overlapY680 = Math.max(0, Math.min(ht.bottom, cl.bottom) - Math.max(ht.y, cl.y));
  console.log(`  -> Overlap: X=${overlapX680.toFixed(1)}px, Y=${overlapY680.toFixed(1)}px (Colliding: ${overlapX680 > 0 && overlapY680 > 0})`);

  ws.close();
  cp.kill();
  server.close();
  process.exit(0);
});
