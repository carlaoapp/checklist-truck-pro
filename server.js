const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

const server = http.createServer((req, res) => {
  // Remove query strings
  let reqPath = decodeURI(req.url.split('?')[0]);

  // Endpoint de Ping/Health para Anti-Sleep do Render e clientes
  if (reqPath === '/ping' || reqPath === '/api/ping' || reqPath === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'checklist-truck-pro',
      timestamp: Date.now(),
      uptime: Math.floor(process.uptime())
    }));
    return;
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Security: Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Proibido');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Arquivo Não Encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Headers para PWA e Service Worker
    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    };

    if (ext === '.js' && filePath.endsWith('sw.js')) {
      headers['Service-Worker-Allowed'] = '/';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

// --- Anti-Sleep / Keep-Alive para Render (Evita hibernação a cada 7 segundos) ---
const RENDER_PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || 'https://checklist-truck-pro.onrender.com';

function initRenderKeepAlive() {
  const INTERVAL_MS = 7 * 1000; // 7 segundos (desperta continuamente para evitar suspensão)
  console.log(`[Keep-Alive] Robô anti-sleep ativado. Alvo: ${RENDER_PUBLIC_URL}/api/ping (a cada 7 segundos)`);

  const executePing = async () => {
    try {
      const pingUrl = `${RENDER_PUBLIC_URL.replace(/\/$/, '')}/api/ping?t=${Date.now()}`;
      if (typeof fetch === 'function') {
        const response = await fetch(pingUrl, {
          headers: { 'User-Agent': 'RenderKeepAlive/1.0', 'Cache-Control': 'no-cache' }
        });
        if (Math.random() < 0.05) {
          console.log(`[Keep-Alive] Auto-ping enviado -> HTTP ${response.status} (${new Date().toLocaleTimeString('pt-BR')})`);
        }
      } else {
        const client = pingUrl.startsWith('https') ? require('https') : require('http');
        client.get(pingUrl, (res) => {
          if (Math.random() < 0.05) {
            console.log(`[Keep-Alive] Auto-ping enviado -> HTTP ${res.statusCode} (${new Date().toLocaleTimeString('pt-BR')})`);
          }
        }).on('error', () => {});
      }
    } catch (err) {
      // Ignora falhas temporárias de conexão
    }
  };

  // Ping inicial rápido após ligar o servidor
  setTimeout(executePing, 2000);

  // Ping contínuo a cada 7 segundos
  setInterval(executePing, INTERVAL_MS);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('================================================================');
  console.log('  🚛 CHECKLIST TRUCK PRO - SERVIDOR INICIADO');
  console.log('================================================================');
  console.log(`  Local no Computador:  http://localhost:${PORT}`);
  
  const ips = getLocalIpAddresses();
  if (ips.length > 0) {
    console.log('  No Celular / Wi-Fi:');
    ips.forEach(ip => {
      console.log(`  📱 http://${ip}:${PORT}`);
    });
  }
  console.log('================================================================');
  console.log('  Pressione Ctrl+C para encerrar.');

  // Inicia o keep-alive para não deixar o Render dormir
  initRenderKeepAlive();
});
