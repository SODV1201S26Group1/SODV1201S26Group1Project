const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const API_BASE_URL = 'https://sodv1201s26group1project-api.onrender.com';

const proxyPaths = new Set([
    '/register',
    '/login',
    '/properties',
    '/workspaces',
    '/messages'
]);

function isApiPath(requestPath) {
    return Array.from(proxyPaths).some(basePath =>
        requestPath === basePath || requestPath.startsWith(`${basePath}/`)
    );
}

async function proxyRequest(req, res) {
    const targetUrl = new URL(req.url, API_BASE_URL);
    const headers = {};

    if (req.headers.authorization) {
        headers.authorization = req.headers.authorization;
    }

    if (req.headers['content-type']) {
        headers['content-type'] = req.headers['content-type'];
    }

    if (req.headers.accept) {
        headers.accept = req.headers.accept;
    }

    const requestOptions = {
        method: req.method,
        headers
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];

        for await (const chunk of req) {
            chunks.push(chunk);
        }

        requestOptions.body = Buffer.concat(chunks).toString('utf8');
    }

    const upstreamResponse = await fetch(targetUrl, requestOptions);
    const bodyBuffer = Buffer.from(await upstreamResponse.arrayBuffer());

    res.writeHead(upstreamResponse.status, {
        'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json'
    });
    res.end(bodyBuffer);
}

const server = http.createServer((req, res) => {
    const requestPath = new URL(req.url, `http://localhost:${PORT}`).pathname;

    if (isApiPath(requestPath)) {
        proxyRequest(req, res).catch(error => {
            console.error('Proxy error:', error);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Proxy request failed.' }));
        });
        return;
    }

    let filePath = path.join(PUBLIC_DIR, requestPath === '/' ? 'index.html' : requestPath);
    
    // Normalize path and prevent directory traversal
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // Default to index.html for unknown routes (SPA behavior)
    if (!filePath.endsWith('.html') && !filePath.endsWith('.js') && 
        !filePath.endsWith('.css') && !filePath.endsWith('.json')) {
        filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        // Set appropriate content type
        let contentType = 'text/html';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        else if (filePath.endsWith('.css')) contentType = 'text/css';
        else if (filePath.endsWith('.json')) contentType = 'application/json';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
