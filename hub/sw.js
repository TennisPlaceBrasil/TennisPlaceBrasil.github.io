'use strict';
const CACHE='tp-inventory-shell-admin-reopen-count1';
const ROOT=new URL('./',self.location).pathname;
const FILES=['','index.html','app.js','style.css','logo.png','apps/contagem-estoque/','apps/contagem-estoque/index.html','apps/contagem-estoque/app.js','apps/contagem-estoque/style.css','apps/contagem-estoque/offline-store.js','apps/contagem-estoque/offline-export.js','apps/contagem-estoque/pwa.js','apps/contagem-estoque/mobile.css','apps/contagem-estoque/dashboard.js','apps/contagem-estoque/dashboard.css','apps/contagem-estoque/manifest.webmanifest','apps/contagem-estoque/icons/icon-192.png','apps/contagem-estoque/icons/icon-512.png','apps/contagem-estoque/icons/apple-touch-icon.png','shared/zxing-browser.min.js'];
const paths=new Set(FILES.map(path=>ROOT+path));
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES.map(path=>new Request(ROOT+path,{cache:'reload'})));await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith('tp-inventory-shell-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 // Never cache API responses, tokens, other tools, or third-party requests.
 if(request.method!=='GET'||url.origin!==self.location.origin||!paths.has(url.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),canonical=new Request(url.origin+url.pathname),cached=await cache.match(canonical);
  const update=async()=>{const response=await fetch(request,{cache:'no-cache'});if(response.ok)await cache.put(canonical,response.clone());return response;};
  try{return await Promise.race([update(),new Promise((_,reject)=>setTimeout(()=>reject(Error('offline')),2500))]);}catch(e){if(cached)return cached;throw e;}
 })());
});

