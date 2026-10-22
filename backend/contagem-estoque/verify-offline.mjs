import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const exporter=vm.createContext({window:{},TextEncoder,Blob,DataView,Uint8Array,URL,setTimeout});
vm.runInContext(fs.readFileSync(new URL('hub/apps/contagem-estoque/offline-export.js',root),'utf8'),exporter);
const counts=Array.from({length:5000},(_,i)=>({ean:String(i+1).padStart(13,'0'),quantity:i+1}));
const file=exporter.window.TPInventoryExport.workbook({counts,defects:[{ean:'0000000000001',quantity:7}]});
fs.writeFileSync(new URL('offline-5000.xlsx',import.meta.url),Buffer.from(await file.arrayBuffer()));
const listeners={},cache={match:async()=>new Response('CACHED INVENTORY'),put:async()=>{}};
const worker=vm.createContext({self:{location:new URL('https://example.test/hub/sw.js'),addEventListener:(name,fn)=>listeners[name]=fn},URL,Request,Response,caches:{open:async()=>cache},fetch:async()=>{throw Error('network offline');},setTimeout});
vm.runInContext(fs.readFileSync(new URL('hub/sw.js',root),'utf8'),worker);
let reply;
listeners.fetch({request:{url:'https://example.test/hub/apps/contagem-estoque/index.html',method:'GET',mode:'navigate'},respondWith:p=>reply=p,waitUntil(){}});
assert.equal(await (await reply).text(),'CACHED INVENTORY');
reply=null;listeners.fetch({request:{url:'https://example.test/hub/',method:'GET',mode:'navigate'},respondWith:p=>reply=p,waitUntil(){}});assert.equal(await(await reply).text(),'CACHED INVENTORY');
for(const url of ['https://api.example.test/functions/v1/stockcount-api','https://example.test/hub/apps/precificador/index.html']){reply=null;listeners.fetch({request:{url,method:'GET'},respondWith:p=>reply=p});assert.equal(reply,null,'Never intercept API data or other tools');}
console.log('PASS: offline navigation fallback, hub fallback, API isolation, XLSX generated with 5,000 products');
