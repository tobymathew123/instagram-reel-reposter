'use strict';
/**
 * Tiny HTTP service that n8n calls to brand a Reel with the Canva frame.
 *
 *   GET  /health                 -> { ok: true }
 *   POST /render                 -> { url, filename, ... }   (needs x-api-key header)
 *        body: { "source": "<reel video url>", "frame": "<png url or 'local'>", "jobId": "..." }
 *   GET  /files/<name>.mp4       -> serves the finished video (this is what Instagram downloads)
 *
 * Only /files/* is exposed to the internet (through Caddy + the tunnel).
 * /render is reachable only from inside the Docker network (i.e. from n8n).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { render, cleanup, RenderError, OUTPUT_DIR } = require('./render');

const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.FFMPEG_API_KEY || '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const FILE_TTL_HOURS = Number(process.env.FILE_TTL_HOURS || 48);

// Render one video at a time so the computer doesn't get overloaded.
let queue = Promise.resolve();
function enqueue(task) {
  const result = queue.then(task, task);
  queue = result.catch(() => {});
  return result;
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function keyOk(req) {
  if (!API_KEY) return true; // no key configured -> internal network only anyway
  const given = Buffer.from(String(req.headers['x-api-key'] || ''));
  const expected = Buffer.from(API_KEY);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function readJson(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new RenderError('Request body too large', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new RenderError('Body must be valid JSON', 400));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(req, res, name) {
  if (!/^[A-Za-z0-9_-]+\.mp4$/.test(name)) return sendJson(res, 404, { error: 'Not found' });
  const file = path.join(OUTPUT_DIR, name);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, { error: 'Not found' });
    const headers = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    };
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      let start = range[1] === '' ? st.size - Number(range[2]) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : st.size - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (end >= st.size) end = st.size - 1;
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, publicBaseUrl: PUBLIC_BASE_URL || null });
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/files/')) {
      return serveFile(req, res, decodeURIComponent(url.pathname.slice('/files/'.length)));
    }

    if (req.method === 'POST' && url.pathname === '/render') {
      if (!keyOk(req)) return sendJson(res, 401, { error: 'Wrong or missing x-api-key' });
      if (!PUBLIC_BASE_URL) {
        return sendJson(res, 500, { error: 'PUBLIC_DOMAIN is not set in .env, so Instagram cannot download the video.' });
      }
      const body = await readJson(req);
      log('render requested', body.jobId || '', String(body.source || '').slice(0, 80));
      const result = await enqueue(() => render({ source: body.source, frame: body.frame, jobId: body.jobId }));
      const out = { ...result, url: `${PUBLIC_BASE_URL}/files/${result.filename}` };
      log('render finished', out.filename, `${out.renderSeconds}s`, `${Math.round(out.sizeBytes / 1e5) / 10} MB`);
      return sendJson(res, 200, out);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    const status = err instanceof RenderError ? err.status : 500;
    log('ERROR', status, err.message);
    if (!res.headersSent) sendJson(res, status, { error: err.message });
  }
});

// The render can take a few minutes for long Reels.
server.requestTimeout = 0;
server.headersTimeout = 60000;

server.listen(PORT, () => {
  log(`ffmpeg-api listening on :${PORT} (public base: ${PUBLIC_BASE_URL || 'NOT SET'})`);
});

setInterval(() => cleanup(FILE_TTL_HOURS).catch(() => {}), 60 * 60 * 1000).unref();
cleanup(FILE_TTL_HOURS).catch(() => {});
