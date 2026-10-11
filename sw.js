/* v20261012. Network-first for CSV + JS to prevent stale market settlements;
   offline fallback is explicitly labelled when navigator is offline. */
const VERSION="wti-terminal-20261012-v1";
const ROOT=new URL("./",self.registration.scope);
const ASSETS=["./","./index.html","./styles.css","./mobile.css","./app.js","./data/wti-settlement.csv","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(VERSION);
    await cache.addAll(ASSETS.map(x=>new Request(new URL(x,ROOT).href,{cache:"reload"})));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(x=>x.startsWith("wti-terminal-")&&x!==VERSION).map(x=>caches.delete(x)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET"||new URL(request.url).origin!==ROOT.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(VERSION);
    try{
      // Explicit no-store to check the latest confirmed settlement instead of reusing cached CSV.
      const response=await fetch(request,{cache:"no-store"});
      if(response.ok)await cache.put(request,response.clone());
      return response;
    }catch(err){
      const cached=await cache.match(request,{ignoreSearch:true});
      if(cached)return cached;
      if(request.mode==="navigate"){
        const app=await cache.match(new URL("./index.html",ROOT).href);
        if(app)return app;
      }
      return new Response("Offline: resource not cached",{status:503,statusText:"Offline"});
    }
  })());
});
