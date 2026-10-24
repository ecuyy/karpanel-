const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{Readable}=require('node:stream');
function memory(){
 const stores={};const match=(r,q)=>Object.entries(q).every(([k,v])=>k==='$or'?v.some(x=>match(r,x)):k==='_id'?String(r[k])===String(v):v&&typeof v==='object'&&!(v instanceof Date)?Object.entries(v).every(([op,n])=>op==='$type'?typeof r[k]===n:op==='$ne'?r[k]!==n:op==='$gt'?r[k]>n:op==='$lt'?r[k]<n:op==='$lte'?r[k]<=n:false):r[k]===v);
 return {stores,collection(name){const rows=stores[name]||(stores[name]=[]);const apply=(r,u,fresh)=>{if(fresh)Object.assign(r,u.$setOnInsert);Object.assign(r,u.$set||{});for(const [k,n]of Object.entries(u.$inc||{}))r[k]=(r[k]||0)+n;};return {
  async createIndex(){},
  async deleteOne(q){const i=rows.findIndex(r=>match(r,q));if(i>=0)rows.splice(i,1);return{};},
  async insertOne(r){const d={_id:'user-'+rows.length,...r};rows.push(d);return {insertedId:d._id};},
  async findOne(q){return rows.find(r=>match(r,q))||null;},
  async updateOne(q,u,opt={}){let r=rows.find(x=>match(x,q));const fresh=!r;if(!r){if(!opt.upsert)return {};r={_id:(rows.length+1).toString(16).padStart(24,'0'),...q};rows.push(r);}apply(r,u,fresh);return{};},
  async findOneAndUpdate(q,u){const r=rows.find(x=>match(x,q));if(!r)return null;apply(r,u,false);return {...r};},
  find(q={}){const c={async *[Symbol.asyncIterator](){for(const r of rows.filter(r=>match(r,q)))yield {...r};},sort(){return c;},project(){return c;},limit(){return c;},async toArray(){return rows.filter(r=>match(r,q));}};return c;}
 };}};
}
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=body;this.done?.();}};}
async function app(sharedDb){
 const db=sharedDb||memory(),notices=[];let handler;let payment={status:'success',paymentStatus:'SUCCESS',paymentId:'p-1',fraudStatus:1};
 const context={__dirname,console:{log(){},error(){}},Buffer,URL,URLSearchParams,fetch:()=>{throw Error('No external mail in tests');},process:{env:{MONGO_URI:'test',ADMIN_SIFRE:'test-admin',IYZICO_API_KEY:'test',IYZICO_SECRET:'test'}},setTimeout,clearTimeout,setInterval:()=>({unref(){}}),require(name){
  if(name==='http')return {createServer(h){handler=h;return {listen(){}};}};
  if(name==='mongodb')return {ObjectId:class {constructor(v){this.v=v;}toString(){return this.v;}static isValid(v){return /^[a-f0-9]{24}$/.test(v);}},MongoClient:{connect:async()=>({db:()=>db})}};
  if(name==='iyzipay')return function(){this.checkoutFormInitialize={create(p,cb){payment={...payment,conversationId:p.conversationId,currency:'TRY',price:'1500.00',paidPrice:'1500.00'};cb(null,{status:'success',token:'provider-test-token',paymentPageUrl:'https://payment.example.test'});}};this.checkoutForm={retrieve(_p,cb){cb(null,payment);}};};
  if(name==='./member-notifications')return {createMemberNotifications:()=>({flush:async()=>{},enqueue:async(...args)=>notices.push(args)})};
  return require(name.startsWith('./')?path.join(__dirname,name):name);
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),context);await new Promise(setImmediate);
 return {db,notices,setPayment(p){payment=p;},async request(url,body,headers={}){const req=Readable.from(body===undefined?[]:[typeof body==='string'?body:JSON.stringify(body)]);Object.assign(req,{url,method:body===undefined?'GET':'POST',headers,socket:{remoteAddress:'test'}});const r=res(),ended=new Promise(resolve=>r.done=resolve);await handler(req,r);await ended;await new Promise(setImmediate);return r;}};
}

module.exports={app,memory};
