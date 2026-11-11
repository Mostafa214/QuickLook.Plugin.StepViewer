const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8989;
const ASSETS_DIR = path.resolve(__dirname, '../Assets');
const REPO_ROOT = path.resolve(__dirname, '..');

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

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (urlPath === '/shutdown') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Server shutting down');
    console.log('[Server] Shutting down on request...');
    server.close(() => process.exit(0));
    return;
  }

  // Model file route
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

  // Assets route
  let relPath = urlPath === '/' ? 'viewer.html' : urlPath.replace(/^\/+/, '');
  let filePath = path.join(ASSETS_DIR, relPath);

  if (!fs.existsSync(filePath)) {
    // Check repo root
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
  console.log(`[Server] Listening on http://127.0.0.1:${PORT}`);
});
