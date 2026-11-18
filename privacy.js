(function () {
  'use strict';
  var KEY = 'kh_privacy_v1', VERSION = '2026-11-18';
  var prefs = { analytics: false, marketing: false }, chosen = false, loaded = false;
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.version === VERSION && Date.now() - saved.at < 180 * 86400000) { prefs.analytics = saved.analytics === true; prefs.marketing = saved.marketing === true; chosen = true; } } catch (_) {}
  window.dataLayer = window.dataLayer || [];
  function raw() { window.dataLayer.push(arguments); }
  // No analytics or advertising events are queued before the matching choice.
  window.gtag = function (command, name, options) {
    if (command !== 'event') return;
    var advertising = name === 'conversion' || /AW-/.test(String(options && options.send_to || ''));
    if (advertising ? prefs.marketing : prefs.analytics) raw(command, name, options || {});
  };
  function start() {
    if (loaded || (!prefs.analytics && !prefs.marketing)) return;
    loaded = true;
    raw('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    raw('consent', 'update', { analytics_storage: prefs.analytics ? 'granted' : 'denied', ad_storage: prefs.marketing ? 'granted' : 'denied', ad_user_data: prefs.marketing ? 'granted' : 'denied', ad_personalization: prefs.marketing ? 'granted' : 'denied' });
    raw('js', new Date());
    if (prefs.analytics) {
      // Keep only our public campaign names. Never send arbitrary query values,
      // payment tokens, emails, or calculator inputs to analytics.
      var page = location.origin + location.pathname;
      try {
        var query = new URLSearchParams(location.search);
        var source = query.get('utm_source');
        var sources = { ecuy_facebook: 'organic_social', whatsapp: 'referral', paylasim: 'referral' };
        if (Object.prototype.hasOwnProperty.call(sources, source)) page += '?utm_source=' + source + '&utm_medium=' + sources[source] + '&utm_campaign=satici_araclari';
        else if (query.get('from') === 'excel_template') page += '?utm_source=ucretsiz_excel&utm_medium=referral&utm_campaign=satici_araclari';
      } catch (_) {}
      raw('config', 'G-2YV09HMHWK', { page_location: page, page_referrer: document.referrer.split('?')[0].split('#')[0] });
    }
    if (prefs.marketing) raw('config', 'AW-16989542935');
    var script = document.createElement('script'); script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + (prefs.analytics ? 'G-2YV09HMHWK' : 'AW-16989542935');
    script.setAttribute('data-kh-consented', '1'); document.head.appendChild(script);
  }
  function clearOptionalCookies() {
    var domains = ['', location.hostname, '.' + location.hostname, '.komisyonhesap.com'];
    document.cookie.split(';').map(function (part) { return part.trim().split('=')[0]; }).filter(function (name) { return /^(_ga|_gid|_gat|_gcl)/.test(name); }).forEach(function (name) {
      domains.forEach(function (domain) { document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' + (domain ? '; domain=' + domain : ''); });
    });
  }
  function save(analytics, marketing) {
    var reload = loaded && (prefs.analytics !== analytics || prefs.marketing !== marketing);
    prefs = { analytics: analytics, marketing: marketing }; chosen = true;
    try { localStorage.setItem(KEY, JSON.stringify({ version: VERSION, at: Date.now(), analytics: analytics, marketing: marketing })); } catch (_) {}
    document.getElementById('kh-cookie-panel').hidden = true;
    if (!analytics || !marketing) clearOptionalCookies();
    if (reload) { raw('consent', 'update', { analytics_storage: analytics ? 'granted' : 'denied', ad_storage: marketing ? 'granted' : 'denied', ad_user_data: marketing ? 'granted' : 'denied', ad_personalization: marketing ? 'granted' : 'denied' }); location.reload(); return; }
    start();
  }
  window.khOpenCookiePreferences = function () {
    var panel = document.getElementById('kh-cookie-panel'); if (!panel) return;
    panel.hidden = false; document.getElementById('kh-cookie-settings').hidden = false;
    document.getElementById('kh-cookie-analytics').checked = prefs.analytics;
    document.getElementById('kh-cookie-marketing').checked = prefs.marketing;
    document.getElementById('kh-cookie-title').focus();
  };
  function render() {
    var style = document.createElement('style');
    style.textContent = '#kh-cookie-panel[hidden],#kh-cookie-settings[hidden]{display:none!important}#kh-cookie-panel{position:fixed;inset:auto 16px 16px;max-width:780px;margin:auto;background:#fff;color:#241d17;border:1px solid #cdbba8;border-radius:14px;box-shadow:0 12px 60px #0004;padding:20px;z-index:100000;font:14px/1.6 system-ui,sans-serif;max-height:80vh;overflow:auto}#kh-cookie-title{font-size:19px;margin:0 0 6px}#kh-cookie-panel p{margin:6px 0 13px}#kh-cookie-panel a{color:#82410e;text-decoration:underline}#kh-cookie-actions{display:flex;gap:9px;flex-wrap:wrap}#kh-cookie-panel button{font:inherit;font-weight:650;padding:10px 14px;border:1px solid #82410e;border-radius:8px;background:#fff7ed;color:#663410;cursor:pointer;min-height:44px}#kh-cookie-settings label{display:flex;align-items:center;gap:10px;margin:10px 0}#kh-cookie-settings input{width:20px;height:20px;margin:0}#kh-cookie-reopen{position:fixed;left:12px;bottom:10px;z-index:9999;border:1px solid #d3c2af;border-radius:8px;padding:6px 10px;background:#fff;color:#663410;font:12px system-ui;cursor:pointer}';
    document.head.appendChild(style);
    var panel = document.createElement('section'); panel.id = 'kh-cookie-panel'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', 'kh-cookie-title'); panel.hidden = chosen;
    panel.innerHTML = '<h2 id="kh-cookie-title" tabindex="-1">Çerez tercihleri</h2><p>Oturum ve tercihleri hatırlamak için gerekli depolama kullanılır. Google Analytics ile ölçüm ve Google Ads ile reklam takibi yalnızca seçiminizle açılır. Reddetmeniz hesaplama ve üyeliği etkilemez. <a href="/yasal/cerez">Çerez politikası</a></p><div id="kh-cookie-settings" hidden><label><input type="checkbox" disabled checked> Zorunlu oturum ve tercihler</label><label><input type="checkbox" id="kh-cookie-analytics"> İstatistik ve kullanım ölçümü</label><label><input type="checkbox" id="kh-cookie-marketing"> Reklam ve dönüşüm takibi</label><button type="button" id="kh-cookie-save">Seçimlerimi kaydet</button></div><div id="kh-cookie-actions"><button type="button" id="kh-cookie-reject">Tümünü reddet</button><button type="button" id="kh-cookie-preferences">Tercihler</button><button type="button" id="kh-cookie-accept">Tümünü kabul et</button></div>';
    document.body.appendChild(panel);
    var reopen = document.createElement('button'); reopen.type = 'button'; reopen.id = 'kh-cookie-reopen'; reopen.textContent = 'Çerez tercihleri'; reopen.addEventListener('click', window.khOpenCookiePreferences); document.body.appendChild(reopen);
    document.getElementById('kh-cookie-reject').addEventListener('click', function () { save(false, false); });
    document.getElementById('kh-cookie-accept').addEventListener('click', function () { save(true, true); });
    document.getElementById('kh-cookie-preferences').addEventListener('click', window.khOpenCookiePreferences);
    document.getElementById('kh-cookie-save').addEventListener('click', function () { save(document.getElementById('kh-cookie-analytics').checked, document.getElementById('kh-cookie-marketing').checked); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
  start();
})();
