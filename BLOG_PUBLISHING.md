# Blog yayınlama

Admin oturumu yerine yetkili GitHub bağlantısıyla `blog-posts.json` dosyasına yeni kayıt eklenir. Yeni parola, token veya herkese açık yazma endpoint'i yoktur. GitHub yetkisinin geçerli olması gerekir; bağlantı kaldırılırsa yeniden yetkilendirme gerekebilir. Bu yöntem yalnız içerik dosyasını değiştirir, GitHub bağlantısının kendi depo yetkilerini daraltmaz.

1. Önce canlı `/api/blog`, mevcut editoryal yazılar ve bu dosyayı incele; tekrar eden konu veya slug üretme.
2. JSON dizisinin sonuna `slug`, `baslik`, `ozet`, `icerik`, `yayinda: true`, ISO 8601 `tarih` ve `guncelleme` alanlarıyla kayıt ekle. `faq` isteğe bağlı soru/cevap dizisidir. İçerik düz metindir: `##` alt başlık, boş satır paragraf, `-` liste, Markdown bağlantıları desteklenir. Ham HTML kullanma.
3. `node --test blog-publishing.test.js` çalıştır; mevcut kayıtları silme veya değiştirme. `main` dalındaki güncel dosya SHA'sını kullanarak yalnız bu dosyayı kaydet.
4. Mevcut Render otomatik dağıtımı tamamlanınca uygulama yeni yazıları aynı blog koleksiyonuna slug ile bir kez ekler. Admin panelinde sonradan yapılan değişiklikler `$setOnInsert` sayesinde korunur. Var olan yazının güncellenmesi bu ekleme akışının kapsamı dışındadır. Dosyadan silme daha önce yayımlanan kaydı kaldırmaz. Gelecek tarihli/taslak kayıtlar yüklenmez; tarih geldiğinde yeni dağıtım gerekir.
5. Başarı için canlı `/blog/SLUG` sayfasında başlık ve içerik ile `/api/blog` listesini doğrula. GitHub kaydı tek başına yayın başarısı değildir. API yanıtında `X-Blog-Publishing: repository-v1` bu sürümün dağıtıldığını gösterir. Dağıtım veya erişim hatasında kısa bildirim ver; admin şifresi isteme, güvenliği zayıflatma.

Her içerikte güncel iddiaları kaynaklarla doğrula, arama hacmi uydurma, sitedeki gerçek deneme koşullarına yönlendir ve yayımlanınca başlık/bağlantıyla kullanıcıya haber ver. Gizli bilgileri depoya ekleme.
