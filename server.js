const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3001;

// Trendyol API base URL
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

  // Health check
  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'KarPanel proxy çalışıyor' }));
    return;
  }

  // /api/urunler?sellerId=XXX&apiKey=YYY&apiSecret=ZZZ&page=0&size=50
  if (parsed.pathname === '/api/urunler') {
    const { sellerId, apiKey, apiSecret, page = 0, size = 50 } = parsed.query;

    if (!sellerId || !apiKey || !apiSecret) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'sellerId, apiKey ve apiSecret gerekli' }));
      return;
    }

    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const path = `/sapigw/suppliers/${sellerId}/products?page=${page}&size=${size}&approved=true`;

    const options = {
      hostname: TY_BASE,
      path,
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
          // Sadece gerekli alanları döndür
          const urunler = (json.content || []).map(p => ({
            id: p.id || p.barcode || p.productCode,
            barcode: p.barcode,
            title: p.title,
            productCode: p.productCode,
            salePrice: p.salePrice || 0,
            listPrice: p.listPrice || 0,
            commissionRate: p.commissionRate || null,
            categoryName: p.categoryName || '',
            categoryId: p.categoryId || null,
            stockCode: p.stockCode || '',
            quantity: p.quantity || 0,
            images: p.images || [],
          }));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            urunler,
            totalElements: json.totalElements || urunler.length,
            totalPages: json.totalPages || 1,
            currentPage: json.number || 0,
            pageSize: json.size || size,
          }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Trendyol yanıtı işlenemedi', raw: data.slice(0, 300) }));
        }
      });
    });

    tyReq.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Trendyol API bağlantı hatası: ' + e.message }));
    });

    tyReq.end();
    return;
  }

  // /api/komisyon?sellerId=XXX&apiKey=YYY&apiSecret=ZZZ&categoryId=ZZZ
  if (parsed.pathname === '/api/komisyon') {
    const { sellerId, apiKey, apiSecret } = parsed.query;

    if (!sellerId || !apiKey || !apiSecret) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'sellerId, apiKey ve apiSecret gerekli' }));
      return;
    }

    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const path = `/sapigw/suppliers/${sellerId}/commissions`;

    const options = {
      hostname: TY_BASE,
      path,
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
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(json));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'İşlenemedi' }));
        }
      });
    });

    tyReq.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });

    tyReq.end();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint bulunamadı' }));
});

server.listen(PORT, () => {
  console.log('');
  console.log('✅ KarPanel Proxy Sunucusu Başladı!');
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`❤️  Sağlık kontrolü: http://localhost:${PORT}/health`);
  console.log('');
  console.log('📌 Şimdi karpanel.html dosyasını tarayıcıda açabilirsiniz.');
  console.log('   Durdurmak için Ctrl+C basın.');
  console.log('');
});
