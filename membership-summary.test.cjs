const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/karpanel.html','utf8');
const nodes={};
const context={document:{getElementById:id=>nodes[id]||(nodes[id]={style:{},textContent:'',value:''})}};
vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('function premiumBitis('),html.indexOf('function premiumAktif('))+html.slice(html.indexOf('function kdUyelikOzeti('),html.indexOf('function kdGo(')),context);
const now=Date.parse('2026-10-30T10:00:00Z');
test('sidebar uses the actual expiry, including partial days and annual payment fallback',()=>{
 assert.equal(context.kdUyelikOzeti({premium:true,uyelikBitis:'2026-11-02T10:00:00Z'},now),'Üyeliğiniz aktif · 3 gün kaldı');
 assert.equal(context.kdUyelikOzeti({premium:true,uyelikBitis:'2026-10-30T10:01:00Z'},now),'Üyeliğiniz aktif · 1 gün kaldı');
 assert.equal(context.kdUyelikOzeti({premium:true,odemeTarihi:'2025-11-02T10:00:00Z'},now),'Üyeliğiniz aktif · 3 gün kaldı');
 assert.equal(context.kdUyelikOzeti({premium:true,uyelikBitis:'2026-11-02T10:00:00Z',odemeTarihi:'2020-01-01'},now),'Üyeliğiniz aktif · 3 gün kaldı');
});
test('trial, expired and missing dates never invent a renewal period',()=>{
 assert.equal(context.kdUyelikOzeti({premium:true,trialAktif:true,trialBitis:'2026-11-01T10:00:00Z'},now),'Deneme süreniz · 2 gün kaldı');
 assert.equal(context.kdUyelikOzeti({premium:true,trialAktif:true,trialKalanGun:2},now),'Deneme süreniz · 2 gün kaldı');
 assert.equal(context.kdUyelikOzeti({premium:true,uyelikBitis:'2026-10-29'},now),'Üyelik bitiş tarihi geçti');
 for(const uyelikBitis of [null,'invalid']) assert.equal(context.kdUyelikOzeti({premium:true,uyelikBitis},now),'Üyeliğiniz aktif · Bitiş tarihi belirtilmemiş');
 assert.equal(context.kdUyelikOzeti({premium:false},now),'Premium değil');
});
test('sidebar summary does not depend on opening the membership page or alter the account',()=>{
 const account={ad:'Test',email:'test@example.invalid',premium:true,uyelikBitis:new Date(Date.now()+10*86400000).toISOString()};
 const original=JSON.stringify(account);context.currentUser=account;
 nodes['hm-kalan']={textContent:'Yanlış eski değer'};context.kdSyncUser();
 assert.equal(nodes['kd-hero-note'].textContent,'Üyeliğiniz aktif · 10 gün kaldı');
 assert.equal(JSON.stringify(account),original);
});
