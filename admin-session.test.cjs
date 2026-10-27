const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{Readable}=require('node:stream');

function memory(){
 const stores={};const match=(r,q)=>Object.entries(q).every(([k,v])=>k==='$or'?v.some(x=>match(r,x)):k==='_id'?String(r[k])===String(v):v&&typeof v==='object'&&!(v instanceof Date)?Object.entries(v).every(([op,n])=>op==='$ne'?r[k]!==n:op==='$gt'?r[k]>n:op==='$lt'?r[k]<n:op==='$lte'?r[k]<=n:false):r[k]===v);
 return {stores,collection(name){const rows=stores[name]||(stores[name]=[]);const apply=(r,u,fresh)=>{if(fresh)Object.assign(r,u.$setOnInsert);Object.assign(r,u.$set||{});for(const [k,n]of Object.entries(u.$inc||{}))r[k]=(r[k]||0)+n;};return {
  async createIndex(){},
  async deleteOne(q){const i=rows.findIndex(r=>match(r,q));if(i>=0)rows.splice(i,1);return{};},
  async insertOne(r){const d={_id:'user-'+rows.length,...r};rows.push(d);return {insertedId:d._id};},
  async findOne(q){return rows.find(r=>match(r,q))||null;},
  async updateOne(q,u,opt={}){let r=rows.find(x=>match(x,q));const fresh=!r;if(!r){if(!opt.upsert)return {};r={_id:(rows.length+1).toString(16).padStart(24,'0'),...q};rows.push(r);}apply(r,u,fresh);return{};},
  async findOneAndUpdate(q,u){const r=rows.find(x=>match(x,q));if(!r)return null;apply(r,u,false);return {...r};},
  find(q={}){const c={sort(){return c;},project(){return c;},limit(){return c;},async toArray(){return rows.filter(r=>match(r,q));}};return c;}
 };}};
}
test('session survives page reload and server restart; logout revokes the cookie',async()=>{
 const a=await app();
 assert.equal((await a.request('/api/admin/oturum')).status,401);
 assert.equal((await a.request('/api/admin/giris',{sifre:'incorrect'})).status,401);
 const login=await a.request('/api/admin/giris',{sifre:'test-admin'});
 assert.equal(login.status,200);assert.deepEqual(JSON.parse(login.body),{ok:true});
 const cookie=login.headers['Set-Cookie'];assert.match(cookie,/HttpOnly; Secure; SameSite=Strict; Max-Age=43200/);
 assert(!cookie.includes('test-admin'));
 const headers={cookie:cookie.split(';')[0]};
 assert.equal((await a.request('/admin',undefined,headers)).status,200);
 assert.equal((await a.request('/api/admin/oturum',undefined,headers)).status,200);
 assert.equal((await a.request('/api/admin/users',undefined,headers)).status,200);
 const restarted=await app(a.db);
 assert.equal((await restarted.request('/api/admin/oturum',undefined,headers)).status,200);
 const logout=await restarted.request('/api/admin/cikis',{},headers);assert.equal(logout.status,200);assert.match(logout.headers['Set-Cookie'],/Max-Age=0/);
 assert.equal((await a.request('/api/admin/oturum',undefined,headers)).status,401);
});
test('expired, forged and legacy password tokens cannot access admin routes',async()=>{
 const a=await app();const login=await a.request('/api/admin/giris',{sifre:'test-admin'});const headers={cookie:login.headers['Set-Cookie'].split(';')[0]};
 a.db.stores.adminSessions[0].expiresAt=new Date(0);
 assert.equal((await a.request('/api/admin/oturum',undefined,headers)).status,401);
 assert.equal((await a.request('/api/admin/users?token=test-admin')).status,401);
 assert.equal((await a.request('/api/admin/users',undefined,{cookie:'__Host-kh_admin='+'a'.repeat(64)})).status,401);
 for(const [route,body]of [['users'],['blog'],['premium',{token:'test-admin',email:'test@example.com',aktif:true}],['sil',{token:'test-admin'}],['sifre-sifirla',{token:'test-admin'}],['blog',{}],['blog/sil',{}]])assert.equal((await a.request('/api/admin/'+route,body)).status,401,route);
});
test('cross-origin writes are rejected and valid same-origin session can update premium',async()=>{
 const a=await app();await a.db.collection('users').insertOne({email:'test@example.com'});
 const login=await a.request('/api/admin/giris',{sifre:'test-admin'});const headers={cookie:login.headers['Set-Cookie'].split(';')[0],host:'komisyonhesap.com'};
 const body={email:'test@example.com',aktif:true};
 assert.equal((await a.request('/api/admin/premium',body,{...headers,origin:'https://example.com'})).status,403);
 assert.equal((await a.request('/api/admin/cikis',{}, {...headers,'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await a.request('/api/admin/premium',body,{...headers,origin:'https://komisyonhesap.com'})).status,200);
 assert.equal(a.db.stores.users[0].premium,true);
});
test('admin HTML compiles and restores session without browser storage of credentials',async()=>{
 const a=await app();const r=await a.request('/admin');
 assert.match(r.body,/adminOturumunuYukle\(\);/);assert(!r.body.includes('adminToken'));assert(!r.body.includes('?token='));
 for(const m of r.body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
});
test('frontend restores the selected page after reload and does not override a later login',async()=>{
 const a=await app();const html=(await a.request('/admin')).body;
 const code=html.slice(html.indexOf('function adminOturumuKapat(){'),html.indexOf('function sayfaGoster('));
 const els={};const element=id=>els[id]||(els[id]={style:{},open:false});let loaded=0,selected='';let finish;
 const context={adminOturumSurumu:0,tumKullanicilar:[],document:{getElementById:element},fetch:async()=>({ok:true,json:async()=>({ok:true})}),sessionStorage:{getItem:()=> 'istatistikler'},sayfaGoster:p=>selected=p,yukleCullanicilari:async()=>{loaded++;}};
 vm.createContext(context);vm.runInContext(code,context);await context.adminOturumunuYukle();
 assert.equal(els['admin-panel'].style.display,'flex');assert.equal(els['login-section'].style.display,'none');assert.equal(selected,'istatistikler');assert.equal(loaded,1);
 context.fetch=()=>new Promise(r=>finish=r);const pending=context.adminOturumunuYukle();context.adminOturumSurumu++;finish({ok:true,json:async()=>({ok:true})});await pending;assert.equal(loaded,1);
});
test('member management validates expiry and password, and preserves the payment date on extensions',async()=>{
 const a=await app();const payment=new Date('2026-01-01T00:00:00Z');await a.db.collection('users').insertOne({email:'member@example.com',premium:true,odemeTarihi:payment});
 const login=await a.request('/api/admin/giris',{sifre:'test-admin'});const headers={cookie:login.headers['Set-Cookie'].split(';')[0]};
 for(const bitisTarihi of ['invalid','2000-01-01'])assert.equal((await a.request('/api/admin/premium',{email:'member@example.com',aktif:true,bitisTarihi},headers)).status,400);
 const bitisTarihi=new Date(Date.now()+90*86400000).toISOString();assert.equal((await a.request('/api/admin/premium',{email:'member@example.com',aktif:true,bitisTarihi},headers)).status,200);
 assert.equal(a.db.stores.users[0].uyelikBitis.toISOString(),bitisTarihi);assert.equal(a.db.stores.users[0].odemeTarihi,payment);
 assert.equal((await a.request('/api/admin/premium',{email:'missing@example.com',aktif:true},headers)).status,404);
 assert.equal((await a.request('/api/admin/sifre-sifirla',{email:'member@example.com',yeniSifre:'short'},headers)).status,400);
 assert.equal((await a.request('/api/admin/sifre-sifirla',{email:'member@example.com',yeniSifre:'test-only-new'},headers)).status,200);assert.equal(a.db.stores.users[0].sifre,'test-only-new');
 assert.equal((await a.request('/api/admin/premium',{email:'member@example.com',aktif:false},headers)).status,200);assert.equal(a.db.stores.users[0].premium,false);assert.equal(a.db.stores.users[0].uyelikBitis,null);
});
test('member cards filter, search and sort safely; pagination resets on filtering',async()=>{
 const a=await app(),html=(await a.request('/admin')).body;
 const code=html.slice(html.indexOf('function kullaniciTarih('),html.indexOf('function uyelikTarihAlani('));
 const els={};function el(){return {children:[],attrs:{},value:'',style:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},appendChild(x){this.children.push(x);},append(...xs){this.children.push(...xs);},replaceChildren(){this.children=[];},addEventListener(){}};}
 const get=id=>els[id]||(els[id]=el());get('users-sort').value='yeni';
 const now=new Date(),near=new Date(Date.now()+86400000);const members=Array.from({length:25},(_,i)=>({ad:i===0?'İBRAHİM <img onerror=x>':'Üye '+i,email:'user'+i+'@example.com',loginCount:i,kayitTarihi:now,premium:i===0,trialAktif:i===1,uyelikBitis:i<3?near:null}));
 const context={document:{getElementById:get,createElement:el},tumKullanicilar:members,kullaniciSayfa:1,aktifFiltre:'hepsi'};vm.createContext(context);vm.runInContext(code,context);context.renderTablo();
 assert.equal(els['users-tbody'].children.length,20);assert.equal(els['users-next'].disabled,false);context.kullaniciSayfaDegistir(1);assert.equal(els['users-tbody'].children.length,5);
 context.filtrele('bitiyor');assert.equal(context.kullaniciSayfa,1);assert.equal(els['users-tbody'].children.length,1);assert.equal(els['sf-bitiyor'].attrs['aria-pressed'],'true');assert.equal(els['sf-hepsi'].attrs['aria-pressed'],'false');
 assert.equal(context.kullaniciListesi('','premium','yeni').length,1);assert.equal(context.kullaniciListesi('','deneme','yeni').length,1);assert.equal(context.kullaniciListesi('','ucretsiz','yeni').length,23);assert.equal(context.kullaniciListesi('ibrahim','hepsi','yeni').length,1);assert.equal(context.kullaniciListesi('','hepsi','giris')[0].loginCount,24);
 context.filtrele('hepsi');const name=els['users-tbody'].children[0].children[0].children[0].children[1].children[0];assert.equal(name.textContent,members[0].ad);assert(!name.innerHTML);
 get('search-input').value='no-match';context.aramaYap();assert.equal(els['users-tbody'].children[0].children[0].colSpan,8);context.kullaniciFiltreTemizle();assert.equal(context.aktifFiltre,'hepsi');assert.equal(els['gosterilen-sayi'].textContent,25);
});
test('coupon article is public, has metadata and is included in sitemap',async()=>{
 const a=await app();const route='/blog/trendyol-kupon-maliyeti-hesaplama';const r=await a.request(route);assert.equal(r.status,200);assert.match(r.body,/Trendyol Kupon Maliyeti/);assert.match(r.body,/36,67 TL/);assert.match(r.body,/<link rel="canonical"/);assert.match(r.body,/BlogPosting/);assert.match(r.body,/FAQPage/);assert.match(r.body,/akademi.trendyol.com/);assert.match((await a.request('/sitemap.xml')).body,/trendyol-kupon-maliyeti-hesaplama/);
});
test('draft and deleted seeded articles do not reappear in lists, pages or after restart',async()=>{
 const a=await app(),slug='trendyol-kupon-maliyeti-hesaplama';const post=a.db.stores.blog.find(y=>y.slug===slug);assert(post);
 const login=await a.request('/api/admin/giris',{sifre:'test-admin'}),headers={cookie:login.headers['Set-Cookie'].split(';')[0]};const payload={id:post._id,baslik:post.baslik,icerik:post.icerik,ozet:post.ozet,yayinda:false};
 assert.equal((await a.request('/api/admin/blog',payload,headers)).status,200);assert.equal((await a.request('/blog/'+slug)).status,404);assert(!JSON.parse((await a.request('/api/blog')).body).some(y=>y.slug===slug));assert(!(await a.request('/sitemap.xml')).body.includes('/blog/'+slug));
 assert.equal((await a.request('/api/admin/blog',{...payload,yayinda:true},headers)).status,200);assert.equal((await a.request('/blog/'+slug)).status,200);
 assert.equal((await a.request('/api/admin/blog/sil',{id:post._id},headers)).status,200);const restarted=await app(a.db);assert.equal((await restarted.request('/blog/'+slug)).status,404);assert(!JSON.parse((await restarted.request('/api/admin/blog',undefined,headers)).body).some(y=>y.slug===slug));
});
test('blog editor filters and preview escape markup while keeping supported links',async()=>{
 const a=await app(),html=(await a.request('/admin')).body;const fn=html.slice(html.indexOf('function blogEsc('),html.indexOf('function blogFiltrele('));const context={};vm.createContext(context);vm.runInContext(fn,context);
 assert.equal(context.blogListeSec([{baslik:'Kupon rehberi',yayinda:true},{baslik:'İade rehberi',yayinda:false}],'taslak','iade').length,1);
 assert.equal(context.blogListeSec([{baslik:'Kupon',yayinda:true}],'yayinda','eksik').length,0);
 const rendered=context.blogIcerikRender('## Örnek\n\n<script>alert(1)</script>\n\n[Hesapla](/trendyol-komisyon-hesaplama)\n\n[Ana sayfa](/)\n\n- Bir\n- İki');assert(!rendered.includes('<script>'));assert.match(rendered,/&lt;script&gt;/);assert.match(rendered,/<h2>Örnek<\/h2>/);assert.match(rendered,/href="\/trendyol-komisyon-hesaplama"/);assert.match(rendered,/<a href="\/">Ana sayfa<\/a>/);assert.match(rendered,/<ul>/);
});
test('editor word counter and SEO preview use the actual form content',async()=>{
 const a=await app(),html=(await a.request('/admin')).body;const code=html.slice(html.indexOf('function blogEsc('),html.indexOf("document.getElementById('blog-editor-form').addEventListener"));
 const els={};const get=id=>els[id]||(els[id]={value:'',checked:true});get('blog-baslik').value='Kupon maliyeti';get('blog-icerik').value='Bir iki\nüç';
 const ctx={document:{getElementById:get}};vm.createContext(ctx);vm.runInContext(code,ctx);ctx.blogYaziBilgisi();assert.match(els['blog-wordcount'].textContent,/3 kelime/);assert.match(els['blog-seo-url'].textContent,/kupon-maliyeti/);assert.match(els['blog-seo-title'].textContent,/KomisyonHesap/);assert.equal(els['blog-save'].textContent,'Yayınla');
 get('blog-yayinda').checked=false;ctx.blogYaziBilgisi();assert.equal(els['blog-save'].textContent,'Taslağı kaydet');
});
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=body;this.done?.();}};}
async function app(sharedDb){
 const db=sharedDb||memory(),notices=[];let handler;let payment={status:'success',paymentStatus:'SUCCESS',paymentId:'p-1'};
 const context={__dirname,console:{log(){},error(){}},Buffer,URL,URLSearchParams,fetch:()=>{throw Error('No external mail in tests');},process:{env:{MONGO_URI:'test',ADMIN_SIFRE:'test-admin',IYZICO_API_KEY:'test',IYZICO_SECRET:'test'}},setTimeout,clearTimeout,setInterval:()=>({unref(){}}),require(name){
  if(name==='http')return {createServer(h){handler=h;return {listen(){}};}};
  if(name==='mongodb')return {ObjectId:class {constructor(v){this.v=v;}toString(){return this.v;}static isValid(v){return /^[a-f0-9]{24}$/.test(v);}},MongoClient:{connect:async()=>({db:()=>db})}};
  if(name==='iyzipay')return function(){this.checkoutForm={retrieve(_p,cb){cb(null,payment);}};};
  if(name==='./member-notifications')return {createMemberNotifications:()=>({flush:async()=>{},enqueue:async(...args)=>notices.push(args)})};
  return require(name.startsWith('./')?path.join(__dirname,name):name);
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),context);await new Promise(setImmediate);
 return {db,notices,setPayment(p){payment=p;},async request(url,body,headers={},method=body===undefined?'GET':'POST'){const req=Readable.from(body===undefined?[]:[typeof body==='string'?body:JSON.stringify(body)]);Object.assign(req,{url,method,headers,socket:{remoteAddress:'test'}});const r=res(),ended=new Promise(resolve=>r.done=resolve);await handler(req,r);await ended;await new Promise(setImmediate);return r;}};
}


test('consolidated articles redirect and stay absent from sitemap even if old DB entries are published',async()=>{
 const a=await app();
 for(const slug of ['trendyol-komisyon-hesaplama-gercek-krinizi-dakikalar-icinde-ogrenin','trendyol-komisyon-hesaplama-gercek-krinizi-ogrenmenin-en-kolay-yolu']){
  await a.db.collection('blog').updateOne({slug},{$set:{slug,baslik:'Eski yazı',yayinda:true}},{upsert:true});
  const r=await a.request('/blog/'+slug);assert.equal(r.status,301);assert.equal(r.headers.Location,'/trendyol-komisyon-hesaplama');
  assert(!(await a.request('/sitemap.xml')).body.includes(slug));
  assert(!(await a.request('/blog')).body.includes('/blog/'+slug));
 }
});
test('public blog HEAD requests preserve GET status, cache and visibility without returning a body',async()=>{
 const a=await app();
 const routes=['/blog','/blog/','/blog/trendyol-kupon-maliyeti-hesaplama','/blog/does-not-exist','/blog/trendyol-komisyon-hesaplama-gercek-krinizi-dakikalar-icinde-ogrenin'];
 for(const route of routes){
  const get=await a.request(route),head=await a.request(route,undefined,{},'HEAD');
  assert.equal(head.status,get.status,route);assert.equal(head.headers['Cache-Control'],get.headers['Cache-Control'],route);assert.equal(head.headers.Location,get.headers.Location,route);assert.equal(head.body,undefined,route);
 }
 const post=a.db.stores.blog.find(y=>y.slug==='trendyol-kupon-maliyeti-hesaplama');post.yayinda=false;
 assert.equal((await a.request('/blog/'+post.slug,undefined,{},'HEAD')).status,404);
});
