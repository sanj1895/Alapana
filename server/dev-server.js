// Local stand-in for Vercel's Node runtime, so `npm run dev:api`, Docker
// Compose and the local Kubernetes deployment (deploy/) serve the api/
// functions without the Vercel CLI. Production still runs on Vercel.
//
// It adds the request/response helpers the handlers rely on: req.body,
// req.query, res.status() and res.json().

import http from 'http';
import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(__dirname, '../api');
const PORT = Number(process.env.PORT) || 3001;
const MAX_BODY_BYTES = 1_000_000;

// Routes are the api/*.js files; _-prefixed files are shared helpers, not routes.
const ROUTES = new Set(
  readdirSync(API_DIR)
    .filter(f => f.endsWith('.js') && !f.startsWith('_'))
    .map(f => f.slice(0, -3)),
);

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  if (!(req.headers['content-type'] || '').includes('application/json')) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Invalid JSON body.'), { status: 400 });
  }
}

function addVercelHelpers(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
}

const server = http.createServer(async (req, res) => {
  addVercelHelpers(res);
  const url = new URL(req.url, 'http://localhost');
  // Kubernetes probes. Not under /api/, so the Ingress never exposes it.
  if (url.pathname === '/health') return res.status(200).json({ ok: true });
  const name = url.pathname.match(/^\/api\/([a-z-]+)\/?$/)?.[1];

  if (!name || !ROUTES.has(name)) {
    return res.status(404).json({ error: `No API route for ${url.pathname}` });
  }

  try {
    req.query = Object.fromEntries(url.searchParams);
    req.body = await readJsonBody(req);
    const { default: handler } = await import(pathToFileURL(resolve(API_DIR, `${name}.js`)).href);
    await handler(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(`[api/${name}]`, err);
    if (!res.headersSent) res.status(status).json({ error: err.message || 'Server error.' });
  } finally {
    console.log(`${req.method} ${url.pathname} → ${res.statusCode}`);
  }
});

// As PID 1 in a container, Node ignores SIGTERM unless it handles it, and
// Kubernetes would wait the full grace period before killing the pod.
process.on('SIGTERM', () => server.close(() => process.exit(0)));

server.listen(PORT, () => {
  console.log(`API dev server on http://localhost:${PORT} · routes: ${[...ROUTES].join(', ')}`);
});
