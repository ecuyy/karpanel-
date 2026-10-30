const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/karpanel.html','utf8');
test('price styling and update branch stay inside HTML style and script blocks',()=>{
 assert.match(html,/<\/html>\s*$/);
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 assert(css.includes('.ea-fiyat-edit .ea-edit-input{display:block;width:100%;min-height:58px;'));
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
 assert(scripts.includes('else if(fiyat){ u[alan]=sayi; }'));
});
function setup(){
 const nodes={},storage=new Map(),notices=[];
 const element=id=>nodes[id]||(nodes[id]={style:{},innerHTML:'',textContent:'',classList:{add(){},remove(){}},querySelector(selector){return element(id+selector);}});
 const code=html.slice(html.indexOf('let eaTumVeri = []'),html.indexOf('function uyeOlVeyaOde()'));
 const context={document:{getElementById:element,querySelectorAll:()=>[]},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)},currentUser:{email:'test@example.invalid',premium:true},urunler:[],toast:(...args)=>notices.push(args)};
 vm.createContext(context);vm.runInContext(code,context);
 context.setData=data=>{context.testData=data;vm.runInContext('eaTumVeri=testData',context);};
 context.data=()=>vm.runInContext('eaTumVeri',context);
 context.input=value=>({value,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}});
 return {context,nodes,element,storage,notices};
}
const product=(extra={})=>({modelKodu:'ECY-1',urunIsmi:'Test ürünü',mevcut:600,f1Alt:550,f2Alt:500,f3Ust:450,alis:200,kargo:40,komOran:20,...extra});
test('existing formula is unchanged; all page scripts compile',()=>{
 const formula=html.slice(html.indexOf('function eaHesapla('),html.indexOf('// Etiket düzenlemeleri'));
 assert.equal(require('node:crypto').createHash('sha256').update(formula.trim()).digest('hex'),'b62500d32b3f55a5cbc40ec43aca6670377f8426cf29842f5f482c73d2594933');
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!m[1].includes('application/ld+json'))new vm.Script(m[2]);
});
test('cost and separate commissions update the correct profits without changing the main products',()=>{
 const {context:c,element,storage}=setup();const u=product();c.setData([u]);c.urunler=[{id:'ECY-1',alis:200,kargo:40,commissionRate:20}];
 c.eaTazele();const base=[u.net1,u.net2,u.net3];
 c.eaDegerGir(0,'kom2',c.input('10,5'),false);
 assert.equal(u.kom2,10.5);assert.equal(u.net1,base[0]);assert.equal(u.net3,base[2]);assert.equal(u.net2,c.eaHesapla(500,200,40,10.5));
 c.eaDegerGir(0,'kom1',c.input('0'),true);assert.equal(u.kom1,0);assert.equal(u.net1,c.eaHesapla(550,200,40,0));
 c.eaDegerGir(0,'kom3',c.input('100'),true);assert.equal(u.net3,c.eaHesapla(450,200,40,100));
 c.eaDegerGir(0,'alis',c.input('150,25'),false);assert.equal(u.alis,150.25);assert.equal(u.net2,c.eaHesapla(500,150.25,40,10.5));
 assert(element('ea-kutu-0-2.ea-net').innerHTML.includes('ea-kar-badge'));
 assert.equal(c.urunler[0].alis,200);assert.equal(c.urunler[0].commissionRate,20);
 assert.equal(JSON.parse(storage.get('kp_etiket_test@example.invalid')).veri[0].kom2,10.5);
});
test('manual inputs survive refresh, navigation and shipping recalculation; legacy defaults still sync',()=>{
 const {context:c,storage,element}=setup();const manual=product({_alisManuel:true,alis:150,kom1:0,kom2:12,kom3:8}),legacy=product({modelKodu:'ECY-2'});c.setData([manual,legacy]);
 c.urunler=[{id:'ECY-1',alis:300,kargo:60,commissionRate:25},{id:'ECY-2',alis:350,kargo:50,commissionRate:18}];
 c.eaTazele();assert.equal(manual.alis,150);assert.equal(manual.kom2,12);assert.equal(legacy.alis,350);assert.equal(c.eaKomisyon(legacy,1),18);
 c.eaVeriyiKaydet();c.setData([]);c.eaKayitliVeriyiYukle();const restored=c.data()[0];assert.equal(restored._alisManuel,true);assert.equal(restored.kom1,0);
 element('ea-kb-manuel').value='75';c.eaKbUygula();assert.equal(restored.kargo,75);assert.equal(restored.net2,c.eaHesapla(500,150,75,12));
 c.etiketSayfasiAc();assert.equal(c.data()[0].alis,150);assert.equal(c.data()[0].kargo,75);assert.equal(c.data()[0].kom3,8);
});
test('Turkish decimals, invalid ranges, empty costs and commission reset are handled',()=>{
 const {context:c,notices}=setup();const u=product({kom1:10});c.setData([u]);
 assert.equal(c.eaGirdiSayisi('1.234,56'),1234.56);
 for(const value of ['-1','101','Infinity','abc','1,2,3']){const input=c.input(value);c.eaDegerGir(0,'kom1',input,true);assert.equal(u.kom1,10);assert.equal(input.value,10);}
 const bad=c.input('-20');c.eaDegerGir(0,'alis',bad,true);assert.equal(u.alis,200);
 c.eaDegerGir(0,'kom1',c.input(''),true);assert.equal(u.kom1,undefined);assert.equal(c.eaKomisyon(u,1),20);
 c.eaDegerGir(0,'alis',c.input(''),true);assert.equal(u.alis,0);assert.equal(u.net1,null);assert.equal(u.net2,null);assert.equal(u.net3,null);
 assert(notices.length>=6);
});
test('filtered rows edit the original index and render accessible, escaped inputs',()=>{
 const {context:c,element}=setup();c.setData([product(),product({modelKodu:'ECY-2',urunIsmi:'<img onerror=bad>'})]);c.eaAra('ECY-2');
 const markup=element('ea-tbody').innerHTML;assert(markup.includes('ea-alis-1'));assert(markup.includes("eaDegerGir(1,'kom2'"));assert(!markup.includes('ea-alis-0'));
 assert(markup.includes('&lt;img onerror=bad&gt;'));assert(!markup.includes('<img onerror=bad>'));assert(!markup.includes('Maliyet sistemden geldi'));assert.equal((markup.match(/inputmode="decimal"/g)||[]).length,7);
 for(const [seviye,alan] of [[1,'f1Alt'],[2,'f2Alt'],[3,'f3Ust']]){
  assert(markup.includes(`id="ea-fiyat${seviye}-1"`));assert(markup.includes(`eaDegerGir(1,'${alan}'`));
 }
 c.eaDegerGir(1,'alis',c.input('125'),true);assert.equal(c.data()[0].alis,200);assert.equal(c.data()[1].alis,125);
});

test('each label price independently recalculates with its edited commission and survives reload',()=>{
 const {context:c,storage,element}=setup();const u=product({kom1:11,kom2:12,kom3:13});c.setData([u]);
 c.urunler=[{id:'ECY-1',alis:200,kargo:40,commissionRate:20,price:600}];c.eaTazele();
 for(const [seviye,alan,val] of [[1,'f1Alt','1.234,56'],[2,'f2Alt','399,90'],[3,'f3Ust','0,01']]){
  const before=[u.net1,u.net2,u.net3];const price=c.eaGirdiSayisi(val);c.eaDegerGir(0,alan,c.input(val),true);
  assert.equal(u[alan],price);assert.equal(u['net'+seviye],c.eaHesapla(price,200,40,u['kom'+seviye]));
  for(const other of [1,2,3].filter(n=>n!==seviye))assert.equal(u['net'+other],before[other-1]);
 }
 assert.equal(u.mevcut,600);assert.equal(c.urunler[0].price,600);
 const saved=JSON.parse(storage.get('kp_etiket_test@example.invalid')).veri[0];assert.equal(saved.f1Alt,1234.56);
 c.setData([]);c.eaKayitliVeriyiYukle();c.eaTazele();const restored=c.data()[0];
 assert.equal(restored.f1Alt,1234.56);assert.equal(restored.f2Alt,399.9);assert.equal(restored.f3Ust,0.01);
 element('ea-kb-manuel').value='75';c.eaKbUygula();
 assert.equal(restored.net2,c.eaHesapla(399.9,200,75,12));
});
test('invalid label prices keep the last valid value and do not save invalid edits',()=>{
 const {context:c,storage}=setup();const u=product();c.setData([u]);c.eaSonuclariHesapla(u);c.eaVeriyiKaydet();
 const before=storage.get('kp_etiket_test@example.invalid');const net=u.net1;
 for(const value of ['','0','-1','abc','Infinity','1,2,3']){
  const input=c.input(value);c.eaDegerGir(0,'f1Alt',input,false);
  assert.equal(input.attrs['aria-invalid'],'true');assert.equal(u.f1Alt,550);assert.equal(u.net1,net);
  c.eaDegerGir(0,'f1Alt',input,true);assert.equal(input.value,550);assert.equal(input.attrs['aria-invalid'],undefined);
  assert.equal(storage.get('kp_etiket_test@example.invalid'),before);
 }
 const input=c.input('500,');c.eaDegerGir(0,'f1Alt',input,false);assert.equal(u.f1Alt,500);
 c.eaDegerGir(0,'mevcut',c.input('100'),true);assert.equal(u.mevcut,600);
});

