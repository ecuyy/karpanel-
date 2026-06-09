const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const TY_BASE = 'api.trendyol.com';

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const server = http.createServer((req, res) => {
  corsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  // Ana sayfa - karpanel.html'i sun
  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    const filePath = path.join(__dirname, 'karpanel.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('karpanel.html bulunamadi');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // Health check
  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'KarPanel proxy calisiyor' }));
    return;
  }

  // /api/urunler
  if (parsed.pathname === '/api/urunler') {
    const { sellerId, apiKey, apiSecret, page = 0, size = 50 } = parsed.query;

    if (!sellerId || !apiKey || !apiSecret) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'sellerId, apiKey ve apiSecret gerekli' }));
      return;
    }

    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const tyPath = `/sapigw/suppliers/${sellerId}/products?page=${page}&size=${size}&approved=true`;

    const options = {
      hostname: TY_BASE,
      path: tyPath,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'User-Agent': `${sellerId} - SelfIntegration`,
        'Content-Type': 'application/json',
      },
    };

    const tyReq = https.request(options, (tyRes) => {
      let data = '';
      tyRes.on('data', chunk => data += chunk);
      tyRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          const urunler = (json.content || []).map(p => ({
            id: p.id || p.barcode || p.productCode,
            barcode: p.barcode,
            title: p.title,
            salePrice: p.salePrice || 0,
            listPrice: p.listPrice || 0,
            commissionRate: p.commissionRate || null,
            categoryName: p.categoryName || '',
            quantity: p.quantity || 0,
          }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            urunler,
            totalElements: json.totalElements || urunler.length,
            totalPages: json.totalPages || 1,
            currentPage: json.number || 0,
          }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Trendyol yaniti islenemedi' }));
        }
      });
    });

    tyReq.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Baglanti hatasi: ' + e.message }));
    });

    tyReq.end();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint bulunamadi' }));
});

server.listen(PORT, () => {
  console.log('');
  console.log('KarPanel Proxy Sunucusu Basladi!');
  console.log('http://localhost:' + PORT);
  console.log('');
});
