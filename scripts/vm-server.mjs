import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.cpio': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.py': 'text/x-python; charset=utf-8',
};

const COI = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function safeJoin(base, rel) {
  const full = path.normalize(path.join(base, rel));
  return full.startsWith(base) ? full : null;
}

/**
 * Local static server for the vendored LinuxOnTab page and the overlay
 * builder.  Vite serves the React app; this server exists because /vm/ needs
 * COOP/COEP and its own package directory, and because the builder needs a
 * tiny image-push endpoint.
 */
export function startVmServer({ root = process.cwd(), port = 8130 } = {}) {
  const publicDir = path.join(root, 'public');
  const vmDir = path.join(publicDir, 'vm');
  const packagesDir = path.join(root, 'vendor', 'packages');
  const overlaysDir = path.join(publicDir, 'overlays');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    for (const [k, v] of Object.entries(COI)) res.setHeader(k, v);

    if (req.method === 'PUT' && url.pathname.startsWith('/api/images/')) {
      const name = path.basename(url.pathname);
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        res.writeHead(400);
        res.end('bad name');
        return;
      }
      fs.mkdirSync(overlaysDir, { recursive: true });
      const out = path.join(overlaysDir, name);
      const ws = fs.createWriteStream(out);
      req.pipe(ws);
      ws.on('finish', () => {
        console.log('[overlay] wrote', out, fs.statSync(out).size);
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
      });
      ws.on('error', (err) => {
        console.error('[overlay] write failed', err);
        res.writeHead(500);
        res.end('error');
      });
      return;
    }

    let base = null;
    let rel = '';
    if (url.pathname === '/lot-agent.py') {
      base = path.join(root, 'vm');
      rel = 'lot-agent.py';
    } else if (url.pathname.startsWith('/vm/')) {
      base = vmDir;
      rel = url.pathname.slice('/vm/'.length);
    } else if (url.pathname === '/vm') {
      res.writeHead(302, { location: '/vm/' });
      res.end();
      return;
    } else if (url.pathname.startsWith('/packages/')) {
      base = packagesDir;
      rel = url.pathname.slice('/packages/'.length);
    } else if (url.pathname.startsWith('/overlays/')) {
      base = overlaysDir;
      rel = url.pathname.slice('/overlays/'.length);
    }

    if (!base) {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    if (rel.endsWith('/') || rel === '') rel += 'index.html';
    const file = safeJoin(base, rel);
    if (!file) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startVmServer().then((server) => {
    console.log('VM server on http://localhost:8130/vm/');
    process.on('SIGINT', () => server.close(() => process.exit(0)));
  });
}
