// Standalone zero-dependency Node server for local proxy dev and production hosting.
// Usage: GEMINI_API_KEY=... node server/index.mjs (or `npm run server`)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_MODELS, createRateLimiter, handleTailorRequest, isConfiguredApiKey } from './tailorHandler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

// Load local .env files in Vite precedence order without overwriting existing environment variables.
function loadLocalEnv() {
  for (const name of ['.env.development.local', '.env.local', '.env']) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
}
loadLocalEnv();

const PORT = Number(process.env.PORT || 8787);
const rateLimiter = createRateLimiter({
  max: Number(process.env.TAILOR_RATE_LIMIT_MAX || 15),
  windowMs: Number(process.env.TAILOR_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function readNodeBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/health') {
    const configured = isConfiguredApiKey(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, configured }));
    return;
  }

  if (url.pathname === '/api/tailor') {
    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });
    let bodyBuf = Buffer.alloc(0);
    if (req.method === 'POST') {
      try {
        bodyBuf = await readNodeBody(req);
      } catch (err) {
        const status = err?.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { code: status, status: 'INVALID_ARGUMENT', message: 'Invalid or oversized request body.' } }));
        return;
      }
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(', '));
    }
    if (!headers.has('x-forwarded-for') && req.socket?.remoteAddress) {
      headers.set('x-forwarded-for', req.socket.remoteAddress);
    }
    const webReq = new Request(url.toString(), {
      method: req.method,
      headers,
      body: req.method === 'POST' ? bodyBuf : undefined,
      signal: abortController.signal,
    });
    const startedAt = Date.now();
    let reqModel = '-';
    if (req.method === 'POST' && bodyBuf.length) {
      try { const parsed = JSON.parse(bodyBuf.toString('utf8')); if (typeof parsed?.model === 'string') reqModel = ALLOWED_MODELS.has(parsed.model) ? parsed.model : 'invalid'; } catch {}
    }
    const webRes = await handleTailorRequest(webReq, {
      apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '',
      accessToken: process.env.TAILOR_ACCESS_TOKEN || '',
      allowedOrigin: process.env.TAILOR_ALLOWED_ORIGIN || '',
      clientIp: process.env.TRUST_PROXY === '1' ? undefined : (req.socket?.remoteAddress || 'local'),
      rateLimiter,
    });
    console.log(`[tailor] ${req.method} model=${reqModel} status=${webRes.status} elapsed=${Date.now() - startedAt}ms`);
    const outHeaders = {};
    webRes.headers.forEach((v, k) => { outHeaders[k] = v; });
    res.writeHead(webRes.status, outHeaders);
    res.end(Buffer.from(await webRes.arrayBuffer()));
    return;
  }

  // Optional static serving of built `dist/` for single-process production hosting.
  if (fs.existsSync(distDir)) {
    const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(distDir, safePath === '/' ? 'index.html' : safePath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`CV Tailor API server listening on http://localhost:${PORT}`);
});
