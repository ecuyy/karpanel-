const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/karpanel.html','utf8');
const code=html.slice(html.indexOf('let kayitIslemSuruyor=false;'),html.indexOf('function trialHosgeldinKapat'));
function setup(fetch){
 const button={innerHTML:'Üye Ol',textContent:'',disabled:false};
 const form={attrs:{},querySelector:()=>button,setAttribute(k,v){this.attrs[k]=v;}};
 const elements={'auth-form-kayit':form,'kayit-ad':{value:'Test User'},'kayit-email':{value:'test@example.invalid'},'kayit-sifre':{value:'test-password'}};
 const events=[],errors=[],stored=[];let signups=0;
 const context={document:{getElementById:id=>elements[id]||{textContent:'',classList:{add(){}}}},PREMIUM_EMAILS:[],PROXY:'',fetchWithRetry:fetch,trackTrialStep:(...args)=>events.push(args),showAuthError:x=>errors.push(x),localStorage:{setItem:(...args)=>stored.push(args)},trackSignup(){signups++;},closeAuth(){},applyUser(){},setTimeout(){},toast(){},goApp(){}};
 vm.createContext(context);vm.runInContext(code,context);
 return {context,button,form,elements,events,errors,stored,get signups(){return signups;}};
}
test('pending registration submits once, shows progress and restores controls after success',async()=>{
 let finish,calls=0;const a=setup(()=>{calls++;return new Promise(resolve=>finish=resolve);});
 const first=a.context.kayitOl();await a.context.kayitOl();assert.equal(calls,1);assert.equal(a.button.disabled,true);assert.equal(a.form.attrs['aria-busy'],'true');
 finish({ok:true,json:async()=>({user:{trialAktif:true,trialKalanGun:3}})});await first;
 assert.equal(a.signups,1);assert.equal(a.context.currentUser.premium,true);assert.equal(a.context.currentUser.trialKalanGun,3);assert.equal(a.button.disabled,false);assert.equal(a.button.innerHTML,'Üye Ol');assert.equal(a.form.attrs['aria-busy'],'false');
});
test('server and network errors allow retry without reporting a completed signup',async()=>{
 for(const kind of ['server','network']){
  const a=setup(async()=>{if(kind==='network')throw Error('network');return {ok:false,json:async()=>({error:'Kayıt başarısız'})};});
  await a.context.kayitOl();await a.context.kayitOl();assert.equal(a.signups,0);assert.equal(a.stored.length,0);assert.equal(a.button.disabled,false);assert.deepEqual(a.events.at(-1),['error',kind==='server'?'server_rejected':'network']);
 }
});
test('validation sends no request and event parameters never contain entered details',async()=>{
 const a=setup(()=>{throw Error('must not request');});a.elements['kayit-ad'].value='';await a.context.kayitOl();assert.deepEqual(a.events,[['error','missing_fields']]);
 const track=html.slice(html.indexOf('function trackTrialStep('),html.indexOf('function trackPurchaseConversion('));
 const sent=[],ctx={gtag:(...args)=>sent.push(args)};vm.createContext(ctx);vm.runInContext(track,ctx);
 ctx.trackTrialStep('error','test@example.invalid');ctx.trackTrialStep('error','server_rejected');ctx.trackTrialStep('unknown','network');
 assert.equal(sent.length,2);assert(!JSON.stringify(sent).includes('test@example.invalid'));assert.equal(sent[1][2].reason,'server_rejected');
});
