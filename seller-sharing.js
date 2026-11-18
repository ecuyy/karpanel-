(function () {
  'use strict';
  function track(name, fields) {
    if (typeof window.gtag === 'function') window.gtag('event', name, fields);
  }
  document.querySelectorAll('[data-kh-excel]').forEach(function (link) {
    link.addEventListener('click', function () { track('file_download', { file_name: 'trendyol-kar-hesaplama-ornek.xlsx', file_extension: 'xlsx', link_url: location.origin + '/downloads/trendyol-kar-hesaplama-ornek.xlsx' }); });
  });
  var base = 'https://komisyonhesap.com/trendyol-komisyon-hesaplama';
  document.querySelectorAll('[data-kh-sharing]').forEach(function (box) {
    box.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px;font:14px/1.6 system-ui,sans-serif';
    var label = document.createElement('span'); label.textContent = 'Başka bir Trendyol satıcısıyla paylaş:'; box.appendChild(label);
    var whatsapp = document.createElement('a');
    whatsapp.textContent = 'WhatsApp’ta paylaş'; whatsapp.target = '_blank'; whatsapp.rel = 'noopener noreferrer';
    whatsapp.href = 'https://wa.me/?text=' + encodeURIComponent('Trendyol ürününün komisyon ve kargo sonrası kârını ücretsiz hesapla. Üyelik gerekmez: ' + base + '?utm_source=whatsapp&utm_medium=referral&utm_campaign=satici_araclari');
    whatsapp.style.cssText = 'padding:8px 12px;border:1px solid #b88a60;border-radius:8px;color:#663410;background:#fff7ed;text-decoration:none;font-weight:700';
    whatsapp.addEventListener('click', function () { track('share', { method: 'whatsapp', content_type: 'calculator', item_id: 'trendyol_commission' }); });
    box.appendChild(whatsapp);
    var copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Bağlantıyı kopyala';
    copy.style.cssText = 'padding:8px 12px;border:1px solid #b88a60;border-radius:8px;color:#663410;background:#fff7ed;font:inherit;font-weight:700;cursor:pointer';
    var status = document.createElement('span'); status.setAttribute('role', 'status');
    copy.addEventListener('click', async function () {
      var link = base + '?utm_source=paylasim&utm_medium=referral&utm_campaign=satici_araclari';
      try {
        await navigator.clipboard.writeText(link);
        status.textContent = 'Bağlantı kopyalandı.';
        track('share', { method: 'copy_link', content_type: 'calculator', item_id: 'trendyol_commission' });
      } catch (_) {
        status.textContent = 'Kopyalamak için: ' + link;
      }
    });
    box.appendChild(copy); box.appendChild(status);
  });
})();
