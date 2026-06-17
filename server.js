// server.js — Yerel geliştirme sunucusu (Vercel serverless adaptörü)
import 'dotenv/config';
import http     from 'http';
import fs       from 'fs';
import path     from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT || 3000;

// ── Gövde ayrıştırıcı ────────────────────────────────────────────────────────
function parseBody(req) {
    return new Promise(resolve => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const ct = req.headers['content-type'] || '';
            if (ct.includes('application/json')) {
                try { resolve(JSON.parse(body)); } catch { resolve({}); }
            } else if (ct.includes('application/x-www-form-urlencoded')) {
                resolve(Object.fromEntries(new URLSearchParams(body)));
            } else {
                resolve({});
            }
        });
    });
}

// ── Vercel serverless adaptörü ───────────────────────────────────────────────
function createVercelRes(nodeRes) {
    let _status = 200;
    const res = {
        get statusCode() { return _status; },
        set statusCode(v) { _status = v; },
        setHeader(k, v) { nodeRes.setHeader(k, v); },
        status(code)     { _status = code; return res; },
        json(data)       {
            nodeRes.statusCode = _status;
            nodeRes.setHeader('Content-Type', 'application/json');
            nodeRes.end(JSON.stringify(data));
        },
        send(data) {
            nodeRes.statusCode = _status;
            nodeRes.end(typeof data === 'string' ? data : String(data));
        },
        end() { nodeRes.statusCode = _status; nodeRes.end(); },
    };
    return res;
}

async function runApiHandler(handlerPath, req, nodeRes, extraQuery = {}) {
    const mod    = await import(handlerPath);
    const body   = await parseBody(req);
    const url    = new URL(req.url, 'http://localhost');
    const query  = { ...Object.fromEntries(url.searchParams), ...extraQuery };
    const vReq   = { method: req.method, headers: req.headers, body, query, socket: req.socket };
    const vRes   = createVercelRes(nodeRes);
    await mod.default(vReq, vRes);
}

// ── Statik dosya sunucu ──────────────────────────────────────────────────────
const CONTENT_TYPES = {
    '.html':  'text/html; charset=utf-8',
    '.css':   'text/css',
    '.js':    'text/javascript',
    '.json':  'application/json',
    '.png':   'image/png',
    '.jpg':   'image/jpeg',
    '.jpeg':  'image/jpeg',
    '.webp':  'image/webp',
    '.svg':   'image/svg+xml',
    '.ico':   'image/x-icon',
};

function serveStatic(filePath, res) {
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
            res.end(err.code === 'ENOENT' ? '404 Bulunamadı' : 'Sunucu Hatası');
        } else {
            res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'text/plain' });
            res.end(content);
        }
    });
}

// ── API Route tablosu ────────────────────────────────────────────────────────
const API_ROUTES = [
    { pattern: '/api/admin-login',        file: './api/admin.js',    query: {} },
    { pattern: '/api/products',           file: './api/products.js', query: {} },
    { pattern: '/api/orders',             file: './api/orders.js',   query: {} },
    { pattern: '/api/order-track',        file: './api/orders.js',   query: { action: 'track' } },
    { pattern: '/api/paytr-token',        file: './api/paytr.js',    query: { action: 'token' } },
    { pattern: '/api/paytr-callback',     file: './api/paytr.js',    query: { action: 'callback' } },
    { pattern: '/api/paytr-installments', file: './api/paytr.js',    query: { action: 'installments' } },
];

// ── HTTP Sunucu ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        });
        res.end();
        return;
    }

    // API Route eşleştirme
    const route = API_ROUTES.find(r => urlPath === r.pattern);
    if (route) {
        try {
            await runApiHandler(route.file, req, res, route.query);
        } catch (e) {
            console.error('API Hatası:', e);
            if (!res.writableEnded) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        }
        return;
    }

    // Statik dosya
    let filePath = urlPath === '/' ? '/index.html' : urlPath;
    serveStatic(path.join(__dirname, filePath), res);
});

server.listen(PORT, () => {
    console.log('\n  🟢 QR Web Sunucu Başlatıldı');
    console.log(`  ─────────────────────────────`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  Admin: http://localhost:${PORT}/admin.html`);
    console.log(`  ─────────────────────────────\n`);
});
