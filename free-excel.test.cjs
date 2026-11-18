const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {app}=require('./test-server.cjs');
test('Excel download is public, has correct headers, and HEAD has no workbook body',async()=>{
 const a=await app();
 const path='/downloads/trendyol-kar-hesaplama-ornek.xlsx';
 const get=await a.request(path);
 assert.equal(get.status,200);assert.equal(get.body.subarray(0,2).toString(),'PK');
 assert.equal(get.headers['Content-Type'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 assert(get.headers['Content-Disposition'].startsWith('attachment;'));
 assert.equal(Number(get.headers['Content-Length']),get.body.length);
 assert.deepEqual(get.body,fs.readFileSync(__dirname+path));
 const head=await a.request(path,undefined,{},'HEAD');assert.equal(head.status,200);assert.equal(head.body,undefined);
 const script=await a.request('/seller-sharing.js');assert.equal(script.status,200);assert(script.body.includes('navigator.clipboard.writeText'));
});
