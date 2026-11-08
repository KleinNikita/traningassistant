const prefix = 'vshape-' + new URL(self.registration.scope).pathname + '-';
const name = prefix + '4';
const assets = ['./','./index.html','./style.css','./app.js','./plans.js','./manifest.webmanifest','./plan.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(name).then(cache => cache.addAll(assets.map(path => new Request(path, {cache: "reload"})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k.startsWith(prefix) && k!==name).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method!=='GET' || !url.href.startsWith(self.registration.scope))return;
  event.respondWith((async()=>{
    const cache=await caches.open(name);
    if(url.pathname.endsWith('/plan.json')){
      try{
        const fresh=await fetch(event.request);
        if(fresh.ok){await cache.put(event.request,fresh.clone());return fresh;}
      }catch{}
    }
    const hit=await cache.match(event.request);
    if(hit)return hit;
    if(event.request.mode==='navigate')return await cache.match('./index.html') || fetch(event.request);
    return fetch(event.request);
  })());
});


