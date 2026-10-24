const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const {app}=require('./security-test-helper.cjs');
const security=require('./security');
const signup={ad:'Test Üyesi',email:'member@example.test',sifre:'test-password'};
function cookie(response){return {cookie:response.headers['Set-Cookie'].split(';')[0]};}

test('signup hashes passwords and issues an HttpOnly session; legacy login upgrades transparently',async()=>{
 const a=await app();const response=await a.request('/api/kayit',signup);
 assert.equal(response.status,200);assert.match(response.headers['Set-Cookie'],/__Host-kh_user=.*HttpOnly; Secure; SameSite=Lax/);
 assert.match(a.db.stores.users[0].sifre,/^scrypt\$/);assert(await security.verifyPassword(signup.sifre,a.db.stores.users[0].sifre));
 assert(!response.body.includes('scrypt$'));assert.equal((await a.request('/api/oturum',undefined,cookie(response))).status,200);
 await a.db.collection('users').insertOne({email:'legacy@example.test',ad:'Legacy',sifre:'old-password',premium:true});
 assert.equal((await a.request('/api/giris',{email:'legacy@example.test',sifre:'wrong'})).status,401);
 const login=await a.request('/api/giris',{email:'legacy@example.test',sifre:'old-password'});assert.equal(login.status,200);
 assert(!login.headers['Set-Cookie'].includes('Max-Age'));assert.match(a.db.stores.users[1].sifre,/^scrypt\$/);
 assert.equal((await a.request('/api/giris',{email:'legacy@example.test',sifre:'old-password',hatirla:true})).status,200);
 assert.equal((await a.request('/api/oturum')).status,401);
});
test('products and invoices are bound to the session; no anonymous or cross-account reads/writes',async()=>{
 const a=await app(),login=await a.request('/api/kayit',signup),headers=cookie(login);
 const products=[{id:'SKU-1',salePrice:600,alis:180,kargo:84.49,commissionRate:21.36}];
 for(const [path,body]of [['/api/urunler/yukle?email='+signup.email],['/api/urunler/kaydet',{email:signup.email,urunler:products}],['/api/fatura/kaydet',{email:signup.email,fatura:{ad:'Example'}}]])assert.equal((await a.request(path,body)).status,401);
 assert.equal((await a.request('/api/urunler/kaydet',{email:signup.email,urunler:products},headers)).status,200);
 assert.deepEqual(JSON.parse((await a.request('/api/urunler/yukle',undefined,headers)).body).urunler,products);
 assert.equal((await a.request('/api/urunler/yukle?email=other@example.test',undefined,headers)).status,403);
 assert.equal((await a.request('/api/urunler/kaydet',{email:'other@example.test',urunler:[]},headers)).status,403);
 assert.equal((await a.request('/api/fatura/kaydet',{email:'other@example.test',fatura:{}},headers)).status,403);
 assert.equal(a.db.stores.urunler.length,1);
 const restarted=await app(a.db);assert.equal((await restarted.request('/api/oturum',undefined,headers)).status,200);
 assert.equal((await a.request('/api/cikis',{},headers)).status,200);assert.equal((await a.request('/api/oturum',undefined,headers)).status,401);
});
test('expired memberships cannot use product APIs, retained records return on renewal',async()=>{
 const a=await app(),headers=cookie(await a.request('/api/kayit',signup));
 await a.request('/api/urunler/kaydet',{urunler:[{id:'keep',alis:99}]},headers);
 const member=a.db.stores.users[0];member.trialBaslangic=new Date('2020-01-01');member.premium=false;
 assert.equal((await a.request('/api/urunler/yukle',undefined,headers)).status,403);
 assert.equal((await a.request('/api/urunler/kaydet',{urunler:[]},headers)).status,403);
 assert.equal(a.db.stores.urunler[0].urunler[0].alis,99);
 member.premium=true;member.uyelikBitis=new Date(Date.now()+86400000);
 assert.equal((await a.request('/api/urunler/yukle',undefined,headers)).status,200);
 member.uyelikBitis=new Date(0);assert.equal((await a.request('/api/urunler/yukle',undefined,headers)).status,403);
});
test('operator injection and cross-origin mutations are rejected',async()=>{
 const a=await app();
 for(const path of ['/api/giris','/api/kayit','/api/sifre-sifirla-mail','/api/sifre-sifirla-token']){
  assert.equal((await a.request(path,{email:{$ne:null},sifre:{$ne:null},token:{$ne:null}})).status,400,path);
 }
 assert.equal((await a.request('/api/kayit',signup,{host:'komisyonhesap.com',origin:'https://evil.example'})).status,403);
 assert.equal((await a.request('/api/giris','{bad json')).status,400);
 assert.equal((await a.request('/sifre-sifirla?token=%27%3Balert(1)%2F%2F')).body.includes("token:''"),true);
});
test('password changes revoke other sessions and admin never returns credentials',async()=>{
 const a=await app(),headers=cookie(await a.request('/api/kayit',signup));
 const second=cookie(await a.request('/api/giris',{email:signup.email,sifre:signup.sifre}));
 const change=await a.request('/api/sifre-degistir',{email:signup.email,eskiSifre:signup.sifre,yeniSifre:'new-password'},headers);assert.equal(change.status,200);
 assert.equal((await a.request('/api/oturum',undefined,second)).status,401);
 assert.equal((await a.request('/api/oturum',undefined,cookie(change))).status,200);
 const admin=cookie(await a.request('/api/admin/giris',{sifre:'test-admin'}));
 a.db.stores.users[0].resetToken='private-token';a.db.stores.users[0].resetTokenExpiry=new Date();
 const list=await a.request('/api/admin/users',undefined,admin);assert.equal(list.status,200);assert(!list.body.includes('scrypt$'));assert(!list.body.includes('private-token'));
});
test('payment provider token is bound to the initiating account and cannot be replayed',async()=>{
 const a=await app(),headers=cookie(await a.request('/api/kayit',signup));
 assert.equal((await a.request('/api/odeme-token',{email:signup.email})).status,401);
 assert.equal((await a.request('/api/odeme-token',{email:signup.email},headers)).status,200);
 assert.equal((await a.request('/api/odeme-callback?email=other@example.test','token=unknown')).status,400);
 const success=await a.request('/api/odeme-callback?email=other@example.test','token=provider-test-token');assert.equal(success.status,303);
 assert.equal(a.db.stores.users[0].premium,true);assert.equal(a.db.stores.users.length,1);
 const expiry=a.db.stores.users[0].uyelikBitis.getTime();
 assert.equal((await a.request('/api/odeme-callback','token=provider-test-token')).status,303);assert.equal(a.db.stores.users[0].uyelikBitis.getTime(),expiry);
});
test('unsuccessful, wrong amount and wrong conversation payments do not activate membership',async()=>{
 for(const payment of [{fraudStatus:0},{fraudStatus:-1},{paymentStatus:'FAILURE'},{price:'1.00'},{currency:'USD'},{conversationId:'different'}]){
  const a=await app(),headers=cookie(await a.request('/api/kayit',signup));await a.request('/api/odeme-token',{email:signup.email},headers);
  a.setPayment({status:'success',paymentStatus:'SUCCESS',paymentId:'p-1',currency:'TRY',price:'1500.00',paidPrice:'1500.00',fraudStatus:1,conversationId:a.db.stores.paymentSessions[0].conversationId,...payment});
  await a.request('/api/odeme-callback','token=provider-test-token');assert.equal(a.db.stores.users[0].premium,false);
 }
});
test('security headers, frontend scripts and server-verified session recovery preserve the page',async()=>{
 const a=await app();for(const path of ['/','/admin','/api/oturum']){
  const r=await a.request(path);assert.equal(r.headers['X-Frame-Options'],'DENY');assert.match(r.headers['Content-Security-Policy'],/frame-ancestors 'none'/);assert.equal(r.headers['X-Content-Type-Options'],'nosniff');assert(!('Access-Control-Allow-Origin' in r.headers));
 }
 const html=fs.readFileSync('karpanel.html','utf8');for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){if(!m[0].includes('application/ld+json'))new vm.Script(m[1]);}
 assert(!html.includes('PREMIUM_EMAILS'));assert(!html.includes('xlsx/0.18.5'));assert(html.includes("fetch(PROXY+'/api/oturum'"));assert(!html.includes('u.premium = true;'));
});
test('all original CSS and calculation functions retain pre-change SHA-256 values',()=>{
 const hashes={"calcKar": "de499d61070a425a20b62abcd0d95b9d223a73b55023b9218c9550981b5caa7b", "eaHesapla": "b62500d32b3f55a5cbc40ec43aca6670377f8426cf29842f5f482c73d2594933", "hesapla": "a14737356a9f77960fccbf00755010f68785d328026c26c0cbaf8f7009e5e1eb", "modalHesapla": "2d0a7c9d1ec75357b4da3448060187cf21e71ce9174af275468fa693169a35f3", "css": "26e4a7e4be292218b640e86b400ae659a0c09efb759c604b26300153e5f04062"};
 const sha=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
 const html=fs.readFileSync('karpanel.html','utf8');
 assert.equal(sha([...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('')),hashes.css);
 for(const name of ['calcKar','eaHesapla','hesapla','modalHesapla']){
  const re=new RegExp('function '+name+'\\([^)]*\\)\\{[\\s\\S]*?\\n\\}');
  assert(html.match(re));assert.equal(sha(html.match(re)[0]),hashes[name],name);
 }
});

test('login throttling returns 429 and does not reveal account presence',async()=>{
 const a=await app();
 for(let i=0;i<30;i++)assert.equal((await a.request('/api/giris',{email:'missing@example.test',sifre:'incorrect'})).status,401);
 const blocked=await a.request('/api/giris',{email:'missing@example.test',sifre:'incorrect'});assert.equal(blocked.status,429);assert(Number(blocked.headers['Retry-After'])>0);
});
test('frontend ignores forged cached membership and restores only the server identity',async()=>{
 const html=fs.readFileSync('karpanel.html','utf8'),code=html.slice(html.indexOf('async function loadUser(){'),html.indexOf('function applyUser(){'));
 function storage(initial={}){const data={...initial};return {getItem:k=>data[k]??null,setItem(k,v){data[k]=v;},removeItem(k){delete data[k];}};}
 const local=storage({kp_user:JSON.stringify({email:'forged@example.test',premium:true}),kp_urunler_saved:'keep'}),session=storage();let applied=0,guests=0;
 const ctx={userSessionVersion:0,PROXY:'',currentUser:null,localStorage:local,sessionStorage:session,showGuestUI(){guests++;},applyUser(){applied++;},applyUserTrialBitti(){},setTimeout(){},fetch:async()=>({ok:false,status:401})};
 vm.createContext(ctx);vm.runInContext(code,ctx);await ctx.loadUser();assert.equal(ctx.currentUser,null);assert.equal(applied,0);assert.equal(guests,1);assert.equal(local.getItem('kp_user'),null);assert.equal(local.getItem('kp_urunler_saved'),'keep');
 ctx.fetch=async()=>({ok:true,json:async()=>({ok:true,user:{ad:'Real member',email:'real@example.test',premium:true}})});await ctx.loadUser();assert.equal(ctx.currentUser.email,'real@example.test');assert.equal(applied,1);
 let finish;ctx.fetch=()=>new Promise(r=>finish=r);const pending=ctx.loadUser();ctx.userSessionVersion++;ctx.currentUser=null;finish({ok:true,json:async()=>({ok:true,user:{email:'stale@example.test',premium:true}})});await pending;assert.equal(ctx.currentUser,null);
});

test('background migration hashes dormant accounts and preserves concurrent password updates',async()=>{
 const {memory}=require('./security-test-helper.cjs');const db=memory();
 await db.collection('users').insertOne({email:'dormant@example.test',sifre:'dormant-password'});
 await security.migratePasswords(db);assert.match(db.stores.users[0].sifre,/^scrypt\$/);assert(await security.verifyPassword('dormant-password',db.stores.users[0].sifre));
 const hash=db.stores.users[0].sifre;await security.migratePasswords(db);assert.equal(db.stores.users[0].sifre,hash);
 const replacement=await security.hashPassword('replacement');
 await db.collection('users').insertOne({email:'concurrent@example.test',sifre:'old'});
 const migration=security.migratePasswords(db);await new Promise(setImmediate);
 await db.collection('users').updateOne({email:'concurrent@example.test'},{$set:{sifre:replacement}});await migration;
 assert.equal(db.stores.users[1].sifre,replacement);
});

test('checkout embeds authenticated identity as safe JSON rather than executable query text',async()=>{
 const a=await app(),email='test'+String.fromCharCode(39,34)+'</script>@example.test';
 const signupResponse=await a.request('/api/kayit',{ad:'Checkout',email,sifre:'checkout-password'});assert.equal(signupResponse.status,200);
 const response=await a.request('/odeme',undefined,cookie(signupResponse));assert.equal(response.status,200);
 const line=response.body.split('\n').find(s=>s.startsWith('const email = '));assert(line);assert(!line.includes('</script>'));
 const context={};vm.createContext(context);vm.runInContext(line+';globalThis.value=email;',context);assert.equal(context.value,email);
});
