const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{Readable}=require('node:stream');

function memory(){
 const stores={};const match=(r,q)=>Object.entries(q).every(([k,v])=>k==='$or'?v.some(x=>match(r,x)):v&&typeof v==='object'&&!(v instanceof Date)?Object.entries(v).every(([op,n])=>op==='$gt'?r[k]>n:op==='$lt'?r[k]<n:op==='$lte'?r[k]<=n:false):r[k]===v);
 return {stores,collection(name){const rows=stores[name]||(stores[name]=[]);const apply=(r,u,fresh)=>{if(fresh)Object.assign(r,u.$setOnInsert);Object.assign(r,u.$set||{});for(const [k,n]of Object.entries(u.$inc||{}))r[k]=(r[k]||0)+n;};return {
  async createIndex(){},
  async deleteOne(q){const i=rows.findIndex(r=>match(r,q));if(i>=0)rows.splice(i,1);return{};},
  async insertOne(r){const d={_id:'user-'+rows.length,...r};rows.push(d);return {insertedId:d._id};},
  async findOne(q){return rows.find(r=>match(r,q))||null;},
  async updateOne(q,u,opt={}){let r=rows.find(x=>match(x,q));const fresh=!r;if(!r){if(!opt.upsert)return {};r={...q};rows.push(r);}apply(r,u,fresh);return{};},
  async findOneAndUpdate(q,u){const r=rows.find(x=>match(x,q));if(!r)return null;apply(r,u,false);return {...r};},
  find(){const c={sort(){return c;},async toArray(){return rows;}};return c;}
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
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=body;this.done?.();}};}
async function app(sharedDb){
 const db=sharedDb||memory(),notices=[];let handler;let payment={status:'success',paymentStatus:'SUCCESS',paymentId:'p-1'};
 const context={console:{log(){},error(){}},Buffer,URL,URLSearchParams,fetch:()=>{throw Error('No external mail in tests');},process:{env:{MONGO_URI:'test',ADMIN_SIFRE:'test-admin',IYZICO_API_KEY:'test',IYZICO_SECRET:'test'}},setTimeout,clearTimeout,setInterval:()=>({unref(){}}),require(name){
  if(name==='http')return {createServer(h){handler=h;return {listen(){}};}};
  if(name==='mongodb')return {MongoClient:{connect:async()=>({db:()=>db})}};
  if(name==='iyzipay')return function(){this.checkoutForm={retrieve(_p,cb){cb(null,payment);}};};
  if(name==='./member-notifications')return {createMemberNotifications:()=>({flush:async()=>{},enqueue:async(...args)=>notices.push(args)})};
  return require(name.startsWith('./')?path.join(__dirname,name):name);
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),context);await new Promise(setImmediate);
 return {db,notices,setPayment(p){payment=p;},async request(url,body,headers={}){const req=Readable.from(body===undefined?[]:[typeof body==='string'?body:JSON.stringify(body)]);Object.assign(req,{url,method:body===undefined?'GET':'POST',headers,socket:{remoteAddress:'test'}});const r=res(),ended=new Promise(resolve=>r.done=resolve);await handler(req,r);await ended;await new Promise(setImmediate);return r;}};
}
